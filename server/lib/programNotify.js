// ════════════════════════════════════════════════════════════════════
// Programas — notificaciones (punto de extensión) — v4.1280.0
//
// Reutiliza `EmailService.sendPlatformEmail` (Resend o SMTP de la
// plataforma). Si no hay proveedor configurado, el envío NO se simula: se
// registra en la auditoría como `notification:skipped` con el motivo, y la
// función devuelve `{ sent: false }`. Nunca lanza y nunca bloquea la acción
// que la disparó (se llama sin `await` desde el controlador).
//
// Cada aviso enlaza al PANEL y evita datos sensibles: para una solicitud
// pública va la referencia y el tipo, nunca el nombre ni el contacto de la
// persona. WhatsApp y las campañas quedan como integración futura.
// ════════════════════════════════════════════════════════════════════
import { audit } from './programStore.js';
import { PUBLIC_REQUEST_TYPES, editorialLabel } from './programSpec.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uniq = (xs) => Array.from(new Set(xs.filter(Boolean)));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const panelUrl = (host, path) => {
    const base = process.env.PLATFORM_PUBLIC_URL || (host ? `https://${host}` : '');
    return `${base}${path}`;
};

const shell = ({ title, lines = [], cta }) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
  <h2 style="color:#17458f;margin:0 0 12px">${esc(title)}</h2>
  ${lines.map(l => `<p style="margin:0 0 10px;line-height:1.5">${esc(l)}</p>`).join('')}
  ${cta ? `<p style="margin:20px 0"><a href="${esc(cta.href)}" style="background:#17458f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${esc(cta.label)}</a></p>` : ''}
  <p style="font-size:12px;color:#6b7280;margin-top:24px">Este aviso lo envía la plataforma. No incluye datos personales de terceros: consúltalos en el panel con tu sesión.</p>
