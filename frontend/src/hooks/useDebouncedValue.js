import { useEffect, useState } from 'react';

/**
 * Devuelve `value` con un retraso de `ms` tras el último cambio (para no filtrar listas en cada tecla).
 * Un valor vacío pasa al instante: borrar la búsqueda no debe esperar.
 */
export function useDebouncedValue(value, ms = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (value === '') {
      setDebounced('');
      return undefined;
    }
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return value === '' ? '' : debounced;
}
