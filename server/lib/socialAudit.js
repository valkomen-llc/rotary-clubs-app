/**
 * Hub Social — bitácora de auditoría.
 *
 * Registra acciones sensibles (conexión/desconexión de cuentas, publicaciones,
 * renovación de tokens, eventos de webhook, respuestas, etc.) en la tabla
 * `SocialAuditLog`. Es best-effort: NUNCA debe hacer fallar la operación
 * principal — si el insert falla, se loguea y se continúa.
 *
 * Uso:
 *   import { auditSocial } from '../lib/socialAudit.js';
 *   await auditSocial({ action: 'connect', clubId, userId, accountId, detail });
 */

import prisma from './prisma.js';

// Extrae la IP del request de forma tolerante a proxies (Vercel/Cloudflare).
export const clientIp = (req) => {
    if (!req) return null;
    const fwd = req.headers?.['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
    return req.ip || req.socket?.remoteAddress || null;
};

export const auditSocial = async ({
    action,
    clubId = null,
    userId = null,
    accountId = null,
    target = null,
    status = 'ok',
    detail = null,
    ip = null
} = {}) => {
    if (!action) return null;
    try {
        return await prisma.socialAuditLog.create({
            data: {
                action,
                clubId: clubId || null,
                userId: userId || null,
                accountId: accountId || null,
                target: target || null,
                status,
                detail: detail || undefined,
                ip: ip || null
            }
        });
    } catch (e) {
        // La auditoría jamás debe romper el flujo principal.
        console.warn('[socialAudit] no se pudo registrar', action, e.message);
        return null;
    }
};

// Listado paginado para el panel de auditoría del Hub Social.
export const listAudit = async ({ clubId = null, action = null, limit = 100 } = {}) => {
    const where = {};
    if (clubId) where.clubId = clubId;
    if (action) where.action = action;
    return prisma.socialAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 500)
    });
};
