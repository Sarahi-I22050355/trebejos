import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo el backend corre en :3000 y Vite en :5173; el proxy evita CORS
// y deja el WebSocket en el mismo origen, igual que en producción.
const backend = process.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: backend, ws: true },
      '/health': backend,
    },
  },
  build: { sourcemap: false },
});
