import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createValidator, rootDir, validateLocalData, validateObject, validateReleaseIndexSemantics } from "../scripts/lib";
import { productData, siteData, releaseList, pagePath } from "../src/lib/data";
import { createUpdateFeed } from "../src/lib/update-feed";
import type { ReleaseData } from "../src/lib/types";

test("checked-in site/product/release data passes all schemas and cross checks", async () => {
  await validateLocalData();
  const expectedStatus = releaseList.releases.length > 0 ? "available" : "comingSoon";
  assert.equal(releaseList.status, expectedStatus);
  assert.equal(productData.product.releaseStatus, expectedStatus);
});
test("product schema rejects one-language content and malformed feature status", async () => {
  const schema = JSON.parse(await readFile(path.join(rootDir, "src/schemas/product.schema.json"), "utf8")) as object;
  const validate = createValidator(schema);
  const copy = structuredClone(productData) as unknown as { product: { locales: Record<string, unknown> } };
  delete copy.product.locales.en;
  assert.equal(validate(copy), false);
});
test("release index status cannot claim available without a release", async () => {
  const index = { schemaVersion: "1.0", status: "available", releases: [] };
  await assert.rejects(async () => {
    await validateObject("src/schemas/release-index.schema.json", index, "test index");
    validateReleaseIndexSemantics(index as never, productData);
  });
});
test("localized paths preserve route and never use query-based language switching", () => {
  assert.equal(pagePath("en", "features"), "/en/features/");
  assert.equal(pagePath("zh-CN", "releases", "1.2.3"), "/releases/1.2.3/");
  assert.equal(pagePath("en", "releases", "1.2.3"), "/en/releases/1.2.3/");
  assert.ok(siteData.canonicalDomain.startsWith("https://"));
});
test("update feed selects the highest Windows x64 installer and matches updater schema", () => {
  const makeRelease = (version: string, format: "installer" | "zip" = "installer") => ({
    schemaVersion: "1.0", version, tag: "v" + version, channel: "preview", releaseDate: "2026-11-07",
    releaseNotes: { "zh-CN": ["试用说明"], en: ["Preview notes"] },
    requirements: { "zh-CN": ["Windows x64"], en: ["Windows x64"] },
    installation: { "zh-CN": ["安装"], en: ["Install"] },
    assets: [{ name: "Installer", platform: "windows", architecture: "x64", format, fileName: "setup.exe", downloadUrl: "https://example.test/setup.exe", fileSize: 123, sha256: "A".repeat(64) }],
    checksumsUrl: null
  }) as ReleaseData;
  const feed = createUpdateFeed([makeRelease("0.1.3"), makeRelease("0.2.0", "zip"), makeRelease("0.1.4")]);
  assert.deepEqual(feed, {
    schemaVersion: "1.0", version: "0.1.4", packageUrl: "https://example.test/setup.exe",
    sha256: "a".repeat(64), releaseNotes: "试用说明"
  });
  assert.equal(createUpdateFeed([makeRelease("0.2.0", "zip")]), null);
});
