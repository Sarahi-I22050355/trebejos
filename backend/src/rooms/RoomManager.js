// Orquesta todas las salas: creación, ingreso, salida, reconexión con ventana de
// gracia, listado público y limpieza. Tampoco conoce Socket.IO: publica eventos
// de dominio con `notify(room, type, payload)`.
import { randomInt } from 'node:crypto';
import { Room, STATUS, other } from './Room.js';
import { ERRORS } from '../utils/errors.js';
import { generateCode, normalizeCode } from '../utils/codes.js';
import { sanitizeChat } from '../utils/names.js';
import { RateLimiter } from '../utils/rateLimit.js';

const VISIBILITIES = ['public', 'private'];

export class RoomManager {
  /**
   * @param {object} deps
   * @param {ReturnType<import('../config.js').loadConfig>} deps.config
   * @param {import('./SessionStore.js').SessionStore} deps.sessions
   * @param {(room: Room, type: string, payload?: object) => void} [deps.notify]
   */
  constructor({ config, sessions, notify = () => {}, now = Date.now }) {
    this.config = config;
    this.sessions = sessions;
    this.notify = notify;
    this.now = now;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    this.chatLimiter = new RateLimiter(config.chatRateLimit, now);
    this.sweeper = null;
  }

  // ------------------------------------------------------------------ helpers

  /** Sala en la que realmente está la sesión (o `null`, limpiando datos obsoletos). */
  activeRoomOf(session) {
    const room = session.roomCode ? this.rooms.get(session.roomCode) : null;
    const valid = room && room.roleOf(session.token) === session.role && session.role !== null;
    if (valid) return room;
    session.roomCode = null;
    session.role = null;
    return null;
  }

