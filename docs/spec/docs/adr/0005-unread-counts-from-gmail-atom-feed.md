# Unread counts from the Gmail Atom feed

Shifted gets the unread count of each account from the Gmail Atom feed (`https://mail.google.com/mail/u/0/feed/atom/<label>`). It sends the request with the session of the account, about every 60 seconds. It does not read the count from the Gmail page.

We chose the feed for two reasons. It works for an account whose Gmail is asleep. A change to the markup of the Gmail page does not break it. A count read from the page needs Gmail to stay loaded. So it does not work with the "Background loading" values that put Gmail to sleep. We tested the feed on 2026-10-21. It returned HTTP 200 for a personal account and for a Workspace account, with only the cookies of the Electron session.

If the inbox uses category tabs, the feed for the whole inbox does not match the number that Gmail shows. In the test, the whole-inbox feed counted thousands of unread messages. The Primary feed (`%5Esq_ig_i_personal`) counted 2, the same as "Inbox (2)" in the Gmail page title. So Shifted learns, for each account, which feed matches Gmail. The first time Gmail loads, Shifted compares the number in the page title with the counts of both feeds.

Shifted also makes its new-mail notifications from the same feed. So they also work for an account whose Gmail is asleep.

## Consequences

- The Atom feed is an old Google feature with little documentation. Google can remove it. If the feed stops working, Shifted shows a warning mark on the badge, not a wrong number.
- Inbox types other than the default (for example "Important first" or "Multiple inboxes") can need the per-account override in configuration.
