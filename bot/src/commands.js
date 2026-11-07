'use strict';

/**
 * Slash komande: /najava, /obavestenja, /obrisi-najavu, /status
 * Staff provera: STAFF_ROLE_ID (ako je postavljen) ILI Discord dozvola "Manage Messages".
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { cleanTag, cleanTitle, cleanText, ALLOWED_TAGS } = require('./sanitize');
const { fetchFiveMStatus } = require('./fivem');
const { TAG_COLORS, TAG_LABELS, postToAnnouncementChannel } = require('./announce');
const { parseScheduleTime, formatTimestampUnix } = require('./schedule');

const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('najava')
    .setDescription('Objavi novo obaveštenje — Discord kanal + launcher odmah')
    .addStringOption((option) => option
      .setName('tag')
      .setDescription('Tip objave')
      .setRequired(true)
      .addChoices(...ALLOWED_TAGS.map((tag) => ({ name: TAG_LABELS[tag], value: tag }))))
    .addStringOption((option) => option
      .setName('naslov')
      .setDescription('Kratak naslov (max 100 znakova)')
      .setRequired(true)
      .setMaxLength(100))
    .addStringOption((option) => option
      .setName('tekst')
      .setDescription('Telo objave (max 500 znakova)')
      .setRequired(true)
      .setMaxLength(500))
    .addStringOption((option) => option
      .setName('vreme')
      .setDescription('Zakazano: HH:MM (danas/sutra) ili YYYY-MM-DD HH:MM — npr. 18:30')
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('obavestenja')
    .setDescription('Poslednjih 5 objava u launcher-u (sa ID-jevima)'),

  new SlashCommandBuilder()
    .setName('obrisi-najavu')
    .setDescription('Obriši objavu iz launcher-a po ID-u (iz /obavestenja)')
    .addIntegerOption((option) => option
      .setName('id')
      .setDescription('ID objave')
      .setRequired(true)
      .setMinValue(1)),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Uživo status Shandy Roleplay servera')
];

function memberIsStaff(member, staffRoleId) {
  if (!member) return false;
  if (staffRoleId && member.roles && member.roles.cache && member.roles.cache.has(staffRoleId)) return true;
  return Boolean(member.permissions && member.permissions.has(PermissionFlagsBits.ManageMessages));
}

/** Cooldown mapa: `${userId}:${command}` → timestamp — spam zaštita po komandi, ne globalno */
const cooldowns = new Map();
const COOLDOWN_MS = 5_000;

setInterval(() => {
  const threshold = Date.now() - 10 * 60_000;
  for (const [key, ts] of cooldowns) {
    if (ts < threshold) cooldowns.delete(key);
  }
}, 10 * 60_000).unref();

function onCooldown(userId, command) {
  const key = `${userId}:${command}`;
  const last = cooldowns.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
  cooldowns.set(key, Date.now());
  return 0;
}

