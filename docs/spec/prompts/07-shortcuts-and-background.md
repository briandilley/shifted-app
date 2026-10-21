# Prompt 07: Shortcuts and background

You are a coding agent. You continue the build of Shifted in this repo. Read `AGENTS.md` first and follow its rules.

## Goal

At the end of this phase, the keyboard shortcuts work. Shifted keeps running after you close its window, and it can put Google apps to sleep to save memory.

## Read first

1. `AGENTS.md`
2. `docs/spec/PRODUCT.md`, sections "Keyboard shortcuts", "Background loading", "Running in the background", and "Configuration".
3. `docs/spec/GLOSSARY.md`

## Scope

### 1. The shortcut table

1. Write the shortcuts of "Keyboard shortcuts" as one table in `src/main/shortcuts.ts`. Each row has an action and its keys.
2. Use `CommandOrControl` for Cmd on macOS and Ctrl on Windows and Linux.
3. Add each shortcut to the app menu, so that the menu shows the keys.
4. A web view gets keys before the app menu does. Also catch the shortcuts in the `before-input-event` handler of every web view and every child window. When a key matches, call `event.preventDefault()` and run the action.
5. Do not catch any key that is not in the table. Gmail and Calendar keep all their own keys.

### 2. The actions

1. Cmd+1 to Cmd+9 select the account at that place in the sidebar. If no account is at that place, do nothing.
2. Ctrl+Tab selects the next account. Ctrl+Shift+Tab selects the previous account. Both wrap around.
3. Cmd+Shift+1 selects the Gmail tab. Cmd+Shift+2 selects the Calendar tab.
4. Cmd+R reloads the Google app in the content area.
5. Cmd+, opens the configuration window.
6. Cmd+Shift+N starts the add-account flow.
7. Cmd+Shift+S opens the snooze choices from prompt 05.

### 3. Background loading

1. Add "Background loading" to the General page of the configuration window: Everything (default), Calendars only, or Selected account only.
2. Follow the table in "Background loading" in `PRODUCT.md`.
3. If a Google app must sleep, start a 5-minute timer when you leave it. When the timer ends, close its `WebContentsView` and destroy its web contents. Keep the session.
4. If you come back before the timer ends, stop the timer.
5. If you open a Google app that is asleep, make its view again and load it.
6. Show the sleeping state nowhere in the user interface. If you open a sleeping Google app, it loads again.
7. The feed polling of prompt 04 continues for every account in every value.
8. If the value changes, apply it at once. Wake the apps that must stay loaded.

### 4. Close and quit

1. When you close the main window, hide it. Do not quit.
2. On macOS, the `activate` event shows the main window again. Cmd+Q quits.
3. On Windows and Linux, make a tray icon. Show the total unread count on the icon. Draw the number in code.
4. A click on the tray icon shows the main window. The tray menu has: Show, Snooze, and Quit.
5. On Linux, the tray needs a desktop that supports status icons. If the tray is not available, closing the main window quits Shifted. Write this in `docs/decisions.md`.
6. Quit closes all windows and ends the feed polling.

### 5. Window position

1. After each change to the size or the position of the main window, save them. Wait a short time after the last change before you save.
2. At startup, put the main window back. If the saved position is off every screen, center the window on the main screen.

### 6. Open at login

1. Add "Open at login" to the General page. It is off by default.
2. On macOS and Windows, use `app.setLoginItemSettings`.
3. On Linux, write or delete `~/.config/autostart/shifted.desktop`.
4. When Shifted opens at login, start with the main window hidden. The feeds start at once.

## Out of scope

- Editable shortcuts. They are fixed in version 1.

## Automated tests

- Unit: the shortcut table has no duplicate keys, and it has no key that Gmail uses. Keep a list of known Gmail keys in the test, for example `CommandOrControl+Shift+C`.
- Unit: next and previous account wrap around.
- Unit: the sleep rules give the right set of loaded apps for each value of "Background loading".
- End-to-end: Cmd+2 (Ctrl+2) selects account 2. Ctrl+Tab selects account 3.
- End-to-end: Cmd+Shift+2 selects the Calendar tab.
- End-to-end: with "Selected account only" and a short test timer, leave account 2. After the timer, its views are closed. A change to the fake feed still changes its badge.
- End-to-end: close the main window. The app keeps running and the fake feed still records notifications.

## Manual tests

1. Press each shortcut in the table while the focus is in Gmail. Make sure that each one works.
2. In Gmail compose, press Cmd+Shift+C (Ctrl+Shift+C). Make sure that Gmail adds the Cc field.
3. Set "Background loading" to "Selected account only". Wait 5 minutes on account 1. Open your system activity monitor and make sure that fewer Shifted processes run.
4. Close the main window. Send yourself an email. Make sure that the notification still shows.
5. On Windows or Linux, make sure that the tray icon shows the total and that its menu works.
6. Turn on "Open at login". Log out and log in. Make sure that Shifted runs with no window.

## When you finish

Commit with the message `Phase 07: shortcuts and background`. Tell the person which manual tests to do. List any choice that you wrote in `docs/decisions.md`.
