// Configuración centralizada. Todo se puede sobrescribir con variables de entorno
// (ver README). Las pruebas pasan un objeto parcial a `loadConfig()`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== '' && value != null ? n : fallback;
};
const bool = (value, fallback) =>
  value == null || value === '' ? fallback : !['0', 'false', 'no'].includes(String(value).toLowerCase());

export function loadConfig(overrides = {}, env = process.env) {
  const config = {
    port: num(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    // En producción frontend y backend comparten origen; CORS solo se usa en desarrollo (Vite :5173).
    corsOrigin: env.CORS_ORIGIN || null,
    // Carpeta con el build de Vite; si no existe, el backend solo sirve la API/WebSocket.
    staticDir: env.STATIC_DIR || path.resolve(here, '../../frontend/dist'),

    // --- Reconexión ---
    reconnectGraceMs: num(env.RECONNECT_GRACE_SECONDS, 90) * 1000,
    spectatorGraceMs: num(env.SPECTATOR_GRACE_SECONDS, 30) * 1000,

    // --- Salas ---
    maxRooms: num(env.MAX_ROOMS, 500),
    maxSpectators: num(env.MAX_SPECTATORS_PER_ROOM, 50),
    // Con el código de una sala privada llena se puede entrar como espectador.
    allowPrivateSpectators: bool(env.ALLOW_PRIVATE_SPECTATORS, true),
    waitingRoomTtlMs: num(env.WAITING_ROOM_TTL_MINUTES, 30) * 60_000,
    finishedRoomTtlMs: num(env.FINISHED_ROOM_TTL_MINUTES, 15) * 60_000,
    idleRoomTtlMs: num(env.IDLE_ROOM_TTL_MINUTES, 120) * 60_000,
    sweepIntervalMs: 30_000,

    // --- Reloj (límites de lo que acepta `room:create`) ---
    minClockSeconds: num(env.MIN_CLOCK_SECONDS, 15),
    maxClockSeconds: 3 * 60 * 60,
    maxIncrementSeconds: 60,

    // --- Bot (Stockfish por UCI) ---
    botEnabled: bool(env.BOT_ENABLED, true),
    // Ruta del binario; vacío = buscar `stockfish` en el PATH y en /usr/games (paquete de Debian).
    stockfishPath: env.STOCKFISH_PATH || '',
    stockfishArgs: [],
    botEngines: num(env.BOT_ENGINES, 2), // procesos de Stockfish compartidos por todas las partidas
    botQueueTimeoutMs: 8000,
    botGraceMs: 4000, // margen extra sobre el tiempo de pensar antes de dar al motor por colgado

    // --- Lobby ---
    lobbyThrottleMs: 1000,
    lobbyHeartbeatMs: 5000,
    lowTimeMs: 10_000,

    // --- Anti-abuso ---
    chatMaxLength: 300,
    chatRateLimit: { max: 5, windowMs: 5000 },
    eventRateLimit: { max: 40, windowMs: 1000 },
    chatHistory: 100,
  };
  return { ...config, ...overrides };
}
