/**
 * siteHealthSpec.js — el CRITERIO del diagnóstico de un dominio (v4.1180).
 *
 * Puro: recibe las mediciones ya tomadas y decide qué capa falla. Lo usa
 * `scripts/site-health.mjs` para cualquier dominio de Club Platform.
 *
 * Por qué por CAPAS: «la página no carga» tiene al menos siete causas que se
 * corrigen en sitios distintos —el DNS (registrador), el certificado (Vercel),
 * la redirección (configuración del dominio), la función (plataforma), el
 * documento (render del <head>), los archivos del build (despliegue) y la API
 * o la base—. Un diagnóstico que sólo dice «falló» manda a buscar a ciegas.
 */

/** Las metas medibles. Se declaran acá para que el informe y la prueba usen las mismas. */
export const HEALTH_TARGETS = Object.freeze({
  documentP95Ms: 1500,   // primer byte del HTML, percentil 95
  documentMaxMs: 3500,   // ninguna visita por encima: el tope del servidor es 2,5 s
  siteConfigP95Ms: 2000, // /clubs/by-domain
  liveMaxMs: 1500,       // /api/health/live: sin base, sólo la función
  minSuccessRate: 1,     // de N intentos, todos tienen que entregar la aplicación
});

/** IPs y destino CNAME que Vercel publica para un dominio propio. */
export const VERCEL_APEX_IPS = ['216.150.1.1', '216.150.16.1', '76.76.21.21'];
export const VERCEL_CNAME_RE = /(^|\.)vercel-dns(-\d+)?\.com\.?$|(^|\.)cname\.vercel-dns\.com\.?$/i;

export function percentile(values, p) {
  const v = (values || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return v[idx];
}

/** Evalúa el DNS: qué hay y qué se recomienda. Nunca «falla» por una recomendación. */
export function judgeDns({ apexA = [], apexAAAA = [], wwwCname = [], wwwA = [] } = {}) {
  const findings = [];
  if (!apexA.length && !apexAAAA.length) {
    findings.push({ level: 'critical', layer: 'dns', code: 'no_records', message: 'El dominio no resuelve a ninguna IP.' });
    return findings;
  }
  const ajenas = apexA.filter(ip => !VERCEL_APEX_IPS.includes(ip));
  if (ajenas.length) {
    findings.push({ level: 'critical', layer: 'dns', code: 'foreign_a', message: `El dominio apunta a IPs que no son de Vercel: ${ajenas.join(', ')}.` });
  }
  if (apexA.length === 1) {
    findings.push({ level: 'warning', layer: 'dns', code: 'single_a', message: `Un solo registro A (${apexA[0]}). Vercel publica dos (216.150.1.1 y 216.150.16.1): con uno, una red que no alcanza esa IP no carga el sitio.` });
  }
  if (apexAAAA.length) {
    findings.push({ level: 'warning', layer: 'dns', code: 'aaaa_present', message: `Hay registros AAAA (${apexAAAA.join(', ')}). Vercel no sirve IPv6 en dominios propios: redes con IPv6 pueden intentar esa IP primero.` });
  }
  if (wwwCname.length && !wwwCname.some(c => VERCEL_CNAME_RE.test(c))) {
    findings.push({ level: 'info', layer: 'dns', code: 'www_cname_not_vercel', message: `www es CNAME a ${wwwCname.join(', ')}, no al CNAME que publica Vercel. Funciona si ese destino resuelve a Vercel, pero agrega un salto.` });
  }
  if (!wwwCname.length && !wwwA.length) {
    findings.push({ level: 'warning', layer: 'dns', code: 'no_www', message: 'www no resuelve: quien escriba www.<dominio> no llega.' });
  }
  return findings;
}

/**
 * Clasifica UN intento de carga del documento.
 * @param a { error?, errorCode?, status?, ttfbMs?, hasRoot?, scriptSrc?, assetStatus?, assetType?, docSource? }
 */
export function classifyAttempt(a = {}) {
  const code = String(a.errorCode || '');
  if (a.error) {
    if (/ENOTFOUND|EAI_AGAIN/.test(code)) return { ok: false, layer: 'dns', reason: `No se resolvió el nombre (${code}).` };
    if (/CERT|SSL|TLS|ERR_TLS|UNABLE_TO_VERIFY|SELF_SIGNED/.test(code)) return { ok: false, layer: 'tls', reason: `Certificado o TLS inválido (${code}).` };
    if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH/.test(code)) return { ok: false, layer: 'network', reason: `No se pudo conectar (${code}).` };
    if (/TIMEOUT|ABORT|UND_ERR_HEADERS_TIMEOUT/.test(code) || /timeout|abort/i.test(String(a.error))) {
      return { ok: false, layer: 'function', reason: 'El documento no llegó dentro del tope del monitor: la función no respondió.' };
    }
    return { ok: false, layer: 'network', reason: String(a.error) };
  }
  if (a.status >= 500) return { ok: false, layer: 'function', reason: `La función respondió ${a.status}.` };
  if (a.status === 404) return { ok: false, layer: 'document', reason: 'La portada respondió 404.' };
  if (!a.hasRoot) return { ok: false, layer: 'document', reason: 'El HTML llegó sin el contenedor de la aplicación (#root).' };
  if (!a.scriptSrc) return { ok: false, layer: 'document', reason: 'El HTML llegó sin el programa principal (<script type="module">).' };
  if (a.assetStatus !== 200) return { ok: false, layer: 'asset', reason: `El programa principal respondió ${a.assetStatus}: el documento nombra archivos que el despliegue no tiene.` };
  if (a.assetType && !/javascript/i.test(a.assetType)) return { ok: false, layer: 'asset', reason: `El programa principal llegó como ${a.assetType}, no como JavaScript.` };
  if (a.docSource === 'base') return { ok: true, layer: 'document', degraded: true, reason: 'Se sirvió el documento base: el <head> no se resolvió a tiempo (la base tardó).' };
  return { ok: true };
}

