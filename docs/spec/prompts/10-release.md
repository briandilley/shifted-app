# Prompt 10: Release

You are a coding agent. You finish version 1 of Shifted in this repo. Read `AGENTS.md` first and follow its rules.

## Goal

At the end of this phase, version 1 is complete. Every rule of the spec has code and a test or a manual test. The code repo has a README that a new person can follow.

## Read first

1. `AGENTS.md`
2. All of `docs/spec/PRODUCT.md`
3. `docs/decisions.md`
4. The "Manual tests" sections of every prompt in `docs/spec/prompts/`, from 01 to 09.

## Scope

### 1. Trace the spec

1. Go through `docs/spec/PRODUCT.md` one rule at a time.
2. For each rule, find the code that does it and the test that proves it. If no automated test can prove the rule, a manual test counts.
3. Write the result as a table in `docs/spec-trace.md`: section, rule, code, test.
4. If a rule has no code, build it. If a rule has no test, write one.
5. If a rule conflicts with what Shifted can do, stop and ask the person.

### 2. One manual test list

1. Collect the manual tests of prompts 01 to 09 into one list in `docs/manual-tests.md`.
2. Remove the duplicates. Put them in the order that a person does them on a fresh computer.
3. Add a column "Result" that the person fills in.

### 3. The README of the code repo

Write `README.md` with these sections:

1. What Shifted is, in two sentences.
2. What you need: Node.js 22.12 or newer, git, and macOS, Windows, or Linux.
3. How to run it: `npm install`, then `npm run dev`.
4. How to build it: `npm run build`, then the electron-builder command for an unsigned package of the current platform.
5. How to sign in. Include the "Try another way" step for passkeys on macOS and Linux.
6. Known limits:
   - Passkeys do not work on macOS and Linux.
   - Google can change its sign-in rules or remove the Atom feed at any time.
   - Links to Google Docs and Drive open in the default browser, which can be signed in as another account.
   - Chrome extensions do not run in Shifted.
7. Where Shifted keeps its data on each platform, and how to delete it.
8. A link to the spec repo: `https://github.com/briandilley/shifted`.

### 4. Version

1. Set the version in `package.json` to `1.0.0`.
2. Make sure that the user agent shows `Shifted/1.0.0`.

## Out of scope

- Signed installers and auto-update. Prompt 11 adds them.

## Automated tests

- All unit tests and end-to-end tests pass.
- A unit test reads the version from `package.json` and makes sure that the user agent contains it.

## Manual tests

1. Do every row of `docs/manual-tests.md` on your main computer. Fill in the "Result" column.
2. Give the README to someone who has never seen Shifted. Make sure that they can run it from source.

## When you finish

Commit with the message `Phase 10: release`. Tag the commit `v1.0.0`. Tell the person which manual tests to do.
