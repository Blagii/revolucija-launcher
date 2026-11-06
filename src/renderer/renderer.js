'use strict';

/* ═══════════════════════════════════════════════════════════════
   Revolucija Roleplay — Launcher 2.0 (renderer)
   Radi u dva režima:
     1. Electron — kroz window.revolucija preload bridge
     2. Browser preview (npm run preview) — demo podaci, bez IPC-a
   ═══════════════════════════════════════════════════════════════ */

const api = window.revolucija || null;
const PREVIEW = !api;

const DEMO_LINKS = {
  discord: 'https://discord.gg/revolucija',
  instagram: 'https://instagram.com/revolucijaroleplay',
  youtube: 'https://www.youtube.com/'
};

const DEMO_NEWS = [
  { date: '2026-11-02', tag: 'EVENT', title: 'Sudnica subotom u 21:00', text: 'Svake subote u 21:00 h odigrava se javna parnica. Prijave kod sudije na Discord-u u #prijave.' },
  { date: '2026-10-21', tag: 'IZMENA', title: 'Pravila whiteliste su ažurirana', text: 'Sastav aplikacije je obavezan; intervju se zakazuje automatski kroz Discord bot.' },
  { date: '2026-10-05', tag: 'NAJAVA', title: 'Restart ekonomije — sezona 3', text: 'Uloge, plate i firme se resetuju. Prijave za direktore firmi od 15. novembra.' }
];

const state = {
  appInfo: null,
  links: { ...DEMO_LINKS },
  settings: { autoUpdateCheck: true, reducedMotion: false },
  latestStatus: null,
  pollTimer: null,
  updateInfo: null,
  toastTimer: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

/* ── Toast ─────────────────────────────────────────────── */

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toast.hidden = true; }, 3600);
}

/* ── Klipbord ──────────────────────────────────────────── */

