'use strict';

/**
 * Whitelist verifikacija preko Discord-a.
 *
 * Launcher nikad ne drži tajnu: koristi implicitni OAuth (response_type=token) i šalje
 * USER access token na ovaj endpoint. Bot proverava kod Discord-a:
 *   1. GET /users/@me            (user token)     → identitet
 *   2. GET /guilds/{id}/members/{userId}  (bot token) → članstvo + sloge
 * Ako je WHITELIST_ROLE_ID postavljen — traži se ta uloga; inače je dovoljno članstvo servera.
 *
 * Body: { access_token }
 * Odgovor: { whitelisted: bool, user: { username, globalName } } | { error }
 * Token se NE čuva nigde i NE loguje.
 */

const DISCORD_API = 'https://discord.com/api/v10';

function pickUser(me) {
  return {
    username: typeof me.username === 'string' ? me.username.slice(0, 64) : 'unknown',
    globalName: typeof me.global_name === 'string' && me.global_name ? me.global_name.slice(0, 64) : null
  };
}

function createWhitelistVerifier({ botToken, guildId, whitelistRoleId, fetchImpl = fetch, timeoutMs = 5_000 }) {
  async function discordGet(url, authHeader) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return async function verify(accessToken) {
    // 1) Identitet
    let meRes;
    try {
      meRes = await discordGet(`${DISCORD_API}/users/@me`, `Bearer ${accessToken}`);
    } catch (error) {
      return { ok: false, status: 502, error: 'Discord API nedostupan (timeout?).' };
    }
    if (meRes.status === 401) return { ok: false, status: 401, error: 'Discord je odbio token — poveži ponovo.' };
    if (!meRes.ok) return { ok: false, status: 502, error: `Discord API vratio ${meRes.status}.` };
    let me;
    try { me = await meRes.json(); } catch { return { ok: false, status: 502, error: 'Neispravan odgovor Discord API-ja.' }; }
    const user = pickUser(me);
    if (!me.id) return { ok: false, status: 502, error: 'Neispravan odgovor Discord API-ja (nema user id).' };

    // 2) Članstvo + role
    if (!guildId) {
      // Bot nije konfigurisan za server — ne možemo proveriti; ne laži, javi launcher-u.
      return { ok: false, status: 503, error: 'Whitelist nije konfigurisan na botu (DISCORD_GUILD_ID fali).' };
    }
    let memberRes;
    try {
      memberRes = await discordGet(`${DISCORD_API}/guilds/${guildId}/members/${me.id}`, `Bot ${botToken}`);
    } catch (error) {
      return { ok: false, status: 502, error: 'Discord API nedostupan (timeout?).' };
    }
    if (memberRes.status === 404) {
      return { ok: true, whitelisted: false, user, reason: 'nije_clan' };
    }
    if (!memberRes.ok) {
      return { ok: false, status: 502, error: `Discord API vratio ${memberRes.status}.` };
    }
    let member;
    try { member = await memberRes.json(); } catch { return { ok: false, status: 502, error: 'Neispravan odgovor Discord API-ja.' }; }
    if (whitelistRoleId) {
      const roles = Array.isArray(member.roles) ? member.roles : [];
      return { ok: true, whitelisted: roles.includes(whitelistRoleId), user };
    }
    return { ok: true, whitelisted: true, user };
  };
}

module.exports = { createWhitelistVerifier };
