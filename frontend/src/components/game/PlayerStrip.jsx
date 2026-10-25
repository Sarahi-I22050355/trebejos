import Avatar from '../Avatar.jsx';
import Icon from '../Icon.jsx';
import Piece from './Piece.jsx';
import { formatClock } from '../../lib/clock.js';

const LOW_TIME_MS = 10_000;

/** Reloj en cápsula: JetBrains Mono (cifras de ancho fijo) con estados activo / tiempo bajo / inactivo. */
export function ClockFace({ ms, active, finished }) {
  const low = active && ms < LOW_TIME_MS;
  return (
    <div
      data-testid={`clock-${active ? 'active' : 'idle'}`}
      className={`flex min-w-[6.5rem] items-center justify-center gap-2 rounded-lg px-3 py-1.5 transition-all ${
        low
          ? 'animate-pulse-magenta bg-surface-container-lowest text-magenta'
          : active
            ? 'bg-surface-container-lowest text-primary-container shadow-glow-cyan ring-1 ring-primary-container/60'
            : `bg-surface-container-highest text-on-surface-variant ${finished ? 'opacity-70' : 'opacity-60'}`
      }`}
    >
      <Icon name={active ? 'timer' : 'hourglass_top'} className={`!text-base ${active ? '' : 'text-outline-variant'}`} />
      <span className="font-mono-timer text-mono-timer font-bold tracking-wider tabular-nums">{formatClock(ms, { tenths: low })}</span>
    </div>
  );
}

/** Piezas capturadas (pequeñas, solapadas) y ventaja de material. */
function Captured({ pieces, capturedColor, advantage }) {
  if (pieces.length === 0 && !advantage) return <span className="h-4" />;
  return (
    <span className="flex items-center gap-1.5" title="Piezas capturadas">
      <span className="flex items-center">
        {pieces.map((type, i) => (
          <Piece key={`${type}${i}`} type={type} color={capturedColor} glow={false} className={`h-4 w-4 ${i ? '-ml-1.5' : ''}`} />
        ))}
      </span>
      {advantage > 0 && <span className="font-mono-move text-body-sm font-bold text-primary-container">+{advantage}</span>}
    </span>
  );
}

export default function PlayerStrip({ seat, color, isYou, active, clockMs, gameOver, captured, advantage }) {
  const away = seat && !seat.connected && !seat.left;
  const name = seat?.name ?? '—';
  return (
    <div
      data-testid={`strip-${color}`}
      className={`relative flex items-center justify-between gap-3 overflow-hidden rounded-xl px-3 py-2 sm:px-space-md ${
        active ? 'bg-surface-container-high shadow-lg' : 'bg-surface-container-low/90'
      } hairline`}
    >
      {active && <span className="absolute inset-y-0 left-0 w-1.5 bg-primary-container shadow-[0_0_12px_#00f0ff]" />}
      <div className="flex min-w-0 items-center gap-2.5 pl-1 sm:gap-3">
        <div className="relative">
          <Avatar name={name} size={44} className="shadow-md" />
          <span
            className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-surface-container-low ${
              color === 'w' ? 'bg-white' : 'bg-surface-container-lowest ring-1 ring-white/40'
            }`}
            title={color === 'w' ? 'Blancas' : 'Negras'}
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-headline-sm text-headline-sm text-on-surface">{name}</span>
            {isYou && <span className="rounded bg-primary-container/15 px-1.5 py-0.5 font-headline-sm text-label-badge uppercase text-primary-container">Tú</span>}
            {active && !gameOver && (
              <span className="animate-pulse rounded-full bg-primary-container/20 px-2 py-0.5 font-headline-sm text-label-badge font-bold uppercase tracking-wider text-primary-container">
                {isYou ? 'Tu turno' : 'Su turno'}
              </span>
            )}
            {away && (
              <span className="flex items-center gap-1 rounded-full bg-magenta/15 px-2 py-0.5 font-headline-sm text-label-badge font-bold uppercase tracking-wider text-magenta">
                <Icon name="wifi_off" className="!text-sm" /> Desconectado
              </span>
            )}
            {seat?.left && <span className="font-headline-sm text-label-badge uppercase tracking-wider text-outline">Se fue</span>}
          </div>
          <Captured pieces={captured} capturedColor={color === 'w' ? 'b' : 'w'} advantage={advantage} />
        </div>
      </div>
      {clockMs != null && <ClockFace ms={clockMs} active={active && !gameOver} finished={gameOver} />}
    </div>
  );
}
