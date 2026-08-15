// ════════════════════════════════════════════════════════════════════
// Campañas de Contribución — orquestación
// v4.803.0
//
// El CRITERIO vive en server/lib/contributionSpec.js (puro y probado); acá
// sólo hay I/O: filas, historial, caché y tokens de vista previa. Si una
// decisión nueva aparece en este archivo, probablemente pertenece al spec.
//
// Reglas que este archivo hace cumplir:
// - El estado NO se escribe sin historial (patrón EventRegistrationHistory).
// - Publicar valida con validateForPublish y devuelve los motivos CONCRETOS:
//   un indicador sin fuente no sale, y se dice cuál.
// - Una campaña con historial no se borra: se archiva. Sólo un borrador que
//   nunca se publicó se puede eliminar.
// - La lectura pública va cacheada con TTL corto e invalidación al escribir
//   (patrón linkRedirectStore): esto corre en cada visita de la página de
//   aportes y sin campaña activa debe costar ~0.
// ════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import db from '../lib/db.js';
import { ensureContributionSchema } from '../lib/ensureContributionSchema.js';
import {
    CAMPAIGN_TYPES, DEFAULT_CAMPAIGN_TYPE, campaignTypeCatalog,
    CAMPAIGN_STATUSES, canTransition, effectiveStatus,
    normalizeTargeting, pickCampaignForSite, normalizeContent, normalizeStats,
    validateForPublish, sanitizeOverride, resolveForSite, slugify,
    normalizeCenters,
} from '../lib/contributionSpec.js';

console.log('[CONTRIBUTION v4.806] Controller cargado — campañas de contribución (Fase 4: indicadores en página y sobrescritura local)');

// ─── Historial ─────────────────────────────────────────────────────────────
const recordHistory = async (campaignId, action, actor, detail = {}) => {
    await db.query(
        `INSERT INTO "ContributionCampaignHistory" ("campaignId", action, actor, detail)
         VALUES ($1, $2, $3, $4)`,
        [campaignId, action, actor || null, JSON.stringify(detail)]
    );
};

// ─── Caché de la lectura pública ───────────────────────────────────────────
//
// Un mapa clubId → { at, payload }. TTL corto porque la campaña puede
// corregirse durante una emergencia; toda escritura lo vacía entero — es más
// simple que invalidar por targeting y el costo es una consulta.
const CACHE_TTL_MS = 60 * 1000;
const activeCache = new Map();
const invalidateCache = () => activeCache.clear();

// ─── Vista previa con token ────────────────────────────────────────────────
//
// «Ver página sin obligar a publicar»: el operador recibe un enlace firmado
// (HMAC con JWT_SECRET, vencimiento corto). El token sólo abre ESA campaña —
// no es una sesión ni da acceso a nada más.
const PREVIEW_TTL_MS = 60 * 60 * 1000; // 1 hora
const previewSecret = () => process.env.JWT_SECRET || 'dev-secret';

export const signPreviewToken = (campaignId, now = Date.now()) => {
    const exp = now + PREVIEW_TTL_MS;
    const sig = crypto.createHmac('sha256', previewSecret())
        .update(`${campaignId}.${exp}`).digest('base64url');
    return `${exp}.${sig}`;
};

export const verifyPreviewToken = (campaignId, token, now = Date.now()) => {
    const [expRaw, sig] = String(token || '').split('.');
    const exp = Number(expRaw);
    if (!exp || !sig || now > exp) return false;
    const expected = crypto.createHmac('sha256', previewSecret())
        .update(`${campaignId}.${exp}`).digest('base64url');
    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
        return false;
    }
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const rowToCampaign = (r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    campaignType: r.campaignType,
    status: r.status,
    startAt: r.startAt,
    endAt: r.endAt,
    priority: r.priority,
    content: r.content || {},
    stats: r.stats || [],
    targeting: r.targeting || {},
    recipientClubId: r.recipientClubId,
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
    publishedAt: r.publishedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
});

const actorOf = (req) => req.user?.email || req.user?.id || null;

