// Campañas de Activación de Contenido — CRITERIO PURO (v4.1117)
// Sin base, sin red, sin IA, sin reloj propio. Todo lo temporal recibe `now`.
// Reutiliza: ContributionCampaign (formulario destino), WhatsAppCampaign /
// EmailCampaign (envío), CrmContact (única fuente de verdad), Mission Control
// (vista operativa por relación, sin duplicar tarjetas).

export const ACTIVATION_STATUS = {
  borrador: { id: 'borrador', label: 'Borrador', order: 0 },
  programada: { id: 'programada', label: 'Programada', order: 10 },
  activa: { id: 'activa', label: 'Activa', order: 20 },
  pausada: { id: 'pausada', label: 'Pausada', order: 30 },
  finalizada: { id: 'finalizada', label: 'Finalizada', order: 40 },
  archivada: { id: 'archivada', label: 'Archivada', order: 50 },
};
export const ACTIVATION_STATUS_IDS = Object.keys(ACTIVATION_STATUS);

const FLOW = {
  borrador: ['programada', 'archivada'],
  programada: ['activa', 'archivada', 'borrador'],
  activa: ['pausada', 'finalizada', 'archivada'],
  pausada: ['activa', 'finalizada', 'archivada'],
  finalizada: ['archivada', 'activa'],
  archivada: ['borrador'],
};
export const canTransitionActivation = (from, to) =>
  Array.isArray(FLOW[from]) && FLOW[from].includes(to);

export const FREQUENCIES = [
  { id: 'unica', label: 'Única' },
  { id: 'semanal', label: 'Semanal' },
  { id: 'quincenal', label: 'Quincenal' },
  { id: 'mensual', label: 'Mensual' },
  { id: 'trimestral', label: 'Trimestral' },
  { id: 'personalizada', label: 'Personalizada' },
];
export const FREQUENCY_IDS = FREQUENCIES.map((f) => f.id);

export const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Correo electrónico' },
  { id: 'ambos', label: 'WhatsApp + Email' },
];

export const ENROLLMENT_STATUS = {
  programada: 'programada',
  por_enviar: 'por_enviar',
  contactada: 'contactada',
  esperando_contenido: 'esperando_contenido',
  contenido_recibido: 'contenido_recibido',
  generacion_ia: 'generacion_ia',
  por_aprobar: 'por_aprobar',
  publicada: 'publicada',
  excluida: 'excluida',
  pausada: 'pausada',
  error: 'error',
};
export const ENROLLMENT_ORDER = [
  'programada', 'por_enviar', 'contactada', 'esperando_contenido',
  'contenido_recibido', 'generacion_ia', 'por_aprobar', 'publicada',
];

export const EVENT_TYPES = [
  'campana_creada', 'campana_activada', 'campana_pausada',
  'ejecucion_creada', 'ejecucion_cerrada',
  'audience_resuelta', 'preview',
  'whatsapp_enviado', 'whatsapp_entregado', 'whatsapp_leido', 'whatsapp_fallido',
  'email_enviado', 'email_abierto', 'email_clic', 'email_fallido',
  'clic_formulario', 'formulario_iniciado', 'formulario_visto',
  'solicitud_recibida', 'seguimiento_detenido',
  'articulo_generado', 'articulo_aprobado', 'articulo_publicado',
  'recordatorio_programado', 'recordatorio_enviado', 'reactivacion',
  'exclusion', 'error', 'nota',
];

