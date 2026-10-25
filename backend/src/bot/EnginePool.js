// Reparte las búsquedas entre unos pocos procesos de Stockfish (cada jugada es independiente:
// se manda la posición completa), con una cola si todos están ocupados. Si un motor falla se
// reemplaza por uno nuevo; la búsqueda que falló la resuelve el llamador con una jugada de respaldo.
import { StockfishEngine } from './StockfishEngine.js';

export class EnginePool {
  constructor({ path, args = [], size = 2, queueTimeoutMs = 8000, log = console }) {
    this.path = path;
    this.args = args;
    this.size = size;
    this.queueTimeoutMs = queueTimeoutMs;
    this.log = log;
    this.idle = [];
    this.all = new Set();
    this.queue = [];
    this.closed = false;
    this.engineName = null;
  }

  /** Arranca el primer motor (si falla, el bot queda no disponible) y el resto en segundo plano. */
  async start() {
    const first = await this.#spawn();
    this.engineName = first.name;
    this.idle.push(first);
    for (let i = 1; i < this.size; i++) {
      this.#spawn().then((e) => {
        if (this.closed) return e.kill();
        this.idle.push(e);
        this.#pump();
      }).catch((err) => this.log.warn(`[bot] no se pudo iniciar un motor adicional: ${err.message}`));
    }
  }

  async #spawn() {
    const engine = new StockfishEngine({ path: this.path, args: this.args });
    this.all.add(engine);
    try {
      await engine.start();
    } catch (err) {
      this.all.delete(engine);
      engine.kill();
      throw err;
    }
    return engine;
  }

  get workers() {
    return this.all.size;
  }

  search(job) {
    return new Promise((resolve, reject) => {
      const entry = { job, resolve, reject };
      entry.timer = setTimeout(() => {
        this.queue = this.queue.filter((q) => q !== entry);
        reject(new Error('cola de motores saturada'));
      }, this.queueTimeoutMs);
      entry.timer.unref?.();
      this.queue.push(entry);
      this.#pump();
    });
  }

  #pump() {
    while (!this.closed && this.queue.length && this.idle.length) {
      const engine = this.idle.pop();
      const entry = this.queue.shift();
      clearTimeout(entry.timer);
      engine.search(entry.job).then(
        (move) => {
          entry.resolve(move);
          this.idle.push(engine);
          this.#pump();
        },
        (err) => {
          entry.reject(err);
          this.#replace(engine);
        },
      );
    }
  }

  async #replace(broken) {
    this.all.delete(broken);
    broken.kill();
    if (this.closed) return;
    try {
      const engine = await this.#spawn();
      if (this.closed) return engine.kill(); // el pool se cerró mientras arrancaba: no dejarlo huérfano
      this.idle.push(engine);
      this.#pump();
    } catch (err) {
      this.log.warn(`[bot] no se pudo reemplazar el motor: ${err.message}`);
    }
  }

  close() {
    this.closed = true;
    for (const q of this.queue) {
      clearTimeout(q.timer);
      q.reject(new Error('cerrando'));
    }
    this.queue = [];
    for (const e of this.all) e.kill();
    this.all.clear();
    this.idle = [];
  }
}
