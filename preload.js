const { contextBridge, ipcRenderer } = require('electron');

const send = ch => v => ipcRenderer.send(ch, v);
const on = ch => f => ipcRenderer.on(ch, (_, v) => f(v));

// Only exists in the desktop app; the web build checks `window.desk` and hides desktop-only UI.
contextBridge.exposeInMainWorld('desk', {
  mini: send('mini'), close: send('close'), flash: send('flash'), open: send('open'),
  tint: send('tint'), winNight: send('winNight'), login: send('login'), power: send('power'),
  state: send('state'), onState: on('state'), // main window -> mini widget, and -> focus-lock cover
  cmd: send('cmd'), onCmd: on('cmd'), // mini widget / cover -> main window
  watch: send('watch'), onFg: on('fg'), lock: send('lock'), // focus lock: window in front -> page -> cover
  idle: () => ipcRenderer.invoke('idle'),
  ics: url => ipcRenderer.invoke('ics', url),
  windows: () => ipcRenderer.invoke('windows'),
});