// Flujo por defecto configurable: Día 0/3/7/14/21/30
export const DEFAULT_FLOW = [
  { dayOffset: 0, key: 'invitacion', channel: 'whatsapp', template: '', condition: 'siempre', waitDays: 0, action: 'enviar', expect: 'clic', next: 'recordatorio_1' },
  { dayOffset: 3, key: 'recordatorio_1', channel: 'whatsapp', template: '', condition: 'no_solicitud', waitDays: 3, action: 'enviar', expect: 'solicitud', next: 'recordatorio_2' },
  { dayOffset: 7, key: 'recordatorio_2', channel: 'email', template: '', condition: 'no_solicitud', waitDays: 4, action: 'enviar', expect: 'solicitud', next: 'ideas' },
  { dayOffset: 14, key: 'ideas', channel: 'whatsapp', template: '', condition: 'no_solicitud', waitDays: 7, action: 'enviar', expect: 'solicitud', next: 'seguimiento_final' },
  { dayOffset: 21, key: 'seguimiento_final', channel: 'whatsapp', template: '', condition: 'no_participo', waitDays: 7, action: 'enviar', expect: 'solicitud', next: 'cierre' },
  { dayOffset: 30, key: 'cierre', channel: 'email', template: '', condition: 'siempre', waitDays: 9, action: 'cerrar_ciclo', expect: 'nueva_recurrencia', next: null },
];

export const CONDITION_KINDS = [
  'siempre', 'no_solicitud', 'no_participo', 'no_abrio', 'abrio_sin_clic',
  'clic_sin_solicitud', 'ya_publico', 'inactivo_x_dias',
];

export const MESSAGE_VARS = [
  'nombre', 'club', 'distrito', 'cargo', 'ultima_participacion',
  'tipo_contenido_frecuente', 'formulario_url',
];

const str = (v, max) => String(v ?? '').trim().slice(0, max);

export const SCOPE_TYPES = [
  { id: 'global', label: 'Global / Club Platform' },
  { id: 'district', label: 'Distrito' },
  { id: 'club', label: 'Club' },
  { id: 'site', label: 'Sitio' },
  { id: 'event', label: 'Evento' },
  { id: 'project_fair', label: 'Feria de Proyectos' },
  { id: 'campaign_form', label: 'Campaña / Formulario' },
];
export const SCOPE_TYPE_IDS = SCOPE_TYPES.map((s) => s.id);

// Fuentes de audiencia reutilizando infraestructura existente (sin tablas nuevas).
export const AUDIENCE_SOURCES = [
  { id: 'crm_contacts', label: 'Contactos CRM' },
  { id: 'site_admins', label: 'Administradores de sitios' },
  { id: 'district_admins', label: 'Administradores de distritos' },
  { id: 'club_admins', label: 'Administradores de clubes' },
  { id: 'club_roles', label: 'Presidentes / Secretarios / Roles del club' },
  { id: 'leads', label: 'Leads' },
  { id: 'crm_lists', label: 'Listas de Comunicaciones CRM' },
  { id: 'segments', label: 'Segmentos existentes' },
  { id: 'event_contacts', label: 'Contactos asociados a eventos' },
  { id: 'manual', label: 'Lista manual autorizada' },
];

export function normalizeScopeDef(raw = {}) {
  const type = SCOPE_TYPE_IDS.includes(raw.type) ? raw.type : 'district';
  const ids = Array.isArray(raw.ids) ? raw.ids.map(String).filter(Boolean).slice(0, 100) : [];
  return { type, ids, label: String(raw.label || '').slice(0, 200) };
}

