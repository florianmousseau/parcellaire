# AGENTS.md

The rules for this repo, for any agent working here. There is no `CLAUDE.md`
under version control, so this file is self-contained on purpose. Read
`README.md` for what the package is, then this.

## What this repo is, and what follows from it

Eleven pure modules extracted from `aucadastre` and `edifiable`, which consume
them in production. Two facts govern everything below:

- **It is a LIBRARY.** No component, no style, no route, no server. A change
  that only one of the two consumers wants does not belong here - the cut is
  read in the imports, not decided by whoever is writing today.
- **It is PUBLIC.** Anything committed here is world-readable forever, and the
  commit that removes a secret is the one that draws attention to it. Push
  protection and secret scanning are on; do not turn them off to get a push
  through.

The package is not published on npm today (`0.1.0`, `files: ["dist"]`). The day
it is, a burned version number is never reclaimed: bump the LAST digit, and in
doubt it is a patch.

## Branches, commits, PRs

- **One branch model: `main`, and nothing else.** No `develop`, no gitflow. The
  cockpit's `docs/gitflow.md` is the authority for every repo of the parc and it
  lists this one among the LIBRARIES that have no `develop`, alongside
  `selfstore`, `truecopy`, `asset-notation-js` and `spec`. Do not create a
  long-lived branch here without changing that file first.
- Work goes through a branch and a PR, never a direct push to `main`.
- **The repo is public, so a PR is merged only on checks that are PRESENT and
  PASSED** - never on a PR that carries no check at all. That is the whole
  reason `gate.yml` exists here.
- Branches, commits and PR titles: English, pure ASCII, conventional commits
  (`feat/fix/chore/docs/refactor/test/perf`). No tool prefix - not `claude/`,
  not `agent/`, not `codex/`: a merge commit carries the branch name into the
  history for good.
- Commit author: `Florian Mousseau <florian.mousseau@gmail.com>`. No trace of a
  tool or of an AI in any public field: no co-author trailer, no mention in a
  message or a PR body.
- "Pure ASCII" governs commits, branches, identifiers and code comments. It
  never governs the French text of `README.md`, which keeps its accents with a
  STRAIGHT apostrophe `'` - the curly one is banned.

## The gate

`npm run gate` is the door: `format:check`, `lint` (eslint with sonarjs, zero
warnings), `check` (`tsc --noEmit`), `test` (the node test runner over
`src/*.test.ts`). It must be green before a push.

**`.github/workflows/gate.yml` runs the same thing on every PR and on `main`,
on Node 24 and not on the `engines` floor** - `engines: node >=20` speaks for a
consumer importing the built `dist/*.js`, while `npm test` hands
`src/*.test.ts` straight to `node --test` and needs a runtime that strips
types. Do not "fix" the runner down to 20; it was measured red there.

**And here the workflow costs nothing** - Actions minutes are free on a public
repository. Do not copy the local-only arrangement of `aucadastre` and
`edifiable` into this repo: theirs is a private-repo billing decision, not a
principle.

The workflow adds one step the local gate does not have:
`npm audit --omit=dev --audit-level=high`, which judges only what a consumer
would install. The tree has no runtime dependency today, so it passes on an
empty set - which is the point: the day one is added, something is already
watching it, and a Dependabot PR is merged without anyone running anything
locally.

## Changing a module

- **A signature does not change while a module is moving.** `fonds.ts` and
  `cadastre-gouv.ts` are still waiting to leave the sites for that exact
  reason - `README.md` says why.
- Both consumers are read before a reading changes. A cut measured on one site's
  corpus can undo the other's the same day; that mistake has already been paid
  elsewhere in the parc.
- Every behaviour change carries a test. `src/*.test.ts` sits next to the module
  it covers.

## Security channels

Dependabot alerts, Dependabot security updates, secret scanning and push
protection are all enabled on this repository, and `.github/dependabot.yml`
opens the update PRs. Alerts and update PRs are two different things: the first
says a version is vulnerable, the second fixes it. Do not disable either.
