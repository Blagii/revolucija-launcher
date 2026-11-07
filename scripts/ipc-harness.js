'use strict';
const Module = require('module');
const http = require('http');
const ROOT = require('path').join(__dirname, '..');

const handlers = new Map();
const fakeWebContents = { id: 'fake-wc', on: () => {}, once: () => {}, send: () => {}, openDevTools: () => {}, setWindowOpenHandler: () => {}, loadFile: () => {} };
class FakeBrowserWindow {
  constructor() { this.webContents = fakeWebContents; }
  loadFile() {} once() {} on() {} show() {} minimize() {} close() {} focus() {} restore() {}
  isMaximized() { return false; } isMinimized() { return false; }
  isDestroyed() { return false; } maximize() {} unmaximize() {}
  static getAllWindows() { return []; }
}
const fakeElectron = {
  app: {
    requestSingleInstanceLock: () => true,
    on: () => {},
    whenReady: () => Promise.resolve(),
    setAppUserModelId: () => {},
    getVersion: () => require(ROOT + '/package.json').version,
    isPackaged: false,
    isReady: () => true,
    quit: () => {},
    getPath: () => '/tmp/revolucija-test-userdata'
  },
  BrowserWindow: FakeBrowserWindow,
  ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) },
  shell: { openExternal: async () => Promise.resolve() },
  clipboard: { writeText: () => {} },
  Menu: { setApplicationMenu: () => {} },
  session: { defaultSession: { setPermissionRequestHandler: () => {}, setPermissionCheckHandler: () => {} } }
};

const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return fakeElectron;
  return originalLoad.apply(this, arguments);
};

(async () => {
  // 1) main.js mora da se učita bez pada (registruje sve handlere)
  require(ROOT + '/src/main.js');
  await new Promise((r) => setImmediate(r));
  process.exitCode = 0;
  const expected = ['server:status','server:connect','link:open','clipboard:write','app:info','news:list','settings:get','settings:set','history:get','updates:check','updates:download','updates:install','updates:release-notes','fivem:process-status','crashes:list','crashes:clear','servers:list','servers:set','whitelist:status','whitelist:connect','whitelist:disconnect','window:minimize','window:toggle-maximize','window:close','window:is-maximized'];
  const missing = expected.filter((c) => !handlers.has(c));
  console.log('IPC handlers registered:', handlers.size, '| missing:', missing.length ? missing : 'none');
  if (missing.length) process.exitCode = 1;

  // 2) app:info handler (uz stubovan sender)
  const event = { sender: fakeWebContents };
  const info = await handlers.get('app:info')(event);
  console.log('app:info ->', JSON.stringify({ version: info.version, packaged: info.packaged, host: info.host, port: info.port, fivem: info.fivem, discord: info.discord }));

  // 3) updates:release-notes bez mreže (updateRepo default Seekiii/...) — očekuje se ok ili ok:false sa greškom, nikad pad
  const notes = await handlers.get('updates:release-notes')(event);
  console.log('release-notes ok =', notes.ok, notes.ok ? `version=${notes.version} body=${(notes.body||'').length}ch` : `error=${notes.error}`);

  // 4) history: append + get kroz IPC handler
  const h1 = require(ROOT + '/src/history.js');
  h1.append({ clients: 20, maxClients: 64 }); h1.append({ clients: 25, maxClients: 64 }); h1.append({ clients: 41, maxClients: 64 });
  const got = await handlers.get('history:get')(event, 10);
  console.log('history ->', JSON.stringify(got));

  // 5) fivem.js protiv lokalnog stub servera (pravi HTTP)
  const port = 34567;
  const srv = http.createServer((req, res) => {
    if (req.url === '/dynamic.json') return res.end(JSON.stringify({ clients: 43, sv_maxclients: 64, hostname: 'Test RP', mapname: 'Los Santos', gametype: 'Roleplay' }));
    if (req.url === '/info.json') return res.end(JSON.stringify({ resources: ['a','b','c','d','e'] }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  process.env.REVOLUCIJA_SERVER_HOST = '127.0.0.1';
  process.env.REVOLUCIJA_SERVER_PORT = String(port);
  delete require.cache[require.resolve(ROOT + '/src/config.js')];
  delete require.cache[require.resolve(ROOT + '/src/fivem.js')];
  const cfg = require(ROOT + '/src/config.js');
  const fivem = require(ROOT + '/src/fivem.js');
  const status = await fivem.getServerStatus(cfg);
  console.log('fivem online ->', JSON.stringify(status));
  await new Promise((r) => srv.close(r));
  fivem.__clearCache();
  const offline = await fivem.getServerStatus(cfg);
  console.log('fivem offline ->', JSON.stringify(offline));
})().catch((e) => { console.error('HARNESS FAIL:', e); process.exit(1); });
