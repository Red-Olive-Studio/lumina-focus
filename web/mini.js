// The corner widget only shows what the main window sends and sends clicks back; all logic stays in app.js.
import { tr, trDom } from './i18n.js';
const desk = window.desk, $ = id => document.getElementById(id);
trDom();
let alertKey = '';
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

desk.onState(s => {
  document.body.dataset.phase = s.phase;
  document.documentElement.dataset.theme = s.theme;
  document.body.classList.toggle('nudge', !!s.alert?.icon); // a reminder: quieter, nothing to tick off
  $('brk').title = $('brk').ariaLabel = tr(s.phase === 'focus' ? 'Take a break now' : 'End the break and focus');
  document.body.classList.toggle('running', s.running);
  $('toggle').ariaLabel = tr(s.running ? 'Pause' : 'Start');
  $('time').textContent = s.time;
  $('next').textContent = s.next;
  $('next').title = s.nextFull;
  $('normal').hidden = !!s.alert;
  $('alert').hidden = !s.alert;
  const k = JSON.stringify(s.alert);
  if (k === alertKey) return; // rebuild buttons only when the alert changes, so clicks never land on a stale one
  alertKey = k;
  if (!s.alert) return void ($('msay').textContent = '');
  $('aicon').textContent = s.alert.icon || '';
  $('atext').textContent = s.alert.text;
  $('msay').textContent = s.alert.text;
  $('acts').replaceChildren(...s.alert.acts.map((a, i) => Object.assign(document.createElement('button'), a === 'Done'
    ? { className: 'tick', innerHTML: TICK, title: tr('Done'), ariaLabel: tr('Done'), onclick: () => desk.cmd('act:' + i) }
    : { className: 'soft', textContent: tr(a), onclick: () => desk.cmd('act:' + i) })));
});
// Docked on the taskbar: one slim line in the taskbar's own tone; folded to the dot and the time until the mouse comes by.
desk.onSlim(d => {
  document.body.classList.toggle('slim', !!d?.dock);
  document.body.classList.toggle('small', !!d?.small);
  document.body.dataset.bar = d?.light ? 'light' : 'dark';
});
$('toggle').onclick = () => desk.cmd('toggle');
$('brk').onclick = () => desk.cmd('brk');
$('ok').onclick = () => desk.cmd('ok');
$('open').onclick = () => desk.open();
