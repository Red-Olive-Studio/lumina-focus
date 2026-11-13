const { app, BrowserWindow, ipcMain, screen, powerMonitor, net, shell } = require('electron');
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

function createPip() {
  const w = 380, h = 72, a = screen.getPrimaryDisplay().workArea;
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

// Warm tint: one click-through overlay per display.
function setTint(on) {
  if (!on) { tints.forEach(t => t.destroy()); tints = []; return; }
  if (tints.length) return;
  tints = screen.getAllDisplays().map(d => {
    const t = new BrowserWindow({
      ...d.bounds, frame: false, transparent: true, focusable: false,
      skipTaskbar: true, resizable: false, hasShadow: false, alwaysOnTop: true,
    });
    t.setAlwaysOnTop(true, 'screen-saver');
    t.setIgnoreMouseEvents(true);
    t.loadURL('data:text/html,<body style="margin:0;background:rgba(255,120,0,.16)">');
    return t;
  });
}
// A monitor plugged in or out: rebuild the overlays for the new layout.
function displaysChanged() {
  if (tints.length) { setTint(false); setTint(true); }
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
ipcMain.on('tint', (_, on) => setTint(!!on));
// The portable exe unpacks to a temp folder each run; register the exe itself.
ipcMain.on('login', (_, on) => app.setLoginItemSettings({ openAtLogin: !!on, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath }));
// The page already gave the user 60 seconds to cancel, so these act right away.
const POWER = {
  shutdown: ['shutdown', ['/s', '/t', '0']],
  sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']], // hibernates instead if hibernation is on
  lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
};
ipcMain.on('power', (e, a) => { if (!TEST && POWER[a] && e.sender === win?.webContents) execFile(...POWER[a], () => {}); }); // only the main window may sleep or shut down the PC
ipcMain.handle('idle', () => powerMonitor.getSystemIdleTime());

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
