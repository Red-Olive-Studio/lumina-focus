import { hm, nowMin, dayKey, keyDate, addDays, dayLabel, inWindow, since, nextPhase, phaseLen, fmt, dur, until, parseAdd, parseWhen, streak, clockOf, calEvents } from './logic.js';

const desk = window.desk; // undefined in the browser build
const TEST = new URLSearchParams(location.search).has('test'); // Ctrl+Shift+T, or `npm run test-mode`
const $ = id => document.getElementById(id);
const KEY = TEST ? 'lumina:test' : 'lumina'; // test mode never touches your real data
const MIN = 60000, GRACE = 120 * MIN, AWAY = 300;

// ---- clock: real time, or shifted / sped up in test mode ----
const clk = { off: 0, speed: 1, t0: Date.now() };
const now = () => { const r = Date.now(); return r + clk.off + (clk.speed - 1) * (r - clk.t0); };
function setClock(ms, speed = clk.speed) { clk.t0 = Date.now(); clk.speed = speed; clk.off = ms - clk.t0; tick(); }

const MEALS = [['breakfast', 'Breakfast', 3], ['snack1', 'Morning snack', 5], ['lunch', 'Lunch', 3], ['snack2', 'Afternoon snack', 5], ['dinner', 'Dinner', 3]];
const DEFAULT = {
  settings: {
    focus: 25, short: 5, long: 15, longEvery: 0, autoNext: true, sound: true, alert: 'popup',
    wake: '07:00', bed: '23:30', login: false, mealCount: 3, prep: 30, calUrls: '',
  },
  meals: { breakfast: '08:30', snack1: '10:30', lunch: '12:30', snack2: '16:00', dinner: '19:00' },
  reminders: [
    { id: 'posture', text: 'Sit tall, back against the seat', every: 20, on: true },
    { id: 'water', text: 'Drink some water', every: 45, on: true },
    { id: 'walk', text: 'Stand up and walk a little', every: 30, on: true },
  ],
  guards: { screen: true, screenLimit: 90, sleep: true, night: true, nightAt: '21:00', shutdown: false, shutdownAt: '00:30' },
  tasks: [{ id: 'vitamins', time: '09:00', title: 'Vitamins and pills', daily: true }],
  done: {}, fired: {}, last: {}, snooze: [], stats: {}, timers: [], quietUntil: 0,
  cal: { events: [], at: 0, err: '' },
  pomo: { phase: 'focus', round: 1, left: 25 * 60, endsAt: 0, running: false, away: false },
  lastBreak: 0, seen: 0,
};

// The "day" runs from wake-up to the next wake-up, so 00:30 still belongs to tonight.
function dayStart(ms = now(), wake = S.settings.wake) {
  const d = new Date(ms);
  d.setHours(0, hm(wake), 0, 0);
  if (+d > ms) d.setDate(d.getDate() - 1);
  return +d;
}
const dk = (ms = now()) => dayKey(dayStart(ms));

const S = load();
function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? (TEST ? null : localStorage.getItem('dailydoro'))) || {}; } catch {}
  const d = structuredClone(DEFAULT), fresh = !saved.settings;
  const s = {
    ...d, ...saved, settings: { ...d.settings, ...saved.settings }, guards: { ...d.guards, ...saved.guards },
    meals: { ...d.meals, ...saved.meals }, cal: { ...d.cal, ...saved.cal }, pomo: { ...d.pomo, ...saved.pomo },
  };
  const t = Date.now(), today = dayKey(dayStart(t, s.settings.wake));
  if (t - s.seen > 10 * MIN) { // app was closed: start fresh instead of replaying missed alerts
    s.lastBreak = t;
    s.last = {};
    s.pomo = { ...d.pomo, left: phaseLen('focus', s.settings) };
  }
  if (!saved.v) { // one-time upgrade from dailydoro / Lumina 0.2 data
    s.tasks = s.tasks.filter(x => !['breakfast', 'lunch', 'dinner'].includes(x.id)); // meals are their own thing now
    if (saved.timer) s.timers = [{ id: 'old', ...saved.timer }];
    s.v = 3;
  }
  // Unfinished to-dos (no time) come along to today; past events and finished one-offs drop off.
  for (const x of s.tasks) if (!x.daily && !x.time && x.date < today && !s.done[x.date]?.includes(x.id)) x.date = today;
  s.tasks = s.tasks.filter(x => x.daily || x.date >= today);
  for (const id in s.fired) if (s.fired[id] !== today) delete s.fired[id];
  if (TEST && fresh) seed(s, t, today);
  return s;
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
let planKey = '';
const changed = () => { save(); renderRems(); planKey = ''; tick(); };

