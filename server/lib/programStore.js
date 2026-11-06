// ════════════════════════════════════════════════════════════════════
// Programas — el almacén — v4.1280.0
//
// Todo acceso a las trece tablas pasa por acá. El controlador decide QUIÉN
// (con `programAccess`) y QUÉ se responde; este archivo decide CÓMO se
// escribe: el historial sólo crece con `history || $x::jsonb`, la publicación
// de una solicitud aplica el cambio y escribe la versión en UNA transacción,
// y lo publicado sigue publicado hasta que se publica su reemplazo.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import db from './db.js';
import ensureProgramSchema from './ensureProgramSchema.js';
import {
    shapeProgram, shapeContent, contentTitleOf, makeRef, requestNeedsMedicalReview, isPubliclyVisible,
    publicContentView, publicProgramView, publicLinkView, publicActivationView, renderableSections, CONTENT_KINDS, SECTIONS,
    defaultSections, isMetricKey, mergeInfoPayload, visibleOnSite,
} from './programSpec.js';
import { parseDistrictTags } from './districtEcosystem.js';
import { shapeLanding, defaultLanding, resolveLanding } from './programLandingSpec.js';

const actorCols = (actor = {}) => ({ id: actor.id || null, name: actor.name || 'Administración', clubId: actor.clubId || null });
const evento = ({ type, from = null, to = null, actor = {}, detail = '' }) => JSON.stringify([{
    at: new Date().toISOString(), type, from, to, actor: actor.id || null, actorName: actor.name || null, detail: String(detail || '').slice(0, 1000),
}]);
const one = (r) => r.rows[0] || null;

// ─── Auditoría ────────────────────────────────────────────────────────

