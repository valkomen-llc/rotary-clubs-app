// ════════════════════════════════════════════════════════════════════════════
// Rutas del módulo de traducción — v4.661
//
// Públicas   → /bulk, /settings, /log-domain   (las usa el sitio al navegar)
// Panel      → /admin/*                        (requiere rol administrativo)
//
// El endpoint público NO recibe ni acepta un proveedor: quién traduce lo decide
// la configuración del panel. Y nunca devuelve un error al visitante — si todo
// falla, devuelve el texto original y deja el fallo anotado para el panel.
// ════════════════════════════════════════════════════════════════════════════
import express from 'express';
import db from '../lib/db.js';
import { authMiddleware, requireSiteAdmin } from '../middleware/auth.js';
import {
    BASE_LANG, LOCALES, PROVIDERS, PROVIDER_KEYS, STATUSES,
    isSupportedLang, isTranslatable, availableProviders, localeOf,
} from '../lib/translationSpec.js';
import { translateBatch, batchSizeOf, probeProvider } from '../lib/translationProviders.js';
import store from '../lib/translationStore.js';

const router = express.Router();

console.log(
    '[translate] v4.661.0 — traducción integral del sitio público. '
    + `Idiomas: ${LOCALES.map(l => l.code).join(', ')}. `
    + `Proveedores con credencial: ${availableProviders().join(', ') || 'NINGUNO'}.`,
);

// ═══════════════════════════════════════════════════════════════════════════
// PÚBLICO
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /api/translate/bulk ───────────────────────────────────────────────
// El camino que recorre cada visita. Orden de resolución, y por qué:
//   1. Se descartan los textos que son DATOS (correos, cifras, códigos…):
//      ni se gastan créditos ni se corre el riesgo de "traducir" un teléfono.
//   2. Caché — incluye las traducciones manuales y aprobadas, que mandan
//      siempre sobre lo que diría el proveedor.
//   3. Proveedor configurado. Si falla, el siguiente de la cadena.
//   4. Si se acaba la cadena: el texto ORIGINAL, y queda anotado el error.
//      El visitante nunca ve una llave ni un hueco.
async function resolveBulk({ texts, targetLang, page }) {
    if (!Array.isArray(texts) || !texts.length) return { translations: [] };
    if (!targetLang || targetLang === BASE_LANG || !isSupportedLang(targetLang)) {
        return { translations: texts || [] };
    }

    // Tope por petición: un lote gigante es señal de un bucle, no de una página.
    const input = texts.slice(0, 400).map(t => String(t ?? ''));
    const out = new Array(input.length);

    // ── 1. Datos que no se traducen ────────────────────────────────────────
    const candidates = [];
    input.forEach((text, i) => {
        if (!isTranslatable(text)) out[i] = text;
        else candidates.push({ i, text, hash: store.hashOf(text) });
    });
    if (!candidates.length) return { translations: out };

    // ── 2. Caché ───────────────────────────────────────────────────────────
    let cached = new Map();
    try {
        cached = await store.getCached([...new Set(candidates.map(c => c.hash))], targetLang);
    } catch (e) {
        console.error('[translate] caché no disponible:', e.message);
    }

    const missing = [];
    for (const c of candidates) {
        const hit = cached.get(c.hash);
        if (hit) out[c.i] = hit.value;
        else missing.push(c);
    }
    if (!missing.length) return { translations: out, source: 'cache' };

    // Un mismo texto puede repetirse en la página (un botón en varias tarjetas):
    // se traduce UNA vez y se reparte a todas sus posiciones.
    const unique = new Map();
    for (const m of missing) {
        if (!unique.has(m.hash)) unique.set(m.hash, { text: m.text, hash: m.hash, at: [] });
        unique.get(m.hash).at.push(m.i);
    }
    const pending = [...unique.values()];

    // ── 3. Proveedores, en cadena ──────────────────────────────────────────
    const { chain } = await store.providerChain();

    if (!chain.length) {
        pending.forEach(p => p.at.forEach(i => { out[i] = p.text; }));
        await store.logEvent({
            targetLang, result: 'error', textCount: pending.length, page,
            error: 'Ningún proveedor de traducción tiene credenciales configuradas.',
        });
        return { translations: out, degraded: true, reason: 'sin-proveedor' };
    }

    let remaining = pending;
    let lastError = null;

    for (const provider of chain) {
        if (!remaining.length) break;
        const size = batchSizeOf(provider);
        const failed = [];

        for (let i = 0; i < remaining.length; i += size) {
            const slice = remaining.slice(i, i + size);
            try {
                const { translations, durationMs } = await translateBatch(
                    slice.map(s => s.text), targetLang, { provider },
                );

                slice.forEach((s, k) => {
                    const value = translations[k];
                    s.at.forEach(idx => { out[idx] = value; });
                    s.value = value;
                });

                store.putAuto(
                    slice.map(s => ({ hash: s.hash, source: s.text, value: s.value })),
                    targetLang, { provider },
                ).catch(e => console.error('[translate] no se pudo guardar:', e.message));

                store.logEvent({
                    targetLang, provider, result: 'ok', durationMs, page,
                    textCount: slice.length,
                    chars: slice.reduce((a, s) => a + s.text.length, 0),
                });
            } catch (e) {
                lastError = e.message;
                failed.push(...slice);
                store.logEvent({
                    targetLang, provider, result: 'error', error: e.message,
                    textCount: slice.length, page,
                });
                console.error(`[translate] ${provider} falló:`, e.message);
            }
        }
        remaining = failed;
    }

    // ── 4. Último recurso: el idioma base ──────────────────────────────────
    if (remaining.length) {
        remaining.forEach(p => p.at.forEach(i => { out[i] = p.text; }));
    }

    return {
        translations: out,
        ...(remaining.length ? { degraded: true, failed: remaining.length, reason: lastError } : {}),
    };
}

