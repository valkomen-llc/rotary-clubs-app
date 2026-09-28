// Límite ligero anti-spam para endpoints públicos de Rotary en Acción.
// En memoria por instancia (serverless-friendly): corta ráfagas, no sustituye
// un WAF. Nunca bloquea la navegación, solo el exceso de envíos.
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_HITS = 40;

export function lightPublicLimit(req, res, next) {
  try {
    const ip = String(req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'x').slice(0, 80);
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    arr.push(now);
    hits.set(ip, arr);
    if (hits.size > 2000) for (const k of hits.keys()) { hits.delete(k); break; }
    if (arr.length > MAX_HITS) return res.status(429).json({ error: 'Demasiadas solicitudes. Esperá un minuto e intentá de nuevo.' });
    next();
  } catch { next(); }
}
