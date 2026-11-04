import { useSyncExternalStore } from 'react';
import { getLang, setLang, subscribeLang, t, tp } from './core.js';

/**
 * Idioma actual y funciones de traducción. Llamarlo en un componente lo vuelve a dibujar cuando cambia el idioma:
 * hay que usarlo en todo componente que muestre texto (directamente o a través de funciones de `lib/`).
 */
export function useI18n() {
  const lang = useSyncExternalStore(subscribeLang, getLang, () => 'es');
  return { lang, setLang, t, tp };
}
