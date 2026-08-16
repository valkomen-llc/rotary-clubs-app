// ════════════════════════════════════════════════════════════════════
// Infografías de Campaña — la orquestación
// v4.833.0
//
// Une la campaña de contribución, el criterio (`campaignPostSpec.js`), las
// composiciones (`campaignTemplates.js`) y el redactor. Devuelve un DOCUMENTO
// —la lista de nodos ya resuelta— que el navegador pinta con `DesignCanvas` y
// exporta con `designRender.ts`.
//
// ── POR QUÉ NO SE COMPONE ACÁ ───────────────────────────────────────
//
// Componer texto en el servidor exige rasterizar un SVG con sharp, y eso
// necesita una fuente instalada en el sistema: en Vercel NO HAY NINGUNA —cada
// glifo sale como un cuadrito, medido en v4.794—. El dibujo vive en el
// navegador, que es además donde ya vive el de Plantillas IA. Este controlador
// resuelve DATOS; no pinta nada.
//
// ── QUIÉN VE QUÉ ────────────────────────────────────────────────────
//
// El operador de la plataforma ve todas las campañas vivas; un administrador de
// sitio ve ÚNICAMENTE la que alcanza a su sitio, resuelta con el mismo
// `pickCampaignForSite` de la página pública. El alcance se decide en el
// servidor y con el `clubId` del token: mandarlo en el cuerpo daría dos fuentes
// para el mismo dato y sólo una mandaría.
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import prisma from '../lib/prisma.js';
import ensureContributionSchema from '../lib/ensureContributionSchema.js';
import {
    normalizeContent, pickCampaignForSite, effectiveStatus, hexOrEmpty,
} from '../lib/contributionSpec.js';
import { siteOf, servableCampaigns, publicCentersFor } from './contributionCampaignController.js';
import {
    OBJECTIVES, DEFAULT_OBJECTIVE, objectiveCatalog,
    AUDIENCES, DEFAULT_AUDIENCE, audienceCatalog,
    LANGUAGES, DEFAULT_LANGUAGE, languageCatalog,
    FORMAT_IDS, DEFAULT_FORMAT_ID, isCampaignFormat,
    layoutCatalog, capacityOf, pickLayout,
    publishableStats, chooseStats, activeItems, centerSummary,
    validateBeforeGenerate, buildCampaignBrief, buildVariables, campaignUrl,
} from '../lib/campaignPostSpec.js';
import { templateFor } from '../lib/campaignTemplates.js';
import { compileTemplate, PALETTE, formatOf } from '../lib/designSpec.js';
import { generateCopy } from '../services/copywritingService.js';
import { INSTITUTIONAL_VOICE } from '../lib/institutionalVoice.js';
import { EMERGENCY_FACT_CLAUSE, validateEmergencyCopy, buildRetryInstruction } from '../lib/emergencySpec.js';

const fail = (res, e, code = 500, msg = null) => {
    console.error('[CAMPAIGN-POST]', e?.message || e);
    res.status(code).json({ error: msg || e?.message || 'Error inesperado' });
};

const isOperator = (req) => req.user?.role === 'administrator';

// ─── Alcance ───────────────────────────────────────────────────────────

/**
 * Las campañas que este usuario puede usar para generar piezas.
 *
 * Reutiliza `servableCampaigns` y `pickCampaignForSite` del módulo de campañas
 * en vez de escribir un segundo criterio de alcance: con dos, el generador
 * ofrecería una campaña que la página del sitio no muestra —o al revés—, y la
 * pieza publicada mandaría a una landing que no existe ahí.
 */
