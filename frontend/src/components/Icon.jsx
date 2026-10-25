/** Ícono Material Symbols por nombre (ligatura). Decorativo por defecto. */
export default function Icon({ name, className = '', label }) {
  return (
    <span
      className={`icon ${className}`}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  );
}
