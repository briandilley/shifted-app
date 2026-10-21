# Shifted

Shifted is a desktop app that keeps several Gmail accounts in one window, each with Gmail and Google Calendar, and you switch between accounts from a sidebar.

Read `docs/spec/PRODUCT.md`, `docs/spec/BUILD.md`, `docs/spec/DESIGN.md`, `docs/spec/GLOSSARY.md`, and the ADRs in `docs/spec/docs/adr/` before you change code.

## Rules for the build agent

- Never edit the files in `docs/spec/`. They are a copy of the spec repo.
- If the spec is silent about something, pick the simplest choice that fits the spec. Write the choice and the reason in `docs/decisions.md` in the code repo.
- If the spec conflicts with what you find, stop and ask the person. Example: Google changed a page, and a rule in the spec no longer works.
- Use the words of `docs/spec/GLOSSARY.md` in code, comments, and commit messages.
- End each phase with one git commit that names the phase, for example `Phase 03: unread badges`.

## npm commands

Use Node.js 22.12 or newer.

- `npm run dev`: starts Shifted in development mode.
- `npm run build`: runs the type check, then builds the main process, the preload scripts, and the renderer into `out/`.
- `npm run typecheck`: runs the TypeScript compiler with no output, for the main process, the renderer, and the tests.
- `npm test`: runs the Vitest unit tests in `test/unit/`.
- `npm run test:e2e`: builds the app, then runs the Playwright end-to-end tests in `test/e2e/`.

## Folder layout

```
src/main/                 main process
src/main/google-urls.ts   every Google URL, and nothing else
src/main/user-agent.ts    the user agent of Shifted
src/preload/              preload scripts
src/renderer/             the React screens of Shifted
src/renderer/strings.ts   every English text of the React screens
src/shared/               code that the main process and the renderer share
test/unit/                Vitest tests
test/e2e/                 Playwright tests
test/fake-google/         the fake Google test server
```

Other folders:

```
docs/spec/                read-only copy of the spec repo
docs/decisions.md         choices made where the spec is silent
build/                    build resources for electron-builder (icon)
resources/                files that ship with the app (window icon)
.github/workflows/        the tests on macOS, Windows, and Linux (GitHub Actions)
docs/security-review.md   the result of the security review of phase 09
docs/spec-trace.md        each rule of PRODUCT.md with its code and its test (phase 10)
docs/manual-tests.md      the one list of manual tests, with a Result column (phase 10)
README.md                 how to run, build, and sign in, and where the data is
```

## Test mode

- `SHIFTED_TEST_SERVER`: when set, every function in `src/main/google-urls.ts` returns a URL on that fake Google server.
- `SHIFTED_USER_DATA_DIR`: when set, Shifted uses that folder as its user data folder. Each end-to-end test sets its own.
- `SHIFTED_TEST_SLEEP_MS`: in test mode, the time from leaving a Google app to its sleep, in place of 5 minutes.
- `SHIFTED_TEST_READ_INTERVAL_MS`: in test mode, the time between two reads of the feed of an account, with no random delay.
