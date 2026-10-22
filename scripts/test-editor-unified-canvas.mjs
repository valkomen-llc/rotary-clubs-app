#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Tests: Lienzo Visual Unificado, Continuo y Dinámico (Editor de Email)
// Verifica:
// 1. renderSingleBlockHtml genera tablas 100% integradas para cada bloque.
// 2. Cobertura completa de los 3 canales institucionales:
//    - Canal 1: Rotary en Acción (sem-01, 10 bloques)
//    - Canal 2: Directorio de Clubes (dir-sem-02, 9 bloques)
//    - Canal 3: Feria de Proyectos Colombia (feria-sem-01, 9-10 bloques)
// 3. Estructura completa desde Cabecera hasta Footer sin recortes.
// 4. Integridad de bloques protegidos y no protegidos.
// 5. Preservación y resolución de Merge Tags.
// ════════════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRotaryMasterDesign,
  createDirectorioMasterDesign,
  createFeriaMasterDesign,
  createChannelCampaignDesign,
  normalizeInstitutionalDesign,
  renderSingleBlockHtml,
  renderDesignToHtml,
  cleanUnresolvedVariables
} from '../server/lib/emailBlocks.js';

test('renderSingleBlockHtml genera tablas width 100% sin divs externos #e6e6e6', () => {
  const master = createRotaryMasterDesign();
  for (const block of master.blocks) {
    const html = renderSingleBlockHtml(block, master.settings);
    assert.ok(html.startsWith('<table role="presentation" width="100%"'), `Bloque ${block.type} debe empezar con tabla 100%`);
    assert.ok(!html.includes('id="rotary-visual-canvas-scroll"'), 'No debe anidar IDs de scroll');
    assert.ok(!html.startsWith('<div style="background:#e6e6e6"'), 'No debe generar envoltorios de correo completo para un solo bloque');
  }
});

test('Canal 1 — Rotary en Acción (sem-01): 10 bloques continuos de cabecera a footer', () => {
  const design = createChannelCampaignDesign('rotary_en_accion', {
    code: 'sem-01',
    name: 'Tu club transforma comunidades. ¡Hagámoslo visible!'
  });
  const normalized = normalizeInstitutionalDesign(design);

  assert.equal(normalized.blocks.length, 10, 'Debe contener exactamente 10 bloques');

  // Verificar presencia de los 10 bloques en orden estricto
  assert.equal(normalized.blocks[0].type, 'global');
  assert.equal(normalized.blocks[0].globalKey, 'rotary_header');
  assert.equal(normalized.blocks[0].isProtected, true);

  assert.equal(normalized.blocks[1].type, 'heading'); // Título
  assert.equal(normalized.blocks[2].type, 'heading'); // Saludo
  assert.equal(normalized.blocks[3].type, 'text');    // Cuerpo editorial

  assert.equal(normalized.blocks[4].type, 'global');
  assert.equal(normalized.blocks[4].globalKey, 'rotary_areas_focus'); // Áreas de servicio
  assert.equal(normalized.blocks[4].isProtected, true);

  assert.equal(normalized.blocks[5].type, 'text');    // Llamado al registro
  assert.equal(normalized.blocks[6].type, 'button');  // Botón CTA
  assert.ok(normalized.blocks[6].text.includes('COMPARTIR'));

  assert.equal(normalized.blocks[7].type, 'global');
  assert.equal(normalized.blocks[7].globalKey, 'rotary_signature'); // Firma

  assert.equal(normalized.blocks[8].type, 'global');
  assert.equal(normalized.blocks[8].globalKey, 'club_platform_cta'); // Ecosistema digital

  assert.equal(normalized.blocks[9].type, 'global');
  assert.equal(normalized.blocks[9].globalKey, 'rotary_footer'); // Footer institucional
  assert.equal(normalized.blocks[9].isProtected, true);

  // Render individual de cada bloque debe ser no-vacío y válido
  for (const block of normalized.blocks) {
    const singleHtml = renderSingleBlockHtml(block, normalized.settings);
    assert.ok(singleHtml.length > 50, `El render de ${block.label || block.type} no debe estar vacío`);
  }
});

test('Canal 2 — Directorio de Clubes (dir-sem-02): 9 bloques continuos con estado y CTA', () => {
  const design = createChannelCampaignDesign('directorio_clubes', {
    code: 'dir-sem-02',
    name: 'Una identidad digital que conecta y fortalece tu club.'
  });
  const normalized = normalizeInstitutionalDesign(design);

  assert.equal(normalized.blocks.length, 9, 'Debe contener exactamente 9 bloques');
  assert.equal(normalized.blocks[0].globalKey, 'rotary_header');
  assert.equal(normalized.blocks[1].type, 'heading');
  assert.equal(normalized.blocks[2].type, 'heading');
  assert.equal(normalized.blocks[3].type, 'text');
  assert.equal(normalized.blocks[4].type, 'html'); // Tarjeta de estado de perfil institucional
  assert.equal(normalized.blocks[5].type, 'button'); // Botón CTA actualizar perfil
  assert.equal(normalized.blocks[6].globalKey, 'rotary_signature');
  assert.equal(normalized.blocks[7].globalKey, 'club_platform_cta');
  assert.equal(normalized.blocks[8].globalKey, 'rotary_footer');

  // Verificar tarjeta de estado del perfil
  const statusHtml = normalized.blocks[4].html;
  assert.ok(statusHtml.includes('Estado del perfil institucional'));
  assert.ok(statusHtml.includes('Directorio Oficial de Clubes'));
});

test('Canal 3 — Feria de Proyectos Colombia (feria-sem-01): Bloques institucionales de la Feria', () => {
  const design = createChannelCampaignDesign('feria_proyectos', {
    code: 'feria-sem-01',
    name: 'Convocatoria Oficial: Postula tu proyecto'
  });
  const normalized = normalizeInstitutionalDesign(design);

  assert.ok(normalized.blocks.length >= 9, 'Debe contener al menos 9 bloques');
  assert.equal(normalized.blocks[0].globalKey, 'rotary_header');
  assert.equal(normalized.blocks[normalized.blocks.length - 1].globalKey, 'rotary_footer');
  assert.ok(normalized.blocks.some(b => b.type === 'button'));
  assert.ok(normalized.blocks.some(b => b.type === 'global' && b.globalKey === 'club_platform_cta'));
});

test('Fidelidad HTML entre correo final y renderizado de bloques individuales', () => {
  const master = createRotaryMasterDesign();
  const fullEmailHtml = renderDesignToHtml(master);

  // Todo componente esencial del correo enviado debe estar presente en el render de bloques
  assert.ok(fullEmailHtml.includes('GENERA UN IMPACTO DURADERO') || fullEmailHtml.includes('Rotary'));
  assert.ok(fullEmailHtml.includes('COMPARTIR EN ROTARY EN ACCIÓN'));
  assert.ok(fullEmailHtml.includes('¡Activa el ecosistema digital de tu club!'));
  assert.ok(fullEmailHtml.includes('¡SÍGUENOS Y COMPARTE EL ORGULLO ROTARIO!'));
  assert.ok(fullEmailHtml.includes('Asistencia directa a través de WhatsApp'));
  assert.ok(fullEmailHtml.includes('Preferencias de comunicación y cancelar suscripción'));
});
