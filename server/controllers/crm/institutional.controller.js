/**
 * Controlador del CRM institucional.
 *
 * Expone la conciliación con el Directorio Oficial, la analítica y los
 * vínculos manuales. Ninguna ruta toca contactos ni perfiles: las escrituras
 * van a `CrmInstitutionalLink`, `CrmInstitutionalAudit` y
 * `CrmInstitutionalRun`.
 */

import { resolveClubId } from '../crmController.js';
import {
    getInstitutionalCatalog,
    getInstitutionalOverview,
    previewInstitutionalReconciliation,
    applyInstitutionalReconciliation,
    rollbackInstitutionalRun,
    listInstitutionalRuns,
    getInstitutionalContactDetail,
    getInstitutionalClubDetail,
    upsertInstitutionalLink,
    updateInstitutionalLink,
} from '../../lib/institutionalCrm.js';

console.log('[institutionalController] v4.1234.0 cargado — CRM institucional: conciliación con el Directorio Oficial, ficha 360° y segmentos');

function actorOf(req) {
    return req.user?.name || req.user?.email || req.user?.id || 'sistema';
}

function fail(res, error, status = 400) {
    const message = error?.message || String(error);
    if (/no encontrad|no pertenece|no existe/i.test(message)) {
        return res.status(404).json({ error: message });
    }
    if (/falta|hace falta|ya existe|no se puede|sólo se puede|solo se puede/i.test(message)) {
        return res.status(400).json({ error: message });
    }
    console.error('Error en CRM institucional:', error);
    return res.status(status).json({ error: message });
}

export async function getCatalog(req, res) {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });
        res.json({ ...getInstitutionalCatalog(), clubId });
    } catch (error) {
        fail(res, error, 500);
    }
}

export async function getOverview(req, res) {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });
        res.json(await getInstitutionalOverview(clubId));
    } catch (error) {
        fail(res, error, 500);
    }
}

export async function previewReconciliation(req, res) {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });

        const body = req.body || {};
        const contactIds = Array.isArray(body.contactIds)
            ? body.contactIds.map(String).filter(Boolean)
            : null;

        res.json(await previewInstitutionalReconciliation(clubId, {
            limit: body.limit,
            contactIds,
        }));
    } catch (error) {
        fail(res, error, 500);
    }
}

export async function applyReconciliation(req, res) {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });

        const body = req.body || {};
        if (body.confirm !== true && body.confirmText !== 'CONCILIAR') {
            return res.status(400).json({
                error: 'La conciliación exige confirmación explícita. Envía confirm=true o confirmText="CONCILIAR".',
            });
        }

        const contactIds = Array.isArray(body.contactIds)
            ? body.contactIds.map(String).filter(Boolean)
            : null;

        res.json(await applyInstitutionalReconciliation(clubId, {
            actor: actorOf(req),
            confirmAmbiguous: body.confirmAmbiguous === true,
            contactIds,
            force: body.force === true,
        }));
    } catch (error) {
        fail(res, error, 500);
    }
}

export async function getRuns(req, res) {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });
        const runs = await listInstitutionalRuns(clubId, req.query.limit);
        res.json({ runs });
    } catch (error) {
        fail(res, error, 500);
    }
}

export async function rollbackRun(req, res) {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });
        res.json(await rollbackInstitutionalRun(clubId, req.params.runId, actorOf(req)));
    } catch (error) {
        fail(res, error);
    }
}

export async function getContactDetail(req, res) {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });
        const detail = await getInstitutionalContactDetail(clubId, req.params.contactId);
        if (!detail) return res.status(404).json({ error: 'Contacto no encontrado.' });
        res.json(detail);
    } catch (error) {
        fail(res, error, 500);
    }
}

export async function getClubDetail(req, res) {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });
        const detail = await getInstitutionalClubDetail(clubId, req.params.profileId);
        if (!detail) return res.status(404).json({ error: 'Perfil del Directorio no encontrado.' });
        res.json(detail);
    } catch (error) {
        fail(res, error, 500);
    }
}

export async function createLink(req, res) {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });
        const link = await upsertInstitutionalLink(clubId, {
            ...(req.body || {}),
            contactId: req.body?.contactId || req.params.contactId,
        }, actorOf(req));
        res.status(201).json(link);
    } catch (error) {
        fail(res, error);
    }
}

export async function patchLink(req, res) {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });
        res.json(await updateInstitutionalLink(clubId, req.params.linkId, req.body || {}, actorOf(req)));
    } catch (error) {
        fail(res, error);
    }
}

export default {
    getCatalog,
    getOverview,
    previewReconciliation,
    applyReconciliation,
    getRuns,
    rollbackRun,
    getContactDetail,
    getClubDetail,
    createLink,
    patchLink,
};
