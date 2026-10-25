// E2E de la fase e (bot) con navegadores reales y Stockfish real.
//   (backend con Stockfish instalado, sirviendo frontend/dist)  BASE_URL=http://localhost:3917 node e2e/phase-e.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const step = (m) => console.log(`✔ ${m}`);
const errors = [];
const allPages = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPlayer(browser, label, opts = {}, url = BASE) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', ...opts });
  const page = await context.newPage();
  allPages.push([label, page]);
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] console: ${m.text()}`));
  await page.goto(url);
  await page.getByText('Servidor en línea').waitFor();
  return { context, page, label };
}

const plies = (page) => page.locator('[data-testid="move-list"] li button').count();
async function waitPlies(page, n, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await plies(page)) === n) return;
    await sleep(80);
  }
  throw new Error(`esperaba ${n} jugadas y hay ${await plies(page)}`);
}
async function center(page, square) {
  const b = await page.locator(`[data-square="${square}"]`).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function clickMove(page, from, to, tap = false) {
  for (const sq of [from, to]) {
    const c = await center(page, sq);
    if (tap) await page.touchscreen.tap(c.x, c.y);
    else await page.mouse.click(c.x, c.y);
  }
}
/** Reconstruye la partida con chess.js a partir de la lista de jugadas que muestra la interfaz. */
async function gameFromUI(page, Chess) {
  const g = new Chess();
  for (const san of await page.locator('[data-testid="move-list"] li button').allInnerTexts()) g.move(san.trim());
  return g;
}
async function pieceCountOnBoard(page) {
  return page.locator('[data-piece]').count();
}

async function startBotFromHome(page, { level, color }) {
  await page.getByRole('radio', { name: level, exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Tu color contra el bot' }).getByRole('radio', { name: color }).click();
  await page.getByRole('button', { name: /Iniciar partida/ }).click();
  await page.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
  await page.getByTestId('board').waitFor();
  return page.url().split('/').pop();
}

(async () => {
  const { Chess } = await import('chess.js');
  const browser = await chromium.launch();
  const extra = []; // procesos auxiliares a cerrar al final
  try {
    // ------------------------------------------------------------------ tarjeta del bot en el inicio
    const me = await newPlayer(browser, 'humano');
    const p = me.page;
    const card = p.locator('article', { hasText: 'Jugar contra el bot' });
    await card.getByText('Stockfish', { exact: true }).waitFor();
    assert.equal(await p.getByTestId('bot-level-label').innerText(), 'Intermedio');
    await p.getByRole('radio', { name: 'Experto', exact: true }).click();
    assert.equal(await p.getByTestId('bot-level-label').innerText(), 'Experto');
    assert.equal(await p.getByRole('button', { name: /Iniciar partida/ }).isEnabled(), true);
    step('la tarjeta del bot está activa, muestra el motor y permite elegir nivel');
    await p.screenshot({ path: path.join(SHOTS, 'e01-home-bot.png'), fullPage: true });

    // ---------------------------------------------------------------- partida con blancas, nivel Principiante
    await startBotFromHome(p, { level: 'Principiante', color: 'Blancas' });
    assert.equal(await p.getByTestId('board').getAttribute('data-orientation'), 'w');
    const botStrip = await p.getByTestId('strip-b').innerText();
    assert.match(botStrip, /Bot Principiante/i);
    assert.match(botStrip, /\bBOT\b/i);
    assert.match(await p.getByTestId('bot-badge').innerText(), /Stockfish · Principiante/i);
    assert.equal(await p.getByRole('tab', { name: /Chat/ }).count(), 0, 'no hay chat contra el bot');
    assert.equal(await p.getByTestId('btn-draw').count(), 0, 'el bot no acepta tablas');
    assert.equal(await p.getByRole('button', { name: /Copiar enlace/ }).count(), 0);
    assert.equal(await p.getByTitle('Espectadores').count(), 0);
    assert.equal(await p.getByTestId('btn-resign').count(), 1);
    step('la partida contra el bot muestra al bot (nombre y etiqueta) y oculta chat, tablas y espectadores');

    // --------------------------------------------------------------------- el bot responde
    await clickMove(p, 'e2', 'e4');
    await p.getByTestId('bot-thinking').waitFor({ timeout: 3000 });
    const t0 = Date.now();
    await waitPlies(p, 2);
    assert.ok(Date.now() - t0 < 5000, `el bot tardó ${Date.now() - t0} ms`);
    await p.getByTestId('bot-thinking').waitFor({ state: 'detached' });
    step(`aparece "Pensando…" y el bot responde (${Date.now() - t0} ms)`);

    // ------------------------------------------------ varias jugadas aleatorias legales: la UI siempre coincide con el motor
    for (let round = 0; round < 6; round++) {
      const g = await gameFromUI(p, Chess);
      if (g.isGameOver()) break;
      assert.equal(g.turn(), 'w');
      const legal = g.moves({ verbose: true });
      const pick = legal[Math.floor(Math.random() * legal.length)];
      const before = await plies(p); // antes de mover: tu jugada + la del bot = before + 2
      await clickMove(p, pick.from, pick.to);
      if (pick.promotion) {
        await p.getByText('Coronar peón').waitFor();
        await p.getByRole('button', { name: 'Dama' }).click();
      }
      if (g.move(pick) && g.isGameOver()) break;
      await waitPlies(p, before + 2).catch(async () => {
        assert.ok((await gameFromUI(p, Chess)).isGameOver(), 'el bot no respondió');
      });
      const after = await gameFromUI(p, Chess);
      await p.waitForFunction((n) => document.querySelectorAll('[data-piece]').length === n, after.board().flat().filter(Boolean).length);
    }
    step('6 jugadas legales aleatorias seguidas: el bot siempre responde y el tablero coincide con la partida');
    await p.screenshot({ path: path.join(SHOTS, 'e02-bot-game.png'), fullPage: true });

    // ---------------------------------------------------------------- recargar mientras el bot piensa
    const gNow = await gameFromUI(p, Chess);
    if (!gNow.isGameOver()) {
      const legal = gNow.moves({ verbose: true })[0];
      const n = await plies(p);
      await clickMove(p, legal.from, legal.to);
      await waitPlies(p, n + 1);
      await p.reload();
      await p.getByTestId('board').waitFor();
      await waitPlies(p, n + 2); // el bot terminó su jugada aunque la página se recargó
      step('al recargar mientras el bot piensa, la partida sigue y llega su jugada');
    }

    // ------------------------------------------------------------- rendirse y "jugar otra vez"
    if (await p.getByTestId('btn-resign').count()) {
      await p.getByTestId('btn-resign').click();
      await p.getByTestId('confirm-resign').click();
    }
    await p.getByTestId('game-result').waitFor();
    assert.match(await p.getByTestId('game-result').innerText(), /Derrota|Victoria|Tablas/);
    await p.getByRole('button', { name: /Jugar otra vez/ }).click();
    await p.waitForFunction(() => document.querySelector('[data-testid="board"]')?.dataset.orientation === 'b' && !document.querySelector('[data-testid="game-result"]'));
    step('"Jugar otra vez" reinicia con los colores invertidos (ahora juegas con negras)');
    await waitPlies(p, 1); // el bot abre con blancas
    assert.match(await p.getByTestId('strip-w').innerText(), /Bot Principiante/i);
    const g2 = await gameFromUI(p, Chess);
    const reply = g2.moves({ verbose: true })[0];
    await clickMove(p, reply.from, reply.to);
    await waitPlies(p, 3);
    step('el bot abre la partida como blancas y responde a tu jugada');

    // ------------------------------------------------------------------------ salir y ya no existe
    await p.getByTestId('btn-resign').click();
    await p.getByTestId('confirm-resign').click();
    await p.getByTestId('game-result').waitFor();
    const code = p.url().split('/').pop();
    await p.getByRole('button', { name: /Salir al inicio/ }).click();
    await p.waitForURL(`${BASE}/`);
    await p.getByRole('link', { name: /En sala/ }).waitFor({ state: 'detached' });
    await p.goto(`${BASE}/sala/${code}`);
    await p.getByRole('heading', { name: 'Sala no encontrada' }).waitFor();
    step('al salir se cierra la sala del bot (el enlace deja de funcionar)');

    // --------------------------------------------------- nivel Experto con negras: abre el bot y responde rápido
    await p.goto(BASE);
    await p.getByText('Servidor en línea').waitFor();
    const t1 = Date.now();
    await startBotFromHome(p, { level: 'Experto', color: 'Negras' });
    assert.equal(await p.getByTestId('board').getAttribute('data-orientation'), 'b');
    await waitPlies(p, 1);
    assert.ok(Date.now() - t1 < 6000, `el experto tardó ${Date.now() - t1} ms en abrir`);
    step(`nivel Experto con negras: el bot abre en ${Date.now() - t1} ms (< 6 s)`);
    await p.getByTestId('btn-resign').click();
    await p.getByTestId('confirm-resign').click();
    await p.getByTestId('game-result').waitFor();
    await p.getByRole('button', { name: /Salir al inicio/ }).click();
    await me.context.close();

    // ---------------------------------------------------------------------------------- móvil
    const phone = await newPlayer(browser, 'móvil', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const pp = phone.page;
    await pp.getByRole('radio', { name: 'Avanzado', exact: true }).tap();
    await pp.getByRole('radiogroup', { name: 'Tu color contra el bot' }).getByRole('radio', { name: 'Blancas' }).tap();
    await pp.getByRole('button', { name: /Iniciar partida/ }).tap();
    await pp.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
    await pp.getByTestId('board').waitFor();
    await pp.waitForTimeout(500);
    const box = await pp.getByTestId('board').boundingBox();
    assert.ok(box.width >= 330, `tablero de ${box.width}px`);
    assert.ok((await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'desbordamiento horizontal');
    await clickMove(pp, 'e2', 'e4', true);
    await waitPlies(pp, 2);
    await pp.screenshot({ path: path.join(SHOTS, 'e03-bot-mobile.png'), fullPage: true });
    step('en móvil se elige nivel, se juega con toques y el bot responde');
    await phone.context.close();

    // ------------------------------------------ servidor sin Stockfish: la tarjeta se desactiva, el resto funciona
    const off = spawn('node', ['../backend/src/index.js'], { env: { ...process.env, PORT: '3918', BOT_ENABLED: 'false' }, stdio: 'ignore' });
    extra.push(off);
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch('http://localhost:3918/health')).ok) break; } catch { /* aún arrancando */ }
      await sleep(150);
    }
    const noBot = await newPlayer(browser, 'sin-bot', {}, 'http://localhost:3918');
    const botCard = noBot.page.locator('article', { hasText: 'Jugar contra el bot' });
    await botCard.getByText('No disponible').waitFor();
    assert.equal(await noBot.page.getByRole('button', { name: /Iniciar partida/ }).isDisabled(), true);
    assert.equal(await noBot.page.getByRole('button', { name: /Configurar y crear/ }).isEnabled(), true);
    step('sin Stockfish la tarjeta del bot queda desactivada ("No disponible") y el resto sigue funcionando');

    assert.deepEqual(errors, [], `errores de consola:\n${errors.join('\n')}`);
    step('sin errores en la consola del navegador');
    console.log(`\nCapturas en: ${SHOTS}`);
  } catch (err) {
    for (const [label, page] of allPages) await page.screenshot({ path: path.join(SHOTS, `fail-${label}.png`) }).catch(() => {});
    throw err;
  } finally {
    for (const proc of extra) proc.kill('SIGTERM');
    await browser.close();
  }
})().catch((err) => {
  console.error('\n✖ FALLÓ:', err.message);
  if (errors.length) console.error('Errores de consola:\n' + errors.join('\n'));
  process.exit(1);
});
