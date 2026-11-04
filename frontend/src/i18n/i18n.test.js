import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EN } from './en.js';
import { loadEnglish } from './core.js';

await loadEnglish(); // en la app se descarga bajo demanda; aquí los textos en inglés se necesitan desde el principio
import { extractKeys } from '../../scripts/i18n-keys.js';
import { KNOWN_SERVER_MESSAGES, errorText } from './errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('cada frase de la interfaz tiene su traducción al inglés, y no sobra ninguna', () => {
  const { keys, templates } = extractKeys();
  assert.deepEqual(templates, [], 'las plantillas con ${} no se pueden traducir: usa {parámetros}');
  const missing = [...keys].filter((key) => !(key in EN));
  const unused = Object.keys(EN).filter((key) => !keys.has(key));
  assert.deepEqual(missing, [], `faltan traducciones:\n${missing.join('\n')}`);
  assert.deepEqual(unused, [], `traducciones que ya no se usan (¿cambió el texto en español?):\n${unused.join('\n')}`);
});

test('las traducciones no están vacías y conservan los mismos {parámetros}', () => {
  for (const [es, en] of Object.entries(EN)) {
    assert.ok(en.trim(), `traducción vacía: ${es}`);
    assert.equal(placeholders(en), placeholders(es), `parámetros distintos en: ${es}`);
  }
});

test('la notación de las jugadas nunca se traduce (siempre algebraica estándar)', async () => {
  const { translate } = await import('./core.js');
  for (const san of ['e4', 'Nf3', 'Bb5+', 'Qxd5', 'O-O', 'O-O-O', 'exd5', 'e8=Q', 'Qh5#']) {
    assert.equal(translate('en', san), san);
    assert.equal(translate('es', san), san);
    assert.ok(!(san in EN), `${san} no debe estar en el diccionario`);
  }
  // Ni en la descripción en lenguaje natural: las casillas siguen siendo g1, f3…
  const { setLang } = await import('./core.js');
  const { describeMove } = await import('../lib/learn.js');
  setLang('en');
  assert.equal(describeMove({ piece: 'n', from: 'g1', to: 'f3' }), 'The knight jumped from g1 to f3.');
  setLang('es');
  assert.equal(describeMove({ piece: 'n', from: 'g1', to: 'f3' }), 'El caballo saltó de g1 a f3.');
});

test('el español es la frase tal cual; el inglés la traduce y sustituye los parámetros', async () => {
  const { translate, tp } = await import('./core.js');
  assert.equal(translate('es', 'Ejercicio {n} de {total}', { n: 1, total: 2 }), 'Ejercicio 1 de 2');
  assert.equal(translate('en', 'Ejercicio {n} de {total}', { n: 1, total: 2 }), 'Exercise 1 of 2');
  assert.equal(translate('en', 'frase que no existe'), 'frase que no existe', 'sin traducción se muestra el original, nunca vacío');
  assert.equal(typeof tp, 'function');
});

test('los errores del servidor se muestran en el idioma del cliente', async () => {
  const { setLang } = await import('./core.js');
  const error = { code: 'ROOM_NOT_FOUND', message: 'No existe una sala con ese código.' };
  setLang('es');
  assert.equal(errorText(error), 'No existe una sala con ese código.');
  setLang('en');
  assert.equal(errorText(error), "There's no room with that code.");
  // Mensajes con números dentro
  assert.equal(errorText({ code: 'INVALID_OPTIONS', message: 'El reloj debe estar entre 15 segundos y 3 horas.' }), 'The clock must be between 15 seconds and 3 hours.');
  assert.equal(errorText({ code: 'INVALID_OPTIONS', message: 'El incremento debe estar entre 0 y 60 segundos.' }), 'The increment must be between 0 and 60 seconds.');
  // Errores que el cliente fabrica sin mensaje (sin conexión, tiempo agotado) y códigos nuevos desconocidos
  assert.equal(errorText({ code: 'OFFLINE' }), 'No connection to the server.');
  assert.equal(errorText({ code: 'CODIGO_NUEVO', message: 'Algo pasó.' }), 'Algo pasó.');
  setLang('es');
  assert.equal(errorText({ code: 'OFFLINE' }), 'Sin conexión con el servidor.');
});

