// ════════════════════════════════════════════════════════════════════
// Cursos y capacitaciones (LMS) — controlador — v4.1302.0
//
// Tres puertas sobre las mismas tablas:
//
//   /mis/…      el CLUB (token del panel): colecciones, cursos, módulos,
//               lecciones, recursos, archivos, enviar a revisión. Alcanza lo
//               de SU sitio; un sitio distrital alcanza lo de sus clubes.
//   /admin/…    el COMITÉ (rol de administración o permiso de Rotary en
//               Acción): revisar, pedir correcciones, aprobar, publicar,
//               despublicar, archivar, configurar.
//   /public/…   la BIBLIOTECA: sólo cursos `published`; el contenido se
//               entrega según la modalidad de acceso (`accessDecision`).
//
// ⚠️ EL ESTADO DE UN CURSO SÓLO CAMBIA POR `applyStatus`: valida la
// transición contra la tabla que corresponde (club o comité), exige motivo
// cuando la tabla lo pide, registra el evento y dispara el aviso. Ningún otro
// sitio escribe `status` (la prueba cuenta las escrituras).
//
// ⚠️ NADA SE PUBLICA SOLO. Que el club cargue materiales no los hace
// visibles: aparecen en la biblioteca únicamente cuando el comité publica.
// Una instrucción escrita dentro de una descripción o un documento es TEXTO:
// aquí no se interpreta ni cambia permisos.
// ════════════════════════════════════════════════════════════════════
import jwt from 'jsonwebtoken';
import db from '../lib/db.js';
import { JWT_SECRET, PLATFORM_AUDIENCE } from '../middleware/auth.js';
import * as S from '../lib/learningStore.js';
import * as St from '../lib/learningStorage.js';
import {
    COURSE_STATES, DISPLAY_STATES, CLUB_TRANSITIONS, ADMIN_TRANSITIONS, NOTE_REQUIRED, CLUB_EDITABLE, canTransition, COLLECTION_STATES,
    ACCESS_MODES, ACCESS_MODE_IDS, AUDIENCES, LEVELS, LANGUAGES, AREAS, LMS_FEATURES, FILE_PURPOSES, PUBLIC_PURPOSES, learningLimits,
    checkLearningFile, checkExternalUrl, embedFor, sanitizePatch, COLLECTION_FIELDS, COURSE_FIELDS, MODULE_FIELDS, LESSON_FIELDS, RESOURCE_FIELDS,
    readinessOf, durationOf, displayStatusOf, isUploadStale, accessDecision, ACCESS_DENIED_TEXT, publicCourseCard, lessonHasContent,
} from '../lib/learningSpec.js';
import { notifyCourseSubmitted, notifyCourseDecision } from '../lib/learningNotify.js';

console.log('[learningController] v4.1302.0 cargado — Cursos y capacitaciones (LMS Fase 1): colecciones, cursos, módulos, lecciones, recursos, carga directa confirmada por bytes, revisión del comité y biblioteca pública por modalidad de acceso.');

const fail = (res, e, code = 500) => res.status(code).json({ error: e?.message || 'Error' });
const actorOf = (req) => ({ id: req.user?.id || null, name: req.user?.name || req.user?.email || null, email: req.user?.email || null, role: req.user?.role || null });
const hostOf = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '');
const ALL_ROLES = ['superadmin', 'administrator'];
const EVENT_ATTENDEE_AUDIENCE = 'event-attendee-portal';

// ─── Catálogos para los formularios ───────────────────────────────────
const catalogs = () => ({
    states: COURSE_STATES, displayStates: DISPLAY_STATES, collectionStates: COLLECTION_STATES,
    accessModes: ACCESS_MODES, audiences: AUDIENCES, levels: LEVELS, languages: LANGUAGES, areas: AREAS, features: LMS_FEATURES,
    filePurposes: Object.fromEntries(Object.entries(FILE_PURPOSES).map(([k, v]) => [k, { label: v.label, exts: v.exts, visibility: v.visibility }])),
    limits: (() => { const l = learningLimits(); return { image: l.image, video: l.video, audio: l.audio, document: l.document, resource: l.design, filesPerCourse: l.filesPerCourse, multipartThreshold: l.multipartThreshold, partSize: l.partSize }; })(),
    clubTransitions: CLUB_TRANSITIONS, adminTransitions: ADMIN_TRANSITIONS, editableStates: CLUB_EDITABLE,
});

// ─── Sitio y alcance ──────────────────────────────────────────────────
const siteRowOf = async (clubId) => {
    if (!clubId) return null;
    const { rows } = await db.query(`SELECT id, name, type, category, district, "districtId" FROM "Club" WHERE id=$1 LIMIT 1`, [String(clubId)]).catch(() => ({ rows: [] }));
    return rows[0] || null;
};
const districtNumberOf = (site) => (site?.district ? String(site.district).replace(/\D/g, '') || String(site.district) : null);

/** El alcance de una sesión: todo, su distrito o su sitio. */
const scopeFor = (user, site) => {
    if (ALL_ROLES.includes(user?.role)) return { all: true };
    const siteIds = site?.id ? [site.id] : [];
    const districtNumbers = [];
    if (site?.type === 'district' || user?.role === 'district_admin') {
        const dn = districtNumberOf(site);
        if (dn) districtNumbers.push(dn);
    }
    return { all: false, siteIds, districtNumbers };
};
const inScope = (scope, row) => Boolean(scope?.all)
    || (Array.isArray(scope?.siteIds) && scope.siteIds.includes(row?.siteId))
    || (Array.isArray(scope?.districtNumbers) && row?.districtNumber && scope.districtNumbers.includes(String(row.districtNumber)));

/** Contexto del portal del club. Exige un sitio asociado a la cuenta. */
const portalContext = async (req, res) => {
    const site = await siteRowOf(req.user?.clubId);
    if (!site && !ALL_ROLES.includes(req.user?.role)) { res.status(403).json({ error: 'Tu cuenta no tiene un sitio (club o distrito) asociado. Pide al administrador que la vincule.' }); return null; }
    return { user: req.user, site, scope: scopeFor(req.user, site), actor: actorOf(req) };
};

const loadCollection = async (ctx, id, res) => {
    const c = await S.getCollection(id);
    if (!c || !inScope(ctx.scope, c)) { res.status(404).json({ error: 'Colección no encontrada.' }); return null; }
    return c;
};
const loadCourse = async (ctx, id, res) => {
    const k = await S.getCourse(id);
    if (!k || !inScope(ctx.scope, k)) { res.status(404).json({ error: 'Curso no encontrado.' }); return null; }
    return k;
};
const requireEditable = (k, res) => {
    if (!CLUB_EDITABLE.includes(k.status)) { res.status(409).json({ error: `El curso está «${COURSE_STATES[k.status]?.label || k.status}»: para editarlo primero retíralo de la revisión o pide al comité que lo despublique.`, status: k.status }); return false; }
    return true;
};

const shapeCourse = (k, bundle, config) => {
    const readiness = readinessOf(k, bundle, config);
    const files = bundle.files.map(f => ({ id: f.id, purpose: f.purpose, visibility: f.visibility, filename: f.filename, bytes: Number(f.bytes), kind: f.kind, status: f.status, format: f.format, publicUrl: f.publicUrl, durationSeconds: f.durationSeconds, contentType: f.contentType, createdAt: f.createdAt }));
    return {
        course: { ...k, viewCount: Number(k.viewCount) || 0 },
        modules: bundle.modules, lessons: bundle.lessons, resources: bundle.resources, files,
        readiness, displayStatus: displayStatusOf(k, readiness), durationMinutes: durationOf(k, bundle.lessons),
        editable: CLUB_EDITABLE.includes(k.status), transitions: CLUB_TRANSITIONS[k.status] || [],
    };
};
const courseSummary = async (k, config) => {
    const bundle = await S.courseBundle(k.id);
    const readiness = readinessOf(k, bundle, config);
    return {
        id: k.id, slug: k.slug, title: k.title, subtitle: k.subtitle, shortDescription: k.shortDescription, coverUrl: k.coverUrl || k.thumbnailUrl || '',
        status: k.status, displayStatus: displayStatusOf(k, readiness), readiness: { ready: readiness.ready, done: readiness.done, total: readiness.total, missing: readiness.missing },
        lessonCount: bundle.lessons.length, moduleCount: bundle.modules.length, fileCount: bundle.files.length, uploadingCount: bundle.files.filter(f => f.status === 'uploading').length,
        durationMinutes: durationOf(k, bundle.lessons), accessMode: k.accessMode, sortOrder: k.sortOrder, collectionId: k.collectionId, reviewNote: k.reviewNote,
        updatedAt: k.updatedAt, lastEditedAt: k.lastEditedAt, submittedAt: k.submittedAt, publishedAt: k.publishedAt, projectRef: k.projectRef, ownerClubName: k.ownerClubName,
    };
};

