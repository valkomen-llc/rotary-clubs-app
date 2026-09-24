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
import { getUnifiedCampaignMedia } from './videoReportMedia.js';
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

    // 4. Recursos multimedia unificados y priorizados por contexto
    const unified = await getUnifiedCampaignMedia(campaignId, {
        clubId,
        editorialContext,
        tab: 'todos'
    });
    const mediaPool = unified.media.map(m => ({
        url: m.url,
        mediaId: m.mediaId,
        kind: m.kind || 'image',
        origin: m.origin,
        originLabel: m.originLabel,
        caption: m.title || m.credit || '',
        credit: m.credit || m.clubName || '',
        context: m.context || '',
        clubName: m.clubName || null,
        mentionedInContext: Boolean(m.mentionedInContext)
    }));

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
        detectedClubs: (unified.detectedClubs || []).map(d => d.name),
        editorialContext: (editorialContext || '').trim(),
        availableMediaCount: mediaPool.length,
        extractedAt: new Date().toISOString()
    };

    return { snapshot, mediaPool };
}

/**
 * Distribuye la duración total de una escena entre N tomas visuales de forma proporcional.
 */
export function distributeDuration(totalSec, count) {
    const n = Math.max(1, Math.min(count, 4));
    const safeTotal = Math.max(3, Math.round(Number(totalSec || 6) * 10) / 10);
    if (n === 1) return [safeTotal];
    const slice = Math.round((safeTotal / n) * 10) / 10;
    const result = [];
    let accumulated = 0;
    for (let i = 0; i < n - 1; i++) {
        result.push(slice);
        accumulated += slice;
    }
    const remainder = Math.max(1.5, Math.round((safeTotal - accumulated) * 10) / 10);
    result.push(remainder);
    return result;
}

/**
 * Calcula la cantidad recomendada de imágenes según el metraje de la escena:
 * - Menos de 6 segundos: 1 imagen fija con movimiento
 * - 6 a 9 segundos: 2 imágenes dinámicas
 * - 10 segundos o más: 3 imágenes (ritmo cinematográfico sin fatiga visual)
 */
