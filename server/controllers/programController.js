// ════════════════════════════════════════════════════════════════════
// Programas — controlador — v4.1280.0
//
// Lo público (catálogo del sitio, página del programa, formularios, métricas)
// no lleva auth y lleva `lightPublicLimit`. La administración lleva auth +
// `programs.*` del RBAC para abrir la ruta, y `programAccess` para decidir la
// fila: qué puede hacer ESTA sesión con ESTE programa.
//
// Nada se publica sin pasar por una solicitud «Aprobada» y la acción de
// publicar. Ver `docs/claude/programas.md`.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import db from '../lib/db.js';
import ensureProgramSchema from '../lib/ensureProgramSchema.js';
import * as S from '../lib/programStore.js';
import * as N from '../lib/programNotify.js';
import { resolveScope, contextFor, abilitiesFor, canSubmitScope } from '../lib/programAccess.js';
import { presignProgramUpload, inspectProgramObject, signedProgramDownload, programKeyBelongs, deleteProgramObject } from '../lib/programFiles.js';
import { catalogForForms, catalogDistricts, ensureClubCatalogSchema } from '../lib/clubCatalog.js';
import { resolveSiteId } from '../lib/linkRedirectStore.js';
import { visitorSeed, classifyAgent } from '../lib/linkTracking.js';
import {
    shapeProgram, validateProgramDraft, validateProgramForPublish, shapeLink, validateLink, shapeActivation, validateActivation,
    shapeChangeRequest, validateChangeRequest, canTransitionRequest, requestNeedsReason, canPublishRequest, TRANSITION_ABILITY, payloadChanged,
    shapePublicRequest, validatePublicRequest, shapeSubscriber, validateSubscriber, canTransitionPublicRequest, REQUEST_STATE_IDS,
    PROGRAM_STATES, PROGRAM_CATEGORIES, RELATION_TYPES, LINK_STATES, PROGRAM_ROLES, PROGRAM_ROLE_IDS, SECTIONS, CONTENT_KINDS, CHANGE_KINDS, OPERATIONS, SCOPE_TYPES,
    EDITORIAL_STATES, EDITORIAL_REQUIREMENTS, PUBLIC_REQUEST_TYPES, REQUEST_STATES, SUPPORT_TYPES, CLUB_PARTICIPATION_TYPES, CONTACT_MEANS, RESOURCE_TYPES,
    INDICATOR_MODES, PERMISSION_SCOPES, DATA_CONSENT_TEXT, NEWSLETTER_CONSENT_TEXT, METRIC_LABELS, PRIVATE_FILE_KINDS, PRIVATE_FILE_MAX_BYTES, checkPrivateFileMeta,
    isMetricKey, PUBLIC_REQUEST_TYPE_IDS, nextRequestStates, nextPublicRequestStates, requestNeedsMedicalReview, contentTitleOf, isPubliclyVisible, resolveEmbed,
} from '../lib/programSpec.js';
import { JWT_SECRET } from '../middleware/auth.js';
import { shapeLanding, validateLanding, newBlock, resolveLanding, BLOCK_TYPES, BACKGROUNDS, ICONS, BUTTON_ACTIONS, DETAIL_ANCHORS, FORM_TARGETS } from '../lib/programLandingSpec.js';

console.log('[programas] v4.1281.0 cargado — Programas: página pública por contenedores (borrador, vista previa, publicación) sobre las fuentes reales del programa');

const fail = (res, e, code = 500) => {
    if (code >= 500) console.error('[programas]', e?.message || e);
    return res.status(code).json({ error: e?.message || 'Error' });
};
const actorOf = (req) => ({ id: req.user?.id || null, name: req.user?.name || req.user?.email || 'Administración', clubId: req.user?.clubId || req.headers?.['x-club-id'] || null });
const hostOf = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().slice(0, 200);
const ipOf = (req) => String(req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim();
const firstError = (errors, fallback) => errors[0]?.message || fallback;
const intq = (v, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };

/** El catálogo de constantes que el panel y el formulario necesitan. */
const catalogs = () => ({
    states: PROGRAM_STATES, categories: PROGRAM_CATEGORIES, relationTypes: RELATION_TYPES, linkStates: LINK_STATES, roles: PROGRAM_ROLES, sections: SECTIONS,
    contentKinds: CONTENT_KINDS, changeKinds: CHANGE_KINDS, operations: OPERATIONS, scopeTypes: SCOPE_TYPES, editorialStates: EDITORIAL_STATES,
    editorialRequirements: EDITORIAL_REQUIREMENTS, publicRequestTypes: PUBLIC_REQUEST_TYPES, requestStates: REQUEST_STATES, supportTypes: SUPPORT_TYPES,
    clubParticipationTypes: CLUB_PARTICIPATION_TYPES, contactMeans: CONTACT_MEANS, resourceTypes: RESOURCE_TYPES, indicatorModes: INDICATOR_MODES,
    permissionScopes: PERMISSION_SCOPES, metricLabels: METRIC_LABELS, privateFileKinds: PRIVATE_FILE_KINDS, privateFileMaxBytes: PRIVATE_FILE_MAX_BYTES,
});

// ─── Carga + alcance de un programa ───────────────────────────────────

async function loadProgram(req, res, ability = 'view') {
    await ensureProgramSchema();
    const program = await S.getProgram(req.params.id);
    if (!program) { res.status(404).json({ error: 'Programa no encontrado.' }); return null; }
    const scope = await resolveScope(req);
    const ctx = await contextFor(program.id, scope);
    const grant = abilitiesFor(scope, program, ctx);
    if (!grant.can(ability)) {
        console.warn(`[programas] "${scope.email}" sin «${ability}» sobre ${program.slug} en ${req.method} ${req.originalUrl}`);
        res.status(403).json({ error: 'No tienes acceso a este programa.' });
        return null;
    }
    return { program, scope, ctx, grant };
}

const grantView = (grant) => ({ abilities: grant.abilities, all: grant.all, submitScopes: grant.submitScopes, clubActivationIds: grant.clubActivationIds, districtNumbers: grant.districtNumbers, medicalScope: grant.medicalScope });

// ─── Vista previa firmada ─────────────────────────────────────────────

const signPreview = (programId) => {
    const exp = Date.now() + 60 * 60 * 1000;
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`programa.${programId}.${exp}`).digest('hex');
    return `${exp}.${sig}`;
};
const verifyPreview = (programId, token) => {
    const [exp, sig] = String(token || '').split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const esperado = crypto.createHmac('sha256', JWT_SECRET).update(`programa.${programId}.${exp}`).digest('hex');
    return sig.length === esperado.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado));
};

// ════════════════════════════════════════════════════════════════════
// PÚBLICO
// ════════════════════════════════════════════════════════════════════

const siteIdOf = async (req) => String(req.query.clubId || req.body?.clubId || '').trim() || await resolveSiteId(hostOf(req)) || null;

// GET /public/catalogo
export const publicCatalog = async (req, res) => {
    try {
        const clubId = await siteIdOf(req);
        if (!clubId) return res.json({ site: null, programs: [] });
        const { site, programs } = await S.publicCatalogForSite(clubId);
        res.json({
            site: site ? { name: site.name, isDistrict: site.isDistrict } : null,
            programs: programs.map(p => ({ slug: p.slug, name: p.name, summary: p.summary, category: p.category, categoryLabel: PROGRAM_CATEGORIES.find(c => c.id === p.category)?.label || '', logoUrl: p.logoUrl, heroImageUrl: p.heroImageUrl, heroImageAlt: p.heroImageAlt, districtNumber: p.districtNumber, relationType: p.relationType })),
        });
    } catch (e) { return fail(res, e); }
};

