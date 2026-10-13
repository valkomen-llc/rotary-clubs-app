/**
 * documentBudget.js — el presupuesto de tiempo del documento HTML (v4.1180).
 *
 * El CRITERIO. Puro. Los números viven acá, en UN sitio, porque los consumen
 * el catch-all de `api/index.js`, `/clubs/by-domain` y la prueba que los fija.
 * Con los topes escritos sueltos en cada camino, el día que se ajuste uno los
 * otros se quedan atrás y la página vuelve a poder quedarse en blanco.
 *
 * La regla de fondo: el primer byte del documento no puede depender de que la
 * base conteste rápido. Una visita espera, como mucho, `renderMs` antes de
 * recibir la aplicación; lo que no llegue a tiempo se DEGRADA (sin etiquetas
 * de SEO resueltas en esa visita), nunca se espera.
 */

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const DOCUMENT_BUDGET = Object.freeze({
  // Las redirecciones de enlaces van ANTES del documento: con la base lenta,
  // se sigue sin redirección.
  redirectsMs: num(process.env.DOC_REDIRECTS_BUDGET_MS, 1500),
  // El <head> resuelto contra la base. Pasado esto se sirve el documento base.
  renderMs: num(process.env.DOC_RENDER_BUDGET_MS, 2500),
  // Caché del documento resuelto, por dominio y ruta. Corta para que un cambio
  // de SEO se note pronto; larga la ventana de respaldo, que sólo se usa si la
  // base falla o tarda.
  cacheTtlMs: num(process.env.DOC_CACHE_TTL_MS, 60_000),
  cacheStaleMs: num(process.env.DOC_CACHE_STALE_MS, 30 * 60_000),
  cacheMax: 1000,
});

export const SITE_CONFIG_BUDGET = Object.freeze({
  // `/clubs/by-domain`: la configuración del sitio que pinta la SPA. Más
  // holgado que el documento porque sin ella no hay sitio que pintar, pero
  // acotado: el navegador corta a los 10 s y reintenta.
  computeMs: num(process.env.SITE_CONFIG_BUDGET_MS, 7000),
  cacheTtlMs: num(process.env.SITE_CONFIG_CACHE_TTL_MS, 20_000),
  cacheStaleMs: num(process.env.SITE_CONFIG_CACHE_STALE_MS, 6 * 60 * 60_000),
  cacheMax: 500,
});

/**
 * La clave de la caché del documento. Sin la query a propósito: el <head> no
 * depende de ella, y con ella cada `?utm_source=` o `?t=` abriría una entrada.
 * `www.` y mayúsculas se pliegan: son el mismo sitio.
 */
export function documentCacheKey(host, path) {
  const h = String(host || '').trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  let p = String(path || '/').split('?')[0].split('#')[0] || '/';
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return `${h}${p.startsWith('/') ? '' : '/'}${p}`;
}

/** La clave de la configuración del sitio: el dominio pedido, canónico. */
export function siteConfigCacheKey(domain, preview) {
  const d = String(domain || '').trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '')
    .replace(/\.$/, '').replace(/^www\./, '');
  return `${preview ? 'p:' : ''}${d}`;
}

/**
 * Las cabeceras del documento. En un solo sitio para que el camino resuelto y
 * el de respaldo no puedan discrepar: hasta v4.1179 el respaldo servía el
 * archivo con `sendFile`, SIN `no-store`, así que justo cuando algo fallaba el
 * navegador podía guardar un documento que nombra hashes de un build viejo.
 *
 * - `no-store, must-revalidate`: el documento nombra los archivos del build
 *   por su hash, que cambia en cada despliegue (v4.789).
 * - `Vary: Host`: el <head> depende del dominio; sin esto una caché compartida
 *   le serviría a un sitio el de otro.
 */
export function baseDocumentHeaders() {
  return {
    'Cache-Control': 'no-store, must-revalidate',
    'Content-Type': 'text/html; charset=utf-8',
    Vary: 'Host',
  };
}