router.post('/bulk', async (req, res) => {
    try {
        res.json(await resolveBulk(req.body || {}));
    } catch (e) {
        // El visitante nunca se queda sin texto: se devuelve el original.
        console.error('[translate] bulk:', e.message);
        res.json({ translations: req.body?.texts || [], degraded: true, reason: e.message });
    }
});

// ── POST /api/translate ────────────────────────────────────────────────────
// Un solo texto. Mismo camino que el lote — una sola implementación.
router.post('/', async (req, res) => {
    const { text, targetLang } = req.body || {};
    if (!text || !targetLang || targetLang === BASE_LANG) {
        return res.json({ translated: text });
    }
    try {
        const r = await resolveBulk({ texts: [text], targetLang });
        res.json({
            translated: r.translations?.[0] ?? text,
            ...(r.degraded ? { degraded: true } : {}),
        });
    } catch (e) {
        res.json({ translated: text, degraded: true, error: e.message });
    }
});

// ── GET /api/translate/settings ────────────────────────────────────────────
// Lo que el navegador necesita saber al arrancar: idiomas, locales y si hay
// quién traduzca. Sin credenciales ni detalles internos.
router.get('/settings', async (_req, res) => {
    try {
        const { chain, configured } = await store.providerChain();
        res.json({
            configured: chain.length > 0,
            baseLang: BASE_LANG,
            languages: LOCALES.map(({ code, locale, name, flag }) => ({ code, locale, name, flag })),
            provider: chain[0] || null,
            preferred: configured,
        });
    } catch (e) {
        res.json({ configured: false, baseLang: BASE_LANG, languages: LOCALES, error: e.message });
    }
});

