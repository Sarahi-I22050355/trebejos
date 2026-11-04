// Utilidades de FEN y casillas, sin dependencias: las usa hasta la miniatura del listado de salas.
export const FILES = 'abcdefgh';

/** Índices de casilla: file 0..7 (a..h), rank 1..8. */
export const squareName = (file, rank) => `${FILES[file]}${rank}`;
export const fileOf = (square) => FILES.indexOf(square[0]);
export const rankOf = (square) => Number(square[1]);

/** FEN → [{ square, type, color }] */
export function parseFen(fen) {
  const pieces = [];
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
      } else {
        pieces.push({
          square: squareName(file, 8 - i),
          type: ch.toLowerCase(),
          color: ch === ch.toUpperCase() ? 'w' : 'b',
        });
        file += 1;
      }
    }
  });
  return pieces;
}
