# Prompt 09: Hardening

You are a coding agent. You continue the build of Shifted in this repo. Read `AGENTS.md` first and follow its rules.

## Goal

At the end of this phase, Shifted meets every rule of the "Security" section. It handles crashes and offline time, and it works with a keyboard and a screen reader. It runs on macOS, Windows, and Linux.

## Read first

1. `AGENTS.md`
2. `docs/spec/BUILD.md`, section "Security".
3. `docs/spec/PRODUCT.md`, sections "Failure states", "Shifted's own screens", and "Privacy and network".
4. `docs/spec/DESIGN.md`, sections "Contrast" and "Motion".
5. `docs/spec/GLOSSARY.md`

## Scope

### 1. Security review

1. Go through each rule of the "Security" section. For each rule, find the code that applies it. Fix each gap.
2. Lock the Electron fuses with the `electronFuses` option of electron-builder, or with `@electron/fuses` in an `afterPack` step.
3. Handle the `certificate-error` event of the app. Never call its callback with `true`.
4. Make sure that no remote debugging port opens in a production build.
5. Search the code for `nodeIntegration: true`, `contextIsolation: false`, `sandbox: false`, and `webSecurity: false`. Remove each one that you find.
6. Treat the import of prompt 08 as untrusted input. Make sure that it has the size limit, that it checks each value, and that it takes no file path or URL from the import.
7. Write the result of the review as a table in `docs/security-review.md`: rule, file, and status.

### 2. Crashes

1. Handle `render-process-gone` on every web view.
2. Show a React panel in the content area: "This page stopped." and a "Reload" button.
3. If the same Google app crashes 3 times in 5 minutes, stop reloading it on its own. Wait for the button.

### 3. Offline

1. If the feed fails because the computer is offline, use the warning mark of prompt 04.
2. When the network comes back, read every feed at once. Listen to the `online` event of the main window renderer, or poll `net.isOnline()`.

### 4. Accessibility

1. Every button in the sidebar has an accessible name: the account name and the unread count, for example "work@company.com, 3 unread".
2. The tab bar uses the `tablist` and `tab` roles.
3. You can move through the sidebar with the arrow keys and pick an account with Enter.
4. Every field of the configuration window has a label.
5. Add a unit test that computes the contrast of `--text` and `--text-secondary` on `--surface` and on all 16 backdrops of `DESIGN.md`. Each value must be at least 4.5 to 1.

### 5. Language, theme, and spell check

1. Put every English string of the Shifted screens in one module, `src/renderer/strings.ts`.
2. Follow the light or dark mode of the operating system with `prefers-color-scheme` in CSS and `nativeTheme` in the main process. With reduced motion on, nothing moves.
3. On Windows and Linux, set the spell check languages of each session from `app.getPreferredSystemLanguages()`. On macOS, the operating system checks spelling.

### 6. Memory

1. Add a menu item "Memory use" to the Help menu. It shows a small table from `app.getAppMetrics()`: each account, each Google app, and its memory.
2. With 3 accounts, measure the total memory for each value of "Background loading". Write the numbers in `docs/decisions.md`.

### 7. Three platforms

1. Run `npm test` and `npm run test:e2e` on macOS, Windows, and Linux. Use GitHub Actions with a matrix of the three platforms. On Linux, run the end-to-end tests under `xvfb-run`.
2. Fix each failure that only one platform shows.

## Out of scope

- Signed installers. Prompt 11 adds them.

## Automated tests

- Unit: a test reads every `webPreferences` object in `src/` and fails on an unsafe value.
- End-to-end: crash a fake page with `process.crash()` from a test hook. The "This page stopped." panel shows, and "Reload" works.
- End-to-end: the sidebar buttons have the accessible names of step 4.
- The GitHub Actions workflow passes on all three platforms.

## Manual tests

1. Open `docs/security-review.md`. Make sure that every rule has the status "done".
2. Turn off the network for 2 minutes and turn it on again. Make sure that the badges come back without a restart.
3. Switch the operating system between light mode and dark mode. Make sure that the Shifted screens follow.
4. Use only the keyboard to select an account, switch the tab, and open the configuration window.
5. If you have a second computer with another operating system, run `npm install` and `npm run dev` on it. Make sure that sign-in, badges, and notifications work.

## When you finish

Commit with the message `Phase 09: hardening`. Tell the person which manual tests to do. List any choice that you wrote in `docs/decisions.md`.
