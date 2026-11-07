'use strict';

/**
 * Revolucija Roleplay — Launcher (Electron main proces)
 *
 * Bezbednosni model:
 *  - contextIsolation: true, nodeIntegration: false, sandbox: true
 *  - rendereru je dostupan samo preload bridge (src/preload.js)
 *  - sve spoljne veze (https) se otvaraju u sistemskom browseru, nikada u aplikaciji
 *  - navigacija i window.open su zabranjeni; dozvole (permisije) se odbijaju
 *  - IPC kanali proveravaju da pošiljalac jeste prozor ove aplikacije
 *
 * Napredno:
 *  - electron-updater (GitHub Releases) sa progres barom; tiha provera 2.5 s posle starta
 *  - Discord Rich Presence (opcionalno, preko lokalnog IPC-a)
 *  - detekcija FiveM instalacije (Windows)
 *  - istorija popunjenosti servera za sparkline (userData/player-history.json)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { app, BrowserWindow, ipcMain, shell, clipboard, Menu, Tray, nativeImage, session, screen } = require('electron');

const config = require('./config');
const settings = require('./settings');
const history = require('./history');
const { getServerStatus } = require('./fivem');
const { fetchJson } = require('./http-json');
const { BUNDLED_NEWS } = require('./news');
const { checkForUpdate, parseVersion, compareVersions } = require('./update');
const { getLatestRelease } = require('./changelog');
const { detectFiveM } = require('./fivem-install');
const { initDiscordRpc, updatePresence, closeDiscordRpc } = require('./discord-rpc');

/* ── Multi-server: izbor servera u Postavkama (settings.serverIndex) ── */
function currentServerEntry() {
  const servers = config.servers;
  let index = 0;
  try {
    index = settings.load().serverIndex;
  } catch {
    index = 0;
  }
  if (!Number.isInteger(index) || index < 0 || index >= servers.length) index = 0;
  return { index, server: servers[index] };
}

function effectiveConfig() {
  const { server } = currentServerEntry();
  return {
    ...config,
    server,
    baseUrl: `http://${server.host}:${server.port}`,
    connectUrl: `fivem://${server.host}:${server.port}`
  };
}

/* ── Whitelist preko Discord OAuth-a (revolucija://whitelist callback) ── */
function handleWhitelistCallback(rawUrl) {
  try {
    const hash = String(rawUrl).split('#')[1] || '';
    const params = new URLSearchParams(hash);
    const token = params.get('access_token') || '';
    if (!/^[A-Za-z0-9._-]{20,200}$/.test(token)) {
      broadcast('whitelist:changed', { status: 'failed', error: 'Discord callback nije sadržao token.' });
      return;
    }
    verifyWhitelistWithBackend(token);
  } catch {
    broadcast('whitelist:changed', { status: 'failed', error: 'Callback nije prepoznat.' });
  }
}

async function verifyWhitelistWithBackend(token) {
  const apiUrl = config.whitelistApiUrl;
  const finish = (payload) => broadcast('whitelist:changed', payload);
  if (!apiUrl) {
    finish({ status: 'failed', error: 'whitelistApiUrl nije podešen (config.json ili REVOLUCIJA_WHITELIST_URL).' });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_token: token }),
      signal: controller.signal
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || !data || data.ok !== true) {
      finish({ status: 'failed', error: (data && data.error) || `Backend je vratio ${res.status}.` });
      return;
    }
    if (data.whitelisted) {
      const name = String((data.user && (data.user.globalName || data.user.username)) || 'igrac').slice(0, 64);
      settings.set({ whitelistUser: name, whitelistVerifiedAt: Date.now() });
      finish({ status: 'verified', username: name });
    } else {
      finish({ status: 'failed', error: 'Nisi na whitelist-i — nisi član servera ili nemaš whitelist ulogu.' });
    }
  } catch {
    finish({ status: 'failed', error: 'Whitelist backend nije dostupan. Proveri vezu i whitelistApiUrl.' });
  } finally {
    clearTimeout(timer);
  }
}

let autoUpdater = null;
try {
  // eslint-disable-next-line global-require
  autoUpdater = require('electron-updater').autoUpdater;
} catch (error) {
  console.warn('[revolucija] electron-updater nije dostupan:', error && error.message);
}

const isDev = process.argv.includes('--dev') || process.env.REVOLUCIJA_DEV === '1';

