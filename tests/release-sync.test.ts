import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { syncPublishedReleases } from "../scripts/release-sync";
import type { ReleaseData } from "../src/lib/types";

const repo = path.resolve(".");
async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "floradoc-sync-test-"));
  await mkdir(path.join(root, "data", "releases"), { recursive: true });
  await mkdir(path.join(root, "src", "schemas"), { recursive: true });
  await cp(path.join(repo, "src", "schemas", "release.schema.json"), path.join(root, "src", "schemas", "release.schema.json"));
  await cp(path.join(repo, "src", "schemas", "release-index.schema.json"), path.join(root, "src", "schemas", "release-index.schema.json"));
  await cp(path.join(repo, "data", "product.json"), path.join(root, "data", "product.json"));
  await writeFile(path.join(root, "data", "site.json"), JSON.stringify({ schemaVersion:"1.0", canonicalDomain:"https://floradoc.aitodo.net", defaultLocale:"zh-CN", locales:["zh-CN","en"], github:{owner:null,websiteRepository:"floradoc-downloads",releaseRepository:"floradoc-release",feedbackUrl:null}, documentationUrl:null, releaseSync:{apiVersion:"2022-11-28",timeoutMs:15000} }));
  await writeFile(path.join(root, "data", "releases", "index.json"), JSON.stringify({schemaVersion:"1.0",status:"comingSoon",releases:[]}));
  return root;
}
function release(): ReleaseData {
  return { schemaVersion:"1.0",version:"1.0.0",tag:"v1.0.0",channel:"stable",releaseDate:"2026-11-03",
    releaseNotes:{"zh-CN":["修复与改进"],en:["Fixes and improvements"]},requirements:{"zh-CN":["Windows x64"],en:["Windows x64"]},installation:{"zh-CN":["按发行说明操作"],en:["Follow the release instructions"]},
    assets:[{name:"Windows x64 archive",platform:"windows",architecture:"x64",format:"zip",fileName:"FloraDoc-1.0.0-win-x64.zip",downloadUrl:"https://github.com/acme/floradoc-release/releases/download/v1.0.0/FloraDoc-1.0.0-win-x64.zip",fileSize:123,sha256:"a".repeat(64)}],checksumsUrl:null };
}
function fetchOk(data: ReleaseData): typeof fetch {
  const api = [{tag_name:"v1.0.0",draft:false,prerelease:false,published_at:"2026-11-03T00:00:00Z",assets:[
    {name:"FloraDoc-1.0.0-win-x64.zip",size:123,browser_download_url:data.assets[0]!.downloadUrl},
    {name:"floradoc-release.json",size:300,browser_download_url:"https://assets.test/manifest.json"}
  ]}];
  return (async (input: RequestInfo | URL) => {
    const url=String(input);
    if(url.includes("api.github.com")) return new Response(JSON.stringify(api),{status:200});
    if(url==="https://assets.test/manifest.json") return new Response(JSON.stringify(data),{status:200});
    return new Response("missing",{status:404});
  }) as typeof fetch;
}
test("release sync imports a validated public release and is idempotent", async () => {
  const root=await fixture();
  try {
    const first=await syncPublishedReleases({owner:"acme",fetchImpl:fetchOk(release()),projectRoot:root});
    const second=await syncPublishedReleases({owner:"acme",fetchImpl:fetchOk(release()),projectRoot:root});
    assert.deepEqual(first.releases,["1.0.0"]); assert.deepEqual(second.releases,["1.0.0"]);
    assert.equal(JSON.parse(await readFile(path.join(root,"data","releases","1.0.0.json"),"utf8")).version,"1.0.0");
    assert.equal(JSON.parse(await readFile(path.join(root,"data","product.json"),"utf8")).product.releaseStatus,"available");
  } finally { await rm(root,{recursive:true,force:true}); }
});
test("release sync preserves prior history when the remote list is empty", async () => {
  const root=await fixture();
  try {
    await writeFile(path.join(root,"data","releases","index.json"),JSON.stringify({schemaVersion:"1.0",status:"available",releases:["0.9.0"]}));
    const old=release(); old.version="0.9.0"; old.tag="v0.9.0";
    await writeFile(path.join(root,"data","releases","0.9.0.json"),JSON.stringify(old));
    const result=await syncPublishedReleases({owner:"acme",fetchImpl:(async()=>new Response("[]",{status:200})) as typeof fetch,projectRoot:root});
    assert.deepEqual(result.releases,["0.9.0"]);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test("release sync refuses to overwrite an existing version's published history", async () => {
  const root=await fixture();
  try {
    const old=release();
    await writeFile(path.join(root,"data","releases","1.0.0.json"),JSON.stringify(old));
    await writeFile(path.join(root,"data","releases","index.json"),JSON.stringify({schemaVersion:"1.0",status:"available",releases:["1.0.0"]}));
    const changed=release(); changed.releaseNotes.en=["Changed history"];
    await assert.rejects(()=>syncPublishedReleases({owner:"acme",fetchImpl:fetchOk(changed),projectRoot:root}),/refusing to overwrite version 1.0.0/);
    assert.deepEqual(JSON.parse(await readFile(path.join(root,"data","releases","1.0.0.json"),"utf8")),old);
  } finally { await rm(root,{recursive:true,force:true}); }
});
for (const status of [403,404,429]) test("release sync treats GitHub HTTP "+status+" as an error, not coming soon", async () => {
  const root=await fixture();
  try {
    await assert.rejects(()=>syncPublishedReleases({owner:"acme",fetchImpl:(async()=>new Response("error",{status})) as typeof fetch,projectRoot:root}),/HTTP/);
    const index=JSON.parse(await readFile(path.join(root,"data","releases","index.json"),"utf8"));
    assert.equal(index.status,"comingSoon"); assert.deepEqual(index.releases,[]);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test("release sync rejects duplicate published versions", async () => {
  const root=await fixture();
  try {
    const api=[{tag_name:"v1.0.0",draft:false,prerelease:false,published_at:"2026-11-03T00:00:00Z",assets:[]},{tag_name:"v1.0.0",draft:false,prerelease:false,published_at:"2026-11-03T00:00:00Z",assets:[]}];
    const fetcher=(async()=>new Response(JSON.stringify(api),{status:200})) as typeof fetch;
    await assert.rejects(()=>syncPublishedReleases({owner:"acme",fetchImpl:fetcher,projectRoot:root}),/Duplicate published/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
