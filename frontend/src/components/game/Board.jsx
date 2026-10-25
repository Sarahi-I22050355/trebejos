// Tablero interactivo: casillas, piezas animadas, jugadas legales, selección por clic, arrastre
// (ratón y táctil) y selector de promoción. No conoce el servidor: avisa con `onMove`.
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import Piece from './Piece.jsx';
import {
  FILES, START_FEN, fileOf, kingSquare, legalMovesFrom, parseFen, rankOf, reconcile, squareName,
} from '../../lib/board.js';

const PROMOTIONS = ['q', 'r', 'b', 'n'];
const PROMOTION_LABEL = { q: 'Dama', r: 'Torre', b: 'Alfil', n: 'Caballo' };
const DRAG_THRESHOLD = 5; // px antes de considerar que es un arrastre y no un clic
const MARK_STYLE = {
  hint: 'ring-secondary bg-secondary/25 animate-pulse',
  success: 'ring-primary-container bg-primary-container/25',
  wrong: 'ring-magenta bg-magenta/30',
};

/** Puntos de una flecha entre dos celdas (coordenadas 0–8). El caballo hace una "L": 2 casillas y luego 1. */
function arrowPoints(a, b) {
  const [x1, y1] = [a.x + 0.5, a.y + 0.5];
  const [x2, y2] = [b.x + 0.5, b.y + 0.5];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const isL = (Math.abs(dx) === 2 && Math.abs(dy) === 1) || (Math.abs(dx) === 1 && Math.abs(dy) === 2);
  // Acorta el último tramo para que la punta quede dentro de la casilla destino, sin tapar la pieza.
  const trim = (px, py, qx, qy, by = 0.28) => {
    const len = Math.hypot(qx - px, qy - py) || 1;
    return [qx - ((qx - px) / len) * by, qy - ((qy - py) / len) * by];
  };
  if (isL) {
    const [cx, cy] = Math.abs(dx) === 2 ? [x2, y1] : [x1, y2]; // primero el tramo largo
    const [ex, ey] = trim(cx, cy, x2, y2);
    return `${x1},${y1} ${cx},${cy} ${ex},${ey}`;
  }
  const [ex, ey] = trim(x1, y1, x2, y2);
  return `${x1},${y1} ${ex},${ey}`;
}

/**
 * @param {object} props
 * @param {string} props.fen
 * @param {'w'|'b'} props.orientation  color que se ve abajo
 * @param {{from:string,to:string}|null} props.lastMove
 * @param {boolean} props.showCheck    resaltar al rey del bando que mueve
 * @param {boolean} props.checkBadge   además, mostrar la insignia «¡Jaque!» junto al rey
 * @param {boolean} props.interactive  el usuario puede mover ahora
 * @param {'w'|'b'|null} props.myColor
 * @param {(from:string,to:string,promotion?:string)=>void} props.onMove
 * @param {(from:string,to:string|null)=>void} [props.onIllegal]  intento de jugada imposible (lecciones);
 *        `to === null` = se tocó una pieza que no se puede mover en este ejercicio
 * @param {string[]|null} [props.selectable]  casillas de las piezas que se pueden coger (null = todas las propias)
 * @param {string|null} [props.demoSquare]    muestra los movimientos legales de esa pieza sin seleccionarla
 * @param {{from:string,to:string}[]} [props.arrows]  flechas (el caballo se dibuja en L)
 * @param {{square:string,tone:'hint'|'success'|'wrong'}[]} [props.marks]  casillas resaltadas
 */
