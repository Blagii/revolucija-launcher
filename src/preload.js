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

contextBridge.exposeInMainWorld('revolucija', {
  getStatus: () => invoke('server:status'),
  connect: () => invoke('server:connect'),
  openLink: (url) => invoke('link:open', url),
  copyToClipboard: (text) => invoke('clipboard:write', text),
  getAppInfo: () => invoke('app:info'),
  getNews: () => invoke('news:list'),
  getSettings: () => invoke('settings:get'),
  setSettings: (patch) => invoke('settings:set', patch),
  checkUpdates: (force = true) => invoke('updates:check', { force: Boolean(force) }),

  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggle-maximize'),
    close: () => invoke('window:close'),
    isMaximized: () => invoke('window:is-maximized')
  },

  onUpdateAvailable: subscribe('updater:available')
});
