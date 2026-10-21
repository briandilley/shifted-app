# Prompt 00: Bootstrap

You are a coding agent. You will build Shifted, a desktop app that keeps several Gmail accounts in one window. This prompt is the first of a series. It sets up the code repo. It does not build any feature.

With this prompt, you also got the path of the spec repo, from the person or from `build-all.md`. The spec repo is a clone of `https://github.com/briandilley/shifted`. In this prompt, `<spec>` means that path. If you do not have the path, clone `https://github.com/briandilley/shifted.git` into a new temporary folder outside the current folder, and use that folder.

The current folder is the code repo. It is empty, or it has only a `.git` folder.

## Goal

At the end of this phase, the code repo has the spec and an `AGENTS.md`. It also has an Electron app that opens one empty window called "Shifted". The unit tests and the end-to-end tests run and pass.

## Read first

1. `<spec>/README.md`
2. `<spec>/PRODUCT.md`
3. `<spec>/BUILD.md`
4. `<spec>/DESIGN.md`
5. `<spec>/GLOSSARY.md`
6. All files in `<spec>/docs/adr/`

## Scope

### 1. Copy the spec

1. Make the folder `docs/spec/` in the code repo.
2. Copy these items from `<spec>` into `docs/spec/`: `PRODUCT.md`, `BUILD.md`, `DESIGN.md`, `GLOSSARY.md`, `PRIOR-ART.md`, the folder `docs/adr/`, and the folder `prompts/`.
3. Keep the same names. For example, `<spec>/docs/adr/0001-wrap-gmail-web-interface.md` goes to `docs/spec/docs/adr/0001-wrap-gmail-web-interface.md`.
4. Do not change the copied files. From now on, they are read-only.
5. Make an empty `docs/decisions.md` with the title "Decisions made during the build".
6. Copy `<spec>/assets/icon.png` to `build/icon.png` and to `resources/icon.png`. Copy `<spec>/assets/icon.svg` to `build/icon.svg`.

### 2. Write the agent files

1. Write `AGENTS.md` at the root of the code repo. Put these items in it:
   - One sentence that says what Shifted is.
   - "Read `docs/spec/PRODUCT.md`, `docs/spec/BUILD.md`, `docs/spec/DESIGN.md`, `docs/spec/GLOSSARY.md`, and the ADRs in `docs/spec/docs/adr/` before you change code."
   - The section "Rules for the build agent" from `docs/spec/BUILD.md`, copied word for word.
   - The npm commands from step 5 below, with one line each about what they do.
   - The folder layout from step 4 below.
2. Write `CLAUDE.md` with one line: `@AGENTS.md`.

### 3. Make the Electron app

1. Use Node.js 22.12 or newer. Electron needs it.
2. Find the latest stable Electron version with `npm view electron version`. Use that version.
3. Use electron-vite with React and TypeScript. The template `react-ts` of `npm create @quick-start/electron@latest` gives the right layout. If the template does not fit the current folder, make the project in a temporary folder and move the files.
4. Set `productName` to the name in `docs/spec/PRODUCT.md`, section "Name". Set the app ID to the bundle identifier from the same section.
5. Add electron-builder as a dev dependency with a minimal configuration. Installers come in a later prompt.
6. Make TypeScript strict.

### 4. Folder layout

Use this layout. Later prompts add files to it.

```
src/main/                 main process
src/main/google-urls.ts   every Google URL, and nothing else
src/main/user-agent.ts    the user agent of Shifted
src/preload/              preload scripts
src/renderer/             the React screens of Shifted
src/shared/               code that the main process and the renderer share
test/unit/                Vitest tests
test/e2e/                 Playwright tests
test/fake-google/         the fake Google test server
```

### 5. npm commands

Make these commands work:

- `npm run dev`: starts Shifted in development mode.
- `npm run build`: builds the app.
- `npm run typecheck`: runs the TypeScript compiler with no output.
- `npm test`: runs the Vitest unit tests.
- `npm run test:e2e`: builds the app, then runs the Playwright end-to-end tests.

### 6. The Google URL module

1. Write `src/main/google-urls.ts`. It exports a function for each Google URL that Shifted uses. For this phase, export: the Gmail URL, the Calendar URL, the Google sign-in URL, and the Atom feed URL for a label.
2. Use these real values:
   - Gmail: `https://mail.google.com/mail/u/0/`
   - Calendar: `https://calendar.google.com/calendar/u/0/r`
   - Sign-in: `https://accounts.google.com/ServiceLogin?service=mail&continue=https://mail.google.com/mail/u/0/`
   - Feed: `https://mail.google.com/mail/u/0/feed/atom/<label>`, where `<label>` is empty for the whole inbox.
