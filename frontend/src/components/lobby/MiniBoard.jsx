import { memo, useMemo } from 'react';
import Piece from '../game/Piece.jsx';
import { fileOf, parseFen, rankOf } from '../../lib/board.js';

/** Miniatura del tablero con la posición real de la partida (solo lectura). */
function MiniBoard({ fen, lastMove, className = '' }) {
  const pieces = useMemo(() => parseFen(fen), [fen]);
  const squares = useMemo(() => {
    const list = [];
    for (let rank = 8; rank >= 1; rank--) {
      for (let file = 0; file < 8; file++) list.push({ file, rank, dark: (file + rank - 1) % 2 === 0 });
    }
    return list;
  }, []);
  const lit = new Set(lastMove ? [lastMove.from, lastMove.to] : []);

  return (
    <div
      data-testid="miniboard"
      data-fen={fen}
      role="img"
      aria-label="Posición actual de la partida"
      className={`relative aspect-square overflow-hidden rounded-md shadow-lg ring-1 ring-white/10 ${className}`}
    >
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {squares.map(({ file, rank, dark }) => {
          const name = `${'abcdefgh'[file]}${rank}`;
          return (
            <span
              key={name}
              style={{ background: dark ? '#1E2235' : '#323B54' }}
              className={lit.has(name) ? 'shadow-[inset_0_0_0_100px_rgba(0,240,255,0.25)]' : ''}
            />
          );
        })}
      </div>
      {pieces.map((p) => (
        <span
          key={p.square}
          className="absolute"
          style={{ width: '12.5%', height: '12.5%', left: `${fileOf(p.square) * 12.5}%`, top: `${(8 - rankOf(p.square)) * 12.5}%` }}
        >
          <Piece type={p.type} color={p.color} glow={false} />
        </span>
      ))}
    </div>
  );
}

export default memo(MiniBoard);