let mainWindow = null;
// Ako renderer sruši 3 puta zaredom — prestajemo da relodujemo beskonačno i zatvaramo.
let rendererCrashCount = 0;
// Tray: launcher može da ostane u tray-u umesto da se zatvori (settings.minimizeToTray)
let tray = null;
let isQuitting = false;

/* ---------------- Dijagnostika: crash izveštaji (samo lokalno) ---------------- */

const CRASH_DIR = () => path.join(app.getPath('userData'), 'crashes');
const MAX_CRASH_REPORTS = 5;

function sanitizeCrashText(value, maxLen) {
  let text = String(value == null ? '' : value);
  try {
    text = text.split(os.homedir()).join('~');
  } catch {
    /* homedir nedostupan — ostavljamo tekst kakav jeste */
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/** Zapiše kratak crash izveštaj u userData/crashes/ — ništa se ne šalje mrežom. */
function recordCrashReport(source, errorLike) {
  try {
    const dir = CRASH_DIR();
    fs.mkdirSync(dir, { recursive: true });
    const report = {
      version: app.getVersion(),
      platform: `${process.platform}/${process.arch}`,
      electron: process.versions.electron || 'unknown',
      at: new Date().toISOString(),
      source: sanitizeCrashText(source, 40),
      message: sanitizeCrashText(errorLike && (errorLike.message || errorLike.reason) || String(errorLike), 300),
      stack: sanitizeCrashText(errorLike && errorLike.stack, 2000)
    };
    fs.writeFileSync(path.join(dir, `crash-${Date.now()}.json`), JSON.stringify(report, null, 2));
    // čuvaj samo poslednjih MAX_CRASH_REPORTS
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('crash-') && f.endsWith('.json')).sort();
    while (files.length > MAX_CRASH_REPORTS) {
      const oldest = files.shift();
      try { fs.unlinkSync(path.join(dir, oldest)); } catch { /* već obrisan */ }
    }
  } catch (error) {
    console.warn('[revolucija] Ne mogu da zapišem crash izveštaj:', error && error.message);
  }
}

function listCrashReports() {
  try {
    const dir = CRASH_DIR();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => f.startsWith('crash-') && f.endsWith('.json'))
      .sort()
      .slice(-MAX_CRASH_REPORTS)
      .reverse()
      .map((file) => {
        try {
          const report = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
          return { file, at: report.at, source: report.source, message: report.message, version: report.version };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function clearCrashReports() {
  try {
    const dir = CRASH_DIR();
    if (!fs.existsSync(dir)) return { ok: true };
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith('crash-') && file.endsWith('.json')) {
        try { fs.unlinkSync(path.join(dir, file)); } catch { /* ignoriši */ }
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error && error.message) || 'ne mogu da obrišem' };
  }
}

/* ---------------------------------------------------------------- */
/* Pomoćne funkcije/* ---------------------------------------------------------------- */
/* Pomoćne funkcije                                                  */
/* ---------------------------------------------------------------- */

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function assertTrustedSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error('Untrusted IPC sender');
  }
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    return fn(...args);
  });
}

function sanitizeExternalUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  return url.toString();
}

function sanitizeNewsItem(item) {
  if (!item || typeof item !== 'object') return null;
  const title = typeof item.title === 'string' ? item.title.trim().slice(0, 140) : '';
  const text = typeof item.text === 'string' ? item.text.trim().slice(0, 500) : '';
  if (!title || !text) return null;
  const tag = typeof item.tag === 'string' && item.tag.trim() ? item.tag.trim().toUpperCase().slice(0, 20) : 'NAJAVA';
  const date = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.date.trim())
    ? item.date.trim().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return { date, tag, title, text };
}

async function loadNews() {
  const bundled = BUNDLED_NEWS.map((item) => ({ ...item }));
  if (!config.announcementUrl) {
    return { items: bundled, source: 'local' };
  }
  try {
    const remote = await fetchJson(config.announcementUrl, { timeout: 5000 });
    if (!Array.isArray(remote)) return { items: bundled, source: 'local' };
    const items = remote.map(sanitizeNewsItem).filter(Boolean).slice(0, 6);
    if (items.length === 0) return { items: bundled, source: 'local' };
    return { items, source: 'remote' };
  } catch {
    return { items: bundled, source: 'local' };
  }
}

function releasePageUrl() {
  return config.updateRepo ? `https://github.com/${config.updateRepo}/releases/latest` : null;
}

/**
 * Normalan launcher prozor — kompaktan (16:9), centriran, nikad veći od work area
 * (bez taskbar-a/dok-a) sa marginama. Ne preko celog ekrana čak ni na malim ekranima.
 */
