import prisma from '../lib/prisma.js';
import EmailService from '../services/EmailService.js';
import { resolveClubId } from './crmController.js';
import { buildCrmScopes, renderWithDefaults, findUnknownVars } from '../lib/contentActivationVariables.js';

// Email Marketing F5 — Automatizaciones (secuencias por etiqueta, tipo FluentCRM).
console.log('[emailAutomationController] v4.573 — flujos con nodos + bifurcación (condición/fin de condición) + notificar equipo + webhook');


const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// Límite de inscripciones nuevas por corrida de cron (acota carga en sitios grandes).
const MAX_ENROLL_PER_RUN = 500;
// Límite de pasos enviados por corrida (acota tiempo del serverless).
const MAX_STEPS_PER_RUN = 300;

const addDays = (date, days) => new Date(date.getTime() + (days || 0) * 24 * 60 * 60 * 1000);

const buildStepHtml = (step, contact, baseUrl) => {
    const scopes = buildCrmScopes({ contact, club: {}, campaign: {} });
    const subj = renderWithDefaults(String(step.subject || ''), scopes).text;
    const body = renderWithDefaults(String(step.content || ''), scopes).text;
    const unsubscribeUrl = `${baseUrl}/api/public/unsubscribe?cid=${contact.id}`;
    const footer = `
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;font-family:Arial,sans-serif">
            <p>Recibes este correo porque estás en la base de contactos de este sitio.</p>
            <p><a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline">Cancelar suscripción</a></p>
        </div>`;
    return { html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6">
        <div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff">
            ${body}
            ${footer}
        </div>
    </body></html>`, subject: subj };
};

// GET / — lista de automatizaciones con conteos
export const listAutomations = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.json([]);
        const automations = await prisma.emailAutomation.findMany({
            where: { clubId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { steps: true, enrollments: true } },
            },
        });
        res.json(automations);
    } catch (error) {
        console.error('[emailAutomation] list:', error);
        res.status(500).json({ error: 'Error al cargar las automatizaciones' });
    }
};

// GET /:id — detalle con pasos
export const getAutomation = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const automation = await prisma.emailAutomation.findUnique({
            where: { id: req.params.id },
            include: { steps: { orderBy: { order: 'asc' } } },
        });
        if (!automation || automation.clubId !== clubId) {
            return res.status(404).json({ error: 'Automatización no encontrada' });
        }
        res.json(automation);
    } catch (error) {
        console.error('[emailAutomation] get:', error);
        res.status(500).json({ error: 'Error al cargar la automatización' });
    }
};

const ACTION_TYPES = ['email', 'wait', 'apply_tag', 'remove_tag', 'condition', 'end_condition', 'notify', 'webhook'];

// Normaliza los nodos del flujo. Un nodo 'email' requiere asunto+contenido; los nodos
// de etiqueta/condición/webhook requieren actionValue; 'wait'/'end_condition'/'notify' no.
const normalizeSteps = (steps) => (Array.isArray(steps) ? steps : [])
    .map((s) => ({ ...s, actionType: ACTION_TYPES.includes(s?.actionType) ? s.actionType : 'email' }))
    .filter((s) => {
        if (s.actionType === 'email') return s.subject && s.content;
        if (['wait', 'end_condition', 'notify'].includes(s.actionType)) return true;
        return !!(s.actionValue && String(s.actionValue).trim()); // apply_tag/remove_tag/condition/webhook
    })
    .map((s, i) => ({
        order: i,
        delayDays: Math.max(0, parseInt(s.delayDays, 10) || 0),
        actionType: s.actionType,
        actionValue: s.actionValue ? String(s.actionValue).trim() : null,
        subject: s.actionType === 'email' ? String(s.subject) : '',
        content: s.actionType === 'email' ? String(s.content) : '',
    }));

// Evalúa una condición de nodo contra el contacto. Formatos: "has_tag:X" | "not_tag:X".
const evalCondition = (spec, contact) => {
    const raw = String(spec || '');
    const [op, ...rest] = raw.split(':');
    const tag = rest.join(':').trim();
    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    if (op === 'has_tag') return tags.includes(tag);
    if (op === 'not_tag') return !tags.includes(tag);
    return true; // condición desconocida → no bloquea
};

// Etiqueta disparadora: espacio de nombres con `:` reservado para el sistema
// (`ca:…` = Campañas de Contenido, `crm:…` futuro). Sin espacios ni `{{}}`:
// así el cron la inscribe sin ambigüedad y sin Prisma nuevo (solo el campo
// `triggerTag` ya existente).
const TRIGGER_RE = /^[A-Za-z0-9:_-]{1,80}$/;
export const assertTriggerTag = (tag) => {
    const t = String(tag || '').trim();
    if (!t) { const e = new Error('Nombre y etiqueta disparadora son obligatorios'); e.status = 400; throw e; }
    if (!TRIGGER_RE.test(t)) {
        const e = new Error('La etiqueta disparadora solo admite letras, números, :, _ y - (sin espacios). Ej.: bienvenida, ca:feria-2027');
        e.status = 400;
        throw e;
    }
    return t;
};

/** Variables desconocidas en todos los pasos email (asunto+contenido). */
export const unknownVarsInSteps = (steps) => {
    const textos = (Array.isArray(steps) ? steps : [])
        .filter((s) => (s?.actionType || 'email') === 'email')
        .map((s) => `${s.subject || ''}\n${s.content || ''}`).join('\n');
    return findUnknownVars(textos);
};

// POST /
export const createAutomation = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio asociado' });
        const { name, triggerTag, steps } = req.body;
        if (!name) return res.status(400).json({ error: 'Nombre y etiqueta disparadora son obligatorios' });
        const tag = assertTriggerTag(triggerTag);
        const desconocidas = unknownVarsInSteps(steps);
        if (desconocidas.length) {
            return res.status(400).json({ error: `Variables desconocidas: ${desconocidas.map((v) => `{{${v}}}`).join(', ')}. Corrige los pasos antes de guardar.` });
        }
        const cleanSteps = normalizeSteps(steps);
        if (cleanSteps.length === 0) return res.status(400).json({ error: 'Agrega al menos un paso con asunto y contenido' });
        const automation = await prisma.emailAutomation.create({
            data: {
                clubId,
                name,
                triggerTag: tag,
                status: 'inactive',
                createdById: req.user?.id || null,
                steps: { create: cleanSteps },
            },
            include: { steps: { orderBy: { order: 'asc' } } },
        });
        res.status(201).json(automation);
    } catch (error) {
        if (error?.status === 400) return res.status(400).json({ error: error.message });
        console.error('[emailAutomation] create:', error);
        res.status(500).json({ error: 'Error al crear la automatización' });
    }
};

// PUT /:id — reemplaza pasos
export const updateAutomation = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const existing = await prisma.emailAutomation.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.clubId !== clubId) {
            return res.status(404).json({ error: 'Automatización no encontrada' });
        }
        const { name, triggerTag, steps } = req.body;
        const cleanSteps = steps !== undefined ? normalizeSteps(steps) : null;
        if (cleanSteps && cleanSteps.length === 0) {
            return res.status(400).json({ error: 'Agrega al menos un paso con asunto y contenido' });
        }
        if (steps !== undefined) {
            const desconocidas = unknownVarsInSteps(steps);
            if (desconocidas.length) {
                return res.status(400).json({ error: `Variables desconocidas: ${desconocidas.map((v) => `{{${v}}}`).join(', ')}. Corrige los pasos antes de guardar.` });
            }
        }
        let cleanTag;
        if (triggerTag !== undefined) cleanTag = assertTriggerTag(triggerTag);
        const automation = await prisma.$transaction(async (tx) => {
            if (cleanSteps) {
                await tx.emailAutomationStep.deleteMany({ where: { automationId: existing.id } });
            }
            return tx.emailAutomation.update({
                where: { id: existing.id },
                data: {
                    ...(name !== undefined && { name }),
                    ...(cleanTag !== undefined && { triggerTag: cleanTag }),
                    ...(cleanSteps && { steps: { create: cleanSteps } }),
                },
                include: { steps: { orderBy: { order: 'asc' } } },
            });
        });
        res.json(automation);
    } catch (error) {
        if (error?.status === 400) return res.status(400).json({ error: error.message });
        console.error('[emailAutomation] update:', error);
        res.status(500).json({ error: 'Error al actualizar la automatización' });
    }
};

// DELETE /:id
export const deleteAutomation = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const existing = await prisma.emailAutomation.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.clubId !== clubId) {
            return res.status(404).json({ error: 'Automatización no encontrada' });
        }
        await prisma.emailAutomation.delete({ where: { id: existing.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('[emailAutomation] delete:', error);
        res.status(500).json({ error: 'Error al eliminar la automatización' });
    }
};

// Inscribe contactos con la etiqueta disparadora que aún no están inscritos.
const enrollMatchingContacts = async (automation, steps, now) => {
    if (!steps.length) return 0;
    const contacts = await prisma.crmContact.findMany({
        where: {
            clubId: automation.clubId,
            status: 'active',
            archivedAt: null,
            optedOutAt: null,
            tags: { has: automation.triggerTag },
        },
        take: 2000,
    });
    const candidates = contacts.filter((c) => isValidEmail(c.email));
    if (candidates.length === 0) return 0;

    const existing = await prisma.emailAutomationEnrollment.findMany({
        where: { automationId: automation.id, contactId: { in: candidates.map((c) => c.id) } },
        select: { contactId: true },
    });
    const enrolledIds = new Set(existing.map((e) => e.contactId));
    const toEnroll = candidates.filter((c) => !enrolledIds.has(c.id)).slice(0, MAX_ENROLL_PER_RUN);
    if (toEnroll.length === 0) return 0;

    const firstDelay = steps[0].delayDays || 0;
    await prisma.emailAutomationEnrollment.createMany({
        data: toEnroll.map((c) => ({
            automationId: automation.id,
            clubId: automation.clubId,
            contactId: c.id,
            email: c.email.trim(),
            currentStep: 0,
            nextRunAt: addDays(now, firstDelay),
            status: 'active',
        })),
        skipDuplicates: true,
    });
    return toEnroll.length;
};

// Procesa todas las automatizaciones activas: inscribe nuevos contactos y envía pasos vencidos.
// Invocado por el cron.
export const processEmailAutomations = async ({ baseUrl, now = new Date() } = {}) => {
    const automations = await prisma.emailAutomation.findMany({
        where: { status: 'active' },
        include: { steps: { orderBy: { order: 'asc' } } },
    });
    let enrolled = 0;
    let sent = 0;

    for (const automation of automations) {
        const steps = automation.steps;
        if (!steps.length) continue;
        enrolled += await enrollMatchingContacts(automation, steps, now);
    }

    // Procesa inscripciones vencidas (acotado por corrida).
    const due = await prisma.emailAutomationEnrollment.findMany({
        where: { status: 'active', nextRunAt: { lte: now } },
        orderBy: { nextRunAt: 'asc' },
        take: MAX_STEPS_PER_RUN,
        include: { automation: { include: { steps: { orderBy: { order: 'asc' } } } } },
    });

    for (const enrollment of due) {
        const automation = enrollment.automation;
        if (!automation || automation.status !== 'active') continue;
        const steps = automation.steps;
        const step = steps[enrollment.currentStep];
        if (!step) {
            await prisma.emailAutomationEnrollment.update({ where: { id: enrollment.id }, data: { status: 'completed' } });
            continue;
        }

        // Verifica que el contacto siga válido y sin baja.
        const contact = await prisma.crmContact.findUnique({ where: { id: enrollment.contactId } });
        if (!contact || contact.optedOutAt || !isValidEmail(contact.email)) {
            await prisma.emailAutomationEnrollment.update({ where: { id: enrollment.id }, data: { status: 'cancelled' } });
            continue;
        }

        const type = step.actionType || 'email';
        let exit = false;
        let jumpTo = null;
        try {
            if (type === 'email') {
                const personal = buildStepHtml(step, contact, baseUrl);
                await EmailService.sendEmail({
                    clubId: automation.clubId,
                    to: contact.email.trim(),
                    subject: personal.subject,
                    html: personal.html,
                    userId: automation.createdById || null,
                });
                sent += 1;
            } else if (type === 'apply_tag' && step.actionValue) {
                if (!(contact.tags || []).includes(step.actionValue)) {
                    await prisma.crmContact.update({ where: { id: contact.id }, data: { tags: { push: step.actionValue } } });
                }
            } else if (type === 'remove_tag' && step.actionValue) {
                await prisma.crmContact.update({ where: { id: contact.id }, data: { tags: (contact.tags || []).filter((t) => t !== step.actionValue) } });
            } else if (type === 'condition') {
                const pass = evalCondition(step.actionValue, contact);
                // Busca el nodo 'end_condition' que cierra el bloque (un nivel, sin anidar).
                let endIdx = -1;
                for (let j = enrollment.currentStep + 1; j < steps.length; j++) {
                    const t = steps[j].actionType;
                    if (t === 'end_condition') { endIdx = j; break; }
                    if (t === 'condition') break; // no soportamos anidamiento
                }
                if (endIdx === -1) {
                    // Sin bloque de fin → gate (compatibilidad): si no se cumple, sale del flujo.
                    if (!pass) exit = true;
                } else if (!pass) {
                    jumpTo = endIdx; // salta el bloque "verdadero" hasta el fin de condición
                }
                // si se cumple: continúa al siguiente nodo (entra al bloque)
            } else if (type === 'notify') {
                // Notifica al equipo (dirección de actionValue, o los administradores del sitio).
                let recipients = step.actionValue && isValidEmail(step.actionValue) ? [step.actionValue.trim()] : null;
                if (!recipients) {
                    const admins = await prisma.user.findMany({
                        where: { clubId: automation.clubId, role: { in: ['administrator', 'club_admin', 'district_admin'] } },
                        select: { email: true },
                    });
                    recipients = admins.map((u) => u.email).filter(isValidEmail);
                }
                for (const to of recipients.slice(0, 5)) {
                    await EmailService.sendEmail({
                        clubId: automation.clubId, to,
                        subject: `Automatización "${automation.name}"`,
                        html: `<div style="font-family:Arial,sans-serif;padding:16px"><p>El contacto <strong>${contact.name || contact.email}</strong> (${contact.email}) avanzó en la automatización <strong>${automation.name}</strong>.</p></div>`,
                        userId: automation.createdById || null,
                    });
                }
            } else if (type === 'webhook' && step.actionValue && /^https?:\/\//i.test(step.actionValue)) {
                await fetch(step.actionValue, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'automation_node', automation: automation.name, contact: { id: contact.id, name: contact.name, email: contact.email, tags: contact.tags } }),
                }).catch(() => {});
            }
            // 'wait' / 'end_condition' → no-op.
        } catch (error) {
            console.error(`[emailAutomation] acción '${type}' falló (enrollment ${enrollment.id}):`, error.message);
        }

        if (exit) {
            await prisma.emailAutomationEnrollment.update({ where: { id: enrollment.id }, data: { status: 'completed' } });
            continue;
        }

        const nextIndex = jumpTo != null ? jumpTo : enrollment.currentStep + 1;
        const nextStep = steps[nextIndex];
        await prisma.emailAutomationEnrollment.update({
            where: { id: enrollment.id },
            data: nextStep
                ? { currentStep: nextIndex, nextRunAt: addDays(now, nextStep.delayDays || 0) }
                : { currentStep: nextIndex, status: 'completed' },
        });
    }

    return { automations: automations.length, enrolled, sent };
};

// POST /:id/activate
export const activateAutomation = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const automation = await prisma.emailAutomation.findUnique({
            where: { id: req.params.id },
            include: { steps: { orderBy: { order: 'asc' } } },
        });
        if (!automation || automation.clubId !== clubId) {
            return res.status(404).json({ error: 'Automatización no encontrada' });
        }
        if (!automation.steps.length) {
            return res.status(400).json({ error: 'La automatización necesita al menos un paso' });
        }
        const updated = await prisma.emailAutomation.update({ where: { id: automation.id }, data: { status: 'active' } });
        // Inscribe de inmediato a los contactos que ya tienen la etiqueta.
        const enrolled = await enrollMatchingContacts({ ...automation, status: 'active' }, automation.steps, new Date());
        res.json({ automation: updated, enrolled });
    } catch (error) {
        console.error('[emailAutomation] activate:', error);
        res.status(500).json({ error: 'Error al activar la automatización' });
    }
};

// POST /:id/deactivate
export const deactivateAutomation = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const automation = await prisma.emailAutomation.findUnique({ where: { id: req.params.id } });
        if (!automation || automation.clubId !== clubId) {
            return res.status(404).json({ error: 'Automatización no encontrada' });
        }
        const updated = await prisma.emailAutomation.update({ where: { id: automation.id }, data: { status: 'inactive' } });
        res.json({ automation: updated });
    } catch (error) {
        console.error('[emailAutomation] deactivate:', error);
        res.status(500).json({ error: 'Error al desactivar la automatización' });
    }
};

// GET /:id/preview — renderiza un paso con un contacto real o de prueba, sin enviar.
// Misma resolución que el cron: lo que se ve es lo que llega.
export const previewStep = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const automation = await prisma.emailAutomation.findUnique({
            where: { id: req.params.id },
            include: { steps: { orderBy: { order: 'asc' } } },
        });
        if (!automation || automation.clubId !== clubId) {
            return res.status(404).json({ error: 'Automatización no encontrada' });
        }
        const idx = Math.max(0, parseInt(req.query.step, 10) || 0);
        const step = (automation.steps || [])[idx];
        if (!step) return res.status(404).json({ error: 'Paso no encontrado' });
        if ((step.actionType || 'email') !== 'email') {
            return res.json({ actionType: step.actionType, actionValue: step.actionValue, note: 'Este paso no envía correo.' });
        }
        let contact = null;
        if (req.query.contactId) {
            contact = await prisma.crmContact.findFirst({ where: { id: String(req.query.contactId), clubId } });
            if (!contact) return res.status(404).json({ error: 'Contacto no encontrado en este sitio' });
        }
        const demo = contact || { id: 'preview', name: String(req.query.testName || 'Carolina'), email: 'prueba@ejemplo.org' };
        const personal = buildStepHtml(step, demo, `${req.protocol}://${req.get('host')}`);
        const scopes = buildCrmScopes({ contact: demo, club: {}, campaign: {} });
        const missing = [...new Set([
            ...renderWithDefaults(String(step.subject || ''), scopes).missing,
            ...renderWithDefaults(String(step.content || ''), scopes).missing,
        ])];
        res.json({
            subject: personal.subject, html: personal.html, missing,
            contact: contact ? { id: contact.id, name: contact.name, email: contact.email } : null,
            step: idx, actionType: step.actionType,
        });
    } catch (error) {
        console.error('[emailAutomation] preview:', error);
        res.status(500).json({ error: 'Error al generar la vista previa' });
    }
};

