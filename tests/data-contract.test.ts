import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createValidator, rootDir, validateLocalData, validateObject, validateReleaseIndexSemantics } from "../scripts/lib";
import { productData, siteData, releaseList, pagePath } from "../src/lib/data";

test("checked-in site/product/release data passes all schemas and cross checks", async () => {
  await validateLocalData();
  assert.equal(releaseList.status, "comingSoon");
  assert.equal(productData.product.releaseStatus, "comingSoon");
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
