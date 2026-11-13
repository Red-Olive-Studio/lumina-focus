// The focus-lock cover: shows what's blocked, sends the choice back to the main window.
const desk = window.desk, $ = id => document.getElementById(id);
desk.onState(s => {
  $('lockWhat').textContent = s.title;
  $('allowApp').textContent = 'Always allow ' + s.name;
  $('allowApp').hidden = !s.name;
});
for (const c of ['allow5', 'allowApp', 'pause']) $(c).onclick = () => desk.cmd('lock:' + c);
