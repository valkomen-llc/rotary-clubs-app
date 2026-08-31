// ════════════════════════════════════════════════════════════════════
// «Maneras de Contribuir» en el Generador de Publicaciones — la ORQUESTACIÓN
// v4.967.0
//
// El CRITERIO vive en `lib/waysToContribute.js` y es puro; acá está lo que
// necesita base y red. Es el mismo reparto que `seoRules.js` frente a
// `seoAudit.js`, y por el mismo motivo: un motor que sólo se ejercita contra
// una base real termina sin pruebas.
//
// TRES PIEZAS:
//   1. `listWaysCampaigns`   — qué campañas hay y qué fotos trae cada una.
//   2. `recommendWaysAssets` — cuáles se parecen a lo que se quiere destacar.
//   3. `resolveWaysContext`  — el contexto que `generatePost` inyecta al copy.
//
// La 3 NO es un endpoint: es lo que hace que esto sea una AMPLIACIÓN del flujo
// de siempre y no un segundo generador. La imagen, los tres formatos, el
// autosave a la Biblioteca, publicar y programar siguen siendo exactamente los
// de «Desde una foto».
// ════════════════════════════════════════════════════════════════════

import prisma from '../lib/prisma.js';
import { campaignsInScope, campaignInScope, isOperator } from '../lib/campaignScope.js';
import { siteUrlFor } from './campaignPostController.js';
import {
    normalizeContent, effectiveStatus, STATUS_LABELS, CAMPAIGN_TYPES,
} from '../lib/contributionSpec.js';
import {
    publishableStats, activeItems, campaignUrl,
    OBJECTIVES, DEFAULT_OBJECTIVE, AUDIENCES, DEFAULT_AUDIENCE,
    LANGUAGES, DEFAULT_LANGUAGE, audienceCatalog, languageCatalog,
} from '../lib/campaignPostSpec.js';
import {
    campaignAssets, pickableAssets, assetsHaveText, describeAsset,
    buildWaysBrief, waysFactContext, factClauseFor, normalizeAdditionalContext,
    buildRecommendPrompt, parseRecommendation, waysObjectiveCatalog,
    WAYS_TYPE_ID, MAX_ADDITIONAL_CONTEXT, DEFAULT_CONTEXT_NOTE,
} from '../lib/waysToContribute.js';
import { generateCopy } from '../services/copywritingService.js';

const fail = (res, e, code = 500) => {
    console.error('[ways]', e?.message || e);
    // El motivo se propaga TEXTUAL: «no se pudo cargar» a secas obliga a
    // diagnosticar a ciegas (regla de `FeeRulesPanel`, v4.859).
    res.status(code).json({ error: e?.message || 'Error inesperado', detail: String(e?.stack || '').slice(0, 400) });
};

/**
 * Ata las fotos de una campaña con sus filas de `Media`, cuando existen.
 *
 * Las campañas guardan URLs, no ids: es la relación que YA existe y no se
 * inventa una segunda (ver la cabecera de `waysToContribute.js`). Lo que esto
 * agrega es el id, para poder guardarlo en la procedencia de la publicación
 * (punto 12) — una foto que se subió por otra vía simplemente no lo tiene, y
 * eso no es un error: es una foto sin fila.
 *
 * DEGRADA: sin base disponible se devuelven las fotos igual, sin id.
 */
const attachMediaIds = async (assets) => {
    const urls = assets.map(a => a.url).filter(Boolean);
    if (!urls.length) return assets;
    try {
        const rows = await prisma.media.findMany({
            where: { url: { in: urls } },
            select: { id: true, url: true, filename: true, thumbUrl: true },
        });
        const byUrl = new Map(rows.map(r => [r.url, r]));
        return assets.map(a => {
            const m = byUrl.get(a.url);
            return m
                ? { ...a, mediaId: m.id, filename: m.filename, thumbUrl: m.thumbUrl || null }
                : { ...a, mediaId: null, filename: null, thumbUrl: null };
        });
    } catch (e) {
        console.warn(`[ways] Sin ids de Biblioteca: ${e.message}`);
        return assets.map(a => ({ ...a, mediaId: null, filename: null, thumbUrl: null }));
    }
};

