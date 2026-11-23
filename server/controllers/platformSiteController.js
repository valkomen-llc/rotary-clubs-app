// ════════════════════════════════════════════════════════════════════
// Sitio web de Club Platform — el controlador (v4.1348.0)
//
// El sitio institucional de la PLATAFORMA: se crea, edita, revisa, publica y
// revierte desde el panel central. Cada operación se valida AQUÍ, no en el
// navegador: el rol sale de la sesión (administrador central) o de
// `PlatformSiteMember` (editor / revisor), leído de la base en cada petición
// para que quitar un acceso surta efecto en el acto.
//
// Lo público sólo responde con la versión PUBLICADA y sólo si el sitio está
// «en vivo»; el borrador se ve con un token firmado de una hora.
// ════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import dns from 'dns';
import { JWT_SECRET } from '../middleware/auth.js';
import S from '../lib/platformSiteStore.js';
import {
    shapeSite, validateSite, publishChecklist, resolvePage, newBlock, newPage, structuredData, sitemapXml, robotsTxt, can, canPublishNow, shapeBlock,
    BLOCK_TYPES, BACKGROUNDS, ICONS, SPACINGS, ANIMATIONS, BUTTON_ACTIONS, ACCENTS, ROLES, ASSIGNABLE_ROLES, REVIEW_STATES, RESERVED_SLUGS, PLATFORM_FACTS,
    PLATFORM_SITE_TYPE, PLATFORM_SITE_TYPE_LABEL, ADMIN_HOST, normalizeHost, isCentralAdmin,
} from '../lib/platformSiteSpec.js';

console.log('[platform-site] v4.1349.0 cargado — Sitio web de Club Platform: borrador, vista previa firmada, revisión, publicación y reversión');

const actorOf = (req) => ({ id: req.user?.id || null, name: req.user?.name || req.user?.email || 'Administración' });
const fail = (res, e) => { console.error('[platform-site]', e); res.status(500).json({ error: 'No se pudo completar la operación.' }); };
const hostOf = (req) => normalizeHost(String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].split(':')[0]);

/** El rol de quien pide: `admin` (central), `editor`, `reviewer` o `null`. */
export async function roleOf(req) {
    if (!req.user) return null;
    if (isCentralAdmin(req.user)) return 'admin';
    return S.memberRole({ userId: req.user.id, email: req.user.email });
}

/** Barrera de toda ruta del panel: sin rol, 403; sin la habilidad, 403. */
const guard = (ability) => async (req, res, next) => {
    try {
        const role = await roleOf(req);
        if (!role || !can(role, ability)) {
            console.warn(`[platform-site] "${req.user?.email || req.user?.id}" sin «${ability}» en ${req.method} ${req.originalUrl}`);
            return res.status(403).json({ error: 'No tienes acceso al sitio institucional de Club Platform.', code: 'NO_PLATFORM_SITE_ACCESS' });
        }
        req.platformRole = role;
        next();
    } catch (e) { fail(res, e); }
};
export const canView = guard('view');
export const canEdit = guard('edit');
export const canReview = guard('review');
export const canPublish = guard('publish');
export const canDomain = guard('domain');
export const canMembers = guard('members');
export const canLeads = guard('leads');

// ─── Vista previa firmada ──────────────────────────────────────────────

const PREVIEW_TTL_MS = 60 * 60 * 1000;
const sign = (exp) => crypto.createHmac('sha256', JWT_SECRET).update(`platform-site.preview.${exp}`).digest('hex');
export const signPreview = (now = Date.now()) => { const exp = now + PREVIEW_TTL_MS; return `${exp}.${sign(exp)}`; };
export const verifyPreview = (token, now = Date.now()) => {
    const [exp, sig] = String(token || '').split('.');
    if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
    const esperado = sign(exp);
    return sig.length === esperado.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado));
};

// ════════════════════════════════════════════════════════════════════
// PÚBLICO
// ════════════════════════════════════════════════════════════════════

