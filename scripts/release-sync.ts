import { readdir } from "node:fs/promises";
import path from "node:path";
import { atomicJson, readJson, rootDir, validateObject, validateRelease } from "./lib";
import type { ProductData, ReleaseData, ReleaseIndex, SiteData } from "../src/lib/types";
type GitHubAsset = { name: string; browser_download_url: string; size: number; content_type?: string };
type GitHubRelease = { tag_name: string; draft: boolean; prerelease: boolean; published_at: string | null; assets: GitHubAsset[] };
type Fetcher = typeof fetch;
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
export async function syncPublishedReleases(options: { owner: string; fetchImpl?: Fetcher; projectRoot?: string }): Promise<ReleaseIndex> {
  const owner = options.owner;
  if (!/^[A-Za-z0-9-]+$/.test(owner)) throw new Error("Invalid GitHub owner slug");
  const projectRoot = options.projectRoot ?? rootDir;
  const dataDir = path.join(projectRoot, "data");
  const releaseDir = path.join(dataDir, "releases");
  const fetchImpl = options.fetchImpl ?? fetch;
  const site = await readJson<SiteData>(path.join(dataDir, "site.json"));
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": site.releaseSync.apiVersion, "User-Agent": "floradoc-downloads-release-sync" };
  const apiBase = "https://api.github.com/repos/" + owner + "/" + site.github.releaseRepository + "/releases";
  const remote: GitHubRelease[] = [];
  for (let page = 1; page <= 20; page++) {
    const response = await fetchImpl(apiBase + "?per_page=100&page=" + page, { headers, signal: AbortSignal.timeout(site.releaseSync.timeoutMs) });
    if (!response.ok) throw new Error("GitHub release sync failed with HTTP " + response.status + " " + response.statusText + "; refusing to replace release history.");
    const batch = await response.json() as GitHubRelease[];
    if (!Array.isArray(batch)) throw new Error("GitHub releases API returned a non-array response.");
    remote.push(...batch.filter((release) => !release.draft && /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/.test(release.tag_name)));
    if (batch.length < 100) break;
    if (page === 20) throw new Error("GitHub releases API exceeded 2,000 entries; refusing partial release sync.");
  }
  const seenTags = new Set<string>();
  for (const release of remote) {
    if (seenTags.has(release.tag_name)) throw new Error("Duplicate published release tag/version: " + release.tag_name);
    seenTags.add(release.tag_name);
  }
  const versions = new Set<string>();
  const incoming = new Map<string, ReleaseData>();
  for (const release of remote) {
    const version = release.tag_name.slice(1);
    if (versions.has(version)) throw new Error("Duplicate published release tag/version: " + release.tag_name);
    versions.add(version);
    if (!release.published_at) throw new Error("Published release has no published_at date: " + release.tag_name);
    const metadata = release.assets.find((asset) => asset.name === "floradoc-release.json");
    if (!metadata) throw new Error("Published release is missing floradoc-release.json: " + release.tag_name);
    const metaResponse = await fetchImpl(metadata.browser_download_url, { headers: { "User-Agent": "floradoc-downloads-release-sync" }, signal: AbortSignal.timeout(site.releaseSync.timeoutMs) });
    if (!metaResponse.ok) throw new Error("Could not download release metadata for " + release.tag_name + " (HTTP " + metaResponse.status + ").");
    const data = await metaResponse.json() as ReleaseData;
    await validateRelease(data, version, projectRoot);
    if (data.channel !== (release.prerelease ? "preview" : "stable")) throw new Error("Release channel does not match GitHub prerelease flag: " + release.tag_name);
    const actualAssets = new Map(release.assets.map((asset) => [asset.name, asset]));
    const packageAssets = release.assets.filter((asset) => asset.name !== "floradoc-release.json" && asset.name !== "SHA256SUMS.txt");
    if (packageAssets.length !== data.assets.length) throw new Error("Release package asset count does not match manifest: " + release.tag_name);
    for (const asset of data.assets) {
      const published = actualAssets.get(asset.fileName);
      if (!published) throw new Error("Release metadata references missing GitHub asset " + asset.fileName + ": " + release.tag_name);
      if (published.size !== asset.fileSize) throw new Error("Release metadata size mismatch for " + asset.fileName + ": " + release.tag_name);
      if (published.browser_download_url !== asset.downloadUrl) throw new Error("Release metadata URL mismatch for " + asset.fileName + ": " + release.tag_name);
    }
    const checksumAsset = actualAssets.get("SHA256SUMS.txt");
    if (checksumAsset && data.checksumsUrl !== checksumAsset.browser_download_url) throw new Error("Checksum file URL mismatch: " + release.tag_name);
    if (data.checksumsUrl && !checksumAsset) throw new Error("Manifest references a missing SHA256SUMS.txt asset: " + release.tag_name);
    incoming.set(version, data);
  }
  const previousIndex = await readJson<ReleaseIndex>(path.join(releaseDir, "index.json"));
  const merged = new Set([...previousIndex.releases, ...incoming.keys()]);
  const sorted = [...merged].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const missing: ReleaseData[] = [];
  for (const [version, data] of incoming) {
    let old: ReleaseData;
    try {
      old = await readJson<ReleaseData>(path.join(releaseDir, version + ".json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") { missing.push(data); continue; }
      throw error;
    }
    if (stableJson(old) !== stableJson(data)) throw new Error("Published release metadata conflicts with existing website history; refusing to overwrite version " + version + ".");
  }
  for (const data of missing) await atomicJson(path.join(releaseDir, data.version + ".json"), data);
  const currentFiles = (await readdir(releaseDir)).filter((name) => /^\d+\.\d+\.\d+.*\.json$/.test(name));
  const indexed = new Set(sorted.map((version) => version + ".json"));
  for (const name of currentFiles) if (!indexed.has(name)) throw new Error("Unexpected release file present; sync preserves history: " + name);
  const index: ReleaseIndex = { schemaVersion: "1.0", status: sorted.length > 0 ? "available" : "comingSoon", releases: sorted };
  await validateObject("src/schemas/release-index.schema.json", index, "release index after sync", projectRoot);
  const product = await readJson<ProductData>(path.join(dataDir, "product.json"));
  product.product.releaseStatus = index.status;
  await atomicJson(path.join(releaseDir, "index.json"), index);
  await atomicJson(path.join(dataDir, "product.json"), product);
  return index;
}
if (process.argv[1]?.endsWith("release-sync.ts")) {
  const projectRoot = rootDir;
  const owner = process.env.FLORADOC_GITHUB_OWNER ?? (await readJson<SiteData>(path.join(projectRoot, "data", "site.json"))).github.owner;
  if (!owner) throw new Error("Set FLORADOC_GITHUB_OWNER or data/site.json github.owner before syncing.");
  const index = await syncPublishedReleases({ owner });
  console.log("Synced release history: " + index.releases.length + " version(s).");
}