// ─── EL ÚNICO SITIO QUE CAMBIA EL ESTADO ──────────────────────────────
const applyStatus = async ({ course, to, by, actor, note = '', host = '' }) => {
    const table = by === 'admin' ? ADMIN_TRANSITIONS : CLUB_TRANSITIONS;
    if (!canTransition(table, course.status, to)) {
        const err = new Error(`De «${COURSE_STATES[course.status]?.label || course.status}» no se puede pasar a «${COURSE_STATES[to]?.label || to}».`);
        err.code = 409; err.allowed = table[course.status] || [];
        throw err;
    }
    if (NOTE_REQUIRED.has(to) && !String(note || '').trim()) { const err = new Error('Indica el motivo: el club lo leerá en su ficha.'); err.code = 400; throw err; }
    const patch = {};
    const now = new Date();
    if (to === 'in_review') { patch.submittedAt = now; patch.reviewNote = null; }
    if (to === 'approved' && course.status === 'in_review') { patch.approvedAt = now; patch.reviewedAt = now; patch.reviewedById = actor?.id || null; patch.reviewNote = note || null; }
    if (to === 'approved' && course.status === 'published') { patch.publishedAt = null; }
    if (to === 'changes_requested') { patch.reviewedAt = now; patch.reviewedById = actor?.id || null; patch.reviewNote = String(note).trim(); }
    if (to === 'published') { patch.publishedAt = now; patch.publishedById = actor?.id || null; }
    const updated = await S.writeCourseStatus(course.id, to, patch);
    await S.logEvent({ entityType: 'course', entityId: course.id, courseId: course.id, collectionId: course.collectionId, siteId: course.siteId, action: `status:${to}`, actor, detail: { from: course.status, to, note: note || null, by } });
    return updated;
};

// ═══════════════════════════════════════════════════════════════════
// PORTAL DEL CLUB — /mis
// ═══════════════════════════════════════════════════════════════════
export const portalOverview = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const config = await S.getConfig('global');
        const [collections, standalone] = await Promise.all([S.listCollections(ctx.scope), S.listStandaloneCourses(ctx.scope)]);
        const standaloneCards = await Promise.all(standalone.map(k => courseSummary(k, config)));
        res.json({
            site: ctx.site ? { id: ctx.site.id, name: ctx.site.name, type: ctx.site.type, district: ctx.site.district } : null,
            scope: ctx.scope, collections, standalone: standaloneCards, config: { rightsText: config.rightsText, requireRights: config.requireRights, maxCoursesPerCollection: config.maxCoursesPerCollection, categories: config.categories, allowExternalVideo: config.allowExternalVideo, enabled: config.enabled },
            catalogs: catalogs(),
        });
    } catch (e) { return fail(res, e); }
};

const siteForNewRow = async (ctx, body) => {
    // Un sitio distrital o el operador pueden crear en nombre de un club de su alcance.
    const target = body?.siteId ? await siteRowOf(body.siteId) : ctx.site;
    if (!target) { const err = new Error('Indica el club responsable.'); err.code = 400; throw err; }
    const dn = districtNumberOf(target);
    if (!ctx.scope.all && target.id !== ctx.site?.id && !(dn && ctx.scope.districtNumbers.includes(dn))) { const err = new Error('No puedes crear en nombre de ese club.'); err.code = 403; throw err; }
    return { siteId: target.id, ownerClubId: target.id, ownerClubName: target.name, districtNumber: dn, districtId: target.districtId || null };
};

export const portalCreateCollection = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const config = await S.getConfig('global');
        if (!config.enabled) return res.status(409).json({ error: 'El módulo de cursos está desactivado por el Distrito.' });
        const { values, errors } = sanitizePatch(req.body || {}, COLLECTION_FIELDS);
        if (!String(values.name || '').trim()) errors.push({ field: 'name', message: 'Escribe el nombre de la colección.' });
        if (errors.length) return res.status(400).json({ error: errors[0].message, errors });
        const owner = await siteForNewRow(ctx, req.body);
        const c = await S.createCollection({ ...values, ...owner, createdById: ctx.user.id, createdByName: ctx.actor.name });
        await S.logEvent({ entityType: 'collection', entityId: c.id, collectionId: c.id, siteId: c.siteId, action: 'collection:created', actor: ctx.actor, detail: { name: c.name } });
        res.status(201).json({ collection: c });
    } catch (e) { return fail(res, e, e.code || 500); }
};

export const portalGetCollection = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const c = await loadCollection(ctx, req.params.id, res); if (!c) return;
        const config = await S.getConfig('global');
        const rows = await S.listCoursesOfCollection(c.id);
        const courses = await Promise.all(rows.map(k => courseSummary(k, config)));
        const events = await S.listCollectionEvents(c.id);
        res.json({ collection: c, courses, events, config: { rightsText: config.rightsText, requireRights: config.requireRights, maxCoursesPerCollection: config.maxCoursesPerCollection }, catalogs: catalogs() });
    } catch (e) { return fail(res, e); }
};

export const portalPatchCollection = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const c = await loadCollection(ctx, req.params.id, res); if (!c) return;
        if (c.status === 'archived') return res.status(409).json({ error: 'La colección está archivada: restáurala para editarla.' });
        const { values, errors } = sanitizePatch(req.body || {}, COLLECTION_FIELDS);
        if (errors.length) return res.status(400).json({ error: errors[0].message, errors });
        if ('name' in values && !String(values.name || '').trim()) return res.status(400).json({ error: 'El nombre no puede quedar vacío.', errors: [{ field: 'name', message: 'Escribe el nombre.' }] });
        const updated = await S.updateCollection(c.id, values);
        res.json({ collection: updated, savedAt: updated.updatedAt });
    } catch (e) { return fail(res, e); }
};

export const portalCollectionStatus = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const c = await loadCollection(ctx, req.params.id, res); if (!c) return;
        const to = req.body?.status === 'archived' ? 'archived' : 'active';
        const updated = await S.updateCollection(c.id, { status: to });
        await S.logEvent({ entityType: 'collection', entityId: c.id, collectionId: c.id, siteId: c.siteId, action: `collection:${to}`, actor: ctx.actor });
        res.json({ collection: updated });
    } catch (e) { return fail(res, e); }
};

export const portalReorderCourses = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const c = await loadCollection(ctx, req.params.id, res); if (!c) return;
        const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).slice(0, 500);
        const current = await S.listCoursesOfCollection(c.id);
        const known = new Set(current.map(k => k.id));
        const ordered = ids.filter(id => known.has(id));
        for (const k of current) if (!ordered.includes(k.id)) ordered.push(k.id);
        await S.reorderCourses(c.id, ordered);
        res.json({ ok: true, ids: ordered });
    } catch (e) { return fail(res, e); }
};

export const portalCollectionInvite = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const c = await loadCollection(ctx, req.params.id, res); if (!c) return;
        const updated = await S.updateCollection(c.id, { inviteToken: S.newToken() });
        await S.logEvent({ entityType: 'collection', entityId: c.id, collectionId: c.id, siteId: c.siteId, action: 'collection:invite_rotated', actor: ctx.actor });
        res.json({ inviteToken: updated.inviteToken });
    } catch (e) { return fail(res, e); }
};

