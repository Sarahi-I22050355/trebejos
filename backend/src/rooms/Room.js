// Una sala = una partida entre dos jugadores (+ espectadores y chat).
// Esta clase es dominio puro: no conoce Socket.IO. Cada cambio relevante se
// comunica con `notify(type, payload)`; la capa de sockets lo traduce a eventos.
import { Chess } from 'chess.js';
import { ERRORS } from '../utils/errors.js';

export const STATUS = Object.freeze({ WAITING: 'waiting', PLAYING: 'playing', FINISHED: 'finished' });

export const other = (color) => (color === 'w' ? 'b' : 'w');

const SQUARE_RE = /^[a-h][1-8]$/;
const PROMOTION_RE = /^[qrbn]$/;

export class Room {
  /**
   * @param {object} opts
   * @param {string} opts.code
   * @param {'public'|'private'} opts.visibility
   * @param {{initialMs:number, incrementMs:number}|null} opts.clock  null = sin reloj
   * @param {(type:string, payload?:object)=>void} opts.notify
   * @param {string} [opts.startFen]  solo para pruebas
   */
  constructor({ code, visibility, clock = null, notify = () => {}, now = Date.now, startFen = null, chatHistory = 100, bot = null }) {
    this.code = code;
    this.visibility = visibility;
    /** Partida contra el bot: { level, label, color, token, thinking } (color = el del bot). */
    this.bot = bot;
    this.mode = bot ? 'bot' : 'pvp';
    this.status = STATUS.WAITING;
    this.hostToken = null;

    /** @type {{w: Seat|null, b: Seat|null}} */
    this.players = { w: null, b: null };
    /** @type {Map<string, {token:string, name:string, connected:boolean, graceTimer:any}>} */
    this.spectators = new Map();

    this.clockConfig = clock;
    this.notify = notify;
    this.now = now;
    this.startFen = startFen;
    this.chatHistory = chatHistory;

    this.createdAt = now();
    this.lastActivityAt = this.createdAt;
    this.chat = [];
    this.chatSeq = 0;
    this.flagTimer = null;

    this.#resetGame();
  }

  // ---------------------------------------------------------------- asientos

  touch() {
    this.lastActivityAt = this.now();
  }

  /** Color libre mientras la sala espera rival, o `null`. */
  freeSeat() {
    if (this.status !== STATUS.WAITING) return null;
    return ['w', 'b'].find((c) => this.players[c] === null) ?? null;
  }

  addPlayer(color, { token, name }) {
    this.players[color] = { token, name, connected: true, left: false, graceTimer: null, graceEndsAt: null };
    this.touch();
  }

  /** Asiento virtual del bot: nunca se desconecta ni abandona por su cuenta. */
  addBotSeat() {
    this.players[this.bot.color] = {
      token: this.bot.token, name: `Bot ${this.bot.label}`, isBot: true,
      connected: true, left: false, graceTimer: null, graceEndsAt: null,
    };
  }

  /** Jugadores humanos que siguen en la sala. */
  humanPlayers() {
    return this.activePlayers().filter((c) => !this.players[c].isBot);
  }

  addSpectator({ token, name }) {
    this.spectators.set(token, { token, name, connected: true, graceTimer: null });
    this.touch();
  }

  removeSpectator(token) {
    const spectator = this.spectators.get(token);
    if (!spectator) return;
    clearTimeout(spectator.graceTimer);
    this.spectators.delete(token);
    this.touch();
  }

  /** Jugadores que siguen en la sala (no se han ido). */
  activePlayers() {
    return ['w', 'b'].filter((c) => this.players[c] && !this.players[c].left);
  }

  colorOf(token) {
    return ['w', 'b'].find((c) => this.players[c]?.token === token && !this.players[c].left) ?? null;
  }

  roleOf(token) {
    return this.colorOf(token) ?? (this.spectators.has(token) ? 'spectator' : null);
  }