// A sample day around "now" so every kind of item and alert can be tried in test mode.
function seed(s, t, k) {
  const at = m => clockOf(t + m * MIN), plus = n => dayKey(addDays(keyDate(k), n));
  s.tasks.push(
    { id: 'x1', title: 'Reply to Ana', time: at(-25), date: k },
    { id: 'x2', title: 'Call the bank', time: at(4), date: k, alarm: true },
    { id: 'x3', title: 'Send the invoice', time: at(16), date: k },
    { id: 'x4', title: 'Write the project brief', time: '', date: k },
    { id: 'x5', title: 'Read 20 pages', time: '', daily: true },
    { id: 'x6', title: 'Dentist', time: '10:00', date: plus(1) },
    { id: 'x7', title: 'Gym', time: '18:00', date: plus(3) },
  );
  s.timers = [{ id: 'tm1', endsAt: t + 2 * MIN, label: 'Tea', off: false }];
  s.reminders.forEach((r, i) => { r.every = [3, 7, 11][i] ?? r.every; });
  const day = +keyDate(k);
  s.cal = { at: t, err: '', events: [
    { start: t + 30 * MIN, end: t + 60 * MIN, title: 'Design review', allDay: false },
    { start: day, end: day + 864e5, title: "Ana's birthday", allDay: true },
    { start: day + 864e5 + 9.5 * 60 * MIN, end: day + 864e5 + 9.75 * 60 * MIN, title: 'Team standup', allDay: false },
  ] };
  for (let i = 1; i <= 6; i++) {
    s.stats[plus(-i)] = { focus: 1800 + (i * 2477) % 12000, sessions: 1 + i % 5, breaks: i % 4 + 1 };
    if (i < 4) s.done[plus(-i)] = ['x5', 'vitamins', 'meal:lunch'];
  }
}

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter(k => k !== '' && k != null));
  return e;
}
const ICON = {
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
};
const iconBtn = (icon, label, onclick, on) => el('button', { className: 'icon act' + (on ? ' on' : ''), innerHTML: ICON[icon], title: label, ariaLabel: label, onclick });

// ---- sound: soft bell notes (fundamental + quiet octave so laptop speakers carry it) ----
const SFX = { done: [[523.25, 659.25, 783.99, 1046.5], 0.9], alarm: [[880, 880, 1174.66], 1.2], remind: [[1318.5], 0.7], pause: [[587.33], 0.45] };
let ctx;
function sfx(kind) {
  if (!S.settings.sound || !SFX[kind]) return;
  try {
    ctx ??= new AudioContext();
    ctx.resume();
    const [notes, len] = SFX[kind];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + 0.02 + i * 0.16;
      for (const [mul, vol] of [[1, 0.4], [2, 0.12]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f * mul;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + len);
      }
    });
  } catch {}
}

// ---- alerts: one current alert, a toast here and the corner widget when you're elsewhere ----
let alert = null, idleSec = 0;
// acts: [[label, fn], ...]; ring = alarm that repeats until you answer it (up to 5 minutes)
function notify(text, sound, acts = [], ring = false) {
  sfx(ring ? 'alarm' : sound);
  if (S.settings.alert === 'sound' && !ring) return;
  alert = { text, acts, ring, real: Date.now(), rang: Date.now() };
  renderAlert();
  desk?.flash();
  if (!desk && !document.hasFocus()) try { new Notification('Lumina', { body: text }); } catch {}
}
function renderAlert() {
  $('toast').hidden = !alert;
  document.body.classList.toggle('ringing', !!alert?.ring);
  if (!alert) return;
  $('toastText').textContent = alert.text;
  $('toastActs').replaceChildren(...alert.acts.map(([l], i) => el('button', { className: 'soft small', textContent: l, onclick: () => act(i) })));
}
function clearAlert() { alert = null; renderAlert(); tick(); }
function act(i) { const a = alert?.acts[i]; clearAlert(); a?.[1](); }
const later = z => ['In 10 min', () => { S.snooze.push({ ...z, at: now() + 10 * MIN }); save(); }];
const taskAlert = t => notify(t.title, 'alarm', [['Done', () => setDone(t, true)], later({ id: t.id, text: t.title })], !!t.alarm);

function shutdownSoon(why) {
  if (TEST) return notify(`Test: ${why}. The PC would shut down in 60 seconds.`, 'alarm', [['Cancel', () => {}]], true);
  desk.shutdown(true);
  notify(`${why}. The PC shuts down in 60 seconds.`, 'alarm', [['Cancel', () => desk.shutdown(false)]], true);
}

// ---- day items: your tasks, habits and meals ----
const dailyMs = (time, ms = now()) => dayStart(ms) + since(hm(time), hm(S.settings.wake)) * MIN;
const taskMs = t => !t.time ? null : t.daily || t.date === dk() ? dailyMs(t.time) : +keyDate(t.date) + hm(t.time) * MIN;
const meals = () => MEALS.filter(([, , n]) => n <= +S.settings.mealCount).map(([id, title]) => ({ id: 'meal:' + id, title, time: S.meals[id], daily: true, meal: true }));
const todays = () => [...meals(), ...S.tasks.filter(t => t.daily || t.date === dk())];
const doneKey = t => t.daily ? dk() : t.date;
const isDone = t => (S.done[doneKey(t)] || []).includes(t.id);
function setDone(t, on) {
  const d = S.done[doneKey(t)] ||= [];
  if (on && !d.includes(t.id)) { d.push(t.id); sfx('remind'); }
  if (!on && d.includes(t.id)) d.splice(d.indexOf(t.id), 1);
  changed();
}