/** Portada de la colección: imagen pública, un PUT. El cliente hace PATCH coverUrl al terminar. */
export const portalCollectionCoverPresign = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const c = await loadCollection(ctx, req.params.id, res); if (!c) return;
        const juicio = checkLearningFile({ filename: req.body?.filename, size: req.body?.size, purpose: 'collection_cover' });
        if (!juicio.ok) return res.status(400).json({ error: juicio.errores[0], errores: juicio.errores });
        const key = St.newPublicKey(c.siteId, juicio.ext);
        const { uploadUrl, cacheControl } = await St.presignPublicPut({ key, contentType: juicio.mime });
        const f = await S.createFile({ collectionId: c.id, siteId: c.siteId, purpose: 'collection_cover', visibility: 'public', storageKey: key, publicUrl: St.publicUrlOf(key), filename: String(req.body?.filename || '').slice(0, 240), contentType: juicio.mime, bytes: Number(req.body?.size) || 0, kind: 'image', uploadedById: ctx.user.id });
        res.json({ ok: true, mode: 'single', fileId: f.id, uploadUrl, contentType: juicio.mime, cacheControl, publicUrl: f.publicUrl });
    } catch (e) { return fail(res, e); }
};
export const portalCollectionCoverComplete = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const c = await loadCollection(ctx, req.params.id, res); if (!c) return;
        const f = await S.getFile(req.body?.fileId);
        if (!f || f.collectionId !== c.id || !St.publicKeyBelongs(f.storageKey, c.siteId)) return res.status(404).json({ error: 'Archivo no encontrado.' });
        const ext = String(f.filename).split('.').pop().toLowerCase();
        let real; try { real = await St.inspectObject(f.storageKey, ext); } catch { return res.status(409).json({ error: 'No encontramos la imagen subida. Reintenta.' }); }
        if (!real.bytes || !real.format) { await St.deleteObject(f.storageKey); await S.markFileDeleted(f.id); return res.status(400).json({ error: `El contenido no corresponde a una imagen .${ext}. No se guardó.` }); }
        await S.markFileReady(f.id, { bytes: real.bytes, format: real.format, contentType: real.contentType });
        const updated = await S.updateCollection(c.id, { coverUrl: f.publicUrl });
        res.json({ ok: true, coverUrl: f.publicUrl, collection: updated });
    } catch (e) { return fail(res, e); }
};

export const portalCreateCourse = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const config = await S.getConfig('global');
        if (!config.enabled) return res.status(409).json({ error: 'El módulo de cursos está desactivado por el Distrito.' });
        let collection = null;
        if (req.body?.collectionId) {
            collection = await loadCollection(ctx, req.body.collectionId, res); if (!collection) return;
            if (collection.status === 'archived') return res.status(409).json({ error: 'La colección está archivada.' });
            if (config.maxCoursesPerCollection > 0 && (await S.countCourses(collection.id)) >= config.maxCoursesPerCollection) return res.status(409).json({ error: `Esta colección llegó al máximo configurado de ${config.maxCoursesPerCollection} cursos.` });
        }
        const owner = collection
            ? { siteId: collection.siteId, ownerClubId: collection.ownerClubId, ownerClubName: collection.ownerClubName, districtNumber: collection.districtNumber, districtId: collection.districtId }
            : await siteForNewRow(ctx, req.body);
        const k = await S.createCourse({
            ...owner, collectionId: collection?.id || null, title: String(req.body?.title || '').slice(0, 160),
            projectRef: collection?.projectRef || String(req.body?.projectRef || '').slice(0, 80) || null,
            accessMode: ACCESS_MODE_IDS.includes(req.body?.accessMode) ? req.body.accessMode : (collection?.accessMode || 'public'),
            areaFocus: collection?.areaFocus || null, audience: collection?.audience || [], createdById: ctx.user.id, createdByName: ctx.actor.name,
        });
        await S.logEvent({ entityType: 'course', entityId: k.id, courseId: k.id, collectionId: k.collectionId, siteId: k.siteId, action: 'course:created', actor: ctx.actor, detail: { title: k.title } });
        res.status(201).json({ course: k });
    } catch (e) { return fail(res, e, e.code || 500); }
};

export const portalGetCourse = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const k = await loadCourse(ctx, req.params.id, res); if (!k) return;
        const [bundle, config, events] = await Promise.all([S.courseBundle(k.id), S.getConfig('global'), S.listEvents(k.id)]);
        const collection = k.collectionId ? await S.getCollection(k.collectionId) : null;
        res.json({ ...shapeCourse(k, bundle, config), collection: collection ? { id: collection.id, name: collection.name, slug: collection.slug, projectRef: collection.projectRef } : null, events, config: { rightsText: config.rightsText, requireRights: config.requireRights, allowExternalVideo: config.allowExternalVideo, categories: config.categories }, catalogs: catalogs() });
    } catch (e) { return fail(res, e); }
};

export const portalPatchCourse = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const k = await loadCourse(ctx, req.params.id, res); if (!k) return;
        if (!requireEditable(k, res)) return;
        const config = await S.getConfig('global');
        const { values, errors } = sanitizePatch(req.body || {}, COURSE_FIELDS);
        if (errors.length) return res.status(400).json({ error: errors[0].message, errors });
        if ('introVideoUrl' in values && values.introVideoUrl && !config.allowExternalVideo) return res.status(400).json({ error: 'El Distrito no admite videos externos en esta edición.' });
        if ('rightsAccepted' in values) { values.rightsText = values.rightsAccepted ? config.rightsText : null; values.rightsAt = values.rightsAccepted ? new Date() : null; }
        if ('features' in values) values.features = Object.fromEntries(Object.keys(LMS_FEATURES).map(f => [f, Boolean(values.features?.[f])]));
        const updated = await S.updateCourse(k.id, values, ctx.user.id);
        const bundle = await S.courseBundle(k.id);
        const readiness = readinessOf(updated, bundle, config);
        res.json({ course: updated, savedAt: updated.updatedAt, readiness, displayStatus: displayStatusOf(updated, readiness), durationMinutes: durationOf(updated, bundle.lessons) });
    } catch (e) { return fail(res, e); }
};

export const portalDuplicateCourse = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const k = await loadCourse(ctx, req.params.id, res); if (!k) return;
        const bundle = await S.courseBundle(k.id);
        const copy = await S.createCourse({ collectionId: k.collectionId, siteId: k.siteId, ownerClubId: k.ownerClubId, ownerClubName: k.ownerClubName, districtNumber: k.districtNumber, districtId: k.districtId, title: `${k.title || 'Curso'} (copia)`, projectRef: k.projectRef, accessMode: k.accessMode, areaFocus: k.areaFocus, audience: k.audience, createdById: ctx.user.id, createdByName: ctx.actor.name, language: k.language });
        await S.updateCourse(copy.id, { subtitle: k.subtitle, shortDescription: k.shortDescription, fullDescription: k.fullDescription, learningObjective: k.learningObjective, level: k.level, instructorName: k.instructorName, instructorBio: k.instructorBio, organization: k.organization, tags: k.tags, features: k.features, durationAuto: k.durationAuto, durationMinutes: k.durationMinutes }, ctx.user.id);
        // Se duplica la ESTRUCTURA (módulos, lecciones, enlaces), no los archivos: cada curso tiene los suyos.
        const moduleMap = {};
        for (const m of bundle.modules) { const nm = await S.createModule(copy.id, { title: m.title, description: m.description }); moduleMap[m.id] = nm.id; }
        const lessonMap = {};
        for (const l of bundle.lessons) { const nl = await S.createLesson(copy.id, { moduleId: l.moduleId ? moduleMap[l.moduleId] : null, title: l.title, description: l.description, body: l.body, videoUrl: l.videoUrl, durationMinutes: l.durationMinutes }); lessonMap[l.id] = nl.id; }
        for (const r of bundle.resources) if (r.url) await S.createResource(copy.id, { lessonId: r.lessonId ? lessonMap[r.lessonId] : null, kind: 'link', url: r.url, title: r.title, description: r.description });
        await S.logEvent({ entityType: 'course', entityId: copy.id, courseId: copy.id, collectionId: copy.collectionId, siteId: copy.siteId, action: 'course:duplicated', actor: ctx.actor, detail: { from: k.id } });
        res.status(201).json({ course: await S.getCourse(copy.id) });
    } catch (e) { return fail(res, e); }
};

