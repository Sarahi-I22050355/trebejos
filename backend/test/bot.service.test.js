import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { BotService, findStockfish, parseUci } from '../src/bot/BotService.js';
import { LEVELS, LEVEL_IDS, isLevel } from '../src/bot/levels.js';
import { loadConfig } from '../src/config.js';

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/fake-uci.js');
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const quiet = { log() {}, warn() {} };
const REAL = findStockfish();

const started = [];
async function service(mode, overrides = {}) {
  process.env.FAKE_UCI_MODE = mode;
  const bot = new BotService({
    config: loadConfig({ stockfishPath: FAKE, botEngines: 1, botGraceMs: 400, ...overrides }),
    log: quiet,
  });
  await bot.start();
  started.push(bot);
  return bot;
}
afterEach(() => {
  while (started.length) started.pop().close();
  delete process.env.FAKE_UCI_MODE;
  delete process.env.FAKE_UCI_MARKER;
});

const isLegal = (fen, m) => new Chess(fen).moves({ verbose: true }).some((x) => x.from === m.from && x.to === m.to);

describe('niveles', () => {
  test('hay cuatro niveles ordenados por fuerza y acotados en tiempo', () => {
    assert.deepEqual(LEVEL_IDS, ['beginner', 'intermediate', 'advanced', 'expert']);
    const skills = LEVEL_IDS.map((id) => LEVELS[id].skill);
    assert.deepEqual(skills, [...skills].sort((a, b) => a - b));
    for (const id of LEVEL_IDS) assert.ok(LEVELS[id].movetimeMs + LEVELS[id].minDelayMs <= 2500, `${id} tarda demasiado`);
    assert.equal(isLevel('expert'), true);
    assert.equal(isLevel('toString'), false); // no debe aceptar propiedades heredadas
    assert.equal(isLevel('godlike'), false);
  });

  test('parseUci entiende promociones', () => {
    assert.deepEqual(parseUci('e2e4'), { from: 'e2', to: 'e4', promotion: undefined });
    assert.deepEqual(parseUci('e7e8q'), { from: 'e7', to: 'e8', promotion: 'q' });
  });
});

describe('búsqueda del binario', () => {
  test('ruta explícita válida, inexistente y no ejecutable', () => {
    assert.equal(findStockfish(FAKE), FAKE);
    assert.equal(findStockfish('/no/existe/stockfish'), null);
    const plain = path.join(os.tmpdir(), `no-exec-${process.pid}.txt`);
    fs.writeFileSync(plain, 'x');
    assert.equal(findStockfish(plain), null);
    fs.unlinkSync(plain);
  });
});

describe('respaldo ante fallos del motor (motor falso)', () => {
  test('motor correcto: usa su jugada', async () => {
    const bot = await service('ok');
    assert.equal(bot.available, true);
    assert.equal(bot.engineName, 'FakeFish 1.0');
    const m = await bot.chooseMove(START, 'beginner');
    assert.deepEqual([m.from, m.to, m.source], ['e2', 'e4', 'engine']);
  });

  for (const mode of ['illegal', 'none', 'crash']) {
    test(`motor "${mode}": juega una jugada legal de respaldo y no se cuelga`, async () => {
      const bot = await service(mode);
      const m = await bot.chooseMove(START, 'advanced');
      assert.equal(m.source, 'fallback');
      assert.ok(isLegal(START, m));
    });
  }

  test('motor colgado: vence el tiempo y responde con respaldo', async () => {
    const bot = await service('hang', { botGraceMs: 250 });
    const t = Date.now();
    const m = await bot.chooseMove(START, 'beginner');
    assert.equal(m.source, 'fallback');
    assert.ok(isLegal(START, m));
    assert.ok(Date.now() - t < 2000, 'no debe esperar más de lo previsto');
  });

  test('tras caerse un motor se reemplaza y el siguiente turno vuelve a usar el motor', async () => {
    process.env.FAKE_UCI_MARKER = path.join(os.tmpdir(), `fake-uci-marker-${process.pid}-${Date.now()}`);
    const bot = await service('crash-once');
    const first = await bot.chooseMove(START, 'beginner');
    assert.equal(first.source, 'fallback');
    await new Promise((r) => setTimeout(r, 400)); // el reemplazo arranca en segundo plano
    const second = await bot.chooseMove(START, 'beginner');
    assert.equal(second.source, 'engine');
    fs.rmSync(process.env.FAKE_UCI_MARKER, { force: true });
  });

  test('sin jugadas legales devuelve null (la partida ya habría terminado)', async () => {
    const bot = await service('ok');
    const mated = '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'; // ahogado: negras sin jugadas
    assert.equal(await bot.chooseMove(mated, 'beginner'), null);
  });

  test('si Stockfish no existe el bot queda desactivado pero sigue dando jugadas de respaldo', async () => {
    const bot = await service('ok', { stockfishPath: '/no/existe/stockfish' });
    assert.equal(bot.available, false);
    const m = await bot.chooseMove(START, 'expert');
    assert.equal(m.source, 'fallback');
    assert.ok(isLegal(START, m));
  });

  test('BOT_ENABLED=false lo desactiva', async () => {
    const bot = await service('ok', { botEnabled: false });
    assert.equal(bot.available, false);
  });

  test('con reloj corto limita el tiempo de pensar', async () => {
    const bot = await service('ok');
    const seen = [];
    const original = bot.pool.search.bind(bot.pool);
    bot.pool.search = (job) => (seen.push(job.movetimeMs), original(job));
    await bot.chooseMove(START, 'expert', { remainingMs: 3000 });
    assert.ok(seen[0] <= 100, `con 3 s en el reloj debe pensar ≤100 ms (pensó ${seen[0]})`);
  });
});