// El slug es la identidad pública de la campaña (métricas, preview): único.
// Si el derivado del nombre ya existe, sufijo numérico — patrón freeSlug.
const freeSlug = async (base) => {
    const { rows } = await db.query(
        `SELECT slug FROM "ContributionCampaign" WHERE slug = $1 OR slug LIKE $2`,
        [base, `${base}-%`]
    );
    if (!rows.some(r => r.slug === base)) return base;
    for (let i = 2; i < 1000; i++) {
        if (!rows.some(r => r.slug === `${base}-${i}`)) return `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
};

// ─── CRUD (operador de la plataforma) ──────────────────────────────────────

// GET /api/contribution-campaigns
export const listCampaigns = async (req, res) => {
    try {
        await ensureContributionSchema();
        const { rows } = await db.query(
            `SELECT * FROM "ContributionCampaign" ORDER BY "updatedAt" DESC LIMIT 200`
        );
        const now = new Date();
        res.json({
            campaigns: rows.map(r => ({
                ...rowToCampaign(r),
                effectiveStatus: effectiveStatus(r, now),
            })),
            catalog: campaignTypeCatalog(),
        });
    } catch (e) {
        console.error('[CONTRIBUTION] listCampaigns:', e);
        res.status(500).json({ error: 'No se pudieron cargar las campañas' });
    }
};

// GET /api/contribution-campaigns/:id
export const getCampaign = async (req, res) => {
    try {
        await ensureContributionSchema();
        const { rows } = await db.query(`SELECT * FROM "ContributionCampaign" WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Campaña no encontrada' });
        const history = await db.query(
            `SELECT action, actor, detail, "createdAt" FROM "ContributionCampaignHistory"
             WHERE "campaignId" = $1 ORDER BY "createdAt" DESC LIMIT 100`,
            [req.params.id]
        );
        res.json({
            campaign: { ...rowToCampaign(rows[0]), effectiveStatus: effectiveStatus(rows[0], new Date()) },
            history: history.rows,
            publishErrors: validateForPublish(rowToCampaign(rows[0])),
        });
    } catch (e) {
        console.error('[CONTRIBUTION] getCampaign:', e);
        res.status(500).json({ error: 'No se pudo cargar la campaña' });
    }
};

// POST /api/contribution-campaigns  — nace SIEMPRE en borrador
export const createCampaign = async (req, res) => {
    try {
        await ensureContributionSchema();
        const name = String(req.body?.name || '').trim().slice(0, 200);
        if (!name) return res.status(400).json({ error: 'La campaña necesita un nombre' });
        const campaignType = CAMPAIGN_TYPES[req.body?.campaignType] ? req.body.campaignType : DEFAULT_CAMPAIGN_TYPE;
        const slug = await freeSlug(slugify(name));
        const actor = actorOf(req);

        const { rows } = await db.query(
            `INSERT INTO "ContributionCampaign"
                (slug, name, "campaignType", status, content, stats, targeting, "createdBy", "updatedBy")
             VALUES ($1, $2, $3, 'draft', $4, '[]'::jsonb, $5, $6, $6)
             RETURNING *`,
            [
                slug, name, campaignType,
                JSON.stringify(normalizeContent(req.body?.content)),
                JSON.stringify(normalizeTargeting(req.body?.targeting)),
                actor,
            ]
        );
        await recordHistory(rows[0].id, 'created', actor, { name, campaignType });
        invalidateCache();
        res.status(201).json({ campaign: rowToCampaign(rows[0]) });
    } catch (e) {
        console.error('[CONTRIBUTION] createCampaign:', e);
        res.status(500).json({ error: 'No se pudo crear la campaña' });
    }
};

