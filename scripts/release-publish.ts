import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readJson, rootDir, semverPattern, validateLocalizedText } from "./lib";
import { GitHubApi, type ApiAsset, type ApiRelease } from "./release-api";
import type { SiteData, ReleaseData } from "../src/lib/types";

type LocalizedText = Record<"zh-CN" | "en", string[]>;
type DraftAsset = { name: string; platform: "windows" | "macos" | "linux"; architecture: "x64" | "arm64"; format: "installer" | "zip" | "dmg" | "tar.gz"; fileName: string; fileSize: number; sha256: string };
type Draft = { schemaVersion: "1.0"; version: string; tag: string; channel: "stable" | "preview"; releaseDate: string; releaseNotes: LocalizedText; requirements: LocalizedText; installation: LocalizedText; assets: DraftAsset[]; checksumsFile: string };
type Dependencies = { owner?: string | null; token?: string | null; fetchImpl?: typeof fetch };

function notesBody(draft: Draft): string {
  return "## 中文发行说明\n" + draft.releaseNotes["zh-CN"].map((line) => "- " + line).join("\n") +
    "\n\n## English release notes\n" + draft.releaseNotes.en.map((line) => "- " + line).join("\n") +
    "\n\n## 系统要求 / System requirements\n\n中文\n" + draft.requirements["zh-CN"].map((line) => "- " + line).join("\n") +
    "\n\nEnglish\n" + draft.requirements.en.map((line) => "- " + line).join("\n") +
    "\n\n## 安装说明 / Installation\n\n中文\n" + draft.installation["zh-CN"].map((line) => "- " + line).join("\n") +
    "\n\nEnglish\n" + draft.installation.en.map((line) => "- " + line).join("\n");
}
function releaseAssetUrl(owner: string, repository: string, tag: string, fileName: string): string {
  return "https://github.com/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repository) + "/releases/download/" + encodeURIComponent(tag) + "/" + encodeURIComponent(fileName);
}

function validateDraft(draft: Draft): void {
  if (draft.schemaVersion !== "1.0" || !semverPattern.test(draft.version) || draft.tag !== "v" + draft.version) throw new Error("Invalid staging draft version or tag.");
  if (draft.channel !== "stable" && draft.channel !== "preview") throw new Error("Invalid staging draft channel.");
  const parsedDate = new Date(draft.releaseDate + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.releaseDate) || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== draft.releaseDate) throw new Error("Invalid staging release date.");
  validateLocalizedText(draft.releaseNotes, "releaseNotes");
  validateLocalizedText(draft.requirements, "requirements");
  validateLocalizedText(draft.installation, "installation");
  if (!Array.isArray(draft.assets) || draft.assets.length === 0) throw new Error("A release draft must contain at least one package asset.");
  if (draft.checksumsFile !== "SHA256SUMS.txt") throw new Error("Unexpected checksum filename in draft metadata.");
  const names = new Set<string>();
  for (const asset of draft.assets) {
    if (!/^[A-Za-z0-9._-]+$/.test(asset.fileName) || asset.fileName === "." || asset.fileName === ".." || ["SHA256SUMS.txt", "floradoc-release.json"].includes(asset.fileName)) throw new Error("Unsafe or reserved release filename: " + asset.fileName);
    if (names.has(asset.fileName)) throw new Error("Duplicate release filename: " + asset.fileName);
    names.add(asset.fileName);
    if (!Number.isInteger(asset.fileSize) || asset.fileSize < 1 || !/^[a-fA-F0-9]{64}$/.test(asset.sha256)) throw new Error("Invalid size or SHA-256 in draft for " + asset.fileName);
  }
}

async function existingAssetBytes(api: GitHubApi, release: ApiRelease, asset: ApiAsset, expected: Uint8Array): Promise<void> {
  if (asset.size !== expected.byteLength) throw new Error("Existing draft asset has a different size; refusing to overwrite: " + asset.name);
  const bytes = await api.downloadAsset(asset);
  const expectedHash = createHash("sha256").update(expected).digest("hex");
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash) throw new Error("Existing draft asset has different contents; refusing to overwrite: " + asset.name);
  if (asset.digest && asset.digest.startsWith("sha256:") && asset.digest.slice(7).toLowerCase() !== expectedHash) throw new Error("GitHub digest does not match local SHA-256: " + asset.name);
  if (release.assets.find((entry) => entry.id === asset.id)?.name !== asset.name) throw new Error("GitHub release asset changed while verifying: " + asset.name);
}

