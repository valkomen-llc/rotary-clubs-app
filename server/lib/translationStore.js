// ════════════════════════════════════════════════════════════════════════════
// Acceso a datos del módulo de traducción — v4.661
//
// Todo lo que lee o escribe en "Translation" y "TranslationEvent" pasa por aquí:
// la caché, la invalidación, la protección del trabajo manual, la auditoría y
// las métricas del panel.
// ════════════════════════════════════════════════════════════════════════════
import { createHash, randomUUID } from 'node:crypto';
import db from './db.js';
import { ensureTranslationSchema } from './ensureTranslationSchema.js';
import {
    BASE_LANG, DEFAULT_PROVIDER, PROVIDER_KEYS,
    SETTLED_STATUSES, providerAvailable,
} from './translationSpec.js';

// ── Identidad de un texto ──────────────────────────────────────────────────
// SHA-256 del texto ORIGINAL COMPLETO, normalizado sólo en espacios de borde y
// forma Unicode. Completo a propósito: la clave truncada a 120 caracteres de
// v4.660 hacía colisionar textos con el mismo comienzo.
//
// Que la clave SEA el contenido es lo que da la invalidación: si el original
// cambia, cambia el hash, no hay fila y se retraduce. No hace falta un proceso
// que vaya invalidando nada.
// v4.662 — la clave es SÓLO el texto. Antes llevaba delante el idioma de
// origen, pero ese idioma se ASUMÍA ('es') en vez de conocerse, así que un
// contenido escrito en inglés se archivaba como si fuera español. Ahora el
// origen lo detecta el proveedor y no forma parte de la identidad de un texto:
// lo que identifica una fila es QUÉ dice y A QUÉ idioma se tradujo.
export function hashOf(text) {
    const norm = String(text).normalize('NFC').trim().replace(/\s+/g, ' ');
    return createHash('sha256').update(norm).digest('hex');
}

// ── Caché en memoria (L1) ──────────────────────────────────────────────────
// Vive lo que viva la instancia serverless. Evita el viaje a la base en las
// peticiones seguidas de una misma visita. Con tope, para no crecer sin freno.
const MEM_MAX = 5000;
const mem = new Map(); // `${lang}:${hash}` -> value

function memGet(lang, hash) { return mem.get(`${lang}:${hash}`); }
function memSet(lang, hash, value) {
    if (mem.size >= MEM_MAX) {
        // Descarta el más viejo: en un Map, el primero insertado.
        mem.delete(mem.keys().next().value);
    }
    mem.set(`${lang}:${hash}`, value);
}
export function memStats() { return { entries: mem.size, max: MEM_MAX }; }
export function memClear() { mem.clear(); }

// ── Lectura ────────────────────────────────────────────────────────────────

/**
 * Busca en caché las traducciones de varios textos a la vez.
 * Devuelve un Map hash -> { value, status, provider }.
 * De paso marca el uso (lastUsedAt / useCount), que es lo que permite purgar
 * después lo que ya nadie pide sin tocar lo que está vivo.
 */
export async function getCached(hashes, targetLang) {
    const found = new Map();
    if (!hashes.length) return found;

    const pending = [];
    for (const h of hashes) {
        const hit = memGet(targetLang, h);
        if (hit !== undefined) found.set(h, hit);
        else pending.push(h);
    }
    if (!pending.length) return found;

    await ensureTranslationSchema();
    const { rows } = await db.query(
        `SELECT "sourceHash", value, status, provider
           FROM "Translation"
          WHERE "targetLang" = $1 AND "sourceHash" = ANY($2)`,
        [targetLang, pending],
    );
    for (const r of rows) {
        const entry = { value: r.value, status: r.status, provider: r.provider };
        memSet(targetLang, r.sourceHash, entry);
        found.set(r.sourceHash, entry);
    }

    // El marcado de uso no debe frenar la respuesta.
    if (rows.length) {
        db.query(
            `UPDATE "Translation"
                SET "lastUsedAt" = NOW(), "useCount" = "useCount" + 1
              WHERE "targetLang" = $1 AND "sourceHash" = ANY($2)`,
            [targetLang, rows.map(r => r.sourceHash)],
        ).catch(() => { });
    }
    return found;
}

