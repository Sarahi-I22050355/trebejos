import { useSyncExternalStore } from 'react';
import { getLobby, refreshLobby, subscribeLobby } from '../lib/lobbyStore.js';

/**
 * Suscripción en vivo al listado de salas públicas. Devuelve `{ lobby, refresh }`, donde `lobby` es
 * `{ rooms, stats, serverTime, receivedAt }` o `null` hasta recibir el primer listado.
 * `receivedAt` (hora local) sirve para animar los relojes entre mensajes sin depender del reloj del servidor.
 * La suscripción es única y compartida (ver lib/lobbyStore.js): se puede usar en varias pantallas sin peticiones duplicadas.
 */
export function useLobby() {
  const lobby = useSyncExternalStore(subscribeLobby, getLobby, () => null);
  return { lobby, refresh: refreshLobby };
}
