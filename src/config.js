'use strict';

/**
 * Konfiguracija launchera.
 *
 * Redosled prioriteta (kasnije pobeđuje):
 *   1. ugrađeni default-ovi (ovaj fajl)
 *   2. config.json — prvi pronađeni u:
 *        - putanju iz SHANDY_CONFIG env varijable
 *        - korenu projekta (pored package.json) — dev režim
 *        - process.resourcesPath (upakovana aplikacija)
 *   3. environment varijable:
 *        SHANDY_SERVER_HOST, SHANDY_SERVER_PORT,
 *        SHANDY_UPDATE_REPO, SHANDY_ANNOUNCEMENT_URL,
 *        SHANDY_WHITELIST_URL
 *
 * server.host mora da bude hostname ili IPv4 adresa (a-z 0-9 . -).
 */

const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  server: Object.freeze({
    name: 'Shandy Roleplay',
    host: '89.116.184.110',
    port: 30120,
    locale: 'sr'
  }),
  links: Object.freeze({
    discord: 'https://discord.gg/shandy',
    instagram: 'https://instagram.com/shandyroleplay',
    youtube: 'https://www.youtube.com/'
  }),
  // GitHub "owner/repo" sa kog se čitaju objavljena izdanja (releases).
  // Prazan string ili null gasi proveru ažuriranja.
  updateRepo: 'Seekiii/shandy-launcher',
  // Opcioni HTTPS endpoint koji vraća JSON niz obaveštenja:
  // [{ "date": "2026-11-06", "tag": "NAJAVA", "title": "…", "text": "…" }]
  announcementUrl: null,
  // Opcioni POST endpoint (bot) za whitelist verifikaciju — { access_token } → { whitelisted }.
  whitelistApiUrl: null,
  // Discord Rich Presence — aktivno samo ako je postavljen clientId
  // (Discord Developer Portal → Application → Application ID, 17–20 cifara)
  discord: Object.freeze({
    clientId: null,
    largeImageKey: 'shandy'
  }),
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
  if (process.env.SHANDY_CONFIG) candidates.push(process.env.SHANDY_CONFIG);
  candidates.push(path.join(__dirname, '..', 'config.json'));
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'config.json'));
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const configFile = findConfigFile();
const fileConfig = configFile ? readJsonFile(configFile) || {} : {};

// servers — opciono u config.json: [{ name, host, port }] (max 5).
// Ako fali/nevažeće → jedan server iz server.* (podrazumevano ponašanje).
const MAX_SERVERS = 5;
function parseServers(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const name = String(entry.name || '').trim().slice(0, 48).replace(/[<>]/g, '');
    const host = String(entry.host || '').trim().toLowerCase();
    const port = Number(entry.port);
    if (!name) continue;
    if (!/^[a-z0-9.-]+$/.test(host) || host.includes('..')) continue;
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    const key = `${host}:${port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, host, port });
    if (out.length >= MAX_SERVERS) break;
  }
  return out.length > 0 ? out : null;
}

const env = process.env;
const merged = {
  server: { ...DEFAULTS.server, ...(fileConfig.server || {}) },
  links: { ...DEFAULTS.links, ...(fileConfig.links || {}) },
  updateRepo: fileConfig.updateRepo !== undefined ? fileConfig.updateRepo : DEFAULTS.updateRepo,
  announcementUrl: fileConfig.announcementUrl !== undefined ? fileConfig.announcementUrl : DEFAULTS.announcementUrl,
  whitelistApiUrl: fileConfig.whitelistApiUrl !== undefined ? fileConfig.whitelistApiUrl : DEFAULTS.whitelistApiUrl,
  discord: { ...DEFAULTS.discord, ...(fileConfig.discord || {}) },
  pollIntervalSeconds: Number(fileConfig.pollIntervalSeconds) || DEFAULTS.pollIntervalSeconds,
  requestTimeoutMs: Number(fileConfig.requestTimeoutMs) || DEFAULTS.requestTimeoutMs
};

if (env.SHANDY_SERVER_HOST) merged.server.host = env.SHANDY_SERVER_HOST.trim();
if (env.SHANDY_SERVER_PORT) merged.server.port = Number(env.SHANDY_SERVER_PORT);
if (env.SHANDY_UPDATE_REPO !== undefined) merged.updateRepo = env.SHANDY_UPDATE_REPO.trim() || null;
if (env.SHANDY_ANNOUNCEMENT_URL !== undefined) merged.announcementUrl = env.SHANDY_ANNOUNCEMENT_URL.trim() || null;
if (env.SHANDY_WHITELIST_URL !== undefined) merged.whitelistApiUrl = env.SHANDY_WHITELIST_URL.trim() || null;
if (env.SHANDY_DISCORD_CLIENT_ID !== undefined) merged.discord.clientId = env.SHANDY_DISCORD_CLIENT_ID.trim() || null;
if (env.SHANDY_DISCORD_IMAGE_KEY !== undefined) merged.discord.largeImageKey = env.SHANDY_DISCORD_IMAGE_KEY.trim() || 'shandy';

// Discord clientId mora biti numeriči snowflake (17–20 cifara); inače se RPC gasi.
const clientId = merged.discord.clientId == null ? null : String(merged.discord.clientId).trim();
merged.discord.clientId = clientId && /^\d{17,20}$/.test(clientId) ? clientId : null;
merged.discord.largeImageKey = typeof merged.discord.largeImageKey === 'string' && /^[a-z0-9_-]{1,64}$/i.test(merged.discord.largeImageKey)
  ? merged.discord.largeImageKey
  : 'shandy';

// Sanitizacija i validacija — launcher ne sme da otvori "fivem://injected".
if (merged.whitelistApiUrl != null) {
  const candidate = String(merged.whitelistApiUrl).trim();
  let valid = false;
  try {
    const parsed = new URL(candidate);
    valid = (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
  } catch { valid = false; }
  merged.whitelistApiUrl = valid ? String(merged.whitelistApiUrl).trim() : null;
}

const HOST_RE = /^[a-z0-9.-]+$/i;
const host = String(merged.server.host || '').trim();
if (!HOST_RE.test(host) || host.includes('..')) {
  throw new Error(`[shandy] Nevažeći server.host u konfiguraciji: "${host}"`);
}
const port = Number(merged.server.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`[shandy] Nevažeći server.port u konfiguraciji: "${merged.server.port}"`);
}
merged.server.host = host.toLowerCase();
merged.server.port = port;
merged.pollIntervalSeconds = Math.min(Math.max(merged.pollIntervalSeconds, 5), 300);
merged.requestTimeoutMs = Math.min(Math.max(merged.requestTimeoutMs, 1000), 15000);

const servers = Object.freeze(
  (parseServers(fileConfig.servers) || [{ name: merged.server.name, host: merged.server.host, port: merged.server.port }]).map((s) => Object.freeze({ name: s.name, host: s.host, port: s.port }))
);

const config = Object.freeze({
  ...merged,
  server: Object.freeze(merged.server),
  servers,
  links: Object.freeze(merged.links),
  discord: Object.freeze(merged.discord),
  connectUrl: `fivem://${merged.server.host}:${merged.server.port}`,
  baseUrl: `http://${merged.server.host}:${merged.server.port}`,
  configFile // null kada se koriste ugrađeni default-ovi
});

module.exports = config;
