// ════════════════════════════════════════════════════════════════════
// Qué campañas de contribución alcanza esta sesión — v4.967.0
//
// Vivía dentro de `campaignPostController.js` y desde v4.967 hay un SEGUNDO
// consumidor: el tipo «Maneras de Contribuir» del Generador de Publicaciones.
// Con la consulta escrita dos veces, un generador ofrecería una campaña que el
// otro no —o peor, que la página del sitio no muestra— y la publicación
// mandaría a una landing que ahí no existe. Es la misma razón por la que
// `targetsSite` se reutiliza de `contributionSpec` en vez de escribir un
// segundo criterio de alcance (v4.807).
//
// NO es puro —consulta la base—, y por eso vive en `lib/` y no en un spec: lo
// que sí es puro (`pickCampaignForSite`, `effectiveStatus`) sigue en
// `contributionSpec.js`, que es donde se prueba.
// ════════════════════════════════════════════════════════════════════

import ensureContributionSchema from './ensureContributionSchema.js';
import { effectiveStatus, pickCampaignForSite } from './contributionSpec.js';
import { siteOf, servableCampaigns } from '../controllers/contributionCampaignController.js';

export const isOperator = (req) => req.user?.role === 'administrator';

/**
 * Las campañas que esta sesión puede usar para generar.
 *
 * El OPERADOR de la plataforma ve todas las vivas, ordenadas como el panel. Un
 * administrador de sitio ve ÚNICAMENTE la que su sitio muestra, resuelta con el
 * MISMO `pickCampaignForSite` de la página pública.
 */
export const campaignsInScope = async (req) => {
    await ensureContributionSchema();
    const all = await servableCampaigns();
    const now = new Date();
    if (isOperator(req)) {
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

/**
 * Una campaña por id, ya acotada.
 *
 * El aislamiento va acá y no en una comprobación posterior: para quien pregunta
 * por una campaña fuera de su alcance, esa campaña no existe.
 */
export const campaignInScope = async (req, id) => {
    const list = await campaignsInScope(req);
    return list.find(c => c.id === id) || null;
};

export default { campaignsInScope, campaignInScope, isOperator };
