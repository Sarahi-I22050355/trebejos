import Icon from '../Icon.jsx';

function Command({ icon, tone, children, ...props }) {
  return (
    <button
      type="button"
      className="flex items-center justify-center gap-2 rounded-xl bg-surface-container-high px-3 py-2.5 font-headline-sm text-label-badge uppercase tracking-wider text-on-surface transition-all hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-container-high"
      {...props}
    >
      <Icon name={icon} className={`!text-base ${tone}`} />
      {children}
    </button>
  );
}

/** Oferta de tablas entrante: se muestra bien visible sobre el tablero. */
export function DrawOffer({ name, onAccept, onDecline }) {
  return (
    <div className="glass-raised flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 shadow-glow-violet" role="alert" data-testid="draw-offer">
      <Icon name="handshake" className="text-secondary" />
      <span className="flex-1 text-body-md text-on-surface">
        <strong className="font-semibold">{name}</strong> te ofrece tablas.
      </span>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={onAccept}>Aceptar</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDecline}>Rechazar</button>
      </div>
    </div>
  );
}

/** Panel de comandos: cambia según seas jugador, espectador o la partida haya terminado. */
export default function Commands({ isPlayer, playing, drawOfferedByMe, onDraw, onResign, onFlip, onLeave }) {
  return (
    <section className="glass flex flex-col gap-2 p-space-md" aria-label="Comandos de partida">
      <div className="pb-1 font-mono-move text-[11px] uppercase tracking-widest text-outline">Comandos de partida</div>
      <div className="grid grid-cols-2 gap-2">
        {isPlayer && playing && (
          <>
            <Command icon="handshake" tone="text-primary" onClick={onDraw} disabled={drawOfferedByMe} data-testid="btn-draw">
              {drawOfferedByMe ? 'Tablas ofrecidas' : 'Ofrecer tablas'}
            </Command>
            <Command icon="flag" tone="text-error" onClick={onResign} data-testid="btn-resign">Rendirse</Command>
          </>
        )}
        <Command icon="flip_camera_android" tone="text-secondary" onClick={onFlip} data-testid="btn-flip">Voltear tablero</Command>
        {(!isPlayer || !playing) && (
          <Command icon="logout" tone="text-outline" onClick={onLeave} data-testid="btn-leave">Salir</Command>
        )}
      </div>
    </section>
  );
}
