'use strict';

/**
 * Test bota BEZ Discord-a: sanitarija, store (round-trip sa diska) i HTTP ugovor za launcher.
 * Pokreće se: npm test  (u direktorijumu bot/)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('node:assert');

const { cleanTag, cleanTitle, cleanText, stripMentions, toPublicItem, ALLOWED_TAGS } = require('./src/sanitize');
const { createStore, MAX_STORED } = require('./src/store');
const { createNewsServer } = require('./src/http');
const { parseScheduleTime } = require('./src/schedule');
const { createScheduler } = require('./src/announce');
const { createWhitelistVerifier } = require('./src/whitelist');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${label} — ${error.message}`);
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${label} — ${error.message}`);
  }
}

console.log('Shandy Launcher Bot — test\n');

/* ── sanitize ─────────────────────────────────────────── */

check('stripMentions uklanja @everyone/@here i <@id> mentions', () => {
  assert.strictEqual(stripMentions('Pozdrav @everyone, vidi <@123456789012345678>!'), 'Pozdrav , vidi !');
  assert.strictEqual(stripMentions('<@&987654321> role ping'), 'role ping');
});

check('cleanTag prihvata samo poznate tag-ove', () => {
  assert.strictEqual(cleanTag('event'), 'EVENT');
  assert.strictEqual(cleanTag('IZMENA'), 'IZMENA');
  assert.strictEqual(cleanTag('nesto-drugo'), 'NAJAVA');
  assert.strictEqual(cleanTag(''), 'NAJAVA');
});

check('cleanTitle/cleanText poštuju granice dužine', () => {
  assert.ok(cleanTitle('x'.repeat(500)).length <= 140);
  assert.ok(cleanText('y'.repeat(1000)).length <= 500);
});

check('toPublicItem vraća isključivo launcher polja', () => {
  const pub = toPublicItem({ id: 7, date: '2026-11-07', tag: 'EVENT', title: 't', text: 'x', authorId: 'secret', createdAt: 'whatever' });
  assert.deepStrictEqual(Object.keys(pub).sort(), ['date', 'tag', 'text', 'title']);
});

check('svi ALLOWED_TAGS su launcher-kompatibilni', () => {
  assert.deepStrictEqual([...ALLOWED_TAGS], ['NAJAVA', 'EVENT', 'IZMENA', 'INFO']);
});

/* ── store ────────────────────────────────────────────── */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shandy-bot-test-'));
const dataFile = path.join(tmpDir, 'announcements.json');

check('store: add/list/remove round-trip sa diska', () => {
  const store = createStore(dataFile);
  const a = store.add({ tag: 'EVENT', title: 'Prva', text: 'tekst 1', authorId: '1', authorTag: 'dev' });
  store.add({ tag: 'NAJAVA', title: 'Druga', text: 'tekst 2' });
  assert.strictEqual(a.id, 1);
  const reloaded = createStore(dataFile);
  const list = reloaded.list(10);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].title, 'Druga'); // najnovija prva
  assert.strictEqual(list[1].title, 'Prva');
  assert.strictEqual(reloaded.remove(a.id), true);
  assert.strictEqual(reloaded.remove(a.id), false);
  assert.strictEqual(reloaded.list(10).length, 1);
});

check('store: nextId se uvek povećava (i posle pražnjenja)', () => {
  const store = createStore(dataFile);
  const added = store.add({ tag: 'INFO', title: 'Treća', text: 'tekst 3' });
  assert.strictEqual(added.id, 3);
});

check(`store: kapa se na ${MAX_STORED} objava (baca najstarije)`, () => {
  const bigFile = path.join(tmpDir, 'big.json');
  const store = createStore(bigFile);
  for (let i = 0; i < MAX_STORED + 5; i += 1) {
    store.add({ tag: 'INFO', title: `Objava broj ${i}`, text: 'x' });
  }
  const list = store.list(1000);
  assert.strictEqual(list.length, MAX_STORED);
  assert.ok(list.some((item) => item.title === `Objava broj ${MAX_STORED + 4}`));
  assert.ok(!list.some((item) => item.title === 'Objava broj 0'));
});

check('store: prazan/neispravan fajl ne ruši učitavanje', () => {
  const broken = path.join(tmpDir, 'broken.json');
  fs.writeFileSync(broken, '{ not json');
  const store = createStore(broken);
  assert.deepStrictEqual(store.list(), []);
  store.add({ tag: 'NAJAVA', title: 'ok', text: 'ok' });
  assert.strictEqual(store.list().length, 1);
});

