'use strict';

/**
 * HTTP endpoint za launcher i FiveM webhook.
 *
 *   GET  /news.json       → javni JSON niz (samo isporučene objave; launcher format)
 *   GET  /healthz         → { ok: true, uptime, announcements }
 *   POST /webhook/fivem   → auto-objava iz FiveM skripta; auth: Bearer WEBHOOK_SECRET;
 *                           body: { event: "restart"|"start"|"maintenance", details? }
 *                           isključen (404) dok WEBHOOK_SECRET nije postavljen.
 *
 * Javne OBJAVE (bez tajnih podataka). Webhook traži shared secret — nikad ga ne commit-uj.
 */

const http = require('http');
const crypto = require('crypto');
const { toPublicItem } = require('./sanitize');

const CACHE_TTL_MS = 30_000;
const MAX_ITEMS = 10;
const WEBHOOK_MAX_BYTES = 8 * 1024;
const WEBHOOK_MIN_GAP_MS = 10_000;

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function createNewsServer({ store, logger = console.log, webhookSecret = '', onWebhook = null }) {
  let cache = { at: 0, payload: null, count: 0 };
  let lastWebhookAt = 0;

  const webhookEnabled = Boolean(webhookSecret) && typeof onWebhook === 'function';

  function buildPayload() {
    if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) return cache;
    const items = store.list(MAX_ITEMS).map(toPublicItem); // samo isporučene
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

  function readBody(req, limitBytes) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > limitBytes) {
          reject(new Error('payload too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function handleWebhook(req, res) {
    if (!webhookEnabled) {
      sendJson(res, 404, JSON.stringify({ error: 'not found' }));
      return;
    }
    const auth = String(req.headers['authorization'] || '');
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
    if (!token || !safeEqual(token, webhookSecret)) {
      sendJson(res, 401, JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    const gap = Date.now() - lastWebhookAt;
    if (gap < WEBHOOK_MIN_GAP_MS) {
      sendJson(res, 429, JSON.stringify({ error: `prerareq — sačekaj ${Math.ceil((WEBHOOK_MIN_GAP_MS - gap) / 1000)}s` }));
      return;
    }
    let raw;
    try {
      raw = await readBody(req, WEBHOOK_MAX_BYTES);
    } catch {
      sendJson(res, 413, JSON.stringify({ error: 'payload prevelik (max 8 KiB)' }));
      return;
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      sendJson(res, 400, JSON.stringify({ error: 'neispravan JSON' }));
      return;
    }
    let result;
    try {
      result = await onWebhook(payload);
    } catch (error) {
      logger('[bot/webhook] Handler greška:', error && error.message);
      sendJson(res, 500, JSON.stringify({ error: 'interna greška' }));
      return;
    }
    if (!result || result.ok !== true) {
      sendJson(res, 400, JSON.stringify({ error: (result && result.error) || 'zahtev odbijen' }));
      return;
    }
    lastWebhookAt = Date.now(); // prozor se troši SAMO na uspešnu objavu
    sendJson(res, 201, JSON.stringify({ ok: true, id: result.id }));
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');

    if (url.pathname === '/webhook/fivem') {
      if (req.method !== 'POST') {
        sendJson(res, 405, JSON.stringify({ error: 'method not allowed' }), { Allow: 'POST' });
        return;
      }
      handleWebhook(req, res).catch(() => sendJson(res, 500, JSON.stringify({ error: 'interna greška' })));
      return;
    }

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
    if (webhookEnabled) logger('[bot/http] FiveM webhook uključen na POST /webhook/fivem');
  });

  // Testovi i graceful shutdown: predmemorija se uvek može poništiti
  server.invalidateCache = () => {
    cache = { at: 0, payload: null, count: 0 };
  };

  return server;
}

module.exports = { createNewsServer, WEBHOOK_MIN_GAP_MS };
