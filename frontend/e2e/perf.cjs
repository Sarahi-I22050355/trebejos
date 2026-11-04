// Mediciones de rendimiento con navegador real. Se ejecuta igual contra cualquier servidor, para comparar versiones:
//   BASE_URL=http://localhost:3917 LABEL=despues node e2e/perf.cjs > perf-despues.json
// Necesita un servidor recién arrancado (sin salas) con MIN_CLOCK_SECONDS=1.
//
// Mide: peso transferido y tiempos de carga del listado de salas (con y sin caché, en red rápida y en "4G lento"),
// CPU de JavaScript con un reloj de partida corriendo, llamadas de Socket.IO al navegar, y el DOM de una partida larga.
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const LABEL = process.env.LABEL || 'medicion';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clients = [];

async function client(name) {
  const socket = io(BASE, { transports: ['websocket'], forceNew: true });
  await new Promise((resolve) => socket.once('connect', resolve));
  const ack = (event, data) => new Promise((resolve) => socket.emit(event, data, resolve));
  await ack('session:init', { token: randomUUID(), name });
  const c = { name, socket, ack };
  clients.push(c);
  return c;
}

const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const NO_THROTTLE = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };

/** Carga /salas en un contexto nuevo y devuelve bytes, peticiones y tiempos. `warm` repite la visita con la caché ya llena. */
async function loadLobby(browser, network, { warm = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', network);
  const visit = async () => {
    let bytes = 0;
    const requests = [];
    const sizes = new Map();
    const onFinished = (e) => { bytes += e.encodedDataLength; sizes.set(e.requestId, e.encodedDataLength); };
    const onResponse = (e) => requests.push({ id: e.requestId, url: e.response.url, status: e.response.status, fromCache: !!e.response.fromDiskCache || !!e.response.fromServiceWorker, encoding: e.response.headers['content-encoding'] || e.response.headers['Content-Encoding'] || '' });
    cdp.on('Network.loadingFinished', onFinished);
    cdp.on('Network.responseReceived', onResponse);
    const t0 = Date.now();
    await page.goto(`${BASE}/salas`, { waitUntil: 'commit' });
    await page.locator('[data-testid="room-card"]').first().waitFor({ timeout: 60000 });
    const tCards = Date.now() - t0;
    await page.waitForLoadState('load');
    const tLoad = Date.now() - t0;
    await page.waitForTimeout(400);
    cdp.off('Network.loadingFinished', onFinished);
    cdp.off('Network.responseReceived', onResponse);
    const paints = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)])));
    const staticRequests = requests.filter((r) => !r.url.includes('/socket.io/'));
    const js = staticRequests.filter((r) => /\.js(\?|$)/.test(r.url));
    return {
      transferredKB: Math.round(bytes / 102.4) / 10,
      requests: staticRequests.length,
      fromCache: staticRequests.filter((r) => r.fromCache || r.status === 304).length,
      jsFiles: js.length,
      jsTransferredKB: Math.round(js.reduce((n, r) => n + (sizes.get(r.id) ?? 0), 0) / 102.4) / 10,
      encodings: [...new Set(staticRequests.map((r) => r.encoding || 'sin compresión'))],
      firstPaintMs: paints['first-contentful-paint'] ?? null,
      firstRoomCardMs: tCards,
      loadEventMs: tLoad,
    };
  };
  const first = await visit();
  let second = null;
  if (warm) {
    await page.goto('about:blank');
    second = await visit();
  }
  await context.close();
  return warm ? { cold: first, warm: second } : first;
}

