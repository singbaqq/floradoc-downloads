import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile, readdir, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locale, ReleaseData, ReleaseIndex, SiteData, ProductData } from "../src/lib/types";
export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataDir = path.join(rootDir, "data");
export const releaseDir = path.join(dataDir, "releases");
export function createValidator(schema: object) {
  const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv); return ajv.compile(schema);
}
export async function readJson<T>(file: string): Promise<T> { return JSON.parse(await readFile(file, "utf8")) as T; }
export async function atomicJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  await writeFile(temp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await rename(temp, file);
}
export async function validateObject(schemaFile: string, data: unknown, label: string, schemaRoot = rootDir): Promise<void> {
  const schema = await readJson<object>(path.join(schemaRoot, schemaFile));
  const validator = createValidator(schema);
  if (!validator(data)) {
    const details = validator.errors?.map((error) => error.instancePath + " " + error.message).join("; ");
    throw new Error(label + " does not match " + schemaFile + ": " + details);
  }
}
export const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
export async function validateRelease(release: ReleaseData, version: string, schemaRoot = rootDir): Promise<void> {
  await validateObject("src/schemas/release.schema.json", release, "release " + version, schemaRoot);
  if (release.version !== version) throw new Error("Release file/version mismatch: " + version);
  if (release.tag !== "v" + release.version) throw new Error("Release tag must match version " + version);
  const files = new Set<string>();
  for (const asset of release.assets) {
    if (files.has(asset.fileName)) throw new Error("Duplicate asset filename in release " + version + ": " + asset.fileName);
    files.add(asset.fileName);
  }
}
export function validateReleaseIndexSemantics(index: ReleaseIndex, product: ProductData): void {
  if (product.product.releaseStatus !== index.status) throw new Error("Product releaseStatus must match release index status");
  if (index.releases.length === 0 && index.status !== "comingSoon") throw new Error("An empty release index must use comingSoon");
  if (index.releases.length > 0 && index.status !== "available") throw new Error("A non-empty release index must use available");
  if (new Set(index.releases).size !== index.releases.length) throw new Error("Release index contains duplicate versions");
}
export async function validateLocalData(projectRoot = rootDir): Promise<void> {
  const data = path.join(projectRoot, "data");
  const relDir = path.join(data, "releases");
  const site = await readJson<SiteData>(path.join(data, "site.json"));
  const product = await readJson<ProductData>(path.join(data, "product.json"));
  const index = await readJson<ReleaseIndex>(path.join(relDir, "index.json"));
  await validateObject("src/schemas/site.schema.json", site, "site config", projectRoot);
  await validateObject("src/schemas/product.schema.json", product, "product data", projectRoot);
  await validateObject("src/schemas/release-index.schema.json", index, "release index", projectRoot);
  validateReleaseIndexSemantics(index, product);
  const files = (await readdir(relDir)).filter((name) => name.endsWith(".json") && name !== "index.json");
  const versions = files.map((name) => name.slice(0, -5));
  for (const version of index.releases) {
    if (!semverPattern.test(version)) throw new Error("Invalid semantic version in index: " + version);
    const release = await readJson<ReleaseData>(path.join(relDir, version + ".json"));
    await validateRelease(release, version, projectRoot);
  }
  for (const version of versions) if (!index.releases.includes(version)) throw new Error("Unindexed release data file: " + version);
  if (product.product.documentationStatus === "available" && !site.documentationUrl) throw new Error("Documentation marked available but no URL is configured");
  if (site.github.owner === "") throw new Error("GitHub owner must be a slug or null");
}
export function validateLocalizedText(value: unknown, field: string): asserts value is Record<Locale, string[]> {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>)["zh-CN"]) || !Array.isArray((value as Record<string, unknown>).en)) throw new Error(field + " must contain zh-CN and en arrays");
  const obj = value as Record<string, unknown>;
  for (const locale of ["zh-CN", "en"] as const) {
    const entries = obj[locale] as unknown[];
    if (entries.length < 1 || entries.some((entry) => typeof entry !== "string" || entry.trim().length < 2)) throw new Error(field + "." + locale + " must contain non-empty strings");
  }
}
