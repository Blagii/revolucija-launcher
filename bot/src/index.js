'use strict';

/**
 * Revolucija Launcher Bot — ulazna tačka.
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

async function main() {
  const config = loadConfig();
  const store = createStore(config.dataFile);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  // HTTP server za launcher (pokreće se odmah, nezavisno od Discord-a)
  const server = createNewsServer({ store });
  server.listen(config.httpPort, config.httpBind);

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