export async function audit({ programId = null, entityType, entityId = null, action, actor = {}, detail = {} }) {
    try {
        await ensureProgramSchema();
        const a = actorCols(actor);
        await db.query(
            `INSERT INTO "ProgramAuditLog" ("programId", "entityType", "entityId", action, "actorId", "actorName", "actorClubId", detail)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
            [programId, entityType, entityId, action, a.id, a.name, a.clubId, JSON.stringify(detail || {})]
        );
    } catch (e) { console.warn('[programas] auditoría no escrita:', e?.message); }
}

export async function auditList(programId, { limit = 100, offset = 0, entityType = '' } = {}) {
    await ensureProgramSchema();
    const { rows } = await db.query(
        `SELECT id, "entityType", "entityId", action, "actorName", "actorClubId", detail, "createdAt"
           FROM "ProgramAuditLog" WHERE "programId" = $1 AND ($2 = '' OR "entityType" = $2)
          ORDER BY "createdAt" DESC LIMIT $3 OFFSET $4`,
        [programId, entityType, limit, offset]
    );
    const total = await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramAuditLog" WHERE "programId" = $1 AND ($2 = '' OR "entityType" = $2)`, [programId, entityType]);
    return { rows, total: total.rows[0].n };
}

// ─── El programa ──────────────────────────────────────────────────────

const PROGRAM_COLS = `id, slug, name, summary, description, category, status, "logoUrl", "heroImageUrl", "heroImageAlt", website, social, partners,
    governance, care, participation, sections, ctas, seo, "requestRouting", "formsEnabled", "newsletterEnabled", "pendingValidation",
    "ownerClubId", "ownerDistrictNumber", version, "publishedAt", "publishedBy", "archivedAt", "createdBy", "updatedBy", "createdAt", "updatedAt", profile, "intakeConfig"`;

const programParams = (p) => [
    p.slug, p.name, p.summary, p.description, p.category, p.logoUrl || null, p.heroImageUrl || null, p.heroImageAlt || null, p.website || null,
    JSON.stringify(p.social), JSON.stringify(p.partners), JSON.stringify(p.governance), JSON.stringify(p.care), JSON.stringify(p.participation),
    JSON.stringify(p.sections), JSON.stringify(p.ctas), JSON.stringify(p.seo), JSON.stringify(p.requestRouting), JSON.stringify(p.formsEnabled),
    p.newsletterEnabled, JSON.stringify(p.pendingValidation),
];

export async function slugTaken(slug, exceptId = null) {
    const { rows } = await db.query(`SELECT 1 FROM "Program" WHERE slug = $1 AND ($2::text IS NULL OR id <> $2) LIMIT 1`, [slug, exceptId]);
    return rows.length > 0;
}

export async function createProgram(p, { actor, ownerClubId = null, ownerDistrictNumber = null }) {
    await ensureProgramSchema();
    const a = actorCols(actor);
    const row = one(await db.query(
        `INSERT INTO "Program" (slug, name, summary, description, category, "logoUrl", "heroImageUrl", "heroImageAlt", website, social, partners,
            governance, care, participation, sections, ctas, seo, "requestRouting", "formsEnabled", "newsletterEnabled", "pendingValidation",
            status, "ownerClubId", "ownerDistrictNumber", "createdBy", "updatedBy")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20,$21::jsonb,
            'borrador', $22, $23, $24, $24)
         RETURNING ${PROGRAM_COLS}`,
        [...programParams(p), ownerClubId, ownerDistrictNumber, a.id]
    ));
    if (p.profile) {
        const r2 = await db.query(`UPDATE "Program" SET profile = $2::jsonb WHERE id = $1 RETURNING ${PROGRAM_COLS}`, [row.id, JSON.stringify(p.profile)]);
        Object.assign(row, r2.rows[0] || {});
    }
    await audit({ programId: row.id, entityType: 'program', entityId: row.id, action: 'created', actor, detail: { name: row.name, slug: row.slug } });
    return row;
}

export async function updateProgram(id, p, { actor, note = '' }) {
    const a = actorCols(actor);
    const row = one(await db.query(
        `UPDATE "Program" SET slug=$1, name=$2, summary=$3, description=$4, category=$5, "logoUrl"=$6, "heroImageUrl"=$7, "heroImageAlt"=$8, website=$9,
            social=$10::jsonb, partners=$11::jsonb, governance=$12::jsonb, care=$13::jsonb, participation=$14::jsonb, sections=$15::jsonb, ctas=$16::jsonb,
            seo=$17::jsonb, "requestRouting"=$18::jsonb, "formsEnabled"=$19::jsonb, "newsletterEnabled"=$20, "pendingValidation"=$21::jsonb,
            version = version + 1, "updatedBy"=$23, "updatedAt"=NOW()
          WHERE id=$22 RETURNING ${PROGRAM_COLS}`,
        [...programParams(p), id, a.id]
    ));
    // v4.1286 — El perfil institucional va en su columna; sólo se escribe si viene.
    if (row && p.profile) {
        const r2 = await db.query(`UPDATE "Program" SET profile = $2::jsonb WHERE id = $1 RETURNING ${PROGRAM_COLS}`, [id, JSON.stringify(p.profile)]);
        Object.assign(row, r2.rows[0] || {});
    }
    if (row) await audit({ programId: id, entityType: 'program', entityId: id, action: 'updated', actor, detail: { version: row.version, note } });
    return row;
}

/** v4.1286 — Cómo se adapta el formulario institucional a ESTE programa. */
export async function setIntakeConfig(id, config, { actor }) {
    const a = actorCols(actor);
    const row = one(await db.query(`UPDATE "Program" SET "intakeConfig" = $2::jsonb, "updatedBy" = $3, "updatedAt" = NOW() WHERE id = $1 RETURNING ${PROGRAM_COLS}`, [id, JSON.stringify(config), a.id]));
    if (row) await audit({ programId: id, entityType: 'program', entityId: id, action: 'intake_config', actor, detail: { enabled: config.enabled, vocabulary: config.vocabulary } });
    return row;
}

export async function setProgramStatus(id, status, { actor, reason = '' }) {
    const a = actorCols(actor);
    const row = one(await db.query(
        `UPDATE "Program" SET status=$2,
            "publishedAt" = CASE WHEN $2 = 'activo' THEN COALESCE("publishedAt", NOW()) ELSE "publishedAt" END,
            "publishedBy" = CASE WHEN $2 = 'activo' THEN $3 ELSE "publishedBy" END,
            "archivedAt" = CASE WHEN $2 = 'archivado' THEN NOW() ELSE NULL END,
            "updatedBy"=$3, "updatedAt"=NOW()
          WHERE id=$1 RETURNING ${PROGRAM_COLS}`,
        [id, status, a.id]
    ));
    await audit({ programId: id, entityType: 'program', entityId: id, action: `status:${status}`, actor, detail: { reason } });
    return row;
}

export async function getProgram(idOrSlug) {
    await ensureProgramSchema();
    return one(await db.query(`SELECT ${PROGRAM_COLS} FROM "Program" WHERE id = $1 OR slug = $1 LIMIT 1`, [String(idOrSlug || '')]));
}

/**
 * Listado administrativo. `visibility` acota a lo que la sesión alcanza:
 *   { all: true }                              operador
 *   { districtNumbers: [...], siteId }         sitio del distrito
 *   { clubSiteId, districtNumbers }            sitio de un club (disponibles + activados)
 *   { userId, email }                          responsables por programa
 */
export async function listPrograms({ q = '', status = '', category = '', district = 0, page = 1, perPage = 20, visibility = {} } = {}) {
    await ensureProgramSchema();
    const where = [`TRUE`];
    const params = [];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (q) add(`(p.name ILIKE '%' || ? || '%' OR p.summary ILIKE '%' || $${params.length + 1} || '%')`, q);
    if (status) add(`p.status = ?`, status);
    if (category) add(`p.category = ?`, category);
    if (district) add(`EXISTS (SELECT 1 FROM "ProgramDistrictLink" l WHERE l."programId" = p.id AND l."districtNumber" = ?)`, Number(district));
    if (!visibility.all) {
        const parts = [];
        if (visibility.siteId) { params.push(visibility.siteId); parts.push(`p."ownerClubId" = $${params.length}`); }
        if (visibility.districtNumbers?.length && visibility.siteIsDistrict) {
            params.push(visibility.districtNumbers.map(Number));
            parts.push(`EXISTS (SELECT 1 FROM "ProgramDistrictLink" l WHERE l."programId" = p.id AND l."districtNumber" = ANY($${params.length}::int[]))`);
        }
        if (visibility.clubSiteId) {
            params.push(visibility.clubSiteId);
            parts.push(`EXISTS (SELECT 1 FROM "ProgramClubActivation" a WHERE a."programId" = p.id AND a."clubId" = $${params.length})`);
            if (visibility.districtNumbers?.length) {
                params.push(visibility.districtNumbers.map(Number));
                parts.push(`(p.status = 'activo' AND EXISTS (SELECT 1 FROM "ProgramDistrictLink" l WHERE l."programId" = p.id AND l.status = 'activa' AND l."allowClubActivation" AND l."districtNumber" = ANY($${params.length}::int[])))`);
            }
        }
        if (visibility.userId || visibility.email) {
            params.push(visibility.userId || ''); params.push(visibility.email || '');
            parts.push(`EXISTS (SELECT 1 FROM "ProgramMember" m WHERE m."programId" = p.id AND m.active AND (($${params.length - 1} <> '' AND m."userId" = $${params.length - 1}) OR ($${params.length} <> '' AND m.email = $${params.length})))`);
        }
        where.push(parts.length ? `(${parts.join(' OR ')})` : 'FALSE');
    }
    const whereSql = where.join(' AND ');
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM "Program" p WHERE ${whereSql}`, params)).rows[0].n;
    params.push(perPage); params.push((page - 1) * perPage);
    const { rows } = await db.query(
        `SELECT p.id, p.slug, p.name, p.summary, p.category, p.status, p."logoUrl", p."heroImageUrl", p."ownerClubId", p."ownerDistrictNumber", p."publishedAt", p."updatedAt",
                (SELECT COALESCE(json_agg(json_build_object('districtNumber', l."districtNumber", 'status', l.status, 'relationType', l."relationType") ORDER BY l."districtNumber"), '[]'::json)
                   FROM "ProgramDistrictLink" l WHERE l."programId" = p.id) AS links,
                (SELECT COUNT(*)::int FROM "ProgramClubActivation" a WHERE a."programId" = p.id AND a.status = 'activa') AS "activeClubs",
                (SELECT COUNT(*)::int FROM "ProgramChangeRequest" r WHERE r."programId" = p.id AND r.status IN ('enviado','en_revision')) AS "pendingChanges",
                (SELECT COUNT(*)::int FROM "ProgramRequest" r WHERE r."programId" = p.id AND r.status = 'nueva') AS "newRequests",
                (SELECT COUNT(*)::int FROM "ProgramContent" c WHERE c."programId" = p.id AND c.status = 'publicado' AND c.kind = 'clinic') AS clinics
           FROM "Program" p WHERE ${whereSql}
          ORDER BY p."updatedAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );
    return { rows, total, page, perPage };
}

// ─── Vinculaciones ────────────────────────────────────────────────────

const LINK_COLS = `id, "programId", "districtNumber", "districtClubId", "relationType", "relationDescription", status, presentation, contact, disclaimer,
    "showInMenu", "showInCatalog", "allowClubActivation", "createdBy", "updatedBy", "createdAt", "updatedAt"`;

export async function listLinks(programId) {
    const { rows } = await db.query(
        `SELECT ${LINK_COLS}, (SELECT COUNT(*)::int FROM "ProgramClubActivation" a WHERE a."districtLinkId" = l.id AND a.status = 'activa') AS "activeClubs"
           FROM "ProgramDistrictLink" l WHERE "programId" = $1 ORDER BY "districtNumber"`, [programId]
    );
    return rows;
}

/** El sitio del distrito en la plataforma (Club de tipo distrito con ese número), si existe. */
export async function districtSiteIdFor(districtNumber) {
    const { rows } = await db.query(
        `SELECT c.id FROM "Club" c LEFT JOIN "District" d ON d.id = c."districtId"
          WHERE lower(coalesce(c.type,'')) IN ('district','distrito rotario')
            AND (d.number = $1 OR EXISTS (SELECT 1 FROM regexp_split_to_table(coalesce(c.district,''),'[^0-9]+') tok WHERE tok = $2))
          ORDER BY (d.number = $1) DESC NULLS LAST LIMIT 1`,
        [Number(districtNumber), String(districtNumber)]
    ).catch(() => ({ rows: [] }));
    return rows[0]?.id || null;
}

export async function upsertLink(programId, l, { actor }) {
    const a = actorCols(actor);
    const districtClubId = await districtSiteIdFor(l.districtNumber);
    const row = one(await db.query(
        `INSERT INTO "ProgramDistrictLink" ("programId", "districtNumber", "districtClubId", "relationType", "relationDescription", status, presentation, contact, disclaimer,
            "showInMenu", "showInCatalog", "allowClubActivation", "createdBy", "updatedBy")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$13)
         ON CONFLICT ("programId", "districtNumber") DO UPDATE SET "districtClubId" = COALESCE(EXCLUDED."districtClubId", "ProgramDistrictLink"."districtClubId"),
            "relationType"=EXCLUDED."relationType", "relationDescription"=EXCLUDED."relationDescription", status=EXCLUDED.status, presentation=EXCLUDED.presentation,
            contact=EXCLUDED.contact, disclaimer=EXCLUDED.disclaimer, "showInMenu"=EXCLUDED."showInMenu", "showInCatalog"=EXCLUDED."showInCatalog",
            "allowClubActivation"=EXCLUDED."allowClubActivation", "updatedBy"=EXCLUDED."updatedBy", "updatedAt"=NOW()
         RETURNING ${LINK_COLS}`,
        [programId, l.districtNumber, districtClubId, l.relationType, l.relationDescription, l.status, l.presentation, JSON.stringify(l.contact), l.disclaimer,
            l.showInMenu, l.showInCatalog, l.allowClubActivation, a.id]
    ));
    await audit({ programId, entityType: 'link', entityId: row.id, action: 'upserted', actor, detail: { districtNumber: l.districtNumber, relationType: l.relationType, status: l.status } });
    return row;
}

// ─── Activaciones ─────────────────────────────────────────────────────

const ACT_COLS = `id, "programId", "districtLinkId", "districtNumber", "clubId", "clubProfileId", "clubName", status, "localContact", "localNote", "showInMenu",
    "activatedBy", "activatedAt", "deactivatedAt", "deactivatedBy", "createdAt", "updatedAt"`;

export async function listActivations(programId, { clubId = null } = {}) {
    const { rows } = await db.query(
        `SELECT ${ACT_COLS}, (SELECT COUNT(*)::int FROM "ProgramContent" c WHERE c."clubActivationId" = a.id AND c.status = 'publicado') AS "localItems",
                (SELECT COUNT(*)::int FROM "ProgramRequest" r WHERE r."originActivationId" = a.id) AS "originRequests"
           FROM "ProgramClubActivation" a WHERE "programId" = $1 AND ($2::text IS NULL OR "clubId" = $2) ORDER BY "clubName"`,
        [programId, clubId]
    );
    return rows;
}

export async function activateClub({ programId, link, clubId, clubName, clubProfileId = null, data, actor }) {
    const a = actorCols(actor);
    const row = one(await db.query(
        `INSERT INTO "ProgramClubActivation" ("programId", "districtLinkId", "districtNumber", "clubId", "clubProfileId", "clubName", status, "localContact", "localNote", "showInMenu", "activatedBy", "activatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,'activa',$7::jsonb,$8,$9,$10,NOW())
         ON CONFLICT ("programId", "clubId") DO UPDATE SET status='activa', "districtLinkId"=EXCLUDED."districtLinkId", "districtNumber"=EXCLUDED."districtNumber",
            "clubName"=EXCLUDED."clubName", "clubProfileId"=COALESCE(EXCLUDED."clubProfileId", "ProgramClubActivation"."clubProfileId"),
            "localContact"=EXCLUDED."localContact", "localNote"=EXCLUDED."localNote", "showInMenu"=EXCLUDED."showInMenu",
            "activatedBy"=EXCLUDED."activatedBy", "activatedAt"=NOW(), "deactivatedAt"=NULL, "deactivatedBy"=NULL, "updatedAt"=NOW()
         RETURNING ${ACT_COLS}`,
        [programId, link.id, link.districtNumber, clubId, clubProfileId, clubName, JSON.stringify(data.localContact), data.localNote, data.showInMenu, a.id]
    ));
    await audit({ programId, entityType: 'activation', entityId: row.id, action: 'activated', actor, detail: { clubId, clubName } });
    return row;
}

export async function updateActivation(id, data, { actor }) {
    const row = one(await db.query(
        `UPDATE "ProgramClubActivation" SET "localContact"=$2::jsonb, "localNote"=$3, "showInMenu"=$4, "updatedAt"=NOW() WHERE id=$1 RETURNING ${ACT_COLS}`,
        [id, JSON.stringify(data.localContact), data.localNote, data.showInMenu]
    ));
    if (row) await audit({ programId: row.programId, entityType: 'activation', entityId: id, action: 'updated', actor, detail: { clubName: row.clubName } });
    return row;
}

export async function deactivateClub(id, { actor, reason = '' }) {
    const a = actorCols(actor);
    const row = one(await db.query(
        `UPDATE "ProgramClubActivation" SET status='inactiva', "deactivatedAt"=NOW(), "deactivatedBy"=$2, "updatedAt"=NOW() WHERE id=$1 RETURNING ${ACT_COLS}`,
        [id, a.id]
    ));
    if (row) await audit({ programId: row.programId, entityType: 'activation', entityId: id, action: 'deactivated', actor, detail: { clubName: row.clubName, reason } });
    return row;
}

export async function getActivation(id) {
    return one(await db.query(`SELECT ${ACT_COLS} FROM "ProgramClubActivation" WHERE id = $1`, [id]));
}

// ─── Responsables ─────────────────────────────────────────────────────

export async function listMembers(programId) {
    const { rows } = await db.query(
        `SELECT id, "userId", email, name, roles, "scopeType", "districtNumber", "clubId", active, "createdAt" FROM "ProgramMember" WHERE "programId" = $1 ORDER BY name, email`, [programId]
    );
    return rows;
}

export async function upsertMember(programId, m, { actor }) {
    const a = actorCols(actor);
    // Si el correo corresponde a un usuario de la plataforma, se vincula por id.
    const u = one(await db.query(`SELECT id, name FROM "User" WHERE lower(email) = $1 LIMIT 1`, [m.email]).catch(() => ({ rows: [] })));
    const row = one(await db.query(
        `INSERT INTO "ProgramMember" ("programId", "userId", email, name, roles, "scopeType", "districtNumber", "clubId", active, "createdBy")
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,TRUE,$9)
         ON CONFLICT ("programId", email, "scopeType", COALESCE("districtNumber", 0), COALESCE("clubId", '')) DO UPDATE SET
            "userId"=COALESCE(EXCLUDED."userId", "ProgramMember"."userId"), name=EXCLUDED.name, roles=EXCLUDED.roles, active=TRUE, "updatedAt"=NOW()
         RETURNING id, "userId", email, name, roles, "scopeType", "districtNumber", "clubId", active`,
        [programId, u?.id || null, m.email, m.name || u?.name || '', JSON.stringify(m.roles), m.scopeType, m.districtNumber || null, m.clubId || null, a.id]
    ));
    await audit({ programId, entityType: 'member', entityId: row.id, action: 'upserted', actor, detail: { email: m.email, roles: m.roles, scopeType: m.scopeType } });
    return row;
}

export async function removeMember(programId, id, { actor }) {
    const row = one(await db.query(`UPDATE "ProgramMember" SET active = FALSE, "updatedAt" = NOW() WHERE id = $1 AND "programId" = $2 RETURNING id, email`, [id, programId]));
    if (row) await audit({ programId, entityType: 'member', entityId: id, action: 'removed', actor, detail: { email: row.email } });
    return row;
}

// ─── Contenido vivo y versiones ───────────────────────────────────────

const CONTENT_COLS = `id, "programId", kind, "scopeType", "districtNumber", "clubActivationId", "clubId", "clubName", status, title, data, version, "sortOrder",
    "requiresMedicalReview", "medicalReviewedBy", "medicalReviewedAt", "publishedAt", "publishedBy", "archivedAt", "lastRequestId", "createdAt", "updatedAt"`;

export async function listContent(programId, { kind = '', status = 'publicado', scopeType = '', clubActivationId = null, q = '', page = 1, perPage = 50 } = {}) {
    const params = [programId, kind, status, scopeType, clubActivationId, q];
    const where = `"programId" = $1 AND ($2 = '' OR kind = $2) AND ($3 = '' OR status = $3) AND ($4 = '' OR "scopeType" = $4)
        AND ($5::text IS NULL OR "clubActivationId" = $5) AND ($6 = '' OR title ILIKE '%' || $6 || '%' OR data::text ILIKE '%' || $6 || '%')`;
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramContent" WHERE ${where}`, params)).rows[0].n;
    const { rows } = await db.query(
        `SELECT ${CONTENT_COLS} FROM "ProgramContent" WHERE ${where} ORDER BY kind, "sortOrder", "publishedAt" DESC LIMIT $7 OFFSET $8`,
        [...params, perPage, (page - 1) * perPage]
    );
    return { rows, total, page, perPage };
}

export async function getContent(id) {
    return one(await db.query(`SELECT ${CONTENT_COLS} FROM "ProgramContent" WHERE id = $1`, [id]));
}

export async function contentVersions(contentId) {
    const { rows } = await db.query(`SELECT id, version, data, "requestId", "createdByName", note, "createdAt" FROM "ProgramContentVersion" WHERE "contentId" = $1 ORDER BY version DESC`, [contentId]);
    return rows;
}

// ─── Solicitudes de cambio ────────────────────────────────────────────

const REQ_COLS = `id, "publicRef", "programId", kind, operation, "contentId", "scopeType", "districtNumber", "clubActivationId", "clubId", "targetSection", title, body, payload,
    attachments, links, "responsibleName", "responsibleEmail", "responsiblePhone", "requestedReach", "suggestedDate", observations, authorizations, status, "statusReason",
    "requiresMedicalReview", "medicalReviewedBy", "medicalReviewedByName", "medicalReviewedAt", "approvedPayload", "approvedBy", "approvedAt", "submittedBy", "submittedByName",
    "submittedAt", "reviewedBy", "reviewedAt", "publishedAt", "publishedBy", "resultContentId", "resultVersion", "ownerUserId", "ownerClubId", history, "createdAt", "updatedAt", "intakeId", "intakeItemKey"`;

export async function createChangeRequest(programId, r, { actor, status = 'borrador', origin = null }) {
    const a = actorCols(actor);
    let clubId = null;
    if (r.clubActivationId) clubId = (await getActivation(r.clubActivationId))?.clubId || null;
    const needsMedical = requestNeedsMedicalReview(r);
    let ref = makeRef('PC');
    for (let i = 0; i < 5; i++) {
        const dup = await db.query(`SELECT 1 FROM "ProgramChangeRequest" WHERE "publicRef" = $1`, [ref]);
        if (!dup.rows.length) break;
        ref = makeRef('PC');
    }
    const row = one(await db.query(
        `INSERT INTO "ProgramChangeRequest" ("publicRef", "programId", kind, operation, "contentId", "scopeType", "districtNumber", "clubActivationId", "clubId", "targetSection", title, body, payload,
            attachments, links, "responsibleName", "responsibleEmail", "responsiblePhone", "requestedReach", "suggestedDate", observations, authorizations, status, "requiresMedicalReview",
            "submittedBy", "submittedByName", "submittedAt", "ownerUserId", "ownerClubId", history, "intakeId", "intakeItemKey")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,
            CASE WHEN $23 = 'enviado' THEN $25 ELSE NULL END, CASE WHEN $23 = 'enviado' THEN $26 ELSE NULL END, CASE WHEN $23 = 'enviado' THEN NOW() ELSE NULL END, $25, $27, $28::jsonb, $29, $30)
         RETURNING ${REQ_COLS}`,
        [ref, programId, r.kind, r.operation, r.contentId, r.scopeType, r.districtNumber || null, r.clubActivationId, clubId, r.targetSection || null, r.title, r.body,
            JSON.stringify(r.payload), JSON.stringify(r.attachments), JSON.stringify(r.links), r.responsibleName, r.responsibleEmail, r.responsiblePhone || null, r.requestedReach || null,
            r.suggestedDate || null, r.observations || null, JSON.stringify(r.authorizations), status, needsMedical, a.id, a.name, a.clubId,
            evento({ type: status === 'enviado' ? 'submitted' : 'draft', to: status, actor, detail: [needsMedical ? 'Requiere revisión médica' : '', origin ? `Origen: formulario institucional ${origin.intakeRef || ''}` : ''].filter(Boolean).join(' · ') }),
            origin?.intakeId || null, origin?.itemKey || null]
    ));
    await audit({ programId, entityType: 'change_request', entityId: row.id, action: status === 'enviado' ? 'submitted' : 'draft_created', actor, detail: { ref, kind: r.kind, operation: r.operation, scopeType: r.scopeType, intakeRef: origin?.intakeRef || null, itemKey: origin?.itemKey || null } });
    return row;
}

/** Edita una solicitud (borrador o en ajustes; o un revisor sobre una enviada).
 *  Si estaba aprobada y el payload cambia, la aprobación se invalida. */
export async function updateChangeRequest(id, r, { actor, resubmit = false, invalidateApproval = false }) {
    const needsMedical = requestNeedsMedicalReview(r);
    const prev = await getChangeRequest(id);
    if (!prev) return null;
    const nextStatus = resubmit ? 'enviado' : (invalidateApproval ? 'en_revision' : prev.status);
    const detail = invalidateApproval ? 'El contenido cambió tras la aprobación: vuelve a revisión.' : (resubmit ? 'Reenviada tras corregir' : 'Editada');
    const row = one(await db.query(
        `UPDATE "ProgramChangeRequest" SET kind=$2, operation=$3, "contentId"=$4, "scopeType"=$5, "districtNumber"=$6, "clubActivationId"=$7, "targetSection"=$8, title=$9, body=$10,
            payload=$11::jsonb, attachments=$12::jsonb, links=$13::jsonb, "responsibleName"=$14, "responsibleEmail"=$15, "responsiblePhone"=$16, "requestedReach"=$17, "suggestedDate"=$18,
            observations=$19, authorizations=$20::jsonb, "requiresMedicalReview"=$21, status=$22,
            "approvedPayload" = CASE WHEN $23 THEN NULL ELSE "approvedPayload" END, "approvedBy" = CASE WHEN $23 THEN NULL ELSE "approvedBy" END, "approvedAt" = CASE WHEN $23 THEN NULL ELSE "approvedAt" END,
            "medicalReviewedAt" = CASE WHEN $23 THEN NULL ELSE "medicalReviewedAt" END, "medicalReviewedBy" = CASE WHEN $23 THEN NULL ELSE "medicalReviewedBy" END,
            "submittedAt" = CASE WHEN $22 = 'enviado' AND "submittedAt" IS NULL THEN NOW() ELSE "submittedAt" END,
            history = history || $24::jsonb, "updatedAt"=NOW()
          WHERE id=$1 RETURNING ${REQ_COLS}`,
        [id, r.kind, r.operation, r.contentId, r.scopeType, r.districtNumber || null, r.clubActivationId, r.targetSection || null, r.title, r.body, JSON.stringify(r.payload),
            JSON.stringify(r.attachments), JSON.stringify(r.links), r.responsibleName, r.responsibleEmail, r.responsiblePhone || null, r.requestedReach || null, r.suggestedDate || null,
            r.observations || null, JSON.stringify(r.authorizations), needsMedical, nextStatus, invalidateApproval,
            evento({ type: resubmit ? 'resubmitted' : 'edited', from: prev.status, to: nextStatus, actor, detail })]
    ));
    await audit({ programId: row.programId, entityType: 'change_request', entityId: id, action: resubmit ? 'resubmitted' : 'edited', actor, detail: { ref: row.publicRef, invalidatedApproval: invalidateApproval } });
    return row;
}

export async function getChangeRequest(id) {
    return one(await db.query(`SELECT ${REQ_COLS} FROM "ProgramChangeRequest" WHERE id = $1 OR "publicRef" = $1 LIMIT 1`, [String(id || '')]));
}

export async function listChangeRequests(programId, { status = '', kind = '', scopeType = '', ownerUserId = null, ownerClubId = null, clubActivationId = null, q = '', page = 1, perPage = 25 } = {}) {
    const params = [programId, status, kind, scopeType, ownerUserId, ownerClubId, clubActivationId, q];
    const where = `"programId" = $1 AND ($2 = '' OR status = $2) AND ($3 = '' OR kind = $3) AND ($4 = '' OR "scopeType" = $4)
        AND ($5::text IS NULL OR "ownerUserId" = $5) AND ($6::text IS NULL OR "ownerClubId" = $6) AND ($7::text IS NULL OR "clubActivationId" = $7)
        AND ($8 = '' OR title ILIKE '%' || $8 || '%' OR "publicRef" ILIKE '%' || $8 || '%')`;
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramChangeRequest" WHERE ${where}`, params)).rows[0].n;
    const { rows } = await db.query(
        `SELECT id, "publicRef", kind, operation, "contentId", "scopeType", "districtNumber", "clubActivationId", "clubId", title, status, "requiresMedicalReview", "medicalReviewedAt",
                "responsibleName", "submittedByName", "submittedAt", "approvedAt", "publishedAt", "ownerUserId", "ownerClubId", "updatedAt", "createdAt"
           FROM "ProgramChangeRequest" WHERE ${where} ORDER BY "updatedAt" DESC LIMIT $9 OFFSET $10`,
        [...params, perPage, (page - 1) * perPage]
    );
    const facets = (await db.query(`SELECT status, COUNT(*)::int AS n FROM "ProgramChangeRequest" WHERE "programId" = $1 GROUP BY status`, [programId])).rows;
    return { rows, total, page, perPage, facets };
}

export async function transitionChangeRequest(id, to, { actor, reason = '' }) {
    const prev = await getChangeRequest(id);
    if (!prev) return null;
    const a = actorCols(actor);
    const row = one(await db.query(
        `UPDATE "ProgramChangeRequest" SET status=$2, "statusReason"=$3,
            "reviewedBy" = CASE WHEN $2 IN ('en_revision','ajustes','aprobado','archivado') THEN $4 ELSE "reviewedBy" END,
            "reviewedAt" = CASE WHEN $2 IN ('en_revision','ajustes','aprobado','archivado') THEN NOW() ELSE "reviewedAt" END,
            "approvedPayload" = CASE WHEN $2 = 'aprobado' THEN payload WHEN $2 IN ('ajustes','archivado','en_revision','enviado','borrador') THEN NULL ELSE "approvedPayload" END,
            "approvedBy" = CASE WHEN $2 = 'aprobado' THEN $4 WHEN $2 IN ('ajustes','archivado','en_revision','enviado','borrador') THEN NULL ELSE "approvedBy" END,
            "approvedAt" = CASE WHEN $2 = 'aprobado' THEN NOW() WHEN $2 IN ('ajustes','archivado','en_revision','enviado','borrador') THEN NULL ELSE "approvedAt" END,
            "submittedAt" = CASE WHEN $2 = 'enviado' THEN NOW() ELSE "submittedAt" END,
            history = history || $5::jsonb, "updatedAt"=NOW()
          WHERE id=$1 RETURNING ${REQ_COLS}`,
        [id, to, reason || null, a.id, evento({ type: 'transition', from: prev.status, to, actor, detail: reason })]
    ));
    await audit({ programId: row.programId, entityType: 'change_request', entityId: id, action: `status:${to}`, actor, detail: { ref: row.publicRef, from: prev.status, reason } });
    return row;
}

export async function medicalApproveRequest(id, { actor, approved = true, note = '' }) {
    const a = actorCols(actor);
    const row = one(await db.query(
        `UPDATE "ProgramChangeRequest" SET "medicalReviewedBy" = CASE WHEN $2 THEN $3 ELSE NULL END, "medicalReviewedByName" = CASE WHEN $2 THEN $4 ELSE NULL END,
            "medicalReviewedAt" = CASE WHEN $2 THEN NOW() ELSE NULL END, history = history || $5::jsonb, "updatedAt"=NOW()
          WHERE id=$1 RETURNING ${REQ_COLS}`,
        [id, approved, a.id, a.name, evento({ type: approved ? 'medical_approved' : 'medical_withdrawn', actor, detail: note })]
    ));
    if (row) await audit({ programId: row.programId, entityType: 'change_request', entityId: id, action: approved ? 'medical_approved' : 'medical_withdrawn', actor, detail: { ref: row.publicRef, note } });
    return row;
}

/**
 * PUBLICAR una solicitud aprobada: aplica el cambio al contenido vivo y
 * escribe la versión, en UNA transacción. Hasta este momento, lo publicado
 * seguía siendo la versión anterior. Devuelve la solicitud actualizada.
 */
export async function publishChangeRequest(id, { actor, program }) {
    const req = await getChangeRequest(id);
    if (!req || req.status !== 'aprobado') return { ok: false, error: 'Sólo se publica una solicitud aprobada.' };
    if (req.requiresMedicalReview && !req.medicalReviewedAt) return { ok: false, error: 'Falta la aprobación del revisor médico.' };
    const a = actorCols(actor);
    const payload = req.approvedPayload || req.payload;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        let resultContentId = req.contentId || null;
        let resultVersion = null;
        let programPatch = null;

        if (CONTENT_KINDS[req.kind]) {
            if (req.operation === 'retirar') {
                if (!req.contentId) throw new Error('La solicitud de retiro no indica el registro.');
                const r = await client.query(
                    `UPDATE "ProgramContent" SET status='archivado', "archivedAt"=NOW(), "archivedBy"=$2, "lastRequestId"=$3, "updatedAt"=NOW() WHERE id=$1 AND "programId"=$4 RETURNING version`,
                    [req.contentId, a.id, req.id, req.programId]
                );
                if (!r.rows[0]) throw new Error('El registro a retirar no existe.');
                resultVersion = r.rows[0].version;
            } else {
                const data = shapeContent(req.kind, payload);
                const title = contentTitleOf(req.kind, data);
                const clinical = requestNeedsMedicalReview({ kind: req.kind, payload });
                if (req.operation === 'actualizar' && req.contentId) {
                    const r = await client.query(
                        `UPDATE "ProgramContent" SET data=$2::jsonb, title=$3, version = version + 1, "requiresMedicalReview"=$4,
                            "medicalReviewedBy" = CASE WHEN $4 THEN $5 ELSE "medicalReviewedBy" END, "medicalReviewedAt" = CASE WHEN $4 THEN $6 ELSE "medicalReviewedAt" END,
                            "publishedAt"=NOW(), "publishedBy"=$7, "lastRequestId"=$8, status='publicado', "archivedAt"=NULL, "updatedAt"=NOW()
                          WHERE id=$1 AND "programId"=$9 RETURNING id, version`,
                        [req.contentId, JSON.stringify(data), title, clinical, req.medicalReviewedBy, req.medicalReviewedAt, a.id, req.id, req.programId]
                    );
                    if (!r.rows[0]) throw new Error('El registro a actualizar no existe.');
                    resultContentId = r.rows[0].id; resultVersion = r.rows[0].version;
                } else {
                    let clubName = null;
                    if (req.clubActivationId) clubName = (await client.query(`SELECT "clubName" FROM "ProgramClubActivation" WHERE id = $1`, [req.clubActivationId])).rows[0]?.clubName || null;
                    const r = await client.query(
                        `INSERT INTO "ProgramContent" ("programId", kind, "scopeType", "districtNumber", "clubActivationId", "clubId", "clubName", status, title, data, version, "sortOrder",
                            "requiresMedicalReview", "medicalReviewedBy", "medicalReviewedAt", "publishedAt", "publishedBy", "lastRequestId")
                         VALUES ($1,$2,$3,$4,$5,$6,$7,'publicado',$8,$9::jsonb,1,$10,$11,$12,$13,NOW(),$14,$15) RETURNING id, version`,
                        [req.programId, req.kind, req.scopeType, req.districtNumber || null, req.clubActivationId, req.clubId, clubName, title, JSON.stringify(data),
                            Number(data.sortOrder) || 0, clinical, clinical ? req.medicalReviewedBy : null, clinical ? req.medicalReviewedAt : null, a.id, req.id]
                    );
                    resultContentId = r.rows[0].id; resultVersion = r.rows[0].version;
                }
                await client.query(
                    `INSERT INTO "ProgramContentVersion" ("contentId", "programId", version, data, "requestId", "createdBy", "createdByName", note)
                     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8) ON CONFLICT ("contentId", version) DO NOTHING`,
                    [resultContentId, req.programId, resultVersion, JSON.stringify(data), req.id, a.id, a.name, req.title]
                );
            }
        } else if (req.kind === 'info') {
            // Se aplica SOBRE lo vigente: sólo los bloques que la solicitud trae.
            const cur = (await client.query(`SELECT ${PROGRAM_COLS} FROM "Program" WHERE id = $1 FOR UPDATE`, [req.programId])).rows[0];
            if (!cur) throw new Error('El programa no existe.');
            // v4.1286 — `mergeInfoPayload`: sólo cambia lo que la solicitud trae;
            // listas por id, personas y perfil campo a campo. Un campo omitido
            // NO es una orden de borrado. La dirección (slug) se respeta: un
            // cambio de nombre no la mueve (la cambia la ficha, a propósito).
            const identity = payload.identity || {};
            const merged = shapeProgram({ ...mergeInfoPayload(cur, payload), slug: identity.slug || cur.slug });
            // Un texto de costos NUEVO no hereda la aprobación del anterior: la
            // aprobación es la de ESTA solicitud (revisada y aprobada en el flujo).
            const careIn = payload.care || {};
            if (careIn.costsText !== undefined && String(careIn.costsText || '') !== String((cur.care || {}).costsText || '')) {
                merged.care.costsApproved = Boolean(req.approvedAt);
                merged.care.costsApprovedBy = req.approvedAt ? a.name : '';
                merged.care.costsApprovedAt = req.approvedAt ? new Date(req.approvedAt).toISOString().slice(0, 10) : '';
            }
            if (merged.slug !== cur.slug) {
                const dup = await client.query(`SELECT 1 FROM "Program" WHERE slug = $1 AND id <> $2`, [merged.slug, cur.id]);
                if (dup.rows.length) throw new Error('La dirección (slug) propuesta ya la usa otro programa.');
            }
            if (req.requiresMedicalReview && req.medicalReviewedAt) {
                merged.care.medicalApprovedAt = new Date(req.medicalReviewedAt).toISOString().slice(0, 10);
                merged.care.medicalApprovedBy = req.medicalReviewedByName || merged.care.medicalApprovedBy;
            }
            await client.query(
                `UPDATE "Program" SET slug=$1, name=$2, summary=$3, description=$4, category=$5, "logoUrl"=$6, "heroImageUrl"=$7, "heroImageAlt"=$8, website=$9,
                    social=$10::jsonb, partners=$11::jsonb, governance=$12::jsonb, care=$13::jsonb, participation=$14::jsonb, sections=$15::jsonb, ctas=$16::jsonb,
                    seo=$17::jsonb, "requestRouting"=$18::jsonb, "formsEnabled"=$19::jsonb, "newsletterEnabled"=$20, "pendingValidation"=$21::jsonb,
                    version = version + 1, "updatedBy"=$23, "updatedAt"=NOW() WHERE id=$22`,
                [...programParams(merged), cur.id, a.id]
            );
            await client.query(`UPDATE "Program" SET profile = $2::jsonb WHERE id = $1`, [cur.id, JSON.stringify(merged.profile)]);
            programPatch = { version: cur.version + 1 };
        }
        // Una corrección no aplica nada sola: quien publica ya hizo el cambio en el registro indicado.
        const r = await client.query(
            `UPDATE "ProgramChangeRequest" SET status='publicado', "publishedAt"=NOW(), "publishedBy"=$2, "resultContentId"=$3, "resultVersion"=$4,
                history = history || $5::jsonb, "updatedAt"=NOW() WHERE id=$1 AND status='aprobado' RETURNING ${REQ_COLS}`,
            [req.id, a.id, resultContentId, resultVersion, evento({ type: 'published', from: 'aprobado', to: 'publicado', actor, detail: resultContentId ? `Registro ${resultContentId} v${resultVersion || ''}` : '' })]
        );
        if (!r.rows[0]) throw new Error('La solicitud ya no está aprobada (alguien la movió mientras tanto).');
        await client.query('COMMIT');
        await audit({ programId: req.programId, entityType: 'change_request', entityId: req.id, action: 'published', actor, detail: { ref: req.publicRef, kind: req.kind, operation: req.operation, resultContentId, resultVersion, programPatch } });
        return { ok: true, request: r.rows[0] };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        return { ok: false, error: e.message };
    } finally {
        client.release();
    }
}

