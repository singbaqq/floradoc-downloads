import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareRelease } from "../scripts/release-prepare";
import { publishRelease } from "../scripts/release-publish";

test("release preparation copies real inputs and emits matching size and SHA-256", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "floradoc-release-test-"));
  try {
    const source = path.join(temp, "input.bin");
    const output = path.join(temp, "stage");
    const bytes = Buffer.from("real fixture bytes for the release tool test");
    await writeFile(source, bytes);
    const specPath = path.join(temp, "spec.json");
    await writeFile(specPath, JSON.stringify({
      version: "1.0.0", channel: "stable", releaseDate: "2026-11-03",
      releaseNotes: { "zh-CN": ["中文说明"], en: ["Release note"] },
      requirements: { "zh-CN": ["Windows x64"], en: ["Windows x64"] },
      installation: { "zh-CN": ["解压后运行实际入口程序"], en: ["Run the verified application entry point from the extracted folder"] },
      assets: [{ name: "Windows x64 archive", platform: "windows", architecture: "x64", format: "zip", path: "input.bin", fileName: "FloraDoc-1.0.0-win-x64.zip" }]
    }));
    const draft = await prepareRelease(specPath, output);
    assert.equal(draft.assets[0]?.fileSize, bytes.length);
    assert.equal(draft.assets[0]?.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(await readFile(path.join(output, draft.checksumsFile), "utf8"), draft.assets[0]?.sha256 + "  " + draft.assets[0]?.fileName + "\n");
    assert.equal(await publishRelease(output, false), "dry-run");
    await assert.rejects(() => prepareRelease(specPath, output));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
