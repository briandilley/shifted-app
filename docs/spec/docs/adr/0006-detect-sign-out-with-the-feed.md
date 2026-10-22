# Detect a sign-out with the feed, not with a navigation

If the Gmail Atom feed of an account says that the account is signed out, Shifted shows it as signed out. A visit of a Google app to `accounts.google.com` alone does not prove a sign-out. Shifted never shows Google's sign-in page in the content area.

The first version of prompt 01 stopped every navigation of the Gmail view to `accounts.google.com`. It then showed "This account is signed out." On 2026-10-21, the first build of Shifted showed that panel right after a real sign-in. At the same time, the unread badge of the same account showed a number. So the feed request with the same session worked, and the account was signed in. A signed-in Gmail also passes through `accounts.google.com`. For example, it goes there to set the cookies of `mail.google.com` on the first load after a sign-in, or to refresh its cookies later. The build did not record which Google page caused the panel.

## Decision

1. A main-frame HTTP redirect that only passes through `accounts.google.com` goes on.
2. Before a Google app shows a page of `accounts.google.com`, Shifted hides the Google view. When the view is back on a Gmail or Calendar page, Shifted shows it again.
3. Shifted reads the feed of the account only if the view stops on a page of `accounts.google.com` and is still there 3 seconds later.
   - If the feed says that the account is signed out, Shifted stops the page and shows the signed-out panel.
   - If the feed works, the visit is a cookie refresh. Google finishes it while the view stays hidden.
   - If the view is still on `accounts.google.com` after 15 seconds, Shifted loads the Google app again once from its start URL. If it comes back to `accounts.google.com`, Shifted shows the signed-out panel. So Shifted never loops.
   - If the feed fails for another reason, for example offline, the same 15-second limit applies.
4. A navigation can cause the signed-out panel. In that case, Shifted writes the host and the path of that page to the log of the main process. It never writes the query string or a cookie.

## Consequences

- The feed of a signed-in account can answer HTTP 401 while Gmail passes through `accounts.google.com` to get its cookies again, for example after a restart. A second test on 2026-10-21 showed this. So Shifted does not read the feed during the redirects, and a feed at the end of redirects through `accounts.google.com` counts as signed in.
- A real sign-out still shows the panel within a few seconds: 3 seconds and the time of one feed request.
- After a real sign-in, the content area can show its loading state for a moment while Google sets its cookies.
- The feed is now the source of truth for "signed in" in two places: the badges of prompt 04 and the signed-out panel. See `docs/adr/0005-unread-counts-from-gmail-atom-feed.md`.
- If Google removes the Atom feed, this check needs another source.

## Considered Options

- Stop every navigation to `accounts.google.com`, as the first version of prompt 01 did. Rejected because a signed-in Gmail also goes there.
- Show Google's page in the content area and let the person deal with it. Rejected because `PRODUCT.md` says that Shifted never shows Google's sign-in page in the content area.
- Allow a list of known paths of `accounts.google.com`, for example `CheckCookie`. Rejected because Google can change these paths at any time, and the feed gives a direct answer.
