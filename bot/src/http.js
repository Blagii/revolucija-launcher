'use strict';

/**
 * HTTP endpoint za launcher — čita iz store-a, kešira 30 s.
 *
 *   GET /news.json   → javni JSON niz (format koji launcher očekuje)
 *   GET /healthz     → { ok: true, uptime, announcements }
 *
 * Javno dostupne OBJAVE (bez tajnih podataka), pa CORS može ostati otvoren.
 */

const http = require('http');
const { toPublicItem } = require('./sanitize');

const CACHE_TTL_MS = 30_000;
const MAX_ITEMS = 10;

function createNewsServer({ store, logger = console.log }) {
  let cache = { at: 0, payload: null, count: 0 };

  function buildPayload() {
    if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) return cache;
    const items = store.list(MAX_ITEMS).map(toPublicItem);
    cache = {
      at: Date.now(),
      payload: JSON.stringify(items),
      count: items.length
    };
    return cache;
  }

  function sendJson(res, status, body, extraHeaders = {}) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    });
    res.end(body);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method !== 'GET') {
      sendJson(res, 405, JSON.stringify({ error: 'method not allowed' }), { Allow: 'GET' });
      return;
    }
    if (url.pathname === '/healthz') {
      sendJson(res, 200, JSON.stringify({ ok: true, uptime: Math.floor(process.uptime()), announcements: buildPayload().count }));
      return;
    }
    if (url.pathname === '/news.json') {
      sendJson(res, 200, buildPayload().payload);
      return;
    }
    sendJson(res, 404, JSON.stringify({ error: 'not found. probaj /news.json ili /healthz' }));
  });

  server.on('listening', () => {
    const address = server.address();
    logger(`[bot/http] Slušam na ${address.address}:${address.port} — launcher čita /news.json`);
  });

  // Testovi i graceful shutdown: predmemorija se uvek može poništiti
  server.invalidateCache = () => {
    cache = { at: 0, payload: null, count: 0 };
  };

  return server;
}

module.exports = { createNewsServer };
