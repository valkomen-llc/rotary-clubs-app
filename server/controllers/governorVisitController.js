// ════════════════════════════════════════════════════════════════════
// Visitas del Gobernador — controlador — v4.1260.0
//
// Una sección de Rotary en Acción, no un módulo aparte: vive en el mismo
// router (`/api/rotary-en-accion/visitas-gobernador/…`), usa la misma subida
// prefirmada a S3, los mismos permisos (`rotary_en_accion.*`) y, al
// publicarse, crea UNA solicitud de Rotary en Acción con `createSubmission`,
// la misma función del formulario general. Ver
// `docs/claude/visitas-del-gobernador.md`.
//
// Lo público (catálogo, subida, envío, corrección con enlace) no lleva auth;
// la administración sí. Nada se publica sin pasar por «Aprobada».
// ════════════════════════════════════════════════════════════════════
import { randomBytes } from 'node:crypto';
import db from '../lib/db.js';
import ensureGovernorVisitSchema from '../lib/ensureGovernorVisitSchema.js';
import { ensureDistrictClubDirectorySchema } from '../lib/ensureDistrictClubDirectorySchema.js';
import { universalCampaignId } from '../lib/rotaryEngine.js';
import { presignSubmissionUpload, headSubmissionFile, stagingKeyBelongs, signedSubmissionUrl } from '../lib/submissionFiles.js';
import { createSubmission, transitionSubmission } from '../lib/contentSubmissionStore.js';
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from '../lib/contentSubmissionSpec.js';
import {
    GOVERNOR_VISIT_DISTRICT, VISIT_STATES, VISIT_INITIAL_STATE, VISIT_PENDING_STATES,
    VISIT_MAX_PHOTOS, VISIT_MAX_VIDEOS, VISIT_MAX_LINKS, VISIT_CAPTION_MAX,
    shapeVisit, validateVisit, checkVisitFile, makeVisitRef, canTransitionVisit,
    visitNeedsReason, visitStateLabel, nextVisitStates, canPublishVisit, visitDateIso,
    visitToSubmissionData, visitFilesForSubmission, GOVERNOR_VISIT_CONSENT_TEXT,
} from '../lib/governorVisitSpec.js';
import { resolveOrigin } from './rotaryEnAccionController.js';

console.log('[governor-visits] v4.1262.0 cargado — Visitas del Gobernador (Rotary en Acción) en dominio.org/visitas-del-gobernador, formulario en tres pasos');

const fail = (res, e, code = 500) => {
    if (code >= 500) console.error('[governor-visits]', e?.message || e);
    return res.status(code).json({ error: e?.message || 'Error' });
};
const actorOf = (req) => ({ actor: req.user?.id || null, actorName: req.user?.name || req.user?.email || 'Administración' });
const hostOf = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').slice(0, 200);
const CORRECTION_DAYS = 30;

/** Una entrada del historial: quién, cuándo, de qué estado a cuál y por qué. */
const evento = ({ type, from = null, to = null, actor = null, actorName = null, detail = '' }) => JSON.stringify([{
    at: new Date().toISOString(), type, from, to, actor, actorName, detail: String(detail || '').slice(0, 1000),
}]);

const errorsMessage = (errors) => errors[0]?.message || 'Revisa los datos de la visita.';

// ─── El catálogo oficial ───────────────────────────────────────────────
// Los clubes ROTARIOS del Distrito en el Directorio Distrital. Un perfil
// archivado no se ofrece; uno en borrador sí, porque el club existe aunque su
// ficha pública no esté completa.
async function catalogClubs() {
    await ensureDistrictClubDirectorySchema();
    const { rows } = await db.query(
        `SELECT id, "officialName", "shortName", slug, city, state, "clubId"
           FROM "DistrictClubProfile"
          WHERE "districtNumber" = $1 AND "organizationType" = 'rotary' AND COALESCE(status, '') <> 'archived'
          ORDER BY "officialName" ASC`,
        [GOVERNOR_VISIT_DISTRICT]
    );
    return rows;
}

async function clubById(id) {
    if (!id) return null;
    await ensureDistrictClubDirectorySchema();
    const { rows } = await db.query(
        `SELECT id, "officialName", "shortName", slug, city, state, "clubId"
           FROM "DistrictClubProfile"
          WHERE id = $1 AND "districtNumber" = $2 AND "organizationType" = 'rotary' AND COALESCE(status, '') <> 'archived'`,
        [String(id), GOVERNOR_VISIT_DISTRICT]
    );
    return rows[0] || null;
}

/**
 * Comprueba cada archivo nuevo contra el objeto REAL de S3 y que nadie más lo
 * haya reclamado. `known` son los que ya pertenecen a esta visita (una
 * corrección los conserva sin volver a mirarlos).
 */
