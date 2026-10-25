// Mismas reglas que el servidor (backend/src/utils/names.js): 2–20 caracteres,
// letras (con acentos), números, espacio y _ . -
export const NAME_MIN = 2;
export const NAME_MAX = 20;
const NAME_RE = /^[\p{L}\p{N} _.-]+$/u;

export function sanitizeName(input) {
  if (typeof input !== 'string') return null;
  const name = input
    .normalize('NFKC')
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const length = [...name].length;
  if (length < NAME_MIN || length > NAME_MAX || !NAME_RE.test(name)) return null;
  return name;
}

export const NAME_HINT = `Entre ${NAME_MIN} y ${NAME_MAX} caracteres: letras, números, espacios, _ . -`;

// Nombres aleatorios con temática de ajedrez: "CaballoVeloz42".
const NOUNS = [
  'Caballo', 'Alfil', 'Torre', 'Dama', 'Rey', 'Peon', 'Gambito', 'Jaque', 'Enroque', 'Tablero',
  'Escaque', 'Trebejo', 'Mate', 'Apertura', 'Zugzwang',
];
const ADJECTIVES = [
  'Veloz', 'Astuto', 'Audaz', 'Sabio', 'Neon', 'Cuantico', 'Sombrio', 'Feroz', 'Sereno', 'Brillante',
  'Eterno', 'Ligero', 'Fugaz', 'Glacial', 'Electrico',
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function randomName() {
  return `${pick(NOUNS)}${pick(ADJECTIVES)}${10 + Math.floor(Math.random() * 90)}`;
}
