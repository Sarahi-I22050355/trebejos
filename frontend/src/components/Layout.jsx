import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Logo from './Logo.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import NameDialog from './NameDialog.jsx';
import { useSession } from '../context/SessionContext.jsx';
import { useSoundMuted } from '../hooks/useSound.js';

const NAV = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/salas', label: 'Salas públicas' },
  { to: '/aprender', label: 'Aprende a jugar' },
];

const navClass = ({ isActive }) =>
  `whitespace-nowrap rounded-lg px-4 py-1.5 transition-all ${
    isActive
      ? 'bg-surface-container-high font-headline-sm text-primary'
      : 'font-body-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
  }`;

function StatusDot({ status }) {
  const color = status === 'online' ? 'bg-primary-container' : status === 'offline' ? 'bg-magenta' : 'bg-outline';
  const label = status === 'online' ? 'Conectado' : status === 'offline' ? 'Sin conexión' : 'Conectando';
  return (
    <span
      title={label}
      aria-label={label}
      className={`h-2 w-2 shrink-0 rounded-full ${color} ${status === 'online' ? '' : 'animate-pulse'}`}
    />
  );
}

function SoundToggle() {
  const [muted, setMuted] = useSoundMuted();
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-pressed={!muted}
      aria-label={muted ? 'Activar sonidos' : 'Silenciar sonidos'}
      title={muted ? 'Sonido desactivado' : 'Sonido activado'}
      data-testid="sound-toggle"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-container-high ${muted ? 'text-outline' : 'text-primary'}`}
    >
      <Icon name={muted ? 'volume_off' : 'volume_up'} className="!text-xl" />
    </button>
  );
}

function Header() {
  const { name, room, status } = useSession();
  const [nameOpen, setNameOpen] = useState(false);
  const { pathname } = useLocation();
  const inRoomPage = pathname.startsWith('/sala/');

  return (
    <>
      <header className="fixed left-0 top-0 z-50 w-full bg-surface-container-lowest/80 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 md:px-margin">
          <div className="flex items-center gap-space-lg">
            <Logo />
            <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
              {NAV.map((item) => (
                <NavLink key={item.to} {...item} className={navClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {room && !inRoomPage && (
              <Link
                to={`/sala/${room.code}`}
                className="btn btn-primary btn-sm !px-3 !py-1.5 !text-label-badge"
                title="Volver a tu sala"
              >
                <Icon name="swords" className="!text-base" />
                <span className="hidden sm:inline">En sala</span>
                <span className="font-mono-move">{room.code}</span>
              </Link>
            )}
            <SoundToggle />
            <button
              type="button"
              onClick={() => setNameOpen(true)}
              title="Cambiar nombre"
              aria-label={`Tu nombre: ${name}. Cambiar`}
              className="hairline flex min-w-0 items-center gap-2 rounded-full bg-surface-container-low/60 py-1 pl-1 pr-3 transition-colors hover:bg-surface-container-high"
            >
              <Avatar name={name || '?'} size={28} ring />
              <span className="max-w-[7.5rem] truncate font-body-sm text-body-sm font-semibold text-on-surface sm:max-w-[11rem]">
                {name || '…'}
              </span>
              <StatusDot status={status} />
            </button>
          </div>
        </div>

        {/* Navegación en móvil */}
        <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Principal">
          {NAV.map((item) => (
            <NavLink key={item.to} {...item} className={navClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <NameDialog open={nameOpen} onClose={() => setNameOpen(false)} />
    </>
  );
}

function ConnectionBanner() {
  const { status, ready } = useSession();
  if (status !== 'offline') return null;
  return (
    <div
      role="alert"
      className="fixed left-1/2 top-[7.25rem] z-40 flex -translate-x-1/2 animate-pulse-magenta items-center gap-2 rounded-full bg-surface-container-lowest/95 px-4 py-2 text-body-sm text-magenta md:top-[4.75rem]"
    >
      <Icon name="wifi_off" className="!text-base" />
      {ready ? 'Conexión perdida. Reconectando…' : 'No se pudo conectar con el servidor. Reintentando…'}
    </div>
  );
}

function Footer() {
  const { status } = useSession();
  return (
    <footer className="relative z-10 mt-space-xl w-full bg-surface-container-lowest/90 backdrop-blur-md">
      <div className="flex w-full flex-col items-center justify-between gap-4 px-4 py-space-lg md:flex-row md:px-margin">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span className="text-gradient font-headline-sm text-headline-sm font-bold uppercase tracking-[0.12em]">Trebejos</span>
          <span className="text-body-sm text-on-surface-variant">
            Ajedrez en línea sin registro · © {new Date().getFullYear()}
          </span>
        </div>
        <div className="flex items-center gap-space-lg text-body-sm text-on-surface-variant">
          <Link to="/aprender" className="transition-colors hover:text-primary">
            Aprende a jugar
          </Link>
          <Link to="/salas" className="transition-colors hover:text-primary">
            Salas públicas
          </Link>
          <span className="flex items-center gap-1.5">
            <StatusDot status={status} />
            {status === 'online' ? 'Servidor en línea' : status === 'offline' ? 'Sin conexión' : 'Conectando…'}
          </span>
        </div>
      </div>
    </footer>
  );
}

/** Al cambiar de página se vuelve arriba (React Router conserva el scroll de la anterior). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Marco común: fondo con rejilla y resplandores, cabecera, contenido y pie. */
export default function Layout() {
  return (
    <div className="cyber-grid relative flex min-h-screen flex-col bg-surface-container-lowest">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-primary-container/10 blur-3xl" />
        <div className="absolute right-1/4 top-10 h-96 w-96 rounded-full bg-secondary-container/15 blur-3xl" />
      </div>
      <ScrollToTop />
      <Header />
      <ConnectionBanner />
      <main className="relative z-10 w-full flex-1 pt-[6.75rem] md:pt-16">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
