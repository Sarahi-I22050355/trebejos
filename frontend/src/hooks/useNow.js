import { useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext.jsx';

/** Hora actual que se refresca cada `intervalMs` (para relojes y cuentas regresivas). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Hora del SERVIDOR estimada: evita desfases si el reloj del dispositivo va mal. */
export function useServerNow(intervalMs = 1000) {
  const now = useNow(intervalMs);
  const { clockOffset } = useSession();
  return now + clockOffset;
}
