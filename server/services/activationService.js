import prisma from '../lib/prisma.js';
import { routeToModel } from '../lib/ai-router.js';
import WhatsAppService from './WhatsAppService.js';
import EmailService from './EmailService.js';

// ──────────────────────────────────────────────────────────────────────────
// Pipeline de Activación de Sitios
//
// Detección DETERMINÍSTICA (sin falsos positivos): cada fase tiene un `check`
// contra datos concretos del club + sus Settings del onboarding. Cuando una
// fase pasa de pending → completed, un agente redacta el mensaje (IA) y se
// notifica al representante del sitio por WhatsApp + Email (idempotente).
//
// IMPORTANTE: al sembrar las fases por primera vez se hace BACKFILL silencioso
// de las que ya cumplían (status=completed, notifiedAt=now) para NO disparar
// una avalancha de notificaciones de fases ya superadas en clubes existentes.
// ──────────────────────────────────────────────────────────────────────────

const parseJson = (v) => {
    try { return typeof v === 'string' ? JSON.parse(v) : (v || {}); } catch { return {}; }
};

const hasAnySocial = (s) => {
    const sl = parseJson(s.social_links);
    if (sl && typeof sl === 'object' && Object.values(sl).some(v => typeof v === 'string' && v.trim())) return true;
    const custom = parseJson(s.custom_social_links);
    if (Array.isArray(custom) && custom.length) return true;
    return ['social_facebook', 'social_instagram', 'social_twitter', 'social_youtube', 'social_linkedin', 'social_tiktok']
        .some(k => s[k] && String(s[k]).trim());
};

const hasAnyImage = (s) => {
    const si = parseJson(s.site_images);
    if (!si || typeof si !== 'object') return false;
    return Object.values(si).some(v => {
        if (typeof v === 'string') return !!v.trim();
        if (Array.isArray(v)) return v.length > 0;
        return false;
    });
};

// Fases en orden. `criteria` se usa tanto para que el agente redacte el mensaje
// como para documentar el proceso en la base de conocimiento (playbook).
export const ACTIVATION_PHASES = [
    {
        key: 'welcome', number: 0, label: 'Bienvenida',
        criteria: 'El sitio del club fue creado en la plataforma.',
        check: (c) => !!c.name
    },
    {
        key: 'info', number: 1, label: 'Información del Club',
        criteria: 'Nombre, ubicación (ciudad o país) y al menos un dato de contacto (email o teléfono).',
        check: (c, s) => !!c.name && (!!c.city || !!c.country) &&
            (!!s.contact_email || !!s.contact_phone || !!c.billingContactEmail || !!c.billingContactPhone)
    },
    {
        key: 'branding', number: 2, label: 'Identidad de Marca',
        criteria: 'Logo cargado y color primario definido.',
        check: (c, s) => !!c.logo && !!s.color_primary
    },
    {
        key: 'social', number: 3, label: 'Redes Sociales',
        criteria: 'Al menos una red social configurada.',
        check: (c, s) => hasAnySocial(s)
    },
    {
        key: 'modules', number: 4, label: 'Módulos del Sitio',
        criteria: 'Módulos y número de miembros configurados.',
        check: (c, s) => s.member_count != null || Object.keys(s).some(k => k.startsWith('module_'))
    },
    {
        key: 'images', number: 5, label: 'Imágenes del Sitio',
        criteria: 'Al menos una imagen institucional cargada.',
        check: (c, s) => hasAnyImage(s)
    },
    {
        key: 'complete', number: 6, label: 'Sitio Activado',
        criteria: 'Onboarding finalizado: el sitio quedó activado y publicado.',
        check: (c, s) => s.onboarding_completed === 'true'
    },
];

async function loadClubContext(clubId) {
    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) return null;
    const rows = await prisma.setting.findMany({ where: { clubId } });
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return { club, settings };
}