</div>`;

async function deliver({ programId, event, to, subject, html, text }) {
    // Apagado explícito (pruebas, entornos sin correo): se registra, no se simula.
    if (process.env.PROGRAMAS_NOTIFY === 'off') {
        await audit({ programId, entityType: 'notification', action: 'notification:skipped', actor: { name: 'Sistema' }, detail: { event, reason: 'desactivado' } });
        return { sent: false, reason: 'desactivado' };
    }
    const recipients = uniq(to.map(e => String(e || '').toLowerCase())).filter(e => EMAIL_RE.test(e));
    if (!recipients.length) {
        await audit({ programId, entityType: 'notification', action: 'notification:skipped', actor: { name: 'Sistema' }, detail: { event, reason: 'sin_destinatarios' } });
        return { sent: false, reason: 'sin_destinatarios' };
    }
    try {
        const { EmailService } = await import('../services/EmailService.js');
        const r = await EmailService.sendPlatformEmail({ to: recipients, subject, html, text });
        await audit({ programId, entityType: 'notification', action: r?.success ? 'notification:sent' : 'notification:skipped', actor: { name: 'Sistema' }, detail: { event, recipients: recipients.length, reason: r?.success ? null : (r?.error || 'proveedor_no_configurado') } });
        return { sent: Boolean(r?.success), reason: r?.success ? null : (r?.error || 'proveedor_no_configurado') };
    } catch (e) {
        await audit({ programId, entityType: 'notification', action: 'notification:skipped', actor: { name: 'Sistema' }, detail: { event, reason: e?.message?.slice(0, 200) } });
        return { sent: false, reason: e?.message };
    }
}

/** Correos del equipo del programa (coordinador, comunicaciones, institucional) + responsables con rol. */
export const teamEmails = (program, members = [], roles = ['coordinador', 'comunicaciones']) => {
    const g = program?.governance || {};
    const out = [g.institutionalEmail, g.coordinator?.email, roles.includes('comunicaciones') ? g.communications?.email : null];
    for (const m of members) if (m.active !== false && (m.roles || []).some(r => roles.includes(r))) out.push(m.email);
    return uniq(out);
};

/** Nuevo envío / reenvío de una solicitud de cambio → equipo (y revisor médico si aplica). */
export async function notifyChangeSubmitted({ program, request, members, host }) {
    const to = teamEmails(program, members, request.requiresMedicalReview ? ['coordinador', 'comunicaciones', 'revisor_medico'] : ['coordinador', 'comunicaciones']);
    if (request.requiresMedicalReview) to.push(program?.governance?.medicalReviewer?.email);
    const href = panelUrl(host, `/admin/programas/${program.id}?tab=revision&ref=${encodeURIComponent(request.publicRef)}`);
    return deliver({
        programId: program.id, event: 'change_submitted', to,
        subject: `[${program.name}] Nueva solicitud de contenido ${request.publicRef}`,
        html: shell({ title: 'Nueva solicitud de contenido', lines: [`Programa: ${program.name}.`, `Referencia ${request.publicRef}: «${request.title}» (${request.kind}, ${request.operation}).`, request.requiresMedicalReview ? 'Requiere aprobación del revisor médico.' : 'No requiere revisión médica.'], cta: { href, label: 'Abrir en el panel' } }),
        text: `Nueva solicitud ${request.publicRef} en ${program.name}: ${request.title}. ${href}`,
    });
}

/** Ajustes solicitados / aprobación / publicación → quien envió. */
export async function notifyChangeStatus({ program, request, host, to }) {
    const label = editorialLabel(request.status);
    const href = panelUrl(host, `/admin/programas/${program.id}?tab=gestion&ref=${encodeURIComponent(request.publicRef)}`);
    const lines = [`Programa: ${program.name}.`, `Tu solicitud ${request.publicRef} («${request.title}») pasó a: ${label}.`];
    if (request.statusReason) lines.push(`Observación: ${request.statusReason}`);
    return deliver({
        programId: program.id, event: `change_${request.status}`, to: [to, request.responsibleEmail],
        subject: `[${program.name}] Solicitud ${request.publicRef}: ${label}`,
        html: shell({ title: `Solicitud ${label.toLowerCase()}`, lines, cta: { href, label: 'Ver en el panel' } }),
        text: `${lines.join(' ')} ${href}`,
    });
}

/** Nueva solicitud pública → responsable asignado (o el equipo). SIN datos de la persona. */
export async function notifyPublicRequest({ program, request, members, host, routing = {} }) {
    const to = uniq([...(routing.notifyEmails || []), ...(request.assigneeUserId ? [] : teamEmails(program, members, ['coordinador', 'gestor_solicitudes'])), program?.governance?.requestsManager?.email, program?.governance?.requestsBackup?.email]);
    if (request.assigneeUserId || request.assigneeName) {
        for (const m of members) if (m.userId && m.userId === request.assigneeUserId) to.push(m.email);
    }
    const typeLabel = PUBLIC_REQUEST_TYPES[request.type]?.label || request.type;
    const href = panelUrl(host, `/admin/programas/${program.id}?tab=solicitudes&ref=${encodeURIComponent(request.publicRef)}`);
    return deliver({
        programId: program.id, event: 'public_request', to,
        subject: `[${program.name}] Nueva solicitud pública (${typeLabel}) ${request.publicRef}`,
        html: shell({ title: 'Nueva solicitud pública', lines: [`Programa: ${program.name}.`, `Tipo: ${typeLabel}. Referencia: ${request.publicRef}.`, request.originClubName ? `Sitio de origen: ${request.originClubName}.` : 'Sitio de origen: el del distrito.', 'Los datos de contacto sólo se ven en el panel.'], cta: { href, label: 'Atender en el panel' } }),
        text: `Nueva solicitud ${typeLabel} ${request.publicRef} en ${program.name}. ${href}`,
    });
}

/** Asignación de una solicitud → responsable asignado. */
export async function notifyAssignment({ program, request, members, host }) {
    const to = members.filter(m => m.userId && m.userId === request.assigneeUserId).map(m => m.email);
    const href = panelUrl(host, `/admin/programas/${program.id}?tab=solicitudes&ref=${encodeURIComponent(request.publicRef)}`);
    return deliver({
        programId: program.id, event: 'request_assigned', to,
        subject: `[${program.name}] Se te asignó la solicitud ${request.publicRef}`,
        html: shell({ title: 'Solicitud asignada', lines: [`Programa: ${program.name}.`, `Referencia ${request.publicRef} (${PUBLIC_REQUEST_TYPES[request.type]?.label || request.type}).`], cta: { href, label: 'Abrir la solicitud' } }),
        text: `Se te asignó la solicitud ${request.publicRef} en ${program.name}. ${href}`,
    });
}

export default { notifyChangeSubmitted, notifyChangeStatus, notifyPublicRequest, notifyAssignment, teamEmails };
