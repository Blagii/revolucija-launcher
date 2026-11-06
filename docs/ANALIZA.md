# REA analiza stare verzije + šta je promenjeno u v2.0

Ovaj dokument sadrži rezultate statičke analize stare verzije launchera urađene alatom
[**REA — Reverse Engineer Anything**](https://github.com/morluto/rea) (`rea-agents@6.8.0`)
i listu svih propusta koji su u novoj verziji otklonjeni.

> Napomena o alatu: REA je napravljen za analizu aplikacija **bez izvornog koda**
> (binaries, Electron/ASAR paketi, .NET, web bundle-ovi). Ovde je izvorni kod bio dostupan,
> pa REA služi kao nezavisna, deterministička verifikacija — i kao dokaz da se ništa
> nismo samo "nadali da valja".

## Korišćena komanda

```bash
npx -y rea-agents@latest analyze-javascript-application /putanja/do/stare-verzije --json
```

Kompletan (mašinonski) rezultat je sažet u [`rea-evidence-summary.json`](./rea-evidence-summary.json).
Analiza je rađena nad kopijom stare verzije (`index.js`, `package.json`, `html/`),
bez `.git` direktorijuma, bez izmena nad analiziranim fajlovima.

## Šta je REA pronašao

**Obuhvat statistike:** 4 relevantna fajla, 2 parsirana JavaScript fajla, 219 posećenih AST čvorova,
17 nodova i 19 ivica u rekonstruisanom grafu aplikacije, 1 `BrowserWindow`, 10 nalaza, **0 IPC operacija**.

### 1. Electron granice (`index.js`, BrowserWindow @ 5:23–20:6)

Eksplicitne `webPreferences` koje je REA rekonstruisao (tačno po AST literalima):

| Ključ | Stara vrednost | Značenje |
|---|---|---|
| `contextIsolation` | `false` | Renderer ima direktan pristup Node/Electron API-jima |
| `nodeIntegration` | `true` | Svaki `<script>` u rendereru može da radi `require('child_process')` i sl. |
| preload | *(nije prijavljen)* | Nema izolovanog mosta |
| `allowRunningInsecureContent` | `true` | Dozvoljava HTTP sadržaj na HTTPS stranici |
| `ELECTRON_DISABLE_SECURITY_WARNINGS` | postavljen u `index.js` | Ugašena upozorenja doslovno skrivaju problem |

Dodatno (iz koda, potvrđeno REA nalazima): `resizable: false`, `devTools` samo zakomentarisani,
`nodeIntegration: true` + učitavanje **udaljenog jQuery-ja sa CDN-a** = ako CDN ikada bude kompromitovan,
napadač dobija pun Node pristup na svakom računaru sa launcherom.

### 2. Renderer (`html/index.html`, `html/assets/js/script.js`)

- jQuery 3.6.1 sa `cdnjs.cloudflare.com` i bootstrap-icons sa `cdn.jsdelivr.net` — bez SRI integritetskih heševa.
- Google Fonts `@import` u CSS-u — treći spoljni poziv pri svakom startu.
- `fetch('http://89.116.184.110:30120/dynamic.json')` — **čist HTTP**, bez validacije odgovora,
  bez timeout-a (visi zauvek ako server ćuti).
- `fivem://` link direktno u `href` — radi, ali bez provere da je FiveM instaliran
  i bez povratne informacije korisniku.
- Hardkodiran `"Vi nemate whitelistu."` u HTML-u (`p.error`, `display:none`) — mrtvi kod,
  lažno sugeriše da launcher proverava whitelistu (ne proverava ništa).
- **Inline `<script>` blokovi** (2, početak na linijama 15 i 19) — REA eksplicitno navodi da ih
  nije analizirao i da podaci iz njih **nisu u evidence-u**. To je dodatni dokaz zašto inline
  skripte ne smeju da postoje: analiza (i CSP) ih ne mogu pokriti.

### 3. Arhitektura / kvalitet

- `html/assets/js/script.js` pristupa DOM-u preko globalnog `$`, meša `fetch` + jQuery + direct DOM;
  nema razdvajanja slojeva.
- Nema razlike između dev i prod build-a; `npm start` pokreće sve.
- Zavisnost `jquery` u `package.json` iako se jQuery učitava sa CDN-a (mrtav dep).
- `index.html` je 100% statičan — nema načina za obaveštenja, ažuriranja ili prijavu problema
  osim ručno otvorenih linkova.

## Kako to izgleda u v2.0 (novoj verziji)

| Nalaz | Rizik | v2.0 rešenje |
|---|---|---|
| `nodeIntegration: true` | RCE kroz bilo koji sadržaj u rendereru | `nodeIntegration: false`, `sandbox: true` |
| `contextIsolation: false` | Renderer ima pristup Electron internim stvarima | `contextIsolation: true` + sanitizovan preload bridge (`src/preload.js`) |
| Nema preload-a | Renderer izmišlja sopstvene kanale | Eksplicitan API: `getStatus`, `connect`, `openLink`, `checkUpdates`, … |
| `allowRunningInsecureContent` | Insecure sadržaj u secure kontekstu | Uklonjeno; CSP `default-src 'self'` u `index.html` |
| CDN jQuery/icons/fonts/SRI odsutan | Supply-chain kompromitacija | **Nula spoljnih resursa** — sve je lokalno (smoke-test to i proverava) |
| HTTP `dynamic.json` iz renderera | MITM, nema timeout-a | Fetch se radi **u main procesu** (Node `http`), timeout 4 s, limit 512 KiB, keš 5 s |
| `fivem://` direktno u `href` | Tihi neuspeh | `shell.openExternal` iz main procesa, validiran `host`/`port`, toast povratna informacija |
| Mrtvi whitelist kod | Lažno obećanje korisniku | Uklonjeno; lista pravila je u Informacije modalu; prava provera zahteva backend (vidi niže) |
| Inline `<script>` | Neproverljiv sadržaj, CSP probije | CSP bez `'unsafe-inline'`; sav JS u `renderer.js` |
| 0 IPC + `nodeIntegration` | Sve kroz jedan global | 13 imenovanih kanala, svi proveravaju pošiljioca (`event.sender === mainWindow.webContents`) |
| Nema provere ažuriranja | Korisnici zauvek na staroj verziji | GitHub Releases provera (2 s posle starta, opciono u postavkama) |
| Hardkodiran IP svuda | Ne može se testirati drugi server | `config.json` / env varijable (`REVOLUCIJA_SERVER_HOST`, …) + `config.example.json` |
| Bez window kontrola | (frame default) | Frameless prozor, custom naslovna traka, min/max/close kroz IPC |
| Nema testova | Regresije | `npm test` — 37 smoke provera (sintaksa, CSP, IPC paritet, id-jevi) |

## Ograničenja REA analize (uneta iz samog output-a)

- Statička analiza obnavlja odnose **iz inertne sintakse**; runtime registracija,
  reachability i enforcement se ne dokazuju.
- Inline `<script>` u `html/index.html` nije analiziran (2 bloka, linije 15 i 19).
- Pokrivenost grafa je `partial` — nedostajući nalazi ne dokazuju odsustvo.
- Dinamički selekti i izrazi nisu razrešeni.

## Šta REA NIJE uradio

REA **ne piše kod** i ne generiše launcher. On dokazuje *šta* stara aplikacija radi i *gde* su
its granice. Nova verzija (ovaj repo, `src/`) je napisana od nule — REA je korišćen za
(1) inventuru ponašanja stare verzije i (2) verifikaciju da smo svaki nalaz otklonili.

## Poznato ograničenje nove verzije (iskreno)

Whitelist provera i dalje ne postoji — ne može postojati bez server-side komponente
(npr. Discord OAuth2 + FiveM server koji proverava identitet na konekciji). Launcher
**ne može** da sazna ko je igrač. Ako želite pravu whitelistu u launcheru, potrebno je:

1. Backend endpoint (npr. `https://whitelist.revolucija.gg/check?id=<discord-id>`) iza
   Discord OAuth login-a,
2. u `src/main.js` handler koji posle logina pozove taj endpoint i u renderer pošalje
   `{ whitelisted: true|false }`,
3. UI stanje za isti (banner "Nemate whitelistu — prijavite se na Discord" koji se prikazuje
   tek posle odgovora, nikada hardkodirano).

Do tada launcher prikazuje samo **status servera** (online/offline, broj igrača) i ne laže
da proverava whitelistu.
