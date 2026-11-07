'use strict';

/**
 * Minimalni HTTP/HTTPS JSON klijent sa timeoutom i granicom veličine odgovora.
 * Bez eksternih zavisnosti — koristi se iz main procesa (Node), nikada iz renderera.
 */

const http = require('http');
const https = require('https');

const MAX_BODY_BYTES = 512 * 1024; // 512 KiB je više nego dovoljno za FiveM/GitHub JSON

function fetchJson(urlString, { timeout = 4000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (err) {
      reject(new Error(`Nevažeći URL: ${urlString}`));
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      reject(new Error(`Nedozvoljen protokol: ${url.protocol}`));
      return;
    }
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(
      url,
      {
        method: 'GET',
        timeout,
        headers: {
          'User-Agent': 'ShandyLauncher/2.2 (+https://github.com/Seekiii/shandy-launcher)',
          Accept: 'application/json',
          ...headers
        }
      },
      (response) => {
        const status = response.statusCode || 0;
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`HTTP ${status} za ${url.hostname}${url.pathname}`));
          return;
        }
        const chunks = [];
        let received = 0;
        response.on('data', (chunk) => {
          received += chunk.length;
          if (received > MAX_BODY_BYTES) {
            request.destroy(new Error('Odgovor je prevelik (preko 512 KiB)'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            reject(new Error('Odgovor nije validan JSON'));
          }
        });
        response.on('error', reject);
      }
    );
    request.on('timeout', () => request.destroy(new Error('Zahtev je istekao (timeout)')));
    request.on('error', reject);
    request.end();
  });
}

module.exports = { fetchJson };
