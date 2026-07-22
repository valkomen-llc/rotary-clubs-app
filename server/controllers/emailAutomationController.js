import prisma from '../lib/prisma.js';
import EmailService from '../services/EmailService.js';

// Email Marketing F5 — Automatizaciones (secuencias por etiqueta, tipo FluentCRM).
console.log('[emailAutomationController] v4.572 — flujos con nodos: enviar correo, esperar, aplicar/quitar etiqueta, condición (gate)');

const resolveClubId = (req) => {
    if (req.user?.role === 'administrator') {
        return req.query?.clubId || req.body?.clubId || req.user?.clubId || null;
    }
    return req.user?.clubId || null;
};

const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// Límite de inscripciones nuevas por corrida de cron (acota carga en sitios grandes).
const MAX_ENROLL_PER_RUN = 500;
// Límite de pasos enviados por corrida (acota tiempo del serverless).
const MAX_STEPS_PER_RUN = 300;

const addDays = (date, days) => new Date(date.getTime() + (days || 0) * 24 * 60 * 60 * 1000);

const buildStepHtml = (step, contact, baseUrl) => {
    const unsubscribeUrl = `${baseUrl}/api/public/unsubscribe?cid=${contact.id}`;
    const footer = `
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;font-family:Arial,sans-serif">
            <p>Recibes este correo porque estás en la base de contactos de este sitio.</p>
            <p><a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline">Cancelar suscripción</a></p>
        </div>`;
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6">
        <div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff">
            ${step.content}
            ${footer}
        </div>
    </body></html>`;
};

// GET / — lista de automatizaciones con conteos
export const listAutomations = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
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
        const clubId = resolveClubId(req);
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

const ACTION_TYPES = ['email', 'wait', 'apply_tag', 'remove_tag', 'condition'];

// Normaliza los nodos del flujo. Un nodo 'email' requiere asunto+contenido; los nodos
// de acción (apply_tag/remove_tag/condition) requieren actionValue; 'wait' solo delayDays.
const normalizeSteps = (steps) => (Array.isArray(steps) ? steps : [])
    .map((s) => ({ ...s, actionType: ACTION_TYPES.includes(s?.actionType) ? s.actionType : 'email' }))
    .filter((s) => {
        if (s.actionType === 'email') return s.subject && s.content;
        if (s.actionType === 'wait') return true;
        return !!(s.actionValue && String(s.actionValue).trim()); // apply_tag/remove_tag/condition
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

// POST /
export const createAutomation = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio asociado' });
        const { name, triggerTag, steps } = req.body;
        if (!name || !triggerTag) return res.status(400).json({ error: 'Nombre y etiqueta disparadora son obligatorios' });
        const cleanSteps = normalizeSteps(steps);
        if (cleanSteps.length === 0) return res.status(400).json({ error: 'Agrega al menos un paso con asunto y contenido' });
        const automation = await prisma.emailAutomation.create({
            data: {
                clubId,
                name,
                triggerTag,
                status: 'inactive',
                createdById: req.user?.id || null,
                steps: { create: cleanSteps },
            },
            include: { steps: { orderBy: { order: 'asc' } } },
        });
        res.status(201).json(automation);
    } catch (error) {
        console.error('[emailAutomation] create:', error);
        res.status(500).json({ error: 'Error al crear la automatización' });
    }
};

// PUT /:id — reemplaza pasos
export const updateAutomation = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const existing = await prisma.emailAutomation.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.clubId !== clubId) {
            return res.status(404).json({ error: 'Automatización no encontrada' });
        }
        const { name, triggerTag, steps } = req.body;
        const cleanSteps = steps !== undefined ? normalizeSteps(steps) : null;
        if (cleanSteps && cleanSteps.length === 0) {
            return res.status(400).json({ error: 'Agrega al menos un paso con asunto y contenido' });
        }
        const automation = await prisma.$transaction(async (tx) => {
            if (cleanSteps) {
                await tx.emailAutomationStep.deleteMany({ where: { automationId: existing.id } });
            }
            return tx.emailAutomation.update({
                where: { id: existing.id },
                data: {
                    ...(name !== undefined && { name }),
                    ...(triggerTag !== undefined && { triggerTag }),
                    ...(cleanSteps && { steps: { create: cleanSteps } }),
                },
                include: { steps: { orderBy: { order: 'asc' } } },
            });
        });
        res.json(automation);
    } catch (error) {
        console.error('[emailAutomation] update:', error);
        res.status(500).json({ error: 'Error al actualizar la automatización' });
    }
};

// DELETE /:id
export const deleteAutomation = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
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
        try {
            if (type === 'email') {
                await EmailService.sendEmail({
                    clubId: automation.clubId,
                    to: contact.email.trim(),
                    subject: step.subject,
                    html: buildStepHtml(step, contact, baseUrl),
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
                // Nodo condición (gate): si no se cumple, el contacto sale del flujo.
                if (!evalCondition(step.actionValue, contact)) exit = true;
            }
            // 'wait' → no-op: la espera ya transcurrió antes de que este nodo venciera.
        } catch (error) {
            console.error(`[emailAutomation] acción '${type}' falló (enrollment ${enrollment.id}):`, error.message);
        }

        if (exit) {
            await prisma.emailAutomationEnrollment.update({ where: { id: enrollment.id }, data: { status: 'completed' } });
            continue;
        }

        const nextIndex = enrollment.currentStep + 1;
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
        const clubId = resolveClubId(req);
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
        const clubId = resolveClubId(req);
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