async function verifyMedia(media, { campaignId, known = new Map(), visitId = null }) {
    const out = [];
    for (const m of media) {
        const previo = known.get(m.key);
        if (previo) { out.push({ ...previo, caption: m.caption }); continue; }
        if (!stagingKeyBelongs(m.key, campaignId)) {
            return { ok: false, error: 'Uno de los archivos no corresponde a este formulario. Vuelve a adjuntarlo.' };
        }
        const { rows } = await db.query(
            `SELECT 1 FROM "GovernorVisit" WHERE media @> $1::jsonb AND ($2::text IS NULL OR id <> $2) LIMIT 1`,
            [JSON.stringify([{ key: m.key }]), visitId]
        );
        const enSolicitud = await db.query(`SELECT 1 FROM "ContributionSubmissionFile" WHERE "s3Key" = $1 LIMIT 1`, [m.key])
            .then(r => r.rows.length > 0).catch(() => false);
        if (rows.length || enSolicitud) return { ok: false, error: 'Uno de los archivos ya fue enviado en otro reporte. Vuelve a adjuntarlo.' };
        const head = await headSubmissionFile(m.key, { filename: m.filename, contentType: m.contentType });
        if (!head.ok) return { ok: false, error: head.error };
        out.push({ key: m.key, kind: head.kind, filename: m.filename, contentType: head.mime || m.contentType, bytes: head.bytes, caption: m.caption });
    }
    const fotos = out.filter(m => m.kind === 'image').length;
    const videos = out.filter(m => m.kind === 'video').length;
    if (fotos > VISIT_MAX_PHOTOS) return { ok: false, error: `Máximo ${VISIT_MAX_PHOTOS} fotografías por visita.` };
    if (videos > VISIT_MAX_VIDEOS) return { ok: false, error: `Máximo ${VISIT_MAX_VIDEOS} videos por visita.` };
    return { ok: true, media: out };
}

/** URL de la galería: la de la Biblioteca si el archivo ya se promovió (el
 *  objeto de staging se borra al promover), si no un enlace firmado. */
async function mediaWithUrls(visit) {
    const promovidos = new Map();
    if (visit.contributionSubmissionId) {
        const { rows } = await db.query(
            `SELECT "s3Key", "mediaId", "mediaUrl" FROM "ContributionSubmissionFile" WHERE "submissionId" = $1`,
            [visit.contributionSubmissionId]
        ).catch(() => ({ rows: [] }));
        for (const r of rows) if (r.mediaUrl) promovidos.set(r.s3Key, r);
    }
    const media = Array.isArray(visit.media) ? visit.media : [];
    return Promise.all(media.map(async (m) => {
        const p = promovidos.get(m.key);
        return { ...m, url: p?.mediaUrl || await signedSubmissionUrl(m.key, { seconds: 900 }), mediaId: p?.mediaId || null, inLibrary: !!p };
    }));
}

const publicView = (v) => ({
    publicRef: v.publicRef, status: v.status, statusLabel: visitStateLabel(v.status),
    clubName: v.clubName, visitDate: visitDateIso(v.visitDate), title: v.title,
});

// ════════════════════════════════════════════════════════════════════
// PÚBLICO
// ════════════════════════════════════════════════════════════════════

// GET /visitas-gobernador/config
export const getVisitConfig = async (req, res) => {
    try {
        await ensureGovernorVisitSchema();
        const clubs = await catalogClubs();
        // Los gobernadores ya registrados, como sugerencia (no como lista
        // cerrada): son cargos públicos, no datos personales del reporte.
        const { rows: gov } = await db.query(
            `SELECT "governorName" AS name, MAX("visitDate") AS last
               FROM "GovernorVisit" WHERE status <> 'rechazada'
              GROUP BY 1 ORDER BY 2 DESC LIMIT 10`
        ).catch(() => ({ rows: [] }));
        res.json({
            district: GOVERNOR_VISIT_DISTRICT,
            clubs: clubs.map(c => ({
                id: c.id, name: c.officialName, shortName: c.shortName, city: c.city || '',
                state: c.state || '', slug: c.slug, siteId: c.clubId || null,
            })),
            governors: gov.map(g => g.name).filter(Boolean),
            limits: {
                maxPhotos: VISIT_MAX_PHOTOS, maxVideos: VISIT_MAX_VIDEOS, maxLinks: VISIT_MAX_LINKS,
                captionMax: VISIT_CAPTION_MAX, imageMaxBytes: IMAGE_MAX_BYTES, videoMaxBytes: VIDEO_MAX_BYTES,
            },
            consentText: GOVERNOR_VISIT_CONSENT_TEXT,
            today: new Date().toISOString().slice(0, 10),
        });
    } catch (e) { return fail(res, e); }
};

// POST /visitas-gobernador/presign
export const presignVisitUpload = async (req, res) => {
    try {
        const { contentType, filename, size } = req.body || {};
        const juicio = checkVisitFile({ contentType, filename, size });
        if (!juicio.ok) return res.status(400).json({ error: juicio.errores[0], errores: juicio.errores });
        const cid = await universalCampaignId();
        const out = await presignSubmissionUpload({ campaignId: cid, contentType, filename, size });
        if (!out.ok) return res.status(400).json({ error: out.errores?.[0] || 'No se pudo preparar la subida.', errores: out.errores });
        res.json(out);
    } catch (e) { return fail(res, e, 400); }
};

