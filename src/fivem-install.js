'use strict';

/**
 * Detekcija FiveM instalacije (FiveM je zvanično podržan samo na Windows-u).
 * Ne menja ništa na sistemu — samo čita postojanje poznatih lokacija.
 */

const fs = require('fs');
const path = require('path');

const FIVEM_DOWNLOAD_URL = 'https://fivem.net/';

function detectFiveM() {
  const platform = process.platform;
  if (platform !== 'win32') {
    return { platform, supported: false, installed: false, path: null, downloadUrl: FIVEM_DOWNLOAD_URL };
  }
  const env = process.env;
  const candidates = [];
  const push = (candidate) => { if (candidate) candidates.push(candidate); };

  const localAppData = env.LOCALAPPDATA || (env.USERPROFILE ? path.join(env.USERPROFILE, 'AppData', 'Local') : null);
  push(localAppData && path.join(localAppData, 'FiveM'));
  push(localAppData && path.join(localAppData, 'FiveM', 'FiveM.exe'));
  push(env.ProgramFiles && path.join(env.ProgramFiles, 'FiveM'));
  push(env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'FiveM'));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return { platform, supported: true, installed: true, path: candidate, downloadUrl: FIVEM_DOWNLOAD_URL };
      }
    } catch {
      /* ignorišemo — probaj sledeću lokaciju */
    }
  }
  return { platform, supported: true, installed: false, path: null, downloadUrl: FIVEM_DOWNLOAD_URL };
}

module.exports = { detectFiveM, FIVEM_DOWNLOAD_URL };
