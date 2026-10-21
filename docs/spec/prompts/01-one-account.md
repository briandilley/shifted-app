# Prompt 01: One account

You are a coding agent. You continue the build of Shifted in this repo. Read `AGENTS.md` first and follow its rules.

## Goal

At the end of this phase, you can add one account. You sign in to Google in a sign-in window, and Gmail of that account then shows in the main window. The account stays signed in after Shifted restarts. You can also remove the account.

## Read first

1. `AGENTS.md`
2. `docs/spec/PRODUCT.md`, sections "Supported accounts", "Accounts and sessions", "Sign-in", and "Links" (rule 3).
3. `docs/spec/docs/adr/0002-isolated-session-per-account.md`
4. `docs/spec/docs/adr/0004-honest-user-agent-for-sign-in.md`
5. `docs/spec/GLOSSARY.md`

## Scope

### 1. The configuration file

1. Write a module that reads and writes the configuration file `config.json` in `app.getPath('userData')`.
2. Give the file a `version` number, so that a later prompt can change the format.
3. Write the file atomically: write a temporary file, then rename it.
4. Store a list of accounts. Each account has these fields:
   - `id`: a UUID.
   - `email`: empty at first. Step 4.3 fills it from the feed.
   - `nickname`: empty at first.
   - `color` and `order`.
   - `lastGoogleApp`: `gmail` for now.
5. If the file is missing or broken, start with an empty list and keep a copy of the broken file as `config.broken.json`.

### 2. One session per account

1. Each account uses the partition `persist:account-<id>`.
2. Set the user agent from `src/main/user-agent.ts` on each session.
3. Never share a session between two accounts.

### 3. The sign-in window

1. Add a temporary "Add account" button to the main window. Prompt 02 replaces it with the sidebar.
2. When you click it, Shifted makes a new account and opens the sign-in window for it.
3. The sign-in window is a separate window of about 480 by 720 points. It has two parts:
   - A top line from Shifted, rendered by React: "Passkeys do not work in Shifted on this computer. If Google asks for a passkey, click "Try another way" and use your password." On Windows, show: "If Google asks for a passkey, Windows Hello opens."
   - Below the top line, a `WebContentsView` with the session of the account. It loads the sign-in URL from `google-urls.ts`.
4. In the sign-in window, every page stays in the sign-in window. This includes company identity provider pages, for example Okta. Do not open the default browser from the sign-in window.
5. While the sign-in window is open, the main window shows "Signing in…" for that account.
6. When the sign-in window reaches Gmail (`https://mail.google.com/mail/u/`), close it. Then show Gmail of that account in the main window.
7. If you close the sign-in window before sign-in ends, and the account has never signed in, remove the account and delete its session.

### 4. Gmail in the main window

1. Show Gmail of the account in a `WebContentsView` in the main window. Use the session of the account.
2. Apply the "Security" section of `docs/spec/BUILD.md` to this view.
3. After Gmail loads, read the Atom feed of the whole inbox with `session.fetch` and the session of the account. Take the email address from the feed title, `Gmail - Inbox for <address>`. Save it in the configuration.

### 5. The signed-out state

1. If the Gmail view of an account tries to go to `accounts.google.com`, stop the navigation. Do not show Google's sign-in page in the main window.
2. In its place, show a React panel: "This account is signed out." and a "Sign in again" button.
3. The button opens the sign-in window for the same account and the same session.

### 6. Restart

1. When Shifted starts, read the configuration and load Gmail of the account.
2. The account is still signed in, because its session is persistent.

### 7. Remove

1. Add a temporary "Remove account" button. Prompt 02 moves it into the context menu.
2. Ask the person to confirm.
3. Close the views of the account. Call `clearStorageData()` on its session. Delete the partition folder of the session from disk. Remove the account from the configuration.

### 8. The fake Google test server

Add to `test/fake-google/`:

- A sign-in flow that sets a session cookie for the fake host and goes to `/gmail/`.
- If the cookie is missing, `/gmail/` returns a redirect to `/signin`. A test uses this for the signed-out state.
- A control route that clears the cookie of the fake host, so that a test can sign an account out.

## Out of scope

- More than one account in the user interface. Prompt 02 adds the sidebar.
- Calendar and the tab bar. Prompt 02 adds them.
- Link rules for Gmail. Prompt 03 adds them.

## Automated tests

- Unit: the configuration module reads, writes, and recovers from a broken file.
- Unit: the function that decides "sign-in finished" returns true only for Gmail URLs.
- Unit: the feed title parser returns the address, and returns nothing for a wrong title.
- End-to-end: add an account, sign in on the fake sign-in page, the sign-in window closes, and the main window shows the fake Gmail.
- End-to-end: restart Shifted with the same user data folder. The account shows the fake Gmail with no sign-in.
- End-to-end: clear the fake cookie. The main window shows "This account is signed out." "Sign in again" opens the sign-in window.
- End-to-end: remove the account. Its partition folder no longer exists.

## Manual tests

1. Run `npm run dev`. Click "Add account". The sign-in window opens with the top line.
2. Sign in with a personal Gmail account. If Google asks for a passkey on macOS or Linux, click "Try another way" and use your password and 2-Step Verification.
3. Make sure that the sign-in window closes and that Gmail shows in the main window.
4. Quit Shifted and start it again. Make sure that Gmail shows with no sign-in.
5. Remove the account. Add a Google Workspace account. Make sure that it signs in.
6. If you have a Workspace account that uses a company sign-in page, add it too. Make sure that the company page shows in the sign-in window.

## When you finish

Commit with the message `Phase 01: one account`. Tell the person which manual tests to do. List any choice that you wrote in `docs/decisions.md`.
