'use strict';

/**
 * Status FiveM servera: dynamic.json (obavezno) + info.json (opciono).
 * Rezultat se kešira 5 sekundi da renderer ne ispali više zahteva odjednom.
 */

const { fetchJson } = require('./http-json');

const CACHE_TTL_MS = 5000;
let cache = { at: 0, value: null };

function asText(value, fallback = null) {
  const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
  return text ? text.slice(0, 200) : fallback;
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

async function getServerStatus(config) {
  const now = Date.now();
  if (cache.value && now - cache.at < CACHE_TTL_MS) return cache.value;

  const started = Date.now();
  const timeout = config.requestTimeoutMs;
  try {
    const dynamic = await fetchJson(`${config.baseUrl}/dynamic.json`, { timeout });
    let info = null;
    try {
      info = await fetchJson(`${config.baseUrl}/info.json`, { timeout });
    } catch {
      info = null; // info.json nije obavezan — server i dalje "radi"
    }

    const value = {
      online: true,
      hostname: asText(dynamic.hostname, config.server.name),
      mapname: asText(dynamic.mapname),
      gametype: asText(dynamic.gametype),
      clients: asInt(dynamic.clients, 0),
      maxClients: asInt(dynamic.sv_maxclients ?? dynamic.maxClients, 0),
      resources: info && Array.isArray(info.resources) ? info.resources.length : null,
      baseUrl: config.baseUrl,
      connectUrl: config.connectUrl,
      latencyMs: Date.now() - started,
      fetchedAt: new Date().toISOString()
    };
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    const value = {
      online: false,
      error: error && error.message ? String(error.message).slice(0, 200) : 'Server nije dostupan',
      baseUrl: config.baseUrl,
      connectUrl: config.connectUrl,
      latencyMs: Date.now() - started,
      fetchedAt: new Date().toISOString()
    };
    cache = { at: Date.now(), value };
    return value;
  }
}

// Koristi se samo u testovima / smoke-testu.
function __clearCache() {
  cache = { at: 0, value: null };
}

module.exports = { getServerStatus, __clearCache };
