import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { semverPattern } from "./lib";

type LocaleText = { "zh-CN": string[]; en: string[] };
type SpecAsset = { name: string; platform: "windows" | "macos" | "linux"; architecture: "x64" | "arm64"; format: "installer" | "zip" | "dmg" | "tar.gz"; path: string; fileName?: string };
type Spec = { version: string; channel: "stable" | "preview"; releaseDate: string; releaseNotes: LocaleText; requirements: LocaleText; installation: LocaleText; assets: SpecAsset[] };
type DraftAsset = Omit<SpecAsset, "path"> & { fileName: string; fileSize: number; sha256: string };
type Draft = { schemaVersion: "1.0"; version: string; tag: string; channel: "stable" | "preview"; releaseDate: string; releaseNotes: LocaleText; requirements: LocaleText; installation: LocaleText; assets: DraftAsset[]; checksumsFile: string };
function needText(value: unknown, name: string): asserts value is LocaleText {
  if (!value || typeof value !== "object") throw new Error(name + " must contain localized text.");
  const obj = value as Record<string, unknown>;
  for (const locale of ["zh-CN", "en"]) {
    const rows = obj[locale];
    if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => typeof row !== "string" || row.trim().length < 2)) throw new Error(name + "." + locale + " must contain non-empty strings.");
  }
}
export async function prepareRelease(specFile: string, outDir: string): Promise<Draft> {
  const source = path.resolve(specFile);
  const spec = JSON.parse(await readFile(source, "utf8")) as Spec;
  if (!semverPattern.test(spec.version)) throw new Error("version must be semantic version x.y.z.");
  if (!["stable", "preview"].includes(spec.channel)) throw new Error("channel must be stable or preview.");
  const parsedDate = new Date(spec.releaseDate + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spec.releaseDate) || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== spec.releaseDate) throw new Error("releaseDate must be a real YYYY-MM-DD date.");
  needText(spec.releaseNotes, "releaseNotes");
  needText(spec.requirements, "requirements");
  needText(spec.installation, "installation");
  if (!Array.isArray(spec.assets) || spec.assets.length === 0) throw new Error("At least one real package asset is required.");
  const output = path.resolve(outDir);
  await mkdir(output, { recursive: true });
  const seen = new Set<string>();
  const assets: DraftAsset[] = [];
  const checksumLines: string[] = [];
  for (const asset of spec.assets) {
    const fileName = asset.fileName ?? path.basename(asset.path);
    if (!/^[A-Za-z0-9._-]+$/.test(fileName) || fileName === "." || fileName === "..") throw new Error("Unsafe package filename: " + fileName);
    if (["SHA256SUMS.txt", "floradoc-release.json"].includes(fileName)) throw new Error("Package filename is reserved by release metadata: " + fileName);
    if (seen.has(fileName)) throw new Error("Duplicate package filename: " + fileName);
    seen.add(fileName);
    if (typeof asset.name !== "string" || asset.name.trim().length < 3) throw new Error("Asset name must be at least three characters.");
    if (!["windows", "macos", "linux"].includes(asset.platform) || !["x64", "arm64"].includes(asset.architecture) || !["installer", "zip", "dmg", "tar.gz"].includes(asset.format)) throw new Error("Invalid platform, architecture, or format for " + fileName);
    const localPath = path.resolve(path.dirname(source), asset.path);
    const info = await stat(localPath);
    if (!info.isFile() || info.size < 1) throw new Error("Package asset is missing or empty: " + localPath);
    const bytes = await readFile(localPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const target = path.join(output, fileName);
    await copyFile(localPath, target, 1);
    assets.push({ name: asset.name, platform: asset.platform, architecture: asset.architecture, format: asset.format, fileName, fileSize: info.size, sha256 });
    checksumLines.push(sha256 + "  " + fileName);
  }
  const draft: Draft = {
    schemaVersion: "1.0", version: spec.version, tag: "v" + spec.version, channel: spec.channel, releaseDate: spec.releaseDate,
    releaseNotes: spec.releaseNotes, requirements: spec.requirements, installation: spec.installation, assets, checksumsFile: "SHA256SUMS.txt"
  };
  await writeFile(path.join(output, "draft.json"), JSON.stringify(draft, null, 2) + "\n", { flag: "wx" });
  await writeFile(path.join(output, draft.checksumsFile), checksumLines.join("\n") + "\n", { flag: "wx" });
  console.log("Prepared " + assets.length + " verified package file(s) for " + draft.tag + " in " + output);
  return draft;
}
const args = process.argv.slice(2);
if (process.argv[1]?.endsWith("release-prepare.ts")) {
  const spec = args[args.indexOf("--spec") + 1];
  const out = args[args.indexOf("--out") + 1];
  if (!spec || !out) throw new Error("Usage: npm run release:prepare -- --spec <release-spec.json> --out <new-staging-directory>");
  await prepareRelease(spec, out);
}
