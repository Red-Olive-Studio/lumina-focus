// The corner widget only shows what the main window sends and sends clicks back; all logic stays in app.js.
const desk = window.desk, $ = id => document.getElementById(id);
let alertKey = '';

desk.onState(s => {
  document.body.dataset.phase = s.phase;
  document.body.classList.toggle('running', s.running);
  $('time').textContent = s.time;
  $('next').textContent = s.next;
  $('normal').hidden = !!s.alert;
  $('alert').hidden = !s.alert;
  const k = JSON.stringify(s.alert);
  if (k === alertKey) return; // rebuild buttons only when the alert changes, so clicks never land on a stale one
  alertKey = k;
  if (!s.alert) return;
  $('atext').textContent = s.alert.text;
  $('acts').replaceChildren(...s.alert.acts.map((a, i) => Object.assign(document.createElement('button'), {
    className: 'soft', textContent: a, onclick: () => desk.cmd('act:' + i),
  })));
});
$('toggle').onclick = () => desk.cmd('toggle');
$('ok').onclick = () => desk.cmd('ok');
$('open').onclick = () => desk.open();
