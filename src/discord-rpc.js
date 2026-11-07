'use strict';

/**
 * Discord Rich Presence kroz lokalni Discord IPC.
 * Aktivan samo ako je u konfiguraciji postavljen discord.clientId
 * (Discord Developer Portal → New Application → Application ID).
 * Ako Discord nije pokrenut ili clientId nije postavljen — sve funkcije su tihi no-op.
 */

let Client = null;
try {
  Client = require('@xhayper/discord-rpc').Client;
} catch {
  Client = null;
}

const startedAt = Date.now();
let client = null;
let connected = false;
let enabled = false;
let largeImageKey = 'revolucija';

function initDiscordRpc(config) {
  if (!Client) {
    console.warn('[revolucija] @xhayper/discord-rpc nije dostupan — Rich Presence ugašen.');
    return false;
  }
  const dc = (config && config.discord) || {};
  if (!dc.clientId) {
    console.log('[revolucija] Discord Rich Presence: clientId nije postavljen — ugašen (vidi README → Konfiguracija).');
    return false;
  }
  enabled = true;
  largeImageKey = dc.largeImageKey || 'revolucija';
  try {
    client = new Client({ clientId: dc.clientId });
    client.on('ready', () => {
      connected = true;
      console.log('[revolucija] Discord Rich Presence: povezan.');
      updatePresence({ online: true });
    });
    client.on('disconnected', () => {
      connected = false;
    });
    client.on('error', (error) => {
      if (process.env.REVOLUCIJA_DEBUG === '1') {
        console.warn('[revolucija] RPC greška:', error && error.message);
      }
    });
    client.login().catch((error) => {
      enabled = false;
      connected = false;
      console.log(`[revolucija] Discord nije dostupan — Rich Presence neaktivan.${error && error.message ? ` (${error.message})` : ''}`);
    });
    return true;
  } catch (error) {
    enabled = false;
    client = null;
    console.warn('[revolucija] Rich Presence init greška:', error && error.message);
    return false;
  }
}

async function updatePresence({ online = true, clients = 0, maxClients = 0 } = {}) {
  if (!enabled || !connected || !client) return false;
  const activity = {
    details: 'Revolucija Roleplay · GTA V',
    state: online
      ? (maxClients ? `${clients}/${maxClients} igrača online` : 'Na serveru')
      : 'Server je trenutno oflajn',
    startTimestamp: startedAt,
    instance: false
  };
  if (largeImageKey) {
    activity.largeImageKey = largeImageKey;
    activity.largeImageText = 'Revolucija Roleplay';
  }
  try {
    await client.user.setActivity(activity);
    return true;
  } catch {
    return false;
  }
}

async function closeDiscordRpc() {
  if (!client) return;
  try {
    await client.user?.setActivity({});
    await client.destroy();
  } catch {
    /* tiho gašenje */
  }
  client = null;
  connected = false;
  enabled = false;
}

module.exports = { initDiscordRpc, updatePresence, closeDiscordRpc };
