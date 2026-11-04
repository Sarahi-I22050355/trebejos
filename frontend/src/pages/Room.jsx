import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import WaitingRoom from '../components/WaitingRoom.jsx';
import GameView from '../components/game/GameView.jsx';
import { useSession } from '../context/SessionContext.jsx';
import { useRoomSounds } from '../hooks/useRoomSounds.js';
import { GameSkeleton, SkeletonStatus } from '../components/Skeleton.jsx';
import { errorText } from '../i18n/errors.js';
import { msg } from '../i18n/core.js';
import { useI18n } from '../i18n/useI18n.js';
import { normalizeCode } from '../lib/code.js';

const ERROR_VIEW = {
  ROOM_NOT_FOUND: {
    icon: 'search_off',
    title: msg('Sala no encontrada'),
    text: msg('Puede que ya se haya cerrado o que el código esté mal escrito. Revisa que tenga 6 caracteres.'),
  },
  INVALID_CODE: { icon: 'link_off', title: msg('Enlace inválido'), text: msg('Ese enlace no tiene un código de sala válido.') },
  ROOM_FULL: { icon: 'group_off', title: msg('La sala está llena'), text: msg('No hay lugar para más personas en esta sala.') },
  ALREADY_IN_GAME: {
    icon: 'swords',
    title: msg('Ya estás en una partida'),
    text: msg('Termina o abandona tu partida actual antes de entrar a otra sala.'),
  },
};

function RoomError({ error }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const view = ERROR_VIEW[error.code] ?? { icon: 'error', title: msg('No se pudo entrar a la sala'), text: errorText(error) };
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-space-xl">
      <div className="glass-raised flex w-full animate-fade-up flex-col items-center gap-space-md p-space-xl text-center" role="alert">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-lowest text-magenta shadow-glow-magenta">
          <Icon name={view.icon} className="!text-4xl" />
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t(view.title)}</h1>
        <p className="text-body-md text-on-surface-variant">{t(view.text)}</p>
        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {error.code === 'ALREADY_IN_GAME' && error.roomCode && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/sala/${error.roomCode}`, { replace: true })}>
              {t('Volver a mi partida')}
            </button>
          )}
          <Link to="/" className="btn btn-secondary btn-sm">
            <Icon name="home" className="!text-lg" /> {t('Ir al inicio')}
          </Link>
          <Link to="/salas" className="btn btn-secondary btn-sm">
            <Icon name="public" className="!text-lg" /> {t('Salas públicas')}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Mientras se entra a la sala: la forma de la partida (tablero y panel) en vez de un mensaje suelto. */
function Connecting({ text }) {
  const { t } = useI18n();
  return (
    <div aria-busy="true">
      <SkeletonStatus>{t(text)}</SkeletonStatus>
      <GameSkeleton />
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
  useI18n(); // vuelve a dibujar la página al cambiar de idioma
  const { status, ready, room, joinRoom } = useSession();
  const [error, setError] = useState(null);
  useRoomSounds(room?.code === code ? room : null);

  useEffect(() => {
    if (!ready || status !== 'online') return undefined;
    if (!code) {
      setError({ code: 'INVALID_CODE' });
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
  return <Connecting text={status === 'online' ? msg('Entrando a la sala…') : msg('Conectando con el servidor…')} />;
}
