// Archivos estáticos: compresión y cabeceras de caché.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { createServer } from '../src/server.js';

let server;
let port;
let dir;
const BIG_JS = `export const data = ${JSON.stringify(Array.from({ length: 4000 }, (_, i) => `valor-${i}`))};\n`;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trebejos-static-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body>${'<p>Trebejos</p>'.repeat(200)}</body></html>`);
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), BIG_JS);
  fs.writeFileSync(path.join(dir, 'assets', 'letra-abc123.woff2'), crypto.getRandomValues(new Uint8Array(4000)));
  fs.writeFileSync(path.join(dir, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg">${'<path d="M0 0h10v10H0z"/>'.repeat(100)}</svg>`);
  server = createServer({ port: 0, host: '127.0.0.1', staticDir: dir, botEnabled: false });
  port = await server.listen(0, '127.0.0.1');
});

after(async () => {
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** GET sin descompresión automática, para ver los bytes y las cabeceras reales. */
function get(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: pathname, headers, agent: false }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject);
  });
}

describe('compresión', () => {
  test('comprime con Brotli cuando el navegador lo acepta, y el contenido es el mismo', async () => {
    const res = await get('/assets/index-abc123.js', { 'Accept-Encoding': 'gzip, br' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-encoding'], 'br');
    assert.match(res.headers.vary ?? '', /Accept-Encoding/i);
    assert.ok(res.body.length < Buffer.byteLength(BIG_JS) / 3, `${res.body.length} B vs ${Buffer.byteLength(BIG_JS)} B`);
    assert.equal(zlib.brotliDecompressSync(res.body).toString(), BIG_JS);
  });

  test('con solo Gzip comprime con Gzip', async () => {
    const res = await get('/assets/index-abc123.js', { 'Accept-Encoding': 'gzip' });
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.equal(zlib.gunzipSync(res.body).toString(), BIG_JS);
  });

  test('sin Accept-Encoding no comprime', async () => {
    const res = await get('/assets/index-abc123.js');
    assert.equal(res.headers['content-encoding'], undefined);
    assert.equal(res.body.toString(), BIG_JS);
  });

  test('comprime el HTML y el SVG, pero no las fuentes WOFF2 (ya vienen comprimidas)', async () => {
    const html = await get('/', { 'Accept-Encoding': 'br' });
    assert.equal(html.headers['content-encoding'], 'br');
    const svg = await get('/favicon.svg', { 'Accept-Encoding': 'br' });
    assert.equal(svg.headers['content-encoding'], 'br');
    const font = await get('/assets/letra-abc123.woff2', { 'Accept-Encoding': 'gzip, br' });
    assert.equal(font.headers['content-encoding'], undefined);
    assert.equal(font.body.length, 4000);
  });

  test('las respuestas pequeñas (como /health) no se comprimen: no compensa', async () => {
    const res = await get('/health', { 'Accept-Encoding': 'gzip, br' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-encoding'], undefined);
    assert.equal(JSON.parse(res.body).status, 'ok');
  });
});

describe('caché del navegador', () => {
  test('lo que lleva hash en /assets/ se guarda un año como inmutable', async () => {
    for (const file of ['/assets/index-abc123.js', '/assets/letra-abc123.woff2']) {
      const res = await get(file);
      assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable', file);
    }
  });

  test('el HTML no se guarda: siempre se pregunta, para recoger los archivos nuevos tras un despliegue', async () => {
    assert.equal((await get('/index.html')).headers['cache-control'], 'no-cache');
    // rutas de la SPA (/salas, /sala/ABC123…) devuelven el mismo HTML
    for (const route of ['/salas', '/sala/K9X4M2', '/aprender/caballo']) {
      const res = await get(route);
      assert.equal(res.status, 200, route);
      assert.equal(res.headers['cache-control'], 'no-cache', route);
      assert.match(res.body.toString(), /Trebejos/);
    }
  });

  test('el favicon (sin hash) se guarda un día', async () => {
    assert.equal((await get('/favicon.svg')).headers['cache-control'], 'public, max-age=86400');
  });

  test('con ETag, repetir la petición responde 304 sin cuerpo', async () => {
    const first = await get('/assets/index-abc123.js');
    assert.ok(first.headers.etag);
    const again = await get('/assets/index-abc123.js', { 'If-None-Match': first.headers.etag });
    assert.equal(again.status, 304);
    assert.equal(again.body.length, 0);
  });
});