// ---- focus: optional long breaks; every session and break is counted per day ----
const stat = () => S.stats[dk()] ||= { focus: 0, sessions: 0, breaks: 0 };
const pomoLeft = ms => S.pomo.running ? (S.pomo.endsAt - ms) / 1000 : S.pomo.left;
const liveFocus = ms => S.pomo.phase === 'focus' ? Math.max(0, phaseLen('focus', S.settings) - Math.max(0, pomoLeft(ms))) : 0;
function go(ms, run) {
  const P = S.pomo;
  if (P.phase === 'focus') {
    const e = liveFocus(ms);
    if (e >= 60) stat().focus += e;
    if (e >= 300) stat().sessions++;
  } else S.lastBreak = ms;
  [P.phase, P.round] = nextPhase(P.phase, P.round, S.settings);
  if (P.phase !== 'focus') stat().breaks++;
  P.left = phaseLen(P.phase, S.settings);
  P.running = run;
  P.away = false;
  P.endsAt = ms + P.left * 1000;
  save();
}
function toggle() {
  if (!desk && window.Notification?.permission === 'default') Notification.requestPermission();
  const P = S.pomo, ms = now();
  if (P.running) { P.left = Math.max(0, pomoLeft(ms)); P.running = false; sfx('pause'); }
  else { P.endsAt = ms + P.left * 1000; P.running = true; P.away = false; }
  save(); tick();
}

// ---- calendar: iCal links are fetched by the desktop app every 15 minutes ----
async function syncCal() {
  const urls = S.settings.calUrls.split(/\s+/).filter(Boolean);
  if (!urls.length || !desk) {
    if (!TEST) S.cal = { events: [], at: 0, err: urls.length ? 'Calendar links work in the desktop app.' : '' };
  } else {
    $('calStatus').textContent = 'Syncing…';
    try {
      const from = dayStart(), texts = await Promise.all(urls.map(u => desk.ics(u)));
      S.cal = { events: texts.flatMap(t => calEvents(t, from, from + 8 * 864e5)), at: Date.now(), err: '' };
    } catch {
      S.cal.err = 'Could not load the calendar. Check the link and your connection.';
    }
  }
  changed();
}

// ---- main loop: everything is time-based, so a throttled or late tick still fires correctly ----
let tintOn = false, tintTest = 0;
function tick() {
  const t = now(), s = S.settings, g = S.guards, P = S.pomo, k = dk(t);

  if (P.running && t >= P.endsAt) {
    const wasFocus = P.phase === 'focus';
    go(t, s.autoNext);
    notify(wasFocus ? (P.phase === 'long' ? 'Great work. Take a long break.' : 'Focus done. Take a short break.') : 'Break is over. Back to focus.',
      wasFocus ? 'done' : 'alarm', s.autoNext ? [] : [[wasFocus ? 'Start break' : 'Start focus', toggle]]);
  }
  const due = S.snooze.filter(z => t >= z.at);
  S.snooze = S.snooze.filter(z => t < z.at);
  for (const z of due) {
    const x = z.id && todays().find(y => y.id === z.id);
    x ? !isDone(x) && taskAlert(x) : notify(z.text, 'remind');
  }
  for (const tm of S.timers.filter(x => t >= x.endsAt)) {
    S.timers = S.timers.filter(x => x !== tm);
    planKey = '';
    tm.off ? shutdownSoon(`${tm.label || 'Timer'} ended`) : notify(`${tm.label || 'Timer'} is done`, 'alarm', [], true);
  }

  const awake = inWindow(nowMin(new Date(t)), hm(s.wake), hm(s.bed)), quiet = t < S.quietUntil;
  const once = (id, ms, fn) => { if (ms !== null && S.fired[id] !== k && t >= ms && t - ms < 30 * MIN) { S.fired[id] = k; fn(); } };
  for (const x of todays()) if (x.time && !isDone(x)) {
    const ms = taskMs(x);
    once('task:' + x.id, ms, () => taskAlert(x));
    if (x.meal && +s.prep > 0) once('prep:' + x.id, ms - s.prep * MIN, () => notify(`Time to cook or order ${x.title.toLowerCase()}`, 'remind'));
  }
  for (const e of S.cal.events) if (!e.allDay) once(`cal:${e.start}:${e.title}`, e.start - 10 * MIN, () => notify(`${e.title} at ${clockOf(e.start)}`, 'remind'));

  // Away from the PC counts as a break: focus pauses, reminders restart when you're back instead of piling up.
  const away = !!desk && idleSec >= AWAY;
  if (away) {
    S.lastBreak = t;
    for (const r of S.reminders) S.last[r.id] = t;
    if (P.running && P.phase === 'focus') {
      P.left = Math.min(phaseLen('focus', s), pomoLeft(t) + idleSec);
      P.running = false; P.away = true; stat().breaks++;
    }
  } else if (P.away) {
    P.away = false;
    notify('Welcome back. Continue your focus?', 'remind', [['Continue', toggle]]);
  }
  if (awake && !away && !quiet) for (const r of S.reminders) {
    if (!r.on) continue;
    S.last[r.id] ??= t;
    if (t - S.last[r.id] >= r.every * MIN) { S.last[r.id] = t; planKey = ''; notify(r.text, 'remind', [['Done', () => {}]]); }
  }
  const atScreen = (t - S.lastBreak) / MIN;
  if (g.screen && awake && !quiet && P.phase === 'focus' && atScreen >= g.screenLimit && t - (S.last.screen || 0) >= 30 * MIN) {
    S.last.screen = t;
    notify(`${dur(atScreen * 60)} at the screen. Look away and stretch.`, 'remind');
  }
  if (g.sleep && !awake && !away && !quiet && t - (S.last.sleep || 0) >= 15 * MIN) {
    S.last.sleep = t;
    notify(`It's past ${s.bed}. Time to rest.`, 'remind');
  }
  const night = (g.night && inWindow(nowMin(new Date(t)), hm(g.nightAt), hm(s.wake))) || Date.now() < tintTest;
  if (desk && night !== tintOn) desk.tint(tintOn = night);
  if (g.night) once('night', dailyMs(g.nightAt, t), () => notify(desk ? 'Warm night light is on.' : 'Evening: turn on Night light.', 'remind'));
  if (g.shutdown && (desk || TEST)) once('shutdown', dailyMs(g.shutdownAt, t), () => shutdownSoon('Bedtime'));

  if (alert && !away) {
    const r = Date.now();
    if (alert.ring && r - alert.rang >= 20000 && r - alert.real < 300000) { alert.rang = r; sfx('alarm'); }
    // A normal alert stays until you've been back at the PC for a minute; an alarm stays until you answer it.
    if (!alert.ring) { alert.until ??= r + 60000; if (r > alert.until) { alert = null; renderAlert(); } }
  }
  S.seen = t;
  save();
  render(t);
}