export const portalSubmitCourse = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const k = await loadCourse(ctx, req.params.id, res); if (!k) return;
        const [bundle, config] = await Promise.all([S.courseBundle(k.id), S.getConfig('global')]);
        const readiness = readinessOf(k, bundle, config);
        if (!readiness.ready) return res.status(422).json({ error: `Todavía falta: ${readiness.missing.map(m => m.label).join('; ')}.`, missing: readiness.missing, warnings: readiness.warnings });
        if (bundle.files.some(f => f.status === 'uploading' && !isUploadStale(f))) return res.status(422).json({ error: 'Hay archivos todavía en carga. Espera a que terminen o quítalos.' });
        const updated = await applyStatus({ course: k, to: 'in_review', by: 'club', actor: ctx.actor, host: hostOf(req) });
        notifyCourseSubmitted({ course: updated, config, host: hostOf(req) }).catch(() => {});
        res.json({ course: updated, displayStatus: 'in_review' });
    } catch (e) { return res.status(e.code || 500).json({ error: e.message, allowed: e.allowed }); }
};

export const portalCourseStatus = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const k = await loadCourse(ctx, req.params.id, res); if (!k) return;
        const to = String(req.body?.to || '');
        if (to === 'in_review') return res.status(400).json({ error: 'Para enviar a revisión usa la acción «Enviar».' });
        const updated = await applyStatus({ course: k, to, by: 'club', actor: ctx.actor, host: hostOf(req) });
        res.json({ course: updated });
    } catch (e) { return res.status(e.code || 500).json({ error: e.message, allowed: e.allowed }); }
};

// ─── Módulos, lecciones, recursos ─────────────────────────────────────
const editableCourse = async (req, res) => {
    const ctx = await portalContext(req, res); if (!ctx) return null;
    const k = await loadCourse(ctx, req.params.id, res); if (!k) return null;
    if (!requireEditable(k, res)) return null;
    return { ctx, k };
};
const touched = async (k, editorId) => { await S.updateCourse(k.id, {}, editorId); };

export const portalCreateModule = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const { values } = sanitizePatch(req.body || {}, MODULE_FIELDS);
        const m = await S.createModule(L.k.id, values); await touched(L.k, L.ctx.user.id);
        res.status(201).json({ module: m });
    } catch (e) { return fail(res, e); }
};
export const portalPatchModule = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const m = await S.getModule(req.params.mid); if (!m || m.courseId !== L.k.id) return res.status(404).json({ error: 'Módulo no encontrado.' });
        const { values } = sanitizePatch(req.body || {}, MODULE_FIELDS);
        const updated = await S.updateModule(m.id, values); await touched(L.k, L.ctx.user.id);
        res.json({ module: updated, savedAt: updated.updatedAt });
    } catch (e) { return fail(res, e); }
};
export const portalDeleteModule = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const m = await S.getModule(req.params.mid); if (!m || m.courseId !== L.k.id) return res.status(404).json({ error: 'Módulo no encontrado.' });
        await S.deleteModule(m.id, L.k.id); await touched(L.k, L.ctx.user.id);
        res.json({ ok: true });
    } catch (e) { return fail(res, e); }
};
export const portalCreateLesson = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const { values, errors } = sanitizePatch(req.body || {}, LESSON_FIELDS);
        if (errors.length) return res.status(400).json({ error: errors[0].message, errors });
        if (values.moduleId) { const m = await S.getModule(values.moduleId); if (!m || m.courseId !== L.k.id) return res.status(400).json({ error: 'El módulo no es de este curso.' }); }
        const l = await S.createLesson(L.k.id, values); await touched(L.k, L.ctx.user.id);
        res.status(201).json({ lesson: l });
    } catch (e) { return fail(res, e); }
};
export const portalPatchLesson = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const l = await S.getLesson(req.params.lid); if (!l || l.courseId !== L.k.id) return res.status(404).json({ error: 'Lección no encontrada.' });
        const { values, errors } = sanitizePatch(req.body || {}, LESSON_FIELDS);
        if (errors.length) return res.status(400).json({ error: errors[0].message, errors });
        if (values.moduleId) { const m = await S.getModule(values.moduleId); if (!m || m.courseId !== L.k.id) return res.status(400).json({ error: 'El módulo no es de este curso.' }); }
        for (const key of ['videoFileId', 'audioFileId']) {
            if (values[key]) { const f = await S.getFile(values[key]); if (!f || f.courseId !== L.k.id || f.status === 'deleted') return res.status(400).json({ error: 'El archivo no es de este curso.' }); }
        }
        const updated = await S.updateLesson(l.id, values); await touched(L.k, L.ctx.user.id);
        res.json({ lesson: updated, savedAt: updated.updatedAt });
    } catch (e) { return fail(res, e); }
};
export const portalDeleteLesson = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const l = await S.getLesson(req.params.lid); if (!l || l.courseId !== L.k.id) return res.status(404).json({ error: 'Lección no encontrada.' });
        await S.deleteLesson(l.id, L.k.id); await touched(L.k, L.ctx.user.id);
        res.json({ ok: true });
    } catch (e) { return fail(res, e); }
};
export const portalCreateResource = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const { values, errors } = sanitizePatch(req.body || {}, RESOURCE_FIELDS);
        if (errors.length) return res.status(400).json({ error: errors[0].message, errors });
        if (!values.url && !values.fileId) return res.status(400).json({ error: 'Un recurso lleva un archivo o un enlace.' });
        if (values.fileId) { const f = await S.getFile(values.fileId); if (!f || f.courseId !== L.k.id || f.status === 'deleted') return res.status(400).json({ error: 'El archivo no es de este curso.' }); if (!values.title) values.title = f.filename; }
        if (values.lessonId) { const l = await S.getLesson(values.lessonId); if (!l || l.courseId !== L.k.id) return res.status(400).json({ error: 'La lección no es de este curso.' }); }
        const r = await S.createResource(L.k.id, { ...values, kind: values.url ? 'link' : 'file' }); await touched(L.k, L.ctx.user.id);
        res.status(201).json({ resource: r });
    } catch (e) { return fail(res, e); }
};
export const portalPatchResource = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const r = await S.getResource(req.params.rid); if (!r || r.courseId !== L.k.id) return res.status(404).json({ error: 'Recurso no encontrado.' });
        const { values, errors } = sanitizePatch(req.body || {}, RESOURCE_FIELDS);
        if (errors.length) return res.status(400).json({ error: errors[0].message, errors });
        delete values.fileId;
        const updated = await S.updateResource(r.id, values); await touched(L.k, L.ctx.user.id);
        res.json({ resource: updated, savedAt: updated.updatedAt });
    } catch (e) { return fail(res, e); }
};
export const portalDeleteResource = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const r = await S.getResource(req.params.rid); if (!r || r.courseId !== L.k.id) return res.status(404).json({ error: 'Recurso no encontrado.' });
        await S.deleteResource(r.id, L.k.id); await touched(L.k, L.ctx.user.id);
        res.json({ ok: true });
    } catch (e) { return fail(res, e); }
};
/** Reordena módulos, lecciones (con su módulo) y recursos en una sola llamada. */
export const portalReorderContent = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const b = req.body || {};
        if (Array.isArray(b.modules)) await S.reorderChildren('LearningModule', L.k.id, b.modules.map(String).slice(0, 500));
        if (Array.isArray(b.lessons)) {
            // [{ moduleId, ids: [...] }] — una lista por módulo (null = sin módulo)
            for (const grp of b.lessons.slice(0, 200)) {
                if (!grp || !Array.isArray(grp.ids)) continue;
                if (grp.moduleId) { const m = await S.getModule(grp.moduleId); if (!m || m.courseId !== L.k.id) continue; }
                await S.reorderChildren('LearningLesson', L.k.id, grp.ids.map(String).slice(0, 500), { moduleId: grp.moduleId || null });
            }
        }
        if (Array.isArray(b.resources)) await S.reorderChildren('LearningResource', L.k.id, b.resources.map(String).slice(0, 500));
        await touched(L.k, L.ctx.user.id);
        res.json({ ok: true });
    } catch (e) { return fail(res, e); }
};

