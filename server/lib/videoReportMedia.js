// ════════════════════════════════════════════════════════════════════
// Video Informe IA — Buscador y Agregador Unificado de Multimedia
// v4.1100.0
//
// Unifica recursos de:
//   1. Solicitudes de contenido aprobadas
//   2. Galería y assets de la Campaña de Contribución
//   3. Biblioteca Multimedia general del sitio
//   4. Outros institucionales guardados
// Sin duplicar archivos físicamente.
// ════════════════════════════════════════════════════════════════════

import db from './db.js';
import { approvedCampaignMedia } from './contentSubmissionStore.js';
import { campaignAssets } from './waysToContribute.js';
import { normalizeContent } from './contributionSpec.js';

export async function getUnifiedCampaignMedia(campaignId, { clubId = null, tab = 'todos', search = '' } = {}) {
    // 1. Obtener campaña y su contenido
    const { rows: campRows } = await db.query(
        `SELECT * FROM "ContributionCampaign" WHERE id = $1`,
        [campaignId]
    );
    if (!campRows.length) return [];
    const camp = campRows[0];
    const content = normalizeContent(camp.content);

    const assets = [];
    const seenUrls = new Set();

    // 2. Material de Solicitudes aprobadas
    const aportes = await approvedCampaignMedia(campaignId, { limit: 120 });
    for (const a of aportes) {
        if (!a.url || seenUrls.has(a.url)) continue;
        seenUrls.add(a.url);
        assets.push({
            id: a.mediaId || `sub_${a.submissionId}`,
            mediaId: a.mediaId,
            url: a.url,
            thumbUrl: a.url,
            kind: a.kind || 'image',
            origin: 'solicitud',
            originLabel: a.originLabel || 'Solicitud de contenido',
            title: a.caption || a.credit || 'Foto de territorio',
            credit: a.credit || '',
            context: a.submissionContext || ''
        });
    }

    // 3. Material directo de la Campaña
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
            originLabel: c.originLabel || 'Campaña oficial',
            title: c.caption || c.alt || 'Asset de campaña',
            credit: c.credit || '',
            context: c.description || ''
        });
    }

    // 4. Recursos de la Biblioteca Multimedia del club/distrito
    try {
        const whereClub = clubId ? `AND ("clubId" = $2 OR "clubId" IS NULL)` : '';
        const params = clubId ? [100, clubId] : [100];
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
                context: ''
            });
        }
    } catch (e) {
        console.warn('[videoReportMedia] Error cargando Biblioteca:', e.message);
    }

    // 5. Filtrado por Pestaña
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

    // 6. Búsqueda por texto si se especifica
    if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(a =>
            (a.title && a.title.toLowerCase().includes(q)) ||
            (a.context && a.context.toLowerCase().includes(q)) ||
            (a.credit && a.credit.toLowerCase().includes(q))
        );
    }

    return filtered;
}
