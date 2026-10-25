// E2E de la fase g (salas públicas) con navegadores reales y clientes socket que crean salas "de fondo".
// Requiere un servidor FRESCO (sin salas) con MIN_CLOCK_SECONDS=1:
//   (backend sirviendo frontend/dist)  BASE_URL=http://localhost:3917 node e2e/phase-g.cjs
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

/** Cliente socket sin interfaz: crea las salas que el listado debe mostrar. */
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

const cards = (page) => page.getByTestId('room-card');
const card = (page, code) => page.locator(`[data-testid="room-card"][data-code="${code}"]`);
const text = async (locator) => (await locator.textContent()).replace(/\s+/g, ' ').trim();

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
    await sleep(100);
  }
  throw new Error(`Tiempo agotado esperando: ${what}${last ? ` (${last.message})` : ''}`);
}
const waitCount = (locator, n, timeout = 8000) =>
  until(async () => (await locator.count()) === n, timeout, `${n} elemento(s), hay ${'?'}`).catch(async (e) => {
    throw new Error(`${e.message}; hay ${await locator.count()}`);
  });
const seconds = (clock) => {
  const [m, s] = clock.trim().split(':').map(Number);
  return m * 60 + s;
};

(async () => {
  const browser = await chromium.launch();
  try {
    const viewer = await newPage(browser, 'viewer');
    const page = viewer.page;
    await page.goto(`${BASE}/salas`);

    // ------------------------------------------------------------------ vacío
    await page.getByTestId('empty-lobby').waitFor();
    assert.match(await text(page.getByTestId('stats')), /0 salas.*0 jugadores.*0 espectadores/);
    assert.equal(await page.getByTestId('range').count(), 0, 'sin paginación cuando no hay salas');
    await page.screenshot({ path: path.join(SHOTS, 'g-1-vacio.png') });
    step('estado vacío con contadores en cero');

    // ------------------------------------------------ salas que aparecen en vivo
    const priv = await client('Dani Privado');
    assert.equal((await priv.ack('room:create', { visibility: 'private', color: 'w', clock: null })).ok, true);
    const botUser = await client('Eva Bot');
    const botRes = await botUser.ack('bot:start', { level: 'beginner', color: 'w' });
    console.log(botRes.ok ? '  (sala de bot creada)' : '  (sin Stockfish: se omite la sala de bot)');

    const ana = await client('Ana Torres');
    const roomA = (await ana.ack('room:create', { visibility: 'public', color: 'w', clock: null })).code;
    await card(page, roomA).waitFor({ timeout: 8000 });
    step(`la sala ${roomA} aparece sin recargar la página`);

    const beto = await client('Beto Ruiz');
    const carla = await client('Carla Mirón');
    const roomB = (await beto.ack('room:create', { visibility: 'public', color: 'w', clock: { initialSeconds: 180, incrementSeconds: 2 } })).code;
    assert.equal((await carla.ack('room:join', { code: roomB })).ok, true);
    assert.equal((await beto.ack('game:move', { from: 'e2', to: 'e4' })).ok, true);
    await until(async () => (await text(card(page, roomB))).includes('En juego'), 8000, 'sala B en juego');
    await sleep(1500); // dos ciclos del throttle: la privada y la del bot no deben colarse
    assert.equal(await cards(page).count(), 2, 'solo las 2 salas públicas');
    step('las salas privadas y de bot no aparecen');

    assert.match(await text(page.getByTestId('stats')), /2 salas.*3 jugadores.*0 espectadores/);
    const cardA = card(page, roomA);
    const cardB = card(page, roomB);
    const textA = await text(cardA);
    const textB = await text(cardB);
    assert.match(textA, /1 \/ 2 cupos/);
    assert.match(textA, /Ana Torres/);
    assert.match(textA, /Esperando retador/);
    assert.match(textA, /Sin reloj/);
    assert.match(textA, /Unirse a la partida/);
    assert.match(textB, new RegExp(`#${roomB}`));
    assert.match(textB, /Beto Ruiz/);
    assert.match(textB, /Carla Mirón/);
    assert.match(textB, /Blitz 3\+2/);
    assert.match(textB, /Ver como espectador/);
    assert.match(await cardB.getByTestId('miniboard').getAttribute('data-fen'), /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b/);
    step('tarjetas: código, jugadores, reloj, estado y botón correcto en cada una');
    await page.screenshot({ path: path.join(SHOTS, 'g-2-dos-salas.png') });

    // --------------------------------------------------------------- búsqueda
    const search = page.getByTestId('search');
    await search.fill(`#${roomA.toLowerCase()}`);
    await waitCount(cards(page), 1);
    assert.equal(await cards(page).first().getAttribute('data-code'), roomA);
    await search.fill('miron'); // sin acentos
    await waitCount(cards(page), 1);
    assert.equal(await cards(page).first().getAttribute('data-code'), roomB);
    await search.fill('ANA');
    await waitCount(cards(page), 1);
    assert.equal(await cards(page).first().getAttribute('data-code'), roomA);
    await search.fill('zzzzzz');
    await page.getByTestId('no-results').waitFor();
    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await waitCount(cards(page), 2);
    assert.equal(await search.inputValue(), '');
    step('búsqueda por código, por nombre sin acentos, sin resultados y "Quitar filtros"');

    // ---------------------------------------------------------------- filtros
    const counts = async () =>
      Object.fromEntries(
        await Promise.all(['all', 'waiting', 'bullet', 'blitz', 'rapid', 'none', 'spectators'].map(async (f) => [f, await text(page.getByTestId(`count-${f}`))])),
      );
    assert.deepEqual(await counts(), { all: '(2)', waiting: '(1)', bullet: '(0)', blitz: '(1)', rapid: '(0)', none: '(1)', spectators: '(0)' });
    await page.getByTestId('filter-waiting').click();
    await waitCount(cards(page), 1);
    assert.equal(await cards(page).first().getAttribute('data-code'), roomA);
    await page.getByTestId('filter-blitz').click();
    await waitCount(cards(page), 1);
    assert.equal(await cards(page).first().getAttribute('data-code'), roomB);
    await page.getByTestId('filter-none').click();
    await waitCount(cards(page), 1);
    assert.equal(await cards(page).first().getAttribute('data-code'), roomA);
    await page.getByTestId('filter-bullet').click();
    await page.getByTestId('no-results').waitFor();
    await page.getByTestId('filter-all').click();
    await waitCount(cards(page), 2);
    step('filtros: todas, esperan rival, blitz, sin reloj, vacío — con contadores correctos');

    // ------------------------------------------------------------- paginación
    const fillers = [];
    for (let i = 1; i <= 8; i++) {
      const f = await client(`Relleno ${i}`);
      assert.equal((await f.ack('room:create', { visibility: 'public', color: 'w', clock: null })).ok, true);
      fillers.push(f);
    }
    await until(async () => /1-6\s*de\s*10/.test(await text(page.getByTestId('range'))), 8000, 'rango 1-6 de 10');
    await waitCount(cards(page), 6);
    assert.equal(await page.getByTestId('page-prev').isDisabled(), true);
    await page.getByTestId('page-2').click();
    await waitCount(cards(page), 4);
    assert.match(await text(page.getByTestId('range')), /7-10\s*de\s*10/);
    assert.equal(await page.getByTestId('page-next').isDisabled(), true);
    await page.getByTestId('page-prev').click();
    await waitCount(cards(page), 6);
    step('paginación de 6 en 6: "1-6 de 10", página 2 con 4, anterior/siguiente deshabilitados en los extremos');

    await page.getByTestId('page-2').click();
    await page.getByTestId('filter-waiting').click(); // cambiar de filtro vuelve a la página 1
    assert.match(await text(page.getByTestId('range')), /1-6\s*de\s*9/);
    await page.getByTestId('filter-all').click();
    await page.getByTestId('page-2').click();
    await waitCount(cards(page), 4);
    for (const f of fillers) await f.ack('room:leave'); // salen mientras se mira la página 2
    await until(async () => /1-2\s*de\s*2/.test(await text(page.getByTestId('range'))), 10000, 'la página se ajusta a 1-2 de 2');
    await waitCount(cards(page), 2);
    assert.equal(await page.getByTestId('page-2').count(), 0, 'ya no hay página 2');
    step('al cambiar de filtro se vuelve a la página 1; si desaparecen salas la página se ajusta sola');

    // ----------------------------------------------------- reloj en vivo y tiempo bajo
    const frank = await client('Frank Sol');
    const gina = await client('Gina Luna');
    const roomC = (await frank.ack('room:create', { visibility: 'public', color: 'w', clock: { initialSeconds: 12, incrementSeconds: 0 } })).code;
    assert.equal((await gina.ack('room:join', { code: roomC })).ok, true);
    assert.equal((await frank.ack('game:move', { from: 'e2', to: 'e4' })).ok, true);
    const cardC = card(page, roomC);
    await cardC.waitFor();
    await until(async () => (await text(cardC)).includes('Tiempo bajo'), 9000, 'insignia "Tiempo bajo"');
    const t1 = seconds(await text(cardC.getByTestId('clock-b')));
    await sleep(1300);
    const t2 = seconds(await text(cardC.getByTestId('clock-b')));
    assert.ok(t2 < t1, `el reloj de las negras corre en vivo (${t1}s → ${t2}s)`);
    assert.ok(t1 <= 10, 'bajo 10 s');
    await sleep(700); // deja terminar la animación de entrada
    await page.screenshot({ path: path.join(SHOTS, 'g-3-tiempo-bajo.png') });
    step(`"Tiempo bajo" y reloj en vivo (${t1}s → ${t2}s) sin recargar`);

    // Las negras se quedan sin tiempo: la partida termina y la sala sale del listado.
    await until(async () => (await cards(page).count()) === 2, 12000, 'la sala terminada sale del listado');
    await frank.ack('room:leave');
    await gina.ack('room:leave');
    step('al terminar la partida la tarjeta desaparece del listado');

    // ------------------------------------------------- entrar como jugador
    const joiner = await newPage(browser, 'joiner');
    await joiner.page.goto(`${BASE}/salas`);
    await card(joiner.page, roomA).getByRole('button', { name: /Unirse a la partida/ }).click();
    await joiner.page.waitForURL(new RegExp(`/sala/${roomA}$`));
    await joiner.page.getByTestId('board').waitFor();
    await until(async () => (await text(card(page, roomA))).includes('En juego'), 8000, 'sala A pasa a "En juego"');
    assert.match(await text(page.getByTestId('stats')), /2 salas.*4 jugadores/);
    assert.match(await text(card(page, roomA)), /Ver como espectador/);
    step('"Unirse a la partida" te sienta como jugador y el listado pasa la sala a "En juego"');

    // la propia sala ofrece volver
    await joiner.page.goto(`${BASE}/salas`);
    const mine = card(joiner.page, roomA);
    await mine.getByRole('button', { name: /Volver a tu sala/ }).click();
    await joiner.page.waitForURL(new RegExp(`/sala/${roomA}$`));
    step('tu propia sala muestra "Volver a tu sala"');

    // ------------------------------------------------- entrar como espectador
    const spec = await newPage(browser, 'spec');
    await spec.page.goto(`${BASE}/salas`);
    await card(spec.page, roomB).getByRole('button', { name: /Ver como espectador/ }).click();
    await spec.page.waitForURL(new RegExp(`/sala/${roomB}$`));
    await spec.page.getByTestId('board').waitFor();
    await until(async () => /(^|\s)1$/.test(await text(card(page, roomB).getByTestId('spectators'))), 8000, 'contador de espectadores en 1');
    assert.match(await text(page.getByTestId('count-spectators')), /\(1\)/);
    assert.match(await text(page.getByTestId('stats')), /1 espectador\b/);
    await page.getByTestId('filter-spectators').click();
    await waitCount(cards(page), 1);
    assert.equal(await cards(page).first().getAttribute('data-code'), roomB);
    await page.getByTestId('filter-all').click();
    step('"Ver como espectador" funciona y el contador sube en vivo en el listado');

    // ------------------------------------------------------- sala aleatoria
    const hugo = await client('Hugo Vela');
    const roomH = (await hugo.ack('room:create', { visibility: 'public', color: 'w', clock: null })).code;
    await card(page, roomH).waitFor();
    const rnd = await newPage(browser, 'rnd');
    await rnd.page.goto(`${BASE}/salas`);
    await card(rnd.page, roomH).waitFor();
    await rnd.page.getByTestId('btn-random').click();
    await rnd.page.waitForURL(new RegExp(`/sala/${roomH}$`));
    await rnd.page.getByTestId('board').waitFor();
    step('"Entrar a sala aleatoria" te lleva a la única sala en espera');

    // ----------------------------------------------- crear sala desde el lobby
    const creator = await newPage(browser, 'creator');
    await creator.page.goto(`${BASE}/salas`);
    await creator.page.getByTestId('btn-create').click();
    const dialog = creator.page.getByRole('dialog', { name: 'Crear sala' });
    assert.equal(await dialog.getByRole('radio', { name: /Pública/ }).getAttribute('aria-checked'), 'true', 'pública por defecto');
    assert.equal(await dialog.getByRole('radio', { name: /Blitz|3\+2|3 \+ 2/ }).first().getAttribute('aria-checked'), 'true', 'reloj 3+2 por defecto');
    await dialog.getByRole('button', { name: /Crear sala/ }).click();
    await creator.page.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
    const roomD = creator.page.url().split('/').pop();
    await card(page, roomD).waitFor({ timeout: 8000 });
    step(`crear desde el lobby: ya viene "Pública" y la sala ${roomD} aparece para los demás`);

    // ------------------------------------------------------------- vista lista
    await page.getByTestId('view-list').click();
    await page.getByTestId('room-list').waitFor();
    const rows = await cards(page).count();
    assert.ok(rows >= 4, `vista de lista con ${rows} filas`);
    assert.equal(await page.getByTestId('room-grid').count(), 0);
    await sleep(700); // deja terminar la animación de entrada
    await page.screenshot({ path: path.join(SHOTS, 'g-4-lista.png') });
    await page.getByTestId('view-grid').click();
    await page.getByTestId('room-grid').waitFor();
    await sleep(700); // deja terminar la animación de entrada
    await page.screenshot({ path: path.join(SHOTS, 'g-5-cuadricula.png') });
    step('alternar entre cuadrícula y lista conserva las salas');

    // ------------------------------------------------------ botón actualizar
    await page.getByTestId('btn-refresh').click();
    await cards(page).first().waitFor();
    step('"Actualizar lista" no rompe nada');

    // ------------------------------------------------------------------ móvil
    const mobile = await newPage(browser, 'mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.page.goto(`${BASE}/salas`);
    await mobile.page.getByTestId('room-grid').waitFor();
    const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `desborde horizontal en móvil: ${overflow}px`);
    assert.equal(await mobile.page.getByTestId('view-list').isVisible(), false, 'sin selector de vista en móvil');
    await mobile.page.getByTestId('filter-waiting').scrollIntoViewIfNeeded();
    await sleep(700);
    await mobile.page.screenshot({ path: path.join(SHOTS, 'g-6-movil.png') });
    step('móvil de 390 px: sin desborde horizontal');

    assert.deepEqual(errors, [], `errores en consola:\n${errors.join('\n')}`);
    step('sin errores de consola ni de página');
    console.log('\nFase g: todo en orden ✔');
  } catch (e) {
    console.error('\n✘ FALLÓ:', e.message);
    process.exitCode = 1;
  } finally {
    for (const c of clients) c.socket.close();
    await browser.close();
  }
})();
