# Git workflow

## Branching: trunk-based

`main` is always deployable. Work happens on short-lived branches that merge
back within a day or two.

```
main ──●──────●───────────●──────►
        \    /   \       /
         ●──●     ●─────●
      feat/x     fix/y
```

Full GitFlow, with `develop`, `release/*` and `hotfix/*`, exists to coordinate several
teams around scheduled releases. This is one developer and a continuously
deployed static site. The extra branches would be ceremony with nothing to
coordinate. [Trunk-based development](https://trunkbaseddevelopment.com/)
is the documented pattern for exactly this scale.

Branch names: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/` plus a short
kebab-case description. `feat/monthly-export`, `fix/holiday-year-rollover`.

Trivial changes like a typo, a comment, or a doc line can go straight to `main`.
Anything that touches `src/lib/`, `schema.sql`, or money gets a branch, because
a branch is what makes the diff reviewable.

## Commits are atomic

One commit, one logical change. The working test is whether the commit can be
reverted on its own without dragging something unrelated out with it.

- If the subject line needs the word "and", it is two commits.
- Formatting never travels with logic. A rename, a reindent, or a
  find-and-replace goes in its own commit, so the diff that matters stays
  readable underneath it.
- A commit leaves the tree in a state where `npm test` and `npm run build` pass.
  A commit that only works once the next one lands is half a commit. The one
  exemption is an initial import, where the early commits describe a project
  that does not have a runnable shape yet; `40e0764` is the example in this
  history.
- Staging is a tool. When a session produced two unrelated things, `git add -p`
  separates them rather than committing both and apologising in the message.

Six commits on a branch that each say something beat one commit saying
"implement feature". Reverting, bisecting, and reviewing all work at the
granularity you commit at.

## Commit messages

The subject line follows [Google's CL description
rules](https://google.github.io/eng-practices/review/developer/cl-descriptions.html).
The `Test-plan:` trailer is borrowed from the Phabricator template Meta uses,
because `docs/agents.md` already requires evidence and the commit is where it
stays attached. Meta spells the field `Test Plan`; the hyphen is not cosmetic,
because a git trailer token cannot contain a space and one invalid line voids
every trailer in the block.

```
<area>: <complete sentence in the imperative, no trailing period>

<why this change exists: the problem, and what it was doing to someone.>

<why this approach and not the obvious alternative. Any limitation left behind.>

Test-plan: <what you ran and what it printed>
Co-Authored-By: <agent, when one wrote the commit>
```

Rules that matter:

- **Imperative mood.** "Count only days inside the range", not "Counting" and
  not "Counted". The subject completes the sentence "This commit will…".
- **The subject says what, the body says why.** The diff already shows how.
- Subject at 72 characters or less, body wrapped at 72. Blank line between them.
- `<area>` is the part of the app that moved: `rides`, `feriados`, `db`,
  `driver`, `passenger`, `schema`, `design`, `docs`, `build`.
- Subjects Google names as failures, and so do we: "Fix bug", "Fix build",
  "Update code", "Add convenience functions", "Moving code from A to B". They
  describe the act of committing rather than the change.

```
rides: count only days inside the passenger's date range

Adding someone on the 12th backfilled the whole month, so the first invoice
charged them for days they never rode.

dayState() now returns 'off' for any day before start_date or after
end_date. Filtering in the query would have been narrower, but the same
range has to hold for the month projection, and that is computed in the
browser.

Test-plan: npm test, 11 passing, including a new case for a mid-month join.
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Attribution

A commit written by an AI agent carries a `Co-Authored-By` trailer naming it.
Authorship is a fact about how the code got there, and it is worth keeping where
the fact belongs rather than in someone's memory of the week.

Both trailers sit in the last paragraph with no blank line between them, so
`git log --format='%(trailers)'` reads them. Two parser rules bite, and both
fail silently by dropping every trailer in the block rather than complaining:

- the token cannot contain a space, which is why the field is `Test-plan`;
- a wrapped value continues on an indented line. An unindented second line
  reads as prose and voids the block.

Keep the value to one line and neither rule can bite. Check with
`git interpret-trailers --parse` when in doubt.

Commits `40e0764` through `f1c69cc` predate this rule and spell the field
`Test plan`. They were left alone rather than rewritten.

## Pull requests

Solo work does not need a PR for every change, but open one when the change
touches money, the schema, or authorization. A PR is the only place a decision
gets written down where it can be found again.

The description answers three questions: what changes for the person using the
app, why this approach over the obvious alternative, and how it was verified.
Paste the `npm test` output. For anything visual, attach a screenshot at 390px
in both themes.

## Before merging

```sh
npm test         # must pass
npm run build    # must pass
```

Schema changes carry their own checklist:

- RLS enabled on every new table, in the same commit.
- Policies written for both the `anon` and `authenticated` roles.
- `schema.sql` still runs clean end to end on a fresh project. The file uses
  `if not exists` and `drop policy if exists` so it stays re-runnable; keep it
  that way.
- Confirm what `anon` can actually reach. `curl` the REST endpoint with the anon
  key rather than assuming the policy does what it reads like.

## Releasing

Push to `main`. Whatever hosts `dist/` rebuilds. There are no version numbers,
no tags, and no changelog, because there is no one to notify and nothing to pin.

Add tags the day a second person depends on a specific build.

## Secrets

`.env` is git-ignored and stays that way. `.env.example` carries the shape with
no values.

The two `PUBLIC_*` keys are meant to be public. They ship inside the browser
bundle by design, and RLS is what protects the data. The Supabase
`service_role` key is a different animal: it bypasses every policy. It has no
reason to exist anywhere in this repository, in a `.env`, or in a hosting
provider's environment panel.
