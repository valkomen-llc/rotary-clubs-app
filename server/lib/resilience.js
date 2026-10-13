/**
 * resilience.js — topes de tiempo y caché con respaldo (v4.1180).
 *
 * El CRITERIO. Puro: sin base, sin red, sin reloj implícito (todo `now` es un
 * parámetro inyectable), para poder probarlo sin infraestructura.
 *
 * Por qué existe: el documento HTML de cada sitio y `/clubs/by-domain` se
 * resolvían esperando a la base SIN NINGÚN TOPE. Con la función compartida
 * (Fluid compute: la misma instancia atiende visitas y crons) y el pool de
 * conexiones ocupado, una visita podía esperar decenas de segundos y el
 * navegador quedaba con la pestaña en blanco y el indicador de carga girando.
 * La regla que esto hace cumplir: una dependencia lenta DEGRADA la página,
 * nunca la deja en blanco.
 */

export class DeadlineExceeded extends Error {
  constructor(label, ms) {
    super(`${label || 'operación'}: superó el tope de ${ms} ms`);
    this.name = 'DeadlineExceeded';
    this.code = 'DEADLINE_EXCEEDED';
    this.ms = ms;
  }
}

/**
 * Resuelve con la promesa o RECHAZA con `DeadlineExceeded` al vencer el tope.
 * La promesa original no se cancela (JS no puede), pero su rechazo tardío se
 * absorbe para no producir un «unhandledRejection».
 */
export function withDeadline(promise, ms, label = '') {
  const p = Promise.resolve(promise);
  if (!(ms > 0) || !Number.isFinite(ms)) return p;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceeded(label, ms)), ms);
    if (typeof timer?.unref === 'function') timer.unref();
  });
  p.catch(() => {});
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Caché en memoria con «stale-while-error»:
 *  - fresco (edad < ttlMs): se sirve sin consultar.
 *  - viejo pero dentro de staleMs: se recalcula; si el cálculo FALLA o VENCE,
 *    se sirve lo viejo (y se dice: `stale: true`).
 *  - sin dato: se calcula; si falla, el error sube.
 * Las peticiones simultáneas por la misma clave comparten un solo cálculo, así
 * que cien visitas a la vez no abren cien consultas a la base.
 */
export function createSwrCache({ ttlMs = 15000, staleMs = 600000, max = 500, now = () => Date.now() } = {}) {
  const store = new Map();     // key -> { value, at }
  const inflight = new Map();  // key -> Promise

  function prune() {
    if (store.size <= max) return;
    const sobran = store.size - max;
    let i = 0;
    for (const k of store.keys()) { if (i++ >= sobran) break; store.delete(k); }
  }

  function peek(key) {
    const hit = store.get(key);
    if (!hit) return null;
    const age = now() - hit.at;
    if (age > staleMs) { store.delete(key); return null; }
    return { value: hit.value, age, fresh: age <= ttlMs };
  }

  function set(key, value) {
    store.delete(key);
    store.set(key, { value, at: now() });
    prune();
  }

  /**
   * @param key
   * @param compute  () => Promise<value>
   * @param opts     { deadlineMs, bypass } — bypass ignora lo fresco (pero
   *                 sigue cayendo a lo viejo si el cálculo falla).
   * @returns { value, source: 'fresh'|'computed'|'stale', error? }
   */
  async function get(key, compute, { deadlineMs = 0, bypass = false } = {}) {
    const hit = peek(key);
    if (hit && hit.fresh && !bypass) return { value: hit.value, source: 'fresh' };

    let run = inflight.get(key);
    if (!run) {
      run = Promise.resolve().then(compute).then(v => { set(key, v); return v; });
      inflight.set(key, run);
      const limpiar = () => { if (inflight.get(key) === run) inflight.delete(key); };
      run.then(limpiar, limpiar);
    }
    try {
      const value = await withDeadline(run, deadlineMs, `cache:${key}`);
      return { value, source: 'computed' };
    } catch (error) {
      if (hit) return { value: hit.value, source: 'stale', error };
      throw error;
    }
  }

  return { get, peek, set, delete: k => store.delete(k), clear: () => store.clear(), size: () => store.size };
}

/** Una cabecera Server-Timing a partir de pares [nombre, ms, descripción?]. */
export function serverTiming(parts) {
  return (parts || [])
    .filter(p => p && p[0] && Number.isFinite(p[1]))
    .map(([name, ms, desc]) => {
      const n = String(name).replace(/[^A-Za-z0-9_-]/g, '_');
      const d = desc ? `;desc="${String(desc).replace(/["\\]/g, '')}"` : '';
      return `${n};dur=${Math.max(0, Math.round(ms))}${d}`;
    })
    .join(', ');
}
