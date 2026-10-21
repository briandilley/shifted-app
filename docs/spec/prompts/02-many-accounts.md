# Prompt 02: Many accounts

You are a coding agent. You continue the build of Shifted in this repo. Read `AGENTS.md` first and follow its rules.

## Goal

At the end of this phase, Shifted has the sidebar, the tab bar, and the configuration window. You can add many accounts, switch between them, and switch between Gmail and Calendar in each account.

## Read first

1. `AGENTS.md`
2. `docs/spec/PRODUCT.md`, sections "Window and sidebar", "Accounts in the sidebar", "Google apps in each account", and "Configuration".
3. `docs/spec/GLOSSARY.md`

## Scope

### 1. Layout of the main window

1. Replace the temporary buttons of prompt 01.
2. The sidebar is on the left, about 68 points wide. It is a React view.
3. The tab bar is at the top of the right side, about 36 points high. It is a React view.
4. The content area is below the tab bar. It shows one `WebContentsView` at a time.
5. Use the drawing in "Window and sidebar" as the layout.

### 2. The sidebar

1. Show one avatar for each account, in the order of the configuration.
2. Show the add-account button below the list. It starts the sign-in flow of prompt 01.
3. Mark the selected account clearly.
4. When you point to an account, show the nickname and the address.
5. Leave space on the corner of each avatar for the unread badge. Prompt 04 fills it.

### 3. The avatar

1. Give each new account the next color from this set of 8 colors: `#1A73E8`, `#D93025`, `#188038`, `#F9AB00`, `#A142F4`, `#12B5CB`, `#E8710A`, `#5F6368`.
2. Draw a ring in the account color around the avatar.
3. Write a module `src/main/gmail-page.ts`. Put every assumption about the markup of the Gmail page in this module, and nowhere else.
4. In that module, after Gmail loads, find the profile photo of the account in the Gmail page. Run the lookup with `executeJavaScript` in the Gmail view. Return the image URL or nothing.
5. Download the image with the session of the account. Save it as `photos/<id>.png` in the user data folder.
6. If there is no photo, show the first letter of the account name on the account color.

### 4. The tab bar and the Google apps

1. The tab bar shows two tabs for the selected account: Gmail and Calendar.
2. Each account can have two web views: one for Gmail and one for Calendar. Both use the session of the account.
3. Make each view the first time that it is needed. Keep it after that. Prompt 07 adds sleep.
4. When you switch accounts, show the Google app that the account used last (`lastGoogleApp`).
5. A switch to a view never reloads it.

### 5. Reorder and the context menu

1. You can drag an account in the sidebar to a new place. Save the new order.
2. Right-click an account to open its context menu: Rename, Color, Notifications, Sign out, and Remove.
3. Rename and Color open the page of that account in the configuration window.
4. Notifications opens the same page. Prompt 05 adds the fields.
5. Sign out clears the session of the account and shows the signed-out panel of prompt 01.
6. Remove asks you to confirm, then removes the account as in prompt 01.

### 6. The configuration window

1. Cmd+, (Ctrl+, on Windows and Linux) opens the configuration window. Its title is `Settings`.
2. Use the drawing in "Configuration". The left list has General, Notifications, and one entry for each account.
3. In this phase, the account page has: nickname, color (the 8 colors), Sign out, and Remove.
4. In this phase, the General and Notifications pages are empty. Later prompts add their fields.
5. Changes save at once. There is no Save button.

### 7. The fake Google test server

1. Make the fake server support more than one fake account. Each session has its own cookie, so each account sees its own fake address.
2. Add an avatar image to the fake Gmail page, where `gmail-page.ts` looks for it.
3. Add a fake Calendar page with the title `Calendar`.

## Out of scope

- Link rules and child windows. Prompt 03 adds them.
- Unread badges. Prompt 04 adds them.
- Keyboard shortcuts other than Cmd+,. Prompt 07 adds them.

## Automated tests

- Unit: the color of a new account is the next color of the set, and the set repeats after 8 accounts.
- Unit: reordering gives the expected order values.
- End-to-end: add three fake accounts. Click each one. The content area shows the fake Gmail of that account.
- End-to-end: switch to the Calendar tab in account 2. Switch to account 1, then back to account 2. The Calendar tab is still selected.
- End-to-end: drag account 3 to the top. Restart. Account 3 is still at the top.
- End-to-end: rename an account in the configuration window. Point to the account. The sidebar shows the nickname.
- End-to-end: remove an account from the context menu. It is gone from the sidebar and from the configuration.

## Manual tests

1. Add two real accounts. Make sure that each one shows its own Gmail.
2. Make sure that each avatar shows the profile photo inside a colored ring.
3. Click the Calendar tab of each account. Make sure that Calendar loads with no new sign-in.
4. Drag an account to a new place. Quit and start Shifted. The order stays.
5. Open the configuration window with Cmd+, (Ctrl+, on Windows and Linux). Change a color. The ring changes at once.

## When you finish

Commit with the message `Phase 02: many accounts`. Tell the person which manual tests to do. List any choice that you wrote in `docs/decisions.md`.
