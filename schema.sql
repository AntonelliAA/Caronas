-- Caronas — full schema.
-- Paste this whole file into the Supabase SQL Editor and run it. Re-running is safe.
--
-- Trust model, stated plainly so nobody is surprised later:
--   · Driver     → a real login (email + password). Only they can touch fare,
--                  schedule, no-ride days, and payment.
--   · Passenger  → no login. Their personal link carries a token. Anyone
--                  holding any link can read the month and mark or unmark an
--                  absence for anyone. What they cannot do is add a ride:
--                  without a login, every reachable write lowers a bill and
--                  none of them raise one. This is four people who share a car
--                  every day; the money is what needs a lock, and it has one.

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------- tables ---

create table if not exists passengers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- 0 = Sunday … 6 = Saturday. Same numbering as Date.getDay().
  weekdays    smallint[] not null default '{1,2,3,4,5}',
  fare        numeric(10, 2) not null default 0,   -- price per day of riding
  start_date  date not null default current_date,  -- no day before this counts
  end_date    date,                                -- null = still riding
  token       text not null unique default encode(gen_random_bytes(8), 'hex'),
  created_at  timestamptz not null default now()
);

-- One row per exception to somebody's schedule, in either direction.
-- rode = false: a scheduled day they did not ride, the common case.
-- rode = true:  a ride on a day that is not theirs, when the driver takes
--               someone along outside their usual days.
-- No row means the weekly schedule decides, which is the point of the app.
create table if not exists day_marks (
  passenger_id uuid not null references passengers (id) on delete cascade,
  day          date not null,
  rode         boolean not null default false,
  note         text,
  created_at   timestamptz not null default now(),
  primary key (passenger_id, day)
);

create index if not exists day_marks_day_idx on day_marks (day);

-- A day where the normal rule does not hold. has_ride = false: nobody rode
-- (a holiday the app does not know about, the car in the shop, driver on
-- vacation). has_ride = true: a ride happened on a day the app would treat as
-- a holiday.
create table if not exists day_overrides (
  day        date primary key,
  has_ride   boolean not null,
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  passenger_id uuid not null references passengers (id) on delete cascade,
  month        text not null check (month ~ '^\d{4}-\d{2}$'),
  amount       numeric(10, 2),
  paid_at      timestamptz not null default now(),
  primary key (passenger_id, month)
);

-- -------------------------------------------------------------------- rls ---
-- Every table in the public schema gets RLS. A table without it is readable and
-- writable by anyone holding the project URL and the anon key.

alter table passengers    enable row level security;
alter table day_marks     enable row level security;
alter table day_overrides enable row level security;
alter table payments      enable row level security;

drop policy if exists "public read"         on passengers;
drop policy if exists "public read"         on day_marks;
drop policy if exists "public read"         on day_overrides;
drop policy if exists "public read"         on payments;
drop policy if exists "passenger marks"     on day_marks;
drop policy if exists "passenger unmarks"   on day_marks;
drop policy if exists "driver"              on passengers;
drop policy if exists "driver"              on day_marks;
drop policy if exists "driver"              on day_overrides;
drop policy if exists "driver"              on payments;
drop policy if exists "passenger corrects"  on day_marks;

-- Everyone reads: both screens have to render a month without a login.
create policy "public read" on passengers    for select using (true);
create policy "public read" on day_marks     for select using (true);
create policy "public read" on day_overrides for select using (true);
create policy "public read" on payments      for select using (true);

-- A passenger marks and unmarks an absence from their link, no login. Every
-- one of these is pinned to rode = false, so the only writes reachable without
-- a login take a day off a bill. Adding a ride raises what somebody owes, and
-- that stays with the driver.
create policy "passenger marks"    on day_marks for insert to anon with check (rode = false);
create policy "passenger unmarks"  on day_marks for delete to anon using (rode = false);
create policy "passenger corrects" on day_marks for update to anon using (rode = false) with check (rode = false);

-- Fare, schedule, no-ride days, payment, and any ride added by hand: signed-in
-- driver only.
create policy "driver" on day_marks     for all to authenticated using (true) with check (true);
create policy "driver" on passengers    for all to authenticated using (true) with check (true);
create policy "driver" on day_overrides for all to authenticated using (true) with check (true);
create policy "driver" on payments      for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------- example ---
-- Uncomment and adjust to start with people already registered.
--
-- insert into passengers (name, weekdays, fare) values
--   ('Marcos',  '{1,2,3}',     15.00),
--   ('Juliana', '{1,3}',       15.00),
--   ('Renata',  '{1,2,3,4,5}', 12.00);

-- -------------------------------------------------------------- migration ---
-- Only if you already ran an earlier version of this file and have an
-- `absences` table with data in it. Run this once instead of the create above;
-- it renames in place and keeps every row.
--
-- alter table absences rename to day_marks;
-- alter table day_marks add column if not exists rode boolean not null default false;
-- alter index absences_day_idx rename to day_marks_day_idx;
--
-- Then re-run the whole policy section, which is safe on its own.