const sourcesFor = async (config) => {
    const ids = [...new Set(config.pages.flatMap(p => p.blocks.filter(b => b.type === 'sites' && b.enabled).flatMap(b => b.content.siteIds)))];
    return { sites: await S.ecosystemSites(ids) };
};

// GET /public?path=/&t=
export const publicPage = async (req, res) => {
    try {
        const site = await S.getSite();
        const preview = Boolean(req.query.t) && verifyPreview(req.query.t);
        if (!site) return res.status(404).json({ live: false, exists: false });
        const config = preview ? site.draft : (site.publicLive ? site.published : null);
        if (!config) return res.status(404).json({ live: false, exists: true });
        const slug = String(req.query.path || '/').replace(/^\/+|\/+$/g, '').slice(0, 80);
        const base = preview ? '/vista-previa/sitio-institucional' : '';
        const page = resolvePage(config, slug, await sourcesFor(config), { preview, base });
        if (!page) return res.status(404).json({ live: site.publicLive, exists: true, notFound: true });
        // La vista previa nunca se guarda en caché ni se indexa.
        res.set('Cache-Control', preview ? 'no-store' : 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
        if (preview) res.set('X-Robots-Tag', 'noindex, nofollow');
        res.json({
            live: site.publicLive, preview, host: site.publicHost, page,
            jsonLd: page.page.isHome && !preview ? structuredData(config, site.publicHost) : null,
            version: preview ? null : site.publishedVersion,
        });
    } catch (e) { fail(res, e); }
};

// GET /public/sitemap.xml · /public/robots.txt
export const publicSitemap = async (_req, res) => {
    try {
        const site = await S.getSite();
        if (!site?.published || !site.publicLive) return res.status(404).type('text/plain').send('Not found');
        res.type('application/xml').set('Cache-Control', 'public, max-age=600').send(sitemapXml(site.published, site.publicHost, site.publishedAt ? new Date(site.publishedAt).toISOString() : null));
    } catch (e) { fail(res, e); }
};
export const publicRobots = async (_req, res) => {
    try {
        const site = await S.getSite();
        res.type('text/plain').set('Cache-Control', 'public, max-age=600').send(robotsTxt(site?.publicHost || 'clubplatform.org', { live: Boolean(site?.published && site.publicLive) }));
    } catch (e) { fail(res, e); }
};

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, max);
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// POST /public/lead
export const publicLead = async (req, res) => {
    try {
        const b = req.body || {};
        // Trampa para robots: un campo que una persona no ve ni rellena.
        if (clean(b.website, 200)) return res.json({ ok: true });
        const site = await S.getSite();
        const preview = Boolean(b.t) && verifyPreview(b.t);
        if (!site || (!preview && !(site.publicLive && site.published))) return res.status(404).json({ error: 'El formulario no está disponible.' });
        const config = preview ? site.draft : site.published;
        const contact = config.pages.flatMap(p => p.blocks).find(x => x.type === 'contact' && x.enabled);
        if (!contact?.content.formEnabled) return res.status(404).json({ error: 'El formulario no está disponible.' });
        const lead = {
            name: clean(b.name, 120), email: clean(b.email, 160).toLowerCase(), organization: clean(b.organization, 160), roleTitle: clean(b.roleTitle, 120),
            country: clean(b.country, 80), phone: clean(b.phone, 40), message: String(b.message ?? '').trim().slice(0, 2000), pagePath: clean(b.pagePath, 200),
            consentText: contact.content.consentText,
        };
        const errors = [];
        if (lead.name.length < 2) errors.push({ field: 'name', message: 'Escribe tu nombre.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) errors.push({ field: 'email', message: 'Escribe un correo válido.' });
        if (b.consent !== true) errors.push({ field: 'consent', message: 'Necesitamos tu autorización para responderte.' });
        if (errors.length) return res.status(400).json({ error: errors[0].message, errors });
        // En vista previa el formulario se prueba, pero no escribe ni envía nada.
        if (preview) return res.json({ ok: true, preview: true, message: contact.content.successMessage });
        if (await S.recentLeadCount(lead.email) >= 3) return res.status(429).json({ error: 'Ya recibimos tus solicitudes. Te responderemos por correo.' });
        const row = await S.createLead(lead);
        const to = config.settings.contact.email;
        if (to) {
            // El aviso no decide el resultado: la solicitud ya quedó guardada.
            (async () => {
                try {
                    const { default: EmailService } = await import('../services/EmailService.js');
                    await EmailService.sendPlatformEmail({
                        to, replyTo: lead.email, subject: `Solicitud de información — ${lead.name}`,
                        html: `<p>Nueva solicitud desde el sitio de Club Platform.</p><ul><li><b>Nombre:</b> ${esc(lead.name)}</li><li><b>Correo:</b> ${esc(lead.email)}</li><li><b>Organización:</b> ${esc(lead.organization || '—')}</li><li><b>Cargo:</b> ${esc(lead.roleTitle || '—')}</li><li><b>País:</b> ${esc(lead.country || '—')}</li><li><b>Teléfono:</b> ${esc(lead.phone || '—')}</li></ul><p>${esc(lead.message || '').replace(/\n/g, '<br>')}</p><p>Gestiónala en https://${ADMIN_HOST}/admin/sitio-institucional</p>`,
                    });
                    await S.markLeadNotified(row.id);
                } catch (e) { console.error('[platform-site] no se pudo avisar de la solicitud:', e.message); }
            })();
        }
        res.json({ ok: true, message: contact.content.successMessage });
    } catch (e) { fail(res, e); }
};

// POST /public/visit  { path, first }
export const publicVisit = async (req, res) => {
    try {
        const site = await S.getSite();
        // Sólo cuenta el sitio en vivo, y nunca una petición con sesión del panel:
        // el tráfico administrativo no es una visita.
        if (site?.publicLive && site.published && !req.headers.authorization) {
            const path = `/${String(req.body?.path || '/').replace(/^\/+|\/+$/g, '').slice(0, 80)}`;
            const known = site.published.pages.some(p => `/${p.slug}` === path && p.enabled);
            if (known) await S.recordVisit(path, { firstToday: req.body?.first === true });
        }
        res.status(204).end();
    } catch { res.status(204).end(); }
};

// ════════════════════════════════════════════════════════════════════
// PANEL
// ════════════════════════════════════════════════════════════════════

const catalogs = () => ({ blockTypes: BLOCK_TYPES, backgrounds: BACKGROUNDS, icons: ICONS, spacings: SPACINGS, animations: ANIMATIONS, buttonActions: BUTTON_ACTIONS, accents: ACCENTS, roles: ROLES, assignableRoles: ASSIGNABLE_ROLES, reviewStates: REVIEW_STATES, reservedSlugs: RESERVED_SLUGS });

const payload = async (role) => {
    const site = await S.getSite();
    const abilities = ROLES[role]?.abilities || [];
    if (!site) return { exists: false, role, roleLabel: ROLES[role]?.label, abilities, siteType: PLATFORM_SITE_TYPE, siteTypeLabel: PLATFORM_SITE_TYPE_LABEL, adminHost: ADMIN_HOST, catalogs: catalogs() };
    const sources = await sourcesFor(site.draft);
    const notes = {};
    for (const p of site.draft.pages) {
        const r = resolvePage(site.draft, p.slug, sources, { preview: true });
        for (const b of r?.blocks || []) notes[b.id] = { ready: b.ready, notes: b.notes };
    }
    const checklist = publishChecklist(site.draft);
    const gate = canPublishNow({ role, requireReview: site.requireReview, reviewStatus: site.reviewStatus, reviewedVersion: site.reviewedVersion, draftVersion: site.draftVersion });
    return {
        exists: true, role, roleLabel: ROLES[role]?.label, abilities,
        siteType: PLATFORM_SITE_TYPE, siteTypeLabel: PLATFORM_SITE_TYPE_LABEL, adminHost: ADMIN_HOST,
        name: site.name, draft: site.draft, hasPublished: Boolean(site.published),
        draftVersion: site.draftVersion, publishedVersion: site.publishedVersion,
        unpublishedChanges: !site.published || Number(site.publishedDraftVersion) !== Number(site.draftVersion),
        status: !site.published ? 'draft' : (site.publicLive ? 'live' : 'published_private'),
        review: { required: site.requireReview, status: site.reviewStatus, note: site.reviewNote, reviewedVersion: site.reviewedVersion, reviewedByName: site.reviewedByName, reviewedAt: site.reviewedAt, current: Number(site.reviewedVersion) === Number(site.draftVersion) },
        publish: { allowed: gate.ok && checklist.ok, reason: gate.ok ? (checklist.ok ? '' : checklist.blocking[0]) : gate.reason, checklist },
        domain: { publicHost: site.publicHost, publicLive: site.publicLive, liveAt: site.liveAt, liveByName: site.liveByName },
        seo: { title: Boolean(site.draft.settings.seo.title || site.draft.pages[0].seo.title), description: Boolean(site.draft.settings.seo.description || site.draft.pages[0].seo.description), image: Boolean(site.draft.settings.seo.image || site.draft.pages[0].seo.image) },
        createdByName: site.createdByName, createdAt: site.createdAt, updatedByName: site.updatedByName, updatedAt: site.updatedAt, publishedByName: site.publishedByName, publishedAt: site.publishedAt,
        notes, catalogs: catalogs(),
    };
};

// GET /admin
export const adminGet = async (req, res) => { try { res.json(await payload(req.platformRole)); } catch (e) { fail(res, e); } };

// GET /admin/access → para el menú: ¿esta sesión ve el módulo? (nunca 403)
export const adminAccess = async (req, res) => {
    try { const role = await roleOf(req); res.json({ role, abilities: ROLES[role]?.abilities || [] }); }
    catch { res.json({ role: null, abilities: [] }); }
};

// POST /admin/create
export const adminCreate = async (req, res) => {
    try {
        const r = await S.createSite({ actor: actorOf(req) });
        res.status(r.created ? 201 : 200).json({ ...(await payload(req.platformRole)), created: r.created });
    } catch (e) { fail(res, e); }
};

const conflict = (res, current) => res.status(409).json({ error: 'Otra persona guardó el sitio mientras lo editabas. Recarga para ver sus cambios y vuelve a aplicar los tuyos.', code: 'SITE_CONFLICT', current: current ? { draftVersion: current.draftVersion, updatedByName: current.updatedByName, updatedAt: current.updatedAt } : null });

// PUT /admin/draft  { site, baseVersion }
export const adminSaveDraft = async (req, res) => {
    try {
        const site = shapeSite(req.body?.site);
        const juicio = validateSite(site);
        if (!juicio.ok) return res.status(400).json({ error: juicio.errors[0].message, errors: juicio.errors });
        const r = await S.saveDraft(site, { actor: actorOf(req), baseVersion: req.body?.baseVersion });
        if (!r.ok) return conflict(res, r.current);
        res.json(await payload(req.platformRole));
    } catch (e) { fail(res, e); }
};

// POST /admin/review/submit  { baseVersion, note }   (editor → revisión)
export const adminSubmitReview = async (req, res) => {
    try {
        const site = await S.getSite();
        if (!site) return res.status(404).json({ error: 'El sitio institucional todavía no existe.' });
        const check = publishChecklist(site.draft);
        if (!check.ok) return res.status(400).json({ error: check.blocking[0], errors: check.blocking });
        const r = await S.setReview('in_review', { actor: actorOf(req), baseVersion: req.body?.baseVersion, note: req.body?.note });
        if (!r.ok) return conflict(res, null);
        res.json(await payload(req.platformRole));
    } catch (e) { fail(res, e); }
};

// POST /admin/review/decide  { decision: 'approved' | 'changes_requested', baseVersion, note }
export const adminDecideReview = async (req, res) => {
    try {
        const decision = req.body?.decision;
        if (!['approved', 'changes_requested'].includes(decision)) return res.status(400).json({ error: 'Decisión no válida.' });
        if (decision === 'changes_requested' && !String(req.body?.note || '').trim()) return res.status(400).json({ error: 'Explica qué cambios hacen falta.' });
        const r = await S.setReview(decision, { actor: actorOf(req), baseVersion: req.body?.baseVersion, note: req.body?.note });
        if (!r.ok) return conflict(res, null);
        res.json(await payload(req.platformRole));
    } catch (e) { fail(res, e); }
};

// POST /admin/publish  { baseVersion, note }
export const adminPublish = async (req, res) => {
    try {
        const site = await S.getSite();
        if (!site) return res.status(404).json({ error: 'El sitio institucional todavía no existe.' });
        const gate = canPublishNow({ role: req.platformRole, requireReview: site.requireReview, reviewStatus: site.reviewStatus, reviewedVersion: site.reviewedVersion, draftVersion: site.draftVersion });
        if (!gate.ok) return res.status(403).json({ error: gate.reason, code: 'REVIEW_REQUIRED' });
        const check = publishChecklist(site.draft);
        if (!check.ok) return res.status(400).json({ error: check.blocking[0], errors: check.blocking });
        const r = await S.publish({ actor: actorOf(req), baseVersion: req.body?.baseVersion, note: String(req.body?.note || '').slice(0, 300) });
        if (!r.ok) return r.conflict ? conflict(res, null) : res.status(400).json({ error: r.error });
        res.json(await payload(req.platformRole));
    } catch (e) { fail(res, e); }
};

// GET /admin/versions
export const adminVersions = async (_req, res) => { try { res.json({ versions: await S.versions() }); } catch (e) { fail(res, e); } };

// POST /admin/versions/restore  { version } → al BORRADOR
export const adminRestore = async (req, res) => {
    try {
        const r = await S.restoreToDraft(req.body?.version, { actor: actorOf(req) });
        if (!r.ok) return r.conflict ? conflict(res, r.current) : res.status(400).json({ error: r.error });
        res.json(await payload(req.platformRole));
    } catch (e) { fail(res, e); }
};

// POST /admin/rollback  { version, note } → vuelve a PUBLICAR esa versión
export const adminRollback = async (req, res) => {
    try {
        const note = String(req.body?.note || '').trim().slice(0, 300);
        if (!note) return res.status(400).json({ error: 'Indica el motivo de la reversión.' });
        const r = await S.rollback(req.body?.version, { actor: actorOf(req), note });
        if (!r.ok) return res.status(400).json({ error: r.error });
        res.json(await payload(req.platformRole));
    } catch (e) { fail(res, e); }
};

// POST /admin/preview-token
export const adminPreviewToken = async (_req, res) => res.json({ token: signPreview(), path: '/vista-previa/sitio-institucional' });

// PUT /admin/config  { publicHost?, requireReview?, publicLive? }
export const adminConfig = async (req, res) => {
    try {
        const b = req.body || {};
        // Activar el sitio en el dominio público es la decisión más visible del
        // módulo: exige escribir el dominio, como confirmación deliberada.
        if (b.publicLive === true) {
            const site = await S.getSite();
            if (normalizeHost(b.confirmHost) !== site?.publicHost) return res.status(400).json({ error: 'Para activar el sitio público escribe el dominio exactamente como está configurado.' });
        }
        const r = await S.updateConfig({ publicHost: b.publicHost, requireReview: b.requireReview, publicLive: b.publicLive }, { actor: actorOf(req) });
        if (!r.ok) return res.status(400).json({ error: r.error });
        res.json(await payload(req.platformRole));
    } catch (e) { fail(res, e); }
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// GET /admin/domain-status → ¿el dominio llega a ESTE despliegue? Sólo lectura: no toca DNS ni Vercel.
export const adminDomainStatus = async (req, res) => {
    try {
        const site = await S.getSite();
        const host = site?.publicHost || 'clubplatform.org';
        const out = { host, dns: { ok: false, records: [] }, reachesThisApp: false, https: false, redirectsTo: null, checkedAt: new Date().toISOString(), currentHost: hostOf(req) };
        try {
            const a = await withTimeout(dns.promises.resolve4(host), 4000);
            out.dns = { ok: a.length > 0, records: a.slice(0, 4) };
        } catch (e) { out.dns.error = e.code || e.message; }
        try {
            // El mismo `ping` público de la plataforma: si responde con su forma, el dominio sirve ESTA aplicación.
            const r = await fetch(`https://${host}/api/platform-config/ping`, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'clubplatform-domain-check' } });
            out.https = true;
            if (r.status >= 300 && r.status < 400) out.redirectsTo = r.headers.get('location');
            else if (r.ok) { const j = await r.json().catch(() => null); out.reachesThisApp = j?.status === 'ok'; }
        } catch (e) { out.httpsError = e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || e.message); }
        res.json(out);
    } catch (e) { fail(res, e); }
};