// ─── Archivos del curso ───────────────────────────────────────────────
export const portalFilePresign = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const limits = learningLimits();
        const filename = String(req.body?.filename || '').slice(0, 240);
        const size = Number(req.body?.size) || 0;
        const purpose = String(req.body?.purpose || '');
        if (purpose === 'collection_cover') return res.status(400).json({ error: 'La portada de la colección se sube desde la colección.' });
        const juicio = checkLearningFile({ filename, size, purpose }, limits);
        if (!juicio.ok) return res.status(400).json({ error: juicio.errores[0], errores: juicio.errores });
        if ((await S.countFiles(L.k.id)) >= limits.filesPerCourse) return res.status(400).json({ error: `Este curso ya tiene ${limits.filesPerCourse} archivos.` });
        const isPublic = PUBLIC_PURPOSES.includes(purpose);
        if (isPublic) {
            const key = St.newPublicKey(L.k.siteId, juicio.ext);
            const { uploadUrl, cacheControl } = await St.presignPublicPut({ key, contentType: juicio.mime });
            const f = await S.createFile({ courseId: L.k.id, collectionId: L.k.collectionId, siteId: L.k.siteId, purpose, visibility: 'public', storageKey: key, publicUrl: St.publicUrlOf(key), filename, contentType: juicio.mime, bytes: size, kind: juicio.kind, uploadedById: L.ctx.user.id });
            return res.json({ ok: true, mode: 'single', fileId: f.id, uploadUrl, contentType: juicio.mime, cacheControl, publicUrl: f.publicUrl });
        }
        if (juicio.multipart) {
            const prev = await S.pendingUploadFor(L.k.id, { filename, bytes: size, purpose });
            if (prev && St.privateKeyBelongs(prev.storageKey, L.k.id)) {
                const done = await St.listUploadedParts({ key: prev.storageKey, uploadId: prev.uploadId }).catch(() => null);
                if (done) return res.json({ ok: true, mode: 'multipart', fileId: prev.id, partSize: limits.partSize, parts: Math.ceil(size / limits.partSize), done: done.map(p => p.partNumber), resumed: true });
            }
            const key = St.newPrivateKey(L.k.id, juicio.ext);
            const { uploadId } = await St.startMultipart({ key, contentType: juicio.mime });
            const f = await S.createFile({ courseId: L.k.id, collectionId: L.k.collectionId, siteId: L.k.siteId, purpose, visibility: 'private', storageKey: key, filename, contentType: juicio.mime, bytes: size, kind: juicio.kind, uploadId, uploadedById: L.ctx.user.id });
            return res.json({ ok: true, mode: 'multipart', fileId: f.id, partSize: limits.partSize, parts: Math.ceil(size / limits.partSize), done: [] });
        }
        const key = St.newPrivateKey(L.k.id, juicio.ext);
        const { uploadUrl } = await St.presignSinglePut({ key, contentType: juicio.mime });
        const f = await S.createFile({ courseId: L.k.id, collectionId: L.k.collectionId, siteId: L.k.siteId, purpose, visibility: 'private', storageKey: key, filename, contentType: juicio.mime, bytes: size, kind: juicio.kind, uploadedById: L.ctx.user.id });
        res.json({ ok: true, mode: 'single', fileId: f.id, uploadUrl, contentType: juicio.mime });
    } catch (e) { return fail(res, e); }
};

const fileOfCourse = async (k, fileId, res) => {
    const f = await S.getFile(fileId);
    const belongs = f && f.courseId === k.id && f.status !== 'deleted' && (f.visibility === 'public' ? St.publicKeyBelongs(f.storageKey, k.siteId) : St.privateKeyBelongs(f.storageKey, k.id));
    if (!belongs) { res.status(404).json({ error: 'Archivo no encontrado.' }); return null; }
    return f;
};

export const portalFileParts = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const f = await fileOfCourse(L.k, req.body?.fileId, res); if (!f) return;
        if (f.status !== 'uploading' || !f.uploadId) return res.status(409).json({ error: 'Esta carga ya terminó.' });
        const max = Math.ceil(Number(f.bytes) / learningLimits().partSize);
        const nums = (Array.isArray(req.body?.partNumbers) ? req.body.partNumbers : []).map(n => Number.parseInt(n, 10)).filter(n => n >= 1 && n <= max).slice(0, 20);
        res.json({ urls: await St.presignParts({ key: f.storageKey, uploadId: f.uploadId, partNumbers: nums }) });
    } catch (e) { return fail(res, e); }
};

const shapeFile = (f) => ({ id: f.id, purpose: f.purpose, visibility: f.visibility, filename: f.filename, bytes: Number(f.bytes), kind: f.kind, status: f.status, format: f.format, publicUrl: f.publicUrl, durationSeconds: f.durationSeconds, contentType: f.contentType });

export const portalFileComplete = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const f = await fileOfCourse(L.k, req.body?.fileId, res); if (!f) return;
        if (f.status === 'ready') return res.json({ ok: true, file: shapeFile(f) });
        if (f.uploadId) {
            try { await St.completeMultipart({ key: f.storageKey, uploadId: f.uploadId }); }
            catch (e) { return res.status(409).json({ error: `La carga no se pudo cerrar (${String(e.message).slice(0, 100)}). Reintenta: las partes ya subidas se conservan.` }); }
        }
        const ext = String(f.filename).split('.').pop().toLowerCase();
        let real;
        try { real = await St.inspectObject(f.storageKey, ext); } catch { return res.status(409).json({ error: 'No encontramos el archivo subido. Reintenta la carga.' }); }
        const juicio = checkLearningFile({ filename: f.filename, size: real.bytes, purpose: f.purpose });
        if (!real.bytes || !juicio.ok || !real.format) {
            await St.deleteObject(f.storageKey); await S.markFileDeleted(f.id);
            return res.status(400).json({ error: !real.format ? `El contenido del archivo no corresponde a un .${ext}. No se guardó.` : (juicio.errores[0] || 'Archivo no válido.') });
        }
        const meta = req.body?.meta || {};
        const row = await S.markFileReady(f.id, { bytes: real.bytes, format: real.format, contentType: real.contentType, durationSeconds: Number.isFinite(Number(meta.durationSeconds)) ? Math.round(Number(meta.durationSeconds)) : null, width: Number.parseInt(meta.width, 10) || null, height: Number.parseInt(meta.height, 10) || null });
        await S.logEvent({ entityType: 'course', entityId: L.k.id, courseId: L.k.id, collectionId: L.k.collectionId, siteId: L.k.siteId, action: 'file:ready', actor: L.ctx.actor, detail: { purpose: f.purpose, filename: f.filename, bytes: real.bytes }, visibility: 'internal' });
        await touched(L.k, L.ctx.user.id);
        res.json({ ok: true, file: shapeFile(row) });
    } catch (e) { return fail(res, e); }
};

