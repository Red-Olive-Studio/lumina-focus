import { hm, nowMin, dayKey, addDays, dayLabel, inWindow, since, pos, nextPhase, phaseLen, fmt, dur, until, parseAdd, streak, cluster, hhmm } from './logic.js';

const desk = window.desk; // undefined in the browser build
const $ = id => document.getElementById(id);
const KEY = 'lumina', OLD_KEY = 'dailydoro';

const DEFAULT = {
  settings: { focus: 25, short: 5, long: 15, rounds: 4, autoNext: true, sound: true, alert: 'popup', wake: '07:00', bed: '23:30', login: false },
  reminders: [
    { id: 'water', text: 'Sip some water', every: 45, on: true },
    { id: 'posture', text: 'Sit tall, relax your shoulders', every: 20, on: true },
    { id: 'walk', text: 'Stand up and move a little', every: 30, on: true },
  ],
  guards: { screen: true, screenLimit: 90, sleep: true, night: true, nightAt: '21:00', shutdown: false, shutdownAt: '00:30' },
  tasks: [
    { id: 'breakfast', time: '08:30', title: 'Breakfast', daily: true },
    { id: 'vitamins', time: '09:00', title: 'Vitamins', daily: true },
    { id: 'lunch', time: '12:30', title: 'Lunch', daily: true },
    { id: 'dinner', time: '19:00', title: 'Dinner', daily: true },
  ],
  done: {}, fired: {}, last: {}, snooze: [], focusLog: {},
  pomo: { phase: 'focus', round: 1, left: 25 * 60, endsAt: 0, running: false },
  timer: null, lastBreak: 0, seen: 0,
};

const S = load();
function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY)) || {}; } catch {}
  const d = structuredClone(DEFAULT);
  const s = { ...d, ...saved, settings: { ...d.settings, ...saved.settings }, guards: { ...d.guards, ...saved.guards } };
  const now = Date.now(), today = dayKey(new Date());
  if (now - s.seen > 10 * 60000) { // app was closed: start fresh instead of replaying missed alerts
    s.lastBreak = now;
    s.last = {};
    s.pomo = { ...d.pomo, left: phaseLen('focus', s.settings) };
  }
  // Unfinished to-dos (no time) come along to today; past events and finished one-offs drop off.
  for (const t of s.tasks) if (!t.daily && !t.time && t.date < today && !s.done[t.date]?.includes(t.id)) t.date = today;
  s.tasks = s.tasks.filter(t => t.daily || t.date >= today);
  return s;
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const changed = () => { save(); renderLists(); tick(); };

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
const ICON = {
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
};

