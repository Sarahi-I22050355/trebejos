// Identidad anónima del navegador: un token (UUID) en localStorage que el servidor usa
// para reconocerte y reconectarte a tu sala, y el nombre elegido. No hay cuentas.
import { safeStorage } from './storage.js';

const NS_KEY = 'trebejos:ns';

/**
 * Espacio de nombres opcional (`?s=ana`). Dos pestañas del mismo navegador comparten
 * localStorage y por tanto serían la MISMA persona; con `?s=` cada pestaña puede tener
 * su propia identidad, útil para probar una partida entre dos jugadores en una máquina.
 * Se recuerda en sessionStorage para que sobreviva a la navegación interna.
 */
function namespace() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('s');
    if (fromUrl) window.sessionStorage.setItem(NS_KEY, fromUrl.replace(/[^\w-]/g, '').slice(0, 20));
    return window.sessionStorage.getItem(NS_KEY) || '';
  } catch {
    return '';
  }
}

const ns = namespace();
const key = (name) => `trebejos${ns ? `:${ns}` : ''}:${name}`;

/** UUID v4. `crypto.randomUUID` solo existe en contextos seguros (https / localhost). */
export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

export function getToken() {
  let token = safeStorage.get(key('token'));
  if (!token) {
    token = uuid();
    safeStorage.set(key('token'), token);
  }
  return token;
}

export const loadName = () => safeStorage.get(key('name'));
export const storeName = (name) => safeStorage.set(key('name'), name);
