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
    try {
      if (!this.available) throw new Error('motor no disponible');
      const movetimeMs = Math.round(budget);
      const uci = await this.pool.search({
        fen, skill: level.skill, depth: level.depth, movetimeMs, timeoutMs: movetimeMs + this.config.botGraceMs,
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
