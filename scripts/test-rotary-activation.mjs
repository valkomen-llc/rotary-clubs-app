// ════════════════════════════════════════════════════════════════════════════
// Suite de Pruebas: Embudo de Activación de Clubes — Rotary en Acción
// Valida resolución dinámica de URLs multisitio, trazabilidad UTM, catálogo y CRM.
// ════════════════════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSiteActivarClubUrl, renderDesignToHtml, makeBlock } from '../src/lib/emailBlocks.ts';
import { ACTIVATION_INTERESTS, ROTARY_ROLES } from '../server/controllers/rotaryActivationController.js';

test('1. Resolución inteligente de URL para la landing /activar-mi-club', () => {
  // Distrito 4281: Mapea al dominio público verificado
  const urlD4281 = resolveSiteActivarClubUrl({ domain: 'rotary4281.org', isMainPlatform: false });
  assert.equal(urlD4281, 'https://rotary4281.org/activar-mi-club');

  // Subdominio técnico de plataforma del Distrito 4281: Debe resolver a rotary4281.org
  const urlD4281Sub = resolveSiteActivarClubUrl({ domain: 'distrito-4281-de-rotary-international.clubplatform.org' });
  assert.equal(urlD4281Sub, 'https://rotary4281.org/activar-mi-club');

  // Club con dominio personalizado
  const urlClub = resolveSiteActivarClubUrl({ domain: 'rotarycali.org', isMainPlatform: false });
  assert.equal(urlClub, 'https://rotarycali.org/activar-mi-club');

  // Con parámetros UTM y de campaña
  const urlConUtm = resolveSiteActivarClubUrl(
    { domain: 'rotary4281.org' },
    { utm_source: 'email_marketing', utm_medium: 'campaign', utm_campaign: 'cta_club_platform', ref: 'sem-01' }
  );
  assert.ok(urlConUtm.startsWith('https://rotary4281.org/activar-mi-club?'));
  assert.ok(urlConUtm.includes('utm_source=email_marketing'));
  assert.ok(urlConUtm.includes('utm_campaign=cta_club_platform'));
  assert.ok(urlConUtm.includes('ref=sem-01'));
});

test('2. Catálogo de roles e intereses de activación', () => {
  assert.ok(ACTIVATION_INTERESTS.length >= 6, 'Debe incluir al menos 6 categorías clave de interés');
  assert.ok(ACTIVATION_INTERESTS.some(i => i.id === 'ecosistema_integral'));
  assert.ok(ACTIVATION_INTERESTS.some(i => i.id === 'sitio_web'));
  assert.ok(ACTIVATION_INTERESTS.some(i => i.id === 'rotary_en_accion'));

  assert.ok(ROTARY_ROLES.includes('Presidente(a)'));
  assert.ok(ROTARY_ROLES.includes('Secretario(a)'));
  assert.ok(ROTARY_ROLES.includes('Presidente(a) Comité Imagen Pública'));
});

test('3. Bloque Promocional Club Platform en Plantilla Maestra dirige a landing del sitio', () => {
  const cpCtaBlock = {
    ...makeBlock('global'),
    globalKey: 'club_platform_cta',
    enabled: true,
    title: '¡Activa el ecosistema digital de tu club!',
    subtitle: 'Conecta, comunica y potencia el impacto de tu club con Club Platform.',
    buttonText: 'ACTIVAR MI CLUB',
    buttonHref: '{{activar_club_url}}',
    buttonBg: '#f7a81b',
    buttonColor: '#0c2340',
    bgColor: '#013388'
  };

  const design = {
    version: 1,
    settings: { font: "'Open Sans', Helvetica, Arial, sans-serif", bg: '#0d233a', contentBg: '#ffffff', textColor: '#334155', linkColor: '#013388', width: 600 },
    blocks: [cpCtaBlock]
  };

  const siteContext = {
    domain: 'rotary4281.org',
    siteName: 'Distrito 4281',
    isMainPlatform: false
  };

  const html = renderDesignToHtml(design, { interactive: false, siteContext });
  assert.ok(html.includes('https://rotary4281.org/activar-mi-club?utm_source='), 'El botón debe resolver a la landing pública /activar-mi-club del sitio');
  assert.ok(html.includes('ACTIVAR MI CLUB'), 'Debe contener el texto del botón');
});