// ─── Solicitudes públicas ─────────────────────────────────────────────

const PUB_COLS = `id, "publicRef", "programId", type, status, data, "consentText", "consentAt", "originHost", "originClubId", "originClubName", "originDistrictNumber", "originActivationId",
    "assigneeUserId", "assigneeName", "backupUserId", "backupName", "firstContactAt", "closedAt", "closeReason", "derivedTo", notes, history, "createdAt", "updatedAt"`;

export async function createPublicRequest({ programId, type, data, consentText, origin = {}, routing = {} }) {
    await ensureProgramSchema();
    let ref = makeRef('SP');
    for (let i = 0; i < 5; i++) {
        const dup = await db.query(`SELECT 1 FROM "ProgramRequest" WHERE "publicRef" = $1`, [ref]);
        if (!dup.rows.length) break;
        ref = makeRef('SP');
    }
    const assignee = routing.assigneeUserId || routing.assigneeName ? routing : null;
    const row = one(await db.query(
        `INSERT INTO "ProgramRequest" ("publicRef", "programId", type, status, data, "consentText", "consentAt", "originHost", "originClubId", "originClubName", "originDistrictNumber", "originActivationId",
            "assigneeUserId", "assigneeName", "backupUserId", "backupName", history)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,NOW(),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb) RETURNING ${PUB_COLS}`,
        [ref, programId, type, assignee ? 'asignada' : 'nueva', JSON.stringify(data), consentText, origin.host || null, origin.clubId || null, origin.clubName || null,
            origin.districtNumber || null, origin.activationId || null, assignee?.assigneeUserId || null, assignee?.assigneeName || null, assignee?.backupUserId || null, assignee?.backupName || null,
            evento({ type: 'received', to: assignee ? 'asignada' : 'nueva', detail: assignee ? `Asignada automáticamente a ${assignee.assigneeName || 'responsable del programa'}` : '' })]
    ));
    // En la auditoría NUNCA van los datos de la persona: sólo la referencia.
    await audit({ programId, entityType: 'public_request', entityId: row.id, action: 'received', actor: { name: 'Formulario público' }, detail: { ref, type, originClubId: origin.clubId || null } });
    return row;
}

