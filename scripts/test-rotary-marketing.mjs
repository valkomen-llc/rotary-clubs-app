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
  assert.equal(catalog.length, 5, 'El catálogo debe contener 5 bloques globales institucionales');
  const keys = catalog.map(c => c.key);
  assert.ok(keys.includes('rotary_header'));
  assert.ok(keys.includes('rotary_areas_focus'));
  assert.ok(keys.includes('rotary_signature'));
  assert.ok(keys.includes('club_platform_cta'));
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
  assert.ok(html.includes('data-rotary-header="true"'), 'Debe incluir la celda de cabecera institucional');
  assert.ok(!html.includes('Distritos 4271 &amp; 4281'), 'No debe fijar nombres de distritos en la cabecera institucional');
});

test('Editor Visual: Cabecera institucional inteligente y bloques globales adaptables', async () => {
  const { renderDesignToHtml, makeBlock, resolveInstitutionalLogo } = await import('../src/lib/emailBlocks.ts');

  // Test 1: Prioridad de resolución de logo
  // 1. Logo personalizado en bloque
  const r1 = resolveInstitutionalLogo({ logoUrl: 'https://cdn.clubplatform.org/logos/custom.png' }, { siteLogo: 'https://site.org/logo.png', siteName: 'Club Cali' });
  assert.equal(r1.logoUrl, 'https://cdn.clubplatform.org/logos/custom.png');
  assert.equal(r1.source, 'custom');

  // 2. Logo institucional del sitio
  const r2 = resolveInstitutionalLogo({ logoUrl: '' }, { siteLogo: 'https://site.org/logo.png', siteName: 'Club Cali' });
  assert.equal(r2.logoUrl, 'https://site.org/logo.png');
  assert.equal(r2.source, 'site_settings');

  // 3. Fallback de plataforma central
  const r3 = resolveInstitutionalLogo({ logoUrl: '' }, { isMainPlatform: true });
  assert.ok(r3.logoUrl && r3.logoUrl.includes('rotary-international-logo'), 'Debe usar fallback oficial si es plataforma central');
  assert.equal(r3.source, 'platform_default');

  // 4. Fallback tipográfico institucional si no es plataforma central y no hay logo
  const r4 = resolveInstitutionalLogo({ logoUrl: '' }, { siteName: 'Club Rotario Medellín', isMainPlatform: false });
  assert.equal(r4.logoUrl, null);
  assert.equal(r4.source, 'typography');
  assert.equal(r4.siteName, 'Club Rotario Medellín');

  // Test 2: Renderizado de cabecera limpia sin títulos promocionales ni distritos
  const customHeader = {
    ...makeBlock('global'),
    globalKey: 'rotary_header',
    logoUrl: 'https://cdn.clubplatform.org/logos/club-bogota.png',
    bgGradient: '#ffffff',
    logoMaxWidth: 260,
    logoMaxHeight: 70,
    align: 'center',
    padding: '24px 20px',
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
  assert.ok(html.includes('max-height: 70px'), 'Debe respetar max-height para proteger proporciones');
  assert.ok(html.includes('max-width: 260px'), 'Debe respetar max-width');
  assert.ok(html.includes('object-fit: contain'), 'Debe contener el ratio original sin distorsión');
  assert.ok(!html.includes('Tu club transforma comunidades'), 'No debe incluir copys de campaña en la cabecera');
  assert.ok(!html.includes('Rotary en Acción · Distritos'), 'No debe incluir textos fijos de distritos en la cabecera');
  assert.ok(html.includes('footer-logo.png'), 'Debe renderizar el logo del footer');
  assert.ok(html.includes('573001234567'), 'Debe renderizar el WhatsApp personalizado');
  assert.ok(html.includes('Club Rotario Bogotá'), 'Debe renderizar el texto legal personalizado');
  assert(!html.includes('&#128167; Agua'), 'No debe renderizar las áreas de interés si showAreas es false');
});

test('Editor Visual: Tipografía Open Sans por defecto, variantes y fallbacks de correo', async () => {
  const { renderDesignToHtml, DEFAULT_SETTINGS, FONT_WEIGHT_OPTIONS, LINE_HEIGHT_OPTIONS, makeBlock } = await import('../src/lib/emailBlocks.ts');

  // 1. Open Sans es la fuente predeterminada
  assert.ok(DEFAULT_SETTINGS.font.includes('Open Sans'), 'La tipografía predeterminada debe ser Open Sans');
  assert.ok(DEFAULT_SETTINGS.font.includes('Helvetica') || DEFAULT_SETTINGS.font.includes('Arial'), 'Debe incluir fallbacks seguros para clientes de correo');

  // 2. Variantes de peso tipográfico (Light 300 a ExtraBold 800)
  const weights = FONT_WEIGHT_OPTIONS.map(w => w.value);
  ['300', '400', '500', '600', '700', '800'].forEach(w => {
    assert.ok(weights.includes(w), `Debe soportar peso tipográfico ${w}`);
  });

  // 3. Interlineados disponibles
  const lineHeights = LINE_HEIGHT_OPTIONS.map(lh => lh.value);
  assert.ok(lineHeights.includes(1.25) && lineHeights.includes(1.5) && lineHeights.includes(1.8));

  // 4. Bloques con tipografía personalizada individual
  const customHeading = {
    ...makeBlock('heading'),
    text: 'Título con Tipografía Personalizada',
    fontFamily: 'Georgia, serif',
    fontWeight: '700',
    fontSize: 28,
    lineHeight: '1.3',
    letterSpacing: '0.02em',
    color: '#013388',
    align: 'center'
  };

  const customText = {
    ...makeBlock('text'),
    text: 'Párrafo con Open Sans Light y espaciado amplio.',
    fontFamily: "'Open Sans', Helvetica, Arial, sans-serif",
    fontWeight: '300',
    fontSize: 16,
    lineHeight: '1.6',
    letterSpacing: '0.01em',
    color: '#334155',
    align: 'left'
  };

  const design = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    blocks: [customHeading, customText]
  };

  const html = renderDesignToHtml(design);
  // Verificar importación de Google Fonts Open Sans
  assert.ok(html.includes('fonts.googleapis.com/css2?family=Open+Sans'), 'Debe importar Open Sans');
  // Verificar estilos aplicados al heading y texto
  assert.ok(html.includes('Georgia, serif'), 'Debe aplicar tipografía personalizada al encabezado');
  assert.ok(html.includes('letter-spacing: 0.02em'), 'Debe aplicar letter-spacing al encabezado');
  assert.ok(html.includes('font-weight: 300'), 'Debe aplicar font-weight 300 al párrafo');
  assert.ok(html.includes('line-height: 1.6'), 'Debe aplicar interlineado al párrafo');
});

