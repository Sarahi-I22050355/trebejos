// Esqueletos de carga: marcan el sitio y la forma del contenido que llega, para que la pantalla no salte ni parezca vacía.
// Son decorativos (aria-hidden); el texto de estado para lectores de pantalla va en `SkeletonStatus`.

/** Bloque gris que parpadea. Con `prefers-reduced-motion` el parpadeo se apaga solo (ver index.css). */
export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-surface-container-high/70 ${className}`} />;
}

/** Aviso de carga para lectores de pantalla (y para quien busque el texto): no se ve, pero está en la página. */
export function SkeletonStatus({ children }) {
  return (
    <p role="status" className="sr-only">
      {children}
    </p>
  );
}

/** Tarjeta de sala del listado mientras llega la lista (misma estructura y medidas que RoomCard). */
export function RoomCardSkeleton() {
  return (
    <div aria-hidden="true" className="glass flex flex-col overflow-hidden" data-testid="room-skeleton">
      <div className="flex h-48 items-center justify-center bg-surface-container-lowest">
        <Skeleton className="aspect-square h-[10.5rem] !rounded-md" />
      </div>
      <div className="flex flex-col gap-space-md p-space-md">
        <div className="flex flex-col gap-space-sm">
          <Skeleton className="h-[3.1rem]" />
          <Skeleton className="h-[3.1rem]" />
        </div>
        <Skeleton className="h-12 !rounded-xl" />
      </div>
    </div>
  );
}

/** Pantalla de partida mientras se entra a la sala: tablero cuadrado y panel lateral. */
export function GameSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto flex w-full max-w-[1500px] flex-col gap-space-sm px-3 py-space-md md:px-margin" data-testid="game-skeleton">
      <Skeleton className="h-12 !rounded-xl" />
      <div className="grid grid-cols-1 items-start gap-space-md xl:grid-cols-12">
        <div className="flex justify-center xl:col-span-8">
          <div className="flex w-full flex-col gap-2" style={{ maxWidth: 'min(100%, 680px, max(320px, calc(100dvh - 15rem)))' }}>
            <Skeleton className="h-14 !rounded-xl" />
            <Skeleton className="aspect-square w-full !rounded-xl" />
            <Skeleton className="h-14 !rounded-xl" />
          </div>
        </div>
        <div className="flex flex-col gap-space-sm xl:col-span-4">
          <Skeleton className="h-[22rem] !rounded-xl" />
          <Skeleton className="h-28 !rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** Página genérica mientras se descarga el código de una pantalla (carga diferida de rutas). */
export function PageSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg px-4 py-space-lg md:px-margin" data-testid="page-skeleton">
      <Skeleton className="h-28 !rounded-xl" />
      <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 !rounded-xl" />
        ))}
      </div>
    </div>
  );
}
