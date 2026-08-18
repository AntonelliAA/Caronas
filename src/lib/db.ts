/**
 * Talks to Supabase. Runs entirely in the browser: the site is static, so
 * there is no server of ours in the middle.
 */
import { createClient } from '@supabase/supabase-js';
import type { Passenger } from './rides';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);

export const db = createClient(url ?? 'http://localhost', key ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type PassengerRow = Passenger & { token: string };

/** Postgres numeric arrives as a string in JSON. */
const toPassenger = (r: any): PassengerRow => ({ ...r, fare: Number(r.fare) });

export async function loadPassengers(): Promise<PassengerRow[]> {
  const { data, error } = await db.from('passengers').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(toPassenger);
}

/**
 * The passengers table is closed to anon, so the passenger screen goes through
 * the one function that trades a token for a person. What comes back never
 * includes the token, and never includes anybody else.
 */
export async function loadPassengerByToken(token: string): Promise<Passenger | null> {
  const { data, error } = await db.rpc('passenger_by_token', { t: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  // Not toPassenger: that one promises a token, and this row has none.
  return row ? { ...row, fare: Number(row.fare) } : null;
}

export type PaymentEntry = { id: string; amount: number; paid_at: string };

/** Everything the month needs, in a single round trip. */
export async function loadMonth(from: string, to: string, month: string) {
  const [marks, overrides, payments] = await Promise.all([
    db.from('day_marks').select('passenger_id, day, rode').gte('day', from).lte('day', to),
    db.from('day_overrides').select('day, has_ride, note').gte('day', from).lte('day', to),
    db.from('payments').select('id, passenger_id, amount, paid_at').eq('month', month),
  ]);
  const err = marks.error ?? overrides.error ?? payments.error;
  if (err) throw err;

  const byPassenger = new Map<string, Map<string, boolean>>();
  for (const m of marks.data ?? []) {
    let days = byPassenger.get(m.passenger_id);
    if (!days) byPassenger.set(m.passenger_id, (days = new Map()));
    days.set(m.day, m.rode);
  }

  // A passenger can pay in parts, so this is a list per person, not a single
  // row: paidSoFar in rides.ts sums it to decide whether the month is settled.
  const paymentsByPassenger = new Map<string, PaymentEntry[]>();
  for (const p of payments.data ?? []) {
    let entries = paymentsByPassenger.get(p.passenger_id);
    if (!entries) paymentsByPassenger.set(p.passenger_id, (entries = []));
    entries.push({ id: p.id, amount: Number(p.amount), paid_at: p.paid_at });
  }

  return {
    marks: byPassenger,
    overrides: new Map((overrides.data ?? []).map((o) => [o.day, o.has_ride] as const)),
    // Only days that actually carry a note. Mapping a missing one to '' put an
    // empty string in the map, and an empty string is not nullish, so every
    // `overrideNotes.get(day) ?? 'sem carona'` in the pages fell through to a
    // blank label instead of the fallback.
    overrideNotes: new Map(
      (overrides.data ?? [])
        .filter((o) => o.note)
        .map((o) => [o.day, o.note as string] as const),
    ),
    payments: paymentsByPassenger,
  };
}

/**
 * `rode` is what the ledger cell should become: false for an absence, true for
 * a ride outside their schedule, null to drop the row and let the weekly
 * schedule decide again.
 */
export async function setMark(passengerId: string, day: string, rode: boolean | null) {
  const q =
    rode === null
      ? db.from('day_marks').delete().eq('passenger_id', passengerId).eq('day', day)
      : db.from('day_marks').upsert({ passenger_id: passengerId, day, rode });
  const { error } = await q;
  if (error) throw error;
}

export async function setOverride(day: string, hasRide: boolean | null, note?: string) {
  const q =
    hasRide === null
      ? db.from('day_overrides').delete().eq('day', day)
      : db.from('day_overrides').upsert({ day, has_ride: hasRide, note: note ?? null });
  const { error } = await q;
  if (error) throw error;
}

/** One entry in the ledger: money the driver actually received, just now. */
export async function addPayment(passengerId: string, month: string, amount: number) {
  const { error } = await db.from('payments').insert({ passenger_id: passengerId, month, amount });
  if (error) throw error;
}

export async function removePayment(id: string) {
  const { error } = await db.from('payments').delete().eq('id', id);
  if (error) throw error;
}

export async function savePassenger(p: Partial<PassengerRow> & { name: string }) {
  const row = {
    name: p.name,
    weekdays: p.weekdays,
    fare: p.fare,
    start_date: p.start_date,
    end_date: p.end_date || null,
  };
  const q = p.id
    ? db.from('passengers').update(row).eq('id', p.id)
    : db.from('passengers').insert(row);
  const { error } = await q;
  if (error) throw error;
}

export async function removePassenger(id: string) {
  const { error } = await db.from('passengers').delete().eq('id', id);
  if (error) throw error;
}
