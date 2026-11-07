'use strict';

/**
 * Skladište objava — atomski JSON zapis (tmp + rename), kao kod launcher-a.
 * Format: { nextId: number, announcements: [ { id, date, tag, title, text, authorId, authorTag, createdAt } ] }
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
      return { nextId, announcements: items };
    } catch {
      return { nextId: 1, announcements: [] };
    }
  }

  function persist(state) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  }

  function list(limit) {
    const state = load();
    const sorted = [...state.announcements].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)) || ((b.id || 0) - (a.id || 0)));
    return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
  }

  function add({ tag, title, text, authorId = null, authorTag = null }) {
    const state = load();
    const now = new Date();
    const announcement = {
      id: state.nextId,
      date: now.toISOString().slice(0, 10),
      tag,
      title,
      text,
      authorId,
      authorTag,
      createdAt: now.toISOString()
    };
    state.announcements.push(announcement);
    state.nextId += 1;
    while (state.announcements.length > MAX_STORED) {
      state.announcements.shift(); // baca najstarije
    }
    persist(state);
    return announcement;
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

  return { list, add, remove, file };
}

module.exports = { createStore, MAX_STORED };