function eventNames(payload) {
  // Socket.IO: "42[...]" / "421[...]" (con id de ack); en polling llegan varios mensajes separados por \x1e
  return String(payload).split('\x1e').map((m) => (m.match(/^42\d*\["([^"]+)"/) || [])[1]).filter(Boolean);
}

(async () => {
  const browser = await chromium.launch();
  const result = { label: LABEL, base: BASE };
  try {
    // ---- datos de prueba: 14 salas públicas en espera y 2 partidas en juego
    for (let i = 1; i <= 14; i++) {
      const c = await client(`Sala ${i}`);
      await c.ack('room:create', { visibility: 'public', color: 'w', clock: i % 2 ? null : { initialSeconds: 180, incrementSeconds: 2 } });
    }
    for (let i = 1; i <= 2; i++) {
      const a = await client(`Blancas ${i}`);
      const b = await client(`Negras ${i}`);
      const room = await a.ack('room:create', { visibility: 'public', color: 'w', clock: { initialSeconds: 300, incrementSeconds: 0 } });
      await b.ack('room:join', { code: room.code });
      await a.ack('game:move', { from: 'e2', to: 'e4' });
    }
    await sleep(1500);

    // ---- 1. carga del listado de salas
    result.lobby = {
      redRapida: await loadLobby(browser, NO_THROTTLE, { warm: true }),
      cuatroGLento: await loadLobby(browser, SLOW_4G, { warm: true }),
    };

    // ---- 2. llamadas de Socket.IO al navegar inicio → salas → sala (duplicados)
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const sent = [];
      page.on('websocket', (ws) => ws.on('framesent', (f) => sent.push(...eventNames(f.payload))));
      page.on('request', (r) => r.url().includes('/socket.io/') && r.postData() && sent.push(...eventNames(r.postData())));
      await page.goto(BASE);
      await page.getByText(/Servidor en línea|Server online/).first().waitFor();
      await page.waitForTimeout(600);
      const inicio = [...sent];
      await page.getByRole('link', { name: /Explorar listado|Browse the list/ }).click();
      await page.locator('[data-testid="room-card"]').first().waitFor();
      await page.waitForTimeout(600);
      const trasSalas = sent.slice(inicio.length);
      const code = await page.locator('[data-testid="room-card"][data-status="waiting"]').first().getAttribute('data-code');
      const antes = sent.length;
      await page.locator(`[data-testid="room-card"][data-code="${code}"]`).getByTestId('btn-join').click();
      await page.getByTestId('board').waitFor();
      await page.waitForTimeout(600);
      const trasSala = sent.slice(antes);
      const count = (list) => list.reduce((m, n) => ((m[n] = (m[n] || 0) + 1), m), {});
      result.llamadas = { cargaInicio: count(inicio), alAbrirSalas: count(trasSalas), alEntrarASala: count(trasSala) };
      await context.close();
    }

    // ---- 3. CPU de JavaScript con el reloj corriendo (10 s) en una partida con reloj
    {
      const host = await client('Anfitrión Reloj');
      const room = await host.ack('room:create', { visibility: 'private', color: 'w', clock: { initialSeconds: 600, incrementSeconds: 0 } });
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/sala/${room.code}`);
      await page.getByTestId('board').waitFor();
      await host.ack('game:move', { from: 'e2', to: 'e4' });
      await page.getByTestId('clock-active').waitFor();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      await page.waitForTimeout(1500);
      const m0 = await metrics();
      await page.waitForTimeout(10000);
      const m1 = await metrics();
      const d = (k) => m1[k] - m0[k];
      result.relojCorriendo10s = {
        scriptMs: Math.round(d('ScriptDuration') * 1000),
        tareasMs: Math.round(d('TaskDuration') * 1000),
        recalculosDeEstilo: d('RecalcStyleCount'),
        layouts: d('LayoutCount'),
      };
      await context.close();
    }

    // ---- 4. partida larga: filas de la lista de jugadas en el DOM
    {
      const { Chess } = await import('chess.js');
      const a = await client('Larga Blancas');
      const b = await client('Larga Negras');
      const room = await a.ack('room:create', { visibility: 'public', color: 'w', clock: null });
      await b.ack('room:join', { code: room.code });
      const game = new Chess();
      let seed = 12345;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
      let ply = 0;
      // Partida "de relleno": jugadas legales pseudoaleatorias evitando terminar antes de ~200 jugadas
      while (ply < 260 && !game.isGameOver()) {
        const legal = game.moves({ verbose: true });
        const safe = legal.filter((m) => { game.move(m); const over = game.isGameOver(); game.undo(); return !over; });
        const pick = (safe.length ? safe : legal)[Math.floor(rnd() * (safe.length ? safe.length : legal.length))];
        game.move(pick);
        const mover = ply % 2 === 0 ? a : b;
        const res = await mover.ack('game:move', { from: pick.from, to: pick.to, promotion: pick.promotion });
        if (!res.ok) break;
        ply++;
      }
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const t0 = Date.now();
      await page.goto(`${BASE}/sala/${room.code}`);
      await page.getByTestId('board').waitFor();
      await page.locator('[data-testid="move-list"] li').first().waitFor();
      const tList = Date.now() - t0;
      const rows = await page.locator('[data-testid="move-list"] li').count();
      const nodes = await page.locator('[data-testid="move-list"] *').count();
      // ¿se puede llegar a la primera y a la última jugada y se ve la lista entera al desplazarse?
      const scroll = await page.evaluate(async () => {
        const list = document.querySelector('[data-testid="move-list"]');
        const seen = new Set();
        for (let y = 0; y <= list.scrollHeight; y += Math.max(40, list.clientHeight / 2)) {
          list.scrollTop = y;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          list.querySelectorAll('li').forEach((li) => seen.add(li.innerText.split('\n')[0].trim()));
        }
        return seen.size;
      });
      result.partidaLarga = { jugadasEnJuego: ply, filasEnElDOM: rows, nodosEnLaLista: nodes, filasDistintasAlDesplazarse: scroll, msHastaVerLaLista: tList };
      await context.close();
    }
  } catch (e) {
    result.error = String(e && e.stack ? e.stack : e);
  } finally {
    for (const c of clients) c.socket.close();
    await browser.close();
  }
  console.log(JSON.stringify(result, null, 2));
})();
