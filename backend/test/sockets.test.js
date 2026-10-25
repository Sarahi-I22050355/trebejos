// Pruebas de integración: servidor real + clientes socket.io reales.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io as connect } from 'socket.io-client';
import { createServer } from '../src/server.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let port;
const open = [];

before(async () => {
  server = createServer({
    port: 0,
    host: '127.0.0.1',
    reconnectGraceMs: 400,
    spectatorGraceMs: 200,
    lobbyThrottleMs: 50,
    lobbyHeartbeatMs: 60_000,
    staticDir: '/nonexistent',
    minClockSeconds: 1,
  });
  port = await server.listen(0, '127.0.0.1');
});

after(async () => {
  for (const c of open) c.disconnect();
  await server.close();
});

/** Cliente de prueba con ack como promesa y buffer de eventos recibidos. */
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

  /** Espera (o recupera, si ya llegó) un evento que cumpla `predicate`. */
  waitFor(event, predicate = () => true, timeout = 2000) {
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

  /** Cierra de golpe, sin avisar (como perder internet o cerrar la pestaña). */
  drop() {
    this.socket.disconnect();
  }
}

async function player(name) {
  const c = new Client(name);
  const res = await c.init();
  assert.equal(res.ok, true);
  return c;
}

/** Crea una sala y une a un segundo jugador. Devuelve { host, guest, code }. */
async function startedGame(options = { visibility: 'private', color: 'w' }) {
  const host = await player(`Host${randomUUID().slice(0, 4)}`);
  const created = await host.emit('room:create', options);
  assert.equal(created.ok, true, JSON.stringify(created));
  const guest = await player(`Guest${randomUUID().slice(0, 4)}`);
  const joined = await guest.emit('room:join', { code: created.code });
  assert.equal(joined.ok, true, JSON.stringify(joined));
  return { host, guest, code: created.code };
}

describe('sesión e identidad', () => {
  test('inicia sesión con nombre propio y sin nombre (aleatorio)', async () => {
    const a = new Client('CaballoVeloz42');
    const res = await a.init();
    assert.deepEqual({ ...res, server: undefined }, { ok: true, session: { name: 'CaballoVeloz42' }, room: null, server: undefined });
    assert.equal(typeof res.server.bot, 'boolean'); // el cliente sabe si hay bot disponible

    const b = new Client(undefined);
    const res2 = await b.init();
    assert.equal(res2.ok, true);
    assert.match(res2.session.name, /^[A-Za-z]+\d{2}$/);
  });

  test('rechaza tokens y nombres inválidos', async () => {
    const c = new Client('x', 'no-es-uuid');
    const bad = await c.init();
    assert.equal(bad.error.code, 'INVALID_TOKEN');

    for (const name of ['a', 'x'.repeat(21), '<script>', '   ', 'a'.repeat(5) + '‮' + 'b!']) {
      const d = new Client(name);
      const res = await d.init();
      assert.equal(res.error?.code, 'INVALID_NAME', `nombre ${JSON.stringify(name)}`);
    }

    // Los caracteres de control/invisibles se eliminan en lugar de rechazar el nombre.
    const e = new Client('bad\u0000na​me');
    assert.equal((await e.init()).session.name, 'badname');
  });

  test('sin session:init no se puede hacer nada', async () => {
    const c = new Client('Fantasma');
    await new Promise((r) => c.socket.once('connect', r));
    const res = await c.emit('room:create', { visibility: 'public' });
    assert.equal(res.error.code, 'NO_SESSION');
  });
});

