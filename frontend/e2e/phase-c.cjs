// E2E de la fase c (tablero) con navegadores reales. Requiere el backend sirviendo frontend/dist
// y arrancado con MIN_CLOCK_SECONDS=1 (para la prueba de caída de bandera):
//   MIN_CLOCK_SECONDS=1 PORT=3917 node ../backend/src/index.js &
//   BASE_URL=http://localhost:3917 node e2e/phase-c.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const step = (m) => console.log(`✔ ${m}`);
const errors = [];
const allPages = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPlayer(browser, label, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', ...opts });
  const page = await context.newPage();
  allPages.push([label, page]);
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] console: ${m.text()}`));
  return { context, page, label };
}

async function setName(page, name) {
  // Esperar a estar en línea: el nombre inicial que manda el servidor llega justo en ese momento y
  // una persona no puede teclear en el mismo milisegundo; la automatización sí.
  await page.getByText('Servidor en línea').waitFor();
  const input = page.locator('#player-name');
  await input.fill(name);
  await input.press('Enter');
  await page.getByRole('button', { name: new RegExp(`Tu nombre: ${name}`) }).waitFor();
}

const piece = (page, id, on) => page.locator(`[data-piece="${id}"][data-on="${on}"]`);
const waitPiece = (page, id, on, timeout = 5000) => piece(page, id, on).waitFor({ timeout });
const waitNoPiece = (page, id, on) => piece(page, id, on).waitFor({ state: 'detached', timeout: 5000 });
const plies = (page) => page.locator('[data-testid="move-list"] li button').count();
/** Espera a que la lista de jugadas llegue a `n` (el servidor ya confirmó la última). */
async function waitPlies(page, n, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await plies(page)) === n) return;
    await sleep(50);
  }
  throw new Error(`esperaba ${n} jugadas y hay ${await plies(page)}`);
}

async function center(page, square) {
  const box = await page.locator(`[data-square="${square}"]`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function clickSquare(page, square) {
  const { x, y } = await center(page, square);
  await page.mouse.click(x, y);
}
/** Mueve con dos clics (origen y destino). */
async function clickMove(page, from, to) {
  await clickSquare(page, from);
  await clickSquare(page, to);
}
/** Mueve arrastrando la pieza con el ratón. */
async function dragMove(page, from, to) {
  const a = await center(page, from);
  const b = await center(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}
/** Espera a que el tablero muestre esa orientación y no quede ningún resultado encima. */
async function waitNewGame(page, orientation) {
  await page.waitForFunction(
    (o) => document.querySelector('[data-testid="board"]')?.dataset.orientation === o && !document.querySelector('[data-testid="game-result"]'),
    orientation,
  );
  await page.locator('[data-piece]').first().waitFor();
}
async function legalSquares(page) {
  return (await page.locator('[data-legal]').evaluateAll((els) => els.map((e) => `${e.dataset.square}:${e.dataset.legal}`))).sort();
}

/** Crea una sala desde el diálogo con las opciones dadas y devuelve el código. */
async function createRoomUI(page, { visibility = 'private', color = 'Blancas', clock = '3+2' } = {}) {
  await page.getByRole('button', { name: /Configurar y crear/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Crear sala' });
  await dialog.getByRole('radio', { name: new RegExp(visibility === 'public' ? 'Pública' : 'Privada') }).click();
  await dialog.getByRole('radio', { name: color }).click();
  await dialog.getByRole('radio', { name: clock }).click();
  await dialog.getByRole('button', { name: /Crear sala/ }).click();
  await page.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
  return page.url().split('/').pop();
}

(async () => {
  const browser = await chromium.launch();
  try {
    const host = await newPlayer(browser, 'host');
    const guest = await newPlayer(browser, 'guest');
    await host.page.goto(BASE);
    await setName(host.page, 'Ana Torres');
    await guest.page.goto(BASE);
    await setName(guest.page, 'Beto Ruiz');

    const code = await createRoomUI(host.page, { visibility: 'public', color: 'Blancas', clock: '3+2' });
    await guest.page.goto(`${BASE}/sala/${code}`);
    for (const p of [host.page, guest.page]) await p.getByTestId('board').waitFor();
    step(`partida ${code} iniciada: ambos jugadores ven el tablero`);

    // ----------------------------------------------------------------- orientación y piezas
    assert.equal(await host.page.getByTestId('board').getAttribute('data-orientation'), 'w');
    assert.equal(await guest.page.getByTestId('board').getAttribute('data-orientation'), 'b');
    assert.equal(await host.page.locator('[data-piece]').count(), 32);
    await waitPiece(host.page, 'wk', 'e1');
    await waitPiece(guest.page, 'bk', 'e8');
    step('orientación correcta (cada jugador abajo con su color) y 32 piezas');
    await host.page.screenshot({ path: path.join(SHOTS, 'c01-start-host.png'), fullPage: true });

    // ------------------------------------------------ resaltado de jugadas legales y turnos
    await clickSquare(host.page, 'e2');
    assert.deepEqual(await legalSquares(host.page), ['e3:move', 'e4:move']);
    await clickSquare(host.page, 'g1');
    assert.deepEqual(await legalSquares(host.page), ['f3:move', 'h3:move']);
    await clickSquare(host.page, 'g1'); // clic de nuevo = deseleccionar
    assert.deepEqual(await legalSquares(host.page), []);
    await clickSquare(host.page, 'e7'); // pieza rival: no se selecciona
    assert.deepEqual(await legalSquares(host.page), []);
    await clickSquare(guest.page, 'e7'); // no es su turno
    assert.deepEqual(await legalSquares(guest.page), []);
    step('se resaltan las jugadas legales; no se puede seleccionar piezas rivales ni fuera de turno');
    await clickSquare(host.page, 'e2');
    await host.page.screenshot({ path: path.join(SHOTS, 'c02-legal-moves.png') });
    await clickSquare(host.page, 'e2');

    // ------------------------------------------------------ jugada por clic + animación + reloj
    const pawnNode = await piece(host.page, 'wp', 'e2').elementHandle();
    await clickMove(host.page, 'e2', 'e4');
    await waitPiece(host.page, 'wp', 'e4');
    await waitPiece(guest.page, 'wp', 'e4');
    assert.equal(await pawnNode.getAttribute('data-on'), 'e4', 'la misma pieza se desliza (no se recrea)');
    assert.match(await pawnNode.evaluate((el) => getComputedStyle(el).transitionProperty), /transform/);
    step('jugada por clic llega al rival y la pieza se anima (mismo nodo, transición de transform)');

    await guest.page.getByTestId('strip-b').getByText('Tu turno').waitFor();
    const clockText = async (p) => (await p.getByTestId('clock-active').innerText()).replace(/[^\d:]/g, '');
    const t1 = await clockText(guest.page);
    await sleep(1500);
    const t2 = await clockText(guest.page);
    assert.match(t1, /\d:\d\d/);
    assert.notEqual(t1, t2, 'el reloj activo debe avanzar');
    assert.match(await host.page.getByTestId('strip-w').innerText(), /3:00/);
    step(`el reloj del turno corre (${t1} → ${t2}) y el inactivo se mantiene`);

    // ------------------------------------------------------------- jugada por arrastre
    await dragMove(guest.page, 'e7', 'e5');
    await waitPiece(host.page, 'bp', 'e5');
    await waitPiece(guest.page, 'bp', 'e5');
    step('jugada por arrastre (ratón) funciona');

    // ---------------------------------------------------- jugada ilegal / no se mueve
    const before = await plies(host.page);
    await clickMove(host.page, 'e4', 'e6'); // el peón está bloqueado y no puede saltar
    await sleep(300);
    assert.equal(await plies(host.page), before);
    await waitPiece(host.page, 'wp', 'e4');
    step('una jugada ilegal se ignora');

    // --------------------------- partida de reglas especiales: enroque y captura al paso
    const script = [
      ['h', 'g1', 'f3'], ['g', 'b8', 'c6'], ['h', 'f1', 'c4'], ['g', 'f8', 'c5'],
      ['h', 'e1', 'g1'], // enroque corto
      ['g', 'g8', 'f6'], ['h', 'd2', 'd4'], ['g', 'e5', 'd4'], ['h', 'e4', 'e5'], ['g', 'd7', 'd5'],
    ];
    let expected = 2; // e4 y e5 ya se jugaron
    for (const [who, from, to] of script) {
      await clickMove(who === 'h' ? host.page : guest.page, from, to);
      await waitPlies(host.page, ++expected);
    }
    await waitPiece(host.page, 'wk', 'g1');
    await waitPiece(host.page, 'wr', 'f1');
    await waitPiece(guest.page, 'wr', 'f1');
    step('enroque: el rey y la torre se mueven juntos');
    await waitPiece(host.page, 'bp', 'd5');
    await clickSquare(host.page, 'e5');
    assert.ok((await legalSquares(host.page)).includes('d6:capture'), 'la captura al paso debe aparecer como jugada legal');
    await clickSquare(host.page, 'd6');
    await waitPiece(host.page, 'wp', 'd6');
    await waitNoPiece(host.page, 'bp', 'd5');
    await waitNoPiece(guest.page, 'bp', 'd5');
    step('captura al paso: el peón capturado desaparece');
    await waitPlies(host.page, 13);
    await host.page.screenshot({ path: path.join(SHOTS, 'c03-midgame.png'), fullPage: true });

    // ---------------------------------------------------------- historial navegable
    await host.page.getByRole('button', { name: 'e4', exact: true }).first().click();
    await waitPiece(host.page, 'wp', 'e4');
    await host.page.getByText(/Viendo la jugada 1/).waitFor();
    assert.equal(await host.page.locator('[data-legal]').count(), 0);
    await clickSquare(host.page, 'g1'); // al mirar el historial no se puede mover
    assert.equal(await host.page.locator('[data-legal]').count(), 0);
    await host.page.keyboard.press('ArrowLeft');
    await host.page.getByText(/Viendo la jugada 0/).waitFor();
    await waitPiece(host.page, 'wp', 'e2');
    await host.page.keyboard.press('End');
    await waitPiece(host.page, 'wp', 'd6');
    await host.page.getByText(/Viendo la jugada/).waitFor({ state: 'detached' });
    step('el historial se navega con clic y teclado (sin poder mover) y se vuelve a la partida en vivo');

    // -------------------------------------------------- voltear tablero y recarga (reconexión)
    await host.page.getByTestId('btn-flip').click();
    assert.equal(await host.page.getByTestId('board').getAttribute('data-orientation'), 'b');
    await host.page.getByTestId('btn-flip').click();
    await host.page.reload();
    await host.page.getByTestId('board').waitFor();
    await waitPiece(host.page, 'wp', 'd6');
    await waitPiece(host.page, 'wr', 'f1');
    assert.equal(await plies(host.page), 13);
    step('voltear el tablero funciona y al recargar la partida sigue idéntica');

    // ------------------------------------------------------------------ espectador
    const spec = await newPlayer(browser, 'spec');
    await spec.page.goto(BASE);
    await setName(spec.page, 'Mirón');
    await spec.page.goto(`${BASE}/sala/${code}`);
    await spec.page.getByTestId('board').waitFor();
    await waitPiece(spec.page, 'wp', 'd6');
    assert.equal(await spec.page.getByTestId('board').getAttribute('data-orientation'), 'w');
    await clickSquare(spec.page, 'g1');
    assert.equal(await spec.page.locator('[data-legal]').count(), 0);
    assert.equal(await spec.page.getByTestId('btn-resign').count(), 0);
    await spec.page.locator('.badge', { hasText: 'Espectador' }).waitFor();
    await clickMove(guest.page, 'f6', 'e4'); // negras mueven (Cf6xe4): el espectador lo ve en vivo
    await waitPiece(spec.page, 'bn', 'e4');
    step('el espectador ve el tablero y las jugadas en vivo sin poder mover ni rendirse');
    await spec.context.close();

    // -------------------------------------------------- rendición, resultado y revancha
    await host.page.getByTestId('btn-resign').click();
    await host.page.getByTestId('confirm-resign').click();
    await host.page.getByTestId('game-result').waitFor();
    await guest.page.getByTestId('game-result').waitFor();
    assert.match(await host.page.getByTestId('game-result').innerText(), /Derrota[\s\S]*Ana Torres se rindió/);
    assert.match(await guest.page.getByTestId('game-result').innerText(), /Victoria[\s\S]*Ana Torres se rindió/);
    await host.page.screenshot({ path: path.join(SHOTS, 'c04-result.png'), fullPage: true });
    step('rendirse: derrota para quien se rinde, victoria para el rival, con el motivo');

    await host.page.getByRole('button', { name: /Pedir revancha/ }).click();
    await guest.page.getByRole('button', { name: /Ana Torres quiere revancha/ }).waitFor();
    await guest.page.getByRole('button', { name: /Ana Torres quiere revancha/ }).click();
    await waitNewGame(host.page, 'b');
    await waitNewGame(guest.page, 'w');
    assert.equal(await plies(host.page), 0);
    assert.equal(await host.page.locator('[data-piece]').count(), 32);
    await waitPiece(host.page, 'bk', 'e8');
    step('revancha: colores intercambiados, tablero y jugadas reiniciados');

    // ----------------------------------------- mate del loco (host ahora juega negras)
    await clickMove(guest.page, 'f2', 'f3');
    await waitPiece(host.page, 'wp', 'f3');
    await clickMove(host.page, 'e7', 'e5');
    await waitPiece(guest.page, 'bp', 'e5');
    await clickMove(guest.page, 'g2', 'g4');
    await waitPiece(host.page, 'wp', 'g4');
    await clickMove(host.page, 'd8', 'h4');
    await host.page.getByTestId('game-result').waitFor();
    await guest.page.getByTestId('game-result').waitFor();
    assert.match(await host.page.getByTestId('game-result').innerText(), /Victoria[\s\S]*Jaque mate/);
    assert.match(await guest.page.getByTestId('game-result').innerText(), /Derrota[\s\S]*Jaque mate/);
    step('jaque mate detectado: victoria / derrota con el motivo');

    // ------------------------------- jaque + tablas (revancha: host vuelve a ser blancas)
    await host.page.getByRole('button', { name: /Pedir revancha/ }).click();
    await guest.page.getByRole('button', { name: /quiere revancha/ }).click();
    await waitNewGame(host.page, 'w');
    await waitNewGame(guest.page, 'b');
    await clickMove(host.page, 'e2', 'e4');
    await waitPiece(guest.page, 'wp', 'e4');
    await clickMove(guest.page, 'f7', 'f6');
    await waitPiece(host.page, 'bp', 'f6');
    await clickMove(host.page, 'd1', 'h5'); // Dh5+
    await guest.page.getByTestId('check-badge').waitFor();
    await host.page.getByTestId('check-badge').waitFor();
    await guest.page.screenshot({ path: path.join(SHOTS, 'c05-check.png'), fullPage: true });
    step('¡Jaque! se señala con insignia y el rey resaltado');
    await clickMove(guest.page, 'g7', 'g6');
    await waitPiece(host.page, 'bp', 'g6');
    await host.page.getByTestId('check-badge').waitFor({ state: 'detached' });

    await host.page.getByTestId('btn-draw').click();
    await guest.page.getByTestId('draw-offer').waitFor();
    await guest.page.getByRole('button', { name: 'Rechazar' }).click();
    await host.page.getByText('Beto Ruiz rechazó las tablas').waitFor();
    await host.page.getByTestId('btn-draw').click();
    await guest.page.getByRole('button', { name: 'Aceptar' }).click();
    await host.page.getByTestId('game-result').waitFor();
    assert.match(await host.page.getByTestId('game-result').innerText(), /Tablas[\s\S]*acuerdo/);
    step('ofrecer tablas: rechazo con aviso y aceptación que termina en tablas');

    // -------------------------------------------- promoción con captura (host negras)
    await host.page.getByRole('button', { name: /Pedir revancha/ }).click();
    await guest.page.getByRole('button', { name: /quiere revancha/ }).click();
    await waitNewGame(host.page, 'b');
    await waitNewGame(guest.page, 'w');
    const promo = [
      ['g', 'h2', 'h4'], ['h', 'g7', 'g5'], ['g', 'h4', 'g5'], ['h', 'g8', 'f6'],
      ['g', 'g5', 'f6'], ['h', 'a7', 'a6'], ['g', 'f6', 'e7'], ['h', 'b7', 'b6'],
    ];
    let n = 0;
    for (const [who, from, to] of promo) {
      await clickMove(who === 'g' ? guest.page : host.page, from, to);
      await waitPlies(host.page, ++n);
    }
    await waitPiece(guest.page, 'wp', 'e7');
    await clickSquare(guest.page, 'e7');
    assert.ok((await legalSquares(guest.page)).includes('d8:capture'));
    await clickSquare(guest.page, 'd8');
    await guest.page.getByText('Coronar peón').waitFor();
    await guest.page.screenshot({ path: path.join(SHOTS, 'c06-promotion.png') });
    await guest.page.getByRole('button', { name: 'Dama' }).click();
    await waitPiece(guest.page, 'wq', 'd8');
    await waitPiece(host.page, 'wq', 'd8');
    step('promoción con captura: aparece el selector y la dama coronada llega al rival');

    // -------------------------------------------------- móvil (táctil)
    const phone = await newPlayer(browser, 'phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mate = await newPlayer(browser, 'mate');
    await phone.page.goto(BASE);
    await setName(phone.page, 'Móvil');
    await mate.page.goto(BASE);
    await setName(mate.page, 'Rival');
    const code2 = await createRoomUI(phone.page, { color: 'Blancas', clock: 'Sin reloj' });
    await mate.page.goto(`${BASE}/sala/${code2}`);
    await phone.page.getByTestId('board').waitFor();
    await phone.page.waitForTimeout(500);
    const boardBox = await phone.page.getByTestId('board').boundingBox();
    assert.ok(boardBox.width >= 330, `el tablero debe ocupar el ancho del móvil (${boardBox.width}px)`);
    const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `desbordamiento horizontal en móvil: ${overflow}px`);
    const tap = async (sq) => {
      const c = await center(phone.page, sq);
      await phone.page.touchscreen.tap(c.x, c.y);
    };
    await tap('e2');
    assert.deepEqual(await legalSquares(phone.page), ['e3:move', 'e4:move']);
    await tap('e4');
    await waitPiece(phone.page, 'wp', 'e4');
    await waitPiece(mate.page, 'wp', 'e4');
    await phone.page.screenshot({ path: path.join(SHOTS, 'c07-mobile-game.png'), fullPage: true });
    step('en móvil el tablero ocupa el ancho, no desborda y se juega con toques');

    // --------------------------------------------- caída de bandera (reloj de 1 s)
    const sock = io(BASE, { transports: ['websocket'] });
    await new Promise((r) => sock.once('connect', r));
    const ack = (ev, data) => new Promise((r) => sock.emit(ev, data, r));
    await ack('session:init', { token: require('node:crypto').randomUUID(), name: 'Bot Rápido' });
    const made = await ack('room:create', { visibility: 'private', color: 'w', clock: { initialSeconds: 1, incrementSeconds: 0 } });
    assert.equal(made.ok, true, JSON.stringify(made));
    const flagGuest = await newPlayer(browser, 'flag');
    await flagGuest.page.goto(BASE);
    await setName(flagGuest.page, 'Lento');
    await flagGuest.page.goto(`${BASE}/sala/${made.code}`);
    await flagGuest.page.getByTestId('board').waitFor();
    await ack('game:move', { from: 'e2', to: 'e4' });
    await flagGuest.page.getByTestId('game-result').waitFor({ timeout: 6000 });
    assert.match(await flagGuest.page.getByTestId('game-result').innerText(), /Derrota[\s\S]*Se acabó el tiempo de Lento/);
    sock.close();
    step('se acaba el tiempo: el servidor da la partida por perdida y se muestra el motivo');

    assert.deepEqual(errors, [], `errores de consola:\n${errors.join('\n')}`);
    step('sin errores en la consola del navegador');
    console.log(`\nCapturas en: ${SHOTS}`);
  } catch (err) {
    for (const [label, page] of allPages) await page.screenshot({ path: path.join(SHOTS, `fail-${label}.png`) }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('\n✖ FALLÓ:', err.message);
  if (errors.length) console.error('Errores de consola:\n' + errors.join('\n'));
  process.exit(1);
});
