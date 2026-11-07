'use strict';

/**
 * Parsiranje zakazanog vremena za `/najava vreme:...`.
 * Podržani formati (po TZ bota — podrazumevano TZ okoline, za Srbiju: TZ=Europe/Belgrade):
 *   HH:MM               → danas u HH:MM; ako je već prošlo → sutra
 *   YYYY-MM-DD HH:MM    → konkretno vreme
 * Vraća { ok: true, timestamp } ili { ok: false, error }.
 */

function parseScheduleTime(input, nowMs = Date.now()) {
  if (typeof input !== 'string') return { ok: false, error: 'Vreme mora biti tekst.' };
  const value = input.trim();
  if (!value) return { ok: false, error: 'Vreme je prazno.' };

  const timeOnly = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (timeOnly) {
    const hours = Number(timeOnly[1]);
    const minutes = Number(timeOnly[2]);
    if (hours > 23 || minutes > 59) return { ok: false, error: 'Neispravno vreme (očekujem HH:MM, npr. 18:30).' };
    const now = new Date(nowMs);
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    if (candidate.getTime() <= nowMs) {
      candidate.setDate(candidate.getDate() + 1); // već prošlo danas → sutra
    }
    return { ok: true, timestamp: candidate.getTime() };
  }

  const dateTime = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(value);
  if (dateTime) {
    const [, y, mo, d, h, mi] = dateTime.map(Number);
    const candidate = new Date(y, mo - 1, d, h, mi, 0, 0);
    if (Number.isNaN(candidate.getTime())
        || candidate.getFullYear() !== y || candidate.getMonth() !== mo - 1 || candidate.getDate() !== d
        || h > 23 || mi > 59) {
      return { ok: false, error: 'Neispravan datum/vreme (očekujem YYYY-MM-DD HH:MM).' };
    }
    if (candidate.getTime() <= nowMs) {
      return { ok: false, error: 'Zakazano vreme je u prošlosti.' };
    }
    return { ok: true, timestamp: candidate.getTime() };
  }

  return { ok: false, error: 'Neprepoznat format. Koristi HH:MM (npr. 18:30) ili YYYY-MM-DD HH:MM.' };
}

function formatTimestampUnix(ms) {
  return Math.floor(Number(ms) / 1000);
}

module.exports = { parseScheduleTime, formatTimestampUnix };
