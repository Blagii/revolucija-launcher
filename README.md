# Revolucija Roleplay — Launcher

Zvanični launcher za **Revolucija Roleplay** GTA V (FiveM) server.
Nova, od nule pisana v2.0 — prethodna verzija je analizirana alatom
[REA](https://github.com/morluto/rea) i svi njeni problemi su otklonjeni
(vidi [`docs/ANALIZA.md`](docs/ANALIZA.md)).

![status](https://img.shields.io/badge/version-2.1.0-e01a2b?style=flat-square)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-111218?style=flat-square)
![license](https://img.shields.io/badge/license-ISC-111218?style=flat-square)

## Šta radi

- **Živi status servera** — online/offline, broj igrača `/` max, popunjenost (traka), latencija
  (pozivi se rade u glavnom procesu, nikada iz renderera)
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

## Struktura

```
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
git tag v2.1.0 && git push origin v2.1.0   # CI pakuje sve platforme
npm run dist:publish  # ili lokalno: upiše izdanja na GitHub (potreban GH_TOKEN)
```

Push taga `v*` pokreće [GitHub Actions](.github/workflows/build.yml) koji pakuje
Windows/macOS/Linux artefakte. Kada su release artefakti objavljeni,
**auto-update u aplikaciji radi end-to-end** (preuzimanje + instalacija iz launchera).
Bez objavljenih izdanja, provera ažuriranja se tiho ponaša kao „sveže“.

## Licenca

[ISC](LICENSE) © Revolucija Roleplay
