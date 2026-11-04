// Servicio del bot: elige jugadas con Stockfish y NUNCA deja una partida colgada. Si el motor no
// está, tarda, se cae o devuelve una jugada ilegal, juega una jugada legal al azar y lo avisa en el log.
import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';
import { EnginePool } from './EnginePool.js';
import { LEVELS } from './levels.js';

/** Busca el binario: ruta explícita, o `stockfish` en el PATH y en /usr/games (donde lo instala Debian). */
export function findStockfish(explicit) {
  const isExecutable = (file) => {
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  };
  if (explicit) return explicit.includes('/') ? (isExecutable(explicit) ? explicit : null) : findInPath(explicit, isExecutable);
  return findInPath('stockfish', isExecutable);
}

function findInPath(name, isExecutable) {
  const dirs = [...(process.env.PATH ?? '').split(':'), '/usr/games', '/usr/local/bin'];
  for (const dir of dirs) {
    if (dir && isExecutable(path.join(dir, name))) return path.join(dir, name);
  }
  return null;
}

/** "e7e8q" → { from: 'e7', to: 'e8', promotion: 'q' } */
export function parseUci(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

const HINT_PARAMS = { skill: 20, depth: 14, movetimeMs: 500 };

const PIECE_ES = { p: 'el peón', n: 'el caballo', b: 'el alfil', r: 'la torre', q: 'la dama', k: 'el rey' };

/** Explica una jugada en español a partir de la posición: captura, enroque, coronación, jaque… */
export function describeMove(fen, { from, to, promotion }) {
  const game = new Chess(fen);
  const move = game.move({ from, to, promotion });
  let text;
  if (move.flags.includes('k')) text = 'Enroca corto con el rey';
  else if (move.flags.includes('q')) text = 'Enroca largo con el rey';
  else text = `Mueve ${PIECE_ES[move.piece]} de ${move.from} a ${move.to}`;
  if (move.captured) text += ` y captura ${PIECE_ES[move.captured]}`;
  if (move.promotion) text += ` y corónalo a ${PIECE_ES[move.promotion]}`;
  if (game.isCheckmate()) text += ': ¡es jaque mate!';
  else if (game.inCheck()) text += ', dando jaque';
  return { san: move.san, text };
}

function randomLegalMove(fen) {
  const moves = new Chess(fen).moves({ verbose: true });
  if (moves.length === 0) return null;
  const m = moves[Math.floor(Math.random() * moves.length)];
  return { from: m.from, to: m.to, promotion: m.promotion };
}

export class BotService {
  constructor({ config, log = console }) {
    this.config = config;
    this.log = log;
    this.pool = null;
    this.available = false;
    this.engineName = null;
  }

  async start() {
    if (!this.config.botEnabled) {
      this.log.log('[bot] desactivado (BOT_ENABLED=false)');
      return;
    }
    const binary = findStockfish(this.config.stockfishPath);
    if (!binary) {
      this.log.warn('[bot] no se encontró Stockfish: el modo "contra el bot" queda desactivado. Instálalo (apt install stockfish) o define STOCKFISH_PATH.');
      return;
    }
    const pool = new EnginePool({
      path: binary,
      args: this.config.stockfishArgs ?? [],
      size: this.config.botEngines,
      queueTimeoutMs: this.config.botQueueTimeoutMs,
      log: this.log,
    });
    try {
      await pool.start();
    } catch (err) {
      this.log.warn(`[bot] no se pudo iniciar Stockfish (${binary}): ${err.message}`);
      return;
    }
    this.pool = pool;
    this.engineName = pool.engineName;
    this.available = true;
    this.log.log(`[bot] listo: ${this.engineName} (${binary}), ${this.config.botEngines} motor(es)`);
  }

  /**
   * Jugada del bot para `fen` con el nivel `levelId`. Siempre devuelve una jugada legal
   * (a menos que no haya ninguna). `remainingMs` limita el tiempo de pensar si hay reloj.
   */
  async chooseMove(fen, levelId, { remainingMs = null } = {}) {
    const level = LEVELS[levelId];
    const budget = remainingMs == null ? level.movetimeMs : Math.max(30, Math.min(level.movetimeMs, remainingMs / 30));
    return this.#search(fen, { skill: level.skill, depth: level.depth, movetimeMs: Math.round(budget) });
  }

  /**
   * Pista para la práctica guiada: la mejor jugada según el motor a plena fuerza, explicada en
   * español ("Mueve el caballo de g1 a f3, dando jaque"). Igual que chooseMove, nunca falla.
   */
  async hint(fen) {
    const move = await this.#search(fen, HINT_PARAMS);
    return move && { ...move, ...describeMove(fen, move) };
  }

  async #search(fen, { skill, depth, movetimeMs }) {
    try {
      if (!this.available) throw new Error('motor no disponible');
      const uci = await this.pool.search({
        fen, skill, depth, movetimeMs, timeoutMs: movetimeMs + this.config.botGraceMs,
      });
      const move = parseUci(uci);
      const legal = new Chess(fen).moves({ verbose: true });
      if (!legal.some((m) => m.from === move.from && m.to === move.to && (m.promotion ?? undefined) === move.promotion)) {
        throw new Error(`jugada ilegal del motor: ${uci}`);
      }
      return { ...move, source: 'engine' };
    } catch (err) {
      this.log.warn(`[bot] jugada de respaldo (${err.message})`);
      const move = randomLegalMove(fen);
      return move && { ...move, source: 'fallback' };
    }
  }

  close() {
    this.pool?.close();
    this.available = false;
  }
}
