# Build all: the master prompt

You are a coding agent. You will build version 1 of Shifted, a desktop app that keeps several Gmail accounts in one window. You do this by running the phase prompts 00 to 09, one after the other, with no stops for the person.

The current folder is the code repo. The spec repo is a clone of `https://github.com/briandilley/shifted`. This file is in its `prompts/` folder. In this prompt, `<spec>` means the path of that clone.

## Rules for the whole run

1. Do not stop to ask the person for manual tests. The person does all manual tests at the end, from `docs/manual-tests.md`.
2. Stop and ask the person only in these cases:
   - A required tool is missing, for example Node.js 22.12 or newer.
   - The automated tests of a phase still fail after 3 repair attempts.
   - A phase finds a conflict with the spec. The section "Rules for the build agent" of `BUILD.md` says to stop in that case.
3. Never skip a phase. Never change the order.
4. Never edit the files in `docs/spec/` of the code repo.

## Step 1: Find out where you are

1. If `docs/build-progress.md` exists in the current folder, this is a restart. Go to step 3 and continue from the first phase that is not `done`.
2. If you do not know `<spec>`, clone `https://github.com/briandilley/shifted.git` into a new temporary folder outside the current folder. Use that folder as `<spec>`.
3. Make sure that the current folder is empty, or that it has only a `.git` folder. If it has other files, stop and ask the person.

## Step 2: Make sure that the tools are there

1. Run `git --version`.
2. Run `node --version`. The version must be 22.12 or newer.
3. If a tool is missing or too old, stop. Tell the person what to install.

## Step 3: Run the phases

The phases are the files in `<spec>/prompts/`, in this order:

| Phase | Prompt file |
| --- | --- |
| 00 | `00-bootstrap.md` |
| 01 | `01-one-account.md` |
| 02 | `02-many-accounts.md` |
| 03 | `03-links.md` |
| 04 | `04-unread-badges.md` |
| 05 | `05-notifications.md` |
| 06 | `06-mailto.md` |
| 07 | `07-shortcuts-and-background.md` |
| 08 | `08-hardening.md` |
| 09 | `09-release.md` |

Phase 00 copies the prompts into `docs/spec/prompts/` of the code repo. From phase 01 on, use the copies in `docs/spec/prompts/`.

### How to run one phase

Each phase needs a fresh context, because the whole build does not fit in one context.

1. If your agent can start a sub-agent with its own fresh context, start one sub-agent for each phase. An example is the Agent tool of Claude Code. Give the sub-agent the message in "The message for a phase" below.
2. If your agent cannot start sub-agents, run the phase yourself. Before you start it, read `docs/build-progress.md` and the prompt of the phase again. Do not trust your memory of earlier phases.

### The message for a phase

For phase 00, send this message. Put the real paths in place of `<code repo>` and `<spec>`.

```text
You are in the code repo at <code repo>. Read <spec>/prompts/00-bootstrap.md
and do what it says. The spec repo is at <spec>. Do not wait for manual
tests: the person does them at the end. When you finish, reply with the
commit hash, the result of the automated tests, and the choices that you
wrote in docs/decisions.md.
```

For the phases 01 to 09, send this message. Put the real file name in place of `<prompt file>`.

```text
You are in the code repo at <code repo>. Read AGENTS.md, then read
docs/spec/prompts/<prompt file> and do what it says. Do not wait for
manual tests: the person does them at the end. When you finish, reply
with the commit hash, the result of the automated tests, and the choices
that you wrote in docs/decisions.md.
```

### After each phase

1. Make sure that the last commit message starts with `Phase NN:`, where NN is the number of the phase.
2. Make sure that `git status` shows no changes.
3. Run `npm test` and `npm run test:e2e` yourself. Both must pass.
4. If a step above fails, send the phase back with the error output. If the same sub-agent is still open, use it. Otherwise, start a new one. Allow 3 repair attempts for each phase. After the third failed attempt, stop and ask the person.
5. Update `docs/build-progress.md`. Commit it with the message `Build progress: phase NN done`.

## The progress file

Make `docs/build-progress.md` right after phase 00. Keep it in this form:

```markdown
# Build progress

| Phase | Status | Commit | Repair attempts | Notes |
| --- | --- | --- | --- | --- |
| 00 | done | abc1234 | 0 | |
| 01 | running | | 0 | |
| 02 | todo | | 0 | |
```

The status is `todo`, `running`, `done`, or `stopped`. In "Notes", write one line about any choice that the phase wrote in `docs/decisions.md`.

## Step 4: Finish

After phase 09 is `done`:

1. If you made a temporary clone of the spec repo in step 1, delete it.
2. Tell the person that the build is complete.
3. Tell the person to start Shifted with `npm run dev` and to do every row of `docs/manual-tests.md`.
4. Give the person a short list of the choices in `docs/decisions.md`.
5. Tell the person that the prompts 10 (installers and updates) and 11 (Touch ID passkeys) are optional. They need accounts and certificates of the person. Run them only at the request of the person.
