import test from 'node:test';
import assert from 'node:assert/strict';
import { hm, since, inWindow, pos, nextPhase, fmt, parseAdd, streak, cluster, dayLabel, dur, until } from '../web/logic.js';

test('day window wraps past midnight', () => {
  assert.equal(since(hm('00:10'), hm('23:30')), 40);
  assert.ok(inWindow(hm('12:00'), hm('07:00'), hm('23:30')));
  assert.ok(!inWindow(hm('23:45'), hm('07:00'), hm('23:30')));
  assert.ok(inWindow(hm('00:30'), hm('07:00'), hm('01:00')));
  assert.ok(inWindow(hm('05:00'), hm('21:00'), hm('07:00'))); // night tint
  assert.equal(pos(hm('15:00'), hm('07:00'), hm('23:00')), 0.5);
  assert.ok(Number.isFinite(pos(hm('03:00'), hm('07:00'), hm('07:00'))));
});

test('pomodoro cycle', () => {
  const s = { rounds: 2 };
  assert.deepEqual(nextPhase('focus', 1, s), ['short', 1]);
  assert.deepEqual(nextPhase('short', 1, s), ['focus', 2]);
  assert.deepEqual(nextPhase('focus', 2, s), ['long', 2]);
  assert.deepEqual(nextPhase('long', 2, s), ['focus', 1]);
});

const TUE = new Date(2026, 10, 10, 12); // Tuesday 10 Nov 2026

test('parseAdd', () => {
  const p = t => parseAdd(t, TUE);
  assert.deepEqual(p('14:30 Call mom'), { time: '14:30', title: 'Call mom', daily: false, days: 0 });
  assert.deepEqual(p('Lunch at 1pm'), { time: '13:00', title: 'Lunch', daily: false, days: 0 });
  assert.deepEqual(p('9am Vitamins daily'), { time: '09:00', title: 'Vitamins', daily: true, days: 0 });
  assert.deepEqual(p('12am Sleep'), { time: '00:00', title: 'Sleep', daily: false, days: 0 });
  assert.deepEqual(p('20m tea'), { timer: true, min: 20, label: 'tea' });
  assert.deepEqual(p('1.5h movie'), { timer: true, min: 90, label: 'movie' });
  assert.deepEqual(p('20 pushups'), { time: '', title: '20 pushups', daily: false, days: 0 });
  assert.deepEqual(p('25:00 nope'), { time: '', title: '25:00 nope', daily: false, days: 0 });
  assert.equal(p('0m'), null);
  assert.equal(p('   '), null);
});

test('parseAdd dates', () => {
  const p = t => parseAdd(t, TUE);
  assert.deepEqual(p('tomorrow 9am Dentist'), { time: '09:00', title: 'Dentist', daily: false, days: 1 });
  assert.deepEqual(p('Gym fri 6pm'), { time: '18:00', title: 'Gym', daily: false, days: 3 });
  assert.deepEqual(p('Pay rent on monday'), { time: '', title: 'Pay rent', daily: false, days: 6 });
  assert.deepEqual(p('tue 10:00 Standup'), { time: '10:00', title: 'Standup', daily: false, days: 0 });
  assert.deepEqual(p('Feed monkey'), { time: '', title: 'Feed monkey', daily: false, days: 0 }); // not "mon"
  assert.deepEqual(p('Read tomorrow'), { time: '', title: 'Read', daily: false, days: 1 });
  assert.deepEqual(p('tomorrow'), { time: '', title: 'tomorrow', daily: false, days: 0 });
});

test('labels', () => {
  assert.equal(dayLabel('2026-11-10', TUE), 'Today');
  assert.equal(dayLabel('2026-11-11', TUE), 'Tomorrow');
  assert.equal(dayLabel('2026-11-13', TUE), 'Friday');
  assert.equal(dayLabel('2026-11-20', TUE), 'Fri 20 Nov');
  assert.equal(dur(45 * 60), '45m');
  assert.equal(dur(65 * 60), '1h 05m');
  assert.equal(until(hm('12:10'), hm('12:00')), 'in 10 min');
  assert.equal(until(hm('14:30'), hm('12:00')), '14:30');
});

test('streak', () => {
  const done = { '2026-11-07': ['a'], '2026-11-08': ['a'], '2026-11-09': ['a'], '2026-11-05': ['a'] };
  assert.equal(streak(done, 'a', new Date(2026, 10, 9, 12)), 3);
  assert.equal(streak(done, 'a', new Date(2026, 10, 10, 9)), 3); // today not ticked yet keeps the streak
  assert.equal(streak(done, 'a', new Date(2026, 10, 11, 9)), 0);
});

test('cluster', () => {
  const c = cluster([{ p: 0 }, { p: 3 }, { p: 10 }, { p: 30 }], 6);
  assert.deepEqual(c.map(g => g.items.length), [2, 1, 1]);
});

test('fmt', () => {
  assert.equal(fmt(1500), '25:00');
  assert.equal(fmt(59.2), '1:00');
  assert.equal(fmt(3725), '1:02:05');
  assert.equal(fmt(-3), '0:00');
});
