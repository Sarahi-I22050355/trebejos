import { useEffect, useState } from 'react';
import { socket, request } from '../lib/socket.js';
import { useSession } from '../context/SessionContext.jsx';

/**
 * Suscripción en vivo al listado de salas públicas. Devuelve `{ rooms, stats, serverTime }`
 * o `null` hasta recibir el primer listado. Se vuelve a suscribir solo tras una reconexión.
 * Nota: la suscripción es por conexión; úsalo en una sola vista a la vez.
 */
export function useLobby() {
  const { status } = useSession();
  const [lobby, setLobby] = useState(null);

  useEffect(() => {
    if (status !== 'online') return undefined;
    let active = true;
    const onList = (list) => active && setLobby(list);
    socket.on('lobby:list', onList);
    request('lobby:subscribe').then((res) => active && res.ok && setLobby(res.lobby));
    return () => {
      active = false;
      socket.off('lobby:list', onList);
      request('lobby:unsubscribe');
    };
  }, [status]);

  return lobby;
}
