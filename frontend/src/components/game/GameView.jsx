// Vista completa de una partida (jugador o espectador): tablero, relojes, jugadas, comandos.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import PlayerStrip from './PlayerStrip.jsx';
import MoveList from './MoveList.jsx';
import GameResult from './GameResult.jsx';
import Commands, { DrawOffer } from './Commands.jsx';
import Icon from '../Icon.jsx';
import Modal from '../Modal.jsx';
import PingDot from '../PingDot.jsx';
import PresenceBanner from '../PresenceBanner.jsx';
import { useSession } from '../../context/SessionContext.jsx';
import { useToast } from '../Toasts.jsx';
import { useServerNow } from '../../hooks/useNow.js';
import { capturedBy, describeResult, positionAt } from '../../lib/board.js';
import { describeClock } from '../../lib/clock.js';
import { copyText } from '../../lib/clipboard.js';
import { roomLink } from '../../lib/code.js';

const other = (c) => (c === 'w' ? 'b' : 'w');

export default function GameView({ room }) {
  const navigate = useNavigate();
  const { move, resign, offerDraw, respondDraw, leaveRoom } = useSession();
  const { notify } = useToast();

  const myColor = room.you.color;
  const isPlayer = !!myColor;
  const playing = room.status === 'playing';
  const clock = room.clock;
  const serverNow = useServerNow(clock.enabled && playing ? 100 : 1000);

  const [flipped, setFlipped] = useState(false);
  const [viewPly, setViewPly] = useState(null); // null = partida en vivo
  const [pending, setPending] = useState(null); // jugada propia mostrada antes de que el servidor la confirme
  const [resignOpen, setResignOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);

  const live = viewPly == null;
  const bottom = flipped ? other(myColor ?? 'w') : myColor ?? 'w';
  const top = other(bottom);

  // El servidor confirmó (o cambió) la posición: ya no hace falta la jugada provisional.
  useEffect(() => {
    setPending(null);
  }, [room.ply, room.status]);
  useEffect(() => {
    setResultDismissed(false);
  }, [room.status]);

  const viewFen = useMemo(() => (live ? room.fen : positionAt(room.moves, viewPly)), [live, room.fen, room.moves, viewPly]);
  const displayFen = pending && live ? pending.fen : viewFen;
  const displayLast =
    pending && live
      ? pending.lastMove
      : live
        ? room.lastMove
        : viewPly > 0
          ? { from: room.moves[viewPly - 1].from, to: room.moves[viewPly - 1].to }
          : null;
  const interactive = isPlayer && playing && live && !pending && room.turn === myColor;
  const inCheck = live && !pending && room.inCheck;

  // Navegación del historial con el teclado.
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      const total = room.moves.length;
      const current = viewPly ?? total;
      const go = (ply) => setViewPly(ply >= total ? null : Math.max(0, ply));
      if (e.key === 'ArrowLeft') go(current - 1);
      else if (e.key === 'ArrowRight') go(current + 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') setViewPly(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [room.moves.length, viewPly]);

  async function handleMove(from, to, promotion) {
    try {
      const game = new Chess(room.fen);
      game.move({ from, to, promotion });
      setPending({ fen: game.fen(), lastMove: { from, to }, ply: room.ply });
    } catch {
      return; // el tablero solo ofrece jugadas legales; por si acaso
    }
    const res = await move(from, to, promotion);
    if (!res.ok) {
      setPending(null);
      notify(res.error.message, 'error');
    }
  }

  const remaining = (color) => {
    if (!clock.enabled) return null;
    let ms = clock[`${color}Ms`];
    if (playing && clock.running === color) ms -= serverNow - clock.serverTime;
    return Math.max(0, ms);
  };

  const captured = capturedBy(room.moves);
  const summary = room.status === 'finished' ? describeResult(room.result, room.players, myColor) : null;
  const clockInfo = describeClock(clock.enabled ? clock : null);
  const lastSan = room.moves.at(-1)?.san;

  function leave() {
    setLeaveOpen(false);
    navigate('/', { replace: true });
    leaveRoom();
  }

  async function doResign() {
    setResignOpen(false);
    const res = await resign();
    if (!res.ok) notify(res.error.message, 'error');
  }

  async function doDraw() {
    const res = await offerDraw();
    if (res.ok) notify('Oferta de tablas enviada.', 'info');
    else notify(res.error.message, 'error');
  }

  async function answerDraw(accept) {
    const res = await respondDraw(accept);
    if (!res.ok) notify(res.error.message, 'error');
  }

  const strip = (color) => (
    <PlayerStrip
      seat={room.players[color]}
      color={color}
      isYou={myColor === color}
      active={playing && room.turn === color}
      clockMs={remaining(color)}
      gameOver={!playing}
      captured={captured[color]}
      advantage={color === 'w' ? Math.max(captured.diff, 0) : Math.max(-captured.diff, 0)}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-space-sm px-3 py-space-md md:px-margin">
      <div className="glass flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-space-md py-space-sm">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className={`badge ${playing ? 'bg-error-container text-on-error-container' : 'bg-surface-container-highest text-on-surface-variant'}`}>
            {playing && <PingDot className="bg-error" />}
            {playing ? 'En juego' : 'Partida terminada'}
          </span>
          <span className="font-mono-move text-mono-move text-on-surface-variant">#{room.code}</span>
          <span className="flex items-center gap-1.5 font-mono-move text-mono-move text-on-surface-variant">
            <Icon name={clockInfo.category.icon} className="!text-base text-primary" />
            {clock.enabled ? `${clockInfo.category.label} ${clockInfo.short}` : 'Sin reloj'}
          </span>
        </div>
        <div className="flex items-center gap-space-md">
          {!isPlayer && (
            <span className="badge bg-secondary-container/30 text-secondary">
              <Icon name="visibility" className="!text-sm" /> Espectador
            </span>
          )}
          <span className="flex items-center gap-1.5 font-mono-move text-mono-move text-on-surface-variant" title="Espectadores">
            <Icon name="visibility" className="!text-base text-secondary" /> {room.spectators.count}
          </span>
          <button
            type="button"
            title="Copiar enlace de la sala"
            aria-label="Copiar enlace de la sala"
            onClick={async () => notify((await copyText(roomLink(room.code))) ? 'Enlace de la sala copiado' : 'No se pudo copiar', 'success')}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-body-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
          >
            <Icon name="link" className="!text-base" /> <span className="hidden sm:inline">Copiar enlace</span>
          </button>
        </div>
      </div>

      <PresenceBanner room={room} />
      {isPlayer && playing && room.drawOffer && room.drawOffer !== myColor && (
        <DrawOffer name={room.players[room.drawOffer]?.name ?? 'Tu rival'} onAccept={() => answerDraw(true)} onDecline={() => answerDraw(false)} />
      )}

      <div className="grid grid-cols-1 items-start gap-space-md xl:grid-cols-12">
        <div className="flex justify-center xl:col-span-8">
          <div className="flex w-full flex-col gap-2" style={{ maxWidth: 'min(100%, 680px, max(320px, calc(100dvh - 15rem)))' }}>
            {strip(top)}
            <Board
              fen={displayFen}
              orientation={bottom}
              lastMove={displayLast}
              showCheck={inCheck}
              checkBadge={playing}
              interactive={interactive}
              myColor={myColor}
              onMove={handleMove}
            >
              {summary && !resultDismissed && <GameResult room={room} summary={summary} onClose={() => setResultDismissed(true)} onLeave={leave} />}
            </Board>
            {strip(bottom)}
            {summary && resultDismissed && (
              <button type="button" onClick={() => setResultDismissed(false)} className="btn btn-secondary btn-sm self-center" data-testid="show-result">
                <Icon name="emoji_events" className="!text-lg" /> {summary.title} · {summary.reason}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-space-sm xl:col-span-4 xl:h-[calc(min(680px,max(320px,100dvh-15rem))+7.5rem)]">
          <div className="flex h-72 min-h-0 flex-col xl:h-auto xl:flex-1">
            <MoveList moves={room.moves} viewPly={viewPly} onView={setViewPly} />
          </div>
          <Commands
            isPlayer={isPlayer}
            playing={playing}
            drawOfferedByMe={room.drawOffer === myColor && !!myColor}
            onDraw={doDraw}
            onResign={() => setResignOpen(true)}
            onFlip={() => setFlipped((f) => !f)}
            onLeave={() => (isPlayer && playing ? setLeaveOpen(true) : leave())}
          />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {lastSan ? `Última jugada: ${lastSan}. ` : ''}
        {playing ? `Turno de las ${room.turn === 'w' ? 'blancas' : 'negras'}.` : summary ? `${summary.title}. ${summary.reason}.` : ''}
      </p>

      <Modal
        open={resignOpen}
        onClose={() => setResignOpen(false)}
        title="¿Rendirte?"
        icon="flag"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setResignOpen(false)}>Seguir jugando</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={doResign} data-testid="confirm-resign">Rendirme</button>
          </>
        }
      >
        <p className="text-body-md text-on-surface-variant">Perderás la partida y tu rival ganará.</p>
      </Modal>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="¿Abandonar la partida?"
        icon="logout"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLeaveOpen(false)}>Cancelar</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={leave}>Abandonar</button>
          </>
        }
      >
        <p className="text-body-md text-on-surface-variant">Salir en plena partida cuenta como rendirte.</p>
      </Modal>
    </div>
  );
}