// ---- the plan: one timeline from now on, today first, then the coming days ----
function plan(t) {
  const s = S.settings, g = S.guards, start = dayStart(t), end = start + 864e5, bedMs = dailyMs(s.bed, t), k = dk(t);
  const its = [], add = (ms, kind, title, x = {}) => its.push({ ms, kind, title, ...x });
  for (const x of todays()) {
    if (isDone(x)) continue;
    const ms = taskMs(x);
    add(ms, x.meal ? 'meal' : x.daily ? 'habit' : 'task', x.title, { task: x });
    if (x.meal && +s.prep > 0) add(ms - s.prep * MIN, 'prep', `Cook or order ${x.title.toLowerCase()}`, { meal: x });
  }
  for (const e of S.cal.events) {
    if (e.allDay) { if (dayKey(e.start) <= k && dayKey(e.end - 1) >= k) add(null, 'event', e.title, { ev: e, allDay: true }); }
    else if (e.start <= t && e.end > t) add(e.start, 'event', e.title, { ev: e, ongoing: true });
    else if (e.start > t) add(e.start, 'event', e.title, { ev: e });
  }
  if (t >= S.quietUntil) for (const r of S.reminders) if (r.on) add((S.last[r.id] ?? t) + r.every * MIN, 'remind', r.text, { rem: r });
  if (S.pomo.running) add(S.pomo.endsAt, 'focus', S.pomo.phase === 'focus' ? 'Break' : 'Back to focus');
  for (const tm of S.timers) add(tm.endsAt, 'timer', tm.label || 'Timer', { timer: tm });
  if (g.night) add(dailyMs(g.nightAt, t), 'evening', 'Warm night light');
  if (g.sleep) add(bedMs, 'evening', 'Bedtime');
  if (g.shutdown && (desk || TEST)) add(dailyMs(g.shutdownAt, t), 'evening', 'PC shuts down');

  const nowL = [], up = [];
  for (const i of its) {
    if (i.ms === null || i.ongoing) nowL.push(i);
    else if (i.ms > t) { if (i.ms < end && (i.kind !== 'remind' || i.ms < bedMs)) up.push(i); }
    else if (i.task && t - i.ms < GRACE) nowL.push({ ...i, late: true }); // missed in the last 2 hours; older is behind you
  }
  nowL.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
  up.sort((a, b) => a.ms - b.ms);

  const days = [];
  for (let d = 1; d <= 7; d++) {
    const key = dayKey(addDays(new Date(start), d)), items = [];
    for (const x of S.tasks) if (!x.daily && x.date === key && !isDone(x)) items.push({ ms: taskMs(x), kind: 'task', title: x.title, task: x, day: true });
    for (const e of S.cal.events) if (dayKey(e.start) === key) items.push({ ms: e.start, kind: 'event', title: e.title, ev: e, allDay: e.allDay, day: true });
    items.sort((a, b) => (a.allDay ? -1 : a.ms ?? Infinity) - (b.allDay ? -1 : b.ms ?? Infinity));
    if (items.length) days.push([dayLabel(key, keyDate(k)), items]);
  }
  return { nowL, up, days };
}

