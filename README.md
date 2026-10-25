# Trebejos

Ajedrez en línea en tiempo real, sin cuentas ni contraseñas. Eliges un nombre, creas una sala, compartes el código y juegas.

- **Salas privadas** (por código o enlace) y **salas públicas** con listado en vivo.
- **Espectadores**, **chat**, **tablas**, **revancha** y **relojes** opcionales (el servidor es quien manda el tiempo).
- **Reconexión**: si se cae tu conexión tienes 90 s para volver a la misma partida.
- **Contra el bot** (Stockfish, 4 niveles) y modo **Aprende a jugar** con lecciones interactivas y partida guiada.
- **Sonidos** sintetizados (sin archivos de audio), con interruptor en la cabecera.
- Sin base de datos: todo vive en memoria. La identidad es un token en el navegador (`localStorage`) más un nombre de sesión.

## Despliegue con Docker

Requisitos: Docker con Compose v2 en el servidor. La imagen se construye sobre Debian Trixie e instala `stockfish` con `apt` (Stockfish 17).

```bash
git clone https://github.com/Sarahi-I22050355/trebejos.git
cd trebejos
docker compose up -d --build
curl http://localhost:3000/health
```

`/health` responde algo como `{"status":"ok","rooms":0,"bot":{"available":true,"engine":"Stockfish 17"},…}`.
Si `bot.available` sale `false`, el resto de la app funciona igual pero la tarjeta "Jugar contra el bot" aparece desactivada.

Un solo contenedor sirve todo: el backend (Express + Socket.IO), el frontend ya compilado y los procesos de Stockfish.
Solo se publica el **puerto 3000**; no hay CORS que configurar porque todo sale del mismo origen.

Comandos útiles:

```bash
docker compose logs -f trebejos      # registros
docker compose up -d --build         # actualizar tras un git pull
docker compose down                  # detener (las salas en curso se pierden: viven en memoria)
```

### Cloudflare Tunnel

`cloudflared` **no** forma parte de este `docker-compose.yml`: se asume que el túnel ya corre aparte. Solo falta agregar una ruta (Public Hostname) que apunte a Trebejos:

| Campo | Valor |
|---|---|
| Servicio / Type | `HTTP` |
| URL | `<dirección donde cloudflared alcanza a Trebejos>:3000` |

La dirección depende de dónde corra tu túnel:

- **`cloudflared` en otro contenedor de Docker**: usa la IP o el nombre del host de Docker con el puerto publicado (por ejemplo `http://172.17.0.1:3000` o `http://host.docker.internal:3000`). También puedes unir ambos contenedores a una red de Docker compartida y usar `http://trebejos:3000`.
- **`cloudflared` instalado en el mismo servidor, fuera de Docker**: `http://localhost:3000`. En ese caso conviene publicar solo en loopback poniendo `TREBEJOS_BIND=127.0.0.1` en `.env`.

Los WebSockets de Socket.IO pasan por Cloudflare sin configuración extra. No actives reglas de caché sobre `/socket.io/*`.

### Variables de entorno

Todas son opcionales. Para cambiarlas, copia `.env.example` a `.env` junto al `docker-compose.yml`.

| Variable | Por defecto | Qué hace |
|---|---|---|
| `TREBEJOS_BIND` | `0.0.0.0` | Interfaz del host donde se publica el puerto (`127.0.0.1` para dejarlo solo local). |
| `TREBEJOS_PORT` | `3000` | Puerto del host. Dentro del contenedor siempre es 3000. |
| `BOT_ENABLED` | `true` | Activa el modo contra el bot. |
| `BOT_ENGINES` | `2` | Procesos de Stockfish compartidos por todas las partidas contra el bot (≈ uno por núcleo libre). |
| `RECONNECT_GRACE_SECONDS` | `90` | Tiempo para volver a una partida tras perder la conexión. |
| `MIN_CLOCK_SECONDS` | `15` | Tiempo mínimo que se acepta al crear una sala con reloj. |
| `MAX_ROOMS` | `500` | Tope de salas simultáneas. |
| `MAX_SPECTATORS_PER_ROOM` | `50` | Tope de espectadores por sala. |
| `ALLOW_PRIVATE_SPECTATORS` | `true` | Si una sala privada llena admite espectadores que tengan el código. |
| `WAITING_ROOM_TTL_MINUTES` | `30` | Una sala sin rival se cierra pasado este tiempo. |
| `FINISHED_ROOM_TTL_MINUTES` | `15` | Una partida terminada se cierra pasado este tiempo. |
| `IDLE_ROOM_TTL_MINUTES` | `120` | Una sala sin actividad se cierra pasado este tiempo. |

