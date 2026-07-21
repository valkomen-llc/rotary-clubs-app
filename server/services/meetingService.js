// Capa abstracta de videoconferencia. Arquitectura preparada para múltiples
// proveedores; en Fase 1 el default es 'manual' (el responsable pega el enlace)
// y los proveedores automáticos (Zoom / Google Meet) se activan cuando el
// superadmin los selecciona en la config Y hay credenciales en el entorno.
//
// NUNCA lanza: si el proveedor falla, cae a 'manual' para no romper la reserva.

// ── Zoom (Server-to-Server OAuth) ──────────────────────────────────────────
// Requiere: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET.
async function getZoomToken() {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) return null;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: 'POST', headers: { Authorization: `Basic ${basic}` } }
  );
  if (!res.ok) throw new Error(`Zoom token ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function createZoomMeeting({ topic, startAt, durationMin, timezone }) {
  const token = await getZoomToken();
  if (!token) return null;
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: topic || 'Capacitación Club Platform',
      type: 2, // scheduled
      start_time: new Date(startAt).toISOString(),
      duration: durationMin || 45,
      timezone: timezone || 'UTC',
      settings: { join_before_host: true, waiting_room: false },
    }),
  });
  if (!res.ok) throw new Error(`Zoom meeting ${res.status}`);
  const data = await res.json();
  return {
    provider: 'zoom',
    url: data.join_url,
    id: String(data.id),
    payload: { host_url: data.start_url, password: data.password },
  };
}

// ── Google Meet (vía Google Calendar API con conferencia asociada) ──────────
// Requiere credenciales OAuth de Google Workspace del responsable de soporte.
// Placeholder de arquitectura: se activará cuando existan GOOGLE_* creds y el
// flujo OAuth del staff. Por ahora devuelve null → cae a 'manual'.
async function createGoogleMeet(/* { topic, startAt, durationMin, timezone } */) {
  const hasCreds =
    process.env.GOOGLE_MEET_CLIENT_ID &&
    process.env.GOOGLE_MEET_CLIENT_SECRET &&
    process.env.GOOGLE_MEET_REFRESH_TOKEN;
  if (!hasCreds) return null;
  // TODO Fase 2: intercambiar refresh_token → access_token y crear el evento
  // en Google Calendar con conferenceData { createRequest }, devolviendo el
  // hangoutLink como url. Arquitectura lista, integración pendiente.
  return null;
}

/**
 * Crea (o intenta crear) el enlace de la reunión para una cita.
 * @returns {Promise<{provider, url, id, payload}>}
 */
export async function createMeeting({ provider, topic, startAt, durationMin, timezone }) {
  const wanted = provider || 'manual';
  try {
    if (wanted === 'zoom') {
      const m = await createZoomMeeting({ topic, startAt, durationMin, timezone });
      if (m) return m;
    } else if (wanted === 'google_meet') {
      const m = await createGoogleMeet({ topic, startAt, durationMin, timezone });
      if (m) return m;
    }
  } catch (e) {
    console.error(`[meetingService] proveedor ${wanted} falló, cae a manual:`, e.message);
  }
  // Manual: sin enlace automático; el responsable lo agrega desde el admin.
  return { provider: 'manual', url: null, id: null, payload: {} };
}

export const AVAILABLE_MEETING_PROVIDERS = [
  { key: 'manual', label: 'Manual (enlace lo agrega el responsable)', available: true },
  {
    key: 'zoom',
    label: 'Zoom (automático)',
    available: !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET),
  },
  {
    key: 'google_meet',
    label: 'Google Meet (automático)',
    available: !!(process.env.GOOGLE_MEET_REFRESH_TOKEN),
  },
];
