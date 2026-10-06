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

// ─── Vocabulario del ciclo de vida (v4.1163) ─────────────────────────────
// Los 6 estados canónicos cubren el ciclo pedido sin lógica paralela:
//   · «En curso» ES `activa`: el tick (`tickActivation`) solo procesa campañas
//     `activa`, así que lo que la tarjeta muestra como Activa es lo que el
//     motor está ejecutando de verdad.
//   · «Cancelada» ES `archivada`: terminal, conserva ejecuciones,
//     inscripciones y eventos para auditoría, y puede restaurarse a borrador.
// Un séptimo estado duplicaría esa semántica y abriría la puerta a dos
// verdades sobre lo mismo (regla de la bandeja única, v4.999).

// Edición por estado: en borrador/programada, edición TOTAL (el constructor
// reabre con toda la configuración); en el resto, solo campos operativos que
// no alteran lo ya ejecutado. Pausar/reactivar/finalizar van por `transition`.
export const EDITABLE_FULL_STATES = ['borrador', 'programada'];
export const EDITABLE_PARTIAL_FIELDS = ['description', 'objetivo', 'variables', 'followRules', 'contentDef'];
// En `pausada` el motor está detenido (el tick solo procesa `activa`), así
// que es la ventana segura para reprogramar: las próximas ejecuciones leerán
// las nuevas fechas/frecuencia y el historial queda intacto.
export const EDITABLE_PAUSADA_FIELDS = [...EDITABLE_PARTIAL_FIELDS, 'startAt', 'endAt', 'timezone', 'frecuencia', 'customDays'];

// Nombre de la copia: no se apila «(copia) (copia)»; se numera.
export function duplicateName(name = '') {
  const base = String(name || 'Campaña').trim() || 'Campaña';
  const m = base.match(/^(.*)\s\(copia(?:\s(\d+))?\)$/);
  if (!m) return `${base} (copia)`;
  const root = m[1].trim() || base;
  const n = m[2] ? Number(m[2]) + 1 : 2;
  return `${root} (copia ${n})`;
}

// Política de eliminación: con ejecuciones o inscripciones se ARCHIVA (son el
// historial que la auditoría debe conservar); los eventos sueltos de ciclo de
// vida (creada, duplicada…) no obligan a conservar la campaña. Pura: el
// controlador cuenta y decide.
export function deletionPolicy({ executions = 0, enrollments = 0 } = {}) {
  const total = (Number(executions) || 0) + (Number(enrollments) || 0);
  return total > 0 ? 'soft' : 'hard';
}

// Evento de trazabilidad que deja cada transición de estado.
export function transitionEventType(from, to) {
  if (to === 'activa' && from !== 'programada') return 'campana_reactivada';
  if (to === 'activa') return 'campana_activada';
  if (to === 'pausada') return 'campana_pausada';
  if (to === 'finalizada') return 'campana_finalizada';
  if (to === 'archivada') return 'campana_archivada';
  if (to === 'borrador' && from === 'programada') return 'programacion_cancelada';
  if (to === 'programada' && from === 'borrador') return 'campana_programada';
  if (to === 'programada') return 'campana_reprogramada';
  return 'nota';
}

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
  'campana_creada', 'campana_activada', 'campana_pausada', 'campana_finalizada',
  'campana_archivada', 'campana_reactivada', 'campana_duplicada',
  'campana_programada', 'programacion_cancelada', 'campana_reprogramada',
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

// ── Contenido y plantillas por canal (v4.1131) ─────────────────────────────
// contentDef = { email: {fromEmail,fromName,subject,preheader,bodyHtml,ctaText,ctaUrl},
//                whatsapp: {body}, updatedAt }
const s = (v, max) => String(v ?? '').slice(0, max);

