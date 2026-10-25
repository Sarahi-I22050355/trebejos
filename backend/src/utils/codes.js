import { randomInt } from 'node:crypto';

// Sin caracteres ambiguos (0/O, 1/I) para que el código se pueda dictar o leer sin errores.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

export function generateCode(isTaken = () => false) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
  throw new Error('No se pudo generar un código único');
}

/**
 * Acepta lo que un usuario pegaría: "k9x4m2", "#K9X-4M2", " K9X4M2 ".
 * Devuelve el código normalizado o `null` si no tiene un formato válido.
 */
export function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.replace(/[\s#-]/g, '').toUpperCase();
  return CODE_RE.test(code) ? code : null;
}
