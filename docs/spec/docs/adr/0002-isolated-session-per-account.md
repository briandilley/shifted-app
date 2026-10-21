# One isolated session per account

Each account in Shifted has its own session: its own store of cookies, local storage, cache, and other site data. Shifted does not use Gmail's built-in multi-login, where one shared Google session holds several accounts at `mail.google.com/mail/u/0`, `/u/1`, and so on.

With a shared session, Google can sign every account out together, and the `u/N` number of an account can change after a sign-out. With one session per account, each account signs in, stays signed in, and signs out on its own.

## Consequences

- You sign in to each account separately, including 2-Step Verification.
- Each session must persist on disk, so that accounts stay signed in after Shifted restarts.
- Removing an account must delete its session from disk.
