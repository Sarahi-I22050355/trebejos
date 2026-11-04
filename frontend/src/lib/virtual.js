// Cálculo de la "ventana virtual" de una lista larga con filas de alto fijo: qué filas hay que dibujar según el desplazamiento.

/**
 * Filas a dibujar para la zona visible, con `overscan` filas de margen por arriba y por abajo.
 * Devuelve `{ first, last }` (última exclusiva) y el relleno de arriba y de abajo para que la lista mida lo mismo que
 * si estuvieran todas las filas.
 * `pad` es el espacio del contenedor antes de la primera fila.
 */
export function windowRange({ scrollTop, viewHeight, count, pitch, pad = 0, overscan = 0 }) {
  const first = Math.max(0, Math.floor((scrollTop - pad) / pitch) - overscan);
  const last = Math.min(count, Math.ceil((scrollTop + viewHeight - pad) / pitch) + overscan);
  const safeFirst = Math.min(first, count);
  const safeLast = Math.max(safeFirst, last);
  return { first: safeFirst, last: safeLast, paddingTop: safeFirst * pitch, paddingBottom: (count - safeLast) * pitch };
}

/** Desplazamiento que deja la fila `index` centrada, o `null` si ya está a la vista. */
export function scrollToReveal({ index, scrollTop, viewHeight, pitch, rowHeight, pad = 0 }) {
  const top = pad + index * pitch;
  if (top >= scrollTop && top + rowHeight <= scrollTop + viewHeight) return null;
  return Math.max(0, top - viewHeight / 2);
}
