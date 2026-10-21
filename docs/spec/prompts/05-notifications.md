# Prompt 05: Notifications

You are a coding agent. You continue the build of Shifted in this repo. Read `AGENTS.md` first and follow its rules.

## Goal

At the end of this phase, Shifted shows a desktop notification for each new message in each account. It also passes on Calendar reminders and Chat messages. A click on a notification opens the right account and tab. Per-account switches, snooze, and quiet hours work.

## Read first

1. `AGENTS.md`
2. `docs/spec/PRODUCT.md`, sections "Notifications" and "Configuration".
3. `docs/spec/docs/adr/0005-unread-counts-from-gmail-atom-feed.md`
4. `docs/spec/GLOSSARY.md`

## Scope

### 1. New mail from the feed

1. Use the feed module of prompt 04. Use the feed that the unread count of the account uses.
2. Keep a set of the entry IDs that Shifted saw for each account. Save the set in memory only.
3. After Shifted starts, and after an account signs in, the first read of the feed only fills the set. It shows no notification.
4. On each later read, every entry with a new ID is a new message. Show one notification for each new message.
5. The notification title is the nickname of the account, or its address. The body is the sender name, then the subject.
6. If more than 3 new messages arrive in one read, show one summary notification for that account, for example "5 new messages".

### 2. A click on a new-mail notification

1. Bring the main window to the front.
2. Select the account and its Gmail tab.
3. Load the message in the Gmail view. Use the `link` of the feed entry. If the link does not open the message, open the inbox, and write the fact in `docs/decisions.md`.

### 3. Calendar and Chat notifications

1. Gmail and Calendar make web notifications with `new Notification(...)`. Shifted must apply its switches, snooze, and quiet hours to them.
2. In the preload script of the Gmail and Calendar views, put a small replacement for `window.Notification` into the main world of the page. It sends the title, body, tag, and icon to the main process, and returns an object with the normal `close()` and `onclick` members.
3. If the page uses `ServiceWorkerRegistration.showNotification`, replace that too. Write what you found in `docs/decisions.md`.
4. In the main process, a notification from a Calendar view is a Calendar reminder. A notification from a Gmail view is a Chat message.
5. Apply the switches, snooze, and quiet hours. Then show an Electron `Notification`.
6. On a click, bring the main window to the front. Select the account and the tab that sent the notification. Then call the `onclick` of the page.

### 4. Switches, snooze, and quiet hours

1. Each account has three switches: new mail, Calendar reminders, and Chat messages. All three are on for a new account.
2. Snooze stops all notifications of all accounts until a time: 30 minutes, 1 hour, 8:00 tomorrow, or "until I turn it off".
3. Quiet hours of an account have an on or off switch, a start time, an end time, and weekdays. A range can cross midnight, for example 22:00 to 7:00.
4. A notification that snooze or quiet hours stopped is dropped. It does not show later.
5. Badges keep updating during snooze and quiet hours.
6. Write one pure function `shouldNotify(kind, account, now, state)` for these rules.

### 5. The user interface

1. Add a "Snooze" submenu to the app menu, with the four choices and "Stop snooze".
2. Cmd+Shift+S (Ctrl+Shift+S on Windows and Linux) opens the snooze choices as a small menu.
3. The Notifications page of the configuration window shows the snooze state, with a button to stop it.
4. The Notifications page has this note: "Keep Gmail's own desktop notifications for new mail off. Shifted already shows them."
5. The account page shows the three switches and the quiet hours.
6. The "Notifications" item of the account context menu opens that page.

### 6. Platform details

1. On Windows, call `app.setAppUserModelId` with the bundle identifier, so that notifications show.
2. Use the notification sound of the operating system. Do not add a sound of your own.

### 7. The fake Google test server

1. Add a control route that adds a new entry to the fake feed of an account.
2. Add a fake Calendar control that calls `new Notification('Meeting in 10 minutes')`.

### 8. A test hook

In test mode, do not show notifications. Record each one, with its account and kind, in a list that the end-to-end tests can read. Also let a test trigger a click on a recorded notification.

## Out of scope

- The tray menu. Prompt 07 adds the snooze item to it.

## Automated tests

- Unit: the first read fills the set and returns no new messages. A later read returns only the new IDs.
- Unit: more than 3 new messages give one summary.
- Unit: `shouldNotify` covers each switch, each snooze choice, quiet hours inside and outside the range, a range that crosses midnight, and the weekdays.
- End-to-end: add a fake entry. One new-mail notification is recorded for the right account.
- End-to-end: click the recorded notification. The account and its Gmail tab are selected.
- End-to-end: trigger the fake Calendar notification. It is recorded as a Calendar reminder for the right account.
- End-to-end: turn snooze on. A new fake entry records no notification, but the badge changes.

## Manual tests

1. Send an email to one of your accounts from another address. Make sure that a notification shows within about 60 seconds.
2. Click the notification. Make sure that Shifted shows that message in the right account.
3. Make a Calendar event that starts in 11 minutes with a 10-minute reminder. Make sure that the reminder shows.
4. Turn snooze on for 30 minutes. Send another email. Make sure that no notification shows and that the badge changes.
5. Set quiet hours for one account that include the current time. Make sure that this account shows no notifications and the other accounts do.

## When you finish

Commit with the message `Phase 05: notifications`. Tell the person which manual tests to do. List any choice that you wrote in `docs/decisions.md`.
