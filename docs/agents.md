# Working here as an AI agent

For subagents and for future sessions. `CLAUDE.md` at the root holds the rules
that apply to every task; this file is the workflow around them.

## Order of operations

1. **Read before writing.** `CLAUDE.md`, then `architecture.md` if the change
   touches data or counting, then `design-system.md` if it touches pixels.
2. **Write a spec** when the task is larger than a single obvious edit. Template
   below.
3. **Implement**, smallest change that works.
4. **Verify by running things.** Never report a result you have not seen.
5. **Report what you did, including what you skipped and why.**

## Specs

Non-trivial features get a spec in `docs/specs/` before code, named
`YYYY-MM-DD-<topic>.md`. The reason is not process for its own sake: a model
writes code confidently from a wrong assumption, and a spec is where the wrong
assumption becomes visible while it is still cheap.

Specs stay in the repo after shipping. When the behavior changes, the spec is
edited rather than abandoned. A spec that no longer matches the code is worse
than no spec, because it will be believed.

```markdown
# <Feature>

## Problem
What is wrong today, for whom. One paragraph, concrete.

## Behavior
What the person sees and does. Written from their side of the screen, not the
system's.

## Data
Tables, columns, and policies touched. Migration and rollback if the schema
moves.

## Edge cases
Month boundaries, timezones, someone joining or leaving mid-month, an empty
roster, a holiday, a network failure mid-write.

## Out of scope
What this deliberately does not do, so the next reader stops wondering.

## Verification
The exact commands and the exact expected output.
```

## Verification

A claim of completion needs evidence attached to it:

| Change | Proof |
|---|---|
| Anything in `src/lib/` | `npm test` output, plus a new case for the new branch |
| Anything visual | Screenshot at 390px, both themes |
| Anything in `schema.sql` | Ran on a real project; `anon` reach confirmed by request |
| Anything at all | `npm run build` passes |

Screenshotting a page needs one trick. Chrome headless clamps its viewport to
roughly 500px wide, so `--window-size=390,…` silently lies. Load the page in an
iframe fixed at 390px and screenshot the wrapper:

```sh
npm run build
cd dist && python3 -m http.server 8899 &
printf '<body style="margin:0"><iframe src="/" style="width:390px;height:2450px;border:0;display:block"></iframe></body>' > _shot.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --virtual-time-budget=4000 \
  --screenshot=out.png --window-size=390,2450 http://localhost:8899/_shot.html
rm dist/_shot.html
```

Both screens need data to show anything, so temporarily swapping `src/lib/db.ts`
for an in-memory stub is the fastest way to see a real render. Restore it before
committing, then rebuild, so `dist/` is never left holding the stub.

Looking at a screenshot caught three real bugs in this codebase. Reading the
code had caught none of them. It is worth the four commands.

## Where agents reliably go wrong here

- **Dates.** `new Date('2026-08-06')` is UTC and returns the 5th in Brazil. This
  is the single most likely way to ship a wrong number.
- **Astro style scoping.** `<style>` compiles to selectors carrying a scope
  attribute that only elements in the template receive. Most of this UI is built
  in JS, so scoped rules never reach it. Page styles are `is:global` for that
  reason; leave them that way.
- **The `hidden` attribute.** Any class with a `display` value beats the
  browser's `display: none` for `[hidden]`. `global.css` forces it with
  `!important`; do not remove that rule.
- **The `* { margin: 0 }` reset versus `<dialog>`.** A modal dialog is centred
  by the UA stylesheet's `margin: auto`, and the reset at the top of
  `global.css` wipes it, pinning the sheet to the top-left corner. It looks
  like a positioning bug and it is a specificity one. `dialog` restates
  `margin: auto`; do not remove it. This shipped unnoticed for a while because
  the screenshot check was only ever run at 390px, where the sheet is
  bottom-anchored and the bug does not show.
- **New tables without RLS.** Postgres does not warn. Supabase's Security
  Advisor does.
- **Fetch windows.** A screen that shows both "this month" and "today" needs a
  query range covering both, or one of them silently renders as empty.

## Scope discipline

The brief is the deliverable. Do not widen it because something nearby looks
improvable. Say so in the report instead and let the decision be made.

Deliberate shortcuts get a `ponytail:` comment naming the ceiling and the
upgrade path, so the next reader knows it was a decision rather than an
oversight. There is one in `src/pages/index.astro` about the three-color limit.

## Definition of done

- `npm test` passes, with a case covering whatever branch was added.
- `npm run build` passes.
- Anything visual verified at 390px in both themes.
- Docs updated in the same commit if behavior or architecture moved.
- The report says plainly what was skipped and why.
