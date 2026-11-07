# Public release repository and download metadata

The product website and public binaries are separate from the product source tree. Publish official downloadable files only in the public GitHub repository `floradoc-release`; do not commit installers or archives to this website repository.

## Release metadata contract

Every public GitHub Release must include an uploaded `floradoc-release.json` asset. Its shape is defined by `src/schemas/release.schema.json`. The file includes the semantic version and matching `v` tag, stable/preview channel, date, Chinese and English notes and requirements, and each real package file's name, platform, architecture, format, download URL, byte size, and SHA-256. It can also include a public checksum-file URL.

Use filenames with ASCII letters, digits, dots, hyphens, and underscores. The release pipeline attaches `SHA256SUMS.txt`; the manifest itself is not included in the checksum list. The release repository must be public for the download site to serve anonymous asset links.

## Prepare a release

Create a temporary release spec JSON with this shape:

```json
{
  "version": "1.0.0",
  "channel": "stable",
  "releaseDate": "2026-11-03",
  "releaseNotes": {
    "zh-CN": ["真实的中文发行说明"],
    "en": ["Real release notes in English"]
  },
  "requirements": {
    "zh-CN": ["Windows x64；实际最低系统版本"],
    "en": ["Windows x64; state the verified minimum OS version"]
  },
  "installation": {
    "zh-CN": ["填写经过实际验证的安装步骤"],
    "en": ["List installation steps verified against the package"]
  },
  "assets": [
    {
      "name": "FloraDoc for Windows x64",
      "platform": "windows",
      "architecture": "x64",
      "format": "zip",
      "path": "../path/to/real-package.zip",
      "fileName": "FloraDoc-1.0.0-win-x64.zip"
    }
  ]
}
```

Use the exact real package paths and verified OS requirements. This example is a schema illustration only; it is not a published package or a release promise.

```powershell
npm run release:prepare -- --spec path\to\release-spec.json --out release-staging\1.0.0
npm run release:publish -- --staging release-staging\1.0.0
```

Preparation copies the provided files into a new staging directory, calculates byte sizes and SHA-256, writes a draft manifest and `SHA256SUMS.txt`, and refuses to overwrite an existing staging path. The publish command verifies those hashes and prints a dry run. It never creates a release unless `--apply` is supplied.

Release asset URLs in `floradoc-release.json` are constructed from the immutable version tag and filename. GitHub may return a temporary `untagged-*` URL while a draft has no tag ref; do not persist that draft-only URL into release metadata.

## Create and review a GitHub draft

Set these variables in the shell running the publisher:

- `FLORADOC_GITHUB_OWNER`: actual user or organization slug.
- `FLORADOC_GITHUB_TOKEN`: a short-lived or fine-grained token with Contents/Release write access to `floradoc-release`.

Then run:

```powershell
npm run release:publish -- --staging release-staging\1.0.0 --apply
```

The command creates a draft release only. It refuses to move an existing tag, modify a published release, or overwrite any existing release asset. If a draft already contains assets, inspect it in GitHub and resolve the partial upload manually. Review both languages, the real files, checksums, and platform requirements in GitHub; publish the draft there only after human review.

## Sync and verify

For a published release, the Cloudflare build syncs the GitHub Release list and validates each metadata record and referenced asset. Local manual sync is also available:

```powershell
npm run release:sync
npm run release:verify -- 1.0.0
```

Sync is idempotent and never removes prior website release history. API errors, missing metadata, mismatched tags/channels, URL/size inconsistencies, and duplicate versions stop the operation. Verification downloads each public package and recomputes its SHA-256.

The static endpoint `/downloads/latest.json` is built from the synced release snapshot. It selects the highest semantic version that has a Windows x64 installer and emits the updater contract (`schemaVersion`, `version`, `packageUrl`, `sha256`, and Chinese `releaseNotes`). The endpoint returns 404 until a qualifying release exists. Keep installer URLs HTTPS; the FloraDoc updater rejects non-HTTPS URLs and mismatched hashes.

To refresh Pages after the GitHub release is published, configure the Pages build hook as described in [Cloudflare Pages setup](cloudflare-pages.md). Do not put tokens or build-hook URLs in source files.