function sameManifest(existingBytes: Uint8Array, expected: ReleaseData): boolean {
  try {
    const actual = JSON.parse(new TextDecoder().decode(existingBytes)) as ReleaseData;
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch { return false; }
}

export async function publishRelease(stagingDir: string, apply: boolean, dependencies: Dependencies = {}): Promise<string> {
  const dir = path.resolve(stagingDir);
  const draft = JSON.parse(await readFile(path.join(dir, "draft.json"), "utf8")) as Draft;
  validateDraft(draft);
  const actualFiles = new Map<string, Uint8Array>();
  const checksumLines: string[] = [];
  for (const asset of draft.assets) {
    const file = path.join(dir, asset.fileName);
    const info = await stat(file);
    if (!info.isFile() || info.size !== asset.fileSize) throw new Error("Staged asset size changed: " + asset.fileName);
    const bytes = new Uint8Array(await readFile(file));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== asset.sha256.toLowerCase()) throw new Error("Staged asset checksum changed: " + asset.fileName);
    actualFiles.set(asset.fileName, bytes);
    checksumLines.push(hash + "  " + asset.fileName);
  }
  const checksumBytes = new Uint8Array(await readFile(path.join(dir, draft.checksumsFile)));
  if (new TextDecoder().decode(checksumBytes) !== checksumLines.join("\n") + "\n") throw new Error("SHA256SUMS.txt does not match staged package files.");
  const owner = dependencies.owner !== undefined ? dependencies.owner : process.env.FLORADOC_GITHUB_OWNER;
  const token = dependencies.token !== undefined ? dependencies.token : process.env.FLORADOC_GITHUB_TOKEN;
  if (!apply) {
    console.log("DRY RUN: would create or resume only a GitHub draft release " + draft.tag + " in " + (owner ?? "<FLORADOC_GITHUB_OWNER>") + "/floradoc-release.");
    console.log("Verified staged assets: " + draft.assets.map((asset) => asset.fileName + " (" + asset.fileSize + " bytes, sha256 " + asset.sha256 + ")").join(", "));
    console.log("No network write was performed. Pass --apply to create/resume a draft release.");
    return "dry-run";
  }
  if (!owner || !token) throw new Error("Set FLORADOC_GITHUB_OWNER and FLORADOC_GITHUB_TOKEN before --apply.");
  const site = await readJson<SiteData>(path.join(rootDir, "data", "site.json"));
  const api = new GitHubApi(owner, site.github.releaseRepository, token, site.releaseSync.apiVersion, dependencies.fetchImpl);
  let release = await api.getByTag(draft.tag);
  if (release && !release.draft) throw new Error("The GitHub release already exists and is published; refusing to alter published releases.");
  if (release && release.tag_name !== draft.tag) throw new Error("GitHub returned a mismatched release tag.");
  if (release && release.prerelease !== (draft.channel === "preview")) throw new Error("Existing draft prerelease flag does not match the release channel.");
  const allowedNames = new Set([...draft.assets.map((asset) => asset.fileName), draft.checksumsFile, "floradoc-release.json"]);
  if (release?.assets.some((asset) => !allowedNames.has(asset.name))) throw new Error("Draft release contains unexpected assets. Inspect it manually before continuing.");
  if (release?.assets.some((asset) => asset.name === "floradoc-release.json")) {
    const packagesComplete = draft.assets.every((asset) => release!.assets.some((item) => item.name === asset.fileName)) && release.assets.some((item) => item.name === draft.checksumsFile);
    if (!packagesComplete) throw new Error("Draft contains release metadata but is missing one or more package assets; refusing to replace metadata.");
  }
  if (!release) {
    if (await api.tagRefExists(draft.tag)) throw new Error("Git tag already exists without a release. Publisher will not move or reuse it.");
    release = await api.createDraft(draft.tag, "FloraDoc " + draft.version, notesBody(draft), draft.channel === "preview");
    if (!release.draft || release.tag_name !== draft.tag) throw new Error("GitHub did not create the requested draft release.");
  }
  const uploaded = new Map<string, string>();
  for (const asset of draft.assets) {
    const existing = release.assets.find((item) => item.name === asset.fileName);
    if (existing) {
      await existingAssetBytes(api, release, existing, actualFiles.get(asset.fileName)!);
      uploaded.set(asset.fileName, releaseAssetUrl(owner, site.github.releaseRepository, draft.tag, asset.fileName));
    } else {
      await api.upload(release, asset.fileName, actualFiles.get(asset.fileName)!);
      uploaded.set(asset.fileName, releaseAssetUrl(owner, site.github.releaseRepository, draft.tag, asset.fileName));
    }
  }
  const oldChecksums = release.assets.find((item) => item.name === draft.checksumsFile);
  if (oldChecksums) {
    await existingAssetBytes(api, release, oldChecksums, checksumBytes);
  } else await api.upload(release, draft.checksumsFile, checksumBytes, "text/plain; charset=utf-8");
  const checksumsUrl = releaseAssetUrl(owner, site.github.releaseRepository, draft.tag, draft.checksumsFile);
  const publicData: ReleaseData = {
    schemaVersion: "1.0", version: draft.version, tag: draft.tag, channel: draft.channel, releaseDate: draft.releaseDate,
    releaseNotes: draft.releaseNotes, requirements: draft.requirements, installation: draft.installation,
    assets: draft.assets.map((asset) => ({ name: asset.name, platform: asset.platform, architecture: asset.architecture, format: asset.format, fileName: asset.fileName, downloadUrl: uploaded.get(asset.fileName)!, fileSize: asset.fileSize, sha256: asset.sha256 })),
    checksumsUrl
  };
  const metadataBytes = new TextEncoder().encode(JSON.stringify(publicData, null, 2) + "\n");
  const existingMetadata = release.assets.find((asset) => asset.name === "floradoc-release.json");
  if (existingMetadata) {
    const oldBytes = await api.downloadAsset(existingMetadata);
    if (!sameManifest(oldBytes, publicData)) throw new Error("Existing draft metadata does not match the staged release; refusing to overwrite it.");
  } else await api.upload(release, "floradoc-release.json", metadataBytes, "application/json");
  console.log("Created/resumed draft release " + draft.tag + ": " + release.html_url);
  console.log("The release remains a draft. Review it in GitHub before publishing.");
  return release.html_url;
}

const args = process.argv.slice(2);
if (process.argv[1]?.endsWith("release-publish.ts")) {
  const staging = args[args.indexOf("--staging") + 1];
  if (!staging) throw new Error("Usage: npm run release:publish -- --staging <directory> [--apply]");
  await publishRelease(staging, args.includes("--apply"));
}
