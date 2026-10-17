// ════════════════════════════════════════════════════════════════════════════
// Curaduría Visual Inteligente — Motor y Orquestación Backend (v4.1210.0)
//
// Ingesta de solicitudes de contenido y biblioteca multimedia, análisis técnico
// con Sharp, análisis semántico multimodal con IA, cálculo de compatibilidad,
// generación de recomendaciones editoriales, persistencia, auditoría y reversión.
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';
import { ensureVisualCurationSchema } from './ensureVisualCurationSchema.js';
import {
    DEFAULT_CURATION_WEIGHTS,
    CONTAINER_SPECS,
    ROTARY_CAUSES,
    scoreCandidateForContainer,
    planContainerRecommendations,
    evaluateCandidateEligibility,
} from './visualCurationSpec.js';
import { routeToModel } from './ai-router.js';

let _sharp = null;
const getSharp = async () => {
    if (!_sharp) {
        const mod = await import('sharp');
        _sharp = mod.default || mod;
    }
    return _sharp;
};

// ─── Medición Técnica Local con Sharp (Sin Costo de Tokens) ─────────────────
export async function inspectImageBufferWithSharp(buffer) {
    const sharp = await getSharp();
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;

    // Redimensionar muestra a 512px para cálculo de nitidez y luminancia
    const sample = await sharp(buffer)
        .resize({ width: 512, height: 512, fit: 'inside' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const rawData = sample.data;
    const count = sample.info.width * sample.info.height;

    // Luminancia media (0-255)
    let sum = 0;
    for (let i = 0; i < count; i++) sum += rawData[i];
    const brightness = Math.round(sum / (count || 1));

    // Varianza Laplaciana aproximada para nitidez (3x3 kernel)
    const sw = sample.info.width;
    const sh = sample.info.height;
    let lapSum = 0;
    let lapCount = 0;

    for (let y = 1; y < sh - 1; y += 2) {
        for (let x = 1; x < sw - 1; x += 2) {
            const center = rawData[y * sw + x];
            const lap = Math.abs(
                rawData[(y - 1) * sw + x] +
                rawData[(y + 1) * sw + x] +
                rawData[y * sw + (x - 1)] +
                rawData[y * sw + (x + 1)] -
                4 * center
            );
            lapSum += lap;
            lapCount++;
        }
    }
    const sharpness = Math.round(((lapSum / (lapCount || 1)) / 4) * 10) / 10;

    // dHash 8x8 para detección de duplicados (muestra 9x8)
    const dhashSample = await sharp(buffer)
        .resize(9, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

    const bits = [];
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            bits.push(dhashSample[y * 9 + x] < dhashSample[y * 9 + x + 1] ? '1' : '0');
        }
    }
    const hash = bits.join('');

    return {
        width,
        height,
        aspectRatio: width / (height || 1),
        brightness,
        sharpness,
        hash,
        format: meta.format || 'jpeg',
    };
}

// ─── Ingesta de Candidatas desde Solicitudes y Multimedia ───────────────────
export async function ingestCandidatesForTenant(clubId) {
    await ensureVisualCurationSchema();

    // 1. Obtener solicitudes aprobadas o con imágenes recibidas
    const submissionsQuery = `
        SELECT s.id AS "submissionId", s.title, s.description, s.story, s.club, s.district,
               s."activityDate", s."areaFocus", s.program, s.topic, s.tags,
               s.status, s."consentText", s."consentAt",
               f.id AS "fileId", f."s3Key", f.filename, f.bytes, f."mediaUrl", f."mediaId"
          FROM "ContributionSubmission" s
          JOIN "ContributionSubmissionFile" f ON f."submissionId" = s.id
         WHERE f.kind = 'image'
           AND (s."originClubId" = $1 OR s.club ILIKE '%4281%' OR s.district ILIKE '%4281%')
           AND s.status IN ('recibida', 'analizando', 'generando', 'borrador_listo', 'aprobado', 'publicado')
         ORDER BY s."createdAt" DESC
         LIMIT 60
    `;

    const subRes = await db.query(submissionsQuery, [clubId]).catch((err) => {
        console.warn('[visual-curation] Error consultando solicitudes:', err.message);
        return { rows: [] };
    });

    // 2. Obtener imágenes de la Biblioteca Multimedia del club/distrito
    const mediaQuery = `
        SELECT m.id AS "mediaId", m.filename, m.url AS "mediaUrl", m."s3Key", m."createdAt",
               f.name AS "folderName"
          FROM "Media" m
          LEFT JOIN "MediaFolder" f ON f.id = m."folderId"
         WHERE m."clubId" = $1 AND m.type = 'image'
         ORDER BY m."createdAt" DESC
         LIMIT 40
    `;

    const medRes = await db.query(mediaQuery, [clubId]).catch((err) => {
        console.warn('[visual-curation] Error consultando media:', err.message);
        return { rows: [] };
    });

    const candidateItems = [];

    for (const r of subRes.rows) {
        const url = r.mediaUrl || (r.s3Key ? `https://${process.env.AWS_BUCKET_NAME || 'rotary-platform-assets'}.s3.amazonaws.com/${r.s3Key}` : null);
        if (!url) continue;

        candidateItems.push({
            clubId,
            submissionId: r.submissionId,
            fileId: r.fileId,
            s3Key: r.s3Key,
            url,
            filename: r.filename || 'Fotografía de actividad',
            title: r.title || 'Actividad de servicio',
            club: r.club || 'Rotary Distrito 4281',
            activityDate: r.activityDate || '',
            tags: Array.isArray(r.tags) ? r.tags : [],
            areaFocus: r.areaFocus || '',
            program: r.program || '',
            topic: r.topic || '',
            description: r.description || '',
            story: r.story || '',
            consentVerified: Boolean(r.consentAt || r.consentText),
        });
    }

    for (const m of medRes.rows) {
        if (!m.mediaUrl) continue;
        candidateItems.push({
            clubId,
            submissionId: null,
            fileId: m.mediaId,
            s3Key: m.s3Key,
            url: m.mediaUrl,
            filename: m.filename || 'Archivo Multimedia',
            title: m.folderName ? `Biblioteca · ${m.folderName}` : 'Biblioteca Multimedia',
            club: 'Distrito 4281',
            activityDate: '',
            tags: m.folderName ? [m.folderName] : [],
            description: 'Imagen cargada a la biblioteca multimedia institucional.',
            consentVerified: true,
        });
    }

    return candidateItems;
}

// ─── Análisis Semántico Multimodal con IA (Gemini / OpenAI) ─────────────────
export async function analyzeImageSemanticsWithAi({ url, title, description, clubName }) {
    const promptSystem = `Sos un curador visual y director editorial de Rotary International.
Analizá la fotografía institucional proporcionada y devolvé ÚNICAMENTE un JSON válido con la evaluación visual y semántica.
Estructura exacta requerida:
{
  "people_count": 0,
  "shows_service_action": true,
  "shows_fellowship": true,
  "rotary_branding_visible": true,
  "primary_cause": "paz|enfermedades|agua|materno_infantil|educacion|desarrollo_economico|medio_ambiente|general",
  "has_clear_focal_point": true,
  "has_space_for_text": true,
  "emotional_impact": "high|medium|low",
  "shows_results": true,
  "involves_minors": false,
  "is_screenshot": false,
  "is_document_or_flyer": false,
  "short_summary": "resumen objetivo de lo visible en 1 frase",
  "facts": ["hecho observable 1", "hecho observable 2"],
  "interpretation": "evaluación editorial breve sobre por qué funciona o no para un portal rotario"
}`;

    const promptUser = `Fotografía de: ${clubName || 'Club Rotario'}. Título/Contexto de la actividad: "${title || ''}". Descripción: "${description || ''}". Analizá la imagen proporcionada.`;

    try {
        const rawJson = await routeToModel('gemini-2.5-flash', promptSystem, promptUser, [], {
            maxTokens: 1024,
        });

        const cleaned = String(rawJson || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            peopleCount: Number(parsed.people_count) || 0,
            showsServiceAction: parsed.shows_service_action === true,
            showsFellowship: parsed.shows_fellowship === true,
            isRotaryBranded: parsed.rotary_branding_visible === true,
            primaryCause: parsed.primary_cause || 'general',
            hasClearFocalPoint: parsed.has_clear_focal_point === true,
            hasSpaceForText: parsed.has_space_for_text === true,
            emotionalImpact: parsed.emotional_impact || 'medium',
            showsResultsOrBeneficiaries: parsed.shows_results === true,
            involvesMinors: parsed.involves_minors === true,
            isScreenshot: parsed.is_screenshot === true,
            isDocumentOrFlyer: parsed.is_document_or_flyer === true,
            summary: parsed.short_summary || '',
            facts: Array.isArray(parsed.facts) ? parsed.facts : [],
            interpretation: parsed.interpretation || '',
        };
    } catch (err) {
        console.warn('[visual-curation] Fallback semántico heurístico:', err.message);
        // Fallback heurístico si no hay conexión a IA
        const text = `${title} ${description}`.toLowerCase();
        return {
            peopleCount: text.includes('personas') || text.includes('comunidad') ? 5 : 2,
            showsServiceAction: text.includes('servicio') || text.includes('entrega') || text.includes('obra') || text.includes('siembra'),
            showsFellowship: text.includes('reunion') || text.includes('companeros') || text.includes('socio'),
            isRotaryBranded: text.includes('rotary') || text.includes('rotaract'),
            primaryCause: text.includes('agua') ? 'agua' : (text.includes('arbol') || text.includes('ambiente') ? 'medio_ambiente' : (text.includes('escuela') ? 'educacion' : 'general')),
            hasClearFocalPoint: true,
            hasSpaceForText: true,
            emotionalImpact: 'medium',
            showsResultsOrBeneficiaries: true,
            involvesMinors: text.includes('nino') || text.includes('infant'),
            isScreenshot: false,
            isDocumentOrFlyer: false,
            summary: title || 'Fotografía de proyecto rotario',
            facts: ['Fotografía documental de actividad comunitaria.'],
            interpretation: 'Evaluada a partir de los metadatos y contexto editorial registrado.',
        };
    }
}

// ─── Proceso de Análisis Incremental y Registro de Candidatas ───────────────
export async function processAndCacheCandidate({ clubId, item }) {
    // 1. Verificar si ya fue analizada previamente
    const { rows: existing } = await db.query(
        `SELECT id, "technicalMetrics", "semanticAnalysis", hash FROM "SiteImageCandidate"
          WHERE "clubId" = $1 AND (url = $2 OR ("fileId" IS NOT NULL AND "fileId" = $3)) LIMIT 1`,
        [clubId, item.url, item.fileId || null]
    );

    if (existing[0] && existing[0].technicalMetrics && Object.keys(existing[0].technicalMetrics).length > 0) {
        return {
            ...item,
            id: existing[0].id,
            technicalMetrics: existing[0].technicalMetrics,
            semanticAnalysis: existing[0].semanticAnalysis,
            hash: existing[0].hash,
        };
    }

    // 2. Medir parámetros técnicos con Sharp
    let techMetrics = {
        width: 1600,
        height: 900,
        aspectRatio: 16 / 9,
        brightness: 128,
        sharpness: 9.5,
        hash: '11001100110011001100110011001100',
    };

    try {
        const resp = await fetch(item.url);
        if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            techMetrics = await inspectImageBufferWithSharp(buf);
        }
    } catch (e) {
        console.warn(`[visual-curation] Inspección técnica local omitida (${item.url}):`, e.message);
    }

    // 3. Medir parámetros semánticos con IA
    const semantic = await analyzeImageSemanticsWithAi({
        url: item.url,
        title: item.title,
        description: item.description,
        clubName: item.club,
    });

    // 4. Guardar en Base de Datos (Caché Permanente)
    const { rows: inserted } = await db.query(
        `INSERT INTO "SiteImageCandidate"
            (id, "clubId", "submissionId", "fileId", "s3Key", url, filename, title, club, "activityDate",
             "technicalMetrics", "semanticAnalysis", "consentVerified", "involvesMinors", hash, "analyzedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         RETURNING id`,
        [
            clubId,
            item.submissionId || null,
            item.fileId || null,
            item.s3Key || null,
            item.url,
            item.filename,
            item.title,
            item.club,
            item.activityDate,
            JSON.stringify(techMetrics),
            JSON.stringify(semantic),
            item.consentVerified !== false,
            semantic.involvesMinors,
            techMetrics.hash,
        ]
    );

    return {
        ...item,
        id: inserted[0].id,
        technicalMetrics: techMetrics,
        semanticAnalysis: semantic,
        hash: techMetrics.hash,
    };
}