// ── Escritura ──────────────────────────────────────────────────────────────

/**
 * Guarda traducciones automáticas.
 *
 * REGLA CENTRAL: no pisa lo que alguien corrigió a mano. El `WHERE` del
 * ON CONFLICT excluye 'manual' y 'approved', así que una traducción revisada
 * sobrevive a cualquier repaso del proveedor — que es justamente lo que hace
 * útil el botón "aprobar" del panel.
 */
export async function putAuto(entries, targetLang, { provider, sourceLang = BASE_LANG, kind = 'managed' } = {}) {
    if (!entries.length) return 0;
    await ensureTranslationSchema();

    const ids = [], hashes = [], sources = [], values = [];
    for (const e of entries) {
        ids.push(randomUUID());
        hashes.push(e.hash);
        sources.push(e.source);
        values.push(e.value);
    }

    // Un solo viaje a la base para todo el lote: UNNEST convierte los cuatro
    // arrays en filas.
    const res = await db.query(
        `INSERT INTO "Translation"
             (id, "sourceHash", "sourceText", "sourceLang", "targetLang",
              value, status, kind, provider, "lastUsedAt", "useCount")
         SELECT u.id, u.hash, u.src, $4, $5, u.val, 'auto', $7, $6, NOW(), 1
           FROM UNNEST($1::text[], $2::text[], $3::text[], $8::text[])
                AS u(id, hash, src, val)
         ON CONFLICT ("sourceHash", "targetLang") DO UPDATE
            SET value       = EXCLUDED.value,
                provider    = EXCLUDED.provider,
                status      = 'auto',
                version     = "Translation".version + 1,
                "updatedAt" = NOW()
          WHERE "Translation".status <> ALL($9::text[])`,
        [ids, hashes, sources, sourceLang, targetLang, provider, kind, values, SETTLED_STATUSES],
    );

    // La memoria se actualiza sólo con lo que de verdad quedó guardado; si la
    // fila estaba aprobada, se descarta la de memoria para releer la buena.
    for (const e of entries) mem.delete(`${targetLang}:${e.hash}`);
    return res.rowCount || 0;
}

/** Edición manual desde el panel. Sube `version` y deja rastro. */
export async function putManual(hash, targetLang, value, { actor, approve = false } = {}) {
    await ensureTranslationSchema();
    const status = approve ? 'approved' : 'manual';
    const { rows } = await db.query(
        `UPDATE "Translation"
            SET value        = $3,
                status       = $4,
                version      = version + 1,
                "approvedBy" = CASE WHEN $4 = 'approved' THEN $5 ELSE "approvedBy" END,
                "approvedAt" = CASE WHEN $4 = 'approved' THEN NOW() ELSE "approvedAt" END,
                "updatedAt"  = NOW()
          WHERE "sourceHash" = $1 AND "targetLang" = $2
      RETURNING id, version, status, "sourceText"`,
        [hash, targetLang, value, status, actor || null],
    );
    mem.delete(`${targetLang}:${hash}`);
    if (rows[0]) {
        await logEvent({
            targetLang, provider: null, result: approve ? 'approve' : 'edit',
            actor, sourceHash: hash, chars: value.length, textCount: 1,
        });
    }
    return rows[0] || null;
}

/** Marca como aprobada una traducción existente sin cambiar su texto. */
export async function approve(hash, targetLang, actor) {
    await ensureTranslationSchema();
    const { rows } = await db.query(
        `UPDATE "Translation"
            SET status = 'approved', "approvedBy" = $3, "approvedAt" = NOW(), "updatedAt" = NOW()
          WHERE "sourceHash" = $1 AND "targetLang" = $2
      RETURNING id, status, value`,
        [hash, targetLang, actor || null],
    );
    mem.delete(`${targetLang}:${hash}`);
    if (rows[0]) {
        await logEvent({ targetLang, result: 'approve', actor, sourceHash: hash, textCount: 1 });
    }
    return rows[0] || null;
}

