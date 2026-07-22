import prisma from '../lib/prisma.js';
import { routeToModel, getDefaultModel } from '../lib/ai-router.js';
import { getCampaignConversions } from './emailMarketingController.js';

// v4.567 — Asistente de IA para Email Marketing.
// Genera asuntos/preheaders/cuerpo, reescribe con tono y longitud, detecta riesgo de
// spam y traduce, reutilizando el router universal de modelos (lib/ai-router.js).
// Solo lectura respecto a la BD: no crea ni modifica campañas ni contactos.
console.log('[emailAiController] v4.567 — asistente IA (asuntos, preheader, cuerpo, mejorar, anti-spam, traducir)');

const resolveClubId = (req) => {
    if (req.user?.role === 'administrator') {
        return req.query?.clubId || req.body?.clubId || req.user?.clubId || null;
    }
    return req.user?.clubId || null;
};

// Extrae JSON de la respuesta del modelo, tolerando fences de código y texto alrededor.
const parseJson = (text) => {
    if (!text) return null;
    let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const start = t.search(/[[{]/);
    if (start > 0) t = t.slice(start);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (end >= 0) t = t.slice(0, end + 1);
    try { return JSON.parse(t); } catch { return null; }
};

const stripHtml = (h) => String(h || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

const TONES = {
    profesional: 'profesional y claro',
    comercial: 'comercial y persuasivo',
    educativo: 'educativo y didáctico',
    cercano: 'cercano y amable',
    institucional: 'institucional y formal',
};
const LENGTHS = { corta: 'corta (2-3 frases)', media: 'media (2-3 párrafos)', larga: 'larga y detallada' };
const toneText = (t) => TONES[t] || TONES.profesional;
const lengthText = (l) => LENGTHS[l] || LENGTHS.media;

const SYSTEM = 'Eres un asistente experto en email marketing y copywriting en español. Escribe en español neutro, claro y sin clickbait engañoso. Responde ÚNICAMENTE con JSON válido, sin explicaciones ni markdown ni fences.';

// POST /ai/assist — { task, ...params }
export const assist = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const { task } = req.body || {};
        if (!task) return res.status(400).json({ error: 'Falta el parámetro task' });

        // Contexto de la organización (opcional) para enriquecer las generaciones.
        let orgName = '';
        if (clubId) {
            try {
                const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true, city: true, country: true } });
                if (club) orgName = [club.name, club.city, club.country].filter(Boolean).join(', ');
            } catch { /* opcional */ }
        }
        const orgLine = orgName ? `Organización remitente: ${orgName}.` : '';

        let userPrompt;
        switch (task) {
            case 'subjects': {
                const { objective = '', tone, audience = '' } = req.body;
                if (!objective.trim()) return res.status(400).json({ error: 'Describe el objetivo de la campaña' });
                userPrompt = `${orgLine}
Objetivo de la campaña: ${clip(objective, 500)}.
Tono: ${toneText(tone)}. ${audience ? `Audiencia: ${clip(audience, 200)}.` : ''}
Devuelve JSON: {"subjects":[6 asuntos en español, atractivos y honestos, máximo 60 caracteres cada uno],"preheaders":[3 preheaders de ~90 caracteres que complementen el asunto]}`;
                break;
            }
            case 'body': {
                const { objective = '', tone, length, audience = '', points = '' } = req.body;
                if (!objective.trim()) return res.status(400).json({ error: 'Describe el objetivo del correo' });
                userPrompt = `${orgLine}
Genera el CUERPO de un correo en HTML simple: usa solo <h2>, <h3>, <p>, <ul>/<li> y como máximo un botón con <a href="#">Texto</a>. No incluyas <html>, <head>, <body>, <style> ni imágenes.
Objetivo: ${clip(objective, 600)}.
Tono: ${toneText(tone)}. Longitud: ${lengthText(length)}. ${audience ? `Audiencia: ${clip(audience, 200)}.` : ''} ${points ? `Puntos a incluir: ${clip(points, 400)}.` : ''}
Devuelve JSON: {"html":"<el cuerpo en HTML simple>"}`;
                break;
            }
            case 'improve': {
                const { content = '', tone, length, instruction = '' } = req.body;
                const text = clip(stripHtml(content), 2000);
                if (!text) return res.status(400).json({ error: 'No hay contenido para mejorar' });
                userPrompt = `${orgLine}
Reescribe y mejora el siguiente contenido de correo, conservando el idioma español y el sentido. Devuelve HTML simple (<h2>, <h3>, <p>, <ul>/<li>, y como máximo un <a> botón).
Tono deseado: ${toneText(tone)}. Longitud: ${lengthText(length)}. ${instruction ? `Instrucción adicional: ${clip(instruction, 300)}.` : ''}
Contenido actual: """${text}"""
Devuelve JSON: {"html":"<contenido mejorado en HTML simple>"}`;
                break;
            }
            case 'spamcheck': {
                const { subject = '', content = '' } = req.body;
                const text = clip(stripHtml(content), 1800);
                if (!subject.trim() && !text) return res.status(400).json({ error: 'No hay asunto ni contenido para analizar' });
                userPrompt = `Analiza el riesgo de que este correo caiga en la carpeta de spam (palabras gatillo, exceso de mayúsculas/signos, promesas exageradas, exceso de enlaces, etc.).
Asunto: "${clip(subject, 200)}".
Cuerpo: """${text}"""
Devuelve JSON: {"score": número 0-100 (0=sin riesgo, 100=muy riesgoso), "level":"bajo|medio|alto", "flagged":[{"word":"palabra o frase","reason":"por qué"}], "suggestions":["mejora concreta"]}`;
                break;
            }
            case 'translate': {
                const { content = '', targetLang = '' } = req.body;
                const text = clip(stripHtml(content), 2000);
                if (!text) return res.status(400).json({ error: 'No hay contenido para traducir' });
                if (!targetLang.trim()) return res.status(400).json({ error: 'Indica el idioma de destino' });
                userPrompt = `Traduce el siguiente contenido de correo a ${clip(targetLang, 40)}. Mantén un HTML simple y natural (<h2>, <h3>, <p>, <ul>/<li>, <a>). No agregues comentarios.
Contenido: """${text}"""
Devuelve JSON: {"html":"<traducción en HTML simple>"}`;
                break;
            }
            default:
                return res.status(400).json({ error: `Tarea de IA no soportada: ${task}` });
        }

        const slug = await getDefaultModel();
        let raw;
        try {
            raw = await routeToModel(slug, SYSTEM, userPrompt);
        } catch (e) {
            console.error('[emailAi] routeToModel:', e.message);
            return res.status(502).json({ error: 'El modelo de IA no está disponible. Revisa la configuración de claves (Gemini/OpenAI).' });
        }
        const parsed = parseJson(raw);
        if (!parsed) {
            console.error('[emailAi] respuesta no parseable:', String(raw).slice(0, 200));
            return res.status(502).json({ error: 'La IA devolvió una respuesta no válida. Intenta de nuevo.' });
        }
        res.json(parsed);
    } catch (error) {
        console.error('[emailAi] assist:', error);
        res.status(500).json({ error: 'Error del asistente de IA' });
    }
};

