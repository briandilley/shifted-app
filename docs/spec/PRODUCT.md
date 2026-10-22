# Shifted: product description

This file tells the build agent what Shifted does. Every prompt in `prompts/` points to it. The words in this file have the meanings in `GLOSSARY.md`.

## Name

- Name: Shifted (working name).
- Bundle identifier: `io.github.briandilley.shifted`. If you sign and ship your own build, change it to an identifier that you own.

All prompts read the name and the bundle identifier from this section. To rename the app, change them here.

## What Shifted is

Shifted is a desktop app that keeps several Gmail accounts in one window. Each account shows Gmail and Google Calendar, with Google's own web interface. You switch between accounts from a sidebar.

## What Shifted is not

- Shifted is not a web browser. It has no address bar and no browser tabs, and you cannot use it to visit websites in general.
- Shifted is not a mail client. It does not call the Gmail API, and it does not draw mail itself. See `docs/adr/0001-wrap-gmail-web-interface.md`.
- Shifted does not run Chrome extensions in version 1. Electron supports only part of the Chrome extension APIs, and most Gmail extensions need parts that it does not have.

## Platforms

Shifted runs on macOS, Windows, and Linux. All three platforms get the same features.

Shifted is an Electron app written in TypeScript. See `docs/adr/0003-electron-and-typescript.md`.

The build tools and the test approach are in `BUILD.md`.

## Version 1 features

Version 1 has these features, in addition to the sidebar, the tab bar, and adding and removing accounts. Each feature has its own section below.

- Unread badges: an unread count on each account in the sidebar, and the total on the app icon.
- Notifications: desktop notifications for new mail and for Calendar reminders, in every account.
- `mailto:` handler: Shifted can be the default email app of the computer.
- Keyboard shortcuts: jump to an account, move to the previous or next account, and switch between the Gmail and Calendar tabs.
- Export and import: move the configuration to another computer, as a file or by email.

## Supported accounts

Shifted supports every Google account that has Gmail:

- Personal accounts that end in `@gmail.com`.
- Google Workspace accounts, for example `name@company.com`.
- Google Workspace accounts that sign in through a company identity provider, for example Okta or Microsoft Entra ID.

Example: you add `name@company.com`. Google sends you to `company.okta.com` to sign in. Shifted shows the Okta page in the app, because it is part of the sign-in. After the sign-in, Shifted returns to Gmail.

## Accounts and sessions

- Each account has its own session, with its own cookies and site data. See `docs/adr/0002-isolated-session-per-account.md`.
- A session persists on disk. After you quit Shifted and open it again, each account is still signed in.
- If you sign out of Gmail in one account, the other accounts stay signed in.
- When you remove an account from Shifted, Shifted deletes the session of that account from disk.

## Sign-in

- You sign in on Google's own sign-in page, in a sign-in window. The sign-in window is a small separate Shifted window, about 480 by 720 points, that uses the session of the account.
- The top of the sign-in window shows one line of help from Shifted. The rest of the window shows Google's sign-in page.
- While the sign-in window is open, the content area of the account says that sign-in is in progress.
- When Gmail loads in the sign-in window, Shifted closes the sign-in window and shows Gmail of that account in the main window.
- If Google signs an account out, the content area of that account says so. It also shows a "Sign in again" button. The button opens the sign-in window for that account. Shifted never shows Google's sign-in page in the content area.
- The feed of the account decides if the account is signed out. A signed-in Gmail can pass through Google's sign-in host to set its cookies, and that visit alone is not a sign-out. See `docs/adr/0006-detect-sign-out-with-the-feed.md`.
- Shifted never pretends to be another browser. See `docs/adr/0004-honest-user-agent-for-sign-in.md`.
- On macOS and Linux, passkeys do not work in Shifted. When Google asks for a passkey, you click "Try another way" and use your password and 2-Step Verification. The top line of the sign-in window tells you this.
- On Windows, Google's passkey request goes to Windows Hello, which shows its own dialog.
- An optional later prompt adds Touch ID passkeys on macOS. See `docs/adr/0004-honest-user-agent-for-sign-in.md`.

## Window and sidebar

Shifted has one main window. The sidebar is on the left. The tab bar is at the top of the right side. The content area is below the tab bar. The content area shows one Google app of one account at a time.

```
+------------------------------------------------+
| o o o   [ Gmail ]  Calendar      * alex@co.com |
|  (A)  +----------------------------------------+
| [(B)==|                                        |
|  (C)  |        Gmail of account B              |
|  (+)  |                                        |
|       +----------------------------------------+
+------------------------------------------------+
```

- The content area looks like a rounded card on the backdrop. The backdrop has a tint of the color of the selected account. The look is in `DESIGN.md`.

