# Prompt 04: Unread badges

You are a coding agent. You continue the build of Shifted in this repo. Read `AGENTS.md` first and follow its rules.

## Goal

At the end of this phase, each account shows its unread count in the sidebar, and the app icon shows the total. The counts come from the Gmail Atom feed. They match the number that Gmail shows next to Inbox.

## Read first

1. `AGENTS.md`
2. `docs/spec/PRODUCT.md`, sections "Unread badges", "Accounts in the sidebar", and "Failure states".
3. `docs/spec/docs/adr/0005-unread-counts-from-gmail-atom-feed.md`
4. `docs/spec/GLOSSARY.md`

## Scope

### 1. The feed module

1. Write `src/main/feed.ts`. It reads the Atom feed of one account with `session.fetch` and the session of that account.
2. Parse the XML with `fast-xml-parser`.
3. Return: the address from the feed title, the `fullcount` number, and the entries. Each entry has an `id`, a `title` (the subject), the author name and address, the `issued` time, and the `link`.
4. Return an error result for a non-200 status, a redirect to the sign-in page, a parse error, or a network error.

### 2. The feed labels

Add these labels to `google-urls.ts`:

| Choice | Feed label |
| --- | --- |
| Whole inbox | empty (the plain feed) |
| Primary | `%5Esq_ig_i_personal` |
| Important | `%5Eiim` |

### 3. The automatic choice of feed

1. The default "Unread count source" of an account is "Automatic".
2. In "Automatic", wait for Gmail of the account to load. Then read the page title with `webContents.getTitle()`.
3. If the title starts with `Inbox (N)` or `Inbox`, take N as the number that Gmail shows. No number means 0.
4. Read the "Whole inbox" feed and the "Primary" feed. If exactly one of them has `fullcount` equal to N, save that choice for the account.
5. If both match or neither matches, try again on the next load of Gmail. Until a choice is saved, use "Primary".
6. Put the title parsing in `src/main/gmail-page.ts`, because it depends on the Gmail page.

### 4. Polling

1. Read the feed of each account about every 60 seconds. Add a small random delay to each account, so that the reads do not happen at the same time.
2. Also read the feed of an account each time you switch to it.
3. After an error, wait longer before the next read: 60 seconds, then 2 minutes, then 5 minutes at most.
4. Read the feed of every account, also of an account whose Gmail is asleep or not loaded.

### 5. The badges

1. Show the unread count on the corner of the avatar in the sidebar. Show nothing for 0. Show "99+" for more than 99.
2. If the last read of the feed failed, show a warning mark in place of the number. The tooltip says why, for example "Signed out" or "Offline".
3. The app badge is the sum of all unread counts:
   - macOS: `app.dock.setBadge` with the number, or an empty string for 0.
   - Windows: `BrowserWindow.setOverlayIcon` with a small image of the number. Draw the image in code.
   - Linux: `app.setBadgeCount`. It works only on desktops that support a launcher badge.
4. Accounts with a warning mark add nothing to the sum.

### 6. The configuration

On the account page of the configuration window, add "Unread count source": Automatic, Primary, Whole inbox, or Important.

### 7. The fake Google test server

1. Make the fake feed return a count and entries that a test can set through a control route, for each fake account and each label.
2. Make the fake Gmail title follow the fake Primary count, for example `Inbox (3) - test@example.com - Gmail`.
3. Add a control route that makes the feed fail with HTTP 500.

## Out of scope

- Notifications. Prompt 05 adds them.
- The tray icon count on Windows and Linux. Prompt 07 adds it.

## Automated tests

- Unit: the feed parser reads the title, `fullcount`, and entries from fixture XML files. Make the fixtures by hand. Do not copy real mail into them.
- Unit: the title parser reads `Inbox (12) - a@b.com - Gmail` as 12 and `Inbox - a@b.com - Gmail` as 0. It returns nothing for a thread title.
- Unit: the automatic choice picks Primary, picks Whole inbox, or waits, for each case of step 3.
- Unit: the error delay grows from 60 seconds to 5 minutes and resets after a success.
- End-to-end: set the fake Primary count to 3. The sidebar badge shows 3.
- End-to-end: make the fake feed fail. The badge shows the warning mark.

## Manual tests

1. Add an account whose inbox uses category tabs. Make sure that the badge equals the number next to Inbox in Gmail.
2. Add an account with no category tabs. Make sure that its badge also equals the Inbox number.
3. Mark a message as read in Gmail. Make sure that the badge changes within about 60 seconds.
4. Make sure that the app icon shows the sum of the badges.
5. Turn off the network. Make sure that the badges show the warning mark. Turn the network on and make sure that the numbers come back.

## When you finish

Commit with the message `Phase 04: unread badges`. Tell the person which manual tests to do. List any choice that you wrote in `docs/decisions.md`.
