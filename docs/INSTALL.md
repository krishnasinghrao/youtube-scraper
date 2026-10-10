# Installation Guide

Scraper's first production-ready release is macOS-first. Windows and Linux builds may be produced by CI for contributor testing, but they are experimental until validated and signed.

## Supported Platform

- macOS 13 or newer is the supported target for the first public release.
- Windows and Linux support is not guaranteed for end users yet.

## Runtime Dependencies

Scraper uses external command-line tools:

- `yt-dlp` is required to fetch metadata and download videos.
- `ffmpeg` is required when a selected format needs audio/video merging.

The app can use dependencies installed in a user-selected dependency folder, or tools already available on the system path.

## Install Dependencies on macOS

Using Homebrew:

```bash
brew install yt-dlp ffmpeg
```

Verify the tools are available:

```bash
yt-dlp --version
ffmpeg -version
```

## Run from Source

```bash
git clone https://github.com/krishnasinghrao/Scraper.git
cd Scraper
npm install
npm start
```

## Unsigned macOS Builds

Until the project has signing and notarization configured, GitHub release builds should be treated as unsigned test artifacts. macOS may block the first launch. Review the source, download only from the official repository, and approve the app manually in System Settings only if you trust the build.

## Troubleshooting

- If metadata fetches fail, update `yt-dlp`.
- If combined video/audio downloads fail, install or update `ffmpeg`.
- If downloads cannot start, confirm the selected output folder is writable.
- If the app cannot find dependencies, use the in-app dependency folder flow or install the tools through Homebrew.