// ─── GET /api/content-studio/ways/campaigns ────────────────────────────
//
// Los catálogos y las campañas con sus fotos, en UNA sola consulta. La pantalla
// no arma ninguna lista por su cuenta: con dos, agregar un objetivo exigiría
// tocar dos archivos y el día que se olvide uno el preset ofrecería algo que el
// servidor no sabe resolver.
export const listWaysCampaigns = async (req, res) => {
    try {
        const campaigns = await campaignsInScope(req);
        const now = new Date();

        const salida = [];
        for (const c of campaigns) {
            const content = normalizeContent(c.content);
            const { stats } = publishableStats(c.stats);
            const assets = await attachMediaIds(campaignAssets(content));
            const url = campaignUrl(c, await siteUrlFor(c, req).catch(() => ''));
            salida.push({
                id: c.id,
                slug: c.slug,
                name: c.name,
                campaignType: c.campaignType,
                campaignTypeLabel: CAMPAIGN_TYPES[c.campaignType]?.label || c.campaignType,
                emergency: !!CAMPAIGN_TYPES[c.campaignType]?.emergency,
                status: effectiveStatus(c, now),
                statusLabel: STATUS_LABELS[effectiveStatus(c, now)] || '',
                title: content.hero.title,
                subtitle: content.hero.subtitle,
                badge: content.hero.badge,
                text: content.hero.text,
                location: content.location,
                eventDate: content.eventDate,
                url,
                // El contexto que la pantalla MUESTRA, para que se vea qué va a
                // usar la IA. Un contexto que se aplica sin verse es una caja
                // negra: cuando el copy no sirve, no hay dónde mirar.
                stats: stats.map(s => ({ id: s.id, label: s.label, value: s.value, source: s.source, updatedAt: s.updatedAt })),
                items: activeItems(content).map(it => ({ title: it.title, description: it.description })),
                waysToHelp: (content.waysToHelp || []).filter(w => w.active !== false && w.title)
                    .map(w => ({ title: w.title, description: w.description })),
                partners: (content.partners || []).filter(p => p.active !== false && p.name).map(p => p.name),
                assets: pickableAssets(assets).map(a => ({
                    url: a.url, mediaId: a.mediaId, thumbUrl: a.thumbUrl,
                    origin: a.origin, originLabel: a.originLabel,
                    alt: a.alt, caption: a.caption, credit: a.credit,
                    description: describeAsset(a),
                })),
                // Una campaña puede no tener ninguna foto y eso NO la
                // descalifica: se genera con su contexto y la foto se sube o se
                // elige de la Biblioteca completa (punto 14 del pedido).
                assetCount: pickableAssets(assets).length,
                // Recomendar sin metadata sería ordenar al azar y presentarlo
                // como criterio. Si ninguna foto tiene pie, el botón no se
                // ofrece (v4.650).
                canRecommend: assetsHaveText(assets),
            });
        }

        res.json({
            campaigns: salida,
            objectives: waysObjectiveCatalog(),
            audiences: audienceCatalog(),
            languages: languageCatalog(),
            defaults: {
                objective: DEFAULT_OBJECTIVE,
                audience: DEFAULT_AUDIENCE,
                language: DEFAULT_LANGUAGE,
            },
            maxContext: MAX_ADDITIONAL_CONTEXT,
            scope: isOperator(req) ? 'platform' : 'site',
        });
    } catch (e) { fail(res, e); }
};

