// Una sola conexión Socket.IO para toda la app. En producción comparte origen con el
// backend; en desarrollo Vite hace de proxy (ver vite.config.js).
import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_SERVER_URL || undefined, {
  autoConnect: false,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

const OFFLINE = { ok: false, error: { code: 'OFFLINE', message: 'Sin conexión con el servidor.' } };
const TIMEOUT = { ok: false, error: { code: 'TIMEOUT', message: 'El servidor no respondió. Inténtalo de nuevo.' } };

/** emit con ack como promesa. Nunca rechaza: siempre devuelve `{ ok, ... }`. */
export function request(event, data, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve(OFFLINE);
    socket.timeout(timeoutMs).emit(event, data, (err, res) => resolve(err ? TIMEOUT : res));
  });
}
