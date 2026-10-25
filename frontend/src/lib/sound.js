// Efectos de sonido sintetizados con Web Audio: no hay archivos que descargar ni licencias que cumplir.
// Todo es opcional: si el navegador no tiene Web Audio, o el sonido está silenciado, no pasa nada.
import { safeStorage } from './storage.js';

const KEY = 'trebejos.sound';
const MASTER_VOLUME = 0.55;
const MIN_GAP_MS = 35; // evita que dos eventos casi simultáneos suenen como uno solo, distorsionado

let muted = safeStorage.get(KEY) === 'off';
const listeners = new Set();
let ctx = null;
let master = null;
let noise = null;
let lastPlayed = { name: '', at: 0 };

export const isMuted = () => muted;
export const subscribeMuted = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export function setMuted(value) {
  muted = !!value;
  safeStorage.set(KEY, muted ? 'off' : 'on');
  listeners.forEach((fn) => fn());
  if (!muted) play('toggle');
}

/** Sonido que corresponde a una jugada, según su notación SAN. Pura: se prueba sin audio. */
export function soundForSan(san = '') {
  if (san.includes('=')) return 'promote';
  if (san.startsWith('O-O')) return san.includes('+') ? 'check' : 'castle';
  if (san.includes('+')) return 'check';
  if (san.includes('x')) return 'capture';
  return 'move'; // incluye el mate: el sonido del resultado llega justo después
}

/** Sonido del final de la partida desde el punto de vista de quien mira. `myColor` es null para espectadores. */
export function soundForResult(result, myColor) {
  if (!result || result.winner == null) return 'draw';
  if (!myColor) return 'end';
  return result.winner === myColor ? 'win' : 'lose';
}

// ------------------------------------------------------------------ síntesis

function context() {
  if (ctx) return ctx;
  const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AudioCtx) return null;
  try {
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Los navegadores solo dejan sonar tras un gesto del usuario: el primero "desbloquea" el audio. */
export function unlockAudio() {
  const c = context();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlockAudio();
    for (const type of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(type, unlock, true);
  };
  for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, true);
}

function noiseBuffer(c) {
  if (noise) return noise;
  noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** Nota con envolvente rápida. `to` desliza la frecuencia hasta ese valor. */
function tone(c, at, { freq, to, type = 'sine', dur = 0.12, gain = 0.3 }) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(amp).connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Golpe seco (ruido filtrado + un "toc" grave): la pieza al apoyarse en el tablero. */
function knock(c, at, { freq = 900, body = 170, dur = 0.07, gain = 0.5 } = {}) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  const amp = c.createGain();
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(amp).connect(master);
  src.start(at);
  src.stop(at + dur + 0.02);
  tone(c, at, { freq: body, to: body * 0.6, dur: dur * 1.4, gain: gain * 0.7 });
}

const arpeggio = (c, at, freqs, { step = 0.1, type = 'triangle', dur = 0.22, gain = 0.26 } = {}) =>
  freqs.forEach((freq, i) => tone(c, at + i * step, { freq, type, dur, gain }));

const SOUNDS = {
  move: (c, t) => knock(c, t),
  capture: (c, t) => {
    knock(c, t, { freq: 650, body: 130, dur: 0.1, gain: 0.7 });
    knock(c, t + 0.045, { freq: 1100, body: 190, dur: 0.06, gain: 0.35 });
  },
  castle: (c, t) => {
    knock(c, t);
    knock(c, t + 0.11, { freq: 800, body: 150 });
  },
  check: (c, t) => {
    knock(c, t, { gain: 0.45 });
    tone(c, t + 0.06, { freq: 660, to: 880, type: 'triangle', dur: 0.16, gain: 0.28 });
    tone(c, t + 0.2, { freq: 880, type: 'triangle', dur: 0.2, gain: 0.24 });
  },
  promote: (c, t) => {
    knock(c, t);
    arpeggio(c, t + 0.07, [523, 659, 784, 1047], { step: 0.065, dur: 0.18 });
  },
  start: (c, t) => arpeggio(c, t, [392, 587], { step: 0.12, type: 'sine', dur: 0.28, gain: 0.3 }),
  win: (c, t) => arpeggio(c, t, [523, 659, 784, 1047], { step: 0.11, dur: 0.38 }),
  lose: (c, t) => arpeggio(c, t, [392, 330, 262, 196], { step: 0.16, type: 'sine', dur: 0.42, gain: 0.3 }),
  draw: (c, t) => arpeggio(c, t, [440, 440], { step: 0.16, type: 'sine', dur: 0.34, gain: 0.28 }),
  end: (c, t) => arpeggio(c, t, [523, 392], { step: 0.14, type: 'sine', dur: 0.34, gain: 0.26 }),
  warn: (c, t) => tone(c, t, { freq: 880, type: 'square', dur: 0.09, gain: 0.12 }),
  tick: (c, t) => tone(c, t, { freq: 1200, type: 'square', dur: 0.04, gain: 0.09 }),
  chat: (c, t) => {
    tone(c, t, { freq: 740, dur: 0.08, gain: 0.2 });
    tone(c, t + 0.07, { freq: 988, dur: 0.1, gain: 0.18 });
  },
  notify: (c, t) => arpeggio(c, t, [660, 880], { step: 0.09, type: 'sine', dur: 0.16, gain: 0.24 }),
  success: (c, t) => arpeggio(c, t, [659, 988], { step: 0.09, dur: 0.3, gain: 0.26 }),
  error: (c, t) => tone(c, t, { freq: 190, to: 120, type: 'sawtooth', dur: 0.16, gain: 0.16 }),
  toggle: (c, t) => tone(c, t, { freq: 700, dur: 0.07, gain: 0.2 }),
};

export const SOUND_NAMES = Object.keys(SOUNDS);

/**
 * Reproduce un efecto (si el sonido está activado). Avisa con un evento `trebejos:sound` en `window`,
 * que sirve para accesibilidad futura y para que las pruebas comprueben qué sonó sin tocar el audio.
 */
export function play(name) {
  const build = SOUNDS[name];
  if (!build || muted) return;
  const now = Date.now();
  if (lastPlayed.name === name && now - lastPlayed.at < MIN_GAP_MS) return;
  lastPlayed = { name, at: now };
  window.dispatchEvent(new CustomEvent('trebejos:sound', { detail: name }));
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') {
    c.resume().catch(() => {});
    return; // sin gesto previo del usuario el navegador no deja sonar; no se acumulan sonidos atrasados
  }
  try {
    build(c, c.currentTime + 0.005);
  } catch {
    /* el audio nunca debe romper la partida */
  }
}

/** Igual que `play`, pasados `ms` (para que el sonido del resultado no pise el de la última jugada). */
export function playLater(name, ms) {
  return setTimeout(() => play(name), ms);
}
