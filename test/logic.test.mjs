import test from 'node:test';
import assert from 'node:assert/strict';
import { hm, since, inWindow, nextPhase, fmt, parseAdd, parseWhen, streak, dayLabel, dur, until, calEvents } from '../web/logic.js';

test('day window wraps past midnight', () => {
  assert.equal(since(hm('00:10'), hm('23:30')), 40);
  assert.ok(inWindow(hm('12:00'), hm('07:00'), hm('23:30')));
  assert.ok(!inWindow(hm('23:45'), hm('07:00'), hm('23:30')));
  assert.ok(inWindow(hm('00:30'), hm('07:00'), hm('01:00')));
  assert.ok(inWindow(hm('05:00'), hm('21:00'), hm('07:00'))); // night tint
});

test('focus cycle, long breaks optional', () => {
  const off = { longEvery: 0 }, on = { longEvery: 2 };
  assert.deepEqual(nextPhase('focus', 9, off), ['short', 9]);
  assert.deepEqual(nextPhase('short', 9, off), ['focus', 10]);
  assert.deepEqual(nextPhase('focus', 1, on), ['short', 1]);
  assert.deepEqual(nextPhase('focus', 2, on), ['long', 2]);
  assert.deepEqual(nextPhase('long', 2, on), ['focus', 1]);
});

const TUE = new Date(2026, 10, 10, 12); // Tuesday 10 Nov 2026

test('parseWhen', () => {
  assert.deepEqual(parseWhen('14:30'), { time: '14:30' });
  assert.deepEqual(parseWhen('9am'), { time: '09:00' });
  assert.deepEqual(parseWhen('2.30 pm'), { time: '14:30' });
  assert.deepEqual(parseWhen('20m'), { min: 20 });
  assert.deepEqual(parseWhen('1.5h'), { min: 90 });
  assert.deepEqual(parseWhen('1h30'), { min: 90 });
  assert.deepEqual(parseWhen('90'), { min: 90 });
  assert.equal(parseWhen('25:00'), null);
  assert.equal(parseWhen('0m'), null);
  assert.equal(parseWhen('soon'), null);
});

test('parseAdd', () => {
  const p = t => parseAdd(t, TUE);
  assert.deepEqual(p('14:30 Call mom'), { time: '14:30', title: 'Call mom', daily: false, days: 0 });
  assert.deepEqual(p('Lunch at 1pm'), { time: '13:00', title: 'Lunch', daily: false, days: 0 });
  assert.deepEqual(p('9am Vitamins daily'), { time: '09:00', title: 'Vitamins', daily: true, days: 0 });
  assert.deepEqual(p('20m tea'), { timer: true, min: 20, label: 'tea' });
  assert.deepEqual(p('20 pushups'), { time: '', title: '20 pushups', daily: false, days: 0 });
  assert.deepEqual(p('tomorrow 9am Dentist'), { time: '09:00', title: 'Dentist', daily: false, days: 1 });
  assert.deepEqual(p('Gym fri 6pm'), { time: '18:00', title: 'Gym', daily: false, days: 3 });
  assert.deepEqual(p('Feed monkey'), { time: '', title: 'Feed monkey', daily: false, days: 0 }); // not "mon"
  assert.equal(p('0m'), null);
});

test('labels', () => {
  assert.equal(dayLabel('2026-11-10', TUE), 'Today');
  assert.equal(dayLabel('2026-11-11', TUE), 'Tomorrow');
  assert.equal(dayLabel('2026-11-13', TUE), 'Friday');
  assert.equal(dayLabel('2026-11-20', TUE), 'Fri 20 Nov');
  assert.equal(dur(65 * 60), '1h 05m');
  assert.equal(until(+TUE + 10 * 60000, +TUE), 'in 10 min');
  assert.equal(until(+TUE + 125 * 60000, +TUE), 'in 2h 05m');
  assert.equal(fmt(3725), '1:02:05');
});

test('streak', () => {
  const done = { '2026-11-07': ['a'], '2026-11-08': ['a'], '2026-11-09': ['a'] };
  assert.equal(streak(done, 'a', new Date(2026, 10, 9, 12)), 3);
  assert.equal(streak(done, 'a', new Date(2026, 10, 10, 9)), 3); // today not ticked yet keeps the streak
  assert.equal(streak(done, 'a', new Date(2026, 10, 11, 9)), 0);
});

test('calendar feed', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'UID:1', 'DTSTART:20261110T150000', 'DTEND:20261110T160000', 'SUMMARY:Design review\\, v2', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:2', 'DTSTART;VALUE=DATE:20261111', 'DTEND;VALUE=DATE:20261112', 'SUMMARY:Ana birthday', 'END:VEVENT',
    // weekly standup Mon/Wed 09:30, one moved, one cancelled
    'BEGIN:VEVENT', 'UID:3', 'DTSTART:20261102T093000', 'DTEND:20261102T094500', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
    'EXDATE:20261116T093000', 'SUMMARY:Standup', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:3', 'RECURRENCE-ID:20261111T093000', 'DTSTART:20261111T110000', 'DTEND:20261111T111500', 'SUMMARY:Standup (moved)', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:4', 'DTSTART:20261110T080000', 'SUMMARY:Gone', 'STATUS:CANCELLED', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:5', 'DTSTART:20261101T200000', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Old', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const from = +new Date(2026, 10, 10), to = +new Date(2026, 10, 19);
  const ev = calEvents(ics, from, to).map(e => [new Date(e.start).toString().slice(4, 21), e.title, e.allDay]);
  assert.deepEqual(ev, [
    ['Nov 10 2026 15:00', 'Design review, v2', false],
    ['Nov 11 2026 00:00', 'Ana birthday', true],
    ['Nov 11 2026 11:00', 'Standup (moved)', false],
    ['Nov 18 2026 09:30', 'Standup', false],
  ]);
});
