import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeName, randomName } from './name.js';
import { normalizeCode, extractCode } from './code.js';
import { formatClock, describeClock, clockCategory } from './clock.js';

test('sanitizeName replica las reglas del servidor', () => {
  assert.equal(sanitizeName('  Caballo   Veloz_42 '), 'Caballo Veloz_42');
  assert.equal(sanitizeName('Ñandú-Ágil'), 'Ñandú-Ágil');
  assert.equal(sanitizeName('bad\u0000na​me'), 'badname');
  for (const bad of ['a', 'x'.repeat(21), '<script>', '   ', 'hola!', null, 42]) assert.equal(sanitizeName(bad), null);
});

test('randomName siempre produce un nombre válido', () => {
  for (let i = 0; i < 200; i++) assert.ok(sanitizeName(randomName()), 'nombre aleatorio inválido');
});

test('códigos: normaliza y extrae de enlaces', () => {
  assert.equal(normalizeCode(' #k9x-4m2 '), 'K9X4M2');
  assert.equal(normalizeCode('K9X4M'), null);
  assert.equal(normalizeCode('K9X4M0'), null); // 0 no existe en el alfabeto
  assert.equal(extractCode('https://trebejos.example.com/sala/k9x4m2?s=x'), 'K9X4M2');
  assert.equal(extractCode('k9x4m2'), 'K9X4M2');
  assert.equal(extractCode('https://example.com/otra/cosa'), null);
});

test('relojes', () => {
  assert.equal(formatClock(83_000), '1:23');
  assert.equal(formatClock(3_725_000), '1:02:05');
  assert.equal(formatClock(7_340, { tenths: true }), '0:07.3');
  assert.equal(formatClock(-5), '0:00');
  assert.equal(describeClock({ initialMs: 180_000, incrementMs: 2000 }).short, '3+2');
  assert.equal(describeClock({ initialMs: 30_000, incrementMs: 0 }).short, '30s+0');
  assert.equal(describeClock({ initialMs: 30_000, incrementMs: 0 }).long, '30 s sin incremento');
  assert.equal(describeClock(null).short, 'Sin reloj');
  assert.deepEqual(['60000', '180000', '300000', '600000', '900000'].map((ms) => clockCategory(+ms).label),
    ['Bala', 'Blitz', 'Blitz', 'Rápida', 'Clásica']);
});
