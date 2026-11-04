// Lógica de tablero pura (sin React): análisis de FEN, identidad de piezas para animarlas,
// posiciones por jugada y material capturado. El servidor sigue siendo la autoridad de las reglas;
// aquí solo se usa chess.js para ayudar a la interfaz (jugadas legales, historial).
import { Chess } from 'chess.js';
import { msg, t } from '../i18n/core.js';
import { FILES, fileOf, parseFen, rankOf, squareName } from './fen.js';

// Las utilidades de FEN viven en fen.js (sin chess.js) para que el listado de salas no cargue el motor de reglas.
export { FILES, fileOf, parseFen, rankOf, squareName };
export { PIECE_NAME } from './pieceSet.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

let nextPieceId = 1;
const distance = (a, b) => Math.hypot(fileOf(a) - fileOf(b), rankOf(a) - rankOf(b));

/**
 * Da a cada pieza de la nueva posición el `id` de la pieza anterior que "es" la misma, para que
 * React la mueva (y la animación CSS la deslice) en lugar de destruirla y crearla.
 *  1. Lo que no se movió conserva su id.
 *  2. La pieza de `lastMove` arrastra su id de origen a destino (también al coronar).
 *  3. El resto (la torre al enrocar, saltos de historial) se empareja con la más cercana del mismo tipo.
 * `fresh` reparte ids nuevos (reinicio de partida: sin deslizamiento masivo).
 */
export function reconcile(prev, board, lastMove, fresh = false) {
  if (fresh) return board.map((cell) => ({ ...cell, id: nextPieceId++ }));

  const prevBySquare = new Map(prev.map((p) => [p.square, p]));
  const taken = new Set();
  const result = [];
  let pending = [];

  for (const cell of board) {
    const old = prevBySquare.get(cell.square);
    if (old && old.type === cell.type && old.color === cell.color) {
      result.push({ ...cell, id: old.id });
      taken.add(old.id);
    } else {
      pending.push(cell);
    }
  }

  if (lastMove) {
    pending = pending.filter((cell) => {
      if (cell.square !== lastMove.to) return true;
      const mover = prev.find((p) => p.square === lastMove.from && p.color === cell.color && !taken.has(p.id));
      if (!mover) return true;
      taken.add(mover.id);
      result.push({ ...cell, id: mover.id });
      return false;
    });
  }

  for (const cell of pending) {
    const candidates = prev
      .filter((p) => !taken.has(p.id) && p.type === cell.type && p.color === cell.color)
      .sort((a, b) => distance(a.square, cell.square) - distance(b.square, cell.square));
    const match = candidates[0];
    if (match) taken.add(match.id);
    result.push({ ...cell, id: match ? match.id : nextPieceId++ });
  }
  return result;
}

/** FEN tras `ply` jugadas (0 = posición inicial) repitiendo la partida con chess.js. */
export function positionAt(moves, ply) {
  const game = new Chess();
  for (let i = 0; i < Math.min(ply, moves.length); i++) {
    const { from, to, promotion } = moves[i];
    game.move({ from, to, promotion: promotion ?? undefined });
  }
  return game.fen();
}

/** Piezas capturadas por cada bando (tipos, de mayor a menor valor) y ventaja de material. */
export function capturedBy(moves) {
  const byColor = { w: [], b: [] };
  for (const m of moves) if (m.captured) byColor[m.color].push(m.captured);
  const order = (list) => list.sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
  const total = (list) => list.reduce((n, t) => n + PIECE_VALUE[t], 0);
  const diff = total(byColor.w) - total(byColor.b);
  return { w: order(byColor.w), b: order(byColor.b), diff };
}

/** Jugadas legales desde `square` en la posición `fen` (verbose de chess.js). */
export function legalMovesFrom(fen, square) {
  try {
    return new Chess(fen).moves({ square, verbose: true });
  } catch {
    return [];
  }
}

export function kingSquare(fen, color) {
  return parseFen(fen).find((p) => p.type === 'k' && p.color === color)?.square ?? null;
}

const REASONS = {
  checkmate: () => t('Jaque mate'),
  stalemate: () => t('Ahogado: el rey no tiene jugadas legales'),
  insufficient: () => t('Material insuficiente para dar mate'),
  threefold: () => t('Triple repetición de la posición'),
  'fifty-moves': () => t('Regla de los 50 movimientos'),
  agreement: () => t('Tablas por acuerdo'),
  resignation: ({ loser }) => t('{loser} se rindió', { loser }),
  timeout: ({ loser }) => t('Se acabó el tiempo de {loser}', { loser }),
  'timeout-insufficient': () => t('Se acabó el tiempo, pero el rival no puede dar mate'),
  abandonment: ({ loser }) => t('{loser} abandonó la partida', { loser }),
};

/**
 * Texto del final de la partida visto por `myColor` (null = espectador).
 * Devuelve { tone: 'win'|'loss'|'draw'|'neutral', title, reason }.
 */
export function describeResult(result, players, myColor) {
  if (!result) return null;
  const { winner, reason } = result;
  const loserColor = winner === 'w' ? 'b' : winner === 'b' ? 'w' : null;
  const loser = loserColor ? players[loserColor]?.name ?? t('Tu rival') : null;
  const reasonText = (REASONS[reason] ?? (() => t('Fin de la partida')))({ loser });

  if (winner === null) return { tone: 'draw', title: t('Tablas'), reason: reasonText };
  if (myColor) {
    return winner === myColor
      ? { tone: 'win', title: t('¡Victoria!'), reason: reasonText }
      : { tone: 'loss', title: t('Derrota'), reason: reasonText };
  }
  return { tone: 'neutral', title: winner === 'w' ? t('Ganan las blancas') : t('Ganan las negras'), reason: reasonText };
}