// POST /:id/test — envía UN paso a una dirección de prueba. No inscribe ni
// afecta métricas; la IA y los borradores usan esto para revisar sin enviar masivo.
export const testStep = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio asociado a esta prueba' });
        const automation = await prisma.emailAutomation.findUnique({
            where: { id: req.params.id },
            include: { steps: { orderBy: { order: 'asc' } } },
        });
        if (!automation || automation.clubId !== clubId) {
            return res.status(404).json({ error: 'Automatización no encontrada' });
        }
        const { to, step: stepIdx } = req.body;
        if (!isValidEmail(to)) return res.status(400).json({ error: 'La dirección de prueba no es válida' });
        const idx = Math.max(0, parseInt(stepIdx, 10) || 0);
        const step = (automation.steps || [])[idx];
        if (!step || (step.actionType || 'email') !== 'email') {
            return res.status(400).json({ error: 'El paso elegido no es un correo' });
        }
        const demo = { id: 'test', name: 'Contacto de prueba', email: String(to).trim() };
        const personal = buildStepHtml(step, demo, `${req.protocol}://${req.get('host')}`);
        const result = await EmailService.sendEmail({
            clubId, to: String(to).trim(),
            subject: `[PRUEBA] ${personal.subject}`,
            html: personal.html,
            userId: req.user?.id || null,
        });
        if (!result?.success) {
            return res.status(502).json({ error: result?.error || 'El proveedor no pudo enviar la prueba' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[emailAutomation] test:', error);
        res.status(500).json({ error: 'Error al enviar la prueba' });
    }
};

// GET /:id/metrics — inscripciones por estado + pasos email del flujo.
// Las métricas viven en las inscripciones; los pasos son solo definición.
export const getMetrics = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const automation = await prisma.emailAutomation.findUnique({
            where: { id: req.params.id },
            include: { steps: { orderBy: { order: 'asc' } } },
        });
        if (!automation || automation.clubId !== clubId) {
            return res.status(404).json({ error: 'Automatización no encontrada' });
        }
        const enrollments = await prisma.emailAutomationEnrollment.findMany({
            where: { automationId: automation.id },
            select: { status: true, currentStep: true },
        });
        const porEstado = {};
        const porPaso = {};
        for (const e of enrollments) {
            porEstado[e.status] = (porEstado[e.status] || 0) + 1;
            porPaso[e.currentStep] = (porPaso[e.currentStep] || 0) + 1;
        }
        const pasos = (automation.steps || []).map((s, i) => ({
            order: i, actionType: s.actionType, subject: s.subject,
            enPaso: porPaso[i] || 0,
        }));
        res.json({
            total: enrollments.length, porEstado, pasos,
            emailsEnFlujo: (automation.steps || []).filter((s) => (s.actionType || 'email') === 'email').length,
        });
    } catch (error) {
        console.error('[emailAutomation] metrics:', error);
        res.status(500).json({ error: 'Error al cargar las métricas' });
    }
};
