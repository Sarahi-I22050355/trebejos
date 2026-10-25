import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import PingDot from './PingDot.jsx';
import Modal from './Modal.jsx';
import { useSession } from '../context/SessionContext.jsx';
import { useToast } from './Toasts.jsx';
import { useServerNow } from '../hooks/useNow.js';
import { copyText } from '../lib/clipboard.js';
import { describeClock, formatElapsed } from '../lib/clock.js';
import { formatCode, roomLink } from '../lib/code.js';

export function ColorChip({ color }) {
  const white = color === 'w';
  return (
    <span className="flex items-center gap-2 rounded-md bg-surface-container-lowest px-2.5 py-1">
      <span className={`h-3.5 w-3.5 rounded-full ${white ? 'bg-white' : 'border border-white/50 bg-surface-container-lowest'}`} />
      <span className="font-mono-move text-body-sm text-on-surface">{white ? 'Piezas blancas' : 'Piezas negras'}</span>
    </span>
  );
}

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${
        checked ? 'bg-primary-container/80' : 'bg-surface-container-highest'
      }`}
    >
      <span
        className={`pointer-events-none mt-0.5 inline-block h-5 w-5 rounded-full bg-surface-container-lowest shadow transition-transform duration-200 ${
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function InfoCard({ icon, tone = 'text-primary-container', label, value, hint, action }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-surface-container p-space-md">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`rounded-md bg-surface-container-high p-2 ${tone}`}>
          <Icon name={icon} />
        </span>
        <div className="min-w-0">
          <span className="block font-label-badge text-label-badge uppercase tracking-[0.08em] text-on-surface-variant">{label}</span>
          <span className="block font-headline-sm text-body-lg font-bold text-on-surface">{value}</span>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">{hint}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

/** Sala de espera del anfitrión: código para compartir mientras llega el rival. */
export default function WaitingRoom({ room }) {
  const navigate = useNavigate();
  const { leaveRoom, setVisibility } = useSession();
  const { notify } = useToast();
  const serverNow = useServerNow(1000);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isPublic = room.visibility === 'public';
  const me = room.players[room.you.color];
  const clock = describeClock(room.clock.enabled ? room.clock : null);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const copy = async (text, message) => notify((await copyText(text)) ? message : 'No se pudo copiar. Cópialo a mano.', 'success');

  async function share() {
    try {
      await navigator.share({ title: 'Trebejos', text: `Juega ajedrez conmigo en Trebejos. Código: ${room.code}`, url: roomLink(room.code) });
    } catch {
      /* el usuario canceló */
    }
  }

  async function toggleVisibility(makePublic) {
    setBusy(true);
    const res = await setVisibility(makePublic ? 'public' : 'private');
    setBusy(false);
    if (!res.ok) notify(res.error.message, 'error');
  }

  function leave() {
    setLeaveOpen(false);
    navigate('/', { replace: true }); // primero salir de la página: evita reunirse sola a la sala al vaciarse el estado
    leaveRoom();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-space-lg md:px-margin">
      <div className="mb-space-lg flex w-full items-center">
        <div className="hairline flex items-center gap-space-sm rounded-full bg-surface-container-high/60 px-space-md py-1.5 backdrop-blur-md">
          <PingDot size="h-2.5 w-2.5" />
          <span className="font-headline-sm text-body-sm uppercase tracking-wider text-primary">
            Sala {isPublic ? 'pública' : 'privada'} · esperando rival
          </span>
        </div>
      </div>

      <section className="glass-raised relative w-full overflow-hidden p-space-md shadow-[0_0_50px_-10px_rgba(0,240,255,0.25),0_0_80px_-20px_rgba(111,0,190,0.35)] sm:p-space-lg md:p-space-xl">
        <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary-container/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-secondary-container/30 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-space-md pb-space-lg sm:flex-row sm:items-center">
          <div className="flex items-center gap-space-md">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container text-primary-container shadow-inner">
              <Icon name="sensors" className="!text-2xl" />
            </span>
            <div>
              <div className="flex items-center gap-space-xs">
                <span className="font-headline-sm text-body-sm uppercase tracking-widest text-on-surface-variant">Sesión multijugador</span>
                <span className="badge bg-primary-container/15 text-primary-container">Anfitrión</span>
              </div>
              <h1 className="font-headline-lg text-headline-lg tracking-tight text-primary">
                SALA {isPublic ? 'PÚBLICA' : 'PRIVADA'} <span className="font-mono-timer">#{room.code}</span>
              </h1>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm self-start sm:self-auto" onClick={() => copy(room.code, 'Código copiado')}>
            <Icon name="content_copy" className="!text-lg" /> Copiar código
          </button>
        </div>

        <div className="relative my-space-md flex flex-col items-center justify-center overflow-hidden rounded-xl bg-surface-container-lowest/80 p-space-lg text-center hairline">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-container/5 via-secondary-container/10 to-primary-container/5" />
          <div className="relative z-10 flex flex-col items-center">
            <span className="mb-space-xs font-headline-sm text-label-badge uppercase tracking-[0.25em] text-secondary-fixed-dim">Código de la sala</span>
            <span
              data-testid="room-code"
              aria-label={`Código ${room.code.split('').join(' ')}`}
              className="text-gradient my-space-xs select-all whitespace-nowrap font-headline-xxl text-headline-xxl-mobile tracking-[0.18em] drop-shadow-[0_0_24px_rgba(0,240,255,0.4)] sm:text-headline-xxl"
            >
              {formatCode(room.code)}
            </span>
            <div className="mt-space-sm flex flex-wrap items-center justify-center gap-space-sm">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => copy(roomLink(room.code), 'Enlace de invitación copiado')}>
                <Icon name="link" className="!text-lg" /> Copiar enlace directo
              </button>
              {canShare && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={share}>
                  <Icon name="share" className="!text-lg" /> Compartir
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="relative flex flex-col items-center justify-center gap-space-lg rounded-xl bg-surface-container/60 px-space-lg py-space-md sm:flex-row">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 animate-radar rounded-full bg-primary-container/40" />
            <span className="absolute inset-1 animate-pulse rounded-full bg-secondary-container/30" />
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-primary-container shadow-inner">
              <Icon name="sync" className="animate-spin !text-2xl [animation-duration:3s]" />
            </span>
          </div>
          <div className="text-center sm:text-left">
            <div className="flex items-center justify-center gap-space-xs sm:justify-start">
              <span className="font-headline-sm text-headline-sm text-on-surface">Esperando rival</span>
              <span className="inline-flex gap-1" aria-hidden="true">
                {[0, 0.2, 0.4].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-container" style={{ animationDelay: `${d}s` }} />
                ))}
              </span>
            </div>
            <p className="text-body-sm text-on-surface-variant">Comparte el enlace o el código: la partida empieza sola cuando entre tu rival.</p>
          </div>
          <div className="flex items-center gap-space-xs rounded-lg bg-surface-container-lowest px-space-md py-2 sm:ml-auto">
            <Icon name="timer" className="text-secondary" />
            <span className="text-body-sm uppercase tracking-wider text-on-surface-variant">Tiempo de espera</span>
            <span className="font-mono-timer text-headline-sm font-bold text-primary" data-testid="wait-timer">
              {formatElapsed(serverNow - room.createdAt)}
            </span>
          </div>
        </div>

        <div className="relative my-space-lg grid grid-cols-1 items-center gap-space-md lg:grid-cols-11">
          <div className="relative overflow-hidden rounded-xl bg-surface-container-high/80 p-space-md shadow-lg hairline sm:p-space-lg lg:col-span-5">
            <div className="absolute left-0 top-0 h-full w-1.5 bg-primary-container shadow-[0_0_12px_#00f0ff]" />
            <div className="mb-space-md flex flex-wrap items-start justify-between gap-2">
              <span className="badge bg-primary-container/15 text-primary">
                <Icon name="military_tech" className="!text-base" /> Anfitrión
              </span>
              <ColorChip color={room.you.color} />
            </div>
            <div className="flex items-center gap-space-md">
              <div className="relative shrink-0">
                <Avatar name={me.name} size={88} className="shadow-[0_0_20px_rgba(0,240,255,0.3)] !rounded-xl" />
                <span className="absolute -bottom-1 -right-1 rounded-md bg-surface-container-lowest p-0.5 text-primary-container">
                  <Icon name="check_circle" className="!text-xl" />
                </span>
              </div>
              <div className="flex min-w-0 flex-col">
                <div className="flex flex-wrap items-center gap-space-xs">
                  <h3 className="truncate font-headline-sm text-headline-sm text-on-surface">{me.name}</h3>
                  <span className="rounded bg-surface-container-lowest px-1.5 py-0.5 font-headline-sm text-label-badge uppercase text-primary-container">(Tú)</span>
                </div>
                <div className="mt-space-sm flex items-center gap-space-xs text-primary">
                  <PingDot />
                  <span className="font-headline-sm text-label-badge uppercase tracking-wider">Conectado y listo</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-space-xs lg:col-span-1">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-16 w-16 rounded-full bg-gradient-to-tr from-primary-container to-secondary-container opacity-60 blur-xl" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-lowest shadow-[0_0_24px_rgba(221,183,255,0.4)]">
                <span className="text-gradient font-headline-xl text-headline-sm font-black">VS</span>
              </div>
            </div>
            <span className="mt-2 font-mono-move text-label-badge uppercase tracking-widest text-on-surface-variant">Duelo 1v1</span>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-surface-container-high/30 p-space-md shadow-inner hairline sm:p-space-lg lg:col-span-5">
            <div className="absolute right-0 top-0 h-full w-1.5 bg-secondary-container/40" />
            <div className="mb-space-md flex flex-wrap items-start justify-between gap-2">
              <span className="badge bg-surface-container-low/70 text-on-surface-variant">
                <Icon name="hourglass_top" className="!text-base" /> Lugar libre
              </span>
              <ColorChip color={room.you.color === 'w' ? 'b' : 'w'} />
            </div>
            <div className="flex items-center gap-space-md">
              <div className="flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center rounded-xl bg-surface-container-lowest/60 text-outline-variant shadow-inner">
                <Icon name="person_search" className="animate-pulse !text-4xl text-secondary/60" />
                <span className="mt-1 font-mono-move text-label-badge uppercase tracking-tight text-outline">Esperando</span>
              </div>
              <div className="flex min-w-0 flex-col">
                <h3 className="font-headline-sm text-headline-sm tracking-wide text-on-surface-variant">Buscando contrincante…</h3>
                <p className="mt-1 text-body-sm text-outline">Quien abra tu enlace o escriba el código se conectará aquí.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative rounded-xl bg-surface-container-lowest/50 p-space-md sm:p-space-lg">
          <div className="mb-space-md flex items-center gap-space-xs">
            <Icon name="tune" className="text-primary" />
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Configuración de la partida</h2>
          </div>
          <div className="grid grid-cols-1 gap-space-md md:grid-cols-3">
            <InfoCard icon={clock.category.icon} label="Reloj" value={clock.category.label === 'Sin reloj' ? 'Sin reloj' : `${clock.category.label} ${clock.short}`} hint={clock.long} />
            <InfoCard
              icon="visibility"
              tone="text-secondary"
              label="Espectadores"
              value="Permitidos"
              hint={isPublic ? 'Se pueden unir desde el listado' : 'Quien tenga el código, si la sala se llena'}
            />
            <InfoCard
              icon={isPublic ? 'public' : 'lock'}
              label="Visibilidad"
              value={isPublic ? 'Sala pública' : 'Sala privada'}
              hint={isPublic ? 'Aparece en “Salas públicas”' : 'Solo se entra con el código'}
              action={<Switch checked={isPublic} disabled={busy} onChange={toggleVisibility} label="Sala pública" />}
            />
          </div>
        </div>

        <div className="relative mt-space-lg flex flex-col items-center justify-between gap-space-md sm:flex-row">
          <div className="flex items-center gap-space-xs text-body-sm text-on-surface-variant">
            <Icon name="info" className="!text-base" />
            Si sales de la sala, el código deja de funcionar.
          </div>
          <button type="button" className="btn btn-danger w-full sm:w-auto" onClick={() => setLeaveOpen(true)}>
            <Icon name="logout" /> Cancelar y salir
          </button>
        </div>
      </section>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="¿Cerrar la sala?"
        icon="logout"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLeaveOpen(false)}>
              Seguir esperando
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={leave}>
              Cerrar sala
            </button>
          </>
        }
      >
        <p className="text-body-md text-on-surface-variant">
          La sala <strong className="font-mono-move text-primary">{room.code}</strong> se cerrará y quien tenga el código ya no podrá entrar.
        </p>
      </Modal>
    </div>
  );
}
