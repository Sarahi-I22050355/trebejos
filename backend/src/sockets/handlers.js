// Handlers de los eventos cliente → servidor. Cada uno recibe `{ socket, session, payload }`
// y devuelve un objeto que se envía al cliente en el ack: `{ ok: true, ...resultado }`.
// Si lanza AppError, el ack es `{ ok: false, error: { code, message } }`.
import { AppError, ERRORS } from '../utils/errors.js';
import { randomName, sanitizeName } from '../utils/names.js';
import { TOKEN_RE } from '../rooms/SessionStore.js';
import { LOBBY_CHANNEL } from './lobby.js';

/**
 * @param {object} ctx
 * @param {ReturnType<import('../rooms/RoomManager.js').RoomManager>} ctx.manager
 * @param {import('../rooms/SessionStore.js').SessionStore} ctx.sessions
 * @param {{ join:Function, leave:Function }} ctx.channels
 * @param {(socket:any)=>void} ctx.detachSocket
 */
export function createHandlers({ manager, sessions, channels, detachSocket }) {
  /** Ejecuta `fn` y, si la sesión cambió de sala por el camino, la saca del canal de la anterior. */
  function switchingRooms(session, fn) {
    const previous = session.roomCode;
    const result = fn();
    if (previous && previous !== session.roomCode) channels.leave(session, previous);
    channels.join(session, session.roomCode);
    return result;
  }

  const snapshotOf = (room, token) => room.snapshot(token);

  return {
    // ------------------------------------------------------------------ sesión
    'session:init': {
      auth: false,
      run({ socket, payload }) {
        const { token, name } = payload;
        if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw ERRORS.invalidToken();

        const session = sessions.getOrCreate(token);
        const inRoom = manager.activeRoomOf(session);
        // Dentro de una sala el nombre queda fijo (los demás ya lo ven).
        if (name != null && !inRoom) {
          const clean = sanitizeName(name);
          if (!clean) throw ERRORS.invalidName();
          session.name = clean;
        }
        if (!session.name) session.name = randomName();

        if (socket.data.token && socket.data.token !== token) detachSocket(socket);
        sessions.attach(session, socket);
        socket.data.token = token;

        // Reincorpora a la sala si seguía dentro de la ventana de gracia.
        const room = manager.reconnect(session);
        if (room) channels.join(session, room.code);
        return { session: { name: session.name }, room: room ? snapshotOf(room, token) : null };
      },
    },

    'session:rename': {
      run({ session, payload }) {
        const clean = sanitizeName(payload.name);
        if (!clean) throw ERRORS.invalidName();
        if (manager.activeRoomOf(session)) throw ERRORS.nameLocked();
        session.name = clean;
        return { name: clean };
      },
    },

    // ------------------------------------------------------------------- salas
    'room:create': {
      run({ session, payload }) {
        const room = switchingRooms(session, () => manager.createRoom(session, payload));
        return { code: room.code, room: snapshotOf(room, session.token) };
      },
    },

    'room:join': {
      run({ session, payload }) {
        const { room, role } = switchingRooms(session, () => manager.joinRoom(session, payload.code));
        return { role, room: snapshotOf(room, session.token) };
      },
    },

    'room:joinRandom': {
      run({ session }) {
        const target = manager.randomWaitingRoom(session.token);
        if (!target) throw new AppError('NO_WAITING_ROOMS', 'No hay salas esperando rival ahora mismo.');
        const { room, role } = switchingRooms(session, () => manager.joinRoom(session, target.code));
        return { role, room: snapshotOf(room, session.token) };
      },
    },

    'room:leave': {
      run({ session }) {
        const left = manager.leave(session);
        if (left) channels.leave(session, left.code);
        return {};
      },
    },

    'room:sync': {
      run({ session }) {
        const room = manager.activeRoomOf(session);
        return { room: room ? snapshotOf(room, session.token) : null };
      },
    },

    'room:setVisibility': {
      run({ session, payload }) {
        const room = manager.setVisibility(session, payload.visibility);
        return { room: snapshotOf(room, session.token) };
      },
    },

    // ------------------------------------------------------------------- lobby
    'lobby:subscribe': {
      auth: false,
      run({ socket }) {
        socket.join(LOBBY_CHANNEL);
        return { lobby: manager.lobbyList() };
      },
    },

    'lobby:unsubscribe': {
      auth: false,
      run({ socket }) {
        socket.leave(LOBBY_CHANNEL);
        return {};
      },
    },

    // ----------------------------------------------------------------- partida
    'game:move': {
      run({ session, payload }) {
        const { from, to, promotion } = payload;
        const move = manager.move(session, { from, to, promotion });
        return { ply: move.ply };
      },
    },
    'game:resign': {
      run({ session }) {
        manager.resign(session);
        return {};
      },
    },
    'game:offerDraw': {
      run({ session }) {
        manager.offerDraw(session);
        return {};
      },
    },
    'game:respondDraw': {
      run({ session, payload }) {
        manager.respondDraw(session, payload.accept);
        return {};
      },
    },
    'game:rematch': {
      run({ session }) {
        manager.requestRematch(session);
        return {};
      },
    },

    // -------------------------------------------------------------------- chat
    'chat:send': {
      run({ session, payload }) {
        const message = manager.sendChat(session, payload.text);
        return { id: message.id };
      },
    },
  };
}
