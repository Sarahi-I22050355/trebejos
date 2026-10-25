import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PingDot from '../components/PingDot.jsx';
import CreateRoomDialog from '../components/CreateRoomDialog.jsx';
import RoomCard, { RoomRow } from '../components/lobby/RoomCard.jsx';
import { useSession } from '../context/SessionContext.jsx';
import { useToast } from '../components/Toasts.jsx';
import { useLobby } from '../hooks/useLobby.js';
import { useNow } from '../hooks/useNow.js';
import { FILTERS, countByFilter, filterRooms, pageList, paginate } from '../lib/lobby.js';

function Stat({ value, label, tone = 'text-on-surface' }) {
  return (
    <span className="font-mono-move text-mono-move text-on-surface-variant">
      <strong className={`font-semibold ${tone}`}>{value}</strong> {label}
    </span>
  );
}

export default function Lobby() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { status, room: myRoom, createRoom, joinRandom } = useSession();
  const { lobby, refresh } = useLobby();
  const now = useNow(500); // relojes de las tarjetas

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [view, setView] = useState('grid');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [randomBusy, setRandomBusy] = useState(false);
  const online = status === 'online';

  const rooms = lobby?.rooms ?? [];
  const counts = useMemo(() => countByFilter(rooms, query), [rooms, query]);
  const visible = useMemo(() => filterRooms(rooms, { query, filter }), [rooms, query, filter]);
  const pageInfo = useMemo(() => paginate(visible, page), [visible, page]);

  // Al buscar o filtrar se vuelve a la primera página (en el mismo manejador, sin un fotograma intermedio).
  const changeQuery = (value) => {
    setQuery(value);
    setPage(1);
  };
  const changeFilter = (id) => {
    setFilter(id);
    setPage(1);
  };

  const elapsedMs = lobby ? now - lobby.receivedAt : 0;
  const filtering = query.trim() !== '' || filter !== 'all';

  function join(room) {
    navigate(`/sala/${room.code}`);
  }

  async function doRefresh() {
    setRefreshing(true);
    await refresh();
    setTimeout(() => setRefreshing(false), 500);
  }

  async function doRandom() {
    setRandomBusy(true);
    const res = await joinRandom();
    setRandomBusy(false);
    if (!res.ok) return notify(res.error.message, 'info');
    navigate(`/sala/${res.room.code}`);
  }

  async function handleCreate(options) {
    setCreating(true);
    const res = await createRoom(options);
    setCreating(false);
    if (!res.ok) return notify(res.error.message, 'error');
    setCreateOpen(false);
    navigate(`/sala/${res.code}`);
  }

  const clearFilters = () => {
    changeQuery('');
    changeFilter('all');
  };

  return (
    <div className="flex w-full flex-col">
      {/* Barra superior: estado del listado y acciones */}
      <section className="w-full bg-surface-container-low/60 px-4 py-space-md backdrop-blur-md md:px-margin">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-space-md lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-space-md">
            <div className="flex items-center gap-space-xs">
              <PingDot size="h-2.5 w-2.5" />
              <h1 className="font-headline-sm text-headline-sm uppercase tracking-wide text-primary">Salas públicas</h1>
            </div>
            <span className="hidden text-outline-variant sm:inline">|</span>
            <div className="flex flex-wrap items-center gap-space-sm rounded-lg bg-surface-container-lowest/80 px-space-md py-1.5 shadow-inner" data-testid="stats">
              <Icon name="radar" className="!text-base text-primary" />
              <Stat value={lobby?.stats.rooms ?? '–'} label={lobby?.stats.rooms === 1 ? 'sala' : 'salas'} />
              <span className="text-outline-variant">•</span>
              <Stat value={lobby?.stats.players ?? '–'} label={lobby?.stats.players === 1 ? 'jugador' : 'jugadores'} />
              <span className="text-outline-variant">•</span>
              <Stat value={lobby?.stats.spectators ?? '–'} label={lobby?.stats.spectators === 1 ? 'espectador' : 'espectadores'} tone="text-secondary-fixed-dim" />
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-space-sm lg:w-auto">
            <button type="button" onClick={doRefresh} disabled={!online} className="btn btn-secondary btn-sm !text-on-surface" data-testid="btn-refresh">
              <Icon name="sync" className={`!text-lg text-primary-container ${refreshing ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">Actualizar lista</span>
            </button>
            <button type="button" onClick={() => setCreateOpen(true)} disabled={!online} className="btn btn-primary btn-sm" data-testid="btn-create">
              <Icon name="add_box" className="!text-lg" /> Crear nueva sala
            </button>
          </div>
        </div>
      </section>

      {/* Búsqueda, vista y filtros */}
      <section className="w-full px-4 py-space-lg md:px-margin">
        <div className="mx-auto flex max-w-7xl flex-col gap-space-md">
          <div className="flex items-center gap-space-sm">
            <div className="relative flex-1">
              <Icon name="search" className="pointer-events-none absolute left-space-md top-1/2 -translate-y-1/2 text-outline" />
              <input
                value={query}
                onChange={(e) => changeQuery(e.target.value)}
                placeholder="Buscar por código (#K9X4M2) o jugador…"
                aria-label="Buscar salas"
                maxLength={40}
                autoComplete="off"
                className="field !rounded-xl pl-11 pr-10 shadow-inner"
                data-testid="search"
              />
              {query && (
                <button type="button" aria-label="Borrar búsqueda" onClick={() => changeQuery('')} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-outline hover:bg-surface-container-high hover:text-on-surface">
                  <Icon name="close" className="!text-lg" />
                </button>
              )}
            </div>
            <div className="hidden items-center gap-space-xs sm:flex" role="group" aria-label="Vista">
              {[['grid', 'grid_view', 'Vista de cuadrícula'], ['list', 'view_headline', 'Vista de lista']].map(([id, icon, label]) => (
                <button key={id} type="button" aria-label={label} aria-pressed={view === id} onClick={() => setView(id)} data-testid={`view-${id}`} className={`rounded-xl p-3 transition-colors ${view === id ? 'bg-surface-container-high text-primary' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'}`}>
                  <Icon name={icon} className="!text-lg" />
                </button>
              ))}
            </div>
          </div>

          <div className="-mx-1 flex items-center gap-space-xs overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filtros">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeFilter(f.id)}
                  data-testid={`filter-${f.id}`}
                  className={`flex shrink-0 items-center gap-space-xs rounded-lg px-space-md py-2 font-headline-sm text-body-sm uppercase tracking-wider transition-colors ${
                    active ? 'bg-primary-container font-semibold text-on-primary-fixed shadow-md' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  {f.id !== 'all' && <Icon name={f.icon} className={`!text-base ${active ? '' : 'text-primary'}`} />}
                  {f.label}
                  <span className={`font-mono-move text-body-sm ${active ? '' : 'text-outline'}`} data-testid={`count-${f.id}`}>({counts[f.id]})</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Listado */}
      <section className="w-full px-4 pb-space-xl md:px-margin" aria-live="polite">
        <div className="mx-auto max-w-7xl">
          {!lobby ? (
            <div className="glass flex flex-col items-center gap-space-md p-space-xl text-center" role="status">
              <Icon name="progress_activity" className="animate-spin !text-4xl text-primary-container" />
              <p className="font-headline-sm text-headline-sm text-on-surface">{online ? 'Buscando salas…' : 'Conectando con el servidor…'}</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="glass flex flex-col items-center gap-space-md p-space-xl text-center" data-testid="empty-lobby">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-lowest text-primary-container shadow-glow-cyan">
                <Icon name="meeting_room" className="!text-4xl" />
              </span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface">Aún no hay salas públicas</h2>
              <p className="max-w-md text-body-md text-on-surface-variant">Sé el primero: crea una sala pública y aparecerá aquí para que cualquiera pueda unirse o mirar la partida.</p>
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)} disabled={!online}>
                <Icon name="add_box" /> Crear sala pública
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="glass flex flex-col items-center gap-space-md p-space-xl text-center" data-testid="no-results">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-lowest text-secondary shadow-glow-violet">
                <Icon name="search_off" className="!text-4xl" />
              </span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface">Ninguna sala coincide</h2>
              <p className="max-w-md text-body-md text-on-surface-variant">Prueba con otro código o nombre, o quita los filtros para ver todas las salas.</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                <Icon name="filter_alt_off" className="!text-lg" /> Quitar filtros
              </button>
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 gap-space-lg md:grid-cols-2 lg:grid-cols-3" data-testid="room-grid">
              {pageInfo.items.map((r) => (
                <RoomCard key={r.code} room={r} elapsedMs={elapsedMs} mine={myRoom?.code === r.code} onJoin={join} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-space-sm" data-testid="room-list">
              {pageInfo.items.map((r) => (
                <RoomRow key={r.code} room={r} elapsedMs={elapsedMs} mine={myRoom?.code === r.code} onJoin={join} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Paginación y sala aleatoria */}
      {lobby && rooms.length > 0 && (
        <section className="w-full px-4 pb-space-xl md:px-margin">
          <div className="glass mx-auto flex max-w-7xl flex-col items-center justify-between gap-space-md p-space-md sm:flex-row">
            <p className="font-mono-move text-body-sm text-on-surface-variant" data-testid="range">
              Mostrando <strong className="font-semibold text-primary">{pageInfo.from}-{pageInfo.to}</strong> de{' '}
              <strong className="font-semibold text-on-surface">{pageInfo.total}</strong> {pageInfo.total === 1 ? 'sala pública' : 'salas públicas'}{filtering ? ' (filtradas)' : ' activas'}
            </p>
            {pageInfo.pages > 1 && (
              <nav aria-label="Páginas" className="flex items-center gap-space-xs">
                <button type="button" aria-label="Página anterior" disabled={pageInfo.page === 1} onClick={() => setPage(pageInfo.page - 1)} data-testid="page-prev" className="rounded-lg bg-surface-container p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30">
                  <Icon name="chevron_left" className="!text-lg" />
                </button>
                {pageList(pageInfo.page, pageInfo.pages).map((n, i) =>
                  n === null ? (
                    <span key={`gap${i}`} className="px-1 text-outline">…</span>
                  ) : (
                    <button key={n} type="button" aria-current={n === pageInfo.page ? 'page' : undefined} onClick={() => setPage(n)} data-testid={`page-${n}`} className={`flex h-9 w-9 items-center justify-center rounded-lg font-headline-sm text-body-sm transition-colors ${n === pageInfo.page ? 'bg-primary-container font-bold text-on-primary-fixed shadow-md' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'}`}>
                      {n}
                    </button>
                  ),
                )}
                <button type="button" aria-label="Página siguiente" disabled={pageInfo.page === pageInfo.pages} onClick={() => setPage(pageInfo.page + 1)} data-testid="page-next" className="rounded-lg bg-surface-container p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30">
                  <Icon name="chevron_right" className="!text-lg" />
                </button>
              </nav>
            )}
            <button type="button" onClick={doRandom} disabled={!online || randomBusy} className="btn btn-secondary btn-sm !text-on-surface" data-testid="btn-random">
              <Icon name={randomBusy ? 'progress_activity' : 'shuffle'} className={`!text-lg text-primary ${randomBusy ? 'animate-spin' : ''}`} /> Entrar a sala aleatoria
            </button>
          </div>
        </section>
      )}

      <CreateRoomDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} busy={creating} initialClock="3+2" initialVisibility="public" />
    </div>
  );
}
