// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — PERSISTENCIA
//
// Todo el acceso a las seis tablas del módulo pasa por acá. Ningún controlador
// escribe SQL suelto: es lo que hace que la regla de abajo se cumpla siempre y
// no "casi siempre".
//
// REGLA DURABLE — **lo MANUAL no lo pisa la IA, nunca.** Está en el `WHERE` del
// `ON CONFLICT` de `savePageMeta`, no en la pantalla. Es exactamente el mismo
// criterio que `putAuto` en el módulo de traducción, y por el mismo motivo: si
// el repaso automático nocturno puede sobrescribir un título que alguien
// corrigió a mano, corregir a mano deja de tener sentido y el módulo se vuelve
// un enemigo del administrador en vez de un copiloto.
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';
import { ensureSeoSchema } from './ensureSeoSchema.js';
import { normalizePath } from './seoSpec.js';

// ── Configuración global del sitio ───────────────────────────────────────────

// Lo que se da por cierto cuando el sitio todavía no configuró nada. Se mezcla
// en profundidad con lo guardado, así que agregar un ajuste nuevo no invalida
// las filas existentes — misma regla que `DEFAULT_CONFIG` del Generador de
// Pendones.
export const DEFAULT_SITE_CONFIG = {
    language: 'es-CO',
    locale: 'es_CO',
    keywords: [],
    socialProfiles: [],
    defaultImage: null,
    themeColor: null,
    twitterHandle: null,
    authorName: null,
    searchUrl: null,
    localBusiness: false,
    declareRotaryParent: true,
    email: null,
    phone: null,
    taxId: null,
    streetAddress: null,
    postalCode: null,
    region: null,
    lat: null,
    lng: null,
    openingHours: null,
    robotsExtra: '',
    // Integraciones: sólo identificadores y estado. Las credenciales viven en el
    // entorno, nunca en la base — regla de credenciales de CLAUDE.md.
    integrations: {},
};

function mergeDeep(base, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch ?? base;
    const out = { ...base };
    for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' && !Array.isArray(base[k]))
            ? mergeDeep(base[k], v)
            : v;
    }
    return out;
}

// Caché por sitio: `renderHead` la consulta en CADA petición de página. Sin
// caché, servir un byte de HTML costaría un viaje más a la base, pagado por el
// visitante — es el problema que corrigió v4.659 y no se reintroduce acá.
const CONFIG_TTL_MS = 60_000;
const configCache = new Map();

