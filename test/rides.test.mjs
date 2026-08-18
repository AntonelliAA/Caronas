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
  nextMark,
  parseBrl,
  parseYmd,
  report,
  weekdayList,
  weekStart,
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
const noMarks = new Map();

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

test('dayState respects schedule, date range, and marks', () => {
  assert.equal(dayState(marcos, '2026-08-03', undefined, true), 'ride'); // Monday
  assert.equal(dayState(marcos, '2026-08-03', false, true), 'absent');
  assert.equal(dayState(marcos, '2026-08-06', undefined, true), 'off'); // Thursday
  assert.equal(dayState(marcos, '2026-08-03', undefined, false), 'noride');

  // Joined mid-month: earlier days are not theirs.
  const joined = { ...marcos, start_date: '2026-08-10' };
  assert.equal(dayState(joined, '2026-08-03', undefined, true), 'off');
  assert.equal(dayState(joined, '2026-08-10', undefined, true), 'ride');

  // Left: later days stop counting.
  const left = { ...marcos, end_date: '2026-08-12' };
  assert.equal(dayState(left, '2026-08-12', undefined, true), 'ride');
  assert.equal(dayState(left, '2026-08-17', undefined, true), 'off');
});

test('a ride can be added on a day that is not theirs', () => {
  // Thursday is not one of Marcos's days, but he rode anyway.
  assert.equal(dayState(marcos, '2026-08-06', true, true), 'extra');
  // On one of his days the same mark is just a normal ride, not an extra.
  assert.equal(dayState(marcos, '2026-08-03', true, true), 'ride');

  // Outside the date range a mark still does not resurrect the day.
  const joined = { ...marcos, start_date: '2026-08-10' };
  assert.equal(dayState(joined, '2026-08-06', true, true), 'off');

  // Nobody rode at all, so there is nobody to add.
  assert.equal(dayState(marcos, '2026-08-06', true, false), 'noride');
});

test('nextMark cycles a cell in one tap', () => {
  assert.equal(nextMark('ride'), false); // riding -> absent
  assert.equal(nextMark('absent'), null); // absent -> back to the schedule
  assert.equal(nextMark('off'), true); // not their day -> extra ride
  assert.equal(nextMark('extra'), null); // extra -> back to the schedule
});

test('report adds up the month: done, planned, absences, money', () => {
  const days = monthDays(2026, 7); // August 2026
  const today = '2026-08-31'; // month closed

  const full = report(marcos, days, noMarks, noOverrides, noHolidays, today);
  // August 2026 has 5 Mondays, 4 Tuesdays and 4 Wednesdays = 13 days.
  assert.equal(full.done, 13);
  assert.equal(full.planned, 13);
  assert.equal(full.faltas, 0);
  assert.equal(full.total, 195);

  const withAbsences = report(
    marcos,
    days,
    new Map([['2026-08-04', false], ['2026-08-05', false]]),
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
    noMarks,
    new Map([['2026-08-10', false]]),
    noHolidays,
    today,
  );
  assert.equal(noRide.done, 12);
  assert.equal(noRide.faltas, 0);

  // Two Thursdays he does not normally ride, added by hand, are billed.
  const withExtras = report(
    marcos,
    days,
    new Map([['2026-08-06', true], ['2026-08-20', true]]),
    noOverrides,
    noHolidays,
    today,
  );
  assert.equal(withExtras.done, 15);
  assert.equal(withExtras.total, 225);
});

test('report separates what already happened from what is still to come', () => {
  const days = monthDays(2026, 7);
  const r = report(marcos, days, noMarks, noOverrides, noHolidays, '2026-08-05');
  assert.equal(r.done, 3); // the 3rd, 4th, 5th
  assert.equal(r.planned, 13);
  assert.equal(r.total, 45);
  assert.equal(r.plannedTotal, 195);
});

test('cents do not turn into a repeating decimal', () => {
  assert.equal(money(3 * 0.1), 0.3);
  assert.equal(
    report({ ...marcos, fare: 15.15 }, monthDays(2026, 7), noMarks, noOverrides, noHolidays, '2026-08-31').total,
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

test('ledgerDays keeps a day somebody actually rode on', () => {
  const days = monthDays(2026, 7);
  const marks = new Map([['1', new Map([['2026-08-08', true]])]]); // a Saturday
  const rows = ledgerDays([marcos], days, marks);
  assert.equal(rows.length, 14);
  assert.ok(rows.includes('2026-08-08'));
});

test('weekStart finds the Monday that opens the week', () => {
  assert.equal(weekStart('2026-08-06'), '2026-08-03'); // Thursday -> Monday
  assert.equal(weekStart('2026-08-03'), '2026-08-03'); // Monday is its own start
  assert.equal(weekStart('2026-08-09'), '2026-08-03'); // Sunday closes that week
  assert.equal(weekStart('2026-08-01'), '2026-07-27'); // crosses into July
});

test('weekdayList reads like speech', () => {
  assert.equal(weekdayList([1, 2, 3]), 'seg, ter e qua');
  assert.equal(weekdayList([3, 1]), 'seg e qua');
  assert.equal(weekdayList([2]), 'ter');
  assert.equal(weekdayList([1, 2, 3, 4, 5]), 'de seg a sex');
  assert.equal(weekdayList([0, 1, 2, 3, 4, 5, 6]), 'todos os dias');
});

test('parseBrl reads a fare the way somebody types it', () => {
  // A phone keypad offers both separators and people use either.
  assert.equal(parseBrl('18,50'), 18.5);
  assert.equal(parseBrl('18.50'), 18.5);
  assert.equal(parseBrl('18'), 18);
  assert.equal(parseBrl('R$ 20,00'), 20);
  assert.equal(parseBrl('0,01'), 0.01);
  // A comma never groups thousands in pt-BR, so this is twenty reais.
  assert.equal(parseBrl('20,999'), 21);
  // A period with exactly three digits behind it does.
  assert.equal(parseBrl('1.234'), 1234);
  assert.equal(parseBrl('1.234,56'), 1234.56);
  assert.equal(parseBrl('1,234.56'), 1234.56);
  assert.equal(parseBrl('1.234.567,89'), 1234567.89);
});

test('parseBrl refuses what is not a number instead of calling it zero', () => {
  // A fare that silently becomes 0 prices every ride that person takes at
  // nothing, and the screen shows R$ 0,00 without complaining.
  assert.equal(parseBrl(''), null);
  assert.equal(parseBrl('   '), null);
  assert.equal(parseBrl('abc'), null);
  assert.equal(parseBrl('R$'), null);
  assert.equal(parseBrl('0'), 0); // an actual zero is still a number
});