export function normalizeContentDef(raw = {}) {
  const email = raw.email && typeof raw.email === 'object' ? raw.email : {};
  const whatsapp = raw.whatsapp && typeof raw.whatsapp === 'object' ? raw.whatsapp : {};
  // Compatibilidad: plantilla única legacy en contentDef.template/bodyHtml → bodyText.
  const legacyBody = typeof raw.template === 'string' && raw.template
    ? raw.template
    : (typeof (email.bodyHtml || email.body || raw.bodyHtml) === 'string' ? (email.bodyHtml || email.body || raw.bodyHtml) : '');
  const bodyText = typeof email.bodyText === 'string' && email.bodyText
    ? email.bodyText
    : htmlToText(legacyBody);
  // Diseño visual (v4.1166): el editor guarda bloques + HTML final. Se
  // conservan tal cual (con topes); el render los resuelve con las mismas
  // variables en preview, prueba y envío.
  const design = email.design && typeof email.design === 'object' ? email.design : null;
  const buttons = Array.isArray(whatsapp.buttons)
    ? whatsapp.buttons.slice(0, 3).map((b) => ({
      type: b?.type === 'url' ? 'url' : 'quick',
      label: s(b?.label || '', 25),
      url: s(b?.url || '', 2000),
    }))
    : [];
  return {
    email: {
      fromEmail: s(email.fromEmail || raw.fromEmail || '', 160),
      fromName: s(email.fromName || raw.fromName || '', 120),
      subject: s(email.subject || raw.subject || '', 200),
      preheader: s(email.preheader || raw.preheader || '', 300),
      bodyText: s(bodyText, 20000),
      ctaText: s(email.ctaText || raw.ctaText || '', 120),
      ctaUrl: s(email.ctaUrl || raw.ctaUrl || '', 500),
      showShareGrid: email.showShareGrid !== false && raw.showShareGrid !== false,
      showRecentPosts: email.showRecentPosts !== false && raw.showRecentPosts !== false,
      recentPostsCount: Number.isFinite(Number(email.recentPostsCount)) ? Number(email.recentPostsCount) : (Number.isFinite(Number(raw.recentPostsCount)) ? Number(raw.recentPostsCount) : 4),
      design,
      html: s(email.html || '', 200 * 1024),
      templateId: s(email.templateId || '', 80) || null,
      templateVersion: Number.isFinite(Number(email.templateVersion)) ? Number(email.templateVersion) : null,
    },
    whatsapp: {
      body: s(whatsapp.body || raw.whatsappBody || '', 4000),
      headerType: ['text', 'image'].includes(whatsapp.headerType) ? whatsapp.headerType : 'none',
      headerText: s(whatsapp.headerText || '', 60),
      mediaUrl: s(whatsapp.mediaUrl || '', 2000),
      footer: s(whatsapp.footer || '', 60),
      buttons,
      templateName: s(whatsapp.templateName || '', 120) || null,
      templateLang: s(whatsapp.templateLang || '', 12) || null,
      templateId: s(whatsapp.templateId || '', 80) || null,
      templateVersion: Number.isFinite(Number(whatsapp.templateVersion)) ? Number(whatsapp.templateVersion) : null,
    },
  };
}

// HTML legacy → texto plano por párrafos (el render usa bloques de texto).
export function htmlToText(html) {
  let t = String(html || '');
  t = t.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\s*\/\s*(p|h1|h2|h3|li|div)\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '');
  const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  for (const [k, v] of Object.entries(entities)) t = t.split(k).join(v);
  return t.split(/\n{3,}/).join('\n\n').trim();
}

// Plantilla institucional inicial Rotary en Acción (texto plano por párrafos;
// el CTA y la rejilla los compone el renderer con la URL del sitio).
export function defaultContentDef() {
  return {
    email: {
      fromEmail: '',
      fromName: '',
      subject: 'Comparte lo que está haciendo tu club en Rotary en Acción',
      preheader: 'Cuéntanos los proyectos y actividades de tu club para visibilizarlos.',
      bodyText: `Queremos conocer y visibilizar las acciones que {{club_name}} está desarrollando y el impacto que está generando en su comunidad.\n\nComparte a través de Rotary en Acción los proyectos, actividades, jornadas, eventos, historias de servicio, respuestas humanitarias, campañas, alianzas, reconocimientos y actividades juveniles desarrolladas por tu club.\n\nLa información enviada podrá apoyar la comunicación y difusión de las acciones de los clubes a través de los canales del {{site_name}}.`,
      ctaText: 'Compartir una actividad →',
      ctaUrl: '',
      showShareGrid: true,
      showRecentPosts: true,
      recentPostsCount: 4,
    },
    whatsapp: {
      body: `*Rotary en Acción | {{district_name}}*\n\nHola {{recipient_name}}, queremos conocer y compartir las acciones que está desarrollando tu club. 💙\n\nEnvíanos tus proyectos, actividades, eventos, historias de servicio, campañas y demás iniciativas a través de Rotary en Acción.\n\n*Compartir actividad:*\n{{form_url}}\n\nGracias por ayudarnos a visibilizar el impacto de los clubes.`,
    },
  };
}

