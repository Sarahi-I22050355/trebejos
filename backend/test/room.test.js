import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Room, STATUS } from '../src/rooms/Room.js';

const W = { token: 'tok-white', name: 'Blancas' };
const B = { token: 'tok-black', name: 'Negras' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeRoom(opts = {}) {
  const events = [];
  const room = new Room({
    code: 'ABC234',
    visibility: 'public',
    notify: (type, payload) => events.push({ type, payload }),
    ...opts,
  });
  room.hostToken = W.token;
  room.addPlayer('w', W);
  room.addPlayer('b', B);
  room.startGame();
  return { room, events };
}

/** Juega una lista de jugadas "e2e4" alternando jugadores según el turno. */
function play(room, ...moves) {
  let last;
  for (const m of moves) {
    const who = room.game.turn() === 'w' ? W : B;
    last = room.move(who.token, { from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  }
  return last;
}

const rejects = (fn, code) =>
  assert.throws(fn, (err) => {
    assert.equal(err.code, code);
    return true;
  });

describe('reglas de ajedrez', () => {
  test('mate del loco: gana negro por jaque mate', () => {
    const { room, events } = makeRoom();
    play(room, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    assert.equal(room.status, STATUS.FINISHED);
    assert.deepEqual(room.result, { winner: 'b', reason: 'checkmate' });
    assert.ok(events.some((e) => e.type === 'over'));
    rejects(() => play(room, 'a2a3'), 'GAME_OVER');
  });

  test('rechaza turno equivocado, intrusos y jugadas ilegales', () => {
    const { room } = makeRoom();
    rejects(() => room.move(B.token, { from: 'e7', to: 'e5' }), 'NOT_YOUR_TURN');
    rejects(() => room.move('intruso', { from: 'e2', to: 'e4' }), 'NOT_PLAYER');
    rejects(() => room.move(W.token, { from: 'e2', to: 'e5' }), 'ILLEGAL_MOVE');
    rejects(() => room.move(W.token, { from: 'e9', to: 'e4' }), 'ILLEGAL_MOVE');
    rejects(() => room.move(W.token, {}), 'ILLEGAL_MOVE');
    rejects(() => room.move(W.token, { from: 'e2', to: 'e4', promotion: 'k' }), 'ILLEGAL_MOVE');
    assert.equal(room.moves.length, 0);
  });

  test('enroque corto', () => {
    const { room } = makeRoom();
    const m = play(room, 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1');
    assert.equal(m.san, 'O-O');
    assert.equal(room.game.get('g1').type, 'k');
    assert.equal(room.game.get('f1').type, 'r');
  });

  test('captura al paso', () => {
    const { room } = makeRoom();
    const m = play(room, 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
    assert.equal(m.captured, 'p');
    assert.ok(!room.game.get('d5')); // el peón capturado desaparece
  });

  test('promoción: exige pieza y la aplica', () => {
    const { room } = makeRoom({ startFen: '7k/P7/8/8/8/8/8/K7 w - - 0 1' });
    rejects(() => room.move(W.token, { from: 'a7', to: 'a8' }), 'ILLEGAL_MOVE');
    const m = room.move(W.token, { from: 'a7', to: 'a8', promotion: 'q' });
    assert.equal(m.promotion, 'q');
    assert.equal(room.game.get('a8').type, 'q');
  });

  test('ahogado (stalemate) = tablas', () => {
    const { room } = makeRoom();
    play(room, 'e2e3', 'a7a5', 'd1h5', 'a8a6', 'h5a5', 'h7h5', 'h2h4', 'a6h6', 'a5c7', 'f7f6', 'c7d7', 'e8f7', 'd7b7', 'd8d3', 'b7b8', 'd3h7', 'b8c8', 'f7g6', 'c8e6');
    assert.deepEqual(room.result, { winner: null, reason: 'stalemate' });
  });

  test('triple repetición = tablas', () => {
    const { room } = makeRoom();
    play(room, 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
    assert.deepEqual(room.result, { winner: null, reason: 'threefold' });
  });

  test('regla de los 50 movimientos = tablas', () => {
    const { room } = makeRoom({ startFen: '4k3/8/8/8/8/8/8/R3K3 w - - 99 80' });
    play(room, 'a1a2');
    assert.deepEqual(room.result, { winner: null, reason: 'fifty-moves' });
  });

  test('material insuficiente = tablas', () => {
    const { room } = makeRoom({ startFen: '7k/8/8/8/8/8/1r6/K7 w - - 0 1' });
    play(room, 'a1b2');
    assert.deepEqual(room.result, { winner: null, reason: 'insufficient' });
  });

  test('el payload de la jugada trae jaque y FEN', () => {
    const { room } = makeRoom();
    const m = play(room, 'e2e4', 'f7f6', 'd1h5', 'g7g6', 'h5g6');
    assert.equal(m.inCheck, true);
    assert.equal(m.san, 'Qxg6+');
    assert.equal(m.turn, 'b');
    assert.equal(m.fen, room.game.fen());
  });
});

describe('rendición, tablas y revancha', () => {
  test('rendirse da la victoria al rival', () => {
    const { room } = makeRoom();
    room.resign(W.token);
    assert.deepEqual(room.result, { winner: 'b', reason: 'resignation' });
    rejects(() => room.resign(B.token), 'GAME_NOT_ACTIVE');
  });

  test('oferta de tablas: aceptar, rechazar y ofertas cruzadas', () => {
    let { room } = makeRoom();
    room.offerDraw(W.token);
    assert.equal(room.drawOffer, 'w');
    rejects(() => room.offerDraw(W.token), 'BAD_REQUEST');
    rejects(() => room.respondDraw(W.token, true), 'BAD_REQUEST'); // no puedes aceptar la tuya
    room.respondDraw(B.token, false);
    assert.equal(room.drawOffer, null);
    assert.equal(room.status, STATUS.PLAYING);

    room.offerDraw(W.token);
    room.respondDraw(B.token, true);
    assert.deepEqual(room.result, { winner: null, reason: 'agreement' });

    ({ room } = makeRoom());
    room.offerDraw(W.token);
    room.offerDraw(B.token); // ambos quieren tablas
    assert.equal(room.result.reason, 'agreement');
  });

  test('mover ignora la oferta de tablas pendiente', () => {
    const { room } = makeRoom();
    room.offerDraw(B.token);
    play(room, 'e2e4');
    assert.equal(room.drawOffer, null);
  });

  test('revancha: ambos aceptan y se intercambian los colores', () => {
    const { room } = makeRoom();
    rejects(() => room.requestRematch(W.token), 'BAD_REQUEST'); // aún en curso
    room.resign(W.token);
    room.requestRematch(W.token);
    assert.equal(room.status, STATUS.FINISHED);
    assert.deepEqual([...room.rematch], ['w']);
    room.requestRematch(B.token);
    assert.equal(room.status, STATUS.PLAYING);
    assert.equal(room.players.w.token, B.token);
    assert.equal(room.players.b.token, W.token);
    assert.equal(room.moves.length, 0);
    assert.equal(room.result, null);
  });

  test('no hay revancha si el rival se fue', () => {
    const { room } = makeRoom();
    room.resign(W.token);
    room.players.b.left = true;
    rejects(() => room.requestRematch(W.token), 'REMATCH_UNAVAILABLE');
  });
});

describe('reloj', () => {
  test('la primera jugada no consume tiempo; luego hay incremento', () => {
    let t = 10_000;
    const { room } = makeRoom({ clock: { initialMs: 60_000, incrementMs: 2_000 }, now: () => t });
    assert.equal(room.clockSnapshot().running, null);

    t += 5_000; // las blancas piensan antes de su primera jugada: no cuenta
    play(room, 'e2e4');
    let c = room.clockSnapshot();
    assert.equal(c.wMs, 60_000);
    assert.equal(c.running, 'b');

    t += 3_000;
    play(room, 'e7e5'); // negras gastan 3s, +2s de incremento
    c = room.clockSnapshot();
    assert.equal(c.bMs, 59_000);
    assert.equal(c.running, 'w');

    t += 4_000;
    assert.equal(room.clockSnapshot().wMs, 56_000); // corre en vivo
    play(room, 'g1f3');
    assert.equal(room.clockSnapshot().wMs, 58_000);
    assert.equal(room.moves.at(-1).spentMs, 4_000);
  });

  test('se acaba el tiempo: gana el rival', async () => {
    const { room, events } = makeRoom({ clock: { initialMs: 120, incrementMs: 0 } });
    play(room, 'e2e4'); // empieza a correr el reloj de negras
    await sleep(250);
    assert.equal(room.status, STATUS.FINISHED);
    assert.deepEqual(room.result, { winner: 'w', reason: 'timeout' });
    assert.equal(room.clockSnapshot().bMs, 0);
    assert.ok(events.some((e) => e.type === 'over'));
  });

  test('tiempo agotado contra material insuficiente = tablas', async () => {
    const { room } = makeRoom({ clock: { initialMs: 120, incrementMs: 0 }, startFen: '7k/8/8/8/8/8/6K1/R7 b - - 0 1' });
    // Mueven negras (solo rey) y corre el reloj de las blancas. Cuando se les acaba, las negras ganarían
    // por tiempo, pero con solo el rey no pueden dar mate: la regla FIDE lo declara tablas.
    play(room, 'h8g8');
    await sleep(250);
    assert.deepEqual(room.result, { winner: null, reason: 'timeout-insufficient' });
  });

  test('sin reloj no hay timers ni reloj en el estado', () => {
    const { room } = makeRoom();
    play(room, 'e2e4');
    assert.deepEqual(room.clockSnapshot(), { enabled: false });
  });
});

describe('serialización', () => {
  test('el snapshot nunca expone tokens y personaliza `you`', () => {
    const { room } = makeRoom();
    room.addSpectator({ token: 'tok-spec', name: 'Mirón' });
    const forW = room.snapshot(W.token);
    assert.equal(forW.you.color, 'w');
    assert.equal(forW.you.isHost, true);
    assert.equal(room.snapshot('tok-spec').you.role, 'spectator');
    assert.equal(room.snapshot('desconocido').you.role, null);
    assert.doesNotMatch(JSON.stringify(forW), /tok-/);
    assert.equal(forW.spectators.count, 1);
  });

  test('el resumen de lobby marca tiempo bajo', () => {
    const { room } = makeRoom({ clock: { initialMs: 5_000, incrementMs: 0 } });
    assert.equal(room.lobbySummary(10_000).lowTime, true);
    assert.equal(room.lobbySummary(1_000).lowTime, false);
    assert.equal(room.lobbySummary(1_000).players.length, 2);
    room.dispose();
  });
});
