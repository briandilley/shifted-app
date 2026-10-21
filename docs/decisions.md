# Decisions made during the build

## Phase 00: bootstrap

- **App version 0.1.0.** The spec gives no version. Nothing is released yet, so the version starts below 1.0. The user agent token is `Shifted/0.1.0`.
- **User agent token placement.** Electron puts its own app token (`shifted/<version>` or `Shifted/<version>`) in the default user agent. `src/main/user-agent.ts` removes that token and puts `Shifted/<version>` right before `Chrome/`, where Electron puts its app token. All other tokens, including `Electron/<version>`, stay as Electron made them. If the default user agent has no `Electron/` token, the function throws, so a dishonest user agent cannot ship by mistake.
- **Test server paths.** The spec gives only the Gmail example (`<server>/gmail/`). The other URL functions use the paths of the fake server: Calendar `<server>/calendar/`, sign-in `<server>/signin`, and feed `<server>/feed/atom/<label>`.
- **Feed labels are already in URL form.** `feedUrl(label)` adds the label as it is, for example `%5Esq_ig_i_personal`. Prompt 04 gives the labels in that form.
- **User data folder for tests.** Each end-to-end test sets the environment variable `SHIFTED_USER_DATA_DIR` to its own new temporary folder. The main process calls `app.setPath('userData', ...)` with it before anything else. This is the simplest way to give each test its own state.
- **Fake sign-in button.** The "Sign in" button of the fake `/signin` page is a form that posts to `/signin`. The server answers with a `Set-Cookie` header (`FAKE_SID`) and a redirect to `/gmail/`. The fake page needs no script.
- **Content Security Policy in development.** The production page uses a strict policy with no `'unsafe-inline'`. The Vite development server adds styles with `<style>` tags. It also uses a WebSocket for hot reload. So, in development only, a small Vite plugin adds `'unsafe-inline'` to `style-src` and `ws://localhost:*` to `connect-src`.
- **Preload script.** The template's `@electron-toolkit/preload` gave the page the whole `ipcRenderer`. It is removed. The preload script gives the page one empty, frozen object, `window.shifted`. Later prompts add functions to it.
- **Main window navigation.** Prompt 03 adds the link rules. Until then, the screens of Shifted open no new window. They also do not go away from their own page. Shifted always refuses a certificate error.
- **Strict TypeScript.** The shared base configuration from `@electron-toolkit/tsconfig` turns `noImplicitAny` off. Each project configuration sets `strict: true` and `noImplicitAny: true` again. `npm run typecheck` also checks the tests, with `tsconfig.test.json`.
- **Minimal electron-builder configuration.** `electron-builder.yml` has the app ID, the product name, the icon folder `build/`, and an AppImage target for Linux. The template's snap and deb targets, its placeholder update URL, and its prebuilt `.icns` and `.ico` files are removed. electron-builder makes the icon files from `build/icon.png`. Prompt 10 adds installers.
- **Prettier and ESLint ignore `docs/spec/`.** The spec copy is read-only, so a formatter must not change it. The React lint rules apply only to `src/renderer/`, because Playwright fixtures also use a function named `use`.
- **End-to-end tests run one at a time** (`workers: 1`), because each test starts its own Shifted.