export function getRecommendedAssetCount(durationSec) {
    const s = Number(durationSec) || 6;
    if (s >= 10) return 3;
    if (s >= 6) return 2;
    return 1;
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
${snapshot.detectedClubs?.length ? `- CLUBES PRIORITARIOS DETECTADOS EN EL CONTEXTO EDITORIAL:\n  ${snapshot.detectedClubs.join(', ')}\n  (¡REGLA OBLIGATORIA!: Dedica escenas específicas a relatar las acciones en territorio de estos clubes y asigna el recommendedAssetIndex correspondiente a sus fotos)` : ''}
- Relatos de territorio:
${snapshot.submissions.storiesSnippet.slice(0, 5).join('\n')}

CONTEXTO EDITORIAL SUMINISTRADO POR EL USUARIO:
${snapshot.editorialContext || '(Sin contexto adicional suministrado; basarse 100% en los datos reales de la campaña)'}

RECURSOS MULTIMEDIA DISPONIBLES EN EL BANCO (${mediaPool.length} ítems):
${mediaPool.slice(0, 25).map((m, idx) => `[ID:${idx}] (${m.kind}) ${m.caption || m.originLabel}${m.mentionedInContext ? ' [⭐ PRIORITARIO - CLUB MENCIONADO]' : ''}`).join('\n')}

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
            const durationSec = Number(s.durationSec) || 6.0;
            const recCount = durationSec >= 10 ? 3 : (durationSec >= 6 ? 2 : 1);
            const durations = distributeDuration(durationSec, recCount);
            
            const mediaAssets = [];
            for (let aIdx = 0; aIdx < recCount; aIdx++) {
                let asset = null;
                if (mediaPool && mediaPool.length > 0) {
                    if (aIdx === 0 && s.recommendedAssetIndex !== null && s.recommendedAssetIndex !== undefined && mediaPool[s.recommendedAssetIndex]) {
                        asset = mediaPool[s.recommendedAssetIndex];
                    } else {
                        asset = mediaPool[(sortOrder + aIdx) % Math.max(1, mediaPool.length)] || null;
                    }
                }
                if (asset) {
                    const motions = ['ken_burns', 'zoom_in', 'pan_right', 'pan_left'];
                    mediaAssets.push({
                        id: `asset_${sortOrder}_${aIdx}`,
                        url: asset.url,
                        thumbUrl: asset.thumbUrl || asset.url,
                        mediaId: asset.mediaId || null,
                        durationSec: durations[aIdx] || Math.round(durationSec / recCount),
                        motionType: motions[aIdx % motions.length],
                        engineMode: 'motion'
                    });
                }
            }

            const primaryAsset = mediaAssets[0] || null;
            const sceneType = s.sceneType || (primaryAsset?.kind === 'video' ? 'video' : 'image');
            const motionType = primaryAsset?.motionType || s.motionType || 'ken_burns';

            scenes.push({
                sortOrder: sortOrder++,
                chapter: ch.chapter || 'Capítulo',
                sceneType,
                durationSec,
                narrationText: s.narrationText || '',
                onScreenTitle: s.onScreenTitle || null,
                onScreenSubtitle: s.onScreenSubtitle || null,
                onScreenDataValue: s.onScreenDataValue || null,
                onScreenDataLabel: s.onScreenDataLabel || null,
                mediaUrl: primaryAsset?.url || null,
                mediaId: primaryAsset?.mediaId || null,
                thumbUrl: primaryAsset?.thumbUrl || null,
                motionType,
                engineMode: 'motion',
                mediaAssets,
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

/**
 * Parsea un guion completo suministrado directamente por el usuario
 * dividiéndolo en escenas con cálculo preciso de locución y recomendación visual.
 */
export function parseDirectScriptToScenes({ scriptText, mediaPool = [], title = 'Video Informe' }) {
    if (!scriptText || !scriptText.trim()) {
        throw new Error('El guion suministrado está vacío');
    }

    const raw = scriptText.trim();
    let rawChunks = [];

    // Si contiene patrones de escena explícitos: [Escena 1], Escena 1:, Capítulo 1:, Parte 1:
    const sceneMarkerRegex = /(?=(?:\[(?:Escena|Scene|Capítulo|Cap|Parte|\d+)[^\]]*\]|(?<!\[)\b(?:Escena|Scene|Capítulo|Cap|Parte)\s*\d+[:\.\-]?))/i;
    if (sceneMarkerRegex.test(raw)) {
        const parts = raw.split(sceneMarkerRegex);
        rawChunks = parts.map(p => p.trim()).filter(Boolean);
    } else {
        // Dividir por párrafos dobles o saltos de línea consistentes
        const paragraphs = raw.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
        if (paragraphs.length >= 2) {
            rawChunks = paragraphs;
        } else {
            // Un solo bloque: dividir en grupos de 2 o 3 oraciones (~30 a 45 palabras)
            const sentences = raw.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [raw];
            let current = '';
            for (const s of sentences) {
                const words = (current + ' ' + s).trim().split(/\s+/).filter(Boolean).length;
                if (words >= 35 && current) {
                    rawChunks.push(current.trim());
                    current = s;
                } else {
                    current = (current ? current + ' ' : '') + s;
                }
            }
            if (current.trim()) rawChunks.push(current.trim());
        }
    }

    if (rawChunks.length === 0) {
        rawChunks = [raw];
    }

    const scenes = [];
    let assetCursor = 0;

    rawChunks.forEach((chunk, idx) => {
        let chapterTitle = `Escena ${idx + 1}`;
        let narration = chunk;

        // Extraer posible título en encabezados [Escena 1: Titulo] o Escena 1: Texto
        const headerMatch = chunk.match(/^(?:\[([^\]]+)\]|((?:Escena|Scene|Capítulo|Cap|Parte)\s*\d+[:\-\.]?))\s*(?:[—\-–]\s*)?(.*)$/is);
        if (headerMatch) {
            const rawTitle = (headerMatch[1] || headerMatch[2] || `Escena ${idx + 1}`).trim();
            chapterTitle = rawTitle.replace(/[:\-\.]+$/, '').trim();
            narration = (headerMatch[3] !== undefined ? headerMatch[3] : '').trim() || chunk;
        }

        const words = narration.split(/\s+/).filter(Boolean).length;
        // Velocidad estándar de locución institucional en español: ~2.5 palabras por segundo
        const suggestedSec = Math.max(6, Math.min(30, Math.round(words / 2.5)));

        // Buscar si esta escena menciona algún club de las fotos del mediaPool
        let matchedAsset = null;
        if (mediaPool && mediaPool.length > 0) {
            // 1. Coincidencia directa con club mencionado en este párrafo
            matchedAsset = mediaPool.find(a =>
                a.clubName && (
                    narration.toLowerCase().includes(a.clubName.toLowerCase()) ||
                    (a.title && narration.toLowerCase().includes(a.title.toLowerCase()))
                )
            );

            // 2. Coincidencia con activos prioritarios de la campaña
            if (!matchedAsset) {
                const priorityAssets = mediaPool.filter(a => a.mentionedInContext);
                if (priorityAssets.length > 0 && assetCursor < priorityAssets.length) {
                    matchedAsset = priorityAssets[assetCursor];
                }
            }

            // 3. Fallback en el mediaPool
            if (!matchedAsset) {
                matchedAsset = mediaPool[assetCursor % mediaPool.length];
            }
            assetCursor++;
        }

        const durationSec = suggestedSec;
        const recCount = getRecommendedAssetCount(durationSec);
        const durations = distributeDuration(durationSec, recCount);

        const mediaAssets = [];
        for (let aIdx = 0; aIdx < recCount; aIdx++) {
            let asset = null;
            if (mediaPool && mediaPool.length > 0) {
                if (aIdx === 0 && matchedAsset) {
                    asset = matchedAsset;
                } else {
                    asset = mediaPool[assetCursor % mediaPool.length];
                    assetCursor++;
                }
            }
            if (asset) {
                const motions = ['ken_burns', 'zoom_in', 'pan_right', 'pan_left'];
                mediaAssets.push({
                    id: `asset_${idx}_${aIdx}`,
                    url: asset.url,
                    thumbUrl: asset.thumbUrl || asset.url,
                    mediaId: asset.mediaId || null,
                    durationSec: durations[aIdx] || Math.round(durationSec / recCount),
                    motionType: motions[aIdx % motions.length],
                    engineMode: 'motion'
                });
            }
        }

        const primaryAsset = mediaAssets[0] || (matchedAsset ? {
            id: `asset_${idx}_0`,
            url: matchedAsset.url,
            thumbUrl: matchedAsset.thumbUrl || matchedAsset.url,
            mediaId: matchedAsset.mediaId || null,
            durationSec,
            motionType: 'ken_burns',
            engineMode: 'motion'
        } : null);

        const sceneType = primaryAsset?.url && primaryAsset.url.endsWith('.mp4') ? 'video' : 'image';
        const motionType = primaryAsset?.motionType || 'ken_burns';

        scenes.push({
            sortOrder: idx,
            chapter: chapterTitle,
            sceneType,
            durationSec,
            narrationText: narration,
            onScreenTitle: chapterTitle,
            onScreenSubtitle: null,
            onScreenDataValue: null,
            onScreenDataLabel: null,
            mediaUrl: primaryAsset?.url || null,
            mediaId: primaryAsset?.mediaId || null,
            thumbUrl: primaryAsset?.thumbUrl || null,
            motionType,
            engineMode: 'motion',
            mediaAssets,
            creditsEstimated: 0,
            creditsUsed: 0,
            factSource: {
                claim: narration,
                source: 'Guion directo suministrado por el usuario'
            }
        });
    });

    return {
        title: title || 'Video Informe',
        synopsis: `Guion suministrado con ${scenes.length} escenas estructuradas y ${scenes.reduce((a, s) => a + s.durationSec, 0)}s de metraje total.`,
        scenes
    };
}