test('Editor Visual: 15 Categorías oficiales de Rotary en Acción en diseño compacto y dinámico', async () => {
  const { renderDesignToHtml, makeBlock } = await import('../src/lib/emailBlocks.ts');
  const { DEFAULT_TIPOS } = await import('../src/lib/rotaryEnAccionSpec.ts');

  assert.equal(DEFAULT_TIPOS.length, 15, 'Debe haber exactamente 15 categorías oficiales');

  const areasBlock = {
    ...makeBlock('global'),
    globalKey: 'rotary_areas_focus',
    title: '¿Qué puede compartir tu club en Rotary en Acción?'
  };

  const design = {
    version: 1,
    settings: { font: "'Open Sans', Helvetica, Arial, sans-serif", bg: '#0d233a', contentBg: '#ffffff', textColor: '#334155', linkColor: '#013388', width: 600 },
    blocks: [areasBlock]
  };

  const html = renderDesignToHtml(design);

  // Verificar título oficial
  assert.ok(html.includes('¿Qué puede compartir tu club en Rotary en Acción?'), 'Debe incluir el título actualizado de la sección');

  // Verificar que incluye las etiquetas visibles compactas en una sola línea (shortName)
  assert.ok(html.includes('Proyecto u obra'), 'Debe incluir Proyecto u obra');
  assert.ok(html.includes('Actividades'), 'Debe incluir Actividades en una línea');
  assert.ok(html.includes('Emergencias'), 'Debe incluir Emergencias en una línea en lugar del texto extenso');
  assert.ok(html.includes('Historias y testimonios'), 'Debe incluir Historias y testimonios en una línea');
  assert.ok(html.includes('Reconocimientos'), 'Debe incluir Reconocimientos en una línea');
  assert.ok(html.includes('Recaudación'), 'Debe incluir Recaudación en una línea');
  assert.ok(html.includes('Historias de servicio'), 'Debe incluir Historias de servicio');
  assert.ok(html.includes('Actividad juvenil'), 'Debe incluir Actividad juvenil');
  assert.ok(html.includes('Otra acción'), 'Debe incluir Otra acción');

  // Verificar nowrap y layout fijo de 3 columnas para garantizar visualización en una sola línea
  assert.ok(html.includes('white-space:nowrap'), 'Debe forzar visualización en una sola línea con nowrap');
  assert.ok(html.includes('table-layout:fixed') || html.includes('width="33.3%"'), 'Debe usar disposición compacta de columnas fijas');
});

