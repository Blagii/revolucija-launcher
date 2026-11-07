'use strict';

/** Učitavanje .env (opciono, bez zavisnosti) — postojeće env varijable pobeđuju. */

const fs = require('fs');
const path = require('path');

function loadDotEnv(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* nema .env fajla — oslanjamo se na prave env varijable */
  }
}

function loadConfig() {
  loadDotEnv(path.join(__dirname, '..', '.env'));

  const env = process.env;
  const config = {
    token: env.DISCORD_TOKEN && env.DISCORD_TOKEN.trim(),
    clientId: env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_ID.trim(),
    guildId: env.DISCORD_GUILD_ID && env.DISCORD_GUILD_ID.trim(),
    announcementsChannelId: env.ANNOUNCEMENTS_CHANNEL_ID && env.ANNOUNCEMENTS_CHANNEL_ID.trim(),
    staffRoleId: env.STAFF_ROLE_ID && env.STAFF_ROLE_ID.trim(),
    webhookSecret: env.WEBHOOK_SECRET && env.WEBHOOK_SECRET.trim() || '',
    whitelistRoleId: env.WHITELIST_ROLE_ID && env.WHITELIST_ROLE_ID.trim() || '',
    fivemDynamicUrl: env.FIVEM_DYNAMIC_URL && env.FIVEM_DYNAMIC_URL.trim()
      || 'http://89.116.184.110:30120/dynamic.json',
    httpBind: env.BOT_HTTP_BIND && env.BOT_HTTP_BIND.trim() || '0.0.0.0',
    httpPort: Number(env.BOT_HTTP_PORT) || 8734,
    dataFile: env.BOT_DATA_FILE && env.BOT_DATA_FILE.trim()
      || path.join(__dirname, '..', 'data', 'announcements.json')
  };

  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN');
  if (!config.clientId) missing.push('DISCORD_CLIENT_ID');
  if (missing.length) {
    console.error(`[bot] Nedostaju obavezne konfiguracije: ${missing.join(', ')}`);
    console.error('[bot] Kopiraj .env.example u .env i popuni vrednosti. Vidi bot/README.md.');
    process.exit(1);
  }
  if (!Number.isInteger(config.httpPort) || config.httpPort < 1 || config.httpPort > 65535) {
    console.error(`[bot] BOT_HTTP_PORT nije validan port: ${env.BOT_HTTP_PORT}`);
    process.exit(1);
  }
  if (!config.guildId) {
    console.warn('[bot] DISCORD_GUILD_ID nije postavljen — slash komande se NEĆE registrovati (postojeće ostaju).');
  }
  if (!config.announcementsChannelId) {
    console.warn('[bot] ANNOUNCEMENTS_CHANNEL_ID nije postavljen — /najava će čuvati objavu samo za launcher, bez embed-a u kanalu.');
  }
  if (!config.webhookSecret) {
    console.warn('[bot] WEBHOOK_SECRET nije postavljen — FiveM webhook (POST /webhook/fivem) je ugašen.');
  }
  return config;
}

module.exports = { loadConfig };