let lastAdded = '', showDone = false, curPlan = { nowL: [], up: [], days: [] };
function row(i, t) {
  const x = i.task, kind = i.kind, meta = [];
  if (i.late) meta.push(el('span', { className: 'lateTxt', textContent: 'missed' }));
  else if (i.ongoing) meta.push(`happening now, until ${clockOf(i.ev.end)}`);
  else if (i.ms > t && i.ms - t < 3600e3 && !i.day && !i.timer) meta.push(until(i.ms, t));
  if (kind === 'event' && !i.ongoing && !i.allDay && i.ev.end > i.ev.start) meta.push(`until ${clockOf(i.ev.end)}`);
  if (kind === 'event') meta.push('calendar');
  if (kind === 'remind') meta.push(`every ${i.rem.every} min`);
  if (kind === 'prep') meta.push(`${S.settings.prep} min before ${i.meal.title.toLowerCase()}`);
  if (kind === 'focus') meta.push(S.pomo.phase === 'focus' ? 'focus ends' : 'break ends');
  if (kind === 'timer') { const l = el('span', { className: 'live' }); l.dataset.end = i.timer.endsAt; meta.push(l, i.timer.off ? 'then the PC turns off' : 'timer'); }
  if (x && x.daily) { const n = streak(S.done, x.id, keyDate(dk())); meta.push(n >= 2 ? `${n}-day streak` : 'every day'); }
  if (x?.alarm) meta.push('alarm');

  const doable = x || kind === 'remind';
  const done = x && isDone(x);
  const label = x ? (done ? 'Undo: ' : 'Done: ') + i.title : 'Done for now, restart: ' + i.title;
  const dot = doable
    ? el('button', { className: 'dot', title: x ? (done ? 'Undo' : 'Mark done') : 'Done, start counting again', ariaLabel: label,
      onclick: () => x ? setDone(x, !done) : (S.last[i.rem.id] = now(), sfx('remind'), changed()) })
    : el('span', { className: 'dot' });
  const acts = el('span', { className: 'acts' });
  if (x && !x.meal) acts.append(
    iconBtn('repeat', x.daily ? 'Repeats every day. Click to stop' : 'Repeat every day', () => { x.daily = !x.daily; x.date = dk(); changed(); }, x.daily),
    iconBtn('x', 'Delete', () => { S.tasks = S.tasks.filter(y => y !== x); changed(); }));
  if (i.timer) acts.append(iconBtn('x', 'Cancel timer', () => { S.timers = S.timers.filter(y => y !== i.timer); changed(); }));
  return el('li', { className: `it ${kind}${i.late ? ' late' : ''}${done ? ' done' : ''}${x?.id === lastAdded || i.timer?.id === lastAdded ? ' new' : ''}` },
    el('time', { textContent: i.allDay ? 'All day' : i.ms ? clockOf(i.ms) : '' }),
    dot,
    el('div', { className: 'body' }, el('b', { textContent: i.title }), meta.length ? el('small', {}, ...meta.flatMap((m, j) => j ? [' · ', m] : [m])) : ''),
    acts);
}

function renderPlan(t) {
  const P = plan(t);
  curPlan = P;
  const doneL = todays().filter(isDone);
  const key = JSON.stringify([Math.floor(t / MIN), P, showDone, doneL.map(x => x.id)]);
  if (key !== planKey) {
    planKey = key;
    $('plan').replaceChildren(
      el('li', { className: 'it nowrow' }, el('time', { textContent: clockOf(t) }), el('span', { className: 'dot' }), el('div', { className: 'body' }, el('b', { textContent: 'Now' }))),
      ...P.nowL.map(i => row(i, t)),
      ...P.up.map(i => row(i, t)),
      P.nowL.length + P.up.length ? '' : el('li', { className: 'it empty' }, el('time'), el('span', { className: 'dot' }), el('div', { className: 'body' }, el('small', { textContent: 'Nothing else today. Press + to add something.' }))));
    $('later').replaceChildren(...P.days.flatMap(([label, items]) => [el('h3', { className: 'eyebrow day', textContent: label }), el('ol', { className: 'rail' }, ...items.map(i => row(i, t)))]));
    $('doneToggle').hidden = !doneL.length;
    $('doneToggle').textContent = showDone ? 'Hide done' : `${doneL.length} done today`;
    $('doneList').hidden = !showDone || !doneL.length;
    $('doneList').replaceChildren(...doneL.map(x => row({ ms: taskMs(x), kind: x.meal ? 'meal' : x.daily ? 'habit' : 'task', title: x.title, task: x }, t)));
    lastAdded = '';
  }
  for (const l of document.querySelectorAll('.live')) l.textContent = fmt((+l.dataset.end - t) / 1000) + ' left';
}

