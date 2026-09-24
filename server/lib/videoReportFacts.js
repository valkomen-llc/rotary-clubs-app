// ════════════════════════════════════════════════════════════════════
// Video Informe IA — Motor de Hechos, Extracción y Anti-Alucinación
// v4.1100.0
//
// Extrae datos de la base de datos real (campaña, aportes, solicitudes,
// artículos y contexto editorial provisto) y construye el snapshot factual
// inmutable que alimenta al modelo de IA.
// ════════════════════════════════════════════════════════════════════

import db from './db.js';
import { INSTITUTIONAL_VOICE } from './institutionalVoice.js';
import { generateCopy } from '../services/copywritingService.js';
import { normalizeContent } from './contributionSpec.js';
import { approvedCampaignMedia } from './contentSubmissionStore.js';
import { campaignAssets } from './waysToContribute.js';
import { recommendMotionForAsset } from './videoReportSpec.js';

/**
 * Recopila todos los datos factuales reales de una campaña de contribución.
 */
export async function extractCampaignFacts(campaignId, { clubId = null, editorialContext = '' } = {}) {
    // 1. Datos de la campaña
    const { rows: campRows } = await db.query(
        `SELECT * FROM "ContributionCampaign" WHERE id = $1`,
        [campaignId]
    );
    if (!campRows.length) throw new Error('Campaña no encontrada');
    const camp = campRows[0];
    const content = normalizeContent(camp.content);

    // 2. Aportes económicos reales (Donation / Payment)
    let donationsTotal = [];
    try {
        const { rows: pagos } = await db.query(
            `SELECT "rawPayload" FROM "Payment"
              WHERE "rawPayload" LIKE $1 AND "createdAt" >= $2`,
            [`%${campaignId}%`, camp.createdAt]
        );
        const donationIds = new Set();
        for (const p of pagos) {
            try {
                const payload = JSON.parse(p.rawPayload || '{}');
                if (payload?.campaignId === campaignId && payload?.donationId) {
                    donationIds.add(String(payload.donationId));
                }
            } catch { /* ignorar payloads malformados */ }
        }

        if (donationIds.size > 0) {
            const { rows: donaciones } = await db.query(
                `SELECT currency, COUNT(*)::int AS count, SUM(amount)::float AS "amountSum"
                   FROM "Donation"
                  WHERE id = ANY($1::text[]) AND status = 'completed'
                  GROUP BY currency`,
                [[...donationIds]]
            );
            donationsTotal = donaciones;
        }
    } catch (e) {
        console.warn('[videoReportFacts] Error calculando donaciones reales:', e.message);
    }

    // 3. Solicitudes de contenido (ContributionSubmission)
    let submissionsSummary = { count: 0, locations: [], clubs: [], storiesSnippet: [] };
    try {
        const { rows: subs } = await db.query(
            `SELECT id, title, club, city, location, "activityDate", "participatingClubs", story, status
               FROM "ContributionSubmission"
              WHERE "campaignId" = $1 AND status != 'descartado'
              ORDER BY "createdAt" DESC
              LIMIT 50`,
            [campaignId]
        );

        const cities = new Set();
        const clubsSet = new Set();
        const stories = [];

        for (const s of subs) {
            if (s.city) cities.add(s.city.trim());
            if (s.location) cities.add(s.location.trim());
            if (s.club) clubsSet.add(s.club.trim());
            if (s.participatingClubs) clubsSet.add(s.participatingClubs.trim());
            if (s.story && stories.length < 10) {
                stories.push(`- ${s.title || 'Actividad'}: «${s.story.slice(0, 300)}» (${s.city || 'Territorio'})`);
            }
        }

        submissionsSummary = {
            count: subs.length,
            locations: Array.from(cities),
            clubs: Array.from(clubsSet),
            storiesSnippet: stories
        };
    } catch (e) {
        console.warn('[videoReportFacts] Error extrayendo solicitudes:', e.message);
    }

    // 4. Recursos multimedia disponibles (Aprobados + Campaña)
    const aportes = await approvedCampaignMedia(campaignId, { limit: 100 });
    const contentAssets = campaignAssets(camp.content);
    const mediaPool = [
        ...aportes.map(a => ({
            url: a.url,
            mediaId: a.mediaId,
            kind: a.kind || 'image',
            origin: 'solicitud',
            originLabel: a.originLabel || 'Solicitud de club',
            caption: a.caption || a.credit || '',
            credit: a.credit || '',
            context: a.submissionContext || ''
        })),
        ...contentAssets.map(a => ({
            url: a.url,
            mediaId: a.mediaId,
            kind: a.kind || 'image',
            origin: 'campana',
            originLabel: 'Campaña de Contribución',
            caption: a.caption || a.alt || '',
            credit: a.credit || '',
            context: a.description || ''
        }))
    ];

    const snapshot = {
        campaignId,
        name: camp.name,
        slug: camp.slug,
        campaignType: camp.campaignType,
        headline: content.hero?.title || camp.name,
        subtitle: content.hero?.subtitle || '',
        description: content.hero?.text || '',
        location: content.location || '',
        eventDate: content.eventDate || '',
        donations: donationsTotal,
        submissions: submissionsSummary,
        editorialContext: (editorialContext || '').trim(),
        availableMediaCount: mediaPool.length,
        extractedAt: new Date().toISOString()
    };

    return { snapshot, mediaPool };
}

