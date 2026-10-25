// Códigos de sala: 6 caracteres sin ambiguos (sin 0/O/1/I), igual que el servidor.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = new RegExp(`^[${ALPHABET}]{6}$`);

/** "k9x-4m2", "#K9X4M2", " K9X4M2 " → "K9X4M2". `null` si no es un código válido. */
export function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.replace(/[\s#-]/g, '').toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** Acepta un código suelto o un enlace de invitación completo (…/sala/K9X4M2). */
export function extractCode(input) {
  if (typeof input !== 'string') return null;
  const fromLink = input.match(/\/sala\/([A-Za-z0-9-]{6,8})/);
  return normalizeCode(fromLink ? fromLink[1] : input);
}

export const formatCode = (code) => (code && code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code ?? '');

export const roomLink = (code) => `${window.location.origin}/sala/${code}`;
