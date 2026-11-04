// Sesiones anónimas identificadas por un token (UUID) que el navegador guarda en
// localStorage. No hay cuentas: el token es solo el "carnet" para reconectar.
export const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @typedef {object} Session
 * @property {string} token
 * @property {string|null} name
 * @property {Set<any>} sockets   una sesión puede tener varias pestañas abiertas
 * @property {string|null} roomCode
 * @property {'w'|'b'|'spectator'|null} role
 * @property {number} lastSeen
 */

export class SessionStore {
  constructor(now = Date.now) {
    this.now = now;
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
  }

  get(token) {
    return this.sessions.get(token) ?? null;
  }

  getOrCreate(token) {
    let session = this.sessions.get(token);
    if (!session) {
      session = { token, name: null, sockets: new Set(), roomCode: null, role: null, lastSeen: this.now() };
      this.sessions.set(token, session);
    }
    return session;
  }

  attach(session, socket) {
    session.sockets.add(socket);
    session.lastSeen = this.now();
  }

  /** Devuelve cuántas conexiones le quedan a la sesión. */
  detach(session, socket) {
    session.sockets.delete(socket);
    session.lastSeen = this.now();
    return session.sockets.size;
  }

  /** Borra sesiones inactivas, sin conexiones y sin sala. */
  gc(maxIdleMs = 60 * 60_000) {
    const t = this.now();
    for (const [token, s] of this.sessions) {
      if (s.sockets.size === 0 && !s.roomCode && t - s.lastSeen > maxIdleMs) this.sessions.delete(token);
    }
  }
}
