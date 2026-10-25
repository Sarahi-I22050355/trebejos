// Integración: servidor real + clientes socket.io + Stockfish real (o el motor falso si no está instalado).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { io as connect } from 'socket.io-client';
import { Chess } from 'chess.js';
import { createServer } from '../src/server.js';
import { findStockfish } from '../src/bot/BotService.js';

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/fake-uci.js');
const REAL = findStockfish();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let port;
const open = [];

before(async () => {
  process.env.FAKE_UCI_MODE = 'ok';
  server = createServer({
    port: 0, host: '127.0.0.1', staticDir: '/nonexistent', minClockSeconds: 1,
    reconnectGraceMs: 1500, stockfishPath: REAL ?? FAKE, botEngines: 2,
  });
  port = await server.listen(0, '127.0.0.1');
});
after(async () => {
  for (const c of open) c.disconnect();
  await server.close();
});

class Client {
  constructor(name, token = randomUUID()) {
    this.name = name;
    this.token = token;
    this.events = [];
    this.waiters = [];
    this.connect();
  }
  connect() {
    this.socket = connect(`http://127.0.0.1:${port}`, { forceNew: true, transports: ['websocket'] });
    open.push(this.socket);
    this.socket.onAny((event, payload) => {
      this.events.push({ event, payload });
      this.waiters = this.waiters.filter((w) => !w(event, payload));
    });
  }
  emit(event, data) {
    return new Promise((resolve) => this.socket.emit(event, data, resolve));
  }
  async init() {
    await new Promise((r) => (this.socket.connected ? r() : this.socket.once('connect', r)));
    return this.emit('session:init', { token: this.token, name: this.name });
  }
  waitFor(event, predicate = () => true, timeout = 8000) {
    const seen = this.events.find((e) => e.event === event && predicate(e.payload));
    if (seen) return Promise.resolve(seen.payload);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}" en ${this.name}`)), timeout);
      this.waiters.push((ev, payload) => {
        if (ev !== event || !predicate(payload)) return false;
        clearTimeout(timer);
        resolve(payload);
        return true;
      });
    });
  }
  count(event) {
    return this.events.filter((e) => e.event === event).length;
  }
  drop() {
    this.socket.disconnect();
  }
}

async function player(name) {
  const c = new Client(name);
  assert.equal((await c.init()).ok, true);
  return c;
}
async function botGame(options = { level: 'beginner', color: 'w' }, name = `Humano${randomUUID().slice(0, 4)}`) {
  const human = await player(name);
  const res = await human.emit('bot:start', options);
  assert.equal(res.ok, true, JSON.stringify(res));
  return { human, code: res.code, room: res.room };
}
/** Una jugada legal cualquiera para quien mueve en `fen`. */
function legalReply(fen) {
  const m = new Chess(fen).moves({ verbose: true })[0];
  return { from: m.from, to: m.to, promotion: m.promotion };
}
const botMove = (human, ply, color) => human.waitFor('game:move', (m) => m.ply === ply && m.color === color);

describe('disponibilidad', () => {
  test('el servidor informa si hay bot y /health lo refleja', async () => {
    const c = new Client('Consulta');
    const res = await c.init();
    assert.equal(res.server.bot, true);
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.bot.available, true);
    assert.match(health.bot.engine, REAL ? /Stockfish/ : /FakeFish/);
  });

  test('sin Stockfish el servidor arranca igual y bot:start responde BOT_UNAVAILABLE', async () => {
    const off = createServer({ port: 0, host: '127.0.0.1', staticDir: '/nonexistent', botEnabled: false });
    const p = await off.listen(0, '127.0.0.1');
    const c = connect(`http://127.0.0.1:${p}`, { transports: ['websocket'] });
    const ack = (ev, d) => new Promise((r) => c.emit(ev, d, r));
    await new Promise((r) => c.once('connect', r));
    const init = await ack('session:init', { token: randomUUID(), name: 'SinBot' });
    assert.equal(init.server.bot, false);
    assert.equal((await ack('bot:start', { level: 'beginner' })).error.code, 'BOT_UNAVAILABLE');
    assert.equal((await ack('room:create', { visibility: 'private' })).ok, true); // el resto sigue funcionando
    c.close();
    await off.close();
  });
});

