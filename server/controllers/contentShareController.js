// ════════════════════════════════════════════════════════════════════════════
// Compartir contenido en redes — la API (v4.1013)
//
// Cuatro endpoints, todos autenticados y todos acotados por el tenant del
// TOKEN. Ninguno devuelve un access token, ni recortado (regla de v4.992): lo
// que sale es si la página SIRVE y, cuando no, POR QUÉ y DÓNDE se corrige.
//
// El trabajo real lo hace `socialPublishingService.js`. Acá sólo se traduce
// HTTP: quién pregunta, qué código sale y con qué palabras.
// ════════════════════════════════════════════════════════════════════════════
import {
    resolveEntity, describeTargets, shareEntity, historyFor, historySummaryFor,
} from '../lib/socialPublishingService.js';
import { defaultShareMessage, SHARE_MESSAGE_MAX, NETWORKS, shareability } from '../lib/socialShareSpec.js';
import { clientIp } from '../lib/socialAudit.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// ============================================================================
// GET /api/social/share/targets?entityType=post&entityId=<id>
//
// Todo lo que el modal necesita para pintarse, resuelto en el SERVIDOR: la
// entidad, su dirección pública, si se puede compartir, las páginas
// disponibles con su estado, el copy propuesto y lo que ya salió.
//
// ⚠️ EL VEREDICTO VIAJA RESUELTO. La pantalla no vuelve a decidir quién puede
// publicar dónde: con dos criterios, el modal ofrecería una página que el
// servidor rechaza, y eso se lee como que el módulo está roto (regla de
// v4.999 — el alcance NO se espeja en el navegador).
// ============================================================================
export const getShareTargets = async (req, res) => {
    try {
        const entityType = str(req.query.entityType) || 'post';
        const entityId = str(req.query.entityId);
        if (!entityId) return res.status(400).json({ error: 'entityId requerido' });

        const ent = await resolveEntity({ entityType, entityId, user: req.user });
        if (!ent.ok) return res.status(ent.code || 404).json({ error: ent.error });

        const puede = shareability({ post: { published: ent.entity.published }, publicUrl: ent.publicUrl });
        const targets = await describeTargets({ clubId: ent.clubId, kind: 'link' });
        const hist = await historyFor({ entityType, entityId, user: req.user });

        return res.json({
            entity: ent.entity,
            publicUrl: ent.publicUrl,
            publicUrlReason: ent.publicUrlReason || null,
            // Cuál es el sitio que resuelve la dirección — «¿por qué el enlace
            // apunta a este dominio?» tiene que poder contestarse.
            site: ent.raw ? { clubId: ent.clubId } : null,
            shareable: puede.ok,
            shareReason: puede.reason,
            shareFix: puede.fix,
            targets,
            networks: NETWORKS.map(n => ({ id: n.id, label: n.label, available: n.available, linkable: n.linkable, note: n.note })),
            defaultMessage: defaultShareMessage(ent.entity),
            messageMax: SHARE_MESSAGE_MAX,
            history: hist.ok ? hist.entries : [],
            summary: hist.ok ? hist.summary : null,
        });
    } catch (e) {
        console.error('[share] getShareTargets:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// POST /api/social/share
//
// { entityType, entityId, accountIds[], message, operationKey }
//
// ⚠️ `operationKey` NO ES CEREMONIA: es lo que impide que un doble clic o un
// reintento del navegador publiquen dos veces en la página de una institución
// —algo que después hay que ir a borrar a mano en Facebook—. La genera la
// pantalla al abrir el modal; «Publicar nuevamente» es otra operación y otra
// clave, a propósito.
// ============================================================================
export const shareContent = async (req, res) => {
    try {
        const { entityType = 'post', entityId, accountIds, message, operationKey } = req.body || {};
        const r = await shareEntity({
            entityType: str(entityType), entityId: str(entityId),
            accountIds: Array.isArray(accountIds) ? accountIds : [],
            message: typeof message === 'string' ? message : '',
            operationKey: str(operationKey),
            user: req.user, ip: clientIp(req),
        });
        if (r.ok === false && r.code) {
            return res.status(r.code).json({ error: r.error, fix: r.fix || null });
        }
        // 207: unas páginas salieron y otras no. Un 200 diría que salió todo y
        // un 500 que no salió nada; las dos serían falsas.
        return res.status(r.status === 'error' ? 502 : r.status === 'partial' ? 207 : 200).json(r);
    } catch (e) {
        console.error('[share] shareContent:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// GET /api/social/share/history?entityType=post&entityId=<id>
// ============================================================================
export const getShareHistory = async (req, res) => {
    try {
        const entityType = str(req.query.entityType) || 'post';
        const entityId = str(req.query.entityId);
        if (!entityId) return res.status(400).json({ error: 'entityId requerido' });
        const r = await historyFor({ entityType, entityId, user: req.user });
        if (!r.ok) return res.status(r.code || 404).json({ error: r.error });
        return res.json({ entries: r.entries, summary: r.summary });
    } catch (e) {
        console.error('[share] getShareHistory:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// GET /api/social/share/summary?entityType=post&ids=a,b,c
//
// El resumen de VARIAS entidades en UNA consulta — es lo que permite pintar la
// insignia «Publicado en Facebook» en un listado de cien filas sin pagar una
// consulta por fila.
//
// ⚠️ DEGRADA SIEMPRE: esto adorna un listado que ya funciona. Un fallo acá no
// puede dejar sin Noticias a quien entró a trabajar.
// ============================================================================
export const getShareSummary = async (req, res) => {
    try {
        const entityType = str(req.query.entityType) || 'post';
        const ids = str(req.query.ids).split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
        const clubId = req.user?.role === 'administrator'
            ? (str(req.query.clubId) || str(req.user.clubId))
            : str(req.user?.clubId);
        if (!ids.length || !clubId) return res.json({});
        return res.json(await historySummaryFor({ entityType, entityIds: ids, clubId }));
    } catch (e) {
        console.warn('[share] getShareSummary:', e.message);
        return res.json({});
    }
};

export default { getShareTargets, shareContent, getShareHistory, getShareSummary };
