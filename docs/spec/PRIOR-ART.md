# Prior art: Shift

Shift (https://shift.com) is a desktop app from Redbrick. It combines email accounts, Google apps, other web apps, and a full web browser in one window. Shifted takes the multi-account part of Shift and leaves out the rest.

This file describes the behavior of Shift in our own words. It contains no code, text, images, or brand assets from Shift.

The file describes Shift 9, the email-focused version. Shift 9 shut down on 2026-09-30. The current Shift is a web browser built on Chromium, with fewer email features.

## What Shift does

- Shift is built on Chromium, the open-source base of Google Chrome. Its sidebar, configuration screens, and dialogs are a web interface inside the app.
- Each account has its own cookie and site-data store, so each Google account stays signed in on its own.
- A sidebar lists the accounts. Each account shows several Google apps, for example Gmail, Calendar, and Drive.
- Shift reads the unread count of each account from the Gmail page and shows a badge on each account. The total goes on the Dock icon.
- Shift keeps the Gmail of every account loaded in the background, so that the counts stay current.
- Shift does not make its own new-mail alerts. It lets the web notifications of Gmail through. You can snooze them for a fixed time or mute them during calendar meetings.
- When another app opens a `mailto:` link, Shift asks which account to use and opens a new message in that account.
- Keyboard shortcuts move to the previous or next account, open a quick account switcher, and switch between the Google apps of an account.
- You sign in to Google inside Shift, on Google's own sign-in page.
- Shift has its own server. It syncs the account list and the configuration between computers, sends usage data to analytics services, and limits the free plan to two accounts.
- Shift has a search across accounts and a combined calendar, both through Google APIs. It has no combined inbox.
- Shift has a general web browser and a store of other web apps.

## How Shifted compares

| Shift behavior | Shifted |
| --- | --- |
| Own cookie and site-data store for each account | Kept. See `docs/adr/0002-isolated-session-per-account.md`. |
| Sidebar of accounts | Kept. See "Window and sidebar" in `PRODUCT.md`. |
| Several Google apps for each account | Kept for Gmail and Calendar only. |
| Sign-in on Google's own page inside the app | Kept. See "Supported accounts" in `PRODUCT.md`. |
| Server, sync, analytics, paid plans | Dropped. See "Privacy and network" in `PRODUCT.md`. |
| General web browser and app store | Dropped. Shifted is not a web browser. |
| Search and calendar through Google APIs | Dropped. Shifted does not call Google APIs. See `docs/adr/0001-wrap-gmail-web-interface.md`. |
| Unread count read from the Gmail page | Changed: Shifted reads the Gmail Atom feed, so badges work for an account whose Gmail is asleep. See `docs/adr/0005-unread-counts-from-gmail-atom-feed.md`. |
| Gmail of every account loaded all the time | Kept as the default. A configuration value can put Google apps to sleep. See "Background loading" in `PRODUCT.md`. |
| Gmail's own web notifications, with snooze | Changed: Shifted makes new-mail notifications from the feed. It adds a switch for each kind and each account, and quiet hours for each account. See "Notifications" in `PRODUCT.md`. |
| `mailto:` asks which account to use | Kept, with an "Always use this account" choice. See "mailto: links" in `PRODUCT.md`. |
| Shortcuts for the previous and next account | Kept, plus Cmd+1 to Cmd+9 for each account. See "Keyboard shortcuts" in `PRODUCT.md`. |
| Separate small window for Google sign-in | Kept. See "Sign-in" in `PRODUCT.md`. |
| Chrome extensions | Dropped in version 1. |