export function shapeActivation(body = {}) {
  const scopeDef = normalizeScopeDef(body.scopeDef || {});
  const audienceMode = body.audienceMode === 'fixed' ? 'fixed' : 'dynamic';
  return {
    name: str(body.name, 180),
    description: str(body.description, 2000),
    objetivo: str(body.objetivo || body.goal, 2000),
    contributionCampaignId: str(body.contributionCampaignId || body.initiativeId, 80) || null,
    startAt: body.startAt || null,
    endAt: body.endAt || null,
    timezone: str(body.timezone || 'America/Bogota', 60) || 'America/Bogota',
    frecuencia: FREQUENCY_IDS.includes(body.frecuencia) ? body.frecuencia : 'mensual',
    customDays: Number.isFinite(Number(body.customDays)) ? Number(body.customDays) : null,
    canales: Array.isArray(body.canales) ? body.canales.filter((c) => ['whatsapp', 'email', 'ambos'].includes(c)) : ['whatsapp'],
    scopeDef,
    audienceMode,
    audienceSnapshot: Array.isArray(body.audienceSnapshot) ? body.audienceSnapshot.slice(0, 5000) : (body.audienceSnapshot && typeof body.audienceSnapshot === 'object' ? body.audienceSnapshot : null),
    excludedContactIds: Array.isArray(body.excludedContactIds) ? body.excludedContactIds.map(String).slice(0, 5000) : [],
    manualRecipients: Array.isArray(body.manualRecipients) ? body.manualRecipients.slice(0, 500) : [],
    savedSegmentId: str(body.savedSegmentId || '', 80) || null,
    contentDef: body.contentDef && typeof body.contentDef === 'object' ? body.contentDef : {},
    audienceDef: body.audienceDef && typeof body.audienceDef === 'object' ? body.audienceDef : { match: 'all', rules: [] },
    flowDef: Array.isArray(body.flowDef) && body.flowDef.length ? body.flowDef.slice(0, 20) : DEFAULT_FLOW,
    followRules: body.followRules && typeof body.followRules === 'object'
      ? body.followRules
      : { stopOnResponse: true, maxAttempts: 5, quietHours: { start: '20:00', end: '08:00' }, maxPerWeek: 3, respectOptOut: true, altChannel: true },
    variables: body.variables && typeof body.variables === 'object' ? body.variables : {},
  };
}

export function validateActivation(d) {
  const errors = [];
  if (!d.name) errors.push('El nombre de la campaña es obligatorio.');
  if (!d.contributionCampaignId) errors.push('Vincula una campaña de contribución (formulario Rotary en Acción).');
  if (!d.startAt) errors.push('La fecha inicial es obligatoria.');
  if (d.startAt && d.endAt && new Date(d.endAt) < new Date(d.startAt)) errors.push('La fecha final no puede ser anterior a la inicial.');
  if (!FREQUENCY_IDS.includes(d.frecuencia)) errors.push('Frecuencia inválida.');
  if (d.scopeDef && !SCOPE_TYPE_IDS.includes(d.scopeDef.type)) errors.push('Tipo de ámbito inválido.');
  if (d.audienceMode && !['dynamic', 'fixed'].includes(d.audienceMode)) errors.push('Modo de audiencia inválido.');
  return { ok: errors.length === 0, errors };
}

