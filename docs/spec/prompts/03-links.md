# Prompt 03: Links

You are a coding agent. You continue the build of Shifted in this repo. Read `AGENTS.md` first and follow its rules.

## Goal

At the end of this phase, every link and every new window from Gmail or Calendar goes to the right place. Pages ask for permissions only as the spec allows, and downloads go to the Downloads folder. A right-click shows a context menu.

## Read first

1. `AGENTS.md`
2. `docs/spec/PRODUCT.md`, sections "Links", "Context menu of a page", "Page permissions", and "Downloads".
3. `docs/spec/BUILD.md`, section "Security".
4. `docs/spec/GLOSSARY.md`

## Scope

### 1. One routing function

1. Write a pure function `routeNavigation(url, context)` in `src/main/link-rules.ts`. The context says where the request comes from: the Gmail view, the Calendar view, a child window, or the sign-in window. It also gives the kind of request: a navigation or a new window.
2. The function returns one of these results: `stay`, `gmail-tab`, `calendar-tab`, `child-window`, `default-browser`, `mailto`, or `block`.
3. Follow the five rules in "Links" in the given order.
4. Get the Gmail and Calendar hosts from `google-urls.ts`. Do not write host names in `link-rules.ts`.
5. Return `block` for any scheme other than `http`, `https`, `mailto`, and `about:blank`.

### 2. Use the function everywhere

1. Call `routeNavigation` in the `will-navigate` handler of every web view and every child window.
2. Call it in the `setWindowOpenHandler` handler of every web view and every child window.
3. If the result is `calendar-tab`, select the Calendar tab of the same account and load the URL in the Calendar view.
4. If the result is `gmail-tab`, select the Gmail tab of the same account and load the URL in the Gmail view.
5. If the result is `default-browser`, call `shell.openExternal` with the URL. Allow only `http` and `https` URLs here.
6. If the result is `mailto`, keep the link for prompt 06. For now, open the Gmail compose URL of the same account. Put that URL in `google-urls.ts`: `https://mail.google.com/mail/u/0/?extsrc=mailto&url=<encoded mailto URL>`.
7. The sign-in window keeps rule 3 from prompt 01.

### 3. Child windows

1. A Gmail pop-out opens in a child window. Examples: pop-out compose, the print view, and "Open in new window".
2. Gmail often opens a pop-out with `window.open` and `about:blank`, then writes into it. Allow this case in a child window.
3. A child window uses the session of the same account and the same security options as the main views.
4. Give a child window a title that names the account, for example "Shifted: alice@example.com".
5. If an account is removed or signed out, close its child windows.

### 4. Page permissions

1. Set `setPermissionRequestHandler` and `setPermissionCheckHandler` on the session of each account.
2. Allow `notifications` always.
3. For `media` (camera and microphone), `display-capture`, and `clipboard-read`, ask the person the first time for each account. Use a small dialog that names the account and the permission.
4. Save the answer for that account in the configuration. Use the saved answer after that.
5. Deny every other permission with no dialog.
6. Never ask at startup. Only a request from a page starts a dialog.
7. Add "Reset page permissions" to the account page of the configuration window.

### 5. Screen sharing

