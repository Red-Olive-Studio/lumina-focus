const { app, BrowserWindow, ipcMain, screen, powerMonitor, net, shell, nativeTheme } = require('electron');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// --test runs a separate copy with its own data folder, next to the real Lumina.
const TEST = process.argv.includes('--test');
// Same data as the dailydoro days: move the old folder over once, then use it as Lumina's.
const dir = path.join(app.getPath('appData'), TEST ? 'Lumina Test' : 'Lumina'), old = path.join(app.getPath('appData'), 'dailydoro');
try { if (!TEST && !fs.existsSync(dir) && fs.existsSync(old)) fs.renameSync(old, dir); } catch {}
app.setName('Lumina');
app.setPath('userData', dir);

if (!TEST && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
// Lumina's pages never leave its own files or open windows (test mode reloads itself with ?test).
app.on('web-contents-created', (_, wc) => { wc.on('will-navigate', (e, u) => { if (!u.startsWith('file:')) e.preventDefault(); }); wc.setWindowOpenHandler(() => ({ action: 'deny' })); });

let win, pip, tints = [], covers = [], lockState = null, watcher, alerting = false, quitting = false, saved = {};
const store = path.join(dir, 'window.json');
try { saved = JSON.parse(fs.readFileSync(store, 'utf8')); } catch {}
const web = f => path.join(__dirname, 'web', f);
const prefs = { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' };

function remember(key, w) {
  if (w.isMinimized()) return;
  saved[key] = w.getBounds();
  clearTimeout(remember.t); // a drag fires dozens of moves: write once it settles
  remember.t = setTimeout(() => fs.writeFile(store, JSON.stringify(saved), () => {}), 500);
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

const PIP = { w: 380, h: 72 };
function createPip() {
  const w = PIP.w, h = PIP.h, a = screen.getPrimaryDisplay().workArea;
  const at = saved.pip && onScreen({ ...saved.pip, width: w, height: h }) ? saved.pip : { x: a.x + a.width - w - 8, y: a.y + a.height - h - 8 };
  pip = new BrowserWindow({
    x: at.x, y: at.y, width: w, height: h, frame: false, transparent: true, resizable: false, maximizable: false,
    minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    title: 'Lumina mini', webPreferences: prefs,
  });
  pip.setAlwaysOnTop(true, 'floating');
  pip.loadFile(web('mini.html'));
  pip.webContents.on('did-finish-load', sendSlim);
  if (saved.pipDock) placePip('taskbar', saved.pip?.x);
  // Dropped onto the taskbar: it docks there as one slim line. Dragged back up: a normal pill again.
  pip.on('moved', () => {
    const p = pip.getBounds(), a = screen.getDisplayMatching(p).workArea, low = p.y + p.height / 2 > a.y + a.height;
    if (low && (!saved.pipDock || p.y !== a.y + a.height)) tellPip(placePip('taskbar', p.x));
    else if (!low && saved.pipDock) {
      setSlim(false);
      pip.setBounds({ x: Math.min(p.x, a.x + a.width - PIP.w), y: Math.min(p.y, a.y + a.height - PIP.h - 8), width: PIP.w, height: PIP.h });
      tellPip('');
    }
    remember('pip', pip);
  });
  pip.on('close', e => { if (!quitting) { e.preventDefault(); showMain(); } }); // Alt+F4 on the widget opens Lumina
}

// Docked: over the taskbar (itself always on top), in its light or dark tone, folded to the dot and the time when the mouse is away.
let small = false, lightBar = false, awayAt = 0;
const sendSlim = () => pip.webContents.send('slim', { dock: !!saved.pipDock, small, light: lightBar });
const setSlim = on => { saved.pipDock = on; small = false; awayAt = Date.now(); pip.setAlwaysOnTop(true, on ? 'screen-saver' : 'floating'); readBar(); sendSlim(); };
// shortcut: only the light/dark taskbar tone; an accent-coloured taskbar (Settings → Colours) gets the dark one.
function readBar() {
  execFile('reg', ['query', String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`, '/v', 'SystemUsesLightTheme'], { windowsHide: true }, (err, out) => {
    const l = !err && /0x1\s*$/m.test(out);
    if (l !== lightBar) { lightBar = l; if (pip && !pip.isDestroyed()) sendSlim(); }
  });
}
const SMALL_W = 116, FOLD_MS = 5000;
// Polled rather than DOM hover: most of the pill is a drag area, which gets no mouse events.
setInterval(() => {
  if (!pip || pip.isDestroyed() || !saved.pipDock || !pip.isVisible()) return;
  const c = screen.getCursorScreenPoint(), b = pip.getBounds(), inside = c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height;
  if (inside || alerting) awayAt = Date.now();
  const want = Date.now() - awayAt > FOLD_MS;
  if (want === small) return;
  small = want;
  // Unfold to the left when there's no room on the right; fold back to the same spot.
  const d = screen.getDisplayMatching(b).bounds, w = small ? SMALL_W : PIP.w;
  const x = small ? (b.x + b.width >= d.x + d.width - 1 ? d.x + d.width - w : b.x) : Math.min(b.x, d.x + d.width - w);
  pip.setBounds({ x, y: b.y, width: w, height: b.height });
  sendSlim();
}, 250);
const tellPip = where => win?.webContents.send('cmd', 'pip:' + where); // Settings shows where the widget is
// A corner of the screen the widget is on, or the taskbar: as tall as the taskbar, near its right end or where it was dropped.
// shortcut: only a taskbar along the bottom; a side or auto-hidden one gets the bottom-right corner instead.
function placePip(where, x) {
  const d = screen.getDisplayMatching(pip.getBounds()), a = d.workArea, b = d.bounds, bar = b.y + b.height - (a.y + a.height);
  if (where === 'taskbar' && bar < 24) where = 'br';
  const dock = where === 'taskbar', w = PIP.w, h = dock ? bar : PIP.h;
  setSlim(dock);
  pip.setBounds({
    width: w, height: h,
    x: dock ? Math.min(Math.max(x ?? a.x + a.width - w - 300, b.x), b.x + b.width - w) : where[1] === 'l' ? a.x + 8 : a.x + a.width - w - 8,
    y: dock ? a.y + a.height : where[0] === 't' ? a.y + 8 : a.y + a.height - h - 8,
  });
  remember('pip', pip);
  return where;
}
ipcMain.on('pipAt', (e, where) => {
  if (e.sender !== win.webContents || !/^(tl|tr|bl|br|taskbar)$/.test(where)) return;
  tellPip(placePip(where));
  pip.showInactive(); // show it there for a moment
  setTimeout(syncPip, 3000);
});

// Night light: one click-through overlay per display, warm (warm 0-100) and optionally dimmed (dim 0-100).
let tintLv = null;
function setTint(lv) {
  tintLv = lv;
  if (!lv) { tints.forEach(t => t.destroy()); tints = []; return; }
  const w = Math.min(.5, Math.max(0, +lv.warm / 100 || 0)), k = Math.min(.6, Math.max(0, +lv.dim / 100 || 0));
  const url = 'data:text/html,' + encodeURIComponent(`<body style="margin:0;background:linear-gradient(rgba(0,0,0,${k}),rgba(0,0,0,${k})),rgba(255,120,0,${w})">`);
  if (!tints.length) tints = screen.getAllDisplays().map(d => {
    const t = new BrowserWindow({
      ...d.bounds, frame: false, transparent: true, focusable: false,
      skipTaskbar: true, resizable: false, hasShadow: false, alwaysOnTop: true,
    });
    t.setAlwaysOnTop(true, 'screen-saver');
    t.setIgnoreMouseEvents(true);
    return t;
  });
  for (const t of tints) t.loadURL(url);
}
// A monitor plugged in or out: rebuild the overlays for the new layout.
function displaysChanged() {
  if (tints.length) { const lv = tintLv; setTint(null); setTint(lv); }
  if (saved.pipDock) placePip('taskbar', pip.getBounds().x);
  covers.forEach(c => c.destroy()); covers = [];
  if (lockState) showCovers(lockState);
}

app.whenReady().then(() => {
  app.setAppUserModelId(app.isPackaged ? 'studio.redolive.lumina' : process.execPath);
  win = new BrowserWindow({
    ...(onScreen(saved.normal) ? saved.normal : { width: 400, height: 740 }),
    minWidth: 340, minHeight: 480, frame: false, title: 'Lumina', icon: web('icon.png'), backgroundColor: '#F7F5F0', webPreferences: prefs,
  });
  win.loadFile(web('index.html'), TEST ? { query: { test: '1' } } : {});
  for (const ev of ['minimize', 'restore', 'show', 'hide', 'focus', 'blur']) win.on(ev, syncPip);
  win.on('moved', () => remember('normal', win));
  win.on('resized', () => remember('normal', win));
  win.on('closed', () => app.quit());
  createPip();
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, displaysChanged);
  nativeTheme.on('updated', readBar); // Windows switched light/dark
});

app.on('second-instance', () => win && showMain());
app.on('before-quit', () => { quitting = true; watcher?.kill(); });
app.on('window-all-closed', () => app.quit());

ipcMain.on('state', (e, s) => {
  if (e.sender !== win.webContents) return;
  pip?.webContents.send('state', s);
  alerting = !!s.alert;
  syncPip();
});
ipcMain.on('cmd', (e, c) => { if (e.sender === pip?.webContents || covers.some(c => e.sender === c.webContents)) win.webContents.send('cmd', String(c)); });
ipcMain.on('open', showMain);
// Only https links, so a calendar can't make Lumina run a local file or another protocol.
ipcMain.on('link', (_, u) => { try { if (new URL(u).protocol === 'https:') shell.openExternal(u); } catch {} });
ipcMain.on('mini', () => win.minimize());
ipcMain.on('close', () => app.quit());
ipcMain.on('flash', () => { if (!win.isFocused()) win.flashFrame(true); });
ipcMain.on('tint', (_, lv) => setTint(lv && typeof lv === 'object' ? lv : lv ? { warm: 16, dim: 0 } : null));
// The portable exe unpacks to a temp folder each run; register the exe itself.
// Only the packaged app: from `npm start` it would register a bare electron.exe.
ipcMain.on('login', (_, on) => app.isPackaged && app.setLoginItemSettings({ openAtLogin: !!on, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath }));// The page already gave the user 60 seconds to cancel, so these act right away.
const POWER = {
  shutdown: ['shutdown', ['/s', '/t', '0']],
  sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']], // hibernates instead if hibernation is on
  lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
};
ipcMain.on('power', (e, a) => { if (!TEST && POWER[a] && e.sender === win?.webContents) execFile(...POWER[a], () => {}); }); // only the main window may sleep or shut down the PC
ipcMain.handle('idle', () => powerMonitor.getSystemIdleTime());
// A copy of the page's saved data on disk, so an update, a reinstall or cleared app storage never loses calendars and settings.
const backupFile = path.join(dir, 'lumina-data.json');
ipcMain.on('backup', (e, data) => {
  if (e.sender !== win?.webContents || typeof data !== 'string' || data.length < 3) return;
  fs.writeFile(backupFile + '.tmp', data, err => { if (!err) fs.rename(backupFile + '.tmp', backupFile, () => {}); }); // never a half-written copy
});
ipcMain.on('restore', e => { try { e.returnValue = e.sender === win?.webContents ? fs.readFileSync(backupFile, 'utf8') : ''; } catch { e.returnValue = ''; } });

// ---- focus lock: report the window in front; the page decides, and this shows or hides the cover ----
const ps = (script, cb) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + script], { windowsHide: true, maxBuffer: 1 << 20 }, cb);
// Prints "pid|process|window class|title" whenever the window in front changes.
const FG = `Add-Type 'using System;using System.Text;using System.Runtime.InteropServices;public class W{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetClassName(IntPtr h,StringBuilder s,int n);}';
$last='';while(Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue){$h=[W]::GetForegroundWindow();$b=New-Object Text.StringBuilder 512;[void][W]::GetWindowText($h,$b,512);$p=[uint32]0;[void][W]::GetWindowThreadProcessId($h,[ref]$p);
$c=New-Object Text.StringBuilder 256;[void][W]::GetClassName($h,$c,256);
$n=(Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName;$l="$p|$n|$c|" + ($b.ToString() -replace '[\\t\\r\\n]',' ');if($l -ne $last){$last=$l;[Console]::WriteLine($l)};Start-Sleep -Milliseconds 600}`;
function watch(on) {
  if (!on) { watcher?.kill(); watcher = null; return; }
  if (watcher) return;
  const w = watcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + FG], { windowsHide: true });
  let buf = '';
  w.stdout.setEncoding('utf8').on('data', d => {
    const lines = (buf += d).split(/\r?\n/);
    buf = lines.pop();
    for (const l of lines) {
      const [, pid, name, cls, title] = l.match(/^(\d+)\|([^|]*)\|([^|]*)\|(.*)$/) || []; // titles may contain |
      if (pid && !win.isDestroyed()) win.webContents.send('fg', { name, cls, title, self: +pid === process.pid });
    }
  });
  w.on('error', () => {});
  w.on('exit', () => { if (watcher === w) watcher = null; });
}
ipcMain.on('watch', (e, on) => { if (e.sender === win.webContents) watch(!!on); });
// The cover goes over every display; the taskbar stays free, so you can always switch back to an allowed app.
function showCovers(st) {
  if (!covers.length) covers = screen.getAllDisplays().map(d => {
    const c = new BrowserWindow({
      ...d.workArea, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Lumina focus lock', backgroundColor: '#151412', webPreferences: prefs,
    });
    c.setAlwaysOnTop(true, 'screen-saver');
    c.on('close', ev => { if (!quitting) { ev.preventDefault(); c.hide(); } });
    c.loadFile(web('lock.html'));
    return c;
  });
  for (const c of covers) {
    const show = () => { if (lockState) { c.webContents.send('state', lockState); c.showInactive(); } };
    c.webContents.isLoading() ? c.webContents.once('did-finish-load', show) : show();
  }
}
ipcMain.on('lock', (e, st) => {
  if (e.sender !== win.webContents) return;
  lockState = st || null;
  lockState ? showCovers(lockState) : covers.forEach(c => c.hide());
});
ipcMain.handle('windows', () => new Promise(res => ps(
  'Get-Process | ? { $_.MainWindowTitle -and $_.Id -ne ' + process.pid + ' } | % { $_.ProcessName + "|" + $_.MainWindowTitle }',
  (err, out) => res(err ? [] : out.split(/\r?\n/).map(l => l.match(/^([^|]+)\|(.+)$/)).filter(Boolean).map(([, name, title]) => ({ name, title }))))));

// ---- Windows Night light: flips the on/off flag in its settings blob (the CloudStore format of Windows 10 and 11) ----
// shortcut: undocumented format; if the blob doesn't look as expected nothing is written.
const NL = String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\DefaultAccount\Current\default$windows.data.bluelightreduction.bluelightreductionstate\windows.data.bluelightreduction.bluelightreductionstate`;
const nightPs = on => `$k='${NL}';$d=[byte[]](Get-ItemProperty $k -ErrorAction Stop).Data;
if($d.Length -lt 26 -or $d[0] -ne 0x43 -or $d[19] -ne 0x43){exit 1};$is=$d[23] -eq 2 -and $d[24] -eq 1;$want=$${on ? 'true' : 'false'};if($is -eq $want){exit 0}
if($want){$n=[byte[]]($d[0..22]+[byte[]](2,1)+$d[23..($d.Length-1)]);$n[18]=$d[18]+2}else{$n=[byte[]]($d[0..22]+$d[25..($d.Length-1)]);$n[18]=$d[18]-2}
for($i=10;$i -lt 15;$i++){if($n[$i] -ne 0xff){$n[$i]++;break}};Set-ItemProperty $k -Name Data -Value $n -Type Binary`;
ipcMain.on('winNight', (_, on) => ps(nightPs(!!on), () => {}));
// Calendar feeds are fetched here, not in the page, so the page can keep its strict no-network policy.
ipcMain.handle('ics', async (_, url) => {
  url = String(url).trim().replace(/^webcal:/i, 'https:');
  if (!/^https?:\/\//i.test(url)) throw new Error('Not a web link');
  const r = await net.fetch(url, { signal: AbortSignal.timeout(20000) }); // a stalled server must not leave "Syncing…" forever
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.text()).slice(0, 5e6);
});
