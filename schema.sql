-- Caronas — full schema.
-- Paste this whole file into the Supabase SQL Editor and run it. Re-running is safe.
--
-- Trust model, stated plainly so nobody is surprised later:
--   · Driver     → a real login (email + password). Only they can touch fare,
--                  schedule, no-ride days, and payment.
--   · Passenger  → no login. Their personal link carries a token, and the
--                  token is the only thing that resolves to a person. The
--                  passengers table is closed to anon entirely, so a visitor
--                  cannot list names, fares, or anybody else's token.
--                  With a token in hand they can mark or unmark an absence.
--                  What they cannot do is add a ride: without a login, every
--                  reachable write lowers a bill and none of them raise one.

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

-- Everything is dropped by table, not by name. Dropping a list of known names
-- only undoes what this file wrote, and the access that actually leaked was a
-- select policy on passengers created in the table editor under a name this
-- file never knew. What follows the drop is the whole intended policy set, so
-- the file declares the end state instead of trusting what a human clicked.
--
-- The sweep covers every table in `public`, not the four this file owns. It
-- used to name them, and that left a hole exactly the shape of the bug it was
-- written to prevent: the orphaned `absences` table sat here for months with
-- select, insert and delete all granted to `public` using (true), and no run
-- of this file ever touched it because it was not on the list. A table this
-- file does not recreate below ends up with RLS on and no policy, which is
-- closed rather than open, so the wide sweep fails in the safe direction.
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- passengers gets no policy at all below: RLS is on and anon has no business
-- reading names, fares, or other people's tokens. The only way in is
-- passenger_by_token, further down.

-- The month has to render without a login, so the day tables stay readable.
-- They are keyed by passenger uuid and say nothing on their own once the
-- passengers table is closed.
create policy "public read" on day_marks     for select using (true);
create policy "public read" on day_overrides for select using (true);
create policy "public read" on payments      for select using (true);

-- A passenger marks and unmarks an absence from their link, no login. Every
-- one of these is pinned to rode = false, so the only writes reachable without
-- a login take a day off a bill. Adding a ride raises what somebody owes, and
-- that stays with the driver.
--
-- Writing an absence is also bounded to the day of the trip or later. Without
-- it, somebody could reopen a closed month and subtract days they had already
-- been billed for, and the driver would have no way to know it happened.
--
-- The date is Brazil's, not the server's. Supabase runs the database in UTC,
-- so `current_date` rolls over at 21:00 in Porto Alegre and a passenger
-- marking tonight's absence after nine would be refused for a day that, where
-- they are standing, has not ended. This is the same trap as parseYmd on the
-- client, one layer down.
create policy "passenger marks" on day_marks
  for insert to anon
  with check (rode = false and day >= (now() at time zone 'America/Sao_Paulo')::date);

create policy "passenger corrects" on day_marks
  for update to anon
  using (rode = false)
  with check (rode = false and day >= (now() at time zone 'America/Sao_Paulo')::date);

-- Undoing carries no deadline, and deliberately so. Deleting an absence puts
-- the day back on the bill, so it is the one anon write that costs the person
-- money rather than saving it, and there is nothing to abuse. Bounding it
-- would only trap a mistyped absence past midnight with no way back.
create policy "passenger unmarks" on day_marks for delete to anon using (rode = false);

-- Fare, schedule, no-ride days, payment, and any ride added by hand: signed-in
-- driver only.
create policy "driver" on day_marks     for all to authenticated using (true) with check (true);
create policy "driver" on passengers    for all to authenticated using (true) with check (true);
create policy "driver" on day_overrides for all to authenticated using (true) with check (true);
create policy "driver" on payments      for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------ token lookup ---
-- The passengers table is closed to anon, so a passenger's own link needs one
-- way in. This is it, and it is the only one.
--
-- security definer is what lets the function read a table the caller cannot,
-- which is exactly why it is written narrowly: it takes a token, returns at
-- most the one row that matches, and never returns the token column, so one
-- person's link cannot be traded for anybody else's. search_path is emptied
-- and every name qualified, so it cannot be pointed at a different table.
--
-- Enumeration is not a practical attack on a 16 hex character token, and the
-- function offers no other way to ask.
create or replace function public.passenger_by_token(t text)
returns table (
  id         uuid,
  name       text,
  weekdays   smallint[],
  fare       numeric,
  start_date date,
  end_date   date
)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.name, p.weekdays, p.fare, p.start_date, p.end_date
  from public.passengers p
  where p.token = t
$$;

revoke execute on function public.passenger_by_token(text) from public;
grant execute on function public.passenger_by_token(text) to anon, authenticated;

-- PostgREST caches the schema. Without this the function 404s until it
-- happens to reload on its own.
notify pgrst, 'reload schema';

-- What actually ended up on the database, printed because the one bug this
-- file has ever shipped was a policy nobody knew was there.
--
-- Expect ten rows: five on day_marks, two on day_overrides, two on payments,
-- and exactly one on passengers, the driver's. Any row on passengers granted
-- to anon is the leak this whole file is shaped around, whatever it is called.
-- (This said eight for a while and the file creates ten, which is the sort of
-- thing that turns a check into decoration. Count them if you change them.)
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

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
--
-- On this project the rename never ran: day_marks was created fresh next to
-- `absences`, which stayed behind holding two rows that already existed in
-- day_marks, and three policies granted to public. It was dropped on
-- 2026-08-17 after checking both rows against day_marks one at a time. If you
-- are looking at a database that still has one, check before you drop:
--
-- select a.day, a.passenger_id,
--        exists (select 1 from day_marks m
--                where m.passenger_id = a.passenger_id and m.day = a.day)
-- from absences a;
--
-- Every row must come back true. Then `drop table absences`.
--
-- If anon could read passengers on your database, re-running this whole file
-- closes it whatever the policy was called. Then rotate, because a token that
-- was served publicly is spent:
--
-- update passengers set token = encode(gen_random_bytes(8), 'hex');
--
-- and resend every personal link from the driver screen.