// GET /public/:slug
export const publicProgram = async (req, res) => {
    try {
        const clubId = await siteIdOf(req);
        const program = await S.getProgram(req.params.slug);
        if (!program) return res.status(404).json({ error: 'Programa no encontrado.' });
        const preview = Boolean(req.query.t) && verifyPreview(program.id, req.query.t);
        const data = await S.publicProgramForSite(program.slug, clubId, { preview });
        if (!data) return res.status(404).json({ error: 'Este programa no está disponible en este sitio.' });
        if (!preview) {
            const agent = classifyAgent(req.headers['user-agent'] || '', req.headers);
            await S.recordMetric({ programId: program.id, siteClubId: clubId || '', metric: 'view', isBot: Boolean(agent?.isBot), seed: visitorSeed({ clubId: program.id, ip: ipOf(req), userAgent: req.headers['user-agent'] || '' }) });
        }
        data.consent = { data: DATA_CONSENT_TEXT, newsletter: NEWSLETTER_CONSENT_TEXT };
        data.catalogs = { supportTypes: SUPPORT_TYPES, clubParticipationTypes: CLUB_PARTICIPATION_TYPES, contactMeans: CONTACT_MEANS, resourceTypes: RESOURCE_TYPES };
        data.clinicFacets = S.clinicFacets(data.content.clinic);
        res.setHeader('Cache-Control', 'no-store');
        res.json(data);
    } catch (e) { return fail(res, e); }
};

// POST /public/:slug/metric  { metric }
export const publicMetric = async (req, res) => {
    try {
        const metric = String(req.body?.metric || '');
        if (!isMetricKey(metric) || metric === 'view' || metric.startsWith('form_')) return res.status(400).json({ error: 'Métrica no admitida.' });
        const program = await S.getProgram(req.params.slug);
        if (!program || program.status !== 'activo') return res.json({ ok: true });
        const agent = classifyAgent(req.headers['user-agent'] || '', req.headers);
        await S.recordMetric({ programId: program.id, siteClubId: await siteIdOf(req) || '', metric, isBot: Boolean(agent?.isBot) });
        res.json({ ok: true });
    } catch { res.json({ ok: true }); }
};

const originOf = async (req, program) => {
    const clubId = await siteIdOf(req);
    const site = clubId ? await S.siteInfo(clubId) : null;
    const origin = { host: hostOf(req), clubId: site?.id || null, clubName: site?.name || null, districtNumber: null, activationId: null };
    if (site?.isDistrict) origin.districtNumber = site.districts[0] || null;
    else if (site) {
        const act = (await S.listActivations(program.id, { clubId: site.id }))[0];
        if (act) { origin.activationId = act.id; origin.districtNumber = act.districtNumber; }
    }
    return origin;
};

// POST /public/:slug/solicitud  { type, ...campos, dataConsent }
export const publicSubmitRequest = async (req, res) => {
    try {
        const program = await S.getProgram(req.params.slug);
        if (!program || program.status !== 'activo') return res.status(404).json({ error: 'Programa no disponible.' });
        const type = String(req.body?.type || '');
        if (!PUBLIC_REQUEST_TYPE_IDS.includes(type)) return res.status(400).json({ error: 'Tipo de solicitud desconocido.' });
        if ((program.formsEnabled || {})[type] === false) return res.status(400).json({ error: 'Este formulario no está habilitado para el programa.' });
        // Trampa para bots: un campo que ningún humano llena.
        if (String(req.body?.website_url || '').trim()) return res.json({ ok: true, receipt: { publicRef: 'SP-0000-000000' } });
        const data = shapePublicRequest(type, req.body);
        const juicio = validatePublicRequest(type, data);
        if (!juicio.ok) return res.status(400).json({ error: firstError(juicio.errors, 'Revisa los datos.'), errors: juicio.errors });
        const origin = await originOf(req, program);
        const routing = (program.requestRouting || {})[type] || {};
        const row = await S.createPublicRequest({ programId: program.id, type, data, consentText: DATA_CONSENT_TEXT, origin, routing });
        await S.recordMetric({ programId: program.id, siteClubId: origin.clubId || '', metric: `form_${type}` });
        const members = await S.listMembers(program.id);
        N.notifyPublicRequest({ program, request: row, members, host: hostOf(req), routing }).catch(() => {});
        // Quien pide orientación o apoyo NO queda suscrito a nada: no hay suscripción implícita.
        res.status(201).json({ ok: true, receipt: { publicRef: row.publicRef, type: row.type, receivedAt: row.createdAt } });
    } catch (e) { return fail(res, e); }
};

// POST /public/:slug/novedades  { name, email, newsletterConsent }
export const publicSubscribe = async (req, res) => {
    try {
        const program = await S.getProgram(req.params.slug);
        if (!program || program.status !== 'activo' || program.newsletterEnabled === false) return res.status(404).json({ error: 'Programa no disponible.' });
        if (String(req.body?.website_url || '').trim()) return res.json({ ok: true });
        const s = shapeSubscriber(req.body);
        const juicio = validateSubscriber(s);
        if (!juicio.ok) return res.status(400).json({ error: firstError(juicio.errors, 'Revisa los datos.'), errors: juicio.errors });
        const origin = await originOf(req, program);
        await S.subscribe({ programId: program.id, email: s.email, name: s.name, consentText: NEWSLETTER_CONSENT_TEXT, origin });
        await S.recordMetric({ programId: program.id, siteClubId: origin.clubId || '', metric: 'form_novedades' });
        res.status(201).json({ ok: true });
    } catch (e) { return fail(res, e); }
};

// GET /public/:slug/solicitud/:ref  → sólo referencia, tipo y estado
export const publicRequestStatus = async (req, res) => {
    try {
        const program = await S.getProgram(req.params.slug);
        const row = program ? await S.getPublicRequest(req.params.ref) : null;
        if (!row || row.programId !== program.id) return res.status(404).json({ error: 'No encontramos esa referencia.' });
        res.json({ publicRef: row.publicRef, type: row.type, status: row.status, statusLabel: REQUEST_STATES[row.status]?.label || row.status, receivedAt: row.createdAt });
    } catch (e) { return fail(res, e); }
};

// GET /public/clubes?district=4281&q=
export const publicClubs = async (req, res) => {
    try {
        await ensureClubCatalogSchema();
        const district = intq(req.query.district, 0);
        const rows = await catalogForForms({ districts: district ? [district] : [] });
        const q = String(req.query.q || '').toLowerCase();
        res.json({ clubs: rows.filter(c => !q || String(c.officialName).toLowerCase().includes(q)).slice(0, 300).map(c => ({ id: c.id, name: c.officialName, city: c.city || '', district: Number(c.districtNumber) })) });
    } catch (e) { return fail(res, e); }
};

// ════════════════════════════════════════════════════════════════════
// ADMINISTRACIÓN
// ════════════════════════════════════════════════════════════════════

// GET /admin/context
export const adminContext = async (req, res) => {
    try {
        await ensureProgramSchema();
        const scope = await resolveScope(req);
        const districts = await catalogDistricts().catch(() => []);
        res.json({
            scope: { operator: scope.operator, siteAdmin: scope.siteAdmin, siteId: scope.siteId, siteName: scope.siteName, siteIsDistrict: scope.siteIsDistrict, districtNumbers: scope.districtNumbers, userId: scope.userId, email: scope.email },
            canCreate: scope.operator || (scope.siteAdmin && scope.siteIsDistrict),
            districts, catalogs: catalogs(),
        });
    } catch (e) { return fail(res, e); }
};

