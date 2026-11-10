// Pure helpers, shared by the app and tests. Times are "HH:MM"; minutes are since midnight.
export const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const nowMin = d => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
export const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const keyDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// "Today", "Tomorrow", "Friday" (this week) or "Fri 20 Nov".
export function dayLabel(key, now) {
  const day = keyDate(key), diff = Math.round((day - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return day.toLocaleDateString('en-GB', diff > 0 && diff < 7 ? { weekday: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
}

// Minutes from `from` to `m`, wrapping past midnight (bedtime can be after 00:00).
export const since = (m, from) => (m - from + 1440) % 1440;
const span = (start, end) => since(end, start) || 1440;
export const inWindow = (m, start, end) => since(m, start) < span(start, end);

// Long breaks are optional: longEvery 0 = only short breaks, focus keeps going all day.
export function nextPhase(phase, round, s) {
  if (phase === 'focus') return [s.longEvery > 0 && round >= s.longEvery ? 'long' : 'short', round];
  return ['focus', phase === 'long' ? 1 : round + 1];
}
export const phaseLen = (phase, s) => s[phase] * 60;

export const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
export const clockOf = ms => hhmm(nowMin(new Date(ms)));

function clock(h, mm = '0', ap) {
  h = +h; mm = +mm;
  if (ap) { if (h < 1 || h > 12) return null; h = h % 12 + (/p/i.test(ap) ? 12 : 0); }
  return h < 24 && mm < 60 ? hhmm(h * 60 + mm) : null;
}

// The "when" field: "14:30", "9am", "2.30pm" = a time; "20m", "1.5h", "1h30", "90" = a timer length.
export function parseWhen(s) {
  s = s.trim().toLowerCase();
  let m;
  if ((m = s.match(/^(\d{1,2})(?:[:.](\d{2}))? ?(am|pm)?$/)) && (m[2] || m[3])) { const t = clock(m[1], m[2], m[3]); return t && { time: t }; }
  if ((m = s.match(/^(\d{1,2}) ?h ?(\d{1,2}) ?m?$/))) return { min: +m[1] * 60 + +m[2] };
  if ((m = s.match(/^(\d+(?:[.,]\d+)?) ?(m|mins?|minutes?|h|hrs?|hours?)?$/))) {
    const n = +m[1].replace(',', '.') * (m[2]?.startsWith('h') ? 60 : 1);
    return n > 0 ? { min: n } : null;
  }
  return null;
}

const WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function dayOff(w, now) {
  w = w.toLowerCase();
  if (w === 'today') return 0;
  if (/^(tomorrow|tmrw?)$/.test(w)) return 1;
  const i = WEEK.findIndex(d => w.length >= 3 && d.startsWith(w));
  return i < 0 ? null : (i - now.getDay() + 7) % 7;
}

// Typing it all in the name works too: "14:30 Call mom", "tomorrow 9am Dentist", "Gym fri 6pm",
// "9am Vitamins daily", "20m tea" (timer), "Read" (to-do). `days` = days from today.
export function parseAdd(text, now = new Date()) {
  let s = text.trim().replace(/\s+/g, ' '), daily = false, days = null, m, d, time = '';
  if ((m = s.match(/ (daily|every ?day)$/i))) { daily = true; s = s.slice(0, m.index); }
  if ((m = s.match(/^(\d+(?:\.\d+)?) ?(m|mins?|minutes?|h|hrs?|hours?)\b ?(.*)$/i)))
    return +m[1] > 0 ? { timer: true, min: +m[1] * (/^h/i.test(m[2]) ? 60 : 1), label: m[3] } : null;
  if ((m = s.match(/^(?:on )?([a-z]+) (.+)$/i)) && (d = dayOff(m[1], now)) !== null) { days = d; s = m[2]; }
  const T = '(\\d{1,2})(?::(\\d{2}))? ?(am|pm)?';
  let t;
  if ((m = s.match(new RegExp(`^${T} (.+)$`, 'i'))) && (m[2] || m[3]) && (t = clock(m[1], m[2], m[3]))) [time, s] = [t, m[4]];
  else if ((m = s.match(new RegExp(`^(.+?) (?:at )?${T}$`, 'i'))) && (m[3] || m[4]) && (t = clock(m[2], m[3], m[4]))) [time, s] = [t, m[1]];
  if (days === null && (m = s.match(/ (?:on )?([a-z]+)$/i)) && (d = dayOff(m[1], now)) !== null) { days = d; s = s.slice(0, m.index); }
  return s ? { time, title: s, daily, days: daily ? 0 : days ?? 0 } : null;
}

// Consecutive days a habit was done, counting today only once it's ticked.
export function streak(done, id, now) {
  const d = new Date(now);
  if (!done[dayKey(d)]?.includes(id)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (done[dayKey(d)]?.includes(id)) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function fmt(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
// "45m", "1h 05m"
export const dur = sec => { const m = Math.floor(sec / 60); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
// "now", "in 12 min", "in 2h 05m"
export const until = (ms, now) => { const s = (ms - now) / 1000; return s < 60 ? 'now' : s < 3600 ? `in ${Math.round(s / 60)} min` : `in ${dur(s)}`; };

// ---- calendar: read an iCal (.ics) feed, e.g. Google's "secret address in iCal format" ----
const icsDate = v => {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return NaN;
  const [, y, mo, d, h = 0, mi = 0, s = 0, z] = m.map((x, i) => i && i < 7 && x !== undefined ? +x : x);
  // shortcut: a TZID time is read as this PC's local time; fine while the calendar and the PC share a time zone.
  return z ? Date.UTC(y, mo - 1, d, h, mi, s) : new Date(y, mo - 1, d, h, mi, s).getTime();
};
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function* occurrences(e, to) {
  const r = e.rule;
  if (!r) { yield e.start; return; }
  const n = +(r.INTERVAL || 1), count = +(r.COUNT || Infinity);
  const until = r.UNTIL ? icsDate(r.UNTIL) + (r.UNTIL.includes('T') ? 0 : 864e5 - 1) : Infinity;
  const byDay = r.FREQ === 'WEEKLY' && r.BYDAY ? r.BYDAY.split(',').map(d => DAYS.indexOf(d.slice(-2))) : null;
  const d0 = new Date(e.start);
  for (let i = 0, k = 0; i < 6000; i++) {
    const d = new Date(d0);
    if (r.FREQ === 'DAILY') d.setDate(d0.getDate() + i * n);
    else if (r.FREQ === 'WEEKLY' && !byDay) d.setDate(d0.getDate() + i * 7 * n);
    else if (r.FREQ === 'WEEKLY') {
      d.setDate(d0.getDate() + i);
      if (Math.floor((i + (d0.getDay() + 6) % 7) / 7) % n || !byDay.includes(d.getDay())) continue;
    } else if (r.FREQ === 'MONTHLY') d.setMonth(d0.getMonth() + i * n); // shortcut: same date each month; "2nd Tuesday" rules show on the start date only
    else if (r.FREQ === 'YEARLY') d.setFullYear(d0.getFullYear() + i * n);
    else { yield e.start; return; }
    const s = d.getTime();
    if (s > until || k++ >= count || s >= to) return;
    yield s;
  }
}

// Events overlapping [from, to), recurring ones expanded, cancelled/moved ones handled.
export function calEvents(text, from, to) {
  const evs = [];
  let ev = null;
  for (const line of text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') { ev = { ex: new Set() }; continue; }
    if (line === 'END:VEVENT') { if (ev) evs.push(ev); ev = null; continue; }
    const i = line.indexOf(':');
    if (!ev || i < 0) continue;
    const name = line.slice(0, i).split(';')[0], v = line.slice(i + 1);
    if (name === 'SUMMARY') ev.title = v.replace(/\\n/gi, ' ').replace(/\\(.)/g, '$1');
    else if (name === 'DTSTART') { ev.start = icsDate(v); ev.allDay = !v.includes('T'); }
    else if (name === 'DTEND') ev.end = icsDate(v);
    else if (name === 'UID') ev.uid = v;
    else if (name === 'RRULE') ev.rule = Object.fromEntries(v.split(';').map(p => p.split('=')));
    else if (name === 'EXDATE') v.split(',').forEach(x => ev.ex.add(icsDate(x)));
    else if (name === 'RECURRENCE-ID') ev.rid = icsDate(v);
    else if (name === 'STATUS' && v === 'CANCELLED') ev.cancelled = true;
  }
  const moved = new Set(evs.filter(e => e.rid !== undefined).map(e => e.uid + '@' + e.rid));
  const out = [];
  for (const e of evs) {
    if (!Number.isFinite(e.start) || e.cancelled) continue;
    const len = Number.isFinite(e.end) ? e.end - e.start : e.allDay ? 864e5 : 0;
    for (const s of occurrences(e, to)) {
      if (s + Math.max(len, 1) <= from || e.ex.has(s) || (e.rid === undefined && moved.has(e.uid + '@' + s))) continue;
      out.push({ start: s, end: s + len, title: e.title || 'Busy', allDay: e.allDay });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
