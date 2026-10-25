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
  const [features, setFeatures] = useState({ bot: false }); // capacidades que declara el servidor
  const [clockOffset, setClockOffset] = useState(0); // serverTime - Date.now()
  const nameRef = useRef(name);
  nameRef.current = name;
  const roomRef = useRef(room);
  roomRef.current = room;
  // (los handlers de juego también actualizan roomRef al instante; ver `commit`)

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
      setFeatures(res.server ?? { bot: false });
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
    // Aplica un cambio a la sala y mantiene `roomRef` al día para encadenar eventos seguidos.
    const commit = (next) => {
      roomRef.current = next;
      setRoom(next);
    };
    const syncClock = (clock) => clock?.enabled && setClockOffset(clock.serverTime - Date.now());

    const onMove = (m) => {
      const r = roomRef.current;
      if (!r || r.code !== m.code) return;
      if (m.ply !== r.ply + 1) {
        // Salto en la numeración (evento perdido o repetido): se pide el estado completo.
        request('room:sync').then((res) => res.ok && applySnapshot(res.room));
        return;
      }
      syncClock(m.clock);
      commit({
        ...r,
        fen: m.fen,
        turn: m.turn,
        inCheck: m.inCheck,
        ply: m.ply,
        lastMove: { from: m.from, to: m.to },
        clock: m.clock,
        drawOffer: null,
        moves: [...r.moves, { ply: m.ply, san: m.san, from: m.from, to: m.to, color: m.color, piece: m.piece, captured: m.captured, promotion: m.promotion, ts: m.ts, spentMs: m.spentMs }],
      });
    };
    const onOver = ({ code, result, fen, clock }) => {
      const r = roomRef.current;
      if (!r || r.code !== code) return;
      syncClock(clock);
      commit({ ...r, status: 'finished', result, fen, clock, drawOffer: null, rematch: [] });
    };
    const onDrawOffer = ({ code, by, declinedBy }) => {
      const r = roomRef.current;
      if (!r || r.code !== code) return;
      if (declinedBy) notify(`${r.players[declinedBy]?.name ?? 'Tu rival'} rechazó las tablas.`, 'info');
      commit({ ...r, drawOffer: by });
    };
    const onChat = (m) => {
      const r = roomRef.current;
      if (!r || r.code !== m.code || r.chat.some((x) => x.id === m.id)) return;
      const message = { id: m.id, name: m.name, role: m.role, text: m.text, ts: m.ts };
      commit({ ...r, chat: [...r.chat, message].slice(-100) }); // el servidor guarda los últimos 100
    };
    const onRematch = ({ code, rematch }) => {
      const r = roomRef.current;
      if (r && r.code === code) commit({ ...r, rematch });
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
    socket.on('game:move', onMove);
    socket.on('game:over', onOver);
    socket.on('game:drawOffer', onDrawOffer);
    socket.on('game:rematch', onRematch);
    socket.on('chat:message', onChat);
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
      socket.off('game:move', onMove);
      socket.off('game:over', onOver);
      socket.off('game:drawOffer', onDrawOffer);
      socket.off('game:rematch', onRematch);
      socket.off('chat:message', onChat);
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
      startBot: withRoom('bot:start'),
      joinRoom: (code) => withRoom('room:join')({ code }),
      joinRandom: () => withRoom('room:joinRandom')(),
      setVisibility: (visibility) => withRoom('room:setVisibility')({ visibility }),
      move: (from, to, promotion) => request('game:move', { from, to, promotion }),
      resign: () => request('game:resign'),
      offerDraw: () => request('game:offerDraw'),
      respondDraw: (accept) => request('game:respondDraw', { accept }),
      rematch: () => request('game:rematch'),
      sendChat: (text) => request('chat:send', { text }),
      leaveRoom: async () => {
        // Se sale de inmediato en la interfaz (sin esperar al servidor): evita que el chip "En sala"
        // parpadee tras volver al inicio. Si el servidor rechazara salir, el próximo room:state lo corrige.
        roomRef.current = null;
        setRoom(null);
        return request('room:leave');
      },
    }),
    [rename, withRoom],
  );

  const value = useMemo(
    () => ({ status, ready, name, room, clockOffset, features, ...actions }),
    [status, ready, name, room, clockOffset, features, actions],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