3. If the environment variable `SHIFTED_TEST_SERVER` is set, every function returns a URL on that server in place of the Google URL. Example: `SHIFTED_TEST_SERVER=http://127.0.0.1:4555` makes the Gmail URL `http://127.0.0.1:4555/gmail/`.
4. Only `google-urls.ts` contains Google host names. Add a unit test that searches `src/`. If it finds `google.com` in any other file, the test fails.

### 7. The user agent

1. Read `docs/spec/docs/adr/0004-honest-user-agent-for-sign-in.md`.
2. Write `src/main/user-agent.ts`. It makes the user agent of Shifted: the default Electron user agent, with the app token `Shifted/<version>` and the `Electron/<version>` token kept.
3. Set it with `app.userAgentFallback` before any window opens.
4. Add a unit test. If the user agent has no `Electron/` token or no `Shifted/` token, the test fails.

### 8. The main window

1. Open one main window with the title "Shifted", about 1200 by 800 points.
2. Write the color tokens of `docs/spec/DESIGN.md` into `src/renderer/theme.css`, with a light set and a dark set. Write the table of account colors and backdrops into `src/shared/account-colors.ts`.
3. Use the window frame of `DESIGN.md`, section "Window frame on each platform". Set the background color of the window to `--base`.
4. Show the frame view of `DESIGN.md`, with an empty content area that says "No accounts yet". Follow the light or dark mode of the operating system.
5. Apply the "Security" section of `docs/spec/BUILD.md` to this window.
6. Use `resources/icon.png` as the window icon on Windows and Linux. In development mode on macOS, set the Dock icon with `app.dock.setIcon`.

### 9. The fake Google test server

1. Write a small HTTP server in `test/fake-google/`. Use Node's `http` module. It starts on a free port and returns its URL.
2. For now, it serves:
   - `/gmail/`: an HTML page with the title `Inbox (0) - test@example.com - Gmail`.
   - `/calendar/`: an HTML page with the title `Calendar`.
   - `/signin`: an HTML page with a "Sign in" button. The button sets a cookie and goes to `/gmail/`.
   - `/feed/atom/`: an Atom XML document with `<title>Gmail - Inbox for test@example.com</title>` and `<fullcount>0</fullcount>`.
3. Later prompts add control routes to this server. Keep the code easy to extend.

### 10. Tests

1. Set up Vitest for `test/unit/`.
2. Set up Playwright for Electron for `test/e2e/`. The tests start the built app with `_electron.launch` and set `SHIFTED_TEST_SERVER` to the fake server.
3. Give each end-to-end test its own temporary user data folder, so that tests never share state.

### 11. Git

1. If the folder is not a git repo, run `git init`.
2. Add a `.gitignore` for `node_modules/`, `out/`, `dist/`, and test output.
3. Commit everything with the message `Phase 00: bootstrap`.

## Out of scope

- Accounts, sessions, and sign-in. Prompt 01 adds them.
- The sidebar and the tab bar. Prompt 02 adds them.
- Installers and code signing. Prompt 10 adds them.

## Automated tests

- Unit: the user agent keeps the `Electron/` and `Shifted/` tokens.
- Unit: no Google host name in `src/` outside `google-urls.ts`.
- Unit: with `SHIFTED_TEST_SERVER` set, each URL function returns a URL on the test server.
- End-to-end: Shifted starts, the window title is "Shifted", and the page shows "No accounts yet".

## Manual tests

1. Run `npm install`. It finishes with no error.
2. Run `npm run dev`. A window called "Shifted" opens and shows "No accounts yet".
3. Run `npm test` and `npm run test:e2e`. Both pass.
4. Open `docs/spec/`. Make sure that it has `PRODUCT.md`, `BUILD.md`, `DESIGN.md`, `GLOSSARY.md`, `PRIOR-ART.md`, `docs/adr/`, and `prompts/`.
5. Make sure that the window or the Dock shows the Shifted icon: three shifted mail cards with a red dot.
6. Switch the operating system between light mode and dark mode. Make sure that the window follows at once.
7. Open `AGENTS.md`. Make sure that it has the rules for the build agent and the npm commands.

## When you finish

Tell the person which manual tests to do. List any choice that you wrote in `docs/decisions.md`.
