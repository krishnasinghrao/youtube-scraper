# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Added
- Strongly typed `VideoInfo`, `VideoFormat`, and `DependencyStatus` interfaces in TypeScript definitions.
- Comprehensive unit test coverage for directory validation, external URL verification, candidate path resolution, archive handling, and error formatting.
- Graceful download cancellation handling and process termination on application quit.

### Changed
- Refactored output directory validation into reusable `validateWritableDirectory` helper.
- Hardened file download and dependency extraction with cross-platform support and atomic cleanup.
- Scoped CSS transitions to interactive elements for smoother rendering performance.
- Upgraded `electron-builder` and updated dependencies to resolve known vulnerabilities.
- Clarified macOS-first release support and experimental Windows/Linux packaging status.
- Expanded open-source documentation, security policy, contribution guidance, and production release checklist.
- Aligned project branding, MIT licensing language, and release readiness guidance.

## [1.0.0] - 2026-05-14
### Added
- Initial stable release.
- Support for fetching metadata and choosing file formats using `yt-dlp`.
- Supported macOS release packaging.
- Download progress tracking.
- MIT License.