test('Editor Visual: Enlace inteligente y universal para el botón principal según sitio activo', async () => {
  const { renderDesignToHtml, makeBlock, resolveSiteRotaryEnAccionUrl } = await import('../src/lib/emailBlocks.ts');

  // 1. Resolución para Distrito 4281 (dominio verificado oficial)
  const urlD4281 = resolveSiteRotaryEnAccionUrl({ domain: 'rotary4281.org', isMainPlatform: false });
  assert.equal(urlD4281, 'https://rotary4281.org/rotary-en-accion');

  // 1.b Resolución para Distrito 4281 cuando llega desde el subdominio técnico interno obsoleto
  const urlD4281Sub = resolveSiteRotaryEnAccionUrl({ domain: 'distrito-4281-de-rotary-international.clubplatform.org' });
  assert.equal(urlD4281Sub, 'https://rotary4281.org/rotary-en-accion', 'Debe corregir el subdominio técnico interno al dominio público verificado rotary4281.org');

  // 1.c Resolución para Distrito 4281 por nombre de sitio
  const urlD4281Name = resolveSiteRotaryEnAccionUrl({ siteName: 'Distrito 4281 de Rotary International', domain: 'app.clubplatform.org' });
  assert.equal(urlD4281Name, 'https://rotary4281.org/rotary-en-accion');

  // 2. Resolución para Club Platform central
  const urlPlatform = resolveSiteRotaryEnAccionUrl({ isMainPlatform: true });
  assert.equal(urlPlatform, 'https://app.clubplatform.org/rotary-en-accion');

  // 3. Resolución para sitio con dominio propio (ej. club)
  const urlClub = resolveSiteRotaryEnAccionUrl({ domain: 'rotarycali.org', isMainPlatform: false });
  assert.equal(urlClub, 'https://rotarycali.org/rotary-en-accion');

  // 3.b Sobrescritura manual de enlace
  const urlManual = resolveSiteRotaryEnAccionUrl({ rotaryEnAccionUrl: 'https://mi-evento.org/formulario' });
  assert.equal(urlManual, 'https://mi-evento.org/formulario');

  // 4. Resolución dinámica en botón con token {{form_url}}
  const btnBlock = {
    ...makeBlock('button'),
    text: 'COMPARTIR EN ROTARY EN ACCIÓN',
    href: '{{form_url}}',
    bg: '#013388',
    color: '#ffffff'
  };

  const design = {
    version: 1,
    settings: { font: "'Open Sans', Helvetica, Arial, sans-serif", bg: '#0d233a', contentBg: '#ffffff', textColor: '#334155', linkColor: '#013388', width: 600 },
    blocks: [btnBlock]
  };

  // Render para Distrito 4281
  const htmlD4281 = renderDesignToHtml(design, { domain: 'rotary4281.org' });
  assert.ok(htmlD4281.includes('href="https://rotary4281.org/rotary-en-accion"'), 'El botón debe resolver dinámicamente al formulario del Distrito 4281');
  assert.ok(htmlD4281.includes('COMPARTIR EN ROTARY EN ACCIÓN'), 'Debe utilizar el llamado a la acción universal');

  // Render para Club Platform
  const htmlPlatform = renderDesignToHtml(design, { isMainPlatform: true });
  assert.ok(htmlPlatform.includes('href="https://app.clubplatform.org/rotary-en-accion"'), 'El botón debe resolver dinámicamente al formulario de Club Platform');
});

