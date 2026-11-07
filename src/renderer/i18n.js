'use strict';

/**
 * i18n — srpski (podrazumevano) i engleski. Nedostajući ključ uvek pada na sr, pa
 * polovična pokrivenost EN-a nikad ne lomi interfejs.
 *
 * Primena: [data-i18n="key"] postavlja textContent; [data-i18n-attr] format:
 *   data-i18n-attr="title:key,aria-label:otherKey"
 * Jezik se bira u Postavke → Jezik (settings.lang) i čuva u settings.json; promena = reload.
 */

(function () {
  const DICT = {
    sr: {
      'preview.before': 'PREVIEW — pokreni kroz',
      'preview.after': 'za pravu aplikaciju',
      'hero.subtitle': 'ROLEPLAY · GTA V',
      'hero.desc': 'Shandy je GTA V Roleplay server. Ideja roleplaya je ponašanje i gluma karaktera kojeg vi igrate. Da biste igrali na serveru potrebno je imati whitelistu. Uživajte.',
      'connect.cta': 'POVEŽI SE',
      'connect.downloadCta': 'PREUZMI FIVEM',
      'connect.busy': 'Povezivanje…',
      'connect.downloadTitle': 'FiveM nije pronađen na ovom računaru — preuzmi ga sa fivem.net',
      'connect.connectTitle': 'Pokreni FiveM i poveži se',
      'presence.chip': 'FiveM je pokrenut — klikni POVEŽI SE',
      'status.connecting': 'Povezivanje…',
      'status.online': 'ONLINE',
      'status.offline': 'OFLAJN',
      'status.unavailable': 'Server trenutno nije dostupan. Pokušaj kasnije.',
      'status.unavailableDetail': 'Server trenutno nije dostupan. Pokušaj ponovo kasnije',
      'panel.announcements': 'OBAVEŠTENJA',
      'panel.discord': 'Discord',
      'news.loading': 'Učitavanje…',
      'news.tickerLoading': 'Učitavanje obaveštenja…',
      'news.sourceRemote': 'Izvor: server',
      'news.sourceLocal': 'Izvor: ugrađene objave',
      'news.unreadOne': 'NOVA',
      'news.unreadMany': 'NOVE',
      'news.newAnnouncement': 'Stigla je nova objava na Discord-u.',
      'banner.available': 'Dostupna je nova verzija launchera.',
      'banner.update': 'Ažuriraj',
      'banner.details': 'Detalji',
      'report.title': 'Prijavi',
      'report.before': 'Za prijavu igrača ili problema otvori',
      'report.ticket': 'ticket na Discord serveru',
      'report.channel': 'u kanalu',
      'report.after': 'i navedi njegov ID, vreme događaja i kratak opis.',
      'report.admins': 'Moderator tim obrađuje prijave radnim danima od 18 do 23h. Lažne prijave se kažnjavaju warn-om.',
      'report.openDiscord': 'Otvori Discord #prijave',
      'info.title': 'Informacije o serveru',
      'info.server': 'Server',
      'info.address': 'Adresa',
      'info.mapType': 'Mapa / tip',
      'info.copyAddress': 'Kopiraj adresu servera',
      'info.whitelistNote': 'Whitelistu moraš imati da bi igrao. Aplikacija se popunjava na Discord serveru; intervju se zakazuje automatski. Poštovanje pravilnika je obavezno — kršenje se sankcioniše od warn-a do trajne banice.',
      'diag.title': 'Dijagnostika',
      'diag.loading': 'Učitavanje izveštaja…',
      'diag.copy': 'Kopiraj izveštaj',
      'diag.issue': 'Prijavi na GitHub-u',
      'diag.clear': 'Obriši',
      'diag.fineprint': 'Izveštaji ostaju na tvom računaru (userData/crashes) — ništa se ne šalje automatski. Bug-ovi se prijavljuju ručno, klikom.',
      'settings.title': 'Postavke',
      'settings.updates': 'Ažuriranja',
      'settings.checkNow': 'Proveri sada',
      'settings.whatsnew': 'Šta je novo',
      'settings.whatsnewDesc': 'Napomene uz poslednje izdanje sa GitHub-a.',
      'settings.show': 'Prikaži',
      'settings.config': 'Konfiguracija',
      'settings.configDefaults': 'Ugrađeni default-ovi',
      'settings.copyIp': 'Kopiraj IP',
      'setting.autoUpdate': 'Automatska provera ažuriranja',
      'setting.autoUpdateDesc': 'Launcher proverava nova izdanja na GitHub-u pri svakom pokretanju.',
      'setting.reducedMotion': 'Smanji animacije',
      'setting.reducedMotionDesc': 'Isključuje ticker, pulsiranje i prelaze (poštuje i sistemski reduced-motion).',
      'setting.minimizeTray': 'Minimizuj u tray',
      'setting.minimizeTrayDesc': 'Klik na X sakriva launcher u sistem tray umesto gašenja — ostaje uz FiveM dok igraš. Osvežavanje statusa i Discord status se nastavljaju.',
      'setting.language': 'Jezik',
      'setting.languageDesc': 'Jezik interfejsa launchera.',
      'server.desc': 'Izabrani FiveM server — utiče na status, POVEŽI SE i prisustvo RPC-a.',
      'server.previewOnly': 'Promena servera radi samo kroz Electron aplikaciju.',
      'server.changed': 'Server: {name} — osvežavam status…',
      'server.changeFail': 'Promena servera nije uspela.',
      'whitelist.link': 'Poveži',
      'whitelist.unlink': 'Odvezi',
      'whitelist.disconnected': 'Nije povezano — Discord verifikacija, ništa se ne čuva osim imena',
      'whitelist.active': 'Aktivna · {name}',
      'whitelist.linkedToast': 'Whitelist potvrđena — dobrodošao, {name}!',
      'whitelist.connectFailed': 'Whitelist verifikacija nije uspela.',
      'whitelist.removed': 'Whitelist veza je uklonjena sa ovog računara.',
      'whitelist.openedDiscord': 'Otvorio sam Discord — posle prijave token se vraća u launcher.',
      'whitelist.notConfigured': 'Whitelist nije podešen (config.json → whitelistApiUrl + discord.clientId).',
      'whatsnew.title': 'Šta je novo',
      'whatsnew.loading': 'Učitavanje…',
      'whatsnew.latest': 'Najnovije izdanje',
      'whatsnew.openGithub': 'Otvori na GitHub-u',
      'update.checking': 'Proveravam…',
      'update.previewOnly': 'Nedostupno u preview režimu.',
      'update.autoDisabled': 'Auto-provera je ugašena u postavkama.',
      'update.downloaded': 'Ažuriranje je preuzeto.',
      'update.failed': 'Ažuriranje nije uspelo: {message}',
      'update.unknownError': 'nepoznata greška',
      'crash.copied': 'Izveštaj kopiran — nalepi ga u Discord ticket (launcher ▶ Info).',
      'crash.cleared': 'Crash izveštaji obrisani.',
      'crash.summaryNone': 'Nema srušenih izveštaja.',
      'crash.summaryOne': 'izveštaj',
      'crash.summaryMany': 'izveštaja',
      'crash.last': 'poslednji',
      'toast.settingsFail': 'Postavke nisu snimljene.',
      'toast.settingsSaved': 'Postavke su snimljene.',
      'toast.copied': 'Kopirano: {address}',
      'toast.copyFail': 'Kopiranje nije uspelo.',
      'toast.trayOn': 'Pri klik na X launcher će se sakriti u tray.',
      'toast.trayOff': 'Pri klik na X launcher će se zatvoriti.',
      'toast.fivemWindowsOnly': 'FiveM je zvanično dostupan samo na Windows-u — veza radi sa GTA V + FiveM klijentom.',
      'toast.connectPreview': 'Povezivanje radi samo kroz Electron aplikaciju (npm start).',
      'toast.fivemStarting': 'Pokrećem FiveM…',
      'toast.fivemNotRunning': 'FiveM nije pokrenut. Da li je FiveM instaliran?',
      'toast.initError': 'Došlo je do greške pri pokretanju launchera.',
    },
    en: {
      'preview.before': 'PREVIEW — run with',
      'preview.after': 'for the real app',
      'hero.subtitle': 'ROLEPLAY · GTA V',
      'hero.desc': 'Shandy is a GTA V Roleplay server. Roleplay is all about living and acting as your character. A whitelist is required to play. Enjoy.',
      'connect.cta': 'CONNECT',
      'connect.downloadCta': 'DOWNLOAD FIVEM',
      'connect.busy': 'Connecting…',
      'connect.downloadTitle': 'FiveM was not found on this PC — download it from fivem.net',
      'connect.connectTitle': 'Launch FiveM and connect',
      'presence.chip': 'FiveM is running — press CONNECT',
      'status.connecting': 'Connecting…',
      'status.online': 'ONLINE',
      'status.offline': 'OFFLINE',
      'status.unavailable': 'Server is currently unreachable. Try later.',
      'status.unavailableDetail': 'Server is currently unreachable. Try again later',
      'panel.announcements': 'ANNOUNCEMENTS',
      'panel.discord': 'Discord',
      'news.loading': 'Loading…',
      'news.tickerLoading': 'Loading announcements…',
      'news.sourceRemote': 'Source: server',
      'news.sourceLocal': 'Source: bundled announcements',
      'news.unreadOne': 'NEW',
      'news.unreadMany': 'NEW',
      'news.newAnnouncement': 'A new announcement arrived on Discord.',
      'banner.available': 'A new launcher version is available.',
      'banner.update': 'Update',
      'banner.details': 'Details',
      'report.title': 'Report player',
      'report.before': 'To report a player or an issue, open a',
      'report.ticket': 'ticket on the Discord server',
      'report.channel': 'in the',
      'report.after': 'channel and include their ID, the time and a short description.',
      'report.admins': 'The moderator team handles reports on workdays from 18 to 23h. False reports get a warn.',
      'report.openDiscord': 'Open Discord #prijave',
      'info.title': 'Server information',
      'info.server': 'Server',
      'info.address': 'Address',
      'info.mapType': 'Map / type',
      'info.copyAddress': 'Copy server address',
      'info.whitelistNote': 'You need a whitelist to play. Applications open on the Discord server; interviews are scheduled automatically. The rules are mandatory — violations are punished from a warn to a permanent ban.',
      'diag.title': 'Diagnostics',
      'diag.loading': 'Loading reports…',
      'diag.copy': 'Copy report',
      'diag.issue': 'Report on GitHub',
      'diag.clear': 'Clear',
      'diag.fineprint': 'Reports stay on your computer (userData/crashes) — nothing is ever sent automatically. Bugs are reported manually, by clicking.',
      'settings.title': 'Settings',
      'settings.updates': 'Updates',
      'settings.checkNow': 'Check now',
      'settings.whatsnew': "What's new",
      'settings.whatsnewDesc': 'Release notes for the latest version from GitHub.',
      'settings.show': 'Show',
      'settings.config': 'Configuration',
      'settings.configDefaults': 'Built-in defaults',
      'settings.copyIp': 'Copy IP',
      'setting.autoUpdate': 'Automatic update checks',
      'setting.autoUpdateDesc': 'The launcher checks GitHub for new releases on every start.',
      'setting.reducedMotion': 'Reduce motion',
      'setting.reducedMotionDesc': 'Disables the ticker, pulsing and transitions (also respects system reduced-motion).',
      'setting.minimizeTray': 'Minimize to tray',
      'setting.minimizeTrayDesc': 'Clicking X hides the launcher to the system tray instead of quitting — it stays with FiveM while you play. Status and Discord presence keep updating.',
      'setting.language': 'Language',
      'setting.languageDesc': 'Launcher interface language.',
      'server.desc': 'Selected FiveM server — affects status, CONNECT and RPC presence.',
      'server.previewOnly': 'Switching servers only works in the Electron app.',
      'server.changed': 'Server: {name} — refreshing status…',
      'server.changeFail': 'Could not switch the server.',
      'whitelist.link': 'Connect',
      'whitelist.unlink': 'Disconnect',
      'whitelist.disconnected': 'Not linked — Discord verification; only your display name is stored',
      'whitelist.active': 'Active · {name}',
      'whitelist.linkedToast': 'Whitelist confirmed — welcome, {name}!',
      'whitelist.connectFailed': 'Whitelist verification failed.',
      'whitelist.removed': 'Whitelist link was removed from this computer.',
      'whitelist.openedDiscord': 'I opened Discord — after signing in, the token returns to the launcher.',
      'whitelist.notConfigured': 'Whitelist is not configured (config.json → whitelistApiUrl + discord.clientId).',
      'whatsnew.title': "What's new",
      'whatsnew.loading': 'Loading…',
      'whatsnew.latest': 'Latest release',
      'whatsnew.openGithub': 'Open on GitHub',
      'update.checking': 'Checking…',
      'update.previewOnly': 'Not available in preview mode.',
      'update.autoDisabled': 'Automatic checks are off in Settings.',
      'update.downloaded': 'The update has been downloaded.',
      'update.failed': 'Update failed: {message}',
      'update.unknownError': 'unknown error',
      'crash.copied': 'Report copied — paste it into a Discord ticket.',
      'crash.cleared': 'Crash reports cleared.',
      'crash.summaryNone': 'No crash reports.',
      'crash.summaryOne': 'report',
      'crash.summaryMany': 'reports',
      'crash.last': 'last',
      'toast.settingsFail': 'Settings could not be saved.',
      'toast.settingsSaved': 'Settings saved.',
      'toast.copied': 'Copied: {address}',
      'toast.copyFail': 'Copy failed.',
      'toast.trayOn': 'Clicking X will hide the launcher to the tray.',
      'toast.trayOff': 'Clicking X will close the launcher.',
      'toast.fivemWindowsOnly': 'FiveM is officially Windows-only — it works with the GTA V + FiveM client.',
      'toast.connectPreview': 'Connecting only works in the Electron app (npm start).',
      'toast.fivemStarting': 'Starting FiveM…',
      'toast.fivemNotRunning': 'FiveM is not running. Is FiveM installed?',
      'toast.initError': 'Something went wrong while starting the launcher.',
    }
  };

  let lang = 'sr';

  function t(key, vars) {
    const table = DICT[lang] || DICT.sr;
    let text = table && table[key] !== undefined ? table[key] : (DICT.sr[key] !== undefined ? DICT.sr[key] : key);
    if (vars) {
      for (const name of Object.keys(vars)) {
        text = text.split(`{${name}}`).join(String(vars[name]));
      }
    }
    return text;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      const spec = el.getAttribute('data-i18n-attr') || '';
      for (const pair of spec.split(',')) {
        const [attr, key] = pair.split(':');
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
      }
    });
  }

  function setLang(next) {
    lang = next === 'en' ? 'en' : 'sr';
    document.documentElement.lang = lang;
    apply(document);
  }

  window.i18n = { t, apply, setLang, get lang() { return lang; }, available: ['sr', 'en'] };

  document.documentElement.lang = lang;
  apply(document);
})();
