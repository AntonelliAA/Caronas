// The month's arithmetic is the one thing here that breaks silently: the site
// still looks fine and the end-of-month number comes out wrong. This file is
// the net under it. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addDays,
  dayState,
  isRideDay,
  ledgerDays,
  monthDays,
  money,
  parseYmd,
  report,
  weekdayList,
  ymd,
} from '../src/lib/rides.ts';
import { easter, feriados } from '../src/lib/feriados.ts';

const marcos = {
  id: '1',
  name: 'Marcos',
  weekdays: [1, 2, 3], // Mon, Tue, Wed
  fare: 15,
  start_date: '2026-01-01',
  end_date: null,
};

const noHolidays = new Map();
const noOverrides = new Map();

test('date strings do not slip a timezone', () => {
  // The classic bug: new Date('2026-08-06') is UTC and comes back as the 5th in Brazil.
  assert.equal(ymd(parseYmd('2026-08-06')), '2026-08-06');
  assert.equal(parseYmd('2026-08-06').getDay(), 4); // Thursday
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('monthDays covers the whole month, leap February included', () => {
  assert.equal(monthDays(2026, 7).length, 31); // August
  assert.equal(monthDays(2026, 1).length, 28); // Feb 2026
  assert.equal(monthDays(2028, 1).length, 29); // Feb 2028
  assert.equal(monthDays(2026, 7).at(-1), '2026-08-31');
});

test('Easter and the moveable holidays match the calendar', () => {
  assert.equal(ymd(easter(2026)), '2026-04-05');
  assert.equal(ymd(easter(2027)), '2027-03-28');

  const f = feriados(2026);
  assert.equal(f.get('2026-02-16'), 'Carnaval');
  assert.equal(f.get('2026-02-17'), 'Carnaval');
  assert.equal(f.get('2026-04-03'), 'Sexta-feira Santa');
  assert.equal(f.get('2026-06-04'), 'Corpus Christi');
  assert.equal(f.get('2026-09-07'), 'Independência');
  assert.ok(!f.has('2026-08-06'));
});

test('isRideDay: a holiday does not count, but the driver has the last word', () => {
  const f = feriados(2026);
  assert.equal(isRideDay('2026-09-07', noOverrides, f), false);
  assert.equal(isRideDay('2026-08-06', noOverrides, f), true);

  // Drove on the holiday anyway.
  assert.equal(isRideDay('2026-09-07', new Map([['2026-09-07', true]]), f), true);
  // Car in the shop on an ordinary weekday.
  assert.equal(isRideDay('2026-08-06', new Map([['2026-08-06', false]]), f), false);
});

test('dayState respects schedule, date range, and absence', () => {
  assert.equal(dayState(marcos, '2026-08-03', false, true), 'ride'); // Monday
  assert.equal(dayState(marcos, '2026-08-03', true, true), 'absent');
  assert.equal(dayState(marcos, '2026-08-06', false, true), 'off'); // Thursday
  assert.equal(dayState(marcos, '2026-08-03', false, false), 'noride');

  // Joined mid-month: earlier days are not theirs.
  const joined = { ...marcos, start_date: '2026-08-10' };
  assert.equal(dayState(joined, '2026-08-03', false, true), 'off');
  assert.equal(dayState(joined, '2026-08-10', false, true), 'ride');

  // Left: later days stop counting.
  const left = { ...marcos, end_date: '2026-08-12' };
  assert.equal(dayState(left, '2026-08-12', false, true), 'ride');
  assert.equal(dayState(left, '2026-08-17', false, true), 'off');
});

test('report adds up the month: done, planned, absences, money', () => {
  const days = monthDays(2026, 7); // August 2026
  const today = '2026-08-31'; // month closed

  const full = report(marcos, days, new Set(), noOverrides, noHolidays, today);
  // August 2026 has 5 Mondays, 4 Tuesdays and 4 Wednesdays = 13 days.
  assert.equal(full.done, 13);
  assert.equal(full.planned, 13);
  assert.equal(full.faltas, 0);
  assert.equal(full.total, 195);

  const withAbsences = report(
    marcos,
    days,
    new Set(['2026-08-04', '2026-08-05']),
    noOverrides,
    noHolidays,
    today,
  );
  assert.equal(withAbsences.done, 11);
  assert.equal(withAbsences.faltas, 2);
  assert.equal(withAbsences.total, 165);

  // Driver away on a Monday: it disappears for everyone, nobody marks anything.
  const noRide = report(
    marcos,
    days,
    new Set(),
    new Map([['2026-08-10', false]]),
    noHolidays,
    today,
  );
  assert.equal(noRide.done, 12);
  assert.equal(noRide.faltas, 0);
});

test('report separates what already happened from what is still to come', () => {
  const days = monthDays(2026, 7);
  const r = report(marcos, days, new Set(), noOverrides, noHolidays, '2026-08-05');
  assert.equal(r.done, 3); // the 3rd, 4th, 5th
  assert.equal(r.planned, 13);
  assert.equal(r.total, 45);
  assert.equal(r.plannedTotal, 195);
});

test('cents do not turn into a repeating decimal', () => {
  assert.equal(money(3 * 0.1), 0.3);
  assert.equal(
    report({ ...marcos, fare: 15.15 }, monthDays(2026, 7), new Set(), noOverrides, noHolidays, '2026-08-31').total,
    196.95,
  );
});

test('ledgerDays hides a day nobody is scheduled for', () => {
  const days = monthDays(2026, 7);
  const rows = ledgerDays([marcos], days);
  assert.equal(rows.length, 13);
  assert.ok(!rows.includes('2026-08-08')); // Saturday
  assert.ok(rows.includes('2026-08-03'));
});

test('weekdayList reads like speech', () => {
  assert.equal(weekdayList([1, 2, 3]), 'seg, ter e qua');
  assert.equal(weekdayList([3, 1]), 'seg e qua');
  assert.equal(weekdayList([2]), 'ter');
  assert.equal(weekdayList([1, 2, 3, 4, 5]), 'de seg a sex');
  assert.equal(weekdayList([0, 1, 2, 3, 4, 5, 6]), 'todos os dias');
});