describe('salas', () => {
  test('crear sala privada, unirse con el código y arrancar la partida', async () => {
    const host = await player('Anfitrion');
    const created = await host.emit('room:create', { visibility: 'private', color: 'w' });
    assert.match(created.code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(created.room.status, 'waiting');
    assert.equal(created.room.you.color, 'w');

    const guest = await player('Retador');
    // El código se acepta con minúsculas, espacios y almohadilla.
    const joined = await guest.emit('room:join', { code: ` #${created.code.toLowerCase()} ` });
    assert.equal(joined.ok, true);
    assert.equal(joined.role, 'b');
    assert.equal(joined.room.status, 'playing');

    const state = await host.waitFor('room:state', (s) => s.status === 'playing');
    assert.equal(state.players.b.name, 'Retador');
    assert.equal(state.you.color, 'w');
  });

  test('errores: código inválido, sala inexistente, ya en partida', async () => {
    const { host, guest, code } = await startedGame();
    assert.equal((await guest.emit('room:join', { code: 'abc' })).error.code, 'INVALID_CODE');
    assert.equal((await guest.emit('room:join', { code: 'ZZZZZZ' })).error.code, 'ROOM_NOT_FOUND');
    const again = await host.emit('room:create', { visibility: 'public' });
    assert.equal(again.error.code, 'ALREADY_IN_GAME');
    assert.equal(again.error.roomCode, code); // el cliente puede ofrecer "volver a tu partida"
    // unirse de nuevo a la misma sala es inofensivo
    assert.equal((await guest.emit('room:join', { code })).ok, true);
  });

  test('opciones de sala inválidas', async () => {
    const c = await player('Opciones');
    assert.equal((await c.emit('room:create', { visibility: 'secreta' })).error.code, 'INVALID_OPTIONS');
    assert.equal((await c.emit('room:create', { visibility: 'public', color: 'rojo' })).error.code, 'INVALID_OPTIONS');
    assert.equal(
      (await c.emit('room:create', { visibility: 'public', clock: { initialSeconds: 0 } })).error.code,
      'INVALID_OPTIONS',
    );
    assert.equal(
      (await c.emit('room:create', { visibility: 'public', clock: { initialSeconds: 300, incrementSeconds: 999 } })).error.code,
      'INVALID_OPTIONS',
    );
  });

  test('el anfitrión que sale de una sala en espera la cierra', async () => {
    const host = await player('Impaciente');
    const { code } = await host.emit('room:create', { visibility: 'public' });
    await host.emit('room:leave');
    const other = await player('Tarde');
    assert.equal((await other.emit('room:join', { code })).error.code, 'ROOM_NOT_FOUND');
  });

  test('cambiar nombre: permitido fuera de sala, bloqueado dentro', async () => {
    const c = await player('Original');
    assert.deepEqual(await c.emit('session:rename', { name: 'Nuevo Nombre' }), { ok: true, name: 'Nuevo Nombre' });
    await c.emit('room:create', { visibility: 'private' });
    assert.equal((await c.emit('session:rename', { name: 'Otro' })).error.code, 'NAME_LOCKED');
  });
});

describe('partida en tiempo real', () => {
  test('las jugadas se validan en el servidor y llegan a ambos', async () => {
    const { host, guest } = await startedGame();
    assert.equal((await guest.emit('game:move', { from: 'e7', to: 'e5' })).error.code, 'NOT_YOUR_TURN');
    assert.equal((await host.emit('game:move', { from: 'e2', to: 'e5' })).error.code, 'ILLEGAL_MOVE');

    assert.deepEqual(await host.emit('game:move', { from: 'e2', to: 'e4' }), { ok: true, ply: 1 });
    const seen = await guest.waitFor('game:move', (m) => m.ply === 1);
    assert.equal(seen.san, 'e4');
    assert.equal(seen.turn, 'b');
    await host.waitFor('game:move', (m) => m.ply === 1); // el propio jugador también lo recibe
  });

  test('jaque mate termina la partida y notifica el motivo', async () => {
    const { host, guest } = await startedGame();
    for (const [who, from, to] of [
      [host, 'f2', 'f3'], [guest, 'e7', 'e5'], [host, 'g2', 'g4'], [guest, 'd8', 'h4'],
    ]) {
      assert.equal((await who.emit('game:move', { from, to })).ok, true);
    }
    const over = await host.waitFor('game:over');
    assert.deepEqual(over.result, { winner: 'b', reason: 'checkmate' });
    assert.equal((await host.emit('game:move', { from: 'a2', to: 'a3' })).error.code, 'GAME_OVER');
  });

  test('rendirse, tablas y revancha por sockets', async () => {
    const { host, guest } = await startedGame();
    await host.emit('game:offerDraw');
    assert.equal((await guest.waitFor('game:drawOffer')).by, 'w');
    await guest.emit('game:respondDraw', { accept: false });
    await host.waitFor('game:drawOffer', (d) => d.by === null);

    await guest.emit('game:resign');
    const over = await host.waitFor('game:over');
    assert.deepEqual(over.result, { winner: 'w', reason: 'resignation' });

    await host.emit('game:rematch');
    await guest.waitFor('game:rematch');
    await guest.emit('game:rematch');
    const fresh = await host.waitFor('room:state', (s) => s.status === 'playing' && s.result === null && s.you.color === 'b');
    assert.equal(fresh.ply, 0); // los colores se intercambiaron

    // Con los colores nuevos ambos pueden jugar y chatear (la sesión debe conocer su rol actualizado).
    assert.equal((await host.emit('game:move', { from: 'e2', to: 'e4' })).error.code, 'NOT_YOUR_TURN');
    assert.deepEqual(await guest.emit('game:move', { from: 'e2', to: 'e4' }), { ok: true, ply: 1 });
    assert.deepEqual(await host.emit('game:move', { from: 'e7', to: 'e5' }), { ok: true, ply: 2 });
    assert.equal((await host.emit('chat:send', { text: 'revancha!' })).ok, true);
    assert.equal((await guest.waitFor('chat:message', (m) => m.text === 'revancha!')).role, 'b');
  });

  test('el reloj corre en el servidor y da la victoria por tiempo', async () => {
    const { host, guest } = await startedGame({
      visibility: 'private',
      color: 'w',
      clock: { initialSeconds: 1, incrementSeconds: 0 },
    });
    await host.emit('game:move', { from: 'e2', to: 'e4' }); // desde aquí corre el reloj de negras
    const over = await guest.waitFor('game:over', () => true, 3000);
    assert.deepEqual(over.result, { winner: 'w', reason: 'timeout' });
    assert.equal(over.clock.bMs, 0);
  });
});

describe('chat', () => {
  test('llega a todos los de la sala, con el nombre de sesión, y a nadie más', async () => {
    const { host, guest, code } = await startedGame({ visibility: 'public', color: 'w' });
    const spectator = await player('Observador');
    await spectator.emit('room:join', { code });
    const stranger = await player('Ajeno');

    const res = await guest.emit('chat:send', { text: '  hola   <b>mundo</b>\u0000 ' });
    assert.equal(res.ok, true);
    for (const c of [host, guest, spectator]) {
      const msg = await c.waitFor('chat:message');
      assert.equal(msg.name, guest.name);
      assert.equal(msg.role, 'b');
      assert.equal(msg.text, 'hola <b>mundo</b>'); // texto plano; el frontend lo escapa
    }
    await sleep(50);
    assert.equal(stranger.count('chat:message'), 0);

    assert.equal((await guest.emit('chat:send', { text: '   ' })).error.code, 'BAD_REQUEST');
    assert.equal((await stranger.emit('chat:send', { text: 'hola' })).error.code, 'NOT_IN_ROOM');
  });

  test('limita la frecuencia de mensajes', async () => {
    const { host } = await startedGame();
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await host.emit('chat:send', { text: `m${i}` }));
    assert.equal(results.filter((r) => r.ok).length, 5);
    assert.equal(results.at(-1).error.code, 'RATE_LIMITED');
  });

  test('un recién llegado recibe el historial en el estado de la sala', async () => {
    const { host, code } = await startedGame({ visibility: 'public' });
    await host.emit('chat:send', { text: 'primero' });
    const late = await player('Tardio');
    const joined = await late.emit('room:join', { code });
    assert.equal(joined.role, 'spectator');
    assert.deepEqual(joined.room.chat.map((m) => m.text), ['primero']);
  });
});