const campaignsInScope = async (req) => {
    await ensureContributionSchema();
    const all = await servableCampaigns();
    const now = new Date();
    if (isOperator(req)) {
        // El operador ve todas las vivas, ordenadas como el panel.
        return all
            .filter(c => ['active', 'scheduled'].includes(effectiveStatus(c, now)))
            .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
    const clubId = req.user?.clubId;
    if (!clubId) return [];
    const site = await siteOf(clubId);
    if (!site) return [];
    const winner = pickCampaignForSite(all, site, now);
    return winner ? [winner] : [];
};

const campaignInScope = async (req, id) => {
    const list = await campaignsInScope(req);
    return list.find(c => c.id === id) || null;
};

// ─── GET /api/content-studio/campaign-post/options ─────────────────────
//
// Los catálogos y las campañas disponibles, en UNA sola consulta. La pantalla
// no arma ninguna lista por su cuenta: si lo hiciera, agregar un objetivo
// exigiría tocar dos archivos y el día que se olvide uno, el preset ofrecería
// algo que el servidor no sabe resolver.
export const getCampaignPostOptions = async (req, res) => {
    try {
        const campaigns = await campaignsInScope(req);
        const now = new Date();
        res.json({
            objectives: objectiveCatalog(),
            audiences: audienceCatalog(),
            languages: languageCatalog(),
            layouts: layoutCatalog(),
            formats: FORMAT_IDS.map(id => {
                const f = formatOf(id);
                return { id, label: f.label, ratio: f.ratio, width: f.width, height: f.height };
            }),
            defaults: {
                objective: DEFAULT_OBJECTIVE,
                audience: DEFAULT_AUDIENCE,
                language: DEFAULT_LANGUAGE,
                format: DEFAULT_FORMAT_ID,
            },
            scope: isOperator(req) ? 'platform' : 'site',
            campaigns: campaigns.map(c => {
                const content = normalizeContent(c.content);
                const { stats, skipped } = publishableStats(c.stats);
                return {
                    id: c.id,
                    slug: c.slug,
                    name: c.name,
                    campaignType: c.campaignType,
                    status: effectiveStatus(c, now),
                    title: content.hero.title,
                    subtitle: content.hero.subtitle,
                    badge: content.hero.badge,
                    location: content.location,
                    eventDate: content.eventDate,
                    theme: content.theme,
                    // Sólo lo publicable llega a la pantalla. Mandar todos los
                    // indicadores dejaría marcar uno sin fuente y el error
                    // aparecería recién al generar.
                    stats: stats.map(s => ({ id: s.id, label: s.label, value: s.value, source: s.source, updatedAt: s.updatedAt })),
                    statsSkipped: skipped,
                    items: activeItems(content).map(it => ({ title: it.title, description: it.description })),
                    images: [
                        ...(content.hero.image ? [{ url: content.hero.image, alt: content.hero.imageAlt || '' }] : []),
                        ...content.hero.images,
                        ...content.gallery.items.filter(it => !/\.(mp4|webm|mov)$/i.test(it.url)).map(it => ({ url: it.url, alt: it.alt || it.caption || '' })),
                    ].slice(0, 24),
                };
            }),
        });
    } catch (e) { fail(res, e); }
};

// ─── El copy ───────────────────────────────────────────────────────────
//
// El modelo ESCRIBE y el código DECIDE si sirve. Es la capa 3 de la Campaña de
// Emergencia y la que hace verdadera la promesa de no inventar: sin ella,
// «le pedimos que no invente» es una afirmación que no se puede sostener.
//
// El universo de lo suministrado incluye LOS VALORES DE LOS INDICADORES: son
// datos de la campaña, con fuente registrada, así que mencionarlos no es
// inventar. Sin eso, un copy que dijera la cifra que la pieza muestra al lado
// se rechazaría por «número no suministrado».
const factContextOf = ({ content, stats, items, url }) => ({
    magnitude: stats.map(s => `${s.label} ${s.value}`).join(' | '),
    description: [content.hero.title, content.hero.subtitle, content.hero.text, content.hero.highlight].filter(Boolean).join(' '),
    communities: items.map(i => `${i.title} ${i.description || ''}`).join(' '),
    eventDate: content.eventDate || '',
    location: content.location || '',
    customDisaster: '',
    customNeed: '',
    contactUrl: url || '',
});

const COPY_SHAPE = `{
  "headline": "…",
  "subheadline": "…",
  "context": "…",
  "badge": "…",
  "cta": "…",
  "closing": "…",
  "social": {
    "instagram": { "copy": "…", "hashtags": "#… #…" },
    "facebook":  { "copy": "…", "hashtags": "#… #…" },
    "linkedin":  { "copy": "…", "hashtags": "#… #…" },
    "x":         { "copy": "…", "hashtags": "#… #…" },
    "whatsapp":  { "copy": "…", "hashtags": "" }
  }
}`;

const COPY_RULES = `Reglas de esta pieza:
- "headline": máximo 60 caracteres. Es el titular DENTRO de la imagen.
- "subheadline": máximo 110 caracteres.
- "context": máximo 240 caracteres, factual y sin adjetivar la tragedia.
- "badge": máximo 40 caracteres, en mayúsculas, del estilo «EMERGENCIA · TERREMOTO».
- "cta": máximo 28 caracteres, en imperativo. Va dentro de un botón.
- "closing": máximo 100 caracteres. Una frase institucional de cierre.
- El texto de la imagen NO repite las cifras: la plantilla ya las dibuja al lado.
- "social": el texto que va DEBAJO de la publicación, uno por red. instagram hasta 2200, facebook hasta 600, linkedin hasta 1300, x máximo 260, whatsapp hasta 700 y sin hashtags.
- En "whatsapp" no uses hashtags ni «link en la bio»: se lee en un chat.
- 5-8 hashtags relevantes; ninguno en linkedin si no aporta.`;

const generatePieceCopy = async ({ brief, factCtx, provider }) => {
    const system = `${INSTITUTIONAL_VOICE}\n\n${EMERGENCY_FACT_CLAUSE}`;
    let userText = `${brief}\n\n${COPY_RULES}\n\nDevolvé este JSON exacto:\n${COPY_SHAPE}`;

    const MAX_TRIES = 3;
    let parsed = null;
    let issues = [];
    for (let intento = 1; intento <= MAX_TRIES; intento++) {
        const result = await generateCopy({
            provider: provider || null,
            system,
            userText,
            temperature: 0.5,
            maxTokens: 2200,
            jsonMode: true,
        });
        try { parsed = JSON.parse(result.content); }
        catch (e) { throw new Error(`${result.provider} devolvió JSON inválido: ${e.message}`); }

        // Se valida TODO lo que va a quedar impreso o publicado. Un titular
        // limpio con un copy de Instagram inventando una cifra sería el mismo
        // defecto por la otra puerta.
        const campos = [
            ['titular', parsed.headline], ['subtítulo', parsed.subheadline],
            ['contexto', parsed.context], ['cierre', parsed.closing],
            ['texto de Instagram', parsed.social?.instagram?.copy],
            ['texto de Facebook', parsed.social?.facebook?.copy],
            ['texto de LinkedIn', parsed.social?.linkedin?.copy],
            ['texto de X', parsed.social?.x?.copy],
            ['texto de WhatsApp', parsed.social?.whatsapp?.copy],
        ];
        issues = [];
        for (const [field, texto] of campos) {
            if (!texto) continue;
            const check = validateEmergencyCopy(texto, factCtx, { field });
            if (!check.ok) issues.push(...check.issues.map(i => `[${field}] ${i}`));
        }
        if (!issues.length) return { copy: parsed, provider: result.provider, model: result.model, issues: [] };
        if (intento < MAX_TRIES) userText = `${userText}\n\n${buildRetryInstruction(issues)}`;
    }
    // Agotados los reintentos se ENTREGA con sus avisos, no se descarta: el
    // usuario puede corregir el texto a mano en la pantalla, y quitarlo dejaría
    // la pieza sin ninguno. Misma decisión que el guion de la Campaña de
    // Emergencia (v4.783), y por el mismo motivo: depende de cuánto cuesta
    // corregir cada cosa.
    return { copy: parsed, provider: null, model: null, issues };
};

// ─── POST /api/content-studio/campaign-post/compose ────────────────────

export const composeCampaignPost = async (req, res) => {
    try {
        const {
            campaignId, objective = DEFAULT_OBJECTIVE, audience = DEFAULT_AUDIENCE,
            language = DEFAULT_LANGUAGE, formatId = DEFAULT_FORMAT_ID, layoutId = null,
            statIds = null, imageUrl = '', copyProvider = null, copy: copyOverride = null,
        } = req.body || {};

        const campaign = await campaignInScope(req, String(campaignId || ''));
        if (!campaign) return res.status(404).json({ error: 'La campaña no existe o no alcanza a este sitio.' });

        const content = normalizeContent(campaign.content);
        const obj = OBJECTIVES[objective] ? objective : DEFAULT_OBJECTIVE;
        const aud = AUDIENCES[audience] ? audience : DEFAULT_AUDIENCE;
        const lang = LANGUAGES[language] ? language : DEFAULT_LANGUAGE;
        const fmt = isCampaignFormat(formatId) ? formatId : DEFAULT_FORMAT_ID;

        const { stats: publishable } = publishableStats(campaign.stats);
        const items = activeItems(content);
        const chosenLayout = pickLayout({ objective: obj, requested: layoutId, formatId: fmt, stats: publishable, items });

        const stats = chooseStats(publishable, statIds, capacityOf(chosenLayout.id, fmt, 'maxStats'));
        const shownItems = items.slice(0, capacityOf(chosenLayout.id, fmt, 'maxItems'));

        const centersCap = capacityOf(chosenLayout.id, fmt, 'maxCities');
        let centers = null;
        if (centersCap > 0) {
            const rows = await publicCentersFor(campaign.id, isOperator(req) ? null : req.user?.clubId);
            centers = centerSummary(rows, centersCap);
        }

        // La comprobación va ANTES de gastar una llamada al modelo: producir la
        // pieza y descubrir después que le falta el título es pagar por nada.
        const check = validateBeforeGenerate({
            campaign, objective: obj, formatId: fmt, layoutId: chosenLayout.id, imageUrl, stats,
        });
        if (!check.ok) return res.status(422).json({ error: 'La campaña no tiene lo que esta pieza necesita.', errors: check.errors, warnings: check.warnings });

        const site = isOperator(req) ? null : await siteOf(req.user?.clubId).catch(() => null);
        const url = campaignUrl(campaign, await siteUrlFor(campaign, req));

        // Regenerar SÓLO el diseño no vuelve a pedir el copy: es lo que permite
        // probar composiciones sin gastar una llamada por cada una.
        let copy = copyOverride;
        let copyIssues = [];
        let copyMeta = null;
        if (!copy) {
            const brief = buildCampaignBrief({ campaign, objective: obj, audience: aud, language: lang, stats, items: shownItems, centers });
            const factCtx = factContextOf({ content, stats, items: shownItems, url });
            const out = await generatePieceCopy({ brief, factCtx, provider: copyProvider });
            copy = out.copy;
            copyIssues = out.issues;
            copyMeta = { provider: out.provider, model: out.model };
        }

        const template = templateFor(chosenLayout.id, fmt);
        if (!template) return res.status(400).json({ error: `No hay composición «${chosenLayout.id}» para el formato ${fmt}.` });

        const variables = buildVariables({
            campaign, copy, stats, items: shownItems, centers,
            imageUrl, logoUrl: await logoFor(campaign, req, lang), qrUrl: '',
        });
        if (!variables.url) variables.url = url.replace(/^https?:\/\//, '');

        // El branding de la PIEZA sale del tema de la campaña. `applyBranding`
        // es el mismo mecanismo que usan las plantillas de club: los nodos
        // declaran `brand: 'primary' | 'accent'` y acá se resuelve el color.
        const branding = {
            primary: hexOrEmpty(content.theme.primary) || PALETTE.navy,
            accent: hexOrEmpty(content.theme.cta) || hexOrEmpty(content.theme.accent) || PALETTE.gold,
            ink: PALETTE.ink,
        };

        const document = compileTemplate({ template, variables, branding });

        res.json({
            document,
            variables,
            copy,
            layout: { id: chosenLayout.id, notes: chosenLayout.notes },
            templateId: template.id,
            format: fmt,
            stats,
            items: shownItems,
            centers,
            url,
            warnings: [...check.warnings, ...chosenLayout.notes],
            copyIssues,
            copyMeta,
            site: site?.id || null,
        });
    } catch (e) { fail(res, e, 400); }
};

// ─── Dos datos que salen de la base, no del navegador ──────────────────

/** El dominio del sitio para el que se genera. Componerlo en el navegador daría
 *  una dirección distinta según desde dónde se abrió el panel. */
const siteUrlFor = async (campaign, req) => {
    const clubId = isOperator(req) ? (campaign.recipientClubId || req.user?.clubId) : req.user?.clubId;
    if (!clubId) return '';
    try {
        const club = await prisma.club.findUnique({ where: { id: clubId }, select: { domain: true, subdomain: true } });
        if (club?.domain) return `https://${String(club.domain).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
        if (club?.subdomain) return `https://${club.subdomain}.clubplatform.org`;
    } catch { /* sin dominio, la pieza sale sin dirección */ }
    return '';
};

/**
 * El logotipo del sitio.
 *
 * `Club.logo` es el nacional; `logo_intl` (en `Setting`) es la versión rotulada
 * en inglés. Se elige con el IDIOMA de la pieza, que es el mismo criterio de
 * `audienceAssets.ts` en el navegador (v4.699): el logotipo lleva texto, así
 * que tiene idioma. Sin versión internacional se usa el de siempre — nunca se
 * deja un hueco.
 */
const logoFor = async (campaign, req, language = DEFAULT_LANGUAGE) => {
    const clubId = isOperator(req) ? (campaign.recipientClubId || req.user?.clubId) : req.user?.clubId;
    if (!clubId) return '';
    try {
        const club = await prisma.club.findUnique({ where: { id: clubId }, select: { logo: true } });
        if (language !== 'es') {
            const { rows } = await db.query(
                `SELECT value FROM "Setting" WHERE "clubId" = $1 AND key = 'logo_intl' LIMIT 1`,
                [clubId]
            );
            if (rows[0]?.value) return rows[0].value;
        }
        return club?.logo || '';
    } catch { return ''; }
};

export default { getCampaignPostOptions, composeCampaignPost };
