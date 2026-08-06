# Caronas

A ride counter for the person who drives the same people every day.

The problem it solves: at the end of the month nobody remembers who rode on
which days. The usual answer is for the driver to log every ride, and that is
exactly what nobody sustains for thirty days.

This works the other way around. **Rides accrue on their own** from each
person's weekly schedule. The person who misses a day is the one who opens their
link and marks it. Absences are rare and rides are daily, so the typing lands on
the rare one.

Something else disappears on its own: **holidays**. Brazilian national holidays,
including the moveable ones derived from Easter, are computed inside the app.
None of them count as a ride, and you do nothing.

The UI is in Portuguese. Code and docs are in English.

---

## The two screens

**`/` is the driver's.** Email and password. It shows who rides today, what the month
is worth so far, who has paid, and the whole month as a ledger: one row per day,
one column per person. This is a screen for checking a number, not typing one.

**`/p/?t=…` is a passenger's.** No login; each person gets their own link. It opens
on "não vou hoje" and "não vou amanhã", which is what they need 95% of the time.
It also shows what they owe this month, so the number is never a surprise.

---

## Running it

Node 22.12+ and a Supabase project. The free tier is generous well past what
four people and a few dozen rows a month will use.

### 1. Database

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste all of [`schema.sql`](schema.sql) → *Run*.
3. **Authentication → Users → Add user**: create your own user with email and
   password, and tick *Auto Confirm User*. That is the driver login. Do not
   create users for the passengers, because they do not have one.

### 2. Keys

```sh
cp .env.example .env
```

Fill it from **Project Settings → API**: the *Project URL* and the *anon public*
key. Both ship inside the browser bundle, which is fine and intended. What
protects the data is the row-level security in `schema.sql`, not the secrecy of
the key.

### 3. Run

```sh
npm install
npm run dev      # http://localhost:4321
npm test         # the month's arithmetic
npm run build    # output in dist/
```

### 4. Add the people

Open `/`, expand **Quem anda junto** at the bottom, and add each person: name,
weekdays, price per day, the date they started. Then tap the share icon on their
row and send the link. Tell them to save it to their home screen, where it
installs as an app.

---

## Deploying

Static output. `dist/` runs anywhere.

- **Netlify / Vercel / Cloudflare Pages**: point at the repository, build command
  `npm run build`, publish directory `dist`. Set both `PUBLIC_*` variables in
  the provider's dashboard as well, because they are read at build time.
- **GitHub Pages on its own repository** (`user.github.io/caronas`): uncomment
  `base: '/caronas'` in [`astro.config.mjs`](astro.config.mjs). Internal links
  use `import.meta.env.BASE_URL` and follow it.

---

## What counts as a ride

A day counts for a person when all four are true:

1. the weekday is on their schedule;
2. the date is inside their range (`start_date` … `end_date`);
3. it is not a holiday, or it is one and you marked that the ride happened;
4. nobody marked otherwise.

Rule one has an escape hatch. Tap a cell in the ledger on a day that is not
theirs and it counts as a ride anyway, which is what happens when someone comes
along outside their usual days. Tapping again undoes it. In the ledger a normal
ride is a filled dot and one of these is the same colour, hollow.

The large number on screen is what **already happened** up to today. The "se o
mês fechar como está" figure beside it projects to the end of the month. They are
two numbers because on the 10th they are very different, and it is the first one
that somebody actually owes.

All of that arithmetic lives in [`src/lib/rides.ts`](src/lib/rides.ts) as pure
functions, with tests in [`test/rides.test.mjs`](test/rides.test.mjs). That
includes the case that fails silently: `new Date('2026-08-06')` is read as UTC and comes
back as the 5th in Porto Alegre.

## Things you will probably want to change

| What | Where |
|---|---|
| Drop the Rio Grande do Sul state holiday | `src/lib/feriados.ts`, the `09-20` line |
| Add a municipal holiday | Same list, or mark the day in the ledger |
| A day with no ride (car in the shop, vacation) | Tap the day number in the ledger |
| Each person's color | `--p0` / `--p1` / `--p2` in `global.css` |

## Trust model

Worth being explicit, because this is not a banking app:

- **Locked:** price per day, schedules, no-ride days, and payment marking. Driver
  login only.
- **Open to anyone holding a link:** reading the month, and marking or
  unmarking an absence. Not adding a ride: every write reachable without a
  login takes a day off a bill, and none of them put one on.
- **Closed to a visitor with no link:** the passengers table itself. Names,
  fares and tokens are unreadable by the anonymous role. A link resolves
  through one function that takes a token and returns that person without it,
  so no link can be traded for another.

The link is the password. It does not protect against someone already in the
group, and it is not meant to: they share a car every day. What it does protect
against is the site being on a public domain, which it is. If the group ever
grows to include people who do not know each other, the next step is a login for
everyone (Supabase Auth is already in the project) and policies keyed on
`auth.uid()`.

## Docs

- [docs/domain.md](docs/domain.md): the problem and the research behind the model
- [docs/architecture.md](docs/architecture.md): data model, layers, invariants
- [docs/design-system.md](docs/design-system.md): tokens, palette, layout rules
- [docs/workflow.md](docs/workflow.md): branching, commits, review
- [docs/agents.md](docs/agents.md): how AI agents work in this repo
- [CLAUDE.md](CLAUDE.md): the short rulebook loaded every session
