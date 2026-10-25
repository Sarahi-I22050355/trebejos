// Presets de reloj y utilidades para mostrar tiempos.
export const CLOCK_PRESETS = [
  { id: 'none', label: 'Sin reloj', clock: null },
  { id: '3+2', label: '3+2', clock: { initialSeconds: 180, incrementSeconds: 2 } },
  { id: '5+0', label: '5+0', clock: { initialSeconds: 300, incrementSeconds: 0 } },
  { id: '10+0', label: '10+0', clock: { initialSeconds: 600, incrementSeconds: 0 } },
  { id: '15+10', label: '15+10', clock: { initialSeconds: 900, incrementSeconds: 10 } },
];

/** Categoría por tiempo inicial (como en el listado de Stitch). */
export function clockCategory(initialMs) {
  const minutes = initialMs / 60_000;
  if (minutes < 3) return { id: 'bullet', label: 'Bala', icon: 'bolt' };
  if (minutes < 10) return { id: 'blitz', label: 'Blitz', icon: 'timer' };
  if (minutes < 15) return { id: 'rapid', label: 'Rápida', icon: 'hourglass_top' };
  return { id: 'classic', label: 'Clásica', icon: 'schedule' };
}

/** `{ initialMs, incrementMs }` → { short: "3+2", category, long: "3 min + 2 s de incremento" }. */
export function describeClock(clock) {
  if (!clock) return { short: 'Sin reloj', category: { id: 'none', label: 'Sin reloj', icon: 'all_inclusive' }, long: 'Sin límite de tiempo' };
  const minutes = clock.initialMs / 60_000;
  const seconds = clock.incrementMs / 1000;
  // Bajo un minuto se cuenta en segundos ("30 s"), no en fracciones de minuto.
  const subMinute = minutes < 1;
  const baseShort = subMinute ? `${clock.initialMs / 1000}s` : Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  const baseLong = subMinute ? `${clock.initialMs / 1000} s` : `${baseShort} min`;
  return {
    short: `${baseShort}+${seconds}`,
    category: clockCategory(clock.initialMs),
    long: `${baseLong}${seconds ? ` + ${seconds} s de incremento` : ' sin incremento'}`,
  };
}

/** 83_000 → "1:23"; 3_725_000 → "1:02:05"; bajo 10 s muestra décimas si se pide. */
export function formatClock(ms, { tenths = false } = {}) {
  const safe = Math.max(0, ms);
  if (tenths && safe < 10_000) return `0:0${(safe / 1000).toFixed(1)}`;
  const total = Math.ceil(safe / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** Segundos transcurridos → "09:59" (para "tiempo de espera"). */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
