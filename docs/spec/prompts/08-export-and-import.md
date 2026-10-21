# Prompt 08: Export and import

You are a coding agent. You continue the build of Shifted in this repo. Read `AGENTS.md` first and follow its rules.

## Goal

At the end of this phase, you can export the configuration to a file, or to an email to yourself. On another computer, you can import it and then sign in to each account again.

## Read first

1. `AGENTS.md`
2. `docs/spec/PRODUCT.md`, sections "Move to another computer", "Configuration", and "mailto: links".
3. `docs/spec/GLOSSARY.md`

## Scope

### 1. The format

1. Write a pure module `src/main/config-transfer.ts`. It turns the configuration into an exported configuration, and an exported configuration back into values.
2. The file form is JSON with an indent of 2 spaces:

   ```json
   {
     "format": "shifted-configuration",
     "version": 1,
     "exportedAt": "2026-10-21T17:00:00Z",
     "accounts": [],
     "general": {}
   }
   ```

3. Put in it only the values that "Move to another computer" in `PRODUCT.md` lists. Write the list of allowed keys once, in this module. Never copy a key that is not on the list.
4. Do not export the `id` of an account. The import makes new IDs.
5. The text form is for email. It is the file form, compressed with `zlib.deflateRawSync` and encoded as base64, between two marker lines:

   ```text
   -----BEGIN SHIFTED CONFIGURATION-----
   <base64 in lines of 64 characters>
   -----END SHIFTED CONFIGURATION-----
   ```

   The compose URL has a length limit. The text form of 9 accounts is less than 2,000 characters. The plain JSON is about 5 times longer.
6. The import reads both forms. For the text form, it takes the text between the two marker lines and ignores spaces and line breaks. So the person can paste a whole email, with text before and after the markers.

### 2. Export to a file

1. Add `Export configuration…` to the General page of the configuration window.
2. Open `dialog.showSaveDialog` in the Documents folder, with the name `Shifted configuration <YYYY-MM-DD>.json`.
3. Write the file form. Show "Saved <file name>." on the page.

### 3. Email it to myself

1. Add `Email it to myself` to the General page. If the selected account has no address yet, the button is off.
2. Make a `mailto:` link to the address of the selected account. The subject is "Shifted configuration". The body is this line of help, an empty line, and the text form:

   ```text
   To use this configuration on another computer, open Shifted there. Go to Settings, then General, then Import configuration, and paste this whole message.
   ```

3. Open the link in the selected account with the compose path of prompt 06. Bring the main window to the front.
4. Do not send the message. Shifted never sends mail. The person clicks Send.

### 4. Import

1. Add `Import configuration…` to the General page. If there are no accounts, also show it in the main window, next to `Add account`.
2. It opens a small import window, with the look of the account picker in `DESIGN.md`. The window has a `Choose file…` button and a text box with the label "Or paste the message".
3. Read at most 256 KB from the file or the text box.
4. If `format` is not `shifted-configuration`, or the JSON or the base64 is broken, show "Shifted cannot read this configuration." Change nothing.
5. If `version` is higher than the version that this build knows, show "This configuration comes from a newer version of Shifted. Update Shifted, then try again." Change nothing.
6. Ignore keys that the module does not know. If a known key has a wrong type or a value out of range, show "Shifted cannot read this configuration." and change nothing.
7. Before you change anything, show what will change, and ask the person to confirm. Apply the rules of "Move to another computer" in `PRODUCT.md`.

### 5. Accounts with no sign-in

1. An imported account has a new ID and an empty session. Do not read its feed until it signs in.
2. In place of Gmail, show a React panel with "Sign in to <address>." and a `Sign in` button. The button opens the sign-in window of prompt 01.
3. Add an optional address to the sign-in URL function in `google-urls.ts`. With an address, add `&Email=<encoded address>` to the sign-in URL. Google's sign-in page then fills in the address. We tested this on 2026-10-21.
4. After sign-in, take the address from the feed as in prompt 01. If it is different from the imported address, save the new address and keep the other values of the account.

### 6. The fake Google test server

1. Make the fake sign-in page show the `Email` parameter that it received, so that a test can read it.

## Out of scope

- Sign-ins, cookies, and sessions. They never leave the computer.
- Sync between computers. Shifted has no server.
- Files that open Shifted on a double-click. Installers come in prompt 11.

## Automated tests

- Unit: export, then import, gives the same values, with new account IDs.
- Unit: the export has only the allowed keys. Test it with a configuration that has more keys.
- Unit: the text form survives a round trip with extra line breaks and extra spaces. It also survives inside a whole email, with text before and after the markers.
- Unit: the text form of 9 accounts with long nicknames and addresses is less than 2,000 characters.
- Unit: import refuses a wrong format, broken JSON, broken base64, a newer version, more than 256 KB, and a wrong value. In each case, the configuration does not change.
- Unit: the sign-in URL with an address has the `Email` parameter, and the one without an address does not.
- End-to-end: replace `dialog.showSaveDialog` from the test with `electronApp.evaluate`. Click `Export configuration…`. The file exists and the import reads it.
- End-to-end: click `Email it to myself`. The fake Gmail shows a compose link with the address, the subject, and the text form.
- End-to-end: start with an empty user data folder and import the file. The sidebar shows the accounts with their nicknames and colors. Each shows the `Sign in` panel, and the fake sign-in page gets the address.

## Manual tests

1. Give your accounts nicknames and colors. Change some notification values.
2. Click `Export configuration…` and save the file.
3. Click `Email it to myself`. Make sure that a new message opens in Gmail, to your own address, with the block of text. Send it.
4. Use a second computer. If you do not have one, quit Shifted and rename its app data folder for this test. Rename it back after the test.
5. Start Shifted. Click `Import configuration…`. Paste the whole message from step 3. Make sure that Shifted shows what will change.
6. Confirm. Make sure that the accounts show with their nicknames and colors, and with a `Sign in` button.
7. Click `Sign in` on one account. Make sure that the sign-in window has the address filled in.
8. Import the file from step 2. Make sure that the result is the same.

## When you finish

Commit with the message `Phase 08: export and import`. Tell the person which manual tests to do. List any choice that you wrote in `docs/decisions.md`.