// GET /admin/events
export const adminEvents = async (_req, res) => { try { res.json({ events: await S.events(80) }); } catch (e) { fail(res, e); } };

// GET /admin/stats?days=
export const adminStats = async (req, res) => { try { res.json(await S.visitStats(req.query.days)); } catch (e) { fail(res, e); } };

// GET /admin/sources/sites → catálogo de sitios publicados (datos públicos)
export const adminSourceSites = async (_req, res) => { try { res.json({ sites: await S.ecosystemSites() }); } catch (e) { fail(res, e); } };

// GET /admin/new-block?type=   ·   GET /admin/new-page?title=
export const adminNewBlock = (req, res) => { const b = newBlock(String(req.query.type || '')); return b ? res.json({ block: b }) : res.status(400).json({ error: 'Tipo de contenedor no válido.' }); };
export const adminNewPage = (req, res) => res.json({ page: newPage(String(req.query.title || '')) });

// ─── Accesos ───────────────────────────────────────────────────────────
export const adminMembers = async (_req, res) => { try { res.json({ members: await S.members() }); } catch (e) { fail(res, e); } };
export const adminAddMember = async (req, res) => {
    try {
        const r = await S.upsertMember({ email: req.body?.email, role: req.body?.role }, { actor: actorOf(req) });
        if (!r.ok) return res.status(400).json({ error: r.error });
        res.json({ members: await S.members() });
    } catch (e) { fail(res, e); }
};
export const adminRemoveMember = async (req, res) => { try { await S.removeMember(req.params.id, { actor: actorOf(req) }); res.json({ members: await S.members() }); } catch (e) { fail(res, e); } };

