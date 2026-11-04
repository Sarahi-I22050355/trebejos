// Listado de salas públicas, compartido por toda la app: UNA sola suscripción al servidor aunque lo pidan varias pantallas,
// y la última lista se conserva mientras se navega (inicio → salas muestra el listado al instante, sin pedirlo otra vez).
import { socket, request } from './socket.js';

const CLOSE_DELAY_MS = 3000; // al dejar la última pantalla que lo usa, la suscripción espera un poco antes de cerrarse
const MAX_AGE_MS = 30_000; // una lista más vieja que esto ya no sirve para pintar mientras llega la nueva
let lobby = null; // { rooms, stats, serverTime, receivedAt }
const listeners = new Set();
let closeTimer = null;

const emit = () => listeners.forEach((fn) => fn());

function accept(list) {
  lobby = { ...list, receivedAt: Date.now() };
  emit();
}

/** Pide la lista y se suscribe a sus cambios (lobby:subscribe no necesita sesión iniciada: va en paralelo a session:init). */
export async function refreshLobby() {
  const res = await request('lobby:subscribe');
  if (res.ok && listeners.size > 0) accept(res.lobby);
  return res.ok;
}

// Tras cada (re)conexión hay que volver a suscribirse: la suscripción pertenece a la conexión, no al navegador.
const onConnect = () => {
  if (listeners.size > 0) refreshLobby();
};

function close() {
  closeTimer = null;
  if (listeners.size > 0) return;
  socket.off('lobby:list', accept);
  socket.off('connect', onConnect);
  request('lobby:unsubscribe');
}

/**
 * Para useSyncExternalStore: la primera pantalla que escucha abre la suscripción y la última la cierra, con unos segundos de margen.
 * Al ir de una pantalla con listado a otra (inicio → salas) la segunda llega antes de que se cierre: no hay baja y alta
 * en el servidor, y la lista ya está a mano para pintarla al instante.
 */
export function subscribeLobby(listener) {
  listeners.add(listener);
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  } else if (listeners.size === 1) {
    socket.on('lobby:list', accept);
    socket.on('connect', onConnect);
    if (socket.connected) refreshLobby();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && !closeTimer) closeTimer = setTimeout(close, CLOSE_DELAY_MS);
  };
}

export const getLobby = () => (lobby && Date.now() - lobby.receivedAt <= MAX_AGE_MS ? lobby : null);
