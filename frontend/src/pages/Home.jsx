import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PingDot from '../components/PingDot.jsx';
import NameField from '../components/NameField.jsx';
import CreateRoomDialog from '../components/CreateRoomDialog.jsx';
import { useSession } from '../context/SessionContext.jsx';
import { useToast } from '../components/Toasts.jsx';
import { useLobby } from '../hooks/useLobby.js';
import { NAME_HINT, randomName, sanitizeName } from '../lib/name.js';
import { extractCode } from '../lib/code.js';
import { CLOCK_PRESETS, describeClock } from '../lib/clock.js';
import { BOT_COLORS, BOT_LEVELS } from '../lib/bot.js';
import { safeStorage } from '../lib/storage.js';

/** Tarjeta de modo de juego (Bot / Crear / Unirse / Salas públicas). */
function ModeCard({ icon, iconTone, badge, title, description, children, action }) {
  return (
    <article className="glass group relative flex flex-col justify-between p-space-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-glow-cyan">
      <div className="flex flex-col gap-space-md">
        <div className="flex items-center justify-between gap-2">
          <span className={`flex h-12 w-12 items-center justify-center rounded-lg shadow-inner ${iconTone}`}>
            <Icon name={icon} className="!text-2xl" />
          </span>
          {badge}
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-headline-lg text-headline-lg text-on-surface transition-colors group-hover:text-primary">{title}</h2>
          <p className="text-body-md text-on-surface-variant">{description}</p>
        </div>
        {children}
      </div>
      <div className="pt-space-lg">{action}</div>
    </article>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { status, name, room, rename, createRoom, startBot, features } = useSession();
  const { lobby } = useLobby();
  const online = status === 'online';

  const [draft, setDraft] = useState(name);
  const [nameError, setNameError] = useState('');
  const [clockId, setClockId] = useState('3+2');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [botLevel, setBotLevel] = useState(() => {
    const raw = safeStorage.get('trebejos:botLevel');
    const saved = raw === null ? NaN : Number(raw); // Number(null) sería 0
    return Number.isInteger(saved) && saved >= 0 && saved < BOT_LEVELS.length ? saved : 1;
  });
  const [botColor, setBotColor] = useState(() => (['w', 'b', 'random'].includes(safeStorage.get('trebejos:botColor')) ? safeStorage.get('trebejos:botColor') : 'w'));
  const [botStarting, setBotStarting] = useState(false);

  // El campo sigue al nombre del servidor SOLO mientras el usuario no lo haya tocado; si no,
  // el nombre que llega al terminar de conectar pisaría lo que está escribiendo.
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setDraft(name);
  }, [name]);

  /** Guarda el nombre escrito (si es válido). Devuelve false si no se pudo. */
  async function commitName(value = draft) {
    if (room) return true; // dentro de una sala el nombre ya está fijado
    const clean = sanitizeName(value);
    if (!clean) {
      setNameError(NAME_HINT);
      return false;
    }
    setNameError('');
    if (clean === name) {
      dirty.current = false;
      setDraft(clean);
      return true;
    }
    const res = await rename(clean);
    if (!res.ok) {
      setNameError(res.error.message);
      return false;
    }
    dirty.current = false;
    setDraft(res.name);
    return true;
  }

  async function handleCreate(options) {
    if (!(await commitName())) return setCreateOpen(false);
    setCreating(true);
    const res = await createRoom(options);
    setCreating(false);
    if (!res.ok) {
      if (res.error.code === 'ALREADY_IN_GAME') {
        setCreateOpen(false);
        return notify(res.error.message, 'error');
      }
      return notify(res.error.message, 'error');
    }
    setCreateOpen(false);
    navigate(`/sala/${res.code}`);
  }

  async function handleBot() {
    if (!(await commitName())) return;
    safeStorage.set('trebejos:botLevel', String(botLevel));
    safeStorage.set('trebejos:botColor', botColor);
    setBotStarting(true);
    const res = await startBot({ level: BOT_LEVELS[botLevel].id, color: botColor });
    setBotStarting(false);
    if (!res.ok) return notify(res.error.message, 'error');
    navigate(`/sala/${res.code}`);
  }

  async function handleJoin(e) {
    e.preventDefault();
    const code = extractCode(codeInput);
    if (!code) return setCodeError('El código tiene 6 caracteres (letras y números).');
    setCodeError('');
    if (!(await commitName())) return;
    navigate(`/sala/${code}`);
  }

  const previewRooms = lobby?.rooms.slice(0, 2) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-space-xl px-4 py-space-lg md:px-margin">
      {/* Hero + nombre de sesión */}
      <section className="glass-raised relative overflow-hidden p-space-lg shadow-xl lg:p-space-xl">
        <div className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-primary-container/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-secondary-container/25 blur-3xl" />
        <div className="relative grid grid-cols-1 items-center gap-space-lg lg:grid-cols-12">
          <div className="flex flex-col gap-space-sm lg:col-span-7">
            <div className="flex flex-wrap items-center gap-space-sm">
              <span className="badge bg-surface-container-high text-primary-fixed">
                <PingDot size="h-1.5 w-1.5" />
                Ajedrez en línea · sin registro
              </span>
            </div>
            <h1 className="text-gradient w-fit font-headline-xxl text-headline-xxl-mobile uppercase sm:text-headline-xxl">Trebejos</h1>
            <p className="max-w-2xl text-body-lg text-on-surface-variant">
              Crea una sala, comparte el código y juega en segundos. Sin cuentas ni contraseñas: solo elige un nombre y a mover piezas.
            </p>
            <div className="flex flex-wrap items-center gap-space-sm pt-space-xs">
              {[
                ['bolt', 'Tiempo real'],
                ['lock_open', 'Sin registro'],
                ['smartphone', 'Funciona en el móvil'],
              ].map(([icon, label]) => (
                <span key={label} className="flex items-center gap-2 rounded-lg bg-surface-container px-space-md py-space-xs text-body-sm text-on-surface hairline">
                  <Icon name={icon} className="!text-lg text-primary-container" /> {label}
                </span>
              ))}
            </div>
          </div>

          <div className="glass-raised flex flex-col gap-space-sm p-space-md shadow-2xl lg:col-span-5">
            <div className="flex items-center gap-2">
              <Icon name="badge" className="text-primary-container" />
              <label htmlFor="player-name" className="font-headline-sm text-headline-sm uppercase tracking-wide text-on-surface">
                Tu nombre en esta sesión
              </label>
            </div>
            <NameField
              id="player-name"
              value={draft}
              onChange={(v) => {
                dirty.current = true;
                setDraft(v);
                setNameError('');
              }}
              onCommit={() => commitName()}
              onDice={() => {
                const next = randomName();
                dirty.current = true;
                setDraft(next);
                commitName(next);
              }}
              error={nameError}
              disabled={!!room}
            />
            <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
              <Icon name="info" className="!text-base text-secondary" />
              {room ? (
                <span>
                  Estás en la sala <strong className="font-mono-move text-primary">{room.code}</strong>; el nombre queda fijo hasta que salgas.{' '}
                  <Link to={`/sala/${room.code}`} className="text-primary-container underline underline-offset-2">
                    Volver
                  </Link>
                </span>
              ) : (
                'Se guarda en este navegador. Pulsa el dado para recibir uno aleatorio.'
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Modos de juego */}
      <section className="grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-4" aria-label="Modos de juego">
        <ModeCard
          icon="smart_toy"
          iconTone="bg-primary-container/10 text-primary-container"
          badge={
            features.bot ? (
              <span className="badge bg-surface-container-highest text-primary">Stockfish</span>
            ) : (
              <span className="badge bg-surface-container-highest text-outline">{online ? 'No disponible' : '…'}</span>
            )
          }
          title="Jugar contra el bot"
          description="Practica contra el motor Stockfish, desde principiante hasta experto, con el color que prefieras."
          action={
            <button type="button" className="btn btn-secondary w-full !text-on-surface hover:!bg-primary-container hover:!text-on-primary-fixed" disabled={!online || !features.bot || botStarting} onClick={handleBot}>
              <Icon name={botStarting ? 'progress_activity' : 'play_arrow'} className={`!text-xl ${botStarting ? 'animate-spin' : ''}`} />
              {botStarting ? 'Preparando…' : 'Iniciar partida'}
            </button>
          }
        >
          <div className="flex flex-col gap-2 rounded-lg bg-surface-container-lowest p-space-sm">
            <div className="flex items-center justify-between font-mono-move text-body-sm text-on-surface-variant">
              <span>NIVEL</span>
              <span className="font-bold text-primary" data-testid="bot-level-label">{BOT_LEVELS[botLevel].label}</span>
            </div>
            <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Nivel del bot">
              {BOT_LEVELS.map((level, i) => (
                <button
                  key={level.id}
                  type="button"
                  role="radio"
                  aria-checked={botLevel === i}
                  aria-label={level.label}
                  title={`${level.label}: ${level.hint}`}
                  onClick={() => setBotLevel(i)}
                  className="group py-1.5"
                >
                  <span className={`block h-2 rounded-full transition-all ${i <= botLevel ? 'bg-gradient-to-r from-primary-container to-secondary shadow-[0_0_8px_rgba(0,240,255,0.5)]' : 'bg-surface-container-highest group-hover:bg-surface-bright'}`} />
                </button>
              ))}
            </div>
            <p className="text-body-sm text-outline">{BOT_LEVELS[botLevel].hint}</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center font-mono-move text-body-sm" role="radiogroup" aria-label="Tu color contra el bot">
            {BOT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={botColor === c.value}
                onClick={() => setBotColor(c.value)}
                className={`rounded-md py-1.5 transition-colors ${botColor === c.value ? 'bg-surface-container-highest font-bold text-primary' : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </ModeCard>

        <ModeCard
          icon="lock_open"
          iconTone="bg-secondary-container/20 text-secondary-fixed-dim"
          badge={<span className="badge bg-surface-container-highest text-secondary">Sala personalizada</span>}
          title="Crear sala"
          description="Elige si es pública o privada, tu color y el reloj. Comparte el código y tu rival entra al instante."
          action={
            <button type="button" className="btn btn-primary w-full" disabled={!online} onClick={() => setCreateOpen(true)}>
              <Icon name="tune" className="!text-xl" /> Configurar y crear
            </button>
          }
        >
          <div className="grid grid-cols-3 gap-1.5 text-center font-mono-move text-body-sm" role="radiogroup" aria-label="Reloj rápido">
            {['none', '3+2', '10+0'].map((id) => {
              const preset = CLOCK_PRESETS.find((p) => p.id === id);
              const active = clockId === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setClockId(id)}
                  className={`rounded-md py-1.5 transition-colors ${active ? 'bg-surface-container-highest font-bold text-primary' : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'}`}
                >
                  {id === 'none' ? 'Sin reloj' : preset.label}
                </button>
              );
            })}
          </div>
        </ModeCard>

        <ModeCard
          icon="key"
          iconTone="bg-surface-container-highest text-primary"
          badge={<span className="badge bg-surface-container-highest text-outline">Con código</span>}
          title="Unirse a sala"
          description="Escribe el código de 6 caracteres que te compartió tu rival (o pega su enlace)."
          action={
            <button type="submit" form="join-form" className="btn btn-secondary w-full !text-on-surface hover:!bg-secondary hover:!text-on-secondary-fixed" disabled={!online}>
              <Icon name="login" className="!text-xl" /> Conectar a la sala
            </button>
          }
        >
          <form id="join-form" onSubmit={handleJoin} className="flex flex-col gap-1.5">
            <div className="relative flex items-center">
              <span className="absolute left-3 font-mono-move text-body-lg text-primary">#</span>
              <input
                aria-label="Código de sala"
                value={codeInput}
                onChange={(e) => (setCodeInput(e.target.value.toUpperCase()), setCodeError(''))}
                placeholder="K9X4M2"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={60}
                aria-invalid={!!codeError}
                className={`field pl-8 font-mono-timer !text-headline-sm uppercase tracking-widest placeholder:text-outline/40 ${codeError ? 'field-error' : ''}`}
              />
            </div>
            {codeError && <p className="text-body-sm text-magenta">{codeError}</p>}
          </form>
        </ModeCard>

        <ModeCard
          icon="public"
          iconTone="bg-tertiary-container/20 text-on-tertiary-container"
          badge={
            <span className="badge bg-surface-container-highest text-primary">
              <PingDot />
              {lobby ? `${lobby.stats.rooms} ${lobby.stats.rooms === 1 ? 'activa' : 'activas'}` : '…'}
            </span>
          }
          title="Salas públicas"
          description="Explora las mesas abiertas: únete a una que espere rival o mira una partida como espectador."
          action={
            <Link to="/salas" className="btn btn-secondary w-full !text-on-surface hover:!bg-primary-container hover:!text-on-primary-fixed">
              <Icon name="grid_view" className="!text-xl" /> Explorar listado
            </Link>
          }
        >
          <div className="flex min-h-[3.75rem] flex-col justify-center gap-1 rounded-lg bg-surface-container-lowest p-2 font-mono-move text-body-sm text-on-surface-variant">
            {previewRooms.length === 0 ? (
              <span className="px-1 text-outline">{lobby ? 'Aún no hay salas abiertas. ¡Crea la primera!' : 'Buscando salas…'}</span>
            ) : (
              previewRooms.map((r) => {
                const [a, b] = r.players;
                return (
                  <div key={r.code} className="flex items-center justify-between gap-2">
                    <span className="truncate text-on-surface">{b ? `${a.name} vs ${b.name}` : `${a.name} · esperando`}</span>
                    <span className="shrink-0 text-secondary">{describeClock(r.clock && { initialMs: r.clock.initialMs, incrementMs: r.clock.incrementMs }).short}</span>
                  </div>
                );
              })
            )}
          </div>
        </ModeCard>
      </section>

      {/* Aprender */}
      <section className="glass flex flex-col items-center justify-between gap-space-md p-space-md sm:flex-row">
        <div className="flex items-center gap-space-md">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
            <Icon name="school" className="!text-2xl" />
          </span>
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm text-on-surface">¿Nuevo en el tablero?</span>
            <span className="text-body-md text-on-surface-variant">Aprende cómo se mueve cada pieza y las reglas especiales, con ejemplos interactivos.</span>
          </div>
        </div>
        <Link to="/aprender" className="btn btn-secondary btn-sm shrink-0 !text-primary">
          Aprende a jugar <Icon name="arrow_forward" className="!text-lg" />
        </Link>
      </section>

      <CreateRoomDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} busy={creating} initialClock={clockId} />
    </div>
  );
}
