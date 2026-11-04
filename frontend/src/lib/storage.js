// localStorage "a prueba de fallos": en modo privado, con cookies bloqueadas o en
// previsualizaciones puede lanzar excepciones. Si falla, usa memoria (la sesión dura
// lo que dure la pestaña, pero la app sigue funcionando).
const memory = new Map();

export const safeStorage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      memory.delete(key);
    }
  },
};