function initialWindowSize() {
  try {
    const workArea = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.min(1152, Math.max(960, workArea.width - 96));
    const height = Math.min(648, Math.max(540, Math.floor((width * 9) / 16)), workArea.height - 96);
    return { width, height: Math.max(540, height) };
  } catch {
    return { width: 1152, height: 648 };
  }
}

function showOrCreateWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  createWindow();
}

/**
 * Tray ikona + meni. Ikona je src/renderer/icon.png (256px) smanjena na 16/22.
 * Ako se bilo šta pokvari (npr. nedostaje fajl u dev-u) — tray prosto ne postoji,
 * aplikacija radi normalno.
 */
function createTray() {
  try {
    const iconPath = path.join(__dirname, 'renderer', 'icon.png');
    let image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      console.warn('[revolucija] Tray ikonica nije pronađena — tray preskočen.');
      return;
    }
    image = image.resize({ width: 16, height: 16 });
    tray = new Tray(image);
    tray.setToolTip('Revolucija RP Launcher');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Otvori launcher', click: () => showOrCreateWindow() },
      { type: 'separator' },
      {
        label: 'Zatvori launcher',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]));
    tray.on('click', () => showOrCreateWindow());
  } catch (error) {
    console.warn('[revolucija] Tray nije dostupan:', error && error.message);
    tray = null;
  }
}

function semverGreater(remote, current) {
  const r = parseVersion(remote);
  const c = parseVersion(current);
  return Boolean(r && c && compareVersions(r, c) > 0);
}

/**
 * Jedinstvena provera ažuriranja.
 * - U upakovanoj aplikaciji: electron-updater (potpuna integracija: download + install).
 * - U dev režimu ili ako updater ne uspe: ručna GitHub Releases provera (samo info + link).
 */
async function checkUpdatesFlow(force) {
  const current = app.getVersion();
  if (!force && settings.load().autoUpdateCheck === false) {
    return { ok: true, skipped: true, available: false, current };
  }
  if (autoUpdater && app.isPackaged) {
    try {
      const result = await autoUpdater.checkForUpdates();
      const remote = result && result.updateInfo && result.updateInfo.version
        ? String(result.updateInfo.version).replace(/^v/i, '')
        : null;
      return {
        ok: true,
        via: 'auto-updater',
        available: remote ? semverGreater(remote, current) : false,
        current,
        latest: remote,
        url: releasePageUrl()
      };
    } catch (error) {
      console.warn('[revolucija] autoUpdater.checkForUpdates neuspešan, padam na GitHub API:', error && error.message);
      const fallback = await checkForUpdate(config.updateRepo, current);
      return { ...fallback, via: 'github-api' };
    }
  }
  const fallback = await checkForUpdate(config.updateRepo, current);
  return { ...fallback, via: 'github-api' };
}

