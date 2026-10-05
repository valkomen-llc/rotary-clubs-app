// Prueba del criterio de Campañas de Activación (puro, sin DB).
import {
  shapeActivation, validateActivation, canTransitionActivation,
  draftFromPrompt, participationScore, participationLevel, kpiRates, renderMessage,
  DEFAULT_FLOW, ACTIVATION_STATUS_IDS, EVENT_TYPES,
  EDITABLE_FULL_STATES, EDITABLE_PARTIAL_FIELDS, EDITABLE_PAUSADA_FIELDS,
  duplicateName, deletionPolicy, transitionEventType,
} from '../server/lib/contentActivationSpec.js';
import { readFileSync } from 'node:fs';

let fails = 0;
const assert = (cond, msg) => { if (!cond) { fails++; console.error('FAIL:', msg); } else { console.log('ok:', msg); } };

const d = draftFromPrompt('Crea una campaña mensual para solicitar a los clubes del Distrito 4281 historias de proyectos de servicio por WhatsApp y correo, seguimiento 60 días');
assert(d.frecuencia === 'mensual', 'frecuencia mensual desde prompt');
assert(d.canales.includes('whatsapp') || d.canales[0] === 'ambos', 'canal whatsapp detectado');
assert(d.audienceDef.rules.some((r) => r.value === '4281'), 'distrito 4281 en segmentación');
assert(DEFAULT_FLOW.length === 6 && DEFAULT_FLOW[0].dayOffset === 0, 'flujo Día 0/3/7/14/21/30 por defecto');

const shaped = shapeActivation({ name: 'Test', contributionCampaignId: 'c1', startAt: new Date().toISOString(), frecuencia: 'mensual' });
const v = validateActivation(shaped);
assert(v.ok, 'campaña válida pasa validación');
assert(!validateActivation(shapeActivation({})).ok, 'campaña vacía no pasa');

assert(canTransitionActivation('borrador', 'programada'), 'borrador→programada');
assert(canTransitionActivation('programada', 'activa'), 'programada→activa');
assert(!canTransitionActivation('borrador', 'activa'), 'borrador→activa bloqueada (requiere programar)');

// ── Ciclo de vida completo (v4.1163): matriz FLOW por estado ──────────
assert(JSON.stringify(ACTIVATION_STATUS_IDS) === JSON.stringify(['borrador', 'programada', 'activa', 'pausada', 'finalizada', 'archivada']), '6 estados canónicos en orden');
assert(canTransitionActivation('borrador', 'archivada'), 'borrador→archivada (eliminar)');
assert(canTransitionActivation('programada', 'borrador'), 'programada→borrador (cancelar programación)');
assert(canTransitionActivation('activa', 'pausada') && canTransitionActivation('pausada', 'activa'), 'pausar y reanudar sin perder configuración');
assert(canTransitionActivation('activa', 'finalizada') && canTransitionActivation('pausada', 'finalizada'), 'finalizar desde activa/pausada');
assert(canTransitionActivation('finalizada', 'activa'), 'finalizada→activa (reactivar)');
assert(canTransitionActivation('finalizada', 'archivada') && canTransitionActivation('archivada', 'borrador'), 'archivar y restaurar');
assert(!canTransitionActivation('activa', 'programada'), 'activa→programada bloqueada');
assert(!canTransitionActivation('archivada', 'activa'), 'archivada→activa bloqueada (pasa por borrador)');
assert(!canTransitionActivation('pausada', 'programada'), 'pausada→programada bloqueada');
assert(!canTransitionActivation('inventada', 'activa'), 'estado inexistente no transiciona');

// ── Edición por estado ────────────────────────────────────────────────
assert(EDITABLE_FULL_STATES.includes('borrador') && EDITABLE_FULL_STATES.includes('programada'), 'edición total en borrador/programada');
assert(!EDITABLE_FULL_STATES.includes('activa'), 'activa no admite edición total');
assert(EDITABLE_PARTIAL_FIELDS.includes('contentDef') && !EDITABLE_PARTIAL_FIELDS.includes('startAt'), 'parcial no toca fechas');
assert(EDITABLE_PAUSADA_FIELDS.includes('startAt') && EDITABLE_PAUSADA_FIELDS.includes('frecuencia'), 'pausada permite reprogramar fechas');
assert(EDITABLE_PAUSADA_FIELDS.includes('description'), 'pausada conserva lo parcial');

// ── Duplicado y eliminación ───────────────────────────────────────────
assert(duplicateName('Rotary en Acción') === 'Rotary en Acción (copia)', 'nombre de la copia');
assert(duplicateName('X (copia)') === 'X (copia 2)', 'no se apila (copia)');
assert(duplicateName('X (copia 2)') === 'X (copia 3)', 'copia de copia se numera');
assert(deletionPolicy({ executions: 0, enrollments: 0, events: 0 }) === 'hard', 'sin historial: borrado real');
assert(deletionPolicy({ executions: 2, enrollments: 0, events: 5 }) === 'soft', 'con historial: archivado');
assert(deletionPolicy({ executions: 0, enrollments: 1, events: 0 }) === 'soft', 'una inscripción ya conserva');
assert(deletionPolicy({ executions: 0, enrollments: 0, events: 3 }) === 'hard', 'eventos sueltos de ciclo de vida no obligan a archivar');