// ---- rendering ----
let lastSnap = '';
function render(t) {
  const P = S.pomo, s = S.settings, left = pomoLeft(t), tt = fmt(left), d = new Date(t);
  $('clock').textContent = clockOf(t);
  $('date').textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
  $('time').textContent = tt;
  document.title = (P.running ? `${tt} · ` : '') + 'Lumina' + (TEST ? ' (test)' : '');
  const paused = !P.running && P.left < phaseLen(P.phase, s);
  $('head').textContent = (P.phase === 'focus' ? (P.running || paused ? 'Focus' : 'Ready to focus') : P.phase === 'long' ? 'Long break' : 'Break')
    + (s.longEvery > 0 && P.phase === 'focus' ? ` · ${P.round} of ${s.longEvery}` : '') + (paused ? ' · paused' : '');
  document.body.dataset.phase = P.phase;
  document.body.classList.toggle('running', P.running);
  $('brk').textContent = P.phase === 'focus' ? 'Break' : 'Focus';
  $('brk').title = P.phase === 'focus' ? 'Take a break now' : 'End the break and focus';
  $('prog').style.width = 100 * (1 - Math.max(0, left) / phaseLen(P.phase, s)) + '%';
  const st = stat(), f = st.focus + liveFocus(t);
  $('stats').textContent = f >= 60 || st.breaks ? `${dur(f)} focus · ${st.sessions} ${st.sessions === 1 ? 'session' : 'sessions'} · ${st.breaks} ${st.breaks === 1 ? 'break' : 'breaks'}` : 'No focus yet today';
  const q = t < S.quietUntil;
  $('quiet').classList.toggle('on', q);
  $('quiet').setAttribute('aria-pressed', q);
  $('quiet').title = $('quiet').ariaLabel = q ? `Reminders paused until ${clockOf(S.quietUntil)}. Click to resume` : 'Pause reminders for 1 hour';
  renderPlan(t);
  if (!$('week').hidden) renderWeek(t);
  if (TEST) $('tClock').textContent = `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.toLocaleTimeString('en-GB')}${clk.speed > 1 ? ` · ×${clk.speed}` : ''}`;

  if (!desk) return;
  const nx = curPlan.up.find(i => i.kind !== 'remind');
  const snap = JSON.stringify({
    time: tt, phase: P.phase, running: P.running,
    next: nx ? `${until(nx.ms, t)} · ${nx.title}` : 'All clear',
    alert: alert && { text: alert.text, acts: alert.acts.map(a => a[0]) },
  });
  if (snap !== lastSnap) { lastSnap = snap; desk.state(JSON.parse(snap)); }
}

function renderWeek(t) {
  const k = dk(t), st = stat(), live = liveFocus(t);
  $('wFocus').textContent = dur(st.focus + live);
  $('wSessions').textContent = st.sessions;
  $('wBreaks').textContent = st.breaks;
  const keys = Array.from({ length: 7 }, (_, i) => dayKey(addDays(keyDate(k), i - 6)));
  const sec = key => (S.stats[key]?.focus || 0) + (key === k ? live : 0);
  const max = Math.max(3600, ...keys.map(sec));
  const sig = JSON.stringify([keys.map(sec).map(x => Math.floor(x / 60)), S.done, todays().length]);
  if ($('week').dataset.k === sig) return;
  $('week').dataset.k = sig;
  $('wBars').replaceChildren(...keys.map(key => {
    const bar = el('i');
    bar.style.height = Math.max(2, 100 * sec(key) / max) + '%';
    return el('div', { className: 'col' + (key === k ? ' today' : ''), title: `${dayLabel(key, keyDate(k))}: ${dur(sec(key))}` },
      el('span', { className: 'v', textContent: sec(key) >= 60 ? dur(sec(key)) : '' }), el('div', { className: 'track' }, bar),
      el('small', { textContent: keyDate(key).toLocaleDateString('en-GB', { weekday: 'narrow' }) }));
  }));
  const habits = todays().filter(x => x.daily);
  $('wHabits').replaceChildren(...habits.map(x => {
    const n = streak(S.done, x.id, keyDate(k));
    return el('li', {}, el('span', { className: 'title', textContent: x.title }),
      el('span', { className: 'week' }, ...keys.map(key => el('i', { className: S.done[key]?.includes(x.id) ? 'on' : '', title: dayLabel(key, keyDate(k)) }))),
      el('small', { textContent: n >= 2 ? `${n} days` : '' }));
  }), habits.length ? '' : el('li', { className: 'muted', textContent: 'Make anything a daily habit with the repeat button.' }));
}

function renderRems() {
  $('rems').replaceChildren(...S.reminders.map(r => el('li', {},
    el('label', { className: 'chk' },
      el('input', { type: 'checkbox', checked: r.on, ariaLabel: 'On', onchange: e => { r.on = e.target.checked; S.last[r.id] = now(); changed(); } }),
      el('input', { className: 'bare', value: r.text, ariaLabel: 'Reminder text', onchange: e => { r.text = e.target.value.trim() || r.text; changed(); } })),
    el('label', { className: 'every', title: 'Every N minutes' },
      el('input', { type: 'number', min: 1, value: r.every, ariaLabel: 'Every N minutes', onchange: e => { r.every = Math.max(1, e.target.valueAsNumber || r.every); changed(); } }), 'min'),
    iconBtn('x', 'Delete reminder', () => { S.reminders = S.reminders.filter(x => x !== r); changed(); }))));
  const c = S.cal;
  $('calStatus').textContent = c.err || (c.at ? `Synced ${clockOf(c.at)} · ${c.events.length} events this week` : 'Not connected');
  document.body.dataset.meals = S.settings.mealCount;
}

