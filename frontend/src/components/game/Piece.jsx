import { PIECE_PATHS } from '../../lib/pieceSet.js';
import { PIECE_NAME } from '../../lib/board.js';

/**
 * Pieza SVG. Blancas: relleno claro con brillo cian. Negras: relleno oscuro con contorno magenta,
 * para distinguirse bien sobre casillas oscuras y claras. `glow={false}` para íconos pequeños.
 */
export default function Piece({ type, color, className = 'h-full w-full', glow = true, label = false }) {
  const white = color === 'w';
  const small = !glow; // íconos de piezas capturadas: contorno más grueso y relleno menos oscuro
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${className} ${glow ? (white ? 'piece-w' : 'piece-b') : ''}`}
      role={label ? 'img' : undefined}
      aria-label={label ? `${PIECE_NAME[type]} ${white ? 'blanco' : 'negro'}` : undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      <path
        d={PIECE_PATHS[type]}
        fill={white ? '#F2F5FA' : small ? '#3A3E57' : '#1A1C28'}
        stroke={white ? '#0D0E13' : '#EC4899'}
        strokeWidth={small ? (white ? 3 : 4.5) : white ? 1.6 : 2.2}
        paintOrder="stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
