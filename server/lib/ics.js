// Generación de archivos .ics (RFC 5545) y enlaces "Agregar a Google/Outlook"
// para las citas de capacitación. Sin dependencias.

function pad(n) {
  return String(n).padStart(2, '0');
}

// Formato UTC compacto: 20260721T143000Z
function toICSDate(date) {
  const d = new Date(date);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeICS(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Construye el contenido .ics de una cita.
 * @param {Object} appt  { id, startAt, endAt, title, description, location, organizerEmail, attendeeEmail }
 */
export function buildICS(appt) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Club Platform//Capacitaciones//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${appt.id}@clubplatform.org`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(appt.startAt)}`,
    `DTEND:${toICSDate(appt.endAt)}`,
    `SUMMARY:${escapeICS(appt.title)}`,
    `DESCRIPTION:${escapeICS(appt.description)}`,
    appt.location ? `LOCATION:${escapeICS(appt.location)}` : null,
    appt.organizerEmail ? `ORGANIZER;CN=Club Platform:mailto:${appt.organizerEmail}` : null,
    appt.attendeeEmail
      ? `ATTENDEE;CN=${escapeICS(appt.attendeeName || appt.attendeeEmail)};RSVP=TRUE:mailto:${appt.attendeeEmail}`
      : null,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

// Enlace "Agregar a Google Calendar".
export function googleCalendarUrl(appt) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: appt.title || 'Capacitación Club Platform',
    dates: `${toICSDate(appt.startAt)}/${toICSDate(appt.endAt)}`,
    details: appt.description || '',
    location: appt.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Enlace "Agregar a Outlook".
export function outlookCalendarUrl(appt) {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: appt.title || 'Capacitación Club Platform',
    startdt: new Date(appt.startAt).toISOString(),
    enddt: new Date(appt.endAt).toISOString(),
    body: appt.description || '',
    location: appt.location || '',
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
