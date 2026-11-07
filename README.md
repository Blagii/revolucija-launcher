# Revolucija Roleplay — Launcher

Zvanični launcher za **Revolucija Roleplay** GTA V (FiveM) server.
Nova, od nule pisana v2.0 — prethodna verzija je analizirana alatom
[REA](https://github.com/morluto/rea) i svi njeni problemi su otklonjeni
(vidi [`docs/ANALIZA.md`](docs/ANALIZA.md)).

![status](https://img.shields.io/badge/version-2.2.0-e01a2b?style=flat-square)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-111218?style=flat-square)
![license](https://img.shields.io/badge/license-ISC-111218?style=flat-square)

## Šta radi

- **Živi status servera** — online/offline, broj igrača `/` max, popunjenost (traka), latencija
  (pozivi se rade u glavnom procesu, nikada iz renderera)
- **Unread badge** — chip „N NOVE" na obaveštenjima za objave novije od poslednjeg viđanja (klik na panel = pročitano)
- **Crash dijagnostika** — lokalni izveštaji (max 5) u Info modalu; „Kopiraj izveštaj" / „Prijavi na GitHub-u" — ništa se ne šalje automatski
- **FiveM presence** — badge „FiveM je pokrenut" (tasklist, samo Windows) ispod hero dugmadi
- **System tray** — opciono ("Minimizuj u tray"): X sakriva launcher umesto gašenja; RPC i status žive uz FiveM
- **Jedan klik — `POVEŽI SE`** — otvara `fivem://<host>:<port>` u sistemskom FiveM klijentu
- **Auto-update (electron-updater)** — provera na svakom startu, preuzimanje unutar aplikacije
  sa progres barom (`MB/s`, procenat), „Restartuj i instaliraj“ kad je gotovo
- **Discord Rich Presence** — u Discord-u vidi „Igra Revolucija Roleplay · 43/64 igrača online“
  (opcionalno; potreban Discord Application ID, vidi Konfiguracija)
- **Detekcija FiveM instalacije** — na Windows-u, ako FiveM fali, dugme postaje „PREUZMI FIVEM“
- **Istorija popunjenosti** — sparkline pored broja igrača (poslednjih ~60 min, čuva se u `userData`)
- **Šta je novo** — napomene uz poslednje izdanje sa GitHub-a, renderovane unutar aplikacije
- **Obaveštenja** — ugrađene objave + opcioni udaljeni `announcementUrl` (JSON), ticker na dnu
- **Modali** — Prijavi (ticket na Discord-u), Informacije (adresa, pravila), Postavke
  (auto-update, reduced motion)
- **Frameless prozor** sa sopstvenom naslovnom trakom; radi i kao browser preview (demo podaci)
- Klavijaturne prečice: **F5 / Ctrl+R** — osveži status · **F11** — maksimizuj · **Esc** — zatvori modal

## Instaliraj i pokreni

### Korisnici

Preuzmi gotov `Revolucija Launcher` sa [Releases](https://github.com/Seekiii/revolucija-launcher/releases)
stranice (Windows `.exe`/portable, macOS `.dmg`, Linux `.AppImage`).

### Razvoj

```bash
git clone https://github.com/Seekiii/revolucija-launcher.git
cd revolucija-launcher
npm install        # preuzima i Electron binary
npm start          # pokreće launcher
```

Korisni skriptovi:

```bash
npm test           # smoke-test (37 provera: sintaksa, CSP, IPC paritet, id-jevi)
npm run preview    # browser preview renderera na http://localhost:8080 (demo podaci)
npm run dist       # pakuje distribuciju (electron-builder → dist/)
```

## Konfiguracija

Ugrađeni default-ovi (u `src/config.js`) se mogu pregaziti:

1. `config.json` u korenu projekta (dev) ili pored binarnog izdanja / u `process.resourcesPath` (upakovano) —
   vidi [`config.example.json`](config.example.json)
2. Environment varijable:

| Varijabla | Opis |
|---|---|
| `REVOLUCIJA_SERVER_HOST` | IP / hostname FiveM servera |
| `REVOLUCIJA_SERVER_PORT` | Port (default `30120`) |
| `REVOLUCIJA_UPDATE_REPO` | `owner/repo` za GitHub Releases (prazno = ugašeno) |
| `REVOLUCIJA_ANNOUNCEMENT_URL` | HTTPS URL koji vraća JSON niz obaveštenja |
| `REVOLUCIJA_DISCORD_CLIENT_ID` | Discord Application ID za Rich Presence (17–20 cifara; prazno = RPC ugašen) |
| `REVOLUCIJA_DISCORD_IMAGE_KEY` | Ključ slike iz Discord developer portala (default `revolucija`) |
| `REVOLUCIJA_CONFIG` | Eksplicitna putanja do `config.json` |
| `REVOLUCIJA_DEV` | `1` = DevTools su otvoreni pri startu |

### Discord Rich Presence

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → bilo koje ime (npr. „Revolucija Launcher“)
2. (Opcionalno) **Rich Presence → Art Assets** → upload slike pod ključem `revolucija`
3. Postavi Application ID u `config.json` (`discord.clientId`) ili u `REVOLUCIJA_DISCORD_CLIENT_ID`
4. Status se sam osvežava svakih par sekundi: „Igra Revolucija Roleplay · 43/64 igrača online“

Bez `clientId`-ja se RPC uopšte ne aktivira — aplikacija radi normalno, samo bez Discord statusa.

Udaljena obaveštenja (ako je `announcementUrl` postavljen) očekuju niz:

```json
[{ "date": "2026-11-06", "tag": "NAJAVA", "title": "Naslov", "text": "Tekst do 500 znakova." }]
```

## Bezbednost (ukratko)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload bridge sa
  minimalnim, sanitizovanim API-jem
- CSP: `default-src 'self'` — **nula** spoljnih skripti/stilova/fontova (jQuery je uklonjen)
- Sve navigacije i `window.open` su blokirani; svi https linkovi se otvaraju u sistemskom browseru
- IPC kanali proveravaju pošiljioca; permisije (kamera, geo, …) se odbijaju
- Udaljeni JSON (status, obaveštenja, update) se validira i ograničava (512 KiB) u main procesu

Detalji: [`docs/ANALIZA.md`](docs/ANALIZA.md).

## Whitelist (provera preko Discord-a)

Postavi `whitelistApiUrl` u `config.json` (ili env `REVOLUCIJA_WHITELIST_URL`) na bot endpoint i
`discord.clientId` na isti Application ID (isti kao RPC/bot):

```json
{
  "whitelistApiUrl": "https://nas-vot.example.com/whitelist/verify",
  "discord": { "clientId": "1234567890123456789" }
}
```

1. Developer Portal → app → OAuth2 → **Redirects** += `revolucija://whitelist` (scope: `identify`).
2. Bot mora biti na guild-u (`DISCORD_GUILD_ID`); `WHITELIST_ROLE_ID` opciono sužava na jednu ulogu
   (bez nje: članstvo = whitelist).
3. U launcheru: **Postavke → Whitelist (Discord) → Poveži** → otvara se Discord → posle prijave
   token se vraća kroz `revolucija://` link i launcher kaže „Aktivna · <ime>“. Token se nigde ne čuva.

Produkcija: drži endpoint iza HTTPS (caddy/nginx + Let's Encrypt) — token ide mrežom, HTTP samo za LAN/VPS.

## Više servera (multi-server)

```json
{
  "servers": [
    { "name": "Revolucija Roleplay", "host": "89.116.184.110", "port": 30120 },
    { "name": "Revolucija Beta",    "host": "89.116.184.110", "port": 30121 }
  ]
}
```

Kada niz ima 2+ unosa, Postavke dobijaju padajući **Server** izbor (status, POVEŽI SE i povezani
RPC prate izabrani). Bez `servers` → ponašanje kao do sada (jedan server, `server.*` iz configa).

## Code signing (v2.0+ release-ovi)

`.github/workflows/build.yml` prosleđuje `CSC_LINK`/`CSC_KEY_PASSWORD` (Windows + macOS) i
`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` (macOS notarizacija). Bez njih build je
unsigned (prolazi, ali SmartScreen/Gatekeeper upozoravaju; macOS auto-update ne instalira).
Sertifikat kupuješ ti — detalji i cene su u `docs/UNAPREDJENJA.md` P0 #2.

## Testovi

```bash
npm test              # smoke (49 provera) — bez Electron-a
node scripts/ipc-harness.js   # 25 IPC handlera na stubovanom Electron-u
npm run test:e2e      # Playwright e2e — traži: npm i -D playwright && npx playwright install chromium
```

## Jezik (sr / en)

Launcher govori srpski (podrazumevano) i engleski — menja se u **Postavke → Jezik**.
Engleski pokriva celu glavnu stranicu i sve modale; ostalo (tray meni, greške main procesa,
Discord RPC nazivi, telo release notes) je srpski za sada. Jezik se čuva u `settings.json`
(`lang: "sr" | "en"`) i primenjuje odmah po izboru.

## Discord bot (obaveštenja iz Discord-a → launcher)

Bot u [`bot/`](bot/) napaja launcher obaveštenjima iz Discord-a:

```bash
cd bot && cp .env.example .env   # popuni DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, ANNOUNCEMENTS_CHANNEL_ID
npm install && npm start
```

Staff objavljuje sa **`/najava tag naslov tekst`** → bot čuva objavu i šalje embed u `#obaveštenja`,
a launcher je prikazuje kroz `GET /news.json` (podesi `announcementUrl` u `config.json` na `http://<ip-bota>:8734/news.json`).
Tu su i `/status` (uživo status servera), `/obavestenja` i `/obrisi-najavu`. **Ne trebaju privileged intents.**
Detaljno uputstvo, invite URL i hosting (PM2/Docker): [`bot/README.md`](bot/README.md).

## Struktura

```
bot/                 # Discord bot — /najava, /status + /news.json za launcher
src/
  main.js            # Electron main proces — prozor, IPC, bezbednost, auto-update, RPC
  preload.js         # contextBridge — jedini most renderer ↔ Node
  config.js          # konfiguracija (default-ovi + config.json + env)
  fivem.js           # dynamic.json / info.json sa timeoutom i kešom
  fivem-install.js   # detekcija FiveM instalacije (Windows)
  history.js         # istorija popunjenosti → sparkline (userData/player-history.json)
  changelog.js       # "Šta je novo" — poslednje GitHub izdanje
  discord-rpc.js     # Discord Rich Presence (@xhayper/discord-rpc)
  http-json.js       # minimalni HTTP(S) JSON klijent
  update.js          # GitHub Releases provera (fallback kada updater nije u igri)
  settings.js        # userData/settings.json (autoUpdateCheck, reducedMotion)
  news.js            # ugrađene podrazumevane objave
  renderer/          # UI (bez frameworka): index.html, styles.css, renderer.js
build/               # icon.png / icon.ico / icon.icns (electron-builder)
scripts/
  preview.js         # static server za browser preview (0.0.0.0:8080)
  smoke-test.js      # npm test
docs/
  ANALIZA.md               # REA analiza stare verzije + mapa promena
  rea-evidence-summary.json# mašinonski sažetak REA output-a
```

## Build i release

```bash
npm run dist          # lokalno pakuje u dist/ (NSIS/portable, DMG, AppImage)
scripts/release-notes.sh           # markdown notes iz commit-a od poslednjeg taga
git tag v2.2.0 && git push origin v2.2.0   # CI pakuje sve platforme + objavljuje
npm run dist:publish  # ili lokalno: upiše izdanja na GitHub (potreban GH_TOKEN)
```

Dva workflow-a:

- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) — na svaki push/PR:
  launcher `npm test` (49 provera), **IPC harness** (`scripts/ipc-harness.js`, 25 handlera
  na stubovanom Electron-u), bot `npm test` (25 provera), `npm audit` (informativno).
- **Build & Release** ([.github/workflows/build.yml](.github/workflows/build.yml)) — na `v*` tagove:
  Windows/macOS/Linux build + objava artefakata na GitHub Release sa `--generate-notes`
  (`latest*.yml` uključeno — auto-update u aplikaciji radi end-to-end).

Dependabot ([.github/dependabot.yml](.github/dependabot.yml)) svake nedelje otvara PR-ove
za `npm` (root i `bot/`, grupisano) i `github-actions`.

Bez objavljenih izdanja, provera ažuriranja se tiho ponaša kao „sveže“.

## Licenca

[ISC](LICENSE) © Revolucija Roleplay
