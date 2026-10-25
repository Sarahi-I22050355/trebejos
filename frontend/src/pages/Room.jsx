import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import WaitingRoom from '../components/WaitingRoom.jsx';
import GameView from '../components/game/GameView.jsx';
import { useSession } from '../context/SessionContext.jsx';
import { useRoomSounds } from '../hooks/useRoomSounds.js';
import { normalizeCode } from '../lib/code.js';

const ERROR_VIEW = {
  ROOM_NOT_FOUND: {
    icon: 'search_off',
    title: 'Sala no encontrada',
    text: 'Puede que ya se haya cerrado o que el código esté mal escrito. Revisa que tenga 6 caracteres.',
  },
  INVALID_CODE: { icon: 'link_off', title: 'Enlace inválido', text: 'Ese enlace no tiene un código de sala válido.' },
  ROOM_FULL: { icon: 'group_off', title: 'La sala está llena', text: 'No hay lugar para más personas en esta sala.' },
  ALREADY_IN_GAME: {
    icon: 'swords',
    title: 'Ya estás en una partida',
    text: 'Termina o abandona tu partida actual antes de entrar a otra sala.',
  },
};

function RoomError({ error }) {
  const navigate = useNavigate();
  const view = ERROR_VIEW[error.code] ?? { icon: 'error', title: 'No se pudo entrar a la sala', text: error.message };
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-space-xl">
      <div className="glass-raised flex w-full animate-fade-up flex-col items-center gap-space-md p-space-xl text-center" role="alert">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-lowest text-magenta shadow-glow-magenta">
          <Icon name={view.icon} className="!text-4xl" />
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{view.title}</h1>
        <p className="text-body-md text-on-surface-variant">{view.text}</p>
        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {error.code === 'ALREADY_IN_GAME' && error.roomCode && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/sala/${error.roomCode}`, { replace: true })}>
              Volver a mi partida
            </button>
          )}
          <Link to="/" className="btn btn-secondary btn-sm">
            <Icon name="home" className="!text-lg" /> Ir al inicio
          </Link>
          <Link to="/salas" className="btn btn-secondary btn-sm">
            <Icon name="public" className="!text-lg" /> Salas públicas
          </Link>
        </div>
      </div>
    </div>
  );
}

function Connecting({ text }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-space-xl" role="status">
      <div className="glass flex w-full flex-col items-center gap-space-md p-space-xl text-center">
        <Icon name="progress_activity" className="animate-spin !text-4xl text-primary-container" />
        <p className="font-headline-sm text-headline-sm text-on-surface">{text}</p>
      </div>
    </div>
  );
}

/**
 * /sala/:code — sirve tanto para el anfitrión (que llega tras crear) como para quien abre un
 * enlace de invitación: si todavía no está dentro de la sala, intenta entrar con el código.
 */
export default function RoomPage() {
  const { code: rawCode } = useParams();
  const code = normalizeCode(rawCode);
  const { status, ready, room, joinRoom } = useSession();
  const [error, setError] = useState(null);
  useRoomSounds(room?.code === code ? room : null);

  useEffect(() => {
    if (!ready || status !== 'online') return undefined;
    if (!code) {
      setError({ code: 'INVALID_CODE', message: 'Código inválido.' });
      return undefined;
    }
    if (room?.code === code) {
      setError(null);
      return undefined;
    }
    let cancelled = false;
    joinRoom(code).then((res) => {
      if (!cancelled && !res.ok) setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, status, code, room?.code, joinRoom]);

  if (room && room.code === code) return room.status === 'waiting' ? <WaitingRoom room={room} /> : <GameView room={room} />;
  if (error) return <RoomError error={error} />;
  return <Connecting text={status === 'online' ? 'Entrando a la sala…' : 'Conectando con el servidor…'} />;
}
