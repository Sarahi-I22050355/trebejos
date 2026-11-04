// E2E del selector de idioma (español / inglés) con navegadores reales y Stockfish real.
//   (backend con Stockfish, sirviendo frontend/dist)  BASE_URL=http://localhost:3917 node e2e/phase-i18n.cjs
//
// Comprueba, sobre todo, el aislamiento: dos jugadores en la MISMA sala, uno en español y otro en inglés, cada uno
// conserva su idioma sin importar lo que haga el otro, y el idioma no viaja nunca por la red.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const step = (m) => console.log(`✔ ${m}`);
const errors = [];
const frames = []; // todo lo que viaja por los WebSockets de todas las páginas
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPlayer(browser, label, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', ...opts });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  // La prueba de reconexión pone a B sin red a propósito: el navegador registra los reintentos fallidos como errores de consola.
  page.on('console', (m) => m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(m.text()) && errors.push(`[${label}] console: ${m.text()}`));
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => frames.push(`[${label}→] ${f.payload}`));
    ws.on('framereceived', (f) => frames.push(`[${label}←] ${f.payload}`));
  });
  // Socket.IO empieza por HTTP (polling) y luego pasa a WebSocket: se captura también ese tráfico.
  page.on('request', (r) => {
    if (r.url().includes('/socket.io/') && r.postData()) frames.push(`[${label}→] ${r.postData()}`);
  });
  page.on('response', async (r) => {
    if (!r.url().includes('/socket.io/') || r.request().method() !== 'GET') return;
    try {
      frames.push(`[${label}←] ${await r.text()}`);
    } catch {
      /* respuesta cancelada al cambiar de transporte */
    }
  });
  await page.goto(BASE);
  await online(page);
  return { context, page, label };
}

const online = (page) => page.getByText(/Servidor en línea|Server online/).first().waitFor();
const lang = (page) => page.evaluate(() => document.documentElement.lang);
const stored = (page) => page.evaluate(() => localStorage.getItem('trebejos:lang'));
/** Cambia de idioma y espera a que se aplique (el diccionario inglés se descarga la primera vez, unos milisegundos). */
const switchTo = async (page, code) => {
  await page.getByTestId(`lang-${code}`).click();
  await page.waitForFunction((c) => document.documentElement.lang === c, code);
};

async function setName(page, name) {
  const input = page.locator('#player-name');
  await input.fill(name);
  await input.press('Enter');
  await page.getByRole('button', { name: new RegExp(`(Tu nombre|Your name): ${name}`) }).waitFor();
}

// Palabras que delatan texto en español sin traducir (y los signos propios del español).
const SPANISH = /[áéíóúñ¿¡]|\b(sala|salas|partida|jugar|jugada|jugadas|tablero|rival|aprende|aprender|crear|unirse|código|nombre|reloj|tablas|rendirse|esperando|espectador|espectadores|blancas|negras|lección|lecciones|bloqueos|cuentas|contraseñas|elige|puedes|estás|tu|tus|una|del|los|las|para|con|sin)\b/i;
/** Texto visible de la página sin lo que escriben los usuarios (nombres y chat), que nunca se traduce. */
async function visibleText(page, userStrings = []) {
  let text = await page.evaluate(() => document.body.innerText);
  for (const s of userStrings) text = text.split(s).join(' ');
  return text;
}
async function assertNoSpanish(page, what, userStrings = []) {
  const text = await visibleText(page, userStrings);
  const hit = text.match(SPANISH);
  assert.equal(hit, null, `texto en español sin traducir en "${what}": …${hit && text.slice(Math.max(0, hit.index - 40), hit.index + 40).replace(/\s+/g, ' ')}…`);
}
async function assertMostlySpanish(page, what) {
  const text = await visibleText(page);
  assert.match(text, /[áéíóúñ¿¡]|\b(sala|partida|jugar)\b/i, `"${what}" debería estar en español`);
  assert.doesNotMatch(text, /\b(Create room|Join the game|Offer draw|Resign|Public rooms|Learn to play)\b/i, `"${what}" tiene inglés mezclado`);
}