/**
 * Descarta traducciones automáticas para que se regeneren.
 * Nunca toca las manuales ni las aprobadas: ese trabajo es de una persona.
 */
export async function invalidate({ targetLang, hash, olderThanDays } = {}, actor) {
    await ensureTranslationSchema();
    const where = [`status <> ALL($1::text[])`];
    const params = [SETTLED_STATUSES];
    if (targetLang) { params.push(targetLang); where.push(`"targetLang" = $${params.length}`); }
    if (hash) { params.push(hash); where.push(`"sourceHash" = $${params.length}`); }
    if (olderThanDays) {
        params.push(olderThanDays);
        where.push(`"lastUsedAt" < NOW() - ($${params.length}::int * INTERVAL '1 day')`);
    }
    const { rowCount } = await db.query(
        `DELETE FROM "Translation" WHERE ${where.join(' AND ')}`, params,
    );
    memClear();
    await logEvent({
        targetLang: targetLang || 'todos', result: 'purge', actor,
        textCount: rowCount, error: null,
    });
    return rowCount;
}

// ── Auditoría ──────────────────────────────────────────────────────────────

export async function logEvent({
    sourceLang = BASE_LANG, targetLang, provider = null, result,
    error = null, textCount = 0, chars = 0, durationMs = null,
    actor = null, sourceHash = null, page = null,
} = {}) {
    try {
        await ensureTranslationSchema();
        await db.query(
            `INSERT INTO "TranslationEvent"
                (id, "sourceLang", "targetLang", provider, result, error,
                 "textCount", chars, "durationMs", actor, "sourceHash", page)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [randomUUID(), sourceLang, targetLang, provider, result,
                error ? String(error).slice(0, 1000) : null,
                textCount, chars, durationMs, actor, sourceHash, page],
        );
    } catch (e) {
        // La auditoría no puede tumbar una traducción.
        console.error('[translation] no se pudo auditar:', e.message);
    }
}

// ── Configuración (proveedor activo y respaldo) ────────────────────────────
// Vive en "Setting" para que el panel la cambie sin desplegar.

const SETTING_PROVIDER = 'translation::provider';
const SETTING_FALLBACK = 'translation::fallback';

async function readSetting(key) {
    try {
        const { rows } = await db.query(
            `SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL LIMIT 1`, [key],
        );
        return rows[0]?.value || null;
    } catch { return null; }
}

async function writeSetting(key, value) {
    await db.query(
        `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, NULL, NOW())
         ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
        [key, value],
    );
}

/**
 * Cadena de proveedores a intentar, en orden.
 * El configurado primero; después el respaldo; después cualquier otro que tenga
 * credencial. Sólo se devuelven los que de verdad pueden responder, así que un
 * proveedor mal configurado no bloquea la traducción del sitio.
 */
export async function providerChain() {
    const [configured, fallback] = await Promise.all([
        readSetting(SETTING_PROVIDER),
        readSetting(SETTING_FALLBACK),
    ]);
    const order = [configured, fallback, DEFAULT_PROVIDER, ...PROVIDER_KEYS];
    const seen = new Set();
    const chain = [];
    for (const p of order) {
        if (!p || seen.has(p) || !PROVIDER_KEYS.includes(p)) continue;
        seen.add(p);
        if (providerAvailable(p)) chain.push(p);
    }
    return { chain, configured, fallback };
}

export async function setProvider(provider, fallback) {
    if (provider !== undefined && provider !== null) await writeSetting(SETTING_PROVIDER, provider);
    if (fallback !== undefined && fallback !== null) await writeSetting(SETTING_FALLBACK, fallback);
    return providerChain();
}

// ── Métricas del panel ─────────────────────────────────────────────────────