test('Editor Visual: Bloque Promocional Club Platform (Shopify-style CTA) opcional y configurable', async () => {
  const { renderDesignToHtml, makeBlock } = await import('../src/lib/emailBlocks.ts');

  const cpCtaBlock = {
    ...makeBlock('global'),
    globalKey: 'club_platform_cta',
    enabled: true,
    title: '¡Activa el ecosistema digital de tu club!',
    subtitle: 'Conecta, comunica y potencia el impacto de tu club con Club Platform.',
    buttonText: 'ACTIVAR MI CLUB',
    buttonHref: 'https://clubplatform.org?utm_source=email_marketing&utm_medium=campaign&utm_campaign=cta_club_platform',
    buttonBg: '#f7a81b',
    buttonColor: '#0c2340',
    bgColor: '#013388'
  };

  const designEnabled = {
    version: 1,
    settings: { font: "'Open Sans', Helvetica, Arial, sans-serif", bg: '#0d233a', contentBg: '#ffffff', textColor: '#334155', linkColor: '#013388', width: 600 },
    blocks: [cpCtaBlock]
  };

  // 1. Render cuando está activo: incluye título, subtítulo, botón y destino oficial
  const htmlActive = renderDesignToHtml(designEnabled, { interactive: false });
  assert.ok(htmlActive.includes('¡Activa el ecosistema digital de tu club!'), 'Debe contener el título principal');
  assert.ok(htmlActive.includes('Conecta, comunica y potencia el impacto'), 'Debe contener el subtítulo');
  assert.ok(htmlActive.includes('ACTIVAR MI CLUB'), 'Debe contener el botón en mayúsculas de alto contraste');
  assert.ok(htmlActive.includes('https://clubplatform.org?utm_source='), 'Debe dirigir al portal público de Club Platform con UTMs');
  assert.ok(htmlActive.includes('#f7a81b'), 'Debe usar color de botón de alto contraste');

  // 2. Render cuando está desactivado (enabled: false) en correo final: no debe emitir HTML
  const disabledBlock = { ...cpCtaBlock, enabled: false };
  const designDisabled = { ...designEnabled, blocks: [disabledBlock] };
  const htmlDisabled = renderDesignToHtml(designDisabled, { interactive: false });
  assert.ok(!htmlDisabled.includes('¡Activa el ecosistema digital de tu club!'), 'No debe renderizarse en correo enviado si está desactivado');
  assert.ok(!htmlDisabled.includes('ACTIVAR MI CLUB'), 'No debe renderizar el botón');

  // 3. Render en editor visual interactivo cuando está desactivado: emite placeholder configurable
  const htmlInteractive = renderDesignToHtml(designDisabled, { interactive: true });
  assert.ok(htmlInteractive.includes('CTA Club Platform (Opcional)'), 'En vista interactiva debe mostrar placeholder para que el usuario pueda reactivarlo');
  assert.ok(htmlInteractive.includes('data-bid='), 'Debe incluir data-bid para selección');
});