function wireAutoUpdaterEvents() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = console;

  autoUpdater.on('update-available', (info) => {
    broadcast('updates:available', {
      version: info && info.version ? String(info.version).replace(/^v/i, '') : null,
      url: releasePageUrl()
    });
  });
  autoUpdater.on('update-not-available', () => {
    broadcast('updates:not-available', { current: app.getVersion() });
  });
  autoUpdater.on('download-progress', (progress) => {
    broadcast('updates:progress', {
      percent: Math.round(((progress && progress.percent) || 0) * 10) / 10,
      bytesPerSecond: Math.round((progress && progress.bytesPerSecond) || 0),
      transferred: Math.round((progress && progress.transferred) || 0),
      total: Math.round((progress && progress.total) || 0)
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    broadcast('updates:downloaded', {
      version: info && info.version ? String(info.version).replace(/^v/i, '') : null
    });
  });
  autoUpdater.on('error', (error) => {
    broadcast('updates:error', {
      message: error && error.message ? String(error.message).slice(0, 300) : 'Nepoznata greška'
    });
  });
}

/* ---------------------------------------------------------------- */
/* Prozor                                                            */
/* ---------------------------------------------------------------- */

function createWindow() {
  const { width, height } = initialWindowSize();

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 960,
    minHeight: 540,
    frame: false,
    show: false,
    center: true,
    backgroundColor: '#0a0b0f',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'renderer', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: isDev
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on('maximize', () => broadcast('window:maximized-changed', true));
  mainWindow.on('unmaximize', () => broadcast('window:maximized-changed', false));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    rendererCrashCount += 1;
    recordCrashReport('renderer', details);
    console.error(`[revolucija] Renderer je pao (${rendererCrashCount}/3):`, details && details.reason);
    if (rendererCrashCount >= 3) {
      console.error('[revolucija] Renderer srušio 3 puta — zatvaram aplikaciju.');
      app.quit();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  // Nema navigacije unutar prozora — sve eksterno ide u sistemski browser.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

/* ---------------------------------------------------------------- */
/* IPC kanali                                                        */
/* ---------------------------------------------------------------- */

handle('server:status', async () => {
  const status = await getServerStatus(effectiveConfig());
  try {
    if (status && status.online) {
      history.append({ clients: status.clients, maxClients: status.maxClients });
      updatePresence({ online: true, clients: status.clients, maxClients: status.maxClients });
    } else {
      updatePresence({ online: false });
    }
  } catch (error) {
    console.warn('[revolucija] status post-processing greška:', error && error.message);
  }
  return status;
});

handle('server:connect', async () => {
  // connectUrl je validiran (host + port) pri učitavanju/izboru servera.
  const eff = effectiveConfig();
  await shell.openExternal(eff.connectUrl);
  return { ok: true, url: eff.connectUrl };
});

handle('link:open', async (url) => {
  const safe = sanitizeExternalUrl(url);
  if (!safe) return { ok: false, error: 'Dozvoljeni su samo https:// linkovi.' };
  await shell.openExternal(safe);
  return { ok: true, url: safe };
});

handle('clipboard:write', (text) => {
  if (typeof text !== 'string') return { ok: false };
  clipboard.writeText(text.slice(0, 500));
  return { ok: true };
});

handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
  arch: process.arch,
  packaged: app.isPackaged,
  serverName: effectiveConfig().server.name,
  host: effectiveConfig().server.host,
  port: effectiveConfig().server.port,
  connectUrl: effectiveConfig().connectUrl,
  servers: config.servers.map((server, index) => ({ index, name: server.name, host: server.host, port: server.port })),
  serverIndex: currentServerEntry().index,
  pollIntervalSeconds: config.pollIntervalSeconds,
  updateRepo: config.updateRepo || null,
  configFile: config.configFile,
  whitelist: { configured: Boolean(config.whitelistApiUrl && config.discord.clientId) },
  links: { ...config.links },
  discord: { enabled: Boolean(config.discord.clientId) },
  fivem: detectFiveM()
}));

handle('news:list', () => loadNews());

handle('crashes:list', () => listCrashReports());

handle('crashes:clear', () => clearCrashReports());

// ── Multi-server ──
handle('servers:list', () => {
  const { index } = currentServerEntry();
  return {
    currentIndex: index,
    servers: config.servers.map((server, i) => ({ index: i, name: server.name, host: server.host, port: server.port }))
  };
});

handle('servers:set', (index) => {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= config.servers.length) {
    throw new Error('Nevalidan server index');
  }
  settings.set({ serverIndex: i });
  return { ok: true, index: i, server: config.servers[i] };
});

// ── Whitelist ──
handle('whitelist:status', () => {
  const configured = Boolean(config.whitelistApiUrl && config.discord.clientId);
  let username = '';
  let verifiedAt = 0;
  try {
    const persisted = settings.load();
    username = persisted.whitelistUser || '';
    verifiedAt = persisted.whitelistVerifiedAt || 0;
  } catch {
    /* ignoriši — tretiramo kao neprovereno */
  }
  const verified = configured && Boolean(username) && verifiedAt > 0;
  return {
    configured,
    status: verified ? 'verified' : 'unknown',
    username: verified ? username : null,
    verifiedAt: verified ? verifiedAt : null
  };
});

handle('whitelist:connect', () => {
  const clientId = config.discord.clientId;
  if (!clientId) {
    return { ok: false, error: 'Discord clientId nije podešen (config.json → discord.clientId).' };
  }
  if (!config.whitelistApiUrl) {
    return { ok: false, error: 'whitelistApiUrl nije podešen (config.json ili REVOLUCIJA_WHITELIST_URL).' };
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'revolucija://whitelist',
    response_type: 'token',
    scope: 'identify'
  });
  shell.openExternal(`https://discord.com/api/oauth2/authorize?${params.toString()}`).catch(() => {});
  return { ok: true };
});

handle('whitelist:disconnect', () => {
  settings.set({ whitelistUser: '', whitelistVerifiedAt: 0 });
  broadcast('whitelist:changed', { status: 'unknown' });
  return { ok: true };
});

