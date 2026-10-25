import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

const STYLES = {
  info: { icon: 'info', ring: 'text-primary-container' },
  success: { icon: 'check_circle', ring: 'text-primary-container' },
  error: { icon: 'error', ring: 'text-magenta' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (message, type = 'info', ms = 4200) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, message, type }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const style = STYLES[t.type] ?? STYLES.info;
          return (
            <div
              key={t.id}
              className="glass-raised pointer-events-auto flex max-w-sm animate-fade-up items-start gap-3 !rounded-lg px-4 py-3 shadow-2xl"
            >
              <Icon name={style.icon} className={`mt-0.5 ${style.ring}`} />
              <p className="flex-1 text-body-md text-on-surface">{t.message}</p>
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={() => dismiss(t.id)}
                className="text-outline transition-colors hover:text-on-surface"
              >
                <Icon name="close" className="!text-base" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