// ---- the + button: name, time or timer length, done ----
const A = { title: $('aTitle'), when: $('aWhen'), day: $('aDay'), daily: $('aDaily'), alarm: $('aAlarm'), off: $('aOff') };
function openAdder(on) {
  $('adder').hidden = !on;
  $('fab').setAttribute('aria-expanded', on);
  $('fab').classList.toggle('open', on);
  if (on) { $('adder').reset(); A.day.value = A.day.min = dk(); A.day.dataset.touched = ''; updAdder(); A.title.focus(); }
}
function draft() {
  const t = now(), title = A.title.value.trim(), whenTxt = A.when.value.trim(), w = whenTxt ? parseWhen(whenTxt) : null;
  if (whenTxt && !w) return { err: 'Use a time like 14:30 or a length like 20m' };
  const p = title ? parseAdd(title, new Date(t)) : null;
  if (w?.min || (!w && p?.timer)) {
    const min = w?.min ?? p.min, label = (w ? title : p.label) || 'Timer', end = t + min * MIN;
    return { timer: { id: crypto.randomUUID(), endsAt: end, label, off: A.off.checked },
      text: `${label}: ${dur(min * 60)} timer, ends ${clockOf(end)}${A.off.checked ? ', then the PC turns off' : ''}` };
  }
  if (!p) return { err: whenTxt ? 'Give it a name' : '' };
  const time = w?.time || p.time, daily = A.daily.checked || p.daily;
  let date = A.day.dataset.touched ? A.day.value : dayKey(addDays(keyDate(dk()), p.days));
  if (!A.day.dataset.touched && !daily && time && date === dk() && dailyMs(time) <= t) date = dayKey(addDays(keyDate(dk()), 1)); // already passed: tomorrow
  const task = { id: crypto.randomUUID(), title: p.title, time, daily, date, alarm: A.alarm.checked && !!time };
  const when = daily ? 'Every day' : dayLabel(date, keyDate(dk()));
  return { task, text: `${when}${time ? ' at ' + time : ''}: ${p.title}${task.alarm ? ', with alarm' : ''}` };
}
function updAdder() {
  const d = draft(), timer = !!d.timer;
  A.day.hidden = timer;
  $('tDaily').hidden = $('tAlarm').hidden = timer;
  $('tOff').hidden = !timer;
  if (d.task && !A.day.dataset.touched) A.day.value = d.task.date; // show where it will land (e.g. moved to tomorrow)
  $('aPreview').textContent = d.err || d.text || 'Name it, then add a time (14:30) or a timer length (20m).';
  $('aPreview').classList.toggle('err', !!d.err);
  $('aAdd').disabled = !d.task && !d.timer;
}
$('fab').onclick = () => openAdder($('adder').hidden);
$('aCancel').onclick = () => openAdder(false);
for (const i of [A.title, A.when, A.daily, A.alarm, A.off]) i.oninput = updAdder;
A.day.onchange = () => { A.day.dataset.touched = '1'; updAdder(); };
for (const b of document.querySelectorAll('#aChips button')) b.onclick = () => {
  A.when.value = b.dataset.w;
  if ('movie' in b.dataset) { A.off.checked = true; if (!A.title.value.trim()) A.title.value = 'Movie'; }
  updAdder();
};
$('adder').onsubmit = e => {
  e.preventDefault();
  const d = draft();
  if (d.timer) { S.timers.push(d.timer); lastAdded = d.timer.id; }
  else if (d.task) { S.tasks.push(d.task); lastAdded = d.task.id; }
  else return;
  openAdder(false);
  changed();
};

// ---- wiring ----
$('toggle').onclick = toggle;
$('brk').onclick = () => { go(now(), true); tick(); };
$('toastOk').onclick = clearAlert;
$('quiet').onclick = () => {
  const t = now();
  if (t < S.quietUntil) { S.quietUntil = 0; for (const r of S.reminders) S.last[r.id] = t; }
  else S.quietUntil = t + 60 * MIN;
  changed();
};
$('doneToggle').onclick = () => { showDone = !showDone; planKey = ''; tick(); };
$('testAlert').onclick = () => notify('Drink some water', 'remind');
$('calSync').onclick = syncCal;

function show(view) {
  for (const v of ['home', 'settings', 'week']) $(v).hidden = v !== view;
  $('fab').hidden = view !== 'home';
  openAdder(false);
  if (view === 'week') { $('week').dataset.k = ''; renderWeek(now()); }
  scrollTo(0, 0);
}
$('openSettings').onclick = () => show($('settings').hidden ? 'settings' : 'home');
$('closeSettings').onclick = () => show('home');
$('openWeek').onclick = () => show('week');
$('closeWeek').onclick = () => show('home');

