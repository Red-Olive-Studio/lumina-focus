// Pure time helpers, shared by the app and tests. Times are "HH:MM"; minutes are since midnight.
export const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const nowMin = d => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
export const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// "Today", "Tomorrow", "Friday" (this week) or "Fri 20 Nov".
export function dayLabel(key, now) {
  const [y, mo, d] = key.split('-').map(Number), day = new Date(y, mo - 1, d);
  const diff = Math.round((day - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return day.toLocaleDateString('en-GB', diff < 7 ? { weekday: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
}

// Minutes from `from` to `m`, wrapping past midnight (bedtime can be after 00:00).
export const since = (m, from) => (m - from + 1440) % 1440;
const span = (start, end) => since(end, start) || 1440;
export const inWindow = (m, start, end) => since(m, start) < span(start, end);
export const pos = (m, start, end) => Math.min(1, since(m, start) / span(start, end));

export function nextPhase(phase, round, s) {
  if (phase === 'focus') return [round >= s.rounds ? 'long' : 'short', round];
  return ['focus', phase === 'long' ? 1 : round + 1];
}
export const phaseLen = (phase, s) => s[phase] * 60;

export const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

function clock(h, mm = '0', ap) {
  h = +h; mm = +mm;
  if (ap) { if (h < 1 || h > 12) return null; h = h % 12 + (/p/i.test(ap) ? 12 : 0); }
  return h < 24 && mm < 60 ? hhmm(h * 60 + mm) : null;
}

const WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function dayOff(w, now) {
  w = w.toLowerCase();
  if (w === 'today') return 0;
  if (/^(tomorrow|tmrw?)$/.test(w)) return 1;
  const i = WEEK.findIndex(d => w.length >= 3 && d.startsWith(w));
  return i < 0 ? null : (i - now.getDay() + 7) % 7;
}

// One input for everything: "14:30 Call mom", "tomorrow 9am Dentist", "Gym fri 6pm",
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

// Group points closer than `gap` (same units as `p`) so dots don't pile on each other.
export function cluster(items, gap) {
  const out = [];
  for (const i of items) {
    const last = out.at(-1);
    if (last && i.p - last.p < gap) last.items.push(i);
    else out.push({ p: i.p, items: [i] });
  }
  return out;
}

export function fmt(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// "45m", "1h 05m"
export const dur = sec => { const m = Math.floor(sec / 60); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };

// "now", "in 12 min", "14:30"
export const until = (at, m) => { const n = Math.round(since(at, m)); return n < 1 ? 'now' : n < 60 ? `in ${n} min` : hhmm(at); };
