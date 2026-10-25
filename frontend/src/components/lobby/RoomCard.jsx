import Icon from '../Icon.jsx';
import PingDot from '../PingDot.jsx';
import MiniBoard from './MiniBoard.jsx';
import { describeClock, formatClock } from '../../lib/clock.js';

const LOW_TIME_MS = 10_000;

/** Tiempo restante de `color` ahora mismo: lo que dijo el servidor menos lo transcurrido si su reloj corre. */
function remainingMs(room, color, elapsedMs) {
  const player = room.players.find((p) => p.color === color);
  if (!player || player.clockMs == null) return null;
  const running = room.status === 'playing' && room.clock?.running === color;
  return Math.max(0, player.clockMs - (running ? elapsedMs : 0));
}

function PlayerLine({ room, color, elapsedMs }) {
  const player = room.players.find((p) => p.color === color);
  const ms = remainingMs(room, color, elapsedMs);
  const running = room.status === 'playing' && room.clock?.running === color;
  const low = ms != null && room.status === 'playing' && ms < LOW_TIME_MS;

  if (!player) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-surface-container-lowest/60 p-space-sm" data-testid="empty-seat">
        <div className="flex min-w-0 items-center gap-space-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-highest text-outline">
            <Icon name="person_add" className="!text-base" />
          </span>
          <span className="truncate text-body-md italic text-outline">Esperando retador…</span>
        </div>
        <span className="font-label-badge text-label-badge uppercase tracking-wider text-primary">Vacante</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container p-space-sm">
      <div className="flex min-w-0 items-center gap-space-sm">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${color === 'w' ? 'bg-white' : 'bg-surface-container-lowest ring-1 ring-white/40'}`} aria-label={color === 'w' ? 'Blancas' : 'Negras'} />
        <span className="truncate font-headline-sm text-body-md text-on-surface">{player.name}</span>
        {!player.connected && <Icon name="wifi_off" className="!text-sm text-magenta" label="Desconectado" />}
      </div>
      {ms != null && (
        <span
          data-testid={`clock-${color}`}
          className={`shrink-0 font-mono-timer text-body-md font-bold tabular-nums ${
            low ? 'animate-pulse text-magenta' : running ? 'text-primary' : 'text-outline'
          }`}
        >
          {formatClock(ms)}
        </span>
      )}
    </div>
  );
}

/** Insignia de estado: esperando rival / en juego / tiempo bajo. */
export function StatusBadge({ room }) {
  if (room.status === 'waiting') {
    return (
      <span className="flex items-center gap-space-xs whitespace-nowrap rounded-md bg-primary-container/20 px-2 py-0.5 text-primary" data-testid="status">
        <PingDot size="h-2 w-2" />
        <span className="font-label-badge text-label-badge font-bold uppercase">1 / 2 cupos</span>
      </span>
    );
  }
  if (room.lowTime) {
    return (
      <span className="flex animate-pulse-magenta items-center gap-space-xs whitespace-nowrap rounded-md bg-error-container/40 px-2 py-0.5 text-error" data-testid="status">
        <PingDot size="h-2 w-2" className="bg-error" />
        <span className="font-label-badge text-label-badge font-bold uppercase">Tiempo bajo</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-space-xs whitespace-nowrap rounded-md bg-surface-container-lowest/80 px-2 py-0.5 text-error backdrop-blur-md" data-testid="status">
      <PingDot size="h-2 w-2" className="bg-error" />
      <span className="font-label-badge text-label-badge uppercase">En juego · Mov {room.moveNumber}</span>
    </span>
  );
}

export function ClockBadge({ room }) {
  const info = describeClock(room.clock && { initialMs: room.clock.initialMs, incrementMs: room.clock.incrementMs });
  return (
    <span className="flex items-center gap-1 rounded bg-surface-container-high/90 px-2 py-0.5 text-body-sm font-semibold text-on-surface backdrop-blur-sm" data-testid="clock-badge">
      <Icon name={info.category.icon} className="!text-sm text-primary" />
      {room.clock ? `${info.category.label} ${info.short}` : 'Sin reloj'}
    </span>
  );
}

export function JoinButton({ room, mine, onJoin, compact = false }) {
  const waiting = room.status === 'waiting';
  const base = compact ? 'btn-sm whitespace-nowrap' : '';
  if (mine) {
    return (
      <button type="button" className={`btn btn-secondary w-full ${base}`} onClick={() => onJoin(room)} data-testid="btn-join">
        <Icon name="undo" className="!text-lg" /> Volver a tu sala
      </button>
    );
  }
  return waiting ? (
    <button type="button" className={`btn btn-primary w-full ${base}`} onClick={() => onJoin(room)} data-testid="btn-join">
      <Icon name="swords" className="!text-lg" /> Unirse a la partida
    </button>
  ) : (
    <button type="button" className={`btn btn-secondary w-full !text-primary ${base}`} onClick={() => onJoin(room)} data-testid="btn-join">
      <Icon name="play_circle" className="!text-lg" /> Ver como espectador
    </button>
  );
}

/** Tarjeta de una sala pública (vista de cuadrícula). */
export default function RoomCard({ room, elapsedMs, mine, onJoin }) {
  return (
    <article
      data-testid="room-card"
      data-code={room.code}
      data-status={room.status}
      className={`glass group flex animate-fade-up flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow-cyan ${
        room.status === 'waiting' ? '!bg-surface-container/80' : ''
      } ${mine ? 'ring-1 ring-primary-container/60' : ''}`}
    >
      <div className="relative flex h-48 items-center justify-center bg-surface-container-lowest">
        <MiniBoard fen={room.fen} lastMove={room.lastMove} className="h-[10.5rem] opacity-90 transition-opacity group-hover:opacity-100" />
        <div className="absolute inset-x-space-sm top-space-sm flex items-center justify-between">
          <span className="rounded-md bg-surface-container-lowest/80 px-2.5 py-1 font-mono-move text-label-badge uppercase tracking-widest text-primary-container backdrop-blur-md" data-testid="code">
            #{room.code}
          </span>
          <StatusBadge room={room} />
        </div>
        <div className="absolute inset-x-space-sm bottom-space-sm flex items-center justify-between">
          <ClockBadge room={room} />
          <span className="flex items-center gap-1 rounded bg-surface-container-lowest/90 px-2 py-0.5 font-mono-move text-body-sm text-on-surface-variant backdrop-blur-sm" title="Espectadores" data-testid="spectators">
            <Icon name="visibility" className={`!text-sm ${room.spectators ? 'text-primary-container' : ''}`} /> {room.spectators}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-space-md p-space-md">
        <div className="flex flex-col gap-space-sm">
          <PlayerLine room={room} color="w" elapsedMs={elapsedMs} />
          <PlayerLine room={room} color="b" elapsedMs={elapsedMs} />
        </div>
        <JoinButton room={room} mine={mine} onJoin={onJoin} />
      </div>
    </article>
  );
}

/** Fila de una sala pública (vista de lista, más compacta). */
export function RoomRow({ room, elapsedMs, mine, onJoin }) {
  const white = room.players.find((p) => p.color === 'w');
  const black = room.players.find((p) => p.color === 'b');
  return (
    <article
      data-testid="room-card"
      data-code={room.code}
      data-status={room.status}
      className={`glass flex animate-fade-up flex-col gap-space-sm p-space-sm sm:flex-row sm:items-center sm:gap-space-md ${mine ? 'ring-1 ring-primary-container/60' : ''}`}
    >
      <div className="flex items-center gap-space-sm sm:w-64 sm:shrink-0">
        <span className="rounded-md bg-surface-container-lowest/80 px-2.5 py-1 font-mono-move text-label-badge uppercase tracking-widest text-primary-container" data-testid="code">#{room.code}</span>
        <StatusBadge room={room} />
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-space-md gap-y-1 font-headline-sm text-body-md text-on-surface">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full bg-white" />
          <span className="truncate">{white?.name ?? <i className="text-outline">Esperando retador…</i>}</span>
        </span>
        <span className="text-outline">vs</span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full bg-surface-container-lowest ring-1 ring-white/50" />
          <span className="truncate">{black?.name ?? <i className="text-outline">Esperando retador…</i>}</span>
        </span>
      </div>
      <div className="flex items-center gap-space-sm sm:shrink-0">
        <ClockBadge room={room} />
        <span className="flex items-center gap-1 font-mono-move text-body-sm text-on-surface-variant" title="Espectadores" data-testid="spectators">
          <Icon name="visibility" className="!text-sm" /> {room.spectators}
        </span>
        <span className="hidden font-mono-timer text-body-sm tabular-nums text-primary lg:inline">
          {room.status === 'playing' && room.clock ? `${formatClock(remainingMs(room, 'w', elapsedMs) ?? 0)} · ${formatClock(remainingMs(room, 'b', elapsedMs) ?? 0)}` : ''}
        </span>
      </div>
      <div className="sm:w-56 sm:shrink-0">
        <JoinButton room={room} mine={mine} onJoin={onJoin} compact />
      </div>
    </article>
  );
}