// GET /admin/list
export const adminList = async (req, res) => {
    try {
        const scope = await resolveScope(req);
        const visibility = scope.operator ? { all: true } : {
            siteId: scope.siteId, siteIsDistrict: scope.siteIsDistrict, districtNumbers: scope.districtNumbers,
            clubSiteId: scope.siteAdmin && scope.siteId && !scope.siteIsDistrict ? scope.siteId : null, userId: scope.userId, email: scope.email,
        };
        const out = await S.listPrograms({
            q: String(req.query.q || '').slice(0, 100), status: String(req.query.status || ''), category: String(req.query.category || ''),
            district: intq(req.query.district, 0), page: intq(req.query.page, 1), perPage: Math.min(intq(req.query.perPage, 20), 100), visibility,
        });
        // Para cada fila, lo que ESTA sesión puede hacer (para pintar botones; el servidor decide igual).
        const rows = [];
        for (const p of out.rows) {
            const ctx = await contextFor(p.id, scope);
            const grant = abilitiesFor(scope, p, ctx);
            rows.push({ ...p, abilities: grant.abilities, myActivation: ctx.activation ? { id: ctx.activation.id, status: ctx.activation.status } : null });
        }
        res.json({ ...out, rows });
    } catch (e) { return fail(res, e); }
};

// POST /admin  { ...programa, districtNumber? }
export const adminCreate = async (req, res) => {
    try {
        await ensureProgramSchema();
        const scope = await resolveScope(req);
        if (!(scope.operator || (scope.siteAdmin && scope.siteIsDistrict))) return res.status(403).json({ error: 'Sólo el sitio de un distrito o el operador de la plataforma crean programas.' });
        const p = shapeProgram(req.body || {});
        const juicio = validateProgramDraft(p);
        if (!juicio.ok) return res.status(400).json({ error: firstError(juicio.errors, 'Revisa los datos.'), errors: juicio.errors });
        if (await S.slugTaken(p.slug)) return res.status(409).json({ error: 'Ya existe un programa con esa dirección (slug).', errors: [{ field: 'slug', message: 'Elige otra dirección.' }] });
        const districtNumber = intq(req.body?.districtNumber, 0) || scope.districtNumbers[0] || null;
        if (!scope.operator && districtNumber && !scope.districtNumbers.includes(districtNumber)) return res.status(403).json({ error: 'Ese distrito no es el de este sitio.' });
        const row = await S.createProgram(p, { actor: actorOf(req), ownerClubId: scope.siteId, ownerDistrictNumber: districtNumber });
        if (districtNumber) {
            const l = shapeLink({ districtNumber, relationType: String(req.body?.relationType || 'respaldo_institucional'), status: 'activa' });
            await S.upsertLink(row.id, l, { actor: actorOf(req) });
        }
        res.status(201).json({ program: row });
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id
export const adminGet = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const { program, scope, ctx, grant } = L;
        const [links, members, activations] = await Promise.all([
            S.listLinks(program.id),
            grant.can('manageMembers') || grant.can('editProgram') ? S.listMembers(program.id) : Promise.resolve([]),
            grant.can('manageClubs') ? S.listActivations(program.id) : (scope.siteId ? S.listActivations(program.id, { clubId: scope.siteId }) : Promise.resolve([])),
        ]);
        const counts = (await db.query(
            `SELECT kind, COUNT(*)::int AS n FROM "ProgramContent" WHERE "programId" = $1 AND status = 'publicado' GROUP BY kind`, [program.id]
        )).rows.reduce((acc, r) => ({ ...acc, [r.kind]: r.n }), {});
        const pending = (await db.query(`SELECT status, COUNT(*)::int AS n FROM "ProgramChangeRequest" WHERE "programId" = $1 GROUP BY status`, [program.id])).rows;
        const requests = grant.can('manageRequests') ? (await db.query(`SELECT status, COUNT(*)::int AS n FROM "ProgramRequest" WHERE "programId" = $1 GROUP BY status`, [program.id])).rows : [];
        const publishCheck = validateProgramForPublish(shapeProgram(program));
        // El club sólo ve lo que lo toca: su activación y lo central publicado (la ficha completa es para quien edita).
        const visibleProgram = grant.can('editProgram') ? program : { ...program, requestRouting: undefined, pendingValidation: undefined, governance: { ...program.governance, institutionalPhone: undefined } };
        res.json({
            program: visibleProgram, links, members, activations, myActivation: ctx.activation, grant: grantView(grant), counts, pendingChanges: pending, requestsByStatus: requests,
            publishCheck, subscribers: grant.can('manageRequests') ? await S.subscriberCount(program.id) : null, catalogs: catalogs(),
            scope: { siteId: scope.siteId, siteName: scope.siteName, siteIsDistrict: scope.siteIsDistrict, districtNumbers: scope.districtNumbers, operator: scope.operator },
        });
    } catch (e) { return fail(res, e); }
};

const CLINICAL_FIELDS = ['guidancePath', 'accessConditions', 'costsText'];

// PUT /admin/:id
export const adminUpdate = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'editProgram'); if (!L) return;
        const { program } = L;
        const p = shapeProgram({ ...req.body, status: program.status });
        const juicio = validateProgramDraft(p);
        if (!juicio.ok) return res.status(400).json({ error: firstError(juicio.errors, 'Revisa los datos.'), errors: juicio.errors });
        if (p.slug !== program.slug && await S.slugTaken(p.slug, program.id)) return res.status(409).json({ error: 'Ya existe un programa con esa dirección (slug).', errors: [{ field: 'slug', message: 'Elige otra dirección.' }] });
        // Con el programa ACTIVO, el texto clínico aprobado no se pisa en caliente: va por solicitud de cambio.
        if (program.status === 'activo') {
            const cur = program.care || {};
            const tocaClinico = CLINICAL_FIELDS.some(f => String(p.care[f] || '') !== String(cur[f] || ''));
            if (tocaClinico) return res.status(409).json({ error: 'La ruta de orientación, las condiciones de acceso y el texto de costos de un programa activo cambian mediante una solicitud de «Información institucional», que pasa por revisión. El resto de la ficha se guardó sin cambios.', code: 'CLINICAL_LOCKED' });
            // La aprobación médica y la de costos sólo las escribe el flujo editorial.
            p.care.medicalApprovedAt = cur.medicalApprovedAt || ''; p.care.medicalApprovedBy = cur.medicalApprovedBy || '';
        }
        const row = await S.updateProgram(program.id, p, { actor: actorOf(req), note: String(req.body?.note || '').slice(0, 300) });
        res.json({ program: row, publishCheck: validateProgramForPublish(shapeProgram(row)) });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/status  { status, reason }
export const adminStatus = async (req, res) => {
    try {
        const to = String(req.body?.status || '');
        const ability = to === 'archivado' ? 'archiveProgram' : 'publish';
        const L = await loadProgram(req, res, ability); if (!L) return;
        const { program } = L;
        if (!['borrador', 'activo', 'archivado'].includes(to)) return res.status(400).json({ error: 'Estado desconocido.' });
        if (to === program.status) return res.json({ program });
        if (to === 'activo') {
            const check = validateProgramForPublish(shapeProgram(program));
            if (!check.ok) return res.status(400).json({ error: 'El programa no cumple los requisitos de publicación.', errors: check.errors });
            const links = await S.listLinks(program.id);
            if (!links.some(l => l.status === 'activa')) return res.status(400).json({ error: 'Vincula el programa con al menos un distrito (vinculación activa) antes de publicarlo.' });
        }
        const row = await S.setProgramStatus(program.id, to, { actor: actorOf(req), reason: String(req.body?.reason || '').slice(0, 500) });
        res.json({ program: row });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/preview-token
export const adminPreviewToken = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        res.json({ token: signPreview(L.program.id), slug: L.program.slug });
    } catch (e) { return fail(res, e); }
};

