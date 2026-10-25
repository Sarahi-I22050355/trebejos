# Protocolo Socket.IO de Trebejos

Todo el tiempo real va por Socket.IO (`/socket.io`). El único endpoint HTTP es `GET /health`.

## Convenciones

- **Cliente → servidor**: `socket.emit(evento, payload, ack)`. El `ack` siempre se responde:
  - éxito: `{ ok: true, ...datos }`
  - error: `{ ok: false, error: { code, message, ...extra } }` (`message` está en español y se puede mostrar tal cual).
- **Servidor → cliente**: eventos sin ack.
- El servidor es la única fuente de verdad. El cliente puede mover "en optimista", pero si el ack
  falla o llega `room:state`, debe volver al estado del servidor.
- Los relojes los calcula el servidor. El cliente solo los dibuja: `wMs`/`bMs` son lo que quedaba en
  `serverTime`; si `running` es un color, ese reloj sigue corriendo desde entonces.
- Nunca se envían tokens de otros jugadores.

## Identidad

El navegador genera un UUID (`crypto.randomUUID()`), lo guarda en `localStorage` y lo manda en
`session:init` cada vez que conecta (incluida cada reconexión). Es la única "credencial".

| Evento | Payload | Ack (`ok: true`) |
|---|---|---|
| `session:init` | `{ token, name? }` | `{ session: { name }, room: Snapshot \| null }` |
| `session:rename` | `{ name }` | `{ name }` (error `NAME_LOCKED` si estás en una sala) |

`session:init` debe ser el primer evento. Si la sesión seguía dentro de una sala (dentro de la ventana
de gracia), `room` trae el estado completo y el cliente queda reincorporado: mismo color, mismo tablero.
El nombre: 2–20 caracteres, letras/números/espacios/`_ . -`. Sin `name`, el servidor asigna uno aleatorio.

## Salas

| Evento | Payload | Ack (`ok: true`) |
|---|---|---|
| `room:create` | `{ visibility: 'public'\|'private', color?: 'w'\|'b'\|'random', clock?: { initialSeconds, incrementSeconds? } \| null }` | `{ code, room }` |
| `room:join` | `{ code }` (acepta `k9x4m2`, `#K9X-4M2`…) | `{ role: 'w'\|'b'\|'spectator', room }` |
| `room:joinRandom` | — | `{ role, room }` (error `NO_WAITING_ROOMS`) |
| `room:leave` | — | `{}` (en plena partida = rendirse) |
| `room:sync` | — | `{ room: Snapshot \| null }` (para resincronizar) |
| `room:setVisibility` | `{ visibility }` (solo el anfitrión, mientras espera rival) | `{ room }` |

- Reloj: `initialSeconds` entre 15 y 10800 (configurable con `MIN_CLOCK_SECONDS`), incremento 0–60. `null` = sin reloj.
- Unirse a una sala con 2 jugadores (o ya terminada) entra como **espectador**. En salas privadas depende de
  `ALLOW_PRIVATE_SPECTATORS` (por defecto sí, con el código).
- Cuando entra el segundo jugador la partida arranca sola y todos reciben `room:state`.
- Una persona solo puede estar en una sala. Si está jugando una partida en curso, `room:create`/`room:join`
  fallan con `ALREADY_IN_GAME` (`error.roomCode` trae la sala).

### Eventos del servidor

| Evento | Payload | Cuándo |
|---|---|---|
| `room:state` | `Snapshot` (personalizado: incluye `you`) | La partida arranca, cambia la visibilidad, hay revancha, alguien se va |
| `room:spectators` | `{ code, count, names[] }` | Entra/sale/se desconecta un espectador |
| `room:closed` | `{ code, reason }` | `host-left`, `empty`, `expired` |
| `presence:update` | `{ code, color, connected, graceEndsAt?, serverTime }` | Un jugador se desconecta (con cuenta regresiva) o vuelve |

## Partida

| Evento | Payload | Ack |
|---|---|---|
| `game:move` | `{ from: 'e2', to: 'e4', promotion?: 'q'\|'r'\|'b'\|'n' }` | `{ ply }` |
| `game:resign` | — | `{}` |
| `game:offerDraw` | — | `{}` |
| `game:respondDraw` | `{ accept: boolean }` | `{}` |
| `game:rematch` | — | `{}` (cuando ambos lo piden: colores intercambiados + `room:state`) |

