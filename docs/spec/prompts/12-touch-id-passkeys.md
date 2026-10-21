# Prompt 12 (optional): Touch ID passkeys on macOS

You are a coding agent. You try to add Touch ID passkeys to Shifted on macOS. Read `AGENTS.md` first and follow its rules.

This prompt is optional. It starts with a prototype, because Google can refuse the idea. Prompt 11 must be done first, because a passkey in the macOS keychain needs a signed build.

## Goal

At the end of this phase, you know the answer to one question: does Google let an account add a passkey inside Shifted on macOS? If Google allows it, the next sign-in of that account works with Touch ID.

## Read first

1. `AGENTS.md`
2. `docs/spec/docs/adr/0004-honest-user-agent-for-sign-in.md`
3. `docs/spec/PRODUCT.md`, section "Sign-in".
4. The Electron documentation of `app.configureWebAuthn` and the `select-webauthn-account` event. Read the type file `node_modules/electron/electron.d.ts` for the exact options of the installed version.

## Background

Electron 45 added `app.configureWebAuthn({ touchID })` on macOS. A passkey made this way stays in the keychain of that Mac, for Shifted only. It does not sync to other devices. Your passkeys in iCloud Keychain or on a phone still do not work. Apple allows them only in apps with a browser entitlement.

## Scope

### 1. Prototype

1. In a new branch, call `app.configureWebAuthn` with the `touchID` option at startup, on macOS only.
2. Sign in to a test account with a password.
3. In the Gmail view of that account, open the "Passkeys" page of the Google Account.
4. Try to create a passkey. Write down what Google shows.
5. Sign the account out. Sign in again and pick the new passkey. Write down what happens.
6. Write the results in `docs/decisions.md`.

### 2. If Google refuses

1. Stop.
2. Tell the person what Google showed.
3. Do not merge the branch.

### 3. If Google allows it

1. Keep the `touchID` option on macOS.
2. An account can have more than one passkey. For that case, handle `select-webauthn-account` and show a small list.
3. Change the top line of the sign-in window on macOS: "If you added a Shifted passkey, Google asks for Touch ID. Otherwise, click "Try another way"."
4. Add one paragraph to the README of the code repo that explains how to add a Shifted passkey.

## Out of scope

- Windows and Linux. Windows already uses Windows Hello. Linux has no passkey support in Electron.
- Passkeys from iCloud Keychain or a phone.

## Automated tests

- Unit: `configureWebAuthn` is called only on macOS.

## Manual tests

1. Add a Shifted passkey to a test account with the steps of the prototype.
2. Sign the account out and sign in again with Touch ID. Make sure that Gmail loads.
3. Make sure that a second account with no Shifted passkey still signs in with "Try another way".

## When you finish

If Google allowed it, merge the branch and commit with the message `Phase 12: Touch ID passkeys`. In both cases, tell the person the result.
