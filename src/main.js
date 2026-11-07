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
const { app, BrowserWindow, ipcMain, shell, clipboard, Menu, session, screen } = require('electron');

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
  const status = await getServerStatus(config);
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
  packaged: app.isPackaged,
  serverName: config.server.name,
  host: config.server.host,
  port: config.server.port,
  connectUrl: config.connectUrl,
  pollIntervalSeconds: config.pollIntervalSeconds,
  updateRepo: config.updateRepo || null,
  configFile: config.configFile,
  links: { ...config.links },
  discord: { enabled: Boolean(config.discord.clientId) },
  fivem: detectFiveM()
}));

handle('news:list', () => loadNews());

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

    wireAutoUpdaterEvents();
    initDiscordRpc(config);
    createWindow();

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
    closeDiscordRpc();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