async function copyText(text) {
  try {
    if (api && typeof api.copyToClipboard === 'function') {
      const result = await api.copyToClipboard(text);
      return Boolean(result && result.ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ── Linkovi (https kroz main proces / browser preview) ── */

async function openLink(url) {
  if (!url) return;
  if (api) {
    const result = await api.openLink(url);
    if (!result || !result.ok) showToast(result && result.error ? result.error : 'Link nije otvoren.');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/* ── Status servera ────────────────────────────────────── */

async function fetchStatus() {
  if (api) return api.getStatus();
  // Demo podaci za preview
  await new Promise((resolve) => setTimeout(resolve, 420));
  const clients = 38 + Math.floor(Math.random() * 8);
  return {
    online: true,
    hostname: 'Revolucija Roleplay | Sezona 3',
    mapname: 'Los Santos',
    gametype: 'Roleplay',
    clients,
    maxClients: 64,
    latencyMs: 16 + Math.floor(Math.random() * 22),
    baseUrl: 'http://89.116.184.110:30120',
    connectUrl: 'fivem://89.116.184.110:30120',
    fetchedAt: new Date().toISOString()
  };
}

function setStatusPill(kind, text) {
  const pill = $('#server-status-pill');
  pill.className = `status-pill status-${kind}`;
  $('#server-status-text').textContent = text;
}

function renderStatus(status) {
  state.latestStatus = status;
  const playersEl = $('#players-count');
  const errorBox = $('#status-error');

  if (!status || status.online === false) {
    setStatusPill('offline', 'OFLAJN');
    playersEl.textContent = '– / –';
    $('#capacity-fill').style.width = '0%';
    $('#server-latency').textContent = status && Number.isFinite(status.latencyMs) ? `${status.latencyMs} ms` : '—';
    $('#status-error-text').textContent = `Server trenutno nije dostupan${status && status.error ? ` (${status.error})` : ''}. Pokušaj ponovo kasnije.`;
    errorBox.hidden = false;
    return;
  }

  setStatusPill('online', 'ONLINE');
  const clients = Number.isFinite(status.clients) ? status.clients : 0;
  const maxClients = Number.isFinite(status.maxClients) && status.maxClients > 0 ? status.maxClients : 0;
  playersEl.textContent = maxClients ? `${clients} / ${maxClients}` : `${clients}`;
  $('#capacity-fill').style.width = maxClients ? `${Math.min(100, (clients / maxClients) * 100)}%` : '0%';
  $('#server-latency').textContent = Number.isFinite(status.latencyMs) ? `${status.latencyMs} ms` : '— ms';
  $('#server-host-text').textContent = (status.baseUrl || '').replace(/^https?:\/\//, '');
  $('#info-map').textContent = [status.mapname, status.gametype].filter(Boolean).join(' · ') || 'Los Santos · Roleplay';
  errorBox.hidden = true;
}

async function refreshStatus({ silent = false } = {}) {
  if (!silent) setStatusPill('unknown', 'POVEZIVANJE…');
  try {
    const status = await fetchStatus();
    renderStatus(status);
  } catch (error) {
    renderStatus({ online: false, error: error && error.message ? error.message : 'nepoznata greška' });
  }
}

function startPolling(intervalSeconds) {
  clearInterval(state.pollTimer);
  const every = Math.max(5, Number(intervalSeconds) || 15) * 1000;
  state.pollTimer = setInterval(() => refreshStatus({ silent: true }), every);
}

/* ── Obaveštenja ───────────────────────────────────────── */

const TAG_CLASS = { EVENT: 'tag-event', IZMENA: 'tag-izmena', NAJAVA: '' };

function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return match ? `${match[3]}.${match[2]}.${match[1]}.` : String(iso || '');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderNews(items, source) {
  const list = $('#news-list');
  const safe = Array.isArray(items) ? items : [];
  if (safe.length === 0) {
    list.innerHTML = '<li class="news-item"><div class="news-title">Nema obaveštenja.</div></li>';
  } else {
    list.innerHTML = safe.map((item) => `
      <li class="news-item">
        <div class="news-meta">
          <span class="news-tag ${TAG_CLASS[item.tag] || ''}">${escapeHtml(item.tag)}</span>
          <span class="news-date">${escapeHtml(formatDate(item.date))}</span>
        </div>
        <div class="news-title">${escapeHtml(item.title)}</div>
        <div class="news-text">${escapeHtml(item.text)}</div>
      </li>`).join('');
  }
  $('#news-source').textContent = source === 'remote' ? 'Izvor: server /config' : 'Izvor: ugrađene objave';

  // Ticker — dupliraj sadržaj za besprekidnu petlju
  const tickerText = safe.slice(0, 4).map((item) => `${item.title}`).join('   •   ');
  const track = $('#ticker-track');
  if (tickerText) {
    track.innerHTML = `<span>${escapeHtml(tickerText)}</span><span>${escapeHtml(tickerText)}</span>`;
  }
}

async function loadNews() {
  if (api) {
    try {
      const result = await api.getNews();
      renderNews(result && result.items, result && result.source);
      return;
    } catch {
      /* padamo na demo */
    }
  }
  renderNews(DEMO_NEWS, 'local');
}

/* ── Postavke i reduced motion ─────────────────────────── */

function applyReducedMotion(enabled) {
  document.documentElement.classList.toggle('reduced-motion', Boolean(enabled));
}

async function loadSettings() {
  if (!api) {
    state.settings = { autoUpdateCheck: true, reducedMotion: false };
  } else {
    try {
      state.settings = await api.getSettings();
    } catch {
      state.settings = { autoUpdateCheck: true, reducedMotion: false };
    }
  }
  $('#setting-autoupdate').checked = Boolean(state.settings.autoUpdateCheck);
  $('#setting-reduced-motion').checked = Boolean(state.settings.reducedMotion);
  applyReducedMotion(state.settings.reducedMotion);
}

async function patchSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  if (api) {
    try {
      state.settings = await api.setSettings(patch);
    } catch {
      showToast('Postavke nisu snimljene.');
    }
  }
  applyReducedMotion(state.settings.reducedMotion);
}

/* ── Ažuriranja ────────────────────────────────────────── */

function showUpdateBanner(info) {
  if (!info || !info.available) return;
  state.updateInfo = info;
  $('#update-banner-text').textContent = `Dostupna je nova verzija v${info.latest} (trenutno v${info.current}).`;
  $('#update-banner').hidden = false;
}

async function manualUpdateCheck() {
  const target = $('#update-check-result');
  target.textContent = 'Proveravam…';
  if (!api) {
    target.textContent = 'Nedostupno u preview režimu.';
    return;
  }
  const result = await api.checkUpdates(true);
  if (!result || result.ok === false) {
    target.textContent = `Greška: ${result && result.error ? result.error : 'provera nije uspela'}`;
    return;
  }
  if (result.available) {
    target.textContent = `Dostupna v${result.latest} — klikni "Preuzmi".`;
    showUpdateBanner(result);
  } else {
    target.textContent = `Sveže je — aktuelna verzija v${result.current}.`;
  }
}

/* ── Modali ────────────────────────────────────────────── */

function openModal(id) {
  const modal = $(id);
  modal.hidden = false;
  const focusable = modal.querySelector('button, input, [tabindex]');
  if (focusable) focusable.focus();
}

function closeModal(modal) {
  if (modal) modal.hidden = true;
}

function wireModals() {
  $$('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) closeModal(backdrop);
    });
    backdrop.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', () => closeModal(backdrop));
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') $$('.modal-backdrop:not([hidden])').forEach(closeModal);
  });
}

/* ── Init ──────────────────────────────────────────────── */

async function init() {
  if (PREVIEW) {
    document.body.classList.add('preview');
    $('#preview-badge').hidden = false;
  }

  wireModals();

  // Info o aplikaciji
  if (api) {
    try {
      state.appInfo = await api.getAppInfo();
      state.links = { ...DEMO_LINKS, ...(state.appInfo.links || {}) };
    } catch {
      state.appInfo = null;
    }
  }
  const version = state.appInfo && state.appInfo.version ? `v${state.appInfo.version}` : 'v2.0.0';
  $('#version-chip').textContent = PREVIEW ? `${version} · preview` : version;
  $('#ticker-version').textContent = version;
  $('#info-launcher').textContent = `${version} · Electron ${state.appInfo && state.appInfo.electron ? state.appInfo.electron : '—'}`;
  $('#info-server-name').textContent = state.appInfo && state.appInfo.serverName ? state.appInfo.serverName : 'Revolucija Roleplay';
  $('#info-server-address').textContent = state.appInfo ? `${state.appInfo.host}:${state.appInfo.port}` : '89.116.184.110:30120';
  $('#server-host-text').textContent = state.appInfo ? `${state.appInfo.host}:${state.appInfo.port}` : '89.116.184.110:30120';
  $('#settings-config-file').textContent = state.appInfo && state.appInfo.configFile ? state.appInfo.configFile : 'Ugrađeni default-ovi';
  $('#update-check-result').textContent = `Trenutna verzija: ${version}`;

  // Prozorska dugmad + maksimize stanje
  if (api) {
    $('#win-minimize').addEventListener('click', () => api.window.minimize());
    $('#win-maximize').addEventListener('click', () => api.window.toggleMaximize());
    $('#win-close').addEventListener('click', () => api.window.close());
    $('#titlebar').addEventListener('dblclick', (event) => {
      if (!event.target.closest('.no-drag')) api.window.toggleMaximize();
    });
  }

  // Društvene mreže
  $$('.rail-left .rail-btn[data-link]').forEach((button) => {
    button.addEventListener('click', () => openLink(state.links[button.dataset.link]));
  });
  $('#news-open-discord').addEventListener('click', () => openLink(state.links.discord));
  $('#report-open-discord').addEventListener('click', () => openLink(state.links.discord));

  // Povezivanje na server
  const connectButton = $('#btn-connect');
  connectButton.addEventListener('click', async () => {
    if (PREVIEW) {
      showToast('Povezivanje radi samo kroz Electron aplikaciju (npm start).');
      return;
    }
    connectButton.disabled = true;
    try {
      await api.connect();
      showToast('Pokrećem FiveM…');
    } catch (error) {
      showToast('FiveM nije pokrenut. Da li je FiveM instaliran?');
    } finally {
      setTimeout(() => { connectButton.disabled = false; }, 1500);
    }
  });

  $('#btn-players').addEventListener('click', () => refreshStatus());

  const copyServerAddress = async () => {
    const address = $('#info-server-address').textContent.trim();
    const ok = await copyText(address);
    showToast(ok ? `Kopirano: ${address}` : 'Kopiranje nije uspelo.');
  };
  $('#btn-copy-ip').addEventListener('click', copyServerAddress);
  $('#settings-copy-ip').addEventListener('click', copyServerAddress);
  $('#info-copy-ip').addEventListener('click', copyServerAddress);

  // Bočna traka: modali
  $('#btn-report').addEventListener('click', () => openModal('#modal-report'));
  $('#btn-info').addEventListener('click', () => openModal('#modal-info'));
  $('#btn-settings').addEventListener('click', () => openModal('#modal-settings'));

  // Postavke
  $('#setting-autoupdate').addEventListener('change', (event) => patchSettings({ autoUpdateCheck: event.target.checked }));
  $('#setting-reduced-motion').addEventListener('change', (event) => patchSettings({ reducedMotion: event.target.checked }));
  $('#settings-check-updates').addEventListener('click', manualUpdateCheck);

  // Provera ažuriranja: prikaz banner-a
  $('#update-download').addEventListener('click', () => {
    if (state.updateInfo && state.updateInfo.url) openLink(state.updateInfo.url);
  });
  $('#update-dismiss').addEventListener('click', () => { $('#update-banner').hidden = true; });
  if (api && typeof api.onUpdateAvailable === 'function') {
    api.onUpdateAvailable((info) => showUpdateBanner(info));
  }

  // Početno punjenje
  await loadSettings();
  await Promise.all([refreshStatus(), loadNews()]);
  startPolling(state.appInfo && state.appInfo.pollIntervalSeconds ? state.appInfo.pollIntervalSeconds : 15);
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('[revolucija] init greška:', error);
    showToast('Došlo je do greške pri pokretanju launchera.');
  });
});