- The sidebar shows one avatar for each account, in a vertical list. The add-account button is below the list.
- The tab bar shows one tab for each Google app of the selected account: Gmail and Calendar. Click a tab to show that Google app in the content area.
- Each account remembers the Google app that you used last. When you switch back to that account, Shifted shows that Google app.

## Accounts in the sidebar

- Each account shows the Google profile photo of the account, inside a ring in the account color. The unread badge sits on the corner of the photo.
- After Gmail of an account loads, Shifted reads the profile photo from the Gmail page and saves a copy on disk. If Shifted cannot read the photo, it shows the first letter of the account name on the account color.
- Shifted learns the email address of each account from the title of its Atom feed, `Gmail - Inbox for <address>`.
- The account name is the email address. You can give an account a nickname. When you point to an account, Shifted shows the nickname and the address.
- Each new account gets the next color from a fixed set of 8 colors. The colors are in `DESIGN.md`. You can change the color of an account.
- You drag an account to change the order. The order decides the numbers of Cmd+1 to Cmd+9.
- The context menu of an account (right-click) has: Rename, Color, Notifications, Sign out, and Remove.
- Remove asks you to confirm, then deletes the account and its session.

## Google apps in each account

- Each account shows two Google apps: Gmail (`https://mail.google.com`) and Google Calendar (`https://calendar.google.com`).
- Gmail and Calendar in one account use the same session, so you sign in once for both.
- Google Chat and Google Meet appear inside Gmail where Google puts them. Shifted does not show them as separate apps.
- Shifted does not show any other Google app, for example Drive, Docs, or Contacts.

## Links

Shifted decides where each link opens. The rules apply to links that you click and to pages that Gmail or Calendar opens on their own.

1. A Gmail link opens in the Gmail Google app of the same account.
2. A Calendar link opens in the Calendar Google app of the same account. Example: in Gmail, you click an event invitation that goes to `calendar.google.com`. Shifted switches to the Calendar tab of the same account and shows the event. It does not open a new window.
3. In the sign-in window, every page stays in the sign-in window. This includes Google's sign-in pages and the pages of a company identity provider.
4. A Gmail pop-out opens in a child window that uses the session of the same account. Examples: pop-out compose, the print view, and "Open in new window".
5. Every other link opens in the default browser of the computer. This includes Google Docs, Drive, Meet, and Contacts.

Rule 5 has a known cost. Example: you click a Google Docs link in account B. The link opens in your default browser, which can be signed in as account A. Shifted accepts this cost, because it is not a web browser.

## Unread badges

- Each account in the sidebar shows its unread count on its avatar. If the count is 0, Shifted shows no badge.
- The unread count of an account is the number that Gmail shows next to Inbox for that account.
- The app icon shows the sum of the unread counts of all accounts. On macOS this is the Dock badge. On Windows it is an overlay on the taskbar icon. On Linux it is the launcher badge, on desktops that support one.
- Shifted gets each unread count from the Gmail Atom feed, with the session of the account. It reads the feed about every 60 seconds, and each time you switch accounts. See `docs/adr/0005-unread-counts-from-gmail-atom-feed.md`.
- When the inbox of an account uses category tabs, Gmail counts only the Primary tab. Shifted learns this for each account the first time Gmail loads, and then reads the matching feed.
- Each account has an override in configuration: "Primary", "Whole inbox", or "Important".
- If Shifted cannot read the feed of an account, the badge of that account shows a warning mark instead of a number. Example: the account is signed out.

## Notifications

New mail:

- Shifted makes the new-mail notifications itself, from the same Atom feed as the unread badges. They also work for an account whose Gmail is asleep.
- Shifted shows one notification for each new unread message in the feed that the unread count uses. The notification shows the account, the sender, and the subject.
- When Shifted starts, and after you sign in to an account, Shifted reads the feed once without notifications. This prevents a burst of old messages.
- When you click a new-mail notification, Shifted comes to the front, selects the account, shows the Gmail tab, and opens that message.
- If Gmail's own new-mail notifications are on (Gmail `Settings` > `Desktop notifications`), you get two notifications for each message. The help text of Shifted tells you to keep Gmail's own new-mail notifications off.

Calendar and Chat:

- Calendar reminders and Google Chat messages come from the web notifications of the Calendar and Gmail pages. Shifted allows these notifications and shows them as desktop notifications.
- When you click one of these notifications, Shifted comes to the front and selects the account and the tab that sent it.

Controls:

