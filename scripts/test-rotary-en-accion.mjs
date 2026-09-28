// Criterio Rotary en Acción (puro, sin DB): taxonomías, condicionales,
// impacto, completitud, fotografía y forma de la solicitud.
import {
  DEFAULT_TIPOS, DEFAULT_AREAS, DEFAULT_PROGRAMAS, fieldsForTipo,
  shapeImpact, completenessScore, photoAdvice, assistantQuestions,
} from '../server/lib/rotaryTaxonomySpec.js';
import { shapeSubmission, validateSubmission } from '../server/lib/contentSubmissionSpec.js';

let fails = 0;
const assert = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } else { console.log('ok:', m); } };

assert(DEFAULT_TIPOS.length >= 14, `tipos administrables (${DEFAULT_TIPOS.length})`);
assert(DEFAULT_AREAS.length === 7, '7 áreas de interés de Rotary');
assert(DEFAULT_PROGRAMAS.some((p) => p.slug === 'rotaract'), 'programas incluyen Rotaract');
assert(new Set(DEFAULT_TIPOS.map((t) => t.slug)).size === DEFAULT_TIPOS.length, 'slugs de tipo únicos');

const ev = fieldsForTipo('evento');
assert(ev.extra.includes('asistentes'), 'evento pide asistentes');
const em = fieldsForTipo('emergencia');
assert(em.extra.includes('zonaAfectada') && em.impacto.includes('beneficiarios'), 'emergencia pide zona y beneficiarios');
assert(fieldsForTipo('reconocimiento').impacto.length === 0, 'reconocimiento no pide métricas');

const imp = shapeImpact({ beneficiarios: 120, horas: '40', fondosRecaudados: 1500000, basura: -3, texto: '  ' });
assert(imp.beneficiarios === 120 && imp.horas === 40 && imp.fondosRecaudados === 1500000, 'impacto numérico saneado');
assert(!('basura' in imp) && !('texto' in imp), 'impacto descarta negativos y vacíos');

const c = completenessScore({ hasInfo: true, photoCount: 5, photoRules: { minToSubmit: 1, recommended: 3, reelMin: 5 }, hasImpact: true, hasLocation: true, hasStory: true });
assert(c.score === 100 && c.editorialReady, 'solicitud completa lista para generación');
const c2 = completenessScore({ hasInfo: false, photoCount: 1, photoRules: { minToSubmit: 1, recommended: 3, reelMin: 5 }, hasImpact: false, hasLocation: false, hasStory: false });
assert(c2.score < 70 && !c2.editorialReady, 'solicitud pobre no prioritaria');

assert(photoAdvice(0, {}).level === 'faltante', '0 fotos: faltante');
assert(photoAdvice(1, {}).level === 'ok', '1 foto: válida, no bloquea');
assert(photoAdvice(3, {}).level === 'ok', '3 fotos: formatos');
assert(photoAdvice(5, {}).level === 'optimo', '5 fotos: óptimo con Reel');

assert(assistantQuestions({}).length >= 5, 'preguntas guía sin inventar');

const d = shapeSubmission({ senderName: 'A', senderEmail: 'a@b.co', consent: true, files: [{ key: 'k' }], contentType: 'Proyecto', program: 'ROTARACT', impact: { beneficiarios: 10 }, tags: ['a', 'b'] });
assert(d.contentType === 'proyecto' && d.program === 'rotaract', 'slugs normalizados');
assert(d.impact.beneficiarios === 10 && d.tags.length === 2, 'impacto y tags en forma');
const v = validateSubmission(d, { minFiles: 1 });
assert(v.ok, '1 foto válida con mínimo configurable');
assert(!validateSubmission(d, { minFiles: 5 }).ok, 'mínimo 5 aún exigible por configuración');

if (fails) { console.error(`${fails} fallos`); process.exit(1); }
console.log('rotary-en-accion: criterio OK');