describe('espectadores y salas públicas', () => {
  test('sala pública llena: el tercero entra como espectador, ve todo y no puede mover', async () => {
    const { host, guest, code } = await startedGame({ visibility: 'public', color: 'w' });
    const spec = await player('Espectador');
    const joined = await spec.emit('room:join', { code });
    assert.equal(joined.role, 'spectator');
    assert.equal(joined.room.you.color, null);
    assert.equal(joined.room.spectators.count, 1);
    await host.waitFor('room:spectators', (s) => s.count === 1);

    assert.equal((await spec.emit('game:move', { from: 'e2', to: 'e4' })).error.code, 'NOT_PLAYER');
    assert.equal((await spec.emit('game:resign')).error.code, 'NOT_PLAYER');

    await host.emit('game:move', { from: 'e2', to: 'e4' });
    assert.equal((await spec.waitFor('game:move')).san, 'e4');

    await spec.emit('room:leave');
    await guest.waitFor('room:spectators', (s) => s.count === 0);
  });

  test('el snapshot jamás filtra tokens de nadie', async () => {
    const { host, guest, code } = await startedGame({ visibility: 'public' });
    const spec = await player('Curioso');
    const { room } = await spec.emit('room:join', { code });
    const blob = JSON.stringify([room, host.events, guest.events]);
    for (const c of [host, guest, spec]) assert.ok(!blob.includes(c.token), 'token filtrado');
  });

  test('lobby: lista solo salas públicas, con estado y contadores, y se actualiza en vivo', async () => {
    const viewer = await player('Mirando');
    const first = await viewer.emit('lobby:subscribe');
    const baseline = first.lobby.stats.rooms;

    const host = await player('Publica');
    const { code } = await host.emit('room:create', { visibility: 'public', color: 'b', clock: { initialSeconds: 180, incrementSeconds: 2 } });
    const priv = await player('Privada');
    const { code: privateCode } = await priv.emit('room:create', { visibility: 'private' });

    const waiting = await viewer.waitFor('lobby:list', (l) => l.rooms.some((r) => r.code === code));
    const entry = waiting.rooms.find((r) => r.code === code);
    assert.equal(entry.status, 'waiting');
    assert.equal(entry.players.length, 1);
    assert.equal(entry.players[0].color, 'b');
    assert.deepEqual(entry.clock, { initialMs: 180_000, incrementMs: 2_000, running: null });
    assert.equal(waiting.stats.rooms, baseline + 1);
    assert.ok(!waiting.rooms.some((r) => r.code === privateCode), 'una sala privada apareció en el lobby');

    const rival = await player('Rival');
    await rival.emit('room:join', { code });
    const playing = await viewer.waitFor('lobby:list', (l) => l.rooms.find((r) => r.code === code)?.status === 'playing');
    assert.equal(playing.rooms.find((r) => r.code === code).players.length, 2);

    const spec = await player('Publico');
    await spec.emit('room:join', { code });
    const withSpec = await viewer.waitFor('lobby:list', (l) => l.rooms.find((r) => r.code === code)?.spectators === 1);
    assert.equal(withSpec.stats.spectators >= 1, true);

    await viewer.emit('lobby:unsubscribe');
    const before = viewer.count('lobby:list');
    await host.emit('game:resign');
    await sleep(150);
    assert.equal(viewer.count('lobby:list'), before);
  });

  test('cambiar la visibilidad mientras se espera rival (solo el anfitrión)', async () => {
    const host = await player('Cambiante');
    const { code } = await host.emit('room:create', { visibility: 'private' });
    const viewer = await player('Buscador');
    await viewer.emit('lobby:subscribe');
    const res = await host.emit('room:setVisibility', { visibility: 'public' });
    assert.equal(res.room.visibility, 'public');
    await viewer.waitFor('lobby:list', (l) => l.rooms.some((r) => r.code === code));
  });

  test('entrar a una sala aleatoria que espera rival', async () => {
    const host = await player('Esperando');
    const { code } = await host.emit('room:create', { visibility: 'public' });
    const seeker = await player('Aleatorio');
    // Pueden existir otras salas en espera de pruebas anteriores: alcanza con que pueda unirse a alguna.
    const res = await seeker.emit('room:joinRandom');
    assert.equal(res.ok, true);
    assert.equal(res.role === 'w' || res.role === 'b', true);
    assert.ok(res.room.code);
    void code;
  });
});

