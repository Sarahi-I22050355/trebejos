import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollToReveal, windowRange } from './virtual.js';

const base = { count: 100, pitch: 24, pad: 12, overscan: 2 };

test('arriba del todo se dibujan las primeras filas más el margen', () => {
  const w = windowRange({ ...base, scrollTop: 0, viewHeight: 240 });
  assert.equal(w.first, 0);
  assert.equal(w.last, Math.ceil((240 - 12) / 24) + 2); // 10 visibles + 2 de margen
  assert.equal(w.paddingTop, 0);
});

test('abajo del todo se dibujan las últimas filas y no se pasa del final', () => {
  const total = 12 + 100 * 24;
  const w = windowRange({ ...base, scrollTop: total - 240, viewHeight: 240 });
  assert.equal(w.last, 100);
  assert.ok(w.first > 80 && w.first < 95, `first=${w.first}`);
  assert.equal(w.paddingBottom, 0);
});

test('el relleno compensa las filas que no se dibujan: la lista mide siempre lo mismo', () => {
  for (const scrollTop of [0, 100, 500, 1234, 2000, 2400]) {
    const w = windowRange({ ...base, scrollTop, viewHeight: 300 });
    assert.equal(w.paddingTop + (w.last - w.first) * base.pitch + w.paddingBottom, base.count * base.pitch, `scrollTop=${scrollTop}`);
  }
});

test('la zona visible siempre queda cubierta por las filas dibujadas', () => {
  for (let scrollTop = 0; scrollTop <= 12 + 100 * 24; scrollTop += 37) {
    const w = windowRange({ ...base, overscan: 0, scrollTop, viewHeight: 300 });
    const visibleFirst = Math.max(0, Math.floor((scrollTop - 12) / 24));
    const visibleLast = Math.min(99, Math.floor((scrollTop + 300 - 12 - 1) / 24));
    assert.ok(w.first <= visibleFirst && w.last > visibleLast, `scrollTop=${scrollTop}: [${w.first}, ${w.last}) no cubre ${visibleFirst}..${visibleLast}`);
  }
});

test('casos límite: lista vacía, una fila, desplazamiento mayor que la lista', () => {
  assert.deepEqual(windowRange({ ...base, count: 0, scrollTop: 0, viewHeight: 300 }), { first: 0, last: 0, paddingTop: 0, paddingBottom: 0 });
  const one = windowRange({ ...base, count: 1, scrollTop: 0, viewHeight: 300 });
  assert.deepEqual([one.first, one.last], [0, 1]);
  const past = windowRange({ ...base, count: 10, scrollTop: 99999, viewHeight: 300 });
  assert.equal(past.last, 10);
  assert.ok(past.first <= past.last);
});

test('scrollToReveal solo mueve la lista si la fila no se ve', () => {
  const a = { pitch: 24, rowHeight: 22, pad: 12, viewHeight: 240 };
  assert.equal(scrollToReveal({ ...a, index: 3, scrollTop: 0 }), null); // fila 3 a 84 px: visible
  assert.equal(scrollToReveal({ ...a, index: 60, scrollTop: 0 }), 12 + 60 * 24 - 120); // lejos: la centra
  assert.equal(scrollToReveal({ ...a, index: 0, scrollTop: 500 }), 0); // arriba del todo: no negativo
});
