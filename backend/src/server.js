// Construye la app (Express + Socket.IO + dominio) sin arrancar el puerto,
// para poder reutilizarla en las pruebas con una configuración distinta.
import fs from 'node:fs';
import zlib from 'node:zlib';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
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

  // Compresión Brotli / Gzip de las respuestas HTTP (HTML, JS, CSS, JSON, SVG). Las fuentes WOFF2 y otros formatos ya
  // comprimidos los salta solo. Socket.IO no pasa por aquí: el servidor de motores lo atiende antes que Express.
  // Brotli a calidad 6: ~5 % más pequeño que Gzip y ~8 ms por archivo. La 11 (el valor por defecto de Node) gana otro ~8 %
  // pero tarda ~400 ms de CPU por petición, y aquí se comprime al vuelo.
  app.use(compression({ threshold: 1024, brotli: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } } }));

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
  // Caché del navegador: lo de /assets/ lleva un hash del contenido en el nombre (cambia con cada build), así que se
  // guarda un año sin volver a preguntar; el HTML no se guarda (apunta a los archivos con hash de la versión actual).
  const indexHtml = path.join(config.staticDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(config.staticDir, {
        index: false,
        setHeaders(res, file) {
          const relative = path.relative(config.staticDir, file).split(path.sep).join('/');
          if (relative.startsWith('assets/')) res.set('Cache-Control', 'public, max-age=31536000, immutable');
          else if (relative === 'index.html') res.set('Cache-Control', 'no-cache');
          else res.set('Cache-Control', 'public, max-age=86400'); // favicon y similares: sin hash, un día
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
      res.set('Cache-Control', 'no-cache');
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
