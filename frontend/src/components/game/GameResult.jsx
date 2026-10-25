import Icon from '../Icon.jsx';
import { useSession } from '../../context/SessionContext.jsx';
import { useToast } from '../Toasts.jsx';

const TONES = {
  win: { icon: 'emoji_events', text: 'text-primary-container', glow: 'shadow-glow-cyan-lg' },
  loss: { icon: 'heart_broken', text: 'text-magenta', glow: 'shadow-glow-magenta' },
  draw: { icon: 'balance', text: 'text-secondary', glow: 'shadow-glow-violet' },
  neutral: { icon: 'flag', text: 'text-primary', glow: 'shadow-glow-cyan' },
};

/** Tarjeta de fin de partida sobre el tablero: resultado, motivo, revancha y salida. */
export default function GameResult({ room, summary, onClose, onLeave }) {
  const { rematch } = useSession();
  const { notify } = useToast();
  const tone = TONES[summary.tone];
  const me = room.you.color;
  const opponentColor = me ? (me === 'w' ? 'b' : 'w') : null;
  const opponent = opponentColor ? room.players[opponentColor] : null;
  const iAsked = me && room.rematch.includes(me);
  const theyAsked = opponentColor && room.rematch.includes(opponentColor);
  const canRematch = me && opponent && !opponent.left;

  async function askRematch() {
    const res = await rematch();
    if (!res.ok) notify(res.error.message, 'error');
  }

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center rounded-xl bg-surface-container-lowest/75 p-3 backdrop-blur-sm" data-testid="game-result">
      <div className={`glass-raised relative flex w-full max-w-xs animate-fade-up flex-col items-center gap-3 p-5 text-center ${tone.glow}`}>
        <button type="button" aria-label="Cerrar y ver el tablero" onClick={onClose} className="absolute right-2 top-2 rounded-lg p-1.5 text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface">
          <Icon name="close" className="!text-lg" />
        </button>
        <span className={`flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-lowest ${tone.text}`}>
          <Icon name={tone.icon} className="!text-3xl" />
        </span>
        <h2 className={`font-headline-xl text-headline-xl-mobile ${tone.text}`}>{summary.title}</h2>
        <p className="text-body-md text-on-surface-variant">{summary.reason}</p>

        <div className="mt-1 flex w-full flex-col gap-2">
          {canRematch && (
            <button type="button" className="btn btn-primary btn-sm w-full" disabled={iAsked} onClick={askRematch}>
              <Icon name="replay" className="!text-lg" />
              {room.mode === 'bot'
                ? 'Jugar otra vez (colores invertidos)'
                : iAsked ? `Esperando a ${opponent.name}…` : theyAsked ? `${opponent.name} quiere revancha` : 'Pedir revancha'}
            </button>
          )}
          {me && opponent?.left && <p className="text-body-sm text-outline">Tu rival ya salió de la sala.</p>}
          <button type="button" className="btn btn-secondary btn-sm w-full" onClick={onLeave}>
            <Icon name="logout" className="!text-lg" /> Salir al inicio
          </button>
        </div>
      </div>
    </div>
  );
}