export const portalFileDelete = async (req, res) => {
    try {
        const L = await editableCourse(req, res); if (!L) return;
        const f = await fileOfCourse(L.k, req.params.fileId, res); if (!f) return;
        if (f.uploadId) await St.abortMultipart({ key: f.storageKey, uploadId: f.uploadId });
        await St.deleteObject(f.storageKey);
        await S.markFileDeleted(f.id);
        // Las referencias se sueltan: una lección sin video deja de tener contenido (lo dirá la preparación).
        await db.query(`UPDATE "LearningLesson" SET "videoFileId"=NULL, "updatedAt"=NOW() WHERE "courseId"=$1 AND "videoFileId"=$2`, [L.k.id, f.id]);
        await db.query(`UPDATE "LearningLesson" SET "audioFileId"=NULL, "updatedAt"=NOW() WHERE "courseId"=$1 AND "audioFileId"=$2`, [L.k.id, f.id]);
        await db.query(`DELETE FROM "LearningResource" WHERE "courseId"=$1 AND "fileId"=$2`, [L.k.id, f.id]);
        const clear = {};
        if (L.k.introVideoFileId === f.id) clear.introVideoFileId = null;
        if (f.publicUrl && L.k.coverUrl === f.publicUrl) clear.coverUrl = null;
        if (f.publicUrl && L.k.thumbnailUrl === f.publicUrl) clear.thumbnailUrl = null;
        if (f.publicUrl && L.k.instructorImageUrl === f.publicUrl) clear.instructorImageUrl = null;
        await S.updateCourse(L.k.id, clear, L.ctx.user.id);
        res.json({ ok: true });
    } catch (e) { return fail(res, e); }
};

export const portalFileUrl = async (req, res) => {
    try {
        const ctx = await portalContext(req, res); if (!ctx) return;
        const k = await loadCourse(ctx, req.params.id, res); if (!k) return;
        const f = await fileOfCourse(k, req.params.fileId, res); if (!f) return;
        if (f.visibility === 'public') return res.json({ url: f.publicUrl, expiresIn: null });
        const seconds = f.kind === 'video' || f.kind === 'audio' ? 1200 : 300;
        const url = await St.signedUrl(f.storageKey, { filename: f.filename, contentType: f.contentType, seconds, inline: true });
        res.json({ url, expiresIn: seconds });
    } catch (e) { return fail(res, e); }
};

// ═══════════════════════════════════════════════════════════════════
// ADMINISTRACIÓN — /admin
// ═══════════════════════════════════════════════════════════════════
const adminContext = async (req) => {
    const site = await siteRowOf(req.user?.clubId);
    return { user: req.user, site, scope: scopeFor(req.user, site), actor: actorOf(req) };
};

export const adminOverview = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        const [summary, config, collections] = await Promise.all([S.adminSummary(ctx.scope), S.getConfig('global'), S.listCollections(ctx.scope)]);
        res.json({ summary, config, collections, scope: ctx.scope, catalogs: catalogs() });
    } catch (e) { return fail(res, e); }
};

export const adminListCourses = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const { rows, total } = await S.listAdminCourses(ctx.scope, { status: req.query.status, q: req.query.q, collectionId: req.query.collectionId, siteId: req.query.siteId, page, perPage: 40 });
        res.json({ courses: rows.map(k => ({ ...k, stateLabel: COURSE_STATES[k.status]?.label || k.status })), total, page, perPage: 40 });
    } catch (e) { return fail(res, e); }
};

export const adminGetCourse = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        const k = await S.getCourse(req.params.id);
        if (!k || !inScope(ctx.scope, k)) return res.status(404).json({ error: 'Curso no encontrado.' });
        const [bundle, config, events] = await Promise.all([S.courseBundle(k.id), S.getConfig('global'), S.listEvents(k.id, { internal: true })]);
        const collection = k.collectionId ? await S.getCollection(k.collectionId) : null;
        const shaped = shapeCourse(k, bundle, config);
        res.json({ ...shaped, transitions: ADMIN_TRANSITIONS[k.status] || [], collection, events, catalogs: catalogs() });
    } catch (e) { return fail(res, e); }
};

export const adminCourseStatus = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        const k = await S.getCourse(req.params.id);
        if (!k || !inScope(ctx.scope, k)) return res.status(404).json({ error: 'Curso no encontrado.' });
        const to = String(req.body?.to || '');
        const note = String(req.body?.note || '').trim().slice(0, 4000);
        const updated = await applyStatus({ course: k, to, by: 'admin', actor: ctx.actor, note, host: hostOf(req) });
        let final = updated;
        // Aprobar NO publica, salvo que la configuración lo pida a propósito.
        if (to === 'approved' && k.status === 'in_review') {
            const config = await S.getConfig('global');
            if (config.autoPublishOnApprove) final = await applyStatus({ course: updated, to: 'published', by: 'admin', actor: ctx.actor, note: 'Publicación automática al aprobar (configuración).', host: hostOf(req) });
        }
        notifyCourseDecision({ course: final, to: final.status, note, host: hostOf(req) }).catch(() => {});
        res.json({ course: final, transitions: ADMIN_TRANSITIONS[final.status] || [] });
    } catch (e) { return res.status(e.code || 500).json({ error: e.message, allowed: e.allowed }); }
};

export const adminPatchCourse = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        const k = await S.getCourse(req.params.id);
        if (!k || !inScope(ctx.scope, k)) return res.status(404).json({ error: 'Curso no encontrado.' });
        const values = {};
        if ('adminNotes' in (req.body || {})) values.adminNotes = String(req.body.adminNotes || '').slice(0, 8000);
        if ('collectionId' in (req.body || {})) {
            if (req.body.collectionId) { const c = await S.getCollection(req.body.collectionId); if (!c || c.siteId !== k.siteId) return res.status(400).json({ error: 'La colección no es del mismo club.' }); values.collectionId = c.id; }
            else values.collectionId = null;
        }
        const updated = await S.updateCourse(k.id, values);
        await S.logEvent({ entityType: 'course', entityId: k.id, courseId: k.id, collectionId: k.collectionId, siteId: k.siteId, action: 'admin:edited', actor: ctx.actor, detail: { fields: Object.keys(values) }, visibility: 'internal' });
        res.json({ course: updated });
    } catch (e) { return fail(res, e); }
};

export const adminAddComment = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        const k = await S.getCourse(req.params.id);
        if (!k || !inScope(ctx.scope, k)) return res.status(404).json({ error: 'Curso no encontrado.' });
        const text = String(req.body?.text || '').trim().slice(0, 4000);
        if (!text) return res.status(400).json({ error: 'Escribe la observación.' });
        const internal = req.body?.internal === true;
        const ev = await S.logEvent({ entityType: 'course', entityId: k.id, courseId: k.id, collectionId: k.collectionId, siteId: k.siteId, action: 'comment', actor: ctx.actor, detail: { text }, visibility: internal ? 'internal' : 'all' });
        res.status(201).json({ event: ev });
    } catch (e) { return fail(res, e); }
};

export const adminFileUrl = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        const k = await S.getCourse(req.params.id);
        if (!k || !inScope(ctx.scope, k)) return res.status(404).json({ error: 'Curso no encontrado.' });
        const f = await fileOfCourse(k, req.params.fileId, res); if (!f) return;
        if (f.visibility === 'public') return res.json({ url: f.publicUrl, expiresIn: null });
        const seconds = f.kind === 'video' || f.kind === 'audio' ? 1200 : 300;
        res.json({ url: await St.signedUrl(f.storageKey, { filename: f.filename, contentType: f.contentType, seconds, inline: true }), expiresIn: seconds });
    } catch (e) { return fail(res, e); }
};

export const adminListCollections = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        res.json({ collections: await S.listCollections(ctx.scope, { status: req.query.status || undefined }) });
    } catch (e) { return fail(res, e); }
};
export const adminGetCollection = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        const c = await S.getCollection(req.params.id);
        if (!c || !inScope(ctx.scope, c)) return res.status(404).json({ error: 'Colección no encontrada.' });
        const config = await S.getConfig('global');
        const rows = await S.listCoursesOfCollection(c.id);
        const courses = await Promise.all(rows.map(k => courseSummary(k, config)));
        res.json({ collection: c, courses, events: await S.listCollectionEvents(c.id, { internal: true }) });
    } catch (e) { return fail(res, e); }
};
export const adminCollectionStatus = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        const c = await S.getCollection(req.params.id);
        if (!c || !inScope(ctx.scope, c)) return res.status(404).json({ error: 'Colección no encontrada.' });
        const to = req.body?.status === 'archived' ? 'archived' : 'active';
        const updated = await S.updateCollection(c.id, { status: to });
        await S.logEvent({ entityType: 'collection', entityId: c.id, collectionId: c.id, siteId: c.siteId, action: `collection:${to}`, actor: ctx.actor, detail: { by: 'admin' } });
        res.json({ collection: updated });
    } catch (e) { return fail(res, e); }
};

