'use strict';

/**
 * Smoke-test: provera integriteta projekta bez pokretanja Electron-a.
 *   - svi fajlovi postoje
 *   - package.json je validan i main pokazuje na postojeći fajl
 *   - sintaksa svih JS fajlova prolazi (node --check)
 *   - index.html sadrži CSP i NEMA spoljnih CDN skripti/stilova
 *   - IPC kanali u preload-u imaju odgovarajuće handlere u main.js
 *   - svi id-jevi koji renderer koristi postoje u index.html
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let checks = 0;

function check(label, fn) {
  checks += 1;
  try {
    fn();
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${label} — ${error.message}`);
  }
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('Shandy Launcher — smoke test\n');

const requiredFiles = [
  'package.json', 'README.md', 'LICENSE', '.gitignore', 'config.example.json',
  'src/main.js', 'src/preload.js', 'src/config.js', 'src/fivem.js', 'src/http-json.js',
  'src/settings.js', 'src/news.js', 'src/update.js', 'src/history.js', 'src/changelog.js',
  'src/fivem-install.js', 'src/discord-rpc.js',
  'src/renderer/index.html', 'src/renderer/styles.css', 'src/renderer/renderer.js',
  'src/renderer/favicon.ico', 'src/renderer/assets/revlogo.png', 'src/renderer/assets/bg.jpg',
  'build/icon.png', 'build/icon.ico'
];

for (const rel of requiredFiles) {
  check(`fajl postoji: ${rel}`, () => {
    assert(fs.existsSync(path.join(ROOT, rel)), 'ne postoji');
    assert(fs.statSync(path.join(ROOT, rel)).size > 0, 'prazan je');
  });
}

check('package.json: validan, main postoji, semver', () => {
  const pkg = JSON.parse(read('package.json'));
  assert(typeof pkg.version === 'string' && /^\d+\.\d+\.\d+$/.test(pkg.version), 'version nije semver');
  assert(fs.existsSync(path.join(ROOT, pkg.main)), `main "${pkg.main}" ne postoji`);
});

check('package.json: napredne zavisnosti prisutne', () => {
  const pkg = JSON.parse(read('package.json'));
  const deps = Object.keys(pkg.dependencies || {});
  assert(deps.includes('electron-updater'), 'electron-updater nije u dependencies');
  assert(deps.includes('@xhayper/discord-rpc'), '@xhayper/discord-rpc nije u dependencies');
  assert(pkg.build && pkg.build.publish && pkg.build.publish[0] && pkg.build.publish[0].provider === 'github', 'build.publish nije GitHub');
});

check('config.example.json: validan JSON sa serverskim sekcijama', () => {
  const cfg = JSON.parse(read('config.example.json'));
  assert(cfg.server && typeof cfg.server.host === 'string', 'server.host fali');
  assert(cfg.discord && typeof cfg.discord === 'object', 'discord sekcija fali');
});

const jsFiles = [
  'src/main.js', 'src/preload.js', 'src/config.js', 'src/fivem.js', 'src/http-json.js',
  'src/settings.js', 'src/news.js', 'src/update.js', 'src/history.js', 'src/changelog.js',
  'src/fivem-install.js', 'src/discord-rpc.js', 'src/renderer/renderer.js',
  'scripts/preview.js', 'scripts/smoke-test.js'
];
for (const rel of jsFiles) {
  check(`sintaksa OK: ${rel}`, () => {
    execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' });
  });
}

check('index.html: CSP meta prisutan', () => {
  const html = read('src/renderer/index.html');
  assert(/Content-Security-Policy/i.test(html), 'nema CSP meta taga');
  assert(/default-src 'self'/.test(html), 'CSP default-src nije self');
});

check('index.html: nema spoljnih skripti/stilova (CDN)', () => {
  const html = read('src/renderer/index.html');
  const external = html.match(/<(script|link)[^>]+(src|href)=["']https?:\/\/[^"']+["']/gi) || [];
  assert(external.length === 0, `pronađeno: ${external.join(', ')}`);
});

check('renderer: nema require()/process (izolacija)', () => {
  const js = read('src/renderer/renderer.js');
  assert(!/\brequire\s*\(/.test(js), 'renderer poziva require()');
  assert(!/\bprocess\./.test(js), 'renderer koristi process');
});

check('preload ↔ main: svi IPC kanali imaju handler', () => {
  const preload = read('src/preload.js');
  const main = read('src/main.js');
  const used = new Set([...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]));
  const handled = new Set([...main.matchAll(/handle\('([^']+)'/g)].map((m) => m[1]));
  assert(used.size > 0, 'preload ne koristi nijedan kanal');
  for (const channel of used) assert(handled.has(channel), `kanal "${channel}" nema handler u main.js`);
});

check('renderer: svi korišćeni id-jevi postoje u HTML-u', () => {
  const html = read('src/renderer/index.html');
  const js = read('src/renderer/renderer.js');
  const ids = new Set([...js.matchAll(/\$\('#([a-z0-9-]+)'\)/gi)].map((m) => m[1]));
  for (const id of ids) assert(html.includes(`id="${id}"`), `id="${id}" se koristi u JS-u ali ne postoji u HTML-u`);
});

check('index.html: bez inline <script> blokova', () => {
  const html = read('src/renderer/index.html');
  const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>/gi) || [];
  assert(inline.length === 0, `pronađeni inline script tagovi: ${inline.length}`);
});

console.log(`\n${checks} provera, ${failures} grešaka`);
process.exit(failures === 0 ? 0 : 1);
