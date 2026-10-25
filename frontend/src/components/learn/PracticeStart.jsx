import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../Icon.jsx';
import TutorCard from './TutorCard.jsx';
import { useSession } from '../../context/SessionContext.jsx';
import { useToast } from '../Toasts.jsx';

/** Arranque de la partida guiada: contra el bot Principiante, con blancas, sin reloj y con pistas. */
export default function PracticeStart() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { status, features, startBot } = useSession();
  const [starting, setStarting] = useState(false);
  const online = status === 'online';

  async function start() {
    setStarting(true);
    const res = await startBot({ level: 'beginner', color: 'w', practice: true });
    setStarting(false);
    if (!res.ok) return notify(res.error.message, 'error');
    navigate(`/sala/${res.code}`);
  }

  return (
    <div className="glass relative flex flex-col gap-space-md overflow-hidden p-space-lg shadow-xl" data-testid="practice-start">
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-secondary-container/25 blur-3xl" />
      <div className="relative flex items-center gap-space-md">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-secondary to-primary-container text-surface-container-lowest shadow-glow-cyan">
          <Icon name="sports_esports" className="!text-3xl" />
        </span>
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Tu primera partida, con ayuda</h2>
          <p className="text-body-md text-on-surface-variant">Bot Principiante · tú con blancas · sin reloj</p>
        </div>
      </div>
      <ul className="relative grid gap-space-sm sm:grid-cols-3">
        {[
          ['lightbulb', 'Pistas cuando las pidas', 'El tutor te dice la mejor jugada y la explica.'],
          ['hourglass_disabled', 'Sin prisa', 'No hay reloj: piensa todo lo que necesites.'],
          ['replay', 'Repite cuando quieras', 'Al terminar puedes jugar otra vez.'],
        ].map(([icon, title, text]) => (
          <li key={title} className="flex flex-col gap-1 rounded-lg bg-surface-container p-space-md">
            <Icon name={icon} className="text-primary-container" />
            <span className="font-headline-sm text-body-md text-on-surface">{title}</span>
            <span className="text-body-sm text-on-surface-variant">{text}</span>
          </li>
        ))}
      </ul>
      {!features.bot && online && <TutorCard tone="wrong">El bot no está disponible en este servidor, así que por ahora no se puede jugar la partida guiada.</TutorCard>}
      <button type="button" className="btn btn-primary relative self-start" onClick={start} disabled={!online || !features.bot || starting} data-testid="btn-practice">
        <Icon name={starting ? 'progress_activity' : 'play_arrow'} className={starting ? 'animate-spin' : ''} />
        {starting ? 'Preparando…' : 'Empezar partida guiada'}
      </button>
    </div>
  );
}
