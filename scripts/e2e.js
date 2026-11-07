'use strict';

/**
 * E2E test renderer-a protiv preview servera (bez Electron-a).
 * NIJE deo `npm test` — browser-i se preuzimaju posebno:
 *
 *   npm i -D playwright
 *   npx playwright install chromium
 *   npm run test:e2e
 *
 * Pokriva: title/CSP edge cases, hero flow, modali (otvori/Escape), POVEŽI SE toast u PREVIEW režimu,
 * obaveštenja lista popunjena. Nema mrežnih poziva — preview radi na 127.0.0.1.
 */

const { spawn } = require('child_process');
const path = require('path');

const PREVIEW_PORT = 8080;
const BASE = `http://127.0.0.1:${PREVIEW_PORT}`;

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('Playwright nije instaliran. Pokreni:');
    console.error('  npm i -D playwright && npx playwright install chromium && npm run test:e2e');
    process.exit(2);
  }

  const preview = spawn(process.execPath, [path.join(__dirname, 'preview.js')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PREVIEW_PORT) }
  });
  const waitForServer = (attempts = 50) => new Promise((resolve, reject) => {
    const tryOnce = (left) => {
      fetch(`${BASE}/`, { method: 'GET' })
        .then(() => resolve())
        .catch(() => {
          if (left <= 0) return reject(new Error('preview server nije pokrenut na 8080'));
          setTimeout(() => tryOnce(left - 1), 100);
        });
    };
    tryOnce(attempts);
  });

  const results = [];
  const check = (name, condition) => {
    results.push([name, Boolean(condition)]);
    console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}`);
  };

  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10_000 });

    check('title sadrži „Shandy“', (await page.title()).includes('Shandy'));
    check('CSP meta postoji', await page.locator('meta[http-equiv="Content-Security-Policy"]').count() >= 1);
    check('hero dugme POVEŽI SE vidljivo', await page.locator('#btn-connect').isVisible());
    check('obaveštenja lista ima stavke', (await page.locator('#news-list .news-item').count()) >= 1);

    // POVEŽI SE u PREVIEW režimu → toast objašnjenje
    await page.locator('#btn-connect').click();
    await page.locator('#toast', { hasText: /Electron/ }).waitFor({ timeout: 3_000 }).catch(() => {});
    check('klik na POVEŽI SE pokazuje toast (PREVIEW)', (await page.locator('#toast').textContent()).includes('Electron'));

    // Podešavanja: otvori → Escape → zatvoreno
    await page.locator('#btn-settings').click();
    check('Postavke modal otvoren', await page.locator('#modal-settings').isVisible());
    await page.keyboard.press('Escape');
    check('Escape zatvara Postavke', !(await page.locator('#modal-settings').isVisible()));

    // Info modal + dijagnostika vidljiva
    await page.locator('#btn-info').click();
    check('Info modal otvoren (whitelist/dijagnostika)', await page.locator('#modal-info').isVisible());
    check('Dijagnostika blok postoji', await page.locator('.diag-block').count() === 1);
  } catch (error) {
    console.error('E2E greška:', error.message);
    results.push(['izvršavanje', false]);
  } finally {
    if (browser) await browser.close();
    preview.kill('SIGTERM');
  }

  const failed = results.filter(([, ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} e2e provera prošlo`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
