// Audiencias dinámicas del WhatsApp CRM.
//
// La diferencia con `CrmList` es que una lista es una FOTO —alguien metió a esos
// contactos ahí— y un segmento es una PREGUNTA que se vuelve a responder cada
// vez que se usa. Para el motor de automatización hace falta lo segundo: "los
// clubes que vencen en 45 días" no es un conjunto que alguien mantenga a mano.
//
// Las dos conviven a propósito. Las listas siguen sirviendo para una campaña
// puntual a un grupo elegido; los segmentos son lo que consumen los recorridos.
//
// SEGURIDAD: ningún valor del cliente entra en el SQL. Los campos por los que se
// puede filtrar son un catálogo cerrado (`FIELD_SQL`), los operadores también, y
// todo lo demás viaja como parámetro. Un segmento es un objeto declarativo, no
// un fragmento de consulta.
import db from './db.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';
import { LIFECYCLE_KEYS } from './lifecycleSpec.js';

// ── Roles dentro de la organización ─────────────────────────────────────────
// Son los cargos que enumera el pedido. `other` existe para no perder un
// contacto que no encaje: dejarlo sin rol lo excluiría de toda segmentación por
// cargo sin que nadie se entere.
export const ORG_ROLES = [
  { key: 'president',      label: 'Presidente' },
  { key: 'secretary',      label: 'Secretario' },
  { key: 'treasurer',      label: 'Tesorero' },
  { key: 'technology',     label: 'Responsable de Tecnología' },
  { key: 'public_image',   label: 'Líder de Imagen Pública' },
  { key: 'communications', label: 'Líder de Comunicaciones' },
  { key: 'platform_admin', label: 'Administrador de Club Platform' },
  { key: 'other',          label: 'Otro integrante autorizado' },
];
export const ORG_ROLE_KEYS = ORG_ROLES.map(r => r.key);

export const CONSENT_STATES = [
  { key: 'granted', label: 'Consentimiento otorgado' },
  { key: 'denied',  label: 'Baja solicitada' },
  { key: 'unknown', label: 'Sin registrar' },
];

// ── Campos filtrables ───────────────────────────────────────────────────────
// El valor es la expresión SQL; la clave es lo único que puede mandar el
// cliente. `kind` le dice al constructor de la consulta cómo comparar.
const FIELD_SQL = {
  lifecycleState:  { sql: `ls.state`,                             kind: 'text' },
  siteType:        { sql: `COALESCE(c."siteType", ls."siteType")`, kind: 'text' },
  siteId:          { sql: `c."siteId"`,                           kind: 'text' },
  orgRole:         { sql: `c."orgRole"`,                          kind: 'text' },
  language:        { sql: `COALESCE(c.language, 'es')`,           kind: 'text' },
  country:         { sql: `c.country`,                            kind: 'text' },
  district:        { sql: `c.district`,                           kind: 'text' },
  consentState:    { sql: `c."consentState"`,                     kind: 'text' },
  contactStatus:   { sql: `c.status`,                             kind: 'text' },
  tags:            { sql: `c.tags`,                               kind: 'array' },
  // Señales del sitio, leídas del JSONB que guarda la pasada de observación.
  socialCount:     { sql: `(ls.signals->>'socialCount')::int`,          kind: 'number' },
  projectCount:    { sql: `(ls.signals->>'projectCount')::int`,         kind: 'number' },
  donationCount:   { sql: `(ls.signals->>'donationCount')::int`,        kind: 'number' },
  eventCount:      { sql: `(ls.signals->>'eventCount')::int`,           kind: 'number' },
  productCount:    { sql: `(ls.signals->>'productCount')::int`,         kind: 'number' },
  trainingCompleted: { sql: `(ls.signals->>'trainingCompleted')::int`,  kind: 'number' },
  trainingScheduled: { sql: `(ls.signals->>'trainingScheduled')::int`,  kind: 'number' },
  openSupport:     { sql: `(ls.signals->>'openSupport')::int`,          kind: 'number' },
  phasesTotal:     { sql: `(ls.signals->>'activationPhasesTotal')::int`,     kind: 'number' },
  phasesCompleted: { sql: `(ls.signals->>'activationPhasesCompleted')::int`, kind: 'number' },
  // Días que faltan para vencer. Negativo = ya venció.
  daysToExpiry:    { sql: `EXTRACT(EPOCH FROM ((ls.signals->>'expirationDate')::timestamptz - NOW()))/86400`, kind: 'number' },
  // Días desde la última respuesta del contacto. NULL = nunca respondió.
  daysSinceInbound: { sql: `EXTRACT(EPOCH FROM (NOW() - c."lastInboundAt"))/86400`, kind: 'number' },
};

export const SEGMENT_FIELDS = Object.keys(FIELD_SQL);