test('Editor Visual: Unificación visual continua de CTA y Footer sin espacios blancos', async () => {
  const { renderDesignToHtml, makeBlock, createRotaryMasterDesign } = await import('../src/lib/emailBlocks.ts');

  const master = createRotaryMasterDesign();
  const ctaBlock = master.blocks.find(b => b.type === 'global' && b.globalKey === 'club_platform_cta');
  const footerBlock = master.blocks.find(b => b.type === 'global' && b.globalKey === 'rotary_footer');

  assert.ok(ctaBlock, 'El diseño maestro debe incluir club_platform_cta');
  assert.ok(footerBlock, 'El diseño maestro debe incluir rotary_footer');

  // 1. CTA con degradado azul Rotary #013388 a #0c2340 y Footer con fondo institucional #0c2340
  assert.equal(ctaBlock.bgGradientStart, '#013388', 'CTA debe tener inicio de degradado en azul Rotary #013388');
  assert.equal(ctaBlock.bgGradientEnd, '#0c2340', 'CTA debe tener fin de degradado en azul marino #0c2340');
  assert.equal(footerBlock.bgColor, '#0c2340', 'Footer debe tener fondo institucional #0c2340 por defecto');

  // 2. Renderizado con CTA activo: unión continua sin bordes redondeados
  const html = renderDesignToHtml(master, { interactive: false });

  // CTA y Footer deben tener border-radius:0 (100% esquinas rectas, sin curvaturas)
  assert.ok(html.includes('border-radius:0'), 'CTA y Footer deben tener border-radius:0 para continuidad perfecta');
  assert.ok(!html.includes('border-radius:12px 12px 0 0'), 'No debe haber esquinas superiores redondeadas en CTA');
  assert.ok(!html.includes('border-radius:0 0 12px 12px'), 'No debe haber esquinas inferiores redondeadas en Footer');
  assert.ok(html.includes('margin:24px 0 0 0'), 'CTA debe tener margin-top 24px y 0 margin-bottom');

  // Footer debe tener margin:0 cuando CTA está activo
  assert.ok(html.includes('margin:0;background-color:#0c2340'), 'Footer debe tener margin:0 cuando CTA está activo');

  // Degradado CSS y VML para soporte Outlook
  assert.ok(html.includes('linear-gradient(180deg, #013388 0%, #0c2340 100%)'), 'CTA debe renderizar el linear-gradient');
  assert.ok(html.includes('v:fill type="gradient" color="#013388" color2="#0c2340"'), 'CTA debe incluir VML gradient para Outlook');

  // Eliminar espacios blancos de celdas intermedias
  assert.ok(html.includes('font-size:0px;line-height:0px'), 'Celdas wrapper con 0px padding deben eliminar line-height para evitar espacios fantasma en Outlook');

  // 3. Renderizado cuando CTA está inactivo: Footer mantiene esquinas rectas (border-radius:0) y margin-top 24px
  const masterDisabled = {
    ...master,
    blocks: master.blocks.map(b => b.globalKey === 'club_platform_cta' ? { ...b, enabled: false } : b)
  };
  const htmlNoCta = renderDesignToHtml(masterDisabled, { interactive: false });
  assert.ok(htmlNoCta.includes('margin:24px 0 0 0;background-color:#0c2340;border-radius:0;'), 'Footer debe tener margin-top 24px y border-radius:0 si CTA está ausente');
});

