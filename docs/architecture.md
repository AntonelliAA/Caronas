# Architecture

## Shape

A static Astro site plus a hosted Postgres. There is no server of ours anywhere.

```
browser ──► Astro static bundle (HTML + CSS + one JS module per page)
   │
   └──────► Supabase PostgREST  ──► Postgres, with RLS deciding every row
                  ▲
                  └── Supabase Auth (driver only, email + password)
```

The build emits two HTML files and some assets. `dist/` is 308 KB. Deploy it to
GitHub Pages, Netlify, Vercel, or any folder served over HTTP.

Authorization lives in the database, not in the app. RLS policies in
`schema.sql` are the only thing standing between the anon key and the data,
which is why every new table needs its policies written in the same commit.

## Layers

```
src/pages/index.astro  ─┐
src/pages/p.astro      ─┴─► markup + rendering + event wiring
                              │
                              ├─► src/lib/rides.ts     pure arithmetic, tested
                              ├─► src/lib/feriados.ts  pure calendar, tested
                              └─► src/lib/db.ts        the only Supabase caller
```

The split exists so the part that can be wrong in a way you would not notice,
the counting, is pure and covered by tests. Everything else is either markup or
a database call, and both of those fail loudly.

Each page is one JS module. Astro compiles the `<script>` block and ships it as
a module; there are no islands and no hydration because there is no framework.

## Data model

Four tables. `schema.sql` is the source of truth; this is the reasoning.

**`passengers`**: one row per person. `weekdays` is a `smallint[]` using
`Date.getDay()` numbering (0 = Sunday). `fare` is the price of a single day.
`token` is 16 hex characters and forms their personal URL.

`start_date` and `end_date` bound the range that counts. Without `start_date`,
adding someone on the 12th would backfill the whole month and overcharge them.
`end_date` is null while they still ride.

**`absences`**: `(passenger_id, day)` as the primary key, so marking twice is
impossible and unmarking is a plain delete. Rows only exist for exceptions,
which is why the table stays tiny.

**`day_overrides`**: `(day, has_ride)`. One table covers both directions: a
weekday where nobody rode (car in the shop, driver on vacation, a municipal
holiday the app does not know) and a public holiday where the ride happened
anyway. A separate "no ride days" table would have needed a second one for the
opposite case.

**`payments`**: `(passenger_id, month)` where month is `'YYYY-MM'`. The row
existing means paid. Deleting it means not paid.

## How a day is counted

A day counts as a ride for a person when all four hold:

1. the weekday is in their `weekdays`;
2. the date falls within `start_date … end_date`;
3. `isRideDay(day)` is true, meaning not a holiday unless an override says a
   ride happened;
4. no absence row exists for that person and day.

`report()` returns two numbers rather than one. `done` counts rides up to today
and is what the person owes right now. `planned` counts the whole month. On the
10th these are very different, and showing only the second one would tell
somebody they owe money they do not yet owe.

## Holidays without a network call

`src/lib/feriados.ts` computes Easter with the Meeus/Jones/Butcher algorithm and
derives Carnaval, Good Friday, and Corpus Christi from it. Fixed-date holidays
are a literal list. That is roughly forty lines and it works for any year,
offline, with no API key and nothing that expires.

The alternative was fetching a holiday API at build time, which adds a network
dependency to the build, a failure path, and a file that goes stale if the site
is not rebuilt. The closed-form calculation has none of those.

Rio Grande do Sul's state holiday (September 20) is in the list because the
driver is in Porto Alegre. Outside RS, delete that line.

## Two screens, two trust levels

**`/`** is the driver's. Supabase Auth with email and password, one user created
by hand in the Supabase dashboard. The session persists, so the login happens
once per device.

**`/p/?t=<token>`** is the passenger's. No login. The token identifies them and
nothing else.

The consequence is written down honestly in the README: anyone holding any link
can read the month and mark an absence for anyone. What that person cannot do is
change a fare, a schedule, or a payment. For four people who share a car every
day, that is the right line. The upgrade path, if the group ever grows past
people who know each other, is Supabase Auth for everyone and policies keyed on
`auth.uid()`.

## What was deliberately left out

- **No service worker.** The manifest alone is enough for Add to Home Screen on
  iOS. Offline support would mean deciding what happens to an absence marked
  with no signal, and that is a real design problem, not a cache.
- **No separate direction tracking (outbound/return).** The unit is a day.
- **No i18n.** The users are four Brazilians. The portfolio has two locales
  because recruiters read it; this does not.
- **No reminder notifications.** Would need a server or a push service. The
  passenger opens the link when they need it.
