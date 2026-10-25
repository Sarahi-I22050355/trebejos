import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUND_NAMES, isMuted, play, setMuted, soundForResult, soundForSan } from './sound.js';

test('cada jugada elige su sonido', () => {
  assert.equal(soundForSan('e4'), 'move');
  assert.equal(soundForSan('Nf3'), 'move');
  assert.equal(soundForSan('exd5'), 'capture');
  assert.equal(soundForSan('Qxf7+'), 'check');
  assert.equal(soundForSan('Bb5+'), 'check');
  assert.equal(soundForSan('Qh5#'), 'move'); // el mate lo remata el sonido del resultado
  assert.equal(soundForSan('O-O'), 'castle');
  assert.equal(soundForSan('O-O-O'), 'castle');
  assert.equal(soundForSan('O-O+'), 'check');
  assert.equal(soundForSan('e8=Q'), 'promote');
  assert.equal(soundForSan('exd8=Q+'), 'promote');
  assert.equal(soundForSan(undefined), 'move');
});

test('el sonido del final depende de quién mira', () => {
  assert.equal(soundForResult({ winner: 'w', reason: 'checkmate' }, 'w'), 'win');
  assert.equal(soundForResult({ winner: 'w', reason: 'checkmate' }, 'b'), 'lose');
  assert.equal(soundForResult({ winner: 'b', reason: 'timeout' }, null), 'end');
  assert.equal(soundForResult({ winner: null, reason: 'stalemate' }, 'w'), 'draw');
  assert.equal(soundForResult(null, 'w'), 'draw');
});

test('todos los sonidos usados existen', () => {
  for (const name of ['move', 'capture', 'castle', 'check', 'promote', 'start', 'win', 'lose', 'draw', 'end', 'warn', 'tick', 'chat', 'notify', 'success', 'error']) {
    assert.ok(SOUND_NAMES.includes(name), name);
  }
});

test('sin navegador ni audio, reproducir y silenciar no falla', () => {
  const events = [];
  globalThis.window = { dispatchEvent: (e) => events.push(e.detail), localStorage: undefined };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
  assert.equal(isMuted(), false);
  play('move');
  assert.deepEqual(events, ['move']);
  setMuted(true);
  assert.equal(isMuted(), true);
  play('capture');
  assert.deepEqual(events, ['move'], 'en silencio no suena nada');
  setMuted(false);
  assert.equal(isMuted(), false);
  play('nombre-inexistente');
  assert.ok(!events.includes('nombre-inexistente'));
});
