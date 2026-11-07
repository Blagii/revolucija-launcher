'use strict';

/**
 * Korisničke postavke launchera — čuvaju se u userData/settings.json.
 * Samo poznate, sanitizovane ključeve; nikada se ne čuvaju tajne.
 */

const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  autoUpdateCheck: true,
  reducedMotion: false,
  // Zatvaranje prozora minimizuje u tray umesto gašenja — launcher ostaje uz FiveM dok igraš.
  minimizeToTray: false,
  // Zadnja izmena obaveštenja koje je korisnik video (YYYY-MM-DD) — za "unread" badge. '' = baseline.
  newsSeenAt: ''
});

let cache = null;

function settingsFile() {
  // lazy require da modul radi i van Electron runtime-a (npr. u smoke-testu)
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'settings.json');
}

function load() {
  if (cache) return { ...cache };
  let parsed = {};
  try {
    parsed = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    parsed = {};
  }
  cache = {
    autoUpdateCheck: typeof parsed.autoUpdateCheck === 'boolean' ? parsed.autoUpdateCheck : DEFAULTS.autoUpdateCheck,
    reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : DEFAULTS.reducedMotion,
    minimizeToTray: typeof parsed.minimizeToTray === 'boolean' ? parsed.minimizeToTray : DEFAULTS.minimizeToTray,
    newsSeenAt: typeof parsed.newsSeenAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.newsSeenAt) ? parsed.newsSeenAt : DEFAULTS.newsSeenAt
  };
  return { ...cache };
}

function set(patch) {
  const current = load();
  const next = { ...current };
  if (patch && typeof patch === 'object') {
    if (Object.prototype.hasOwnProperty.call(patch, 'autoUpdateCheck')) {
      next.autoUpdateCheck = Boolean(patch.autoUpdateCheck);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'reducedMotion')) {
      next.reducedMotion = Boolean(patch.reducedMotion);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'minimizeToTray')) {
      next.minimizeToTray = Boolean(patch.minimizeToTray);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'newsSeenAt')) {
      const value = patch.newsSeenAt;
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) next.newsSeenAt = value;
    }
  }
  cache = next;
  try {
    const file = settingsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, file);
  } catch (error) {
    console.error('[revolucija] Ne mogu da snimim postavke:', error.message);
  }
  return { ...cache };
}

module.exports = { load, set, DEFAULTS };
