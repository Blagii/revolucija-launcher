'use strict';

/* ═══════════════════════════════════════════════════════════════
   Revolucija Roleplay — Launcher 2.1 (renderer)
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

const DEMO_CHANGELOG = {
  version: '2.2.0',
  publishedAt: '2026-11-07',
  url: 'https://github.com/Seekiii/revolucija-launcher/releases',
  body: [
    '## Revolucija Launcher v2.2.0',
    '',
    '- Auto-update: preuzimanje i instalacija iz same aplikacije (GitHub Releases)',
    '- Discord Rich Presence — vidi te na Discord-u da igraš Revolucija RP',
    '- Detekcija FiveM instalacije; dugme postaje "Preuzmi FiveM" ako fali',
    '- Istorija popunjenosti servera (sparkline pored broja igrača)',
    '- "Šta je novo" — napomene uz izdanje unutar aplikacije',
    '- Nova ikonica, ulazne animacije, F5 osvežava status, F11 maksimizuje',
    '- Obaveštenja iz Discord-a (bot servira /news.json) — osvežuju se na 5 min uz toast'
  ].join('\n')
};

const NEWS_POLL_MS = 5 * 60 * 1000;

const state = {
  appInfo: null,
  links: { ...DEMO_LINKS },
  settings: { autoUpdateCheck: true, reducedMotion: false, minimizeToTray: false },
  pollTimer: null,
  toastTimer: null,
  updateMode: 'idle', // idle | available | downloading | downloaded
  needsFiveM: false,
  newsSignature: null
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

function releaseUrl() {
  return state.appInfo && state.appInfo.updateRepo
    ? `https://github.com/${state.appInfo.updateRepo}/releases/latest`
    : null;
}

function currentVersion() {
  return state.appInfo && state.appInfo.version ? state.appInfo.version : '2.2.0';
}

/* ── Status servera ────────────────────────────────────── */

async function fetchStatus() {
  if (api) return api.getStatus();
  await new Promise((resolve) => setTimeout(resolve, 380));
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
  loadHistory();
}

function startPolling(intervalSeconds) {
  clearInterval(state.pollTimer);
  const every = Math.max(5, Number(intervalSeconds) || 15) * 1000;
  state.pollTimer = setInterval(() => refreshStatus({ silent: true }), every);
}

/* ── Sparkline (istorija igrača) ───────────────────────── */

async function loadHistory() {
  let samples = null;
  if (api && api.history && typeof api.history.get === 'function') {
    try {
      samples = await api.history.get(150);
    } catch {
      samples = null;
    }
  } else if (PREVIEW) {
    const now = Date.now();
    let value = 30;
    samples = [];
    for (let i = 0; i < 64; i += 1) {
      value = Math.max(10, Math.min(58, Math.round(value + (Math.random() - 0.42) * 6)));
      samples.push({ t: now - (64 - i) * 15000, clients: value, maxClients: 64 });
    }
  }
  renderSparkline(samples);
}