1. Use `session.setDisplayMediaRequestHandler` for each account.
2. On macOS, use the system picker (`useSystemPicker: true`).
3. On Linux with Wayland, the desktop portal shows its own picker. Let it do so.
4. On Windows, and on Linux with X11, show a small Shifted picker. It lists the screens and windows from `desktopCapturer.getSources`.
5. On macOS, add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` to the electron-builder configuration (`mac.extendInfo`).

### 6. Downloads

1. Handle `will-download` on the session of each account.
2. Save to `app.getPath('downloads')`. If the name exists, add " (1)", " (2)", and so on before the extension.
3. When the download finishes, show a notification. A click on it calls `shell.showItemInFolder`.
4. Add the switch "Ask where to save each file" to the General page of the configuration window. It is off by default. If it is on, show a save dialog for each download.

### 7. The context menu

Electron shows no context menu of its own. Without this section, a right-click in Gmail does nothing.

1. Write a pure function in `src/main/page-menu-items.ts` that makes the items of the menu. Its input is the values of the `context-menu` event and the source of the page. The sources are those of `routeNavigation`, and the screens of Shifted.
2. Follow "Context menu of a page" in `PRODUCT.md`. To decide if a link gets "Open link in browser", call `routeNavigation` with the kind "new window".
3. Put a separator between the groups: spelling, link, image, and the edit commands. Turn off each edit command that `editFlags` of the event does not allow.
4. Handle `context-menu` on the Gmail view, the Calendar view, each child window, the sign-in page, and each screen of Shifted. If the function returns no items, show no menu.
5. Show the menu with `Menu.popup` in the window of the page.
6. For "Open link in browser", use the same function as the `default-browser` result, so that the test hook of section 8 records it. For "Save image", call `webContents.downloadURL`, so that the rules of section 6 apply.

### 8. A test hook for the default browser

1. In test mode (`SHIFTED_TEST_SERVER` is set), do not call `shell.openExternal`. Record the URL in a list that the end-to-end tests can read.
2. Do the same for `shell.showItemInFolder`.

### 9. The fake Google test server

Add fake pages that:

- Open a pop-out with `window.open('about:blank')` and write a fake compose form into it.
- Link to the fake Calendar with an event path.
- Link to an outside page, for example `https://example.com/doc`.
- Contain a `mailto:` link.
- Ask for the microphone with `getUserMedia`.
- Offer a file download.
- Contain a text field.
- Contain a link whose page stops the `contextmenu` event, as the message list of Gmail does.

## Out of scope

- The account picker for `mailto:` links from other apps. Prompt 06 adds it.
- Notifications other than the download notification. Prompt 05 adds them.

## Automated tests

- Unit: `routeNavigation` returns the right result for each rule. Test each of the five rules, each source context, and the `block` cases.
- Unit: the unique download name function adds " (1)" and " (2)" in the right place.
- Unit: the permission decision function allows, denies, or asks as the spec says.
- End-to-end: a fake pop-out opens a child window with the same account.
- End-to-end: a fake Calendar link selects the Calendar tab. No new window opens.
- End-to-end: an outside link is recorded for the default browser and does not load in Shifted.
- End-to-end: a fake download lands in a temporary Downloads folder.
- Unit: the context menu items for a link, a `mailto:` link, an image, selected text, a text field, and a misspelled word, for each source.
- End-to-end: right-click the fake outside link. The menu has "Open link in browser", and its click is recorded for the default browser. Right-click the fake text field. The menu has the edit commands. Right-click the link that stops the `contextmenu` event. Shifted shows no menu.

## Manual tests

1. In Gmail, open a message and click pop-out compose. Make sure that a child window opens and that you can send from it.
2. Open the print view of a message. Make sure that it opens in a child window and that the print dialog works.
3. Click a Google Docs link in a message. Make sure that it opens in your default browser.
4. Click a Calendar invitation link in Gmail. Make sure that Shifted shows the Calendar tab of the same account.
5. Download an attachment. Make sure that it is in your Downloads folder and that the notification shows it in the folder.
6. Start a Google Chat huddle in Gmail. Make sure that Shifted asks once for the microphone.
7. Right-click a link in a message. Make sure that "Open link in browser" opens it in your default browser, and that "Copy link address" copies it.
8. In a new message, type a misspelled word and right-click it. Make sure that the menu shows suggestions and that a click on one replaces the word. Make sure that Paste works.
9. Right-click an image in a message. Make sure that "Save image" puts it in your Downloads folder.
10. Right-click a message in the message list. Make sure that Gmail's own menu shows, and not the menu of Shifted.

## When you finish

Commit with the message `Phase 03: links`. Tell the person which manual tests to do. List any choice that you wrote in `docs/decisions.md`.