// P4: da li je FiveM proces pokrenut (tasklist, samo Windows). null = nepoznato (nije "nije pokrenut").
handle('fivem:process-status', () => new Promise((resolve) => {
  if (process.platform !== 'win32') {
    resolve({ supported: false, running: null, error: null });
    return;
  }
  execFile('tasklist', ['/FI', 'IMAGENAME eq FiveM*.exe', '/NH', '/FO', 'CSV'],
    { timeout: 4000, windowsHide: true, maxBuffer: 256 * 1024 },
    (error, stdout) => {
      if (error) {
        resolve({ supported: true, running: null, error: (error && error.message) || 'tasklist nije uspeo' });
        return;
      }
      const out = String(stdout || '');
      const running = /fivem[^"]*\.exe/i.test(out) && !/no tasks are running/i.test(out);
      resolve({ supported: true, running, error: null });
    });
}));

handle('settings:get', () => settings.load());
handle('settings:set', (patch) => settings.set(patch));

handle('history:get', (limit) => {
  const n = Number(limit);
  const capped = Number.isFinite(n) ? Math.min(Math.max(n, 2), history.MAX_SAMPLES) : 150;
  return history.get(capped);
});

handle('updates:check', (options) => checkUpdatesFlow(Boolean(options && options.force)));

handle('updates:download', async () => {
  if (!autoUpdater || !app.isPackaged) {
    return {
      ok: false,
      error: 'Auto-update radi samo u instaliranoj aplikaciji. Preuzmi ručno sa Releases stranice.',
      url: releasePageUrl()
    };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? String(error.message).slice(0, 300) : 'Preuzimanje nije uspelo'
    };
  }
});

handle('updates:install', () => {
  if (!autoUpdater) {
    return { ok: false, error: 'Auto-update nije dostupan.' };
  }
  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall();
    } catch (error) {
      console.error('[revolucija] quitAndInstall greška:', error && error.message);
    }
  });
  return { ok: true };
});

handle('updates:release-notes', () => getLatestRelease(config.updateRepo));

handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
  return { ok: true };
});
handle('window:toggle-maximize', () => {
  if (!mainWindow) return { ok: false };
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return { ok: true, maximized: mainWindow.isMaximized() };
});
handle('window:close', () => {
  if (mainWindow) mainWindow.close();
  return { ok: true };
});
handle('window:is-maximized', () => Boolean(mainWindow && mainWindow.isMaximized()));

/* ---------------------------------------------------------------- */
/* Životni ciklus aplikacije                                         */
/* ---------------------------------------------------------------- */

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const protoUrl = Array.isArray(commandLine)
      ? commandLine.find((arg) => typeof arg === 'string' && arg.startsWith('revolucija://'))
      : null;
    if (protoUrl) handleWhitelistCallback(protoUrl);
    showOrCreateWindow();
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (typeof url === 'string' && url.startsWith('revolucija://')) handleWhitelistCallback(url);
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('gg.revolucija.launcher');
    Menu.setApplicationMenu(null);

    // revolucija:// — whitelist OAuth callback (Windows/Linux registry, macOS CFBundleURLTypes)
    try {
      if (process.defaultApp && process.argv.length > 1) {
        app.setAsDefaultProtocolClient('revolucija', process.execPath, [path.resolve(process.argv[1])]);
      } else {
        app.setAsDefaultProtocolClient('revolucija');
      }
    } catch (error) {
      console.warn('[revolucija] revolucija:// protokol nije registrovan:', error && error.message);
    }

    // Odbij sve permission zahteve (kamera, geolokacija, notifikacije, …)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);

    wireAutoUpdaterEvents();
    initDiscordRpc(config);
    createTray(); // tray dugme (ovo je prethodno nedostajalo — tray ikonica nikad nije nastajala)
    createWindow();

    // App je pokrenut direktno iz revolucija:// linka pri prvom startu — obradi callback
    const startUrl = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith('revolucija://'));
    if (startUrl) setImmediate(() => handleWhitelistCallback(startUrl));

    // Tiha provera ažuriranja 2.5 s nakon pokretanja
    setTimeout(async () => {
      try {
        const result = await checkUpdatesFlow(false);
        if (result && result.available) {
          broadcast('updates:available', { version: result.latest, url: result.url || releasePageUrl() });
        }
      } catch {
        /* tiho — provera ažuriranja nikada ne sme da obori launcher */
      }
    }, 2500);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    closeDiscordRpc();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