export const adminGetConfig = async (req, res) => {
    try { res.json({ config: await S.getConfig('global'), catalogs: catalogs() }); } catch (e) { return fail(res, e); }
};
export const adminPutConfig = async (req, res) => {
    try {
        const ctx = await adminContext(req);
        if (!ctx.scope.all && ctx.site?.type !== 'district') return res.status(403).json({ error: 'La configuración la define el Distrito o la plataforma.' });
        // Se FUSIONA con lo guardado: un PUT parcial no borra lo demás.
        const incoming = (req.body?.config && typeof req.body.config === 'object') ? req.body.config : (req.body || {});
        const row = await S.saveConfig('global', { ...(await S.getConfig('global')), ...incoming }, ctx.user.id);
        await S.logEvent({ entityType: 'config', entityId: 'global', action: 'config:saved', actor: ctx.actor, detail: { keys: Object.keys(req.body?.config || req.body || {}) }, visibility: 'internal' });
        res.json({ config: await S.getConfig('global'), updatedAt: row.updatedAt });
    } catch (e) { return fail(res, e); }
};

// ═══════════════════════════════════════════════════════════════════
// BIBLIOTECA PÚBLICA — /public
// ═══════════════════════════════════════════════════════════════════
/** El sitio que pide: por `clubId` o por host. Un distrito ve los cursos de sus clubes. */
const publicSite = async (req) => {
    let site = null;
    if (req.query.clubId) site = await siteRowOf(req.query.clubId);
    if (!site) {
        try {
            const { resolveSiteId } = await import('../lib/linkRedirectStore.js');
            const id = await resolveSiteId(hostOf(req));
            if (id) site = await siteRowOf(id);
        } catch { /* sin sitio */ }
    }
    if (!site) return null;
    const isDistrict = site.type === 'district';
    return { site, filter: { siteId: site.id, districtNumber: isDistrict ? districtNumberOf(site) : null } };
};

/** Quién mira: decodifica el token si viene, sin exigirlo. */
const viewerOf = (req, course) => {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    const viewer = { platform: false, attendee: false, owner: false, admin: false };
    if (!token) return viewer;
    try {
        const d = jwt.verify(String(token), JWT_SECRET);
        if (d.aud === EVENT_ATTENDEE_AUDIENCE) { viewer.attendee = true; return viewer; }
        if (!d.aud || d.aud === PLATFORM_AUDIENCE) {
            viewer.platform = true;
            if (ALL_ROLES.includes(d.role)) viewer.admin = true;
            if (course && d.clubId && d.clubId === course.siteId) viewer.owner = true;
        }
    } catch { /* token inválido = anónimo */ }
    return viewer;
};
const inviteOf = (req) => String(req.query.invite || req.headers['x-course-invite'] || '');

export const publicCatalog = async (req, res) => {
    try {
        const ctx = await publicSite(req);
        const config = await S.getConfig('global');
        if (!ctx || !config.enabled) return res.json({ site: null, intro: config.libraryIntro, courses: [], collections: [], facets: { areas: [], clubs: [], tags: [], accessModes: [] } });
        const [rows, cols] = await Promise.all([
            S.listPublishedCourses({ ...ctx.filter, q: req.query.q, area: req.query.area, access: req.query.access, club: req.query.club, tag: req.query.tag, collectionId: req.query.collectionId }),
            S.listPublishedCollections(ctx.filter),
        ]);
        const all = (req.query.q || req.query.area || req.query.access || req.query.club || req.query.tag || req.query.collectionId) ? await S.listPublishedCourses(ctx.filter) : rows;
        const facets = {
            areas: Array.from(new Set(all.map(k => k.areaFocus).filter(Boolean))).map(a => ({ id: a, label: AREAS[a] || a })),
            clubs: Array.from(new Set(all.map(k => k.ownerClubName).filter(Boolean))).sort(),
            tags: Array.from(new Set(all.flatMap(k => k.tags || []))).slice(0, 40).sort(),
            accessModes: Array.from(new Set(all.map(k => k.accessMode))).map(a => ({ id: a, label: ACCESS_MODES[a]?.label || a })),
            projects: Array.from(new Set(all.map(k => k.projectRef).filter(Boolean))).sort(),
        };
        res.json({
            site: { id: ctx.site.id, name: ctx.site.name, type: ctx.site.type, district: ctx.site.district },
            intro: config.libraryIntro,
            courses: rows.filter(k => k.accessMode !== 'private').map(k => publicCourseCard(k, { lessonCount: k.lessonCount, durationMinutes: durationOf(k, [{ durationMinutes: k.lessonMinutes }]), collectionSlug: k.collectionSlug, collectionName: k.collectionName })),
            collections: cols.map(c => ({ id: c.id, slug: c.slug, name: c.name, description: c.description || '', coverUrl: c.coverUrl || '', projectRef: c.projectRef || '', ownerClubName: c.ownerClubName || '', publishedCount: c.publishedCount, areaFocus: c.areaFocus || '', areaLabel: AREAS[c.areaFocus] || '', accessMode: c.accessMode })),
            facets,
        });
    } catch (e) { return fail(res, e); }
};

export const publicCollection = async (req, res) => {
    try {
        const c = await S.getCollectionBySlug(req.params.slug);
        if (!c || c.status !== 'active') return res.status(404).json({ error: 'Colección no encontrada.' });
        const rows = await S.listPublishedCourses({ siteId: c.siteId, collectionId: c.id, limit: 500 });
        const invite = inviteOf(req);
        const viewer = viewerOf(req, c);
        const visible = rows.filter(k => k.accessMode !== 'private' || viewer.owner || viewer.admin || (invite && (invite === k.inviteToken || invite === c.inviteToken)));
        if (!visible.length && !viewer.owner && !viewer.admin) return res.status(404).json({ error: 'Esta colección todavía no tiene cursos publicados.' });
        res.json({
            collection: { id: c.id, slug: c.slug, name: c.name, description: c.description || '', coverUrl: c.coverUrl || '', projectRef: c.projectRef || '', ownerClubName: c.ownerClubName || '', areaFocus: c.areaFocus || '', areaLabel: AREAS[c.areaFocus] || '', audience: c.audience || [], accessMode: c.accessMode },
            courses: visible.map(k => publicCourseCard(k, { lessonCount: k.lessonCount, durationMinutes: durationOf(k, [{ durationMinutes: k.lessonMinutes }]), collectionSlug: c.slug, collectionName: c.name })),
        });
    } catch (e) { return fail(res, e); }
};

const publishedBySlug = async (slug) => {
    const k = await S.getCourseBySlug(slug);
    return k && k.status === 'published' ? k : null;
};
const decide = (k, req, collection) => {
    const viewer = viewerOf(req, k);
    const invite = inviteOf(req);
    const d = accessDecision({ accessMode: k.accessMode, inviteToken: k.inviteToken }, viewer, invite);
    if (!d.allowed && k.accessMode === 'private' && collection?.inviteToken && invite === collection.inviteToken) return { allowed: true, reason: 'invite' };
    return d;
};