describe('Stockfish real', { skip: REAL ? false : 'Stockfish no está instalado' }, () => {
  async function real() {
    const bot = new BotService({ config: loadConfig({ stockfishPath: REAL, botEngines: 1 }), log: quiet });
    await bot.start();
    started.push(bot);
    return bot;
  }

  test('se inicia y responde jugadas legales en todos los niveles dentro del tiempo', async () => {
    const bot = await real();
    assert.equal(bot.available, true);
    assert.match(bot.engineName, /Stockfish/);
    for (const id of LEVEL_IDS) {
      const t = Date.now();
      const m = await bot.chooseMove(START, id);
      assert.equal(m.source, 'engine', id);
      assert.ok(isLegal(START, m), `${id}: ${m.from}${m.to}`);
      assert.ok(Date.now() - t < 3000, `${id} tardó ${Date.now() - t} ms`);
    }
  });

  test('el nivel experto encuentra un mate en uno', async () => {
    const bot = await real();
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const m = await bot.chooseMove(fen, 'expert');
    const g = new Chess(fen);
    g.move(m);
    assert.equal(g.isCheckmate(), true);
  });

  test('corona cuando debe (promoción en la notación UCI)', async () => {
    const bot = await real();
    const fen = '1r5k/P7/8/8/8/8/8/K7 w - - 0 1'; // axb8=D+ gana una torre con jaque
    const m = await bot.chooseMove(fen, 'expert');
    assert.deepEqual([m.from, m.to, m.promotion], ['a7', 'b8', 'q']);
    assert.ok(isLegal(fen, m));
  });

  test('varias búsquedas simultáneas se encolan y todas se resuelven', async () => {
    const bot = await real();
    const results = await Promise.all(Array.from({ length: 6 }, () => bot.chooseMove(START, 'intermediate')));
    assert.equal(results.filter((m) => m.source === 'engine').length, 6);
  });

  test('el nivel experto es claramente más fuerte que el principiante (partidas rápidas)', { timeout: 60000 }, async () => {
    const bot = await real();
    // Experto (blancas) vs principiante (negras): se juegan 40 medias jugadas con tiempos mínimos.
    const g = new Chess();
    for (let i = 0; i < 80 && !g.isGameOver(); i++) {
      const level = g.turn() === 'w' ? 'advanced' : 'beginner';
      g.move(await bot.chooseMove(g.fen(), level));
    }
    const material = (color) => g.board().flat().filter((p) => p && p.color === color)
      .reduce((n, p) => n + { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[p.type], 0);
    const advantage = material('w') - material('b');
    assert.ok(g.isCheckmate() ? g.turn() === 'b' : advantage > 0, `avanzado debería ir ganando (ventaja ${advantage}, mate=${g.isCheckmate()})`);
  });
});
