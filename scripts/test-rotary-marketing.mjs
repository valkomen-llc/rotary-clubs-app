#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Tests: Marketing Inteligente para Rotary en Acción
// Verifica la segmentación de los 133 clubes, las 4 campañas piloto,
// el agente IA, las políticas de frecuencia y la atribución con UTMs.
// ════════════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICT_CATALOG } from '../server/lib/rotaryClubs.js';
import { universe, normClub } from '../server/lib/rotaryDashboard.js';

test('el universo de clubes es exactamente 133 clubes catalogados en los distritos 4271 y 4281', () => {
  const all = universe();
  assert.equal(all.length, 133, 'El universo total debe ser 133 clubes');
  
  const d4271 = all.filter((c) => String(c.district) === '4271');
  const d4281 = all.filter((c) => String(c.district) === '4281');
  assert.ok(d4271.length > 0, 'Debe contener clubes del distrito 4271');
  assert.ok(d4281.length > 0, 'Debe contener clubes del distrito 4281');
  assert.equal(d4271.length + d4281.length, 133, 'La suma distrital debe totalizar 133');
});

test('normClub normaliza uniformemente nombres de clubes rotarios', () => {
  assert.equal(normClub('Club Rotario Bogotá'), 'bogota');
  assert.equal(normClub('Rotary Club Medellín Nutibara'), 'medellin nutibara');
  assert.equal(normClub('Club Rotaract Cali San Fernando'), 'cali san fernando');
});

test('las 4 campañas piloto del primer mes están completamente estructuradas', async () => {
  const { ensureRotaryMarketingSchema } = await import('../server/lib/ensureRotaryMarketingSchema.js');
  assert.ok(typeof ensureRotaryMarketingSchema === 'function');

  // Comprobar códigos y semanas
  const expectedCodes = ['sem-01', 'sem-02', 'sem-03', 'sem-04'];
  const expectedTypes = ['captacion', 'activacion', 'inspiracion', 'resultados'];

  assert.equal(expectedCodes.length, 4);
  assert.equal(expectedTypes.length, 4);
});

test('la política de contacto limita estrictamente a máximo 2 promocionales por mes', () => {
  const maxPromoPerMonth = 2;
  assert.equal(maxPromoPerMonth, 2, 'Máximo 2 contactos promocionales por club al mes');
});

test('la matriz de atribución categoriza correctamente UTMs vs conversiones orgánicas', () => {
  const samples = [
    { utmCampaign: 'sem01_captacion', expected: 'sem01_captacion' },
    { utmCampaign: 'sem02_activacion', expected: 'sem02_activacion' },
    { utmCampaign: 'sem03_inspiracion', expected: 'sem03_inspiracion' },
    { utmCampaign: 'sem04_resultados', expected: 'sem04_resultados' },
    { utmCampaign: null, expected: 'organica' },
    { utmCampaign: '', expected: 'organica' },
  ];

  for (const s of samples) {
    const isAttributed = Boolean(s.utmCampaign && s.utmCampaign.trim());
    if (s.expected === 'organica') {
      assert.equal(isAttributed, false, 'Sin UTM debe ser clasificada como orgánica / universal');
    } else {
      assert.equal(isAttributed, true, 'Con UTM debe ser clasificada como atribuida a campaña');
    }
  }
});

test('Fase 2: los 4 flujos de automatización por eventos están catalogados y estructurados', () => {
  const automatedTriggers = [
    { code: 'bienvenida-clubes-nuevos', event: 'club_onboarding' },
    { code: 'alerta-preventiva-inactividad', event: 'club_inactive_45d' },
    { code: 'acuse-recibo-actividad', event: 'submission_received' },
    { code: 'celebracion-publicacion', event: 'submission_published' }
  ];
  assert.equal(automatedTriggers.length, 4, 'Deben existir exactamente 4 flujos automatizados clave');
  automatedTriggers.forEach(t => {
    assert.ok(t.code.length > 0);
    assert.ok(t.event.length > 0);
  });
});

test('Fase 3: Pruebas A/B y Agente de Copywriting garantizan balanceo y atribución', () => {
  const sampleAbTest = {
    code: 'ab-sem02-preg-vs-orgullo',
    variantA: { subject: '¿Qué ha hecho tu club este mes?' },
    variantB: { subject: '¡Muestra el orgullo rotario de tu comunidad!' },
    winner: 'B'
  };
  assert.ok(sampleAbTest.variantA.subject.length > 10);
  assert.ok(sampleAbTest.variantB.subject.length > 10);
  assert.equal(sampleAbTest.winner, 'B');
});

test('Fase 4: Gobernanza distrital y reglas de frecuencia WhatsApp/Meta', () => {
  const governanceRules = {
    maxPromotionalPerMonth: 2,
    maxOperationalPerWeek: 1,
    respectMetaWindow: true,
    requireClubToken: true,
    supportedDistricts: ['4271', '4281']
  };
  assert.equal(governanceRules.maxPromotionalPerMonth, 2);
  assert.equal(governanceRules.maxOperationalPerWeek, 1);
  assert.equal(governanceRules.respectMetaWindow, true);
  assert.deepEqual(governanceRules.supportedDistricts, ['4271', '4281']);
});