export default function Board({
  fen, orientation = 'w', lastMove, showCheck, checkBadge = false, interactive, myColor, onMove,
  onIllegal, selectable = null, demoSquare = null, arrows = [], marks = [], children,
}) {
  const gridRef = useRef(null);
  const prev = useRef({ pieces: [], fen: null });
  const down = useRef(null);
  const [selected, setSelected] = useState(null);
  const [drag, setDrag] = useState(null); // { id, x, y, size }
  const [promo, setPromo] = useState(null); // { from, to }

  // Piezas con identidad estable entre posiciones (para animar el deslizamiento).
  const pieces = useMemo(() => {
    const resetting = fen === START_FEN && prev.current.fen !== null && prev.current.fen !== START_FEN;
    const next = reconcile(prev.current.pieces, parseFen(fen), lastMove, resetting);
    prev.current = { pieces: next, fen };
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, lastMove?.from, lastMove?.to]);

  // La selección no sobrevive a un cambio de posición ni a perder el turno.
  useEffect(() => {
    setSelected(null);
    setPromo(null);
    setDrag(null);
    down.current = null;
  }, [fen, interactive]);

  const turn = fen.split(' ')[1];
  const checkSquare = showCheck ? kingSquare(fen, turn) : null;
  const legal = useMemo(() => (selected && interactive ? legalMovesFrom(fen, selected) : []), [selected, fen, interactive]);
  const targets = useMemo(() => new Map(legal.map((m) => [m.to, m])), [legal]);
  // Lo que se pinta (puntos y anillos): la selección del usuario o, si no hay, la demostración.
  const shownMoves = useMemo(
    () => (legal.length ? legal : demoSquare ? legalMovesFrom(fen, demoSquare) : []),
    [legal, demoSquare, fen],
  );
  const shown = useMemo(() => new Map(shownMoves.map((m) => [m.to, m])), [shownMoves]);
  const markTone = useMemo(() => new Map(marks.map((m) => [m.square, m.tone])), [marks]);

  const toCell = (square) => {
    const f = fileOf(square);
    const r = rankOf(square);
    return orientation === 'w' ? { x: f, y: 8 - r } : { x: 7 - f, y: r - 1 };
  };
  const toSquare = (x, y) => (orientation === 'w' ? squareName(x, 8 - y) : squareName(7 - x, y + 1));

  function squareFromPointer(e) {
    const rect = gridRef.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
    return x < 0 || x > 7 || y < 0 || y > 7 ? null : toSquare(x, y);
  }

  function attemptMove(from, to) {
    const options = legalMovesFrom(fen, from).filter((m) => m.to === to);
    if (options.length === 0) {
      onIllegal?.(from, to);
      setSelected(null);
      return false;
    }
    if (options.some((m) => m.promotion)) {
      setPromo({ from, to });
      return true;
    }
    setSelected(null);
    onMove(from, to);
    return true;
  }

  function handlePointerDown(e) {
    if (!interactive || promo || e.button > 0) return;
    const square = squareFromPointer(e);
    if (!square) return;
    if (selected && targets.has(square)) {
      attemptMove(selected, square);
      return;
    }
    const mine = pieces.find((p) => p.square === square && p.color === myColor);
    if (mine && selectable && !selectable.includes(square)) {
      setSelected(null);
      onIllegal?.(square, null); // pieza que no toca mover en este ejercicio
      return;
    }
    if (!mine) {
      if (selected && square !== selected) onIllegal?.(selected, square);
      setSelected(null);
      return;
    }
    down.current = { square, id: mine.id, wasSelected: square === selected, startX: e.clientX, startY: e.clientY, dragging: false };
    setSelected(square);
    gridRef.current.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e) {
    const d = down.current;
    if (!d) return;
    if (!d.dragging && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) d.dragging = true;
    if (d.dragging) {
      const rect = gridRef.current.getBoundingClientRect();
      setDrag({ id: d.id, x: e.clientX - rect.left, y: e.clientY - rect.top, size: rect.width / 8 });
    }
  }

  function handlePointerUp(e) {
    const d = down.current;
    down.current = null;
    if (!d) return;
    if (d.dragging) {
      setDrag(null);
      const square = squareFromPointer(e);
      if (square && square !== d.square) attemptMove(d.square, square);
    } else if (d.wasSelected) {
      setSelected(null); // segundo clic sobre la pieza seleccionada = deseleccionar
    }
  }

  function handlePointerCancel() {
    down.current = null;
    setDrag(null);
  }

  const squares = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const square = toSquare(x, y);
      const dark = (fileOf(square) + rankOf(square) - 1) % 2 === 0;
      const isTarget = shown.has(square);
      const isCapture = isTarget && (shown.get(square).flags.includes('c') || shown.get(square).flags.includes('e'));
      const tone = markTone.get(square);
      const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
      squares.push(
        <div key={square} data-square={square} data-legal={isTarget ? (isCapture ? 'capture' : 'move') : undefined} className="relative" style={{ background: dark ? '#1E2235' : '#323B54' }}>
          {isLast && <span className="absolute inset-0 bg-primary-container/25 shadow-[inset_0_0_18px_rgba(0,240,255,0.4)]" />}
          {tone && <span data-mark={tone} className={`absolute inset-0 ring-[3px] ring-inset ${MARK_STYLE[tone]}`} />}
          {selected === square && <span className="absolute inset-0 bg-primary-container/35 ring-2 ring-inset ring-primary-container" />}
          {checkSquare === square && <span className="absolute inset-0 animate-pulse bg-magenta/45 shadow-[inset_0_0_20px_rgba(236,72,153,0.7)]" />}
          {isTarget && !isCapture && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="h-[30%] w-[30%] rounded-full bg-primary-container/80 shadow-[0_0_10px_rgba(0,240,255,0.7)]" />
            </span>
          )}
          {isCapture && <span className="absolute inset-[6%] rounded-full ring-[3px] ring-inset ring-magenta/80 shadow-[0_0_12px_rgba(236,72,153,0.6)]" />}
          {x === 0 && (
            <span className="pointer-events-none absolute left-[5%] top-[3%] font-mono-move text-[10px] font-bold leading-none text-outline sm:text-[11px]">
              {rankOf(square)}
            </span>
          )}
          {y === 7 && (
            <span className="pointer-events-none absolute bottom-[3%] right-[6%] font-mono-move text-[10px] font-bold leading-none text-outline sm:text-[11px]">
              {FILES[fileOf(square)]}
            </span>
          )}
        </div>,
      );
    }
  }

  return (
    <div className="relative aspect-square w-full select-none rounded-xl bg-surface-container-lowest p-1.5 shadow-2xl sm:p-2 md:p-3">
      <div
        ref={gridRef}
        data-testid="board"
        data-orientation={orientation}
        data-interactive={String(!!interactive)}
        role="img"
        aria-label="Tablero de ajedrez"
        className={`relative h-full w-full touch-none overflow-hidden rounded-lg ${interactive ? 'cursor-pointer' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="grid h-full w-full grid-cols-8 grid-rows-8">{squares}</div>

        <div className="pointer-events-none absolute inset-0">
          {pieces.map((p) => {
            const { x, y } = toCell(p.square);
            const dragging = drag?.id === p.id;
            const style = dragging
              ? { width: drag.size, height: drag.size, transform: `translate(${drag.x - drag.size / 2}px, ${drag.y - drag.size / 2}px) scale(1.12)`, zIndex: 40 }
              : { width: '12.5%', height: '12.5%', transform: `translate(${x * 100}%, ${y * 100}%)`, transition: 'transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1)', zIndex: 10 };
            return (
              <div key={p.id} data-piece={`${p.color}${p.type}`} data-on={p.square} className="absolute left-0 top-0" style={style}>
                <Piece type={p.type} color={p.color} />
              </div>
            );
          })}
        </div>

        {arrows.length > 0 && (
          <svg viewBox="0 0 8 8" className="pointer-events-none absolute inset-0 z-20 h-full w-full" data-testid="arrows" aria-hidden="true">
            <defs>
              <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="2.6" refY="2" orient="auto">
                <polygon points="0 0, 4 2, 0 4" fill="#00F0FF" />
              </marker>
            </defs>
            {arrows.map((a, i) => (
              <polyline
                key={`${a.from}${a.to}${i}`}
                data-arrow={`${a.from}${a.to}`}
                points={arrowPoints(toCell(a.from), toCell(a.to))}
                fill="none"
                stroke="#00F0FF"
                strokeWidth="0.09"
                strokeDasharray="0.22 0.14"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.9"
                markerEnd="url(#arrowhead)"
                style={{ filter: 'drop-shadow(0 0 0.08px #00F0FF)' }}
              />
            ))}
          </svg>
        )}

        {checkBadge && checkSquare && (() => {
          const { x, y } = toCell(checkSquare);
          const below = y === 0; // junto al borde superior la insignia va debajo del rey
          const align = x <= 1 ? '0%' : x >= 6 ? '-100%' : '-50%'; // sin salirse del tablero
          const anchor = x <= 1 ? x * 12.5 : x >= 6 ? (x + 1) * 12.5 : (x + 0.5) * 12.5;
          return (
            <div
              data-testid="check-badge"
              className="pointer-events-none absolute z-30"
              style={{ left: `${anchor}%`, top: `${(below ? y + 1 : y) * 12.5}%`, transform: `translate(${align}, ${below ? '2px' : 'calc(-100% - 2px)'})` }}
            >
              <div className="flex animate-bounce items-center gap-1 whitespace-nowrap rounded-full bg-surface-container-lowest/95 px-2.5 py-0.5 text-magenta shadow-[0_0_24px_rgba(236,72,153,0.55)]">
                <Icon name="crisis_alert" className="!text-sm animate-pulse" />
                <span className="font-headline-sm text-label-badge font-bold uppercase tracking-widest">¡Jaque!</span>
              </div>
            </div>
          );
        })()}

        {promo && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-surface-container-lowest/70 backdrop-blur-sm"
            onPointerDown={(e) => {
              e.stopPropagation();
              setPromo(null);
              setSelected(null);
            }}
          >
            <div className="glass-raised flex flex-col items-center gap-2 p-3" onPointerDown={(e) => e.stopPropagation()}>
              <span className="font-headline-sm text-label-badge uppercase tracking-[0.08em] text-on-surface-variant">Coronar peón</span>
              <div className="flex gap-2">
                {PROMOTIONS.map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-label={PROMOTION_LABEL[type]}
                    title={PROMOTION_LABEL[type]}
                    onClick={() => {
                      onMove(promo.from, promo.to, type);
                      setPromo(null);
                      setSelected(null);
                    }}
                    className="h-14 w-14 rounded-lg bg-surface-container p-1.5 transition-all hover:bg-surface-container-highest hover:shadow-glow-cyan sm:h-16 sm:w-16"
                  >
                    <Piece type={type} color={myColor ?? 'w'} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