// POST /visitas-gobernador/submit
export const submitVisit = async (req, res) => {
    try {
        await ensureGovernorVisitSchema();
        const v = shapeVisit(req.body || {});
        const juicio = validateVisit(v);
        if (!juicio.ok) return res.status(400).json({ error: errorsMessage(juicio.errors), errors: juicio.errors });

        const club = await clubById(v.clubProfileId);
        if (!club) return res.status(400).json({ error: 'El club seleccionado no está en el catálogo oficial del Distrito 4281.', errors: [{ step: 1, field: 'clubProfileId', message: 'Selecciona un club del catálogo oficial.' }] });

        const cid = await universalCampaignId();
        const media = await verifyMedia(v.media, { campaignId: cid });
        if (!media.ok) return res.status(400).json({ error: media.error, errors: [{ step: 2, field: 'media', message: media.error }] });

        const cols = [
            '"publicRef"', 'status', '"districtNumber"', '"clubProfileId"', '"clubName"', '"clubCity"', '"clubState"', '"clubSlug"', '"clubPlatformId"',
            '"visitDate"', '"governorName"', 'venue', 'title', 'reason',
            'description', 'activities', 'topics', 'recognitions', 'agreements', 'commitments', 'highlights',
            'media', 'links', '"responsibleName"', '"responsibleRole"', '"responsibleEmail"', '"responsiblePhone"',
            '"truthConfirmed"', '"publicationConsent"', '"consentText"', '"consentAt"', 'history', '"originHost"',
        ];
        const valores = (ref) => [
            ref, VISIT_INITIAL_STATE, GOVERNOR_VISIT_DISTRICT, club.id, club.officialName, club.city || null, club.state || null, club.slug || null, club.clubId || null,
            v.visitDate, v.governorName, v.venue, v.title, v.reason,
            v.description, v.activities || null, v.topics || null, v.recognitions || null, v.agreements || null, v.commitments || null, v.highlights || null,
            JSON.stringify(media.media), JSON.stringify(v.links), v.responsibleName, v.responsibleRole, v.responsibleEmail, v.responsiblePhone,
            v.truthConfirmed, v.publicationConsent, GOVERNOR_VISIT_CONSENT_TEXT, new Date(),
            evento({ type: 'created', to: VISIT_INITIAL_STATE, actorName: v.responsibleName, detail: `Reporte enviado por ${v.responsibleRole}: ${media.media.length} archivo(s), ${v.links.length} enlace(s)` }),
            hostOf(req),
        ];
        const ph = cols.map((_, i) => `$${i + 1}`).join(',');
        // El identificador es aleatorio y corto: se reintenta ante el choque
        // (improbable) con el índice único, nunca se repite uno.
        let fila = null;
        for (let intento = 0; intento < 5 && !fila; intento++) {
            try {
                const { rows } = await db.query(`INSERT INTO "GovernorVisit" (${cols.join(',')}) VALUES (${ph}) RETURNING *`, valores(makeVisitRef()));
                fila = rows[0];
            } catch (e) {
                if (!/GovernorVisit_publicRef_key/.test(e.message)) throw e;
            }
        }
        if (!fila) throw new Error('No se pudo generar el identificador de la visita. Intenta de nuevo.');
        res.status(201).json({ ok: true, id: fila.id, publicRef: fila.publicRef, visit: publicView(fila) });
    } catch (e) { return fail(res, e); }
};

async function visitByToken(token) {
    const t = String(token || '');
    if (t.length < 20) return null;
    const { rows } = await db.query(
        `SELECT * FROM "GovernorVisit" WHERE "correctionToken" = $1 AND status = 'correcciones' AND "correctionTokenExpires" > NOW()`,
        [t]
    );
    return rows[0] || null;
}

// GET /visitas-gobernador/correccion/:token
export const getVisitForCorrection = async (req, res) => {
    try {
        await ensureGovernorVisitSchema();
        const v = await visitByToken(req.params.token);
        if (!v) return res.status(404).json({ error: 'El enlace de corrección no es válido o ya venció. Pide uno nuevo al equipo distrital.' });
        res.json({
            visit: {
                ...publicView(v), statusReason: v.statusReason,
                clubProfileId: v.clubProfileId, visitDate: visitDateIso(v.visitDate),
                governorName: v.governorName, venue: v.venue, reason: v.reason,
                description: v.description, activities: v.activities, topics: v.topics, recognitions: v.recognitions,
                agreements: v.agreements, commitments: v.commitments, highlights: v.highlights,
                links: v.links, media: await mediaWithUrls(v),
                responsibleName: v.responsibleName, responsibleRole: v.responsibleRole,
                responsibleEmail: v.responsibleEmail, responsiblePhone: v.responsiblePhone,
            },
        });
    } catch (e) { return fail(res, e); }
};

