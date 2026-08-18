# CLAUDE.md

Caronas is a carpool ride counter. The driver gives rides to a small fixed
group; the app counts each person's days and closes the month's money.

**The inversion that defines the product:** rides accrue automatically from each
person's weekly schedule. Only an *absence* is entered, and the passenger enters
it, not the driver. Any change that makes the driver log rides is wrong.

## Commands

```sh
npm run dev      # localhost:4321
npm test         # node:test over the month arithmetic
npm run build    # static output in dist/
```

`npm test` and `npm run build` must both pass before you claim work is done.
Run them; do not predict their output.

## Non-negotiables

These break silently. The site still renders and the money comes out wrong.

1. **Never `new Date('YYYY-MM-DD')`.** It parses as UTC and returns the previous
   day in Brazil. Use `parseYmd` from `src/lib/rides.ts`.
2. **Money goes through `money()`** in the same file. Never a raw float.
3. **Only the driver can raise a bill.** The `anon` policies on `day_marks` are
   pinned to `rode = false`. Adding a ride is `rode = true` and needs the login.
   Keep it that way when touching policies.
4. **`passengers` is closed to `anon`.** Names, fares and tokens are not public
   and the site is. The passenger screen goes through `passenger_by_token`;
   never add a public select policy back to that table.
5. **Ride math stays pure** and stays in `src/lib/rides.ts`. No DOM, no fetch, no
   `Date.now()` inside it, because `today` is always a parameter. Every branch you add
   there needs a case in `test/rides.test.mjs`.
6. **RLS on every new table**, plus its policies, in `schema.sql`. A table without
   RLS is world-writable by anyone holding the anon key.
7. **Fare, schedule, no-ride days, and payments are driver-only** (`to
   authenticated`). Absences are deliberately open, which is what lets a
   passenger use their link without a login — but only for the day of the trip
   or later, so a closed month cannot be reopened. Any date comparison in a
   policy uses `(now() at time zone 'America/Sao_Paulo')::date`, never
   `current_date`: the database runs in UTC and rolls over at 21:00 in Porto
   Alegre. It is rule 1 again, one layer down.
8. **Page `<style>` blocks are `is:global`.** Astro scopes styles to elements in
   the template, and most of the UI is built in JS at runtime, so scoped rules
   never reach it.

## Where things live

| Path | What |
|---|---|
| `src/lib/rides.ts` | All month arithmetic. Pure, tested. |
| `src/lib/feriados.ts` | Brazilian holidays, computed from Easter. No network. |
| `src/lib/db.ts` | Every Supabase call. Nothing else talks to the database. |
| `src/pages/index.astro` | Driver screen. Login, ledger, totals, roster. |
| `src/pages/p.astro` | Passenger screen. Reached at `/p/?t=<token>`. |
| `src/styles/global.css` | Tokens and shared components. |
| `schema.sql` | Tables and RLS policies. The whole backend. |

## Conventions

- **Language:** code, comments, docs, and commits in English. UI copy and user-facing
  strings in pt-BR, because the people using this are Brazilian.
- **Comments explain why, never what.** If a comment restates the code, delete it.
- **Commits are atomic**, subject in the imperative as `area: sentence`, and they
  carry a `Test plan:` trailer. Format and examples in `docs/workflow.md`.
- **Vanilla only.** No UI framework, no state library, no CSS framework. One
  runtime dependency (`@supabase/supabase-js`) and it is there for auth session
  handling. Adding a dependency needs a reason written in the PR.
- **Mobile first.** 390px is the design target. Tap targets ≥ 44px.
- **Accessibility ships with the feature.** Every interactive element gets an
  accessible name, color never carries meaning alone, and
  `prefers-reduced-motion` is honored.

## Before you start

Read `docs/architecture.md` for the data model and the invariants behind it.
Read `docs/agents.md` for how work is scoped, specced, and verified here.
Read `docs/design-system.md` before touching anything visual.
