// Conecta Socket.IO con el dominio:
//  - cliente → servidor: handlers (con ack, validación y rate limit)
//  - servidor → cliente: `onRoomEvent` traduce los eventos de dominio de las salas
//    a eventos de red (a la sala completa o personalizados por jugador).
import { AppError, ERRORS } from '../utils/errors.js';
import { RateLimiter } from '../utils/rateLimit.js';
import { createHandlers } from './handlers.js';
import { createLobbyBroadcaster } from './lobby.js';

const roomChannel = (code) => `room:${code}`;

export function attachSockets(io, { manager, sessions, config }) {
  const lobby = createLobbyBroadcaster({ io, manager, config });
  const eventLimiter = new RateLimiter(config.eventRateLimit);

  const channels = {
    join(session, code) {
      if (!code) return;
      for (const socket of session.sockets) socket.join(roomChannel(code));
    },
    leave(session, code) {
      if (!code) return;
      for (const socket of session.sockets) socket.leave(roomChannel(code));
    },
  };

  /** Quita un socket de su sesión; si era la última conexión, arranca la ventana de gracia. */
  function detachSocket(socket) {
    const session = sessions.get(socket.data.token);
    socket.data.token = null;
    if (!session) return;
    if (sessions.detach(session, socket) === 0) manager.disconnect(session);
  }

  const handlers = createHandlers({ manager, sessions, channels, detachSocket });

  // ---------------------------------------------------------- dominio → red
  function emitStateToMembers(room) {
    for (const token of room.memberTokens()) {
      const session = sessions.get(token);
      if (!session) continue;
      const snapshot = room.snapshot(token);
      for (const socket of session.sockets) socket.emit('room:state', snapshot);
    }
  }

  manager.notify = (room, type, payload = {}) => {
    const channel = roomChannel(room.code);
    switch (type) {
      case 'created':
        break;
      case 'state':
        emitStateToMembers(room);
        break;
      case 'move':
        io.to(channel).emit('game:move', { code: room.code, ...payload });
        break;
      case 'over':
        io.to(channel).emit('game:over', { code: room.code, ...payload });
        break;
      case 'presence':
        io.to(channel).emit('presence:update', { code: room.code, ...payload });
        return; // no cambia nada del listado público
      case 'drawOffer':
        io.to(channel).emit('game:drawOffer', { code: room.code, ...payload });
        return;
      case 'rematch':
        io.to(channel).emit('game:rematch', { code: room.code, ...payload });
        return;
      case 'chat':
        io.to(channel).emit('chat:message', { code: room.code, ...payload });
        return;
      case 'spectators':
        io.to(channel).emit('room:spectators', { code: room.code, ...payload });
        break;
      case 'closed':
        io.to(channel).emit('room:closed', { code: room.code, reason: payload.reason });
        io.in(channel).socketsLeave(channel);
        break;
      default:
        return;
    }
    if (room.visibility === 'public') lobby.markDirty();
  };

  // ---------------------------------------------------------- red → dominio
  function on(socket, event, { auth = true, run }) {
    socket.on(event, async (payload, ack) => {
      if (typeof payload === 'function') [payload, ack] = [undefined, payload];
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (!eventLimiter.allow(socket.id)) throw ERRORS.rateLimited();
        let session = null;
        if (auth) {
          session = sessions.get(socket.data.token);
          if (!session) throw ERRORS.noSession();
        }
        const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
        const result = await run({ socket, session, payload: safePayload });
        reply({ ok: true, ...result });
      } catch (err) {
        if (err instanceof AppError) {
          // `details` va primero para que nunca pueda pisar `code` ni `message`.
          reply({ ok: false, error: { ...err.details, code: err.code, message: err.message } });
        } else {
          console.error(`[socket] error en "${event}":`, err);
          reply({ ok: false, error: { code: 'INTERNAL', message: 'Error interno del servidor.' } });
        }
      }
    });
  }

  io.on('connection', (socket) => {
    for (const [event, handler] of Object.entries(handlers)) on(socket, event, handler);

    socket.on('disconnect', () => {
      eventLimiter.forget(socket.id);
      detachSocket(socket);
    });
  });

  return {
    lobby,
    close() {
      lobby.close();
    },
  };
}