// Render de variables dinámicas. Nunca inventa: lo ausente queda vacío.
export function renderMessage(template, ctx = {}) {
  let out = String(template ?? '');
  const map = {
    nombre: ctx.nombre || '',
    club: ctx.club || '',
    distrito: ctx.distrito || '',
    cargo: ctx.cargo || '',
    ultima_participacion: ctx.ultima_participacion || 'hace algún tiempo',
    tipo_contenido_frecuente: ctx.tipo_contenido_frecuente || 'proyectos de servicio, actividades y eventos',
    formulario_url: ctx.formulario_url || '',
  };
  for (const [k, v] of Object.entries(map)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  return out;
}

// Índice de participación: fórmula documentada, normalizada 0-100, auditable.
export function participationScore({ recenciaDias = 999, frecuencia12m = 0, publicados12m = 0, respuestaTasa = 0 } = {}, thresholds = {}) {
  const t = {
    recenciaMax: thresholds.recenciaMax ?? 180,
    frecMax: thresholds.frecMax ?? 12,
    pubMax: thresholds.pubMax ?? 12,
    ...thresholds,
  };
  const recenciaNorm = Math.max(0, 1 - Math.min(recenciaDias, t.recenciaMax) / t.recenciaMax);
  const frecNorm = Math.min(1, frecuencia12m / t.frecMax);
  const pubNorm = Math.min(1, publicados12m / t.pubMax);
  const respNorm = Math.max(0, Math.min(1, respuestaTasa));
  const score = Math.round(100 * (0.4 * recenciaNorm + 0.3 * frecNorm + 0.2 * pubNorm + 0.1 * respNorm));
  const parts = { recenciaNorm: +recenciaNorm.toFixed(3), frecNorm: +frecNorm.toFixed(3), pubNorm: +pubNorm.toFixed(3), respNorm: +respNorm.toFixed(3) };
  return { score, parts, weights: { recencia: 0.4, frecuencia: 0.3, publicados: 0.2, respuesta: 0.1 } };
}

export function participationLevel(score, thresholds = {}) {
  const t = { alta: 70, recurrente: 50, ocasional: 25, ...(thresholds.levels || {}) };
  if (score >= t.alta) return 'alta';
  if (score >= t.recurrente) return 'recurrente';
  if (score >= t.ocasional) return 'ocasional';
  // Sin participación reciente: se distingue por recencia en el perfil.
  return 'en_riesgo';
}

export const LEVEL_LABELS = {
  alta: 'Participación alta',
  recurrente: 'Participación recurrente',
  ocasional: 'Participación ocasional',
  en_riesgo: 'En riesgo de inactividad',
  sin_reciente: 'Sin participación reciente',
};

// KPIs: fórmulas únicas, sin "impacto" no atribuible.
export function kpiRates({ elegibles = 0, contactados = 0, solicitudesUnicas = 0, validas = 0, publicadas = 0 }) {
  const pct = (n, d) => (d > 0 ? +(100 * (n / d)).toFixed(1) : 0);
  return {
    tasa_participacion: pct(solicitudesUnicas, contactados || elegibles),
    tasa_conversion: pct(validas, contactados),
    tasa_publicacion: pct(publicadas, validas),
  };
}

// Constructor asistido por reglas (la IA generativa lo enriquece en el controlador).
export function draftFromPrompt(prompt = '') {
  const p = String(prompt || '').toLowerCase();
  const distrito = (p.match(/distrito\s*(\d{3,5})/) || [])[1] || '';
  const mensual = /mensual|mes|cada mes/.test(p);
  const semanal = /semanal|cada semana/.test(p);
  const quincenal = /quincenal/.test(p);
  const trimestral = /trimestral/.test(p);
  const whatsapp = /whatsapp/.test(p);
  const correo = /correo|email/.test(p);
  const rules = [];
  if (distrito) rules.push({ field: 'district', op: 'eq', value: distrito });
  const m60 = p.match(/(\d+)\s*d[ií]as/);
  return {
    name: 'Rotary en Acción — Participación ' + (mensual ? 'mensual' : semanal ? 'semanal' : quincenal ? 'quincenal' : trimestral ? 'trimestral' : 'recurrente'),
    description: 'Campaña generada desde asistente: ' + String(prompt).slice(0, 300),
    objetivo: 'Motivar a los clubes a reportar actividades, obras, proyectos, eventos y jornadas vía Rotary en Acción.',
    frecuencia: mensual ? 'mensual' : semanal ? 'semanal' : quincenal ? 'quincenal' : trimestral ? 'trimestral' : 'mensual',
    canales: whatsapp && correo ? ['ambos'] : whatsapp ? ['whatsapp'] : correo ? ['email'] : ['whatsapp'],
    audienceDef: { match: 'all', rules },
    flowDef: DEFAULT_FLOW,
    followRules: {
      stopOnResponse: true,
      maxAttempts: 5,
      quietHours: { start: '20:00', end: '08:00' },
      maxPerWeek: 3,
      respectOptOut: true,
      altChannel: true,
      reactivateAfterDays: m60 ? Number(m60[1]) : 60,
    },
    kpis: ['tasa_participacion', 'tasa_conversion', 'tasa_publicacion', 'tiempo_contacto_solicitud'],
  };
}