- Each account has three switches: new mail, Calendar reminders, and Chat messages. All three are on for a new account.
- Snooze stops all notifications of all accounts. You choose 30 minutes, 1 hour, until 8:00 tomorrow, or until you turn snooze off. Badges keep updating during snooze.
- Each account can have quiet hours: a daily time range and a set of weekdays with no notifications from that account. Example: a work account is quiet outside 9:00 to 18:00, Monday to Friday.
- Shifted uses the notification system of the operating system. So macOS Focus, Windows Do Not Disturb, and the Do Not Disturb mode of a Linux desktop also hide notifications from Shifted.
- A notification that snooze or quiet hours stopped does not show later.

## mailto: links

- Shifted can be the default email app of the computer. The configuration has a "Make Shifted the default email app" button. On macOS and Linux, the button sets Shifted as the handler for `mailto:` links. On Windows, the button opens the Windows "Default apps" page, where you choose Shifted, because Windows does not let an app make itself the default.
- When another app opens a `mailto:` link, Shifted shows the account picker. If Shifted is not running, the operating system starts it first.
- The account picker lists the accounts. The account that you used last for a `mailto:` link is selected, so Enter picks it.
- The account picker has an "Always use this account" box. If you select it, later `mailto:` links skip the picker. The configuration can clear this choice.
- After you pick an account, Shifted selects that account in the main window, shows its Gmail tab, and opens a new message. The new message has the address, subject, and body from the link. If Gmail of that account is asleep, Shifted loads it first.
- A `mailto:` link inside Gmail or Calendar of an account opens a new message in the Gmail of the same account, without the account picker.

## Keyboard shortcuts

Cmd is the Command key on macOS. On Windows and Linux, use Ctrl in place of Cmd. Ctrl+Tab and Ctrl+Shift+Tab use Ctrl on all three platforms.

| Action | Keys |
| --- | --- |
| Jump to account 1 to 9 | Cmd+1 to Cmd+9 |
| Next account | Ctrl+Tab |
| Previous account | Ctrl+Shift+Tab |
| Gmail tab | Cmd+Shift+1 |
| Calendar tab | Cmd+Shift+2 |
| Reload the Google app | Cmd+R |
| Configuration | Cmd+, |
| Add account | Cmd+Shift+N |
| Snooze notifications | Cmd+Shift+S |

- The order of the accounts in the sidebar decides the numbers 1 to 9.
- The shortcuts are fixed in version 1. You cannot change them.
- No shortcut of Shifted uses a key that Gmail or Calendar already uses. Example: Cmd+Shift+C adds Cc recipients in Gmail, so Shifted does not use it.

## Page permissions

These rules apply to the Gmail and Calendar pages of each account, and to their child windows.

- Notifications: always allowed. The notification switches of Shifted decide what shows.
- Camera and microphone: the first time a page of an account asks for them, Shifted asks you. Example: you join a Google Chat huddle in Gmail. Shifted remembers your answer for that account.
- Screen sharing: the first time a page of an account asks for it, Shifted asks you. Then a screen picker lets you choose what to share. On macOS, and on Linux with Wayland, it is the picker of the operating system. On Windows, and on Linux with X11, it is a small Shifted picker.
- Clipboard read: the first time a page of an account asks for it, Shifted asks you. Shifted remembers your answer for that account.
- Shifted never asks for a permission at startup. Only a request from a page makes Shifted ask.
- The configuration can reset the remembered answers of an account.
- Every other permission is denied without a question. Examples: location, USB, MIDI, and Bluetooth.
- On macOS, the operating system also asks once for camera, microphone, and screen recording access. Shifted must declare why it needs them.

## Downloads

- Shifted saves a download, for example a Gmail attachment, straight to the Downloads folder of the operating system.
- If a file with the same name exists, Shifted adds " (1)", " (2)", and so on to the new name.
- When the download finishes, Shifted shows a notification. Click it to show the file in Finder, File Explorer, or the file manager.
- The configuration switch "Ask where to save each file" shows a save dialog for each download. It is off by default.

## Background loading

A configuration value, "Background loading", decides which Google apps stay loaded in the background. A loaded Google app uses roughly 200 to 500 MB of memory.

| Value | What stays loaded | What sleeps |
| --- | --- | --- |
| Everything (default) | Gmail and Calendar of every account. | Nothing. |
| Calendars only | Calendar of every account, and the Google apps of the selected account. | Gmail of each other account, 5 minutes after you leave it. |
| Selected account only | The Google apps of the selected account. | All Google apps of each other account, 5 minutes after you leave it. |

- If you open a sleeping Google app, it loads again.
- Unread badges stay current in every value, because they do not need Gmail to be loaded.
- With "Selected account only", Calendar reminders come only from the selected account.

## Running in the background

- When you close the main window, Shifted hides it and keeps running, so that badges and notifications continue.
- On macOS, click the Dock icon to show the main window again. Quit is in the app menu (Cmd+Q).
- On Windows and Linux, Shifted shows a tray icon with the total unread count. Click the tray icon to show the main window. The tray menu has Show, Snooze, and Quit.
- Shifted remembers the size and position of the main window.
- "Open at login" is a configuration switch. It is off by default.

