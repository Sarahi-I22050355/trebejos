// E2E de la fase h (sonidos) con navegadores reales y Stockfish real.
// El audio no se "escucha": la app avisa de cada sonido con el evento `trebejos:sound` y la prueba
// cuenta además los osciladores/ruidos que Web Audio llegó a crear.
//   (backend con Stockfish, sirviendo frontend/dist, MIN_CLOCK_SECONDS=1)  BASE_URL=http://localhost:3917 node e2e/phase-h.cjs
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

const SPY = () => {
  window.__sounds = [];
  window.__osc = 0;
  window.__noise = 0;
  window.addEventListener('trebejos:sound', (e) => window.__sounds.push(e.detail));
  const proto = window.AudioContext && window.AudioContext.prototype;
  if (proto) {
    const osc = proto.createOscillator;
    proto.createOscillator = function (...a) { window.__osc++; return osc.apply(this, a); };
    const src = proto.createBufferSource;
    proto.createBufferSource = function (...a) { window.__noise++; return src.apply(this, a); };
  }
};

async function newPlayer(browser, label, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', ...opts });
  await context.addInitScript(SPY);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] console: ${m.text()}`));
  await page.goto(BASE);
  await page.getByText('Servidor en línea').waitFor();
  return { context, page, label };
}

async function setName(page, name) {
  const input = page.locator('#player-name');
  await input.fill(name);
  await input.press('Enter');
  await page.getByRole('button', { name: new RegExp(`Tu nombre: ${name}`) }).waitFor();
}

const sounds = (page) => page.evaluate(() => window.__sounds.slice());
const clearSounds = (page) => page.evaluate(() => { window.__sounds.length = 0; });
async function expectSounds(page, expected, what, timeout = 6000) {
  const end = Date.now() + timeout;
  let got;
  while (Date.now() < end) {
    got = await sounds(page);
    if (JSON.stringify(got) === JSON.stringify(expected)) return;
    await sleep(80);
  }
  assert.deepEqual(got, expected, what);
}

async function click(page, sq) {
  const b = await page.locator(`[data-square="${sq}"]`).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
const move = async (page, from, to) => { await click(page, from); await click(page, to); };
const plies = (page) => page.locator('[data-testid="move-list"] li button').count();
async function waitPlies(page, n, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await plies(page)) === n) return;
    await sleep(60);
  }
  throw new Error(`esperaba ${n} jugadas y hay ${await plies(page)}`);
}
const toggle = (page) => page.getByTestId('sound-toggle');

(async () => {
  const browser = await chromium.launch();
  try {
    // ------------------------------------------------------------------ dos jugadores
    const host = await newPlayer(browser, 'host');
    const guest = await newPlayer(browser, 'guest');
    await setName(host.page, 'Ana Torres');
    await setName(guest.page, 'Beto Ruiz');
    const H = host.page;
    const G = guest.page;

    assert.equal(await toggle(H).getAttribute('aria-pressed'), 'true', 'el sonido viene activado');
    await H.getByRole('button', { name: /Configurar y crear/ }).click();
    const dialog = H.getByRole('dialog', { name: 'Crear sala' });
    await dialog.getByRole('radio', { name: /Privada/ }).click();
    await dialog.getByRole('radio', { name: 'Blancas' }).click();
    await dialog.getByRole('radio', { name: 'Sin reloj' }).click();
    await dialog.getByRole('button', { name: /Crear sala/ }).click();
    await H.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
    const code = H.url().split('/').pop();
    await H.getByText(/Esperando/).first().waitFor();
    assert.deepEqual(await sounds(H), [], 'esperando rival no suena nada');
    await G.goto(`${BASE}/sala/${code}`);
    await G.getByTestId('board').waitFor();
    await H.getByTestId('board').waitFor();
    await expectSounds(H, ['start'], 'el anfitrión oye el inicio cuando entra el rival');
    await expectSounds(G, ['start'], 'quien entra de segundo oye el inicio');
    step('al entrar el rival suena "start" para los dos');

    // e4 d5 exd5 Qxd5 Nc3 Qa5 Bb5+
    const line = [
      [H, 'e2', 'e4'], [G, 'd7', 'd5'], [H, 'e4', 'd5'], [G, 'd8', 'd5'], [H, 'b1', 'c3'], [G, 'd5', 'a5'], [H, 'f1', 'b5'],
    ];
    for (const [i, [p, from, to]] of line.entries()) {
      await move(p, from, to);
      await waitPlies(H, i + 1);
      await waitPlies(G, i + 1);
    }
    const expected = ['start', 'move', 'move', 'capture', 'capture', 'move', 'move', 'check'];
    await expectSounds(H, expected, 'sonidos del anfitrión: propias al instante y las del rival al llegar');
    await expectSounds(G, expected, 'sonidos del invitado');
    const audio = await H.evaluate(() => ({ osc: window.__osc, noise: window.__noise }));
    assert.ok(audio.osc > 0 && audio.noise > 0, `Web Audio sintetizó sonidos (osc ${audio.osc}, ruido ${audio.noise})`);
    step('jugada, captura y jaque suenan distinto, una vez por jugada (propias y del rival)');

    // ------------------------------------------------------------------ silenciar
    await toggle(G).click();
    assert.equal(await toggle(G).getAttribute('aria-pressed'), 'false');
    await clearSounds(G);
    await clearSounds(H);
    await move(G, 'c7', 'c6'); // responde al jaque
    await waitPlies(H, 8);
    await expectSounds(H, ['move'], 'el rival sigue oyendo tu jugada');
    await sleep(300);
    assert.deepEqual(await sounds(G), [], 'en silencio no suena nada');
    step('silenciado: no suena nada para quien lo apagó; el otro jugador no se ve afectado');

    await G.reload();
    await G.getByTestId('board').waitFor();
    assert.equal(await toggle(G).getAttribute('aria-pressed'), 'false', 'el silencio se recuerda tras recargar');
    await sleep(1200);
    assert.deepEqual(await sounds(G), [], 'recargar no reproduce el historial');
    step('la preferencia se recuerda y al reconectar no se reproduce el historial');

    await toggle(G).click();
    assert.equal(await toggle(G).getAttribute('aria-pressed'), 'true');
    await expectSounds(G, ['toggle'], 'al activarlo suena un aviso');
    await clearSounds(G);
    await move(H, 'b5', 'c6'); // Bxc6+
    await waitPlies(G, 9);
    await expectSounds(G, ['check'], 'de nuevo suena');
    await clearSounds(G);
    await G.reload(); // con sonido activado tampoco se repite lo que ya estaba
    await G.getByTestId('board').waitFor();
    await sleep(1200);
    assert.deepEqual(await sounds(G), [], 'recargar con sonido activado tampoco reproduce nada');
    await move(G, 'b7', 'c6');
    await expectSounds(G, ['capture'], 'tu propia captura suena al instante');
    step('reactivar el sonido funciona y sigue sin repetirse el historial');

    // ------------------------------------------------------------------ chat
    await H.getByRole('tab', { name: /Chat/ }).click();
    await clearSounds(H);
    await clearSounds(G);
    await H.getByLabel('Mensaje de chat').fill('Buena partida');
    await H.getByLabel('Mensaje de chat').press('Enter');
    await expectSounds(G, ['chat'], 'el rival oye el mensaje');
    await sleep(300);
    assert.deepEqual(await sounds(H), [], 'tu propio mensaje no suena');
    step('el chat avisa al otro jugador y no a quien escribe');

    // ------------------------------------------------------------------ final
    await clearSounds(H);
    await clearSounds(G);
    await G.getByTestId('btn-resign').click();
    await G.getByTestId('confirm-resign').click();
    await expectSounds(G, ['lose'], 'quien se rinde oye la derrota');
    await expectSounds(H, ['win'], 'el rival oye la victoria');
    step('victoria y derrota suenan al terminar la partida');

    // ------------------------------------------------------------------ revancha
    await clearSounds(H);
    await clearSounds(G);
    await H.getByRole('button', { name: 'Pedir revancha' }).click();
    await G.getByRole('button', { name: /quiere revancha/ }).click();
    await expectSounds(H, ['start'], 'la revancha empieza con su sonido');
    step('la revancha suena como un inicio de partida');

    // ------------------------------------------------------------------ poco tiempo
    const frank = { socket: io(BASE, { transports: ['websocket'], forceNew: true }) };
    clients.push(frank);
    await new Promise((r) => frank.socket.once('connect', r));
    const ack = (event, data) => new Promise((r) => frank.socket.emit(event, data, r));
    await ack('session:init', { token: randomUUID(), name: 'Frank Sol' });
    const room = await ack('room:create', { visibility: 'private', color: 'w', clock: { initialSeconds: 14, incrementSeconds: 0 } });
    assert.equal(room.ok, true, 'sala con reloj');
    const timed = await newPlayer(browser, 'timed');
    await setName(timed.page, 'Gina Luna');
    await timed.page.goto(`${BASE}/sala/${room.code}`);
    await timed.page.getByTestId('board').waitFor();
    await clearSounds(timed.page);
    await ack('game:move', { from: 'e2', to: 'e4' }); // la primera jugada no gasta tiempo: el reloj de Gina empieza a correr
    await sleep(500);
    await expectSounds(timed.page, ['move'], 'jugada del rival antes del aviso', 4000);
    // 14 s → aviso a los 10 s, y un tic por segundo en los últimos 5
    const end = Date.now() + 16000;
    let log = [];
    while (Date.now() < end) {
      log = await sounds(timed.page);
      if (log.filter((s) => s === 'tick').length >= 5) break;
      await sleep(250);
    }
    assert.equal(log.filter((s) => s === 'warn').length, 1, `un solo aviso a los 10 s: ${log}`);
    assert.ok(log.filter((s) => s === 'tick').length >= 4, `tics en los últimos segundos: ${log}`);
    assert.ok(log.indexOf('warn') < log.indexOf('tick'), 'primero el aviso, luego los tics');
    step('con poco tiempo: un aviso a los 10 s y un tic por segundo al final');

    // ------------------------------------------------------------------ contra el bot
    const bot = await newPlayer(browser, 'bot');
    const B = bot.page;
    await B.getByRole('radio', { name: 'Principiante', exact: true }).click();
    await B.getByRole('radiogroup', { name: 'Tu color contra el bot' }).getByRole('radio', { name: 'Blancas' }).click();
    await B.getByRole('button', { name: /Iniciar partida/ }).click();
    await B.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
    await B.getByTestId('board').waitFor();
    await expectSounds(B, ['start'], 'la partida contra el bot arranca con su sonido');
    await move(B, 'e2', 'e4');
    const endBot = Date.now() + 12000;
    let botLog = [];
    while (Date.now() < endBot) {
      botLog = await sounds(B);
      if (botLog.filter((s) => ['move', 'capture', 'check'].includes(s)).length >= 2) break;
      await sleep(150);
    }
    assert.ok(botLog.filter((s) => ['move', 'capture', 'check'].includes(s)).length >= 2, `tu jugada y la respuesta del bot suenan: ${botLog}`);
    step('contra el bot suena el inicio, tu jugada y su respuesta');

    // ------------------------------------------------------------------ lecciones
    const learner = await newPlayer(browser, 'alumno');
    const L = learner.page;
    await L.goto(`${BASE}/aprender/peon`);
    await L.getByTestId('board').waitFor();
    await L.getByTestId('board').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await clearSounds(L);
    await click(L, 'e2');
    await click(L, 'a5'); // casilla a la que el peón no puede ir
    await expectSounds(L, ['error'], 'jugada imposible: aviso de error');
    await clearSounds(L);
    await click(L, 'e2');
    await click(L, 'e4');
    await expectSounds(L, ['move', 'success'], 'ejercicio resuelto: jugada y campanita de éxito');
    step('lecciones: error en jugada imposible y campanita al resolver el ejercicio');

    await H.screenshot({ path: path.join(SHOTS, 'h-cabecera-sonido.png'), clip: { x: 900, y: 0, width: 540, height: 70 } });
    assert.deepEqual(errors, [], `errores en consola:\n${errors.join('\n')}`);
    step('sin errores de consola ni de página');
    console.log('\nFase h (sonidos): todo en orden ✔');
  } catch (e) {
    console.error('\n✘ FALLÓ:', e.message);
    process.exitCode = 1;
  } finally {
    for (const c of clients) c.socket.close();
    await browser.close();
  }
})();