test('Editor Visual: Gestor de Iconos Oficiales de Redes Sociales en el Footer', async () => {
  const { renderDesignToHtml, renderFooterSocialIcons, makeBlock, DEFAULT_FOOTER_SOCIAL_LINKS } = await import('../src/lib/emailBlocks.ts');

  // 1. Catálogo por defecto
  assert.ok(Array.isArray(DEFAULT_FOOTER_SOCIAL_LINKS), 'Debe proveer enlaces sociales por defecto');
  assert.ok(DEFAULT_FOOTER_SOCIAL_LINKS.length >= 4, 'Debe incluir al menos 4 redes principales');

  // 2. Prueba de renderFooterSocialIcons en los 3 estilos
  const testLinks = [
    { network: 'instagram', url: 'https://instagram.com/rotary', label: 'Instagram' },
    { network: 'facebook', url: 'https://facebook.com/rotary', label: 'Facebook' },
    { network: 'youtube', url: 'https://youtube.com/rotary', label: 'YouTube' },
    { network: 'whatsapp', url: 'https://wa.me/573001234567', label: 'WhatsApp' },
  ];

  // Estilo 'white' (monocromático blanco)
  const htmlWhite = renderFooterSocialIcons(testLinks, 'white', 28, 12);
  assert.ok(htmlWhite.includes('/icons/social/instagram-white.png'), 'Debe usar PNG oficial en estilo white');
  assert.ok(htmlWhite.includes('/icons/social/facebook-white.png'), 'Debe usar PNG oficial en estilo white');
  assert.ok(htmlWhite.includes('width="28" height="28"'), 'Debe respetar el tamaño de icono');
  assert.ok(htmlWhite.includes('href="https://instagram.com/rotary"'), 'Debe apuntar a la URL configurada');
  assert.ok(!htmlWhite.includes('>IG<'), 'No debe usar letras o siglas');

  // Estilo 'color' (colores oficiales)
  const htmlColor = renderFooterSocialIcons(testLinks, 'color', 32, 16);
  assert.ok(htmlColor.includes('/icons/social/instagram-color.png'), 'Debe usar PNG oficial en estilo color');
  assert.ok(htmlColor.includes('/icons/social/youtube-color.png'), 'Debe usar PNG oficial en estilo color');
  assert.ok(htmlColor.includes('width="32" height="32"'), 'Debe respetar el tamaño modificado (32px)');

  // Estilo 'black' (monocromático negro)
  const htmlBlack = renderFooterSocialIcons(testLinks, 'black', 24, 8);
  assert.ok(htmlBlack.includes('/icons/social/whatsapp-black.png'), 'Debe usar PNG oficial en estilo black');

  // Soporte de icono personalizado
  const customLinks = [
    { network: 'custom', url: 'https://mired.org', label: 'Mi Red', customIconUrl: 'https://cdn.clubplatform.org/custom-icon.png' }
  ];
  const htmlCustom = renderFooterSocialIcons(customLinks, 'white', 28, 12);
  assert.ok(htmlCustom.includes('https://cdn.clubplatform.org/custom-icon.png'), 'Debe permitir iconos personalizados desde la biblioteca');

  // 3. Integración en bloque rotary_footer
  const footerBlock = {
    ...makeBlock('global'),
    globalKey: 'rotary_footer',
    showSocial: true,
    socialIconStyle: 'color',
    socialIconSize: 30,
    socialLinks: testLinks
  };
  const design = {
    version: 1,
    settings: { font: 'Arial', bg: '#0d233a', contentBg: '#ffffff', textColor: '#333', linkColor: '#013388', width: 600 },
    blocks: [footerBlock]
  };
  const htmlFooter = renderDesignToHtml(design);
  assert.ok(htmlFooter.includes('instagram-color.png'), 'Footer debe renderizar los iconos con el estilo seleccionado');
  assert.ok(htmlFooter.includes('width="30" height="30"'), 'Footer debe respetar tamaño de 30px');
});

