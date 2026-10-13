/**
 * siteBoot.ts — cómo arranca la SPA sin quedarse cargando para siempre (v4.1180).
 *
 * La SPA no pinta NADA hasta tener la configuración del sitio
 * (`/clubs/by-domain`). Hasta v4.1179 esa petición no tenía tope: si el
 * servidor tardaba, la pantalla se quedaba en «Cargando plataforma...»
 * indefinidamente, y la única salida era recargar o cambiar de red — que es
 * exactamente lo que se reportó desde rotary4281.org.
 *
 * Tres piezas, y las tres hacen falta:
 *  1. TOPE por intento (`fetchWithTimeout`) y reintentos ACOTADOS
 *     (`BOOT_RETRY_DELAYS_MS`): un tropiezo de red se resuelve solo; una caída
 *     real termina en una pantalla con su motivo y un botón, nunca en un giro
 *     sin fin.
 *  2. La ÚLTIMA configuración buena del dominio en `localStorage`
 *     (`readLastGoodSite` / `writeLastGoodSite`): con ella el sitio se pinta al
 *     instante y se actualiza en segundo plano. Una visita repetida ya no
 *     depende de que el servidor conteste a tiempo.
 *  3. Todo acceso a `localStorage` va envuelto: en modo privado o con el
 *     almacenamiento lleno lanza, y eso no puede costar el arranque.
 */

/** Tope por intento. El servidor corta a los 7 s; esto deja margen de red. */
export const BOOT_TIMEOUT_MS = 10_000;
/** Espera antes de cada intento. Tres intentos y se acabó: no hay bucle. */
export const BOOT_RETRY_DELAYS_MS = [0, 1500, 4000] as const;
/** Pasado esto la copia guardada se descarta: demasiado vieja para pintarla. */
export const LAST_GOOD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A partir de cuándo la pantalla de carga dice que está tardando. */
export const SLOW_NOTICE_MS = 5000;

const STORAGE_PREFIX = 'site_config_v1:';

export class BootTimeout extends Error {
  constructor(ms: number) {
    super(`La configuración del sitio no respondió en ${Math.round(ms / 1000)} s`);
    this.name = 'BootTimeout';
  }
}

/** `fetch` con tope: aborta la petición, no sólo deja de esperarla. */
export async function fetchWithTimeout(url: string, ms = BOOT_TIMEOUT_MS, init: RequestInit = {}): Promise<Response> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl?.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new BootTimeout(ms);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Qué hacer con una respuesta. `retry` = vale la pena otro intento (red, tope,
 * 5xx: algo pasajero). `fallback` = el servidor contestó y no hay sitio (4xx):
 * reintentar no cambia nada.
 */
export type BootOutcome = 'ok' | 'retry' | 'fallback';
export function classifyBootResponse(status: number | null): BootOutcome {
  if (status === null) return 'retry';                 // red o tope
  if (status >= 200 && status < 300) return 'ok';
  if (status === 408 || status === 429 || status >= 500) return 'retry';
  return 'fallback';
}

export function storageKey(query: string): string {
  return STORAGE_PREFIX + String(query || '').trim().toLowerCase().replace(/^www\./, '');
}

/** La última configuración buena, o null si no hay / es vieja / es ilegible. */
export function readLastGoodSite<T = unknown>(query: string, now = Date.now()): T | null {
  try {
    const raw = window.localStorage.getItem(storageKey(query));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.data || !Number.isFinite(parsed.at)) return null;
    if (now - parsed.at > LAST_GOOD_MAX_AGE_MS) return null;
    return parsed.data as T;
  } catch {
    return null;
  }
}

export function writeLastGoodSite(query: string, data: unknown, now = Date.now()): void {
  try {
    window.localStorage.setItem(storageKey(query), JSON.stringify({ at: now, data }));
  } catch {
    // Modo privado o almacenamiento lleno: el sitio funciona igual, sólo sin
    // el arranque instantáneo de la próxima visita.
  }
}

/** Dos configuraciones son la misma si serializan igual (evita repintar de más). */
export function sameSite(a: unknown, b: unknown): boolean {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
