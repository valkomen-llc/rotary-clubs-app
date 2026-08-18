/**
 * Distribución multi-destino — la API del asistente.
 *
 * v4.864. El alcance se resuelve en UN solo punto (`scopeOf`) por el que pasan
 * todas las rutas: el `clubId` sale del token y el cuerpo de la petición no
 * puede nombrar otro sitio. Es el mismo patrón que `buildFilters` en
 * Postulaciones y `resolveScope` en el ecosistema del Distrito.
 */
import { PrismaClient } from '@prisma/client';
import { decryptToken } from '../lib/tokenCrypto.js';
import { listPagePosts } from '../services/socialPublishService.js';
import {
    TARGET_TYPES, CONTENT_KINDS, JOB_STATES, CAMPAIGN_STATES,
    INTERVAL_PRESETS, MIN_INTERVAL_MINUTES, MANUAL_NOTICE, DEFAULT_LIMITS,
    buildSchedule, groupScheduleByDay, validateCampaign, normalizeInterval,
} from '../lib/distributionSpec.js';
import {
    createCampaign, getCampaign, listCampaigns, advance,
    pauseCampaign, resumeCampaign, cancelCampaign, retryJob, markManualPublished,
} from '../lib/distributionQueue.js';

const prisma = new PrismaClient();

const GROUPS_SETTING = 'distribution_groups';

/** Quién pregunta y qué alcance tiene. Único punto que lo decide. */
const scopeOf = (req) => {
    const isPlatform = req.user?.role === 'administrator';
    return { isPlatform, clubId: req.user?.clubId || null, userId: req.user?.id || null };
};

const fail = (res, code, msg) => res.status(code).json({ error: msg });

// ── Catálogos ───────────────────────────────────────────────────────────────
//
// La pantalla no lleva su propia copia de los estados ni de los intervalos: los
// pide. Con dos catálogos, uno se queda atrás y el panel ofrece un intervalo
// que el servidor rechaza.
export const getCatalog = async (_req, res) => {
    res.json({
        targetTypes: TARGET_TYPES,
        contentKinds: CONTENT_KINDS,
        jobStates: JOB_STATES,
        campaignStates: CAMPAIGN_STATES,
        intervalPresets: INTERVAL_PRESETS,
        minIntervalMinutes: MIN_INTERVAL_MINUTES,
        defaultLimits: DEFAULT_LIMITS,
        manualNotice: MANUAL_NOTICE,
    });
};

// ── Destinos disponibles ────────────────────────────────────────────────────

/**
 * Lo que se puede elegir como destino: las cuentas conectadas —que publican
 * solas— y los grupos declarados a mano —que no—.
 *
 * ⚠️ Los grupos NO se descubren: Meta retiró también la lectura de grupos, así
 * que no hay forma de preguntarle a la API cuáles administra alguien. Se
 * declaran a mano en la pantalla, con su nombre y su enlace, y eso se dice.
 */
export const listTargets = async (req, res) => {
    try {
        const { isPlatform, clubId } = scopeOf(req);
        const where = isPlatform && req.query.clubId ? { clubId: req.query.clubId } : (isPlatform ? {} : { clubId });
        const accounts = await prisma.socialAccount.findMany({
            where: { ...where, status: 'active' },
            select: { id: true, platform: true, platformId: true, accountName: true, avatar: true, status: true, tokenVersion: true, clubId: true },
            orderBy: { accountName: 'asc' },
        });

        const cuentas = accounts.map(a => ({
            key: `acct:${a.id}`,
            targetType: a.platform === 'instagram' ? 'instagram' : 'page',
            targetId: a.platformId,
            targetName: a.accountName || a.platformId,
            socialAccountId: a.id,
            avatar: a.avatar || null,
            // Un token heredado no sirve para publicar; se dice acá para que el
            // destino salga marcado en vez de fallar recién en la cola.
            needsReconnect: a.tokenVersion === 0,
        }));

        const grupos = await readGroups(isPlatform && req.query.clubId ? req.query.clubId : clubId);

        res.json({ accounts: cuentas, groups: grupos, manualNotice: MANUAL_NOTICE });
    } catch (e) {
        console.error('[distribution] listTargets:', e);
        fail(res, 500, e.message);
    }
};