export async function stats() {
    await ensureTranslationSchema();

    const [byLang, totals, recentErrors, activity, pending] = await Promise.all([
        db.query(`
            SELECT "targetLang" AS lang,
                   COUNT(*)::int                                              AS total,
                   COUNT(*) FILTER (WHERE status = 'auto')::int               AS auto,
                   COUNT(*) FILTER (WHERE status = 'manual')::int             AS manual,
                   COUNT(*) FILTER (WHERE status = 'approved')::int           AS approved,
                   COUNT(*) FILTER (WHERE status = 'failed')::int             AS failed,
                   COALESCE(SUM(char_length(value)), 0)::int                  AS chars,
                   MAX("updatedAt")                                           AS "lastUpdate"
              FROM "Translation"
             GROUP BY 1 ORDER BY 2 DESC
        `),
        db.query(`
            SELECT COUNT(*)::int AS total,
                   COALESCE(SUM(char_length("sourceText")), 0)::int AS "sourceChars",
                   COUNT(DISTINCT "sourceHash")::int AS "uniqueTexts"
              FROM "Translation"
        `),
        db.query(`
            SELECT id, "targetLang", provider, error, "createdAt", "textCount"
              FROM "TranslationEvent"
             WHERE result = 'error'
             ORDER BY "createdAt" DESC LIMIT 25
        `),
        db.query(`
            SELECT result,
                   COUNT(*)::int                       AS calls,
                   COALESCE(SUM("textCount"), 0)::int  AS texts,
                   COALESCE(SUM(chars), 0)::int        AS chars,
                   ROUND(AVG("durationMs"))::int       AS "avgMs"
              FROM "TranslationEvent"
             WHERE "createdAt" > NOW() - INTERVAL '30 days'
             GROUP BY 1
        `),
        // "Pendientes" = textos que existen en un idioma pero no en otro. Es la
        // medida honesta de cobertura: el sitio no tiene un inventario cerrado
        // de cadenas, se descubren al visitarlo.
        db.query(`
            SELECT t."targetLang" AS lang, COUNT(*)::int AS missing
              FROM (SELECT DISTINCT "sourceHash" FROM "Translation") todos
             CROSS JOIN (SELECT DISTINCT "targetLang" FROM "Translation") t
             WHERE NOT EXISTS (
                   SELECT 1 FROM "Translation" x
                    WHERE x."sourceHash" = todos."sourceHash"
                      AND x."targetLang" = t."targetLang")
             GROUP BY 1
        `),
    ]);

    const { chain, configured, fallback } = await providerChain();
    const act = Object.fromEntries(activity.rows.map(r => [r.result, r]));

    return {
        byLanguage: byLang.rows,
        totals: totals.rows[0] || { total: 0, sourceChars: 0, uniqueTexts: 0 },
        pendingByLanguage: Object.fromEntries(pending.rows.map(r => [r.lang, r.missing])),
        errors: recentErrors.rows,
        activity30d: {
            ok: act.ok || { calls: 0, texts: 0, chars: 0, avgMs: null },
            error: act.error || { calls: 0, texts: 0, chars: 0, avgMs: null },
            edits: (act.edit?.calls || 0) + (act.approve?.calls || 0),
        },
        provider: { configured, fallback, chain, active: chain[0] || null },
        cache: memStats(),
    };
}

/** Listado paginado para la pantalla de gestión. */
export async function list({ targetLang, status, search, limit = 50, offset = 0 } = {}) {
    await ensureTranslationSchema();
    const where = [], params = [];
    if (targetLang) { params.push(targetLang); where.push(`"targetLang" = $${params.length}`); }
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (search) {
        params.push(`%${search}%`);
        where.push(`("sourceText" ILIKE $${params.length} OR value ILIKE $${params.length})`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    params.push(Math.min(limit, 200), offset);
    const { rows } = await db.query(
        `SELECT "sourceHash", "sourceText", "targetLang", value, status, kind,
                provider, version, "approvedBy", "approvedAt",
                "useCount", "lastUsedAt", "updatedAt"
           FROM "Translation" ${clause}
          ORDER BY "updatedAt" DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
    );
    const { rows: [count] } = await db.query(
        `SELECT COUNT(*)::int AS n FROM "Translation" ${clause}`,
        params.slice(0, params.length - 2),
    );
    return { items: rows, total: count?.n || 0 };
}

export default {
    hashOf, getCached, putAuto, putManual, approve, invalidate,
    logEvent, providerChain, setProvider, stats, list, memStats, memClear,
};
