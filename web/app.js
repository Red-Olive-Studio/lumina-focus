import { hm, nowMin, dayKey, keyDate, addDays, dayLabel, inWindow, since, nextPhase, phaseLen, fmt, dur, until, soon, normTime, parseAdd, parseWhen, streak, clockOf, calEvents, byDay, allowedWin, resizeMeals, icsUrl, pruneIcs, unzip, gcalLink } from './logic.js';
import { tr, LANG, LOC, trDom } from './i18n.js';
import { timeField, segSelect, swatches } from './ui.js';

const desk = window.desk; // undefined in the browser build
const TEST = new URLSearchParams(location.search).has('test'); // Ctrl+Shift+T, or `npm run test-mode`
const $ = id => document.getElementById(id);
trDom();
const KEY = TEST ? 'lumina:test' : 'lumina'; // test mode never touches your real data
const MIN = 60000, GRACE = 120 * MIN, AWAY = 300;

// ---- clock: real time, or shifted / sped up in test mode ----
const clk = { off: 0, speed: 1, t0: Date.now() };
const now = () => { const r = Date.now(); return r + clk.off + (clk.speed - 1) * (r - clk.t0); };
function setClock(ms, speed = clk.speed) { clk.t0 = Date.now(); clk.speed = speed; clk.off = ms - clk.t0; tick(); }

const MEALS_V4 = [['breakfast', 'Breakfast', 3], ['snack1', 'Morning snack', 5], ['lunch', 'Lunch', 3], ['snack2', 'Afternoon snack', 5], ['dinner', 'Dinner', 3]]; // 0.5 data: 3 or 5 meals
// Body reminders for long days at the PC. The first three are on by default, the rest are optional.
const PRESETS = [
  ['water', '💧', 'Drink water', 45, true], ['posture', '🪑', 'Sit tall', 20, true], ['walk', '🚶', 'Stand and walk', 30, true],
  ['eyes', '🔭', 'Look far away for 20 seconds', 20, false], ['stretch', '🧘', 'Stretch neck and wrists', 50, false],
  ['breathe', '🫁', 'Three slow breaths', 60, false], ['air', '🪟', 'Fresh air', 120, false],
  ['commit', '💾', 'Save and commit', 60, false], ['inbox', '📨', 'Check messages', 90, false],
];
const preset = ([id, icon, text, every, on]) => ({ id, icon, text, every, on });
const CAL_COLORS = ['#6A5BD0', '#2F8C79', '#C2557A', '#3A7BD5', '#B7791F', '#5E8B3A'], COLOR_NAMES = ['Violet', 'Teal', 'Rose', 'Blue', 'Amber', 'Green'];
const DEFAULT = {
  settings: {
    focus: 25, short: 5, long: 15, longEvery: 0, autoNext: true, sound: true, volume: 70, alert: 'popup', theme: 'system',
    wake: '07:00', bed: '23:30', login: false, prep: 30, sleepMin: 90, sleepAction: 'sleep', taskLead: 0, gcal: false, pipAt: 'br',
  },
  meals: resizeMeals([], 3), // [{ id, title, time }], as many as you like
  lock: { on: false, rules: [], meetings: true }, // focus lock: app names or words from tab titles allowed during focus
  reminders: PRESETS.map(preset),
  // nightMode: Lumina's warm tint, Windows' own Night light, or both
  guards: { screen: true, screenLimit: 90, sleep: true, night: true, nightAt: '21:00', nightMode: 'tint', warm: 16, dim: 0, shutdown: false, shutdownAt: '00:30' },
  tasks: [{ id: 'vitamins', time: '09:00', title: 'Vitamins and pills', daily: true }],
  done: {}, fired: {}, last: {}, snooze: [], stats: {}, timers: [], quietUntil: 0,
  cals: [], cal: { events: [], at: 0 }, power: null,
  pomo: { phase: 'focus', round: 1, left: 25 * 60, endsAt: 0, running: false, away: false, from: 0 },
  lastBreak: 0, seen: 0, log: [], hidden: {}, introSeen: false,
  notes: {}, // meeting notes by event: { 'ev:start:title': { title, at, text } }
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
  if (desk?.restore && localStorage.getItem(KEY) === null) try { // app storage came back empty (new install, cleared cache): use the copy on disk
    for (const [k, v] of Object.entries(JSON.parse(desk.restore() || '{}'))) localStorage.setItem(k, v);
  } catch {}
  const raw = localStorage.getItem(KEY) ?? (TEST ? null : localStorage.getItem('dailydoro'));
  try { saved = JSON.parse(raw) || {}; } catch { try { localStorage.setItem(KEY + ':broken', raw); } catch {} } // unreadable: keep a copy before starting fresh
  const d = structuredClone(DEFAULT), fresh = !saved.settings;
  const s = {
    ...d, ...saved, settings: { ...d.settings, ...saved.settings }, guards: { ...d.guards, ...saved.guards },
    cal: { ...d.cal, ...saved.cal }, pomo: { ...d.pomo, ...saved.pomo }, lock: { ...d.lock, ...saved.lock },
  };
  if (saved.meals && !Array.isArray(saved.meals)) { // 0.5 kept { breakfast: '08:30', ... } and a 3-or-5 count
    const n = saved.settings?.mealCount ?? 3;
    s.meals = MEALS_V4.filter(m => m[2] <= n).map(([id, title]) => ({ id, title, time: saved.meals[id] || d.meals.find(x => x.id === id)?.time || '12:00' }));
    delete s.settings.mealCount;
  }
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
  if (s.v < 4) { // 0.5: shorter preset names with icons, and the new optional reminders (off)
    const old = { posture: 'Sit tall, back against the seat', water: 'Drink some water', walk: 'Stand up and walk a little' };
    for (const r of s.reminders) {
      const p = PRESETS.find(x => x[0] === r.id);
      r.icon ??= p ? p[1] : '🔔';
      if (p && r.text === old[r.id]) r.text = p[2];
    }
    for (const p of PRESETS) if (!s.reminders.some(r => r.id === p[0])) s.reminders.push({ ...preset(p), on: false });
    s.v = 4;
  }
  s.log = s.log.filter(x => x.at > t - 8 * 864e5);
  for (const k in s.hidden) if (s.hidden[k] < t) delete s.hidden[k];
  for (const k in s.notes) if (s.notes[k].at < t - 90 * 864e5) delete s.notes[k]; // meeting notes stay 90 days
  if (s.settings.calUrls !== undefined) { // 0.3 kept bare links; now each calendar has a name
    s.cals = s.settings.calUrls.split(/\s+/).filter(Boolean).map((url, i) => ({ id: crypto.randomUUID(), name: `Calendar ${i + 1}`, url }));
    delete s.settings.calUrls;
  }
  for (const tm of s.timers) if (tm.off) tm.power = 'shutdown'; // 0.3 "turn off PC" timers
  // Unfinished to-dos (no time) come along to today; past events and finished one-offs drop off.
  for (const x of s.tasks) if (!x.daily && !x.time && x.date < today && !s.done[x.date]?.includes(x.id)) x.date = today;
  s.tasks = s.tasks.filter(x => x.daily || x.date >= today);
  for (const id in s.fired) if (s.fired[id] < today) delete s.fired[id];
  s.power = null; // a pending sleep/shutdown never survives a restart: its Cancel button is gone
  for (const r of s.reminders) if (r.id === 'eyes' && r.text === 'Look far away, 20s') r.text = 'Look far away for 20 seconds'; // 0.8 wording, only if unedited
  const old = dayKey(t - 400 * 864e5); // keep a year of habit ticks and focus stats
  for (const k in s.done) if (k < old) delete s.done[k];
  for (const k in s.stats) if (k < old) delete s.stats[k];
  if (TEST && fresh) seed(s, t, today);
  return s;
}
let lastSave = 0;
const save = () => { lastSave = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => document.hidden && save());
// Desktop: a copy of everything on disk (next to the app's data), so an update, a reinstall or cleared app storage
// never means adding calendars and settings again. Written shortly after each change and every 10 minutes.
const backup = () => { try { desk?.backup(JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('lumina')).map(k => [k, localStorage.getItem(k)])))); } catch {} };
let planKey = '', backupT;
const changed = () => { save(); renderRems(); planKey = ''; tick(); clearTimeout(backupT); backupT = setTimeout(backup, 2000); };

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
  s.cals = [{ id: 'c1', name: 'Work', url: 'sample', color: CAL_COLORS[0] }, { id: 'c2', name: 'Family', url: 'sample', color: CAL_COLORS[2] }];
  s.log = [
    { at: t - 26 * 60 * MIN, end: t - 25.5 * 60 * MIN, text: 'Focus', kind: 'focus' }, { at: t - 25.5 * 60 * MIN, text: 'Done: Read 20 pages' },
    { at: t - 95 * MIN, end: t - 70 * MIN, text: 'Focus', kind: 'focus' }, { at: t - 70 * MIN, end: t - 65 * MIN, text: 'Break', kind: 'break' },
    { at: t - 40 * MIN, text: 'Added: Reply to Ana' },
  ];
  s.cal = { at: t, events: [
    { start: t + 30 * MIN, end: t + 60 * MIN, title: 'Design review', allDay: false, cal: 'Work' },
    { start: day, end: day + 864e5, title: "Ana's birthday", allDay: true, cal: 'Family' },
    { start: day + 864e5 + 9.5 * 60 * MIN, end: day + 864e5 + 9.75 * 60 * MIN, title: 'Team standup', allDay: false, cal: 'Work' },
  ] };
  for (let i = 1; i <= 6; i++) {
    s.stats[plus(-i)] = { focus: 1800 + (i * 2477) % 12000, sessions: 1 + i % 5, breaks: i % 4 + 1 };
    if (i < 4) s.done[plus(-i)] = ['x5', 'vitamins', 'meal:lunch'];
  }
}

