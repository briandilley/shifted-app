# Sign in with an honest user agent

Shifted never pretends to be another browser. Its user agent keeps the Electron form: the Chromium version, the name and version of Shifted, and the Electron version. Shifted shows Google's own sign-in page inside the session of the account.

Google blocks sign-in from browsers that use the user agent of another browser, for example Chrome. Some Electron wrappers fake a Chrome user agent to get past this block. We tested both choices on 2026-10-21 with a throwaway prototype on Electron 45 (Chromium 156), with one persistent session for each account:

- With a Chrome user agent (the Electron and app tokens removed), Google rejected the sign-in right after the email address: `Couldn't sign you in. This browser or app may not be secure.` This happened every time.
- With the default Electron user agent, Google allowed the sign-in through its simpler "lite" sign-in pages. A personal Gmail account and a Google Workspace account both reached Gmail. Calendar then loaded in the same session without a new sign-in. The session was still signed in after the app quit and started again.

## Consequences

- Passkeys do not work on macOS and Linux. Electron 45 has no passkey dialog of its own, so the passkey step waits forever or fails. You must click "Try another way" and use a password and 2-Step Verification, for example the prompt on your phone. Shifted tells you this in the sign-in window.
- On macOS, the passkeys of the user are in iCloud Keychain or on a phone. Apple lets an app use them on any website only with a browser entitlement. Apple grants that entitlement after a review against browser criteria, and a Gmail wrapper is unlikely to qualify.
- On Windows, Chromium gives passkey requests to Windows Hello, which shows its own dialog. This works in Electron in general, but we did not test it with Google.
- Electron 45 adds `app.configureWebAuthn({ touchID })` on macOS. It supports a Touch ID passkey that only Shifted on that Mac can use. An optional later prompt can add this after a prototype shows that Google lets an account create such a passkey.
- An account that can only sign in with a passkey or a hardware security key (for example Google Advanced Protection) was not tested. Expect it to fail.
- A Workspace account that signs in through a company identity provider (Okta, Microsoft Entra ID) was not tested.
- Google can change its rules at any time. Each prompt that touches sign-in has a hand check that signs in to a new account.

## Considered Options

- Fake a Chrome user agent, as some other wrappers do. Rejected because it breaks Google's rule and failed in our test.
- Sign in through the default browser with OAuth. Rejected because OAuth gives API tokens, not the Gmail web session that Shifted shows. See `docs/adr/0001-wrap-gmail-web-interface.md`.
