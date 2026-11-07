> Internal engineering changelog & roadmap (Serbian). English summary: numbered list of every improvement shipped in v2.0–v2.2 and what remains blocked (code-signing certificate).

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

### 1. ✅ Whitelist — prava provera umesto mrljavog obećanja — IMPLEMENTIRANO (v2.2.0)
- Bot: `POST /whitelist/verify` (bot/src/whitelist.js) — user token ide Discord-u (`/users/@me`),
  bot token proverava članstvo/uloge (`/guilds/{id}/members/{id}`); `WHITELIST_ROLE_ID` bira ulogu,
  bez nje je dovoljno članstvo. Rate limit 20/min po IP-u, body cap 4 KiB, token se NE čuva ni loguje.
- Launcher: Discord **implicitni OAuth** (response_type=token) kroz sistemski browser;
  callback kroz `shandy://whitelist` (protokol registrovan u electron-builder +
  setAsDefaultProtocolClient; second-instance/open-url/argv svi obrađeni). Launcher nikad ne drži tajnu.
- Rezultat se kešira u settings (`whitelistUser`/`whitelistVerifiedAt`) — prikazuje se u Postavke →
  Whitelist (Discord) red; „Poveži / Odvezi“. Backend nedostupan ≠ „nisi na whitelist-i“ (drugačije poruke).
- ŠTA TREBA KORISNIKU (jednom): (1) Developer Portal → app → OAuth2 → Redirects += `shandy://whitelist`;
  (2) `whitelistApiUrl` u config.json/SHANDY_WHITELIST_URL (u produkciji **HTTPS** — token ide mrežom;
  LAN/VPS HTTP je prihvaćen ali svesno); (3) bot mora biti na guild-u (ima DISCORD_GUILD_ID) — bez njega
  endpoint vraća 503/404, nikad lažno „whitelisted“.
- Ostalo za kasnije: automatska re-provera (token je 7-dnevni — sad je ručni „Odvezi/Poveži“), avatar.

### 2. ⚠️ Potpisivanje koda — CI SPREMAN, ČEKA CERTIFIKAT (novac, ne kod)
- `build.yml`: `CSC_LINK` + `CSC_KEY_PASSWORD` (Windows + macOS p12), `APPLE_ID` +
  `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` (macOS notarize) — electron-builder ih sam detektuje;
  bez njih unsigned build prolazi (ali SmartScreen/Gatekeeper upozorenja ostaju).
- Bez sertifikata: macOS auto-update NE MOŽE, Windows start ima SmartScreen frikciju.
- Kupiti: OV/EV (SSL.com/Certum ~70–250 €/god) ili Apple Developer (99 USD/god) — odluka je tvoja;
  ja ne mogu „improvizovati“ validan potpis. Linux AppImage radi potpuno bez pečata.

### 3. ✅ Ikona u tray + „Minimizuj u tray" — URAĐENO (v2.2.0)
Tray sa menijem (Otvori / Zatvori), klik na ikonu toggle-uje prozor, `settings.minimizeToTray`,
`second-instance` i X rade kroz istu logiku. RPC + polling žive dok je prozor sakriven.
Sledeći koraci: unread badge na tray ikonici (vidi #15), native OS notifikacija pri novoj objavi.

## P1 — brze pobede (sati, ne dani)

4. ✅ **FiveM presence detection** — `fivem:process-status` IPC (tasklist, 4 s timeout, samo Windows),
   chip u hero sekciji; RPC i status rade nezavisno od njega.
5. ✅ **Dependabot** (`.github/dependabot.yml`, nedeljno: npm root+bot grupisano, actions) — URAĐENO. **`npm audit`** u CI (`ci.yml`, informativno job).
6. ✅ **Harness test u CI** — `scripts/ipc-harness.js` (stubovan Electron, exit 1 ako neki od 25 handlera fali) pokreće se u `ci.yml` na svaki push/PR.
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
12. ✅ **Multi-server podrška** — `servers: [{ name, host, port }]` (max 5) u config.json;
   izbor u Postavke → Server (dropdown, samo kad ih je >1); `settings.serverIndex`;
   `effectiveConfig()` napaja status/connect/RPC/appInfo; RPC ime prati izabrani server.
13. ✅ **i18n (sr/en)** — `src/renderer/i18n.js` (SR podrazumevano, `t(key, {vars})`, fallback sr na
   nedostajući ključ); svi statički tekstovi u markup-u nose `data-i18n`; JS stringovi (toast-ovi,
   dugmad, statusi, whitelist/server red) kroz `i18nT()`; Postavke → **Jezik** (`settings.lang`),
   promena = primenjeno odmah (bez reload-a za tekstove, `settings` se perzistira).
   Svesno ostalo na srpskom: tray meni + greške iz main procesa (renderer i18n ne seže tamo),
   Discord RPC presence, release notes telo. Verifikovano kroz jsdom init/SR/EN ciklus.
14. ✅ **Playwright e2e** — `scripts/e2e.js` (`npm run test:e2e`): pokreće preview, proverava CSP/title,
   hero, toast u PREVIEW režimu, modale + Escape, obaveštenja listu. Lokalno: `npm i -D playwright &&
   npx playwright install chromium`. U sandbox-u browser CDN blokiran (ne može da se pokrene ovde).
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
