import type { ReleaseData } from "./types";

export interface UpdateFeed {
  schemaVersion: "1.0";
  version: string;
  packageUrl: string;
  sha256: string;
  releaseNotes: string;
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const separator = value.indexOf("-");
    const core = separator < 0 ? value : value.slice(0, separator);
    const suffix = separator < 0 ? undefined : value.slice(separator + 1);
    return { core: core.split(".").map(Number), suffix };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index++) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (a.suffix === b.suffix) return 0;
  if (a.suffix === undefined) return 1;
  if (b.suffix === undefined) return -1;
  return a.suffix.localeCompare(b.suffix, "en", { numeric: true });
}

export function createUpdateFeed(releases: ReleaseData[]): UpdateFeed | null {
  const candidates = releases
    .filter((release) => release.channel === "preview" || release.channel === "stable")
    .filter((release) => release.assets.some((asset) => asset.platform === "windows" && asset.architecture === "x64" && asset.format === "installer"))
    .sort((left, right) => compareVersions(right.version, left.version));
  const release = candidates[0];
  if (!release) return null;

  const installer = release.assets.find((asset) => asset.platform === "windows" && asset.architecture === "x64" && asset.format === "installer");
  if (!installer || !installer.downloadUrl.startsWith("https://") || !/^[a-f0-9]{64}$/i.test(installer.sha256)) {
    throw new Error(`Release ${release.version} has an invalid Windows x64 installer asset.`);
  }

  return {
    schemaVersion: "1.0",
    version: release.version,
    packageUrl: installer.downloadUrl,
    sha256: installer.sha256.toLowerCase(),
    releaseNotes: release.releaseNotes["zh-CN"].join("\n")
  };
}