// ─── Solicitudes ───────────────────────────────────────────────────────
export const adminLeads = async (req, res) => { try { res.json(await S.listLeads({ status: String(req.query.status || ''), page: req.query.page })); } catch (e) { fail(res, e); } };
export const adminUpdateLead = async (req, res) => {
    try {
        const r = await S.updateLead(req.params.id, { status: req.body?.status, note: req.body?.note }, { actor: actorOf(req) });
        if (!r.ok) return res.status(r.error ? 400 : 404).json({ error: r.error || 'Solicitud no encontrada.' });
        res.json({ ok: true });
    } catch (e) { fail(res, e); }
};

// ─── Asistente de redacción ────────────────────────────────────────────

const TEXT_KEYS = ['eyebrow', 'title', 'description', 'label', 'caption', 'question', 'answer', 'body'];
/** Sólo los TEXTOS de un contenedor: lo único que el asistente lee y propone. */
export const textView = (v) => {
    if (Array.isArray(v)) return v.map(textView);
    if (v && typeof v === 'object') {
        const out = {};
        for (const [k, x] of Object.entries(v)) {
            if (['image', 'link', 'button', 'buttons', 'siteIds'].includes(k)) continue;
            if (typeof x === 'string') { if (TEXT_KEYS.includes(k)) out[k] = x; }
            else if (x && typeof x === 'object') out[k] = textView(x);
        }
        return out;
    }
    return v;
};
/** Vuelca los textos propuestos sobre el contenido real, sin tocar estructura, imágenes ni enlaces. */
export const mergeText = (base, proposal) => {
    if (Array.isArray(base)) return base.map((x, i) => (Array.isArray(proposal) && proposal[i] !== undefined ? mergeText(x, proposal[i]) : x));
    if (base && typeof base === 'object') {
        const out = { ...base };
        for (const k of Object.keys(base)) {
            const p = proposal && typeof proposal === 'object' ? proposal[k] : undefined;
            if (p === undefined) continue;
            if (typeof base[k] === 'string') { if (TEXT_KEYS.includes(k) && typeof p === 'string') out[k] = p; }
            else if (base[k] && typeof base[k] === 'object' && !['image', 'link', 'button', 'buttons'].includes(k)) out[k] = mergeText(base[k], p);
        }
        return out;
    }
    return base;
};

