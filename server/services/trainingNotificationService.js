// Confirmaciones y recordatorios del Calendario de Capacitaciones.
// Envía por correo (siempre) y por WhatsApp si el sitio tiene config.
// Nunca lanza: un fallo de notificación no debe tumbar la reserva.
import EmailService from './EmailService.js';
import WhatsAppService from './WhatsAppService.js';
import { buildICS, googleCalendarUrl, outlookCalendarUrl } from '../lib/ics.js';
import { formatZoned } from '../lib/timezone.js';

const BRAND = 'Club Platform';

function fmt(appt) {
  const tz = appt.timezone || 'America/Bogota';
  const dateLabel = new Intl.DateTimeFormat('es', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(appt.startAt));
  const timeLabel = `${formatZoned(new Date(appt.startAt), tz)} – ${formatZoned(new Date(appt.endAt), tz)}`;
  return { tz, dateLabel, timeLabel };
}

function icsFor(appt, title) {
  const meetingLine = appt.meetingUrl ? `Enlace: ${appt.meetingUrl}` : 'Enlace: por confirmar';
  return buildICS({
    id: appt.id,
    startAt: appt.startAt,
    endAt: appt.endAt,
    title,
    description: `${appt.appointmentType?.name || 'Sesión de soporte'}\n${meetingLine}`,
    location: appt.meetingUrl || 'Videollamada',
    organizerEmail: 'soporte@clubplatform.org',
    attendeeEmail: appt.requesterEmail,
    attendeeName: appt.requesterName,
  });
}