// POST /visitas-gobernador/correccion/:token
export const submitVisitCorrection = async (req, res) => {
    try {
        await ensureGovernorVisitSchema();
        const actual = await visitByToken(req.params.token);
        if (!actual) return res.status(404).json({ error: 'El enlace de corrección no es válido o ya venció. Pide uno nuevo al equipo distrital.' });
        const v = shapeVisit(req.body || {});
        const juicio = validateVisit(v);
        if (!juicio.ok) return res.status(400).json({ error: errorsMessage(juicio.errors), errors: juicio.errors });
        const club = await clubById(v.clubProfileId);
        if (!club) return res.status(400).json({ error: 'El club seleccionado no está en el catálogo oficial del Distrito 4281.' });
        const cid = await universalCampaignId();
        const known = new Map((actual.media || []).map(m => [m.key, m]));
        const media = await verifyMedia(v.media, { campaignId: cid, known, visitId: actual.id });
        if (!media.ok) return res.status(400).json({ error: media.error, errors: [{ step: 2, field: 'media', message: media.error }] });

        const { rows } = await db.query(
            `UPDATE "GovernorVisit" SET
                status = 'en_revision', "clubProfileId" = $2, "clubName" = $3, "clubCity" = $4, "clubState" = $5, "clubSlug" = $6, "clubPlatformId" = $7,
                "visitDate" = $8, "governorName" = $9, venue = $10, title = $11, reason = $12,
                description = $13, activities = $14, topics = $15, recognitions = $16, agreements = $17, commitments = $18, highlights = $19,
                media = $20, links = $21, "responsibleName" = $22, "responsibleRole" = $23, "responsibleEmail" = $24, "responsiblePhone" = $25,
                "truthConfirmed" = TRUE, "publicationConsent" = TRUE, "consentAt" = NOW(),
                "correctionToken" = NULL, "correctionTokenExpires" = NULL,
                history = history || $26::jsonb, "updatedAt" = NOW()
              WHERE id = $1 AND status = 'correcciones'
              RETURNING *`,
            [
                actual.id, club.id, club.officialName, club.city || null, club.state || null, club.slug || null, club.clubId || null,
                v.visitDate, v.governorName, v.venue, v.title, v.reason,
                v.description, v.activities || null, v.topics || null, v.recognitions || null, v.agreements || null, v.commitments || null, v.highlights || null,
                JSON.stringify(media.media), JSON.stringify(v.links), v.responsibleName, v.responsibleRole, v.responsibleEmail, v.responsiblePhone,
                evento({ type: 'corrected', from: 'correcciones', to: 'en_revision', actorName: v.responsibleName, detail: 'Correcciones enviadas por el club desde el enlace de corrección.' }),
            ]
        );
        if (!rows[0]) return res.status(409).json({ error: 'La visita cambió de estado mientras corregías. Contacta al equipo distrital.' });
        res.json({ ok: true, id: rows[0].id, publicRef: rows[0].publicRef, visit: publicView(rows[0]) });
    } catch (e) { return fail(res, e); }
};

// ════════════════════════════════════════════════════════════════════
// ADMINISTRACIÓN
// ════════════════════════════════════════════════════════════════════

const SORTS = { recientes: '"createdAt" DESC', visita: '"visitDate" DESC, "createdAt" DESC', club: '"clubName" ASC, "visitDate" DESC' };

function filtros(q = {}) {
    const cond = ['"districtNumber" = $1'];
    const params = [GOVERNOR_VISIT_DISTRICT];
    const add = (sql, val) => { params.push(val); cond.push(sql.replace(/\$\?/g, `$${params.length}`)); };
    if (q.status && VISIT_STATES[q.status]) add('status = $?', q.status);
    if (q.status === 'pendientes') add('status = ANY($?)', VISIT_PENDING_STATES);
    if (q.club) add('"clubProfileId" = $?', String(q.club));
    if (q.governor) add('"governorName" ILIKE $?', `%${String(q.governor).slice(0, 120)}%`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.from || ''))) add('"visitDate" >= $?::date', q.from);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.to || ''))) add('"visitDate" <= $?::date', q.to);
    if (q.q) add(`(title ILIKE $? OR "clubName" ILIKE $? OR "governorName" ILIKE $? OR "publicRef" ILIKE $? OR "responsibleName" ILIKE $? OR venue ILIKE $?)`, `%${String(q.q).slice(0, 120)}%`);
    return { where: cond.join(' AND '), params };
}

