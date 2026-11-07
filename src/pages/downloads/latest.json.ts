import type { APIRoute } from "astro";
import { releaseList } from "../../lib/data";
import { createUpdateFeed } from "../../lib/update-feed";
import type { ReleaseData } from "../../lib/types";

export const prerender = true;

const modules = import.meta.glob<{ default: ReleaseData }>("../../../data/releases/*.json", { eager: true });
const releases = Object.entries(modules)
  .filter(([file]) => !file.endsWith("/index.json"))
  .map(([, module]) => module.default)
  .filter((release) => releaseList.releases.includes(release.version));
const update = createUpdateFeed(releases);

export const GET: APIRoute = () => {
  if (!update) return new Response(JSON.stringify({ schemaVersion: "1.0", status: "unavailable" }), {
    status: 404,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
  return new Response(JSON.stringify(update, null, 2) + "\n", {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" }
  });
};