function createCommandHandler({ store, announcementsChannelId, staffRoleId, fivemDynamicUrl, onAnnouncementsChanged, logger = console.log }) {
  return async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const name = interaction.commandName;
    try {
      if (name === 'najava') return await handleNajava(interaction);
      if (name === 'obavestenja') return await handleList(interaction);
      if (name === 'obrisi-najavu') return await handleDelete(interaction);
      if (name === 'status') return await handleStatus(interaction);
      await interaction.reply({ content: 'Nepoznata komanda.', ephemeral: true });
    } catch (error) {
      logger(`[bot] Greška u /${name}:`, error);
      const payload = { content: '⚠️ Došlo je do greške. Pokušaj ponovo ili pogledaj log bota.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  };

  async function handleNajava(interaction) {
    if (!memberIsStaff(interaction.member, staffRoleId)) {
      await interaction.reply({ content: '⛔ Nemaš dozvolu. Potrebna je uloga STAFF_ROLE_ID ili „Manage Messages“.', ephemeral: true });
      return;
    }
    const wait = onCooldown(interaction.user.id, interaction.commandName);
    if (wait) {
      await interaction.reply({ content: `⏳ Sačekaj još ${wait}s (spam zaštita).`, ephemeral: true });
      return;
    }
    const tag = cleanTag(interaction.options.getString('tag'));
    const title = cleanTitle(interaction.options.getString('naslov'));
    const text = cleanText(interaction.options.getString('tekst'));
    if (!title || !text) {
      await interaction.reply({ content: 'Naslov i tekst ne smeju biti prazni posle sanitizacije.', ephemeral: true });
      return;
    }
    const vremeRaw = interaction.options.getString('vreme');
    let scheduledAt = null;
    if (vremeRaw) {
      const parsed = parseScheduleTime(vremeRaw);
      if (!parsed.ok) {
        await interaction.reply({ content: `⛔ ${parsed.error}`, ephemeral: true });
        return;
      }
      scheduledAt = parsed.timestamp;
    }

    const announcement = store.add({
      tag,
      title,
      text,
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      scheduledAt
    });

    if (scheduledAt) {
      await interaction.reply({
        content: `⏰ Objava **#${announcement.id}** je zakazana za <t:${formatTimestampUnix(scheduledAt)}:F>. Pojave se u kanalu i launcher-u tad.`,
        ephemeral: true
      });
      return;
    }

    const posted = await postToAnnouncementChannel(interaction.client, announcementsChannelId, announcement);
    if (typeof onAnnouncementsChanged === 'function') onAnnouncementsChanged(); // poništi HTTP keš

    await interaction.reply({
      content: `✅ Objava **#${announcement.id}** je sačuvana i biće vidljiva u launcher-u.${posted ? ' Embed je poslat u kanal.' : ' (Kanal nije podešen — samo launcher.)'}`,
      ephemeral: true
    });
  }

  async function handleList(interaction) {
    const latest = store.list(5);
    const upcoming = typeof store.upcomingScheduled === 'function' ? store.upcomingScheduled(5) : [];
    if (latest.length === 0 && upcoming.length === 0) {
      await interaction.reply({ content: 'Nema objava. Dodaj prvu sa `/najava`.', ephemeral: true });
      return;
    }
    const parts = [];
    if (latest.length) {
      const lines = latest.map((item) => {
        const [y, m, d] = String(item.date).split('-');
        return `\`#${item.id}\` **[${item.tag}]** ${item.title} — ${d}.${m}.${y}.`;
      });
      parts.push(`Poslednjih ${lines.length} objava:\n${lines.join('\n')}`);
    }
    if (upcoming.length) {
      const lines = upcoming.map((item) =>
        `\`#${item.id}\` ⏳ **[${item.tag}]** ${item.title} — <t:${formatTimestampUnix(item.scheduledAt)}:F>`);
      parts.push(`Zakazano:\n${lines.join('\n')}`);
    }
    await interaction.reply({ content: parts.join('\n\n'), ephemeral: true });
  }

  async function handleDelete(interaction) {
    if (!memberIsStaff(interaction.member, staffRoleId)) {
      await interaction.reply({ content: '⛔ Nemaš dozvolu. Potrebna je uloga STAFF_ROLE_ID ili „Manage Messages“.', ephemeral: true });
      return;
    }
    const wait = onCooldown(interaction.user.id, interaction.commandName);
    if (wait) {
      await interaction.reply({ content: `⏳ Sačekaj još ${wait}s (spam zaštita).`, ephemeral: true });
      return;
    }
    const id = interaction.options.getInteger('id', true);
    const removed = store.remove(id);
    if (removed && typeof onAnnouncementsChanged === 'function') onAnnouncementsChanged();
    await interaction.reply({
      content: removed ? `🗑️ Objava **#${id}** je obrisana. Launcher je više neće prikazivati.` : `Nema objave sa ID **#${id}**. Proveri sa /obavestenja.`,
      ephemeral: true
    });
  }

  async function handleStatus(interaction) {
    await interaction.deferReply();
    const status = await fetchFiveMStatus(fivemDynamicUrl);
    if (!status.online) {
      await interaction.editReply({ content: `🔴 **Server je OFLAJN** (${status.error || 'nema odgovora'}). Probaj kasnije.` });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0x35d07f)
      .setTitle('🟢 Shandy Roleplay — ONLINE')
      .setDescription(status.hostname || 'Shandy Roleplay')
      .addFields(
        { name: 'Igrači', value: `**${status.clients} / ${status.maxClients}**`, inline: true },
        { name: 'Mapa', value: status.mapname || '—', inline: true },
        { name: 'Tip', value: status.gametype || 'Roleplay', inline: true }
      )
      .setFooter({ text: 'Shandy Launcher · FiveM' })
      .setTimestamp(new Date());
    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { commandDefinitions, createCommandHandler, TAG_COLORS };
