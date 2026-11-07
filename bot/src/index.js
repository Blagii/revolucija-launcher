'use strict';

/**
 * Shandy Launcher Bot — ulazna tačka.
 *
 *  - prijavljuje slash komande na guild (instant) na svaki start
 *  - drži HTTP endpoint /news.json koji launcher čita kao announcementUrl
 *  - intents: samo Guilds — MESSAGE_CONTENT nije potreban (komande nose sadržaj)
 */

const { Client, GatewayIntentBits, REST, Routes, ActivityType } = require('discord.js');
const { loadConfig } = require('./config');
const { createStore } = require('./store');
const { createNewsServer } = require('./http');
const { commandDefinitions, createCommandHandler } = require('./commands');
const { createScheduler, postToAnnouncementChannel } = require('./announce');
const { createWhitelistVerifier } = require('./whitelist');
const { cleanText } = require('./sanitize');

/** Šabloni auto-objava za FiveM webhook — sadržaj je uvek strogo kontrolisan (bez injekcije). */
const WEBHOOK_TEMPLATES = {
  restart: (details) => ({
    tag: 'IZMENA',
    title: 'Server se restartuje',
    text: details || 'Server se restartuje. Vidimo se za par minuta.'
  }),
  start: () => ({
    tag: 'INFO',
    title: 'Server je online',
    text: 'Shandy RP je ponovo dostupan — viđamo se u igri!'
  }),
  maintenance: (details) => ({
    tag: 'IZMENA',
    title: 'Planirano održavanje',
    text: details || 'U toku je održavanje servera. Hvala na strpljenju.'
  })
};

async function handleFiveMWebhook(store, client, channelId, payload) {
  const template = WEBHOOK_TEMPLATES[payload && payload.event];
  if (!template) {
    return { ok: false, error: 'nepoznat event (restart|start|maintenance)' };
  }
  const details = payload && typeof payload.details === 'string' ? cleanText(payload.details) : null;
  const { tag, title, text } = template(details);
  const item = store.add({ tag, title, text, authorTag: 'fivem-webhook' });
  await postToAnnouncementChannel(client, channelId, item);
  return { ok: true, id: item.id };
}

async function main() {
  const config = loadConfig();
  const store = createStore(config.dataFile);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  // HTTP server za launcher + FiveM webhook (pokreće se odmah, nezavisno od Discord-a)
  // Whitelist verifikacija — samo ako je bot dodat na guild (treba bot token + guild id)
  const whitelistVerify = config.guildId
    ? createWhitelistVerifier({
        botToken: config.token,
        guildId: config.guildId,
        whitelistRoleId: config.whitelistRoleId || undefined
      })
    : null;
  if (!whitelistVerify) {
    console.warn('[bot] DISCORD_GUILD_ID nije postavljen — /whitelist/verify je ugašen (404).');
  }

  const server = createNewsServer({
    store,
    webhookSecret: config.webhookSecret,
    onWebhook: (payload) => handleFiveMWebhook(store, client, config.announcementsChannelId, payload)
      .then((result) => {
        if (result && result.ok && typeof server.invalidateCache === 'function') server.invalidateCache();
        return result;
      }),
    whitelistVerify
  });
  server.listen(config.httpPort, config.httpBind);

  // Scheduler za zakazane objave (/najava vreme:...)
  const scheduler = createScheduler({
    store,
    getClient: () => client,
    channelId: config.announcementsChannelId,
    intervalMs: 30_000,
    onDelivered: () => {
      if (typeof server.invalidateCache === 'function') server.invalidateCache();
    }
  });
  scheduler.start();

  client.once('ready', async () => {
    console.log(`[bot] Ulogovan kao ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: 'Revoluciju RP · /najava', type: ActivityType.Watching }],
      status: 'online'
    });

    if (config.guildId) {
      try {
        const rest = new REST({ version: '10' }).setToken(config.token);
        const body = commandDefinitions.map((command) => command.toJSON());
        await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
        console.log(`[bot] Registrovano ${body.length} slash komandi na guild ${config.guildId}`);
      } catch (error) {
        console.error('[bot] Registracija slash komandi nije uspela:', error && error.message);
        console.error('[bot] Proveri DISCORD_CLIENT_ID, DISCORD_GUILD_ID i da je bot dodat na server (scope applications.commands).');
      }
    }
  });

  client.on('interactionCreate', createCommandHandler({
    store,
    announcementsChannelId: config.announcementsChannelId,
    staffRoleId: config.staffRoleId,
    fivemDynamicUrl: config.fivemDynamicUrl,
    onAnnouncementsChanged: () => {
      if (typeof server.invalidateCache === 'function') server.invalidateCache();
    }
  }));

  client.on('error', (error) => {
    console.error('[bot] Discord klijent greška:', error && error.message);
  });

  const shutdown = (signal) => {
    console.log(`\n[bot] ${signal} — gašenje…`);
    scheduler.stop();
    server.close(() => console.log('[bot/http] HTTP server zatvoren.'));
    client.destroy().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await client.login(config.token);
}

main().catch((error) => {
  console.error('[bot] Fatalna greška pri pokretanju:', error);
  process.exit(1);
});
