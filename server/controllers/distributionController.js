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
    TARGET_TYPES, MANUAL_NOTICE,
    buildSchedule, groupScheduleByDay, validateCampaign, normalizeInterval,
} from '../lib/distributionSpec.js';
import {
    GROUP_STATES, GROUP_PROVIDERS, filterGroups, paginate, listsOf, toCsv, toJson, PER_PAGE,
} from '../lib/groupSpec.js';
import {
    listGroups, importGroups, setGroupStatus, patchGroup, removeGroup,
} from '../lib/distributionGroups.js';
import {
    createCampaign, getCampaign, listCampaigns, advance,
    pauseCampaign, resumeCampaign, cancelCampaign, retryJob, markManualPublished,
} from '../lib/distributionQueue.js';

const prisma = new PrismaClient();

/** Quién pregunta y qué alcance tiene. Único punto que lo decide. */
const scopeOf = (req) => {
    const isPlatform = req.user?.role === 'administrator';
    return { isPlatform, clubId: req.user?.clubId || null, userId: req.user?.id || null };
};

const fail = (res, code, msg) => res.status(code).json({ error: msg });

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

/**
 * Los grupos, en la forma que consume el selector de destinos.
 *
 * v4.876: salen de `DistributionGroup`, no del `Setting`. La migración desde el
 * Setting ocurre sola en la primera lectura de cada sitio.
 */
const readGroups = async (clubId) => {
    const filas = await listGroups(clubId);
    return filas.map(g => ({
        key: `group:${g.groupId}`,
        targetType: 'group_manual',
        targetId: g.groupId,
        targetName: g.name,
        targetUrl: g.url,
        socialAccountId: g.socialAccountId,
        status: g.status,
        canPublish: g.canPublish,
        favorite: g.favorite,
        tags: g.tags,
        lastPublishedAt: g.lastPublishedAt,
        rowId: g.id,
    }));
};

/**
 * El panel de grupos: filtrado, ordenado y paginado EN EL SERVIDOR.
 *
 * Filtrar acá y no en la pantalla es lo que hace que «seleccionar todos» opere
 * exactamente sobre lo que se está viendo. Con dos implementaciones, marcar
 * todos seleccionaría grupos fuera de la vista — la forma más cara de
 * equivocarse en este módulo.
 */
export const getGroups = async (req, res) => {
    try {
        const { isPlatform, clubId } = scopeOf(req);
        const target = isPlatform && req.query.clubId ? req.query.clubId : clubId;
        const todos = await listGroups(target);
        const filtrados = filterGroups(todos, {
            q: req.query.q || '',
            tag: req.query.tag || '',
            status: req.query.status || '',
            accountId: req.query.accountId || '',
            onlyFavorites: req.query.favorites === '1',
        });
        const pagina = paginate(filtrados, {
            page: parseInt(req.query.page || '1', 10),
            perPage: parseInt(req.query.perPage || String(PER_PAGE), 10),
        });
        res.json({
            ...pagina,
            groups: pagina.items,
            // Los catálogos viajan con la respuesta: la pantalla no lleva su
            // propia copia de los estados ni de las listas.
            lists: listsOf(todos),
            states: GROUP_STATES,
            providers: GROUP_PROVIDERS,
            totalAll: todos.length,
            verificados: todos.filter(g => g.canPublish).length,
            notice: MANUAL_NOTICE,
        });
    } catch (e) {
        console.error('[distribution] getGroups:', e);
        fail(res, 500, e.message);
    }
};

/** Alta e importación: JSON, CSV o líneas pegadas. El formato se detecta. */
export const postImportGroups = async (req, res) => {
    try {
        const { clubId } = scopeOf(req);
        if (!clubId) return fail(res, 400, 'No hay sitio en la sesión.');
        const texto = String(req.body?.text || '');
        if (!texto.trim()) return fail(res, 400, 'No llegó nada que importar.');
        const r = await importGroups({ clubId, text: texto, accountId: req.body?.accountId || null });
        if (!r.ok) return res.status(422).json({ error: r.reason, format: r.format, skipped: r.skipped || [] });
        res.json({ ...r, groups: await readGroups(clubId) });
    } catch (e) {
        console.error('[distribution] postImportGroups:', e);
        fail(res, 500, e.message);
    }
};

/** Exportar lo declarado. `?format=csv|json`. */
export const getExportGroups = async (req, res) => {
    try {
        const { isPlatform, clubId } = scopeOf(req);
        const target = isPlatform && req.query.clubId ? req.query.clubId : clubId;
        const grupos = await listGroups(target);
        const formato = req.query.format === 'json' ? 'json' : 'csv';
        const sello = new Date().toISOString().slice(0, 10);
        if (formato === 'json') {
            // `toJson` es puro y deja el sello en null a propósito: la fecha la
            // pone quien exporta, no el criterio.
            const cuerpo = JSON.parse(toJson(grupos));
            cuerpo.exportedAt = new Date().toISOString();
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="grupos-${sello}.json"`);
            return res.send(JSON.stringify(cuerpo, null, 2));
        }
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="grupos-${sello}.csv"`);
        // BOM: sin él, Excel abre los acentos como «RodrÃ­go» (regla de la
        // exportación de la Bóveda, v4.850).
        res.send('\uFEFF' + toCsv(grupos));
    } catch (e) {
        console.error('[distribution] getExportGroups:', e);
        fail(res, 500, e.message);
    }
};

/** Verificar, marcar sin permiso o retirar. */
export const postGroupStatus = async (req, res) => {
    const { clubId } = scopeOf(req);
    const r = await setGroupStatus({
        clubId, groupRowId: req.params.id, status: req.body?.status,
        userName: req.user?.name || req.user?.email || null,
    });
    if (!r.ok) return fail(res, 409, r.reason);
    res.json(r);
};

/** Favorito, etiquetas, cuenta y notas. */
export const patchGroupRow = async (req, res) => {
    const { clubId } = scopeOf(req);
    const r = await patchGroup({ clubId, groupRowId: req.params.id, ...req.body });
    if (!r.ok) return fail(res, 409, r.reason);
    res.json(r);
};

export const deleteGroupRow = async (req, res) => {
    const { clubId } = scopeOf(req);
    const r = await removeGroup({ clubId, groupRowId: req.params.id });
    if (!r.ok) return fail(res, 409, r.reason);
    res.json(r);
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
            concurrency: body.concurrency,
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
    listTargets, getGroups, postImportGroups, getExportGroups,
    postGroupStatus, patchGroupRow, deleteGroupRow, getPagePosts, previewSchedule,
    postCampaign, getCampaigns, getOneCampaign, postPause, postResume, postCancel,
    postAdvance, postRetryJob, postManualDone,
};
