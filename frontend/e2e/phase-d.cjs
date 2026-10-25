// E2E de la fase d (chat) con navegadores reales.
//   (backend sirviendo frontend/dist)  BASE_URL=http://localhost:3917 node e2e/phase-d.cjs
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
const allPages = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPlayer(browser, label, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', ...opts });
  const page = await context.newPage();
  allPages.push([label, page]);
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] console: ${m.text()}`));
  page.on('dialog', (d) => {
    errors.push(`[${label}] se abrió un diálogo del navegador (posible inyección): ${d.message()}`);
    d.dismiss();
  });
  await page.goto(BASE);
  return { context, page, label };
}

async function setName(page, name) {
  await page.getByText('Servidor en línea').waitFor();
  const input = page.locator('#player-name');
  await input.fill(name);
  await input.press('Enter');
  await page.getByRole('button', { name: new RegExp(`Tu nombre: ${name}`) }).waitFor();
}

const chatTab = (page) => page.getByRole('tab', { name: /Chat/ });
const messages = (page) => page.getByTestId('chat-message');
const unread = (page) => page.getByTestId('chat-unread');
const input = (page) => page.getByLabel('Mensaje de chat');
async function say(page, text) {
  await input(page).fill(text);
  await input(page).press('Enter');
}
async function waitCount(locator, n, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await locator.count()) === n) return;
    await sleep(50);
  }
  throw new Error(`esperaba ${n} y hay ${await locator.count()}`);
}

(async () => {
  const browser = await chromium.launch();
  try {
    const host = await newPlayer(browser, 'host');
    const guest = await newPlayer(browser, 'guest');
    const spec = await newPlayer(browser, 'spec');
    await setName(host.page, 'Ana Torres');
    await setName(guest.page, 'Beto Ruiz');
    await setName(spec.page, 'Carla Mirón');

    await host.page.getByRole('button', { name: /Configurar y crear/ }).click();
    const dialog = host.page.getByRole('dialog', { name: 'Crear sala' });
    await dialog.getByRole('radio', { name: /Pública/ }).click();
    await dialog.getByRole('radio', { name: 'Blancas' }).click();
    await dialog.getByRole('radio', { name: 'Sin reloj' }).click();
    await dialog.getByRole('button', { name: /Crear sala/ }).click();
    await host.page.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
    const code = host.page.url().split('/').pop();
    for (const p of [guest.page, spec.page]) await p.goto(`${BASE}/sala/${code}`);
    for (const p of [host.page, guest.page, spec.page]) await p.getByTestId('board').waitFor();
    step(`partida ${code} con dos jugadores y un espectador`);

    // ------------------------------------------------------------ pestañas y estado vacío
    assert.equal(await host.page.getByRole('tab', { name: /Movimientos/ }).getAttribute('aria-selected'), 'true');
    await chatTab(host.page).click();
    await host.page.getByText('Aún no hay mensajes').waitFor();
    assert.equal(await host.page.getByRole('button', { name: 'Enviar mensaje' }).isDisabled(), true);
    await input(host.page).fill('     ');
    assert.equal(await host.page.getByRole('button', { name: 'Enviar mensaje' }).isDisabled(), true);
    step('pestaña Chat con estado vacío; no se puede enviar un mensaje vacío o de solo espacios');

    // ------------------------------------------------------- mensajes en vivo y no leídos
    await say(host.page, 'Hola Beto, ¡suerte!');
    await waitCount(messages(host.page), 1);
    assert.match(await messages(host.page).first().innerText(), /T[úu]/i);
    assert.equal(await input(host.page).inputValue(), ''); // se vacía al enviar
    await unread(guest.page).waitFor();
    assert.equal((await unread(guest.page).innerText()).trim(), '1');
    await unread(spec.page).waitFor();
    assert.equal(await unread(host.page).count(), 0, 'los mensajes propios no cuentan como no leídos');
    step('el mensaje llega al instante a todos; el rival y el espectador ven el contador de no leídos');

    await chatTab(guest.page).click();
    await waitCount(unread(guest.page), 0);
    const first = messages(guest.page).first();
    const firstText = await first.innerText();
    assert.match(firstText, /blancas/i);
    assert.match(firstText, /Ana Torres/);
    assert.match(firstText, /Hola Beto, ¡suerte!/);
    assert.doesNotMatch(firstText, /T[úu]/i);
    step('al abrir el chat se limpia el contador; el mensaje muestra rol (Blancas), nombre y texto');

    await say(guest.page, 'Gracias Ana, igualmente');
    await chatTab(spec.page).click();
    await waitCount(messages(spec.page), 2);
    await say(spec.page, '¡Buena partida a los dos!');
    for (const p of [host.page, guest.page, spec.page]) await waitCount(messages(p), 3);
    const hostLast = await messages(host.page).nth(2).innerText();
    assert.match(hostLast, /espectador/i);
    assert.match(hostLast, /Carla Mirón/);
    assert.match(await messages(spec.page).nth(2).innerText(), /T[úu]/i);
    assert.match(await messages(guest.page).nth(1).innerText(), /negras[\s\S]*Beto Ruiz[\s\S]*T[úu]/i);
    step('conversación a tres bandas en el mismo orden para todos, con rol y marca "Tú" correctos');
    await host.page.screenshot({ path: path.join(SHOTS, 'd01-chat-desktop.png'), fullPage: true });

    // --------------------------------------------------------------- seguridad: sin HTML
    await say(host.page, '<b>negrita</b> <img src=x onerror=alert(1)> <script>alert(2)</script>');
    for (const p of [guest.page, spec.page]) {
      await waitCount(messages(p), 4);
      const last = messages(p).nth(3);
      assert.match(await last.innerText(), /<b>negrita<\/b>/);
      assert.equal(await last.locator('b, img, script').count(), 0, 'el HTML no debe interpretarse');
    }
    step('un mensaje con HTML/scripts se muestra como texto plano (sin inyección)');

    // --------------------------------------------------------------- límite de frecuencia
    await sleep(5200); // que expire la ventana (5 mensajes / 5 s por sesión)
    for (let i = 1; i <= 6; i++) {
      await say(guest.page, `ráfaga ${i}`);
      await sleep(150); // da tiempo a que cada envío termine (el campo ignora un 2.º Enter mientras hay uno en vuelo)
    }
    await guest.page.getByTestId('chat-error').waitFor();
    assert.match(await guest.page.getByTestId('chat-error').innerText(), /demasiado rápido/);
    assert.equal(await input(guest.page).inputValue(), 'ráfaga 6', 'el texto no enviado se conserva');
    step('al spamear se avisa del límite y no se pierde el texto escrito');
    await sleep(5200);
    await guest.page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await waitCount(guest.page.getByText('ráfaga 6'), 1);
    await waitCount(guest.page.getByTestId('chat-error'), 0);
    step('pasado el tiempo el mensaje se puede reenviar');

    // --------------------------------------------------------------- longitud máxima
    await input(host.page).fill('x'.repeat(400));
    assert.equal((await input(host.page).inputValue()).length, 300);
    await host.page.getByText('300/300').waitFor();
    await input(host.page).fill('');
    step('el mensaje se limita a 300 caracteres con contador');

    // --------------------------------------------------- historial tras recargar y al llegar tarde
    const total = await messages(guest.page).count();
    await guest.page.reload();
    await guest.page.getByTestId('board').waitFor();
    await chatTab(guest.page).click();
    await waitCount(messages(guest.page), total);
    step(`al recargar se conserva el historial del chat (${total} mensajes)`);

    const late = await newPlayer(browser, 'late');
    await setName(late.page, 'Diego Tarde');
    await late.page.goto(`${BASE}/sala/${code}`);
    await late.page.getByTestId('board').waitFor();
    assert.equal(await unread(late.page).count(), 0, 'el historial previo cuenta como leído');
    await chatTab(late.page).click();
    await waitCount(messages(late.page), total);
    step('un espectador que llega tarde ve el historial sin contador de no leídos');
    await late.context.close();

    // --------------------------------------------- desplazamiento y "Mensajes nuevos"
    const sockets = [];
    for (let i = 0; i < 4; i++) {
      const s = io(BASE, { transports: ['websocket'] });
      await new Promise((r) => s.once('connect', r));
      const ack = (ev, d) => new Promise((r) => s.emit(ev, d, r));
      await ack('session:init', { token: randomUUID(), name: `Fan ${i + 1}` });
      assert.equal((await ack('room:join', { code })).role, 'spectator');
      sockets.push({ s, ack });
    }
    for (let round = 0; round < 5; round++) {
      await Promise.all(sockets.map(({ ack }, i) => ack('chat:send', { text: `mensaje largo de relleno número ${round * 4 + i + 1} para llenar el panel` })));
    }
    const list = host.page.getByRole('log');
    await waitCount(messages(host.page), total + 20);
    const atBottom = () => list.evaluate((el) => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 4);
    await sleep(200);
    assert.equal(await atBottom(), true, 'con el usuario al final, el chat sigue la conversación');
    step('con 20+ mensajes el chat sigue al último automáticamente');

    await list.evaluate((el) => { el.scrollTop = 0; });
    await sleep(150);
    await sleep(5200); // cada socket ya envió 5 mensajes: esperar a que expire su ventana de límite
    assert.equal((await sockets[0].ack('chat:send', { text: 'mensaje mientras lees arriba' })).ok, true);
    await host.page.getByRole('button', { name: /Mensajes nuevos/ }).waitFor();
    assert.equal(await list.evaluate((el) => el.scrollTop), 0, 'no debe arrastrar al usuario que lee mensajes antiguos');
    await host.page.getByRole('button', { name: /Mensajes nuevos/ }).click();
    await sleep(150);
    assert.equal(await atBottom(), true);
    await host.page.getByRole('button', { name: /Mensajes nuevos/ }).waitFor({ state: 'detached' });
    step('si lees mensajes antiguos no te mueve; aparece "Mensajes nuevos" que lleva al final');
    for (const { s } of sockets) s.close();

    // --------------------------------------------------- el tablero sigue funcionando
    await host.page.getByRole('tab', { name: /Movimientos/ }).click();
    const sq = async (p, s) => { const b = await p.locator(`[data-square="${s}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    for (const s of ['e2', 'e4']) { const c = await sq(host.page, s); await host.page.mouse.click(c.x, c.y); }
    await guest.page.locator('[data-piece="wp"][data-on="e4"]').waitFor();
    step('las pestañas no interfieren con la partida (se juega mientras se chatea)');

    // --------------------------------------------------------------------------- móvil
    const phone = await newPlayer(browser, 'phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await setName(phone.page, 'Móvil');
    await phone.page.goto(`${BASE}/sala/${code}`);
    await phone.page.getByTestId('board').waitFor();
    await chatTab(phone.page).tap();
    await waitCount(messages(phone.page), total + 21);
    await input(phone.page).tap();
    await input(phone.page).fill('hola desde el móvil');
    await phone.page.getByRole('button', { name: 'Enviar mensaje' }).tap();
    await chatTab(host.page).click(); // el anfitrión estaba en la pestaña Movimientos
    await waitCount(messages(host.page), total + 22);
    const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `desbordamiento horizontal en móvil: ${overflow}px`);
    const box = await input(phone.page).boundingBox();
    assert.ok(box.width > 150 && box.x >= 0 && box.x + box.width <= 390, 'el campo de texto debe caber en pantalla');
    await input(phone.page).scrollIntoViewIfNeeded();
    await phone.page.screenshot({ path: path.join(SHOTS, 'd02-chat-mobile.png') });
    step('en móvil el chat se usa con toques, el campo cabe y no hay desbordamiento');

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
