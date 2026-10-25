#!/usr/bin/env node
// Motor UCI de mentira para probar los fallos del bot. Modo por FAKE_UCI_MODE:
//   ok          responde siempre e2e4        illegal   responde una jugada imposible (a1a1)
//   none        responde "(none)"            hang      nunca responde al `go`
//   crash       muere al recibir `go`        crash-once  muere la primera vez (marca en FAKE_UCI_MARKER)
import fs from 'node:fs';
import readline from 'node:readline';

const mode = process.env.FAKE_UCI_MODE ?? 'ok';
const out = (line) => process.stdout.write(`${line}\n`);

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (line === 'uci') {
    out('id name FakeFish 1.0');
    out('uciok');
  } else if (line === 'isready') {
    out('readyok');
  } else if (line.startsWith('go')) {
    if (mode === 'hang') return;
    if (mode === 'crash') process.exit(1);
    if (mode === 'crash-once') {
      const marker = process.env.FAKE_UCI_MARKER;
      if (!fs.existsSync(marker)) {
        fs.writeFileSync(marker, 'x');
        process.exit(1);
      }
    }
    out(mode === 'illegal' ? 'bestmove a1a1' : mode === 'none' ? 'bestmove (none)' : 'bestmove e2e4');
  } else if (line === 'quit') {
    process.exit(0);
  }
});