const OPERATORS = {
  in:        (col) => `${col} = ANY($#)`,
  not_in:    (col) => `NOT (${col} = ANY($#)) OR ${col} IS NULL`,
  eq:        (col) => `${col} = $#`,
  neq:       (col) => `${col} IS DISTINCT FROM $#`,
  gt:        (col) => `${col} > $#`,
  gte:       (col) => `${col} >= $#`,
  lt:        (col) => `${col} < $#`,
  lte:       (col) => `${col} <= $#`,
  is_null:   (col) => `${col} IS NULL`,
  not_null:  (col) => `${col} IS NOT NULL`,
  has_any:   (col) => `${col} && $#`,   // arrays
  has_all:   (col) => `${col} @> $#`,
};

export const SEGMENT_OPERATORS = Object.keys(OPERATORS);

/**
 * Traduce una audiencia declarativa a SQL.
 *
 * `audience` = { match: 'all'|'any', rules: [{ field, op, value }] }
 *
 * Una regla que nombre un campo o un operador desconocido se DESCARTA en vez de
 * ignorarse en silencio: se devuelve en `skipped` para que la UI lo muestre. Un
 * filtro que no se aplica ensancha la audiencia, que en un motor de envíos es
 * exactamente el error que no se puede pasar por alto.
 */
export function buildAudienceSql(audience = {}, { startIndex = 1 } = {}) {
  const rules = Array.isArray(audience.rules) ? audience.rules : [];
  const glue = audience.match === 'any' ? ' OR ' : ' AND ';
  const clauses = [];
  const params = [];
  const skipped = [];
  let i = startIndex;

  for (const rule of rules) {
    const field = FIELD_SQL[rule?.field];
    const opFn = OPERATORS[rule?.op];
    if (!field || !opFn) { skipped.push(rule); continue; }

    const needsValue = !['is_null', 'not_null'].includes(rule.op);
    if (needsValue && (rule.value === undefined || rule.value === null || rule.value === '')) {
      skipped.push(rule); continue;
    }

    if (!needsValue) {
      clauses.push(`(${opFn(field.sql)})`);
      continue;
    }

    let value = rule.value;
    if (['in', 'not_in', 'has_any', 'has_all'].includes(rule.op)) {
      value = Array.isArray(value) ? value : [value];
      if (!value.length) { skipped.push(rule); continue; }
      value = value.map(v => (field.kind === 'number' ? Number(v) : String(v)));
    } else if (field.kind === 'number') {
      value = Number(value);
      if (!Number.isFinite(value)) { skipped.push(rule); continue; }
    } else {
      value = String(value);
    }

    clauses.push(`(${opFn(field.sql).replace('$#', `$${i}`)})`);
    params.push(value);
    i++;
  }

  return { where: clauses.length ? clauses.join(glue) : null, params, nextIndex: i, skipped };
}

/**
 * Resuelve una audiencia a contactos.
 *
 * El JOIN con `CrmLifecycleState` es LEFT a propósito: un contacto sin sitio
 * vinculado (o cuyo sitio todavía no observó el cron) tiene que seguir siendo
 * alcanzable por un segmento que no filtre por ciclo de vida. Si fuera INNER,
 * vincular mal un contacto lo volvería invisible sin decirlo.
 */
export async function resolveAudience(clubId, audience = {}, { limit = null, offset = 0 } = {}) {
  await ensureAutomationSchema();

  const base = [`c."clubId" = $1`];
  const params = [clubId];
  let idx = 2;

  // Un contacto archivado o dado de baja no entra en ninguna audiencia. No es un
  // filtro configurable: es el piso del módulo.
  base.push(`c."archivedAt" IS NULL`);
  base.push(`c.status NOT IN ('unsubscribed','blocked')`);

  const built = buildAudienceSql(audience, { startIndex: idx });
  if (built.where) { base.push(`(${built.where})`); params.push(...built.params); idx = built.nextIndex; }

  let sql = `
    SELECT c.*, ls.state AS "lifecycleState", ls.signals AS "siteSignals", ls."siteType" AS "resolvedSiteType"
    FROM "WhatsAppContact" c
    LEFT JOIN "CrmLifecycleState" ls ON ls."siteId" = c."siteId"
    WHERE ${base.join(' AND ')}
    ORDER BY c."createdAt" ASC`;
  if (limit) { sql += ` LIMIT $${idx++}`; params.push(limit); }
  if (offset) { sql += ` OFFSET $${idx++}`; params.push(offset); }

  const r = await db.query(sql, params);
  return { contacts: r.rows, skipped: built.skipped };
}

/** Sólo el conteo — lo que necesita la vista previa del constructor. */
export async function countAudience(clubId, audience = {}) {
  await ensureAutomationSchema();
  const base = [`c."clubId" = $1`, `c."archivedAt" IS NULL`, `c.status NOT IN ('unsubscribed','blocked')`];
  const params = [clubId];
  const built = buildAudienceSql(audience, { startIndex: 2 });
  if (built.where) { base.push(`(${built.where})`); params.push(...built.params); }

  const r = await db.query(
    `SELECT COUNT(*)::int AS total, COUNT(DISTINCT c."siteId")::int AS sites
     FROM "WhatsAppContact" c
     LEFT JOIN "CrmLifecycleState" ls ON ls."siteId" = c."siteId"
     WHERE ${base.join(' AND ')}`,
    params
  );
  return { total: r.rows[0]?.total || 0, sites: r.rows[0]?.sites || 0, skipped: built.skipped };
}