// Siembra las fases del club. BACKFILL silencioso de las ya cumplidas.
export async function ensurePhases(clubId) {
    const existing = await prisma.siteActivationPhase.findMany({ where: { clubId } });
    if (existing.length >= ACTIVATION_PHASES.length) return existing;

    const ctx = await loadClubContext(clubId);
    const club = ctx?.club;
    const settings = ctx?.settings || {};
    const existingKeys = new Set(existing.map(e => e.phaseKey));

    for (const p of ACTIVATION_PHASES) {
        if (existingKeys.has(p.key)) continue;
        let passes = false;
        try { passes = club ? !!p.check(club, settings) : false; } catch { passes = false; }
        await prisma.siteActivationPhase.create({
            data: {
                clubId,
                phaseKey: p.key,
                phaseNumber: p.number,
                label: p.label,
                status: passes ? 'completed' : 'pending',
                completedAt: passes ? new Date() : null,
                notifiedAt: passes ? new Date() : null, // baseline: no notificar lo ya superado
            }
        });
    }
    return prisma.siteActivationPhase.findMany({ where: { clubId } });
}

export async function getPhases(clubId) {
    await ensurePhases(clubId);
    return prisma.siteActivationPhase.findMany({ where: { clubId }, orderBy: { phaseNumber: 'asc' } });
}