/* ── http (ugovor za launcher) ────────────────────────── */

function httpRequest(server, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({ host: '127.0.0.1', port: address.port, path: pathname, method }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const store = createStore(dataFile);
  store.add({ tag: 'EVENT', title: 'Sudnica', text: 'Subota 21h' });
  store.add({ tag: 'IZMENA', title: 'Pravila', text: 'Nova whitelist pravila' });

  const server = createNewsServer({ store, logger: () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  await checkAsync('/news.json → 200, JSON niz u launcher formatu', async () => {
    const res = await httpRequest(server, '/news.json');
    assert.strictEqual(res.status, 200);
    assert.match(res.headers['content-type'] || '', /application\/json/);
    assert.strictEqual(res.headers['cache-control'], 'no-store');
    const items = JSON.parse(res.body);
    assert.ok(Array.isArray(items) && items.length >= 1);
    for (const item of items) {
      assert.deepStrictEqual(Object.keys(item).sort(), ['date', 'tag', 'text', 'title']);
      assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(item.title.length <= 140 && item.text.length <= 500);
    }
  });

  await checkAsync('/healthz → 200 { ok: true }', async () => {
    const res = await httpRequest(server, '/healthz');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(JSON.parse(res.body).ok, true);
  });

  await checkAsync('nepoznata ruta → 404', async () => {
    const res = await httpRequest(server, '/nepostoji');
    assert.strictEqual(res.status, 404);
  });

  await checkAsync('POST /news.json → 405', async () => {
    const res = await httpRequest(server, '/news.json', 'POST');
    assert.strictEqual(res.status, 405);
  });

  async function httpRequestRaw(port, pathName, method, body, headers) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: pathName, method,
        headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.end(body);
    });
  }

  // ---------- Zakazane objave ----------
  check('parseScheduleTime: HH:MM u budućnosti → danas', () => {
    const now = new Date(2026, 10, 7, 12, 0, 0).getTime();
    const parsed = parseScheduleTime('18:30', now);
    assert.ok(parsed.ok);
    const d = new Date(parsed.timestamp);
    assert.strictEqual(d.getHours(), 18);
    assert.strictEqual(d.getMinutes(), 30);
    assert.strictEqual(d.getDate(), 7);
  });

  check('parseScheduleTime: HH:MM u prošlosti → sutra', () => {
    const now = new Date(2026, 10, 7, 20, 0, 0).getTime();
    const parsed = parseScheduleTime('18:30', now);
    assert.ok(parsed.ok);
    assert.strictEqual(new Date(parsed.timestamp).getDate(), 8);
  });

  check('parseScheduleTime: YYYY-MM-DD HH:MM i greške', () => {
    const now = new Date(2026, 10, 7, 12, 0, 0).getTime();
    const ok = parseScheduleTime('2026-11-10 09:00', now);
    assert.ok(ok.ok);
    assert.ok(parseScheduleTime('2026-11-10 09:00', now).timestamp > now);
    assert.strictEqual(parseScheduleTime('bezveze', now).ok, false);
    assert.strictEqual(parseScheduleTime('25:00', now).ok, false);
    assert.strictEqual(parseScheduleTime('2026-11-01 09:00', now).ok, false); // prošlost
  });

  check('store: zakazana objava NIJE u /news.json dok ne dospe; jeste posle isporuke', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-sched-'));
    const store = createStore(path.join(dir, 'ann.json'));
    const future = Date.now() + 60_000;
    const item = store.add({ tag: 'INFO', title: 'Zakazano', text: 'Dospeva kasnije.', scheduledAt: future });
    assert.strictEqual(item.delivered, false);
    assert.strictEqual(store.list(10).length, 0, 'zakazana ne sme biti u list()');
    assert.strictEqual(store.list(10, { includeScheduled: true }).length, 1);
    assert.strictEqual(store.dueScheduled(Date.now()).length, 0, 'još nije dospela');
    const due = store.dueScheduled(future + 1000);
    assert.strictEqual(due.length, 1, 'posle roka dospeva');
    store.markDelivered(due[0].id);
    assert.strictEqual(store.list(10).length, 1, 'isporučena je vidljiva');
    assert.strictEqual(store.dueScheduled(future + 1000).length, 0);
  });

  check('store: markDelivered je idempotentan (ne ruši retry)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-sched2-'));
    const store = createStore(path.join(dir, 'ann.json'));
    const future = Date.now() + 60_000;
    const item = store.add({ tag: 'INFO', title: 'Zakazano', text: 'X', scheduledAt: future });
    store.markDelivered(item.id);
    const again = store.markDelivered(item.id);
    assert.ok(again);
    assert.strictEqual(store.list(10).length, 1);
  });

  await checkAsync('scheduler: deliverDue isporučuje dospele i poziva onDelivered', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-sched3-'));
    const store = createStore(path.join(dir, 'ann.json'));
    store.add({ tag: 'EVENT', title: 'Dospeva sad', text: 'X', scheduledAt: Date.now() + 200 });
    const sent = [];
    const fakeClient = {
      channels: {
        fetch: async () => ({ isTextBased: () => true, send: async (msg) => { sent.push(msg); } })
      }
    };
    let notified = 0;
    const scheduler = createScheduler({
      store,
      getClient: () => fakeClient,
      channelId: '123',
      intervalMs: 10_000,
      onDelivered: (n) => { notified += n; },
      logger: () => {}
    });
    await new Promise((r) => setTimeout(r, 250)); // neka scheduledAt prođe
    const delivered = await scheduler.deliverDue(Date.now());
    assert.strictEqual(delivered, 1);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(notified, 1);
    assert.strictEqual(store.list(10).length, 1);
  });


  // ---------- Whitelist ----------
  await checkAsync('whitelist verifier: 401 → odbijen; member+role → true; bez role → false', async () => {
    const fetchStub = async (url, opts) => {
      if (url.endsWith('/users/@me')) {
        if (opts.headers.Authorization === 'Bearer good-token-1234567890abc') {
          return { status: 200, ok: true, json: async () => ({ id: '42', username: 'igrac', global_name: null }) };
        }
        return { status: 401, ok: false, json: async () => ({}) };
      }
      if (url.includes('/guilds/g1/members/42')) {
        if (opts.headers.Authorization === 'Bot bot-token') {
          return { status: 200, ok: true, json: async () => ({ roles: ['r-other', 'r-whitelist'] }) };
        }
        return { status: 403, ok: false, json: async () => ({}) };
      }
      return { status: 500, ok: false, json: async () => ({}) };
    };
    const verify = createWhitelistVerifier({ botToken: 'bot-token', guildId: 'g1', whitelistRoleId: 'r-whitelist', fetchImpl: fetchStub });
    const bad = await verify('bad-token-0000000000000000000');
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(bad.status, 401);
    const good = await verify('good-token-1234567890abc');
    assert.strictEqual(good.ok, true);
    assert.strictEqual(good.whitelisted, true);
    assert.strictEqual(good.user.username, 'igrac');

    const verifyNoRole = createWhitelistVerifier({ botToken: 'bot-token', guildId: 'g1', whitelistRoleId: 'r-missing', fetchImpl: fetchStub });
    const noRole = await verifyNoRole('good-token-1234567890abc');
    assert.strictEqual(noRole.whitelisted, false);

    const verifyMembership = createWhitelistVerifier({ botToken: 'bot-token', guildId: 'g1', fetchImpl: fetchStub });
    const membership = await verifyMembership('good-token-1234567890abc');
    assert.strictEqual(membership.whitelisted, true);
  });

  await checkAsync('whitelist verifier: 404 member → whitelisted:false; bez guildId → 503', async () => {
    const fetchStub = async (url) => {
      if (url.endsWith('/users/@me')) return { status: 200, ok: true, json: async () => ({ id: '7', username: 'gost' }) };
      return { status: 404, ok: false, json: async () => ({}) };
    };
    const verify = createWhitelistVerifier({ botToken: 'b', guildId: 'g1', fetchImpl: fetchStub });
    const res = await verify('token-12345678901234567890');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.whitelisted, false);

    const verifyNoGuild = createWhitelistVerifier({ botToken: 'b', guildId: '', fetchImpl: fetchStub });
    const res2 = await verifyNoGuild('token-12345678901234567890');
    assert.strictEqual(res2.status, 503);
  });

  await checkAsync('whitelist HTTP: disabled → 404; stub → 200; loš body → 400', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-wl-'));
    const store = createStore(path.join(dir, 'ann.json'));
    // ugašen
    const off = createNewsServer({ store, logger: () => {} });
    await new Promise((r) => off.listen(0, '127.0.0.1', r));
    const offPort = off.address().port;
    const r404 = await httpRequestRaw(offPort, '/whitelist/verify', 'POST', '{"access_token":"x".repeat(30)}', {});
    assert.strictEqual(r404.status, 404);
    await new Promise((r) => off.close(r));
    // uključen sa stub-om
    const on = createNewsServer({
      store, logger: () => {},
      whitelistVerify: async (token) => token.startsWith('good')
        ? { ok: true, whitelisted: true, user: { username: 'igrac', globalName: null } }
        : { ok: false, status: 401, error: 'odbijen' }
    });
    await new Promise((r) => on.listen(0, '127.0.0.1', r));
    const onPort = on.address().port;
    const r400 = await httpRequestRaw(onPort, '/whitelist/verify', 'POST', '{"nope":1}', {});
    assert.strictEqual(r400.status, 400);
    const okRes = await httpRequestRaw(onPort, '/whitelist/verify', 'POST', JSON.stringify({ access_token: 'good-token-1234567890abcdef' }), {});
    assert.strictEqual(okRes.status, 200);
    assert.strictEqual(JSON.parse(okRes.body).whitelisted, true);
    await new Promise((r) => on.close(r));
  });

  await checkAsync('whitelist HTTP: rate limit — 20 ok, 21. → 429', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-wl2-'));
    const store = createStore(path.join(dir, 'ann.json'));
    const on = createNewsServer({
      store, logger: () => {},
      whitelistVerify: async () => ({ ok: true, whitelisted: true, user: { username: 'x' } })
    });
    await new Promise((r) => on.listen(0, '127.0.0.1', r));
    const port = on.address().port;
    const body = JSON.stringify({ access_token: 'good-token-1234567890abcdef' });
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      // pomeramo IP kroz X-Forwarded-For? Ne — koristimo razlicite socket adrese nije moguće;
      // limiter je po socket address pa je jednako za sve zahteve — 21. mora biti 429.
      const res = await httpRequestRaw(port, '/whitelist/verify', 'POST', body, {});
      last = res.status;
    }
    assert.strictEqual(last, 429);
    await new Promise((r) => on.close(r));
  });

  // ---------- Webhook ----------
  await checkAsync('webhook: bez secret-a → 404 (ugašen)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-wh-'));
    const store = createStore(path.join(dir, 'ann.json'));
    const server = createNewsServer({ store, logger: () => {} });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const res = await httpRequestRaw(port, '/webhook/fivem', 'POST', '{"event":"restart"}', {});
    assert.strictEqual(res.status, 404);
    await new Promise((r) => server.close(r));
  });

  await checkAsync('webhook: pogrešan token → 401; pravi event → 201 (objavljeno)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-wh2-'));
    const store = createStore(path.join(dir, 'ann.json'));
    const added = [];
    const server = createNewsServer({
      store,
      logger: () => {},
      webhookSecret: 's3cret',
      onWebhook: async (payload) => {
        if (payload.event !== 'restart') return { ok: false, error: 'nepoznat event' };
        const item = store.add({ tag: 'IZMENA', title: 'Server se restartuje', text: payload.details || 'Restart.' });
        added.push(item.id);
        return { ok: true, id: item.id };
      }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const bad = await httpRequestRaw(port, '/webhook/fivem', 'POST', '{"event":"restart"}', { authorization: 'Bearer wrong' });
    assert.strictEqual(bad.status, 401);

    const badEvent = await httpRequestRaw(port, '/webhook/fivem', 'POST', '{"event":"hack"}', { authorization: 'Bearer s3cret' });
    assert.strictEqual(badEvent.status, 400);

    const good = await httpRequestRaw(port, '/webhook/fivem', 'POST', '{"event":"restart","details":"Restart zbog update-a"}', { authorization: 'Bearer s3cret' });
    assert.strictEqual(good.status, 201);
    assert.deepStrictEqual(JSON.parse(good.body).id, added[0]);
    assert.strictEqual(store.list(10).length, 1, 'objavljeno u launcher store');
    await new Promise((r) => server.close(r));
  });

  await new Promise((resolve) => server.close(resolve));

  console.log(`\n${passed} provera prošlo, ${failed} palo`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error('TEST FAIL:', error);
  process.exit(1);
});