  #requireRoom(session) {
    const room = this.activeRoomOf(session);
    if (!room) throw ERRORS.notInRoom();
    return room;
  }

  /** Antes de crear/unirse a otra sala: sale de la anterior salvo que esté en plena partida. */
  #leaveBeforeStarting(session) {
    const room = this.activeRoomOf(session);
    if (!room) return;
    if (session.role !== 'spectator' && room.status === STATUS.PLAYING) throw ERRORS.alreadyInGame(room.code);
    this.leave(session);
  }

  #parseClock(raw) {
    if (raw == null || raw === false) return null;
    const { minClockSeconds, maxClockSeconds, maxIncrementSeconds } = this.config;
    const initial = raw.initialSeconds;
    const increment = raw.incrementSeconds ?? 0;
    if (!Number.isInteger(initial) || initial < minClockSeconds || initial > maxClockSeconds) {
      throw ERRORS.invalidOptions(`El reloj debe estar entre ${minClockSeconds} segundos y 3 horas.`);
    }
    if (!Number.isInteger(increment) || increment < 0 || increment > maxIncrementSeconds) {
      throw ERRORS.invalidOptions(`El incremento debe estar entre 0 y ${maxIncrementSeconds} segundos.`);
    }
    return { initialMs: initial * 1000, incrementMs: increment * 1000 };
  }

  #newRoom(code, visibility, clock) {
    const room = new Room({
      code,
      visibility,
      clock,
      now: this.now,
      chatHistory: this.config.chatHistory,
      notify: (type, payload) => this.notify(room, type, payload),
    });
    return room;
  }

  // -------------------------------------------------------------- crear / unir

  createRoom(session, { visibility, color = 'random', clock = null } = {}) {
    if (!VISIBILITIES.includes(visibility)) throw ERRORS.invalidOptions('Elige si la sala es pública o privada.');
    if (!['w', 'b', 'random'].includes(color)) throw ERRORS.invalidOptions('Color inválido.');
    const clockConfig = this.#parseClock(clock);
    this.#leaveBeforeStarting(session);
    if (this.rooms.size >= this.config.maxRooms) throw ERRORS.serverBusy();

    const code = generateCode((c) => this.rooms.has(c));
    const room = this.#newRoom(code, visibility, clockConfig);
    const seatColor = color === 'random' ? (randomInt(2) ? 'w' : 'b') : color;
    room.hostToken = session.token;
    room.addPlayer(seatColor, session);
    this.rooms.set(code, room);
    session.roomCode = code;
    session.role = seatColor;
    this.notify(room, 'created');
    return room;
  }

  joinRoom(session, rawCode) {
    const code = normalizeCode(rawCode);
    if (!code) throw ERRORS.invalidCode();
    const room = this.rooms.get(code);
    if (!room) throw ERRORS.roomNotFound();

    // Reintentar unirse a la sala donde ya estás es inofensivo.
    if (this.activeRoomOf(session) === room) return { room, role: session.role };

    this.#leaveBeforeStarting(session);

    const seat = room.freeSeat();
    if (seat) {
      room.addPlayer(seat, session);
      session.roomCode = code;
      session.role = seat;
      room.startGame();
      this.notify(room, 'state'); // la partida arranca: todos reciben el estado completo
      return { room, role: seat };
    }

    if (room.visibility === 'private' && !this.config.allowPrivateSpectators) throw ERRORS.roomFull();
    if (room.connectedSpectators().length >= this.config.maxSpectators) throw ERRORS.roomFull();
    room.addSpectator(session);
    session.roomCode = code;
    session.role = 'spectator';
    this.notify(room, 'spectators', room.spectatorsView());
    return { room, role: 'spectator' };
  }

  setVisibility(session, visibility) {
    const room = this.#requireRoom(session);
    if (room.hostToken !== session.token || room.status !== STATUS.WAITING) throw ERRORS.notHost();
    if (!VISIBILITIES.includes(visibility)) throw ERRORS.invalidOptions();
    room.visibility = visibility;
    room.touch();
    this.notify(room, 'state');
    return room;
  }

  // -------------------------------------------------------------------- salir

  /** Devuelve `{ code }` de la sala abandonada (o `null` si no estaba en ninguna). */
  leave(session) {
    const room = this.activeRoomOf(session);
    if (!room) return null;
    const { token, role } = session;
    session.roomCode = null;
    session.role = null;

    if (role === 'spectator') {
      room.removeSpectator(token);
      this.notify(room, 'spectators', room.spectatorsView());
      return { code: room.code };
    }

    if (room.status === STATUS.WAITING) {
      this.#closeRoom(room, 'host-left');
    } else {
      if (room.status === STATUS.PLAYING) room.resign(token); // salir en plena partida = rendirse
      this.#markLeft(room, role);
      this.#afterSeatLeft(room);
    }
    return { code: room.code };
  }

  #markLeft(room, color) {
    const seat = room.players[color];
    clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.graceEndsAt = null;
    seat.connected = false;
    seat.left = true;
  }

  #afterSeatLeft(room) {
    if (room.activePlayers().length === 0) this.#closeRoom(room, 'empty');
    else this.notify(room, 'state');
  }

  #closeRoom(room, reason) {
    const tokens = room.memberTokens();
    room.dispose();
    this.rooms.delete(room.code);
    for (const token of tokens) {
      const session = this.sessions.get(token);
      if (session?.roomCode === room.code) {
        session.roomCode = null;
        session.role = null;
      }
    }
    this.notify(room, 'closed', { reason });
  }

  // ---------------------------------------------- desconexión y reconexión

  /** Se llama cuando a la sesión se le cae su última conexión. */
  disconnect(session) {
    const room = this.activeRoomOf(session);
    if (!room) return;
    const t = this.now();

    if (session.role === 'spectator') {
      const spectator = room.spectators.get(session.token);
      spectator.connected = false;
      clearTimeout(spectator.graceTimer);
      spectator.graceTimer = setTimeout(() => this.#spectatorExpired(room, session.token), this.config.spectatorGraceMs);
      spectator.graceTimer.unref?.();
      this.notify(room, 'spectators', room.spectatorsView());
      return;
    }

    const color = session.role;
    const seat = room.players[color];
    seat.connected = false;
    seat.graceEndsAt = t + this.config.reconnectGraceMs;
    clearTimeout(seat.graceTimer);
    seat.graceTimer = setTimeout(() => this.#graceExpired(room, color), this.config.reconnectGraceMs);
    seat.graceTimer.unref?.();
    this.notify(room, 'presence', { color, connected: false, graceEndsAt: seat.graceEndsAt, serverTime: t });
  }

  /**
   * La sesión volvió (mismo token). Si estaba dentro de una sala dentro de la
   * ventana de gracia, la reincorpora tal cual: mismo color, mismo tablero.
   * Devuelve la sala o `null`.
   */
  reconnect(session) {
    const room = this.activeRoomOf(session);
    if (!room) return null;

    if (session.role === 'spectator') {
      const spectator = room.spectators.get(session.token);
      if (!spectator.connected) {
        spectator.connected = true;
        clearTimeout(spectator.graceTimer);
        spectator.graceTimer = null;
        this.notify(room, 'spectators', room.spectatorsView());
      }
      return room;
    }

    const seat = room.players[session.role];
    if (!seat.connected) {
      seat.connected = true;
      clearTimeout(seat.graceTimer);
      seat.graceTimer = null;
      seat.graceEndsAt = null;
      this.notify(room, 'presence', { color: session.role, connected: true, serverTime: this.now() });
    }
    return room;
  }

  #graceExpired(room, color) {
    const seat = room.players[color];
    if (!seat || seat.connected || seat.left) return;
    seat.graceTimer = null;
    const session = this.sessions.get(seat.token);

    if (room.status === STATUS.WAITING) {
      this.#closeRoom(room, 'host-left');
      return;
    }
    if (room.status === STATUS.PLAYING) room.endGame(other(color), 'abandonment');
    this.#markLeft(room, color);
    if (session?.roomCode === room.code) {
      session.roomCode = null;
      session.role = null;
    }
    this.#afterSeatLeft(room);
  }

  #spectatorExpired(room, token) {
    const spectator = room.spectators.get(token);
    if (!spectator || spectator.connected) return;
    room.removeSpectator(token);
    const session = this.sessions.get(token);
    if (session?.roomCode === room.code) {
      session.roomCode = null;
      session.role = null;
    }
    this.notify(room, 'spectators', room.spectatorsView());
  }

  // ----------------------------------------------------- acciones de partida

  move(session, data) {
    return this.#requireRoom(session).move(session.token, data);
  }

  resign(session) {
    this.#requireRoom(session).resign(session.token);
  }

  offerDraw(session) {
    this.#requireRoom(session).offerDraw(session.token);
  }

  respondDraw(session, accept) {
    this.#requireRoom(session).respondDraw(session.token, accept === true);
  }

  requestRematch(session) {
    this.#requireRoom(session).requestRematch(session.token);
  }

  sendChat(session, rawText) {
    const room = this.#requireRoom(session);
    if (!this.chatLimiter.allow(session.token)) throw ERRORS.rateLimited();
    const text = sanitizeChat(rawText, this.config.chatMaxLength);
    if (!text) throw ERRORS.badRequest('El mensaje está vacío.');
    return room.addChat({ name: session.name, role: session.role }, text);
  }

  // ------------------------------------------------------------------- lobby

  /** Salas públicas visibles en el listado (esperando rival o en partida). */
  lobbyList() {
    const rooms = [...this.rooms.values()]
      .filter((r) => r.visibility === 'public' && r.status !== STATUS.FINISHED)
      .map((r) => r.lobbySummary(this.config.lowTimeMs))
      .sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === STATUS.WAITING ? -1 : 1));
    return {
      rooms,
      stats: {
        rooms: rooms.length,
        players: rooms.reduce((n, r) => n + r.players.length, 0),
        spectators: rooms.reduce((n, r) => n + r.spectators, 0),
      },
      serverTime: this.now(),
    };
  }

  /** Sala pública esperando rival (para "entrar a sala aleatoria"). */
  randomWaitingRoom(excludeToken) {
    const candidates = [...this.rooms.values()].filter(
      (r) => r.visibility === 'public' && r.status === STATUS.WAITING && r.hostToken !== excludeToken,
    );
    return candidates.length ? candidates[randomInt(candidates.length)] : null;
  }

  // ----------------------------------------------------------------- limpieza

  sweep() {
    const t = this.now();
    const { waitingRoomTtlMs, finishedRoomTtlMs, idleRoomTtlMs } = this.config;
    for (const room of [...this.rooms.values()]) {
      const idle = t - room.lastActivityAt;
      if (room.status === STATUS.WAITING && t - room.createdAt > waitingRoomTtlMs) this.#closeRoom(room, 'expired');
      else if (room.status === STATUS.FINISHED && idle > finishedRoomTtlMs) this.#closeRoom(room, 'expired');
      else if (idle > idleRoomTtlMs) this.#closeRoom(room, 'expired');
    }
    this.sessions.gc();
  }

  startSweeper() {
    this.sweeper = setInterval(() => this.sweep(), this.config.sweepIntervalMs);
    this.sweeper.unref?.();
  }

  close() {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