// ─── Generación de Recomendaciones para el Sitio ────────────────────────────
export async function runCurationCycleForTenant(clubId, options = {}) {
    await ensureVisualCurationSchema();

    // 1. Obtener configuración
    const { rows: cfgRows } = await db.query(
        `SELECT * FROM "SiteImageCurationConfig" WHERE "clubId" = $1 LIMIT 1`,
        [clubId]
    );
    const config = cfgRows[0] || {
        clubId,
        enabled: true,
        mode: 'recommendation',
        intervalDays: 15,
        targetContainers: ['hero', 'foundation', 'join'],
        weights: DEFAULT_CURATION_WEIGHTS,
    };

    // 2. Ingestar y analizar candidatas
    const rawCandidates = await ingestCandidatesForTenant(clubId);
    const analyzedCandidates = [];

    for (const raw of rawCandidates) {
        try {
            const candidate = await processAndCacheCandidate({ clubId, item: raw });
            analyzedCandidates.push(candidate);
        } catch (err) {
            console.error('[visual-curation] Error procesando candidata:', err.message);
        }
    }

    // 3. Consultar slots bloqueados actualmente
    const { rows: lockRows } = await db.query(
        `SELECT "containerKey", "slotIndex", "lockedBy", reason FROM "SiteImageLock" WHERE "clubId" = $1`,
        [clubId]
    );
    const lockedMap = {};
    for (const l of lockRows) {
        lockedMap[`${l.containerKey}-${l.slotIndex}`] = l;
    }

    // 4. Planificar recomendaciones por cada contenedor configurado
    const targetContainers = Array.isArray(config.targetContainers) ? config.targetContainers : ['hero', 'foundation', 'join'];
    const allGenerated = [];

    for (const cKey of targetContainers) {
        const spec = CONTAINER_SPECS[cKey];
        if (!spec) continue;

        const containerPlans = planContainerRecommendations({
            candidates: analyzedCandidates,
            containerKey: cKey,
            slotsCount: spec.slots,
            lockedSlots: lockedMap,
            weights: config.weights || DEFAULT_CURATION_WEIGHTS,
        });

        for (const plan of containerPlans) {
            if (plan.isLocked || !plan.selected) continue;

            // Guardar recomendación en la BD
            const { rows: recRows } = await db.query(
                `INSERT INTO "SiteImageRecommendation"
                    ("clubId", "candidateId", "containerKey", "slotIndex", score, breakdown, reasons, facts, interpretation, "cropSuggested", status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
                 RETURNING *`,
                [
                    clubId,
                    plan.selected.candidateId,
                    cKey,
                    plan.slotIndex,
                    plan.selected.score,
                    JSON.stringify(plan.selected.breakdown),
                    JSON.stringify(plan.selected.reasons),
                    JSON.stringify(plan.selected.facts),
                    plan.selected.interpretation,
                    JSON.stringify(plan.selected.cropSuggested),
                ]
            );

            allGenerated.push({
                ...recRows[0],
                candidate: plan.selected,
            });
        }
    }

    // 5. Actualizar última ejecución y próxima fecha
    const interval = Number(config.intervalDays) || 15;
    await db.query(
        `UPDATE "SiteImageCurationConfig"
            SET "lastRunAt" = NOW(),
                "nextRunAt" = NOW() + ($2 || ' days')::interval,
                "updatedAt" = NOW()
          WHERE "clubId" = $1`,
        [clubId, interval]
    );

    return {
        analyzedCount: analyzedCandidates.length,
        recommendationsCount: allGenerated.length,
        recommendations: allGenerated,
    };
}

