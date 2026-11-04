// Avatar generado a partir del nombre (sin imágenes): inicial sobre un degradado de la paleta.
const GRADIENTS = [
  ['#00F0FF', '#A855F7'],
  ['#A855F7', '#EC4899'],
  ['#00F0FF', '#6F00BE'],
  ['#EC4899', '#00F0FF'],
];

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

export default function Avatar({ name = '?', size = 32, className = '', ring = false }) {
  const [from, to] = GRADIENTS[hash(name) % GRADIENTS.length];
  const initial = ([...name.trim()][0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-lg font-headline-sm font-bold text-surface-container-lowest ${
        ring ? 'ring-2 ring-primary-container/40' : ''
      } ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.46,
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      {initial}
    </span>
  );
}