for (const inp of document.querySelectorAll('[data-s],[data-g],[data-m]')) {
  const obj = inp.dataset.s ? S.settings : inp.dataset.g ? S.guards : S.meals, k = inp.dataset.s || inp.dataset.g || inp.dataset.m;
  const prop = inp.type === 'checkbox' ? 'checked' : 'value';
  inp[prop] = obj[k];
  inp.onchange = () => {
    const num = inp.type === 'number' || (inp.tagName === 'SELECT' && /^\d+$/.test(inp.value));
    const v = inp.type === 'checkbox' ? inp.checked : num ? parseFloat(inp.value) : inp.value;
    if ((v === '' && inp.tagName !== 'TEXTAREA') || Number.isNaN(v) || (inp.type === 'number' && v < +inp.min)) return (inp[prop] = obj[k]);
    obj[k] = v;
    if (k === 'login') desk?.login(v);
    if (!S.pomo.running && ['focus', 'short', 'long'].includes(k)) S.pomo.left = phaseLen(S.pomo.phase, S.settings);
    if (k === 'calUrls') syncCal();
    changed();
  };
}

const toggleTest = () => { location.search = TEST ? '' : '?test'; };
document.addEventListener('keydown', e => {
  const typing = e.target.closest('input, select, textarea');
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyT') { e.preventDefault(); return toggleTest(); }
  if (e.key === 'Escape') { if (!$('adder').hidden) return openAdder(false); if (alert) return clearAlert(); return show('home'); }
  if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.code === 'Space' && !e.target.closest('button')) { e.preventDefault(); toggle(); }
  if (e.key === 'n' && !$('home').hidden) { e.preventDefault(); openAdder(true); }
});
addEventListener('resize', () => { planKey = ''; });

// ---- test mode: move time, jump to the next thing, fire every kind of alert ----
if (TEST) {
  document.body.classList.add('is-test');
  $('testBadge').hidden = $('testPanel').hidden = false;
  const btn = (label, fn, title = '') => el('button', { type: 'button', className: 'soft small', textContent: label, title, onclick: () => { fn(); tick(); } });
  const jumpNext = () => {
    const t = now(), nx = [...curPlan.up].find(i => i.ms > t + 1000);
    setClock(nx ? nx.ms + 1000 : dayStart(t) + 864e5 + 1000);
  };
  $('tTime').replaceChildren(
    btn('Next ›', jumpNext, 'Jump to the next thing on the timeline (its alert fires)'),
    btn('+1 min', () => setClock(now() + MIN)), btn('+10 min', () => setClock(now() + 10 * MIN)), btn('+1 h', () => setClock(now() + 60 * MIN)),
    btn('×60 speed', () => setClock(now(), clk.speed === 60 ? 1 : 60), '1 second = 1 minute; click again for normal speed'),
    btn('Real time', () => setClock(Date.now(), 1)));
  const meal = () => meals()[1] || { id: 'meal:lunch', title: 'Lunch', time: '12:30', daily: true, meal: true };
  $('tAlerts').replaceChildren(...[
    ['Task', () => taskAlert({ id: 'x3', title: 'Send the invoice', date: dk() })],
    ['Alarm', () => notify('Wake-up alarm', 'alarm', [['Stop', () => {}]], true)],
    ['Reminder', () => notify('Sit tall, back against the seat', 'remind', [['Done', () => {}]])],
    ['Meal', () => taskAlert(meal())],
    ['Cook/order', () => notify(`Time to cook or order ${meal().title.toLowerCase()}`, 'remind')],
    ['Calendar', () => notify(`Design review at ${clockOf(now() + 10 * MIN)}`, 'remind')],
    ['Timer', () => notify('Tea is done', 'alarm', [], true)],
    ['Focus done', () => notify('Focus done. Take a short break.', 'done')],
    ['Break over', () => notify('Break is over. Back to focus.', 'alarm')],
    ['Screen time', () => notify('1h 30m at the screen. Look away and stretch.', 'remind')],
    ['Away / back', () => { S.pomo.away = true; }],
    ['Bedtime', () => notify(`It's past ${S.settings.bed}. Time to rest.`, 'remind')],
    ['Night light', () => { tintTest = Date.now() + 5000; notify('Warm night light is on (5 seconds in test).', 'remind'); }],
    ['Shutdown', () => shutdownSoon('Bedtime')],
    ['Widget', () => desk?.mini()],
    ['Reset test data', () => { localStorage.removeItem(KEY); location.reload(); }],
  ].map(([l, f]) => btn(l, f)));
  $('tExit').onclick = toggleTest;
  const fit = () => document.body.style.setProperty('--tp', $('testPanel').offsetHeight + 'px'); // keep + above the panel
  fit();
  addEventListener('resize', fit);
}

document.body.classList.toggle('is-desk', !!desk);
if (desk) {
  setInterval(async () => { idleSec = await desk.idle(); }, 10000);
  desk.onCmd(c => c === 'toggle' ? toggle() : c === 'ok' ? clearAlert() : c.startsWith('act:') && act(+c.slice(4)));
  $('toMini').onclick = () => desk.mini();
  $('quit').onclick = () => desk.close();
}
renderRems();
tick();
setInterval(tick, 1000);
syncCal();
setInterval(syncCal, 15 * MIN);