// ─── Aprobación Editorial y Publicación ─────────────────────────────────────
export async function approveRecommendation({ recommendationId, actorId, actorName, clubId }) {
    await ensureVisualCurationSchema();

    // 1. Obtener la recomendación con los datos de la candidata
    const { rows } = await db.query(
        `SELECT r.*, c.url AS "candidateUrl", c.title AS "candidateTitle", c.club AS "candidateClub",
                c."submissionId" AS "candidateSubmissionId"
           FROM "SiteImageRecommendation" r
           JOIN "SiteImageCandidate" c ON c.id = r."candidateId"
          WHERE r.id = $1 AND r."clubId" = $2`,
        [recommendationId, clubId]
    );

    if (!rows[0]) throw new Error('Recomendación no encontrada');
    const rec = rows[0];

    // 2. Obtener el estado actual de las secciones del sitio
    const secRes = await db.query(
        `SELECT content FROM "ContentSection" WHERE page = 'home' AND section = 'images' AND "clubId" = $1 LIMIT 1`,
        [clubId]
    );

    let siteImages = {};
    if (secRes.rows[0]?.content) {
        const c = secRes.rows[0].content;
        siteImages = typeof c === 'string' ? JSON.parse(c) : c;
    }

    // 3. Obtener la imagen anterior para trazabilidad y rollback
    let previousUrl = null;
    const targetKey = rec.containerKey;
    const slotIdx = rec.slotIndex;

    if (Array.isArray(siteImages[targetKey])) {
        previousUrl = siteImages[targetKey][slotIdx]?.url || null;
        siteImages[targetKey][slotIdx] = {
            url: rec.candidateUrl,
            alt: rec.candidateTitle || 'Imagen seleccionada por IA',
        };
    } else {
        previousUrl = siteImages[targetKey]?.url || null;
        siteImages[targetKey] = {
            url: rec.candidateUrl,
            alt: rec.candidateTitle || 'Imagen seleccionada por IA',
        };
    }

    // 4. Guardar sección actualizada en ContentSection
    await db.query(
        `INSERT INTO "ContentSection" (id, page, section, content, "clubId", "updatedAt")
         VALUES (gen_random_uuid(), 'home', 'images', $1, $2, NOW())
         ON CONFLICT (page, section, "clubId") DO UPDATE
         SET content = $1, "updatedAt" = NOW()`,
        [JSON.stringify(siteImages), clubId]
    );

    // 5. Actualizar recomendación a 'approved' y 'publishedAt' = NOW()
    await db.query(
        `UPDATE "SiteImageRecommendation"
            SET status = 'approved',
                "approvedBy" = $2,
                "approvedAt" = NOW(),
                "publishedAt" = NOW(),
                "updatedAt" = NOW()
          WHERE id = $1`,
        [recommendationId, actorName || 'Administrador']
    );

    // 6. Registrar en el Historial de Auditoría
    const { rows: historyRows } = await db.query(
        `INSERT INTO "SiteImageHistory"
            (id, "clubId", "containerKey", "slotIndex", "previousUrl", "newUrl", "candidateId", "submissionId", "clubName", action, reason, "actorId", "actorName", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'curation_approved', $9, $10, $11, NOW())
         RETURNING *`,
        [
            clubId,
            targetKey,
            slotIdx,
            previousUrl,
            rec.candidateUrl,
            rec.candidateId,
            rec.candidateSubmissionId,
            rec.candidateClub,
            `Aprobación editorial para ${CONTAINER_SPECS[targetKey]?.label || targetKey}`,
            actorId,
            actorName,
        ]
    );

    return {
        ok: true,
        publishedUrl: rec.candidateUrl,
        previousUrl,
        historyId: historyRows[0]?.id,
    };
}

