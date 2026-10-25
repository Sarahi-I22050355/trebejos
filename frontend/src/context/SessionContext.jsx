// Estado de la conexión, la identidad y la sala actual. Es el único lugar que habla
// con el socket para sesión/sala; las páginas consumen `useSession()`.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { socket, request } from '../lib/socket.js';
import { getToken, loadName, storeName } from '../lib/session.js';
import { NAME_HINT, randomName, sanitizeName } from '../lib/name.js';
import { useToast } from '../components/Toasts.jsx';

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

const CLOSED_REASONS = {
  'host-left': 'La sala se cerró porque el anfitrión salió.',
  empty: 'La sala se cerró: ya no quedan jugadores.',
  expired: 'La sala se cerró por inactividad.',
};

export function SessionProvider({ children }) {
  const { notify } = useToast();
  /** 'connecting' | 'online' | 'offline' */
  const [status, setStatus] = useState('connecting');
  const [ready, setReady] = useState(false); // ya hubo un session:init exitoso
  const [name, setName] = useState(() => loadName() ?? '');
  const [room, setRoom] = useState(null);
  const [clockOffset, setClockOffset] = useState(0); // serverTime - Date.now()
  const nameRef = useRef(name);
  nameRef.current = name;
  const roomRef = useRef(room);
  roomRef.current = room;

  const applySnapshot = useCallback((snapshot) => {
    setRoom(snapshot ?? null);
    if (snapshot) setClockOffset(snapshot.serverTime - Date.now());
  }, []);

  useEffect(() => {
    // Cada (re)conexión se identifica con el token guardado: así el servidor nos devuelve
    // a la sala en la que estábamos, con el mismo color y el tablero tal cual.
    async function identify() {
      const sent = nameRef.current || randomName();
      let res = await request('session:init', { token: getToken(), name: sent });
      if (!res.ok && res.error.code === 'INVALID_NAME') {
        res = await request('session:init', { token: getToken(), name: randomName() });
      }
      if (!res.ok) return setStatus('offline');

      let finalName = res.session.name;
      // El usuario pudo escribir otro nombre mientras se conectaba: se respeta (fuera de una sala).
      if (!res.room && nameRef.current && nameRef.current !== sent) {
        const again = await request('session:rename', { name: nameRef.current });
        if (again.ok) finalName = again.name;
      }
      setName(finalName);
      storeName(finalName);
      applySnapshot(res.room);
      setStatus('online');
      setReady(true);
    }

    const onConnect = () => identify();
    const onDisconnect = () => setStatus('offline');
    const onState = (snapshot) => applySnapshot(snapshot);
    const onSpectators = ({ code, count, names }) =>
      setRoom((r) => (r && r.code === code ? { ...r, spectators: { count, names } } : r));
    const onPresence = ({ code, color, connected, graceEndsAt, serverTime }) => {
      setClockOffset(serverTime - Date.now());
      setRoom((r) =>
        r && r.code === code
          ? { ...r, players: { ...r.players, [color]: { ...r.players[color], connected, graceEndsAt: graceEndsAt ?? null } } }
          : r,
      );
    };
    const onClosed = ({ code, reason }) => {
      setRoom((r) => (r && r.code === code ? null : r));
      notify(CLOSED_REASONS[reason] ?? 'La sala se cerró.', 'info');
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onDisconnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('room:spectators', onSpectators);
    socket.on('presence:update', onPresence);
    socket.on('room:closed', onClosed);
    if (socket.connected) onConnect();
    else socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onDisconnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('room:spectators', onSpectators);
      socket.off('presence:update', onPresence);
      socket.off('room:closed', onClosed);
    };
  }, [applySnapshot, notify]);

  // ------------------------------------------------------------------ acciones
  const rename = useCallback(async (next) => {
    // Sin conexión (aún conectando): se guarda en local y se envía en el próximo session:init.
    if (!socket.connected) {
      const clean = sanitizeName(next);
      if (!clean) return { ok: false, error: { code: 'INVALID_NAME', message: NAME_HINT } };
      if (roomRef.current) return { ok: false, error: { code: 'NAME_LOCKED', message: 'No puedes cambiar de nombre mientras estás en una sala.' } };
      nameRef.current = clean;
      setName(clean);
      storeName(clean);
      return { ok: true, name: clean };
    }
    const res = await request('session:rename', { name: next });
    if (res.ok) {
      setName(res.name);
      storeName(res.name);
    }
    return res;
  }, []);

  const withRoom = useCallback(
    (event) => async (payload) => {
      const res = await request(event, payload);
      if (res.ok && res.room) applySnapshot(res.room);
      return res;
    },
    [applySnapshot],
  );

  const actions = useMemo(
    () => ({
      rename,
      createRoom: withRoom('room:create'),
      joinRoom: (code) => withRoom('room:join')({ code }),
      joinRandom: () => withRoom('room:joinRandom')(),
      setVisibility: (visibility) => withRoom('room:setVisibility')({ visibility }),
      leaveRoom: async () => {
        const res = await request('room:leave');
        setRoom(null);
        return res;
      },
    }),
    [rename, withRoom],
  );

  const value = useMemo(
    () => ({ status, ready, name, room, clockOffset, ...actions }),
    [status, ready, name, room, clockOffset, actions],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
