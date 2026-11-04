// E2E de las optimizaciones de rendimiento, con navegadores reales y Stockfish real.
//   (backend sirviendo frontend/dist, MIN_CLOCK_SECONDS=1)  BASE_URL=http://localhost:3917 node e2e/phase-perf.cjs
// Requiere un servidor recién arrancado (sin salas).
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const step = (m) => console.log(`✔ ${m}`);
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clients = [];

async function client(name) {
  const socket = io(BASE, { transports: ['websocket'], forceNew: true });
  await new Promise((resolve) => socket.once('connect', resolve));
  const ack = (event, data) => new Promise((resolve) => socket.emit(event, data, resolve));
  const init = await ack('session:init', { token: randomUUID(), name });
  assert.equal(init.ok, true, `session:init de ${name}`);
  const c = { name, socket, ack };
  clients.push(c);
  return c;
}

async function newPage(browser, label, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', ...opts });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] console: ${m.text()}`));
  return { context, page };
}

async function until(fn, timeout = 8000, what = 'condición') {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await sleep(50);
  }
  throw new Error(`Tiempo agotado esperando: ${what}${last ? ` (${last.message})` : ''}`);
}

/** Nombres de los eventos de Socket.IO que envía una página (WebSocket y polling). */
function trackEmits(page) {
  const sent = [];
  const names = (payload) => String(payload).split('\x1e').map((m) => (m.match(/^42\d*\["([^"]+)"/) || [])[1]).filter(Boolean);
  page.on('websocket', (ws) => ws.on('framesent', (f) => sent.push(...names(f.payload))));
  page.on('request', (r) => r.url().includes('/socket.io/') && r.postData() && sent.push(...names(r.postData())));
  return sent;
}
const count = (list, name) => list.filter((n) => n === name).length;

/** Retrasa `ms` las respuestas de Socket.IO que contengan `needle`, vengan por WebSocket o por polling. */
async function delayServer(page, needle, ms) {
  await page.routeWebSocket(/socket\.io/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (typeof message === 'string' && message.includes(needle)) setTimeout(() => ws.send(message), ms);
      else ws.send(message);
    });
  });
  await page.route('**/socket.io/**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    try {
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes(needle)) await sleep(ms);
      await route.fulfill({ response, body });
    } catch {
      /* petición cancelada por el navegador al cambiar de transporte */
    }
  });
}

