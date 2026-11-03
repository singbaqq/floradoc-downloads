# Cloudflare Pages setup

This repository builds a static Astro site into `dist/`. Configure Cloudflare Pages only after the GitHub repositories, public release content, and site review are ready.

## Project settings

- Project name: `floradoc-downloads`
- Framework preset: Astro (or None)
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: 22.23.4 or newer; this repository pins 22.23.4 in `.nvmrc` and `.node-version`
- Root directory: repository root

Connect the `floradoc-downloads` GitHub repository through Pages Git integration. Successful commits to `main` publish production builds; pull requests receive preview deployments. Review the exact branch and preview settings in the Pages project before enabling production.

## Environment variables

Set `FLORADOC_GITHUB_OWNER` to the actual GitHub user or organization that owns `floradoc-release`. It is deliberately unset in `data/site.json` because no owner was established during local implementation.

A Pages build with `CF_PAGES=1` fetches published GitHub Releases before Astro builds. API errors, a missing repository, malformed metadata, or an unavailable release asset fail the build rather than silently displaying an empty release list. Public GitHub API rate limits therefore also block a build; retry after the limit resets or configure authenticated read access in a future change.

## Release refresh

Create a Pages build hook in the Cloudflare project and keep its URL in a local environment variable named `CLOUDFLARE_BUILD_HOOK_URL`. Do not commit the hook URL. After a release is reviewed and published in GitHub, run:

```powershell
npm run release:trigger-build
npm run release:trigger-build -- --apply
```

The first command prints a dry-run summary. The second sends the POST request and starts the Pages build. The build fetches the public release data and publishes the refreshed download center through the existing Git integration. Review deployment status in Cloudflare.

DNS and custom-domain attachment for `floradoc.aitodo.net` are separate Cloudflare operations and are not performed by this repository.

## Official Cloudflare references

- [Deploy an Astro site to Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/)
- [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