// ── POST /api/translate/log-domain ─────────────────────────────────────────
// Qué dominio y qué página pidieron traducción. Alimenta el panel de uso.
router.post('/log-domain', async (req, res) => {
    const { lang, domain, page, count } = req.body || {};
    if (!lang || !domain) return res.json({ ok: false });
    const key = `txlog::${lang}::${domain}`;
    try {
        const existing = await db.query(
            `SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL LIMIT 1`, [key],
        );
        let info = { count: 0, pages: [], lastSeen: null };
        if (existing.rows.length) { try { info = JSON.parse(existing.rows[0].value); } catch { /* ok */ } }
        info.count = (info.count || 0) + (count || 1);
        info.lastSeen = new Date().toISOString();
        if (page && !info.pages.includes(page)) {
            info.pages = [...(info.pages || []).slice(-19), page];
        }
        await db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, NULL, NOW())
             ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
            [key, JSON.stringify(info)],
        );
        res.json({ ok: true });
    } catch (err) { res.json({ ok: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PANEL — rol administrativo del sitio
// ═══════════════════════════════════════════════════════════════════════════
const admin = express.Router();
admin.use(authMiddleware, requireSiteAdmin);

const actorOf = req => req.user?.email || req.user?.name || req.user?.id || null;

// Estado general: idiomas, cobertura, proveedores, errores, uso, caché.
admin.get('/overview', async (_req, res) => {
    try {
        const s = await store.stats();
        res.json({
            ...s,
            languages: LOCALES.map(l => ({ ...l, locale: localeOf(l.code) })),
            providers: PROVIDER_KEYS.map(k => ({
                key: k, ...PROVIDERS[k],
                available: availableProviders().includes(k),
            })),
            statuses: STATUSES,
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Listado con filtros por idioma, estado y búsqueda de texto.
admin.get('/entries', async (req, res) => {
    try {
        const { lang, status, q, limit, offset } = req.query;
        res.json(await store.list({
            targetLang: lang || undefined,
            status: status || undefined,
            search: q || undefined,
            limit: Number(limit) || 50,
            offset: Number(offset) || 0,
        }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Corregir una traducción a mano. Con ?approve=true queda blindada: el
// proveedor ya no la vuelve a pisar.
admin.put('/entries/:hash/:lang', async (req, res) => {
    try {
        const { value, approve } = req.body || {};
        if (typeof value !== 'string' || !value.trim()) {
            return res.status(400).json({ error: 'Hace falta el texto de la traducción.' });
        }
        const row = await store.putManual(req.params.hash, req.params.lang, value.trim(), {
            actor: actorOf(req), approve: !!approve,
        });
        if (!row) return res.status(404).json({ error: 'No existe esa traducción.' });
        res.json(row);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Aprobar sin cambiar el texto.
admin.post('/entries/:hash/:lang/approve', async (req, res) => {
    try {
        const row = await store.approve(req.params.hash, req.params.lang, actorOf(req));
        if (!row) return res.status(404).json({ error: 'No existe esa traducción.' });
        res.json(row);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Descartar automáticas para que se regeneren. Nunca toca manuales ni aprobadas.
admin.post('/invalidate', async (req, res) => {
    try {
        const { lang, hash, olderThanDays } = req.body || {};
        const n = await store.invalidate({
            targetLang: lang || undefined,
            hash: hash || undefined,
            olderThanDays: olderThanDays ? Number(olderThanDays) : undefined,
        }, actorOf(req));
        res.json({ ok: true, removed: n });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Elegir proveedor y respaldo, sin desplegar.
admin.post('/provider', async (req, res) => {
    try {
        const { provider, fallback } = req.body || {};
        for (const p of [provider, fallback]) {
            if (p && !PROVIDER_KEYS.includes(p)) {
                return res.status(400).json({ error: `Proveedor desconocido: ${p}` });
            }
        }
        res.json(await store.setProvider(provider, fallback));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Prueba de conectividad. No escribe en la caché.
admin.post('/probe', async (req, res) => {
    try {
        const { provider, lang } = req.body || {};
        if (!PROVIDER_KEYS.includes(provider)) {
            return res.status(400).json({ error: 'Proveedor desconocido.' });
        }
        res.json(await probeProvider(provider, lang || 'en'));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Historial de llamadas y errores.
admin.get('/events', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const { rows } = await db.query(
            `SELECT id, "targetLang", provider, result, error, "textCount",
                    chars, "durationMs", actor, page, "createdAt"
               FROM "TranslationEvent"
              ${req.query.result ? 'WHERE result = $2' : ''}
              ORDER BY "createdAt" DESC LIMIT $1`,
            req.query.result ? [limit, req.query.result] : [limit],
        );
        res.json({ items: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.use('/admin', admin);

// ── Analítica GA4 (se mantiene aquí por compatibilidad) ────────────────────
router.get('/analytics', async (_req, res) => {
    try {
        const r = await db.query(
            `SELECT value FROM "Setting" WHERE key = 'analytics_ga4_id' AND "clubId" IS NULL LIMIT 1`,
        );
        res.json({ gaId: r.rows[0]?.value || '' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/analytics', async (req, res) => {
    const { gaId } = req.body || {};
    if (!gaId) return res.status(400).json({ error: 'gaId required' });
    try {
        await db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
             VALUES (gen_random_uuid(), 'analytics_ga4_id', $1, NULL, NOW())
             ON CONFLICT (key, "clubId") DO UPDATE SET value = $1, "updatedAt" = NOW()`,
            [gaId],
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/translate/usage ───────────────────────────────────────────────
// Compatibilidad con la pantalla de Integraciones, que ya la consume.
router.get('/usage', async (_req, res) => {
    try {
        const s = await store.stats();
        const logs = await db.query(
            `SELECT key, value FROM "Setting" WHERE key LIKE 'txlog::%' AND "clubId" IS NULL`,
        );
        const domainsByLang = {};
        for (const row of logs.rows) {
            const [, lang, domain] = row.key.split('::');
            if (!lang || !domain) continue;
            let info = { count: 0, pages: [], lastSeen: null };
            try { info = JSON.parse(row.value); } catch { /* ok */ }
            (domainsByLang[lang] ||= []).push({ domain, ...info });
        }
        res.json({
            totalCachedTranslations: s.totals.total,
            memCacheEntries: s.cache.entries,
            byLanguage: s.byLanguage.map(r => ({
                lang: r.lang, count: r.total, chars: r.chars,
                domains: domainsByLang[r.lang] || [],
            })),
            provider: s.provider,
            activity30d: s.activity30d,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
