# Revolucija Launcher Bot

Discord bot koji **napaja launcher obaveštenjima iz Discord-a** i donosi nekoliko
korisnih slash komandi za staff i igrače.

```
Staff: /najava tag naslov tekst
        │
        ▼
   announcements.json  ──HTTP /news.json──►  launcher (announcementUrl)
        │                                       (osvežava se na 5 min,
        ▼                                        ili pri startu)
   #obaveštenja kanal (embed)
```

Radi **bez privileged intent-a** — sve ide kroz slash komande, ne čita poruke iz kanala.

## Komande

| Komanda | Ko | Šta radi |
|---|---|---|
| `/najava tag naslov tekst [vreme]` | staff (`Manage Messages` ili `STAFF_ROLE_ID`) | Čuva objavu i objavljuje embed u `#obaveštenja`; launcher je prikazuje kroz `/news.json`. **`vreme`** → zakazano: `18:30` (danas/sutra) ili `YYYY-MM-DD HH:MM` |
| `/obavestenja` | svi (ephemeral) | Poslednjih 5 objava sa ID-jevima |
| `/obrisi-najavu id` | staff | Brisanje objave po ID-u |
| `/status` | svi | Uživo status FiveM servera (igrači x/y, mapa, tip) čitan direktno sa `dynamic.json` |

Tag-ovi: `NAJAVA` (podrazumevani) · `EVENT` · `IZMENA` · `INFO`. Launcher mapira boje automatski.

## Zakazane objave

`/najava tag naslov tekst vreme:18:30` — objava se čuva kao **zakazana** (launcher je još ne vidi),
scheduler je na svakih 30 s isporučuje u kanal + čini vidljivom u `/news.json`. `/obavestenja`
pokazuje sekciju „Zakazano" sa Discord timestamp-ovima. `/obrisi-najavu` radi i za zakazane.
Vreme se tumači po `TZ` bota (podrazumevano TZ okoline — za Srbiju `TZ=Europe/Belgrade` u `.env`).

## FiveM webhook (auto-objave iz igre/skripta)

POST na bota za automatsku objavu (npr. na restart):

```bash
curl -X POST http://<ip-bota>:8734/webhook/fivem \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"restart","details":"Restart zbog update-a, kreni za 5 min"}'
```

- Event-ovi: `restart` · `start` · `maintenance` (šabloni — sadržaj je strogo kontrolisan, bez injekcije)
- `WEBHOOK_SECRET` nije postavljen → webhook **ne postoji** (404). Bez tajne se ne može objaviti.
- Rate limit: jedna uspešna objava na 10 s. `details` se sanitizuje (mentions se skidaju, max 500).
- FiveM strana: server-side skripta (npr. `@oxmysql/lib` http) poziva ovaj endpoint na `onResourceStart`/restart eventu.

## 1. Discord aplikacija i bot (jedna aplikacija za sve)

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** (npr. „Revolucija Launcher“ — isti ID možeš koristiti i za Rich Presence)
2. **Bot** → *Add Bot* → kopiraj **Token** → `DISCORD_TOKEN`
3. **General Information** → kopiraj **Application ID** → `DISCORD_CLIENT_ID`
4. **OAuth2 → URL Generator**:
   - Scopes: `bot` + `applications.commands`
   - Bot Permissions: **Send Messages** (2048) + **Embed Links** (16384) → zbir **18432**
   - Otvori generisani URL i dodaj bota na **svoj Revolucija server**
5. Server ID: Discord → podešavanja → **Napredno** → *Developer Mode* ON → desni klik na server → **Copy Server ID** → `DISCORD_GUILD_ID`
6. ID kanala za objave: desni klik na `#obaveštenja` → **Copy Channel ID** → `ANNOUNCEMENTS_CHANNEL_ID`
7. ID staff role (opciono): podešavanja servera → *Role* → desni klik → **Copy Role ID** → `STAFF_ROLE_ID`

Privileged intents: **nisu potrebni.** Nemoj ih uključivati.

## 2. Podešavanje

```bash
cd bot
cp .env.example .env      # popuni vrednosti
npm install
npm test                  # 25 provera (bez Discord-a)
npm start
```

Na startu bot:
- registruje slash komande na tvoj guild (instant, bez globalnog čekanja),
- diže HTTP endpoint na `BOT_HTTP_BIND:BOT_HTTP_PORT` (default `0.0.0.0:8734`),
- drži `/healthz` za monitoring.

`.env` nikad ne commit-uj (već je u `.gitignore`).

## 3. Poveži launcher sa botom

U `config.json` launchera:

```json
{
  "announcementUrl": "http://<ip-bota>:8734/news.json"
}
```

ili env varijabla `REVOLUCIJA_ANNOUNCEMENT_URL`. Gotovo — obaveštenja u launcheru dolaze iz store-a bota.

Test lokalno: `curl http://127.0.0.1:8734/news.json` posle `/najava` u Discord-u.

## 4. Hosting

**PM2 (VPS):**
```bash
npm i -g pm2
cd bot && pm2 start src/index.js --name revolucija-bot && pm2 save
```

**Docker:**
```bash
docker build -t revolucija-bot ./bot
docker run -d --name revolucija-bot --restart unless-stopped \
  -v $(pwd)/bot/data:/app/data \
  --env-file bot/.env \
  -p 8734:8734 revolucija-bot
```

**Napomene:**
- Bot mora biti dostupan sa interneta da bi launcheri širom sveta čitali `/news.json` (ili ga drži na istom hostu kao server ako je to privatan LAN).
- Endpoint je javan i read-only — **ne šalji tajne u objavama**. Nema auth-a (i nije potreban: sadržaj je javan u `#obaveštenja`).
- `BOT_DATA_FILE` čuva sve objave atomski; backup = kopija tog fajla.
- Ako menjaš PORT, promeni i `announcementUrl` u launcheru.

## 5. Ugovor `/news.json`

```json
[{ "date": "2026-11-07", "tag": "NAJAVA", "title": "Restart u petak", "text": "Server se resetuje u 04:00." }]
```

Launcher dodatno sanitizuje sve pre prikaza (dužina, escaping, whitelist polja), pa je format
siguran čak i ako neko direktno upiše stvari u `announcements.json`.
