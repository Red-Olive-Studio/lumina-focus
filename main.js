const { app, BrowserWindow, ipcMain, screen, powerMonitor, net } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// --test runs a separate copy with its own data folder, next to the real Lumina.
const TEST = process.argv.includes('--test');
// Same data as the dailydoro days: move the old folder over once, then use it as Lumina's.
const dir = path.join(app.getPath('appData'), TEST ? 'Lumina Test' : 'Lumina'), old = path.join(app.getPath('appData'), 'dailydoro');
try { if (!TEST && !fs.existsSync(dir) && fs.existsSync(old)) fs.renameSync(old, dir); } catch {}
app.setName('Lumina');
app.setPath('userData', dir);

if (!TEST && !app.requestSingleInstanceLock()) app.quit();

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
  win.loadFile(web('index.html'), TEST ? { query: { test: '1' } } : {});
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
// The page already gave the user 60 seconds to cancel, so these act right away.
const POWER = {
  shutdown: ['shutdown', ['/s', '/t', '0']],
  sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']], // hibernates instead if hibernation is on
  lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
};
ipcMain.on('power', (_, a) => { if (!TEST && POWER[a]) execFile(...POWER[a], () => {}); });
ipcMain.handle('idle', () => powerMonitor.getSystemIdleTime());
// Calendar feeds are fetched here, not in the page, so the page can keep its strict no-network policy.
ipcMain.handle('ics', async (_, url) => {
  url = String(url).trim().replace(/^webcal:/i, 'https:');
  if (!/^https?:\/\//i.test(url)) throw new Error('Not a web link');
  const r = await net.fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.text()).slice(0, 5e6);
});