// ─── Vinculaciones ────────────────────────────────────────────────────

// PUT /admin/:id/links  { ...vinculación }
export const adminUpsertLink = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'manageLinks'); if (!L) return;
        const { program, scope, grant } = L;
        const l = shapeLink(req.body || {});
        const juicio = validateLink(l);
        if (!juicio.ok) return res.status(400).json({ error: firstError(juicio.errors, 'Revisa la vinculación.'), errors: juicio.errors });
        // Un sitio de distrito sólo vincula SU distrito; el operador, cualquiera.
        if (!grant.all && !scope.districtNumbers.includes(l.districtNumber)) return res.status(403).json({ error: 'Sólo puedes gestionar la vinculación de tu propio distrito.' });
        const row = await S.upsertLink(program.id, l, { actor: actorOf(req) });
        res.json({ link: row, links: await S.listLinks(program.id) });
    } catch (e) { return fail(res, e); }
};

// ─── Responsables ─────────────────────────────────────────────────────

// POST /admin/:id/members  { email, name, roles[], scopeType, districtNumber, clubId }
export const adminUpsertMember = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'manageMembers'); if (!L) return;
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
        const roles = (Array.isArray(req.body?.roles) ? req.body.roles : []).filter(r => PROGRAM_ROLE_IDS.includes(r));
        if (!roles.length) return res.status(400).json({ error: 'Elige al menos un perfil.' });
        const scopeType = ['central', 'district', 'club'].includes(req.body?.scopeType) ? req.body.scopeType : 'central';
        const m = { email, name: String(req.body?.name || '').trim().slice(0, 160), roles, scopeType, districtNumber: scopeType === 'district' ? intq(req.body?.districtNumber, 0) : null, clubId: scopeType === 'club' ? String(req.body?.clubId || '').slice(0, 80) : null };
        if (scopeType === 'district' && !m.districtNumber) return res.status(400).json({ error: 'Indica el distrito del responsable.' });
        if (scopeType === 'club' && !m.clubId) return res.status(400).json({ error: 'Indica el club del responsable.' });
        if (!L.grant.all && scopeType === 'district' && !L.grant.districtNumbers.includes(m.districtNumber)) return res.status(403).json({ error: 'Ese distrito no está en tu alcance.' });
        const row = await S.upsertMember(L.program.id, m, { actor: actorOf(req) });
        res.json({ member: row, members: await S.listMembers(L.program.id) });
    } catch (e) { return fail(res, e); }
};

// DELETE /admin/:id/members/:memberId
export const adminRemoveMember = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'manageMembers'); if (!L) return;
        await S.removeMember(L.program.id, String(req.params.memberId), { actor: actorOf(req) });
        res.json({ members: await S.listMembers(L.program.id) });
    } catch (e) { return fail(res, e); }
};

// ─── Contenido vivo ───────────────────────────────────────────────────

// GET /admin/:id/content?kind&status&scope&q&page
export const adminListContent = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const { program, grant, ctx } = L;
        const opts = { kind: String(req.query.kind || ''), status: String(req.query.status || 'publicado'), scopeType: String(req.query.scope || ''), q: String(req.query.q || '').slice(0, 100), page: intq(req.query.page, 1), perPage: Math.min(intq(req.query.perPage, 50), 200) };
        const out = await S.listContent(program.id, opts);
        // Un club ve lo central y SU contenido local, nunca el de otros clubes.
        const rows = grant.can('editProgram') || grant.can('review') ? out.rows : out.rows.filter(c => c.scopeType !== 'club' || (ctx.activation && c.clubActivationId === ctx.activation.id));
        res.json({ ...out, rows: rows.map(c => ({ ...c, publicVisible: isPubliclyVisible(c.kind, c.data) })) });
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id/content/:contentId
export const adminGetContent = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const c = await S.getContent(String(req.params.contentId));
        if (!c || c.programId !== L.program.id) return res.status(404).json({ error: 'Registro no encontrado.' });
        if (c.scopeType === 'club' && !(L.grant.can('editProgram') || L.grant.can('review')) && !(L.ctx.activation && c.clubActivationId === L.ctx.activation.id)) return res.status(403).json({ error: 'Ese registro es de otro club.' });
        res.json({ content: { ...c, publicVisible: isPubliclyVisible(c.kind, c.data) }, versions: await S.contentVersions(c.id) });
    } catch (e) { return fail(res, e); }
};

// ─── Solicitudes de cambio ────────────────────────────────────────────

const canSeeRequest = (L, r) => {
    const { grant, scope, ctx } = L;
    if (grant.can('review') || grant.can('approve') || grant.can('editProgram')) return true;
    if (grant.can('medicalApprove') && r.requiresMedicalReview) return true;
    if (r.ownerUserId && r.ownerUserId === scope.userId) return true;
    if (r.scopeType === 'club' && ctx.activation && r.clubActivationId === ctx.activation.id && grant.can('localSubmit')) return true;
    return false;
};

// GET /admin/:id/changes
export const adminListChanges = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const { program, grant, scope, ctx } = L;
        const wide = grant.can('review') || grant.can('approve') || grant.can('editProgram') || grant.can('medicalApprove');
        const opts = { status: String(req.query.status || ''), kind: String(req.query.kind || ''), scopeType: String(req.query.scope || ''), q: String(req.query.q || '').slice(0, 100), page: intq(req.query.page, 1), perPage: Math.min(intq(req.query.perPage, 25), 100) };
        if (!wide) {
            if (ctx.activation && grant.can('localSubmit')) opts.clubActivationId = ctx.activation.id;
            else opts.ownerUserId = scope.userId || '__nadie__';
        }
        const out = await S.listChangeRequests(program.id, opts);
        res.json(out);
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/changes  { ...solicitud, submit: bool }
export const adminCreateChange = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const { program, grant, scope, ctx } = L;
        const r = shapeChangeRequest(req.body || {});
        if (!r.responsibleName) r.responsibleName = scope.name || '';
        if (!r.responsibleEmail) r.responsibleEmail = scope.email || '';
        if (r.scopeType === 'club' && !r.clubActivationId && ctx.activation) r.clubActivationId = ctx.activation.id;
        const submit = req.body?.submit === true;
        // Primero QUIÉN puede (403), después QUÉ falta (400): un club que intenta
        // proponer una clínica recibe «no puedes», no «te falta un campo».
        if (!(grant.can('submit') || grant.can('localSubmit'))) return res.status(403).json({ error: 'No puedes proponer contenidos en este programa.' });
        if (r.kind && !canSubmitScope(grant, { scopeType: r.scopeType, districtNumber: r.districtNumber, clubActivationId: r.clubActivationId, kind: r.kind })) {
            return res.status(403).json({ error: r.scopeType === 'club' ? 'Un club sólo propone contenido local de su propia activación (equipo, historias, noticias y eventos).' : 'Ese alcance no está en tus permisos.' });
        }
        const juicio = validateChangeRequest(r, { submit });
        if (!juicio.ok) return res.status(400).json({ error: firstError(juicio.errors, 'Revisa la solicitud.'), errors: juicio.errors });
        if (r.contentId) {
            const c = await S.getContent(r.contentId);
            if (!c || c.programId !== program.id) return res.status(400).json({ error: 'El registro indicado no pertenece a este programa.' });
            if (c.scopeType === 'club' && !(grant.can('review') || (ctx.activation && c.clubActivationId === ctx.activation.id))) return res.status(403).json({ error: 'Ese registro es de otro club.' });
            if (c.scopeType !== 'club' && r.scopeType === 'club') return res.status(403).json({ error: 'Un club no modifica el contenido central ni el distrital.' });
            if (c.kind !== r.kind && r.kind !== 'correction') return res.status(400).json({ error: 'El tipo de la solicitud no coincide con el del registro.' });
        }
        const row = await S.createChangeRequest(program.id, r, { actor: actorOf(req), status: submit ? 'enviado' : 'borrador' });
        if (submit) N.notifyChangeSubmitted({ program, request: row, members: await S.listMembers(program.id), host: hostOf(req) }).catch(() => {});
        res.status(201).json({ request: row });
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id/changes/:reqId
export const adminGetChange = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const r = await S.getChangeRequest(String(req.params.reqId));
        if (!r || r.programId !== L.program.id) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        if (!canSeeRequest(L, r)) return res.status(403).json({ error: 'Esa solicitud no es tuya.' });
        const current = r.contentId ? await S.getContent(r.contentId) : null;
        const files = r.attachments.length ? (await S.listFiles(L.program.id)).filter(f => r.attachments.some(a => a.fileId === f.id)) : [];
        res.json({
            request: r, current, attachments: files.map(f => ({ id: f.id, kind: f.kind, filename: f.filename, bytes: Number(f.bytes), label: f.label })),
            next: nextRequestStates(r.status).filter(s => L.grant.can(TRANSITION_ABILITY[s.id]) || (s.id === 'enviado' && r.ownerUserId === L.scope.userId)),
            canPublish: canPublishRequest(r.status) && L.grant.can('publish') && (!r.requiresMedicalReview || Boolean(r.medicalReviewedAt)),
            canMedical: L.grant.can('medicalApprove') && r.requiresMedicalReview,
            canEdit: (r.status === 'borrador' || r.status === 'ajustes') && (r.ownerUserId === L.scope.userId || L.grant.can('review')) || (L.grant.can('review') && ['enviado', 'en_revision', 'aprobado'].includes(r.status)),
        });
    } catch (e) { return fail(res, e); }
};