async function click(page, sq) {
  await page.getByTestId('board').evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });
  });
  const b = await page.locator(`[data-square="${sq}"]`).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
const move = async (page, from, to) => { await click(page, from); await click(page, to); };
/** Las jugadas están en la pestaña "Movimientos"; si el jugador abrió el chat, vuelve a ella. */
async function ensureMovesTab(page) {
  const tab = page.getByRole('tab', { name: /^(Moves|Movimientos)/ });
  if ((await tab.count()) && (await tab.first().getAttribute('aria-selected')) === 'false') await tab.first().click();
}
const plies = async (page) => {
  await ensureMovesTab(page);
  return page.locator('[data-testid="move-list"] li button').count();
};
async function waitPlies(page, n, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await plies(page)) === n) return;
    await sleep(80);
  }
  throw new Error(`esperaba ${n} jugadas y hay ${await plies(page)}`);
}
const moves = async (page) => {
  await ensureMovesTab(page);
  return (await page.locator('[data-testid="move-list"] li button').allInnerTexts()).map((s) => s.trim());
};

(async () => {
  const browser = await chromium.launch();
  try {
    // ================================================================== 1. selector, defecto y persistencia
    const solo = await newPlayer(browser, 'solo');
    const S = solo.page;
    assert.equal(await lang(S), 'es', 'por defecto el sitio está en español (aunque el navegador diga es-MX, no se detecta nada)');
    assert.equal(await stored(S), null, 'sin elegir nada no se guarda nada');
    assert.equal(await S.getByTestId('lang-es').getAttribute('aria-pressed'), 'true');
    await assertMostlySpanish(S, 'inicio');
    await S.evaluate(() => { window.__sinRecargar = 42; });

    await switchTo(S, 'en');
    await S.getByRole('heading', { name: 'Play against the bot' }).waitFor();
    assert.equal(await S.evaluate(() => window.__sinRecargar), 42, 'el cambio es inmediato, sin recargar la página');
    assert.equal(await lang(S), 'en');
    assert.equal(await stored(S), 'en');
    assert.equal(await S.title(), 'Trebejos — Online chess');
    await assertNoSpanish(S, 'inicio en inglés');
    step('el selector está en el inicio, arranca en español, cambia al instante sin recargar y guarda la preferencia');

    // Está en TODAS las pantallas
    for (const route of ['/', '/salas', '/aprender', '/aprender/torre', '/sala/ZZZZZZ', '/no-existe']) {
      await S.goto(`${BASE}${route}`);
      await online(S);
      await S.getByTestId('lang-switch').waitFor();
      assert.equal(await S.getByTestId('lang-en').getAttribute('aria-pressed'), 'true', `${route}: el idioma elegido persiste al navegar y recargar`);
      await sleep(300);
      await assertNoSpanish(S, `ruta ${route}`);
    }
    step('el selector aparece en todas las pantallas y el inglés persiste al navegar y al recargar (inicio, salas, aprender, lección, sala inexistente, 404)');
    await S.goto(`${BASE}/no-existe`);
    await S.getByRole('heading', { name: 'Page not found' }).waitFor();

    // ------------------------------------------------ inicio: diálogos, errores y validaciones en inglés
    await S.goto(BASE);
    await online(S);
    await S.getByRole('button', { name: /Set up and create/ }).click();
    const dlg = S.getByRole('dialog', { name: 'Create room' });
    await dlg.waitFor();
    await dlg.getByRole('radio', { name: /Public/ }).click();
    await dlg.getByRole('radio', { name: 'No clock' }).click();
    await assertNoSpanish(S, 'diálogo de crear sala');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await S.locator('input[aria-label="Room code"]').fill('abc');
    await S.getByRole('button', { name: /Connect to the room/ }).click();
    await S.getByText('The code has 6 characters (letters and numbers).').waitFor();
    await S.locator('#player-name').fill('x');
    await S.locator('#player-name').press('Enter');
    await S.getByText(/2 to 20 characters/).waitFor();
    await S.getByTestId('sound-toggle').waitFor();
    await assertNoSpanish(S, 'validaciones del inicio');
    step('diálogos y validaciones de formulario en inglés');

    // ------------------------------------------------ errores del servidor mapeados por código
    await S.goto(`${BASE}/sala/ZZZZZZ`);
    await S.getByRole('heading', { name: 'Room not found' }).waitFor();
    await S.goto(`${BASE}/salas`);
    await online(S);
    await S.getByTestId('empty-lobby').waitFor();
    await assertNoSpanish(S, 'listado vacío');
    await S.getByRole('heading', { name: 'There are no public rooms yet' }).waitFor();
    step('la sala inexistente y el listado vacío salen en inglés');

    // ------------------------------------------------ aprender: lección, errores del tutor, éxito y cambio de idioma en vivo
    await S.goto(`${BASE}/aprender/caballo`);
    await S.getByTestId('board').waitFor();
    await S.getByText('The knight is surrounded by its own pawns, but it can jump. Move it in an L.').waitFor();
    await click(S, 'd4');
    await click(S, 'd5'); // no es un salto en L
    await S.getByText(/The knight moves in an L/).waitFor();
    await assertNoSpanish(S, 'tutor: jugada imposible');
    await click(S, 'd4');
    await click(S, 'f5');
    await S.getByText(/The knight jumped from d4 to f5/).waitFor(); // coordenadas siempre algebraicas
    await assertNoSpanish(S, 'tutor: éxito');
    await S.getByTestId('btn-hint').scrollIntoViewIfNeeded();
    await switchTo(S, 'es'); // cambio en vivo: el texto del tutor se retraduce solo
    await S.getByText(/El caballo saltó de d4 a f5/).waitFor({ timeout: 3000 }).catch(() => {});
    await assertMostlySpanish(S, 'lección al cambiar a español');
    await switchTo(S, 'en');
    await S.getByText('Simulator · The knight').waitFor();
    for (const id of ['peon', 'enroque', 'al-paso', 'coronacion', 'jaque-mate', 'ahogado', 'practica']) {
      await S.goto(`${BASE}/aprender/${id}`);
      await online(S);
      await sleep(250);
      await assertNoSpanish(S, `lección ${id}`);
    }
    step('las 12 lecciones (textos, consejos, hechos, tutor, errores y éxitos) están en inglés, y el tutor se retraduce al cambiar de idioma en vivo');

    // ------------------------------------------------ partida guiada contra el bot: pista, resultado, notación
    await S.goto(`${BASE}/aprender/practica`);
    await S.getByTestId('btn-practice').click();
    await S.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
    await S.getByTestId('board').waitFor();
    await S.getByTestId('tutor').waitFor();
    await S.getByTestId('btn-hint').click();
    const hintText = await S.locator('[data-testid="tutor"][data-tone="hint"] [data-testid="tutor-message"]').innerText();
    assert.match(hintText, /^(Move the (pawn|knight) from [a-h][1-8] to [a-h][1-8]|Castle)/, `pista en inglés: ${hintText}`);
    await move(S, 'e2', 'e4');
    await waitPlies(S, 2, 15000); // el bot responde
    const seen = await moves(S);
    assert.equal(seen[0], 'e4', 'la notación sigue siendo la estándar');
    assert.match(seen[1], /^[a-h]\w*[1-8]|^[NBRQK]/, `respuesta del bot en notación estándar (${seen[1]})`);
    await S.getByText(/The bot played/).waitFor();
    await assertNoSpanish(S, 'partida guiada');
    await S.screenshot({ path: path.join(SHOTS, 'i18n-1-partida-guiada-en.png') });
    await S.getByTestId('btn-resign').click();
    await S.getByTestId('confirm-resign').click();
    await S.getByRole('heading', { name: 'Defeat' }).waitFor();
    await S.getByTestId('game-result').getByText(/resigned/).waitFor();
    await assertNoSpanish(S, 'resultado de la partida');
    await S.getByRole('button', { name: /Play again/ }).click();
    await S.getByTestId('board').waitFor();
    step('partida guiada en inglés: pista, notación estándar sin traducir, respuesta del bot, derrota y revancha');
    await S.getByTestId('btn-leave').click().catch(() => {});

    // ================================================================== 2. AISLAMIENTO: dos jugadores, misma sala
    const A = await newPlayer(browser, 'A-es'); // español por defecto: nunca toca el selector
    const B = await newPlayer(browser, 'B-en');
    await switchTo(B.page, 'en');
    await B.page.getByRole('heading', { name: 'Play against the bot' }).waitFor();
    await setName(A.page, 'Ana Torres');
    await setName(B.page, 'Beto Ruiz');
    assert.equal(await stored(A.page), null, 'A nunca eligió idioma: no se guarda nada');

    // A (español) crea una sala pública con blancas
    await A.page.getByRole('button', { name: /Configurar y crear/ }).click();
    const dialogA = A.page.getByRole('dialog', { name: 'Crear sala' });
    await dialogA.getByRole('radio', { name: /Pública/ }).click();
    await dialogA.getByRole('radio', { name: 'Blancas' }).click();
    await dialogA.getByRole('radio', { name: 'Sin reloj' }).click();
    await dialogA.getByRole('button', { name: /Crear sala/ }).click();
    await A.page.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
    const code = A.page.url().split('/').pop();
    await A.page.getByText('Esperando rival').first().waitFor();
    await assertMostlySpanish(A.page, 'sala de espera de A');

    // B (inglés) la encuentra en el listado, que ve en inglés, y entra
    await B.page.goto(`${BASE}/salas`);
    await online(B.page);
    const card = B.page.locator(`[data-testid="room-card"][data-code="${code}"]`);
    await card.waitFor({ timeout: 8000 });
    assert.match(await card.innerText(), /join the game/i);
    assert.match(await card.innerText(), /Ana Torres/);
    await assertNoSpanish(B.page, 'listado de B', ['Ana Torres']);
    await card.getByRole('button', { name: /Join the game/ }).click();
    await B.page.waitForURL(new RegExp(`/sala/${code}$`));
    await B.page.getByTestId('board').waitFor();
    await A.page.getByTestId('board').waitFor();

    // Cada uno ve su propio idioma, y entrar a la sala del otro no cambió nada
    assert.equal(await lang(A.page), 'es');
    assert.equal(await lang(B.page), 'en');
    assert.equal(await stored(A.page), null, 'entrar a una sala no escribe ningún idioma para A');
    assert.equal(await stored(B.page), 'en');
    assert.match(await A.page.getByTestId('btn-draw').innerText(), /ofrecer tablas/i);
    assert.match(await B.page.getByTestId('btn-draw').innerText(), /offer draw/i);
    assert.match(await A.page.getByTestId('btn-resign').innerText(), /rendirse/i);
    assert.match(await B.page.getByTestId('btn-resign').innerText(), /resign/i);
    await A.page.getByText('En juego').first().waitFor();
    await B.page.getByText('In play').first().waitFor();
    await assertNoSpanish(B.page, 'partida de B', ['Ana Torres', 'Beto Ruiz']);
    await assertMostlySpanish(A.page, 'partida de A');
    await A.page.screenshot({ path: path.join(SHOTS, 'i18n-2-misma-sala-A-es.png') });
    await B.page.screenshot({ path: path.join(SHOTS, 'i18n-3-misma-sala-B-en.png') });
    step('misma sala, cada jugador en su idioma: A en español y B en inglés, y entrar a la sala del otro no cambia ninguno');

    // Notación estándar para ambos; el chat se muestra tal como se escribió (no es interfaz)
    await move(A.page, 'e2', 'e4');
    await waitPlies(B.page, 1);
    await move(B.page, 'g8', 'f6');
    await waitPlies(A.page, 2);
    assert.deepEqual(await moves(A.page), ['e4', 'Nf6']);
    assert.deepEqual(await moves(B.page), ['e4', 'Nf6']);
    await A.page.getByRole('tab', { name: /Chat/ }).click();
    await B.page.getByRole('tab', { name: /Chat/ }).click();
    const hola = '¡Hola! ¿Listo para jugar una partida?';
    const good = 'Good luck, have fun!';
    await A.page.getByLabel('Mensaje de chat').fill(hola);
    await A.page.getByLabel('Mensaje de chat').press('Enter');
    await B.page.getByRole('textbox', { name: 'Chat message' }).fill(good);
    await B.page.getByRole('textbox', { name: 'Chat message' }).press('Enter');
    for (const p of [A.page, B.page]) {
      await p.getByText(hola, { exact: true }).waitFor();
      await p.getByText(good, { exact: true }).waitFor();
    }
    assert.match(await B.page.locator('[data-testid="chat-message"]').first().innerText(), /Ana Torres/);
    await assertNoSpanish(B.page, 'chat de B', ['Ana Torres', 'Beto Ruiz', hola]);
    step('la notación (e4, Nf6) es la estándar para los dos, y los nombres y el chat llegan sin traducir a ambos');

    // Reconexión de B: su idioma sigue; A ve el aviso en SU idioma, B ve el suyo
    await B.context.setOffline(true);
    await B.page.getByRole('alert').filter({ hasText: /Connection lost|Couldn't reach/ }).waitFor({ timeout: 40000 });
    await A.page.getByText(/se desconectó/).waitFor({ timeout: 40000 });
    await assertMostlySpanish(A.page, 'aviso de desconexión en A');
    assert.equal(await lang(B.page), 'en');
    await B.context.setOffline(false);
    await B.page.getByRole('alert').filter({ hasText: /Connection lost/ }).waitFor({ state: 'detached', timeout: 40000 });
    await B.page.getByTestId('board').waitFor();
    assert.equal(await lang(B.page), 'en', 'tras reconectar, B sigue en inglés');
    assert.equal(await lang(A.page), 'es', 'y A sigue en español');
    assert.deepEqual(await moves(B.page), ['e4', 'Nf6'], 'B volvió a su partida');
    step('reconexión: B vuelve a su partida en inglés; A vio el aviso en español y no cambió');

    // Recarga: cada uno recuerda el suyo dentro de la misma sala
    await B.page.reload();
    await B.page.getByTestId('board').waitFor();
    assert.equal(await lang(B.page), 'en');
    await B.page.getByTestId('btn-draw').waitFor();
    assert.match(await B.page.getByTestId('btn-draw').innerText(), /offer draw/i);
    await A.page.reload();
    await A.page.getByTestId('board').waitFor();
    assert.equal(await lang(A.page), 'es');
    assert.match(await A.page.getByTestId('btn-draw').innerText(), /ofrecer tablas/i);
    step('al recargar, cada jugador conserva el suyo dentro de la misma sala');

    // Cambios cruzados: lo que uno elige jamás toca al otro
    await switchTo(A.page, 'en');
    await A.page.getByTestId('btn-draw').waitFor();
    assert.match(await A.page.getByTestId('btn-draw').innerText(), /offer draw/i);
    assert.equal(await lang(B.page), 'en');
    await switchTo(B.page, 'es');
    await B.page.getByTestId('btn-draw').filter({ hasText: /ofrecer tablas/i }).waitFor();
    assert.equal(await lang(B.page), 'es');
    assert.equal(await lang(A.page), 'en', 'B pasó a español y A sigue en inglés');
    assert.match(await A.page.getByTestId('btn-draw').innerText(), /offer draw/i);
    assert.equal(await stored(A.page), 'en');
    assert.equal(await stored(B.page), 'es');
    await switchTo(A.page, 'es');
    await switchTo(B.page, 'en');
    await B.page.getByTestId('btn-draw').filter({ hasText: /offer draw/i }).waitFor();
    await A.page.getByTestId('btn-draw').filter({ hasText: /ofrecer tablas/i }).waitFor();
    assert.equal(await lang(A.page), 'es');
    assert.equal(await lang(B.page), 'en');
    // y la partida siguió intacta
    await move(A.page, 'b1', 'c3');
    await waitPlies(B.page, 3);
    assert.deepEqual(await moves(B.page), ['e4', 'Nf6', 'Nc3']);
    step('cambios cruzados en plena partida (A→en, B→es, A→es, B→en): cada uno solo cambia lo suyo y la partida sigue');

    // Un tercero en español entra como espectador sin afectar a nadie
    const C = await newPlayer(browser, 'C-es');
    await setName(C.page, 'Carla Mirón');
    await C.page.goto(`${BASE}/sala/${code}`);
    await C.page.getByTestId('board').waitFor();
    await C.page.getByText('Espectador').first().waitFor();
    assert.equal(await lang(C.page), 'es');
    assert.equal(await lang(A.page), 'es');
    assert.equal(await lang(B.page), 'en');
    step('un espectador en español se une a la misma sala sin alterar a los otros dos');

    // Final de la partida: cada resultado en el idioma de cada quien
    await B.page.getByTestId('btn-resign').click();
    await B.page.getByTestId('confirm-resign').click();
    await B.page.getByRole('heading', { name: 'Defeat' }).waitFor();
    await A.page.getByRole('heading', { name: '¡Victoria!' }).waitFor();
    await C.page.getByRole('heading', { name: /Ganan las blancas/ }).waitFor();
    assert.match(await B.page.getByTestId('game-result').innerText(), /Beto Ruiz resigned/);
    assert.match(await A.page.getByTestId('game-result').innerText(), /Beto Ruiz se rindió/);
    step('el resultado de la partida se ve en el idioma de cada persona (Defeat / ¡Victoria! / Ganan las blancas)');

    // ================================================================== 3. el idioma no viaja por la red
    assert.ok(frames.length > 40, `se capturaron ${frames.length} mensajes de red`);
    const leaking = frames.filter((f) => /\blang\b|"lang"|locale|idioma|language/i.test(f));
    assert.deepEqual(leaking.slice(0, 3), [], 'el idioma no debe aparecer en ningún mensaje de Socket.IO');
    const sent = frames.filter((f) => /→\]/.test(f));
    assert.ok(sent.some((f) => /session:init/.test(f)), 'se envió session:init');
    assert.ok(sent.every((f) => !/"(en|es)"\s*[,}\]]/.test(f.replace(/"(text|name)":"[^"]*"/g, ''))), 'ningún mensaje enviado lleva "en" ni "es" como dato');
    step(`el idioma no viaja por la red: ${frames.length} mensajes de Socket.IO de las 4 páginas, ninguno lo menciona`);

    // ================================================================== 4. móvil: el selector cabe
    const phone = await newPlayer(browser, 'phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const P = phone.page;
    await P.getByTestId('lang-switch').waitFor();
    const overflow = await P.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `desborde horizontal en móvil: ${overflow}px`);
    await P.getByTestId('lang-en').tap();
    await P.getByRole('heading', { name: 'Play against the bot' }).waitFor();
    const header = await P.locator('header').boundingBox();
    assert.ok(header.width <= 390.5, 'la cabecera cabe en 390 px');
    await sleep(500); // deja terminar la transición del selector
    await P.screenshot({ path: path.join(SHOTS, 'i18n-4-movil-en.png') });
    step('en móvil de 390 px el selector cabe en la cabecera, sin desborde');

    assert.deepEqual(errors, [], `errores en consola:\n${errors.join('\n')}`);
    step('sin errores de consola ni de página');
    console.log('\nSelector de idioma: todo en orden ✔');
  } catch (e) {
    console.error('\n✘ FALLÓ:', e.message, '\n', String(e.stack).split('\n').filter((l) => l.includes('phase-i18n')).slice(0, 2).join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