// ─── Rechazo Editorial con Motivo ──────────────────────────────────────────
export async function rejectRecommendation({ recommendationId, reason, actorId, actorName, clubId }) {
    await ensureVisualCurationSchema();

    await db.query(
        `UPDATE "SiteImageRecommendation"
            SET status = 'rejected',
                "rejectionReason" = $2,
                "approvedBy" = $3,
                "approvedAt" = NOW(),
                "updatedAt" = NOW()
          WHERE id = $1 AND "clubId" = $4`,
        [recommendationId, reason || 'Descartada por criterio editorial', actorName || 'Administrador', clubId]
    );

    return { ok: true, recommendationId };
}

// ─── Rollback / Reversión a Versión Anterior ────────────────────────────────
export async function rollbackHistoryVersion({ historyId, actorId, actorName, clubId }) {
    await ensureVisualCurationSchema();

    const { rows } = await db.query(
        `SELECT * FROM "SiteImageHistory" WHERE id = $1 AND "clubId" = $2 LIMIT 1`,
        [historyId, clubId]
    );
    if (!rows[0]) throw new Error('Entrada de historial no encontrada.');
    const entry = rows[0];

    if (!entry.previousUrl) {
        throw new Error('Esta entrada no cuenta con una imagen previa para restaurar.');
    }

    // Cargar contenido actual
    const secRes = await db.query(
        `SELECT content FROM "ContentSection" WHERE page = 'home' AND section = 'images' AND "clubId" = $1 LIMIT 1`,
        [clubId]
    );
    let siteImages = {};
    if (secRes.rows[0]?.content) {
        const c = secRes.rows[0].content;
        siteImages = typeof c === 'string' ? JSON.parse(c) : c;
    }

    const targetKey = entry.containerKey;
    const slotIdx = entry.slotIndex;
    const currentUrl = Array.isArray(siteImages[targetKey]) ? siteImages[targetKey][slotIdx]?.url : siteImages[targetKey]?.url;

    // Restaurar anterior
    if (Array.isArray(siteImages[targetKey])) {
        siteImages[targetKey][slotIdx] = {
            url: entry.previousUrl,
            alt: 'Imagen restaurada',
        };
    } else {
        siteImages[targetKey] = {
            url: entry.previousUrl,
            alt: 'Imagen restaurada',
        };
    }

    await db.query(
        `UPDATE "ContentSection" SET content = $1, "updatedAt" = NOW()
          WHERE page = 'home' AND section = 'images' AND "clubId" = $2`,
        [JSON.stringify(siteImages), clubId]
    );

    // Registrar evento de reversión
    await db.query(
        `INSERT INTO "SiteImageHistory"
            (id, "clubId", "containerKey", "slotIndex", "previousUrl", "newUrl", "candidateId", "submissionId", "clubName", action, reason, "actorId", "actorName", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'rollback', $9, $10, $11, NOW())`,
        [
            clubId,
            targetKey,
            slotIdx,
            currentUrl,
            entry.previousUrl,
            entry.candidateId,
            entry.submissionId,
            entry.clubName,
            `Reversión a la versión anterior (${entry.previousUrl})`,
            actorId,
            actorName,
        ]
    );

    return { ok: true, restoredUrl: entry.previousUrl };
}
