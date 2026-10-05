// Criterio Rotary en Acción (puro, sin DB): taxonomías, condicionales,
// impacto, completitud, fotografía y forma de la solicitud.
import {
  DEFAULT_TIPOS, DEFAULT_AREAS, DEFAULT_PROGRAMAS, fieldsForTipo,
  shapeImpact, completenessScore, photoAdvice, assistantQuestions,
  suggestForCampaign, CONDITIONAL_FIELDS,
} from '../server/lib/rotaryTaxonomySpec.js';
import { shapeSubmission, validateSubmission } from '../server/lib/contentSubmissionSpec.js';
import { readFileSync } from 'node:fs';

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

const d = shapeSubmission({ senderName: 'A', senderEmail: 'a@b.co', consent: true, files: [{ key: 'k' }], contentType: 'Proyecto', program: 'ROTARACT', impact: { beneficiarios: 10 }, tags: ['a', 'b'], notifyUpdates: true });
assert(d.contentType === 'proyecto' && d.program === 'rotaract', 'slugs normalizados');
assert(d.impact.beneficiarios === 10 && d.tags.length === 2, 'impacto y tags en forma');
assert(d.notifyUpdates === true, 'preferencia de resultados viaja separada del consentimiento');
assert(shapeSubmission({ senderName: 'A', senderEmail: 'a@b.co', consent: true, files: [{ key: 'k' }] }).notifyUpdates === false, 'sin marcar no bloquea ni se inventa');
const v = validateSubmission(d, { minFiles: 1 });
assert(v.ok, '1 foto válida con mínimo configurable');
assert(!validateSubmission(d, { minFiles: 5 }).ok, 'mínimo 5 aún exigible por configuración');

const s1 = suggestForCampaign('Emergencia Terremoto Colombia 2026', 'emergencia-terremoto-colombia-2026');
assert(s1.tipo === 'emergencia', 'terremoto sugiere emergencia sin hardcodear la campaña');
assert(suggestForCampaign('End Polio Now 2026', '').programa === 'polio', 'polio sugiere programa');
assert(suggestForCampaign('Conferencia Distrital', '').tipo === 'evento', 'conferencia sugiere evento');
assert(suggestForCampaign('Campaña de Rotaract', '').programa === 'rotaract', 'rotaract sugiere programa juvenil');
assert(Object.keys(suggestForCampaign('Jornada barrial', '')).length === 0, 'sin palabras clave no sugiere nada');

const emc = CONDITIONAL_FIELDS.emergencia;
assert(emc.extra.includes('zonaAfectada') && !emc.extra.includes('beneficiarios'), 'emergencia: campos propios sin duplicar beneficiarios');
assert(!CONDITIONAL_FIELDS.proyecto.extra.includes('beneficiarios'), 'proyecto: sin beneficiarios duplicado');
for (const [slug, cfg] of Object.entries(CONDITIONAL_FIELDS)) {
  if (!cfg.impacto.length) continue;
  assert(cfg.impacto.length === 4, `${slug}: impacto en 2 pares equilibrados`);
  assert(!cfg.impacto.includes('ubicaciones') && !cfg.impacto.includes('clubes') && !cfg.impacto.includes('actividades'), `${slug}: sin métricas redundantes`);
}
assert(fieldsForTipo('evento').impacto.includes('recursos'), 'impacto general incluye recursos');
assert(CONDITIONAL_FIELDS.recaudacion.impacto[0] === 'fondosRecaudados', 'recaudación prioriza fondos');

// ── Regresión v4.1164: el formulario público no revienta al pintar ──────
// v4.1160 borró el import de `countryPhones` dejando los usos: el primer
// render lanzaba `ReferenceError: DEFAULT_COUNTRY is not defined` y la página
// caía en «Esta pantalla no se pudo mostrar». Vite/esbuild no verifican
// tipos, así que se comprueba acá: todo identificador del módulo que el
// formulario nombra tiene que estar importado o definido en él.
{
  const form = readFileSync('src/components/rotary/RotaryEnAccionForm.tsx', 'utf8');
  const spec = readFileSync('src/lib/countryPhones.ts', 'utf8');
  const importados = new Set(
    [...form.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/\.\.\/lib\/countryPhones['"]/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim()).filter(Boolean))
  );
  for (const id of ['COUNTRIES', 'DEFAULT_COUNTRY', 'findCountry', 'flagEmoji']) {
    const usado = new RegExp(`\\b${id}\\b`).test(form);
    const exportado = new RegExp(`export\\s+(const|function)\\s+${id}\\b`).test(spec);
    assert(!usado || (exportado && importados.has(id)), `countryPhones: ${id} usado ⇒ exportado e importado`);
  }
  // Sin duplicar la ruta exacta del formulario: la galería solo vive en :id.
  const app = readFileSync('src/App.tsx', 'utf8');
  const exactas = (app.match(/<Route path="\/rotary-en-accion" element/g) || []).length;
  assert(exactas === 1, 'una sola ruta exacta /rotary-en-accion (la del formulario)');
}

if (fails) { console.error(`${fails} fallos`); process.exit(1); }
console.log('rotary-en-accion: criterio OK');
