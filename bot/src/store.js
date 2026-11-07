'use strict';

/**
 * Skladište objava — atomski JSON zapis (tmp + rename), kao kod launcher-a.
 * Format: { nextId: number, announcements: [{ id, date, tag, title, text, authorId,
 *          authorTag, createdAt, scheduledAt, delivered }] }
 *
 * Objava može biti:
 *  - odmah isporučena (delivered: true) — vidljiva u /news.json
 *  - zakazana (delivered: false, scheduledAt > now) — NIJE u /news.json dok ne dospe;
 *    scheduler je isporuči i markira delivered.
 * Registrovan cap: najnovijih MAX_STORED objava; starije se bacaju.
 */

const fs = require('fs');
const path = require('path');

const MAX_STORED = 50;

function createStore(dataFile) {
  const file = path.resolve(dataFile);

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const items = Array.isArray(raw.announcements) ? raw.announcements : [];
      const nextId = Number.isInteger(raw.nextId) && raw.nextId > 0
        ? raw.nextId
        : items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
      return { nextId, announcements: items.map(normalizeItem) };
    } catch {
      return { nextId: 1, announcements: [] };
    }
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return item;
    return {
      ...item,
      // stari zapisi nemaju ova polja — tretiraju se kao isporučeni
      scheduledAt: item.scheduledAt || null,
      delivered: item.delivered !== false
    };
  }

  function persist(state) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  }

  /**
   * Poslednje objave. Podrazumevano vraća SAMO isporučene (ono što ide u launcher).
   * { includeScheduled: true } vraća sve, isporučene i zakazane.
   */
  function list(limit, options = {}) {
    const includeScheduled = Boolean(options.includeScheduled);
    const state = load();
    const filtered = includeScheduled
      ? state.announcements
      : state.announcements.filter((item) => item.delivered !== false);
    const sorted = [...filtered].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)) || ((b.id || 0) - (a.id || 0)));
    return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Zakazane objave kojima je vreme prošlo — najstarije prvo (isporuka u redu).
   */
  function dueScheduled(nowMs = Date.now()) {
    const state = load();
    return state.announcements
      .filter((item) => item.delivered === false && typeof item.scheduledAt === 'number' && item.scheduledAt <= nowMs)
      .sort((a, b) => a.scheduledAt - b.scheduledAt || a.id - b.id);
  }

  /**
   * Nadolazeće zakazane objave (još nisu dospele) — za /obavestenja prikaz.
   */
  function upcomingScheduled(limit = 5, nowMs = Date.now()) {
    const state = load();
    const sorted = state.announcements
      .filter((item) => item.delivered === false && typeof item.scheduledAt === 'number' && item.scheduledAt > nowMs)
      .sort((a, b) => a.scheduledAt - b.scheduledAt || a.id - b.id);
    return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
  }

  function add({ tag, title, text, authorId = null, authorTag = null, scheduledAt = null }) {
    const state = load();
    const now = new Date();
    const scheduleTs = Number.isFinite(Number(scheduledAt)) && Number(scheduledAt) > now.getTime()
      ? Number(scheduledAt)
      : null;
    const announcement = {
      id: state.nextId,
      date: now.toISOString().slice(0, 10),
      tag,
      title,
      text,
      authorId,
      authorTag,
      createdAt: now.toISOString(),
      scheduledAt: scheduleTs,
      // scheduledAt u prošlosti/odsutan → odmah isporučena
      delivered: scheduleTs === null
    };
    state.announcements.push(announcement);
    state.nextId += 1;
    while (state.announcements.length > MAX_STORED) {
      state.announcements.shift(); // baca najstarije
    }
    persist(state);
    return announcement;
  }

  function markDelivered(id) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId)) return null;
    const state = load();
    const item = state.announcements.find((entry) => entry.id === numericId);
    if (!item) return null;
    if (item.delivered !== true) {
      item.delivered = true;
      item.deliveredAt = new Date().toISOString();
      persist(state);
    }
    return item;
  }

  function remove(id) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId)) return false;
    const state = load();
    const index = state.announcements.findIndex((item) => item.id === numericId);
    if (index === -1) return false;
    state.announcements.splice(index, 1);
    persist(state);
    return true;
  }

  return { list, dueScheduled, upcomingScheduled, add, markDelivered, remove, file };
}

module.exports = { createStore, MAX_STORED };