// ── Segmentos predefinidos ──────────────────────────────────────────────────
// Los del pedido, listos para elegir en el constructor. Son puntos de partida
// editables, no una lista cerrada: el constructor deja armar cualquier otro con
// los mismos campos.
export const PRESET_SEGMENTS = [
  { key: 'clubes_activos', label: 'Clubes activos',
    audience: { match: 'all', rules: [{ field: 'lifecycleState', op: 'in', value: ['sitio_produccion', 'activo_uso_frecuente', 'activo_bajo_uso', 'suscripcion_activa'] }] } },
  { key: 'en_onboarding', label: 'Clubes en onboarding',
    audience: { match: 'all', rules: [{ field: 'lifecycleState', op: 'in', value: ['onboarding_pendiente', 'onboarding_iniciado'] }] } },
  { key: 'sin_capacitacion', label: 'Clubes sin capacitación realizada',
    audience: { match: 'all', rules: [{ field: 'trainingCompleted', op: 'lte', value: 0 }] } },
  { key: 'con_capacitacion_programada', label: 'Clubes con capacitación programada',
    audience: { match: 'all', rules: [{ field: 'trainingScheduled', op: 'gte', value: 1 }] } },
  { key: 'sin_publicaciones', label: 'Clubes sin publicaciones recientes',
    audience: { match: 'all', rules: [{ field: 'lifecycleState', op: 'in', value: ['activo_bajo_uso'] }] } },
  { key: 'sin_redes', label: 'Clubes con redes sociales sin conectar',
    audience: { match: 'all', rules: [{ field: 'socialCount', op: 'lte', value: 0 }] } },
  { key: 'sin_proyectos', label: 'Clubes sin proyectos creados',
    audience: { match: 'all', rules: [{ field: 'projectCount', op: 'lte', value: 0 }] } },
  { key: 'sin_donaciones', label: 'Clubes sin módulo de donaciones configurado',
    audience: { match: 'all', rules: [{ field: 'donationCount', op: 'lte', value: 0 }] } },
  { key: 'proximos_vencer', label: 'Clubes próximos a vencer',
    audience: { match: 'all', rules: [{ field: 'lifecycleState', op: 'in', value: ['proximo_renovar'] }] } },
  { key: 'vencidos', label: 'Clubes vencidos',
    audience: { match: 'all', rules: [{ field: 'lifecycleState', op: 'in', value: ['suscripcion_vencida', 'periodo_gracia', 'suspendido'] }] } },
  { key: 'reactivados', label: 'Clubes reactivados',
    audience: { match: 'all', rules: [{ field: 'lifecycleState', op: 'in', value: ['reactivado'] }] } },
  { key: 'sitios_produccion', label: 'Sitios en producción',
    audience: { match: 'all', rules: [{ field: 'lifecycleState', op: 'in', value: ['sitio_produccion', 'activo_uso_frecuente', 'activo_bajo_uso'] }] } },
  { key: 'sitios_pruebas', label: 'Sitios en pruebas',
    audience: { match: 'all', rules: [{ field: 'lifecycleState', op: 'in', value: ['sitio_pruebas'] }] } },
  { key: 'distritos', label: 'Distritos',
    audience: { match: 'all', rules: [{ field: 'siteType', op: 'eq', value: 'district' }] } },
  { key: 'presidentes', label: 'Presidentes de club',
    audience: { match: 'all', rules: [{ field: 'orgRole', op: 'eq', value: 'president' }] } },
];

export function validateAudience(audience) {
  const rules = Array.isArray(audience?.rules) ? audience.rules : [];
  const errors = [];
  for (const r of rules) {
    if (!FIELD_SQL[r?.field]) errors.push(`Campo desconocido: ${r?.field}`);
    else if (!OPERATORS[r?.op]) errors.push(`Operador desconocido: ${r?.op}`);
  }
  if (audience?.match && !['all', 'any'].includes(audience.match)) errors.push('El modo de combinación debe ser "all" o "any".');
  return errors;
}

/** Metadatos para el constructor visual. */
export function segmentCatalog() {
  return {
    fields: SEGMENT_FIELDS,
    operators: SEGMENT_OPERATORS,
    lifecycleStates: LIFECYCLE_KEYS,
    orgRoles: ORG_ROLES,
    consentStates: CONSENT_STATES,
    presets: PRESET_SEGMENTS,
  };
}

export default { resolveAudience, countAudience, buildAudienceSql, validateAudience, segmentCatalog, PRESET_SEGMENTS, ORG_ROLES };
