import { randomInt } from 'node:crypto';

const NAME_MIN = 2;
const NAME_MAX = 20;
// Letras (con acentos), números, espacio y _ . -
const NAME_RE = /^[\p{L}\p{N} _.-]+$/u;

/** Devuelve el nombre limpio o `null` si no es válido. */
export function sanitizeName(input) {
  if (typeof input !== 'string') return null;
  const name = input
    .normalize('NFKC')
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '') // controles, formato invisible, bidi
    .replace(/\s+/g, ' ')
    .trim();
  const length = [...name].length;
  if (length < NAME_MIN || length > NAME_MAX || !NAME_RE.test(name)) return null;
  return name;
}

/** Texto de chat: sin caracteres de control, espacios colapsados. Vacío => `null`. */
export function sanitizeChat(input, maxLength) {
  if (typeof input !== 'string') return null;
  const text = input
    .normalize('NFKC')
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return [...text].slice(0, maxLength).join('');
}

// Respaldo por si un cliente inicia sesión sin nombre. El frontend tiene su propio
// generador (con botón de dado); este mantiene el mismo estilo: "CaballoVeloz42".
const NOUNS = ['Caballo', 'Alfil', 'Torre', 'Dama', 'Rey', 'Peon', 'Gambito', 'Jaque', 'Enroque', 'Tablero'];
const ADJECTIVES = ['Veloz', 'Astuto', 'Audaz', 'Sabio', 'Neon', 'Cuantico', 'Sombrio', 'Feroz', 'Sereno', 'Brillante'];

export function randomName() {
  const noun = NOUNS[randomInt(NOUNS.length)];
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)];
  return `${noun}${adjective}${randomInt(10, 100)}`;
}