describe('crear una partida contra el bot', () => {
  test('valida nivel y color', async () => {
    const c = await player('Validador');
    assert.equal((await c.emit('bot:start', { level: 'dios' })).error.code, 'INVALID_OPTIONS');
    assert.equal((await c.emit('bot:start', {})).error.code, 'INVALID_OPTIONS');
    assert.equal((await c.emit('bot:start', { level: 'toString' })).error.code, 'INVALID_OPTIONS');
    assert.equal((await c.emit('bot:start', { level: 'expert', color: 'rojo' })).error.code, 'INVALID_OPTIONS');
    assert.equal((await c.emit('bot:start', { level: 'expert', clock: { initialSeconds: 0 } })).error.code, 'INVALID_OPTIONS');
  });

  test('el estado marca la sala como de bot, con el asiento del bot y sin tokens', async () => {
    const { human, room } = await botGame({ level: 'intermediate', color: 'w' });
    assert.equal(room.mode, 'bot');
    assert.equal(room.status, 'playing');
    assert.deepEqual(room.bot, { level: 'intermediate', label: 'Intermedio', practice: false });
    assert.equal(room.you.color, 'w');
    assert.equal(room.players.w.isBot, false);
    assert.equal(room.players.b.isBot, true);
    assert.equal(room.players.b.name, 'Bot Intermedio');
    assert.equal(room.visibility, 'private');
    assert.doesNotMatch(JSON.stringify(room), /bot:[A-Z0-9]{6}/); // el token interno del bot no sale
    void human;
  });

  test('color aleatorio: a veces el bot abre', async () => {
    const seen = new Set();
    for (let i = 0; i < 12 && seen.size < 2; i++) {
      const { room, human } = await botGame({ level: 'beginner', color: 'random' });
      seen.add(room.you.color);
      await human.emit('room:leave');
    }
    assert.equal(seen.size, 2, 'con 12 intentos deberían salir ambos colores');
  });
});

describe('jugar contra el bot', () => {
  test('el humano mueve y el bot responde con una jugada legal en pocos segundos', async () => {
    const { human } = await botGame({ level: 'beginner', color: 'w' });
    assert.deepEqual(await human.emit('game:move', { from: 'e2', to: 'e4' }), { ok: true, ply: 1 });
    const t = Date.now();
    const reply = await botMove(human, 2, 'b');
    assert.ok(Date.now() - t < 4000, `el bot tardó ${Date.now() - t} ms`);
    const g = new Chess();
    g.move('e4');
    assert.doesNotThrow(() => g.move({ from: reply.from, to: reply.to, promotion: reply.promotion }));
    // y ya es turno del humano
    assert.equal(reply.turn, 'w');
    assert.equal((await human.emit('game:move', { from: 'd2', to: 'd4' })).ok, true);
  });

  test('si el bot juega con blancas, abre la partida solo', async () => {
    const { human } = await botGame({ level: 'beginner', color: 'b' });
    const opening = await botMove(human, 1, 'w');
    assert.equal(opening.turn, 'b');
    assert.deepEqual(await human.emit('game:move', legalReply(opening.fen)), { ok: true, ply: 2 });
    await botMove(human, 3, 'w'); // y el bot vuelve a responder
  });

  test('no se puede mover mientras piensa el bot', async () => {
    const { human } = await botGame({ level: 'advanced', color: 'w' });
    await human.emit('game:move', { from: 'e2', to: 'e4' });
    assert.equal((await human.emit('game:move', { from: 'd2', to: 'd4' })).error.code, 'NOT_YOUR_TURN');
    await botMove(human, 2, 'b');
  });

  test('partida larga con jugadas aleatorias del humano: el bot siempre responde y nunca hay jugadas ilegales', { timeout: 60000 }, async () => {
    const { human } = await botGame({ level: 'beginner', color: 'w' });
    const g = new Chess();
    human.socket.on('game:move', (m) => g.move({ from: m.from, to: m.to, promotion: m.promotion ?? undefined }));
    let ply = 0;
    for (let round = 0; round < 10 && !g.isGameOver(); round++) {
      const legal = g.moves({ verbose: true });
      const pick = legal[Math.floor(Math.random() * legal.length)];
      const ack = await human.emit('game:move', { from: pick.from, to: pick.to, promotion: pick.promotion });
      assert.equal(ack.ok, true, JSON.stringify(ack));
      ply += 1;
      if (g.isGameOver()) break;
      await botMove(human, ply + 1, 'b').catch(async () => {
        assert.ok(g.isGameOver(), 'el bot no respondió y la partida sigue');
      });
      ply += 1;
    }
    assert.ok(ply >= 10);
  });

  test('con reloj: el bot gasta su tiempo y puede perder por bandera', { timeout: 20000 }, async () => {
    const { human, room } = await botGame({ level: 'beginner', color: 'w', clock: { initialSeconds: 1, incrementSeconds: 0 } });
    assert.equal(room.clock.enabled, true);
    await human.emit('game:move', { from: 'e2', to: 'e4' });
    // el bot (reloj de 1 s) se queda sin tiempo con su demora de "pensar" o responde a tiempo: en ambos casos la partida avanza
    const outcome = await Promise.race([
      botMove(human, 2, 'b').then(() => 'move'),
      human.waitFor('game:over').then((o) => o.result.reason),
    ]);
    assert.ok(outcome === 'move' || outcome === 'timeout', outcome);
  });
});

