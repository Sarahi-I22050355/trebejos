// Error "de negocio": el mensaje (en español) es seguro de mostrar al usuario.
// Los handlers de sockets lo convierten en `{ ok: false, error: { code, message } }`.
export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export const ERRORS = {
  noSession: () => new AppError('NO_SESSION', 'Sesión no iniciada. Recarga la página.'),
  invalidToken: () => new AppError('INVALID_TOKEN', 'Identificador de sesión inválido.'),
  invalidName: () =>
    new AppError(
      'INVALID_NAME',
      'El nombre debe tener entre 2 y 20 caracteres (letras, números, espacios, _ . -).',
    ),
  nameLocked: () => new AppError('NAME_LOCKED', 'No puedes cambiar de nombre mientras estás en una sala.'),
  invalidCode: () => new AppError('INVALID_CODE', 'El código debe tener 6 caracteres.'),
  roomNotFound: () => new AppError('ROOM_NOT_FOUND', 'No existe una sala con ese código.'),
  roomFull: () => new AppError('ROOM_FULL', 'La sala está llena.'),
  serverBusy: () => new AppError('SERVER_BUSY', 'El servidor tiene demasiadas salas abiertas. Intenta más tarde.'),
  invalidOptions: (msg = 'Opciones inválidas.') => new AppError('INVALID_OPTIONS', msg),
  alreadyInGame: (code) =>
    new AppError('ALREADY_IN_GAME', 'Ya estás jugando una partida. Termínala o abandónala primero.', { roomCode: code }),
  notInRoom: () => new AppError('NOT_IN_ROOM', 'No estás en ninguna sala.'),
  notPlayer: () => new AppError('NOT_PLAYER', 'Solo los jugadores pueden hacer eso.'),
  notHost: () => new AppError('NOT_HOST', 'Solo el anfitrión puede hacer eso.'),
  gameNotActive: () => new AppError('GAME_NOT_ACTIVE', 'No hay una partida en curso.'),
  gameOver: (msg = 'La partida ya terminó.') => new AppError('GAME_OVER', msg),
  notYourTurn: () => new AppError('NOT_YOUR_TURN', 'No es tu turno.'),
  illegalMove: () => new AppError('ILLEGAL_MOVE', 'Movimiento ilegal.'),
  rematchUnavailable: () => new AppError('REMATCH_UNAVAILABLE', 'Tu rival ya no está en la sala.'),
  rateLimited: () => new AppError('RATE_LIMITED', 'Vas demasiado rápido. Espera un momento.'),
  badRequest: (msg = 'Solicitud inválida.') => new AppError('BAD_REQUEST', msg),
};