function baseCard(appt, { headline, accent = '#2563eb' }) {
  const { dateLabel, timeLabel, tz } = fmt(appt);
  const typeName = appt.appointmentType?.name || 'Sesión de soporte';
  const responsible = appt.responsible?.name || 'Equipo Club Platform';
  const meeting = appt.meetingUrl
    ? `<tr><td style="padding:6px 0;color:#64748b">Enlace</td><td style="padding:6px 0"><a href="${appt.meetingUrl}" style="color:${accent};font-weight:600">${appt.meetingUrl}</a></td></tr>`
    : `<tr><td style="padding:6px 0;color:#64748b">Enlace</td><td style="padding:6px 0;color:#94a3b8">Se enviará antes de la sesión</td></tr>`;
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto">
    <div style="background:linear-gradient(135deg,${accent},#1e3a8a);border-radius:16px 16px 0 0;padding:24px 28px;color:#fff">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.85">${BRAND} · Capacitaciones</div>
      <div style="font-size:22px;font-weight:800;margin-top:6px">${headline}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:24px 28px;background:#fff">
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#0f172a">
        <tr><td style="padding:6px 0;color:#64748b;width:120px">Tipo</td><td style="padding:6px 0;font-weight:600">${typeName}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Fecha</td><td style="padding:6px 0;font-weight:600;text-transform:capitalize">${dateLabel}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Hora</td><td style="padding:6px 0;font-weight:600">${timeLabel} <span style="color:#94a3b8">(${tz})</span></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Responsable</td><td style="padding:6px 0;font-weight:600">${responsible}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Modalidad</td><td style="padding:6px 0;font-weight:600;text-transform:capitalize">${appt.modality || 'videollamada'}</td></tr>
        ${meeting}
      </table>
    </div>
  </div>`;
}

function actionsRow(appt, origin) {
  const g = googleCalendarUrl({ ...appt, title: `Capacitación: ${appt.appointmentType?.name || 'Soporte'}`, description: appt.meetingUrl || '', location: appt.meetingUrl || 'Videollamada' });
  const o = outlookCalendarUrl({ ...appt, title: `Capacitación: ${appt.appointmentType?.name || 'Soporte'}`, description: appt.meetingUrl || '', location: appt.meetingUrl || 'Videollamada' });
  const manage = origin ? `${origin}/admin/agenda-soporte` : '';
  return `
  <div style="max-width:560px;margin:16px auto 0;text-align:center;font-size:13px">
    <a href="${g}" style="display:inline-block;margin:4px;padding:9px 14px;border-radius:10px;background:#eff6ff;color:#2563eb;text-decoration:none;font-weight:600">Agregar a Google Calendar</a>
    <a href="${o}" style="display:inline-block;margin:4px;padding:9px 14px;border-radius:10px;background:#f1f5f9;color:#334155;text-decoration:none;font-weight:600">Agregar a Outlook</a>
    ${manage ? `<a href="${manage}" style="display:inline-block;margin:4px;padding:9px 14px;border-radius:10px;background:#f8fafc;color:#334155;text-decoration:none;font-weight:600">Gestionar reserva</a>` : ''}
  </div>`;
}

async function sendEmailSafe({ clubId, to, subject, html, attachments }) {
  if (!to) return;
  try {
    if (clubId) {
      await EmailService.sendEmail({ clubId, to, subject, html, attachments });
    } else {
      await EmailService.sendPlatformEmail({ to, subject, html, attachments });
    }
  } catch (e) {
    console.error('[trainingNotify] email fail:', e.message);
  }
}

async function sendWhatsAppSafe({ clubId, to, message }) {
  if (!clubId || !to) return;
  try {
    await WhatsAppService.sendMessage({ clubId, to, message });
  } catch (e) {
    console.error('[trainingNotify] whatsapp fail:', e.message);
  }
}

// Confirmación inmediata al reservar.
export async function sendConfirmation(appt, { origin } = {}) {
  const subject = `✅ Capacitación agendada — ${appt.appointmentType?.name || 'Soporte'}`;
  const html = baseCard(appt, { headline: 'Tu capacitación está agendada' }) + actionsRow(appt, origin);
  const ics = icsFor(appt, `Capacitación: ${appt.appointmentType?.name || 'Soporte'}`);
  const attachments = [{ filename: 'capacitacion.ics', content: Buffer.from(ics).toString('base64') }];

  await sendEmailSafe({ clubId: appt.clubId, to: appt.requesterEmail, subject, html, attachments });
  if (appt.responsible?.email) {
    await sendEmailSafe({ clubId: null, to: appt.responsible.email, subject: `Nueva reserva — ${appt.organizationName || 'Sitio'}`, html, attachments });
  }
  const { dateLabel, timeLabel, tz } = fmt(appt);
  await sendWhatsAppSafe({
    clubId: appt.clubId,
    to: appt.requesterPhone,
    message: `✅ ${BRAND}: tu capacitación "${appt.appointmentType?.name || 'Soporte'}" quedó agendada para ${dateLabel}, ${timeLabel} (${tz}).${appt.meetingUrl ? ` Enlace: ${appt.meetingUrl}` : ''}`,
  });
}

// Recordatorio (kind: '24h' | '1h').
export async function sendReminder(appt, kind, { origin } = {}) {
  const when = kind === '1h' ? 'en 1 hora' : 'mañana';
  const subject = `⏰ Recordatorio: tu capacitación es ${when}`;
  const html = baseCard(appt, { headline: `Tu capacitación es ${when}`, accent: '#7c3aed' }) + actionsRow(appt, origin);
  await sendEmailSafe({ clubId: appt.clubId, to: appt.requesterEmail, subject, html });
  const { timeLabel, tz } = fmt(appt);
  await sendWhatsAppSafe({
    clubId: appt.clubId,
    to: appt.requesterPhone,
    message: `⏰ ${BRAND}: recordatorio, tu capacitación "${appt.appointmentType?.name || 'Soporte'}" es ${when} (${timeLabel} ${tz}).${appt.meetingUrl ? ` Enlace: ${appt.meetingUrl}` : ''}`,
  });
}

// Cancelación / reprogramación.
export async function sendCancellation(appt, { rescheduled } = {}) {
  const subject = rescheduled ? 'Tu capacitación fue reprogramada' : 'Tu capacitación fue cancelada';
  const html = baseCard(appt, { headline: subject, accent: '#dc2626' });
  await sendEmailSafe({ clubId: appt.clubId, to: appt.requesterEmail, subject, html });
  if (appt.responsible?.email) {
    await sendEmailSafe({ clubId: null, to: appt.responsible.email, subject: `${subject} — ${appt.organizationName || 'Sitio'}`, html });
  }
}
