# FloraDoc official site and download center

Astro static site for the FloraDoc product website at `https://floradoc.aitodo.net`.

## Local setup

Requirements: Node.js 22.23.4 or newer and npm.

```powershell
npm install
npm run dev
```

The default locale is Simplified Chinese. English pages live under `/en/`.

## Checks and build

```powershell
npm run validate:data
npm test
npm run check
npm run build
npm run security:dist
```

A local build uses the checked-in release snapshot and does not access GitHub. A Cloudflare Pages build (`CF_PAGES=1`) requires `FLORADOC_GITHUB_OWNER`, reads published releases from the public `floradoc-release` repository, validates their attached `floradoc-release.json` metadata, and fails closed if the GitHub API or a release manifest is unavailable.

## Release operations

See [release workflow](docs/release-workflow.md). Preparation hashes real files. Publishing defaults to a dry run; `--apply` creates or updates only a GitHub draft release. A person publishes the reviewed draft in GitHub. The release sync and Pages build-hook commands also default to read-only/dry-run behavior.

## Cloudflare Pages

See [Pages setup](docs/cloudflare-pages.md). Project name: `floradoc-downloads`; build command: `npm run build`; output directory: `dist`. Git integration and production deployment are intentionally configured outside this local source task.
