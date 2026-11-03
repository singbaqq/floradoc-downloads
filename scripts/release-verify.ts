import { createHash } from "node:crypto";
import path from "node:path";
import { GitHubApi } from "./release-api";
import { readJson, rootDir, validateRelease } from "./lib";
import type { SiteData, ReleaseData } from "../src/lib/types";
export async function verifyPublishedRelease(version: string): Promise<void> {
  const owner = process.env.FLORADOC_GITHUB_OWNER;
  if (!owner) throw new Error("Set FLORADOC_GITHUB_OWNER before verifying a public release.");
  const site = await readJson<SiteData>(path.join(rootDir, "data", "site.json"));
  const token = process.env.FLORADOC_GITHUB_TOKEN ?? null;
  const api = new GitHubApi(owner, site.github.releaseRepository, token, site.releaseSync.apiVersion);
  const release = await api.getByTag("v" + version);
  if (!release || release.draft) throw new Error("Published GitHub release v" + version + " was not found.");
  const metadataAsset = release.assets.find((asset) => asset.name === "floradoc-release.json");
  if (!metadataAsset) throw new Error("Release metadata asset floradoc-release.json is missing.");
  const metadataResponse = await fetch(metadataAsset.browser_download_url, { signal: AbortSignal.timeout(site.releaseSync.timeoutMs) });
  if (!metadataResponse.ok) throw new Error("Could not download release metadata: HTTP " + metadataResponse.status);
  const data = await metadataResponse.json() as ReleaseData;
  await validateRelease(data, version);
  for (const asset of data.assets) {
    const remote = release.assets.find((item) => item.name === asset.fileName);
    if (!remote || remote.size !== asset.fileSize) throw new Error("Remote size/name mismatch for " + asset.fileName);
    const response = await fetch(asset.downloadUrl, { signal: AbortSignal.timeout(site.releaseSync.timeoutMs) });
    if (!response.ok) throw new Error("Could not download " + asset.fileName + " for checksum verification: HTTP " + response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== asset.fileSize || sha256 !== asset.sha256.toLowerCase()) throw new Error("Published file failed size/SHA-256 verification: " + asset.fileName);
    console.log("verified " + asset.fileName + " (" + bytes.length + " bytes, SHA-256 " + sha256 + ")");
  }
  if (release.prerelease !== (data.channel === "preview")) throw new Error("GitHub prerelease flag does not match manifest channel.");
  console.log("Published release v" + version + " and all package files verified.");
}
if (process.argv[1]?.endsWith("release-verify.ts")) {
  const version = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!version) throw new Error("Usage: npm run release:verify -- <version>");
  await verifyPublishedRelease(version);
}
