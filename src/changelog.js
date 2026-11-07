'use strict';

/**
 * "Šta je novo" — poslednje objavljeno izdanje sa GitHub Releases (read-only, bez auth-a).
 */

const { fetchJson } = require('./http-json');

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

async function getLatestRelease(updateRepo) {
  if (!updateRepo || !REPO_RE.test(updateRepo)) {
    return { ok: false, error: 'updateRepo nije postavljen ili je nevažeći.' };
  }
  try {
    const release = await fetchJson(`https://api.github.com/repos/${updateRepo}/releases/latest`, {
      timeout: 6000,
      headers: { Accept: 'application/vnd.github+json' }
    });
    return {
      ok: true,
      version: typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/i, '') : null,
      name: typeof release.name === 'string' && release.name.trim() ? release.name.trim().slice(0, 140) : null,
      body: (typeof release.body === 'string' ? release.body : '').slice(0, 4000),
      url: typeof release.html_url === 'string' ? release.html_url : `https://github.com/${updateRepo}/releases/latest`,
      publishedAt: typeof release.published_at === 'string' ? release.published_at : null
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? String(error.message).slice(0, 300) : 'Zahtev nije uspeo'
    };
  }
}

module.exports = { getLatestRelease };
