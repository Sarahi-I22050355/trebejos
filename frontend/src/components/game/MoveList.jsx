import { useEffect, useRef } from 'react';
import Icon from '../Icon.jsx';
import { formatSpent } from '../../lib/clock.js';

function NavButton({ icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant"
    >
      <Icon name={icon} className="!text-lg" />
    </button>
  );
}

/**
 * Notación de la partida en columnas "n. blancas negras" (JetBrains Mono). Pulsar una jugada
 * muestra esa posición; `viewPly === null` es la partida en vivo.
 */
export default function MoveList({ moves, viewPly, onView }) {
  const endRef = useRef(null);
  const total = moves.length;
  const current = viewPly ?? total;

  useEffect(() => {
    if (viewPly == null) endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [total, viewPly]);

  const rows = [];
  for (let i = 0; i < total; i += 2) rows.push([moves[i], moves[i + 1]]);

  const go = (ply) => onView(ply >= total ? null : Math.max(0, ply));

  const cell = (move) =>
    move ? (
      <button
        type="button"
        onClick={() => go(move.ply)}
        aria-current={move.ply === current ? 'step' : undefined}
        className={`flex-1 rounded px-2 py-0.5 text-left transition-colors ${
          move.ply === current
            ? 'bg-primary-container/20 font-bold text-primary-container'
            : 'text-on-surface hover:bg-surface-container-high'
        }`}
      >
        {move.san}
      </button>
    ) : (
      <span className="flex-1" />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-1">
        <span className="font-mono-move text-[11px] uppercase tracking-widest text-outline">Notación de la partida</span>
        <div className="flex items-center">
          <NavButton icon="first_page" label="Primera jugada" onClick={() => go(0)} disabled={total === 0 || current === 0} />
          <NavButton icon="chevron_left" label="Jugada anterior" onClick={() => go(current - 1)} disabled={total === 0 || current === 0} />
          <NavButton icon="chevron_right" label="Jugada siguiente" onClick={() => go(current + 1)} disabled={viewPly == null} />
          <NavButton icon="last_page" label="Última jugada" onClick={() => onView(null)} disabled={viewPly == null} />
        </div>
      </div>

      {viewPly != null && (
        <button
          type="button"
          onClick={() => onView(null)}
          className="flex items-center justify-center gap-2 bg-secondary-container/30 px-3 py-1.5 text-body-sm text-secondary transition-colors hover:bg-secondary-container/50"
        >
          <Icon name="history" className="!text-base" /> Viendo la jugada {viewPly}. Volver a la partida
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="move-list">
        {total === 0 ? (
          <p className="py-6 text-center text-body-sm text-outline">Aún no hay jugadas.<br />Las blancas abren la partida.</p>
        ) : (
          <ol className="flex flex-col gap-0.5 font-mono-move text-mono-move">
            {rows.map(([w, b], i) => (
              <li key={i} className={`flex items-center rounded ${i % 2 === 0 ? 'bg-surface-container-lowest/40' : ''}`}>
                <span className="w-8 shrink-0 pl-2 text-outline">{i + 1}.</span>
                {cell(w)}
                {cell(b)}
                <span className="flex w-24 shrink-0 items-center justify-end gap-2 pr-2 text-body-sm">
                  {[w, b].some((m) => m?.san.includes('+')) && <span className="text-label-badge text-error">Jaque</span>}
                  {[w, b].some((m) => m?.ply === current) && viewPly == null && i === rows.length - 1 ? (
                    <span className="rounded bg-primary-container px-1.5 py-0.5 text-[10px] font-bold uppercase text-on-primary-fixed">Actual</span>
                  ) : (
                    <span className="text-outline">{formatSpent((b ?? w).spentMs)}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
