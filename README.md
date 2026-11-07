# Shandy — FiveM Roleplay Server Launcher

The official launcher for the **Shandy Roleplay** GTA V (FiveM) server.
Written from scratch as v2.0 — the previous version was analyzed with the
[REA](https://github.com/morluto/rea) tool and every issue found there is fixed
(see [`docs/ANALIZA.md`](docs/ANALIZA.md)).

Interested in using Shandy for **your** server? → **[docs/SALES.md](docs/SALES.md)**

![status](https://img.shields.io/badge/version-2.2.0-e01a2b?style=flat-square)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-111218?style=flat-square)
![license](https://img.shields.io/badge/license-ISC-111218?style=flat-square)

## Features

- **Live server status** — online/offline, players `/` max, occupancy bar, latency
  (polled in the main process, never from the page)
- **Unread badge** — a "N NEW" chip on announcements for posts newer than your last view (click panel = read)
- **Crash diagnostics** — local reports (max 5) in the Info modal; "Copy report" / "Report on GitHub" — nothing is sent automatically
- **FiveM presence** — "FiveM is running" chip (Windows tasklist) under the hero buttons
- **System tray** — optional ("Minimize to tray"): X hides the launcher instead of quitting; RPC and status stay alive with FiveM
- **One click — `CONNECT`** — opens `fivem://<host>:<port>` in the system FiveM client
- **Auto-update (electron-updater)** — checks on every start, downloads in-app with a
  progress bar (`MB/s`, percentage), "Restart to install" when done
- **Discord Rich Presence** — "Playing Shandy Roleplay · 43/64 players online" (optional;
  needs a Discord Application ID, see Configuration)
- **FiveM install detection** — on Windows, if FiveM is missing, the button becomes "DOWNLOAD FIVEM"
- **Occupancy history** — sparkline next to the player count (last ~60 min, stored in `userData`)
- **What's new** — notes for the latest release from GitHub, rendered inside the app
- **Announcements** — bundled posts + optional remote `announcementUrl` (JSON), ticker at the bottom
- **Modals** — Report (Discord ticket), Info (address, rules), Settings
  (auto-update, reduced motion, language, Minimize to tray, server & whitelist)
- **Multiple servers** — optional `servers[]` in config; pick in Settings (status/connect/RPC follow)
- **Whitelist via Discord** — implicit OAuth2; the token never persists anywhere
- Window with its own title bar; works as a browser preview too (demo data)
- Keyboard shortcuts: **F5 / Ctrl+R** — refresh status · **F11** — maximize · **Esc** — close modal

## Install & run

### Players

Download Shandy Launcher from the [Releases](https://github.com/Seekiii/shandy-launcher/releases)
page (Windows `.exe`/portable, macOS `.dmg`, Linux `.AppImage`).

### Development

```bash
git clone https://github.com/Seekiii/shandy-launcher.git
cd shandy-launcher
npm install        # downloads the Electron binary
npm start          # runs the launcher
```

Useful scripts:

```bash
npm test           # smoke test (49 checks: syntax, CSP, IPC parity, ids)
npm run preview    # browser preview of the renderer at http://localhost:8080 (demo data)
npm run dist       # package a distribution (electron-builder → dist/)
```

## Configuration

Built-in defaults (in `src/config.js`) can be overridden by:

1. `config.json` in the project root (dev) or next to the packaged binary / in `process.resourcesPath` (packaged) —
   see [`config.example.json`](config.example.json)
2. Environment variables:

| Variable | Description |
|---|---|
| `SHANDY_SERVER_HOST` | IP / hostname of the FiveM server |
| `SHANDY_SERVER_PORT` | Port (default `30120`) |
| `SHANDY_UPDATE_REPO` | `owner/repo` for GitHub Releases (empty = disabled) |
| `SHANDY_ANNOUNCEMENT_URL` | HTTPS URL returning a JSON array of announcements |
| `SHANDY_DISCORD_CLIENT_ID` | Discord Application ID for Rich Presence (17–20 digits; empty = RPC off) |
| `SHANDY_DISCORD_IMAGE_KEY` | Image key from the Discord developer portal (default `shandy`) |
| `SHANDY_CONFIG` | Explicit path to `config.json` |
| `SHANDY_DEV` | `1` = DevTools open on start |

### Discord Rich Presence

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → any name (e.g. "Shandy Launcher")
2. (Optional) **Rich Presence → Art Assets** → upload an image under the key `shandy`
3. Put the Application ID in `config.json` (`discord.clientId`) or in `SHANDY_DISCORD_CLIENT_ID`
4. Status refreshes automatically: "Playing Shandy Roleplay · 43/64 players online"

Without `clientId` the RPC never activates — the app runs normally, just without Discord presence.

Remote announcements (when `announcementUrl` is set) expect an array:

```json
[{ "date": "2026-11-06", "tag": "NAJAVA", "title": "Title", "text": "Text up to 500 chars." }]
```

## Security (in short)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload bridge with a
  minimal, sanitized API
- CSP: `default-src 'self'` — **zero** external scripts/styles/fonts
- All navigation and `window.open` are blocked; all https links open in the system browser
- IPC channels verify the sender; permissions (camera, geo, …) are denied
- Remote JSON (status, announcements, update) is validated and limited (512 KiB) in the main process

Details: [`docs/ANALIZA.md`](docs/ANALIZA.md) (internal, Serbian).

## Whitelist (Discord)

Point `whitelistApiUrl` in `config.json` (or env `SHANDY_WHITELIST_URL`) at the bot endpoint and
`discord.clientId` at the same Application ID (same as RPC/bot):

```json
{
  "whitelistApiUrl": "https://your-host.example.com/whitelist/verify",
  "discord": { "clientId": "1234567890123456789" }
}
```

1. Developer Portal → app → OAuth2 → **Redirects** += `shandy://whitelist` (scope: `identify`).
2. The bot must be on your guild (`DISCORD_GUILD_ID`); `WHITELIST_ROLE_ID` optionally narrows to one role
   (otherwise guild membership = whitelist).
3. In the launcher: **Settings → Whitelist (Discord) → Connect** → Discord opens → after sign-in
   the token returns through the `shandy://` link and the launcher reports "Active · <name>". The token is never stored.

Production: keep the endpoint behind HTTPS (caddy/nginx + Let's Encrypt) — the token travels the network, HTTP is only for LAN/VPS.

## Multiple servers

```json
{
  "servers": [
    { "name": "Shandy Roleplay", "host": "89.116.184.110", "port": 30120 },
    { "name": "Shandy Beta",    "host": "89.116.184.110", "port": 30121 }
  ]
}
```

When the array has 2+ entries, Settings shows a **Server** dropdown (status, CONNECT and the RPC presence
follow the selection). Without `servers` — behavior as before (one server, `server.*` from the config).

## Code signing (v2.0+ releases)

`.github/workflows/build.yml` forwards `CSC_LINK`/`CSC_KEY_PASSWORD` (Windows + macOS p12) and
`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` (macOS notarization). Without them the build
is unsigned (it builds, but SmartScreen/Gatekeeper warnings remain; macOS auto-update cannot install).
You buy the certificate — details and prices are in `docs/UNAPREDJENJA.md` P0 #2 (Serbian).

## Tests

```bash
npm test              # smoke (49 checks) — no Electron needed
node scripts/ipc-harness.js   # 25 IPC handlers against a stubbed Electron
npm run test:e2e      # Playwright e2e — requires: npm i -D playwright && npx playwright install chromium
```

## Language (sr / en)

The launcher speaks **Serbian** (default) and **English** — switch in **Settings → Language**.
English covers the whole main page and all modals; the rest (tray menu, main-process error messages,
Discord RPC labels, release-notes body) remains Serbian for now. The language is stored in
`settings.json` (`lang: "sr" | "en"`) and applied immediately.

## Discord bot (announcements from Discord → launcher)

The bot in [`bot/`](bot/) feeds launcher announcements from Discord:

```bash
cd bot && cp .env.example .env   # fill DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, ANNOUNCEMENTS_CHANNEL_ID
npm install && npm start
```

Staff publishes with **`/najava tag naslov tekst`** → the bot stores the post and sends an embed to `#announcements`,
and the launcher shows it through `GET /news.json` (point `announcementUrl` in `config.json` at `http://<bot-host>:8734/news.json`).
Also available: `/status` (live server status), `/obavestenja` (list), `/obrisi-najavu` (delete). **No privileged intents needed.**
Detailed instructions, invite URL and hosting (PM2/Docker): [`bot/README.md`](bot/README.md).

## Project structure

```
bot/                 # Discord bot — /najava, /status + /news.json for the launcher
src/
  main.js            # Electron main process — window, IPC, security, auto-update, RPC
  preload.js         # contextBridge — the only renderer ↔ Node bridge
  config.js          # configuration (defaults + config.json + env)
  fivem.js           # dynamic.json / info.json with timeout and cache
  fivem-install.js   # FiveM install detection (Windows)
  history.js         # occupancy history → sparkline (userData/player-history.json)
  changelog.js       # "What's new" — latest GitHub release
  discord-rpc.js     # Discord Rich Presence (@xhayper/discord-rpc)
  http-json.js       # minimal HTTP(S) JSON client
  update.js          # GitHub Releases check (fallback when the updater is not in play)
  settings.js        # userData/settings.json (autoUpdateCheck, reducedMotion, …)
  news.js            # bundled default announcements
  renderer/          # UI (no framework): index.html, styles.css, renderer.js, i18n.js
build/               # icon.png / icon.ico / icon.icns / icon-master.png (electron-builder)
scripts/
  preview.js         # static server for the browser preview (0.0.0.0:8080)
  smoke-test.js      # npm test
  ipc-harness.js     # IPC contract check on a stubbed Electron
  e2e.js             # Playwright end-to-end (optional; needs a browser install)
docs/
  SALES.md               # commercial license & product overview (English)
  ANALIZA.md             # REA analysis of the legacy version + change map (Serbian)
  rea-evidence-summary.json  # machine-readable REA output summary
  UNAPREDJENJA.md        # engineering changelog & roadmap (Serbian)
```

## Build & release

```bash
npm run dist          # package locally into dist/ (NSIS/portable, DMG, AppImage)
scripts/release-notes.sh           # markdown notes from commits since the last tag
git tag v2.2.0 && git push origin v2.2.0   # CI builds all platforms + publishes
npm run dist:publish  # or locally: upload releases to GitHub (needs GH_TOKEN)
```

Two workflows:

- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) — on every push/PR:
  launcher `npm test` (49 checks), **IPC harness** (`scripts/ipc-harness.js`, 25 handlers
  on a stubbed Electron), bot `npm test` (25 checks), `npm audit` (informational).
- **Build & Release** ([.github/workflows/build.yml](.github/workflows/build.yml)) — on `v*` tags:
  Windows/macOS/Linux build + artifact publish to GitHub Releases with `--generate-notes`
  (includes `latest*.yml` — in-app auto-update works end-to-end).

Dependabot ([.github/dependabot.yml](.github/dependabot.yml)) opens weekly PRs for
`npm` (root and `bot/`, grouped) and `github-actions`.

Without any published releases, the update check quietly behaves as "up to date".

## License

[ISC](LICENSE) © Shandy Roleplay — for commercial/self-hosted licensing of the
white-label product, see [`docs/SALES.md`](docs/SALES.md).
