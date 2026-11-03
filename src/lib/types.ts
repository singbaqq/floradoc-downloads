export type Locale = "zh-CN" | "en";
export type PageKind = "home" | "features" | "downloads" | "releases" | "faq" | "docs";
export type FeatureStatus = "supported" | "limited" | "experimental" | "planned";
export interface Feature { id: string; title: string; summary: string; status: FeatureStatus }
export interface Faq { question: string; answer: string }
export interface LocalizedProduct {
  eyebrow: string; title: string; description: string; heroCta: string; downloadCta: string;
  intro: string; workflowTitle: string; workflowBody: string;
  screenshotTitle: string; screenshotCaption: string; screenshotPending: string; screenshotPendingBody: string;
  releaseTitle: string; releaseBody: string; docsTitle: string; docsBody: string;
  supportTitle: string; supportBody: string; features: Feature[]; scenarios: { title: string; body: string }[]; faqs: Faq[];
}
export interface ProductData { schemaVersion: "1.0"; product: { id: "floradoc"; name: "FloraDoc"; targetPlatforms: string[]; releaseStatus: "available" | "comingSoon"; documentationStatus: "available" | "comingSoon"; locales: Record<Locale, LocalizedProduct> } }
export interface SiteData {
  schemaVersion: "1.0"; canonicalDomain: string; defaultLocale: Locale; locales: Locale[];
  github: { owner: string | null; websiteRepository: string; releaseRepository: string; feedbackUrl: string | null };
  documentationUrl: string | null; releaseSync: { apiVersion: string; timeoutMs: number };
}
export interface ReleaseAsset { name: string; platform: "windows" | "macos" | "linux"; architecture: "x64" | "arm64"; format: "installer" | "zip" | "dmg" | "tar.gz"; fileName: string; downloadUrl: string; fileSize: number; sha256: string }
export interface ReleaseData {
  schemaVersion: "1.0"; version: string; tag: string; channel: "stable" | "preview"; releaseDate: string;
  releaseNotes: Record<Locale, string[]>; requirements: Record<Locale, string[]>; installation: Record<Locale, string[]>; assets: ReleaseAsset[]; checksumsUrl: string | null;
}
export interface ReleaseIndex { schemaVersion: "1.0"; status: "available" | "comingSoon"; releases: string[] }
