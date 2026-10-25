// Emite `lobby:list` a quienes están viendo el listado de salas públicas.
// - Con throttle (como mucho 1 envío por `lobbyThrottleMs`, con envío inmediato
//   en el primer cambio y uno final si hubo más cambios durante la pausa).
// - Con latido periódico, para que "tiempo bajo" y los relojes se refresquen
//   aunque nadie mueva pieza.
export const LOBBY_CHANNEL = 'lobby';

export function createLobbyBroadcaster({ io, manager, config }) {
  let cooling = null;
  let dirty = false;

  const subscribers = () => io.sockets.adapter.rooms.get(LOBBY_CHANNEL)?.size ?? 0;

  function flush() {
    if (subscribers() > 0) io.to(LOBBY_CHANNEL).emit('lobby:list', manager.lobbyList());
  }

  function markDirty() {
    if (cooling) {
      dirty = true;
      return;
    }
    flush();
    cooling = setTimeout(() => {
      cooling = null;
      if (dirty) {
        dirty = false;
        markDirty();
      }
    }, config.lobbyThrottleMs);
    cooling.unref?.();
  }

  const heartbeat = setInterval(flush, config.lobbyHeartbeatMs);
  heartbeat.unref?.();

  return {
    markDirty,
    flush,
    close() {
      clearTimeout(cooling);
      clearInterval(heartbeat);
    },
  };
}
