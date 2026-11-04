import { useEffect, useRef } from 'react';
import { play, playLater, soundForResult, soundForSan } from '../lib/sound.js';

const RESULT_DELAY_MS = 450; // deja sonar la última jugada antes del sonido de victoria/derrota

/**
 * Sonidos de una sala a partir de los cambios del estado que manda el servidor: jugadas del rival (o del
 * bot), inicio y final de la partida, mensajes de chat y ofertas de tablas. Las jugadas propias suenan al
 * instante desde `GameView` (antes de que el servidor confirme), así que aquí se omiten.
 * Lo que ya estaba en el estado al abrir la sala (historial, mensajes viejos) no suena.
 */
export function useRoomSounds(room) {
  const before = useRef(null);

  useEffect(() => {
    const prev = before.current;
    if (!room) {
      before.current = null;
      return undefined;
    }
    const now = { code: room.code, status: room.status, ply: room.ply, chat: room.chat?.length ?? 0, drawOffer: room.drawOffer };
    before.current = now;

    const timers = [];
    const mine = room.you?.color ?? null;

    if (!prev || prev.code !== room.code) {
      // Primera vez que se ve esta sala: solo suena si la partida acaba de empezar (p. ej. al entrar de segundo).
      if (room.status === 'playing' && room.ply === 0) play('start');
      return undefined;
    }

    if (prev.status !== 'playing' && room.status === 'playing') play('start');

    const last = room.moves.at(-1);
    if (room.ply === prev.ply + 1 && last && last.color !== mine) play(soundForSan(last.san));

    if (prev.status === 'playing' && room.status === 'finished') {
      timers.push(playLater(soundForResult(room.result, mine), RESULT_DELAY_MS));
    }

    if (now.chat === prev.chat + 1) {
      const message = room.chat.at(-1);
      if (message && message.role !== room.you?.role) play('chat');
    }

    if (room.drawOffer && !prev.drawOffer && room.drawOffer !== mine && room.status === 'playing') play('notify');

    return () => timers.forEach(clearTimeout);
  }, [room]);
}