// ── Trazabilidad de transiciones ──────────────────────────────────────
assert(transitionEventType('programada', 'activa') === 'campana_activada', 'evento activar');
assert(transitionEventType('activa', 'pausada') === 'campana_pausada', 'evento pausar');
assert(transitionEventType('pausada', 'activa') === 'campana_reactivada', 'evento reanudar');
assert(transitionEventType('activa', 'finalizada') === 'campana_finalizada', 'evento finalizar');
assert(transitionEventType('activa', 'archivada') === 'campana_archivada', 'evento archivar');
assert(transitionEventType('programada', 'borrador') === 'programacion_cancelada', 'evento cancelar programación');
assert(transitionEventType('borrador', 'programada') === 'campana_programada', 'evento programar');
assert(transitionEventType('programada', 'programada') === 'campana_reprogramada', 'evento reprogramar');
for (const t of ['campana_finalizada', 'campana_archivada', 'campana_reactivada', 'campana_duplicada', 'campana_programada', 'programacion_cancelada', 'campana_reprogramada']) {
  assert(EVENT_TYPES.includes(t), `tipo de evento ${t} catalogado`);
}

// ── Integración: rutas, guardias y no-duplicación ─────────────────────
const leer = (f) => readFileSync(f, 'utf8');
const RUTAS = leer('server/routes/content-activation.js');
assert(/router\.post\('\/:id\/duplicate', ctrl\.duplicate\)/.test(RUTAS), 'ruta duplicar existe');
assert(/router\.delete\('\/:id', ctrl\.remove\)/.test(RUTAS), 'ruta eliminar existe');
const CTRL = leer('server/controllers/contentActivationController.js');
assert(/assertCampaignWritable/.test(CTRL), 'puerta de escritura definida');
for (const h of ['export const transition', 'export const duplicate', 'export const remove', 'export const updateContent', 'export const newExecution', 'export const enroll =']) {
  const bloque = CTRL.slice(CTRL.indexOf(h), CTRL.indexOf(h) + 1200);
  assert(/assertCampaignWritable/.test(bloque), `puerta de escritura en ${h.replace('export const ', '')}`);
}
assert(/if \(req\.body\?\.confirm !== true\)/.test(CTRL), 'eliminar exige confirmación explícita');
assert(/validateActivation\(\{\s*\.\.\.shaped/.test(CTRL), 'editar revalida como al crear');
const ENGINE = leer('server/lib/contentActivationEngine.js');
assert(!/setTimeout|setInterval|node-cron|node_schedule|BullMQ/i.test(ENGINE), 'sin jobs por campaña: el tick central procesa solo `activa`');
assert(/status IN \('programada','activa'\) ORDER BY "createdAt" DESC LIMIT 1/.test(ENGINE), 'activar reutiliza la ejecución vigente (no duplica)');
assert(/ON CONFLICT\("executionId","contactId"\) DO NOTHING/.test(ENGINE), 'inscribir es idempotente (no duplica)');
assert(/WHERE status='activa' LIMIT/.test(ENGINE), 'pausada/archivada/finalizada no avanzan en el tick');
const UI = leer('src/components/admin/content-activation/ContentActivation.tsx');
assert(/actionsFor/.test(UI) && /⋯/.test(UI), 'menú contextual por tarjeta');
assert(/openWizardForEdit/.test(UI), 'editar reabre el constructor con lo guardado');
assert(/askDelete/.test(UI) && /confirm: true/.test(UI), 'eliminar con confirmación explícita');
assert(/DUPLICATE|duplicate/.test(UI), 'duplicar conectado en UI');

const { score, parts } = participationScore({ recenciaDias: 73, frecuencia12m: 4, publicados12m: 2, respuestaTasa: 0.5 });
assert(score >= 0 && score <= 100, `score normalizado 0-100 (${score})`);
assert(parts.recenciaNorm > 0, 'desglose auditable de recencia');
assert(participationLevel(80) === 'alta' && participationLevel(10) === 'en_riesgo', 'niveles por umbrales');

const rates = kpiRates({ elegibles: 100, contactados: 80, solicitudesUnicas: 20, validas: 18, publicadas: 12 });
assert(rates.tasa_participacion === 25 && rates.tasa_publicacion === 66.7, 'fórmulas de KPIs');

const msg = renderMessage('Hola {{nombre}} del {{club}}, {{formulario_url}}', { nombre: 'Carmen', club: 'Nuevo Cali', formulario_url: 'https://f' });
assert(msg === 'Hola Carmen del Nuevo Cali, https://f', 'variables dinámicas');

if (fails) { console.error(`${fails} fallos`); process.exit(1); }
console.log('content-activation: criterio OK');