/**
 * Genera la estructura narrativa de guion y escenas asistida por IA respetando
 * la regla de cero alucinación factual.
 */
export async function generateReportScript({
    snapshot,
    mediaPool = [],
    brief = {}
}) {
    const {
        title = snapshot.headline,
        objective = 'informe_final',
        audience = 'publico_general',
        format = '16:9',
        targetDurationSec = 120,
        tone = 'institucional',
        productionMode = 'equilibrado'
    } = brief;

    const donacionesStr = snapshot.donations.length
        ? snapshot.donations.map(d => `${d.count} aportes sumando ${d.currency} ${d.amountSum.toLocaleString()}`).join(', ')
        : 'Fondos de solidaridad en recaudación continua';

    const ubicacionesStr = snapshot.submissions.locations.length
        ? snapshot.submissions.locations.slice(0, 10).join(', ')
        : snapshot.location || 'Territorio nacional';

    const clubesStr = snapshot.submissions.clubs.length
        ? snapshot.submissions.clubs.slice(0, 10).join(', ')
        : 'Clubes y Distritos Rotarios';

    const promptSystem = `${INSTITUTIONAL_VOICE}

Sos el Director Audiovisual y Guionista Senior de "Club Platform for Rotary".
Tu misión es diseñar el Plan Audiovisual y Guion completo para un "Video Informe IA".

REGLAS CRÍTICAS E INVIOLABLES DE VERACIDAD (ZERO HALLUCINATION):
1. PROHIBIDO inventar cifras de dinero, cantidad de familias, beneficiarios, muertos, heridos o damnificados. Solo podés usar las cifras explícitamente suministradas en los hechos reales o en el contexto editorial provisto.
2. PROHIBIDO inventar testimonios o nombres de beneficiarios que no figuren en los relatos o contexto editorial.
3. Si un dato no existe, no lo inventes: expresalo como acción colectiva o compromiso de servicio.
4. Cada afirmación factual debe referenciar de dónde proviene (ej: "base de datos de donaciones", "solicitud en Loboguerrero", "contexto editorial").
5. El tono debe ser ${tone}.
6. El objetivo es: ${objective}.
7. La audiencia objetivo es: ${audience}.
8. Duración objetivo aproximada: ${targetDurationSec} segundos. Formato de video: ${format}.`;

    const promptUser = `
HECHOS REALES VERIFICADOS DE LA CAMPAÑA:
- Nombre: "${snapshot.name}"
- Titular oficial: "${snapshot.headline}"
- Descripción: "${snapshot.description}"
- Recaudo registrado: ${donacionesStr}
- Solicitudes y actividades recibidas: ${snapshot.submissions.count} actividades documentadas en campo
- Territorios y municipios participantes: ${ubicacionesStr}
- Clubes y entidades participantes: ${clubesStr}
- Relatos de territorio:
${snapshot.submissions.storiesSnippet.slice(0, 5).join('\n')}

CONTEXTO EDITORIAL SUMINISTRADO POR EL USUARIO:
${snapshot.editorialContext || '(Sin contexto adicional suministrado; basarse 100% en los datos reales de la campaña)'}

RECURSOS MULTIMEDIA DISPONIBLES EN EL BANCO (${mediaPool.length} ítems):
${mediaPool.slice(0, 20).map((m, idx) => `[ID:${idx}] (${m.kind}) ${m.caption || m.originLabel}`).join('\n')}

INSTRUCCIONES:
Proponé una estructura audiovisual en formato JSON con la siguiente estructura:
{
  "title": "${title}",
  "synopsis": "Resumen conciso del informe en 2 frases",
  "chapters": [
    {
      "chapter": "Apertura",
      "scenes": [
        {
          "sceneType": "image",
          "durationSec": 6,
          "narrationText": "Texto para locución en voz alta (fluido y natural)",
          "onScreenTitle": "Texto corto en pantalla",
          "onScreenSubtitle": "Bajada opcional",
          "onScreenDataValue": null,
          "onScreenDataLabel": null,
          "recommendedAssetIndex": 0,
          "motionType": "ken_burns",
          "factSource": "Campaña oficial"
        }
      ]
    },
    {
      "chapter": "Impacto y Cifras",
      "scenes": [
        {
          "sceneType": "motion_graphic_data",
          "durationSec": 5,
          "narrationText": "Texto narrando el recaudo o las actividades",
          "onScreenTitle": "Solidaridad en Cifras",
          "onScreenSubtitle": "Resultados verificados",
          "onScreenDataValue": "USD 2,160",
          "onScreenDataLabel": "Aportes recaudados",
          "recommendedAssetIndex": null,
          "motionType": "still",
          "factSource": "Base de datos de donaciones"
        }
      ]
    }
  ]
}

Responde ÚNICAMENTE el objeto JSON sin bloques Markdown de código adicionales.`;

    const copyResult = await generateCopy({
        userText: promptUser,
        system: promptSystem,
        jsonMode: true,
        maxTokens: 4000
    });

    let parsed = null;
    const rawContent = copyResult?.content || copyResult?.text || '';
    try {
        if (typeof rawContent === 'object' && rawContent !== null) {
            parsed = rawContent;
        } else {
            const cleaned = String(rawContent)
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();
            parsed = JSON.parse(cleaned);
        }
    } catch (e) {
        console.error('[videoReportFacts] Falló el parseo del guion JSON:', rawContent);
        throw new Error('La IA generó una estructura que no se pudo parsear como JSON');
    }

    // Aplanar y vincular escenas con el mediaPool
    let sortOrder = 0;
    const scenes = [];

    for (const ch of (parsed.chapters || [])) {
        for (const s of (ch.scenes || [])) {
            const assetIdx = s.recommendedAssetIndex;
            const asset = (assetIdx !== null && assetIdx !== undefined && mediaPool[assetIdx])
                ? mediaPool[assetIdx]
                : (mediaPool[sortOrder % Math.max(1, mediaPool.length)] || null);

            const sceneType = s.sceneType || (asset?.kind === 'video' ? 'video' : 'image');
            const motionType = s.motionType || recommendMotionForAsset({
                caption: asset?.caption || '',
                filename: asset?.url || '',
                sceneType
            });

            scenes.push({
                sortOrder: sortOrder++,
                chapter: ch.chapter || 'Capítulo',
                sceneType,
                durationSec: Number(s.durationSec) || 6.0,
                narrationText: s.narrationText || '',
                onScreenTitle: s.onScreenTitle || null,
                onScreenSubtitle: s.onScreenSubtitle || null,
                onScreenDataValue: s.onScreenDataValue || null,
                onScreenDataLabel: s.onScreenDataLabel || null,
                mediaUrl: asset?.url || null,
                mediaId: asset?.mediaId || null,
                thumbUrl: asset?.url || null,
                motionType,
                engineMode: 'motion',
                creditsEstimated: 0,
                creditsUsed: 0,
                factSource: {
                    claim: s.narrationText || '',
                    source: s.factSource || 'Datos oficiales de la campaña'
                }
            });
        }
    }

    return {
        title: parsed.title || title,
        synopsis: parsed.synopsis || '',
        scenes
    };
}
