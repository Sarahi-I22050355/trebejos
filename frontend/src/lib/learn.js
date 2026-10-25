// Motor de las lecciones (sin React): evalúa la jugada del alumno contra el objetivo del ejercicio
// y explica en español por qué una jugada no es posible.
import { Chess } from 'chess.js';
import { PIECE_NAME, fileOf, rankOf, squareName } from './board.js';

const ARTICLE = { p: 'el', n: 'el', b: 'el', r: 'la', q: 'la', k: 'el' };
export const pieceEs = (type) => `${ARTICLE[type]} ${PIECE_NAME[type]}`;
const cap = (text) => text[0].toUpperCase() + text.slice(1);

const RULES = {
  n: 'El caballo se mueve en L: dos casillas en una dirección y una en perpendicular.',
  b: 'El alfil solo se mueve en diagonal.',
  r: 'La torre solo se mueve en línea recta, por filas o columnas.',
  q: 'La dama se mueve en línea recta o en diagonal.',
  k: 'El rey solo se mueve una casilla en cualquier dirección.',
};

/** ¿La geometría del movimiento corresponde a esa pieza (sin mirar piezas ni jaques)? */
function geometryOk(type, from, to) {
  const dx = Math.abs(fileOf(to) - fileOf(from));
  const dy = Math.abs(rankOf(to) - rankOf(from));
  if (dx === 0 && dy === 0) return false;
  switch (type) {
    case 'n': return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
    case 'b': return dx === dy;
    case 'r': return dx === 0 || dy === 0;
    case 'q': return dx === dy || dx === 0 || dy === 0;
    case 'k': return dx <= 1 && dy <= 1;
    default: return false;
  }
}

/** Casillas intermedias entre `from` y `to` en línea recta o diagonal. */
function between(from, to) {
  const sx = Math.sign(fileOf(to) - fileOf(from));
  const sy = Math.sign(rankOf(to) - rankOf(from));
  const squares = [];
  let f = fileOf(from) + sx;
  let r = rankOf(from) + sy;
  while (f !== fileOf(to) || r !== rankOf(to)) {
    squares.push(squareName(f, r));
    f += sx;
    r += sy;
  }
  return squares;
}

function explainPawn(game, from, to, piece) {
  const dir = piece.color === 'w' ? 1 : -1;
  const df = fileOf(to) - fileOf(from);
  const dy = (rankOf(to) - rankOf(from)) * dir;
  const target = game.get(to);
  if (dy < 0) return 'Los peones nunca retroceden: solo avanzan.';
  if (df === 0) {
    if (dy === 0) return 'El peón tiene que avanzar.';
    if (target) return 'El peón no captura de frente: solo captura en diagonal. Si algo le bloquea el paso, no puede avanzar.';
    const startRank = piece.color === 'w' ? 2 : 7;
    if (dy === 2) {
      if (rankOf(from) !== startRank) return 'El peón solo puede avanzar dos casillas en su primer movimiento.';
      return 'Hay una pieza en el camino: el peón no puede saltar sobre otras.';
    }
    if (dy > 2) return 'El peón avanza como máximo dos casillas, y solo la primera vez que se mueve.';
  }
  if (Math.abs(df) === 1 && dy === 1 && !target) return 'El peón solo se mueve en diagonal para capturar una pieza rival.';
  return 'El peón avanza de frente y captura en diagonal.';
}

/**
 * Por qué `from → to` no es una jugada legal. `to === null` = se tocó una pieza que no corresponde
 * a este ejercicio. `notes` (opcional) son explicaciones específicas del ejercicio: { e1g1: '…' }.
 */