## Configuration

The configuration window has the title `Settings`. Cmd+, opens it. The context menu of an account opens the page of that account.

```
Settings
+--------------+------------------------+
| General      | Open at login     [ ]  |
| Notifications| Background loading [v] |
| ------------ | Downloads ...          |
| [A] alice    | Default email app [..] |
| [B] work     |                        |
+--------------+------------------------+
```

General page:

- Open at login (off by default).
- Background loading: Everything, Calendars only, or Selected account only.
- Ask where to save each file (off by default).
- Make Shifted the default email app.
- Clear the "Always use this account" choice of the account picker.
- `Export configuration…`, `Email it to myself`, and `Import configuration…`. The section "Move to another computer" tells what they do.

Notifications page:

- Snooze state, with a button to stop the snooze.
- A short note that tells you to keep Gmail's own new-mail notifications off.

One page for each account:

- Nickname and color.
- Unread count source: Automatic, Primary, Whole inbox, or Important.
- Notification switches: new mail, Calendar reminders, and Chat messages.
- Quiet hours: on or off, a time range, and weekdays.
- Reset the remembered page permissions.
- Sign out, and Remove.

Shifted saves the configuration in one JSON file in its app data folder. The sessions and the saved profile photos are in the same folder.

## Move to another computer

You can move the configuration of Shifted to another computer. The exported configuration never has sign-ins: no cookies, no passwords, and no session data. On the new computer, you sign in to each account again.

The exported configuration has these values:

- For each account: the address, the nickname, the color, the place in the sidebar, the unread count source, the notification switches, and the quiet hours.
- From the General page: background loading, "Ask where to save each file", and the "Always use this account" choice of the account picker.

It leaves out the values that belong to one computer: open at login, the default email app, and the size and position of the window. It also leaves out the remembered answers for page permissions, the snooze, and the profile photos. Shifted gets each photo again after sign-in.

The General page of the configuration window has three buttons:

- `Export configuration…` saves the exported configuration as a file. You pick the folder. The file name is `Shifted configuration <date>.json`.
- `Email it to myself` opens a new message in Gmail of the selected account, in the main window. The message goes to the address of that account, with the subject "Shifted configuration". The body has one line of help and the exported configuration as a block of text. You click Send.
- `Import configuration…` takes a file or the pasted text of the message. It accepts both forms.

Gmail cannot attach a file from a link. So the message has the text form, and not the file.

The exported configuration has no password. It holds no secrets, but it lists your addresses and nicknames. Keep it as you keep other personal files.

The main window with no accounts also shows `Import configuration…`, next to `Add account`.

The import merges with the accounts on this computer. It matches the accounts by address:

- If an imported account has the address of an account on this computer, the import updates the values of that account. The account keeps its sign-in.
- If an imported account has a new address, the import adds it. The new account waits for sign-in.
- An account on this computer that the import does not have stays. It goes to the end of the sidebar.
- The sidebar takes the order of the import.
- The General values of the import replace the General values on this computer.

Before the import changes anything, Shifted shows what will change and asks you to confirm. If Shifted cannot read the file or the text, it changes nothing and tells you why.

After the import, each new account shows a `Sign in` button in place of Gmail. The sign-in window starts with the address of the account already filled in.

## Shifted's own screens

- The screens of Shifted are in English only in version 1. Gmail and Calendar keep the language of each Google account.
- The screens of Shifted follow the light or dark mode of the operating system. The look of both modes is in `DESIGN.md`.
- Shifted marks spelling mistakes in Gmail and Calendar, in the languages of the operating system.

## Failure states

- If a Google app stops because its page crashed, the content area shows a short message and a "Reload" button.
- If the computer is offline, each unread badge shows a warning mark instead of a number. Badges come back on the next successful read of the feed.
- If a page of Google has a certificate error, Shifted blocks the page and shows a message. Shifted never lets you skip a certificate error.

## Privacy and network

- Shifted has no server of its own.
- Shifted has no sign-up, no license key, no telemetry, no crash reporting, and no configuration sync.
- Shifted writes an exported configuration only after a click on `Export configuration…`. `Email it to myself` only opens a new message. You send it, or you discard it.
- All data of Shifted stays on the computer: the account list, the configuration, and the sessions.
- Shifted sends network traffic only to Google's own pages. During sign-in, it also goes to the pages of a company identity provider. A build with auto-update also asks for updates.

## Distribution

- The main prompts build a version of Shifted that you run from source on your own computer.
- An optional prompt adds signed installers and auto-update for macOS, Windows, and Linux.
- That prompt needs an Apple Developer account for macOS and a code-signing certificate for Windows.
