# Contributing

Thanks for helping improve Scraper. Contributions should keep the app secure, focused, and accurate for the currently supported macOS-first release.

## Before You Start

- Search existing issues and pull requests.
- Keep changes scoped to one bug, feature, or documentation update.
- For user-facing behavior, update the relevant documentation.
- For security-sensitive changes, explain the threat model in the pull request.

## Development Setup

```bash
git clone https://github.com/krishnasinghrao/Scraper.git
cd Scraper
npm install
npm start
```

Run the full quality gate:

```bash
npm run check
```

## Pull Requests

Pull requests should include:

- A clear description of the change and why it is needed.
- Linked issues when applicable.
- Tests for behavior changes.
- Manual test notes for Electron UI or packaging changes.
- Documentation updates when commands, supported platforms, security posture, or release behavior changes.

## Security Expectations

Scraper handles URLs, file paths, external downloads, and command execution. Preserve these rules:

- Validate IPC input in both preload and main process boundaries.
- Launch external tools with argument arrays, not shell strings.
- Keep renderer Node.js integration disabled.
- Avoid adding remote content to the renderer unless there is a reviewed security reason.
- Do not weaken output-path, URL, redirect, size, or timeout checks.

## Platform Policy

macOS is the supported first-release platform. Windows and Linux build scripts are experimental and should not be documented as supported unless they have been tested, signed where appropriate, and added to the release checklist.

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
