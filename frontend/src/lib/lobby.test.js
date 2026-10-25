import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { countByFilter, filterRooms, matchesFilter, matchesQuery, normalizeText, pageList, paginate } from './lobby.js';

const room = (code, over = {}) => ({
  code, status: 'playing', spectators: 0, clock: null,
  players: [{ name: 'Ana Torres', color: 'w' }, { name: 'Beto Ruiz', color: 'b' }], ...over,
});
const clock = (min, inc = 0) => ({ initialMs: min * 60_000, incrementMs: inc * 1000 });

const ROOMS = [
  room('AAAAAA', { status: 'waiting', players: [{ name: 'Mirón', color: 'w' }], clock: clock(1) }),
  room('BBBBBB', { clock: clock(3, 2), spectators: 2 }),
  room('CCCCCC', { clock: clock(5) }),
  room('DDDDDD', { clock: clock(10) }),
  room('EEEEEE', { clock: clock(15, 10), spectators: 1 }),
  room('FFFFFF'),
];

describe('filtros', () => {
  test('cada pestaña selecciona lo que dice', () => {
    const ids = (f) => filterRooms(ROOMS, { filter: f }).map((r) => r.code);
    assert.deepEqual(ids('all'), ROOMS.map((r) => r.code));
    assert.deepEqual(ids('waiting'), ['AAAAAA']);
    assert.deepEqual(ids('bullet'), ['AAAAAA']);
    assert.deepEqual(ids('blitz'), ['BBBBBB', 'CCCCCC']);
    assert.deepEqual(ids('rapid'), ['DDDDDD', 'EEEEEE']); // "Rápida (10+ min)" incluye la clásica
    assert.deepEqual(ids('none'), ['FFFFFF']);
    assert.deepEqual(ids('spectators'), ['BBBBBB', 'EEEEEE']);
    assert.equal(matchesFilter(ROOMS[0], 'desconocido'), true);
  });

  test('los contadores de las pestañas respetan la búsqueda', () => {
    assert.deepEqual(
      [countByFilter(ROOMS).all, countByFilter(ROOMS).blitz, countByFilter(ROOMS).none],
      [6, 2, 1],
    );
    const searched = countByFilter(ROOMS, 'miron');
    assert.equal(searched.all, 1);
    assert.equal(searched.waiting, 1);
    assert.equal(searched.blitz, 0);
  });
});

describe('búsqueda', () => {
  test('por código, con o sin # y guiones, en cualquier caso, y por parte del código', () => {
    assert.equal(matchesQuery(ROOMS[1], 'bbbbbb'), true);
    assert.equal(matchesQuery(ROOMS[1], '#BBB-BBB'), true);
    assert.equal(matchesQuery(ROOMS[1], 'bbb'), true);
    assert.equal(matchesQuery(ROOMS[1], 'CCC'), false);
  });

  test('por nombre de jugador, ignorando acentos y mayúsculas', () => {
    assert.equal(matchesQuery(ROOMS[0], 'MIRON'), true);
    assert.equal(matchesQuery(ROOMS[0], 'mirón'), true);
    assert.equal(matchesQuery(ROOMS[1], 'torres'), true);
    assert.equal(matchesQuery(ROOMS[1], 'ruiz'), true);
    assert.equal(matchesQuery(ROOMS[1], 'zzz'), false);
    assert.equal(matchesQuery(ROOMS[1], '   '), true);
    assert.equal(normalizeText('Ñandú Ágil'), 'nandu agil');
  });

  test('búsqueda y filtro se combinan', () => {
    assert.deepEqual(filterRooms(ROOMS, { query: 'torres', filter: 'blitz' }).map((r) => r.code), ['BBBBBB', 'CCCCCC']);
    assert.deepEqual(filterRooms(ROOMS, { query: 'miron', filter: 'blitz' }), []);
  });
});

describe('paginación', () => {
  const items = Array.from({ length: 14 }, (_, i) => i + 1);
  test('páginas de 6, límites y ajuste de página fuera de rango', () => {
    assert.deepEqual(paginate(items, 1), { items: [1, 2, 3, 4, 5, 6], page: 1, pages: 3, total: 14, from: 1, to: 6 });
    assert.deepEqual(paginate(items, 3).items, [13, 14]);
    assert.equal(paginate(items, 3).from, 13);
    assert.equal(paginate(items, 99).page, 3); // la lista se acortó: se queda en la última
    assert.equal(paginate(items, -4).page, 1);
    assert.deepEqual(paginate([], 1), { items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });

  test('botones del paginador con puntos suspensivos', () => {
    assert.deepEqual(pageList(1, 3), [1, 2, 3]);
    assert.deepEqual(pageList(1, 8), [1, 2, null, 7, 8]);
    assert.deepEqual(pageList(4, 8), [1, 2, 3, 4, 5, null, 7, 8]);
    assert.deepEqual(pageList(8, 8), [1, 2, null, 7, 8]);
    assert.deepEqual(pageList(1, 1), [1]);
  });
});