| Evento del servidor | Payload |
|---|---|
| `game:move` | `{ code, ply, san, from, to, color, piece, captured, promotion, flags, fen, turn, inCheck, clock, ts, spentMs }` |
| `game:over` | `{ code, result: { winner: 'w'\|'b'\|null, reason }, fen, clock }` |
| `game:drawOffer` | `{ code, by: 'w'\|'b' }` o `{ by: null, declinedBy }` |
| `game:rematch` | `{ code, rematch: ['w'?, 'b'?] }` |

`result.reason`: `checkmate`, `stalemate`, `insufficient`, `threefold`, `fifty-moves`, `agreement`,
`resignation`, `timeout`, `timeout-insufficient`, `abandonment`. `winner: null` = tablas.

Reglas de reloj: la primera jugada de la partida no consume tiempo; desde ahí corre el reloj de quien
tiene el turno, y cada jugada (salvo la primera) suma el incremento. Si se acaba el tiempo y el rival
no tiene material para dar mate, son tablas (`timeout-insufficient`).

## Chat

| Evento | Payload | Ack |
|---|---|---|
| `chat:send` | `{ text }` (máx. 300 caracteres, 5 mensajes / 5 s) | `{ id }` |
| `chat:message` (servidor) | `{ code, id, name, role: 'w'\|'b'\|'spectator', text, ts }` | |

El texto es plano (sin HTML). El historial (últimos 100) viaja dentro del `Snapshot`.

## Salas públicas

| Evento | Payload | Ack |
|---|---|---|
| `lobby:subscribe` | — | `{ lobby }` |
| `lobby:unsubscribe` | — | `{}` |
| `lobby:list` (servidor) | `{ rooms: LobbyRoom[], stats: { rooms, players, spectators }, serverTime }` | |

`lobby:list` se envía a los suscritos con throttle (≤ 1/s) y un latido cada 5 s. Solo salas **públicas**
en espera o en juego.

```ts
LobbyRoom = {
  code, status: 'waiting' | 'playing', createdAt,
  players: { name, color, connected, clockMs: number | null }[],
  spectators: number,
  clock: { initialMs, incrementMs, running: 'w'|'b'|null } | null,
  turn, moveNumber, fen, lastMove: { from, to } | null,
  lowTime: boolean,            // a alguien le quedan < 10 s
}
```

## Snapshot (`room:state` y los `room` de los acks)

```ts
Snapshot = {
  code, visibility, mode: 'pvp', status: 'waiting' | 'playing' | 'finished',
  serverTime, createdAt,
  you: { role: 'w'|'b'|'spectator'|null, color: 'w'|'b'|null, isHost: boolean },
  players: { w: Seat | null, b: Seat | null },   // Seat = { name, connected, left, graceEndsAt }
  spectators: { count, names[] },
  fen, turn, inCheck, ply,
  moves: { ply, san, from, to, color, piece, captured, promotion, ts, spentMs }[],
  lastMove: { from, to } | null,
  clock: { enabled: false } | { enabled: true, initialMs, incrementMs, wMs, bMs, running, serverTime },
  result: { winner, reason } | null,
  drawOffer: 'w' | 'b' | null,
  rematch: ('w'|'b')[],
  chat: { id, name, role, text, ts }[],
}
```

## Códigos de error

`NO_SESSION`, `INVALID_TOKEN`, `INVALID_NAME`, `NAME_LOCKED`, `INVALID_CODE`, `ROOM_NOT_FOUND`,
`ROOM_FULL`, `SERVER_BUSY`, `INVALID_OPTIONS`, `ALREADY_IN_GAME`, `NOT_IN_ROOM`, `NOT_PLAYER`,
`NOT_HOST`, `GAME_NOT_ACTIVE`, `GAME_OVER`, `NOT_YOUR_TURN`, `ILLEGAL_MOVE`, `REMATCH_UNAVAILABLE`,
`NO_WAITING_ROOMS`, `RATE_LIMITED` (40 eventos/s por conexión), `BAD_REQUEST`, `INTERNAL`.

## Reconexión

1. Se cae la conexión de un jugador → el rival recibe `presence:update { connected: false, graceEndsAt }`.
   Su reloj (si hay) sigue corriendo.
2. Si vuelve con el mismo token antes de `graceEndsAt` (por defecto 90 s, `RECONNECT_GRACE_SECONDS`),
   `session:init` le devuelve la sala completa y el rival recibe `presence:update { connected: true }`.
3. Si se agota el plazo: `game:over` con `reason: 'abandonment'` y su asiento queda vacío.
4. Si el anfitrión se cae mientras espera rival, la sala se cierra al agotarse la gracia.
5. Un espectador tiene una gracia corta (30 s) y vuelve a la sala igual que un jugador.
6. Varias pestañas con el mismo token cuentan como la misma persona: solo se considera
   desconectada cuando se cierran todas.