test('todo mensaje de error que puede mandar el servidor tiene traducción', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const known = new Set(KNOWN_SERVER_MESSAGES);
  const patterns = [/^El reloj debe estar entre /, /^El incremento debe estar entre /];
  const sent = new Set();
  for (const file of walk(path.resolve(here, '../../../backend/src')).filter((f) => f.endsWith('.js'))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    // Los mensajes salen de utils/errors.js (todo el archivo) y de las llamadas a ERRORS.x(...) / new AppError(...) del resto.
    const relevant = file.endsWith(path.join('utils', 'errors.js')) ? lines : lines.filter((l) => /ERRORS\.\w+\(|new AppError\(/.test(l));
    for (const line of relevant) {
      for (const m of line.matchAll(/'((?:\\.|[^'\\])+)'|`([^`$]+)\$\{/g)) {
        const text = (m[1] ?? m[2]).replace(/\\'/g, "'");
        if (/\s/.test(text) && /[.?!]$|^El (reloj|incremento) /.test(text)) sent.add(text);
      }
    }
  }
  assert.ok(sent.size > 20, `se esperaban muchos mensajes del servidor, se encontraron ${sent.size}`);
  const uncovered = [...sent].filter((text) => !known.has(text) && !patterns.some((p) => p.test(text)));
  assert.deepEqual(uncovered, [], 'mensajes del servidor sin traducción en i18n/errors.js');
});

// ------------------------------------------------------------------ persistencia y aislamiento

function fakeBrowser(initial = {}) {
  const local = new Map(Object.entries(initial));
  globalThis.window = {
    localStorage: { getItem: (k) => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: (k) => local.delete(k) },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    location: { search: '' },
  };
  globalThis.document = { documentElement: {}, title: '' };
  return local;
}
let fresh = 0;
const loadCore = () => import(`./core.js?fresh=${++fresh}`);

test('por defecto el sitio está en español, aunque el navegador esté en otro idioma', async () => {
  fakeBrowser();
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true });
  const core = await loadCore();
  assert.equal(core.getLang(), 'es');
  assert.equal(document.documentElement.lang, 'es');
});

test('el idioma elegido se guarda en localStorage y sobrevive a recargar la página', async () => {
  const store = fakeBrowser();
  const first = await loadCore();
  await first.loadEnglish(); // el selector la descarga antes de cambiar
  first.setLang('en');
  assert.equal(store.get('trebejos:lang'), 'en');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(document.title, 'Trebejos — Online chess');
  const reloaded = await loadCore(); // otra "carga de página": lee lo guardado
  await reloaded.loadEnglish(); // main.jsx la espera antes del primer dibujo
  assert.equal(reloaded.getLang(), 'en');
  assert.equal(reloaded.t('Crear sala'), 'Create room');
});

test('un valor guardado inválido se ignora y se vuelve al español', async () => {
  fakeBrowser({ 'trebejos:lang': 'fr' });
  assert.equal((await loadCore()).getLang(), 'es');
  const core = await loadCore();
  core.setLang('fr'); // un idioma que no existe no cambia nada
  assert.equal(core.getLang(), 'es');
});

test('cambiar el idioma avisa a quien lo escucha y no hace nada si ya estaba elegido', async () => {
  fakeBrowser();
  const core = await loadCore();
  let calls = 0;
  const off = core.subscribeLang(() => calls++);
  core.setLang('en');
  core.setLang('en');
  core.setLang('es');
  off();
  core.setLang('en');
  assert.equal(calls, 2);
});

test('el idioma es solo del cliente: ningún código de red, de sesión ni del servidor lo usa', () => {
  const read = (...parts) => fs.readFileSync(path.resolve(here, ...parts), 'utf8');
  for (const file of ['../lib/socket.js', '../context/SessionContext.jsx', '../hooks/useLobby.js']) {
    assert.doesNotMatch(read(file), /\b(getLang|setLang|useI18n|lang)\b/, `${file} no debe conocer el idioma`);
  }
  // Y el servidor no sabe de idiomas: no hay nada de esto en el protocolo ni en el estado de las salas.
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const file of walk(path.resolve(here, '../../../backend/src')).filter((f) => f.endsWith('.js'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\blang(uage)?\b|\blocale\b/i, `${file} no debe conocer el idioma`);
  }
  assert.doesNotMatch(fs.readFileSync(path.resolve(here, '../../../backend/PROTOCOL.md'), 'utf8'), /\blang(uage)?\b|idioma/i);
});
