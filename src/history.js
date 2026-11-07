'use strict';

/**
 * Istorija popunjenosti servera — čuva uzorke u userData/player-history.json.
 * Koristi se za sparkline u launcheru. Maksimalno MAX_SAMPLES uzoraka (≈ 1 h pri 15 s pollu).
 */

const fs = require('fs');
const path = require('path');

const MAX_SAMPLES = 240;

let cache = null;

function historyFile() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'player-history.json');
}

function isValidSample(sample) {
  return sample
    && Number.isFinite(sample.t)
    && Number.isFinite(sample.clients)
    && sample.clients >= 0;
}

function load() {
  if (cache) return cache;
  let samples = [];
  try {
    const raw = JSON.parse(fs.readFileSync(historyFile(), 'utf8'));
    if (raw && Array.isArray(raw.samples)) {
      samples = raw.samples
        .filter(isValidSample)
        .map((s) => ({ t: Math.floor(s.t), clients: Math.floor(s.clients), maxClients: Math.floor(s.maxClients || 0) }))
        .slice(-MAX_SAMPLES);
    }
  } catch {
    samples = [];
  }
  cache = samples;
  return cache;
}

function persist() {
  try {
    const file = historyFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ samples: cache }));
    fs.renameSync(tmp, file);
  } catch (error) {
    console.error('[shandy] Ne mogu da snimim istoriju igrača:', error.message);
  }
}

function append(sample) {
  const clients = Number(sample && sample.clients);
  if (!Number.isFinite(clients) || clients < 0) return get();
  const samples = load();
  samples.push({
    t: Date.now(),
    clients: Math.floor(clients),
    maxClients: Math.floor(Number(sample.maxClients) || 0)
  });
  while (samples.length > MAX_SAMPLES) samples.shift();
  cache = samples;
  persist();
  return get();
}

function get(limit) {
  const all = load();
  const n = Number(limit);
  return Number.isFinite(n) && n > 0 ? all.slice(-n) : all.slice();
}

module.exports = { append, get, MAX_SAMPLES };
