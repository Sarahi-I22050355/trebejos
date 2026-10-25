/** Punto de estado con onda: un punto fijo y un anillo que se expande detrás. */
export default function PingDot({ className = 'bg-primary-container', size = 'h-2 w-2' }) {
  return (
    <span className={`relative inline-flex shrink-0 ${size}`} aria-hidden="true">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${className}`} />
      <span className={`relative inline-flex h-full w-full rounded-full ${className}`} />
    </span>
  );
}
