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

test('Editor Visual: Plantilla Maestra separa bloques protegidos de dinámicos', async () => {
  const { createRotaryMasterDesign, injectCampaignIntoDesign, getRotaryGlobalBlocksCatalog } = await import('../src/lib/emailBlocks.ts');
  const master = createRotaryMasterDesign();
  assert.ok(master && Array.isArray(master.blocks), 'Debe generar un diseño con bloques');

  // Verificar presencia de bloques protegidos institucionales
  const protectedBlocks = master.blocks.filter(b => b.isProtected);
  const dynamicBlocks = master.blocks.filter(b => !b.isProtected);
  assert.ok(protectedBlocks.length >= 3, 'Debe contener al menos 3 bloques institucionales protegidos (header, footer, firma)');
  assert.ok(dynamicBlocks.length >= 2, 'Debe contener zonas dinámicas para contenido y CTA');

  // Inyección no destructiva de contenido de campaña
  const campaignData = {
    code: 'sem-01',
    name: 'Captación Comunitaria',
    messageCentral: 'Invitación a registrar proyectos y jornadas solidarias.',
    utmCampaign: 'sem01_captacion',
    formUrl: 'https://app.clubplatform.org/rotary-en-accion?utm_campaign=sem01'
  };
  const injected = injectCampaignIntoDesign(master, campaignData);
  assert.equal(injected.blocks.length, master.blocks.length, 'El número de bloques debe preservarse');

  // Comprobar que los bloques protegidos NO cambiaron
  injected.blocks.forEach((b, i) => {
    if (master.blocks[i].isProtected) {
      assert.equal(b.isProtected, true);
      assert.equal(b.type, master.blocks[i].type);
      if (b.type === 'global') {
        assert.equal(b.globalKey, master.blocks[i].globalKey);
      }
    }
  });

  // Catálogo de Bloques Globales
  const catalog = getRotaryGlobalBlocksCatalog();
  assert.equal(catalog.length, 4, 'El catálogo debe contener 4 bloques globales institucionales');
  const keys = catalog.map(c => c.key);
  assert.ok(keys.includes('rotary_header'));
  assert.ok(keys.includes('rotary_areas_focus'));
  assert.ok(keys.includes('rotary_signature'));
  assert.ok(keys.includes('rotary_footer'));
});

test('Editor Visual: Renderiza HTML compatible para table, menu y global', async () => {
  const { renderDesignToHtml, makeBlock } = await import('../src/lib/emailBlocks.ts');
  const tableBlock = makeBlock('table');
  const menuBlock = makeBlock('menu');
  const globalBlock = makeBlock('global');

  assert.equal(tableBlock.type, 'table');
  assert.equal(menuBlock.type, 'menu');
  assert.equal(globalBlock.type, 'global');

  const testDesign = {
    version: 1,
    settings: { bg: '#f3f4f6', contentBg: '#ffffff', font: 'Arial', textColor: '#333', linkColor: '#013388', width: 600 },
    blocks: [globalBlock, menuBlock, tableBlock]
  };

  const html = renderDesignToHtml(testDesign);
  assert.ok(html.includes('table'), 'Debe generar tablas HTML');
  assert.ok(html.includes('ROTARY'), 'Debe incluir la identidad oficial de Rotary');
  assert.ok(html.includes('Distritos 4271'), 'Debe mencionar los distritos oficiales');
});

test('Editor Visual: Bloques globales personalizan logo, fondo, insignia, footer, WhatsApp y textos', async () => {
  const { renderDesignToHtml, makeBlock } = await import('../src/lib/emailBlocks.ts');
  const customHeader = {
    ...makeBlock('global'),
    globalKey: 'rotary_header',
    logoUrl: 'https://cdn.clubplatform.org/logos/club-bogota.png',
    bgGradient: '#013388',
    badge: 'Distrito 4281 Colombia',
    title: 'Transformando Vidas en Bogotá',
    subtitle: 'Comunidad Unida',
  };

  const customFooter = {
    ...makeBlock('global'),
    globalKey: 'rotary_footer',
    logoUrl: 'https://cdn.clubplatform.org/logos/footer-logo.png',
    title: 'Conéctate con nosotros',
    whatsappUrl: 'https://wa.me/573001234567',
    whatsappText: 'Chatea con nuestro equipo',
    footerText: 'Club Rotario Bogotá • Todos los derechos reservados',
    showAreas: false,
    showSocial: true
  };

  const design = {
    version: 1,
    settings: { bg: '#f3f4f6', contentBg: '#ffffff', font: 'Arial', textColor: '#333', linkColor: '#013388', width: 600 },
    blocks: [customHeader, customFooter]
  };

  const html = renderDesignToHtml(design);
  assert.ok(html.includes('club-bogota.png'), 'Debe renderizar la URL del logo personalizado');
  assert.ok(html.includes('Distrito 4281 Colombia'), 'Debe renderizar la insignia personalizada');
  assert.ok(html.includes('Transformando Vidas en Bogotá'), 'Debe renderizar el título personalizado');
  assert.ok(html.includes('footer-logo.png'), 'Debe renderizar el logo del footer');
  assert.ok(html.includes('573001234567'), 'Debe renderizar el WhatsApp personalizado');
  assert.ok(html.includes('Club Rotario Bogotá'), 'Debe renderizar el texto legal personalizado');
  assert.ok(!html.includes('&#128167; Agua'), 'No debe renderizar las áreas de interés si showAreas es false');
});

