import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import PingDot from './PingDot.jsx';
import Modal from './Modal.jsx';
import PresenceBanner from './PresenceBanner.jsx';
import { ColorChip } from './WaitingRoom.jsx';
import { useSession } from '../context/SessionContext.jsx';
import { describeClock } from '../lib/clock.js';

function PlayerCard({ color, seat, isYou }) {
  const away = seat && !seat.connected && !seat.left;
  return (
    <div className="relative flex items-center gap-space-md overflow-hidden rounded-xl bg-surface-container-high/80 p-space-md hairline">
      <div className={`absolute left-0 top-0 h-full w-1.5 ${away ? 'bg-magenta' : 'bg-primary-container'}`} />
      <Avatar name={seat?.name ?? '?'} size={56} className="!rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-headline-sm text-headline-sm text-on-surface">{seat?.name ?? '—'}</span>
          {isYou && <span className="rounded bg-surface-container-lowest px-1.5 py-0.5 font-headline-sm text-label-badge uppercase text-primary-container">(Tú)</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ColorChip color={color} />
          <span className={`flex items-center gap-1.5 text-label-badge font-headline-sm uppercase tracking-wider ${away ? 'text-magenta' : 'text-primary'}`}>
            <span className={`h-2 w-2 rounded-full ${away ? 'bg-magenta' : 'bg-primary-container'}`} />
            {seat?.left ? 'Se fue' : away ? 'Desconectado' : 'Conectado'}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Vista de una sala con partida en curso o terminada.
 * El tablero interactivo, los relojes y las jugadas llegan en la fase c; aquí ya se ve el
 * estado real que manda el servidor (jugadores, presencia, espectadores) y se puede salir.
 */
export default function RoomLive({ room }) {
  const navigate = useNavigate();
  const { leaveRoom } = useSession();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const spectating = room.you.role === 'spectator';
  const playing = room.status === 'playing';
  const clock = describeClock(room.clock.enabled ? room.clock : null);

  function leave() {
    setLeaveOpen(false);
    navigate('/', { replace: true });
    leaveRoom();
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-space-md px-4 py-space-lg md:px-margin">
      <div className="glass flex flex-wrap items-center justify-between gap-space-sm px-space-md py-space-sm">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className={`badge ${playing ? 'bg-error-container text-on-error-container' : 'bg-surface-container-highest text-on-surface-variant'}`}>
            {playing && <PingDot className="bg-error" />}
            {playing ? 'En juego' : 'Partida terminada'}
          </span>
          <span className="font-mono-move text-mono-move text-on-surface-variant">#{room.code}</span>
          <span className="flex items-center gap-1.5 font-mono-move text-mono-move text-on-surface-variant">
            <Icon name={clock.category.icon} className="!text-base text-primary" /> {clock.category.label === 'Sin reloj' ? 'Sin reloj' : `${clock.category.label} ${clock.short}`}
          </span>
        </div>
        <span className="flex items-center gap-1.5 font-mono-move text-mono-move text-on-surface-variant" title="Espectadores">
          <Icon name="visibility" className="!text-base text-secondary" /> {room.spectators.count}
        </span>
      </div>

      <PresenceBanner room={room} />

      <section className="glass-raised flex flex-col gap-space-md p-space-md sm:p-space-lg" data-testid="room-live">
        <div className="flex items-center gap-space-sm">
          <Icon name={spectating ? 'visibility' : 'swords'} className="text-primary-container" />
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            {spectating ? 'Estás viendo esta partida' : playing ? '¡Empieza la partida!' : 'La partida terminó'}
          </h1>
        </div>
        <div className="grid gap-space-sm md:grid-cols-2">
          <PlayerCard color="w" seat={room.players.w} isYou={room.you.color === 'w'} />
          <PlayerCard color="b" seat={room.players.b} isYou={room.you.color === 'b'} />
        </div>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-surface-container-lowest/60 px-4 py-10 text-center">
          <Icon name="grid_view" className="!text-4xl text-outline" />
          <p className="font-headline-sm text-body-lg text-on-surface-variant">El tablero se activa en la siguiente fase</p>
          <p className="max-w-md text-body-sm text-outline">
            La conexión ya funciona: el servidor tiene la partida en marcha y recordará tu lugar si recargas la página.
          </p>
          <code className="mt-1 max-w-full overflow-x-auto whitespace-nowrap rounded bg-surface-container px-2 py-1 font-mono-move text-body-sm text-outline" data-testid="fen">
            {room.fen}
          </code>
        </div>
        <div className="flex justify-end">
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setLeaveOpen(true)}>
            <Icon name="logout" className="!text-lg" /> {spectating ? 'Salir' : playing ? 'Abandonar partida' : 'Salir de la sala'}
          </button>
        </div>
      </section>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={spectating || !playing ? '¿Salir de la sala?' : '¿Abandonar la partida?'}
        icon="logout"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLeaveOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={leave}>
              {spectating || !playing ? 'Salir' : 'Abandonar'}
            </button>
          </>
        }
      >
        <p className="text-body-md text-on-surface-variant">
          {spectating || !playing ? 'Podrás volver con el código de la sala mientras siga abierta.' : 'Salir en plena partida cuenta como rendirte. Tu rival ganará.'}
        </p>
      </Modal>
    </div>
  );
}
