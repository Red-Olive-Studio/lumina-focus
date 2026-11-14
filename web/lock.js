// The focus-lock cover: shows what's blocked, sends the choice back to the main window.
import { tr, trDom } from './i18n.js';
const desk = window.desk, $ = id => document.getElementById(id);
trDom();
desk.onState(s => {
  $('lockWhat').textContent = s.title;
  $('allowApp').textContent = tr('Always allow ' + s.name);
  $('allowApp').hidden = !s.name;
});
for (const c of ['allow5', 'allowApp', 'pause']) $(c).onclick = () => desk.cmd('lock:' + c);
