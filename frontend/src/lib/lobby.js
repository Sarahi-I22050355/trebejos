// Lógica pura del listado de salas públicas: filtros, búsqueda y paginación.
import { clockCategory } from './clock.js';

export const PAGE_SIZE = 6;

export const FILTERS = [
  { id: 'all', label: 'Todas', icon: 'apps' },
  { id: 'waiting', label: 'Esperan rival', icon: 'person_add' },
  { id: 'bullet', label: 'Bala (<3 min)', icon: 'bolt' },
  { id: 'blitz', label: 'Blitz (3–9 min)', icon: 'timer' },
  { id: 'rapid', label: 'Rápida (10+ min)', icon: 'hourglass_top' },
  { id: 'none', label: 'Sin reloj', icon: 'all_inclusive' },
  { id: 'spectators', label: 'Con espectadores', icon: 'visibility' },
];

/** Minúsculas y sin acentos: "Mirón" coincide con "miron". */
export const normalizeText = (text) =>
  String(text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function matchesFilter(room, filter) {
  const category = room.clock ? clockCategory(room.clock.initialMs).id : null;
  switch (filter) {
    case 'all': return true;
    case 'waiting': return room.status === 'waiting';
    case 'bullet': return category === 'bullet';
    case 'blitz': return category === 'blitz';
    case 'rapid': return category === 'rapid' || category === 'classic';
    case 'none': return !room.clock;
    case 'spectators': return room.spectators > 0;
    default: return true;
  }
}

/** Busca por código ("#k9x-4m2", "k9x") o por nombre de cualquier jugador (sin acentos). */
export function matchesQuery(room, query) {
  const raw = query.trim();
  if (!raw) return true;
  const code = raw.replace(/[#\s-]/g, '').toUpperCase();
  if (code && room.code.includes(code)) return true;
  const needle = normalizeText(raw);
  return room.players.some((p) => normalizeText(p.name).includes(needle));
}

export const filterRooms = (rooms, { query = '', filter = 'all' } = {}) =>
  rooms.filter((r) => matchesQuery(r, query) && matchesFilter(r, filter));

/** Cuenta por filtro (sobre las salas que ya cumplen la búsqueda), para las pestañas. */
export function countByFilter(rooms, query = '') {
  const searched = rooms.filter((r) => matchesQuery(r, query));
  return Object.fromEntries(FILTERS.map((f) => [f.id, searched.filter((r) => matchesFilter(r, f.id)).length]));
}

/** Página `page` (1-based) de `items`; la página se ajusta si ya no existe. */
export function paginate(items, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: current,
    pages,
    total: items.length,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + size, items.length),
  };
}

/** Botones del paginador: [1, 2, 3, '…', 8]. `null` = puntos suspensivos. */
export function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1]);
  const list = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  list.forEach((n, i) => {
    if (i && n - list[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}
