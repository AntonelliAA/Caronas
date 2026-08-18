# Design system

The tokens come from the portfolio (`antonelliaa.github.io`) so the brand carries
over. The layout does not: that is a page you read, this is a tool you use in a
parked car before pulling away.

## Tokens

Defined once in `src/styles/global.css`. Light is the default; dark comes from
`prefers-color-scheme` or from `data-theme` on `<html>`, and the toggle wins over
the OS in both directions.

| Role | Light | Dark |
|---|---|---|
| `--bg-primary` | `#FBFAF9` | `#0C1120` |
| `--bg-secondary` | `#F2F0ED` | `#131A2E` |
| `--text-primary` | `#14161A` (17.4:1) | `#F8FAFC` (17.2:1) |
| `--text-secondary` | `#4E545F` (7.3:1) | `#8895A7` (6.2:1) |
| `--accent` | `#C1121F` (6.0:1) | `#F72C25` (4.8:1) |
| `--accent-strong` | `#C1121F` | `#D81E14` |

The red is reserved. It marks the brand, today, an absence, and money. Using it
for anything else costs it its meaning.

Type is the native stack: SF Pro on Apple platforms, `ui-monospace` for the
mono face. No webfont request, no external origin. Numbers everywhere use
`font-variant-numeric: tabular-nums`, because columns of money that shift
around are hard to scan.

## Per-person color

Three hues carry identity, in this fixed order:

| Slot | Light | Dark |
|---|---|---|
| `--p0` | `#2A78D6` | `#3987E5` |
| `--p1` | `#1BAF7A` | `#199E70` |
| `--p2` | `#EDA100` | `#C98500` |

Validated with the `dataviz` skill's palette checker under `--pairs all` in both
modes: worst pair separation 9.1 ΔE for color vision deficiency (target ≥ 8) and
22.9 ΔE for normal vision (floor 15). Two earlier candidates failed and were
dropped. Violet collides with blue in dark mode (1.9 ΔE) and magenta collides
with aqua (1.6 ΔE).

Color never carries meaning alone. Every colored dot sits next to a name or
under a named column. Slot assignment is by roster position, so a fourth person
reuses `--p0`; validate a fourth hue in both modes before adding `--p3`.

An earlier version used initials in colored circles. White text on the yellow
reaches about 2:1 contrast and on the blue about 4.4:1, both short of the 4.5:1
that small text needs. Darkening the fills would have broken the validated set.
Dropping the monogram fixed the contrast and removed the most templated-looking
element on the screen at the same time.

## The ledger

The month is a timesheet: one row per day, one column per person. A filled dot
means they rode, a red ✕ means they were absent, a hairline dash means the day
is not theirs, and a full-width rule replaces the row when nobody rode.

It is the signature element, and the choice was deliberate over a seven-column
calendar grid. Three people per cell does not fit legibly at 390px, and the
question being asked is "who rode when", which reads down a column. Days where
nobody is scheduled are dropped, so weekends disappear and August fits in about
twenty rows.

## The person sheet

The editor is a bottom sheet under 720px and a centred card above it. It is the
only place in the app where anybody types, and it is reached with one thumb, so
on a phone it rises from the edge the thumb is already on.

It carries a live projection of what the schedule is worth: *20 caronas em
agosto de 2026, R$ 360,00 no mês*. The weekly schedule is the engine of the
whole product and the bill is what it produces, so the form shows the bill
while it is being filled in rather than at the end of the month. It runs the
same `report()` the ledger runs, so holidays and days the driver called off are
already out of the count.

Three things it deliberately does not do: no "seg a sex" shortcut, because a
new person already opens with Monday to Friday selected and the shortcut would
save nobody a tap; no `+R$1 / +R$5` steppers, because a fare is set once and
`type="number"` already steps; no drag-to-dismiss, because that needs a pointer
handler and a velocity threshold to feel right and the backdrop already closes
it.

Selected weekdays are ink, not red. Five red chips on an empty form made a new
person look like a problem, and red is spent on absences, today, and money.

## Rules that are checked, not felt

- 390px is the design target. Verify at that width. Chrome's headless mode
  clamps the viewport to roughly 500px, so screenshot inside an iframe sized to
  390px or the check proves nothing.
- Anything with a layout that changes at 720px gets shot at both widths. The
  dialog sat pinned to the top-left corner on every wide screen for as long as
  the check only ever ran at 390px, where it is anchored to the bottom edge and
  looks right.
- Tap targets are at least 44px. `--tap` exists for this.
- Every interactive element has an accessible name. Icon-only buttons need
  `aria-label`; toggles need `aria-pressed`.
- Form inputs stay at `font-size: 1rem` or larger, otherwise iOS zooms on focus.
- `prefers-reduced-motion` is honored globally.
- The page body never scrolls horizontally.

## Signals to avoid

The portfolio's design notes catalogue the visual accent of AI-generated sites.
The same list applies here, and the audit is worth re-running whenever the UI
changes:

Gradient text, glassmorphism, uppercase section labels, a badge floating above
the H1, cards with one colored edge, feature cards with an icon on top, emoji
standing in for icons, an unmotivated 01 / 02 / 03 sequence, a horizontal strip
of statistics, body text that fails contrast, and a permanent dark mode with no
alternative.

Current state: none present. Section labels are lowercase mono. The one drawn
object in the whole app is the steering wheel in `Wheel.astro`. Everything else
is type and hairlines.
