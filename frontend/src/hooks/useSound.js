import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMuted } from '../lib/sound.js';

/** `[muted, setMuted]` reactivo: el interruptor de la cabecera y quien lo necesite se mantienen sincronizados. */
export function useSoundMuted() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return [muted, setMuted];
}