const readGroups = async (clubId) => {
    if (!clubId) return [];
    try {
        const row = await prisma.setting.findFirst({ where: { key: GROUPS_SETTING, clubId } });
        const parsed = row ? JSON.parse(row.value) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
};

export const getGroups = async (req, res) => {
    const { isPlatform, clubId } = scopeOf(req);
    const target = isPlatform && req.query.clubId ? req.query.clubId : clubId;
    res.json({ groups: await readGroups(target), notice: MANUAL_NOTICE });
};

/** Guarda la lista de grupos declarados. Sólo nombre y enlace: no hay más que guardar. */
export const saveGroups = async (req, res) => {
    try {
        const { clubId } = scopeOf(req);
        if (!clubId) return fail(res, 400, 'No hay sitio en la sesión.');
        const entrada = Array.isArray(req.body?.groups) ? req.body.groups : [];
        const limpio = entrada
            .map(g => ({
                key: `group:${String(g.id || g.url || g.name || '').trim()}`,
                targetType: 'group_manual',
                targetId: String(g.id || g.url || g.name || '').trim(),
                targetName: String(g.name || '').trim(),
                targetUrl: /^https:\/\//i.test(String(g.url || '')) ? String(g.url).trim() : null,
                tag: String(g.tag || '').trim() || null,
            }))
            // Un grupo sin nombre no se puede elegir en una lista, y uno sin
            // identificador no se puede distinguir de otro. Se descarta con
            // criterio, no en silencio: el conteo vuelve en la respuesta.
            .filter(g => g.targetName && g.targetId);

        await prisma.setting.upsert({
            where: { key_clubId: { key: GROUPS_SETTING, clubId } },
            update: { value: JSON.stringify(limpio) },
            create: { key: GROUPS_SETTING, clubId, value: JSON.stringify(limpio) },
        });
        res.json({ ok: true, groups: limpio, descartados: entrada.length - limpio.length });
    } catch (e) {
        console.error('[distribution] saveGroups:', e);
        fail(res, 500, e.message);
    }
};

// ── Publicaciones recientes de una Página (carril «compartir») ───────────────
export const getPagePosts = async (req, res) => {
    try {
        const { isPlatform, clubId } = scopeOf(req);
        const where = { id: req.query.accountId };
        if (!isPlatform) where.clubId = clubId;
        const acc = await prisma.socialAccount.findFirst({ where });
        if (!acc) return fail(res, 404, 'Cuenta no encontrada.');
        if (acc.platform !== 'facebook') return fail(res, 400, 'Sólo una Página de Facebook tiene publicaciones que compartir.');
        if (acc.tokenVersion === 0) return fail(res, 409, 'La cuenta usa una conexión antigua. Reconectala en Cuentas Sociales.');

        const r = await listPagePosts({ pageId: acc.platformId, pageAccessToken: decryptToken(acc.accessToken) });
        if (!r.ok) return fail(res, 502, r.error);
        res.json({ posts: r.posts });
    } catch (e) {
        console.error('[distribution] getPagePosts:', e);
        fail(res, 500, e.message);
    }
};

// ── Vista previa del calendario ─────────────────────────────────────────────
//
// ⚠️ EL CALENDARIO LO RESUELVE EL SERVIDOR Y VIAJA RESUELTO. La pantalla no
// rehace la aritmética de fechas: con dos cálculos, la línea de tiempo del
// asistente y las horas que de verdad se guardan podrían discrepar, y eso se
// lee como que la programación no funciona. Misma regla que el período de la
// Bóveda (v4.849).
export const previewSchedule = async (req, res) => {
    try {
        const { content = {}, targets = [], intervalMinutes, startAt, timezone = 'UTC', scheduleWindow, perDay, limits } = req.body || {};
        const check = validateCampaign({ content, targets, intervalMinutes, limits });
        const eligible = check.eligible;
        const slots = buildSchedule({
            startAt: startAt ? new Date(startAt) : new Date(),
            intervalMinutes, count: eligible.length, timezone,
            window: scheduleWindow || null, perDay: perDay || check.limits.maxPerDay,
        });
        const withTarget = slots.map((s, i) => ({
            at: s.at.toISOString(),
            dateKey: s.dateKey,
            targetName: eligible[i]?.targetName || null,
            targetType: eligible[i]?.targetType || null,
            viaApi: !!TARGET_TYPES[eligible[i]?.targetType]?.viaApi,
        }));
        res.json({
            ok: check.ok,
            errors: check.errors,
            warnings: check.warnings,
            interval: check.interval,
            timezone,
            days: groupScheduleByDay(slots, timezone).map(d => ({
                dateKey: d.dateKey,
                items: d.items.map(it => withTarget[it.index]),
            })),
            total: withTarget.length,
        });
    } catch (e) {
        console.error('[distribution] previewSchedule:', e);
        fail(res, 500, e.message);
    }
};

// ── Campañas ────────────────────────────────────────────────────────────────

export const postCampaign = async (req, res) => {
    try {
        const { isPlatform, clubId, userId } = scopeOf(req);
        const body = req.body || {};
        const targetClub = isPlatform && body.clubId ? body.clubId : clubId;
        const { minutes } = normalizeInterval(body.intervalMinutes);

        const r = await createCampaign({
            clubId: targetClub, userId,
            name: body.name, sourceType: body.sourceType, sourceId: body.sourceId,
            content: body.content, targets: body.targets,
            intervalMinutes: minutes,
            startAt: body.startAt ? new Date(body.startAt) : null,
            timezone: body.timezone || 'UTC',
            scheduleWindow: body.scheduleWindow || null,
            perDay: body.perDay || null,
            limits: body.limits || {},
            copyMode: body.copyMode || 'same',
        });
        if (!r.ok) return res.status(422).json({ error: r.reason, errors: r.errors || [], warnings: r.warnings || [] });

        // Se avanza en el acto: el primer destino sale sin esperar al cron, que
        // es lo que hace que «Publicar ahora» signifique ahora.
        advance({ campaignId: r.campaignId, timeBudgetMs: 8000, limit: 1 }).catch(() => {});
        res.status(201).json(r);
    } catch (e) {
        console.error('[distribution] postCampaign:', e);
        fail(res, 500, e.message);
    }
};

export const getCampaigns = async (req, res) => {
    try {
        const { isPlatform, clubId } = scopeOf(req);
        res.json({ campaigns: await listCampaigns({ clubId, isPlatform, limit: parseInt(req.query.limit || '50', 10) }) });
    } catch (e) {
        console.error('[distribution] getCampaigns:', e);
        fail(res, 500, e.message);
    }
};

export const getOneCampaign = async (req, res) => {
    try {
        const { isPlatform, clubId } = scopeOf(req);
        const c = await getCampaign({ campaignId: req.params.id, clubId, isPlatform });
        if (!c) return fail(res, 404, 'Campaña no encontrada.');
        res.json(c);
    } catch (e) {
        console.error('[distribution] getOneCampaign:', e);
        fail(res, 500, e.message);
    }
};

/** Guarda que la campaña sea de quien pregunta, antes de dejarlo tocarla. */
const ownCampaign = async (req) => {
    const { isPlatform, clubId } = scopeOf(req);
    return getCampaign({ campaignId: req.params.id, clubId, isPlatform });
};

export const postPause = async (req, res) => {
    if (!(await ownCampaign(req))) return fail(res, 404, 'Campaña no encontrada.');
    res.json(await pauseCampaign({ campaignId: req.params.id, userId: scopeOf(req).userId }));
};

export const postResume = async (req, res) => {
    if (!(await ownCampaign(req))) return fail(res, 404, 'Campaña no encontrada.');
    const r = await resumeCampaign({ campaignId: req.params.id, userId: scopeOf(req).userId });
    advance({ campaignId: req.params.id, timeBudgetMs: 8000, limit: 1 }).catch(() => {});
    res.json(r);
};

export const postCancel = async (req, res) => {
    if (!(await ownCampaign(req))) return fail(res, 404, 'Campaña no encontrada.');
    res.json(await cancelCampaign({ campaignId: req.params.id, userId: scopeOf(req).userId }));
};

/**
 * El sondeo del navegador. Es la más rápida de las tres vías que llaman a
 * `advance`, y existe para que quien está mirando vea avanzar la cola sin
 * esperar al minuto del cron.
 */
export const postAdvance = async (req, res) => {
    const c = await ownCampaign(req);
    if (!c) return fail(res, 404, 'Campaña no encontrada.');
    const r = await advance({ campaignId: req.params.id, timeBudgetMs: 20_000, limit: 5 });
    const fresh = await getCampaign({ campaignId: req.params.id, clubId: scopeOf(req).clubId, isPlatform: scopeOf(req).isPlatform });
    res.json({ ...r, campaign: fresh });
};

// ── Destinos sueltos ────────────────────────────────────────────────────────

export const postRetryJob = async (req, res) => {
    const { isPlatform, clubId, userId } = scopeOf(req);
    const r = await retryJob({ jobId: req.params.id, clubId, isPlatform, userId });
    if (!r.ok) return fail(res, 409, r.reason);
    res.json(r);
};

export const postManualDone = async (req, res) => {
    const { isPlatform, clubId, userId } = scopeOf(req);
    const r = await markManualPublished({
        jobId: req.params.id, clubId, isPlatform, userId,
        userName: req.user?.name || req.user?.email || null,
        postUrl: req.body?.postUrl || null,
    });
    if (!r.ok) return fail(res, 409, r.reason);
    res.json(r);
};

export default {
    getCatalog, listTargets, getGroups, saveGroups, getPagePosts, previewSchedule,
    postCampaign, getCampaigns, getOneCampaign, postPause, postResume, postCancel,
    postAdvance, postRetryJob, postManualDone,
};
