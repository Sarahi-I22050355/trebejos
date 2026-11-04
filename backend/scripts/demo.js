// Demo manual: dos "jugadores" (bots de prueba) juegan el mate del loco contra un
// servidor en marcha, y un tercero mira como espectador. Imprime lo que ocurre.
//
//   npm start                          (en otra terminal)
//   node scripts/demo.js [url]         (por defecto http://localhost:3000)
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const url = process.argv[2] ?? 'http://localhost:3000';
const log = (who, msg) => console.log(`${who.padEnd(12)} ${msg}`);

function client(name) {
  const socket = io(url, { transports: ['websocket'] });
  const emit = (event, data) => new Promise((resolve) => socket.emit(event, data, resolve));
  const ready = new Promise((resolve) => socket.once('connect', resolve));
  return {
    name,
    socket,
    emit,
    async init() {
      await ready;
      const res = await emit('session:init', { token: randomUUID(), name });
      log(name, `sesión iniciada como "${res.session.name}"`);
    },
  };
}

const host = client('CaballoVeloz42');
const guest = client('AlfilAstuto7');
const watcher = client('Espectador1');
await Promise.all([host.init(), guest.init(), watcher.init()]);

host.socket.on('game:move', (m) => log('servidor→todos', `jugada ${m.ply}: ${m.san}${m.inCheck ? ' (jaque)' : ''}`));
host.socket.on('game:over', (o) => log('servidor→todos', `FIN: ${JSON.stringify(o.result)}`));
watcher.socket.on('chat:message', (m) => log('chat', `${m.name} (${m.role}): ${m.text}`));

const created = await host.emit('room:create', { visibility: 'public', color: 'w', clock: { initialSeconds: 300, incrementSeconds: 2 } });
log(host.name, `creó la sala pública ${created.code}`);

const lobby = await watcher.emit('lobby:subscribe');
log(watcher.name, `ve ${lobby.lobby.stats.rooms} sala(s) pública(s): ${lobby.lobby.rooms.map((r) => `${r.code}[${r.status}]`).join(', ')}`);

const joined = await guest.emit('room:join', { code: created.code });
log(guest.name, `se unió como ${joined.role === 'w' ? 'blancas' : 'negras'}; estado: ${joined.room.status}`);

const spec = await watcher.emit('room:join', { code: created.code });
log(watcher.name, `entró como ${spec.role}`);
log(watcher.name, `intenta mover: ${(await watcher.emit('game:move', { from: 'e2', to: 'e4' })).error.code}`);

await host.emit('chat:send', { text: '¡Suerte!' });
for (const [who, from, to] of [[host, 'f2', 'f3'], [guest, 'e7', 'e5'], [host, 'g2', 'g4'], [guest, 'd8', 'h4']]) {
  await who.emit('game:move', { from, to });
}
await new Promise((r) => setTimeout(r, 300));
for (const c of [host, guest, watcher]) c.socket.disconnect();