function renderSparkline(samples) {
  const wrap = $('#sparkline-wrap');
  if (!Array.isArray(samples)) { wrap.hidden = true; return; }
  const online = samples.filter((s) => s && Number.isFinite(s.clients));
  if (online.length < 2) { wrap.hidden = true; return; }
  const clients = online.map((s) => s.clients);
  const max = Math.max(...clients);
  const min = Math.min(...clients);
  const range = Math.max(1, max - min);
  const W = 220;
  const H = 40;
  const PAD = 2;
  const step = (W - 2 * PAD) / (clients.length - 1);
  const points = clients.map((c, i) => {
    const x = PAD + i * step;
    const y = H - PAD - ((c - min) / range) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  $('#sparkline-line').setAttribute('points', points);
  $('#sparkline-max').textContent = `max ${max}`;
  wrap.hidden = false;
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

function linkify(escaped) {
  return escaped.replace(/(https:\/\/[^\s<)]+)/g, '<a href="$1" data-open-link rel="noopener noreferrer">$1</a>');
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
  $('#news-source').textContent = source === 'remote' ? 'Izvor: server' : 'Izvor: ugrađene objave';

  const tickerText = safe.slice(0, 4).map((item) => `${item.title}`).join('   •   ');
  const track = $('#ticker-track');
  if (tickerText) {
    track.innerHTML = `<span>${escapeHtml(tickerText)}</span><span>${escapeHtml(tickerText)}</span>`;
  }
}

async function loadNews() {
  let result = null;
  if (api) {
    try {
      result = await api.getNews();
    } catch {
      result = null;
    }
  }
  const items = result && Array.isArray(result.items) ? result.items : DEMO_NEWS;
  const source = result && result.source ? result.source : 'local';
  const signature = items.length ? `${items[0].date}|${items[0].tag}|${items[0].title}` : '';
  const previous = state.newsSignature;
  state.newsSignature = signature;
  renderNews(items, source);
  if (previous !== null && signature && previous !== signature) {
    showToast('Stigla je nova objava na Discord-u.');
  }
}

/* ── Postavke i reduced motion ─────────────────────────── */

function applyReducedMotion(enabled) {
  document.documentElement.classList.toggle('reduced-motion', Boolean(enabled));
}

async function loadSettings() {
  if (!api) {
    state.settings = { autoUpdateCheck: true, reducedMotion: false, minimizeToTray: false };
  } else {
    try {
      state.settings = await api.getSettings();
    } catch {
      state.settings = { autoUpdateCheck: true, reducedMotion: false, minimizeToTray: false };
    }
  }
  $('#setting-autoupdate').checked = Boolean(state.settings.autoUpdateCheck);
  $('#setting-reduced-motion').checked = Boolean(state.settings.reducedMotion);
  $('#setting-minimize-to-tray').checked = Boolean(state.settings.minimizeToTray);
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

function setUpdateAction(label, mode, disabled = false) {
  const button = $('#update-action');
  button.textContent = label;
  button.dataset.mode = mode;
  button.disabled = disabled;
  state.updateMode = mode;
}

function showUpdateBanner(info) {
  const version = info && (info.version || info.latest);
  $('#update-banner-text').textContent = version
    ? `Dostupna je nova verzija v${version} (trenutno v${currentVersion()}).`
    : 'Dostupna je nova verzija launchera.';
  $('#update-progress').hidden = true;
  setUpdateAction('Ažuriraj', 'available', false);
  $('#update-banner').hidden = false;
}

async function startUpdateDownload() {
  if (!api || !api.updates) {
    openLink(releaseUrl());
    return;
  }
  $('#update-progress').hidden = false;
  $('#update-progress-fill').style.width = '0%';
  $('#update-progress-text').textContent = '0%';
  setUpdateAction('Preuzimam…', 'downloading', true);
  const result = await api.updates.download();
  if (!result || result.ok === false) {
    showToast(result && result.error ? result.error : 'Preuzimanje nije uspelo.');
    const fallback = result && result.url ? result.url : releaseUrl();
    if (fallback) openLink(fallback);
    $('#update-progress').hidden = true;
    setUpdateAction('Ažuriraj', 'available', false);
  }
}

function wireUpdateEvents() {
  if (!api || !api.updates) return;
  api.updates.onAvailable((info) => showUpdateBanner(info));
  api.updates.onNotAvailable(() => {
    $('#update-check-result').textContent = `Sveže je — aktuelna verzija v${currentVersion()}.`;
  });
  api.updates.onProgress((progress) => {
    const percent = Math.min(100, Math.max(0, Number(progress && progress.percent) || 0));
    $('#update-progress').hidden = false;
    $('#update-progress-fill').style.width = `${percent}%`;
    const mbps = progress && progress.bytesPerSecond ? (progress.bytesPerSecond / (1024 * 1024)).toFixed(1) : null;
    $('#update-progress-text').textContent = mbps ? `${percent.toFixed(0)}% · ${mbps} MB/s` : `${percent.toFixed(0)}%`;
  });
  api.updates.onDownloaded((info) => {
    $('#update-progress').hidden = true;
    $('#update-banner-text').textContent = `v${info && info.version ? info.version : ''} je preuzeta — spremna za instalaciju.`;
    setUpdateAction('Restartuj i instaliraj', 'downloaded', false);
    showToast('Ažuriranje je preuzeto.');
  });
  api.updates.onError((payload) => {
    showToast(`Ažuriranje nije uspelo: ${payload && payload.message ? payload.message : 'nepoznata greška'}`);
    $('#update-progress').hidden = true;
    setUpdateAction('Ažuriraj', 'available', false);
  });
}

async function manualUpdateCheck() {
  const target = $('#update-check-result');
  target.textContent = 'Proveravam…';
  if (!api || !api.updates) {
    target.textContent = 'Nedostupno u preview režimu.';
    return;
  }
  const result = await api.updates.check(true);
  if (!result || result.ok === false) {
    target.textContent = `Greška: ${result && result.error ? result.error : 'provera nije uspela'}`;
    return;
  }
  if (result.skipped) {
    target.textContent = 'Auto-provera je ugašena u postavkama.';
    return;
  }
  if (result.available) {
    target.textContent = `Dostupna v${result.latest} — preuzmi iz trake na vrhu.`;
    showUpdateBanner({ version: result.latest, url: result.url });
  } else {
    target.textContent = `Sveže je — aktuelna verzija v${result.current}.`;
  }
}

/* ── "Šta je novo" (changelog) ─────────────────────────── */

function renderChangelogBody(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (!trimmed) { closeList(); continue; }
    const bullet = /^[-*]\s+/.exec(trimmed);
    const heading = /^(#{1,6})\s+/.exec(trimmed);
    if (bullet) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${linkify(escapeHtml(trimmed.slice(bullet[0].length)))}</li>`;
      continue;
    }
    closeList();
    if (heading) {
      html += `<div class="cl-h">${linkify(escapeHtml(trimmed.slice(heading[0].length)))}</div>`;
      continue;
    }
    html += `<p>${linkify(escapeHtml(trimmed))}</p>`;
  }
  closeList();
  return html || '<p class="modal-muted">Napomene nisu dostupne.</p>';
}

let changelogUrl = null;

async function openWhatsnew() {
  openModal('#modal-whatsnew');
  const content = $('#changelog-content');
  $('#changelog-version').textContent = '…';
  $('#changelog-date').textContent = '';
  content.innerHTML = '<p class="modal-muted">Učitavanje…</p>';

  if (!api || !api.updates) {
    changelogUrl = DEMO_CHANGELOG.url;
    $('#changelog-version').textContent = `v${DEMO_CHANGELOG.version}`;
    $('#changelog-date').textContent = formatDate(DEMO_CHANGELOG.publishedAt);
    content.innerHTML = renderChangelogBody(DEMO_CHANGELOG.body);
    return;
  }
  const result = await api.updates.releaseNotes();
  if (!result || result.ok === false) {
    changelogUrl = releaseUrl();
    $('#changelog-version').textContent = '—';
    content.innerHTML = `<p class="modal-muted">Changelog nije dostupan${result && result.error ? `: ${escapeHtml(result.error)}` : ''}. Najnovije izdanje pogledaj na GitHub-u.</p>`;
    return;
  }
  changelogUrl = result.url || releaseUrl();
  $('#changelog-version').textContent = result.version ? `v${result.version}` : 'Najnovije izdanje';
  $('#changelog-date').textContent = result.publishedAt ? formatDate(result.publishedAt) : '';
  content.innerHTML = renderChangelogBody(result.body);
}

/* ── Povezivanje (i detekcija FiveM-a) ─────────────────── */

function updateConnectButton() {
  const fivem = state.appInfo && state.appInfo.fivem;
  const needsDownload = Boolean(fivem && fivem.supported && fivem.installed === false);
  state.needsFiveM = needsDownload;
  $('#icon-plug').hidden = needsDownload;
  $('#icon-download').hidden = !needsDownload;
  $('#btn-connect-label').textContent = needsDownload ? 'PREUZMI FIVEM' : 'POVEŽI SE';
  $('#btn-connect').title = needsDownload ? 'FiveM nije pronađen na ovom računaru — preuzmi ga sa fivem.net' : 'Pokreni FiveM i poveži se';
}

/* ── Modali ────────────────────────────────────────────── */

function openModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.hidden = false;
  const focusable = modal.querySelector('button, input, [tabindex]');
  if (focusable) focusable.focus();
}

function closeModal(modal) {
  if (modal) modal.hidden = true;
}

function getOpenModal() {
  return document.querySelector('.modal-backdrop:not([hidden])');
}

function trapTabKey(modal, event) {
  const focusables = modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !modal.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
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
    if (event.key === 'Tab') {
      const open = getOpenModal();
      if (open) trapTabKey(open, event);
    }
  });
  // Linkovi unutar changelog/modal sadržaja
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-open-link]');
    if (link) {
      event.preventDefault();
      openLink(link.getAttribute('href'));
    }
  });
}

/* ── Init ──────────────────────────────────────────────── */

async function init() {
  if (PREVIEW) {
    document.body.classList.add('preview');
    $('#preview-badge').hidden = false;
  }

  wireModals();
  wireUpdateEvents();

  if (api) {
    try {
      state.appInfo = await api.getAppInfo();
      state.links = { ...DEMO_LINKS, ...(state.appInfo.links || {}) };
    } catch {
      state.appInfo = null;
    }
  }
  const version = `v${currentVersion()}`;
  $('#version-chip').textContent = PREVIEW ? `${version} · preview` : version;
  $('#ticker-version').textContent = version;
  $('#info-launcher').textContent = `${version} · Electron ${state.appInfo && state.appInfo.electron ? state.appInfo.electron : '—'}`;
  $('#info-server-name').textContent = state.appInfo && state.appInfo.serverName ? state.appInfo.serverName : 'Revolucija Roleplay';
  $('#info-server-address').textContent = state.appInfo ? `${state.appInfo.host}:${state.appInfo.port}` : '89.116.184.110:30120';
  $('#server-host-text').textContent = state.appInfo ? `${state.appInfo.host}:${state.appInfo.port}` : '89.116.184.110:30120';
  $('#settings-config-file').textContent = state.appInfo && state.appInfo.configFile
    ? state.appInfo.configFile
    : 'Ugrađeni default-ovi';
  $('#update-check-result').textContent = `Trenutna verzija: ${version}`;

  updateConnectButton();

  // Naslovna traka: prozorska dugmad + double-click maksimizuje
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

  // Povezivanje na server / preuzimanje FiveM-a
  const connectButton = $('#btn-connect');
  connectButton.addEventListener('click', async () => {
    if (state.needsFiveM) {
      openLink(state.appInfo && state.appInfo.fivem ? state.appInfo.fivem.downloadUrl : 'https://fivem.net/');
      return;
    }
    const fivem = state.appInfo && state.appInfo.fivem;
    if (fivem && fivem.supported === false) {
      showToast('FiveM je zvanično dostupan samo na Windows-u — veza radi sa GTA V + FiveM klijentom.');
      return;
    }
    if (PREVIEW) {
      showToast('Povezivanje radi samo kroz Electron aplikaciju (npm start).');
      return;
    }
    connectButton.disabled = true;
    try {
      await api.connect();
      showToast('Pokrećem FiveM…');
    } catch {
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
  $('#btn-whatsnew').addEventListener('click', () => openWhatsnew());
  $('#btn-report').addEventListener('click', () => openModal('#modal-report'));
  $('#btn-info').addEventListener('click', () => openModal('#modal-info'));
  $('#btn-settings').addEventListener('click', () => openModal('#modal-settings'));

  // Banner za ažuriranje
  $('#update-action').addEventListener('click', () => {
    if (state.updateMode === 'downloaded') {
      if (api && api.updates) api.updates.install();
      return;
    }
    if (state.updateMode === 'available') startUpdateDownload();
  });
  $('#update-details').addEventListener('click', () => openWhatsnew());
  $('#update-dismiss').addEventListener('click', () => { $('#update-banner').hidden = true; });

  // Postavke
  $('#setting-autoupdate').addEventListener('change', (event) => patchSettings({ autoUpdateCheck: event.target.checked }));
  $('#setting-reduced-motion').addEventListener('change', (event) => patchSettings({ reducedMotion: event.target.checked }));
  $('#setting-minimize-to-tray').addEventListener('change', (event) => {
    patchSettings({ minimizeToTray: event.target.checked });
    showToast(event.target.checked
      ? 'Pri klik na X launcher će se sakriti u tray.'
      : 'Pri klik na X launcher će se zatvoriti.');
  });
  $('#settings-check-updates').addEventListener('click', manualUpdateCheck);
  $('#settings-open-changelog').addEventListener('click', () => openWhatsnew());

  // Changelog modal
  $('#changelog-open-release').addEventListener('click', () => openLink(changelogUrl || releaseUrl()));

  // Klavijatura: F5 / Ctrl+R osvežava status, F11 maksimizuje, Ctrl+W zatvara
  document.addEventListener('keydown', (event) => {
    const isRefresh = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && (event.key === 'r' || event.key === 'R'));
    if (isRefresh) {
      event.preventDefault();
      refreshStatus();
      return;
    }
    if (event.key === 'F11') {
      event.preventDefault();
      if (api) api.window.toggleMaximize();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'w' || event.key === 'W')) {
      event.preventDefault();
      if (api) api.window.close();
    }
  });

  // Početno punjenje
  await loadSettings();
  await Promise.all([refreshStatus(), loadNews()]);
  startPolling(state.appInfo && state.appInfo.pollIntervalSeconds ? state.appInfo.pollIntervalSeconds : 15);
  // Obaveštenja se osvežavaju u pozadini — launcher je "uživ" i kad se ne dira
  setInterval(() => {
    if (!document.hidden) loadNews();
  }, NEWS_POLL_MS);
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('[revolucija] init greška:', error);
    showToast('Došlo je do greške pri pokretanju launchera.');
  });
});
