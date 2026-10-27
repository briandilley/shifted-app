# Shifted

Shifted is a desktop app that keeps several Gmail accounts in one window. Each account shows Gmail and Google Calendar with Google's own web pages, and you switch between the accounts from a sidebar.

An AI coding agent built this code from the prompts and the spec in [briandilley/shifted](https://github.com/briandilley/shifted). The section "The spec" at the end tells how the two repos connect.

## Download

The [releases page](https://github.com/briandilley/shifted-app/releases) has unsigned packages for macOS (Apple silicon and Intel), Windows, and Linux. The workflow `.github/workflows/build.yml` makes them for each tag that starts with `v`. The packages of other builds are in the artifacts of each run of that workflow.

## What you need

- Node.js 22.12 or newer. Node.js includes npm.
- git.
- A computer with macOS, Windows, or Linux.

## How to run it

1. Get the code:

   ```sh
   git clone https://github.com/briandilley/shifted-app.git
   cd shifted-app
   ```

2. Install the packages:

   ```sh
   npm install
   ```

3. Start Shifted:

   ```sh
   npm run dev
   ```

A window called "Shifted" opens. It shows "No accounts yet".

To run the tests, use `npm test` (unit tests) and `npm run test:e2e` (end-to-end tests). On Linux, run the end-to-end tests in a desktop session, or under `xvfb-run`.

## How to build it

Make an unsigned package for the computer that you use now. The command builds the app into the `out/` folder, then packages it:

```sh
npm run package
```

The package is in the `dist/` folder. `<arch>` is `arm64` or `x64`:

| Platform | Package                                                                   |
| -------- | ------------------------------------------------------------------------- |
| macOS    | `Shifted-<version>-mac-<arch>.dmg` and `Shifted-<version>-mac-<arch>.zip` |
| Windows  | `Shifted-<version>-win-x64.exe`                                           |
| Linux    | `Shifted-<version>-linux-x86_64.AppImage`                                 |

The package is not signed. Signed installers are not part of version 1.

- On macOS, the first start of a downloaded package shows a warning. Open System Settings, then Privacy & Security, and click "Open Anyway". If macOS says that the app is damaged, run `xattr -cr /Applications/Shifted.app` in Terminal, then open Shifted again.
- On Windows, SmartScreen can show a warning. Click "More info", then "Run anyway".
- On Linux, make the AppImage executable with `chmod +x`, then start it.

## How to sign in

1. Click the "+" button below the accounts in the sidebar ("Add account", Cmd+Shift+N).
2. A small sign-in window opens. It shows Google's own sign-in page.
3. Type your email address and follow Google's steps.
4. If Google asks for a passkey on macOS or Linux, click "Try another way". Then use your password and 2-Step Verification. Passkeys do not work in Shifted on macOS and Linux.
5. On Windows, a passkey request opens the Windows Hello dialog.
6. If your company uses its own sign-in page, for example Okta or Microsoft Entra ID, that page shows in the sign-in window too.
7. When Gmail loads, the sign-in window closes, and Gmail shows in the main window. Calendar uses the same sign-in.

Shifted shows its own new-mail notifications. In Gmail, keep `Settings` > `Desktop notifications` for new mail off. If it is on, you get two notifications for each message.

## Find text in a page

Press Cmd+F on macOS or Ctrl+F on Windows and Linux. The Edit menu also has "Find in page…".
Type text to find it in the visible Gmail or Calendar page, including an open email.
A child window searches its own page. Find searches only text that the page loaded.

Press Enter for the next match or Shift+Enter for the previous match. The arrow buttons do the same.
Press Escape to close the bar and return to the page. An account change or a tab change closes the bar.

## Known limits

- Passkeys do not work on macOS and Linux. When Google asks for a passkey, click "Try another way".
- Google can change its sign-in rules or remove the Atom feed at any time. The unread badges and the new-mail notifications come from the Atom feed.
- Links to Google Docs and Drive open in the default browser, which can be signed in as another account.
- Chrome extensions do not run in Shifted.
- On Windows and Linux, Ctrl+, opens the configuration window (`Settings`). Gmail also uses Ctrl+, for "Advance to previous chat or compose", so this Gmail key does not work in Shifted. This was a choice of the person who owns the spec. On macOS, Shifted uses Cmd+, and takes no key from Gmail.

## Where Shifted keeps its data

Shifted keeps all its data in one folder:

| Platform | Folder                                                                       |
| -------- | ---------------------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/Shifted`                                      |
| Windows  | `%APPDATA%\Shifted`                                                          |
| Linux    | `~/.config/Shifted`. If `XDG_CONFIG_HOME` is set: `$XDG_CONFIG_HOME/Shifted` |

The folder has:

- `config.json`: the account list and the configuration.
- `window-state.json`: the size and position of the main window.
- `photos/`: the saved profile photos.
- `Partitions/`: the sessions of the accounts, with their cookies. These are your sign-ins.
- Other files that Electron and Chromium make, for example caches.

To delete the data of Shifted:

1. If "Open at login" is on, turn it off in the configuration window. On Linux, this removes `~/.config/autostart/shifted.desktop`.
2. Quit Shifted: Cmd+Q on macOS, or Quit in the tray menu on Windows and Linux. Closing the main window does not quit Shifted.
3. Delete the folder.
4. If Shifted is the default email app, choose another default email app in the operating system.

## The spec

Shifted is built from a spec: https://github.com/briandilley/shifted

That repo holds no application code. It holds the product spec, the design, and a series of prompts. An AI coding agent ran `prompts/build-all.md` of that repo, one phase prompt after the other, to write this code. `docs/build-progress.md` lists each phase with its commit.

The folder `docs/spec/` is a read-only copy of it. `docs/decisions.md` lists the choices that the build made where the spec is silent. `docs/spec-trace.md` connects each rule of the spec to its code and its test. `docs/manual-tests.md` is the list of manual tests.
