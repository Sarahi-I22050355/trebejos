import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { formatSpent } from '../../lib/clock.js';
import { scrollToReveal, windowRange } from '../../lib/virtual.js';
import { useI18n } from '../../i18n/useI18n.js';

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

// Medidas de una fila (en píxeles): 22 de alto y 2 de separación. Son fijas para poder calcular qué filas se ven sin medirlas.
const ROW_H = 22;
const ROW_PITCH = 24;
const PAD = 12; // el padding (p-3) del contenedor desplazable
const VIRTUALIZE_FROM = 60; // filas (= 120 jugadas): por debajo se dibujan todas; por encima, solo las visibles
const OVERSCAN = 8; // filas extra arriba y abajo para que el desplazamiento rápido no enseñe huecos

/** Una fila "n. blancas negras  tiempo/Jaque". Memoizada: al llegar una jugada solo se redibuja la fila nueva y la que dejó de ser la actual. */
const MoveRow = memo(function MoveRow({ index, white, black, activePly, isLast, onGo }) {
  const { t } = useI18n();
  const cell = (move) =>
    move ? (
      <button
        type="button"
        onClick={() => onGo(move.ply)}
        aria-current={move.ply === activePly ? 'step' : undefined}
        className={`flex-1 rounded px-2 py-0.5 text-left transition-colors ${
          move.ply === activePly
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
    <li className={`flex h-[22px] items-center rounded ${index % 2 === 0 ? 'bg-surface-container-lowest/40' : ''}`}>
      <span className="w-8 shrink-0 pl-2 text-outline">{index + 1}.</span>
      {cell(white)}
      {cell(black)}
      <span className="flex w-24 shrink-0 items-center justify-end gap-2 pr-2 text-body-sm">
        {[white, black].some((m) => m?.san.includes('+')) && <span className="text-label-badge text-error">{t('Jaque')}</span>}
        {isLast ? (
          <span className="rounded bg-primary-container px-1.5 py-0.5 text-[10px] font-bold uppercase text-on-primary-fixed">{t('Actual')}</span>
        ) : (
          <span className="text-outline">{formatSpent((black ?? white).spentMs)}</span>
        )}
      </span>
    </li>
  );
});

/**
 * Notación de la partida en columnas "n. blancas negras" (JetBrains Mono). Pulsar una jugada
 * muestra esa posición; `viewPly === null` es la partida en vivo.
 * En partidas muy largas solo se dibujan las filas visibles (ventana virtual): el DOM no crece con la partida.
 */
export default function MoveList({ moves, viewPly, onView }) {
  const { t } = useI18n();
  const scroller = useRef(null);
  const total = moves.length;
  const current = viewPly ?? total;
  const totalRef = useRef(total);
  totalRef.current = total;

  const rows = [];
  for (let i = 0; i < total; i += 2) rows.push([moves[i], moves[i + 1]]);
  const virtual = rows.length > VIRTUALIZE_FROM;

  // Zona visible del contenedor (solo se usa en modo virtual).
  const [view, setView] = useState({ top: 0, height: 400 });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !virtual) return undefined;
    let frame = 0;
    const read = () => {
      frame = 0;
      setView((v) => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    el.addEventListener('scroll', schedule, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', schedule);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [virtual]);

  // En vivo, la lista sigue a la última jugada. Si se navega por el historial, la fila elegida se mantiene a la vista (en modo virtual
  // podría no estar dibujada; en modo normal el comportamiento de siempre es no moverla).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (viewPly == null) {
      el.scrollTop = el.scrollHeight;
      if (virtual) setView({ top: el.scrollTop, height: el.clientHeight }); // sin esperar al evento de scroll: no se ve el principio un instante
    } else if (virtual) {
      const target = scrollToReveal({ index: Math.floor((Math.max(1, viewPly) - 1) / 2), scrollTop: el.scrollTop, viewHeight: el.clientHeight, pitch: ROW_PITCH, rowHeight: ROW_H, pad: PAD });
      if (target != null) el.scrollTop = target;
    }
  }, [total, viewPly, virtual]);

  const go = useCallback((ply) => onView(ply >= totalRef.current ? null : Math.max(0, ply)), [onView]);
  const goTo = (ply) => go(ply);

  const { first, last, paddingTop, paddingBottom } = virtual
    ? windowRange({ scrollTop: view.top, viewHeight: view.height, count: rows.length, pitch: ROW_PITCH, pad: PAD, overscan: OVERSCAN })
    : { first: 0, last: rows.length, paddingTop: 0, paddingBottom: 0 };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-1">
        <span className="font-mono-move text-[11px] uppercase tracking-widest text-outline">{t('Notación de la partida')}</span>
        <div className="flex items-center">
          <NavButton icon="first_page" label={t('Primera jugada')} onClick={() => goTo(0)} disabled={total === 0 || current === 0} />
          <NavButton icon="chevron_left" label={t('Jugada anterior')} onClick={() => goTo(current - 1)} disabled={total === 0 || current === 0} />
          <NavButton icon="chevron_right" label={t('Jugada siguiente')} onClick={() => goTo(current + 1)} disabled={viewPly == null} />
          <NavButton icon="last_page" label={t('Última jugada')} onClick={() => onView(null)} disabled={viewPly == null} />
        </div>
      </div>

      {viewPly != null && (
        <button
          type="button"
          onClick={() => onView(null)}
          className="flex items-center justify-center gap-2 bg-secondary-container/30 px-3 py-1.5 text-body-sm text-secondary transition-colors hover:bg-secondary-container/50"
        >
          <Icon name="history" className="!text-base" /> {t('Viendo la jugada {n}. Volver a la partida', { n: viewPly })}
        </button>
      )}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="move-list" data-virtual={virtual ? 'true' : undefined}>
        {total === 0 ? (
          <p className="py-6 text-center text-body-sm text-outline">
            {t('Aún no hay jugadas.')}
            <br />
            {t('Las blancas abren la partida.')}
          </p>
        ) : (
          <ol
            className="flex flex-col gap-0.5 font-mono-move text-mono-move"
            style={virtual ? { paddingTop, paddingBottom } : undefined}
          >
            {rows.slice(first, last).map(([white, black], k) => {
              const i = first + k;
              const hasCurrent = white.ply === current || black?.ply === current;
              return (
                <MoveRow
                  key={i}
                  index={i}
                  white={white}
                  black={black}
                  activePly={hasCurrent ? current : null}
                  isLast={hasCurrent && viewPly == null && i === rows.length - 1}
                  onGo={go}
                />
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
