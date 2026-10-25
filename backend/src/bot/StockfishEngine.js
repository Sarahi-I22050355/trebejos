// Un proceso de Stockfish hablando UCI por stdin/stdout. Solo sabe pedir "la mejor jugada para
// esta posición con estos límites"; la cola y el reparto entre partidas los hace EnginePool.
import { spawn } from 'node:child_process';
import readline from 'node:readline';

export class StockfishEngine {
  constructor({ path, args = [], startTimeoutMs = 8000 }) {
    this.path = path;
    this.args = args;
    this.startTimeoutMs = startTimeoutMs;
    this.proc = null;
    this.alive = false;
    this.name = null; // "Stockfish 17", según `id name`
    this.waiters = [];
  }

  async start() {
    this.proc = spawn(this.path, this.args, { stdio: ['pipe', 'pipe', 'ignore'] });
    this.alive = true;
    this.proc.on('error', (err) => this.#die(err));
    this.proc.on('exit', (code, signal) => this.#die(new Error(`el motor terminó (${signal ?? code})`)));
    this.proc.stdin.on('error', () => {}); // EPIPE si el proceso ya murió: lo gestiona 'exit'
    readline.createInterface({ input: this.proc.stdout }).on('line', (line) => this.#onLine(line.trim()));

    // Se espera en serie (nunca dos promesas a la vez): si el motor muere en pleno arranque,
    // solo rechaza la que alguien está esperando y no queda ninguna colgando sin manejar.
    const uciok = this.#waitFor((l) => l === 'uciok', this.startTimeoutMs, 'uciok');
    this.#send('uci');
    await uciok;
    this.#send('setoption name Threads value 1');
    this.#send('setoption name Hash value 16');
    const ready = this.#waitFor((l) => l === 'readyok', this.startTimeoutMs, 'readyok');
    this.#send('isready');
    await ready;
  }

  /**
   * Mejor jugada para `fen`. Devuelve texto UCI ("e2e4", "e7e8q").
   * Rechaza si el motor no responde a tiempo o muere.
   */
  async search({ fen, skill, depth, movetimeMs, timeoutMs = movetimeMs + 4000 }) {
    if (!this.alive) throw new Error('el motor no está activo');
    this.#send(`setoption name Skill Level value ${skill}`);
    this.#send(`position fen ${fen}`);
    const reply = this.#waitFor((l) => l.startsWith('bestmove'), timeoutMs, 'bestmove');
    this.#send(`go ${depth ? `depth ${depth} ` : ''}movetime ${movetimeMs}`);
    const move = (await reply).split(/\s+/)[1];
    if (!move || move === '(none)') throw new Error('el motor no encontró jugada');
    return move;
  }

  kill() {
    this.alive = false;
    this.proc?.kill('SIGKILL');
  }

  // ------------------------------------------------------------------ interno
  #send(line) {
    if (this.alive) this.proc.stdin.write(`${line}\n`);
  }

  #onLine(line) {
    if (line.startsWith('id name ')) this.name = line.slice('id name '.length);
    this.waiters = this.waiters.filter((w) => {
      if (!w.test(line)) return true;
      clearTimeout(w.timer);
      w.resolve(line);
      return false;
    });
  }

  #waitFor(test, timeoutMs, label) {
    return new Promise((resolve, reject) => {
      const waiter = { test, resolve, reject };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error(`el motor no respondió (${label})`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  #die(err) {
    this.alive = false;
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) {
      clearTimeout(w.timer);
      w.reject(err);
    }
  }
}
