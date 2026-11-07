'use strict';

/** Uživo status FiveM servera za /status komandu — čisti Node fetch, bez zavisnosti. */

async function fetchFiveMStatus(dynamicUrl, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(dynamicUrl, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return { online: false, error: `HTTP ${response.status}` };
    const data = await response.json();
    return {
      online: true,
      hostname: typeof data.hostname === 'string' ? data.hostname.slice(0, 120) : null,
      mapname: typeof data.mapname === 'string' ? data.mapname.slice(0, 120) : null,
      gametype: typeof data.gametype === 'string' ? data.gametype.slice(0, 120) : null,
      clients: Number.isFinite(Number(data.clients)) ? Math.floor(Number(data.clients)) : 0,
      maxClients: Number.isFinite(Number(data.sv_maxclients ?? data.maxClients)) ? Math.floor(Number(data.sv_maxclients ?? data.maxClients)) : 0
    };
  } catch (error) {
    return { online: false, error: error && error.name === 'AbortError' ? 'timeout' : (error && error.message) || 'fetch failed' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchFiveMStatus };
