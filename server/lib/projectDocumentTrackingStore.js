// ════════════════════════════════════════════════════════════════════
// Seguimiento documental — la LECTURA, por lotes (v4.1332.0)
//
// Carga todo lo que el criterio (`projectDocumentTracking.js`) necesita para
// N proyectos con UNA consulta por fuente —formularios, presentación, video
// propio, Video Pitch, revisiones y recordatorios—, nunca una por proyecto ni
// una por campo. Con eso calcula el seguimiento de cada uno.
//
// No importa controladores (los dos que la usan —el listado de postulaciones
// y el del seguimiento— se importan entre ellos): sólo libs.
//
// Escribe UNA cosa: la caché `completionPct` de los formularios cuando la
// cifra calculada con la plantilla vigente ya no coincide (la plantilla o la
// regla cambiaron). Es un dato DERIVADO: nunca toca las respuestas del club
// ni la fecha de su última edición.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { resolveForms, storageIsShared } from './projectFormsRegistry.js';
import { ensureProjectDocumentSchema } from './ensureProjectDocumentSchema.js';
import { ensureProjectVideoSchema } from './ensureProjectVideoSchema.js';
import { ensureVideoPitchSchema } from './ensureVideoPitchSchema.js';
import { normalizeTrackingConfig, trackingOf } from './projectDocumentTracking.js';
import { completionOf } from './projectFormEngine.js';

const safe = (p) => p.then(r => r.rows).catch((err) => {
    console.warn('[document-tracking] lectura parcial:', err?.message);
    return [];
});

// El video que representa al proyecto cuando hay varios: el más avanzado en
// la revisión y, a igualdad, el más reciente.
const VIDEO_RANK = { approved: 0, in_review: 1, received: 2, changes_requested: 3, rejected: 4, draft: 5, withdrawn: 6 };
const pickVideo = (list = []) => [...list].sort((a, b) =>
    ((VIDEO_RANK[a.status] ?? 9) - (VIDEO_RANK[b.status] ?? 9))
    || (new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()))[0] || null;

// Las tres creaciones de esquema, una sola vez en curso para todo el proceso
// (peticiones simultáneas no las corren en paralelo). Las del video y del
// Video Pitch son de sus módulos: si fallan, su lectura queda vacía.
let _schemas = null;
const ensureSchemas = () => {
    if (!_schemas) {
        _schemas = (async () => {
            await ensureProjectDocumentSchema();
            await ensureProjectVideoSchema().catch(() => {});
            await ensureVideoPitchSchema().catch(() => {});
        })().catch((err) => { _schemas = null; throw err; });
    }
    return _schemas;
};

/** Todas las fuentes de N proyectos, agrupadas por id. */
export const loadSources = async (ids) => {
    const list = [...new Set((ids || []).filter(Boolean))];
    const out = new Map(list.map(id => [id, { records: {}, presentation: null, videos: [], pitch: null, reviews: {}, reminders: [] }]));
    if (!list.length) return out;
    await ensureSchemas();

    const [master, generic, files, videos, pitches, reviews, reminders] = await Promise.all([
        safe(db.query(`SELECT "submissionId", answers, status, "completionPct", "submittedAt", "lastEditedAt", "reviewStatus"
                       FROM "ProjectFairMasterForm" WHERE "submissionId" = ANY($1::text[])`, [list])),
        safe(db.query(`SELECT "submissionId", "formKey", answers, status, "completionPct", "submittedAt", "lastEditedAt", "reviewStatus"
                       FROM "ProjectFairProjectForm" WHERE "submissionId" = ANY($1::text[])`, [list])),
        safe(db.query(`SELECT f.*, (SELECT COUNT(*) FROM "ProjectPresentationFile" x WHERE x."submissionId" = f."submissionId")::int AS "versionCount"
                       FROM (SELECT DISTINCT ON ("submissionId") * FROM "ProjectPresentationFile"
                             WHERE "submissionId" = ANY($1::text[]) AND "retiredAt" IS NULL
                             ORDER BY "submissionId", "versionNumber" DESC) f`, [list])),
        safe(db.query(`SELECT v.id, v."submissionId", v.status, v."currentVersionId", v."reviewNote", v."reviewedAt", v."submittedAt",
                              v."lastEditedAt", v."updatedAt", cv."fileName" AS "cvFileName"
                       FROM "ProjectVideo" v LEFT JOIN "ProjectVideoVersion" cv ON cv.id = v."currentVersionId"
                       WHERE v."submissionId" = ANY($1::text[])`, [list])),
        safe(db.query(`SELECT id, "submissionId", status, number, "commercialStatus", "paymentWaived", "lastEditedAt"
                       FROM "VideoPitchRequest" WHERE "submissionId" = ANY($1::text[])`, [list])),
        safe(db.query(`SELECT * FROM "ProjectDocumentReview" WHERE "submissionId" = ANY($1::text[])`, [list])),
        safe(db.query(`SELECT s.sid, r."sentAt" FROM "ProjectDocumentReminder" r, unnest(r."submissionIds") AS s(sid)
                       WHERE r.status = 'sent' AND r."submissionIds" && $1::text[]`, [list])),
    ]);

    for (const r of master) out.get(r.submissionId) && (out.get(r.submissionId).records.master = r);
    for (const r of generic) out.get(r.submissionId) && (out.get(r.submissionId).records[r.formKey] = r);
    for (const r of files) out.get(r.submissionId) && (out.get(r.submissionId).presentation = { file: r, versions: r.versionCount });
    for (const r of videos) out.get(r.submissionId)?.videos.push(r);
    for (const r of pitches) out.get(r.submissionId) && (out.get(r.submissionId).pitch = r);
    for (const r of reviews) out.get(r.submissionId) && (out.get(r.submissionId).reviews[r.requirementKey] = r);
    for (const r of reminders) out.get(r.sid)?.reminders.push(r.sentAt);
    return out;
};