/** Resume N intentos más las sondas de API en un veredicto con hallazgos por capa. */
export function summarize({ attempts = [], live = [], siteConfig = [], deps = null, dns = [] } = {}, targets = HEALTH_TARGETS) {
  const findings = [...dns];
  const verdicts = attempts.map(classifyAttempt);
  const okCount = verdicts.filter(v => v.ok).length;
  const ttfb = attempts.map(a => a.ttfbMs).filter(Number.isFinite);
  const docP95 = percentile(ttfb, 95);
  const docMax = ttfb.length ? Math.max(...ttfb) : null;

  for (const v of verdicts) {
    if (!v.ok) findings.push({ level: 'critical', layer: v.layer, code: 'attempt_failed', message: v.reason });
    else if (v.degraded) findings.push({ level: 'warning', layer: v.layer, code: 'degraded', message: v.reason });
  }
  if (attempts.length && okCount / attempts.length < targets.minSuccessRate) {
    findings.push({ level: 'critical', layer: 'availability', code: 'success_rate', message: `${okCount} de ${attempts.length} cargas entregaron la aplicación.` });
  }
  if (docP95 !== null && docP95 > targets.documentP95Ms) {
    findings.push({ level: 'warning', layer: 'performance', code: 'doc_p95', message: `Primer byte del documento p95 = ${docP95} ms (meta ≤ ${targets.documentP95Ms} ms).` });
  }
  if (docMax !== null && docMax > targets.documentMaxMs) {
    findings.push({ level: 'critical', layer: 'performance', code: 'doc_max', message: `Una carga tardó ${docMax} ms en entregar el primer byte (meta ≤ ${targets.documentMaxMs} ms).` });
  }
  const liveMs = live.map(l => l.ms).filter(Number.isFinite);
  if (live.some(l => !l.ok)) findings.push({ level: 'critical', layer: 'function', code: 'live_failed', message: '/api/health/live falló: la función no responde en este dominio.' });
  else if (liveMs.length && Math.max(...liveMs) > targets.liveMaxMs) {
    findings.push({ level: 'warning', layer: 'function', code: 'live_slow', message: `/api/health/live tardó ${Math.max(...liveMs)} ms sin tocar la base: la función está saturada o arrancando en frío.` });
  }
  const scMs = siteConfig.map(s => s.ms).filter(Number.isFinite);
  const scP95 = percentile(scMs, 95);
  if (siteConfig.some(s => !s.ok)) findings.push({ level: 'critical', layer: 'api', code: 'site_config_failed', message: '/clubs/by-domain falló: la SPA no tiene configuración que pintar.' });
  if (siteConfig.some(s => s.source === 'stale')) findings.push({ level: 'warning', layer: 'db', code: 'site_config_stale', message: 'La configuración del sitio se sirvió desde la copia de respaldo: la base tardó o falló.' });
  if (scP95 !== null && scP95 > targets.siteConfigP95Ms) {
    findings.push({ level: 'warning', layer: 'api', code: 'site_config_p95', message: `/clubs/by-domain p95 = ${scP95} ms (meta ≤ ${targets.siteConfigP95Ms} ms).` });
  }
  if (deps && deps.status !== 'ok') {
    const malos = Object.entries(deps.checks || {}).filter(([, c]) => !c.ok).map(([k, c]) => `${k}: ${c.error}`);
    findings.push({ level: 'warning', layer: 'db', code: 'deps_degraded', message: `La base no respondió bien (${malos.join('; ') || deps.status}). La página se sirve degradada, no en blanco.` });
  }

  const status = findings.some(f => f.level === 'critical') ? 'critical'
    : findings.some(f => f.level === 'warning') ? 'warning' : 'ok';
  return {
    status,
    metrics: { attempts: attempts.length, okCount, docP95Ms: docP95, docMaxMs: docMax, siteConfigP95Ms: scP95 },
    findings,
  };
}