export async function readSiteConfig(clubId, { fresh = false } = {}) {
    if (!clubId) return { ...DEFAULT_SITE_CONFIG, autoMode: true };
    const hit = configCache.get(clubId);
    if (!fresh && hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.value;

    await ensureSeoSchema();
    const { rows } = await db.query(
        `SELECT "config", "autoMode", "lastAuditAt" FROM "SeoSiteConfig" WHERE "clubId"=$1`,
        [clubId],
    );
    const value = {
        ...mergeDeep(DEFAULT_SITE_CONFIG, rows[0]?.config || {}),
        autoMode: rows[0]?.autoMode !== false,
        lastAuditAt: rows[0]?.lastAuditAt || null,
    };
    configCache.set(clubId, { value, at: Date.now() });
    return value;
}

export async function saveSiteConfig(clubId, patch, { autoMode } = {}) {
    await ensureSeoSchema();
    const current = await readSiteConfig(clubId, { fresh: true });
    // Se guarda sólo lo que NO es del default, para que un cambio futuro en los
    // valores por omisión llegue a los sitios que nunca los tocaron.
    const merged = mergeDeep(current, patch || {});
    delete merged.autoMode; delete merged.lastAuditAt;

    await db.query(
        `INSERT INTO "SeoSiteConfig" ("clubId","config","autoMode")
         VALUES ($1, $2::jsonb, COALESCE($3, true))
         ON CONFLICT ("clubId") DO UPDATE
            SET "config"   = $2::jsonb,
                "autoMode" = COALESCE($3, "SeoSiteConfig"."autoMode"),
                "updatedAt"= now()`,
        [clubId, JSON.stringify(merged), autoMode ?? null],
    );
    configCache.delete(clubId);
    return readSiteConfig(clubId, { fresh: true });
}

export function invalidateSiteConfig(clubId) {
    if (clubId) configCache.delete(clubId); else configCache.clear();
}

// ── Metadatos por página ─────────────────────────────────────────────────────

export async function readPageMeta(clubId, path) {
    if (!clubId) return null;
    await ensureSeoSchema();
    const { rows } = await db.query(
        `SELECT * FROM "SeoPageMeta" WHERE "clubId"=$1 AND "path"=$2`,
        [clubId, normalizePath(path)],
    );
    return rows[0] || null;
}

export async function listPageMeta(clubId) {
    await ensureSeoSchema();
    const { rows } = await db.query(
        `SELECT * FROM "SeoPageMeta" WHERE "clubId"=$1 ORDER BY "path"`,
        [clubId],
    );
    return rows;
}

/**
 * Guarda los metadatos de una página.
 *
 * `source: 'manual'` gana SIEMPRE. Cuando la escritura viene de la IA
 * (`source: 'ai'`), el `WHERE` del `ON CONFLICT` impide tocar una fila que ya
 * estaba en manual. No es una comprobación previa —eso tendría carrera entre
 * dos barridos simultáneos—: es la propia sentencia la que no escribe.
 */
export async function savePageMeta(clubId, path, values, { source = 'ai', aiModel = null } = {}) {
    await ensureSeoSchema();
    const p = normalizePath(path);
    const guard = source === 'manual'
        ? '' // una edición a mano puede sobrescribir cualquier cosa, incluso otra manual
        : `WHERE "SeoPageMeta"."source" <> 'manual'`;

    const { rows } = await db.query(
        `INSERT INTO "SeoPageMeta"
            ("clubId","path","kind","title","description","image","canonical",
             "keywords","indexable","priority","changefreq","schema","source","aiModel")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
         ON CONFLICT ("clubId","path") DO UPDATE SET
            "kind"        = COALESCE(EXCLUDED."kind",        "SeoPageMeta"."kind"),
            "title"       = COALESCE(EXCLUDED."title",       "SeoPageMeta"."title"),
            "description" = COALESCE(EXCLUDED."description", "SeoPageMeta"."description"),
            "image"       = COALESCE(EXCLUDED."image",       "SeoPageMeta"."image"),
            "canonical"   = COALESCE(EXCLUDED."canonical",   "SeoPageMeta"."canonical"),
            "keywords"    = CASE WHEN cardinality(EXCLUDED."keywords") > 0
                                 THEN EXCLUDED."keywords" ELSE "SeoPageMeta"."keywords" END,
            "indexable"   = COALESCE(EXCLUDED."indexable",   "SeoPageMeta"."indexable"),
            "priority"    = COALESCE(EXCLUDED."priority",    "SeoPageMeta"."priority"),
            "changefreq"  = COALESCE(EXCLUDED."changefreq",  "SeoPageMeta"."changefreq"),
            "schema"      = COALESCE(EXCLUDED."schema",      "SeoPageMeta"."schema"),
            "source"      = EXCLUDED."source",
            "aiModel"     = EXCLUDED."aiModel",
            "updatedAt"   = now()
         ${guard}
         RETURNING *`,
        [
            clubId, p, values.kind ?? null, values.title ?? null, values.description ?? null,
            values.image ?? null, values.canonical ?? null, values.keywords ?? [],
            values.indexable ?? null, values.priority ?? null, values.changefreq ?? null,
            values.schema ? JSON.stringify(values.schema) : null, source, aiModel,
        ],
    );
    // Sin filas devueltas = la guardia lo impidió. Se informa; no es un fallo.
    return { saved: rows[0] || null, skippedManual: rows.length === 0 };
}

export async function deletePageMeta(clubId, path) {
    await ensureSeoSchema();
    await db.query(`DELETE FROM "SeoPageMeta" WHERE "clubId"=$1 AND "path"=$2`, [clubId, normalizePath(path)]);
}

// ── Auditorías ───────────────────────────────────────────────────────────────

export async function startAudit(clubId, trigger = 'manual') {
    await ensureSeoSchema();
    const { rows } = await db.query(
        `INSERT INTO "SeoAudit" ("clubId","trigger","status") VALUES ($1,$2,'running') RETURNING *`,
        [clubId, trigger],
    );
    return rows[0];
}

export async function finishAudit(auditId, result) {
    await ensureSeoSchema();
    const { rows } = await db.query(
        `UPDATE "SeoAudit" SET
            "status"='done', "score"=$2, "healthScore"=$3, "axisScores"=$4::jsonb,
            "pagesScanned"=$5, "issuesCount"=$6, "criticalCount"=$7,
            "summary"=$8::jsonb, "notes"=$9, "finishedAt"=now()
         WHERE "id"=$1 RETURNING *`,
        [
            auditId, result.score, result.healthScore, JSON.stringify(result.axisScores || {}),
            result.pagesScanned || 0, result.issuesCount || 0, result.criticalCount || 0,
            JSON.stringify(result.summary || {}), result.notes || [],
        ],
    );
    return rows[0];
}

export async function failAudit(auditId, message) {
    await ensureSeoSchema();
    await db.query(
        `UPDATE "SeoAudit" SET "status"='failed', "error"=$2, "finishedAt"=now() WHERE "id"=$1`,
        [auditId, String(message).slice(0, 2000)],
    );
}

export async function latestAudit(clubId) {
    await ensureSeoSchema();
    const { rows } = await db.query(
        `SELECT * FROM "SeoAudit" WHERE "clubId"=$1 AND "status"='done'
         ORDER BY "startedAt" DESC LIMIT 1`,
        [clubId],
    );
    return rows[0] || null;
}

export async function auditHistory(clubId, limit = 30) {
    await ensureSeoSchema();
    const { rows } = await db.query(
        `SELECT "id","score","healthScore","axisScores","issuesCount","criticalCount",
                "pagesScanned","startedAt","finishedAt","trigger"
         FROM "SeoAudit" WHERE "clubId"=$1 AND "status"='done'
         ORDER BY "startedAt" DESC LIMIT $2`,
        [clubId, limit],
    );
    return rows;
}

// ── Hallazgos ────────────────────────────────────────────────────────────────

export async function saveIssues(auditId, clubId, issues) {
    await ensureSeoSchema();
    if (!issues?.length) return 0;

    // Inserción en un solo viaje. Con 200 páginas y varios hallazgos por página
    // una sentencia por fila serían cientos de idas y vueltas dentro de los
    // 120 s de la función.
    const cols = 11;
    const values = [];
    const params = [];
    issues.forEach((iss, i) => {
        const b = i * cols;
        values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9}::jsonb,$${b + 10},$${b + 11}::jsonb)`);
        params.push(
            auditId, clubId, iss.path, iss.code, iss.axis, iss.severity,
            iss.impact ?? 0, iss.effort || 'auto',
            JSON.stringify(iss.evidence || {}), iss.autoFixable === true,
            iss.proposedValue ? JSON.stringify(iss.proposedValue) : null,
        );
    });
    await db.query(
        `INSERT INTO "SeoIssue"
            ("auditId","clubId","path","code","axis","severity","impact","effort","evidence","autoFixable","proposedValue")
         VALUES ${values.join(',')}`,
        params,
    );
    return issues.length;
}

export async function listIssues(clubId, { auditId = null, status = 'open', limit = 200 } = {}) {
    await ensureSeoSchema();
    const id = auditId || (await latestAudit(clubId))?.id;
    if (!id) return [];
    const where = ['"auditId"=$1'];
    const params = [id];
    if (status && status !== 'all') { params.push(status); where.push(`"status"=$${params.length}`); }
    params.push(limit);
    const { rows } = await db.query(
        `SELECT * FROM "SeoIssue" WHERE ${where.join(' AND ')}
         ORDER BY "impact" DESC, "severity" DESC LIMIT $${params.length}`,
        params,
    );
    return rows;
}

export async function setIssueRecommendation(issueId, text) {
    await db.query(`UPDATE "SeoIssue" SET "recommendation"=$2 WHERE "id"=$1`, [issueId, text]);
}

export async function setIssueStatus(issueId, status) {
    await ensureSeoSchema();
    const { rows } = await db.query(
        `UPDATE "SeoIssue" SET "status"=$2, "resolvedAt"=CASE WHEN $2 IN ('fixed','ignored') THEN now() ELSE NULL END
         WHERE "id"=$1 RETURNING *`,
        [issueId, status],
    );
    return rows[0] || null;
}

// ── Palabras clave ───────────────────────────────────────────────────────────

export async function upsertKeywords(clubId, keywords) {
    await ensureSeoSchema();
    const saved = [];
    for (const k of keywords || []) {
        const term = String(k.keyword || '').trim().toLowerCase();
        if (!term) continue;
        const { rows } = await db.query(
            `INSERT INTO "SeoKeyword"
                ("clubId","keyword","kind","intent","volume","difficulty","competition","provenance","targetPath","priority","notes")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT ("clubId","keyword") DO UPDATE SET
                "kind"       = EXCLUDED."kind",
                "intent"     = COALESCE(EXCLUDED."intent", "SeoKeyword"."intent"),
                "volume"     = COALESCE(EXCLUDED."volume", "SeoKeyword"."volume"),
                "difficulty" = COALESCE(EXCLUDED."difficulty", "SeoKeyword"."difficulty"),
                "competition"= COALESCE(EXCLUDED."competition", "SeoKeyword"."competition"),
                "provenance" = EXCLUDED."provenance",
                "targetPath" = COALESCE(EXCLUDED."targetPath", "SeoKeyword"."targetPath"),
                "priority"   = GREATEST(EXCLUDED."priority", "SeoKeyword"."priority"),
                "updatedAt"  = now()
             RETURNING *`,
            [
                clubId, term, k.kind || 'secondary', k.intent || null,
                k.volume ?? null, k.difficulty ?? null, k.competition || null,
                k.provenance || 'estimated', k.targetPath || null, k.priority ?? 0, k.notes || null,
            ],
        );
        saved.push(rows[0]);
    }
    return saved;
}

export async function listKeywords(clubId, { limit = 300 } = {}) {
    await ensureSeoSchema();
    const { rows } = await db.query(
        `SELECT * FROM "SeoKeyword" WHERE "clubId"=$1
         ORDER BY "priority" DESC, "kind", "keyword" LIMIT $2`,
        [clubId, limit],
    );
    return rows;
}

export async function deleteKeyword(clubId, id) {
    await db.query(`DELETE FROM "SeoKeyword" WHERE "clubId"=$1 AND "id"=$2`, [clubId, id]);
}

// ── Histórico ────────────────────────────────────────────────────────────────

export async function recordMetrics(clubId, rows) {
    await ensureSeoSchema();
    for (const r of rows || []) {
        await db.query(
            `INSERT INTO "SeoMetric" ("clubId","date","source","metric","path","value","provenance","meta")
             VALUES ($1,$2,$3,$4,COALESCE($5,''),$6,$7,$8::jsonb)
             ON CONFLICT ("clubId","date","source","metric","path") DO UPDATE
                SET "value"=EXCLUDED."value", "provenance"=EXCLUDED."provenance", "meta"=EXCLUDED."meta"`,
            [
                clubId, r.date, r.source, r.metric, r.path || '',
                r.value ?? null, r.provenance || 'measured', JSON.stringify(r.meta || {}),
            ],
        );
    }
}

export async function readMetricSeries(clubId, metric, { days = 90, source = null } = {}) {
    await ensureSeoSchema();
    const params = [clubId, metric, days];
    let sql = `SELECT "date","value","source","provenance" FROM "SeoMetric"
               WHERE "clubId"=$1 AND "metric"=$2 AND "path"='' AND "date" >= (CURRENT_DATE - ($3 || ' days')::interval)`;
    if (source) { params.push(source); sql += ` AND "source"=$${params.length}`; }
    sql += ` ORDER BY "date"`;
    const { rows } = await db.query(sql, params);
    return rows;
}

export async function touchAuditTimestamp(clubId) {
    await db.query(
        `INSERT INTO "SeoSiteConfig" ("clubId","lastAuditAt") VALUES ($1, now())
         ON CONFLICT ("clubId") DO UPDATE SET "lastAuditAt"=now(), "updatedAt"=now()`,
        [clubId],
    );
    configCache.delete(clubId);
}

export default {
    DEFAULT_SITE_CONFIG, readSiteConfig, saveSiteConfig, invalidateSiteConfig,
    readPageMeta, listPageMeta, savePageMeta, deletePageMeta,
    startAudit, finishAudit, failAudit, latestAudit, auditHistory,
    saveIssues, listIssues, setIssueRecommendation, setIssueStatus,
    upsertKeywords, listKeywords, deleteKeyword,
    recordMetrics, readMetricSeries, touchAuditTimestamp,
};