export async function listPublicRequests(programId, { status = '', type = '', assignee = '', originClubId = null, q = '', page = 1, perPage = 25 } = {}) {
    const params = [programId, status, type, assignee, originClubId, q];
    const where = `"programId" = $1 AND ($2 = '' OR status = $2) AND ($3 = '' OR type = $3) AND ($4 = '' OR "assigneeUserId" = $4)
        AND ($5::text IS NULL OR "originClubId" = $5) AND ($6 = '' OR "publicRef" ILIKE '%' || $6 || '%' OR data::text ILIKE '%' || $6 || '%')`;
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramRequest" WHERE ${where}`, params)).rows[0].n;
    const { rows } = await db.query(`SELECT ${PUB_COLS} FROM "ProgramRequest" WHERE ${where} ORDER BY "createdAt" DESC LIMIT $7 OFFSET $8`, [...params, perPage, (page - 1) * perPage]);
    const facets = (await db.query(`SELECT status, type, COUNT(*)::int AS n FROM "ProgramRequest" WHERE "programId" = $1 GROUP BY status, type`, [programId])).rows;
    return { rows, total, page, perPage, facets };
}

/** Lo que ve el club de origen: referencia, tipo, estado, fecha. NUNCA `data`. */
export async function originRequestsForClub(programId, clubId) {
    const { rows } = await db.query(
        `SELECT "publicRef", type, status, "createdAt" FROM "ProgramRequest" WHERE "programId" = $1 AND "originClubId" = $2 ORDER BY "createdAt" DESC LIMIT 100`, [programId, clubId]
    );
    return rows;
}