// Every element is built here, so this is where its words get translated (names typed by the user pass through unchanged).
function el(tag, props = {}, ...kids) {
  for (const k of ['textContent', 'title', 'ariaLabel', 'placeholder', ...(props.className === 'bare' ? ['value'] : [])]) if (k in props) props[k] = tr(props[k]);
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter(k => k !== '' && k != null).map(tr));
  return e;
}
const ICON = {
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
};
const iconBtn = (icon, label, onclick, on) => el('button', { className: 'icon act' + (on ? ' on' : ''), innerHTML: ICON[icon], title: label, ariaLabel: label, onclick });

// ---- sound: soft bell notes (fundamental + quiet octave so laptop speakers carry it) ----
// [notes, length, level]: levels even out the peaks (overlapping notes add up), so every sound tops out near -9 dBFS at the default volume
const SFX = { done: [[523.25, 659.25, 783.99, 1046.5], 0.9, 0.75], alarm: [[880, 880, 1174.66], 1.2, 0.75], remind: [[1318.5], 0.7, 1.1], pause: [[587.33], 0.45, 1.1] };
let ctx;
function sfx(kind) {
  if (!S.settings.sound || !SFX[kind]) return;
  try {
    ctx ??= new AudioContext();
    ctx.resume();
    const [notes, len, level] = SFX[kind], v = level * (S.settings.volume ?? 70) / 100;
    if (!v) return;
    notes.forEach((f, i) => {
      const t = ctx.currentTime + 0.02 + i * 0.16;
      for (const [mul, vol] of [[1, 0.4], [2, 0.12]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f * mul;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol * v, t + 0.01);
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
// icon = a nudge: a quiet reminder with nothing to tick off, shown in a softer style.
function notify(text, sound, acts = [], ring = false, icon = '') {
  text = text.raw ?? tr(text); // { raw }: the user's own words, shown as typed
  sfx(ring ? 'alarm' : sound);
  if (S.settings.alert === 'sound' && !ring) return;
  if (alert?.ring && !ring) return; // a ringing alarm stays until it's answered
  alert = { text, acts, ring, icon, real: Date.now(), rang: Date.now() };
  renderAlert();
  const say = $(ring ? 'sayNow' : 'say'); say.textContent = ''; setTimeout(() => { say.textContent = text; }, 50); // screen readers
  if (!icon) desk?.flash();
  if (!desk && !document.hasFocus() && window.Notification?.permission === 'granted') // phones only show notifications from the service worker
    try { navigator.serviceWorker?.controller ? navigator.serviceWorker.ready.then(r => r.showNotification('Lumina', { body: text, icon: 'icon.png' })) : new Notification('Lumina', { body: text }); } catch {}
}
const nudge = (text, icon) => notify(text, 'remind', [], false, icon);
function renderAlert() {
  $('toast').hidden = !alert;
  document.body.classList.toggle('ringing', !!alert?.ring);
  if (!alert) return;
  $('toast').classList.toggle('nudge', !!alert.icon);
  $('toastIcon').textContent = alert.icon;
  $('toastText').textContent = alert.text;
  $('toastActs').replaceChildren(...alert.acts.map(([l], i) => l === 'Done'
    ? el('button', { className: 'tick', innerHTML: ICON.check, title: 'Done', ariaLabel: 'Done', onclick: () => act(i) })
    : el('button', { className: 'soft small', textContent: l, onclick: () => act(i) })));
}
function clearAlert() { if (S.power) { S.power = null; save(); } alert = null; renderAlert(); tick(); } // dismissing a shutdown warning cancels it
function act(i) { const a = alert?.acts[i]; clearAlert(); a?.[1](); }
const later = z => ['In 10 min', () => { S.snooze.push({ ...z, at: now() + 10 * MIN }); save(); }];
const taskAlert = t => notify({ raw: t.meal ? tr(t.title) : t.title }, 'alarm', [['Done', () => setDone(t, true)], later({ id: t.id, text: t.title })], !!t.alarm);

// Sleep / shut down / lock, always with 60 seconds to cancel. Test mode only pretends.
const POWER = { sleep: 'goes to sleep', shutdown: 'shuts down', lock: 'locks' };
function powerSoon(action, why) {
  if (!POWER[action]) return notify(why, 'alarm', [], true);
  S.power = { action, at: now() + 60000 };
  notify(`${why}. The PC ${POWER[action]} in 60 seconds.`, 'alarm', [['Cancel', () => { S.power = null; save(); }]], true);
}
const sleepTimer = () => S.timers.find(x => x.id === 'sleep');
const SLEEPDO = { sleep: 'the PC sleeps', shutdown: 'the PC shuts down', lock: 'the PC locks', remind: 'you get a reminder' };
function toggleSleep() {
  const s = S.settings;
  if (sleepTimer()) { S.timers = S.timers.filter(x => x.id !== 'sleep'); log('Sleep timer stopped'); }
  else { S.timers.push({ id: 'sleep', label: 'Sleep timer', endsAt: now() + s.sleepMin * MIN, power: s.sleepAction }); log(`Sleep timer: ${dur(s.sleepMin * 60)}`); }
  lastAdded = 'sleep';
  changed();
}
// The moon button is easy to hit by accident, so it always asks first.
function askSleep() {
  const s = S.settings, sl = sleepTimer();
  ask(sl ? `Stop the sleep timer? ${fmt((sl.endsAt - now()) / 1000)} left.` : `Start the sleep timer? In ${dur(s.sleepMin * 60)} ${SLEEPDO[s.sleepAction]}.`,
    sl ? 'Stop timer' : 'Start', toggleSleep);
}
function ask(text, ok, fn) {
  $('askText').textContent = tr(text);
  $('askOk').textContent = tr(ok);
  $('askOk').onclick = () => { $('ask').close(); fn(); };
  $('ask').showModal();
}

// ---- history: what you did and when you focused or rested, kept for 8 days ----
const log = (text, x = {}) => { S.log.push({ at: now(), text, ...x }); };
// One entry per stretch the timer ran: focus, break or long break, from start to stop.
function endStretch(ms) {
  const P = S.pomo;
  if (P.from && ms - P.from >= MIN) S.log.push({ at: P.from, end: ms, text: P.phase === 'focus' ? 'Focus' : P.phase === 'long' ? 'Long break' : 'Break', kind: P.phase === 'focus' ? 'focus' : 'break' });
  P.from = 0;
}

// ---- day items: your tasks, habits and meals ----
const dailyMs = (time, ms = now()) => dayStart(ms) + since(hm(time), hm(S.settings.wake)) * MIN;
const taskMs = t => !t.time ? null : t.daily || t.date === dk() ? dailyMs(t.time) : +keyDate(t.date) + hm(t.time) * MIN;
const meals = () => S.meals.filter(m => m.time && !S.hidden[`meal:${m.id}@${dk()}`]).map(m => ({ id: 'meal:' + m.id, title: m.title || 'Meal', time: m.time, daily: true, meal: true }));
// Removing an imported event or a meal hides it (until it's over), since the next sync would bring it back.
const evKey = e => `ev:${e.start}:${e.title}`;
const calOf = e => S.cals.find(c => c.name === e.cal);
const shown = e => !S.hidden[evKey(e)] && !calOf(e)?.off;
const leadOf = e => calOf(e)?.lead ?? 10; // minutes of heads-up before an event; -1 = none
const inMeeting = t => S.cal.events.some(e => !e.allDay && !e.free && shown(e) && e.start <= t && e.end > t);
// Meeting "Join" links open in the default browser (desktop), the phone's browser (app), or a new tab.
const openLink = u => desk ? desk.link(u) : window.open(u, '_blank', 'noopener');
const joinAct = e => e.join ? [['Join', () => openLink(e.join)]] : [];

// ---- meeting notes: one note per calendar event, typed in Lumina, kept 90 days ----
let noteEv = null;
const noteWhen = ms => `${new Date(ms).toLocaleDateString(LOC, { weekday: 'short', day: 'numeric', month: 'short' })} ${clockOf(ms)}`;
function openNote(e) {
  noteEv = { title: e.title, at: e.start };
  $('noteHead').textContent = e.title;
  $('noteWhen').textContent = noteWhen(e.start);
  $('noteText').value = S.notes[evKey(e)]?.text || '';
  $('noteCopy').textContent = tr('Copy');
  desk?.open(); // from the corner widget's alert: bring Lumina up to type in
  if (!$('noteDlg').open) $('noteDlg').showModal();
  $('noteText').focus();
}
$('noteText').oninput = e => {
  const k = evKey({ start: noteEv.at, title: noteEv.title }), text = e.target.value;
  if (text.trim()) S.notes[k] = { ...noteEv, text }; else delete S.notes[k];
  save();
};
$('noteDone').onclick = () => $('noteDlg').close();
$('noteDlg').onclose = () => changed();
$('noteCopy').onclick = () => navigator.clipboard?.writeText(`${noteEv.title} · ${noteWhen(noteEv.at)}\n\n${$('noteText').value}`)
  .then(() => { $('noteCopy').textContent = tr('Copied'); }, () => {});
function hide(key, until, title) { S.hidden[key] = until; log('Removed: ' + title); undoable('Removed: ' + title, () => { delete S.hidden[key]; log('Restored: ' + title); }); changed(); }
// Shown even in "sound only" mode: a mis-click needs a way back.
function undoable(text, fn) {
  if (alert?.ring) return; // never hide a ringing alarm or a shutdown's Cancel
  alert = { text: tr(text), acts: [['Undo', () => { fn(); changed(); }]], ring: false, icon: '↩', real: Date.now(), rang: Date.now() };
  renderAlert();
}
const todays = () => [...meals(), ...S.tasks.filter(t => t.daily || t.date === dk())];
// Minutes of heads-up before a task: its own, or the default from Settings. Meals have their cook-or-order nudge instead.
const taskLead = x => x.meal ? 0 : x.lead ?? S.settings.taskLead;
const doneKey = t => t.daily ? dk() : t.date;
const isDone = t => (S.done[doneKey(t)] || []).includes(t.id);
function setDone(t, on) {
  const d = S.done[doneKey(t)] ||= [];
  if (on && !d.includes(t.id)) { d.push(t.id); sfx('remind'); log('Done: ' + t.title); }
  if (!on && d.includes(t.id)) { d.splice(d.indexOf(t.id), 1); log('Not done: ' + t.title); }
  changed();
}

// ---- focus: optional long breaks; every session and break is counted per day ----
const stat = () => S.stats[dk()] ||= { focus: 0, sessions: 0, breaks: 0 };
const pomoLeft = ms => S.pomo.running ? (S.pomo.endsAt - ms) / 1000 : S.pomo.left;
const liveFocus = ms => S.pomo.phase === 'focus' ? Math.max(0, phaseLen('focus', S.settings) - Math.max(0, pomoLeft(ms))) : 0;
function go(ms, run) {
  const P = S.pomo;
  endStretch(ms);
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
  P.from = run ? ms : 0;
  save();
}
function toggle() {
  if (!desk && window.Notification?.permission === 'default') Notification.requestPermission();
  const P = S.pomo, ms = now();
  if (P.running) { P.left = Math.max(0, pomoLeft(ms)); P.running = false; endStretch(ms); sfx('pause'); }
  else { P.endsAt = ms + P.left * 1000; P.running = true; P.away = false; P.from = ms; }
  save(); tick();
}
// The Break / Focus button: skip to the other phase and start it.
const switchPhase = () => { go(now(), true); tick(); };

// ---- phone app (Expo): the page runs in a WebView; the app fetches calendars and schedules notifications that fire while it's closed ----
const nat = window.ReactNativeWebView, natCalls = new Map();
window.onNative = m => { const c = natCalls.get(m.id); natCalls.delete(m.id); c?.[m.ok ? 0 : 1](m.value); };
const natCall = (type, x = {}) => new Promise((ok, no) => {
  const id = String(Math.random()).slice(2);
  natCalls.set(id, [ok, no]);
  nat.postMessage(JSON.stringify({ type, id, ...x }));
  setTimeout(() => natCalls.has(id) && (natCalls.delete(id), no(new Error('timeout'))), 30000);
});
const fetchIcs = desk ? desk.ics : nat ? url => natCall('ics', { url }) : null; // a plain browser can't read other sites (CORS)
// The next alerts (up to 60, iOS keeps 64) for the phone to deliver even if Lumina is closed.
let lastSched = '';
function schedulePhone(t) {
  if (!nat) return;
  const items = [];
  for (const i of [...curPlan.up, ...curPlan.days.flatMap(([, xs]) => xs)]) {
    if (i.kind === 'remind' || !i.ms || i.allDay || (i.ev && leadOf(i.ev) < 0)) continue;
    const at = i.kind === 'event' ? i.ev.start - leadOf(i.ev) * MIN : i.ms;
    const body = i.kind === 'event' ? `${i.title} at ${clockOf(i.ev.start)}` : i.kind === 'timer' ? `${i.title} is done` : i.kind === 'focus' ? (S.pomo.phase === 'focus' ? 'Focus done. Take a short break.' : 'Break is over. Back to focus.') : i.kind === 'prep' ? `Time to cook or order ${i.meal.title.toLowerCase()}` : i.title;
    if (at > t) items.push({ at, body: tr(body) });
    const lead = i.task ? taskLead(i.task) : 0;
    if (lead > 0 && i.ms - lead * MIN > t) items.push({ at: i.ms - lead * MIN, body: tr(`${i.title} at ${clockOf(i.ms)}`) });
  }
  items.sort((a, b) => a.at - b.at).splice(60);
  const key = JSON.stringify(items);
  if (key !== lastSched) { lastSched = key; nat.postMessage(JSON.stringify({ type: 'schedule', items })); }
}

// ---- calendars: named iCal links, fetched by the desktop or phone app every 15 minutes ----
let syncing = false, syncAgain = false; // one sync at a time; a calendar added meanwhile gets a fresh one right after
async function syncCal() {
  if (syncing) return void (syncAgain = true);
  syncing = true;
  try { await syncOnce(); } finally { syncing = false; if (syncAgain) { syncAgain = false; syncCal(); } }
}
// Imported calendar files (an .ics or Google's export .zip) live in their own key, so the main save stays small.
const fileKey = id => `${KEY}:ics:${id}`;
const getIcs = c => c.file ? Promise.resolve(localStorage.getItem(fileKey(c.id)) || '') : fetchIcs ? fetchIcs(c.url) : Promise.reject(new Error('browser'));
async function syncOnce() {
  const cals = S.cals.filter(c => c.url !== 'sample'), from = dayStart();
  if (!cals.length) { if (!S.cals.length) S.cal = { events: [], at: 0 }; return changed(); }
  $('calStatus').textContent = tr('Syncing…');
  const read = v => { if (!/BEGIN:VCALENDAR/.test(v)) throw new Error('page'); return calEvents(v, from, from + 8 * 864e5); };
  const res = await Promise.allSettled(cals.map(c => getIcs(c).then(read)));
  const keep = new Set(S.cals.map(c => c.id)), events = S.cal.events.filter(e => S.cals.some(c => c.url === 'sample' && c.name === e.cal));
  res.forEach((r, i) => {
    const c = cals[i];
    if (!keep.has(c.id)) return; // removed while syncing
    const why = String(r.reason?.message || r.reason || '');
    c.err = r.status === 'fulfilled' ? '' : why === 'browser' ? 'Calendar links sync in the desktop and phone apps. In a browser, import a file instead.'
      : why === 'page' ? (c.file ? 'No calendar found in that file.' : 'This link opens a web page, not a calendar. Copy the iCal address instead.')
      // a pasted page link becomes Google's public address, which only works for public calendars
      : /HTTP 40[134]/.test(why) && /\/public\/basic\.ics$/.test(c.url) ? "This calendar isn't public. Use its secret iCal address, or import an export file."
      : /HTTP 40[134]/.test(why) ? 'This link no longer works. It may have been reset or made private; copy it again.'
      : /Not a web link/.test(why) ? 'This is not a web link.' : 'Could not load. Check your connection.';
    // offline or a bad answer: keep what we had for this calendar
    const got = c.err ? S.cal.events.filter(e => e.cal === c.name) : r.value.map(e => ({ ...e, cal: c.name }));
    if (!c.err) c.n = got.length;
    events.push(...got);
  });
  // shortcut: 2000 events cap keeps the save small (a week rarely has more); store events per calendar if someone needs more
  S.cal = { events: events.sort((a, b) => a.start - b.start).slice(0, 2000), at: Date.now() };
  changed();
}
// Events you removed from the timeline come back as the calendar has them.
function restoreBtn(c) {
  const gone = Object.keys(S.hidden).filter(k => k.startsWith('ev:') && S.cal.events.some(e => e.cal === c.name && evKey(e) === k));
  return gone.length ? el('button', { type: 'button', className: 'soft small', textContent: `Restore ${gone.length} removed`, title: 'Bring back the events you removed from Lumina',
    onclick: () => { gone.forEach(k => delete S.hidden[k]); log(`Restored ${gone.length} ${gone.length === 1 ? "event" : "events"} from ${c.name}`); changed(); } }) : '';
}
let openCal = ''; // the calendar whose settings are open, kept across re-renders
function renderCals() {
  const host = u => { try { return new URL(u.replace(/^webcal:/i, 'https:')).hostname; } catch { return u; } };
  const rename = (c, name) => {
    name = name.trim();
    if (!name || name === c.name || S.cals.some(x => x.name === name)) return changed();
    for (const e of S.cal.events) if (e.cal === c.name) e.cal = name;
    c.name = name; changed();
  };
  const lead = c => el('select', { ariaLabel: 'Heads-up for ' + c.name, onchange: e => { c.lead = +e.target.value; changed(); } },
    ...[[-1, 'No heads-up'], [0, 'When it starts'], [5, '5 min before'], [10, '10 min before'], [15, '15 min before'], [30, '30 min before']]
      .map(([v, l]) => el('option', { value: v, textContent: l, selected: v === (c.lead ?? 10) })));
  $('cals').replaceChildren(...S.cals.map(c => el('li', { className: c.off ? 'off' : '' },
    el('span', { className: 'cdot', style: `--c:${c.color || CAL_COLORS[0]}` }),
    el('details', { className: 'cinfo', open: openCal === c.id, ontoggle: e => { openCal = e.target.open ? c.id : openCal === c.id ? '' : openCal; } },
      el('summary', {}, el('b', { textContent: c.name }), el('small', { className: c.err ? 'lateTxt' : '',
        textContent: c.err ? (c.err === true ? 'Could not load. Check the link or your connection.' : c.err) : c.off ? 'Hidden from the timeline'
          : c.url === 'sample' ? 'Sample calendar' : (c.file ? 'Imported file' : host(c.url)) + (c.n !== undefined ? ` · ${c.n} ${c.n === 1 ? 'event' : 'events'} this week` : '') })),
      el('div', { className: 'cedit' },
        el('label', {}, 'Name ', el('input', { value: c.name, ariaLabel: 'Name of ' + c.name, onchange: e => rename(c, e.target.value) })),
        el('label', {}, 'Heads-up ', lead(c)),
        el('div', { className: 'crow' }, el('span', { textContent: 'Color' }),
          swatches(CAL_COLORS.map((x, i) => [x, COLOR_NAMES[i]]), c.color || CAL_COLORS[0], tr('Color of ' + c.name), x => { c.color = x; changed(); })),
        el('label', { className: 'chk' }, el('input', { type: 'checkbox', checked: !c.off, onchange: e => { c.off = !e.target.checked; changed(); } }), ' Show on the timeline'))),
    restoreBtn(c),
    iconBtn('x', 'Remove ' + c.name, () => {
      S.cals = S.cals.filter(x => x !== c); S.cal.events = S.cal.events.filter(e => e.cal !== c.name);
      try { localStorage.removeItem(fileKey(c.id)); } catch {}
      changed();
    }))));
  $('calStatus').textContent = tr(S.cals.length ? (S.cal.at ? `Synced ${clockOf(S.cal.at)} · ${S.cal.events.length} events this week` : 'Not synced yet') : 'No calendars yet');
  $('calSync').hidden = !S.cals.length;
}

// ---- main loop: everything is time-based, so a throttled or late tick still fires correctly ----
let tintOn = '', winNightOn = false, tintTest = 0;

// ---- focus lock: while focus runs, other apps and tabs get covered until you switch back ----
let fg = null, locked = null, lockPause = 0, watching = null; // null: tell main once at start, in case a reload left the watcher running
const lockReady = () => !!desk && S.lock.on && S.lock.rules.some(r => r.trim());
function checkLock() {
  if (!desk) return;
  if (lockReady() !== watching) desk.watch(watching = lockReady());
  const P = S.pomo, active = watching && P.running && P.phase === 'focus' && Date.now() >= lockPause && !(S.lock.meetings && inMeeting(now())); // you'll be in Zoom or Teams
  const w = fg?.self ? locked : fg; // clicking the cover or Lumina itself doesn't unlock the app behind it
  const want = active && w && !allowedWin(w, S.lock.rules) ? w : null;
  if (want?.title !== locked?.title) {
    if (want && !locked) log('Locked: ' + want.title);
    locked = want;
    desk.lock(want && { title: want.title, name: want.name });
  }
}
function lockCmd(c) {
  const app = locked?.name;
  if (c === 'allow5') { lockPause = Date.now() + 5 * MIN; log('Focus lock paused for 5 min'); }
  if (c === 'allowApp' && app && !S.lock.rules.includes(app)) { S.lock.rules.push(app); log('Always allowed: ' + app); }
  if (c === 'pause' && S.pomo.running) toggle();
  changed();
}
function tick() {
  const t = now(), s = S.settings, g = S.guards, P = S.pomo, k = dk(t);

  if (P.running && t >= P.endsAt) {
    const wasFocus = P.phase === 'focus';
    go(t, s.autoNext);
    notify(wasFocus ? (P.phase === 'long' ? 'Focus done. Time for a long break.' : 'Focus done. Take a short break.') : 'Break is over. Back to focus.',
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
    if (tm.id !== 'sleep') log(`Timer ended: ${tm.label || 'Timer'}`);
    tm.power ? powerSoon(tm.power, `${tm.label || 'Timer'} ended`) : notify(`${tm.label || 'Timer'} is done`, 'alarm', [], true);
  }
  if (S.power && t >= S.power.at) {
    const a = S.power.action, late = t - S.power.at > 2 * MIN; // e.g. the PC was asleep: don't act on an old countdown
    S.power = null;
    if (late) save();
    else if (TEST) notify(`Test: the PC would ${{ sleep: 'go to sleep', shutdown: 'shut down', lock: 'lock' }[a]} now.`, 'remind');
    else desk?.power(a);
  }

  const awake = inWindow(nowMin(new Date(t)), hm(s.wake), hm(s.bed)), quiet = t < S.quietUntil;
  const once = (id, ms, fn) => { if (ms !== null && t >= ms && t - ms < 30 * MIN && S.fired[id] !== dk(ms)) { S.fired[id] = dk(ms); save(); fn(); } }; // keyed by the alert's own day, so the wake-up day change can't repeat it
  for (const x of todays()) if (x.time && !isDone(x)) {
    const ms = taskMs(x);
    once('task:' + x.id, ms, () => taskAlert(x));
    if (taskLead(x) > 0) once('lead:' + x.id, ms - taskLead(x) * MIN, () => notify(`${x.title} at ${x.time}`, 'remind'));
    if (x.meal && +s.prep > 0) once('prep:' + x.id, ms - s.prep * MIN, () => notify(`Time to cook or order ${x.title.toLowerCase()}`, 'remind'));
  }
  for (const e of S.cal.events) if (!e.allDay && shown(e) && leadOf(e) >= 0)
    once(`cal:${e.start}:${e.title}`, e.start - leadOf(e) * MIN, () => notify(leadOf(e) ? `${e.title} at ${clockOf(e.start)}` : `${e.title} starts now`, 'remind', [...joinAct(e), ['Notes', () => openNote(e)]]));

  // Away from the PC counts as a break: focus pauses, reminders restart when you're back instead of piling up.
  const away = !!desk && idleSec >= AWAY;
  if (away) {
    S.lastBreak = t;
    for (const r of S.reminders) S.last[r.id] = t;
    if (P.running && P.phase === 'focus') {
      const gone = t - idleSec * 1000;
      endStretch(gone);
      P.left = Math.min(phaseLen('focus', s), pomoLeft(t) + idleSec);
      P.running = false; P.away = gone; stat().breaks++;
    }
  } else if (P.away) {
    if (P.away > 1) S.log.push({ at: P.away, end: t, text: 'Away from the screen', kind: 'break' }); // older data stored `true`
    P.away = false;
    notify("You're back. Focus is paused.", 'remind', [['Continue', toggle]]);
  }
  if (awake && !away && !quiet) for (const r of S.reminders) {
    if (!r.on) continue;
    S.last[r.id] ??= t;
    if (t - S.last[r.id] >= r.every * MIN) { S.last[r.id] = t; planKey = ''; nudge(r.text, r.icon || '🔔'); }
  } else if (!away) for (const r of S.reminders) S.last[r.id] = Math.floor(t / MIN) * MIN; // night or paused: start counting again, no burst afterwards (whole minutes: the plan redraws once a minute, not every second)
  const atScreen = (t - S.lastBreak) / MIN;
  if (g.screen && awake && !quiet && P.phase === 'focus' && atScreen >= g.screenLimit && t - (S.last.screen || 0) >= 30 * MIN) {
    S.last.screen = t;
    nudge(`${dur(atScreen * 60)} at the screen. Look away.`, '🔭');
  }
  if (g.sleep && !awake && !away && !quiet && t - (S.last.sleep || 0) >= 15 * MIN) {
    S.last.sleep = t;
    nudge(`It's past bedtime (${s.bed}).`, '🌙');
  }
  const night = (g.night && inWindow(nowMin(new Date(t)), hm(g.nightAt), hm(s.wake))) || Date.now() < tintTest;
  if (desk) {
    const wantTint = night && g.nightMode !== 'windows', wantWin = night && g.nightMode !== 'tint';
    const tint = wantTint ? `${g.warm}/${g.dim}` : ''; // how warm and how dim (0-100), sent again when a slider moves
    if (tint !== tintOn) desk.tint((tintOn = tint) && { warm: +g.warm, dim: +g.dim });
    if (wantWin !== winNightOn) desk.winNight(winNightOn = wantWin); // only on changes, so a Night light you set yourself is left alone
  }
  checkLock();
  if (g.night) once('night', dailyMs(g.nightAt, t), () => nudge(desk ? 'Warm night light on' : 'Turn on Night light', '🌇'));
  if (g.shutdown && (desk || TEST)) once('shutdown', dailyMs(g.shutdownAt, t), () => powerSoon('shutdown', 'Bedtime'));

  if (alert && !away) {
    const r = Date.now();
    if (alert.ring && r - alert.rang >= 20000 && r - alert.real < 300000) { alert.rang = r; sfx('alarm'); }
    // A normal alert stays until you've been back at the PC for a minute; an alarm stays until you answer it.
    if (!alert.ring) { alert.until ??= r + 60000; if (r > alert.until) { alert = null; renderAlert(); } }
  }
  S.seen = t;
  if (Date.now() - lastSave > 15000) save(); // the whole state is big; real changes save right away
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
  for (const e of S.cal.events.filter(shown)) {
    if (e.allDay) { if (dayKey(e.start) <= k && dayKey(e.end - 1) >= k) add(null, 'event', e.title, { ev: e, allDay: true }); }
    else if (e.start <= t && e.end > t) add(e.start, 'event', e.title, { ev: e, ongoing: true });
    else if (e.start > t) add(e.start, 'event', e.title, { ev: e });
  }
  if (t >= S.quietUntil) for (const r of S.reminders) if (r.on) add((S.last[r.id] ?? t) + r.every * MIN, 'remind', `${r.icon || ''} ${r.text}`.trim(), { rem: r });
  if (S.pomo.running) add(S.pomo.endsAt, 'focus', S.pomo.phase === 'focus' ? 'Break' : 'Back to focus');
  for (const tm of S.timers) add(tm.endsAt, 'timer', tm.label || 'Timer', { timer: tm });
  if (g.night) add(dailyMs(g.nightAt, t), 'evening', 'Warm night light');
  if (g.sleep) add(bedMs, 'evening', 'Bedtime');
  if (g.shutdown && (desk || TEST)) add(dailyMs(g.shutdownAt, t), 'evening', 'PC shuts down');

  const nowL = [], up = [];
  for (const i of its) {
    if (i.ms === null || i.ongoing) nowL.push(i);
    else if (i.ms > t) { if (i.ms < end && (i.kind !== 'remind' || i.ms < bedMs)) up.push(i); }
    // Due: "now" for 5 minutes, then "missed" until 2 hours have passed; older is behind you.
    else if (i.task && t - i.ms < GRACE) nowL.push({ ...i, late: t - i.ms > 5 * MIN });
  }
  nowL.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
  up.sort((a, b) => a.ms - b.ms);

  const days = [];
  for (let d = 1; d <= 7; d++) {
    const key = dayKey(addDays(new Date(start), d)), items = [];
    for (const x of S.tasks) if (!x.daily && x.date === key && !isDone(x)) items.push({ ms: taskMs(x), kind: 'task', title: x.title, task: x, day: true });
    // tomorrow's events before wake-up are already in today's list
    for (const e of S.cal.events.filter(shown)) if (dayKey(e.start) === key && (e.allDay || e.start >= end)) items.push({ ms: e.start, kind: 'event', title: e.title, ev: e, allDay: e.allDay, day: true });
    items.sort((a, b) => (a.allDay ? -1 : a.ms ?? Infinity) - (b.allDay ? -1 : b.ms ?? Infinity));
    if (items.length) days.push([dayLabel(key, keyDate(k), LOC), items]);
  }
  return { nowL, up, days };
}

let lastAdded = '', showDone = false, showHist = false, showNotes = false, openDays = new Set(), curPlan = { nowL: [], up: [], days: [] };
function row(i, t) {
  const x = i.task, kind = i.kind, meta = [];
  if (i.late) meta.push(el('span', { className: 'lateTxt', textContent: 'missed' }));
  else if (i.ongoing) meta.push(`happening now, until ${clockOf(i.ev.end)}`);
  else if (i.ms && i.ms - t < 3600e3 && !i.day && !i.timer) meta.push(until(i.ms, t));
  if (kind === 'event' && !i.ongoing && !i.allDay && i.ev.end > i.ev.start) meta.push(`until ${clockOf(i.ev.end)}`);
  if (kind === 'event') meta.push(i.ev.cal || 'calendar');
  if (i.ev?.loc) meta.push(i.ev.loc);
  if (kind === 'remind') meta.push(`every ${i.rem.every} min`);
  if (kind === 'prep') meta.push(`${S.settings.prep} min before ${i.meal.title.toLowerCase()}`);
  if (kind === 'focus') meta.push(S.pomo.phase === 'focus' ? 'focus ends' : 'break ends');
  if (kind === 'timer') { const l = el('span', { className: 'live' }); l.dataset.end = i.timer.endsAt; meta.push(l, { sleep: 'then the PC sleeps', shutdown: 'then the PC shuts down', lock: 'then the PC locks' }[i.timer.power] || 'timer'); }
  if (x && x.daily) { const n = streak(S.done, x.id, keyDate(dk())); meta.push(n >= 2 ? `${n}-day streak` : 'every day'); }
  if (x?.alarm) meta.push('alarm');

  const doable = x || kind === 'remind';
  const done = x && isDone(x);
  const label = x ? i.title : 'Done, start counting again: ' + i.title; // tasks are checkboxes: the name plus checked/unchecked
  const dot = doable
    ? el('button', { className: 'dot', title: x ? (done ? 'Undo' : 'Mark done') : 'Done, start counting again', ariaLabel: label, ...(x && { role: 'checkbox', ariaChecked: String(!!done) }),
      onclick: () => x ? setDone(x, !done) : (S.last[i.rem.id] = now(), sfx('remind'), changed()) })
    : el('span', { className: 'dot' });
  const acts = el('span', { className: 'acts' });
  if (x && !x.meal) acts.append(
    iconBtn('repeat', x.daily ? 'Repeats every day. Click to stop: ' + x.title : 'Repeat every day: ' + x.title, () => { x.daily = !x.daily; x.date = dk(); changed(); }, x.daily),
    iconBtn('x', 'Remove ' + x.title, () => {
      S.tasks = S.tasks.filter(y => y !== x); log('Removed: ' + x.title);
      undoable('Removed: ' + x.title, () => { if (!S.tasks.includes(x)) S.tasks.push(x); log('Restored: ' + x.title); });
      changed();
    }));
  if (x?.meal) acts.append(iconBtn('x', 'Skip today: ' + x.title, () => hide(`${x.id}@${dk()}`, dayStart() + 864e5, x.title)));
  // Join shows from 15 minutes before until the meeting ends.
  if (i.ev?.join && !i.allDay && i.ev.start - t < 15 * MIN && i.ev.end > t) acts.append(el('button', { className: 'soft small join', textContent: 'Join', title: 'Join the call', ariaLabel: 'Join ' + i.title, onclick: () => openLink(i.ev.join) }));
  if (i.ev && !i.allDay) acts.append(iconBtn('note', 'Notes: ' + i.title, () => openNote(i.ev), !!S.notes[evKey(i.ev)]));
  if (i.ev) acts.append(iconBtn('x', 'Remove from Lumina (stays in your calendar): ' + i.title, () => hide(evKey(i.ev), (i.ev.end || i.ev.start) + 864e5, i.ev.title)));
  if (i.rem) acts.append(iconBtn('x', 'Turn off (back on in Settings): ' + i.rem.text, () => { i.rem.on = false; log('Turned off: ' + i.rem.text); changed(); }));
  if (i.timer) acts.append(iconBtn('x', 'Cancel timer: ' + i.title, () => { S.timers = S.timers.filter(y => y !== i.timer); log('Timer cancelled: ' + i.title); changed(); }));
  const color = i.ev && S.cals.find(c => c.name === i.ev.cal)?.color;
  // task and event names are the user's own words: shown as typed, never translated
  return el('li', { style: color ? '--cal:' + color : '', className: `it ${kind}${i.late ? ' late' : ''}${done ? ' done' : ''}${x?.id === lastAdded || i.timer?.id === lastAdded ? ' new' : ''}` },
    el('time', { textContent: i.allDay ? 'All day' : i.ms ? clockOf(i.ms) : '', dateTime: i.ms && !i.allDay ? new Date(i.ms).toISOString() : '', ariaHidden: i.allDay || i.ms ? null : 'true' }),
    dot,
    el('div', { className: 'body' }, el('b', {}, (x && !x.meal) || i.ev ? document.createTextNode(i.title) : i.title), meta.length ? el('small', {}, ...meta.flatMap((m, j) => j ? [' · ', m] : [m])) : ''),
    acts);
}

function renderPlan(t) {
  const P = plan(t);
  curPlan = P;
  schedulePhone(t);
  const doneL = todays().filter(isDone);
  const key = JSON.stringify([Math.floor(t / MIN), P, showDone, doneL.map(x => x.id), showHist && S.log.length, S.cals.map(c => c.color), Object.keys(S.notes), showNotes]);
  if (key !== planKey) {
    planKey = key;
    const had = document.activeElement?.closest('#plan, #later, #doneList') && document.activeElement.getAttribute('aria-label');
    $('plan').replaceChildren(
      el('li', { className: 'it nowrow', ariaCurrent: 'time' }, el('time', { textContent: clockOf(t) }), el('span', { className: 'dot' }), el('div', { className: 'body' }, el('b', { textContent: 'Now' }))),
      ...P.nowL.map(i => row(i, t)),
      ...P.up.map(i => row(i, t)),
      P.nowL.length + P.up.length ? '' : el('li', { className: 'it empty' }, el('time'), el('span', { className: 'dot' }), el('div', { className: 'body' }, el('small', { textContent: 'Nothing else today. Press + to add something.' }))));
    $('later').replaceChildren(...P.days.flatMap(([label, items]) => [el('h3', { className: 'eyebrow day', textContent: label }), el('ol', { className: 'rail' }, ...items.map(i => row(i, t)))]));
    $('doneToggle').hidden = !doneL.length;
    $('doneToggle').textContent = tr(showDone ? 'Hide done' : `${doneL.length} done today`);
    $('doneList').hidden = !showDone || !doneL.length;
    $('doneList').replaceChildren(...doneL.map(x => row({ ms: taskMs(x), kind: x.meal ? 'meal' : x.daily ? 'habit' : 'task', title: x.title, task: x }, t)));
    if (had) [...document.querySelectorAll('#plan [aria-label], #later [aria-label], #doneList [aria-label]')].find(b => b.getAttribute('aria-label') === had)?.focus();
    $('histToggle').textContent = tr(showHist ? 'Hide history' : 'History');
    $('hist').hidden = !showHist;
    if (showHist) renderHist(t);
    // Past meeting notes, newest first; a click opens the note again.
    const notes = Object.values(S.notes).sort((a, b) => b.at - a.at);
    $('notesToggle').hidden = !notes.length;
    $('notesToggle').textContent = tr(showNotes ? 'Hide notes' : 'Meeting notes');
    $('notesList').hidden = !showNotes || !notes.length;
    if (showNotes) $('notesList').replaceChildren(...notes.map(n => el('li', { className: 'it h' },
      el('time', { textContent: clockOf(n.at) }), el('span', { className: 'dot' }),
      el('div', { className: 'body' }, el('button', { type: 'button', className: 'notelink', textContent: n.title, title: 'Notes: ' + n.title, onclick: () => openNote({ start: n.at, title: n.title }) }),
        el('small', { textContent: `${noteWhen(n.at)} · ${n.text.trim().split('\n')[0].slice(0, 80)}` })))));
    lastAdded = '';
  }
  for (const l of document.querySelectorAll('.live')) l.textContent = tr(fmt((+l.dataset.end - t) / 1000) + ' left');
}

// Today's history in time order; earlier days stay folded until you open them.
function renderHist(t) {
  const P = S.pomo, k = dk(t), live = P.from ? [{ at: P.from, text: P.phase === 'focus' ? 'Focus' : 'Break', kind: P.phase === 'focus' ? 'focus' : 'break', live: true }] : [];
  const item = x => el('li', { className: 'it h ' + (x.kind ? 'h-' + x.kind : '') },
    el('time', { textContent: clockOf(x.at) }), el('span', { className: 'dot' }),
    el('div', { className: 'body' }, el('b', { textContent: x.text }),
      x.end || x.live ? el('small', { textContent: x.live ? `now · ${dur((t - x.at) / 1000)} so far` : `until ${clockOf(x.end)} · ${dur((x.end - x.at) / 1000)}` }) : ''));
  const days = byDay([...S.log, ...live], ms => dk(ms)), today = days.find(([d]) => d === k)?.[1] || [];
  $('hist').replaceChildren(
    el('ol', { className: 'rail' }, ...(today.length ? today.map(item) : [el('li', { className: 'it empty' }, el('time'), el('span', { className: 'dot' }), el('div', { className: 'body' }, el('small', { textContent: 'Nothing yet today.' })))])),
    ...days.filter(([d]) => d !== k).map(([d, xs]) => el('details', { className: 'hday', open: openDays.has(d), ontoggle: e => openDays[e.target.open ? 'add' : 'delete'](d) },
      el('summary', { className: 'eyebrow', textContent: `${d === dayKey(addDays(keyDate(k), -1)) ? 'Yesterday' : keyDate(d).toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'short' })} · ${xs.length}` }),
      el('ol', { className: 'rail' }, ...xs.map(item)))));
}

// ---- rendering ----
let lastSnap = '';
function render(t) {
  const P = S.pomo, s = S.settings, left = pomoLeft(t), tt = fmt(left), d = new Date(t);
  $('clock').textContent = clockOf(t);
  $('date').textContent = d.toLocaleDateString(LOC, { weekday: 'short', day: 'numeric' });
  $('time').textContent = tt;
  document.title = tr((P.running ? `${Math.ceil(left / 60)} min · ` : '') + 'Lumina' + (TEST ? ' (test)' : '')); // minutes only: screen readers re-read title changes
  const paused = !P.running && P.left < phaseLen(P.phase, s);
  $('head').textContent = tr(P.phase === 'focus' ? (P.running || paused ? 'Focus' : 'Ready to focus') : P.phase === 'long' ? 'Long break' : 'Break')
    + (s.longEvery > 0 && P.phase === 'focus' ? ` · ${P.round}/${s.longEvery}` : '') + (paused ? ' · ' + tr('paused') : '');
  document.body.dataset.phase = P.phase;
  document.body.classList.toggle('running', P.running);
  $('toggle').ariaLabel = tr(P.running ? 'Pause focus' : 'Start focus');
  $('brk').textContent = tr(P.phase === 'focus' ? 'Break' : 'Focus');
  $('brk').title = tr(P.phase === 'focus' ? 'Take a break now' : 'End the break and focus');
  $('prog').style.width = 100 * (1 - Math.max(0, left) / phaseLen(P.phase, s)) + '%';
  const st = stat(), f = st.focus + liveFocus(t);
  $('stats').textContent = tr(f >= 60 || st.breaks ? `${dur(f)} focus · ${st.sessions} ${st.sessions === 1 ? 'session' : 'sessions'} · ${st.breaks} ${st.breaks === 1 ? 'break' : 'breaks'}` : 'No focus yet today');
  const sl = sleepTimer();
  $('sleepBtn').classList.toggle('on', !!sl);
  $('sleepBtn').setAttribute('aria-pressed', !!sl);
  $('sleepBtn').title = $('sleepBtn').ariaLabel = tr(sl ? `Sleep timer: ${fmt((sl.endsAt - t) / 1000)} left` : `Sleep timer: in ${dur(s.sleepMin * 60)} ${SLEEPDO[s.sleepAction]}`);
  document.documentElement.dataset.theme = s.theme;
  const q = t < S.quietUntil;
  $('quiet').classList.toggle('on', q);
  $('quiet').setAttribute('aria-pressed', q);
  $('quiet').title = $('quiet').ariaLabel = tr(q ? `Reminders paused until ${clockOf(S.quietUntil)}. Click to resume` : 'Pause reminders for 1 hour');
  renderPlan(t);
  if (!$('week').hidden) renderWeek(t);
  if (TEST) $('tClock').textContent = `${d.toLocaleDateString(LOC, { weekday: 'short' })} ${d.toLocaleTimeString(LOC)}${clk.speed > 1 ? ` · ×${clk.speed}` : ''}`;

  if (!desk) return;
  const nx = curPlan.up.find(i => i.kind !== 'remind');
  const snap = JSON.stringify({
    time: tt, phase: P.phase, running: P.running, theme: s.theme,
    next: nx ? `${tr(soon(nx.ms - t))} ${tr(nx.title)}` : tr('All clear'), // short: the widget is narrow
    nextFull: nx ? `${tr(until(nx.ms, t))} · ${tr(nx.title)}` : '',
    alert: alert && { text: alert.text, icon: alert.icon, acts: alert.acts.map(a => a[0]) },
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
    return el('div', { className: 'col' + (key === k ? ' today' : ''), title: `${dayLabel(key, keyDate(k), LOC)}: ${dur(sec(key))}`, role: 'img', ariaLabel: `${keyDate(key).toLocaleDateString(LOC, { weekday: 'long' })}: ${dur(sec(key))} focus` },
      el('span', { className: 'v', textContent: sec(key) >= 60 ? dur(sec(key)) : '' }), el('div', { className: 'track' }, bar),
      el('small', { textContent: keyDate(key).toLocaleDateString(LOC, { weekday: 'narrow' }) }));
  }));
  const habits = todays().filter(x => x.daily);
  $('wHabits').replaceChildren(...habits.map(x => {
    const n = streak(S.done, x.id, keyDate(k));
    return el('li', {}, el('span', { className: 'title', textContent: x.title }),
      el('span', { className: 'week' }, ...keys.map(key => el('i', { className: S.done[key]?.includes(x.id) ? 'on' : '', title: dayLabel(key, keyDate(k), LOC), role: 'img', ariaLabel: `${dayLabel(key, keyDate(k), LOC)}: ${S.done[key]?.includes(x.id) ? 'done' : 'not done'}` }))),
      el('small', { textContent: n >= 2 ? `${n} days` : '' }));
  }), habits.length ? '' : el('li', { className: 'muted', textContent: 'Make anything a daily habit with the repeat button.' }));
}

function renderRems() {
  const box = $('settings'), all = () => [...box.querySelectorAll('input, button, select')], at = all().indexOf(document.activeElement);
  $('rems').replaceChildren(...S.reminders.map(r => el('li', {},
    el('label', { className: 'chk' },
      el('span', { className: 'remicon', textContent: r.icon || '🔔', ariaHidden: 'true' }),
      el('input', { type: 'checkbox', checked: r.on, ariaLabel: r.text, onchange: e => { r.on = e.target.checked; S.last[r.id] = now(); changed(); } }),
      el('input', { className: 'bare', value: r.text, ariaLabel: 'Reminder text', onchange: e => { r.text = e.target.value.trim() || r.text; changed(); } })),
    el('label', { className: 'every', title: 'Every N minutes' },
      el('input', { type: 'number', min: 1, value: r.every, ariaLabel: 'Every N minutes', onchange: e => { r.every = Math.max(1, e.target.valueAsNumber || r.every); changed(); } }), 'min'),
    iconBtn('x', 'Delete reminder', () => { S.reminders = S.reminders.filter(x => x !== r); changed(); }))));
  renderCals();
  renderMeals();
  renderLock();
  if (at >= 0 && !box.contains(document.activeElement)) all()[at]?.focus(); // the list was rebuilt under the cursor
}

// Meals: pick how many, then name and time each one. Each gets its own reminder (and a cook-or-order one before it).
function renderMeals() {
  $('mealCount').value = S.meals.length;
  const sorted = [...S.meals].sort((a, b) => since(hm(a.time), hm(S.settings.wake)) - since(hm(b.time), hm(S.settings.wake)));
  $('mealList').replaceChildren(...sorted.map(m => el('li', {},
    el('input', { className: 'bare', value: m.title, ariaLabel: 'Meal name', onchange: e => { m.title = e.target.value.trim() || m.title; changed(); } }),
    timeField(el('input', { type: 'time', value: m.time, ariaLabel: 'Time of ' + m.title, onchange: e => { m.time = normTime(e.target.value) || m.time; changed(); } })),
    iconBtn('x', 'Remove ' + m.title, () => { S.meals = S.meals.filter(x => x !== m); changed(); }))));
}
$('mealCount').onchange = e => {
  const n = Math.min(12, Math.max(0, Math.round(e.target.valueAsNumber)));
  if (Number.isFinite(n)) S.meals = resizeMeals(S.meals, n, S.settings.wake, S.settings.bed);
  changed();
};

// Focus lock settings: the allowed list, and a picker of what's open right now.
function renderLock() {
  $('lockOn').checked = S.lock.on;
  $('lockMeet').checked = S.lock.meetings;
  $('lockRules').replaceChildren(...S.lock.rules.map(r => el('li', {}, el('span', { textContent: r }),
    iconBtn('x', 'Remove ' + r, () => { S.lock.rules = S.lock.rules.filter(x => x !== r); changed(); }))));
  $('lockHint').hidden = !S.lock.on || S.lock.rules.length > 0;
}
const addRule = r => { r = r.trim(); if (r && !S.lock.rules.some(x => x.toLowerCase() === r.toLowerCase())) S.lock.rules.push(r); changed(); };
$('lockOn').onchange = e => { S.lock.on = e.target.checked; changed(); };
$('lockMeet').onchange = e => { S.lock.meetings = e.target.checked; changed(); };
$('addRule').onsubmit = e => { e.preventDefault(); addRule(e.target.rule.value); e.target.reset(); };
$('pickWin').onclick = async () => {
  const wins = await desk.windows().catch(() => []);
  // "Inbox - Gmail - Google Chrome" -> tab part "Inbox - Gmail"
  const tab = t => t.split(' - ').slice(0, -1).join(' - ') || t;
  $('winList').replaceChildren(...wins.map(w => el('li', {},
    el('div', { className: 'cinfo' }, el('b', { textContent: w.name }), el('small', { textContent: w.title })),
    el('button', { type: 'button', className: 'soft small', textContent: '+ app', title: 'Allow all of ' + w.name, onclick: () => addRule(w.name) }),
    w.title.includes(' - ') ? el('button', { type: 'button', className: 'soft small', textContent: '+ tab', title: 'Allow only: ' + tab(w.title), onclick: () => addRule(tab(w.title)) }) : '')),
    wins.length ? '' : el('li', { className: 'muted', textContent: 'No open windows found.' }));
};

// ---- the + button: name, time or timer length, done ----
const A = { title: $('aTitle'), when: $('aWhen'), day: $('aDay'), daily: $('aDaily'), alarm: $('aAlarm'), lead: $('aLead'), gcal: $('aGcal') };
function openAdder(on) {
  if (!on && !$('adder').hidden && $('adder').contains(document.activeElement)) $('fab').focus();
  $('adder').hidden = !on;
  $('fab').setAttribute('aria-expanded', on);
  $('fab').classList.toggle('open', on);
  if (on) { $('adder').reset(); A.day.value = A.day.min = dk(); A.day.dataset.touched = ''; A.lead.value = S.settings.taskLead; A.gcal.checked = S.settings.gcal; updAdder(); A.title.focus(); }
}
function draft() {
  const t = now(), title = A.title.value.trim(), whenTxt = A.when.value.trim(), w = whenTxt ? parseWhen(whenTxt) : null;
  if (whenTxt && !w) return { err: 'Use a time like 14:30 or a length like 20m' };
  const p = title ? parseAdd(title, new Date(t)) : null;
  if (w?.min || (!w && p?.timer)) {
    const min = w?.min ?? p.min, label = (w ? title : p.label) || 'Timer', end = t + min * MIN;
    const hint = /^\d{1,2}$/.test(whenTxt) ? ` (for ${whenTxt} o'clock, type ${whenTxt}:00)` : ''; // a bare "9" means minutes
    return { timer: { id: crypto.randomUUID(), endsAt: end, label }, text: `${label}: ${dur(min * 60)} timer, ends ${clockOf(end)}${hint}` };
  }
  if (!p) return { err: whenTxt ? 'Give it a name' : '' };
  const time = w?.time || p.time, daily = A.daily.checked || p.daily;
  let date = A.day.dataset.touched && A.day.value ? A.day.value : dayKey(addDays(keyDate(dk()), p.days));
  if (!A.day.dataset.touched && !daily && time && date === dk() && dailyMs(time) <= t) date = dayKey(addDays(keyDate(dk()), 1)); // already passed: tomorrow
  const task = { id: crypto.randomUUID(), title: p.title, time, daily, date, alarm: A.alarm.checked && !!time, lead: +A.lead.value };
  const when = tr(daily ? 'Every day' : dayLabel(date, keyDate(dk()), LOC)) + (time ? (LANG === 'tr' ? ' ' : ' at ') + time : '');
  const passed = !daily && time && date === dk() && dailyMs(time) + MIN <= t ? ` (${tr('already passed')})` : '';
  const extra = [task.alarm && tr('with alarm'), time && task.lead && tr(`${task.lead} min heads-up`)].filter(Boolean).map(x => ', ' + x).join('');
  return { task, text: `${when}: ${p.title}${extra}${passed}` };
}
function updAdder() {
  const d = draft(), timer = !!d.timer;
  $('aDayRow').hidden = $('aToggles').hidden = timer;
  if (d.task && !A.day.dataset.touched) A.day.value = d.task.date; // show where it will land (e.g. moved to tomorrow)
  for (const b of document.querySelectorAll('[data-d]')) b.classList.toggle('on', A.day.value === dayKey(addDays(keyDate(dk()), +b.dataset.d)));
  $('aPreview').textContent = tr(d.err || d.text || 'Name it, then add a time (14:30) or a timer length (20m).');
  $('aPreview').classList.toggle('err', !!d.err);
  $('aAdd').disabled = !d.task && !d.timer;
}
$('fab').onclick = () => openAdder($('adder').hidden);
$('aCancel').onclick = () => openAdder(false);
for (const i of [A.title, A.when, A.daily, A.alarm, A.lead]) i.oninput = updAdder;
A.day.onchange = () => { A.day.dataset.touched = '1'; updAdder(); };
for (const b of document.querySelectorAll('[data-d]')) b.onclick = () => {
  A.day.value = dayKey(addDays(keyDate(dk()), +b.dataset.d));
  A.day.dataset.touched = '1';
  updAdder();
};
for (const b of document.querySelectorAll('#aChips button')) b.onclick = () => { A.when.value = b.dataset.w; updAdder(); };
$('adder').onsubmit = e => {
  e.preventDefault();
  const d = draft();
  if (d.timer) { S.timers.push(d.timer); lastAdded = d.timer.id; log(`Timer: ${d.timer.label}, ${dur((d.timer.endsAt - now()) / 1000)}`); }
  else if (d.task) {
    S.tasks.push(d.task); lastAdded = d.task.id; log('Added: ' + d.task.title);
    S.settings.gcal = A.gcal.checked; // remembered for next time
    if (A.gcal.checked) openLink(gcalLink(d.task)); // opens Google Calendar with the event filled in; Save there
  }
  else return;
  openAdder(false);
  changed();
};

// ---- wiring ----
$('toggle').onclick = toggle;
$('brk').onclick = switchPhase;
$('toastOk').onclick = clearAlert;
$('quiet').onclick = () => {
  const t = now();
  if (t < S.quietUntil) { S.quietUntil = 0; for (const r of S.reminders) S.last[r.id] = t; log('Reminders back on'); }
  else { S.quietUntil = t + 60 * MIN; log('Reminders paused for 1 hour'); }
  changed();
};
$('doneToggle').onclick = () => { showDone = !showDone; planKey = ''; tick(); };
$('histToggle').onclick = () => { showHist = !showHist; planKey = ''; tick(); };
$('notesToggle').onclick = () => { showNotes = !showNotes; planKey = ''; tick(); };
$('testAlert').onclick = () => nudge('Drink water', '💧');
document.querySelector('[data-s=volume]').addEventListener('change', () => setTimeout(sfx, 0, 'remind')); // after the setting saves: hear the new level
$('askNo').onclick = () => $('ask').close();
$('addRem').onsubmit = e => {
  e.preventDefault();
  const f = new FormData(e.target), text = f.get('text').trim();
  if (!text) return;
  S.reminders.push({ id: crypto.randomUUID(), icon: '🔔', text, every: Math.max(1, +f.get('every') || 60), on: true });
  e.target.reset();
  changed();
};
$('calSync').onclick = syncCal;
// Corner widget: a corner of the screen, or docked on the taskbar.
const renderPip = () => { for (const b of document.querySelectorAll('[data-pip]')) b.classList.toggle('on', b.dataset.pip === S.settings.pipAt); };
for (const b of document.querySelectorAll('[data-pip]')) b.onclick = () => { S.settings.pipAt = b.dataset.pip; desk?.pipAt(b.dataset.pip); renderPip(); save(); };
renderPip();

function show(view) {
  for (const v of ['home', 'settings', 'week', 'intro']) $(v).hidden = v !== view;
  $('fab').hidden = view !== 'home';
  openAdder(false);
  if (view === 'week') { $('week').dataset.k = ''; renderWeek(now()); }
  if (view === 'settings') for (const sel of $('settings').querySelectorAll('select[hidden]')) sel.syncSeg?.();
  scrollTo(0, 0);
  if (view !== 'home') { const h = $(view).querySelector('h1, h2'); h?.setAttribute('tabindex', '-1'); h?.focus(); }
}
$('openSettings').onclick = () => show($('settings').hidden ? 'settings' : 'home');
$('closeSettings').onclick = () => show('home');
$('openWeek').onclick = () => show('week');
$('closeWeek').onclick = () => show('home');
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => show('home');
$('sleepBtn').onclick = askSleep;
$('openIntro').onclick = () => show('intro');
$('introGo').onclick = () => { S.introSeen = true; save(); show('home'); };
$('addCal').onsubmit = e => {
  e.preventDefault();
  const v = Object.fromEntries(new FormData(e.target));
  const name = v.name.trim(), url = icsUrl(v.url);
  if (!name || !url) return;
  if (!/^https?:\/\//i.test(url)) { $('calStatus').textContent = tr('That is not a web link. Paste the iCal address that starts with https://'); return; }
  S.cals.push({ id: crypto.randomUUID(), name: freeName(name), url, color: CAL_COLORS[S.cals.length % CAL_COLORS.length] });
  e.target.reset();
  syncCal();
};
const freeName = name => { let nm = name; for (let i = 2; S.cals.some(c => c.name === nm); i++) nm = `${name} ${i}`; return nm; };
// No secret iCal address (work accounts can hide it)? Import Google's export (.zip) or any .ics file instead.
// It's a snapshot: importing a newer export of the same calendar replaces it.
$('calImport').onclick = () => $('calFile').click();
$('calFile').onchange = async e => {
  const files = [...e.target.files];
  e.target.value = '';
  let n = 0, err = 'No calendar found in that file.';
  for (const f of files) try {
    const list = /\.zip$/i.test(f.name) ? await unzip(await f.arrayBuffer()) : [{ name: f.name, text: await f.text() }];
    for (const x of list) {
      if (!/BEGIN:VCALENDAR/i.test(x.text)) continue;
      const name = x.name.replace(/\.ics$/i, '').replace(/@.*$/, '').replace(/_/g, ' ').trim().slice(0, 40) || 'Calendar';
      const old = S.cals.find(c => c.file && c.name === name), id = old?.id || crypto.randomUUID();
      localStorage.setItem(fileKey(id), pruneIcs(x.text, dayStart())); // before adding, so a file too big to keep adds nothing
      if (!old) S.cals.push({ id, name: freeName(name), url: 'file', file: true, color: CAL_COLORS[S.cals.length % CAL_COLORS.length] });
      n++;
    }
  } catch (x) { if (x?.name === 'QuotaExceededError') err = 'That file is too big to keep. Export one calendar at a time.'; }
  await syncCal();
  $('calStatus').textContent = tr(n ? `Imported ${n} ${n === 1 ? 'calendar' : 'calendars'}` : err);
};
try { $('lang').value = localStorage.getItem('lumina:lang') || 'auto'; } catch {}
$('lang').onchange = e => { try { localStorage.setItem('lumina:lang', e.target.value); } catch {} backup(); location.reload(); };

for (const inp of document.querySelectorAll('[data-s],[data-g]')) {
  const obj = inp.dataset.s ? S.settings : S.guards, k = inp.dataset.s || inp.dataset.g;
  const prop = inp.type === 'checkbox' ? 'checked' : 'value';
  inp[prop] = obj[k];
  inp.onchange = () => {
    const num = inp.type === 'number' || inp.type === 'range' || (inp.tagName === 'SELECT' && /^\d+$/.test(inp.value));
    const v = inp.type === 'checkbox' ? inp.checked : num ? parseFloat(inp.value) : inp.classList.contains('tval') ? normTime(inp.value) ?? '' : inp.value;
    if ((v === '' && inp.tagName !== 'TEXTAREA') || Number.isNaN(v) || (inp.type === 'number' && v < +inp.min)) return (inp[prop] = obj[k]);
    obj[k] = v;
    if (k === 'login') desk?.login(v);
    if (k === 'warm' || k === 'dim') tintTest = Date.now() + 4000; // show the new level for a moment, even in daytime
    if (!S.pomo.running && ['focus', 'short', 'long'].includes(k)) S.pomo.left = phaseLen(S.pomo.phase, S.settings);
    changed();
  };
}

// Friendlier controls over the plain ones, once their saved values are in.
for (const i of $('settings').querySelectorAll('input[type=time]')) timeField(i);
for (const sel of [document.querySelector('[data-s=theme]'), document.querySelector('[data-s=alert]'), $('lang')]) segSelect(sel);

const toggleTest = () => { location.search = TEST ? '' : '?test'; };
document.addEventListener('keydown', e => {
  const typing = e.target.closest('input, select, textarea');
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyT') { e.preventDefault(); return toggleTest(); }
  if ($('ask').open || $('noteDlg').open) return; // dialogs handle their own keys
  if (e.key === 'Escape') { if (!$('adder').hidden) return openAdder(false); if (alert) return clearAlert(); if (!typing) show('home'); return; }
  if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); toggle(); }
  if (e.key.toLowerCase() === 'n' && !$('home').hidden) { e.preventDefault(); openAdder(true); }
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
    ['Reminder', () => nudge('Sit tall', '🪑')],
    ['Meal', () => taskAlert(meal())],
    ['Cook/order', () => notify(`Time to cook or order ${meal().title.toLowerCase()}`, 'remind')],
    ['Calendar', () => notify(`Design review at ${clockOf(now() + 10 * MIN)}`, 'remind')],
    ['Timer', () => notify('Tea is done', 'alarm', [], true)],
    ['Focus done', () => notify('Focus done. Take a short break.', 'done')],
    ['Break over', () => notify('Break is over. Back to focus.', 'alarm')],
    ['Screen time', () => nudge('1h 30m at the screen. Look away.', '🔭')],
    ['Away / back', () => { S.pomo.away = now() - 10 * MIN; }],
    ['Bedtime', () => nudge(`It's past bedtime (${S.settings.bed}).`, '🌙')],
    ['Night light', () => { tintTest = Date.now() + 5000; nudge('Warm night light on (5 s in test)', '🌇'); }],
    ['Sleep timer 1 min', () => { S.timers = S.timers.filter(x => x.id !== 'sleep'); S.timers.push({ id: 'sleep', label: 'Sleep timer', endsAt: now() + MIN, power: S.settings.sleepAction }); planKey = ''; }],
    ['Bedtime shutdown', () => powerSoon('shutdown', 'Bedtime')],
    ['Lock', () => powerSoon('lock', 'Sleep timer ended')],
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
  desk.onCmd(c => c === 'toggle' ? toggle() : c === 'brk' ? switchPhase() : c === 'ok' ? clearAlert() : c.startsWith('act:') ? act(+c.slice(4)) : c.startsWith('lock:') ? lockCmd(c.slice(5)) : c.startsWith('pip:') && (S.settings.pipAt = c.slice(4), renderPip(), save()));
  desk.onFg(w => { fg = w; checkLock(); });
  desk.lock(null); // a reload may have left the cover up
  $('toMini').onclick = () => desk.mini();
  $('quit').onclick = () => desk.close();
  if (S.settings.login) desk.login(true); // re-register this exe: an older portable Lumina registered its own path
  backup(); // right away, so data from an older Lumina is on disk from the first run of this one
  setInterval(backup, 10 * MIN);
}
// Phone / browser: installable and works offline (the desktop app loads files directly and doesn't need it).
if (!desk && location.protocol.startsWith('http')) navigator.serviceWorker?.register('sw.js').catch(() => {});
renderRems();
tick();
if (!S.introSeen) show('intro');
setInterval(tick, 1000);
syncCal();
setInterval(syncCal, 15 * MIN);
