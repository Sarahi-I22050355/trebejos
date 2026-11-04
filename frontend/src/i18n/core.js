// Idioma de la interfaz (español / inglés). Es una preferencia SOLO del cliente: vive en localStorage,
// junto a la identidad de este navegador, y no viaja al servidor ni forma parte del estado de ninguna sala.
// Dos jugadores de la misma sala pueden tener cada uno el suyo.
//
// Los textos del código están en español y esa misma frase es su clave: en español `t('Crear sala')` devuelve
// la frase tal cual, y en inglés se busca en `en.js`. Así el español no depende de ningún diccionario.
import { safeStorage } from '../lib/storage.js';
import { storageKey } from '../lib/session.js';

// El diccionario inglés (≈ 50 KB) no viaja con la app: se descarga solo si el idioma es inglés (ver loadEnglish).
let EN = {};

export const LANGS = ['es', 'en'];
export const DEFAULT_LANG = 'es';

const isLang = (value) => LANGS.includes(value);

function load() {
  const saved = safeStorage.get(storageKey('lang'));
  return isLang(saved) ? saved : DEFAULT_LANG;
}

let lang = load();
const listeners = new Set();

export const getLang = () => lang;
export const subscribeLang = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function applyToDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.title = translate(lang, msg('Trebejos — Ajedrez en línea'));
}

/**
 * Descarga el diccionario inglés (una sola vez). Hay que esperarla ANTES de dibujar en inglés: al arrancar con el inglés
 * guardado (main.jsx) y antes de cambiar a inglés desde el selector (LanguageSwitch).
 */
export async function loadEnglish() {
  if (Object.keys(EN).length === 0) {
    EN = (await import('./en.js')).EN;
    applyToDocument();
  }
}

/** Cambia el idioma al instante (sin recargar) y lo recuerda en este navegador. */
export function setLang(next) {
  if (!isLang(next) || next === lang) return;
  lang = next;
  safeStorage.set(storageKey('lang'), next);
  applyToDocument();
  listeners.forEach((fn) => fn());
}

const fill = (text, params) => (params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : text);

/** Traducción explícita a un idioma (la usan las pruebas); en el código de la app se usa `t`. */
export function translate(language, text, params) {
  const base = language === 'en' ? EN[text] ?? text : text;
  return fill(base, params);
}

/** Texto de la interfaz en el idioma actual. `{nombre}` se sustituye con `params`. */
export const t = (text, params) => translate(lang, text, params);

/** Singular/plural: elige entre dos frases según `n` (que también está disponible como `{n}`). */
export const tp = (n, one, other, params) => t(n === 1 ? one : other, { n, ...params });

/**
 * Marca una frase como texto de interfaz sin traducirla todavía (constantes de módulo, tablas de opciones):
 * devuelve la misma frase, y el componente la traduce al dibujarla con `t(frase)`.
 * También es lo que permite a las pruebas encontrar todas las frases que necesitan traducción.
 */
export const msg = (text) => text;

applyToDocument(); // al cargar: <html lang> y el título según el idioma guardado
