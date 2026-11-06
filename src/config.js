'use strict';

/**
 * Konfiguracija launchera.
 *
 * Redosled prioriteta (kasnije pobeđuje):
 *   1. ugrađeni default-ovi (ovaj fajl)
 *   2. config.json — prvi pronađeni u:
 *        - putanju iz REVOLUCIJA_CONFIG env varijable
 *        - korenu projekta (pored package.json) — dev režim
 *        - process.resourcesPath (upakovana aplikacija)
 *   3. environment varijable:
 *        REVOLUCIJA_SERVER_HOST, REVOLUCIJA_SERVER_PORT,
 *        REVOLUCIJA_UPDATE_REPO, REVOLUCIJA_ANNOUNCEMENT_URL
 *
 * server.host mora da bude hostname ili IPv4 adresa (a-z 0-9 . -).
 */

const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  server: Object.freeze({
    name: 'Revolucija Roleplay',
    host: '89.116.184.110',
    port: 30120,
    locale: 'sr'
  }),
  links: Object.freeze({
    discord: 'https://discord.gg/revolucija',
    instagram: 'https://instagram.com/revolucijaroleplay',
    youtube: 'https://www.youtube.com/'
  }),
  // GitHub "owner/repo" sa kog se čitaju objavljena izdanja (releases).
  // Prazan string ili null gasi proveru ažuriranja.
  updateRepo: 'Seekiii/revolucija-launcher',
  // Opcioni HTTPS endpoint koji vraća JSON niz obaveštenja:
  // [{ "date": "2026-11-06", "tag": "NAJAVA", "title": "…", "text": "…" }]
  announcementUrl: null,
  pollIntervalSeconds: 15,
  requestTimeoutMs: 4000
});

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function findConfigFile() {
  const candidates = [];
  if (process.env.REVOLUCIJA_CONFIG) candidates.push(process.env.REVOLUCIJA_CONFIG);
  candidates.push(path.join(__dirname, '..', 'config.json'));
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'config.json'));
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const configFile = findConfigFile();
const fileConfig = configFile ? readJsonFile(configFile) || {} : {};

const env = process.env;
const merged = {
  server: { ...DEFAULTS.server, ...(fileConfig.server || {}) },
  links: { ...DEFAULTS.links, ...(fileConfig.links || {}) },
  updateRepo: fileConfig.updateRepo !== undefined ? fileConfig.updateRepo : DEFAULTS.updateRepo,
  announcementUrl: fileConfig.announcementUrl !== undefined ? fileConfig.announcementUrl : DEFAULTS.announcementUrl,
  pollIntervalSeconds: Number(fileConfig.pollIntervalSeconds) || DEFAULTS.pollIntervalSeconds,
  requestTimeoutMs: Number(fileConfig.requestTimeoutMs) || DEFAULTS.requestTimeoutMs
};

if (env.REVOLUCIJA_SERVER_HOST) merged.server.host = env.REVOLUCIJA_SERVER_HOST.trim();
if (env.REVOLUCIJA_SERVER_PORT) merged.server.port = Number(env.REVOLUCIJA_SERVER_PORT);
if (env.REVOLUCIJA_UPDATE_REPO !== undefined) merged.updateRepo = env.REVOLUCIJA_UPDATE_REPO.trim() || null;
if (env.REVOLUCIJA_ANNOUNCEMENT_URL !== undefined) merged.announcementUrl = env.REVOLUCIJA_ANNOUNCEMENT_URL.trim() || null;

// Sanitizacija i validacija — launcher ne sme da otvori "fivem://injected".
const HOST_RE = /^[a-z0-9.-]+$/i;
const host = String(merged.server.host || '').trim();
if (!HOST_RE.test(host) || host.includes('..')) {
  throw new Error(`[revolucija] Nevažeći server.host u konfiguraciji: "${host}"`);
}
const port = Number(merged.server.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`[revolucija] Nevažeći server.port u konfiguraciji: "${merged.server.port}"`);
}
merged.server.host = host.toLowerCase();
merged.server.port = port;
merged.pollIntervalSeconds = Math.min(Math.max(merged.pollIntervalSeconds, 5), 300);
merged.requestTimeoutMs = Math.min(Math.max(merged.requestTimeoutMs, 1000), 15000);

const config = Object.freeze({
  ...merged,
  server: Object.freeze(merged.server),
  links: Object.freeze(merged.links),
  connectUrl: `fivem://${merged.server.host}:${merged.server.port}`,
  baseUrl: `http://${merged.server.host}:${merged.server.port}`,
  configFile // null kada se koriste ugrađeni default-ovi
});

module.exports = config;
