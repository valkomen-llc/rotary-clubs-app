// ════════════════════════════════════════════════════════════════════════════
// Guardián de acceso a Solicitudes de Contenido / Rotary en Acción — v4.1136.0
//
// Restringido EXCLUSIVAMENTE a las 4 entidades principales de la plataforma:
// 1. Club Platform (app.clubplatform.org / localhost / plataforma global superadmin)
// 2. Rotary 4281 (Sitio oficial del Distrito 4281: rotary4281.org, d4281)
// 3. Feria de Proyectos (feriadeproyectos.org / tipo project_fair)
// 4. Colrotarios (colrotarios.org / tipo colrotarios)
//
// Los clubes regulares (ej. Rotary Nuevo Cali, Pereira del Café, Quimbaya, etc.)
// NO tienen este módulo habilitado ni deben ver la trazabilidad ni el buzón.
// ════════════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import { isContentSubmissionsAllowedSite } from '../lib/submissionInbox.js';

/**
 * Resuelve y almacena en caché en la request el contexto de Club si no está cargado.
 */
export const resolveClubContext = async (req) => {
    if (req._resolvedClub !== undefined) return req._resolvedClub;
    if (req.club) {
        req._resolvedClub = req.club;
        return req.club;
    }
    const clubId = req.user?.clubId || (req.headers && req.headers['x-club-id']);
    if (!clubId) {
        req._resolvedClub = null;
        return null;
    }
    try {
        const { rows } = await db.query(
            `SELECT id, name, domain, subdomain, type, category, district, "districtId" FROM "Club" WHERE id = $1 LIMIT 1`,
            [clubId]
        );
        req._resolvedClub = rows[0] || null;
        return req._resolvedClub;
    } catch {
        req._resolvedClub = null;
        return null;
    }
};

/**
 * ¿Tiene esta petición acceso al módulo de Solicitudes de Contenido / Rotary en Acción?
 */
export const isSubmissionInboxAllowed = async (req) => {
    const rawHost = (req.headers?.['x-forwarded-host'] || req.headers?.host || req.hostname || '').toLowerCase().trim();
    const rawOrigin = (req.headers?.origin || req.headers?.referer || '').toLowerCase().trim();
    const effectiveHost = (rawHost || rawOrigin).replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

    const club = await resolveClubContext(req);

    return isContentSubmissionsAllowedSite({
        host: effectiveHost,
        origin: rawOrigin,
        user: req.user,
        club,
    });
};

/**
 * Middleware para bloquear con 403 a sitios no autorizados (clubes regulares).
 */
export const requireSubmissionInboxAccess = async (req, res, next) => {
    try {
        const allowed = await isSubmissionInboxAllowed(req);
        if (!allowed) {
            return res.status(403).json({
                error: 'Módulo de solicitudes de contenido no disponible para este sitio',
                code: 'SUBMISSION_INBOX_FORBIDDEN',
                allowed: false,
            });
        }
        next();
    } catch (e) {
        console.error('[SUBMISSIONS_GUARD] Error validando acceso:', e);
        return res.status(403).json({
            error: 'Acceso denegado al módulo de solicitudes',
            code: 'SUBMISSION_INBOX_FORBIDDEN',
            allowed: false,
        });
    }
};

/**
 * Middleware para endpoints de polling (header/badge).
 * Si no está permitido, responde silenciosamente con estructura vacía para no romper el layout.
 */
export const gateSubmissionInboxPolling = (emptyPayload = { count: 0, items: [], allowed: false }) => {
    return async (req, res, next) => {
        try {
            const allowed = await isSubmissionInboxAllowed(req);
            if (!allowed) {
                const payload = typeof emptyPayload === 'function' ? emptyPayload(req) : emptyPayload;
                return res.json(payload);
            }
            next();
        } catch (e) {
            console.error('[SUBMISSIONS_GUARD] Error validando polling:', e);
            const payload = typeof emptyPayload === 'function' ? emptyPayload(req) : emptyPayload;
            return res.json(payload);
        }
    };
};

export default {
    resolveClubContext,
    isSubmissionInboxAllowed,
    requireSubmissionInboxAccess,
    gateSubmissionInboxPolling,
};