// PUT /admin/:id/changes/:reqId  { ...solicitud, submit: bool }
export const adminUpdateChange = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const prev = await S.getChangeRequest(String(req.params.reqId));
        if (!prev || prev.programId !== L.program.id) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        if (!canSeeRequest(L, prev)) return res.status(403).json({ error: 'Esa solicitud no es tuya.' });
        const owner = prev.ownerUserId && prev.ownerUserId === L.scope.userId;
        const reviewer = L.grant.can('review');
        if (prev.status === 'publicado' || prev.status === 'archivado') return res.status(409).json({ error: 'Una solicitud publicada o archivada no se edita: crea una nueva.' });
        if (['borrador', 'ajustes'].includes(prev.status) && !(owner || reviewer)) return res.status(403).json({ error: 'Sólo quien la envió puede editarla.' });
        if (['enviado', 'en_revision', 'aprobado'].includes(prev.status) && !reviewer) return res.status(403).json({ error: 'Una solicitud enviada sólo la edita quien revisa; si necesitas cambiarla, pide ajustes.' });
        const r = shapeChangeRequest({ ...prev, ...req.body, kind: prev.kind, contentId: prev.contentId, operation: req.body?.operation || prev.operation });
        const submit = req.body?.submit === true && ['borrador', 'ajustes'].includes(prev.status);
        const juicio = validateChangeRequest(r, { submit });
        if (!juicio.ok) return res.status(400).json({ error: firstError(juicio.errors, 'Revisa la solicitud.'), errors: juicio.errors });
        if (!canSubmitScope(L.grant, { scopeType: r.scopeType, districtNumber: r.districtNumber, clubActivationId: r.clubActivationId, kind: r.kind }) && !reviewer) return res.status(403).json({ error: 'Ese alcance no está en tus permisos.' });
        // Cambiar el contenido de una solicitud APROBADA invalida la aprobación: vuelve a revisión, nunca en silencio.
        const invalidate = prev.status === 'aprobado' && payloadChanged(prev.payload, r.payload);
        const row = await S.updateChangeRequest(prev.id, r, { actor: actorOf(req), resubmit: submit, invalidateApproval: invalidate });
        if (submit) N.notifyChangeSubmitted({ program: L.program, request: row, members: await S.listMembers(L.program.id), host: hostOf(req) }).catch(() => {});
        res.json({ request: row, approvalInvalidated: invalidate });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/changes/:reqId/status  { to, reason }
export const adminTransitionChange = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const prev = await S.getChangeRequest(String(req.params.reqId));
        if (!prev || prev.programId !== L.program.id) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        const to = String(req.body?.to || '');
        const reason = String(req.body?.reason || '').trim().slice(0, 1000);
        if (!canTransitionRequest(prev.status, to)) return res.status(409).json({ error: `No se puede pasar de «${EDITORIAL_STATES[prev.status]?.label}» a «${EDITORIAL_STATES[to]?.label || to}».` });
        const ability = TRANSITION_ABILITY[to];
        const owner = prev.ownerUserId && prev.ownerUserId === L.scope.userId;
        if (to === 'enviado' || to === 'borrador') { if (!(owner || L.grant.can('review'))) return res.status(403).json({ error: 'Sólo quien la envió puede reenviarla.' }); }
        else if (!L.grant.can(ability)) return res.status(403).json({ error: 'Tu perfil no puede realizar esa acción.' });
        if (requestNeedsReason(to) && reason.length < 5) return res.status(400).json({ error: 'Escribe el motivo u observación (mínimo 5 caracteres).' });
        if (to === 'aprobado' && prev.requiresMedicalReview && !prev.medicalReviewedAt) return res.status(409).json({ error: 'Esta solicitud requiere la aprobación del revisor médico antes de aprobarse.' });
        const row = await S.transitionChangeRequest(prev.id, to, { actor: actorOf(req), reason });
        if (['ajustes', 'aprobado', 'archivado'].includes(to)) {
            const ownerEmail = row.ownerUserId ? (await db.query(`SELECT email FROM "User" WHERE id = $1`, [row.ownerUserId]).catch(() => ({ rows: [] }))).rows[0]?.email : null;
            N.notifyChangeStatus({ program: L.program, request: row, host: hostOf(req), to: ownerEmail }).catch(() => {});
        }
        res.json({ request: row });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/changes/:reqId/medical  { approved, note }
export const adminMedicalReview = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'medicalApprove'); if (!L) return;
        const prev = await S.getChangeRequest(String(req.params.reqId));
        if (!prev || prev.programId !== L.program.id) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        if (!prev.requiresMedicalReview) return res.status(409).json({ error: 'Esta solicitud no requiere revisión médica.' });
        if (!['enviado', 'en_revision', 'aprobado'].includes(prev.status)) return res.status(409).json({ error: 'La solicitud no está en revisión.' });
        const row = await S.medicalApproveRequest(prev.id, { actor: actorOf(req), approved: req.body?.approved !== false, note: String(req.body?.note || '').slice(0, 1000) });
        res.json({ request: row });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/changes/:reqId/publish
