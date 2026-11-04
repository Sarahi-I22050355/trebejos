/** Ventana deslizante simple: como mucho `max` eventos por `windowMs` para cada clave. */
export class RateLimiter {
  constructor({ max, windowMs }, now = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.hits = new Map();
  }

  allow(key) {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((ts) => t - ts < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }

  forget(key) {
    this.hits.delete(key);
  }
}
