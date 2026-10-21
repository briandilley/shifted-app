# Prompt 06: mailto links

You are a coding agent. You continue the build of Shifted in this repo. Read `AGENTS.md` first and follow its rules.

## Goal

At the end of this phase, Shifted can be the default email app. A `mailto:` link from another app shows the account picker, and then a new message opens in Gmail of the chosen account.

## Read first

1. `AGENTS.md`
2. `docs/spec/PRODUCT.md`, sections "mailto: links" and "Configuration".
3. `docs/spec/GLOSSARY.md`

## Scope

### 1. Receive the link

1. Call `app.requestSingleInstanceLock()`. If a second copy of Shifted starts, it gives its command line to the first copy and quits.
2. On macOS, handle the `open-url` event. Register the handler before the `ready` event, so that a link that starts Shifted is not lost.
3. On Windows and Linux, read the link from `process.argv` at startup and from the `second-instance` event.
4. If Shifted has no accounts, show the main window and the text "Add an account first".

### 2. The account picker

1. The account picker is a small window in front of the main window. It lists the accounts with their avatar, nickname, and address.
2. The top line shows the address from the link, for example "New message to bob@example.com".
3. The account that you used last for a `mailto:` link is selected. Enter picks the selected account. Escape closes the picker.
4. The picker has an "Always use this account" box. If it is selected, save the account as the `mailto:` default.
5. If a `mailto:` default exists, skip the picker.
6. Add "Clear the always-use account" to the General page of the configuration window.

### 3. The new message

1. Select the chosen account in the main window and show its Gmail tab.
2. If Gmail of that account is asleep or not loaded, load it.
3. Load the compose URL from `google-urls.ts` with the whole `mailto:` link: `https://mail.google.com/mail/u/0/?extsrc=mailto&url=<encoded mailto URL>`.
4. A `mailto:` link inside Gmail or Calendar of an account uses that account with no picker. Prompt 03 already routes it.

### 4. The default email app

1. Add the button "Make Shifted the default email app" to the General page of the configuration window.
2. On macOS, call `app.setAsDefaultProtocolClient('mailto')`.
3. On Linux, call `app.setAsDefaultProtocolClient('mailto')`. If that does not work on the desktop, run `xdg-settings set default-url-scheme-handler mailto <desktop file>`.
4. On Windows, register the protocol with `app.setAsDefaultProtocolClient('mailto')`. Then open `ms-settings:defaultapps`, where the person picks Shifted.
5. Show next to the button whether Shifted is the default now. Use `app.isDefaultProtocolClient('mailto')`.
6. Add `mailto` to the `protocols` of the electron-builder configuration.

### 5. A parser for display

Write a pure function that reads a `mailto:` link into `to`, `cc`, `bcc`, `subject`, and `body`, as RFC 6068 describes. Use it only for the top line of the picker. Always give Gmail the whole link.

### 6. The fake Google test server

Make the fake Gmail page show the `url` parameter that it received, so that a test can read it.

## Out of scope

- Any other protocol, for example `webcal:`.

## Automated tests

- Unit: the parser reads addresses, several addresses, `cc`, `bcc`, `subject`, `body`, and encoded characters.
- Unit: the choice between picker, saved default, and "no accounts" is right for each case.
- End-to-end: send a `mailto:` link through the `second-instance` path. The picker shows. Pick account 2. The fake Gmail of account 2 shows the link.
- End-to-end: select "Always use this account". A second link skips the picker.

## Manual tests

1. Open the configuration window. Click "Make Shifted the default email app". On Windows, pick Shifted on the page that opens.
2. From a terminal, open a `mailto:` link. On macOS, run `open "mailto:test@example.com?subject=Hello"`. On Windows, run `start mailto:test@example.com`. On Linux, run `xdg-open "mailto:test@example.com"`.
3. Make sure that the account picker shows the address. Pick an account.
4. Make sure that a new message opens in Gmail of that account, with the address and the subject filled in.
5. Quit Shifted. Open a `mailto:` link again. Make sure that Shifted starts and shows the picker.

## When you finish

Commit with the message `Phase 06: mailto links`. Tell the person which manual tests to do. List any choice that you wrote in `docs/decisions.md`.
