// Pure helpers, shared by the app and tests. Times are "HH:MM"; minutes are since midnight.
export const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const nowMin = d => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
export const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const keyDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// "Today", "Tomorrow", "Friday" (this week) or "Fri 20 Nov".
export function dayLabel(key, now, loc = 'en-GB') {
  const day = keyDate(key), diff = Math.round((day - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return day.toLocaleDateString(loc, diff > 0 && diff < 7 ? { weekday: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
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

export const hhmm = m => { m = (Math.floor(m) % 1440 + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const clockOf = ms => hhmm(nowMin(new Date(ms)));

function clock(h, mm = '0', ap) {
  h = +h; mm = +mm;
  if (ap) { if (h < 1 || h > 12) return null; h = h % 12 + (/p/i.test(ap) ? 12 : 0); }
  return h < 24 && mm < 60 ? hhmm(h * 60 + mm) : null;
}

// What people type into a time box: 7, 730, 0730, 7:30, 7.30, 19 45, 7pm -> 'HH:MM', or null.
export function normTime(s) {
  const m = String(s).trim().match(/^(\d{1,2})(?:[:.\s]?(\d{2}))?\s*(am|pm)?$/i);
  return m ? clock(m[1], m[2] ?? '0', m[3]) : null;
}
// The "when" field: "14:30", "9am", "2.30pm" = a time; "20m", "1.5h", "1h30", "90", "20dk", "1sa" = a timer length.
export function parseWhen(s) {
  s = s.trim().toLowerCase();
  let m;
  if ((m = s.match(/^(\d{1,2})(?:[:.](\d{2}))? ?(am|pm)?$/)) && (m[2] || m[3])) { const t = clock(m[1], m[2], m[3]); return t && { time: t }; }
  if ((m = s.match(/^(\d{1,2}) ?h ?(\d{1,2}) ?m?$/))) return { min: +m[1] * 60 + +m[2] };
  if ((m = s.match(/^(\d+(?:[.,]\d+)?) ?(m|mins?|minutes?|h|hrs?|hours?|dk|dakika|sa|saat)?$/))) {
    const n = +m[1].replace(',', '.') * (/^(h|sa)/.test(m[2]) ? 60 : 1);
    return n > 0 && n <= 7 * 1440 ? { min: n } : null; // up to a week
  }
  return null;
}

const WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const HAFTA = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi']; // Turkish, same order
function dayOff(w, now) {
  w = w.toLocaleLowerCase('tr');
  if (/^(today|bugün)$/.test(w)) return 0;
  if (/^(tomorrow|tmrw?|yarın|yarin)$/.test(w)) return 1;
  let i = WEEK.findIndex(d => w.length >= 3 && d.startsWith(w));
  if (i < 0) i = HAFTA.findIndex(d => w.length >= 3 && d.startsWith(w));
  return i < 0 ? null : (i - now.getDay() + 7) % 7;
}

// Typing it all in the name works too: "14:30 Call mom", "tomorrow 9am Dentist", "Gym fri 6pm",
// "9am Vitamins daily", "20m tea" (timer), "Read" (to-do), and in Turkish "yarın 9:00 Dişçi", "Vitamin her gün".
// `days` = days from today.
export function parseAdd(text, now = new Date()) {
  let s = text.trim().replace(/\s+/g, ' '), daily = false, days = null, m, d, time = '';
  if ((m = s.match(/ (daily|every ?day|her ?gün)$/i))) { daily = true; s = s.slice(0, m.index); }
  if ((m = s.match(/^(\d+(?:\.\d+)?) ?(m|mins?|minutes?|h|hrs?|hours?|dk|dakika|sa|saat)(?!\p{L}) ?(.*)$/iu)))
    return +m[1] > 0 ? { timer: true, min: +m[1] * (/^(h|sa)/i.test(m[2]) ? 60 : 1), label: m[3] } : null;
  if ((m = s.match(/^(?:on )?(\p{L}+) (.+)$/iu)) && (d = dayOff(m[1], now)) !== null) { days = d; s = m[2]; }
  const T = '(\\d{1,2})(?::(\\d{2}))? ?(am|pm)?';
  let t;
  if ((m = s.match(new RegExp(`^${T} (.+)$`, 'i'))) && (m[2] || m[3]) && (t = clock(m[1], m[2], m[3]))) [time, s] = [t, m[4]];
  else if ((m = s.match(new RegExp(`^(.+?) (?:at )?${T}$`, 'i'))) && (m[3] || m[4]) && (t = clock(m[2], m[3], m[4]))) [time, s] = [t, m[1]];
  if (days === null && (m = s.match(/ (?:on )?(\p{L}+)$/iu)) && (d = dayOff(m[1], now)) !== null) { days = d; s = s.slice(0, m.index); }
  if (!time && (m = s.match(new RegExp(`^${T}$`, 'i'))) && (m[2] || m[3]) && clock(m[1], m[2], m[3])) return null; // "9am" alone is a time, not a name
  return s ?{ time, title: s, daily, days: daily ? 0 : days ?? 0 } : null;
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
// The narrow corner widget: '13m', '2h' (rounded), 'now'.
export const soon = ms => ms < 6e4 ? 'now' : ms < 36e5 ? `${Math.round(ms / 6e4)}m` : `${Math.round(ms / 36e5)}h`;
export const until = (ms, now) => { const s = (ms - now) / 1000; return s < 60 ? 'now' : s < 3600 ? `in ${Math.round(s / 60)} min` : `in ${dur(s)}`; };

// ---- calendar: read an iCal (.ics) feed, e.g. Google's "secret address in iCal format" ----
// A wall-clock time in an IANA zone (TZID=Europe/Amsterdam) -> epoch ms. Unknown zones (Outlook's Windows names) fall back to this PC's time.
function zoned(y, mo, d, h, mi, s, tz) {
  const local = new Date(y, mo - 1, d, h, mi, s).getTime();
  if (!tz) return local;
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const off = t => { const p = Object.fromEntries(f.formatToParts(t).map(x => [x.type, +x.value])); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t; };
    const wall = Date.UTC(y, mo - 1, d, h, mi, s);
    return wall - off(wall - off(wall)); // twice, so times next to a DST switch land right
  } catch { return local; }
}
const icsDate = (v, tz) => {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return NaN;
  const [, y, mo, d, h = 0, mi = 0, s = 0, z] = m.map((x, i) => i && i < 7 && x !== undefined ? +x : x);
  return z ? Date.UTC(y, mo - 1, d, h, mi, s) : zoned(y, mo, d, h, mi, s, m[4] ? tz : null);
};
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Days of one month a MONTHLY rule hits: BYDAY "2TU" / "-1FR" / "MO", or BYMONTHDAY, or the start's date. Months without that date are skipped.
function monthDays(r, y, mo, d0) {
  const last = new Date(y, mo + 1, 0).getDate();
  if (r.BYDAY) return r.BYDAY.split(',').flatMap(x => {
    const [, nth, dd] = x.match(/^([+-]?\d+)?([A-Z]{2})$/) || [], wd = DAYS.indexOf(dd);
    if (wd < 0) return [];
    const first = (wd - new Date(y, mo, 1).getDay() + 7) % 7 + 1, all = [];
    for (let day = first; day <= last; day += 7) all.push(day);
    return nth ? [all.at(+nth > 0 ? +nth - 1 : +nth)].filter(Boolean) : all;
  });
  const days = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number).map(x => x < 0 ? last + x + 1 : x) : [d0];
  return days.filter(x => x >= 1 && x <= last);
}

// The start's wall clock in the event's zone, so repeats keep 09:00 there across DST switches.
function wallOf(t, tz) {
  if (tz) try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(t).map(x => [x.type, +x.value]));
    return { y: p.year, mo: p.month - 1, d: p.day, h: p.hour, mi: p.minute, s: p.second };
  } catch {}
  const x = new Date(t);
  return { y: x.getFullYear(), mo: x.getMonth(), d: x.getDate(), h: x.getHours(), mi: x.getMinutes(), s: x.getSeconds() };
}

function* occurrences(e, to, from = -Infinity) {
  const r = e.rule;
  if (!r) { yield e.start; return; }
  const n = Math.max(1, parseInt(r.INTERVAL) || 1), count = +(r.COUNT || Infinity);
  const until = r.UNTIL ? icsDate(r.UNTIL, e.tz) + (r.UNTIL.includes('T') ? 0 : 864e5 - 1) : Infinity;
  const byDay = r.FREQ === 'WEEKLY' && r.BYDAY ? r.BYDAY.split(',').map(d => DAYS.indexOf(d.slice(-2))) : null;
  const w = wallOf(e.start, e.allDay ? null : e.tz), at = (y, mo, d) => zoned(y, mo + 1, d, w.h, w.mi, w.s, e.allDay ? null : e.tz);
  const wd0 = new Date(Date.UTC(w.y, w.mo, w.d)).getUTCDay();
  // Without COUNT, old repeats can't matter: start a step or two before `from` instead of replaying years of them.
  const days = count === Infinity ? Math.max(0, Math.floor((from - e.start) / 864e5)) : 0;
  const skip = { DAILY: Math.floor(days / n) - 1, WEEKLY: byDay ? (Math.floor(days / 7 / n) - 1) * 7 * n : Math.floor(days / 7 / n) - 1,
    MONTHLY: Math.floor(days / 31 / n) - 1, YEARLY: Math.floor(days / 366 / n) - 1 }[r.FREQ];
  for (let i = Math.max(0, skip || 0), end = i + 6000, k = 0; i < end; i++) {
    let hits;
    if (r.FREQ === 'DAILY') hits = [at(w.y, w.mo, w.d + i * n)];
    else if (r.FREQ === 'WEEKLY' && !byDay) hits = [at(w.y, w.mo, w.d + i * 7 * n)];
    else if (r.FREQ === 'WEEKLY') {
      if (Math.floor((i + (wd0 + 6) % 7) / 7) % n || !byDay.includes((wd0 + i) % 7)) continue;
      hits = [at(w.y, w.mo, w.d + i)];
    } else if (r.FREQ === 'MONTHLY') {
      const m = new Date(w.y, w.mo + i * n, 1);
      hits = monthDays(r, m.getFullYear(), m.getMonth(), w.d).sort((a, b) => a - b).map(day => at(m.getFullYear(), m.getMonth(), day)).filter(t => t >= e.start);
    } else if (r.FREQ === 'YEARLY') {
      // "every 5 May", or with BYMONTH/BYDAY "2nd Sunday of May"; 29 Feb only in leap years (monthDays skips missing dates)
      const y = w.y + i * n, months = r.BYMONTH ? r.BYMONTH.split(',').map(x => +x - 1).filter(x => x >= 0 && x < 12) : [w.mo];
      hits = months.flatMap(mo => monthDays(r, y, mo, w.d).map(day => at(y, mo, day))).sort((a, b) => a - b).filter(t => t >= e.start);
    } else { yield e.start; return; }
    for (const s of hits) {
      if (s > until || k++ >= count || s >= to) return;
      yield s;
    }
  }
}

// Events overlapping [from, to), recurring ones expanded, cancelled/moved ones handled.
export function calEvents(text, from, to) {
  const evs = [];
  let ev = null, sub = 0; // sub: inside a VALARM (its SUMMARY is not the event's title)
  for (const line of text.replace(/(\r\n|\r|\n)[ \t]/g, '').split(/\r\n|\r|\n/)) {
    const L = line.toUpperCase().trim(); // some feeds use lowercase names
    if (L === 'BEGIN:VEVENT') { ev = { ex: new Set(), exDay: new Set() }; continue; }
    if (L === 'END:VEVENT') { if (ev) evs.push(ev); ev = null; sub = 0; continue; }
    if (ev && L.startsWith('BEGIN:')) { sub++; continue; }
    if (ev && L.startsWith('END:')) { sub = Math.max(0, sub - 1); continue; }
    if (sub) continue;
    const i = line.indexOf(':');
    if (!ev || i < 0) continue;
    const [nm, ...params] = line.slice(0, i).split(';'), name = nm.toUpperCase(), v = line.slice(i + 1);
    const tz = params.find(p => p.startsWith('TZID='))?.slice(5).replace(/^"|"$/g, '');
    const text = v.replace(/\\n/gi, ' ').replace(/\\(.)/g, '$1');
    if (name === 'SUMMARY') ev.title = text;
    else if (name === 'LOCATION') ev.loc = text;
    else if (['DESCRIPTION', 'URL', 'X-GOOGLE-CONFERENCE', 'X-MICROSOFT-SKYPETEAMSMEETINGURL'].includes(name)) ev.join ||= joinLink(text);
    else if (name === 'TRANSP' && v === 'TRANSPARENT') ev.free = true;
    else if (name === 'DTSTART') { ev.start = icsDate(v, tz); ev.allDay = !v.includes('T'); ev.tz = tz; }
    else if (name === 'DTEND') ev.end = icsDate(v, tz);
    else if (name === 'UID') ev.uid = v;
    else if (name === 'RRULE') ev.rule = Object.fromEntries(v.split(';').map(p => p.split('=')));
    else if (name === 'EXDATE') v.split(',').forEach(x => { ev.ex.add(icsDate(x, tz)); if (!x.includes('T')) ev.exDay.add(x.trim().slice(0, 8)); });
    else if (name === 'RECURRENCE-ID') ev.rid = icsDate(v, tz);
    else if (name === 'STATUS' && v === 'CANCELLED') ev.cancelled = true;
  }
  const moved = new Set(evs.filter(e => e.rid !== undefined).map(e => e.uid + '@' + e.rid));
  const out = [];
  for (const e of evs) {
    if (!Number.isFinite(e.start) || e.cancelled) continue;
    const len = Number.isFinite(e.end) ? Math.max(0, e.end - e.start) : e.allDay ? 864e5 : 0;
    for (const s of occurrences(e, to, from - Math.max(len, 864e5))) {
      if (s + Math.max(len, 1) <= from || e.ex.has(s) || (e.rid === undefined && moved.has(e.uid + '@' + s))) continue;
      if (e.exDay.size && !e.allDay) { const d = wallOf(s, e.tz); if (e.exDay.has(`${d.y}${String(d.mo + 1).padStart(2, '0')}${String(d.d).padStart(2, '0')}`)) continue; } // EXDATE;VALUE=DATE on a timed event
      const join = joinLink(e.loc) || e.join, loc = e.loc && !/^https?:/i.test(e.loc) ? e.loc.slice(0, 80) : '';
      out.push({ start: s, end: s + len, title: e.title || 'Busy', allDay: e.allDay, ...(join && { join }), ...(loc && { loc }), ...(e.free && { free: true }) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// An exported calendar file (Google: Settings → Import & export → Export) holds years of past events.
// Keep only what can still show up: repeating events, and ones that end on or after `from`.
export function pruneIcs(text, from) {
  const cut = +dayKey(from).replace(/-/g, '');
  const evs = text.replace(/\r\n?/g, '\n').match(/^BEGIN:VEVENT$[\s\S]*?^END:VEVENT$/gim) || [];
  const keep = evs.filter(e => /^RRULE[;:]/im.test(e) || Math.max(...[...e.matchAll(/^DT(?:START|END)[^:\n]*:(\d{8})/gim)].map(m => +m[1])) >= cut);
  return `BEGIN:VCALENDAR\n${keep.join('\n')}\nEND:VCALENDAR\n`;
}

// The .ics files inside a .zip (Google's calendar export is a zip with one .ics per calendar).
// shortcut: no zip64 or encryption; a calendar export never needs them.
export async function unzip(buf) {
  const b = new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
  let e = b.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a zip file');
  for (let i = 0, p = v.getUint32(e + 16, true); i < v.getUint16(e + 10, true); i++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), n = v.getUint16(p + 28, true), loc = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + n));
    p += 46 + n + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    if (!/\.ics$/i.test(name) || (method !== 0 && method !== 8)) continue;
    const at = loc + 30 + v.getUint16(loc + 26, true) + v.getUint16(loc + 28, true), data = b.slice(at, at + size);
    const body = method ? new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')) : data;
    out.push({ name: name.split('/').pop(), text: await new Response(body).text() });
  }
  return out;
}

// Google Calendar's own "new event" page, filled in: no sign-in or API key here, the user presses Save there.
// A task with a time becomes a 30-minute event, a to-do an all-day one; a daily one repeats.
export function gcalLink({ title, date, time, daily }) {
  const [y, mo, d] = date.split('-').map(Number), utc = ms => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');
  const at = time && +new Date(y, mo - 1, d, ...time.split(':').map(Number));
  const dates = time ? `${utc(at)}/${utc(at + 30 * 60000)}`
    : `${date.replace(/-/g, '')}/${dayKey(new Date(y, mo - 1, d + 1)).replace(/-/g, '')}`;
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) + '&dates=' + dates + (daily ? '&recur=' + encodeURIComponent('RRULE:FREQ=DAILY') : '');
}

// The video-call link in an event (Meet, Zoom, Teams, Webex, Whereby), so "Join" is one click.
const JOIN = /https:\/\/(?:meet\.google\.com|(?:[\w-]+\.)?zoom\.us|teams\.microsoft\.com|teams\.live\.com|[\w-]+\.webex\.com|whereby\.com)\/[^\s<>"'\\]+/i;
export const joinLink = t => (t && t.match(JOIN)?.[0].replace(/[).,;]+$/, '')) || '';

// People paste the calendar's web page link instead of its iCal file; turn the common ones into the file link.
export function icsUrl(u) {
  u = u.trim().replace(/^webcal:/i, 'https:');
  try {
    const x = new URL(u), cid = x.searchParams.get('cid'), src = x.searchParams.get('src') || (cid && atob(cid.replace(/-/g, '+').replace(/_/g, '/')));
    if (x.hostname === 'calendar.google.com' && !x.pathname.endsWith('.ics') && src) return `https://calendar.google.com/calendar/ical/${encodeURIComponent(src)}/public/basic.ics`;
    if (/outlook\.(office365|live)\.com$/.test(x.hostname) && x.pathname.endsWith('/calendar.html')) return u.replace(/calendar\.html/, 'calendar.ics');
  } catch {}
  return u;
}

// History, grouped by day: newest day first, entries within a day oldest first.
export function byDay(log, dayOf) {
  const m = new Map();
  for (const x of [...log].sort((a, b) => a.at - b.at)) { const k = dayOf(x.at); m.has(k) ? m.get(k).push(x) : m.set(k, [x]); }
  return [...m].reverse();
}

// ---- focus lock: during focus only the apps and tabs you picked may be in front ----
// Windows' own shell (taskbar, Start, Alt+Tab, lock screen) never locks; File Explorer windows (class CabinetWClass) are a normal app.
const SHELL = ['', 'explorer', 'shellexperiencehost', 'startmenuexperiencehost', 'searchhost', 'searchapp', 'lockapp', 'textinputhost', 'shellhost'];
// fg = { name: process name, title: window title, self: Lumina's own window }. A rule matches the app name or any part of the title,
// so "chrome" allows all of Chrome and "github" allows only tabs/windows with GitHub in their title.
export function allowedWin(fg, rules) {
  const n = String(fg?.name || '').toLowerCase();
  if (!fg || fg.self || !fg.title || (SHELL.includes(n) && fg.cls !== 'CabinetWClass')) return true;
  const t = fg.title.toLowerCase();
  return rules.some(r => (r = r.trim().toLowerCase()) && (n === r || n === r.replace(/\.exe$/, '') || t.includes(r)));
}

// ---- meals: any number a day; growing adds the classic meals first, then snacks in the biggest gap ----
export const MEAL_DEFAULTS = [['breakfast', 'Breakfast', '08:30'], ['lunch', 'Lunch', '12:30'], ['dinner', 'Dinner', '19:00'], ['snack1', 'Morning snack', '10:30'], ['snack2', 'Afternoon snack', '16:00']];
export function resizeMeals(list, n, wake = '07:00', bed = '23:30') {
  list = list.slice(0, Math.max(0, n));
  while (list.length < n) {
    const d = MEAL_DEFAULTS.find(([id]) => !list.some(m => m.id === id));
    if (d) { list.push({ id: d[0], title: d[1], time: d[2] }); continue; }
    // biggest gap between wake+1h, the meals, and bed-2h; the new snack goes in its middle
    const w = hm(wake) || 420, b = hm(bed) || 1410, pts = [60, ...list.map(m => since(hm(m.time) || 0, w)), since(b, w) - 120].sort((a, b) => a - b);
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i] - pts[i - 1] > pts[best + 1] - pts[best]) best = i - 1;
    list.push({ id: 'meal' + Date.now().toString(36) + list.length, title: 'Snack', time: hhmm(w + Math.round((pts[best] + pts[best + 1]) / 2)) });
  }
  return list;
}