export const adminPublishChange = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'publish'); if (!L) return;
        let prev = await S.getChangeRequest(String(req.params.reqId));
        if (!prev || prev.programId !== L.program.id) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        // Atajo de quien aprueba Y publica: desde «Enviado»/«En revisión» aprueba y publica en un paso, con las dos entradas en el historial.
        if (['enviado', 'en_revision'].includes(prev.status) && L.grant.can('approve')) {
            if (prev.requiresMedicalReview && !prev.medicalReviewedAt) return res.status(409).json({ error: 'Esta solicitud requiere la aprobación del revisor médico antes de publicarse.' });
            prev = await S.transitionChangeRequest(prev.id, 'aprobado', { actor: actorOf(req), reason: 'Aprobada al publicar' });
        }
        if (!canPublishRequest(prev.status)) return res.status(409).json({ error: 'Sólo se publica una solicitud aprobada.' });
        if (prev.kind === 'correction') {
            return res.status(409).json({ error: 'Una «Corrección de información» describe el error; aplícala creando la solicitud de actualización del registro correspondiente (o archívala si ya se corrigió).' });
        }
        if (CONTENT_KINDS[prev.kind] && prev.operation !== 'retirar') {
            const d = prev.approvedPayload || prev.payload;
            const { validateContent } = await import('../lib/programSpec.js');
            const v = validateContent(prev.kind, d, { publish: true });
            if (!v.ok) return res.status(400).json({ error: `No se puede publicar: ${firstError(v.errors, '')}`, errors: v.errors });
        }
        const out = await S.publishChangeRequest(prev.id, { actor: actorOf(req), program: L.program });
        if (!out.ok) return res.status(409).json({ error: out.error });
        const ownerEmail = out.request.ownerUserId ? (await db.query(`SELECT email FROM "User" WHERE id = $1`, [out.request.ownerUserId]).catch(() => ({ rows: [] }))).rows[0]?.email : null;
        N.notifyChangeStatus({ program: L.program, request: out.request, host: hostOf(req), to: ownerEmail }).catch(() => {});
        res.json({ request: out.request });
    } catch (e) { return fail(res, e); }
};

// ─── Solicitudes públicas ─────────────────────────────────────────────

// GET /admin/:id/requests
export const adminListRequests = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const { program, grant, scope } = L;
        if (grant.can('manageRequests')) {
            const out = await S.listPublicRequests(program.id, { status: String(req.query.status || ''), type: String(req.query.type || ''), assignee: String(req.query.assignee || ''), q: String(req.query.q || '').slice(0, 100), page: intq(req.query.page, 1), perPage: Math.min(intq(req.query.perPage, 25), 100) });
            return res.json({ mode: 'full', ...out, rows: out.rows.map(r => ({ ...r, history: undefined, notes: undefined, summary: summaryOf(r) })) });
        }
        if (grant.can('viewRequestsSummary') && scope.siteId) {
            const rows = await S.originRequestsForClub(program.id, scope.siteId);
            return res.json({ mode: 'origin', rows: rows.map(r => ({ publicRef: r.publicRef, type: r.type, typeLabel: PUBLIC_REQUEST_TYPES[r.type]?.label || r.type, status: r.status, statusLabel: REQUEST_STATES[r.status]?.label || r.status, receivedAt: r.createdAt })), total: rows.length });
        }
        return res.status(403).json({ error: 'No tienes acceso a las solicitudes de este programa.' });
    } catch (e) { return fail(res, e); }
};

/** Una línea para el listado, SIN datos de contacto. */
const summaryOf = (r) => {
    const d = r.data || {};
    if (r.type === 'orientacion') return `${d.city || d.region || ''} · ${d.contactMeans || ''}`.trim();
    if (r.type === 'apoyo') return `${d.entityKind === 'empresa' ? (d.organization || 'Empresa') : 'Persona'} · ${SUPPORT_TYPES.find(s => s.id === d.supportType)?.label || ''}`;
    if (r.type === 'club') return `${d.clubName || ''} · D${d.districtNumber || ''}`;
    return '';
};

// GET /admin/:id/requests/:reqId
export const adminGetRequest = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'manageRequests'); if (!L) return;
        const r = await S.getPublicRequest(String(req.params.reqId));
        if (!r || r.programId !== L.program.id) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        await S.audit({ programId: L.program.id, entityType: 'public_request', entityId: r.id, action: 'viewed', actor: actorOf(req), detail: { ref: r.publicRef } });
        const members = (await S.listMembers(L.program.id)).filter(m => m.active && (m.roles || []).some(x => ['gestor_solicitudes', 'coordinador'].includes(x)));
        res.json({ request: r, next: nextPublicRequestStates(r.status), assignees: members.map(m => ({ userId: m.userId, email: m.email, name: m.name })) });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/requests/:reqId/status  { to, reason, derivedTo }
export const adminTransitionRequest = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'manageRequests'); if (!L) return;
        const r = await S.getPublicRequest(String(req.params.reqId));
        if (!r || r.programId !== L.program.id) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        const to = String(req.body?.to || '');
        if (!REQUEST_STATE_IDS.includes(to) || !canTransitionPublicRequest(r.status, to)) return res.status(409).json({ error: 'Transición no permitida.' });
        const reason = String(req.body?.reason || '').trim().slice(0, 500);
        if (to === 'cerrada' && reason.length < 3) return res.status(400).json({ error: 'Indica el motivo de cierre.' });
        const row = await S.transitionPublicRequest(r.id, to, { actor: actorOf(req), reason, derivedTo: String(req.body?.derivedTo || '').slice(0, 200) });
        res.json({ request: row, next: nextPublicRequestStates(row.status) });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/requests/:reqId/assign  { assigneeUserId|assigneeEmail, backupUserId }
export const adminAssignRequest = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'manageRequests'); if (!L) return;
        const r = await S.getPublicRequest(String(req.params.reqId));
        if (!r || r.programId !== L.program.id) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        const members = await S.listMembers(L.program.id);
        const pick = (id, email) => members.find(m => (id && m.userId === id) || (email && m.email === String(email).toLowerCase()));
        const a = pick(req.body?.assigneeUserId, req.body?.assigneeEmail);
        const b = pick(req.body?.backupUserId, req.body?.backupEmail);
        const self = !a && req.body?.assignToMe === true ? { userId: L.scope.userId, name: L.scope.name } : null;
        const chosen = a || self;
        if (!chosen) return res.status(400).json({ error: 'Elige un responsable del programa.' });
        const row = await S.assignPublicRequest(r.id, { assigneeUserId: chosen.userId, assigneeName: chosen.name || chosen.email, backupUserId: b?.userId || null, backupName: b?.name || b?.email || null, actor: actorOf(req) });
        N.notifyAssignment({ program: L.program, request: row, members, host: hostOf(req) }).catch(() => {});
        res.json({ request: row });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/requests/:reqId/notes  { text }
export const adminNoteRequest = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'manageRequests'); if (!L) return;
        const r = await S.getPublicRequest(String(req.params.reqId));
        if (!r || r.programId !== L.program.id) return res.status(404).json({ error: 'Solicitud no encontrada.' });
        const text = String(req.body?.text || '').trim();
        if (text.length < 2) return res.status(400).json({ error: 'Escribe la nota.' });
        res.json({ request: await S.notePublicRequest(r.id, text, { actor: actorOf(req) }) });
    } catch (e) { return fail(res, e); }
};

// ─── Clubes participantes ─────────────────────────────────────────────

// GET /admin/:id/clubs
export const adminListClubs = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const { program, grant, scope, ctx } = L;
        const activations = grant.can('manageClubs') ? await S.listActivations(program.id) : (scope.siteId ? await S.listActivations(program.id, { clubId: scope.siteId }) : []);
        const links = await S.listLinks(program.id);
        const available = links.find(l => l.status === 'activa' && l.allowClubActivation !== false && scope.districtNumbers.includes(Number(l.districtNumber))) || null;
        res.json({ activations, links, myActivation: ctx.activation, canActivate: grant.can('activateClub') && program.status === 'activo' && Boolean(available) && !(ctx.activation && ctx.activation.status === 'activa'), availableLink: available ? { id: available.id, districtNumber: available.districtNumber } : null });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/clubs/activate  { localContact, localNote, showInMenu }
