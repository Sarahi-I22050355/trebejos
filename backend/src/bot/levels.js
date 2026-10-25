// Niveles del bot. `skill` es el "Skill Level" de Stockfish (0–20): por debajo de 20 el motor
// elige a propósito jugadas menos buenas. Se combina con un tope de profundidad y de tiempo
// por jugada para que ningún nivel tarde más de unos pocos segundos.
// `minDelayMs`: el bot espera al menos eso antes de mover, para que no parezca instantáneo.
export const LEVELS = Object.freeze({
  beginner: { id: 'beginner', label: 'Principiante', skill: 0, depth: 1, movetimeMs: 100, minDelayMs: 700 },
  intermediate: { id: 'intermediate', label: 'Intermedio', skill: 6, depth: 6, movetimeMs: 300, minDelayMs: 600 },
  advanced: { id: 'advanced', label: 'Avanzado', skill: 13, depth: 11, movetimeMs: 900, minDelayMs: 400 },
  expert: { id: 'expert', label: 'Experto', skill: 20, depth: 18, movetimeMs: 1800, minDelayMs: 0 },
});

export const LEVEL_IDS = Object.keys(LEVELS);
export const isLevel = (id) => Object.prototype.hasOwnProperty.call(LEVELS, id);
