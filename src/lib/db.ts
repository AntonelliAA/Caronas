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

/** Everything the month needs, in a single round trip. */
export async function loadMonth(from: string, to: string, month: string) {
  const [marks, overrides, payments] = await Promise.all([
    db.from('day_marks').select('passenger_id, day, rode').gte('day', from).lte('day', to),
    db.from('day_overrides').select('day, has_ride, note').gte('day', from).lte('day', to),
    db.from('payments').select('passenger_id, amount, paid_at').eq('month', month),
  ]);
  const err = marks.error ?? overrides.error ?? payments.error;
  if (err) throw err;

  const byPassenger = new Map<string, Map<string, boolean>>();
  for (const m of marks.data ?? []) {
    let days = byPassenger.get(m.passenger_id);
    if (!days) byPassenger.set(m.passenger_id, (days = new Map()));
    days.set(m.day, m.rode);
  }

  return {
    marks: byPassenger,
    overrides: new Map((overrides.data ?? []).map((o) => [o.day, o.has_ride] as const)),
    overrideNotes: new Map((overrides.data ?? []).map((o) => [o.day, o.note ?? ''] as const)),
    paid: new Set((payments.data ?? []).map((p) => p.passenger_id)),
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

export async function setPaid(passengerId: string, month: string, paid: boolean, amount: number) {
  const q = paid
    ? db.from('payments').upsert({ passenger_id: passengerId, month, amount })
    : db.from('payments').delete().eq('passenger_id', passengerId).eq('month', month);
  const { error } = await q;
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
