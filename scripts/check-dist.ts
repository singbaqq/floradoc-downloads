import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist");
const forbidden = [/[A-Za-z]:\\/i, /aicodo-tools/i, /localhost|127\.0\.0\.1/i, /\.codegraph/i];
const binaryExtensions = new Set([".exe", ".dll", ".msi", ".zip", ".7z", ".tar", ".gz", ".pdb"]);
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full)); else out.push(full);
  }
  return out;
}
const files = await walk(root);
if (!files.some((file) => file.endsWith("index.html"))) throw new Error("dist has no homepage.");
const relativeFiles = new Set(files.map((file) => path.relative(root, file).replaceAll("\\", "/")));
for (const asset of ["favicon.png", "images/flora.png", "images/floradoc-social.png"]) if (!relativeFiles.has(asset)) throw new Error("Missing public brand/SEO asset: " + asset);
const requiredPages = [
  "index.html", "features/index.html", "downloads/index.html", "releases/index.html", "faq/index.html", "docs/index.html",
  "en/index.html", "en/features/index.html", "en/downloads/index.html", "en/releases/index.html", "en/faq/index.html", "en/docs/index.html", "404.html"
];
for (const page of requiredPages) if (!relativeFiles.has(page)) throw new Error("Missing required localized page: " + page);
const englishHome = await readFile(path.join(root, "en", "index.html"), "utf8");
if (!/<html lang="en">/.test(englishHome)) throw new Error("English homepage is missing its language declaration.");
const chineseHome = await readFile(path.join(root, "index.html"), "utf8");
if (!chineseHome.includes("正式下载尚未发布") || !englishHome.includes("official downloads not yet published") || !chineseHome.includes("即将开放") || !englishHome.includes("Coming soon")) throw new Error("Empty-release state is missing from one of the localized home pages.");
for (const [page, html] of [["zh-CN", chineseHome], ["en", englishHome]] as const) {
  if (!html.includes('property="og:title"') || !html.includes('rel="canonical"') || !html.includes('application/ld+json')) throw new Error("SEO metadata is incomplete for the " + page + " homepage.");
}
for (const file of files) {
  if (binaryExtensions.has(path.extname(file).toLowerCase())) throw new Error("Unexpected product binary in website output: " + path.relative(root, file));
  if (!file.endsWith(".html") && !file.endsWith(".xml") && !file.endsWith(".txt")) continue;
  const text = await readFile(file, "utf8");
  for (const pattern of forbidden) if (pattern.test(text)) throw new Error("Forbidden internal path or local URL in " + path.relative(root, file));
  const urls = [...text.matchAll(/(?:href|src)="([^"]+)"/g)].flatMap((match) => match[1] ? [match[1]] : []);
  for (const value of urls) {
    if (value.startsWith("https://") || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("data:")) continue;
    if (!value.startsWith("/")) throw new Error("Unsupported non-HTTPS link in output: " + value);
    const clean = (value.split(/[?#]/)[0] ?? "").replace(/^\/+/, "");
    if (!clean) continue;
    const candidates = [path.join(root, clean), path.join(root, clean, "index.html")];
    let exists = false;
    for (const candidate of candidates) { try { if ((await stat(candidate)).isFile()) exists = true; } catch {} }
    if (!exists) throw new Error("Broken local static link: " + value + " (from " + path.relative(root, file) + ")");
  }
}
console.log("dist contains no private paths, local hosts, or product binaries; local links resolve.");
