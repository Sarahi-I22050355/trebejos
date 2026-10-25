import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

/**
 * Diálogo accesible: Esc y clic fuera cierran; el foco entra al abrir y vuelve al cerrar.
 * Se dibuja en un portal sobre <body>: dentro de <main> (z-10) el pie de página lo taparía.
 */
export default function Modal({ open, onClose, title, icon, children, footer, size = 'md' }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const first = panelRef.current?.querySelector('[data-autofocus], input, button:not([data-close])');
    first?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-surface-container-lowest/80 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass-raised relative flex max-h-[92vh] w-full ${width} animate-fade-up flex-col overflow-hidden !rounded-b-none shadow-[0_0_60px_-10px_rgba(0,240,255,0.25)] sm:!rounded-b-xl`}
      >
        <div className="flex items-center justify-between gap-3 px-space-lg pb-space-sm pt-space-lg">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container text-primary-container">
                <Icon name={icon} className="!text-2xl" />
              </span>
            )}
            <h2 className="font-headline-lg text-headline-lg text-on-surface">{title}</h2>
          </div>
          <button
            type="button"
            data-close
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="overflow-y-auto px-space-lg pb-space-lg">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 px-space-lg pb-space-lg sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
