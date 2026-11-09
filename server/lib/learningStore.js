// ════════════════════════════════════════════════════════════════════
// Cursos y capacitaciones — la I/O con la base — v4.1302.0
//
// Sólo SQL. El criterio (qué se puede, qué falta) vive en `learningSpec.js`
// y lo aplica el controlador. Nada aquí decide permisos: recibe el ALCANCE
// ya resuelto (`scope`) y lo pone en el WHERE.
//
// ⚠️ Nunca una comilla invertida dentro de un `db.query(\`…\`)`.
// ════════════════════════════════════════════════════════════════════
import { randomBytes } from 'node:crypto';
import db from './db.js';
import { ensureLearningSchema } from './ensureLearningSchema.js';
import { slugify, normalizeConfig } from './learningSpec.js';

const q = async (text, params) => { await ensureLearningSchema(); return db.query(text, params); };
const one = async (text, params) => (await q(text, params)).rows[0] || null;
const many = async (text, params) => (await q(text, params)).rows;

export const newToken = () => randomBytes(18).toString('base64url');

/** UPDATE genérico: sólo las columnas recibidas, siempre `updatedAt`. */
const update = async (table, id, values, extraSet = '') => {
    const keys = Object.keys(values || {});
    if (!keys.length && !extraSet) return one(`SELECT * FROM "${table}" WHERE id=$1`, [id]);
    const sets = keys.map((k, i) => `"${k}"=$${i + 2}`);
    sets.push('"updatedAt"=NOW()');
    if (extraSet) sets.push(extraSet);
    const params = [id, ...keys.map(k => { const v = values[k]; return (v && typeof v === 'object' && !Array.isArray(v)) ? JSON.stringify(v) : v; })];
    return one(`UPDATE "${table}" SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, params);
};

/**
 * El ALCANCE en SQL. `scope`: { all: true } | { siteIds: [...], districtNumbers: [...] }.
 * `[]` en ambos es «ninguna fila» (FALSE), nunca «sin filtro».
 */
const scopeWhere = (scope, alias, params) => {
    if (scope?.all) return 'TRUE';
    const parts = [];
    const sites = Array.isArray(scope?.siteIds) ? scope.siteIds.filter(Boolean) : [];
    const dists = Array.isArray(scope?.districtNumbers) ? scope.districtNumbers.filter(Boolean).map(String) : [];
    if (sites.length) { params.push(sites); parts.push(`${alias}."siteId" = ANY($${params.length}::text[])`); }
    if (dists.length) { params.push(dists); parts.push(`${alias}."districtNumber" = ANY($${params.length}::text[])`); }
    return parts.length ? `(${parts.join(' OR ')})` : 'FALSE';
};

// ─── Slugs ───────────────────────────────────────────────────────────
export const uniqueSlug = async (table, base) => {
    const root = slugify(base);
    for (let i = 0; i < 30; i++) {
        const candidate = i === 0 ? root : `${root}-${randomBytes(2).toString('hex')}`;
        const hit = await one(`SELECT 1 FROM "${table}" WHERE slug=$1`, [candidate]);
        if (!hit) return candidate;
    }
    return `${root}-${randomBytes(4).toString('hex')}`;
};

// ─── Colecciones ─────────────────────────────────────────────────────
export const createCollection = async (v) => {
    const slug = await uniqueSlug('LearningCollection', v.name || 'coleccion');
    return one(
        `INSERT INTO "LearningCollection" ("siteId","ownerClubId","ownerClubName","districtNumber","districtId",slug,name,description,"projectRef","projectFairSubmissionId","areaFocus",audience,"coverUrl","accessMode","inviteToken","createdById","createdByName","lastEditedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW()) RETURNING *`,
        [v.siteId, v.ownerClubId || v.siteId, v.ownerClubName || null, v.districtNumber || null, v.districtId || null, slug, v.name || 'Nueva colección', v.description || null,
         v.projectRef || null, v.projectFairSubmissionId || null, v.areaFocus || null, Array.isArray(v.audience) ? v.audience : [], v.coverUrl || null, v.accessMode || 'public',
         newToken(), v.createdById || null, v.createdByName || null]
    );
};
export const getCollection = (id) => one(`SELECT * FROM "LearningCollection" WHERE id=$1`, [String(id || '')]);
export const getCollectionBySlug = (slug) => one(`SELECT * FROM "LearningCollection" WHERE slug=$1`, [String(slug || '')]);
export const updateCollection = (id, values) => update('LearningCollection', id, values, '"lastEditedAt"=NOW()');
export const listCollections = async (scope, { status } = {}) => {
    const params = [];
    const where = [scopeWhere(scope, 'c', params)];
    if (status) { params.push(status); where.push(`c.status=$${params.length}`); }
    return many(
        `SELECT c.*,
                (SELECT COUNT(*)::int FROM "LearningCourse" k WHERE k."collectionId"=c.id AND k.status<>'archived') AS "courseCount",
                (SELECT COUNT(*)::int FROM "LearningCourse" k WHERE k."collectionId"=c.id AND k.status='published') AS "publishedCount",
                (SELECT COUNT(*)::int FROM "LearningCourse" k WHERE k."collectionId"=c.id AND k.status='in_review') AS "inReviewCount",
                (SELECT COUNT(*)::int FROM "LearningCourse" k WHERE k."collectionId"=c.id AND k.status IN ('draft','changes_requested')) AS "draftCount"
         FROM "LearningCollection" c WHERE ${where.join(' AND ')} ORDER BY c."updatedAt" DESC LIMIT 500`, params);
};

// ─── Cursos ──────────────────────────────────────────────────────────
export const countCourses = async (collectionId) => (await one(`SELECT COUNT(*)::int AS n FROM "LearningCourse" WHERE "collectionId"=$1 AND status<>'archived'`, [collectionId]))?.n || 0;
export const createCourse = async (v) => {
    const slug = await uniqueSlug('LearningCourse', v.title || 'curso');
    const next = v.collectionId ? (await one(`SELECT COALESCE(MAX("sortOrder"),0)+1 AS n FROM "LearningCourse" WHERE "collectionId"=$1`, [v.collectionId]))?.n || 1 : 0;
    return one(
        `INSERT INTO "LearningCourse" ("collectionId","siteId","ownerClubId","ownerClubName","districtNumber","districtId",slug,title,"projectRef","accessMode","areaFocus",audience,"inviteToken","sortOrder","createdById","createdByName","lastEditedAt","lastEditedById",language)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),$15,$17) RETURNING *`,
        [v.collectionId || null, v.siteId, v.ownerClubId || v.siteId, v.ownerClubName || null, v.districtNumber || null, v.districtId || null, slug, v.title || '',
         v.projectRef || null, v.accessMode || 'public', v.areaFocus || null, Array.isArray(v.audience) ? v.audience : [], newToken(), next, v.createdById || null, v.createdByName || null, v.language || 'es']
    );
};
export const getCourse = (id) => one(`SELECT * FROM "LearningCourse" WHERE id=$1`, [String(id || '')]);
export const getCourseBySlug = (slug) => one(`SELECT * FROM "LearningCourse" WHERE slug=$1`, [String(slug || '')]);
export const updateCourse = (id, values, editorId = null) => update('LearningCourse', id, { ...values, ...(editorId ? { lastEditedById: editorId } : {}) }, '"lastEditedAt"=NOW()');
/** El ÚNICO sitio que escribe `status` de un curso (lo cuenta la prueba). */
export const writeCourseStatus = async (id, status, patch = {}) => update('LearningCourse', id, { status, ...patch });

export const listCoursesOfCollection = (collectionId) => many(
    `SELECT k.*,
            (SELECT COUNT(*)::int FROM "LearningLesson" l WHERE l."courseId"=k.id) AS "lessonCount",
            (SELECT COALESCE(SUM(l."durationMinutes"),0)::int FROM "LearningLesson" l WHERE l."courseId"=k.id) AS "lessonMinutes",
            (SELECT COUNT(*)::int FROM "LearningFile" f WHERE f."courseId"=k.id AND f.status='uploading') AS "uploadingCount"
     FROM "LearningCourse" k WHERE k."collectionId"=$1 ORDER BY k."sortOrder" ASC, k."createdAt" ASC`, [collectionId]);

export const listStandaloneCourses = (scope) => {
    const params = [];
    const where = scopeWhere(scope, 'k', params);
    return many(
        `SELECT k.*, (SELECT COUNT(*)::int FROM "LearningLesson" l WHERE l."courseId"=k.id) AS "lessonCount"
         FROM "LearningCourse" k WHERE k."collectionId" IS NULL AND ${where} ORDER BY k."updatedAt" DESC LIMIT 300`, params);
};

export const reorderCourses = async (collectionId, ids) => {
    for (let i = 0; i < ids.length; i++) {
        await q(`UPDATE "LearningCourse" SET "sortOrder"=$3, "updatedAt"=NOW() WHERE id=$1 AND "collectionId"=$2`, [ids[i], collectionId, i + 1]);
    }
};

/** Todo lo que compone un curso, en cuatro consultas. */
export const courseBundle = async (courseId) => {
    const [modules, lessons, resources, files] = await Promise.all([
        many(`SELECT * FROM "LearningModule" WHERE "courseId"=$1 ORDER BY "sortOrder", "createdAt"`, [courseId]),
        many(`SELECT * FROM "LearningLesson" WHERE "courseId"=$1 ORDER BY "sortOrder", "createdAt"`, [courseId]),
        many(`SELECT * FROM "LearningResource" WHERE "courseId"=$1 ORDER BY "sortOrder", "createdAt"`, [courseId]),
        many(`SELECT * FROM "LearningFile" WHERE "courseId"=$1 AND status<>'deleted' ORDER BY "createdAt"`, [courseId]),
    ]);
    return { modules, lessons, resources, files };
};

// ─── Módulos, lecciones, recursos ────────────────────────────────────
const nextOrder = async (table, where, params) => (await one(`SELECT COALESCE(MAX("sortOrder"),0)+1 AS n FROM "${table}" WHERE ${where}`, params))?.n || 1;
export const createModule = async (courseId, v = {}) => one(
    `INSERT INTO "LearningModule" ("courseId",title,description,"sortOrder") VALUES ($1,$2,$3,$4) RETURNING *`,
    [courseId, v.title || '', v.description || null, await nextOrder('LearningModule', '"courseId"=$1', [courseId])]);
export const getModule = (id) => one(`SELECT * FROM "LearningModule" WHERE id=$1`, [String(id || '')]);
export const updateModule = (id, values) => update('LearningModule', id, values);
export const deleteModule = async (id, courseId) => {
    await q(`UPDATE "LearningLesson" SET "moduleId"=NULL, "updatedAt"=NOW() WHERE "moduleId"=$1 AND "courseId"=$2`, [id, courseId]);
    await q(`DELETE FROM "LearningModule" WHERE id=$1 AND "courseId"=$2`, [id, courseId]);
};
export const createLesson = async (courseId, v = {}) => one(
    `INSERT INTO "LearningLesson" ("courseId","moduleId",title,description,body,"videoUrl","durationMinutes","sortOrder") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [courseId, v.moduleId || null, v.title || '', v.description || null, v.body || null, v.videoUrl || null, v.durationMinutes ?? null,
     await nextOrder('LearningLesson', '"courseId"=$1 AND "moduleId" IS NOT DISTINCT FROM $2', [courseId, v.moduleId || null])]);
export const getLesson = (id) => one(`SELECT * FROM "LearningLesson" WHERE id=$1`, [String(id || '')]);
export const updateLesson = (id, values) => update('LearningLesson', id, values);
export const deleteLesson = async (id, courseId) => {
    await q(`DELETE FROM "LearningResource" WHERE "lessonId"=$1 AND "courseId"=$2`, [id, courseId]);
    await q(`DELETE FROM "LearningLesson" WHERE id=$1 AND "courseId"=$2`, [id, courseId]);
};
export const createResource = async (courseId, v = {}) => one(
    `INSERT INTO "LearningResource" ("courseId","lessonId",kind,"fileId",url,title,description,"sortOrder") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [courseId, v.lessonId || null, v.kind || (v.url ? 'link' : 'file'), v.fileId || null, v.url || null, v.title || '', v.description || null,
     await nextOrder('LearningResource', '"courseId"=$1', [courseId])]);
export const getResource = (id) => one(`SELECT * FROM "LearningResource" WHERE id=$1`, [String(id || '')]);
export const updateResource = (id, values) => update('LearningResource', id, values);
export const deleteResource = (id, courseId) => q(`DELETE FROM "LearningResource" WHERE id=$1 AND "courseId"=$2`, [id, courseId]);

/** Reordena filas de una tabla hija de un curso (módulos, lecciones o recursos). */
export const reorderChildren = async (table, courseId, ids, extra = {}) => {
    for (let i = 0; i < ids.length; i++) {
        const sets = ['"sortOrder"=$3', '"updatedAt"=NOW()'];
        const params = [ids[i], courseId, i + 1];
        if (table === 'LearningLesson' && 'moduleId' in extra) { params.push(extra.moduleId || null); sets.push(`"moduleId"=$${params.length}`); }
        await q(`UPDATE "${table}" SET ${sets.join(', ')} WHERE id=$1 AND "courseId"=$2`, params);
    }
};

// ─── Archivos ────────────────────────────────────────────────────────
export const createFile = (v) => one(
    `INSERT INTO "LearningFile" ("collectionId","courseId","siteId",purpose,visibility,"storageKey","publicUrl",filename,"contentType",bytes,kind,"uploadId",status,"uploadedById")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'uploading',$13) RETURNING *`,
    [v.collectionId || null, v.courseId || null, v.siteId || null, v.purpose, v.visibility || 'private', v.storageKey, v.publicUrl || null, v.filename, v.contentType || null, v.bytes || 0, v.kind || null, v.uploadId || null, v.uploadedById || null]);
export const getFile = (id) => one(`SELECT * FROM "LearningFile" WHERE id=$1`, [String(id || '')]);
export const markFileReady = (id, v) => update('LearningFile', id, { status: 'ready', bytes: v.bytes, format: v.format || null, contentType: v.contentType || null, durationSeconds: v.durationSeconds ?? null, width: v.width ?? null, height: v.height ?? null }, '"readyAt"=NOW(), "uploadId"=NULL');
export const markFileDeleted = (id) => update('LearningFile', id, { status: 'deleted' }, '"deletedAt"=NOW()');
export const countFiles = async (courseId) => (await one(`SELECT COUNT(*)::int AS n FROM "LearningFile" WHERE "courseId"=$1 AND status<>'deleted'`, [courseId]))?.n || 0;
/** El mismo archivo (nombre, peso, uso) con una carga a medias: para reanudar. */
export const pendingUploadFor = (courseId, { filename, bytes, purpose }) => one(
    `SELECT * FROM "LearningFile" WHERE "courseId"=$1 AND filename=$2 AND bytes=$3 AND purpose=$4 AND status='uploading' AND "uploadId" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`,
    [courseId, filename, bytes, purpose]);
export const filesOfCourse = (courseId) => many(`SELECT * FROM "LearningFile" WHERE "courseId"=$1 AND status<>'deleted' ORDER BY "createdAt"`, [courseId]);

// ─── Trazabilidad y avisos ───────────────────────────────────────────
export const logEvent = (v) => one(
    `INSERT INTO "LearningEvent" ("entityType","entityId","courseId","collectionId","siteId",action,"actorId","actorName","actorRole",visibility,detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [v.entityType, v.entityId, v.courseId || null, v.collectionId || null, v.siteId || null, v.action, v.actor?.id || null, v.actor?.name || v.actor?.email || null, v.actor?.role || null, v.visibility || 'all', JSON.stringify(v.detail || {})]);
export const listEvents = (courseId, { internal = false } = {}) => many(
    `SELECT * FROM "LearningEvent" WHERE "courseId"=$1 ${internal ? '' : "AND visibility='all'"} ORDER BY "createdAt" DESC LIMIT 200`, [courseId]);
export const listCollectionEvents = (collectionId, { internal = false } = {}) => many(
    `SELECT * FROM "LearningEvent" WHERE "collectionId"=$1 AND "courseId" IS NULL ${internal ? '' : "AND visibility='all'"} ORDER BY "createdAt" DESC LIMIT 100`, [collectionId]);
/** `true` si el aviso es nuevo; `false` si ya había salido por ese cambio. */
export const claimNotification = async (entityType, entityId, dedupeKey, { recipients = [], subject = '' } = {}) => {
    const r = await q(
        `INSERT INTO "LearningNotification" ("entityType","entityId","dedupeKey",recipients,subject) VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("entityId","dedupeKey") DO NOTHING RETURNING id`,
        [entityType, entityId, dedupeKey, recipients, subject]);
    return r.rows[0]?.id || null;
};
export const finishNotification = (id, sent, reason = null) => q(`UPDATE "LearningNotification" SET sent=$2, reason=$3 WHERE id=$1`, [id, Boolean(sent), reason]);

// ─── Configuración ───────────────────────────────────────────────────
export const getConfig = async (scope = 'global') => {
    const row = await one(`SELECT config FROM "LearningConfig" WHERE scope=$1`, [scope]);
    const global = scope === 'global' ? null : await one(`SELECT config FROM "LearningConfig" WHERE scope='global'`);
    return normalizeConfig({ ...(global?.config || {}), ...(row?.config || {}) });
};
export const saveConfig = (scope, config, updatedById) => one(
    `INSERT INTO "LearningConfig" (scope, config, "updatedById") VALUES ($1,$2,$3)
     ON CONFLICT (scope) DO UPDATE SET config=EXCLUDED.config, "updatedById"=EXCLUDED."updatedById", "updatedAt"=NOW() RETURNING *`,
    [scope, JSON.stringify(normalizeConfig(config)), updatedById || null]);

// ─── Administración ──────────────────────────────────────────────────
export const listAdminCourses = async (scope, { status, q: text, collectionId, siteId, page = 1, perPage = 40 } = {}) => {
    const params = [];
    const where = [scopeWhere(scope, 'k', params)];
    if (status) {
        const list = String(status).split(',').map(s => s.trim()).filter(Boolean);
        params.push(list); where.push(`k.status = ANY($${params.length}::text[])`);
    }
    if (collectionId) { params.push(collectionId); where.push(`k."collectionId"=$${params.length}`); }
    if (siteId) { params.push(siteId); where.push(`k."siteId"=$${params.length}`); }
    if (text) { params.push(`%${String(text).trim()}%`); where.push(`(k.title ILIKE $${params.length} OR k."ownerClubName" ILIKE $${params.length} OR k."projectRef" ILIKE $${params.length})`); }
    const total = (await one(`SELECT COUNT(*)::int AS n FROM "LearningCourse" k WHERE ${where.join(' AND ')}`, params))?.n || 0;
    params.push(perPage); params.push((Math.max(1, page) - 1) * perPage);
    const rows = await many(
        `SELECT k.*, c.name AS "collectionName", c.slug AS "collectionSlug",
                (SELECT COUNT(*)::int FROM "LearningLesson" l WHERE l."courseId"=k.id) AS "lessonCount"
         FROM "LearningCourse" k LEFT JOIN "LearningCollection" c ON c.id=k."collectionId"
         WHERE ${where.join(' AND ')}
         ORDER BY CASE k.status WHEN 'in_review' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, k."submittedAt" DESC NULLS LAST, k."updatedAt" DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { rows, total };
};
export const adminSummary = async (scope) => {
    const params = [];
    const where = scopeWhere(scope, 'k', params);
    const r = await one(
        `SELECT COUNT(*) FILTER (WHERE k.status='in_review')::int AS "inReview",
                COUNT(*) FILTER (WHERE k.status='approved')::int AS approved,
                COUNT(*) FILTER (WHERE k.status='published')::int AS published,
                COUNT(*) FILTER (WHERE k.status='changes_requested')::int AS "changesRequested",
                COUNT(*) FILTER (WHERE k.status IN ('draft'))::int AS drafts,
                COUNT(*)::int AS total,
                COUNT(DISTINCT k."collectionId")::int AS collections,
                COUNT(DISTINCT k."siteId")::int AS sites
         FROM "LearningCourse" k WHERE ${where}`, params);
    return r || { inReview: 0, approved: 0, published: 0, changesRequested: 0, drafts: 0, total: 0, collections: 0, sites: 0 };
};

// ─── Biblioteca pública ──────────────────────────────────────────────
/** Cursos PUBLICADOS visibles para un sitio: los suyos y, si es distrito, los de sus clubes. */
export const listPublishedCourses = async ({ siteId, districtNumber, q: text, area, access, club, collectionId, tag, limit = 200 } = {}) => {
    const params = [];
    const vis = [];
    if (siteId) { params.push(siteId); vis.push(`k."siteId"=$${params.length}`); }
    if (districtNumber) { params.push(String(districtNumber)); vis.push(`k."districtNumber"=$${params.length}`); }
    const where = [`k.status='published'`, vis.length ? `(${vis.join(' OR ')})` : 'FALSE'];
    if (text) { params.push(`%${String(text).trim()}%`); where.push(`(k.title ILIKE $${params.length} OR k."shortDescription" ILIKE $${params.length} OR k."ownerClubName" ILIKE $${params.length} OR k."projectRef" ILIKE $${params.length} OR array_to_string(k.tags, ' ') ILIKE $${params.length})`); }
    if (area) { params.push(area); where.push(`k."areaFocus"=$${params.length}`); }
    if (access) { params.push(access); where.push(`k."accessMode"=$${params.length}`); }
    if (club) { params.push(`%${club}%`); where.push(`k."ownerClubName" ILIKE $${params.length}`); }
    if (collectionId) { params.push(collectionId); where.push(`k."collectionId"=$${params.length}`); }
    if (tag) { params.push(tag); where.push(`$${params.length} = ANY(k.tags)`); }
    params.push(Math.min(500, limit));
    return many(
        `SELECT k.*, c.name AS "collectionName", c.slug AS "collectionSlug",
                (SELECT COUNT(*)::int FROM "LearningLesson" l WHERE l."courseId"=k.id) AS "lessonCount",
                (SELECT COALESCE(SUM(l."durationMinutes"),0)::int FROM "LearningLesson" l WHERE l."courseId"=k.id) AS "lessonMinutes"
         FROM "LearningCourse" k LEFT JOIN "LearningCollection" c ON c.id=k."collectionId"
         WHERE ${where.join(' AND ')} ORDER BY k."publishedAt" DESC NULLS LAST LIMIT $${params.length}`, params);
};
/** Colecciones con al menos un curso publicado, visibles para el sitio. */
export const listPublishedCollections = async ({ siteId, districtNumber } = {}) => {
    const params = [];
    const vis = [];
    if (siteId) { params.push(siteId); vis.push(`c."siteId"=$${params.length}`); }
    if (districtNumber) { params.push(String(districtNumber)); vis.push(`c."districtNumber"=$${params.length}`); }
    return many(
        `SELECT c.*, (SELECT COUNT(*)::int FROM "LearningCourse" k WHERE k."collectionId"=c.id AND k.status='published') AS "publishedCount"
         FROM "LearningCollection" c
         WHERE c.status='active' AND (${vis.length ? vis.join(' OR ') : 'FALSE'})
           AND EXISTS (SELECT 1 FROM "LearningCourse" k WHERE k."collectionId"=c.id AND k.status='published')
         ORDER BY c."updatedAt" DESC LIMIT 200`, params);
};
export const bumpViews = (courseId) => q(`UPDATE "LearningCourse" SET "viewCount"="viewCount"+1 WHERE id=$1`, [courseId]).catch(() => {});

export default {
    newToken, uniqueSlug, createCollection, getCollection, getCollectionBySlug, updateCollection, listCollections,
    countCourses, createCourse, getCourse, getCourseBySlug, updateCourse, writeCourseStatus, listCoursesOfCollection, listStandaloneCourses, reorderCourses, courseBundle,
    createModule, getModule, updateModule, deleteModule, createLesson, getLesson, updateLesson, deleteLesson, createResource, getResource, updateResource, deleteResource, reorderChildren,
    createFile, getFile, markFileReady, markFileDeleted, countFiles, pendingUploadFor, filesOfCourse,
    logEvent, listEvents, listCollectionEvents, claimNotification, finishNotification, getConfig, saveConfig,
    listAdminCourses, adminSummary, listPublishedCourses, listPublishedCollections, bumpViews,
};
