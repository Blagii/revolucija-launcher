'use strict';

/**
 * Provera ažuriranja preko GitHub Releases API-ja.
 * Nikada ne baca grešku — svaki neuspeh javlja kao { ok: false, error }.
 */

const { fetchJson } = require('./http-json');

function parseVersion(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().replace(/^v/i, '').split('-')[0].split('+')[0];
  const parts = clean.split('.');
  if (parts.length < 2 || parts.length > 4) return null;
  const numbers = parts.map((p) => Number(p));
  if (numbers.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return numbers;
}

function compareVersions(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

async function checkForUpdate(updateRepo, currentVersion) {
  if (!updateRepo) {
    return { ok: true, disabled: true, available: false, current: currentVersion };
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(updateRepo)) {
    return { ok: false, error: `Nevažeći updateRepo: "${updateRepo}"`, available: false, current: currentVersion };
  }
  try {
    const latest = await fetchJson(`https://api.github.com/repos/${updateRepo}/releases/latest`, {
      timeout: 5000,
      headers: { Accept: 'application/vnd.github+json' }
    });
    const latestVersion = typeof latest.tag_name === 'string' ? latest.tag_name.replace(/^v/i, '') : null;
    const current = parseVersion(currentVersion);
    const remote = parseVersion(latestVersion);
    const available = current && remote ? compareVersions(remote, current) > 0 : false;
    return {
      ok: true,
      available,
      current: currentVersion,
      latest: latestVersion,
      url: typeof latest.html_url === 'string' ? latest.html_url : `https://github.com/${updateRepo}/releases`,
      notes: typeof latest.name === 'string' ? latest.name : null
    };
  } catch (error) {
    return {
      ok: false,
      available: false,
      current: currentVersion,
      error: error && error.message ? String(error.message).slice(0, 200) : 'Provera nije uspela'
    };
  }
}

module.exports = { checkForUpdate, parseVersion, compareVersions };
