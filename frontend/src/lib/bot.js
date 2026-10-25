// Niveles del bot (los ids coinciden con backend/src/bot/levels.js).
export const BOT_LEVELS = [
  { id: 'beginner', label: 'Principiante', hint: 'Comete errores a propósito: ideal para empezar.' },
  { id: 'intermediate', label: 'Intermedio', hint: 'Juega con cabeza, pero deja algunas jugadas al alcance.' },
  { id: 'advanced', label: 'Avanzado', hint: 'Táctico y sólido: exige jugar bien.' },
  { id: 'expert', label: 'Experto', hint: 'Stockfish a pleno rendimiento. ¡Suerte!' },
];

export const BOT_COLORS = [
  { value: 'w', label: 'Blancas' },
  { value: 'b', label: 'Negras' },
  { value: 'random', label: 'Aleatorio' },
];