describe('desconexión y reconexión', () => {
  test('recarga rápida: vuelve a la misma sala, color y tablero sin pedir nada', async () => {
    const { host, guest, code } = await startedGame({ visibility: 'private', color: 'w' });
    await host.emit('game:move', { from: 'e2', to: 'e4' });
    await guest.emit('game:move', { from: 'e7', to: 'e5' });

    guest.drop();
    const away = await host.waitFor('presence:update', (p) => p.color === 'b' && p.connected === false);
    assert.ok(away.graceEndsAt > away.serverTime, 'debe incluir la cuenta regresiva');

    await sleep(100);
    const back = new Client(guest.name, guest.token); // mismo token del localStorage
    const res = await back.init();
    assert.equal(res.ok, true);
    assert.equal(res.room.code, code);
    assert.equal(res.room.you.color, 'b');
    assert.equal(res.room.ply, 2);
    assert.match(res.room.fen, /^rnbqkbnr\/pppp1ppp\/8\/4p3\/4P3\//);
    await host.waitFor('presence:update', (p) => p.color === 'b' && p.connected === true);

    // y sigue en la partida: la jugada del rival le llega al nuevo socket
    await host.emit('game:move', { from: 'g1', to: 'f3' });
    assert.equal((await back.waitFor('game:move', (m) => m.ply === 3)).san, 'Nf3');
    assert.equal((await back.emit('game:move', { from: 'b8', to: 'c6' })).ok, true);
    await sleep(500); // pasado el plazo original no debe ocurrir ningún abandono
    assert.equal(host.count('game:over'), 0);
  });

  test('si se agota la ventana de gracia, cuenta como abandono y se libera la sala', async () => {
    const { host, guest, code } = await startedGame({ visibility: 'private', color: 'w' });
    guest.drop();
    const over = await host.waitFor('game:over', () => true, 2000);
    assert.deepEqual(over.result, { winner: 'w', reason: 'abandonment' });

    // el que se fue ya no está en la sala: al volver arranca limpio
    const back = new Client(guest.name, guest.token);
    const res = await back.init();
    assert.equal(res.room, null);

    // el que se quedó puede irse y la sala se libera
    await host.emit('room:leave');
    const late = await player('Tardon');
    assert.equal((await late.emit('room:join', { code })).error.code, 'ROOM_NOT_FOUND');
  });

  test('salir a propósito en plena partida equivale a rendirse', async () => {
    const { host, guest } = await startedGame();
    await guest.emit('room:leave');
    const over = await host.waitFor('game:over');
    assert.deepEqual(over.result, { winner: 'w', reason: 'resignation' });
    const state = await host.waitFor('room:state', (s) => s.players.b?.left === true);
    assert.equal(state.status, 'finished');
    assert.equal((await host.emit('game:rematch')).error.code, 'REMATCH_UNAVAILABLE');
  });

  test('el anfitrión que se cae esperando rival conserva su sala durante la gracia', async () => {
    const host = await player('Recargador');
    const { code } = await host.emit('room:create', { visibility: 'private' });
    host.drop();
    await sleep(100);
    const back = new Client(host.name, host.token);
    const res = await back.init();
    assert.equal(res.room.code, code);
    assert.equal(res.room.status, 'waiting');
    assert.equal(res.room.you.isHost, true);

    back.drop(); // y si no vuelve, la sala se cierra
    await sleep(700);
    const late = await player('Visitante');
    assert.equal((await late.emit('room:join', { code })).error.code, 'ROOM_NOT_FOUND');
  });

  test('un espectador que recarga sigue siendo espectador', async () => {
    const { code } = await startedGame({ visibility: 'public' });
    const spec = await player('Fiel');
    await spec.emit('room:join', { code });
    spec.drop();
    await sleep(60);
    const back = new Client(spec.name, spec.token);
    const res = await back.init();
    assert.equal(res.room.code, code);
    assert.equal(res.room.you.role, 'spectator');
  });

  test('dos pestañas con el mismo token son la misma persona', async () => {
    const { host, guest, code } = await startedGame({ visibility: 'private', color: 'w' });
    const tab2 = new Client(guest.name, guest.token);
    const res = await tab2.init();
    assert.equal(res.room.code, code);
    guest.drop(); // cerrar una pestaña no debe contar como desconexión
    await sleep(600);
    assert.equal(host.count('presence:update'), 0);
    assert.equal(host.count('game:over'), 0);
    assert.equal((await tab2.emit('game:move', { from: 'e7', to: 'e5' })).error.code, 'NOT_YOUR_TURN');
  });
});

describe('robustez', () => {
  test('payloads basura no tumban el servidor', async () => {
    const c = await player('Fuzz');
    for (const payload of [null, undefined, 42, 'texto', [], { from: {} }, { code: { $ne: 1 } }]) {
      for (const event of ['room:create', 'room:join', 'game:move', 'chat:send', 'session:rename', 'game:respondDraw']) {
        const res = await c.emit(event, payload);
        assert.equal(typeof res.ok, 'boolean', `${event} con ${JSON.stringify(payload)}`);
      }
    }
    await sleep(1100); // el bucle anterior agotó el límite de eventos por segundo
    assert.equal((await c.emit('session:init', { token: randomUUID(), name: 'Sigue vivo' })).ok, true);
  });

  test('limita la ráfaga de eventos por conexión', async () => {
    const c = await player('Spammer');
    const results = await Promise.all(Array.from({ length: 80 }, () => c.emit('room:sync')));
    assert.ok(results.some((r) => r.error?.code === 'RATE_LIMITED'));
  });

  test('/health responde', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
  });
});
