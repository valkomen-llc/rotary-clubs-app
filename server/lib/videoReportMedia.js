// ════════════════════════════════════════════════════════════════════
// Video Informe IA — Buscador y Agregador Unificado de Multimedia
// v4.1102.0
//
// Unifica recursos de:
//   1. Solicitudes de contenido (con detección inteligente de clubes)
//   2. Galería y assets de la Campaña de Contribución
//   3. Biblioteca Multimedia general del sitio
// Prioriza de manera automática los clubes mencionados en el Contexto Editorial.
// ════════════════════════════════════════════════════════════════════

import db from './db.js';
import { campaignAssets } from './waysToContribute.js';
import { normalizeContent } from './contributionSpec.js';

/**
 * Normaliza cadenas para comparación fonética/textual sin tildes ni caracteres especiales.
 */
export function normalizeClubSearch(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extrae el núcleo distintivo del nombre de un club (eliminando prefijos como "Club Rotario", etc.).
 */
export function extractCoreClubName(clubName) {
    if (!clubName || typeof clubName !== 'string') return '';
    const norm = normalizeClubSearch(clubName);
    return norm
        .replace(/\b(club rotario de|club rotario del|club rotario|rotary club de|rotary club|rotary internacional|rotary|club|interact|rotaract)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Determina si el nombre de un club o sus palabras clave están presentes en un texto editorial.
 */
export function isClubMentionedInText(clubName, contextText) {
    if (!clubName || !contextText) return false;
    const normText = normalizeClubSearch(contextText);
    const coreName = extractCoreClubName(clubName);

    if (!coreName || coreName.length < 3) return false;

    // 1. Coincidencia de frase exacta o subcadena del nombre núcleo
    if (normText.includes(coreName)) return true;

    // 2. Coincidencia con límites de palabra
    const escaped = coreName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(normText)) return true;

    // 3. Coincidencia por tokens distintivos (mínimo 5 letras, omitiendo palabras comunes)
    const commonStops = new Set([
        'distrito', 'internacional', 'international', 'colombia', 'rotario',
        'rotary', 'valle', 'ciudad', 'municipio', 'comunidad', 'accion', 'servicio'
    ]);
    const tokens = coreName.split(' ').filter(t => t.length >= 5 && !commonStops.has(t));
    for (const t of tokens) {
        const tokenRegex = new RegExp(`\\b${t}\\b`, 'i');
        if (tokenRegex.test(normText)) return true;
    }

    return false;
}

/**
 * Consulta y unifica la multimedia de la campaña, priorizando los clubes
 * mencionados en el contexto editorial.
 */
export async function getUnifiedCampaignMedia(campaignId, {
    clubId = null,
    tab = 'todos',
    search = '',
    editorialContext = '',
    clubFilter = ''
} = {}) {
    // 1. Obtener campaña y su contenido
    const { rows: campRows } = await db.query(
        `SELECT * FROM "ContributionCampaign" WHERE id = $1`,
        [campaignId]
    );
    if (!campRows.length) return { media: [], detectedClubs: [], participatingClubs: [], stats: { total: 0, priorityCount: 0 } };
    const camp = campRows[0];

    const assets = [];
    const seenUrls = new Set();

    // 2. Consultar Solicitudes de contenido con JOIN directo a archivos y biblioteca
    let submissionFiles = [];
    try {
        const { rows: subRows } = await db.query(
            `SELECT f.id AS "fileId", f."submissionId", f."mediaId", f."mediaUrl", f.kind, f.filename, f."sortOrder",
                    s.club, s."participatingClubs", s.district, s.city, s.location, s.title, s.story, s.description,
                    s."senderName", s.status, s."createdAt",
                    m.url AS "libraryMediaUrl", m."thumbUrl" AS "libraryThumbUrl"
               FROM "ContributionSubmissionFile" f
               JOIN "ContributionSubmission" s ON s.id = f."submissionId"
               LEFT JOIN "Media" m ON m.id = f."mediaId"
              WHERE f."campaignId" = $1
                AND f.kind IN ('image', 'video')
                AND (f."mediaUrl" IS NOT NULL OR f."mediaId" IS NOT NULL OR m.url IS NOT NULL)
                AND s.status != 'descartado'
              ORDER BY s."createdAt" DESC, f."sortOrder" ASC`,
            [campaignId]
        );
        submissionFiles = subRows;
    } catch (e) {
        console.warn('[videoReportMedia] Error consultando ContributionSubmissionFile:', e.message);
    }

    // 3. Identificar clubes presentes en las solicitudes y en la base de datos
    const clubNamesSet = new Set();
    for (const r of submissionFiles) {
        if (r.club && r.club.trim()) clubNamesSet.add(r.club.trim());
        if (r.participatingClubs) {
            r.participatingClubs.split(',').forEach(c => {
                const trimmed = c.trim();
                if (trimmed) clubNamesSet.add(trimmed);
            });
        }
    }

    // Consultar catálogo de clubes general para enriquecer detección
    try {
        const { rows: dbClubs } = await db.query(
            `SELECT DISTINCT name FROM "Club" WHERE name IS NOT NULL AND TRIM(name) != '' LIMIT 500`
        );
        for (const dc of dbClubs) {
            clubNamesSet.add(dc.name.trim());
        }
    } catch { /* continuar si no hay tabla Club */ }

    // Detectar cuáles clubes están mencionados en el contexto editorial
    const allKnownClubs = Array.from(clubNamesSet);
    const detectedClubNames = editorialContext && editorialContext.trim()
        ? allKnownClubs.filter(c => isClubMentionedInText(c, editorialContext))
        : [];

    const clubCountMap = new Map();

    // 4. Procesar y priorizar archivos de solicitudes
    for (const f of submissionFiles) {
        const finalUrl = f.mediaUrl || f.libraryMediaUrl;
        if (!finalUrl || seenUrls.has(finalUrl)) continue;
        seenUrls.add(finalUrl);

        const clubName = f.club || '';
        if (clubName) {
            clubCountMap.set(clubName, (clubCountMap.get(clubName) || 0) + 1);
        }

        const isMentioned = editorialContext
            ? (isClubMentionedInText(clubName, editorialContext) ||
               detectedClubNames.some(c =>
                   (f.title && isClubMentionedInText(c, f.title)) ||
                   (f.story && isClubMentionedInText(c, f.story)) ||
                   (f.description && isClubMentionedInText(c, f.description))
               ))
            : false;

        const thumb = f.libraryThumbUrl || finalUrl;
        const caption = f.title || (clubName ? `Actividad del Club ${clubName}` : 'Aporte en terreno');

        assets.push({
            id: f.mediaId || `sub_${f.submissionId}_${f.fileId}`,
            mediaId: f.mediaId,
            url: finalUrl,
            thumbUrl: thumb,
            kind: f.kind === 'video' ? 'video' : 'image',
            origin: 'solicitud',
            originLabel: clubName ? `Aporte: ${clubName}` : 'Aporte de un club',
            title: caption,
            credit: clubName || f.senderName || '',
            context: `${f.title || ''}. ${f.city ? `Ubicación: ${f.city}. ` : ''}${f.story ? f.story.slice(0, 160) : ''}`.trim(),
            clubName: clubName || null,
            city: f.city || f.location || null,
            submissionTitle: f.title || null,
            mentionedInContext: isMentioned,
            priorityScore: isMentioned ? 100 : 10
        });
    }

    // 5. Material directo de la Campaña (hero, galerías)
    const campAssets = campaignAssets(camp.content);
    for (const c of campAssets) {
        if (!c.url || seenUrls.has(c.url)) continue;
        seenUrls.add(c.url);
        assets.push({
            id: c.mediaId || `camp_${seenUrls.size}`,
            mediaId: c.mediaId,
            url: c.url,
            thumbUrl: c.thumbUrl || c.url,
            kind: c.kind || 'image',
            origin: 'campana',
            originLabel: 'Campaña oficial',
            title: c.caption || c.alt || 'Asset oficial de campaña',
            credit: c.credit || '',
            context: c.description || '',
            clubName: null,
            city: null,
            submissionTitle: null,
            mentionedInContext: false,
            priorityScore: 5
        });
    }

    // 6. Recursos de la Biblioteca Multimedia general
    try {
        const whereClub = clubId ? `AND ("clubId" = $2 OR "clubId" IS NULL)` : '';
        const params = clubId ? [80, clubId] : [80];
        const { rows: mediaRows } = await db.query(
            `SELECT id, url, filename, type, "thumbUrl"
               FROM "Media"
              WHERE type IN ('image', 'video') ${whereClub}
              ORDER BY "createdAt" DESC
              LIMIT $1`,
            params
        );
        for (const m of mediaRows) {
            if (!m.url || seenUrls.has(m.url)) continue;
            seenUrls.add(m.url);

            // Verificar si el archivo de la biblioteca coincide con algún club mencionado
            const matchedClub = detectedClubNames.find(c => isClubMentionedInText(c, m.filename));

            assets.push({
                id: m.id,
                mediaId: m.id,
                url: m.url,
                thumbUrl: m.thumbUrl || m.url,
                kind: m.type === 'video' ? 'video' : 'image',
                origin: 'biblioteca',
                originLabel: 'Biblioteca Multimedia',
                title: m.filename,
                credit: '',
                context: '',
                clubName: matchedClub || null,
                city: null,
                submissionTitle: null,
                mentionedInContext: Boolean(matchedClub),
                priorityScore: matchedClub ? 50 : 1
            });
        }
    } catch (e) {
        console.warn('[videoReportMedia] Error cargando Biblioteca:', e.message);
    }

    // 7. Estructurar listas de clubes detectados y participantes
    const detectedClubs = detectedClubNames.map(name => ({
        name,
        count: assets.filter(a => a.clubName && isClubMentionedInText(name, a.clubName)).length,
        mentioned: true
    })).filter(c => c.count > 0).sort((a, b) => b.count - a.count);

    const participatingClubs = Array.from(clubCountMap.entries())
        .map(([name, count]) => ({
            name,
            count,
            mentioned: detectedClubNames.some(d => isClubMentionedInText(d, name))
        }))
        .sort((a, b) => b.count - a.count);

    // 8. Filtrado por Pestaña
    let filtered = assets;
    if (tab === 'solicitudes') {
        filtered = assets.filter(a => a.origin === 'solicitud');
    } else if (tab === 'campana') {
        filtered = assets.filter(a => a.origin === 'campana');
    } else if (tab === 'biblioteca') {
        filtered = assets.filter(a => a.origin === 'biblioteca');
    } else if (tab === 'videos') {
        filtered = assets.filter(a => a.kind === 'video');
    } else if (tab === 'imagenes') {
        filtered = assets.filter(a => a.kind === 'image');
    }

    // 9. Filtrado por Club específico o clubes mencionados
    if (clubFilter) {
        if (clubFilter === 'all_detected') {
            filtered = filtered.filter(a => a.mentionedInContext);
        } else {
            filtered = filtered.filter(a =>
                a.clubName && (
                    isClubMentionedInText(clubFilter, a.clubName) ||
                    a.clubName.toLowerCase().includes(clubFilter.toLowerCase())
                )
            );
        }
    }

    // 10. Búsqueda por texto libre
    if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(a =>
            (a.title && a.title.toLowerCase().includes(q)) ||
            (a.context && a.context.toLowerCase().includes(q)) ||
            (a.credit && a.credit.toLowerCase().includes(q)) ||
            (a.clubName && a.clubName.toLowerCase().includes(q))
        );
    }

    // 11. Ordenamiento: MÁXIMA PRIORIDAD para los clubes mencionados en el contexto
    filtered.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

    return {
        media: filtered,
        detectedClubs,
        participatingClubs,
        stats: {
            total: filtered.length,
            priorityCount: filtered.filter(a => a.mentionedInContext).length
        }
    };
}