// POST /:id/ai-summary — resumen inteligente del resultado de una campaña enviada.
export const campaignSummary = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
        if (!campaign || campaign.clubId !== clubId) return res.status(404).json({ error: 'Campaña no encontrada' });

        const [sent, failed, uOpens, uClicks, topLinks] = await Promise.all([
            prisma.emailCampaignRecipient.count({ where: { campaignId: campaign.id, status: 'sent' } }),
            prisma.emailCampaignRecipient.count({ where: { campaignId: campaign.id, status: 'failed' } }),
            prisma.emailCampaignRecipient.count({ where: { campaignId: campaign.id, openedAt: { not: null } } }),
            prisma.emailCampaignRecipient.count({ where: { campaignId: campaign.id, clickedAt: { not: null } } }),
            prisma.emailLinkClick.groupBy({ by: ['url'], where: { campaignId: campaign.id }, _count: { url: true }, orderBy: { _count: { url: 'desc' } }, take: 5 }).catch(() => []),
        ]);
        const openRate = sent ? Math.round((uOpens / sent) * 1000) / 10 : 0;
        const clickRate = sent ? Math.round((uClicks / sent) * 1000) / 10 : 0;
        const ctor = uOpens ? Math.round((uClicks / uOpens) * 1000) / 10 : 0;
        const linksTxt = topLinks.length ? topLinks.map((l) => `${l.url} (${l._count.url})`).join('; ') : 'ninguno';
        const conv = await getCampaignConversions(campaign);
        const convTxt = conv.count > 0
            ? `${conv.count} pedido(s), ingresos ${conv.revenue} ${conv.currency} (ventana ${conv.windowDays} días)`
            : 'sin conversiones atribuidas';

        const userPrompt = `Analiza el resultado de esta campaña de email y da un resumen accionable en español.
Asunto: "${clip(campaign.subject, 200)}".
Métricas: enviados ${sent}, fallidos ${failed}, aperturas únicas ${uOpens} (${openRate}%), clics únicos ${uClicks} (${clickRate}%), click-to-open ${ctor}%.
Conversiones atribuidas: ${convTxt}.
Enlaces más pulsados: ${clip(linksTxt, 400)}.
Referencia sectorial: apertura buena ~20-30%, clic bueno ~2-5%.
Devuelve JSON: {"summary":"2-3 frases claras sobre el desempeño","whatWorked":["punto"],"toImprove":["punto"],"recommendations":["acción concreta para la próxima campaña"]}`;

        const slug = await getDefaultModel();
        let raw;
        try {
            raw = await routeToModel(slug, SYSTEM, userPrompt);
        } catch (e) {
            console.error('[emailAi] campaignSummary routeToModel:', e.message);
            return res.status(502).json({ error: 'El modelo de IA no está disponible. Revisa la configuración de claves.' });
        }
        const parsed = parseJson(raw);
        if (!parsed) return res.status(502).json({ error: 'La IA devolvió una respuesta no válida. Intenta de nuevo.' });
        res.json({ ...parsed, metrics: { sent, failed, uOpens, uClicks, openRate, clickRate, ctor } });
    } catch (error) {
        console.error('[emailAi] campaignSummary:', error);
        res.status(500).json({ error: 'Error al generar el resumen' });
    }
};
