// Prueba E2E de la fase b con navegadores reales (Playwright): dos jugadores independientes.
//   (con el backend sirviendo frontend/dist)  BASE_URL=http://localhost:3000 node e2e/phase-b.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const step = (msg) => console.log(`✔ ${msg}`);
const errors = [];

async function newPlayer(browser, label, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: 'es-MX' });
  const page = await context.newPage();
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
  // el chip del encabezado refleja el nombre guardado en el servidor
  try {
    await page.getByRole('button', { name: new RegExp(`Tu nombre: ${name}`) }).waitFor({ timeout: 8000 });
  } catch (err) {
    const chip = await page.locator('header button[aria-label^="Tu nombre"]').getAttribute('aria-label').catch(() => null);
    const shown = await page.locator('[id$="-error"]').allInnerTexts();
    await page.screenshot({ path: path.join(SHOTS, 'fail-setName.png') });
    throw new Error(`setName("${name}") falló. input="${await input.inputValue()}" chip="${chip}" errores=${JSON.stringify(shown)}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ------------------------------------------------------------- inicio + identidad
    const host = await newPlayer(browser, 'host');
    await host.page.goto(BASE);
    await host.page.waitForSelector('h1:has-text("Trebejos")');
    assert.equal(await host.page.title(), 'Trebejos — Ajedrez en línea');
    const firstName = await host.page.locator('#player-name').inputValue();
    assert.match(firstName, /^[A-Za-z]+\d{2}$/, 'debe sugerir un nombre aleatorio al entrar');
    assert.ok((await host.page.content()).includes('Trebejos'));
    assert.ok(!/neochess/i.test(await host.page.content()), 'no debe aparecer NEOCHESS');
    for (const banned of [/\bELO\b/i, /torneo/i, /anti-?cheat/i, /matchmaking/i, /transmisi/i]) {
      assert.ok(!banned.test(await host.page.locator('body').innerText()), `texto prohibido en inicio: ${banned}`);
    }
    await host.page.getByRole('button', { name: 'Cambiar nombre' }).waitFor({ state: 'attached' }).catch(() => {});
    step(`inicio carga con nombre aleatorio (${firstName}) y sin referencias prohibidas`);

    await setName(host.page, 'Ana Torres');
    await host.page.reload();
    await host.page.waitForFunction(() => document.querySelector('#player-name')?.value === 'Ana Torres');
    step('el nombre elegido persiste tras recargar (localStorage)');

    await host.page.locator('#player-name').fill('x');
    await host.page.locator('#player-name').press('Enter');
    await host.page.getByText('Entre 2 y 20 caracteres').waitFor();
    await host.page.locator('#player-name').fill('Ana Torres');
    await host.page.locator('#player-name').press('Enter');
    step('un nombre inválido muestra el error');

    await host.page.getByRole('button', { name: 'Sugerir un nombre aleatorio' }).click();
    const dice = await host.page.locator('#player-name').inputValue();
    assert.notEqual(dice, 'Ana Torres');
    await host.page.waitForFunction((n) => document.querySelector('[aria-label^="Tu nombre"]')?.getAttribute('aria-label').includes(n), dice);
    await setName(host.page, 'Ana Torres');
    step('el dado sugiere y guarda un nombre aleatorio');

    await host.page.screenshot({ path: path.join(SHOTS, '01-home-desktop.png'), fullPage: true });

    // ------------------------------------------------------------------ crear sala
    await host.page.getByRole('button', { name: /Configurar y crear/ }).click();
    const dialog = host.page.getByRole('dialog', { name: 'Crear sala' });
    await dialog.waitFor();
    await dialog.getByRole('radio', { name: /Pública/ }).click();
    await dialog.getByRole('radio', { name: /Blancas/ }).click();
    await dialog.getByRole('radio', { name: '3+2' }).click();
    await host.page.screenshot({ path: path.join(SHOTS, '02-create-dialog.png') });
    await dialog.getByRole('button', { name: /Crear sala/ }).click();
    await host.page.waitForURL(/\/sala\/[A-Z2-9]{6}$/);
    const code = host.page.url().split('/').pop();
    await host.page.getByTestId('room-code').waitFor();
    assert.equal((await host.page.getByTestId('room-code').innerText()).replace(/\s/g, ''), code);
    await host.page.getByText('Esperando rival').first().waitFor();
    await host.page.getByText('Piezas blancas').first().waitFor();
    await host.page.getByText('Blitz 3+2').waitFor();
    step(`sala pública creada: ${code}, con sala de espera, color y reloj`);
    await host.page.waitForTimeout(1300);
    await host.page.screenshot({ path: path.join(SHOTS, '03-waiting-desktop.png'), fullPage: true });

    // ----------------------------------------------- el visitante ve la sala en el inicio
    const guest = await newPlayer(browser, 'guest');
    await guest.page.goto(BASE);
    await setName(guest.page, 'Beto Ruiz');
    await guest.page.getByText('Ana Torres · esperando').waitFor();
    step('la sala pública aparece en vivo en la tarjeta de salas públicas del inicio');
    await guest.page.screenshot({ path: path.join(SHOTS, '04-home-guest-lobby.png'), fullPage: true });

    // --------------------------------------------- errores de código en el campo "Unirse"
    await guest.page.getByLabel('Código de sala').fill('abc');
    await guest.page.getByRole('button', { name: /Conectar a la sala/ }).click();
    await guest.page.getByText('El código tiene 6 caracteres').waitFor();
    step('un código mal formado muestra error en el campo');
    await guest.page.getByLabel('Código de sala').fill('');

    // ----------------------------------------------- unirse con el código (campo Unirse)
    await guest.page.getByLabel('Código de sala').fill(`#${code.toLowerCase()}`);
    await guest.page.getByRole('button', { name: /Conectar a la sala/ }).click();
    await guest.page.waitForURL(new RegExp(`/sala/${code}$`));
    await guest.page.getByTestId('board').waitFor();
    await host.page.getByTestId('board').waitFor();
    step('al entrar el segundo jugador la partida arranca sola en ambos navegadores');
    for (const p of [host.page, guest.page]) {
      const text = await p.locator('main').innerText();
      assert.ok(text.includes('Ana Torres') && text.includes('Beto Ruiz'));
    }
    assert.match(await host.page.getByTestId('strip-w').innerText(), /Ana Torres[\s\S]*T[úu]/i);
    await host.page.screenshot({ path: path.join(SHOTS, '05-room-live.png'), fullPage: true });

    // ----------------------------------------- reconexión: recargar y volver a la misma sala
    await guest.page.reload();
    await guest.page.getByTestId('board').waitFor();
    assert.equal(await guest.page.locator('[data-piece]').count(), 32);
    assert.equal(await guest.page.getByTestId('board').getAttribute('data-orientation'), 'b'); // sigue con negras
    assert.match(await guest.page.getByTestId('strip-b').innerText(), /Beto Ruiz[\s\S]*T[úu]/i);
    step('recargar la página devuelve al jugador a la misma sala y posición, sin pedir nada');

    // ------------------------------------------ desconexión: el rival ve la cuenta regresiva
    await guest.context.setOffline(true);
    await guest.page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await guest.page.close(); // cierra la pestaña de golpe
    await host.page.getByText('se desconectó').waitFor({ timeout: 8000 });
    const countdown = await host.page.getByLabel('Tiempo restante para volver').innerText();
    assert.match(countdown, /^1:[0-3]\d$|^0:\d\d$/);
    step(`el rival ve el aviso de desconexión con cuenta regresiva (${countdown})`);
    await host.page.screenshot({ path: path.join(SHOTS, '06-presence-banner.png') });

    // el jugador vuelve (mismo localStorage) dentro de la gracia
    await guest.context.setOffline(false);
    const back = await guest.context.newPage();
    back.on('pageerror', (e) => errors.push(`[guest-back] pageerror: ${e.message}`));
    await back.goto(`${BASE}/`);
    await back.getByRole('link', { name: /En sala/ }).waitFor(); // el encabezado recuerda su sala
    await back.getByRole('link', { name: /En sala/ }).click();
    await back.getByTestId('board').waitFor();
    await host.page.getByText('se desconectó').waitFor({ state: 'detached', timeout: 8000 });
    step('al volver con el mismo token se reincorpora y desaparece el aviso del rival');

    // ----------------------------------------------------------------- errores de enlace
    const stranger = await newPlayer(browser, 'stranger');
    await stranger.page.goto(`${BASE}/sala/ZZZZZZ`);
    await stranger.page.getByRole('heading', { name: 'Sala no encontrada' }).waitFor();
    await stranger.page.goto(`${BASE}/sala/abc`);
    await stranger.page.getByRole('heading', { name: 'Enlace inválido' }).waitFor();
    step('enlaces con sala inexistente o código inválido muestran errores claros');

    // un tercero con el enlace entra como espectador
    await stranger.page.goto(`${BASE}/sala/${code}`);
    await stranger.page.locator('.badge', { hasText: 'Espectador' }).waitFor();
    step('un tercero que abre el enlace de una sala llena entra como espectador');

    // ------------------------------------------------------------------ salir de la sala
    await stranger.page.getByTestId('btn-leave').click(); // los espectadores salen sin confirmación
    await stranger.page.waitForURL(`${BASE}/`);
    step('el espectador puede salir y vuelve al inicio');

    // ----------------------------------------------------------------- móvil
    const phone = await newPlayer(browser, 'phone', { width: 390, height: 844 });
    await phone.page.goto(BASE);
    await phone.page.waitForSelector('h1:has-text("Trebejos")');
    await phone.page.waitForTimeout(600);
    const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `desbordamiento horizontal en móvil: ${overflow}px`);
    await phone.page.screenshot({ path: path.join(SHOTS, '07-home-mobile.png'), fullPage: true });
    await phone.page.getByRole('button', { name: /Configurar y crear/ }).click();
    await phone.page.getByRole('dialog').getByRole('button', { name: /Crear sala/ }).click();
    await phone.page.getByTestId('room-code').waitFor();
    await phone.page.waitForTimeout(500);
    const overflow2 = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow2 <= 1, `desbordamiento horizontal en sala de espera móvil: ${overflow2}px`);
    await phone.page.screenshot({ path: path.join(SHOTS, '08-waiting-mobile.png'), fullPage: true });
    step('el inicio y la sala de espera no desbordan en pantalla de móvil (390px)');

    // cerrar sala en espera
    await phone.page.getByRole('button', { name: /Cancelar y salir/ }).click();
    await phone.page.getByRole('dialog').getByRole('button', { name: 'Cerrar sala' }).click();
    await phone.page.waitForURL(`${BASE}/`);
    step('el anfitrión puede cerrar su sala en espera');

    assert.deepEqual(errors, [], `errores de consola:\n${errors.join('\n')}`);
    step('sin errores en la consola del navegador');
    console.log(`\nCapturas en: ${SHOTS}`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('\n✖ FALLÓ:', err.message);
  if (errors.length) console.error('Errores de consola:\n' + errors.join('\n'));
  process.exit(1);
});
