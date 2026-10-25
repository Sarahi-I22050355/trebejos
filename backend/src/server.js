// Construye la app (Express + Socket.IO + dominio) sin arrancar el puerto,
// para poder reutilizarla en las pruebas con una configuración distinta.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { loadConfig } from './config.js';
import { SessionStore } from './rooms/SessionStore.js';
import { RoomManager } from './rooms/RoomManager.js';
import { attachSockets } from './sockets/index.js';
import { BotService } from './bot/BotService.js';

export function createServer(overrides = {}) {
  const config = loadConfig(overrides);
  const startedAt = Date.now();

  const sessions = new SessionStore();
  const bots = new BotService({ config });
  const manager = new RoomManager({ config, sessions, bots });

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });

  // Healthcheck para Docker / monitoreo.
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      rooms: manager.rooms.size,
      bot: { available: bots.available, engine: bots.engineName },
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  // En producción el mismo proceso sirve el build de Vite (un solo puerto, sin CORS).
  const indexHtml = path.join(config.staticDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.staticDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
      res.sendFile(indexHtml);
    });
  }

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: config.corsOrigin ? { origin: config.corsOrigin.split(',').map((o) => o.trim()) } : undefined,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 100_000,
  });

  const realtime = attachSockets(io, { manager, sessions, config });
  manager.startSweeper();

  return {
    config,
    app,
    io,
    httpServer,
    manager,
    sessions,
    async listen(port = config.port, host = config.host) {
      await bots.start(); // si Stockfish no está, el servidor arranca igual con el bot desactivado
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => resolve(httpServer.address().port));
      });
    },
    async close() {
      realtime.close();
      bots.close();
      manager.close();
      // Las conexiones HTTP keep-alive en reposo retrasarían el cierre del servidor: se cortan ya,
      // y si alguna sigue activa pasado un segundo, también.
      httpServer.closeIdleConnections?.();
      const forceTimer = setTimeout(() => httpServer.closeAllConnections?.(), 1000);
      forceTimer.unref?.();
      await io.close(); // también cierra el servidor HTTP subyacente
      clearTimeout(forceTimer);
    },
  };
}