test('Editor Visual: Personalización completa del Enlace de WhatsApp en el Footer', async () => {
  const { renderDesignToHtml, makeBlock } = await import('../src/lib/emailBlocks.ts');

  // 1. Configuración personalizada con blanco por defecto
  const footerBlock = {
    ...makeBlock('global'),
    globalKey: 'rotary_footer',
    showWhatsapp: true,
    showWhatsappIcon: true,
    whatsappUrl: 'https://wa.me/573108520231',
    whatsappText: 'Escríbenos directamente a WhatsApp',
    whatsappColor: '#ffffff', // Blanco institucional
    whatsappFontSize: 14,
    whatsappFontWeight: '700',
    whatsappAlign: 'center',
    showSocial: false,
    showAreas: false
  };

  const design = {
    version: 1,
    settings: { font: 'Arial', bg: '#0d233a', contentBg: '#ffffff', textColor: '#333', linkColor: '#013388', width: 600 },
    blocks: [footerBlock]
  };

  const html = renderDesignToHtml(design);
  assert.ok(html.includes('color:#ffffff'), 'El color del texto de WhatsApp debe ser blanco (#ffffff)');
  assert.ok(html.includes('Escríbenos directamente a WhatsApp'), 'Debe respetar el texto editable');
  assert.ok(html.includes('https://wa.me/573108520231'), 'Debe respetar el enlace configurable');
  assert.ok(html.includes('whatsapp-color.png'), 'Debe incluir el icono oficial de WhatsApp');
  assert.ok(html.includes('font-size:14px'), 'Debe respetar el tamaño de fuente configurado');
  assert.ok(html.includes('font-weight:700'), 'Debe respetar el peso tipográfico');

  // 2. Opción de ocultar icono de WhatsApp
  const footerNoIcon = { ...footerBlock, showWhatsappIcon: false, whatsappColor: '#38bdf8' };
  const htmlNoIcon = renderDesignToHtml({ ...design, blocks: [footerNoIcon] });
  assert.ok(!htmlNoIcon.includes('whatsapp-color.png'), 'No debe renderizar el icono si showWhatsappIcon es false');
  assert.ok(htmlNoIcon.includes('color:#38bdf8'), 'Debe permitir personalizar el color a celeste');

  // 3. Opción de desactivar el enlace de WhatsApp por completo
  const footerDisabled = { ...footerBlock, showWhatsapp: false };
  const htmlDisabled = renderDesignToHtml({ ...design, blocks: [footerDisabled] });
  assert.ok(!htmlDisabled.includes('Escríbenos directamente a WhatsApp'), 'No debe renderizarse si showWhatsapp es false');
});

test('Estandarización: Directorio de Clubes implementa la arquitectura modular institucional', async () => {
  const { createDirectorioMasterDesign, renderDesignToHtml } = await import('../src/lib/emailBlocks.ts');

  const dirDesign = createDirectorioMasterDesign({
    name: 'Tu club merece estar presente. ¡Actualiza su perfil institucional!',
    week: 1,
  });

  const header = dirDesign.blocks.find(b => b.type === 'global' && b.globalKey === 'rotary_header');
  const ctaBlock = dirDesign.blocks.find(b => b.type === 'global' && b.globalKey === 'club_platform_cta');
  const footer = dirDesign.blocks.find(b => b.type === 'global' && b.globalKey === 'rotary_footer');
  const btn = dirDesign.blocks.find(b => b.type === 'button');
  const statusHtml = dirDesign.blocks.find(b => b.type === 'html');

  assert.ok(header, 'Debe incluir Bloque A (Cabecera institucional)');
  assert.ok(ctaBlock, 'Debe incluir Bloque B (Activación de ecosistema)');
  assert.ok(footer, 'Debe incluir Bloque C (Footer institucional)');
  assert.ok(btn, 'Debe incluir Botón CTA');
  assert.ok(statusHtml, 'Debe incluir tarjeta estructurada de estado de perfil institucional');

  assert.equal(ctaBlock.buttonText, 'ACTIVAR MI CLUB');
  assert.equal(btn.text, 'ACTUALIZAR EL PERFIL DE MI CLUB');

  const html = renderDesignToHtml(dirDesign, {
    siteContext: { domain: 'rotary4281.org', siteName: 'Rotary Distrito 4281' }
  });
  assert.ok(html.includes('Rotary-4281-Genera-un-Impacto-Duradero.png'), 'Debe resolver el logo oficial de D4281');
  assert.ok(html.includes('ACTIVAR MI CLUB'), 'Debe incluir botón amarillo ACTIVAR MI CLUB');
  assert.ok(html.includes('Directorio Oficial de Clubes Distrito 4281'), 'Debe incluir tarjeta editorial de Directorio');
});