// GET /visitas-gobernador/admin/list
export const adminListVisits = async (req, res) => {
    try {
        await ensureGovernorVisitSchema();
        const { where, params } = filtros(req.query);
        const perPage = Math.min(100, Math.max(5, Number(req.query.perPage) || 25));
        const page = Math.max(1, Number(req.query.page) || 1);
        const orden = SORTS[req.query.sort] || SORTS.recientes;
        const [{ rows: total }, { rows }, { rows: kpi }, { rows: facets }] = await Promise.all([
            db.query(`SELECT COUNT(*)::int AS n FROM "GovernorVisit" WHERE ${where}`, params),
            db.query(
                `SELECT id, "publicRef", status, "clubProfileId", "clubName", "clubCity", "visitDate", "governorName", venue, title,
                        "responsibleName", "responsibleRole", "contributionSubmissionId", "publishedAt", "reviewedByName", "reviewedAt", "createdAt", "updatedAt",
                        jsonb_array_length(media) AS "mediaCount", jsonb_array_length(links) AS "linkCount",
                        (SELECT COUNT(*) FROM jsonb_array_elements(media) e WHERE e->>'kind' = 'image')::int AS "photoCount",
                        (SELECT COUNT(*) FROM jsonb_array_elements(media) e WHERE e->>'kind' = 'video')::int AS "videoCount"
                   FROM "GovernorVisit" WHERE ${where}
                  ORDER BY ${orden} LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
                params
            ),
            db.query(
                `SELECT COUNT(*)::int AS recibidas,
                        COUNT(*) FILTER (WHERE status = ANY($2))::int AS pendientes,
                        COUNT(*) FILTER (WHERE status = 'aprobada')::int AS aprobadas,
                        COUNT(*) FILTER (WHERE status = 'publicada')::int AS publicadas,
                        COUNT(*) FILTER (WHERE status = 'rechazada')::int AS rechazadas,
                        COUNT(*) FILTER (WHERE status = 'correcciones')::int AS correcciones,
                        COUNT(DISTINCT "clubProfileId") FILTER (WHERE status <> 'rechazada')::int AS "clubesVisitados"
                   FROM "GovernorVisit" WHERE "districtNumber" = $1`,
                [GOVERNOR_VISIT_DISTRICT, VISIT_PENDING_STATES]
            ),
            db.query(
                `SELECT (SELECT COALESCE(json_agg(x ORDER BY x.name), '[]') FROM (SELECT DISTINCT "clubProfileId" AS id, "clubName" AS name FROM "GovernorVisit" WHERE "districtNumber" = $1) x) AS clubs,
                        (SELECT COALESCE(json_agg(g ORDER BY g), '[]') FROM (SELECT DISTINCT "governorName" AS g FROM "GovernorVisit" WHERE "districtNumber" = $1) y) AS governors`,
                [GOVERNOR_VISIT_DISTRICT]
            ),
        ]);
        res.json({
            visits: rows.map(r => ({ ...r, visitDate: visitDateIso(r.visitDate), statusLabel: visitStateLabel(r.status) })),
            total: total[0]?.n || 0, page, perPage,
            kpis: kpi[0] || {},
            facets: { clubs: facets[0]?.clubs || [], governors: facets[0]?.governors || [] },
            states: Object.values(VISIT_STATES),
        });
    } catch (e) { return fail(res, e); }
};

/** Inicio del año rotario (1 de julio) que contiene la fecha. */
const inicioAnioRotario = (d = new Date()) => {
    const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return `${y}-07-01`;
};

// GET /visitas-gobernador/admin/stats — base de los informes de gestión
export const adminVisitStats = async (req, res) => {
    try {
        await ensureGovernorVisitSchema();
        const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? req.query.from : inicioAnioRotario();
        const p = [GOVERNOR_VISIT_DISTRICT, desde];
        const valida = `"districtNumber" = $1 AND status <> 'rechazada' AND "visitDate" >= $2::date`;
        const [porMes, porGobernador, visitados, catalogo] = await Promise.all([
            db.query(`SELECT to_char("visitDate", 'YYYY-MM') AS mes, COUNT(*)::int AS n FROM "GovernorVisit" WHERE ${valida} GROUP BY 1 ORDER BY 1`, p),
            db.query(`SELECT "governorName" AS gobernador, COUNT(*)::int AS visitas, COUNT(DISTINCT "clubProfileId")::int AS clubes FROM "GovernorVisit" WHERE ${valida} GROUP BY 1 ORDER BY 2 DESC`, p),
            db.query(`SELECT DISTINCT "clubProfileId" AS id FROM "GovernorVisit" WHERE ${valida}`, p),
            catalogClubs(),
        ]);
        const vistos = new Set(visitados.rows.map(r => r.id));
        const sinVisita = catalogo.filter(c => !vistos.has(c.id)).map(c => ({ id: c.id, name: c.officialName, city: c.city || '' }));
        res.json({
            desde,
            porMes: porMes.rows,
            porGobernador: porGobernador.rows,
            cobertura: { clubes: catalogo.length, visitados: catalogo.filter(c => vistos.has(c.id)).length, sinVisita },
        });
    } catch (e) { return fail(res, e); }
};

// GET /visitas-gobernador/admin/by-club/:profileId — la ficha del club
export const adminVisitsByClub = async (req, res) => {
    try {
        await ensureGovernorVisitSchema();
        const { rows } = await db.query(
            `SELECT id, "publicRef", status, "visitDate", "governorName", venue, title, "contributionSubmissionId", "publishedAt", "createdAt",
                    jsonb_array_length(media) AS "mediaCount"
               FROM "GovernorVisit" WHERE "clubProfileId" = $1
              ORDER BY "visitDate" DESC, "createdAt" DESC`,
            [String(req.params.profileId)]
        );
        res.json({ visits: rows.map(r => ({ ...r, visitDate: visitDateIso(r.visitDate), statusLabel: visitStateLabel(r.status) })) });
    } catch (e) { return fail(res, e); }
};

async function loadVisit(id) {
    const { rows } = await db.query(`SELECT * FROM "GovernorVisit" WHERE id = $1 OR "publicRef" = $1 LIMIT 1`, [String(id)]);
    return rows[0] || null;
}

// GET /visitas-gobernador/admin/:id
export const adminGetVisit = async (req, res) => {
    try {
        await ensureGovernorVisitSchema();
        const v = await loadVisit(req.params.id);
        if (!v) return res.status(404).json({ error: 'Visita no encontrada.' });
        let publicacion = null;
        if (v.contributionSubmissionId) {
            const { rows } = await db.query(
                `SELECT id, "campaignId", status, title, "createdAt", "updatedAt" FROM "ContributionSubmission" WHERE id = $1`,
                [v.contributionSubmissionId]
            ).catch(() => ({ rows: [] }));
            if (rows[0]) {
                let article = null;
                try {
                    const { articlesFor } = await import('../lib/submissionArticleEngine.js');
                    article = (await articlesFor([rows[0].id]))[rows[0].id] || null;
                } catch { /* el artículo es cortesía */ }
                publicacion = { ...rows[0], article };
            }
        }
        const { correctionToken, ...resto } = v;
        res.json({
            visit: { ...resto, visitDate: visitDateIso(v.visitDate), statusLabel: visitStateLabel(v.status), media: await mediaWithUrls(v), hasCorrectionLink: !!correctionToken },
            next: nextVisitStates(v.status),
            canPublish: canPublishVisit(v.status) && !v.contributionSubmissionId,
            publicacion,
        });
    } catch (e) { return fail(res, e); }
};

const EDITABLE = ['visitDate', 'governorName', 'venue', 'title', 'reason', 'description', 'activities', 'topics', 'recognitions', 'agreements', 'commitments', 'highlights', 'responsibleName', 'responsibleRole', 'responsibleEmail', 'responsiblePhone'];

// PUT /visitas-gobernador/admin/:id — editar (texto, club, galería existente)
export const adminUpdateVisit = async (req, res) => {
    try {
        await ensureGovernorVisitSchema();
        const actual = await loadVisit(req.params.id);
        if (!actual) return res.status(404).json({ error: 'Visita no encontrada.' });
        const body = req.body || {};
        const { actor, actorName } = actorOf(req);
        if (actual.status === 'publicada') {
            // Publicada: el contenido vive en Rotary en Acción y se edita allí.
            // Sólo las notas internas siguen siendo de la visita.
            if (!Object.prototype.hasOwnProperty.call(body, 'adminNotes')) {
                return res.status(409).json({ error: 'La visita ya está publicada: el contenido se edita en Rotary en Acción. Aquí sólo se pueden cambiar las notas internas.' });
            }
            const { rows } = await db.query(
                `UPDATE "GovernorVisit" SET "adminNotes" = $2, history = history || $3::jsonb, "updatedAt" = NOW() WHERE id = $1 RETURNING id`,
                [actual.id, String(body.adminNotes || '').slice(0, 4000), evento({ type: 'notes', actor, actorName, detail: 'Notas internas actualizadas.' })]
            );
            return res.json({ ok: true, id: rows[0].id });
        }

        // Se parte de lo guardado y se aplica sólo lo que llega.
        const fechaActual = visitDateIso(actual.visitDate);
        const base = { ...actual, visitDate: fechaActual, clubProfileId: actual.clubProfileId };
        for (const k of EDITABLE) if (Object.prototype.hasOwnProperty.call(body, k)) base[k] = body[k];
        if (body.clubProfileId) base.clubProfileId = body.clubProfileId;
        if (Array.isArray(body.links)) base.links = body.links;
        const v = shapeVisit({ ...base, media: [] });
        const juicio = validateVisit(v, { admin: true });
        if (!juicio.ok) return res.status(400).json({ error: errorsMessage(juicio.errors), errors: juicio.errors });

        const club = v.clubProfileId === actual.clubProfileId
            ? { id: actual.clubProfileId, officialName: actual.clubName, city: actual.clubCity, state: actual.clubState, slug: actual.clubSlug, clubId: actual.clubPlatformId }
            : await clubById(v.clubProfileId);
        if (!club) return res.status(400).json({ error: 'El club seleccionado no está en el catálogo oficial del Distrito 4281.' });

        // La galería: se pueden quitar elementos y cambiar las descripciones;
        // nunca se agrega una clave que la visita no tenía.
        let media = actual.media || [];
        if (Array.isArray(body.media)) {
            const previos = new Map(media.map(m => [m.key, m]));
            media = body.media.filter(m => previos.has(m?.key)).map(m => ({ ...previos.get(m.key), caption: String(m.caption || '').slice(0, VISIT_CAPTION_MAX) }));
        }

        const cambios = EDITABLE.filter(k => String(v[k] ?? '') !== String((k === 'visitDate' ? fechaActual : actual[k]) ?? ''));
        if (club.id !== actual.clubProfileId) cambios.push('club');
        if (JSON.stringify(media) !== JSON.stringify(actual.media || [])) cambios.push('galería');
        if (JSON.stringify(v.links) !== JSON.stringify(actual.links || [])) cambios.push('enlaces');
        const notas = Object.prototype.hasOwnProperty.call(body, 'adminNotes') ? String(body.adminNotes || '').slice(0, 4000) : actual.adminNotes;
        if (notas !== actual.adminNotes) cambios.push('notas internas');

        const { rows } = await db.query(
            `UPDATE "GovernorVisit" SET
                "clubProfileId" = $2, "clubName" = $3, "clubCity" = $4, "clubState" = $5, "clubSlug" = $6, "clubPlatformId" = $7,
                "visitDate" = $8, "governorName" = $9, venue = $10, title = $11, reason = $12,
                description = $13, activities = $14, topics = $15, recognitions = $16, agreements = $17, commitments = $18, highlights = $19,
                media = $20, links = $21, "responsibleName" = $22, "responsibleRole" = $23, "responsibleEmail" = $24, "responsiblePhone" = $25,
                "adminNotes" = $26, history = history || $27::jsonb, "updatedAt" = NOW()
              WHERE id = $1 AND status = $28 RETURNING id`,
            [
                actual.id, club.id, club.officialName, club.city || null, club.state || null, club.slug || null, club.clubId || null,
                v.visitDate, v.governorName, v.venue, v.title, v.reason,
                v.description, v.activities || null, v.topics || null, v.recognitions || null, v.agreements || null, v.commitments || null, v.highlights || null,
                JSON.stringify(media), JSON.stringify(v.links), v.responsibleName, v.responsibleRole, v.responsibleEmail, v.responsiblePhone,
                notas, evento({ type: 'edited', actor, actorName, detail: cambios.length ? `Editado: ${cambios.join(', ')}.` : 'Guardado sin cambios.' }),
                actual.status,
            ]
        );
        if (!rows[0]) return res.status(409).json({ error: 'La visita cambió mientras la editabas. Recarga.' });
        res.json({ ok: true, id: rows[0].id, cambios });
    } catch (e) { return fail(res, e); }
};

const correctionUrl = (req, token) => {
    const origin = String(req.headers.origin || '').replace(/\/$/, '') || `https://${hostOf(req) || 'rotary4281.org'}`;
    return `${origin}/visitas-del-gobernador?corregir=${encodeURIComponent(token)}`;
};

// POST /visitas-gobernador/admin/:id/status — revisar, aprobar, pedir correcciones, rechazar
export const adminTransitionVisit = async (req, res) => {
    try {
        await ensureGovernorVisitSchema();
        const actual = await loadVisit(req.params.id);
        if (!actual) return res.status(404).json({ error: 'Visita no encontrada.' });
        const to = String(req.body?.to || '');
        const reason = String(req.body?.reason || '').trim().slice(0, 2000);
        if (to === 'publicada') return res.status(400).json({ error: 'Para publicar usa «Publicar en Rotary en Acción»: crea el contenido y deja la visita publicada.' });
        if (!canTransitionVisit(actual.status, to)) {
            return res.status(400).json({ error: `No se puede pasar de «${visitStateLabel(actual.status)}» a «${visitStateLabel(to)}».` });
        }
        if (visitNeedsReason(to) && !reason) {
            return res.status(400).json({ error: `Para dejarla en «${visitStateLabel(to)}» hay que escribir el motivo: es lo que se le comunica al club.` });
        }
        const { actor, actorName } = actorOf(req);
        const token = to === 'correcciones' ? randomBytes(24).toString('base64url') : null;
        const { rows } = await db.query(
            `UPDATE "GovernorVisit" SET status = $3, "statusReason" = $4,
                    "correctionToken" = $5, "correctionTokenExpires" = CASE WHEN $5::text IS NULL THEN NULL ELSE NOW() + ($6 || ' days')::interval END,
                    "reviewedBy" = $7, "reviewedByName" = $8, "reviewedAt" = NOW(),
                    history = history || $9::jsonb, "updatedAt" = NOW()
              WHERE id = $1 AND status = $2 RETURNING *`,
            [actual.id, actual.status, to, reason || null, token, String(CORRECTION_DAYS), actor, actorName,
                evento({ type: 'status', from: actual.status, to, actor, actorName, detail: reason })]
        );
        // Condicional sobre el estado leído: dos pantallas no aplican dos
        // transiciones sobre la misma lectura.
        if (!rows[0]) return res.status(409).json({ error: 'Alguien cambió el estado mientras mirabas. Recarga.' });
        res.json({
            ok: true, status: to, statusLabel: visitStateLabel(to),
            correctionUrl: token ? correctionUrl(req, token) : null,
            correctionDays: token ? CORRECTION_DAYS : null,
        });
    } catch (e) { return fail(res, e); }
};

// POST /visitas-gobernador/admin/:id/publish — convertir en contenido de Rotary en Acción
export const adminPublishVisit = async (req, res) => {
    let lockId = null;
    try {
        await ensureGovernorVisitSchema();
        const actual = await loadVisit(req.params.id);
        if (!actual) return res.status(404).json({ error: 'Visita no encontrada.' });
        // Idempotente: una visita publica UNA sola solicitud.
        if (actual.contributionSubmissionId) {
            return res.json({ ok: true, already: true, submissionId: actual.contributionSubmissionId });
        }
        if (!canPublishVisit(actual.status)) {
            return res.status(400).json({ error: `Sólo se publica una visita aprobada. Esta está «${visitStateLabel(actual.status)}».` });
        }
        const { rows: claim } = await db.query(
            `UPDATE "GovernorVisit" SET "publishLock" = NOW()
              WHERE id = $1 AND status = 'aprobada' AND "contributionSubmissionId" IS NULL
                AND ("publishLock" IS NULL OR "publishLock" < NOW() - interval '5 minutes')
              RETURNING *`,
            [actual.id]
        );
        if (!claim[0]) return res.status(409).json({ error: 'La visita ya se está publicando. Espera unos segundos y recarga.' });
        lockId = actual.id;
        const visit = claim[0];
        const { actor, actorName } = actorOf(req);

        const cid = await universalCampaignId();
        const { rows: camps } = await db.query(`SELECT * FROM "ContributionCampaign" WHERE id = $1`, [cid]);
        const camp = camps[0] || { id: cid, slug: 'rotary-en-accion' };
        const files = visitFilesForSubmission(visit).filter(f => stagingKeyBelongs(f.key, cid));
        const data = visitToSubmissionData(visit);
        const origin = await resolveOrigin({ host: hostOf(req), club: visit.clubName, district: data.district, camp });

        const submission = await createSubmission({
            campaignId: cid, data, files, consentText: visit.consentText || GOVERNOR_VISIT_CONSENT_TEXT, warnings: [], origin,
        });
        // El vínculo se escribe ANTES de cualquier otro paso: si algo falla
        // después, reintentar devuelve esta solicitud en vez de crear otra.
        await db.query(
            `UPDATE "GovernorVisit" SET "contributionSubmissionId" = $2, status = 'publicada', "publishedAt" = NOW(), "publishedBy" = $3,
                    "publishLock" = NULL, history = history || $4::jsonb, "updatedAt" = NOW()
              WHERE id = $1`,
            [visit.id, submission.id, actorName,
                evento({ type: 'published', from: 'aprobada', to: 'publicada', actor, actorName, detail: `Convertida en contenido de Rotary en Acción (solicitud ${String(submission.id).slice(0, 8)}) con ${files.length} archivo(s).` })]
        );
        lockId = null;

        // La visita ya la aprobó la administración: el contenido entra
        // aprobado y sigue el flujo editorial de siempre (Biblioteca,
        // artículo, difusión).
        const avisos = [];
        const tr = await transitionSubmission({
            campaignId: cid, id: submission.id, to: 'aprobado',
            reason: `Visita del Gobernador ${visit.publicRef} aprobada en el panel.`, actor, actorName,
        }).catch((e) => ({ ok: false, detalle: e.message }));
        if (!tr.ok) avisos.push(`La solicitud quedó «Recibida»: ${tr.detalle || tr.reason}. Apruébala desde Solicitudes.`);
        try {
            const { enqueueArticle, autoArticlesEnabled } = await import('../lib/submissionArticleEngine.js');
            if (autoArticlesEnabled()) await enqueueArticle({ submissionId: submission.id, campaignId: cid, clubId: origin.clubId || camp.recipientClubId || null });
        } catch (e) { avisos.push(`El artículo no se encoló: ${e.message}`); }

        res.json({ ok: true, submissionId: submission.id, campaignId: cid, files: files.length, avisos });
    } catch (e) {
        if (lockId) await db.query(`UPDATE "GovernorVisit" SET "publishLock" = NULL WHERE id = $1`, [lockId]).catch(() => {});
        return fail(res, e);
    }
};

// Lo usan las pruebas (`scripts/test-governor-visits.mjs`).
export const __test = { filtros, inicioAnioRotario };