export async function getPublicRequest(id) {
    return one(await db.query(`SELECT ${PUB_COLS} FROM "ProgramRequest" WHERE id = $1 OR "publicRef" = $1 LIMIT 1`, [String(id || '')]));
}

export async function transitionPublicRequest(id, to, { actor, reason = '', derivedTo = '' }) {
    const prev = await getPublicRequest(id);
    if (!prev) return null;
    const row = one(await db.query(
        `UPDATE "ProgramRequest" SET status=$2,
            "firstContactAt" = CASE WHEN $2 = 'en_contacto' AND "firstContactAt" IS NULL THEN NOW() ELSE "firstContactAt" END,
            "closedAt" = CASE WHEN $2 = 'cerrada' THEN NOW() ELSE NULL END, "closeReason" = CASE WHEN $2 = 'cerrada' THEN $3 ELSE NULL END,
            "derivedTo" = CASE WHEN $2 = 'derivada' THEN $4 ELSE "derivedTo" END,
            history = history || $5::jsonb, "updatedAt"=NOW() WHERE id=$1 RETURNING ${PUB_COLS}`,
        [prev.id, to, reason || null, derivedTo || null, evento({ type: 'transition', from: prev.status, to, actor, detail: reason || derivedTo })]
    ));
    await audit({ programId: row.programId, entityType: 'public_request', entityId: row.id, action: `status:${to}`, actor, detail: { ref: row.publicRef, from: prev.status } });
    return row;
}

