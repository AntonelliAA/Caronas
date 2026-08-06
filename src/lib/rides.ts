/**
 * The month's arithmetic. Everything here is a pure function over
 * 'YYYY-MM-DD' strings, which is the only way the end-of-month total can be
 * checked without opening the database.
 *
 * House rule: a date never becomes `new Date('2026-08-06')`. That form is
 * parsed as UTC and comes back as the 5th in Porto Alegre (UTC-3). Always go
 * through parseYmd.
 */

export type Passenger = {
  id: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday, same as Date.getDay(). */
  weekdays: number[];
  /** Price of a single day's ride. */
  fare: number;
  start_date: string;
  end_date: string | null;
};

export type DayState =
  | 'ride' /** on their schedule, and the ride happened */
  | 'absent' /** on their schedule, but they marked an absence */
  | 'off' /** not one of their days, or outside their start/end range */
  | 'noride'; /** nobody rode: a holiday, or a day the driver marked off */

export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date → 'YYYY-MM-DD' in local time. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → Date at local midnight. */
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Add days to a date string without overflowing the month or tripping on DST. */
export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** 'YYYY-MM' for the given month. */
export function monthKey(year: number, month0: number): string {
  return `${year}-${pad(month0 + 1)}`;
}

/** Every day of the month, in order. */
export function monthDays(year: number, month0: number): string[] {
  const out: string[] = [];
  const d = new Date(year, month0, 1);
  while (d.getMonth() === month0) {
    out.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Did anyone ride that day? A driver override always wins, including when it
 * says a ride did happen on a public holiday.
 */
export function isRideDay(
  day: string,
  overrides: Map<string, boolean>,
  holidays: Map<string, string>,
): boolean {
  const forced = overrides.get(day);
  if (forced !== undefined) return forced;
  return !holidays.has(day);
}

export function dayState(
  p: Passenger,
  day: string,
  absent: boolean,
  rideDay: boolean,
): DayState {
  if (day < p.start_date) return 'off';
  if (p.end_date && day > p.end_date) return 'off';
  if (!p.weekdays.includes(parseYmd(day).getDay())) return 'off';
  if (!rideDay) return 'noride';
  return absent ? 'absent' : 'ride';
}

/** Round to cents. 12 × 15.15 must not become 181.79999999999998. */
export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Report = {
  rows: { day: string; state: DayState }[];
  /** Rides that already happened (up to today). This is what they owe. */
  done: number;
  /** Rides for the whole month, including the ones still to come. */
  planned: number;
  faltas: number;
  total: number;
  plannedTotal: number;
};

export function report(
  p: Passenger,
  days: string[],
  absences: Set<string>,
  overrides: Map<string, boolean>,
  holidays: Map<string, string>,
  today: string,
): Report {
  const rows = days.map((day) => ({
    day,
    state: dayState(p, day, absences.has(day), isRideDay(day, overrides, holidays)),
  }));

  const done = rows.filter((r) => r.state === 'ride' && r.day <= today).length;
  const planned = rows.filter((r) => r.state === 'ride').length;
  const faltas = rows.filter((r) => r.state === 'absent' && r.day <= today).length;

  return {
    rows,
    done,
    planned,
    faltas,
    total: money(done * p.fare),
    plannedTotal: money(planned * p.fare),
  };
}

/**
 * Days worth a row in the ledger: the ones where at least one person was
 * scheduled. A Saturday nobody rides disappears, and the month fits on screen.
 */
export function ledgerDays(passengers: Passenger[], days: string[]): string[] {
  return days.filter((day) =>
    passengers.some((p) => {
      if (day < p.start_date) return false;
      if (p.end_date && day > p.end_date) return false;
      return p.weekdays.includes(parseYmd(day).getDay());
    }),
  );
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function brl(n: number): string {
  return BRL.format(n);
}

export function monthLabel(year: number, month0: number): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(year, month0, 1),
  );
}

/** 'seg, ter e qua' — the way someone would say it out loud. */
export function weekdayList(weekdays: number[]): string {
  const names = [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]);
  if (names.length === 0) return 'nenhum dia';
  if (names.length === 7) return 'todos os dias';
  if (names.length === 1) return names[0];
  // The most common case of all deserves the short phrase.
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))) {
    return 'de seg a sex';
  }
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
