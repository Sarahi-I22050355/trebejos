import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { START_FEN, parseFen, reconcile, positionAt, capturedBy, legalMovesFrom, kingSquare, describeResult } from './board.js';

const fresh = () => reconcile([], parseFen(START_FEN), null);
const byId = (pieces) => new Map(pieces.map((p) => [p.id, p]));

/** Juega `moves` ("e2e4"…) y devuelve cada piezas-con-id tras cada jugada. */
function play(...moves) {
  const game = new Chess();
  let pieces = fresh();
  const history = [pieces];
  for (const m of moves) {
    const move = game.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    pieces = reconcile(pieces, parseFen(game.fen()), { from: move.from, to: move.to });
    history.push(pieces);
  }
  return { pieces, history, game };
}

test('parseFen lee la posición inicial', () => {
  const pieces = parseFen(START_FEN);
  assert.equal(pieces.length, 32);
  assert.deepEqual(pieces.find((p) => p.square === 'e1'), { square: 'e1', type: 'k', color: 'w' });
  assert.deepEqual(pieces.find((p) => p.square === 'd8'), { square: 'd8', type: 'q', color: 'b' });
});

test('una jugada normal conserva el id de la pieza que se movió', () => {
  const { history } = play('e2e4');
  const before = byId(history[0]);
  const after = history[1];
  const pawn = after.find((p) => p.square === 'e4');
  assert.equal(before.get(pawn.id).square, 'e2'); // misma pieza, otra casilla
  assert.equal(after.length, 32);
  assert.equal(new Set(after.map((p) => p.id)).size, 32); // ids únicos
});

test('captura: la pieza capturada desaparece y la que captura conserva su id', () => {
  const { history } = play('e2e4', 'd7d5', 'e4d5');
  const last = history.at(-1);
  assert.equal(last.length, 31);
  const capturer = last.find((p) => p.square === 'd5');
  assert.equal(byId(history[2]).get(capturer.id).square, 'e4');
});

test('enroque: el rey y la torre conservan sus ids', () => {
  const { history } = play('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1');
  const before = byId(history.at(-2));
  const after = history.at(-1);
  const king = after.find((p) => p.square === 'g1');
  const rook = after.find((p) => p.square === 'f1');
  assert.equal(before.get(king.id).square, 'e1');
  assert.equal(before.get(rook.id).square, 'h1');
});

test('captura al paso: el peón capturado se retira', () => {
  const { history } = play('e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
  const last = history.at(-1);
  assert.equal(last.length, 31);
  assert.ok(!last.some((p) => p.square === 'd5'));
  assert.equal(byId(history.at(-2)).get(last.find((p) => p.square === 'd6').id).square, 'e5');
});

test('coronación: el peón arrastra su id aunque cambie de tipo', () => {
  const game = new Chess('7k/P7/8/8/8/8/8/K7 w - - 0 1');
  const prev = reconcile([], parseFen(game.fen()), null);
  const pawnId = prev.find((p) => p.square === 'a7').id;
  game.move({ from: 'a7', to: 'a8', promotion: 'q' });
  const next = reconcile(prev, parseFen(game.fen()), { from: 'a7', to: 'a8' });
  const queen = next.find((p) => p.square === 'a8');
  assert.equal(queen.type, 'q');
  assert.equal(queen.id, pawnId);
});

test('reinicio (fresh) reparte ids nuevos', () => {
  const a = fresh();
  const b = reconcile(a, parseFen(START_FEN), null, true);
  assert.equal(new Set([...a, ...b].map((p) => p.id)).size, 64);
});

test('positionAt reconstruye cualquier jugada del historial', () => {
  const moves = [
    { from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' }, { from: 'g1', to: 'f3' },
  ];
  assert.equal(positionAt(moves, 0), START_FEN);
  assert.match(positionAt(moves, 2), /^rnbqkbnr\/pppp1ppp\/8\/4p3\/4P3\/8\/PPPP1PPP\/RNBQKBNR w/);
  assert.equal(positionAt(moves, 99), positionAt(moves, 3));
});

test('material capturado y ventaja', () => {
  const moves = [
    { color: 'w', captured: 'p' }, { color: 'b', captured: 'n' },
    { color: 'w', captured: 'q' }, { color: 'b', captured: null }, { color: 'w', captured: 'p' },
  ];
  const c = capturedBy(moves);
  assert.deepEqual(c.w, ['q', 'p', 'p']);
  assert.deepEqual(c.b, ['n']);
  assert.equal(c.diff, 11 - 3);
});

test('jugadas legales, rey en jaque y textos de resultado', () => {
  assert.deepEqual(legalMovesFrom(START_FEN, 'g1').map((m) => m.to).sort(), ['f3', 'h3']);
  assert.deepEqual(legalMovesFrom(START_FEN, 'e5'), []);
  assert.equal(kingSquare(START_FEN, 'b'), 'e8');

  const players = { w: { name: 'Ana' }, b: { name: 'Beto' } };
  assert.equal(describeResult({ winner: 'w', reason: 'checkmate' }, players, 'w').title, '¡Victoria!');
  assert.equal(describeResult({ winner: 'w', reason: 'checkmate' }, players, 'b').tone, 'loss');
  assert.equal(describeResult({ winner: 'w', reason: 'checkmate' }, players, null).title, 'Ganan las blancas');
  assert.equal(describeResult({ winner: null, reason: 'stalemate' }, players, 'b').tone, 'draw');
  assert.equal(describeResult({ winner: 'b', reason: 'resignation' }, players, 'b').reason, 'Ana se rindió');
  assert.match(describeResult({ winner: 'w', reason: 'timeout' }, players, 'w').reason, /Beto/);
});
