export async function triggerBuild(apply: boolean): Promise<void> {
  const hook = process.env.CLOUDFLARE_BUILD_HOOK_URL;
  if (!hook) throw new Error("Set CLOUDFLARE_BUILD_HOOK_URL before triggering a Pages build.");
  const url = new URL(hook);
  if (url.protocol !== "https:" || url.hostname !== "api.cloudflare.com" || !/^\/client\/v4\/pages\/webhooks\/deploy_hooks\/[A-Za-z0-9-]+$/.test(url.pathname)) throw new Error("Build hook URL must be a Cloudflare Pages deploy hook.");
  if (!apply) {
    console.log("DRY RUN: configured Cloudflare Pages hook host is " + url.host + ".");
    console.log("No request was sent. Pass --apply to trigger a Pages build.");
    return;
  }
  const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Cloudflare Pages build hook failed with HTTP " + response.status + ".");
  console.log("Cloudflare Pages build triggered. Check the Pages dashboard for completion.");
}
if (process.argv[1]?.endsWith("trigger-build.ts")) await triggerBuild(process.argv.includes("--apply"));
