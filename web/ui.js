// Friendlier controls laid over the plain inputs. The inputs stay underneath and fire 'change',
// so the code that reads and saves them doesn't change.
import { tr } from './i18n.js';
import { hhmm, normTime } from './logic.js';

const btn = (cls, label, svg, onclick) => Object.assign(document.createElement('button'),
  { type: 'button', className: cls, tabIndex: -1, ariaLabel: tr(label), title: tr(label), innerHTML: svg, onclick });
const PATH = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="${d}"/></svg>`;

// A time box (returns its wrapper, which takes the input's place if it had one): type it (7, 730, 7.30, 19:45, 7pm) or step 15 min with − / + or the arrow keys (Shift or Page: 1 hour).
export function timeField(inp) {
  if (inp.dataset.tf) return inp.parentNode;
  inp.dataset.tf = '1';
  let ok = inp.value || '00:00';
  Object.assign(inp, { type: 'text', inputMode: 'numeric', autocomplete: 'off', spellcheck: false, maxLength: 8 });
  inp.classList.add('tval');
  inp.setAttribute('role', 'spinbutton');
  const say = () => inp.setAttribute('aria-valuetext', inp.value);
  const set = v => { if (v !== inp.value) { inp.value = v; inp.dispatchEvent(new Event('change')); } say(); };
  const step = d => { const [h, m] = (normTime(inp.value) || ok).split(':').map(Number); set(hhmm((d > 0 ? Math.floor((h * 60 + m) / 15) : Math.ceil((h * 60 + m) / 15)) * 15 + d)); }; // to the next quarter in that direction
  inp.addEventListener('focus', () => { ok = normTime(inp.value) || ok; inp.select(); });
  // Capture: tidy the typed text before anyone else reads it; nonsense puts the last good time back.
  inp.addEventListener('change', () => { inp.value = normTime(inp.value) || ok; ok = inp.value; say(); }, true);
  inp.addEventListener('keydown', e => {
    const big = e.shiftKey || e.key.startsWith('Page'), d = { ArrowUp: 15, ArrowDown: -15, PageUp: 15, PageDown: -15 }[e.key];
    if (d) { e.preventDefault(); step(big ? d * 4 : d); }
  });
  // The input comes first so a click on the label focuses it, not the − button; CSS draws − on the left.
  const wrap = Object.assign(document.createElement('span'), { className: 'tfield' });
  if (inp.parentNode) inp.replaceWith(wrap);
  wrap.append(inp, btn('tminus', '15 min earlier', PATH('M6 12h12'), () => step(-15)), btn('tplus', '15 min later', PATH('M12 6v12M6 12h12'), () => step(15)));
  say();
  return wrap;
}

// A short choice list (2 or 3 options) as one row of buttons; the select stays hidden underneath.
export function segSelect(sel) {
  const row = Object.assign(document.createElement('span'), { className: 'seg' });
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', sel.getAttribute('aria-label') || sel.closest('label')?.firstChild?.textContent.trim() || '');
  for (const o of sel.options) row.append(Object.assign(document.createElement('button'), {
    type: 'button', textContent: o.textContent, value: o.value,
    onclick: () => { if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change')); } sync(); },
  }));
  const sync = () => { for (const b of row.children) { b.classList.toggle('on', b.value === sel.value); b.setAttribute('aria-pressed', b.value === sel.value); } };
  sel.hidden = true;
  sel.after(row);
  sel.syncSeg = sync;
  sync();
}

// Colour swatches instead of the system colour dialog.
export function swatches(colors, value, label, onpick) {
  const row = Object.assign(document.createElement('span'), { className: 'swatches' });
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', label);
  for (const [c, name] of colors) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'sw', ariaLabel: tr(name), title: tr(name), onclick: () => onpick(c) });
    b.style.setProperty('--c', c);
    b.setAttribute('aria-pressed', c.toLowerCase() === (value || '').toLowerCase());
    row.append(b);
  }
  return row;
}
