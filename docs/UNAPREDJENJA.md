# Šta još može da se unapredi — revizija posle v2.2.0

Iskrena revizija koda (main/preload/renderer/bot) — šta je gotovo, šta vredi raditi dalje,
po prioritetu i naporu. Ništa od P2 nije "treba nam sad" — sve je opciono.

## ✅ Urađeno ovim pass-om (v2.2.0)

- Prozor je normalan launcher: **1152×648** (pre: 1280×720 skoro pun ekran na manjim
  monitorima), centriran, adaptira se na `workArea` sa marginama; min 960×540.
- Renderer crash-guard: 3 uzastopna pada procesa → aplikacija se zatvara umesto
  beskonačnog `reload()` petlje.
- **System tray** (P0 #3): prozor ostaje u tray-u ako je uključeno „Minimizuj u tray"
  (Postavke → X sakriva umesto gašenja; klik na tray ikonu ili "Otvori launcher" vraća prozor;
  RPC i status nastavljaju da rade). Ikona: `src/renderer/icon.png`.
- Modali: **Tab/Shift+Tab focus trap** (focus ne izlazi iz dijaloga), `Ctrl+W` zatvara prozor.
- Klin na „POVEŽI SE" na macOS/Linux: jasna poruka umesto tihe neuspešne akcije
  (FiveM je Windows-only).
- Bot: HTTP keš `/news.json` se **odmah poništava** posle `/najava` i `/obrisi-najavu`
  (pre: do 30 s zastarelih podataka) — dokazano e2e testom.
- Bot: cooldown je sada **po komandi** (`/najava` ne blokira `/obrisi-najavu`),
  sa periodičnim čišćenjem cooldown mapa.

## P0 — sledeći logički korak (preporučujem)

### 1. Whitelist — prava provera umesto mrljavog obećanja
- Launcher ne može da zna ko je igrač. Potreban backend:
  `GET https://whitelist.revolucija.gg/check` iza Discord OAuth2.
- Launcher strana: u `src/main.js` handler koji posle logina (deep-link `revolucija://auth?code=...`
  ili sistem browser + lokalni loopback port) pozove backend i pošalje `whitelisted: true|false`
  rendereru; UI prikazuje banner samo na osnovu stvarnog odgovora.
- Procena: backend 0.5–1 d, launcher strana ~150 linija, deep-link protokol registration u electron-builder.

### 2. Potpisivanje koda (auto-update bez drame)
- Windows: cert (OV/EV) → SmartScreen nestaje; MSIX/NSIS bolje prolazi.
- macOS: bez validnog potpisa auto-update **ne može** da instalira (Gatekeeper).
- Linux AppImage radi potpuno bez pečata.
- Procena: organizacijski (cert + CI secrets), ne kod.

### 3. ✅ Ikona u tray + „Minimizuj u tray" — URAĐENO (v2.2.0)
Tray sa menijem (Otvori / Zatvori), klik na ikonu toggle-uje prozor, `settings.minimizeToTray`,
`second-instance` i X rade kroz istu logiku. RPC + polling žive dok je prozor sakriven.
Sledeći koraci: unread badge na tray ikonici (vidi #15), native OS notifikacija pri novoj objavi.

## P1 — brze pobede (sati, ne dani)

4. **FiveM presence detection** — umesto slepog `fivem://`, čitaj procese (`tasklist`/`ps`):
   prikaži „FiveM je pokrenut" + onemogući dupliran klik dok FiveM nije startovao.
5. **Dependabot** (`.github/dependabot.yml`) + `npm audit` u CI — supply-chain higijena.
6. **Harness test u CI** — `ipc-harness.js` (stubovan Electron) u GitHub Actions:
   registruje svih 17 handlera + `news:list` remote/local pad na svaki push.
7. **Changelog iz git tagova** — `git log v2.1.0..HEAD --oneline` u Release notes kroz
   `gh release create --generate-notes` (nula dodatnog koda).
8. **Brži prvi paint** — `backgroundColor` već crna; dodaj `show: false` → pokaži posle
   `ready-to-show` (već postoji) + `content-visibility` na obaveštenja ako lista naraste.

## P2 — kad bude vremena / potrebe

9. **Bot: zakazane objave** (`/najava at:18:00 …` + `scheduledAt` u store + interval provera)
   — najava restarta unapred bez noćnog dežurnog.
10. **Bot: FiveM webhook bridge** — server šalje POST na bota pri restartu/stop eventu,
    bot automatski pravi objavu „Server se restartuje". (Traži auth token bota.)
11. **Crash reporting opciono** — Sentry self-hosted ili čist fajl log + „Pošalji izveštaj"
    dugme u Informacije modalu; **nikad** bez izričitog opt-in i bez ličnih podataka.
12. **Multi-server podrška** — ako ikad bude drugi RP server: store endpoints u config.json,
    switch u Postavkama, ostatak netaknut.
13. **i18n (sr/en)** — sve stringove u jedan modul; trenutno su hardkodirane po fajlovima.
14. **Playwright e2e** za renderer u preview režimu (klik kroz modale, connect flow demo);
    sada postoje samo statičke smoke provere + manuelni browser preview.
15. **Announcements read/unread** — badge na ikonici launchera za nove objave (samo in-app, ne OS).

## Bezbednosna pravila koja nijedan upgrade ne sme da dira

- `nodeIntegration: false`, `sandbox: true`, `contextIsolation: true` — uvek.
- CSP `default-src 'self'` — nikakav novi CDN resurs, ni ikonica, ni font.
- Spoljni URL-ovi samo kroz `link:open` sa `https:` whitelist-om.
- IPC handlers proveravaju `event.sender === mainWindow.webContents`.
- `.env` / `config.json` / `player-history.json` nikad u git; token bota samo u env.

## Napomene o merenju

- Bot: 13 testova + 2 e2e scenarija prolaze. Launcher: 49 smoke provera.
- Predlog metrike: `electron-builder` CI vreme, veličina artefakta, broj crash reporta
  (kad se #11 uvede), broj aktivnih igrača kroz RPC heartbeat.