/**
 * Refresca la caché `completionPct` de los formularios cuyo valor guardado ya
 * no coincide con el calculado. Un UPDATE por tabla, con todas las filas.
 */
const syncPctCache = async (drift) => {
    if (!drift.length) return 0;
    const master = drift.filter(d => !storageIsShared(d.formKey));
    const generic = drift.filter(d => storageIsShared(d.formKey));
    try {
        if (master.length) {
            await db.query(`UPDATE "ProjectFairMasterForm" m SET "completionPct" = x.pct
                            FROM unnest($1::text[], $2::int[]) AS x(sid, pct) WHERE m."submissionId" = x.sid`,
            [master.map(d => d.submissionId), master.map(d => d.pct)]);
        }
        if (generic.length) {
            await db.query(`UPDATE "ProjectFairProjectForm" f SET "completionPct" = x.pct
                            FROM unnest($1::text[], $2::text[], $3::int[]) AS x(sid, fk, pct)
                            WHERE f."submissionId" = x.sid AND f."formKey" = x.fk`,
            [generic.map(d => d.submissionId), generic.map(d => d.formKey), generic.map(d => d.pct)]);
        }
    } catch (err) {
        console.warn('[document-tracking] no pude refrescar la caché de avance:', err?.message);
    }
    return drift.length;
};

/**
 * El seguimiento de N proyectos de UNA edición. `rows` son filas completas de
 * `ProjectFairSubmission`; `cfg`, la convocatoria de esa edición.
 *
 * Devuelve un Map id → seguimiento.
 */
export const loadTracking = async (rows, cfg, { now = Date.now(), sources = null } = {}) => {
    const config = normalizeTrackingConfig(cfg?.documentTracking);
    const forms = resolveForms(cfg || {});
    const src = sources || await loadSources(rows.map(r => r.id));
    const result = new Map();
    const drift = [];
    for (const row of rows) {
        const s = src.get(row.id) || { records: {}, videos: [], reviews: {}, reminders: [] };
        const t = trackingOf({
            submission: row,
            forms: forms.map(f => ({ key: f.key, title: f.template?.title || f.key, template: f.template, record: s.records[f.key] || null })),
            presentation: s.presentation,
            video: pickVideo(s.videos),
            pitch: s.pitch,
            reviews: s.reviews,
            reminders: s.reminders,
            config,
            now,
        });
        result.set(row.id, t);
        for (const f of forms) {
            const rec = s.records[f.key];
            if (!rec) continue;
            const pct = completionOf(f.template, rec.answers || {});
            if (Number(rec.completionPct) !== pct) drift.push({ submissionId: row.id, formKey: f.key, pct });
        }
    }
    await syncPctCache(drift);
    return result;
};

/** Para el listado: las filas visibles con su seguimiento compacto. */
export default { loadSources, loadTracking };
