import Avatar from '../Avatar.jsx';
import BotAvatar from '../BotAvatar.jsx';
import Icon from '../Icon.jsx';
import { memo, useEffect } from 'react';
import Piece from './Piece.jsx';
import { formatClock } from '../../lib/clock.js';
import { play } from '../../lib/sound.js';
import { useServerNow } from '../../hooks/useNow.js';
import { useI18n } from '../../i18n/useI18n.js';

const LOW_TIME_MS = 10_000;

/**
 * Reloj en cápsula: JetBrains Mono (cifras de ancho fijo) con estados activo / tiempo bajo / inactivo.
 * Es el único que se dibuja varias veces por segundo: lleva su propio temporizador (solo mientras su reloj corre),
 * así que el tablero, las jugadas y el chat no se vuelven a dibujar con cada décima.
 * `clock`: { baseMs (lo que quedaba en serverTime), running (su reloj corre), serverTime }.
 * `warn`: es el reloj del jugador local → avisa con sonido cuando le queda poco.
 */
export function ClockFace({ clock, active, finished, warn = false }) {
  const serverNow = useServerNow(clock.running ? 100 : null);
  const ms = Math.max(0, clock.baseMs - (clock.running ? Math.max(0, serverNow - clock.serverTime) : 0));
  const low = active && ms < LOW_TIME_MS;

  // Aviso de poco tiempo: un pitido a los 10 s y uno por segundo en los últimos 5.
  const secondsLeft = warn && clock.running ? Math.ceil(ms / 1000) : null;
  useEffect(() => {
    if (secondsLeft == null || secondsLeft <= 0) return;
    if (secondsLeft === 10) play('warn');
    else if (secondsLeft <= 5) play('tick');
  }, [secondsLeft]);

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
  const { t } = useI18n();
  if (pieces.length === 0 && !advantage) return <span className="h-4" />;
  return (
    <span className="flex items-center gap-1.5" title={t('Piezas capturadas')}>
      <span className="flex items-center">
        {pieces.map((type, i) => (
          <Piece key={`${type}${i}`} type={type} color={capturedColor} glow={false} className={`h-4 w-4 ${i ? '-ml-1.5' : ''}`} />
        ))}
      </span>
      {advantage > 0 && <span className="font-mono-move text-body-sm font-bold text-primary-container">+{advantage}</span>}
    </span>
  );
}

function PlayerStrip({ seat, color, isYou, active, clock, gameOver, captured, advantage }) {
  const { t } = useI18n();
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
          {seat?.isBot ? <BotAvatar size={44} className="shadow-md" /> : <Avatar name={name} size={44} className="shadow-md" />}
          <span
            className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-surface-container-low ${
              color === 'w' ? 'bg-white' : 'bg-surface-container-lowest ring-1 ring-white/40'
            }`}
            title={color === 'w' ? t('Blancas') : t('Negras')}
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-headline-sm text-headline-sm text-on-surface">{name}</span>
            {isYou && <span className="rounded bg-primary-container/15 px-1.5 py-0.5 font-headline-sm text-label-badge uppercase text-primary-container">{t('Tú')}</span>}
            {seat?.isBot && <span className="rounded bg-secondary-container/40 px-1.5 py-0.5 font-headline-sm text-label-badge uppercase text-secondary-fixed">{t('Bot')}</span>}
            {active && !gameOver && seat?.isBot && (
              <span data-testid="bot-thinking" className="flex items-center gap-1.5 rounded-full bg-secondary-container/30 px-2 py-0.5 font-headline-sm text-label-badge font-bold uppercase tracking-wider text-secondary">
                {t('Pensando')}
                <span className="inline-flex gap-0.5" aria-hidden="true">
                  {[0, 0.15, 0.3].map((d) => (
                    <span key={d} className="h-1 w-1 animate-bounce rounded-full bg-secondary" style={{ animationDelay: `${d}s` }} />
                  ))}
                </span>
              </span>
            )}
            {active && !gameOver && !seat?.isBot && (
              <span className="animate-pulse rounded-full bg-primary-container/20 px-2 py-0.5 font-headline-sm text-label-badge font-bold uppercase tracking-wider text-primary-container">
                {isYou ? t('Tu turno') : t('Su turno')}
              </span>
            )}
            {away && (
              <span className="flex items-center gap-1 rounded-full bg-magenta/15 px-2 py-0.5 font-headline-sm text-label-badge font-bold uppercase tracking-wider text-magenta">
                <Icon name="wifi_off" className="!text-sm" /> {t('Desconectado')}
              </span>
            )}
            {seat?.left && <span className="font-headline-sm text-label-badge uppercase tracking-wider text-outline">{t('Se fue')}</span>}
          </div>
          <Captured pieces={captured} capturedColor={color === 'w' ? 'b' : 'w'} advantage={advantage} />
        </div>
      </div>
      {clock && <ClockFace clock={clock} active={active && !gameOver} finished={gameOver} warn={isYou} />}
    </div>
  );
}

export default memo(PlayerStrip);
