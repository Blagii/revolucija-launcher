'use strict';

/** Sanitizacija korisničkog unosa pre nego što ode u store / na Discord / u launcher. */

const ALLOWED_TAGS = Object.freeze(['NAJAVA', 'EVENT', 'IZMENA', 'INFO']);
const MAX_TITLE = 140;
const MAX_TEXT = 500;

/** Uklanja mention-e (@everyone, @here, <@id>, <@&id>, <#id>) da objava ne pinge nikoga. */
function stripMentions(input) {
  return String(input ?? '')
    .replace(/@(everyone|here)/gi, '')
    .replace(/<@!?\d+>/g, '')
    .replace(/<@&\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

function cleanTag(tag, fallback = 'NAJAVA') {
  const upper = String(tag ?? '').trim().toUpperCase();
  return ALLOWED_TAGS.includes(upper) ? upper : fallback;
}

function cleanTitle(title) {
  const clean = stripMentions(title).slice(0, MAX_TITLE).trim();
  return clean;
}

function cleanText(text) {
  const clean = stripMentions(text).slice(0, MAX_TEXT).trim();
  return clean;
}

/** Normalizuje objavu za launcher-ov announcementUrl ugovor. */
function toPublicItem(announcement) {
  return {
    date: announcement.date,
    tag: announcement.tag,
    title: announcement.title,
    text: announcement.text
  };
}

module.exports = { ALLOWED_TAGS, MAX_TITLE, MAX_TEXT, stripMentions, cleanTag, cleanTitle, cleanText, toPublicItem };
