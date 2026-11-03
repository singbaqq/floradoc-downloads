import { validateLocalData } from "./lib";
import { syncPublishedReleases } from "./release-sync";
await validateLocalData();
if (process.env.CF_PAGES === "1") {
  const owner = process.env.FLORADOC_GITHUB_OWNER;
  if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) throw new Error("Cloudflare Pages build requires FLORADOC_GITHUB_OWNER (GitHub owner/org slug).");
  await syncPublishedReleases({ owner });
  await validateLocalData();
} else {
  console.log("Local build uses the checked-in release snapshot; no network sync performed.");
}
