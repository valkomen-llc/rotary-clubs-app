// ════════════════════════════════════════════════════════════════════
// Cursos y capacitaciones — avisos por correo — v4.1302.0
//
// Reutiliza `EmailService.sendPlatformEmail` (Resend o SMTP de la
// plataforma). Si no hay proveedor, el envío NO se simula: queda en
// `LearningNotification` con `sent=false` y el motivo. Nunca lanza y nunca
// bloquea la acción que lo disparó (se llama sin `await`).
//
// Cada aviso se reclama ANTES con una `dedupeKey` (curso + cambio): un
// reintento o un doble clic no manda dos correos. Enlaza al panel o a la
// ficha pública y no incluye datos personales de terceros.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { claimNotification, finishNotification } from './learningStore.js';
import { COURSE_STATES } from './learningSpec.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const uniq = (xs) => Array.from(new Set(xs.filter(Boolean).map(e => String(e).trim().toLowerCase()))).filter(e => EMAIL_RE.test(e));

const baseUrl = (host) => process.env.PLATFORM_PUBLIC_URL || (host ? `https://${host}` : '');

const shell = ({ title, lines = [], cta }) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
  <h2 style="color:#17458f;margin:0 0 12px">${esc(title)}</h2>
  ${lines.map(l => `<p style="margin:0 0 10px;line-height:1.5">${esc(l)}</p>`).join('')}
  ${cta ? `<p style="margin:20px 0"><a href="${esc(cta.href)}" style="background:#17458f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${esc(cta.label)}</a></p>` : ''}
  <p style="font-size:12px;color:#6b7280;margin-top:24px">Este aviso lo envía la plataforma del Distrito. Cursos y capacitaciones · Rotary en Acción.</p>
</div>`;

async function deliver({ entityType, entityId, dedupeKey, to, subject, lines, cta }) {
    const recipients = uniq(to);
    const id = await claimNotification(entityType, entityId, dedupeKey, { recipients, subject }).catch(() => null);
    if (!id) return { sent: false, reason: 'duplicado' };
    if (process.env.LEARNING_NOTIFY === 'off') { await finishNotification(id, false, 'desactivado'); return { sent: false, reason: 'desactivado' }; }
    if (!recipients.length) { await finishNotification(id, false, 'sin_destinatarios'); return { sent: false, reason: 'sin_destinatarios' }; }
    try {
        const { EmailService } = await import('../services/EmailService.js');
        const html = shell({ title: subject, lines, cta });
        const r = await EmailService.sendPlatformEmail({ to: recipients, subject, html, text: lines.join('\n') });
        await finishNotification(id, Boolean(r?.success), r?.success ? null : (r?.error || 'proveedor_no_configurado'));
        return { sent: Boolean(r?.success) };
    } catch (e) {
        await finishNotification(id, false, String(e?.message || e).slice(0, 200)).catch(() => {});
        return { sent: false, reason: e?.message };
    }
}

/** Correos del club dueño del curso: quien lo creó + administradores del sitio. */
export const ownerEmails = async (course) => {
    const out = [];
    try {
        if (course.createdById) {
            const { rows } = await db.query(`SELECT email FROM "User" WHERE id=$1`, [course.createdById]);
            if (rows[0]?.email) out.push(rows[0].email);
        }
        if (course.siteId) {
            const { rows } = await db.query(`SELECT email FROM "User" WHERE "clubId"=$1 AND role IN ('club_admin','district_admin','administrator') LIMIT 10`, [course.siteId]);
            for (const r of rows) out.push(r.email);
        }
    } catch { /* sin destinatarios: se registra como tal */ }
    return uniq(out);
};

/** Correos del comité: configurados + administradores del sitio distrital. */
export const reviewerEmails = async (course, config) => {
    const out = [...(config?.notifyEmails || [])];
    try {
        if (course.districtNumber) {
            const { rows } = await db.query(
                `SELECT u.email FROM "User" u JOIN "Club" c ON c.id=u."clubId" WHERE c.type='district' AND c.district=$1 AND u.role IN ('district_admin','administrator','superadmin') LIMIT 10`,
                [String(course.districtNumber)]);
            for (const r of rows) out.push(r.email);
        }
    } catch { /* idem */ }
    return uniq(out);
};

export const notifyCourseSubmitted = async ({ course, config, host }) => deliver({
    entityType: 'course', entityId: course.id, dedupeKey: `submitted:${course.submittedAt || Date.now()}`,
    to: await reviewerEmails(course, config),
    subject: `Curso enviado a revisión: ${course.title}`,
    lines: [`El club ${course.ownerClubName || 'responsable'} envió el curso «${course.title}» para revisión.`, course.projectRef ? `Proyecto relacionado: ${course.projectRef}.` : 'Sin proyecto relacionado.'],
    cta: { href: `${baseUrl(host)}/admin/gestion-educativa?curso=${encodeURIComponent(course.id)}`, label: 'Revisar en Gestión educativa' },
});

export const notifyCourseDecision = async ({ course, to, note, host }) => {
    const label = COURSE_STATES[to]?.label || to;
    const lines = [`El curso «${course.title}» cambió a: ${label}.`];
    if (note) lines.push(`Observaciones del comité: ${note}`);
    if (to === 'published') lines.push('Ya aparece en la biblioteca pública del Distrito según su modalidad de acceso.');
    if (to === 'changes_requested') lines.push('Puedes corregirlo desde «Mis cursos y capacitaciones» y volver a enviarlo.');
    return deliver({
        entityType: 'course', entityId: course.id, dedupeKey: `status:${to}:${course.reviewedAt || course.publishedAt || Date.now()}`,
        to: await ownerEmails(course),
        subject: `Tu curso «${course.title}»: ${label}`,
        lines,
        cta: to === 'published'
            ? { href: `${baseUrl(host)}/cursos/${encodeURIComponent(course.slug)}`, label: 'Ver el curso publicado' }
            : { href: `${baseUrl(host)}/mis-cursos/cursos/${encodeURIComponent(course.id)}`, label: 'Abrir en Mis cursos' },
    });
};

export default { notifyCourseSubmitted, notifyCourseDecision, ownerEmails, reviewerEmails };
