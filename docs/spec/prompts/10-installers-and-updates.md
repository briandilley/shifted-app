# Prompt 10 (optional): Installers and updates

You are a coding agent. You add signed installers and auto-update to Shifted in this repo. Read `AGENTS.md` first and follow its rules.

This prompt is optional. If you want to give Shifted to other people as an installer, use it.

## Before you start

The person needs these items. Ask for each one that is missing, and stop until you have it. Never write a password, a key, or a certificate into the repo.

- For macOS: an Apple Developer account, a "Developer ID Application" certificate in the keychain, the Apple team ID, and an app-specific password for notarization.
- For Windows: a code-signing certificate, or an Azure Trusted Signing account.
- For updates: a GitHub repo for the code, where the releases will go.

## Goal

At the end of this phase, a git tag builds signed installers for macOS, Windows, and Linux, and publishes them as a GitHub release. An installed Shifted finds the new release and offers to restart into it.

## Read first

1. `AGENTS.md`
2. `docs/spec/PRODUCT.md`, sections "Distribution" and "Privacy and network".
3. `docs/spec/BUILD.md`

## Scope

### 1. Installers

1. macOS: a `dmg` and a `zip`, for Apple silicon and Intel.
2. Windows: an NSIS installer.
3. Linux: an AppImage and a `deb`.
4. Use the app ID and the name from `docs/spec/PRODUCT.md`, section "Name".

### 2. macOS signing

1. Turn on the hardened runtime.
2. Use entitlements for Electron: `com.apple.security.cs.allow-jit`, `com.apple.security.device.camera`, and `com.apple.security.device.audio-input`.
3. Notarize with `notarytool`. Read `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` from the environment.

### 3. Windows signing

Sign the installer and the app with the certificate or with Azure Trusted Signing. Read the secrets from the environment.

### 4. Auto-update

1. Use `electron-updater` with the GitHub provider.
2. Check for an update 1 minute after start, then every 6 hours.
3. When an update is ready, add "Restart to update" to the app menu and the tray menu. Never restart on your own.
4. The update check is the only network traffic that is not Google. Do not send any other data.
5. AppImage updates itself. A `deb` does not. For a `deb`, show "A new version is available" with a link to the release page.

### 5. Release workflow

1. Write a GitHub Actions workflow that runs on a tag `v*`.
2. It builds on macOS, Windows, and Linux, signs, notarizes, and uploads to a draft GitHub release.
3. Read every secret from GitHub Actions secrets. List the names of the secrets in the README.

## Out of scope

- The Mac App Store and the Microsoft Store.

## Automated tests

- The release workflow runs on a test tag and makes a draft release with all files.

## Manual tests

1. Install the macOS build on a Mac that never ran Shifted. Make sure that macOS opens it with no warning.
2. Install the Windows build. Make sure that Windows shows your name as the publisher.
3. Install the AppImage on Linux and run it.
4. Publish a release `v1.0.1`. Make sure that an installed `v1.0.0` offers "Restart to update" within 6 hours, or at the next start.

## When you finish

Commit with the message `Phase 10: installers and updates`. Tell the person which manual tests to do.
