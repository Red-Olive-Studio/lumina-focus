const { contextBridge, ipcRenderer } = require('electron');

const send = ch => v => ipcRenderer.send(ch, v);
const on = ch => f => ipcRenderer.on(ch, (_, v) => f(v));

// Only exists in the desktop app; the web build checks `window.desk` and hides desktop-only UI.
contextBridge.exposeInMainWorld('desk', {
  mini: send('mini'), close: send('close'), flash: send('flash'), open: send('open'),
  tint: send('tint'), login: send('login'), shutdown: send('shutdown'),
  state: send('state'), onState: on('state'), // main window -> mini widget
  cmd: send('cmd'), onCmd: on('cmd'), // mini widget -> main window
  idle: () => ipcRenderer.invoke('idle'),
});
