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
 */

const path = require('path');
const { app, BrowserWindow, ipcMain, shell, clipboard, Menu, session } = require('electron');

const config = require('./config');
const settings = require('./settings');
const { getServerStatus } = require('./fivem');
const { fetchJson } = require('./http-json');
const { BUNDLED_NEWS } = require('./news');
const { checkForUpdate } = require('./update');

const isDev = process.argv.includes('--dev') || process.env.REVOLUCIJA_DEV === '1';

let mainWindow = null;

/* ---------------------------------------------------------------- */
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

/* ---------------------------------------------------------------- */
/* Prozor                                                            */
/* ---------------------------------------------------------------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
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
    console.error('[revolucija] Renderer je pao:', details && details.reason);
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

handle('server:status', () => getServerStatus(config));

handle('server:connect', async () => {
  // connectUrl je validiran pri učitavanju konfiguracije (host + port).
  await shell.openExternal(config.connectUrl);
  return { ok: true, url: config.connectUrl };
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
  serverName: config.server.name,
  host: config.server.host,
  port: config.server.port,
  connectUrl: config.connectUrl,
  pollIntervalSeconds: config.pollIntervalSeconds,
  links: { ...config.links },
  updateRepo: config.updateRepo || null,
  configFile: config.configFile,
  tool: 'REA (analyze-javascript-application) — vidi docs/ANALIZA.md'
}));

handle('news:list', () => loadNews());

handle('settings:get', () => settings.load());
handle('settings:set', (patch) => settings.set(patch));

handle('updates:check', async (options) => {
  const force = Boolean(options && options.force);
  const current = app.getVersion();
  if (!force && settings.load().autoUpdateCheck === false) {
    return { ok: true, skipped: true, available: false, current };
  }
  return checkForUpdate(config.updateRepo, current);
});

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
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('gg.revolucija.launcher');
    Menu.setApplicationMenu(null);

    // Odbij sve permission zahteve (kamera, geolokacija, notifikacije, …)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);

    createWindow();

    // Tiha provera ažuriranja 2s nakon pokretanja
    setTimeout(async () => {
      try {
        const result = await checkForUpdate(config.updateRepo, app.getVersion());
        if (result && result.available) broadcast('updater:available', result);
      } catch {
        /* tiho — provera ažuriranja nikada ne sme da obori launcher */
      }
    }, 2000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
