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

console.log('Revolucija Launcher Bot — test\n');

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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revolucija-bot-test-'));
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

  await new Promise((resolve) => server.close(resolve));

  console.log(`\n${passed} provera prošlo, ${failed} palo`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error('TEST FAIL:', error);
  process.exit(1);
});