// Construye el HTML del email de notificación de fase.
function buildEmailHtml(club, def, body, isFinal) {
    return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 15px; overflow: hidden;">
        <div style="background: ${isFinal ? '#0a7d32' : '#013388'}; color: white; padding: 28px; text-align: center;">
            <h2 style="margin:0;">Rotary ClubPlatform</h2>
            <p style="margin:6px 0 0; opacity:.85; font-size:13px;">Activación de tu sitio web</p>
        </div>
        <div style="padding: 28px; color: #333; line-height: 1.6;">
            <h3 style="color: ${isFinal ? '#0a7d32' : '#013388'};">${isFinal ? '🎉 ¡Tu sitio ya está activo!' : `✅ Fase completada: ${def.label}`}</h3>
            <p>${String(body).replace(/\n/g, '<br>')}</p>
            <p style="font-size: 12px; color: #999; margin-top: 30px;">Mensaje automático del Asistente de Activación de Valkomen LLC.</p>
        </div>
    </div>`;
}

// Genera el mensaje (IA con fallback) y notifica al representante por WhatsApp + Email.
async function notifyPhaseCompleted(club, def) {
    const result = { whatsapp: false, email: false };
    const repPhone = club.billingContactPhone;
    const repEmail = club.billingContactEmail;
    if (!repPhone && !repEmail) return { ...result, skipped: 'sin_contacto' };

    const isFinal = def.key === 'complete';
    let waMessage = '';
    let emailBody = '';

    try {
        const systemPrompt = `Eres el "Asistente de Activación" de Rotary ClubPlatform. Rediges mensajes cálidos, breves y profesionales para informar al representante de un club rotario que se completó una fase de la puesta en marcha de su sitio web. Tono institucional y motivador, en español. Usa emojis profesionales con moderación. NO uses comillas. NO inventes datos.`;
        const userPrompt = `Club: ${club.name}
Fase completada: ${def.label}
Qué significa: ${def.criteria}
${isFinal ? 'Es la FASE FINAL: el sitio quedó activado y publicado. Felicítalos.' : 'Es una fase intermedia: anímalos a continuar con el siguiente paso.'}
Estructura de respuesta (respeta las etiquetas):
WHATSAPP: [mensaje corto aquí]
EMAIL: [párrafo aquí]`;
        const aiOutput = await routeToModel('gemini-2.5-flash', systemPrompt, userPrompt);
        const waMatch = aiOutput.match(/WHATSAPP:\s*([\s\S]*?)(?=EMAIL:|$)/i);
        const emailMatch = aiOutput.match(/EMAIL:\s*([\s\S]*)/i);
        waMessage = waMatch ? waMatch[1].trim() : '';
        emailBody = emailMatch ? emailMatch[1].trim() : '';
    } catch (e) {
        console.warn('[activation] IA no disponible, usando plantilla:', e.message);
    }

    if (!waMessage) {
        waMessage = `✅ ${club.name}: completaste la fase "${def.label}" de la activación de tu sitio web.${isFinal ? ' ¡Tu sitio ya está activo! 🎉' : ' Sigamos con el siguiente paso.'}`;
    }
    if (!emailBody) {
        emailBody = `Te confirmamos que se completó la fase "${def.label}" en la activación del sitio web de ${club.name}.${isFinal ? ' ¡Felicitaciones, tu sitio ya está activo y publicado!' : ' Continúa con el siguiente paso para avanzar en la puesta en marcha.'}`;
    }

    if (repPhone) {
        try {
            const wa = await WhatsAppService.sendPlatformMessage({ to: repPhone, message: waMessage });
            result.whatsapp = !!wa?.success;
            if (wa?.success) {
                await EmailService.logCommunication({
                    clubId: club.id, type: 'whatsapp', recipient: repPhone,
                    content: waMessage, status: 'sent', subject: `Activación: ${def.label}`
                });
            }
        } catch (e) { console.warn('[activation] WhatsApp falló:', e.message); }
    }

    if (repEmail) {
        try {
            const subject = isFinal
                ? `🎉 ¡Tu sitio web está activo! - ${club.name}`
                : `✅ Fase completada: ${def.label} - ${club.name}`;
            const em = await EmailService.sendPlatformEmail({
                to: repEmail, subject, html: buildEmailHtml(club, def, emailBody, isFinal)
            });
            result.email = !!em?.success;
        } catch (e) { console.warn('[activation] Email falló:', e.message); }
    }

    return result;
}

// Evalúa un club: avanza las fases cumplidas y notifica las nuevas.
export async function evaluateClubActivation(clubId, { notify = true } = {}) {
    const ctx = await loadClubContext(clubId);
    if (!ctx) return { error: 'club_no_encontrado' };
    const { club, settings } = ctx;

    await ensurePhases(clubId);
    const phases = await prisma.siteActivationPhase.findMany({ where: { clubId }, orderBy: { phaseNumber: 'asc' } });
    const byKey = Object.fromEntries(phases.map(p => [p.phaseKey, p]));

    const newlyCompleted = [];
    for (const def of ACTIVATION_PHASES) {
        const row = byKey[def.key];
        if (!row || row.status === 'completed') continue;
        let passes = false;
        try { passes = !!def.check(club, settings); } catch { passes = false; }
        if (passes) {
            const updated = await prisma.siteActivationPhase.update({
                where: { id: row.id },
                data: { status: 'completed', completedAt: new Date() }
            });
            newlyCompleted.push({ def, row: updated });
        }
    }

    const notifications = [];
    if (notify) {
        for (const item of newlyCompleted) {
            if (item.row.notifiedAt) continue;
            const sent = await notifyPhaseCompleted(club, item.def);
            await prisma.siteActivationPhase.update({ where: { id: item.row.id }, data: { notifiedAt: new Date() } });
            notifications.push({ phase: item.def.key, label: item.def.label, ...sent });
        }
    }

    const all = await prisma.siteActivationPhase.findMany({ where: { clubId }, orderBy: { phaseNumber: 'asc' } });
    return {
        clubId,
        clubName: club.name,
        completed: all.filter(p => p.status === 'completed').length,
        total: all.length,
        newlyCompleted: newlyCompleted.map(i => i.def.key),
        notifications,
        phases: all,
    };
}

// Recorre todos los clubes y avanza/notifica los que correspondan (para el cron).
export async function processAllActivations() {
    await ensureActivationPlaybookKnowledge().catch(() => {});
    const clubs = await prisma.club.findMany({ where: { type: 'club' }, select: { id: true } });
    let advanced = 0;
    let notificationsSent = 0;
    for (const c of clubs) {
        try {
            const r = await evaluateClubActivation(c.id, { notify: true });
            if (r.newlyCompleted?.length) advanced++;
            notificationsSent += r.notifications?.length || 0;
        } catch (e) {
            console.warn(`[activation] club ${c.id} falló:`, e.message);
        }
    }
    return { clubsEvaluated: clubs.length, clubsAdvanced: advanced, notificationsSent };
}

// Documenta el proceso de activación en la base de conocimiento (global),
// para que los agentes puedan consultarlo. Idempotente por título.
export async function ensureActivationPlaybookKnowledge() {
    const title = 'Playbook de Activación de Sitios';
    const content = [
        'Proceso de activación de un sitio de club, fase por fase. Cada fase se considera completada cuando se cumple su criterio, y al completarse se notifica al representante del sitio por WhatsApp y correo.',
        '',
        ...ACTIVATION_PHASES.map(p => `Fase ${p.number} — ${p.label}: ${p.criteria}`),
    ].join('\n');

    const existing = await prisma.knowledgeSource.findFirst({ where: { title, clubId: null } });
    if (existing) {
        if (existing.content !== content) {
            await prisma.knowledgeSource.update({ where: { id: existing.id }, data: { content } });
        }
        return existing.id;
    }
    const created = await prisma.knowledgeSource.create({
        data: { title, content, type: 'process_guide' }
    });
    return created.id;
}