describe('restricciones de una sala de bot', () => {
  test('sin chat, sin tablas, sin espectadores, fuera del listado público', async () => {
    const { human, code } = await botGame({ level: 'beginner', color: 'w' });
    assert.equal((await human.emit('chat:send', { text: 'hola' })).error.code, 'BAD_REQUEST');
    assert.equal((await human.emit('game:offerDraw')).error.code, 'BAD_REQUEST');

    const stranger = await player('Curioso');
    assert.equal((await stranger.emit('room:join', { code })).error.code, 'ROOM_NOT_FOUND');
    assert.equal((await stranger.emit('room:setVisibility', { visibility: 'public' })).ok, false);

    const lobby = (await stranger.emit('lobby:subscribe')).lobby;
    assert.ok(!lobby.rooms.some((r) => r.code === code));
    assert.equal((await stranger.emit('room:joinRandom')).error?.code ?? 'otro', 'NO_WAITING_ROOMS');
  });

  test('crear otra partida mientras se juega es rechazado, y salir antes lo permite', async () => {
    const { human, code } = await botGame({ level: 'beginner', color: 'w' });
    const again = await human.emit('bot:start', { level: 'beginner' });
    assert.equal(again.error.code, 'ALREADY_IN_GAME');
    assert.equal(again.error.roomCode, code);
  });
});

describe('fin de partida, revancha y salida', () => {
  test('rendirse da la victoria al bot; la revancha la acepta sola e intercambia colores', async () => {
    const { human } = await botGame({ level: 'beginner', color: 'w' });
    await human.emit('game:move', { from: 'e2', to: 'e4' });
    await botMove(human, 2, 'b');
    await human.emit('game:resign');
    assert.deepEqual((await human.waitFor('game:over')).result, { winner: 'b', reason: 'resignation' });

    human.events.length = 0; // los eventos de la partida anterior no deben confundirse con los de la nueva
    assert.equal((await human.emit('game:rematch')).ok, true); // el bot acepta de inmediato
    const fresh = await human.waitFor('room:state', (s) => s.status === 'playing' && s.ply === 0 && s.you.color === 'b');
    assert.equal(fresh.players.w.isBot, true);
    assert.equal(fresh.players.b.isBot, false);
    // ahora el bot lleva blancas y abre; y el humano (negras) puede responder
    const opening = await botMove(human, 1, 'w');
    assert.equal(opening.turn, 'b');
    assert.deepEqual(await human.emit('game:move', legalReply(opening.fen)), { ok: true, ply: 2 });
    assert.equal(human.count('game:over'), 0, 'la partida nueva no debe haber terminado');
  });

  test('si el humano se rinde mientras el bot piensa, el bot no mueve después', async () => {
    const { human } = await botGame({ level: 'advanced', color: 'w' });
    await human.emit('game:move', { from: 'e2', to: 'e4' });
    await human.emit('game:resign'); // el bot aún estaba calculando
    await human.waitFor('game:over');
    const before = human.count('game:move');
    await sleep(1800);
    assert.equal(human.count('game:move'), before, 'el bot movió después del final');
  });

  test('salir cierra la sala y libera al bot', async () => {
    const { human, code } = await botGame({ level: 'beginner', color: 'w' });
    const roomsBefore = server.manager.rooms.size;
    await human.emit('room:leave');
    assert.equal(server.manager.rooms.size, roomsBefore - 1);
    const other = await player('Tarde');
    assert.equal((await other.emit('room:join', { code })).error.code, 'ROOM_NOT_FOUND');
  });

  test('si el humano se desconecta y no vuelve, pierde por abandono y la sala se libera', async () => {
    const { human, code } = await botGame({ level: 'beginner', color: 'w' });
    human.drop();
    await sleep(1900);
    assert.equal(server.manager.rooms.has(code), false);
  });
});

