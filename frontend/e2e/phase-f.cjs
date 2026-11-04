// E2E de la fase f (Aprende a jugar) con navegadores reales y Stockfish real.
//   BASE_URL=http://localhost:3917 node e2e/phase-f.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

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
  return { context, page };
}

const center = async (page, sq) => {
  // el tablero debe quedar entero a la vista, por debajo de la cabecera fija
  await page.getByTestId('board').evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });
  });
  const b = await page.locator(`[data-square="${sq}"]`).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function click(page, sq, tap = false) {
  const c = await center(page, sq);
  if (tap) await page.touchscreen.tap(c.x, c.y);
  else await page.mouse.click(c.x, c.y);
}
const clickMove = async (page, from, to, tap = false) => { await click(page, from, tap); await click(page, to, tap); };
async function dragMove(page, from, to) {
  const a = await center(page, from);
  const b = await center(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}
const piece = (page, id, on) => page.locator(`[data-piece="${id}"][data-on="${on}"]`);
const tutorTone = (page, tone, timeout = 5000) => page.locator(`[data-testid="tutor"][data-tone="${tone}"]`).waitFor({ timeout });
const tutorText = (page) => page.getByTestId('tutor-message').innerText();
const goto = async (page, lesson) => {
  await page.goto(`${BASE}/aprender/${lesson}`);
  await page.getByTestId('board').waitFor();
};
const nextStep = (page) => page.getByTestId('btn-next-step').click();

(async () => {
  const browser = await chromium.launch();
  try {
    const { page: p } = await newPlayer(browser, 'alumno');

    // ------------------------------------------------------------------ aula: lista y tono
    await p.goto(`${BASE}/aprender`);
    await p.getByRole('heading', { name: 'Aprende a jugar', level: 1 }).waitFor();
    await p.getByTestId('board').waitFor();
    for (const id of ['peon', 'torre', 'caballo', 'alfil', 'dama', 'rey', 'enroque', 'al-paso', 'coronacion', 'jaque-mate', 'ahogado', 'practica']) {
      await p.getByTestId(`lesson-${id}`).waitFor();
    }
    assert.equal(await p.getByTestId('lesson-peon').getAttribute('aria-current'), 'page');
    const body = await p.locator('main').innerText();
    for (const banned of [/\bELO\b/i, /bloquead/i, /desbloque/i, /dominad/i, /próximo\b/i, /piezas dominadas/i, /torneo/i, /\block\b/]) {
      assert.doesNotMatch(body, banned, `texto no permitido: ${banned}`);
    }
    assert.equal(await p.locator('main .icon', { hasText: /^lock$/ }).count(), 0, 'no debe haber candados');
    assert.match(body, /Todo abierto/i);
    step('las 12 lecciones están abiertas desde el inicio, sin candados, progreso ni ELO');
    await p.screenshot({ path: path.join(SHOTS, 'f01-learn-home.png'), fullPage: true });

    await p.goto(`${BASE}/aprender/no-existe`);
    await p.waitForURL(`${BASE}/aprender`);
    step('una lección inexistente redirige al aula');

    // -------------------------------------------------------------- caballo: demostración y L
    await p.getByTestId('lesson-caballo').click();
    await p.waitForURL(/\/aprender\/caballo$/);
    await p.getByTestId('possible').filter({ hasText: '8 movimientos posibles' }).waitFor();
    await p.getByTestId('btn-demo').click();
    assert.equal(await p.locator('[data-legal]').count(), 8);
    assert.equal(await p.locator('[data-arrow]').count(), 8);
    const arrow = await p.locator('[data-arrow="d4f5"]').getAttribute('points');
    assert.equal(arrow.trim().split(/\s+/).length, 3, 'la flecha del caballo debe ser una L (3 puntos)');
    await p.screenshot({ path: path.join(SHOTS, 'f02-knight-demo.png'), fullPage: true });
    step('"Ver movimientos" muestra los 8 saltos del caballo con flechas en L, aunque esté rodeado de peones');
    await p.getByTestId('btn-demo').click();
    assert.equal(await p.locator('[data-legal]').count(), 0);

    // ------------------------------------------------ jugada correcta, ilegal, ajena y pista
    await clickMove(p, 'd4', 'f5');
    await tutorTone(p, 'success');
    assert.match(await tutorText(p), /saltó de d4 a f5/);
    await piece(p, 'wn', 'f5').waitFor();
    step('mover el caballo en L es válido y el tutor lo confirma explicando el salto');

    await p.getByTestId('btn-reset').click();
    await piece(p, 'wn', 'd4').waitFor();
    await clickMove(p, 'd4', 'd6'); // en línea recta: ilegal para un caballo
    await tutorTone(p, 'wrong');
    assert.match(await tutorText(p), /caballo se mueve en L/);
    await piece(p, 'wn', 'd4').waitFor();
    await click(p, 'c4'); // peón propio, pero no es la pieza del ejercicio
    assert.match(await tutorText(p), /pieza señalada/);
    step('un movimiento imposible no se aplica y el tutor explica la regla; otras piezas no se pueden coger');

    await p.getByTestId('btn-hint').click();
    await tutorTone(p, 'hint');
    assert.ok((await p.locator('[data-mark="hint"]').count()) >= 1);
    step('"Pista" resalta la pieza y da una indicación');

    await nextStep(p);
    assert.match(await p.getByTestId('step-counter').innerText(), /Ejercicio 2 de 2/);
    await clickMove(p, 'd4', 'f5'); // legal pero no es la captura pedida
    await tutorTone(p, 'wrong');
    assert.match(await tutorText(p), /legal, pero no es lo que pide/);
    await piece(p, 'wn', 'f5').waitFor();
    await piece(p, 'wn', 'd4').waitFor({ timeout: 4000 }); // el tablero vuelve atrás solo
    step('una jugada legal pero equivocada se explica y el tablero vuelve a la posición inicial');
    await dragMove(p, 'd4', 'e6');
    await tutorTone(p, 'success');
    await piece(p, 'bp', 'e6').waitFor({ state: 'detached' });
    step('capturar con el caballo (arrastrando) completa el ejercicio');

    // --------------------------------------------------------------------- rey: casilla atacada
    await goto(p, 'rey');
    await nextStep(p);
    await p.getByTestId('possible').filter({ hasText: '5 movimientos posibles' }).waitFor();
    await clickMove(p, 'e4', 'e5');
    await tutorTone(p, 'wrong');
    assert.match(await tutorText(p), /atacada por una pieza rival/);
    await clickMove(p, 'e4', 'e3');
    await tutorTone(p, 'success');
    step('el rey no puede ir a una casilla atacada (lo explica) y sí a una segura');

    // --------------------------------------------------------------------------- peón
    await goto(p, 'peon');
    await nextStep(p);
    await clickMove(p, 'e4', 'e5'); // captura de frente: no existe
    await tutorTone(p, 'wrong');
    assert.match(await tutorText(p), /no captura de frente/);
    await clickMove(p, 'e4', 'd5');
    await tutorTone(p, 'success');
    step('el peón captura en diagonal y se explica por qué no puede de frente');

    // -------------------------------------------------------------------------- enroque
    await goto(p, 'enroque');
    await dragMove(p, 'e1', 'g1');
    await tutorTone(p, 'success');
    await piece(p, 'wr', 'f1').waitFor();
    await piece(p, 'wk', 'g1').waitFor();
    assert.match(await tutorText(p), /enrocó corto/);
    step('enroque corto: se mueve el rey y la torre salta a f1');
    await nextStep(p);
    await clickMove(p, 'e1', 'c1');
    await tutorTone(p, 'success');
    await piece(p, 'wr', 'd1').waitFor();
    await nextStep(p);
    await clickMove(p, 'e1', 'g1'); // f1 está atacada
    await tutorTone(p, 'wrong');
    assert.match(await tutorText(p), /f1, que está atacada/);
    await clickMove(p, 'e1', 'c1');
    await tutorTone(p, 'success');
    step('enroque largo, y no se puede enrocar pasando por una casilla atacada (con explicación)');

    // ------------------------------------------------------------------------ captura al paso
    await goto(p, 'al-paso');
    await clickMove(p, 'e5', 'd6');
    await tutorTone(p, 'success');
    assert.match(await tutorText(p), /capturó al paso/);
    await piece(p, 'bp', 'd5').waitFor({ state: 'detached' });
    step('captura al paso: el peón negro desaparece');

    // --------------------------------------------------------------------------- coronación
    await goto(p, 'coronacion');
    await clickMove(p, 'e7', 'e8');
    await p.getByText('Coronar peón').waitFor();
    await p.getByRole('button', { name: 'Caballo', exact: true }).click();
    await tutorTone(p, 'success');
    assert.match(await tutorText(p), /se coronó a caballo/);
    await piece(p, 'wn', 'e8').waitFor();
    step('coronación: aparece el selector y la pieza elegida llega a e8');

    // ---------------------------------------------------------------- jaque, mate y ahogado
    await goto(p, 'jaque-mate');
    await clickMove(p, 'a1', 'a8');
    await tutorTone(p, 'success');
    assert.match(await tutorText(p), /todavía no es mate/);
    await nextStep(p);
    await clickMove(p, 'a1', 'a8');
    await tutorTone(p, 'success');
    assert.match(await tutorText(p), /Jaque mate/);
    await nextStep(p);
    await clickMove(p, 'd1', 'd8');
    await tutorTone(p, 'success');
    step('jaque (con aviso de que no es mate) y dos mates en una jugada');

    await goto(p, 'ahogado');
    await clickMove(p, 'b7', 'f7');
    await tutorTone(p, 'wrong');
    assert.match(await tutorText(p), /ahogado/i);
    await piece(p, 'wq', 'b7').waitFor({ timeout: 4000 });
    await clickMove(p, 'b7', 'g7');
    await tutorTone(p, 'success');
    await p.screenshot({ path: path.join(SHOTS, 'f03-stalemate-lesson.png'), fullPage: true });
    step('ahogado: la dama a f7 se detecta y se explica; el mate con g7 completa el ejercicio');

    // ------------------------------------------------------ encadenado entre lecciones
    await goto(p, 'peon');
    await nextStep(p);
    await p.getByTestId('btn-next-lesson').click();
    await p.waitForURL(/\/aprender\/torre$/);
    step('al terminar los ejercicios, "Siguiente lección" lleva a la siguiente');

    // ------------------------------------------------------------ partida guiada con pistas
    await p.getByTestId('lesson-practica').click();
    await p.getByTestId('practice-start').waitFor();
    await p.getByTestId('btn-practice').click();
    await p.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
    await p.getByTestId('board').waitFor();
    assert.match(await p.getByTestId('bot-badge').innerText(), /práctica guiada · principiante/i);
    assert.equal(await p.getByRole('tab', { name: /Chat/ }).count(), 0);
    assert.equal(await p.getByTestId('btn-draw').count(), 0);
    await p.getByTestId('tutor').waitFor();
    assert.match(await tutorText(p), /Juegas con las blancas/);
    step('la partida guiada es contra el Bot Principiante, con tutor y sin chat ni tablas');

    for (let round = 0; round < 3; round++) {
      await p.getByTestId('btn-hint').click();
      await tutorTone(p, 'hint');
      const text = await tutorText(p);
      assert.match(text, /^(Mueve|Enroca)/);
      await p.locator('[data-mark="hint"]').first().waitFor();
      assert.equal(await p.locator('[data-mark="hint"]').count(), 2);
      assert.equal(await p.locator('[data-arrow]').count(), 1);
      const uci = await p.locator('[data-arrow]').getAttribute('data-arrow'); // origen+destino exactos de la pista
      const [from, to] = [uci.slice(0, 2), uci.slice(2, 4)];
      assert.ok(text.includes(from) || /Enroca/.test(text), `la pista "${text}" debe mencionar ${from}`);
      if (round === 0) await p.screenshot({ path: path.join(SHOTS, 'f04-practice-hint.png'), fullPage: true });
      const before = await p.locator('[data-testid="move-list"] li button').count();
      await clickMove(p, from, to); // se sigue la pista
      if (await p.getByText('Coronar peón').count()) await p.getByRole('button', { name: 'Dama', exact: true }).click();
      const end = Date.now() + 12000;
      while (Date.now() < end && (await p.locator('[data-testid="move-list"] li button').count()) < before + 2) await sleep(100);
      assert.ok((await p.locator('[data-testid="move-list"] li button').count()) >= before + 2, 'el bot debe responder');
      await tutorTone(p, 'info');
      assert.equal(await p.locator('[data-mark="hint"]').count(), 0, 'la pista desaparece al mover');
      assert.match(await tutorText(p), /El bot jugó/);
      await sleep(1100); // límite de frecuencia de pistas
    }
    step('3 pistas seguidas: se resalta la jugada con flecha, se juega, el bot responde y el tutor lo comenta');

    // ------------------------------------------------------------------------------- móvil
    const { page: m } = await newPlayer(browser, 'móvil', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await m.goto(`${BASE}/aprender`);
    await m.getByTestId('board').waitFor();
    await m.getByRole('link', { name: 'El caballo', exact: true }).tap();
    await m.waitForURL(/\/aprender\/caballo$/);
    await m.getByTestId('board').waitFor();
    await m.waitForTimeout(400);
    const box = await m.getByTestId('board').boundingBox();
    assert.ok(box.width >= 300, `el tablero mide ${box.width}px`);
    assert.ok((await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'desbordamiento horizontal');
    await clickMove(m, 'd4', 'f5', true);
    await tutorTone(m, 'success');
    await m.screenshot({ path: path.join(SHOTS, 'f05-learn-mobile.png'), fullPage: true });
    step('en móvil la lista pasa a pastillas, el tablero cabe y se aprende con toques');

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