export async function assignPublicRequest(id, { assigneeUserId, assigneeName, backupUserId = null, backupName = null, actor }) {
    const prev = await getPublicRequest(id);
    if (!prev) return null;
    const to = prev.status === 'nueva' ? 'asignada' : prev.status;
    const row = one(await db.query(
        `UPDATE "ProgramRequest" SET "assigneeUserId"=$2, "assigneeName"=$3, "backupUserId"=$4, "backupName"=$5, status=$6, history = history || $7::jsonb, "updatedAt"=NOW()
          WHERE id=$1 RETURNING ${PUB_COLS}`,
        [prev.id, assigneeUserId || null, assigneeName || null, backupUserId, backupName, to, evento({ type: 'assigned', from: prev.status, to, actor, detail: `Asignada a ${assigneeName || 'sin responsable'}` })]
    ));
    await audit({ programId: row.programId, entityType: 'public_request', entityId: row.id, action: 'assigned', actor, detail: { ref: row.publicRef, assigneeName } });
    return row;
}

export async function notePublicRequest(id, text, { actor }) {
    const a = actorCols(actor);
    const row = one(await db.query(
        `UPDATE "ProgramRequest" SET notes = notes || $2::jsonb, "updatedAt"=NOW() WHERE id=$1 OR "publicRef"=$1 RETURNING ${PUB_COLS}`,
        [String(id), JSON.stringify([{ at: new Date().toISOString(), by: a.id, byName: a.name, text: String(text || '').slice(0, 2000) }])]
    ));
    return row;
}

export async function subscribe({ programId, email, name, consentText, origin = {} }) {
    await ensureProgramSchema();
    const row = one(await db.query(
        `INSERT INTO "ProgramSubscriber" ("programId", email, name, "consentText", "consentAt", "originHost", "originClubId")
         VALUES ($1,$2,$3,$4,NOW(),$5,$6)
         ON CONFLICT ("programId", email) DO UPDATE SET name=EXCLUDED.name, "consentText"=EXCLUDED."consentText", "consentAt"=NOW(), "unsubscribedAt"=NULL
         RETURNING id, email, "consentAt"`,
        [programId, email, name, consentText, origin.host || null, origin.clubId || null]
    ));
    await audit({ programId, entityType: 'subscriber', entityId: row.id, action: 'subscribed', actor: { name: 'Formulario público' }, detail: { originClubId: origin.clubId || null } });
    return row;
}