  connectedSpectators() {
    return [...this.spectators.values()].filter((s) => s.connected);
  }

  memberTokens() {
    return [
      ...this.activePlayers().map((c) => this.players[c].token),
      ...this.spectators.keys(),
    ];
  }

  // ------------------------------------------------------------------ partida

  #resetGame() {
    clearTimeout(this.flagTimer);
    this.flagTimer = null;
    this.game = this.startFen ? new Chess(this.startFen) : new Chess();
    this.moves = [];
    this.lastMove = null;
    this.result = null;
    this.drawOffer = null;
    this.rematch = new Set();
    const initial = this.clockConfig?.initialMs ?? 0;
    // `running` es el color cuyo reloj corre. Hasta la primera jugada no corre ninguno.
    this.clockState = { w: initial, b: initial, running: null, turnStartedAt: null };
  }

  startGame() {
    this.status = STATUS.PLAYING;
    this.touch();
  }

  #remaining(color, t = this.now()) {
    const c = this.clockState;
    const spent = c.running === color ? t - c.turnStartedAt : 0;
    return Math.max(0, c[color] - spent);
  }

  clockSnapshot() {
    if (!this.clockConfig) return { enabled: false };
    const t = this.now();
    return {
      enabled: true,
      initialMs: this.clockConfig.initialMs,
      incrementMs: this.clockConfig.incrementMs,
      wMs: this.#remaining('w', t),
      bMs: this.#remaining('b', t),
      running: this.clockState.running,
      serverTime: t,
    };
  }

  #scheduleFlag() {
    clearTimeout(this.flagTimer);
    const { running } = this.clockState;
    if (!this.clockConfig || !running || this.status !== STATUS.PLAYING) return;
    this.flagTimer = setTimeout(() => this.#flag(running), this.#remaining(running) + 5);
    this.flagTimer.unref?.();
  }

  #flag(color) {
    if (this.status !== STATUS.PLAYING || this.clockState.running !== color) return;
    if (this.#remaining(color) > 0) return this.#scheduleFlag(); // el timer saltó unos ms antes
    this.clockState[color] = 0;
    // Regla FIDE: si el rival no puede dar mate con su material, es tablas.
    const winner = this.#hasMatingMaterial(other(color)) ? other(color) : null;
    this.endGame(winner, winner ? 'timeout' : 'timeout-insufficient');
  }

  #hasMatingMaterial(color) {
    let minors = 0;
    for (const row of this.game.board()) {
      for (const piece of row) {
        if (!piece || piece.color !== color) continue;
        if ('pqr'.includes(piece.type)) return true;
        if ('nb'.includes(piece.type)) minors++;
      }
    }
    return minors >= 2;
  }

  /**
   * Aplica una jugada del jugador `token`. Lanza AppError si no es válida.
   * Devuelve el payload del evento `game:move`.
   */
  move(token, { from, to, promotion } = {}) {
    if (this.status === STATUS.FINISHED) throw ERRORS.gameOver();
    if (this.status !== STATUS.PLAYING) throw ERRORS.gameNotActive();
    const color = this.colorOf(token);
    if (!color) throw ERRORS.notPlayer();
    if (this.game.turn() !== color) throw ERRORS.notYourTurn();
    if (
      !SQUARE_RE.test(from ?? '') ||
      !SQUARE_RE.test(to ?? '') ||
      (promotion != null && !PROMOTION_RE.test(promotion))
    ) {
      throw ERRORS.illegalMove();
    }

    const t = this.now();
    // La jugada llegó con la bandera caída pero el timer aún no había saltado.
    if (this.clockConfig && this.clockState.running === color && this.#remaining(color, t) <= 0) {
      this.#flag(color);
      throw ERRORS.gameOver('Se acabó tu tiempo.');
    }

    let move;
    try {
      move = this.game.move({ from, to, promotion });
    } catch {
      throw ERRORS.illegalMove();
    }

    let spentMs = null;
    if (this.clockConfig) {
      const c = this.clockState;
      // La primera jugada de la partida no consume tiempo ni da incremento.
      if (c.running === color) {
        spentMs = t - c.turnStartedAt;
        c[color] = Math.max(0, c[color] - spentMs) + this.clockConfig.incrementMs;
      }
      c.running = other(color);
      c.turnStartedAt = t;
      this.#scheduleFlag();
    }

    const entry = {
      ply: this.moves.length + 1,
      san: move.san,
      from: move.from,
      to: move.to,
      color,
      piece: move.piece,
      captured: move.captured ?? null,
      promotion: move.promotion ?? null,
      flags: move.flags,
      ts: t,
      spentMs,
    };
    this.moves.push(entry);
    this.lastMove = { from: move.from, to: move.to };
    this.drawOffer = null; // mover = ignorar la oferta de tablas pendiente
    this.touch();

    const payload = {
      ...entry,
      fen: this.game.fen(),
      turn: this.game.turn(),
      inCheck: this.game.inCheck(),
      clock: this.clockSnapshot(),
    };
    this.notify('move', payload);

    const g = this.game;
    if (g.isCheckmate()) this.endGame(color, 'checkmate');
    else if (g.isStalemate()) this.endGame(null, 'stalemate');
    else if (g.isInsufficientMaterial()) this.endGame(null, 'insufficient');
    else if (g.isThreefoldRepetition()) this.endGame(null, 'threefold');
    else if (g.isDrawByFiftyMoves()) this.endGame(null, 'fifty-moves');

    return payload;
  }

  /** Termina la partida. `winner` = 'w' | 'b' | null (tablas). */
  endGame(winner, reason) {
    if (this.status !== STATUS.PLAYING) return;
    const c = this.clockState;
    if (c.running) {
      c[c.running] = this.#remaining(c.running);
      c.running = null;
    }
    clearTimeout(this.flagTimer);
    this.status = STATUS.FINISHED;
    this.result = { winner, reason };
    this.drawOffer = null;
    this.rematch = new Set();
    this.touch();
    this.notify('over', { result: this.result, fen: this.game.fen(), clock: this.clockSnapshot() });
  }

  #requirePlayerInGame(token) {
    if (this.status !== STATUS.PLAYING) throw ERRORS.gameNotActive();
    const color = this.colorOf(token);
    if (!color) throw ERRORS.notPlayer();
    return color;
  }

  resign(token) {
    const color = this.#requirePlayerInGame(token);
    this.endGame(other(color), 'resignation');
  }

  offerDraw(token) {
    const color = this.#requirePlayerInGame(token);
    if (this.bot) throw ERRORS.badRequest('El bot no acepta tablas.');
    if (this.drawOffer === other(color)) {
      // Ambos quieren tablas: equivale a aceptar.
      this.endGame(null, 'agreement');
      return;
    }
    if (this.drawOffer === color) throw ERRORS.badRequest('Ya ofreciste tablas.');
    this.drawOffer = color;
    this.touch();
    this.notify('drawOffer', { by: color });
  }

  respondDraw(token, accept) {
    const color = this.#requirePlayerInGame(token);
    if (this.drawOffer !== other(color)) throw ERRORS.badRequest('No hay ninguna oferta de tablas pendiente.');
    if (accept) {
      this.endGame(null, 'agreement');
    } else {
      this.drawOffer = null;
      this.touch();
      this.notify('drawOffer', { by: null, declinedBy: color });
    }
  }

  /** Cuando ambos piden revancha se reinicia con los colores intercambiados. */
  requestRematch(token) {
    if (this.status !== STATUS.FINISHED) throw ERRORS.badRequest('La partida aún no termina.');
    const color = this.colorOf(token);
    if (!color) throw ERRORS.notPlayer();
    if (this.activePlayers().length < 2) throw ERRORS.rematchUnavailable();
    this.rematch.add(color);
    if (this.bot) this.rematch.add(this.bot.color); // el bot siempre acepta la revancha
    this.touch();
    if (this.rematch.size < 2) {
      this.notify('rematch', { rematch: [...this.rematch] });
      return;
    }
    [this.players.w, this.players.b] = [this.players.b, this.players.w];
    if (this.bot) this.bot.color = this.players.w.isBot ? 'w' : 'b';
    this.#resetGame();
    this.startGame();
    this.notify('state');
  }

  // --------------------------------------------------------------------- chat

  addChat({ name, role }, text) {
    const message = { id: ++this.chatSeq, name, role, text, ts: this.now() };
    this.chat.push(message);
    if (this.chat.length > this.chatHistory) this.chat.splice(0, this.chat.length - this.chatHistory);
    this.touch();
    this.notify('chat', message);
    return message;
  }

  // -------------------------------------------------------------- serialización

  spectatorsView() {
    const connected = this.connectedSpectators();
    return { count: connected.length, names: connected.map((s) => s.name) };
  }

  #seatView(seat) {
    if (!seat) return null;
    return { name: seat.name, connected: seat.connected, left: seat.left, graceEndsAt: seat.graceEndsAt, isBot: !!seat.isBot };
  }

  /** Estado completo de la sala visto por `viewerToken`. Nunca incluye tokens. */
  snapshot(viewerToken) {
    const role = this.roleOf(viewerToken);
    return {
      code: this.code,
      visibility: this.visibility,
      mode: this.mode,
      bot: this.bot && { level: this.bot.level, label: this.bot.label },
      status: this.status,
      serverTime: this.now(),
      createdAt: this.createdAt,
      you: { role, color: role === 'w' || role === 'b' ? role : null, isHost: this.hostToken === viewerToken },
      players: { w: this.#seatView(this.players.w), b: this.#seatView(this.players.b) },
      spectators: this.spectatorsView(),
      fen: this.game.fen(),
      turn: this.game.turn(),
      inCheck: this.game.inCheck(),
      ply: this.moves.length,
      moves: this.moves.map(({ ply, san, from, to, color, piece, captured, promotion, ts, spentMs }) => ({
        ply, san, from, to, color, piece, captured, promotion, ts, spentMs,
      })),
      lastMove: this.lastMove,
      clock: this.clockSnapshot(),
      result: this.result,
      drawOffer: this.drawOffer,
      rematch: [...this.rematch],
      chat: this.chat,
    };
  }

  /** Resumen para el listado de salas públicas. */
  lobbySummary(lowTimeMs) {
    const clock = this.clockConfig ? this.clockSnapshot() : null;
    const players = this.activePlayers().map((color) => ({
      name: this.players[color].name,
      color,
      connected: this.players[color].connected,
      clockMs: clock ? clock[`${color}Ms`] : null,
    }));
    return {
      code: this.code,
      status: this.status,
      createdAt: this.createdAt,
      players,
      spectators: this.connectedSpectators().length,
      clock: clock && { initialMs: clock.initialMs, incrementMs: clock.incrementMs, running: clock.running },
      turn: this.game.turn(),
      moveNumber: Number(this.game.fen().split(' ')[5]),
      fen: this.game.fen(),
      lastMove: this.lastMove,
      lowTime:
        this.status === STATUS.PLAYING && !!clock && (clock.wMs < lowTimeMs || clock.bMs < lowTimeMs),
    };
  }

  dispose() {
    clearTimeout(this.flagTimer);
    for (const color of ['w', 'b']) clearTimeout(this.players[color]?.graceTimer);
    for (const spectator of this.spectators.values()) clearTimeout(spectator.graceTimer);
  }
}

/**
 * @typedef {object} Seat
 * @property {string} token
 * @property {string} name
 * @property {boolean} connected
 * @property {boolean} left         abandonó la sala definitivamente
 * @property {any} graceTimer
 * @property {number|null} graceEndsAt
 */
