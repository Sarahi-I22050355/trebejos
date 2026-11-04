import { useCallback, useSyncExternalStore } from 'react';
import { useSession } from '../context/SessionContext.jsx';

// Un solo temporizador por cada intervalo (100 ms, 250 ms, 500 ms…), compartido por todos los componentes que
// lo pidan, y que solo corre mientras haya alguien escuchando. Así doce relojes del listado cuestan un `setInterval`.
const tickers = new Map(); // intervalo → { now, listeners, id }

function tickerFor(ms) {
  let ticker = tickers.get(ms);
  if (!ticker) {
    ticker = { now: Date.now(), listeners: new Set(), id: null };
    tickers.set(ms, ticker);
  }
  return ticker;
}

function subscribe(ms, listener) {
  const ticker = tickerFor(ms);
  // El valor guardado puede ser viejo (el temporizador estuvo parado, o falta hasta el próximo tic): se refresca al suscribirse.
  // React vuelve a leerlo justo después de suscribir, así que el componente se corrige en el mismo instante, sin esperar al tic.
  ticker.now = Date.now();
  if (ticker.listeners.size === 0) {
    ticker.id = setInterval(() => {
      ticker.now = Date.now();
      ticker.listeners.forEach((fn) => fn());
    }, ms);
  }
  ticker.listeners.add(listener);
  return () => {
    ticker.listeners.delete(listener);
    if (ticker.listeners.size === 0) {
      clearInterval(ticker.id);
      ticker.id = null;
    }
  };
}

const NO_TICK = () => () => {};

/**
 * Hora actual que se refresca cada `intervalMs` (para relojes y cuentas regresivas).
 * Con `null` no corre ningún temporizador y devuelve 0: es para componentes que solo necesitan la hora a veces.
 * El componente que lo usa se vuelve a dibujar en cada tic: por eso se llama solo en componentes pequeños.
 */
export function useNow(intervalMs = 1000) {
  const sub = useCallback((listener) => (intervalMs ? subscribe(intervalMs, listener) : NO_TICK()), [intervalMs]);
  return useSyncExternalStore(sub, () => (intervalMs ? tickerFor(intervalMs).now : 0), () => 0);
}

/** Hora del SERVIDOR estimada: evita desfases si el reloj del dispositivo va mal. */
export function useServerNow(intervalMs = 1000) {
  const now = useNow(intervalMs);
  const { clockOffset } = useSession();
  return now + clockOffset;
}
