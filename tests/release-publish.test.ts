import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareRelease } from "../scripts/release-prepare";
import { publishRelease } from "../scripts/release-publish";
import type { ApiAsset, ApiRelease } from "../scripts/release-api";

test("release publisher resumes a partial draft and is idempotent", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "floradoc-publish-test-"));
  try {
    const input = path.join(temp, "package.zip");
    await writeFile(input, Buffer.from("verified test package bytes"));
    const spec = path.join(temp, "spec.json");
    await writeFile(spec, JSON.stringify({
      version: "1.0.0", channel: "stable", releaseDate: "2026-11-03",
      releaseNotes: { "zh-CN": ["测试发行说明"], en: ["Test release notes"] },
      requirements: { "zh-CN": ["Windows x64"], en: ["Windows x64"] },
      installation: { "zh-CN": ["解压并运行"], en: ["Extract and run"] },
      assets: [{ name: "Windows x64 archive", platform: "windows", architecture: "x64", format: "zip", path: "package.zip", fileName: "FloraDoc-1.0.0-win-x64.zip" }]
    }));
    const staging = path.join(temp, "staging");
    await prepareRelease(spec, staging);

    const stored = new Map<number, Uint8Array>();
    const state: { release: ApiRelease | null } = { release: null };
    let nextId = 1;
    let createCount = 0;
    let uploadAttempts = 0;
    let successfulUploads = 0;
    let failChecksumOnce = true;
    const fetchImpl = (async (inputValue: RequestInfo | URL, init?: RequestInit) => {
      const url = String(inputValue);
      const method = init?.method ?? "GET";
      if (url.endsWith("/releases/tags/v1.0.0")) return state.release ? new Response(JSON.stringify(state.release), { status: 200 }) : new Response("missing", { status: 404 });
      if (url.endsWith("/git/ref/tags/v1.0.0")) return new Response("missing", { status: 404 });
      if (url.endsWith("/releases") && method === "POST") {
        createCount++;
        const payload = JSON.parse(String(init?.body)) as { tag_name: string; prerelease: boolean };
        state.release = { id: 88, tag_name: payload.tag_name, draft: true, prerelease: payload.prerelease, upload_url: "https://uploads.test/repos/acme/floradoc-release/releases/88/assets{?name,label}", html_url: "https://github.com/acme/floradoc-release/releases/tag/v1.0.0", assets: [] };
        return new Response(JSON.stringify(state.release), { status: 201 });
      }
      if (url.startsWith("https://uploads.test/") && method === "POST") {
        uploadAttempts++;
        const name = new URL(url).searchParams.get("name")!;
        if (name === "SHA256SUMS.txt" && failChecksumOnce) { failChecksumOnce = false; return new Response("temporary upload failure", { status: 500 }); }
        const body = new Uint8Array(init?.body as ArrayBuffer);
        const asset: ApiAsset = { id: nextId++, name, size: body.length, browser_download_url: "https://github.com/acme/floradoc-release/releases/download/v1.0.0/" + name, digest: "sha256:" + createHash("sha256").update(body).digest("hex") };
        stored.set(asset.id, body);
        state.release!.assets.push(asset);
        successfulUploads++;
        return new Response(JSON.stringify(asset), { status: 201 });
      }
      const assetMatch = url.match(/\/releases\/assets\/(\d+)$/);
      if (assetMatch) {
        const bytes = stored.get(Number(assetMatch[1]));
        return bytes ? new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 }) : new Response("missing", { status: 404 });
      }
      return new Response("unexpected request: " + method + " " + url, { status: 500 });
    }) as typeof fetch;
    const dependencies = { owner: "acme", token: "mock-token", fetchImpl };

    await assert.rejects(() => publishRelease(staging, true, dependencies), /HTTP 500/);
    assert.equal(state.release?.assets.length, 1, "the first package upload should remain on the draft");
    assert.equal(await publishRelease(staging, true, dependencies), "https://github.com/acme/floradoc-release/releases/tag/v1.0.0");
    assert.equal(state.release?.assets.length, 3, "package, checksums, and manifest are uploaded once");
    assert.equal(await publishRelease(staging, true, dependencies), "https://github.com/acme/floradoc-release/releases/tag/v1.0.0");
    assert.equal(createCount, 1, "retries must reuse the existing draft");
    assert.equal(successfulUploads, 3, "completed assets must not be uploaded again");
    assert.equal(uploadAttempts, 4, "one failed checksum upload is retried exactly once");
  } finally { await rm(temp, { recursive: true, force: true }); }
});
