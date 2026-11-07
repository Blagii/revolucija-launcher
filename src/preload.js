'use strict';

/**
 * Preload — jedini most između renderera i Node/Electron-a.
 * Izolovan je (contextIsolation + sandbox), izlaže isključivo ove funkcije.
 */

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

function subscribe(channel) {
  return (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('shandy', {
  getStatus: () => invoke('server:status'),
  connect: () => invoke('server:connect'),
  openLink: (url) => invoke('link:open', url),
  copyToClipboard: (text) => invoke('clipboard:write', text),
  getAppInfo: () => invoke('app:info'),
  getNews: () => invoke('news:list'),
  getFivemPresence: () => invoke('fivem:process-status'),
  // Multi-server: izbor ciljnog servera
  servers: {
    list: () => invoke('servers:list'),
    set: (index) => invoke('servers:set', index)
  },
  // Whitelist (Discord OAuth) — token se prosleđuje main-u, nikad u renderer
  whitelist: {
    status: () => invoke('whitelist:status'),
    connect: () => invoke('whitelist:connect'),
    disconnect: () => invoke('whitelist:disconnect'),
    onChanged: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('whitelist:changed', listener);
      return () => ipcRenderer.removeListener('whitelist:changed', listener);
    }
  },
  // Dijagnostika — crash izveštaji ostaju na računaru; korisnik bira da li ih šalje
  crashes: {
    list: () => invoke('crashes:list'),
    clear: () => invoke('crashes:clear')
  },
  getSettings: () => invoke('settings:get'),
  setSettings: (patch) => invoke('settings:set', patch),

  history: {
    get: (limit) => invoke('history:get', limit)
  },

  updates: {
    check: (force = true) => invoke('updates:check', { force: Boolean(force) }),
    download: () => invoke('updates:download'),
    install: () => invoke('updates:install'),
    releaseNotes: () => invoke('updates:release-notes'),
    onAvailable: subscribe('updates:available'),
    onNotAvailable: subscribe('updates:not-available'),
    onProgress: subscribe('updates:progress'),
    onDownloaded: subscribe('updates:downloaded'),
    onError: subscribe('updates:error')
  },

  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggle-maximize'),
    close: () => invoke('window:close'),
    isMaximized: () => invoke('window:is-maximized')
  }
});
