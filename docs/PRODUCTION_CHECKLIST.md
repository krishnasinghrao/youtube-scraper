# Production Release Checklist

Use this checklist before tagging a release or publishing GitHub artifacts.

## Required For Every Release

- Confirm `package.json` version is correct.
- Update `CHANGELOG.md` with user-facing changes.
- Run `npm run check`.
- Run `npm audit --omit=dev --audit-level=moderate`.
- Confirm `README.md`, `docs/INSTALL.md`, and `docs/BUILD.md` describe the actual supported platforms.
- Confirm generated files are not staged: `dist/`, `node_modules/`, logs, caches, `.env` files, and OS metadata.
- Review dependency and packaging changes for license and security impact.

## First Public Release Policy

- Supported platform: macOS.
- License: MIT.
- Release type: unsigned draft GitHub release.
- Windows and Linux artifacts: experimental contributor artifacts only, not supported end-user releases.

## macOS Build

```bash
npm ci
npm run check
npm run build:mac
```

Expected output: macOS DMG and ZIP artifacts in `dist/`.

## Manual macOS Smoke Test

- Launch the app.
- Confirm dependency detection reports `yt-dlp` and `ffmpeg` accurately.
- Fetch metadata for a public YouTube URL.
- Select an output folder.
- Download a thumbnail.
- Download a video format.
- Download a merged audio/video format when `ffmpeg` is available.
- Cancel an active download and confirm the UI recovers.
- Confirm user-facing errors are clear for invalid URLs, missing dependencies, and non-writable folders.

## Draft GitHub Release

- Create a draft release from the version tag.
- Attach the macOS DMG and ZIP artifacts.
- Mark artifacts as unsigned.
- Include the supported platform statement.
- Include the legal notice that users are responsible for complying with site terms, copyright law, and local regulations.
- Do not promote Windows or Linux artifacts as supported until they pass platform-specific release validation.

## Signing Before Stable Binary Promotion

Before advertising stable public binaries, configure and document:

- macOS Developer ID signing.
- macOS notarization.
- Windows code signing if Windows support becomes official.
- Release verification instructions such as checksums.