Solo fuera de Docker (ejecutando el backend a mano): `PORT`, `HOST`, `STATIC_DIR` (carpeta del frontend compilado), `STOCKFISH_PATH` (por defecto se busca `stockfish` en el `PATH` y en `/usr/games`), `CORS_ORIGIN` (solo si el frontend se sirve desde otro origen) y `SPECTATOR_GRACE_SECONDS`.

### Qué esperar en producción

- **Un solo proceso, en memoria.** Reiniciar el contenedor cierra las salas en curso; los jugadores vuelven a empezar. No hay estado que respaldar.
- **No escala horizontalmente** tal cual (las salas viven en un proceso). Una instancia aguanta de sobra decenas de partidas; el bot es lo que más CPU usa, por eso se limita con `BOT_ENGINES`.
- El contenedor corre como usuario no root, con el sistema de archivos de solo lectura, sin capacidades extra y con 512 MB de tope.

## Desarrollo local

Requisitos: Node 22. Para el bot, Stockfish (`sudo apt install stockfish`; en Debian queda en `/usr/games/stockfish`).

```bash
# terminal 1 — backend en :3000
cd backend && npm install && npm run dev

# terminal 2 — frontend en :5173 (con proxy al backend)
cd frontend && npm install && npm run dev
```

Abre <http://localhost:5173>. Para probar con dos jugadores en la misma máquina, usa una ventana de incógnito o añade `?s=nombre` a la URL para tener otra identidad.

### Pruebas

```bash
cd backend  && npm test          # 93 pruebas (incluye Stockfish real y un motor falso)
cd frontend && npm test          # pruebas de la lógica pura (tablero, lecciones, salas, sonidos…)
```

Pruebas de extremo a extremo con Playwright (navegadores reales). Necesitan el backend sirviendo `frontend/dist` y, para las del reloj, `MIN_CLOCK_SECONDS=1`:

```bash
cd frontend && npm run build
cd ../backend && PORT=3917 MIN_CLOCK_SECONDS=1 STATIC_DIR="$(pwd)/../frontend/dist" node src/index.js &
cd ../frontend && for f in b c d e f g h; do BASE_URL=http://localhost:3917 node e2e/phase-$f.cjs; done
```

Cada archivo `e2e/phase-*.cjs` cubre una parte: b (salas), c (partida), d (chat y espectadores), e (bot), f (aprender), g (salas públicas), h (sonidos). Conviene reiniciar el servidor entre ellos para que arranque sin salas.

## Estructura

```
backend/
  src/rooms/     Room, RoomManager, SessionStore (dominio, sin sockets)
  src/sockets/   transporte Socket.IO: eventos, lobby, límites de uso
  src/bot/       Stockfish por UCI: motores, cola y niveles
  PROTOCOL.md    contrato completo de eventos y errores
frontend/
  src/pages/     Inicio, Sala, Salas públicas, Aprende a jugar
  src/components/ tablero, partida, sala de espera, lobby, lecciones…
  src/lib/       lógica pura (tablero, lecciones, filtros del lobby, sonidos)
Dockerfile · docker-compose.yml
```

El contrato entre cliente y servidor está en [`backend/PROTOCOL.md`](backend/PROTOCOL.md).