export async function subscriberCount(programId) {
    return (await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramSubscriber" WHERE "programId" = $1 AND "unsubscribedAt" IS NULL`, [programId])).rows[0].n;
}

// ─── Archivos privados ────────────────────────────────────────────────

const FILE_COLS = `id, "programId", kind, "storageKey", filename, "contentType", bytes, format, label, "relatedType", "relatedId", "uploadedBy", "uploadedByName", "verifiedBy", "verifiedAt", "deletedAt", "createdAt", meta`;

export async function registerFile({ programId, kind, storageKey, filename, contentType, bytes, format, label = '', relatedType = null, relatedId = null, actor, meta = {} }) {
    const a = actorCols(actor);
    // Idempotente por clave: aplicar dos veces el mismo documento de un envío no lo duplica.
    const prev = one(await db.query(`SELECT ${FILE_COLS} FROM "ProgramFile" WHERE "storageKey" = $1`, [storageKey]));
    if (prev) return prev;
    const row = one(await db.query(
        `INSERT INTO "ProgramFile" ("programId", kind, "storageKey", filename, "contentType", bytes, format, label, "relatedType", "relatedId", "uploadedBy", "uploadedByName", meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING ${FILE_COLS}`,
        [programId, kind, storageKey, filename, contentType, bytes, format, label || null, relatedType, relatedId, a.id, a.name, JSON.stringify(meta || {})]
    ));
    await audit({ programId, entityType: 'file', entityId: row.id, action: 'registered', actor, detail: { kind, filename, bytes } });
    return row;
}

export async function getFile(id) {
    return one(await db.query(`SELECT ${FILE_COLS} FROM "ProgramFile" WHERE id = $1 AND "deletedAt" IS NULL`, [String(id || '')]));
}

export async function listFiles(programId, { kind = '' } = {}) {
    const { rows } = await db.query(`SELECT ${FILE_COLS} FROM "ProgramFile" WHERE "programId" = $1 AND "deletedAt" IS NULL AND ($2 = '' OR kind = $2) ORDER BY "createdAt" DESC LIMIT 500`, [programId, kind]);
    return rows;
}

// ─── Métricas (sin datos personales) ──────────────────────────────────

const STATS_TZ = 'America/Bogota';
const dayKey = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const visitorKey = (seed) => crypto.createHash('sha256').update((process.env.LINK_TRACKING_SALT || process.env.JWT_SECRET || '') + '|' + seed).digest('hex').slice(0, 32);

/** UNA sentencia: visitante (sólo para `view`), agregado diario. Nunca lanza. */
export async function recordMetric({ programId, siteClubId = '', metric, seed = '', isBot = false, now = new Date() }) {
    if (!programId || !isMetricKey(metric) || isBot) return { ok: false };
    try {
        await ensureProgramSchema();
        const day = dayKey(now);
        if (metric === 'view' && seed) {
            await db.query(
                `WITH v AS (
                    INSERT INTO "ProgramVisitor" ("programId", "visitorKey", "firstSeenAt", "lastSeenAt", views) VALUES ($1, $2, $4, $4, 1)
                    ON CONFLICT ("programId", "visitorKey") DO UPDATE SET "lastSeenAt" = $4, views = "ProgramVisitor".views + 1
                    RETURNING ("ProgramVisitor"."firstSeenAt" = $4) AS nuevo
                 )
                 INSERT INTO "ProgramMetricDaily" ("programId", "siteClubId", day, metric, count, uniques)
                 SELECT $1, $3, $5::date, 'view', 1, CASE WHEN (SELECT nuevo FROM v) THEN 1 ELSE 0 END
                 ON CONFLICT ("programId", "siteClubId", day, metric) DO UPDATE SET count = "ProgramMetricDaily".count + 1,
                    uniques = "ProgramMetricDaily".uniques + CASE WHEN (SELECT nuevo FROM v) THEN 1 ELSE 0 END`,
                [programId, visitorKey(seed), siteClubId || '', now, day]
            );
        } else {
            await db.query(
                `INSERT INTO "ProgramMetricDaily" ("programId", "siteClubId", day, metric, count, uniques) VALUES ($1, $2, $3::date, $4, 1, 0)
                 ON CONFLICT ("programId", "siteClubId", day, metric) DO UPDATE SET count = "ProgramMetricDaily".count + 1`,
                [programId, siteClubId || '', day, metric]
            );
        }
        return { ok: true };
    } catch (e) {
        console.warn('[programas] métrica no registrada:', e?.message);
        return { ok: false };
    }
}

export async function metricsSummary(programId, { from = null, to = null } = {}) {
    const { rows } = await db.query(
        `SELECT metric, SUM(count)::int AS total, SUM(uniques)::int AS uniques FROM "ProgramMetricDaily"
          WHERE "programId" = $1 AND ($2::date IS NULL OR day >= $2) AND ($3::date IS NULL OR day <= $3) GROUP BY metric`, [programId, from, to]
    );
    const bySite = (await db.query(
        `SELECT "siteClubId", metric, SUM(count)::int AS total FROM "ProgramMetricDaily"
          WHERE "programId" = $1 AND ($2::date IS NULL OR day >= $2) AND ($3::date IS NULL OR day <= $3) GROUP BY 1, 2 ORDER BY 1`, [programId, from, to]
    )).rows;
    const daily = (await db.query(
        `SELECT day::text AS day, metric, SUM(count)::int AS total FROM "ProgramMetricDaily"
          WHERE "programId" = $1 AND day >= COALESCE($2::date, CURRENT_DATE - 30) AND ($3::date IS NULL OR day <= $3) GROUP BY 1, 2 ORDER BY 1`, [programId, from, to]
    )).rows;
    const requests = (await db.query(`SELECT status, COUNT(*)::int AS n FROM "ProgramRequest" WHERE "programId" = $1 GROUP BY status`, [programId])).rows;
    const firstContact = one(await db.query(
        `SELECT AVG(EXTRACT(EPOCH FROM ("firstContactAt" - "createdAt")) / 3600)::numeric(10,1) AS "avgHours", COUNT(*)::int AS n
           FROM "ProgramRequest" WHERE "programId" = $1 AND "firstContactAt" IS NOT NULL`, [programId]
    ));
    const activeClubs = (await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramClubActivation" WHERE "programId" = $1 AND status = 'activa'`, [programId])).rows[0].n;
    return { totals: rows, bySite, daily, requestsByStatus: requests, firstContact: { avgHours: firstContact?.avgHours ? Number(firstContact.avgHours) : null, measured: firstContact?.n || 0 }, activeClubs };
}

// ─── La página pública por contenedores (v4.1281) ─────────────────────

const LANDING_COLS = `"programId", "schemaVersion", draft, published, "draftVersion", "publishedVersion", "updatedBy", "updatedByName", "updatedAt", "publishedBy", "publishedByName", "publishedAt"`;

export async function getLanding(programId) {
    await ensureProgramSchema();
    return one(await db.query(`SELECT ${LANDING_COLS} FROM "ProgramLanding" WHERE "programId" = $1`, [programId]));
}

/** El borrador y la versión publicada; si nunca se guardó, el diseño inicial (sin escribir nada). */
export async function landingState(program, { districtNumber = null } = {}) {
    const row = await getLanding(program.id);
    if (row) return { ...row, draft: shapeLanding(row.draft), published: row.published ? shapeLanding(row.published) : null, exists: true };
    return { programId: program.id, schemaVersion: 1, draft: defaultLanding(program, { districtNumber }), published: null, draftVersion: 0, publishedVersion: null, updatedBy: null, updatedByName: null, updatedAt: null, publishedBy: null, publishedByName: null, publishedAt: null, exists: false };
}

/** Guarda el BORRADOR con bloqueo optimista: `baseVersion` es la que leyó quien edita. */
export async function saveLandingDraft(programId, landing, { actor, baseVersion }) {
    const a = actorCols(actor);
    const cur = await getLanding(programId);
    const base = Number(baseVersion ?? -1);
    if (cur && base !== Number(cur.draftVersion)) return { ok: false, conflict: true, current: cur };
    if (!cur && base > 0) return { ok: false, conflict: true, current: null };
    const row = cur
        ? one(await db.query(
            `UPDATE "ProgramLanding" SET draft = $2::jsonb, "schemaVersion" = $3, "draftVersion" = "draftVersion" + 1, "updatedBy" = $4, "updatedByName" = $5, "updatedAt" = NOW()
              WHERE "programId" = $1 AND "draftVersion" = $6 RETURNING ${LANDING_COLS}`,
            [programId, JSON.stringify(landing), landing.schemaVersion, a.id, a.name, base]
        ))
        : one(await db.query(
            `INSERT INTO "ProgramLanding" ("programId", "schemaVersion", draft, "draftVersion", "updatedBy", "updatedByName") VALUES ($1, $2, $3::jsonb, 1, $4, $5)
             ON CONFLICT ("programId") DO NOTHING RETURNING ${LANDING_COLS}`,
            [programId, landing.schemaVersion, JSON.stringify(landing), a.id, a.name]
        ));
    if (!row) return { ok: false, conflict: true, current: await getLanding(programId) };
    await audit({ programId, entityType: 'landing', entityId: programId, action: 'draft_saved', actor, detail: { draftVersion: row.draftVersion, blocks: landing.blocks.length } });
    return { ok: true, row };
}

/** Publica el borrador: lo copia a `published`, escribe la versión y audita. Hasta aquí el público veía la anterior. */
export async function publishLanding(programId, { actor, baseVersion, note = '' }) {
    const a = actorCols(actor);
    const cur = await getLanding(programId);
    if (!cur) return { ok: false, error: 'No hay borrador que publicar.' };
    if (baseVersion !== undefined && Number(baseVersion) !== Number(cur.draftVersion)) return { ok: false, conflict: true, current: cur };
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query(
            `UPDATE "ProgramLanding" SET published = draft, "publishedVersion" = COALESCE("publishedVersion", 0) + 1, "publishedBy" = $2, "publishedByName" = $3, "publishedAt" = NOW()
              WHERE "programId" = $1 AND "draftVersion" = $4 RETURNING ${LANDING_COLS}`,
            [programId, a.id, a.name, cur.draftVersion]
        );
        if (!r.rows[0]) throw new Error('El borrador cambió mientras publicabas. Recarga y vuelve a intentar.');
        await client.query(
            `INSERT INTO "ProgramLandingVersion" ("programId", version, config, "publishedBy", "publishedByName", note) VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
            [programId, r.rows[0].publishedVersion, JSON.stringify(r.rows[0].published), a.id, a.name, note || null]
        );
        await client.query('COMMIT');
        await audit({ programId, entityType: 'landing', entityId: programId, action: 'published', actor, detail: { publishedVersion: r.rows[0].publishedVersion, note } });
        return { ok: true, row: r.rows[0] };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        return { ok: false, error: e.message };
    } finally { client.release(); }
}

export async function landingVersions(programId) {
    const { rows } = await db.query(`SELECT id, version, "publishedByName", note, "publishedAt" FROM "ProgramLandingVersion" WHERE "programId" = $1 ORDER BY version DESC LIMIT 50`, [programId]);
    return rows;
}

/** Restaura una versión publicada al BORRADOR (no publica). */
export async function restoreLandingVersion(programId, version, { actor }) {
    const v = one(await db.query(`SELECT config FROM "ProgramLandingVersion" WHERE "programId" = $1 AND version = $2`, [programId, Number(version)]));
    if (!v) return { ok: false, error: 'Versión no encontrada.' };
    const cur = await getLanding(programId);
    const r = await saveLandingDraft(programId, shapeLanding(v.config), { actor, baseVersion: cur?.draftVersion ?? 0 });
    if (r.ok) await audit({ programId, entityType: 'landing', entityId: programId, action: 'version_restored', actor, detail: { version: Number(version) } });
    return r;
}

/** Las fuentes publicadas que la landing referencia, para ESTE sitio (central + distrital + local del club). */
export async function landingSources(program, { districtNumber = null, activationId = null } = {}) {
    const { rows } = await db.query(
        `SELECT ${CONTENT_COLS} FROM "ProgramContent" WHERE "programId" = $1 AND status = 'publicado'
            AND ("scopeType" = 'central' OR ("scopeType" = 'district' AND $2::int IS NOT NULL AND "districtNumber" = $2) OR ("scopeType" = 'club' AND $3::text IS NOT NULL AND "clubActivationId" = $3))
          ORDER BY kind, "sortOrder", "publishedAt" DESC`,
        [program.id, districtNumber, activationId]
    );
    const visible = rows.filter(c => isPubliclyVisible(c.kind, c.data) && visibleOnSite(c.kind, c.data, 'preview')).map(publicContentView);
    const by = (k) => visible.filter(c => c.kind === k);
    const donation = by('donation')[0] || null;
    return { slug: program.slug, clinics: by('clinic'), stories: by('story'), resources: by('resource'), indicators: by('indicator'), donation, formsEnabled: program.formsEnabled || {} };
}

export { resolveLanding, defaultLanding };

// ─── Lectura pública ──────────────────────────────────────────────────

/** El sitio como lo ve este módulo: id, nombre, si es de distrito y sus distritos. */
export async function siteInfo(clubId) {
    if (!clubId) return null;
    const row = one(await db.query(
        `SELECT c.id, c.name, c.type, c.district, d.number AS "districtNumberFk" FROM "Club" c LEFT JOIN "District" d ON d.id = c."districtId" WHERE c.id = $1`, [clubId]
    ).catch(() => ({ rows: [] })));
    if (!row) return null;
    const districts = Array.from(new Set([Number(row.districtNumberFk) || 0, ...parseDistrictTags(row.district).map(Number)].filter(Boolean)));
    return { id: row.id, name: row.name, isDistrict: ['district', 'distrito rotario'].includes(String(row.type || '').toLowerCase()), districts };
}

/**
 * Los programas que ESTE sitio muestra en su catálogo público:
 *   · sitio de distrito: los vinculados a sus distritos con `showInCatalog`;
 *   · sitio de club: los que activó (activación activa);
 *   · plataforma/otro: los que lo tienen como dueño.
 * Sólo programas ACTIVOS. `menuOnly` acota a los que piden entrada en el menú.
 */
export async function publicCatalogForSite(clubId, { menuOnly = false } = {}) {
    await ensureProgramSchema();
    const site = await siteInfo(clubId);
    if (!site) return { site: null, programs: [] };
    let rows = [];
    if (site.isDistrict && site.districts.length) {
        rows = (await db.query(
            `SELECT p.id, p.slug, p.name, p.summary, p.category, p."logoUrl", p."heroImageUrl", p."heroImageAlt", l."districtNumber", l."relationType", l."showInMenu"
               FROM "Program" p JOIN "ProgramDistrictLink" l ON l."programId" = p.id
              WHERE p.status = 'activo' AND l.status = 'activa' AND l."showInCatalog" AND l."districtNumber" = ANY($1::int[]) AND ($2 = FALSE OR l."showInMenu")
              ORDER BY p.name`, [site.districts, menuOnly]
        )).rows;
    } else {
        rows = (await db.query(
            `SELECT p.id, p.slug, p.name, p.summary, p.category, p."logoUrl", p."heroImageUrl", p."heroImageAlt", a."districtNumber", l."relationType", a."showInMenu"
               FROM "Program" p JOIN "ProgramClubActivation" a ON a."programId" = p.id JOIN "ProgramDistrictLink" l ON l.id = a."districtLinkId"
              WHERE p.status = 'activo' AND a.status = 'activa' AND a."clubId" = $1 AND l.status = 'activa' AND ($2 = FALSE OR a."showInMenu")
              UNION
             SELECT p.id, p.slug, p.name, p.summary, p.category, p."logoUrl", p."heroImageUrl", p."heroImageAlt", p."ownerDistrictNumber", NULL, TRUE
               FROM "Program" p WHERE p.status = 'activo' AND p."ownerClubId" = $1
              ORDER BY 3`, [clubId, menuOnly]
        )).rows;
    }
    return { site, programs: rows };
}

/** Para el menú del sitio: cuántos programas tiene y cómo rotular la entrada. Nunca lanza. */
export async function programsNavFor(clubId) {
    try {
        const exists = one(await db.query(`SELECT to_regclass('public."Program"') IS NOT NULL AS t`));
        if (!exists?.t) return { count: 0 };
        const { programs } = await publicCatalogForSite(clubId, { menuOnly: true });
        return { count: programs.length, single: programs.length === 1 ? { slug: programs[0].slug, name: programs[0].name } : null };
    } catch { return { count: 0 }; }
}

/** El programa como lo ve el público en ESTE sitio: ficha + vinculación + activación + contenidos publicados. */
export async function publicProgramForSite(slug, clubId, { preview = false } = {}) {
    await ensureProgramSchema();
    const program = await getProgram(slug);
    if (!program) return null;
    if (program.status !== 'activo' && !preview) return null;
    const site = await siteInfo(clubId);
    let link = null; let activation = null;
    const links = await listLinks(program.id);
    if (site?.isDistrict) link = links.find(l => l.status === 'activa' && site.districts.includes(Number(l.districtNumber))) || null;
    else if (site) {
        activation = (await listActivations(program.id, { clubId: site.id }))[0] || null;
        if (activation && activation.status !== 'activa') activation = null;
        if (activation) link = links.find(l => l.id === activation.districtLinkId) || null;
    }
    const owned = site && program.ownerClubId === site.id;
    if (!preview && !link && !activation && !owned) return null;

    // Central + lo distrital de ESTA vinculación + lo local de ESTE club. Nada de otros clubes.
    const { rows: contents } = await db.query(
        `SELECT ${CONTENT_COLS} FROM "ProgramContent" WHERE "programId" = $1 AND status = 'publicado'
            AND ("scopeType" = 'central' OR ("scopeType" = 'district' AND $2::int IS NOT NULL AND "districtNumber" = $2) OR ("scopeType" = 'club' AND $3::text IS NOT NULL AND "clubActivationId" = $3))
          ORDER BY kind, "sortOrder", "publishedAt" DESC`,
        [program.id, link?.districtNumber || null, activation?.id || null]
    );
    // v4.1286 — Cada historia sólo en los canales que autorizó (programa · distrito · clubes).
    const siteKind = preview ? 'preview' : owned ? 'owner' : site?.isDistrict ? 'district' : 'club';
    const visible = contents.filter(c => isPubliclyVisible(c.kind, c.data) && visibleOnSite(c.kind, c.data, siteKind));
    const counts = {};
    for (const c of visible) counts[c.kind] = (counts[c.kind] || 0) + 1;
    const view = publicProgramView(program);
    const formsEnabled = view.formsEnabled;
    const formsAny = ['orientacion', 'apoyo', 'club'].some(k => formsEnabled[k] !== false) || view.newsletterEnabled;
    const sections = renderableSections(program, {
        counts, hasPartners: view.partners.length > 0,
        hasCare: Boolean(view.care.audience || view.care.guidancePath), hasParticipation: Boolean(view.participation.waysToSupport), formsAny,
    });
    const byKind = {};
    for (const k of Object.keys(CONTENT_KINDS)) byKind[k] = visible.filter(c => c.kind === k).map(publicContentView);
    // La landing por contenedores (v4.1281): la PUBLICADA para el público; en
    // vista previa, el BORRADOR. Sin nada guardado, el diseño inicial. Sus
    // fuentes son los mismos registros publicados de arriba.
    const state = await landingState(program, { districtNumber: link?.districtNumber || program.ownerDistrictNumber || null });
    const config = preview ? state.draft : (state.published || (state.exists ? null : state.draft));
    const sources = { slug: program.slug, clinics: byKind.clinic, stories: byKind.story, resources: byKind.resource, indicators: byKind.indicator, donation: byKind.donation[0] || null, formsEnabled: view.formsEnabled };
    const landing = config ? resolveLanding(config, sources, { preview }) : null;
    return {
        program: view, link: link ? publicLinkView(link) : null, activation: activation ? publicActivationView(activation) : null,
        site: site ? { id: site.id, name: site.name, isDistrict: site.isDistrict } : null,
        sections, content: byKind, preview, landing,
        landingMeta: { published: Boolean(state.published), draftVersion: state.draftVersion, publishedVersion: state.publishedVersion },
    };
}

/** Los filtros del directorio de clínicas: regiones y ciudades con registros visibles. */
export const clinicFacets = (clinics = []) => {
    const regions = {};
    for (const c of clinics) {
        const r = c.region || 'Sin región';
        regions[r] = regions[r] || new Set();
        if (c.city) regions[r].add(c.city);
    }
    return Object.entries(regions).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([region, cities]) => ({ region, cities: Array.from(cities).sort((a, b) => a.localeCompare(b, 'es')) }));
};

export { defaultSections, SECTIONS };
export default {
    audit, auditList, createProgram, updateProgram, setProgramStatus, getProgram, listPrograms, slugTaken, listLinks, upsertLink, districtSiteIdFor,
    listActivations, activateClub, updateActivation, deactivateClub, getActivation, listMembers, upsertMember, removeMember,
    listContent, getContent, contentVersions, createChangeRequest, updateChangeRequest, getChangeRequest, listChangeRequests, transitionChangeRequest,
    medicalApproveRequest, publishChangeRequest, createPublicRequest, listPublicRequests, originRequestsForClub, getPublicRequest, transitionPublicRequest,
    assignPublicRequest, notePublicRequest, subscribe, subscriberCount, registerFile, getFile, listFiles, recordMetric, metricsSummary,
    siteInfo, publicCatalogForSite, programsNavFor, publicProgramForSite, clinicFacets,
    getLanding, landingState, saveLandingDraft, publishLanding, landingVersions, restoreLandingVersion, landingSources,
};