const GOALS = {
    improve: 'Mejora la claridad y la fuerza de los textos conservando su sentido.',
    shorten: 'Acorta los textos sin perder la idea principal.',
    seo: 'Reescribe titulares y descripciones para que sean claros para buscadores, con lenguaje natural.',
    consistency: 'Unifica el tono editorial: institucional, cercano y sobrio, en segunda persona.',
    accessibility: 'Usa lenguaje sencillo y frases cortas, comprensibles para cualquier lector.',
};

// POST /admin/ai/suggest  { block, goal }  → propuesta; NO guarda nada.
export const adminAiSuggest = async (req, res) => {
    try {
        const block = shapeBlock(req.body?.block);
        if (!block) return res.status(400).json({ error: 'Contenedor no válido.' });
        const goal = GOALS[req.body?.goal] ? req.body.goal : 'improve';
        const { routeToModel, getDefaultModel } = await import('../lib/ai-router.js');
        const system = [
            'Eres el redactor institucional de Club Platform for Rotary. Escribes en español.',
            'Trabajas SÓLO con estos hechos validados de la plataforma:',
            ...PLATFORM_FACTS.map(f => `- ${f}`),
            'Si un dato no está en esa lista, no lo escribas. Club Platform es la plataforma central: no es un club ni un distrito.',
            'Devuelve ÚNICAMENTE un objeto JSON con la misma estructura y las mismas claves que recibes, con los textos reescritos. Sin comentarios ni texto adicional.',
        ].join('\n');
        const user = `Contenedor: ${BLOCK_TYPES[block.type].label}.\nObjetivo: ${GOALS[goal]}\nTextos actuales:\n${JSON.stringify(textView(block.content))}`;
        const notes = [];
        let raw;
        try { raw = await withTimeout(routeToModel(await getDefaultModel(), system, user, [], { maxTokens: 1800, notes, feature: 'platform-site' }), 60000); }
        catch (e) { return res.status(502).json({ error: `El asistente no respondió (${e.message}). El borrador no cambió.` }); }
        let parsed = null;
        try { const m = String(raw).match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
        if (!parsed) return res.status(502).json({ error: 'El asistente devolvió algo que no se pudo leer. El borrador no cambió.' });
        const proposal = shapeBlock({ ...block, content: mergeText(block.content, parsed) });
        await S.audit('ai_suggested', actorOf(req), { blockId: block.id, type: block.type, goal });
        // La propuesta vuelve al navegador: sólo entra al borrador si alguien la aplica y guarda.
        res.json({ proposal, goal, notes, facts: PLATFORM_FACTS });
    } catch (e) { fail(res, e); }
};

export default {
    roleOf, canView, canEdit, canReview, canPublish, canDomain, canMembers, canLeads, signPreview, verifyPreview, textView, mergeText,
    publicPage, publicSitemap, publicRobots, publicLead, publicVisit,
    adminGet, adminAccess, adminCreate, adminSaveDraft, adminSubmitReview, adminDecideReview, adminPublish, adminVersions, adminRestore, adminRollback,
    adminPreviewToken, adminConfig, adminDomainStatus, adminEvents, adminStats, adminSourceSites, adminNewBlock, adminNewPage,
    adminMembers, adminAddMember, adminRemoveMember, adminLeads, adminUpdateLead, adminAiSuggest,
};
