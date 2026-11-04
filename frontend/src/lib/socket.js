// Una sola conexión Socket.IO para toda la app. En producción comparte origen con el
// backend; en desarrollo Vite hace de proxy (ver vite.config.js).
import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_SERVER_URL || undefined, {
  autoConnect: false,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

// Sin `message`: el texto lo pone `errorText` en el idioma del cliente.
const OFFLINE = { ok: false, error: { code: 'OFFLINE' } };
const TIMEOUT = { ok: false, error: { code: 'TIMEOUT' } };

/** emit con ack como promesa. Nunca rechaza: siempre devuelve `{ ok, ... }`. */
export function request(event, data, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve(OFFLINE);
    socket.timeout(timeoutMs).emit(event, data, (err, res) => resolve(err ? TIMEOUT : res));
  });
}
