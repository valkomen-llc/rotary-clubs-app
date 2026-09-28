// Prueba del criterio de Campañas de Activación (puro, sin DB).
import {
  shapeActivation, validateActivation, canTransitionActivation,
  draftFromPrompt, participationScore, participationLevel, kpiRates, renderMessage,
  DEFAULT_FLOW,
} from '../server/lib/contentActivationSpec.js';

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
