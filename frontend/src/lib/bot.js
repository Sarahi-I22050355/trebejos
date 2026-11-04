// Niveles del bot (los ids coinciden con backend/src/bot/levels.js). Los textos se traducen al dibujarlos: t(level.label).
import { msg } from '../i18n/core.js';

export const BOT_LEVELS = [
  { id: 'beginner', label: msg('Principiante'), hint: msg('Comete errores a propósito: ideal para empezar.') },
  { id: 'intermediate', label: msg('Intermedio'), hint: msg('Juega con cabeza, pero deja algunas jugadas al alcance.') },
  { id: 'advanced', label: msg('Avanzado'), hint: msg('Táctico y sólido: exige jugar bien.') },
  { id: 'expert', label: msg('Experto'), hint: msg('Stockfish a pleno rendimiento. ¡Suerte!') },
];

export const BOT_COLORS = [
  { value: 'w', label: msg('Blancas') },
  { value: 'b', label: msg('Negras') },
  { value: 'random', label: msg('Aleatorio') },
];

/** Etiqueta del nivel a partir de su id (el servidor manda el texto en español: aquí se traduce por id). */
export const botLevelLabel = (id) => BOT_LEVELS.find((l) => l.id === id)?.label ?? id;