// ---- sound: soft bell notes (fundamental + quiet octave so laptop speakers carry it) ----
const SFX = {
  done: [[523.25, 659.25, 783.99, 1046.5], 0.9],
  alarm: [[880], 1.5],
  remind: [[1318.5], 0.7],
  pause: [[587.33], 0.45],
};
let ctx;
function sfx(kind) {
  if (!S.settings.sound || !SFX[kind]) return;
  try {
    ctx ??= new AudioContext();
    ctx.resume();
    const [notes, len] = SFX[kind];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + 0.02 + i * 0.11;
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

// ---- alerts: one current alert, shown as a toast here and in the corner widget when you're elsewhere ----
let alert = null, idleSec = 0;
const AWAY = 300; // seconds without mouse/keyboard = you stepped away
// acts: [[label, fn], ...]
function notify(text, sound, acts = []) {
  sfx(sound);
  if (S.settings.alert === 'sound') return;
  alert = { text, acts };
  renderAlert();
  desk?.flash();
  if (!desk && !document.hasFocus()) try { new Notification('Lumina', { body: text }); } catch {}
}
function renderAlert() {
  $('toast').hidden = !alert;
  if (!alert) return;
  $('toastText').textContent = alert.text;
  $('toastActs').replaceChildren(...alert.acts.map(([l], i) => el('button', { className: 'soft small', textContent: l, onclick: () => act(i) })));
}
function clearAlert() { alert = null; renderAlert(); tick(); }
function act(i) { const a = alert?.acts[i]; clearAlert(); a?.[1](); }
const later = z => ['In 10 min', () => { S.snooze.push({ ...z, at: Date.now() + 600000 }); save(); }];
const taskAlert = t => notify(t.title, 'alarm', [['Done', () => setDone(t, true)], later({ id: t.id, text: t.title, sound: 'alarm' })]);

function shutdownSoon(why) {
  desk.shutdown(true);
  notify(`${why}: the PC shuts down in 60 seconds`, 'alarm', [['Cancel', () => desk.shutdown(false)]]);
}

// ---- tasks ----
const todays = () => {
  const k = dayKey(new Date());
  return S.tasks.filter(t => t.daily || t.date === k).sort((a, b) => (a.time ? hm(a.time) : 1e4) - (b.time ? hm(b.time) : 1e4));
};
const doneKey = t => t.daily ? dayKey(new Date()) : t.date;
const isDone = t => (S.done[doneKey(t)] || []).includes(t.id);
function setDone(t, on) {
  const d = S.done[doneKey(t)] ||= [];
  if (on && !d.includes(t.id)) { d.push(t.id); sfx('remind'); }
  if (!on && d.includes(t.id)) d.splice(d.indexOf(t.id), 1);
  changed();
}

// ---- pomodoro ----
const pomoLeft = ms => S.pomo.running ? (S.pomo.endsAt - ms) / 1000 : S.pomo.left;
function go(ms, run) {
  const P = S.pomo, k = dayKey(new Date(ms));
  if (P.phase === 'focus') S.focusLog[k] = (S.focusLog[k] || 0) + Math.max(0, phaseLen('focus', S.settings) - Math.max(0, pomoLeft(ms)));
  else S.lastBreak = ms;
  [P.phase, P.round] = nextPhase(P.phase, P.round, S.settings);
  P.left = phaseLen(P.phase, S.settings);
  P.running = run;
  P.endsAt = ms + P.left * 1000;
  save();
}
function toggle() {
  if (!desk && window.Notification?.permission === 'default') Notification.requestPermission();
  const P = S.pomo, ms = Date.now();
  if (P.running) { P.left = Math.max(0, pomoLeft(ms)); P.running = false; sfx('pause'); }
  else { P.endsAt = ms + P.left * 1000; P.running = true; }
  save(); tick();
}

// ---- main loop: everything is time-based, so a throttled or late tick still fires correctly ----
let tintOn = false, shownMin = '';
function tick() {
  const now = new Date(), ms = now.getTime(), m = nowMin(now), today = dayKey(now);
  const s = S.settings, g = S.guards, P = S.pomo;

  if (P.running && ms >= P.endsAt) {
    const wasFocus = P.phase === 'focus';
    go(ms, s.autoNext);
    const start = s.autoNext ? [] : [['Start', toggle]];
    notify(!wasFocus ? 'Break is over. Ready to focus?'
      : P.phase === 'long' ? `${s.rounds} rounds done. Take a long break.` : 'Round done. Take a short break.',
    wasFocus ? 'done' : 'alarm', start);
  }
  const due = S.snooze.filter(z => ms >= z.at);
  S.snooze = S.snooze.filter(z => ms < z.at);
  for (const z of due) {
    const t = z.id && S.tasks.find(x => x.id === z.id);
    t ? !isDone(t) && taskAlert(t) : notify(z.text, z.sound);
  }
  if (S.timer && ms >= S.timer.endsAt) {
    const t = S.timer; S.timer = null;
    notify(`${t.label || 'Timer'} is done`, 'alarm');
  }

  const awake = inWindow(m, hm(s.wake), hm(s.bed));
  const once = (id, at, fn) => { if (S.fired[id] !== today && since(m, hm(at)) < 30) { S.fired[id] = today; fn(); } };
  for (const t of todays()) if (t.time && !isDone(t)) once('task:' + t.id, t.time, () => taskAlert(t));

  // Away from the PC counts as a break, and reminders restart when you're back instead of piling up.
  const away = idleSec >= AWAY;
  if (away) { S.lastBreak = ms; for (const r of S.reminders) S.last[r.id] = ms; }
  if (awake && !away) for (const r of S.reminders) {
    if (!r.on) continue;
    S.last[r.id] ??= ms;
    if (ms - S.last[r.id] >= r.every * 60000) { S.last[r.id] = ms; notify(r.text, 'remind'); }
  }
  const atScreen = (ms - S.lastBreak) / 60000;
  if (g.screen && awake && P.phase === 'focus' && atScreen >= g.screenLimit && ms - (S.last.screen || 0) >= 30 * 60000) {
    S.last.screen = ms;
    notify(`${dur(atScreen * 60)} at the screen. Look away and stretch.`, 'remind');
  }
  if (g.sleep && !awake && !away && ms - (S.last.sleep || 0) >= 15 * 60000) {
    S.last.sleep = ms;
    notify(`It's past ${s.bed}. Time to rest.`, 'remind');
  }
  const night = g.night && inWindow(m, hm(g.nightAt), hm(s.wake));
  if (desk && night !== tintOn) desk.tint(tintOn = night);
  if (g.night) once('night', g.nightAt, () => notify(desk ? 'Warm night light is on.' : 'Evening: turn on Night light.', 'remind'));
  if (g.shutdown && desk) once('shutdown', g.shutdownAt, () => shutdownSoon('Bedtime'));

  // An alert stays until you've been back at the PC for a minute, so you don't miss it while away.
  if (alert && !away) { alert.until ??= ms + 60000; if (ms > alert.until) { alert = null; renderAlert(); } }

  const minute = today + Math.floor(m);
  if (minute !== shownMin) { shownMin = minute; renderLists(); } // tasks move from "Later" to "Now" as time passes
  S.seen = ms;
  save();
  render(now, ms);
}

// ---- timeline: from now to bedtime, nothing behind you ----
function points(now) {
  const ms = now.getTime(), m = Math.floor(nowMin(now)), s = S.settings, g = S.guards, bed = hm(s.bed);
  const at = t => Math.floor(nowMin(new Date(t)));
  const items = todays().filter(t => t.time && !isDone(t)).map(t => ({ at: hm(t.time), title: t.title, task: t, kind: 'task' }));
  for (const r of S.reminders) {
    const next = (S.last[r.id] ?? ms) + r.every * 60000;
    if (r.on && next - ms < 864e5) items.push({ at: at(next), title: r.text, kind: 'remind' });
  }
  if (S.timer) items.push({ at: at(S.timer.endsAt), title: S.timer.label || 'Timer', kind: 'timer' });
  if (g.night) items.push({ at: hm(g.nightAt), title: 'Warm night light', kind: 'guard' });
  if (g.shutdown && desk) items.push({ at: hm(g.shutdownAt), title: 'PC shuts down', kind: 'guard' });
  return items.filter(i => inWindow(i.at, m, bed)).sort((a, b) => since(a.at, m) - since(b.at, m));
}

function drawLine(items, [start, end]) {
  const pts = $('line').querySelector('.pts'), w = $('line').clientWidth || 300;
  const key = JSON.stringify([items.map(i => [i.at, i.title, i.kind]), start, end, w]);
  if (pts.dataset.k === key) return; // rebuild only on change so hover tooltips survive
  pts.dataset.k = key;
  pts.replaceChildren(...cluster(items.map(i => ({ ...i, p: pos(i.at, start, end) * w })), 18).map(({ p, items: g }) => {
    const i = g.find(x => x.kind === 'task') || g[0], tip = g.map(x => `${hhmm(x.at)}  ${x.title}`).join('\n');
    const b = g.length === 1 && i.task
      ? el('button', { title: tip + '\nClick to mark done', ariaLabel: 'Mark done: ' + tip, onclick: () => setDone(i.task, true) })
      : el('span', { title: tip });
    b.className = 'pt ' + i.kind;
    if (g.length > 1) b.append(el('i', { textContent: g.length }));
    b.style.left = p + 'px';
    return b;
  }));
}

// ---- rendering ----
let lastSnap = '';
function render(now, ms) {
  const P = S.pomo, s = S.settings, m = nowMin(now), left = pomoLeft(ms), t = fmt(left);
  const paused = !P.running && P.left < phaseLen(P.phase, s);
  $('time').textContent = t;
  document.title = P.running ? `${t} · Lumina` : 'Lumina';
  $('head').textContent = (P.phase === 'long' ? 'Long break' : P.phase === 'short' ? 'Short break' : `Focus · round ${P.round} of ${s.rounds}`) + (paused ? ' · paused' : '');
  document.body.dataset.phase = P.phase;
  document.body.classList.toggle('running', P.running);
  $('brk').textContent = P.phase === 'focus' ? 'Take a break' : 'Skip break';
  const f = (S.focusLog[dayKey(now)] || 0) + (P.phase === 'focus' ? Math.max(0, phaseLen('focus', s) - Math.max(0, left)) : 0);
  $('focused').textContent = f >= 60 ? `Focused ${dur(f)} today` : '';

  const awake = inWindow(m, hm(s.wake), hm(s.bed)), items = awake ? points(now) : [];
  $('lineBox').hidden = !awake;
  if (awake) drawLine(items, [Math.floor(m), hm(s.bed)]);
  $('bedL').textContent = 'Bed ' + s.bed;
  const nx = items.find(i => i.kind !== 'remind');
  $('next').textContent = nx ? `${nx.title} · ${until(nx.at, m)}` : awake ? 'Nothing else today' : 'Rest well';

  $('timerOut').hidden = !S.timer;
  if (S.timer) $('timerLeft').textContent = `${S.timer.label || 'Timer'} · ${fmt((S.timer.endsAt - ms) / 1000)}`;

  if (!desk) return;
  const snap = JSON.stringify({
    time: t, phase: P.phase, running: P.running,
    next: nx ? `${until(nx.at, m)} · ${nx.title}` : 'All clear',
    alert: alert && { text: alert.text, acts: alert.acts.map(a => a[0]) },
  });
  if (snap !== lastSnap) { lastSnap = snap; desk.state(JSON.parse(snap)); }
}

let showDone = false;
function renderLists() {
  const now = new Date(), today = dayKey(now), m = nowMin(now), list = todays();
  const GRACE = 120; // a missed timed item stays in "Now" for 2 hours, then it's behind you and drops off
  const open = list.filter(t => !isDone(t) && !(t.time && since(m, hm(t.time)) > GRACE && hm(t.time) < m)), done = list.filter(isDone);
  const due = t => !t.time || hm(t.time) <= m;
  const groups = [['Now', open.filter(due)], ['Later today', open.filter(t => !due(t))]];
  const future = S.tasks.filter(t => !t.daily && t.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ? hm(a.time) : 1e4) - (b.time ? hm(b.time) : 1e4));
  for (const t of future) {
    const l = dayLabel(t.date, now), last = groups.at(-1);
    last[0] === l ? last[1].push(t) : groups.push([l, [t]]);
  }

  const row = t => {
    const n = t.daily ? streak(S.done, t.id, now) : 0, late = (t.daily || t.date === today) && !isDone(t) && t.time && hm(t.time) < Math.floor(m);
    return el('li', { className: isDone(t) ? 'done' : '' },
      el('button', { className: 'check', ariaLabel: (isDone(t) ? 'Undo: ' : 'Done: ') + t.title, onclick: () => setDone(t, !isDone(t)) }),
      t.time ? el('time', { className: late ? 'late' : '', textContent: t.time, title: late ? 'Overdue' : '' }) : '',
      el('span', { className: 'title', textContent: t.title }),
      n >= 2 ? el('small', { className: 'streak', title: `${n} days in a row`, textContent: `${n} days` }) : '',
      el('button', {
        className: 'icon act' + (t.daily ? ' on' : ''), innerHTML: ICON.repeat, title: t.daily ? 'Repeats every day' : 'Repeat every day',
        ariaLabel: 'Repeat every day', ariaPressed: String(!!t.daily),
        onclick: () => { t.daily = !t.daily; t.date = today; changed(); },
      }),
      el('button', { className: 'icon act', innerHTML: ICON.x, title: 'Delete', ariaLabel: 'Delete ' + t.title, onclick: () => { S.tasks = S.tasks.filter(x => x !== t); changed(); } }));
  };

  const shown = groups.filter(g => g[1].length);
  $('lists').replaceChildren(
    ...shown.flatMap(([l, items]) => [el('h3', { className: 'eyebrow', textContent: l }), el('ul', { className: 'list' }, ...items.map(row))]),
    shown.length ? '' : el('p', { className: 'empty', textContent: 'Nothing planned. Add something above.' }),
    done.length ? el('button', { className: 'link', textContent: showDone ? 'Hide done' : `${done.length} done today`, onclick: () => { showDone = !showDone; renderLists(); } }) : '',
    showDone && done.length ? el('ul', { className: 'list' }, ...done.map(row)) : '',
  );

  $('rems').replaceChildren(...S.reminders.map(r => el('li', {},
    el('label', { className: 'chk' },
      el('input', { type: 'checkbox', checked: r.on, ariaLabel: 'On', onchange: e => { r.on = e.target.checked; S.last[r.id] = Date.now(); changed(); } }),
      el('input', { className: 'bare', value: r.text, ariaLabel: 'Reminder text', onchange: e => { r.text = e.target.value.trim() || r.text; changed(); } })),
    el('label', { className: 'every', title: 'Every N minutes' }, el('input', { type: 'number', min: 1, value: r.every, ariaLabel: 'Every N minutes', onchange: e => { r.every = Math.max(1, e.target.valueAsNumber || r.every); changed(); } }), 'min'),
    el('button', { className: 'icon', innerHTML: ICON.x, title: 'Delete', ariaLabel: 'Delete reminder', onclick: () => { S.reminders = S.reminders.filter(x => x !== r); changed(); } }))));
}

// ---- wiring ----
$('toggle').onclick = toggle;
$('brk').onclick = () => { go(Date.now(), true); tick(); };
$('toastOk').onclick = clearAlert;

$('add').onsubmit = e => {
  e.preventDefault();
  const v = parseAdd($('addText').value);
  if (!v) return;
  if (v.timer) S.timer = { endsAt: Date.now() + v.min * 60000, label: v.label };
  else S.tasks.push({ id: crypto.randomUUID(), time: v.time, title: v.title, daily: v.daily, date: dayKey(addDays(new Date(), v.days)) });
  $('addText').value = '';
  changed();
};
$('timerCancel').onclick = () => { S.timer = null; changed(); };
$('addRem').onsubmit = e => {
  e.preventDefault();
  const v = Object.fromEntries(new FormData(e.target));
  S.reminders.push({ id: crypto.randomUUID(), text: v.text.trim(), every: Math.max(1, +v.every), on: true });
  e.target.reset();
  changed();
};
$('testAlert').onclick = () => { notify('Sip some water', 'remind'); tick(); };

const showSettings = on => { $('settings').hidden = !on; $('home').hidden = on; };
$('openSettings').onclick = () => showSettings($('settings').hidden);
$('closeSettings').onclick = () => showSettings(false);

for (const inp of document.querySelectorAll('[data-s],[data-g]')) {
  const obj = inp.dataset.s ? S.settings : S.guards, k = inp.dataset.s || inp.dataset.g;
  const prop = inp.type === 'checkbox' ? 'checked' : 'value';
  inp[prop] = obj[k];
  inp.onchange = () => {
    const v = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? inp.valueAsNumber : inp.value;
    if (v === '' || Number.isNaN(v) || (inp.type === 'number' && v < +inp.min)) return (inp[prop] = obj[k]);
    obj[k] = v;
    if (k === 'login') desk?.login(v);
    if (!S.pomo.running && ['focus', 'short', 'long'].includes(k)) S.pomo.left = phaseLen(S.pomo.phase, S.settings);
    changed();
  };
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { showSettings(false); if (alert) clearAlert(); }
  if (e.code === 'Space' && !e.target.closest('input, select, button, textarea')) { e.preventDefault(); toggle(); }
});
addEventListener('resize', () => tick());

document.body.classList.toggle('is-desk', !!desk);
if (desk) {
  setInterval(async () => { idleSec = await desk.idle(); }, 10000);
  desk.onCmd(c => c === 'toggle' ? toggle() : c === 'ok' ? clearAlert() : c.startsWith('act:') && act(+c.slice(4)));
  $('toMini').onclick = () => desk.mini();
  $('quit').onclick = () => desk.close();
}
tick();
setInterval(tick, 1000);
