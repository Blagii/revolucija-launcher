# Shandy Launcher Bot

Discord bot that **feeds launcher announcements from Discord** and adds a few
handy slash commands for staff and players.

```
Staff: /najava tag naslov tekst
        │
        ▼
   announcements.json  ──HTTP /news.json──►  launcher (announcementUrl)
        │                                       (refreshes every 5 min,
        ▼                                        or on start)
   #announcements channel (embed)
```

Works **without privileged intents** — everything goes through slash commands,
it never reads channel messages.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/najava tag naslov tekst [vreme]` | staff (`Manage Messages` or `STAFF_ROLE_ID`) | Stores the announcement and posts an embed in `#announcements`; the launcher shows it via `/news.json`. **`vreme`** → schedule: `18:30` (today/tomorrow) or `YYYY-MM-DD HH:MM` |
| `/obavestenja` | everyone (ephemeral) | Last 5 announcements with IDs |
| `/obrisi-najavu id` | staff | Delete an announcement by ID |
| `/status` | everyone | Live FiveM server status (players x/y, map, mode) read from `dynamic.json` |

Tags: `NAJAVA` (default, "announcement") · `EVENT` · `IZMENA` ("change") · `INFO`. The launcher maps colors automatically.

## Scheduled announcements

`/najava tag naslov tekst vreme:18:30` — the post is stored as **scheduled** (the launcher cannot see it yet); the scheduler delivers it to the channel + exposes it via `/news.json` every 30 s. `/obavestenja` shows a "Scheduled" section with Discord timestamps. `/obrisi-najavu` works on scheduled posts too.
Time is interpreted in the bot's `TZ` (default: environment TZ — for Serbia use `TZ=Europe/Belgrade` in `.env`).

## FiveM webhook (auto-posts from the game/scripts)

POST to the bot to auto-publish (e.g. on restart):

```bash
curl -X POST http://<bot-host>:8734/webhook/fivem \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"restart","details":"Restart for update, we are back in 5"}'
```

- Events: `restart` · `start` · `maintenance` (templates — content is strictly controlled, no injection)
- `WEBHOOK_SECRET` unset → webhook **does not exist** (404). No secret, no posting.
- Rate limit: one successful post per 10 s. `details` is sanitized (mentions stripped, max 500 chars).
- FiveM side: a server-side script (e.g. `@oxmysql/lib` http) calls this endpoint on `onResourceStart`/restart events.

## 1. Discord application & bot (one application for everything)

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** (e.g. "Shandy Launcher" — the same ID can be used for Rich Presence)
2. **Bot** → *Add Bot* → copy the **Token** → `DISCORD_TOKEN`
3. **General Information** → copy the **Application ID** → `DISCORD_CLIENT_ID`
4. **OAuth2 → URL Generator**:
   - Scopes: `bot` + `applications.commands`
   - Bot Permissions: **Send Messages** (2048) + **Embed Links** (16384) → sum **18432**
   - Open the generated URL and add the bot to **your Shandy server**
5. Server ID: Discord → settings → **Advanced** → *Developer Mode* ON → right-click server → **Copy Server ID** → `DISCORD_GUILD_ID`
6. Announcements channel ID: right-click `#announcements` → **Copy Channel ID** → `ANNOUNCEMENTS_CHANNEL_ID`
7. Staff role ID (optional): server settings → *Roles* → right-click → **Copy Role ID** → `STAFF_ROLE_ID`

Privileged intents: **not required.** Do not enable them.

## 2. Setup

```bash
cd bot
cp .env.example .env      # fill in the values
npm install
npm test                  # 25 checks (no Discord needed)
npm start
```

On start the bot:

- registers slash commands on your guild (instant, no global wait),
- serves HTTP on `BOT_HTTP_BIND:BOT_HTTP_PORT` (default `0.0.0.0:8734`),
- serves `/healthz` for monitoring.

Never commit `.env` (already in `.gitignore`).

## 3. Connect the launcher to the bot

In the launcher's `config.json`:

```json
{
  "announcementUrl": "http://<bot-host>:8734/news.json"
}
```

or the `SHANDY_ANNOUNCEMENT_URL` environment variable. Done — launcher announcements now come from the bot's store.

Test locally: `curl http://127.0.0.1:8734/news.json` after running `/najava` in Discord.

## 4. Hosting

**PM2 (VPS):**
```bash
npm i -g pm2
cd bot && pm2 start src/index.js --name shandy-bot && pm2 save
```

**Docker:**
```bash
docker build -t shandy-bot ./bot
docker run -d --name shandy-bot --restart unless-stopped \
  -v $(pwd)/bot/data:/app/data \
  --env-file bot/.env \
  -p 8734:8734 shandy-bot
```

**Notes:**

- The bot must be reachable from the internet for worldwide launchers to read `/news.json` (or keep it on the same host as the server for a private LAN).
- The endpoint is public and read-only — **do not put secrets in announcements**. There is no auth (and none is needed: content is public in `#announcements`).
- `BOT_DATA_FILE` stores all announcements atomically; backup = copy that file.
- If you change the PORT, change `announcementUrl` in the launcher too.

## 5. `/news.json` contract

```json
[{ "date": "2026-11-07", "tag": "NAJAVA", "title": "Restart on Friday", "text": "Server resets at 04:00." }]
```

The launcher additionally sanitizes everything before display (length, escaping, field whitelist), so the format is safe even if someone writes directly into `announcements.json`.

## Whitelist verification

`POST /whitelist/verify` — see [../README.md](../README.md#whitelist-discord). Discord Developer Portal → OAuth2 → Redirects += `shandy://whitelist` (scope `identify`).

Environment: `WHITELIST_ROLE_ID` (optional) — when set, only members holding that role count as whitelisted;
otherwise guild membership is enough. Requires `DISCORD_GUILD_ID`; without it the endpoint answers 503 (never a fake "whitelisted").

The endpoint rate-limits (20/min per IP), caps bodies at 4 KiB and never logs or stores player tokens.

---

Tag names in Discord remain Serbian (`NAJAVA`, `IZMENA`) for compatibility with existing
deployments; the launcher maps them to localized labels and colors.
