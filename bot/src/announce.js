'use strict';

/**
 * Deljenje objave — embed + slanje u kanal + scheduler zakazanih objava.
 * Scheduler se koristi i iz HTTP webhook-a (odmah) i iz intervala (zakazano),
 * pa je cela logika isporuke na jednom mestu.
 */

const { EmbedBuilder } = require('discord.js');

const TAG_COLORS = {
  NAJAVA: 0xe01a2b,
  EVENT: 0xffb020,
  IZMENA: 0x5865f2,
  INFO: 0x35d07f
};

const TAG_LABELS = {
  NAJAVA: '📣 NAJAVA',
  EVENT: '🎉 EVENT',
  IZMENA: '🔧 IZMENA',
  INFO: 'ℹ️ INFO'
};

function buildAnnouncementEmbed(announcement) {
  return new EmbedBuilder()
    .setColor(TAG_COLORS[announcement.tag] || TAG_COLORS.NAJAVA)
    .setTitle(`${TAG_LABELS[announcement.tag] || '📣 NAJAVA'} — ${announcement.title}`)
    .setDescription(announcement.text)
    .setFooter({ text: `Shandy Launcher · objava #${announcement.id} · vidljiva i u aplikaciji` })
    .setTimestamp(new Date(announcement.createdAt));
}

/**
 * Pošalje embed u announcements kanal. Vraća true ako je poslato.
 * Nikad ne baca — isporuka je "best effort": objava je u store-u bez obzira na kanal.
 */
async function postToAnnouncementChannel(client, channelId, announcement) {
  if (!client || !channelId) return false;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && typeof channel.isTextBased === 'function' && channel.isTextBased()) {
      await channel.send({ embeds: [buildAnnouncementEmbed(announcement)] });
      return true;
    }
    return false;
  } catch (error) {
    console.error('[bot] Ne mogu da objavim u kanal:', error && error.message);
    return false;
  }
}

/**
 * Scheduler: na svakih `intervalMs` proverava store za dospele zakazane objave,
 * objavljuje ih u kanal i markira kao isporučene (visible u /news.json).
 */
function createScheduler({ store, getClient, channelId, intervalMs = 30_000, onDelivered, logger = console.error }) {
  let timer = null;
  let inFlight = false;

  async function deliverDue(nowMs = Date.now()) {
    if (inFlight) return 0;
    inFlight = true;
    let delivered = 0;
    try {
      const due = store.dueScheduled(nowMs);
      for (const item of due) {
        await postToAnnouncementChannel(getClient(), channelId, item);
        store.markDelivered(item.id);
        delivered += 1;
        logger(`[bot] Zakazana objava #${item.id} isporučena (${item.tag}: ${item.title})`);
      }
      if (delivered > 0 && typeof onDelivered === 'function') {
        onDelivered(delivered);
      }
    } catch (error) {
      logger('[bot] Scheduler greška:', error && error.message);
    } finally {
      inFlight = false;
    }
    return delivered;
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => { deliverDue().catch(() => {}); }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, deliverDue };
}

module.exports = {
  TAG_COLORS,
  TAG_LABELS,
  buildAnnouncementEmbed,
  postToAnnouncementChannel,
  createScheduler
};
