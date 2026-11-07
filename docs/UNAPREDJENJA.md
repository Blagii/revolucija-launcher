# Šta još može da se unapredi — revizija posle v2.2.0

Iskrena revizija koda (main/preload/renderer/bot) — šta je gotovo, šta vredi raditi dalje,
po prioritetu i naporu. Ništa od P2 nije "treba nam sad" — sve je opciono.

## ✅ Urađeno ovim pass-om (v2.2.0)

- Prozor je normalan launcher: **1152×648** (pre: 1280×720 skoro pun ekran na manjim
  monitorima), centriran, adaptira se na `workArea` sa marginama; min 960×540.
- Renderer crash-guard: 3 uzastopna pada procesa → aplikacija se zatvara umesto
  beskonačnog `reload()` petlje.
- **FiveM presence detection** (P1 #4): tasklist preko IPC-a (`fivem:process-status`),
  Windows-only; chip „FIVEM JE POKRENUT — klikni POVEŽI SE" pod hero dugmetom (30 s poll),
  `running: null` = nepoznato, nikad lažno „nije pokrenut".
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

4. ✅ **FiveM presence detection** — `fivem:process-status` IPC (tasklist, 4 s timeout, samo Windows),
   chip u hero sekciji; RPC i status rade nezavisno od njega.
5. ✅ **Dependabot** (`.github/dependabot.yml`, nedeljno: npm root+bot grupisano, actions) — URAĐENO. **`npm audit`** u CI (`ci.yml`, informativno job).
6. ✅ **Harness test u CI** — `scripts/ipc-harness.js` (stubovan Electron, exit 1 ako neki od 17 handlera fali) pokreće se u `ci.yml` na svaki push/PR.
7. ✅ **Changelog iz tagova** — `scripts/release-notes.sh` (lokalni markdown notes) +
   `build.yml` objavljuje Release na `v*` tag sa `--generate-notes` i upload-uje `dist/*`
   (uključujući `latest*.yml` za auto-update). Tag push = kompletan release.
8. ✅ **Brži prvi paint** — `content-visibility: auto` + `contain-intrinsic-size` na `.news-item`
   (dugačke liste se ne re-rasturiju van ekrana).

## P2 — kad bude vremena / potrebe

9. ✅ **Bot: zakazane objave** — `/najava … vreme:18:30` (`HH:MM` danas/sutra ili `YYYY-MM-DD HH:MM`,
   TZ bota); store drži `scheduledAt`/`delivered`, scheduler svakih 30 s isporučuje u kanal + /news.json,
   `/obavestenja` pokazuje sekciju „Zakazano". E2E testiran.
10. ✅ **Bot: FiveM webhook bridge** — `POST /webhook/fivem` sa Bearer `WEBHOOK_SECRET`,
   whitelist event-ovi (`restart|start|maintenance`, strogi šabloni + sanitizovan `details`),
   10 s prozor na uspešnu objavu, 404 dok secret nije postavljen. Testirano (401/400/201/404).
11. ✅ **Crash reporting — lokalni, bez servera** — izveštaji u `userData/crashes/` (max 5,
   homedir → `~`, bez PII), Info modal → Dijagnostika: „Kopiraj izveštaj" i „Prijavi na GitHub-u"
   (prepopunjen issue) i „Obriši". Ništa se ne šalje automatski; prijava je uvek eksplicitan klik.
12. **Multi-server podrška** — tek ako ikad bude drugi RP server: store endpoints u config.json,
   switch u Postavkama, ostatak netaknut.
13. **i18n (sr/en)** — sav tekst u jedan modul; danas je hardkodiran po fajlovima. (Za srpsko
   govorno područje — niskog prioriteta.)
14. ⏸️ **Playwright e2e** — blokiran mrežom u sandbox-u (browser CDN nedostupan); smoke + IPC harness
   pokrivaju statičke klase grešaka. Na tvom računaru: `npm i -D playwright && npx playwright install`,
   skripta u `scripts/e2e.js` protiv `npm run preview`.
15. ✅ **Announcements read/unread** — `settings.newsSeenAt` (YYYY-MM-DD); chip „N NOVE“ u zaglavlju
   OBAVEŠTENJA broji objave novije od poslednjeg viđanja; klik na panel = pročitano; baseline se
   postavlja tiho pri prvom startu (nema retro-badge). OS/tray badge svesno nije uključen.

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
