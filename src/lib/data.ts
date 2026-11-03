import site from "../../data/site.json";
import product from "../../data/product.json";
import releaseIndex from "../../data/releases/index.json";
import type { Locale, PageKind, ProductData, ReleaseData, ReleaseIndex, SiteData } from "./types";
export const siteData = site as SiteData;
export const productData = product as ProductData;
export const releaseList = releaseIndex as ReleaseIndex;
export const navLabels: Record<Locale, Record<PageKind, string>> = {
  "zh-CN": { home: "首页", features: "产品能力", downloads: "下载中心", releases: "发行记录", faq: "常见问题", docs: "使用文档" },
  en: { home: "Home", features: "Features", downloads: "Downloads", releases: "Releases", faq: "FAQ", docs: "Documentation" }
};
export const pageLabels: Record<Locale, Record<PageKind, { title: string; description: string }>> = {
  "zh-CN": {
    home: { title: "FloraDoc — 文档构建与交付", description: productData.product.locales["zh-CN"].description },
    features: { title: "产品能力 — FloraDoc", description: "查看 FloraDoc 当前可核实的文档构建、工作区和自动化能力。" },
    downloads: { title: "软件下载 — FloraDoc", description: "FloraDoc 官方下载与发行包校验信息。" },
    releases: { title: "发行记录 — FloraDoc", description: "FloraDoc 各版本发行说明、系统要求与文件校验值。" },
    faq: { title: "常见问题 — FloraDoc", description: "FloraDoc 下载、平台、文档构建和支持状态的常见问题。" },
    docs: { title: "使用文档 — FloraDoc", description: "FloraDoc 面向用户的公开使用文档入口。" }
  },
  en: {
    home: { title: "FloraDoc — Document builds and delivery", description: productData.product.locales.en.description },
    features: { title: "Features — FloraDoc", description: "Explore FloraDoc document-building, workspace, and workflow capabilities." },
    downloads: { title: "Download FloraDoc", description: "Official FloraDoc downloads and release package checksums." },
    releases: { title: "Release history — FloraDoc", description: "FloraDoc release notes, system requirements, and file checksums." },
    faq: { title: "Frequently asked questions — FloraDoc", description: "Answers about FloraDoc downloads, platforms, document builds, and support." },
    docs: { title: "Documentation — FloraDoc", description: "Public user documentation for FloraDoc." }
  }
};
export function pagePath(locale: Locale, kind: PageKind, version?: string): string {
  const root = locale === "en" ? "/en/" : "/";
  if (kind === "home") return root;
  const slug: Record<Exclude<PageKind, "home">, string> = { features: "features", downloads: "downloads", releases: "releases", faq: "faq", docs: "docs" };
  const base = root + slug[kind] + "/";
  return kind === "releases" && version ? base + encodeURIComponent(version) + "/" : base;
}
export function releasePath(locale: Locale, version: string): string { return pagePath(locale, "releases", version); }
export function releasesFromFiles(modules: Record<string, ReleaseData>): ReleaseData[] {
  return Object.values(modules).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
}
