import { useCallback, useEffect, useState } from 'react';
import { socket, request } from '../lib/socket.js';
import { useSession } from '../context/SessionContext.jsx';

/**
 * Suscripción en vivo al listado de salas públicas. Devuelve `{ lobby, refresh }`, donde `lobby` es
 * `{ rooms, stats, serverTime, receivedAt }` o `null` hasta recibir el primer listado.
 * `receivedAt` (hora local) sirve para animar los relojes entre mensajes sin depender del reloj del servidor.
 * Se vuelve a suscribir solo tras una reconexión. La suscripción es por conexión: úsalo en una vista a la vez.
 */
export function useLobby() {
  const { status } = useSession();
  const [lobby, setLobby] = useState(null);

  useEffect(() => {
    if (status !== 'online') return undefined;
    let active = true;
    const accept = (list) => active && setLobby({ ...list, receivedAt: Date.now() });
    socket.on('lobby:list', accept);
    request('lobby:subscribe').then((res) => res.ok && accept(res.lobby));
    return () => {
      active = false;
      socket.off('lobby:list', accept);
      request('lobby:unsubscribe');
    };
  }, [status]);

  /** Pide el listado otra vez (el botón "Actualizar lista"). Devuelve cuando llegó. */
  const refresh = useCallback(async () => {
    const res = await request('lobby:subscribe');
    if (res.ok) setLobby({ ...res.lobby, receivedAt: Date.now() });
    return res.ok;
  }, []);

  return { lobby, refresh };
}
