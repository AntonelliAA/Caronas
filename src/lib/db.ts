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

export async function loadPassengerByToken(token: string): Promise<PassengerRow | null> {
  const { data, error } = await db.from('passengers').select('*').eq('token', token).maybeSingle();
  if (error) throw error;
  return data ? toPassenger(data) : null;
}

/** Everything the month needs, in a single round trip. */
export async function loadMonth(from: string, to: string, month: string) {
  const [absences, overrides, payments] = await Promise.all([
    db.from('absences').select('passenger_id, day, note').gte('day', from).lte('day', to),
    db.from('day_overrides').select('day, has_ride, note').gte('day', from).lte('day', to),
    db.from('payments').select('passenger_id, amount, paid_at').eq('month', month),
  ]);
  const err = absences.error ?? overrides.error ?? payments.error;
  if (err) throw err;

  const byPassenger = new Map<string, Set<string>>();
  for (const a of absences.data ?? []) {
    let set = byPassenger.get(a.passenger_id);
    if (!set) byPassenger.set(a.passenger_id, (set = new Set()));
    set.add(a.day);
  }

  return {
    absences: byPassenger,
    overrides: new Map((overrides.data ?? []).map((o) => [o.day, o.has_ride] as const)),
    overrideNotes: new Map((overrides.data ?? []).map((o) => [o.day, o.note ?? ''] as const)),
    paid: new Set((payments.data ?? []).map((p) => p.passenger_id)),
  };
}

export async function setAbsence(passengerId: string, day: string, absent: boolean) {
  const q = absent
    ? db.from('absences').insert({ passenger_id: passengerId, day })
    : db.from('absences').delete().eq('passenger_id', passengerId).eq('day', day);
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