// ─── POST /api/content-studio/ways/recommend ───────────────────────────
//
// EL MODELO PROPONE, EL CÓDIGO DECIDE. Se le pasan los PIES de las fotos y
// contesta índices; cualquier índice fuera de la lista se descarta, así que una
// respuesta inventada no puede elegir una foto que no está.
//
// Y se DICE lo que hace: recomienda leyendo lo que la campaña escribió de cada
// foto, NO mirándolas. La Biblioteca no tiene búsqueda semántica ni índice
// vectorial —los embeddings de `brainService` son de memorias, no de archivos—
// y afirmar lo contrario sería prometer una integración que no existe.
export const recommendWaysAssets = async (req, res) => {
    try {
        const { campaignId, additionalContext = '', objective = DEFAULT_OBJECTIVE } = req.body || {};
        const campaign = await campaignInScope(req, String(campaignId || ''));
        if (!campaign) return res.status(404).json({ error: 'La campaña no existe o no está disponible para este sitio.' });

        const content = normalizeContent(campaign.content);
        const assets = pickableAssets(campaignAssets(content));
        if (!assets.length) {
            return res.json({ picks: [], reason: 'La campaña todavía no tiene fotografías cargadas.' });
        }
        if (!assetsHaveText(assets)) {
            return res.json({
                picks: [],
                reason: 'Las fotografías de esta campaña no tienen pie ni descripción registrada, así que no hay con qué compararlas. Elegí la fotografía a mano.',
            });
        }

        const obj = OBJECTIVES[objective] || OBJECTIVES[DEFAULT_OBJECTIVE];
        const result = await generateCopy({
            system: 'Sos un editor gráfico de una organización sin fines de lucro. Elegís fotografías de archivo leyendo sus descripciones. No inventás descripciones que no estén en la lista y no elegís índices que no existan.',
            userText: buildRecommendPrompt({
                assets,
                additionalContext,
                campaignName: campaign.name,
                objectiveLabel: obj.label,
            }),
            temperature: 0.2,
            maxTokens: 700,
            jsonMode: true,
        });

        const picks = parseRecommendation(result.content, assets.length);
        res.json({
            picks: picks.map(p => ({ ...p, url: assets[p.index].url })),
            provider: result.provider,
            reason: picks.length ? null : 'El modelo no encontró ninguna fotografía relacionada con lo que se quiere destacar.',
            // Se declara sobre qué se decidió. Sin esto, la recomendación
            // parece haber mirado las fotos.
            basis: 'descripciones registradas en la campaña',
        });
    } catch (e) { fail(res, e, 502); }
};

// ─── El contexto que consume `generatePost` ────────────────────────────

/**
 * Resuelve TODO lo que el copy necesita saber de la campaña.
 *
 * Devuelve `null` cuando el tipo no es éste — así el flujo de siempre no cambia
 * ni una línea. Devuelve `{ error }` cuando el tipo SÍ es éste y la campaña no
 * se pudo resolver: eso no se resuelve en silencio con una publicación
 * genérica, porque quien la pidió creería que salió con el contexto.
 */
export const resolveWaysContext = async (req, config = {}, { imageUrl = '', clubName = '' } = {}) => {
    const campaignId = String(config.campaignId || '').trim();
    if (!campaignId) {
        return { error: 'Elegí una campaña de «Maneras de Contribuir» antes de generar.' };
    }
    const campaign = await campaignInScope(req, campaignId);
    if (!campaign) {
        return { error: 'La campaña elegida no existe o dejó de estar disponible para este sitio. Volvé a elegirla.' };
    }

    const content = normalizeContent(campaign.content);
    const { stats } = publishableStats(campaign.stats);
    const items = activeItems(content);
    const assets = campaignAssets(content);
    // La foto que se está usando, si es una de la campaña. Se busca por URL
    // porque es lo que el generador recibe; una foto subida a mano no está y
    // entonces el brief lo dice, en vez de atribuirle un pie que no es suyo.
    const asset = assets.find(a => a.url === imageUrl) || null;

    const objective = OBJECTIVES[config.objective] ? config.objective : DEFAULT_OBJECTIVE;
    const audience = AUDIENCES[config.audience] ? config.audience : DEFAULT_AUDIENCE;
    const language = LANGUAGES[config.language] ? config.language : DEFAULT_LANGUAGE;
    const additionalContext = normalizeAdditionalContext(config.additionalContext);
    const url = campaignUrl(campaign, await siteUrlFor(campaign, req).catch(() => ''));

    return {
        campaign, content, asset, assets,
        objective, audience, language, additionalContext, url,
        factClause: factClauseFor(campaign.campaignType),
        factCtx: waysFactContext({ content, stats, items, asset, additionalContext, url }),
        brief: buildWaysBrief({
            campaign, content, objective, audience, language,
            stats, items, asset, additionalContext, campaignUrl: url, clubName,
        }),
        // Lo que se guarda como procedencia de la publicación.
        origin: {
            campaignId: campaign.id,
            campaignSlug: campaign.slug,
            campaignName: campaign.name,
            objective, audience, language,
            additionalContext,
            mediaIds: [],   // lo completa el controlador con el id real de la foto
            mediaUrls: [imageUrl].filter(Boolean),
        },
        typeId: WAYS_TYPE_ID,
        contextNote: additionalContext ? null : DEFAULT_CONTEXT_NOTE,
    };
};

export default { listWaysCampaigns, recommendWaysAssets, resolveWaysContext };
