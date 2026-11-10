const { app, BrowserWindow, ipcMain, screen, powerMonitor } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Same data as the dailydoro days: move the old folder over once, then use it as Lumina's.
const dir = path.join(app.getPath('appData'), 'Lumina'), old = path.join(app.getPath('appData'), 'dailydoro');
try { if (!fs.existsSync(dir) && fs.existsSync(old)) fs.renameSync(old, dir); } catch {}
app.setName('Lumina');
app.setPath('userData', dir);

if (!app.requestSingleInstanceLock()) app.quit();

let win, pip, tint, alerting = false, quitting = false, saved = {};
const store = path.join(dir, 'window.json');
try { saved = JSON.parse(fs.readFileSync(store, 'utf8')); } catch {}
const web = f => path.join(__dirname, 'web', f);
const prefs = { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' };

function remember(key, w) {
  if (w.isMinimized()) return;
  saved[key] = w.getBounds();
  fs.writeFile(store, JSON.stringify(saved), () => {});
}
function onScreen(b) {
  if (!b) return false;
  const a = screen.getDisplayMatching(b).workArea;
  return b.x >= a.x - 8 && b.y >= a.y - 8 && b.x + b.width <= a.x + a.width + 8 && b.y + b.height <= a.y + a.height + 8;
}

function showMain() {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
// The mini widget is up whenever the main window is out of sight, or an alert came in while you were elsewhere.
function syncPip() {
  if (!pip || pip.isDestroyed()) return;
  const want = win.isMinimized() || !win.isVisible() || (alerting && !win.isFocused());
  if (want && !pip.isVisible()) pip.showInactive();
  else if (!want && pip.isVisible()) pip.hide();
}

function createPip() {
  const w = 336, h = 72, a = screen.getPrimaryDisplay().workArea;
  const at = saved.pip && onScreen({ ...saved.pip, width: w, height: h }) ? saved.pip : { x: a.x + a.width - w - 8, y: a.y + a.height - h - 8 };
  pip = new BrowserWindow({
    x: at.x, y: at.y, width: w, height: h, frame: false, transparent: true, resizable: false, maximizable: false,
    minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    title: 'Lumina mini', webPreferences: prefs,
  });
  pip.setAlwaysOnTop(true, 'floating');
  pip.loadFile(web('mini.html'));
  pip.on('moved', () => remember('pip', pip));
  pip.on('close', e => { if (!quitting) { e.preventDefault(); showMain(); } }); // Alt+F4 on the widget opens Lumina
}

// shortcut: tints the primary display only; add one overlay per display if users ask.
function setTint(on) {
  if (!on) { tint?.destroy(); tint = null; return; }
  if (tint) return;
  tint = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds, frame: false, transparent: true, focusable: false,
    skipTaskbar: true, resizable: false, hasShadow: false, alwaysOnTop: true,
  });
  tint.setAlwaysOnTop(true, 'screen-saver');
  tint.setIgnoreMouseEvents(true);
  tint.loadURL('data:text/html,<body style="margin:0;background:rgba(255,120,0,.16)">');
}

app.whenReady().then(() => {
  app.setAppUserModelId(app.isPackaged ? 'studio.redolive.lumina' : process.execPath);
  win = new BrowserWindow({
    ...(onScreen(saved.normal) ? saved.normal : { width: 400, height: 740 }),
    minWidth: 340, minHeight: 480, frame: false, title: 'Lumina', backgroundColor: '#F7F5F0', webPreferences: prefs,
  });
  win.loadFile(web('index.html'));
  for (const ev of ['minimize', 'restore', 'show', 'hide', 'focus', 'blur']) win.on(ev, syncPip);
  win.on('moved', () => remember('normal', win));
  win.on('resized', () => remember('normal', win));
  win.on('closed', () => app.quit());
  createPip();
});

app.on('second-instance', () => win && showMain());
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());

ipcMain.on('state', (e, s) => {
  if (e.sender !== win.webContents) return;
  pip?.webContents.send('state', s);
  alerting = !!s.alert;
  syncPip();
});
ipcMain.on('cmd', (e, c) => { if (e.sender === pip.webContents) win.webContents.send('cmd', String(c)); });
ipcMain.on('open', showMain);
ipcMain.on('mini', () => win.minimize());
ipcMain.on('close', () => app.quit());
ipcMain.on('flash', () => { if (!win.isFocused()) win.flashFrame(true); });
ipcMain.on('tint', (_, on) => setTint(!!on));
ipcMain.on('login', (_, on) => app.setLoginItemSettings({ openAtLogin: !!on }));
ipcMain.on('shutdown', (_, on) => execFile('shutdown', on ? ['/s', '/t', '60'] : ['/a'], () => {}));
ipcMain.handle('idle', () => powerMonitor.getSystemIdleTime());