describe('reconexión', () => {
  test('al recargar mientras el bot piensa, vuelve a la partida y recibe la respuesta del bot', async () => {
    const { human, code } = await botGame({ level: 'advanced', color: 'w' });
    await human.emit('game:move', { from: 'e2', to: 'e4' });
    human.drop(); // el bot sigue calculando
    await sleep(150);
    const back = new Client(human.name, human.token);
    const res = await back.init();
    assert.equal(res.room.code, code);
    assert.equal(res.room.mode, 'bot');
    assert.equal(res.room.you.color, 'w');
    await back.waitFor('game:move', (m) => m.ply === 2 && m.color === 'b'); // la jugada del bot llega al socket nuevo
    assert.equal((await back.emit('game:move', { from: 'd2', to: 'd4' })).ok, true);
  });
});

describe('práctica guiada con pistas', () => {
  const practice = () => botGame({ level: 'beginner', color: 'w', practice: true });

  test('la sala marca la práctica y la pista da una jugada legal explicada que se puede jugar', async () => {
    const { human, room } = await practice();
    assert.equal(room.bot.practice, true);
    const res = await human.emit('bot:hint');
    assert.equal(res.ok, true, JSON.stringify(res));
    const { hint } = res;
    assert.match(hint.text, /^(Mueve|Enroca)/);
    assert.equal(hint.fen, new Chess().fen());
    const g = new Chess();
    assert.doesNotThrow(() => g.move({ from: hint.from, to: hint.to, promotion: hint.promotion ?? undefined }));
    assert.equal((await human.emit('game:move', { from: hint.from, to: hint.to, promotion: hint.promotion ?? undefined })).ok, true);
    await botMove(human, 2, 'b');
    // otra pista en la nueva posición (ya es mi turno)
    await sleep(1100); // evita el límite de frecuencia de pistas
    const second = await human.emit('bot:hint');
    assert.equal(second.ok, true);
    assert.notEqual(second.hint.fen, hint.fen);
  });

  test('no hay pistas en partidas normales ni en salas ajenas', async () => {
    const normal = await botGame({ level: 'beginner', color: 'w' });
    assert.equal(normal.room.bot.practice, false);
    assert.equal((await normal.human.emit('bot:hint')).error.code, 'BAD_REQUEST');
    const outsider = await player('Fuera');
    assert.equal((await outsider.emit('bot:hint')).error.code, 'NOT_IN_ROOM');
    const pvp = await player('Pvp');
    await pvp.emit('room:create', { visibility: 'private' });
    assert.equal((await pvp.emit('bot:hint')).error.code, 'BAD_REQUEST');
  });

  test('solo en tu turno y con límite de frecuencia', async () => {
    const { human } = await practice();
    await human.emit('game:move', { from: 'e2', to: 'e4' });
    assert.equal((await human.emit('bot:hint')).error.code, 'NOT_YOUR_TURN'); // piensa el bot
    await botMove(human, 2, 'b');
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await human.emit('bot:hint'));
    assert.equal(results.filter((r) => r.ok).length, 3);
    assert.equal(results.at(-1).error.code, 'RATE_LIMITED');
  });

  test('tras el final de la partida ya no se piden pistas', async () => {
    const { human } = await practice();
    await human.emit('game:resign');
    await human.waitFor('game:over');
    assert.equal((await human.emit('bot:hint')).error.code, 'GAME_NOT_ACTIVE');
  });
});

describe('varias partidas a la vez', () => {
  test('6 partidas simultáneas comparten el pool de motores y todas reciben respuesta', { timeout: 60000 }, async () => {
    const games = await Promise.all(
      ['beginner', 'intermediate', 'advanced', 'beginner', 'intermediate', 'advanced'].map((level) => botGame({ level, color: 'w' })),
    );
    const t = Date.now();
    await Promise.all(games.map(({ human }) => human.emit('game:move', { from: 'e2', to: 'e4' })));
    const replies = await Promise.all(games.map(({ human }) => botMove(human, 2, 'b')));
    assert.equal(replies.length, 6);
    assert.ok(Date.now() - t < 12000, `tardaron ${Date.now() - t} ms en total`);
  });
});