async function click(page, sq) {
  await page.getByTestId('board').evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });
  });
  const b = await page.locator(`[data-square="${sq}"]`).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---------------------------------------------------------------- datos: 8 salas públicas
    const hosts = [];
    for (const name of ['Aaa Uno', 'Aab Dos', 'Aba Tres', 'Abb Cuatro', 'Baa Cinco', 'Bab Seis']) {
      const c = await client(name);
      const room = await c.ack('room:create', { visibility: 'public', color: 'w', clock: null });
      hosts.push({ c, code: room.code });
    }

    // ================================================================ 1. compresión y caché del navegador
    {
      const { context, page } = await newPage(browser, 'cache');
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      const responses = [];
      const fromCache = new Set();
      cdp.on('Network.responseReceived', (e) => responses.push({ id: e.requestId, url: e.response.url, headers: Object.fromEntries(Object.entries(e.response.headers).map(([k, v]) => [k.toLowerCase(), v])), type: e.type }));
      cdp.on('Network.requestServedFromCache', (e) => fromCache.add(e.requestId));
      await page.goto(`${BASE}/salas`);
      await page.locator('[data-testid="room-card"]').first().waitFor();
      await page.waitForTimeout(800);
      const assets = responses.filter((r) => r.url.includes('/assets/'));
      const byExt = (ext) => assets.filter((r) => r.url.endsWith(ext));
      assert.ok(byExt('.js').length >= 3, 'el JavaScript va partido en varios archivos');
      assert.ok([...byExt('.js'), ...byExt('.css')].filter((r) => r.headers['content-encoding'] === 'br').length >= 3, 'los archivos grandes van con Brotli');
      for (const r of [...byExt('.js'), ...byExt('.css')]) {
        // Los archivos de menos de 1 KB (algún fragmento diminuto de JS) no se comprimen: no compensa.
        if (r.headers['content-encoding'] === undefined) assert.ok(Number(r.headers['content-length']) < 1024, `${r.url} sin comprimir pesa ${r.headers['content-length']} B`);
        else assert.equal(r.headers['content-encoding'], 'br', `${r.url} va comprimido con Brotli`);
        assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable', `${r.url} se guarda un año`);
      }
      for (const r of byExt('.woff2')) {
        assert.equal(r.headers['content-encoding'], undefined, 'las fuentes ya vienen comprimidas');
        assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable');
      }
      assert.ok(!assets.some((r) => r.url.endsWith('.woff')), 'ya no se sirven fuentes WOFF de respaldo');
      const html = responses.find((r) => r.type === 'Document');
      assert.equal(html.headers['cache-control'], 'no-cache', 'el HTML siempre se revalida');
      step('el JS y el CSS llegan comprimidos con Brotli, las fuentes sin recomprimir, y los archivos con hash con caché de un año');

      // segunda visita: los archivos con hash salen de la caché del navegador, sin tocar la red
      responses.length = 0;
      fromCache.clear();
      await page.goto('about:blank');
      await page.goto(`${BASE}/salas`);
      await page.locator('[data-testid="room-card"]').first().waitFor();
      await page.waitForTimeout(500);
      const again = [...responses, ...[...fromCache].map((id) => ({ id }))];
      assert.ok(fromCache.size >= 8, `en la segunda visita ${fromCache.size} archivos salen de la caché del navegador`);
      assert.ok(responses.filter((r) => r.url.includes('/assets/') && !fromCache.has(r.id) && r.url.endsWith('.js')).length === 0, 'ningún JavaScript se vuelve a pedir al servidor');
      void again;
      step(`segunda visita: ${fromCache.size} archivos salen de la caché del navegador (sin pedirlos al servidor)`);
      await context.close();
    }

    // ================================================================ 2. carga diferida de pantallas y diccionario inglés
    {
      const { context, page } = await newPage(browser, 'lazy');
      const js = [];
      page.on('response', (r) => /\/assets\/.*\.js$/.test(r.url()) && js.push(path.basename(new URL(r.url()).pathname)));
      await page.goto(BASE);
      await page.getByText('Servidor en línea').first().waitFor();
      await page.waitForTimeout(300);
      assert.ok(!js.some((f) => /^en-/.test(f)), 'el diccionario inglés no se descarga en español');
      await until(async () => ['Lobby-', 'Room-', 'Learn-'].every((p) => js.some((f) => f.startsWith(p))), 12000, 'precarga de las demás pantallas en tiempo ocioso');
      // Las demás pantallas se piden DESPUÉS del primer pintado: no retrasan lo que el usuario ve al entrar.
      const timing = await page.evaluate(() => ({
        fcp: performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint').startTime,
        starts: Object.fromEntries(performance.getEntriesByType('resource').filter((r) => /\/(Lobby|Room|Learn|Home)-[^/]*\.js$/.test(r.name)).map((r) => [r.name.split('/').pop().split('-')[0], r.startTime])),
      }));
      for (const page_ of ['Lobby', 'Room', 'Learn']) assert.ok(timing.starts[page_] > timing.fcp, `${page_} se pide después del primer pintado (${Math.round(timing.starts[page_])} ms > ${Math.round(timing.fcp)} ms)`);
      assert.ok(timing.starts.Home < timing.fcp, 'el código del inicio sí llega antes del primer pintado');
      step(`el inicio carga solo su código antes de pintar (Home ${Math.round(timing.starts.Home)} ms < primer pintado ${Math.round(timing.fcp)} ms); Lobby, Room y Learn se piden después, en tiempo ocioso`);

      const before = js.length;
      await page.getByRole('link', { name: 'Explorar listado' }).click();
      await page.locator('[data-testid="room-card"]').first().waitFor();
      assert.equal(js.length, before, 'al navegar a /salas no hace falta bajar nada más: ya estaba');
      step('al navegar a otra pantalla no se descarga nada nuevo');

      // el inglés se descarga solo al acercarse al botón EN
      assert.ok(!js.some((f) => /^en-/.test(f)));
      await page.getByTestId('lang-en').hover();
      await until(() => js.some((f) => /^en-/.test(f)), 4000, 'diccionario inglés al acercar el cursor');
      await page.getByTestId('lang-en').click();
      await page.getByRole('heading', { name: 'Public rooms' }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: 'Public rooms' }).waitFor(); // con el inglés guardado se espera al diccionario antes del primer dibujo
      step('el diccionario inglés se baja solo al acercarse a "EN"; con el inglés guardado, la página arranca ya en inglés');
      await context.close();
    }

    // ================================================================ 3. esqueletos de carga
    {
      const { context, page } = await newPage(browser, 'skel');
      await delayServer(page, '"stats"', 1800);
      await page.goto(`${BASE}/salas`);
      await page.getByTestId('lobby-loading').waitFor({ timeout: 6000 });
      assert.equal(await page.getByTestId('room-skeleton').count(), 6, 'seis tarjetas fantasma con la forma de las reales');
      assert.equal(await page.locator('[data-testid="room-card"]').count(), 0);
      assert.equal(await page.getByTestId('lobby-loading').getAttribute('aria-busy'), 'true');
      assert.match(await page.getByRole('status').filter({ hasText: /Buscando salas|Conectando/ }).first().innerText(), /Buscando salas|Conectando/, 'lectores de pantalla oyen el estado');
      await page.screenshot({ path: path.join(SHOTS, 'perf-1-esqueleto-lobby.png') });
      await page.locator('[data-testid="room-card"]').first().waitFor({ timeout: 8000 });
      assert.equal(await page.getByTestId('room-skeleton').count(), 0, 'los esqueletos desaparecen al llegar los datos');
      step('el listado muestra 6 tarjetas esqueleto (con aria-busy y texto de estado) hasta que llegan las salas');
      await context.close();

      const home = await newPage(browser, 'skel-home');
      await delayServer(home.page, '"stats"', 1800);
      await home.page.goto(BASE);
      await home.page.getByTestId('preview-loading').waitFor({ timeout: 6000 });
      await home.page.getByTestId('preview-loading').waitFor({ state: 'detached', timeout: 8000 });
      step('la vista previa de salas del inicio también usa esqueleto mientras carga');
      await home.context.close();

      const room = await newPage(browser, 'skel-room');
      await delayServer(room.page, '"session"', 1800); // la respuesta de session:init
      await room.page.goto(`${BASE}/sala/${hosts[0].code}`);
      await room.page.getByTestId('game-skeleton').waitFor({ timeout: 6000 });
      await room.page.screenshot({ path: path.join(SHOTS, 'perf-2-esqueleto-sala.png') });
      await room.page.getByTestId('board').waitFor({ timeout: 8000 });
      assert.equal(await room.page.getByTestId('game-skeleton').count(), 0);
      step('al entrar a una sala se ve la forma de la partida (tablero y panel) en vez de un mensaje suelto');
      await room.context.close();

      // la pantalla que aún se está descargando (carga diferida) también tiene esqueleto
      const lazy = await newPage(browser, 'skel-lazy');
      await lazy.page.route('**/assets/Learn-*.js', async (route) => {
        await sleep(1500);
        await route.continue();
      });
      await lazy.page.goto(`${BASE}/aprender`);
      await lazy.page.getByTestId('page-skeleton').waitFor({ timeout: 6000 });
      await lazy.page.getByRole('heading', { name: 'Aprende a jugar', level: 1 }).waitFor({ timeout: 8000 });
      step('mientras se descarga el código de una pantalla se ve un esqueleto de página (con el menú ya visible)');
      await lazy.context.close();
    }

    // ================================================================ 4. búsqueda con debounce y suscripción única
    {
      const { context, page } = await newPage(browser, 'debounce');
      const sent = trackEmits(page);
      await page.goto(BASE);
      await page.getByText('Servidor en línea').first().waitFor();
      await page.getByRole('link', { name: 'Explorar listado' }).click();
      await page.locator('[data-testid="room-card"]').first().waitFor();
      await page.getByRole('link', { name: 'Inicio' }).first().click();
      await page.getByText('Salas públicas').first().waitFor();
      await page.getByRole('link', { name: 'Explorar listado' }).click();
      await page.locator('[data-testid="room-card"]').first().waitFor();
      await page.waitForTimeout(500);
      assert.equal(count(sent, 'lobby:subscribe'), 1, `una sola suscripción aunque se visite inicio y salas dos veces (${sent.join(', ')})`);
      assert.equal(count(sent, 'session:init'), 1);
      assert.equal(count(sent, 'lobby:unsubscribe'), 0, 'y no se da de baja y de alta al navegar entre pantallas');
      step('una sola suscripción al listado aunque se vaya inicio → salas → inicio → salas (sin baja y alta)');

      // Al teclear, la lista no se recalcula en cada letra: se ve a lo sumo un cambio, 200 ms después de la última tecla.
      await page.evaluate(() => {
        window.__counts = [];
        const grid = document.querySelector('[data-testid="room-grid"]');
        const read = () => window.__counts.push(grid.querySelectorAll('[data-testid="room-card"]').length);
        new MutationObserver(read).observe(grid, { childList: true });
      });
      const search = page.getByTestId('search');
      await search.click();
      for (const ch of 'aaa') {
        await page.keyboard.type(ch);
        await sleep(60);
      }
      assert.equal(await page.locator('[data-testid="room-card"]').count(), 6, 'recién tecleado, la lista aún no se filtró');
      assert.equal(await search.inputValue(), 'aaa', 'pero el campo responde al instante');
      await until(async () => (await page.locator('[data-testid="room-card"]').count()) < 6, 3000, 'filtro aplicado tras dejar de teclear');
      const seen = await page.evaluate(() => window.__counts);
      assert.ok(seen.length <= 2, `la lista cambió ${seen.length} veces al teclear 3 letras (${seen.join(' → ')})`);
      await page.getByRole('button', { name: 'Borrar búsqueda' }).click();
      assert.equal(await page.locator('[data-testid="room-card"]').count(), 6, 'borrar la búsqueda es inmediato');
      step(`filtrar tiene debounce de 200 ms: tras teclear 3 letras la lista cambió ${seen.length} vez/veces en vez de 3, y borrar es instantáneo`);
      await context.close();
    }

    // ================================================================ 5. jugada optimista: se ve al instante y se revierte si el servidor la rechaza
    {
      const host = await client('Rival Negras');
      const room = await host.ack('room:create', { visibility: 'private', color: 'b', clock: null });
      const { context, page } = await newPage(browser, 'optimista');
      let mode = 'normal';
      await page.routeWebSocket(/socket\.io/, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => {
          const m = typeof message === 'string' ? message.match(/^42(\d+)\["game:move"/) : null;
          if (m && mode === 'rechazar') {
            // el servidor "rechaza" la jugada: nunca llega a él; el cliente recibe el error de un movimiento ilegal
            setTimeout(() => ws.send(`43${m[1]}[{"ok":false,"error":{"code":"ILLEGAL_MOVE","message":"Movimiento ilegal."}}]`), 600);
            return;
          }
          server.send(message);
        });
        server.onMessage((message) => {
          if (mode === 'lento') setTimeout(() => ws.send(message), 1500);
          else ws.send(message);
        });
      });
      await page.goto(`${BASE}/sala/${room.code}`);
      await page.getByTestId('board').waitFor();
      await page.getByTestId('btn-draw').waitFor(); // jugador de blancas: la partida arrancó
      await page.waitForTimeout(1800); // deja que Socket.IO pase de polling a WebSocket
      const onSquare = (sq) => page.locator(`[data-piece][data-on="${sq}"]`).count();

      mode = 'lento'; // todo lo que viene del servidor tarda 1,5 s (incluida la confirmación)
      const t0 = Date.now();
      await click(page, 'e2');
      await click(page, 'e4');
      await until(async () => (await onSquare('e4')) === 1, 600, 'el peón aparece en e4 al instante');
      const shown = Date.now() - t0;
      assert.equal(await onSquare('e2'), 0);
      assert.ok(shown < 700, `la jugada se vio a los ${shown} ms, sin esperar al servidor (1500 ms)`);
      await until(async () => (await page.locator('[data-testid="move-list"] li button').count()) === 1, 6000, 'confirmación del servidor');
      assert.equal(await onSquare('e4'), 1, 'y al llegar la confirmación todo sigue igual');
      step(`jugada optimista: el peón se ve en e4 a los ${shown} ms aunque el servidor tarde 1,5 s en confirmar`);

      // el rival responde, y esta vez el servidor "rechaza" nuestra jugada (desincronización)
      await host.ack('game:move', { from: 'e7', to: 'e5' });
      await until(async () => (await page.locator('[data-testid="move-list"] li button').count()) === 2, 6000, 'respuesta del rival');
      mode = 'rechazar';
      await click(page, 'd2');
      await click(page, 'd4');
      await until(async () => (await onSquare('d4')) === 1, 500, 'la jugada se muestra de inmediato');
      await until(async () => (await onSquare('d4')) === 0 && (await onSquare('d2')) === 1, 4000, 'el tablero revierte al ser rechazada');
      await page.getByText('Movimiento ilegal.').waitFor({ timeout: 3000 });
      mode = 'normal';
      assert.equal(await page.locator('[data-testid="move-list"] li button').count(), 2, 'la lista de jugadas no cambió');
      // y después de revertir se puede seguir jugando normalmente
      await click(page, 'd2');
      await click(page, 'd4');
      await until(async () => (await page.locator('[data-testid="move-list"] li button').count()) === 3, 6000, 'jugada válida tras el rechazo');
      step('si el servidor rechaza la jugada, el tablero revierte y avisa ("Movimiento ilegal."); la partida sigue sin romperse');
      await context.close();
    }

    // ================================================================ 6. lista de jugadas virtualizada en partidas largas
    {
      const { Chess } = await import('chess.js');
      const a = await client('Larga Blancas');
      const b = await client('Larga Negras');
      const room = await a.ack('room:create', { visibility: 'private', color: 'w', clock: null });
      await b.ack('room:join', { code: room.code });
      const game = new Chess();
      let seed = 777;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
      let ply = 0;
      while (ply < 200 && !game.isGameOver()) {
        const legal = game.moves({ verbose: true });
        const safe = legal.filter((m) => { game.move(m); const over = game.isGameOver(); game.undo(); return !over; });
        const pool = safe.length ? safe : legal;
        const pick = pool[Math.floor(rnd() * pool.length)];
        game.move(pick);
        const res = await (ply % 2 === 0 ? a : b).ack('game:move', { from: pick.from, to: pick.to, promotion: pick.promotion });
        if (!res.ok) break;
        ply++;
      }
      assert.ok(ply > 130, `partida larga de ${ply} jugadas`);
      const rowsTotal = Math.ceil(ply / 2);

      const { context, page } = await newPage(browser, 'larga');
      await page.goto(`${BASE}/sala/${room.code}`);
      await page.getByTestId('board').waitFor();
      const list = page.getByTestId('move-list');
      await list.locator('li').first().waitFor();
      assert.equal(await list.getAttribute('data-virtual'), 'true', 'más de 60 filas: se activa la ventana virtual');
      const rows = await list.locator('li').count();
      assert.ok(rows < 45, `en el DOM solo hay ${rows} de ${rowsTotal} filas`);
      assert.match(await list.locator('li').last().innerText(), new RegExp(`${rowsTotal}\\.[\\s\\S]*Actual`, 'i'), 'en vivo la lista está en la última jugada, marcada como actual');
      const atBottom = await list.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 4);
      assert.ok(atBottom, 'la lista sigue a la última jugada');
      step(`partida de ${ply} jugadas: solo ${rows} de ${rowsTotal} filas en el DOM, sigue a la última y la marca como "Actual"`);

      // Se puede llegar a todas las filas desplazándose y a cualquier jugada
      const seen = await list.evaluate(async (el) => {
        const found = new Set();
        for (let y = el.scrollHeight; y >= 0; y -= el.clientHeight / 2) {
          el.scrollTop = y;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          el.querySelectorAll('li').forEach((li) => found.add(parseInt(li.innerText, 10)));
        }
        return found.size;
      });
      assert.equal(seen, rowsTotal, 'al desplazarse aparecen todas las filas, sin huecos');
      await list.evaluate((el) => { el.scrollTop = 0; });
      await list.locator('li', { hasText: /^1\./ }).waitFor();
      const middleStart = await page.locator('[data-square]').first().getAttribute('data-square');
      void middleStart;
      await list.locator('li', { hasText: /^1\./ }).getByRole('button').first().click();
      await page.getByText(/Viendo la jugada 1\./).waitFor();
      await page.keyboard.press('End');
      await page.getByText(/Viendo la jugada/).waitFor({ state: 'detached' });
      await until(async () => /Actual/i.test(await list.locator('li').last().innerText()), 3000, 'vuelve a la última jugada');
      await page.keyboard.press('Home');
      await page.getByText(/Viendo la jugada 0\./).waitFor();
      await until(async () => /^1\./.test((await list.locator('li').first().innerText()).trim()), 3000, 'Inicio lleva la lista a la primera fila');
      await page.keyboard.press('End');
      step('se llega a todas las filas desplazándose; clic en una jugada, "Inicio" y "Fin" del teclado siguen funcionando');
      await page.screenshot({ path: path.join(SHOTS, 'perf-3-partida-larga.png') });
      await context.close();
    }

    // ================================================================ 7. íconos: la fuente de íconos se aplica en todas las pantallas
    {
      const { context, page } = await newPage(browser, 'iconos');
      for (const route of ['/', '/salas', '/aprender', '/aprender/caballo']) {
        await page.goto(`${BASE}${route}`);
        await page.getByText('Servidor en línea').first().waitFor();
        await page.waitForTimeout(500);
        const broken = await page.evaluate(() => [...document.querySelectorAll('.icon')].filter((el) => el.getBoundingClientRect().width > 40).map((el) => el.textContent));
        assert.deepEqual(broken, [], `íconos que se ven como texto en ${route}`);
      }
      step('en todas las pantallas los íconos se dibujan como íconos (ninguno aparece como su nombre en texto)');
      await context.close();
    }

    assert.deepEqual(errors, [], `errores en consola:\n${errors.join('\n')}`);
    step('sin errores de consola ni de página');
    console.log('\nOptimizaciones de rendimiento: todo en orden ✔');
  } catch (e) {
    console.error('\n✘ FALLÓ:', e.message);
    process.exitCode = 1;
  } finally {
    for (const c of clients) c.socket.close();
    await browser.close();
  }
})();