export function explainIllegal(fen, from, to, notes = {}) {
  if (to === null) return 'En este ejercicio mueve la pieza señalada: tócala y elige una casilla.';
  if (notes[`${from}${to}`]) return notes[`${from}${to}`];
  const game = new Chess(fen);
  const piece = game.get(from);
  if (!piece) return 'Selecciona primero una pieza tuya.';
  if (piece.color !== game.turn()) return 'Esa pieza no es tuya: ahora mueven las ' + (game.turn() === 'w' ? 'blancas.' : 'negras.');
  const target = game.get(to);
  if (target && target.color === piece.color) return 'No puedes mover a una casilla ocupada por una de tus propias piezas.';

  if (piece.type === 'p') {
    // Un peón que "parece" poder mover pero deja al rey en jaque cae aquí también: la regla del jaque manda.
    const message = explainPawn(game, from, to, piece);
    return message;
  }
  if (!geometryOk(piece.type, from, to)) return RULES[piece.type];

  // La geometría es correcta: algo lo impide.
  if (piece.type === 'k') {
    const enemy = piece.color === 'w' ? 'b' : 'w';
    if (game.isAttacked(to, enemy)) return 'Esa casilla está atacada por una pieza rival: el rey no puede moverse a una casilla donde le dieran jaque.';
  }
  if (['b', 'r', 'q'].includes(piece.type)) {
    const blocker = between(from, to).find((sq) => game.get(sq));
    if (blocker) return `Hay una pieza en el camino (${blocker}): ${pieceEs(piece.type)} no puede saltar sobre otras. Solo el caballo salta.`;
  }
  return 'Esa jugada dejaría a tu rey en jaque, y eso no está permitido.';
}

const STALEMATE_MESSAGE =
  '¡Cuidado, eso es ahogado! El rey negro no está en jaque pero no tiene ninguna jugada legal, y la partida termina en tablas. Busca el jaque mate.';

/** Texto de una jugada: "El caballo saltó de g1 a f3 y capturó un peón." */
export function describeMoveEs(move) {
  const flags = move.flags ?? ''; // el historial de una partida no guarda flags: se describe sin enroque/al paso
  const verb = move.piece === 'n' ? 'saltó' : 'se movió';
  let text = `${cap(pieceEs(move.piece))} ${verb} de ${move.from} a ${move.to}`;
  if (flags.includes('k')) text = 'El rey enrocó corto y la torre saltó a su lado';
  else if (flags.includes('q')) text = 'El rey enrocó largo y la torre saltó a su lado';
  if (flags.includes('e')) text += ' y capturó al paso';
  else if (move.captured) text += ` y capturó ${move.captured === 'p' ? 'un peón' : pieceEs(move.captured)}`;
  if (move.promotion) text += ` y se coronó a ${PIECE_NAME[move.promotion]}`;
  return `${text}.`;
}

/**
 * Evalúa una jugada legal contra el objetivo del ejercicio.
 * → { legal, fen, move, success, message }
 */
export function evaluateMove(step, fen, { from, to, promotion }) {
  const game = new Chess(fen);
  let move;
  try {
    move = game.move({ from, to, promotion });
  } catch {
    return { legal: false };
  }
  const goal = step.goal;
  let success;
  switch (goal.type) {
    case 'any': success = true; break;
    case 'targets': success = goal.squares.includes(move.to); break;
    case 'moves': success = goal.moves.includes(`${move.from}${move.to}`); break;
    case 'promote': success = !!move.promotion; break;
    case 'check': success = game.inCheck(); break;
    case 'mate': success = game.isCheckmate(); break;
    default: success = false;
  }
  let message;
  if (success) {
    const extra = typeof step.success === 'function' ? step.success(move) : step.success;
    message = `${describeMoveEs(move)} ${extra ?? ''}`.trim();
  } else if (goal.type === 'mate' && game.isStalemate()) {
    message = step.stalemate ?? STALEMATE_MESSAGE;
  } else if (goal.type === 'mate' && game.inCheck()) {
    message = 'Es jaque, pero el rey negro todavía puede escapar. Busca una jugada tras la cual no tenga salida.';
  } else {
    message = `Esa jugada es legal, pero no es lo que pide el ejercicio. ${step.wrong ?? step.prompt}`;
  }
  return { legal: true, fen: game.fen(), move, success, message };
}

/** Casillas a resaltar como pista, según el tipo de objetivo. */
export function hintSquares(step) {
  const goal = step.goal;
  const origin = step.selectable?.[0];
  if (goal.type === 'moves') {
    const [first] = goal.moves;
    return [first.slice(0, 2), first.slice(2, 4)];
  }
  if (goal.type === 'targets') return [...(origin ? [origin] : []), ...goal.squares];
  return origin ? [origin] : [];
}

/** Flechas de demostración desde `square` a cada destino legal (el tablero dibuja la "L" del caballo). */
export function demoArrows(fen, square) {
  const game = new Chess(fen);
  if (game.get(square)?.type !== 'n') return [];
  return game.moves({ square, verbose: true }).map((m) => ({ from: m.from, to: m.to }));
}
