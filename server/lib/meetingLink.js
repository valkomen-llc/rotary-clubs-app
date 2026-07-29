// Resolución del enlace de reunión de una cita.
//
// Prioridad (de mayor a menor especificidad):
//   1. Enlace automático del proveedor (Zoom / Google Meet) — cuando exista.
//   2. Enlace provisional del FACILITADOR (responsable).
//   3. Enlace provisional del TIPO de capacitación.
//   4. Enlace provisional GLOBAL (config).
//
// El provisional solo aplica si está habilitado (config.provisionalMeetingEnabled).
// Diseñado para que, al llegar la integración automática, `autoUrl` gane sin
// tocar el resto del flujo de reservas ni las notificaciones.
export function resolveMeetingUrl({ config, type, responsible, autoUrl } = {}) {
  if (autoUrl) return { url: autoUrl, provider: 'auto', scope: 'auto' };
  if (config?.provisionalMeetingEnabled) {
    if (responsible?.provisionalMeetingUrl) return { url: responsible.provisionalMeetingUrl, provider: 'provisional', scope: 'responsible' };
    if (type?.provisionalMeetingUrl) return { url: type.provisionalMeetingUrl, provider: 'provisional', scope: 'type' };
    if (config?.provisionalMeetingUrl) return { url: config.provisionalMeetingUrl, provider: 'provisional', scope: 'global' };
  }
  return { url: null, provider: null, scope: null };
}

// Valida que sea una URL con protocolo https:// (o vacío, que se interpreta como
// "sin enlace"). Devuelve true si es válida o vacía.
export function isValidMeetingUrl(u) {
  if (u == null || u === '') return true;
  return typeof u === 'string' && /^https:\/\/\S+$/i.test(u.trim());
}

// Código corto de confirmación legible, derivado del id de la cita.
export function confirmationCode(id) {
  return `CP-${String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