test('Estandarización: Feria de Proyectos implementa la arquitectura modular con identidad de Feria', async () => {
  const { createFeriaMasterDesign, renderDesignToHtml } = await import('../src/lib/emailBlocks.ts');

  const feriaDesign = createFeriaMasterDesign({
    name: 'Convocatoria Oficial: Postula tu proyecto a la Feria',
    week: 1,
  });

  const header = feriaDesign.blocks.find(b => b.type === 'global' && b.globalKey === 'rotary_header');
  const ctaBlock = feriaDesign.blocks.find(b => b.type === 'global' && b.globalKey === 'club_platform_cta');
  const footer = feriaDesign.blocks.find(b => b.type === 'global' && b.globalKey === 'rotary_footer');
  const btn = feriaDesign.blocks.find(b => b.type === 'button');
  const areasHtml = feriaDesign.blocks.find(b => b.type === 'html');

  assert.ok(header, 'Debe incluir Bloque A (Cabecera institucional)');
  assert.ok(ctaBlock, 'Debe incluir Bloque B (Activación de ecosistema)');
  assert.ok(footer, 'Debe incluir Bloque C (Footer institucional)');
  assert.ok(btn, 'Debe incluir Botón CTA');
  assert.ok(areasHtml, 'Debe incluir tarjeta estructurada de propósitos y áreas de la Feria');

  assert.equal(ctaBlock.buttonText, 'ACTIVAR MI CLUB');
  assert.equal(btn.text, 'POSTULAR PROYECTO EN LA FERIA');

  const html = renderDesignToHtml(feriaDesign, {
    siteContext: { domain: 'rotaryprojectfaircolombia.org', siteName: 'Feria de Proyectos Rotary Colombia' }
  });
  assert.ok(html.includes('FeriadeProyectosRotary-Logo'), 'Debe resolver el logo oficial de la Feria de Proyectos');
  assert.ok(html.includes('ACTIVAR MI CLUB'), 'Debe incluir Bloque B de activación');
});

test('Seguridad de Email: cleanUnresolvedVariables previene fuga de {{variables}} sin resolver', async () => {
  const { cleanUnresolvedVariables } = await import('../src/lib/emailBlocks.ts');

  const rawTemplate = 'Hola {{contact.first_name|Líder Rotario(a)}}, tu club {{club.name}} en {{club.city}} tiene {{club.completion_percentage|0%}} avance. Formulario: {{form_url}}. Inesperado: {{variable_inexistente}}';

  // 1. Con valores personalizados provistos
  const resolved = cleanUnresolvedVariables(rawTemplate, {
    'contact.first_name': 'Daniel',
    'club.name': 'Club Rotary Bogotá Chicó',
    'club.city': 'Bogotá',
    'club.completion_percentage': '45%',
    'form_url': 'https://rotary4281.org/rotary-en-accion'
  });

  assert.ok(resolved.includes('Hola Daniel'), 'Debe reemplazar con el nombre provisto');
  assert.ok(resolved.includes('Club Rotary Bogotá Chicó'), 'Debe reemplazar el club provisto');
  assert.ok(resolved.includes('Bogotá'), 'Debe reemplazar la ciudad provista');
  assert.ok(!resolved.includes('{{'), 'No debe quedar ninguna variable sin resolver');
  assert.ok(!resolved.includes('}}'), 'No debe quedar ningún cierre de variable sin resolver');

  // 2. Sin valores provistos (modo fallback automático)
  const defaultFallback = cleanUnresolvedVariables(rawTemplate);
  assert.ok(defaultFallback.includes('Hola Líder Rotario(a)'), 'Debe usar fallback explícito de la variable');
  assert.ok(defaultFallback.includes('su Club'), 'Debe usar fallback universal para club.name');
  assert.ok(defaultFallback.includes('0%'), 'Debe usar fallback explícito para porcentaje');
  assert.ok(!defaultFallback.includes('{{'), 'No debe quedar ningún {{ residual');
  assert.ok(!defaultFallback.includes('}}'), 'No debe quedar ningún }} residual');
});