export const adminActivateClub = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'activateClub'); if (!L) return;
        const { program, scope } = L;
        if (program.status !== 'activo') return res.status(409).json({ error: 'El programa todavía no está publicado.' });
        if (!scope.siteId || scope.siteIsDistrict) return res.status(403).json({ error: 'La activación la hace el sitio de un club.' });
        const links = await S.listLinks(program.id);
        const link = links.find(l => l.status === 'activa' && l.allowClubActivation !== false && scope.districtNumbers.includes(Number(l.districtNumber)));
        if (!link) return res.status(403).json({ error: 'Este programa no está disponible para el distrito de tu club.' });
        const data = shapeActivation(req.body || {});
        const juicio = validateActivation(data);
        if (!juicio.ok) return res.status(400).json({ error: firstError(juicio.errors, 'Revisa los datos.'), errors: juicio.errors });
        await ensureClubCatalogSchema();
        const profile = (await db.query(`SELECT id FROM "DistrictClubProfile" WHERE "clubId" = $1 LIMIT 1`, [scope.siteId]).catch(() => ({ rows: [] }))).rows[0];
        const row = await S.activateClub({ programId: program.id, link, clubId: scope.siteId, clubName: scope.siteName, clubProfileId: profile?.id || null, data, actor: actorOf(req) });
        res.status(201).json({ activation: row });
    } catch (e) { return fail(res, e); }
};

// PUT /admin/:id/clubs/:activationId
export const adminUpdateActivation = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const act = await S.getActivation(String(req.params.activationId));
        if (!act || act.programId !== L.program.id) return res.status(404).json({ error: 'Activación no encontrada.' });
        const own = L.scope.siteId && act.clubId === L.scope.siteId && L.grant.can('activateClub');
        if (!own && !L.grant.can('manageClubs')) return res.status(403).json({ error: 'Esa activación es de otro club.' });
        const data = shapeActivation(req.body || {});
        const juicio = validateActivation(data);
        if (!juicio.ok) return res.status(400).json({ error: firstError(juicio.errors, 'Revisa los datos.'), errors: juicio.errors });
        res.json({ activation: await S.updateActivation(act.id, data, { actor: actorOf(req) }) });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/clubs/:activationId/deactivate  { reason }
export const adminDeactivateClub = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const act = await S.getActivation(String(req.params.activationId));
        if (!act || act.programId !== L.program.id) return res.status(404).json({ error: 'Activación no encontrada.' });
        const own = L.scope.siteId && act.clubId === L.scope.siteId && L.grant.can('activateClub');
        if (!own && !L.grant.can('manageClubs')) return res.status(403).json({ error: 'Esa activación es de otro club.' });
        res.json({ activation: await S.deactivateClub(act.id, { actor: actorOf(req), reason: String(req.body?.reason || '').slice(0, 500) }) });
    } catch (e) { return fail(res, e); }
};

// ─── Archivos privados ────────────────────────────────────────────────

// POST /admin/:id/files/presign  { filename, size, kind }
export const adminPresignFile = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'manageFiles'); if (!L) return;
        const { filename, size, kind } = req.body || {};
        const juicio = checkPrivateFileMeta({ filename, size, kind });
        if (!juicio.ok) return res.status(400).json({ error: juicio.errores[0], errores: juicio.errores });
        const out = await presignProgramUpload({ programId: L.program.id, filename });
        res.json({ ok: true, ...out, kind });
    } catch (e) { return fail(res, e, 400); }
};

// POST /admin/:id/files/register  { storageKey, filename, size, kind, label, relatedType, relatedId }
export const adminRegisterFile = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'manageFiles'); if (!L) return;
        const { storageKey, filename, size, kind, label, relatedType, relatedId } = req.body || {};
        const juicio = checkPrivateFileMeta({ filename, size, kind });
        if (!juicio.ok) return res.status(400).json({ error: juicio.errores[0] });
        if (!programKeyBelongs(storageKey, L.program.id)) return res.status(400).json({ error: 'El archivo no corresponde a este programa. Vuelve a subirlo.' });
        const real = await inspectProgramObject(storageKey, juicio.ext);
        if (!real.bytes) return res.status(400).json({ error: 'No encontramos el archivo subido. Vuelve a adjuntarlo.' });
        if (real.bytes > PRIVATE_FILE_MAX_BYTES) { await deleteProgramObject(storageKey, L.program.id); return res.status(400).json({ error: 'El archivo supera los 25 MB.' }); }
        if (!real.format) { await deleteProgramObject(storageKey, L.program.id); return res.status(400).json({ error: `El contenido del archivo no corresponde a .${juicio.ext}.` }); }
        const row = await S.registerFile({ programId: L.program.id, kind, storageKey, filename: String(filename).slice(0, 240), contentType: real.contentType, bytes: real.bytes, format: real.format, label: String(label || '').slice(0, 160), relatedType: relatedType ? String(relatedType).slice(0, 40) : null, relatedId: relatedId ? String(relatedId).slice(0, 80) : null, actor: actorOf(req) });
        res.status(201).json({ file: { id: row.id, kind: row.kind, filename: row.filename, bytes: Number(row.bytes), label: row.label, createdAt: row.createdAt } });
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id/files
export const adminListFiles = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'manageFiles'); if (!L) return;
        const rows = await S.listFiles(L.program.id, { kind: String(req.query.kind || '') });
        res.json({ files: rows.map(f => ({ id: f.id, kind: f.kind, filename: f.filename, bytes: Number(f.bytes), label: f.label, relatedType: f.relatedType, relatedId: f.relatedId, uploadedByName: f.uploadedByName, createdAt: f.createdAt })) });
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id/files/:fileId/download → enlace firmado, 2 minutos, auditado
export const adminDownloadFile = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        const f = await S.getFile(String(req.params.fileId));
        if (!f || f.programId !== L.program.id) return res.status(404).json({ error: 'Archivo no encontrado.' });
        // Un comprobante de autorización sólo lo ve quien revisa o administra; un recurso, quien administra archivos.
        const sensitive = f.kind === 'autorizacion' || f.kind === 'documento_respaldo';
        if (sensitive && !(L.grant.can('review') || L.grant.can('editProgram') || L.grant.can('medicalApprove') || f.uploadedBy === L.scope.userId)) return res.status(403).json({ error: 'Los comprobantes son privados.' });
        if (!sensitive && !L.grant.can('manageFiles')) return res.status(403).json({ error: 'Sin acceso al archivo.' });
        const url = await signedProgramDownload(f.storageKey, { filename: f.filename, contentType: f.contentType, inline: req.query.inline === '1' });
        await S.audit({ programId: L.program.id, entityType: 'file', entityId: f.id, action: 'downloaded', actor: actorOf(req), detail: { kind: f.kind, filename: f.filename } });
        res.json({ url, expiresIn: 120 });
    } catch (e) { return fail(res, e); }
};

// ─── La página pública por contenedores (v4.1281) ─────────────────────

const landingCatalogs = () => ({ blockTypes: BLOCK_TYPES, backgrounds: BACKGROUNDS, icons: ICONS, buttonActions: BUTTON_ACTIONS, detailAnchors: DETAIL_ANCHORS, formTargets: FORM_TARGETS });

