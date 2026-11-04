// Los errores del servidor llegan como `{ code, message }` con el mensaje en español. Aquí se muestran en el
// idioma del cliente: en español, el mensaje tal cual; en inglés, la traducción por mensaje o, si no, por código.
import { getLang, msg, t } from './core.js';

const BY_CODE = {
  NO_SESSION: msg('Sesión no iniciada. Recarga la página.'),
  INVALID_TOKEN: msg('Identificador de sesión inválido.'),
  INVALID_NAME: msg('El nombre debe tener entre 2 y 20 caracteres (letras, números, espacios, _ . -).'),
  NAME_LOCKED: msg('No puedes cambiar de nombre mientras estás en una sala.'),
  INVALID_CODE: msg('El código debe tener 6 caracteres.'),
  ROOM_NOT_FOUND: msg('No existe una sala con ese código.'),
  ROOM_FULL: msg('La sala está llena.'),
  SERVER_BUSY: msg('El servidor tiene demasiadas salas abiertas. Intenta más tarde.'),
  INVALID_OPTIONS: msg('Opciones inválidas.'),
  ALREADY_IN_GAME: msg('Ya estás jugando una partida. Termínala o abandónala primero.'),
  NOT_IN_ROOM: msg('No estás en ninguna sala.'),
  NOT_PLAYER: msg('Solo los jugadores pueden hacer eso.'),
  NOT_HOST: msg('Solo el anfitrión puede hacer eso.'),
  GAME_NOT_ACTIVE: msg('No hay una partida en curso.'),
  GAME_OVER: msg('La partida ya terminó.'),
  NOT_YOUR_TURN: msg('No es tu turno.'),
  ILLEGAL_MOVE: msg('Movimiento ilegal.'),
  REMATCH_UNAVAILABLE: msg('Tu rival ya no está en la sala.'),
  BOT_UNAVAILABLE: msg('El bot no está disponible en este servidor.'),
  RATE_LIMITED: msg('Vas demasiado rápido. Espera un momento.'),
  BAD_REQUEST: msg('Solicitud inválida.'),
  NO_WAITING_ROOMS: msg('No hay salas esperando rival ahora mismo.'),
  OFFLINE: msg('Sin conexión con el servidor.'),
  TIMEOUT: msg('El servidor no respondió. Inténtalo de nuevo.'),
  INTERNAL: msg('Error interno del servidor.'),
};

// Mensajes del servidor con texto propio (varían según el caso) que no son el genérico de su código.
const KNOWN = [
  msg('Se acabó tu tiempo.'),
  msg('El bot no acepta tablas.'),
  msg('Ya ofreciste tablas.'),
  msg('No hay ninguna oferta de tablas pendiente.'),
  msg('La partida aún no termina.'),
  msg('Elige un nivel de dificultad.'),
  msg('Color inválido.'),
  msg('Elige si la sala es pública o privada.'),
  msg('El chat no está disponible contra el bot.'),
  msg('El mensaje está vacío.'),
  msg('Las pistas solo están disponibles en la práctica guiada.'),
];

// Los que llevan números dentro.
const PATTERNS = [
  [/^El reloj debe estar entre (\d+) segundos y 3 horas\.$/, (m) => t('El reloj debe estar entre {min} segundos y 3 horas.', { min: m[1] })],
  [/^El incremento debe estar entre 0 y (\d+) segundos\.$/, (m) => t('El incremento debe estar entre 0 y {max} segundos.', { max: m[1] })],
];

/** Texto del error en el idioma actual. Acepta el `error` de un ack (`{ code, message }`). */
export function errorText(error) {
  if (!error) return '';
  const original = typeof error.message === 'string' ? error.message : '';
  if (getLang() === 'es') return original || (BY_CODE[error.code] ? t(BY_CODE[error.code]) : '');

  const direct = t(original);
  if (original && direct !== original) return direct;
  for (const [pattern, build] of PATTERNS) {
    const match = original.match(pattern);
    if (match) return build(match);
  }
  if (BY_CODE[error.code]) return t(BY_CODE[error.code]);
  return original; // código desconocido: mejor el texto original que nada
}

// Se exporta para las pruebas: todo lo que puede decir el servidor tiene que tener traducción.
export const KNOWN_SERVER_MESSAGES = [...Object.values(BY_CODE), ...KNOWN];