/** La FICHA de presentación. Un curso privado no muestra nada sin invitación. */
export const publicCourse = async (req, res) => {
    try {
        const k = await publishedBySlug(req.params.slug);
        if (!k) return res.status(404).json({ error: 'Curso no encontrado.' });
        const collection = k.collectionId ? await S.getCollection(k.collectionId) : null;
        const access = decide(k, req, collection);
        if (k.accessMode === 'private' && !access.allowed) return res.status(403).json({ error: ACCESS_DENIED_TEXT.invite, reason: 'invite', accessMode: 'private' });
        const bundle = await S.courseBundle(k.id);
        const filesById = Object.fromEntries(bundle.files.map(f => [f.id, f]));
        const syllabus = bundle.modules.map(m => ({ id: m.id, title: m.title, description: m.description || '', lessons: bundle.lessons.filter(l => l.moduleId === m.id).map(l => ({ id: l.id, title: l.title, durationMinutes: l.durationMinutes || 0, hasVideo: Boolean(l.videoUrl || (l.videoFileId && filesById[l.videoFileId]?.status === 'ready')) })) }));
        const loose = bundle.lessons.filter(l => !l.moduleId || !bundle.modules.some(m => m.id === l.moduleId)).map(l => ({ id: l.id, title: l.title, durationMinutes: l.durationMinutes || 0, hasVideo: Boolean(l.videoUrl || (l.videoFileId && filesById[l.videoFileId]?.status === 'ready')) }));
        if (loose.length) syllabus.push({ id: null, title: bundle.modules.length ? 'Otras lecciones' : 'Lecciones', description: '', lessons: loose });
        res.json({
            course: {
                ...publicCourseCard(k, { lessonCount: bundle.lessons.length, durationMinutes: durationOf(k, bundle.lessons), collectionSlug: collection?.slug || null, collectionName: collection?.name || null }),
                fullDescription: k.fullDescription || '', learningObjective: k.learningObjective || '', instructorBio: k.instructorBio || '', instructorImageUrl: k.instructorImageUrl || '',
                organization: k.organization || '', languageLabel: LANGUAGES[k.language] || k.language, audienceLabels: (k.audience || []).map(a => AUDIENCES[a] || a),
                introVideoUrl: k.introVideoUrl || '', introEmbed: k.introVideoUrl ? embedFor(k.introVideoUrl) : null, introVideoFileId: k.introVideoFileId && filesById[k.introVideoFileId]?.status === 'ready' ? k.introVideoFileId : null,
                features: k.features || {}, viewCount: Number(k.viewCount) || 0,
            },
            syllabus,
            resources: bundle.resources.filter(r => !r.lessonId).map(r => ({ id: r.id, title: r.title, description: r.description || '', kind: r.kind, hasUrl: Boolean(r.url) })),
            access: { allowed: access.allowed, reason: access.reason, message: access.allowed ? '' : (ACCESS_DENIED_TEXT[access.reason] || ACCESS_DENIED_TEXT.unknown), accessMode: k.accessMode, accessLabel: ACCESS_MODES[k.accessMode]?.label },
            collection: collection ? { slug: collection.slug, name: collection.name, projectRef: collection.projectRef || '' } : null,
        });
    } catch (e) { return fail(res, e); }
};

/** El CONTENIDO: lecciones completas, sólo si la modalidad lo permite. */
export const publicCourseLearn = async (req, res) => {
    try {
        const k = await publishedBySlug(req.params.slug);
        if (!k) return res.status(404).json({ error: 'Curso no encontrado.' });
        const collection = k.collectionId ? await S.getCollection(k.collectionId) : null;
        const access = decide(k, req, collection);
        if (!access.allowed) return res.status(403).json({ error: ACCESS_DENIED_TEXT[access.reason] || ACCESS_DENIED_TEXT.unknown, reason: access.reason, accessMode: k.accessMode });
        const bundle = await S.courseBundle(k.id);
        const filesById = Object.fromEntries(bundle.files.filter(f => f.status === 'ready').map(f => [f.id, f]));
        const fileRef = (id) => (id && filesById[id]) ? { id, filename: filesById[id].filename, kind: filesById[id].kind, contentType: filesById[id].contentType, bytes: Number(filesById[id].bytes) } : null;
        const lesson = (l) => ({
            id: l.id, moduleId: l.moduleId, title: l.title, description: l.description || '', body: l.body || '', durationMinutes: l.durationMinutes || 0,
            videoUrl: l.videoUrl || '', embed: l.videoUrl ? embedFor(l.videoUrl) : null, videoFile: fileRef(l.videoFileId), audioFile: fileRef(l.audioFileId),
            resources: bundle.resources.filter(r => r.lessonId === l.id).map(r => ({ id: r.id, title: r.title, description: r.description || '', kind: r.kind, url: r.url || '', file: fileRef(r.fileId) })),
            hasContent: lessonHasContent(l, filesById, bundle.resources),
        });
        const modules = bundle.modules.map(m => ({ id: m.id, title: m.title, description: m.description || '', lessons: bundle.lessons.filter(l => l.moduleId === m.id).map(lesson) }));
        const loose = bundle.lessons.filter(l => !l.moduleId || !bundle.modules.some(m => m.id === l.moduleId)).map(lesson);
        if (loose.length) modules.push({ id: null, title: bundle.modules.length ? 'Otras lecciones' : 'Lecciones', description: '', lessons: loose });
        S.bumpViews(k.id);
        res.json({
            course: { id: k.id, slug: k.slug, title: k.title, subtitle: k.subtitle || '', shortDescription: k.shortDescription || '', coverUrl: k.coverUrl || '', instructorName: k.instructorName || '', ownerClubName: k.ownerClubName || '', durationMinutes: durationOf(k, bundle.lessons), features: k.features || {} },
            modules,
            resources: bundle.resources.filter(r => !r.lessonId).map(r => ({ id: r.id, title: r.title, description: r.description || '', kind: r.kind, url: r.url || '', file: fileRef(r.fileId) })),
            collection: collection ? { slug: collection.slug, name: collection.name } : null,
            access: { reason: access.reason },
        });
    } catch (e) { return fail(res, e); }
};

export const publicFileUrl = async (req, res) => {
    try {
        const k = await publishedBySlug(req.params.slug);
        if (!k) return res.status(404).json({ error: 'Curso no encontrado.' });
        const collection = k.collectionId ? await S.getCollection(k.collectionId) : null;
        const access = decide(k, req, collection);
        if (!access.allowed) return res.status(403).json({ error: ACCESS_DENIED_TEXT[access.reason] || ACCESS_DENIED_TEXT.unknown, reason: access.reason });
        const f = await S.getFile(req.params.fileId);
        if (!f || f.courseId !== k.id || f.status !== 'ready') return res.status(404).json({ error: 'Archivo no encontrado.' });
        if (f.visibility === 'public') return res.json({ url: f.publicUrl, expiresIn: null });
        if (!St.privateKeyBelongs(f.storageKey, k.id)) return res.status(404).json({ error: 'Archivo no encontrado.' });
        const seconds = f.kind === 'video' || f.kind === 'audio' ? 1200 : 300;
        const inline = req.query.download !== '1';
        res.json({ url: await St.signedUrl(f.storageKey, { filename: f.filename, contentType: f.contentType, seconds, inline }), expiresIn: seconds, filename: f.filename });
    } catch (e) { return fail(res, e); }
};

export const _internals = { scopeFor, inScope, applyStatus, viewerOf, decide };

export default {
    portalOverview, portalCreateCollection, portalGetCollection, portalPatchCollection, portalCollectionStatus, portalReorderCourses, portalCollectionInvite, portalCollectionCoverPresign, portalCollectionCoverComplete,
    portalCreateCourse, portalGetCourse, portalPatchCourse, portalDuplicateCourse, portalSubmitCourse, portalCourseStatus,
    portalCreateModule, portalPatchModule, portalDeleteModule, portalCreateLesson, portalPatchLesson, portalDeleteLesson, portalCreateResource, portalPatchResource, portalDeleteResource, portalReorderContent,
    portalFilePresign, portalFileParts, portalFileComplete, portalFileDelete, portalFileUrl,
    adminOverview, adminListCourses, adminGetCourse, adminCourseStatus, adminPatchCourse, adminAddComment, adminFileUrl, adminListCollections, adminGetCollection, adminCollectionStatus, adminGetConfig, adminPutConfig,
    publicCatalog, publicCollection, publicCourse, publicCourseLearn, publicFileUrl,
};
