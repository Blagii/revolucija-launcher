'use strict';

/**
 * Ugrađene podrazumevane objave (srbijanski latinica).
 * Ako je u konfiguraciji postavljen announcementUrl, main proces ih zamenjuje kroz merge sa udaljenim listom (udaljeni ima prednost kad postoji).
 */

const BUNDLED_NEWS = Object.freeze([
  Object.freeze({
    date: '2026-11-02',
    tag: 'EVENT',
    title: 'Sudnica subotom u 21:00',
    text: 'Svake subote u 21:00 h odigrava se javna parnica. Svi koji žele da svedoče mogu se prijaviti sudiji na Discord-u u kanalu #prijave.'
  }),
  Object.freeze({
    date: '2026-10-21',
    tag: 'IZMENA',
    title: 'Pravila whiteliste su ažurirana',
    text: 'Nova pravila: sastav aplikacije je obavezan, a intervju se zakazuje automatski kroz Discord bot. Pročitajte izmenjena pravila pre prijave.'
  }),
  Object.freeze({
    date: '2026-10-05',
    tag: 'NAJAVA',
    title: 'Restart ekonomije — sezona 3',
    text: 'Sve uloge, plate i firme se resetuju. Povratnici dobijaju loyalty bonus, a prijave za direktore firmi se otvaraju od 15. novembra.'
  })
]);

module.exports = { BUNDLED_NEWS };
