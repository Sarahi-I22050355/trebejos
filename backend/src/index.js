import { createServer } from './server.js';

const server = createServer();
const port = await server.listen();
console.log(`[trebejos] escuchando en http://${server.config.host}:${port}`);

// Docker envía SIGTERM al detener el contenedor.
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`[trebejos] ${signal} recibido, cerrando…`);
  await server.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