// PUT /api/contribution-campaigns/:id — edita contenido y metadatos.
// El ESTADO no se toca por acá: tiene su propia ruta, con historial.
export const updateCampaign = async (req, res) => {
    try {
        await ensureContributionSchema();
        const { rows: existing } = await db.query(`SELECT * FROM "ContributionCampaign" WHERE id = $1`, [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Campaña no encontrada' });

        const b = req.body || {};
        const changed = [];
        const prev = existing[0];

        const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 200) : prev.name;
        if (name !== prev.name) changed.push('name');
        const campaignType = CAMPAIGN_TYPES[b.campaignType] ? b.campaignType : prev.campaignType;
        if (campaignType !== prev.campaignType) changed.push('campaignType');

        const startAt = b.startAt === undefined ? prev.startAt : (b.startAt ? new Date(b.startAt) : null);
        const endAt = b.endAt === undefined ? prev.endAt : (b.endAt ? new Date(b.endAt) : null);
        if (String(startAt) !== String(prev.startAt)) changed.push('startAt');
        if (String(endAt) !== String(prev.endAt)) changed.push('endAt');

        const priority = Number.isFinite(Number(b.priority)) ? Math.trunc(Number(b.priority)) : prev.priority;
        if (priority !== prev.priority) changed.push('priority');

        const content = b.content === undefined ? prev.content : normalizeContent(b.content);
        if (b.content !== undefined) changed.push('content');
        const stats = b.stats === undefined ? prev.stats : normalizeStats(b.stats);
        if (b.stats !== undefined) changed.push('stats');
        const targeting = b.targeting === undefined ? prev.targeting : normalizeTargeting(b.targeting);
        if (b.targeting !== undefined) changed.push('targeting');

        const recipientClubId = b.recipientClubId === undefined
            ? prev.recipientClubId
            : (b.recipientClubId ? String(b.recipientClubId) : null);
        if (recipientClubId !== prev.recipientClubId) changed.push('recipientClubId');

        const actor = actorOf(req);
        const { rows } = await db.query(
            `UPDATE "ContributionCampaign" SET
                name = $2, "campaignType" = $3, "startAt" = $4, "endAt" = $5,
                priority = $6, content = $7, stats = $8, targeting = $9,
                "recipientClubId" = $10, "updatedBy" = $11, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [
                req.params.id, name, campaignType, startAt, endAt, priority,
                JSON.stringify(content), JSON.stringify(stats), JSON.stringify(targeting),
                recipientClubId, actor,
            ]
        );
        if (changed.length > 0) await recordHistory(req.params.id, 'updated', actor, { changed });
        invalidateCache();
        res.json({
            campaign: rowToCampaign(rows[0]),
            publishErrors: validateForPublish(rowToCampaign(rows[0])),
        });
    } catch (e) {
        console.error('[CONTRIBUTION] updateCampaign:', e);
        res.status(500).json({ error: 'No se pudo guardar la campaña' });
    }
};

// POST /api/contribution-campaigns/:id/status  { status }
// La única puerta de los estados. Publicar (draft/scheduled → active, o
// programar) exige pasar validateForPublish; los motivos vuelven redactados.
export const transitionCampaign = async (req, res) => {
    try {
        await ensureContributionSchema();
        const to = String(req.body?.status || '');
        if (!CAMPAIGN_STATUSES.includes(to)) return res.status(400).json({ error: 'Estado desconocido' });

        const { rows: existing } = await db.query(`SELECT * FROM "ContributionCampaign" WHERE id = $1`, [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Campaña no encontrada' });
        const from = existing[0].status;
        if (from === to) return res.json({ campaign: rowToCampaign(existing[0]) });
        if (!canTransition(from, to)) {
            return res.status(400).json({ error: `Una campaña ${from} no puede pasar a ${to}` });
        }

        if (to === 'active' || to === 'scheduled') {
            const errors = validateForPublish(rowToCampaign(existing[0]));
            if (errors.length > 0) return res.status(422).json({ error: 'La campaña no está lista para publicarse', errors });
        }

        const actor = actorOf(req);
        const publishedAt = (to === 'active' || to === 'scheduled') && !existing[0].publishedAt
            ? new Date() : existing[0].publishedAt;
        const { rows } = await db.query(
            `UPDATE "ContributionCampaign"
             SET status = $2, "publishedAt" = $3, "updatedBy" = $4, "updatedAt" = NOW()
             WHERE id = $1 RETURNING *`,
            [req.params.id, to, publishedAt, actor]
        );
        await recordHistory(req.params.id, `status:${to}`, actor, { from, to });
        invalidateCache();
        res.json({ campaign: { ...rowToCampaign(rows[0]), effectiveStatus: effectiveStatus(rows[0], new Date()) } });
    } catch (e) {
        console.error('[CONTRIBUTION] transitionCampaign:', e);
        res.status(500).json({ error: 'No se pudo cambiar el estado' });
    }
};

// DELETE /api/contribution-campaigns/:id — sólo un borrador que NUNCA se
// publicó. Todo lo demás se archiva: borrar una campaña que estuvo al aire
// borraría la única traza de qué vio la gente y por qué (misma regla que los
// recorridos del CRM con inscripciones vivas).
export const deleteCampaign = async (req, res) => {
    try {
        await ensureContributionSchema();
        const { rows } = await db.query(`SELECT * FROM "ContributionCampaign" WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Campaña no encontrada' });
        if (rows[0].status !== 'draft' || rows[0].publishedAt) {
            return res.status(400).json({ error: 'Sólo se elimina un borrador que nunca se publicó. Para retirar esta campaña, archivala.' });
        }
        await db.query(`DELETE FROM "ContributionCampaignHistory" WHERE "campaignId" = $1`, [req.params.id]);
        await db.query(`DELETE FROM "ContributionCenter" WHERE "campaignId" = $1`, [req.params.id]);
        await db.query(`DELETE FROM "ContributionCampaign" WHERE id = $1`, [req.params.id]);
        invalidateCache();
        res.json({ ok: true });
    } catch (e) {
        console.error('[CONTRIBUTION] deleteCampaign:', e);
        res.status(500).json({ error: 'No se pudo eliminar la campaña' });
    }
};

// POST /api/contribution-campaigns/:id/preview-token
export const issuePreviewToken = async (req, res) => {
    try {
        await ensureContributionSchema();
        const { rows } = await db.query(`SELECT id, slug FROM "ContributionCampaign" WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Campaña no encontrada' });
        res.json({ token: signPreviewToken(rows[0].id), expiresInMinutes: 60 });
    } catch (e) {
        console.error('[CONTRIBUTION] issuePreviewToken:', e);
        res.status(500).json({ error: 'No se pudo emitir la vista previa' });
    }
};

// ─── Centros de acopio (F3) ────────────────────────────────────────────────
//
// Los centros CENTRALES viven con clubId NULL; los que un sitio agregue
// localmente (F4) llevan su clubId y NO se tocan desde acá: el batch del
// operador borra y reescribe SOLO las filas centrales. Sin ese filtro, un
// guardado central se llevaría por delante los centros propios de los clubes.

// GET /api/contribution-campaigns/:id/centers  (operador — incluye inactivos)
export const listCenters = async (req, res) => {
    try {
        await ensureContributionSchema();
        const { rows } = await db.query(
            `SELECT * FROM "ContributionCenter"
             WHERE "campaignId" = $1 AND "clubId" IS NULL
             ORDER BY "sortOrder" ASC, "createdAt" ASC`,
            [req.params.id]
        );
        res.json({ centers: rows });
    } catch (e) {
        console.error('[CONTRIBUTION] listCenters:', e);
        res.status(500).json({ error: 'No se pudieron cargar los centros' });
    }
};

// PUT /api/contribution-campaigns/:id/centers  { centers: [...] }
// Reemplaza el juego COMPLETO de centros centrales (el editor trabaja sobre
// la lista entera, como los bloques de pago). Lo invalidable se descarta y se
// REPORTA — nunca en silencio.
export const saveCenters = async (req, res) => {
    try {
        await ensureContributionSchema();
        const { rows: camp } = await db.query(`SELECT id FROM "ContributionCampaign" WHERE id = $1`, [req.params.id]);
        if (!camp[0]) return res.status(404).json({ error: 'Campaña no encontrada' });

        const { centers, skipped } = normalizeCenters(req.body?.centers);
        const keptIds = centers.map(c => c.id);

        // Sólo las filas CENTRALES: las locales de los clubes no son de este editor.
        await db.query(
            `DELETE FROM "ContributionCenter"
             WHERE "campaignId" = $1 AND "clubId" IS NULL AND NOT (id = ANY($2::text[]))`,
            [req.params.id, keptIds]
        );
        for (let i = 0; i < centers.length; i++) {
            const c = centers[i];
            await db.query(
                `INSERT INTO "ContributionCenter"
                    (id, "campaignId", city, "groupLabel", name, address, complement, schedule,
                     "contactName", phone, notes, active, "sortOrder", "clubId", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL, NOW())
                 ON CONFLICT (id) DO UPDATE SET
                    city = $3, "groupLabel" = $4, name = $5, address = $6, complement = $7,
                    schedule = $8, "contactName" = $9, phone = $10, notes = $11,
                    active = $12, "sortOrder" = $13, "updatedAt" = NOW()`,
                [
                    c.id.startsWith('center-') ? `${req.params.id.slice(0, 8)}-${Date.now()}-${i}` : c.id,
                    req.params.id, c.city, c.groupLabel || null, c.name || null, c.address,
                    c.complement || null, c.schedule || null, c.contactName || null,
                    c.phone || null, c.notes || null, c.active, i,
                ]
            );
        }
        await recordHistory(req.params.id, 'centers_updated', actorOf(req), { count: centers.length, skipped: skipped.length });
        invalidateCache();

        const { rows } = await db.query(
            `SELECT * FROM "ContributionCenter" WHERE "campaignId" = $1 AND "clubId" IS NULL
             ORDER BY "sortOrder" ASC, "createdAt" ASC`,
            [req.params.id]
        );
        res.json({ centers: rows, skipped });
    } catch (e) {
        console.error('[CONTRIBUTION] saveCenters:', e);
        res.status(500).json({ error: 'No se pudieron guardar los centros' });
    }
};

// Los centros que ve UN sitio: los centrales + los suyos (F4). Activos.
const publicCentersFor = async (campaignId, clubId) => {
    const { rows } = await db.query(
        `SELECT id, city, "groupLabel", name, address, complement, schedule,
                "contactName", phone, notes, active, "sortOrder", "clubId"
         FROM "ContributionCenter"
         WHERE "campaignId" = $1 AND active = true
           AND ("clubId" IS NULL OR "clubId" = $2)
         ORDER BY "sortOrder" ASC, "createdAt" ASC`,
        [campaignId, clubId || null]
    );
    return rows;
};

// ─── Lectura pública ───────────────────────────────────────────────────────

// Los sitios que la campaña alcanza se resuelven contra la MISMA forma de
// club que usa el resto de la plataforma: id, districtId y el texto district
// (que es una LISTA, v4.748).
const siteOf = async (clubId) => {
    const { rows } = await db.query(
        `SELECT id, "districtId", district FROM "Club" WHERE id = $1 LIMIT 1`,
        [clubId]
    );
    return rows[0] || null;
};

const servableCampaigns = async () => {
    const { rows } = await db.query(
        `SELECT * FROM "ContributionCampaign" WHERE status IN ('scheduled', 'active')`
    );
    return rows.map(rowToCampaign);
};

// GET /api/contribution-campaigns/active?clubId=…  (público)
// La página de aportes lo consultará en Fase 2: sin campaña activa devuelve
// { campaign: null } y la página genérica se pinta igual que siempre.
export const getActiveCampaign = async (req, res) => {
    try {
        const clubId = String(req.query.clubId || '').trim();
        if (!clubId) return res.status(400).json({ error: 'clubId es obligatorio' });

        const cached = activeCache.get(clubId);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return res.json(cached.payload);

        await ensureContributionSchema();
        const site = await siteOf(clubId);
        // Un fallo acá no puede tumbar la página pública: sin sitio, sin campaña.
        if (!site) {
            const payload = { campaign: null };
            activeCache.set(clubId, { at: Date.now(), payload });
            return res.json(payload);
        }

        const now = new Date();
        const winner = pickCampaignForSite(await servableCampaigns(), site, now);
        let payload = { campaign: null };
        if (winner) {
            const { rows: ov } = await db.query(
                `SELECT content FROM "ContributionCampaignOverride" WHERE "campaignId" = $1 AND "clubId" = $2`,
                [winner.id, clubId]
            );
            const campaign = resolveForSite(winner, ov[0] ? { content: ov[0].content } : null, now);
            // F3 — los centros viajan PLANOS y activos; la agrupación por
            // ciudad la hace el navegador con el espejo de groupCenters.
            campaign.centers = await publicCentersFor(winner.id, clubId);
            payload = { campaign };
        }
        activeCache.set(clubId, { at: Date.now(), payload });
        res.json(payload);
    } catch (e) {
        // Esto corre en cada visita de la página de aportes: degradar, nunca 500.
        console.error('[CONTRIBUTION] getActiveCampaign (degrada a null):', e?.message);
        res.json({ campaign: null });
    }
};

// GET /api/contribution-campaigns/:id/preview?t=…&clubId=…  (token firmado)
// Renderiza el BORRADOR con la misma forma que la lectura pública, ignorando
// el estado: es la vista previa, no la publicación.
export const getPreviewCampaign = async (req, res) => {
    try {
        await ensureContributionSchema();
        if (!verifyPreviewToken(req.params.id, req.query.t)) {
            return res.status(403).json({ error: 'Vista previa vencida o inválida' });
        }
        const { rows } = await db.query(`SELECT * FROM "ContributionCampaign" WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Campaña no encontrada' });
        const campaign = rowToCampaign(rows[0]);
        // resolveForSite exige estado activo; la vista previa lo simula sin
        // escribirlo: el borrador sigue siendo borrador.
        const preview = resolveForSite({ ...campaign, status: 'active', startAt: null, endAt: null }, null, new Date());
        preview.centers = await publicCentersFor(campaign.id, null);
        res.json({ campaign: preview, preview: true, savedStatus: campaign.status });
    } catch (e) {
        console.error('[CONTRIBUTION] getPreviewCampaign:', e);
        res.status(500).json({ error: 'No se pudo cargar la vista previa' });
    }
};

// ─── La vía del CLUB (F4): sobrescritura local y centros propios ───────────
//
// El aislamiento vive en el WHERE: el clubId sale SIEMPRE de req.user.clubId
// (el token), nunca del body — un administrador de sitio no puede ni nombrar
// otro sitio en estas rutas. Y la frontera de QUÉ puede tocar es
// sanitizeOverride: lo que no está en OVERRIDE_WHITELIST no se puede expresar.

// La campaña que le corresponde a un sitio para PREPARAR datos: la activa o
// la programada que lo alcanza. Se admite la programada a propósito — el club
// carga su contacto y sus centros ANTES de que la campaña salga al aire.
const campaignForSiteAdmin = async (clubId) => {
    const site = await siteOf(clubId);
    if (!site) return null;
    const { rows } = await db.query(
        `SELECT * FROM "ContributionCampaign" WHERE status IN ('scheduled', 'active')`
    );
    const candidates = rows.map(rowToCampaign)
        .filter(c => {
            // El estado efectivo puede ser finished (fecha vencida): esa ya no es
            // preparable. scheduled y active sí.
            const eff = effectiveStatus(c, new Date());
            return (eff === 'active' || eff === 'scheduled');
        })
        .filter(c => {
            try { return pickCampaignForSite([{ ...c, status: 'active', startAt: null, endAt: null }], site, new Date())?.id === c.id; }
            catch { return false; }
        });
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) =>
        (Number(b.priority) || 0) - (Number(a.priority) || 0)
        || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
        || String(a.id).localeCompare(String(b.id))
    )[0];
};

// GET /api/contribution-campaigns/site/current  (admin del sitio)
export const getSiteCampaign = async (req, res) => {
    try {
        await ensureContributionSchema();
        const clubId = req.user.clubId;
        const campaign = await campaignForSiteAdmin(clubId);
        if (!campaign) return res.json({ campaign: null });

        const { rows: ov } = await db.query(
            `SELECT content FROM "ContributionCampaignOverride" WHERE "campaignId" = $1 AND "clubId" = $2`,
            [campaign.id, clubId]
        );
        const { rows: own } = await db.query(
            `SELECT * FROM "ContributionCenter" WHERE "campaignId" = $1 AND "clubId" = $2
             ORDER BY "sortOrder" ASC, "createdAt" ASC`,
            [campaign.id, clubId]
        );
        res.json({
            campaign: {
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                effectiveStatus: effectiveStatus(campaign, new Date()),
                startAt: campaign.startAt,
                endAt: campaign.endAt,
            },
            override: ov[0] ? sanitizeOverride(ov[0].content) : {},
            centers: own,
        });
    } catch (e) {
        console.error('[CONTRIBUTION] getSiteCampaign:', e);
        res.status(500).json({ error: 'No se pudo consultar la campaña del sitio' });
    }
};

// PUT /api/contribution-campaigns/site/override  { content }
export const saveSiteOverride = async (req, res) => {
    try {
        await ensureContributionSchema();
        const clubId = req.user.clubId;
        const campaign = await campaignForSiteAdmin(clubId);
        if (!campaign) return res.status(404).json({ error: 'No hay una campaña activa o programada para este sitio' });

        const content = sanitizeOverride(req.body?.content);
        const actor = actorOf(req);
        await db.query(
            `INSERT INTO "ContributionCampaignOverride" ("campaignId", "clubId", content, "updatedBy", "updatedAt")
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT ("campaignId", "clubId")
             DO UPDATE SET content = $3, "updatedBy" = $4, "updatedAt" = NOW()`,
            [campaign.id, clubId, JSON.stringify(content), actor]
        );
        await recordHistory(campaign.id, 'override_saved', actor, { clubId });
        invalidateCache();
        res.json({ override: content });
    } catch (e) {
        console.error('[CONTRIBUTION] saveSiteOverride:', e);
        res.status(500).json({ error: 'No se pudo guardar la información local' });
    }
};

// PUT /api/contribution-campaigns/site/centers  { centers }
// El espejo del batch central, acotado a las filas DEL CLUB: borra y
// reescribe sólo "clubId" = el del token. Las centrales no se pueden tocar.
export const saveSiteCenters = async (req, res) => {
    try {
        await ensureContributionSchema();
        const clubId = req.user.clubId;
        const campaign = await campaignForSiteAdmin(clubId);
        if (!campaign) return res.status(404).json({ error: 'No hay una campaña activa o programada para este sitio' });

        const { centers, skipped } = normalizeCenters(req.body?.centers);
        const keptIds = centers.map(c => c.id);
        await db.query(
            `DELETE FROM "ContributionCenter"
             WHERE "campaignId" = $1 AND "clubId" = $2 AND NOT (id = ANY($3::text[]))`,
            [campaign.id, clubId, keptIds]
        );
        for (let i = 0; i < centers.length; i++) {
            const c = centers[i];
            await db.query(
                `INSERT INTO "ContributionCenter"
                    (id, "campaignId", city, "groupLabel", name, address, complement, schedule,
                     "contactName", phone, notes, active, "sortOrder", "clubId", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
                 ON CONFLICT (id) DO UPDATE SET
                    city = $3, "groupLabel" = $4, name = $5, address = $6, complement = $7,
                    schedule = $8, "contactName" = $9, phone = $10, notes = $11,
                    active = $12, "sortOrder" = $13, "updatedAt" = NOW()
                 WHERE "ContributionCenter"."clubId" = $14`,
                [
                    c.id.startsWith('center-') ? `${clubId.slice(0, 8)}-${Date.now()}-${i}` : c.id,
                    campaign.id, c.city, c.groupLabel || null, c.name || null, c.address,
                    c.complement || null, c.schedule || null, c.contactName || null,
                    c.phone || null, c.notes || null, c.active, i, clubId,
                ]
            );
        }
        await recordHistory(campaign.id, 'site_centers_updated', actorOf(req), { clubId, count: centers.length, skipped: skipped.length });
        invalidateCache();

        const { rows } = await db.query(
            `SELECT * FROM "ContributionCenter" WHERE "campaignId" = $1 AND "clubId" = $2
             ORDER BY "sortOrder" ASC, "createdAt" ASC`,
            [campaign.id, clubId]
        );
        res.json({ centers: rows, skipped });
    } catch (e) {
        console.error('[CONTRIBUTION] saveSiteCenters:', e);
        res.status(500).json({ error: 'No se pudieron guardar los centros del sitio' });
    }
};

export { sanitizeOverride };
