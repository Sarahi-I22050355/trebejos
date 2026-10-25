import Icon from './Icon.jsx';
import { useServerNow } from '../hooks/useNow.js';
import { formatClock } from '../lib/clock.js';

/**
 * Aviso cuando un jugador se desconecta: cuenta regresiva de la ventana de gracia.
 * Si se agota, el servidor da la partida por abandonada.
 */
export default function PresenceBanner({ room }) {
  const now = useServerNow(250);
  const mine = room.you.color;

  const away = ['w', 'b']
    .map((color) => ({ color, seat: room.players[color] }))
    .filter(({ color, seat }) => seat && !seat.connected && color !== mine);

  if (away.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      {away.map(({ color, seat }) => {
        if (seat.left) {
          return (
            <div key={color} className="flex items-center gap-3 rounded-lg bg-surface-container-lowest/80 px-4 py-3 text-body-md text-on-surface-variant hairline">
              <Icon name="logout" className="text-outline" />
              {seat.name} abandonó la sala.
            </div>
          );
        }
        const remaining = seat.graceEndsAt ? seat.graceEndsAt - now : null;
        return (
          <div
            key={color}
            className="flex animate-pulse-magenta flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-container-lowest/90 px-4 py-3"
          >
            <Icon name="wifi_off" className="text-magenta" />
            <span className="flex-1 text-body-md text-on-surface">
              <strong className="font-semibold">{seat.name}</strong> se desconectó. Si no vuelve a tiempo, la partida se dará por abandonada.
            </span>
            {remaining != null && (
              <span className="font-mono-timer text-headline-sm font-bold text-magenta" aria-label="Tiempo restante para volver">
                {formatClock(remaining)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
