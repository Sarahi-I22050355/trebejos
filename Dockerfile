# syntax=docker/dockerfile:1
# Trebejos en una sola imagen: el backend (Express + Socket.IO + Stockfish) sirve también el frontend ya compilado,
# así que solo hay un puerto (3000) y ningún CORS que configurar.
#
# Debian Trixie, igual que el servidor de producción: `apt install stockfish` trae Stockfish 17 en /usr/games/stockfish.

# ---------------------------------------------------------------- 1) compila el frontend
FROM node:22-trixie-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------- 2) dependencias del backend (solo producción)
FROM node:22-trixie-slim AS backend-deps
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------- 3) imagen final
FROM node:22-trixie-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends stockfish \
 && rm -rf /var/lib/apt/lists/* \
 && /usr/games/stockfish quit >/dev/null

WORKDIR /app
# El servidor busca el frontend en ../../frontend/dist respecto a backend/src.
COPY --from=backend-deps /build/backend/node_modules ./backend/node_modules
COPY backend/package.json ./backend/
COPY backend/src ./backend/src
COPY --from=frontend /build/frontend/dist ./frontend/dist

# El usuario `node` ya viene en la imagen oficial: no se ejecuta nada como root.
USER node
WORKDIR /app/backend
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