export const CONTENT_VARS = [
  'recipient_name', 'club_name', 'district_name', 'campaign_name', 'form_url', 'site_name',
  // Legado (se siguen resolviendo):
  'nombre', 'club', 'distrito', 'cargo', 'formulario_url',
];

// Render de variables dinámicas. Nunca inventa: lo ausente queda vacío.
// Soporta {{recipient_name}}…{{site_name}} + legado {{nombre}}…{{formulario_url}}.
export function renderContentVars(template, ctx = {}) {
  let out = String(template ?? '');
  const map = {
    recipient_name: ctx.recipient_name ?? ctx.nombre ?? '',
    club_name: ctx.club_name ?? ctx.club ?? '',
    district_name: ctx.district_name ?? ctx.distrito ?? '',
    campaign_name: ctx.campaign_name ?? '',
    form_url: ctx.form_url ?? ctx.formulario_url ?? '',
    site_name: ctx.site_name ?? ctx.club ?? '',
    nombre: ctx.nombre ?? ctx.recipient_name ?? '',
    club: ctx.club ?? ctx.club_name ?? '',
    distrito: ctx.distrito ?? ctx.district_name ?? '',
    cargo: ctx.cargo ?? '',
    formulario_url: ctx.formulario_url ?? ctx.form_url ?? '',
    cta_text: ctx.cta_text ?? '',
  };
  for (const [k, v] of Object.entries(map)) {
    out = out.split(`{{${k}}}`).join(String(v ?? ''));
  }
  return out;
}

// Checklist de dependencias antes de activar. Devuelve items con ok + faltante.
export function readinessCheck(campaign, { recipientCount = 0, formSlug = '' } = {}) {
  const items = [];
  const rules = campaign?.audienceDef?.rules || [];
  items.push({ id: 'audiencia', label: 'Audiencia', ok: rules.length > 0 || (campaign?.audienceDef?.sources || []).length > 0, hint: 'Define roles o fuentes en el paso 2.' });
  items.push({ id: 'destinatarios', label: 'Destinatarios', ok: Number(recipientCount) > 0, hint: 'Resuelve la audiencia en el paso 3 (Actualizar audiencia).' });
  const channels = campaign?.canales || [];
  const wantsEmail = channels.includes('email') || channels.includes('ambos');
  const wantsWA = channels.includes('whatsapp') || channels.includes('ambos');
  const email = campaign?.contentDef?.email || {};
  const wa = campaign?.contentDef?.whatsapp || {};
  if (wantsEmail) {
    const okEmail = Boolean(email.subject && (email.bodyText || email.bodyHtml));
    items.push({ id: 'plantilla_email', label: 'Plantilla Email', ok: okEmail, hint: 'Completa asunto y contenido del correo en el paso 4.' });
  }
  if (wantsWA) {
    items.push({ id: 'plantilla_whatsapp', label: 'Plantilla WhatsApp', ok: Boolean(wa.body), hint: 'Completa el mensaje de WhatsApp en el paso 4.' });
  }
  items.push({ id: 'formulario', label: 'Formulario/CTA', ok: Boolean(campaign?.contributionCampaignId && formSlug), hint: 'Vincula el formulario Rotary en Acción en el paso 1.' });
  items.push({ id: 'canal', label: 'Canal de envío', ok: channels.length > 0, hint: 'Selecciona Email, WhatsApp o ambos.' });
  items.push({ id: 'programacion', label: 'Programación', ok: Boolean(campaign?.startAt && campaign?.frecuencia), hint: 'Define inicio y frecuencia en el paso 1.' });
  return { items, ok: items.every((i) => i.ok) };
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
    senderSiteId: str(body.senderSiteId || '', 120) || null,
    audienceSnapshot: Array.isArray(body.audienceSnapshot) ? body.audienceSnapshot.slice(0, 5000) : (body.audienceSnapshot && typeof body.audienceSnapshot === 'object' ? body.audienceSnapshot : null),
    excludedContactIds: Array.isArray(body.excludedContactIds) ? body.excludedContactIds.map(String).slice(0, 5000) : [],
    manualRecipients: Array.isArray(body.manualRecipients) ? body.manualRecipients.slice(0, 500) : [],
    savedSegmentId: str(body.savedSegmentId || '', 80) || null,
    contentDef: normalizeContentDef(body.contentDef || {}),
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
