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
  newsSeenAt: '',
  // Izabrani server (index u config.servers nizu); range se proverava u servers:set
  serverIndex: 0,
  // Whitelist verifikacija — username + timestamp (ms); token se NIKAD ne čuva
  whitelistUser: '',
  whitelistVerifiedAt: 0,
  // Jezik interfejsa: sr (podrazumevano) ili en — menja se u Postavke → Jezik
  lang: 'sr'
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
    newsSeenAt: typeof parsed.newsSeenAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.newsSeenAt) ? parsed.newsSeenAt : DEFAULTS.newsSeenAt,
    serverIndex: Number.isInteger(parsed.serverIndex) && parsed.serverIndex >= 0 && parsed.serverIndex < 100 ? parsed.serverIndex : DEFAULTS.serverIndex,
    whitelistUser: typeof parsed.whitelistUser === 'string' && /^[\p{L}\p{N}_.\- ]{0,64}$/u.test(parsed.whitelistUser) ? parsed.whitelistUser : DEFAULTS.whitelistUser,
    whitelistVerifiedAt: Number.isFinite(parsed.whitelistVerifiedAt) && parsed.whitelistVerifiedAt >= 0 ? Math.floor(parsed.whitelistVerifiedAt) : DEFAULTS.whitelistVerifiedAt,
    lang: parsed.lang === 'en' ? 'en' : 'sr'
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
    if (Object.prototype.hasOwnProperty.call(patch, 'serverIndex')) {
      const value = patch.serverIndex;
      if (Number.isInteger(value) && value >= 0 && value < 100) next.serverIndex = value;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'whitelistUser')) {
      const value = patch.whitelistUser;
      if (typeof value === 'string' && /^[\p{L}\p{N}_.\- ]{0,64}$/u.test(value)) next.whitelistUser = value;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'lang')) {
      if (patch.lang === 'en' || patch.lang === 'sr') next.lang = patch.lang;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'whitelistVerifiedAt')) {
      const value = patch.whitelistVerifiedAt;
      if (Number.isFinite(value) && value >= 0) next.whitelistVerifiedAt = Math.floor(value);
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
    console.error('[shandy] Ne mogu da snimim postavke:', error.message);
  }
  return { ...cache };
}

module.exports = { load, set, DEFAULTS };