/** Lo que el editor necesita: borrador, publicada, fuentes disponibles y los avisos de cada contenedor. */
const landingPayload = async (L) => {
    const { program, ctx } = L;
    const link = ctx.links.find(l => l.status === 'activa') || null;
    const state = await S.landingState(program, { districtNumber: link?.districtNumber || program.ownerDistrictNumber || null });
    const sources = await S.landingSources(program, { districtNumber: link?.districtNumber || null, activationId: null });
    const preview = resolveLanding(state.draft, sources, { preview: true });
    return {
        draft: state.draft, published: state.published, exists: state.exists, draftVersion: state.draftVersion, publishedVersion: state.publishedVersion,
        updatedByName: state.updatedByName, updatedAt: state.updatedAt, publishedByName: state.publishedByName, publishedAt: state.publishedAt,
        unpublishedChanges: state.exists && (!state.published || JSON.stringify(state.published) !== JSON.stringify(state.draft)),
        notes: Object.fromEntries(preview.blocks.map(b => [b.id, { ready: b.ready, notes: b.notes }])),
        sources: {
            clinics: sources.clinics.length, stories: sources.stories.map(s => ({ id: s.id, title: s.title, date: s.date })), resources: sources.resources.length,
            resourcesByType: sources.resources.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] || 0) + 1 }), {}),
            indicators: sources.indicators.map(i => ({ id: i.id, name: i.name, value: i.value, unit: i.unit, period: i.period })),
            donation: sources.donation ? { receiver: sources.donation.receiver, verifiedAt: sources.donation.verifiedAt, url: sources.donation.url } : null,
            formsEnabled: sources.formsEnabled,
        },
        catalogs: landingCatalogs(), slug: program.slug,
    };
};

// GET /admin/:id/landing
export const adminGetLanding = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        res.json({ ...(await landingPayload(L)), canEdit: L.grant.can('editProgram'), canPublish: L.grant.can('publish') });
    } catch (e) { return fail(res, e); }
};

// PUT /admin/:id/landing  { landing, baseVersion }
export const adminSaveLanding = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'editProgram'); if (!L) return;
        const landing = shapeLanding(req.body?.landing);
        const juicio = validateLanding(landing);
        if (!juicio.ok) return res.status(400).json({ error: juicio.errors[0].message, errors: juicio.errors });
        const r = await S.saveLandingDraft(L.program.id, landing, { actor: actorOf(req), baseVersion: req.body?.baseVersion });
        if (!r.ok) return res.status(409).json({ error: 'Otra persona guardó esta página mientras la editabas. Recarga para ver sus cambios y vuelve a aplicar los tuyos.', code: 'LANDING_CONFLICT', current: r.current ? { draftVersion: r.current.draftVersion, updatedByName: r.current.updatedByName, updatedAt: r.current.updatedAt } : null });
        res.json(await landingPayload(L));
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/landing/publish  { baseVersion, note }
export const adminPublishLanding = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'publish'); if (!L) return;
        const r = await S.publishLanding(L.program.id, { actor: actorOf(req), baseVersion: req.body?.baseVersion, note: String(req.body?.note || '').slice(0, 300) });
        if (!r.ok) return res.status(r.conflict ? 409 : 400).json({ error: r.conflict ? 'El borrador cambió mientras publicabas. Recarga y vuelve a intentar.' : r.error, code: r.conflict ? 'LANDING_CONFLICT' : undefined });
        res.json(await landingPayload(L));
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id/landing/versions
export const adminLandingVersions = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'view'); if (!L) return;
        res.json({ versions: await S.landingVersions(L.program.id) });
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/landing/restore  { version }
export const adminRestoreLanding = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'editProgram'); if (!L) return;
        const r = await S.restoreLandingVersion(L.program.id, req.body?.version, { actor: actorOf(req) });
        if (!r.ok) return res.status(r.conflict ? 409 : 400).json({ error: r.error || 'No se pudo restaurar.' });
        res.json(await landingPayload(L));
    } catch (e) { return fail(res, e); }
};

// POST /admin/:id/landing/reset → vuelve el BORRADOR al diseño inicial (no publica)
export const adminResetLanding = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'editProgram'); if (!L) return;
        const { defaultLanding } = await import('../lib/programLandingSpec.js');
        const link = L.ctx.links.find(l => l.status === 'activa') || null;
        const cur = await S.getLanding(L.program.id);
        const r = await S.saveLandingDraft(L.program.id, defaultLanding(L.program, { districtNumber: link?.districtNumber || L.program.ownerDistrictNumber || null }), { actor: actorOf(req), baseVersion: cur?.draftVersion ?? 0 });
        if (!r.ok) return res.status(409).json({ error: 'El borrador cambió mientras tanto. Recarga.' });
        res.json(await landingPayload(L));
    } catch (e) { return fail(res, e); }
};

// GET /admin/landing/new-block?type=
export const adminNewBlock = async (req, res) => {
    const b = newBlock(String(req.query.type || ''));
    if (!b) return res.status(400).json({ error: 'Tipo de contenedor desconocido.' });
    res.json({ block: b });
};

// ─── Auditoría y métricas ─────────────────────────────────────────────

// GET /admin/:id/audit
export const adminAudit = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'viewAudit'); if (!L) return;
        res.json(await S.auditList(L.program.id, { limit: Math.min(intq(req.query.perPage, 50), 200), offset: (intq(req.query.page, 1) - 1) * Math.min(intq(req.query.perPage, 50), 200), entityType: String(req.query.entityType || '') }));
    } catch (e) { return fail(res, e); }
};

// GET /admin/:id/metrics?from&to
export const adminMetrics = async (req, res) => {
    try {
        const L = await loadProgram(req, res, 'viewMetrics'); if (!L) return;
        const d = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
        res.json({ ...(await S.metricsSummary(L.program.id, { from: d(req.query.from), to: d(req.query.to) })), labels: METRIC_LABELS });
    } catch (e) { return fail(res, e); }
};

// GET /admin/clubs-catalog?district=4281
export const adminClubsCatalog = async (req, res) => {
    try {
        await ensureClubCatalogSchema();
        const district = intq(req.query.district, 0);
        const rows = await catalogForForms({ districts: district ? [district] : [] });
        res.json({ clubs: rows.slice(0, 400).map(c => ({ id: c.id, name: c.officialName, city: c.city || '', district: Number(c.districtNumber), siteId: c.clubId || null })) });
    } catch (e) { return fail(res, e); }
};

/** Para probar sin red: el resolutor de embebidos que el panel usa al validar. */
export const _internals = { resolveEmbed, requestNeedsMedicalReview, contentTitleOf, signPreview, verifyPreview };

export default {
    publicCatalog, publicProgram, publicMetric, publicSubmitRequest, publicSubscribe, publicRequestStatus, publicClubs,
    adminContext, adminList, adminCreate, adminGet, adminUpdate, adminStatus, adminPreviewToken, adminUpsertLink, adminUpsertMember, adminRemoveMember,
    adminListContent, adminGetContent, adminListChanges, adminCreateChange, adminGetChange, adminUpdateChange, adminTransitionChange, adminMedicalReview, adminPublishChange,
    adminListRequests, adminGetRequest, adminTransitionRequest, adminAssignRequest, adminNoteRequest, adminListClubs, adminActivateClub, adminUpdateActivation, adminDeactivateClub,
    adminPresignFile, adminRegisterFile, adminListFiles, adminDownloadFile, adminAudit, adminMetrics, adminClubsCatalog,
    adminGetLanding, adminSaveLanding, adminPublishLanding, adminLandingVersions, adminRestoreLanding, adminResetLanding, adminNewBlock,
};
