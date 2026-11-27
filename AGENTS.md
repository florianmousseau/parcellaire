# AGENTS.md

Rules for any agent working in this repository. Read `README.md` first for what
the package is.

## What this repository is

Fifteen pure modules, used in production by several sites. Two facts govern
everything below:

- **It is a LIBRARY.** No component, no style, no route, no server. A change
  that only one consumer wants does not belong here.
- **It is PUBLIC.** Anything committed here is world-readable forever, and the
  commit that removes a secret is the one that draws attention to it. Push
  protection and secret scanning are on; do not turn them off to get a push
  through.

The package is not published on npm today (`0.1.0`, `files: ["dist"]`). The day
it is, a burned version number is never reclaimed: bump the LAST digit, and in
doubt it is a patch.

## Branches, commits, PRs

- **One branch: `main`.** No `develop`, no long-lived branch.
- Work goes through a branch and a PR, never a direct push to `main`.
- **A PR is merged only on checks that are PRESENT and PASSED**, never on a PR
  that carries no check at all.
- Branches, commits and PR titles: English, pure ASCII, conventional commits
  (`feat/fix/chore/docs/refactor/test/perf`). No tool prefix such as `claude/`,
  `agent/` or `codex/`: a merge commit keeps the branch name in the history.
- Commit author: `Florian Mousseau <florian.mousseau@gmail.com>`. No trace of a
  tool or of an AI in any public field: no co-author trailer, no mention in a
  message or a PR body. `pr-text.yml` checks it.
- Pure ASCII governs commits, branches, identifiers and code comments. Text in
  `README.md` may carry accents, with a straight apostrophe `'`.

## The gate

`npm run gate` runs `format:check`, `lint` (eslint with sonarjs, zero
warnings), `check` (`tsc --noEmit`) and `test` (the node test runner over
`src/*.test.ts`). It must be green before a push.

**`.github/workflows/gate.yml` runs the same thing on every PR and on `main`,
on Node 24 and not on the `engines` floor.** `engines: node >=20` speaks for a
consumer importing the built `dist/*.js`, while `npm test` hands
`src/*.test.ts` straight to `node --test` and needs a runtime that strips
types. Do not move the runner down to 20; it was measured red there.

The workflow adds one step the local gate does not have:
`npm audit --omit=dev --audit-level=high`, which judges only what a consumer
would install. There is no runtime dependency today, so it passes on an empty
set; the day one is added, it is already watched.

## Changing a module

- **A signature does not change without its consumers.** Exported names and
  types are an API: rename or reshape them only with every consumer updated.
- Every consumer is read before a reading changes. A cut measured on one site's
  corpus can undo another's the same day.
- Every behaviour change carries a test. `src/*.test.ts` sits next to the module
  it covers.
- No test touches the network.

## Security channels

Dependabot alerts, Dependabot security updates, secret scanning and push
protection are all enabled, and `.github/dependabot.yml` opens the update PRs.
Do not disable any of them.
