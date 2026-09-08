// ════════════════════════════════════════════════════════════════════
// Solicitud → artículo de noticia — pruebas del CRITERIO — v4.1000
//
// SIN base, SIN credenciales y SIN red. Prueban `submissionArticleSpec.js`
// —el criterio puro— y unas INVARIANTES leídas de los archivos, que ninguna
// otra comprobación ve:
//   · que el borrador NAZCA sin publicar (la automatización no publica);
//   · que `Post` no gane ni una columna en `schema.prisma`;
//   · que la idempotencia sea un índice ÚNICO sobre `submissionId`;
//   · que las rutas literales vayan ANTES de las paramétricas;
//   · que el asistente de redacción y el workflow compartan UN generador;
//   · que un dato no suministrado se DECLARE en el prompt;
//   · que el CÓDIGO decida la veracidad y la fidelidad del informe.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeSubmissionsConfig } from '../server/lib/contentSubmissionSpec.js';
import {
    ARTICLE_STATES, ARTICLE_STATE_IDS, ARTICLE_INITIAL_STATE, isWorkingState,
    canTransitionArticle, nextArticleStates, articleNeedsReason,
    STAGES, STAGE_IDS, nextStage, deriveWorkflowStatus, stageToRetry,
    checkSubmissionReady, missingInfo, articleDepth, DEEP_ARTICLE_SIGNALS, buildArticleContext, buildArticleExtraRules, readArticleExtras, excerptFor,
    veracityContextFor, checkArticleVeracity,
    tagKey, mergeTags, fixedTagsFor, MAX_TAGS, DEFAULT_CATEGORIES, FALLBACK_CATEGORY, pickCategory,
    GALLERY_ROLES, IMAGE_THRESHOLDS, dhashBits, hammingDistance, markDuplicates, scoreImage, coverExcluded, pickCover, planGallery,
    buildSheetSystemPrompt, parseSheetAnalysis, altFallback,
    VERSION_FIELDS, snapshotOf, diffSnapshots, REGENERABLE_SECTIONS, splitIntro, originNote,
    shapeHit, describeHit, buildImpactFacts, impactSentence, impactNumbers, summaryIsFaithful,
    ARTICLE_SITE_SOURCE_IDS, articleSiteSourceLabel, resolveArticleSite, articleSiteHelp,
} from '../server/lib/submissionArticleSpec.js';

const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const SOLICITUD = {
    id: 'abcdef12-3456-7890-abcd-ef1234567890',
    title: 'Entrega mercados, medicamentos, ropa y kits de aseo',
    description: 'El Club Rotario Sevilla Capital Cafetera entregó 120 mercados y 40 kits de aseo a familias afectadas por el sismo, con apoyo de voluntarios del club.',
    story: 'La jornada se hizo en el coliseo municipal. «Fue un día de servicio», dijo la presidenta.',
    club: 'Sevilla Capital Cafetera', district: '4281', city: 'Sevilla',
    senderName: 'Ana Pérez', role: 'Presidenta', activityDate: '2026-08-14',
};

// ─── Estados y transiciones ────────────────────────────────────────────

test('los diez estados del pedido existen y el inicial es «recibida»', () => {
    for (const id of ['recibida', 'analizando', 'generando', 'borrador_listo', 'en_revision', 'requiere_info', 'aprobado', 'publicado', 'descartado', 'error']) {
        assert.ok(ARTICLE_STATE_IDS.includes(id), id);
        assert.ok(ARTICLE_STATES[id].label);
    }
    assert.equal(ARTICLE_INITIAL_STATE, 'recibida');
    assert.ok(isWorkingState('analizando') && isWorkingState('generando') && !isWorkingState('borrador_listo'));
});

test('publicar exige pasar por «aprobado»: ningún estado salta a «publicado» sin él', () => {
    for (const from of ARTICLE_STATE_IDS) {
        if (from === 'aprobado') continue;
        assert.equal(canTransitionArticle(from, 'publicado'), false, `${from} → publicado`);
    }
    assert.equal(canTransitionArticle('aprobado', 'publicado'), true);
});

test('«publicado» no retrocede a mano y el motor no se maneja desde FLOW', () => {
    assert.deepEqual(nextArticleStates('publicado'), []);
    assert.deepEqual(nextArticleStates('recibida'), []);
    assert.deepEqual(nextArticleStates('analizando'), []);
    assert.equal(canTransitionArticle('error', 'recibida'), true);
});

test('descartar y pedir información exigen motivo', () => {
    assert.ok(articleNeedsReason('descartado') && articleNeedsReason('requiere_info'));
    assert.ok(!articleNeedsReason('aprobado'));
});

// ─── Etapas ────────────────────────────────────────────────────────────

test('las etapas obligatorias son validar, generar y borrador; el resto es opcional', () => {
    const obligatorias = STAGES.filter(s => !s.optional).map(s => s.id);
    assert.deepEqual(obligatorias, ['validar', 'generar', 'borrador']);
    assert.equal(STAGE_IDS[0], 'validar');
    // «biblioteca» cierra la lista desde v4.1002 y es opcional: la portada la
    // pone el workflow, y un fallo copiando archivos no puede costar el texto.
    assert.equal(STAGE_IDS[STAGE_IDS.length - 1], 'biblioteca');
});

test('«Borrador generado — SEO pendiente»: una opcional fallida no tumba el borrador', () => {
    const stages = Object.fromEntries(STAGE_IDS.map(id => [id, { status: 'ok' }]));
    stages.seo = { status: 'error', error: 'proveedor caído' };
    const r = deriveWorkflowStatus(stages);
    assert.equal(r.status, 'borrador_listo');
    assert.deepEqual(r.pending, ['seo']);
});

test('una obligatoria fallida es «error» con la etapa nombrada', () => {
    const r = deriveWorkflowStatus({ validar: { status: 'ok' }, analizar: { status: 'ok' }, portada: { status: 'ok' }, multimedia: { status: 'ok' }, generar: { status: 'error', error: 'sin modelo' } });
    assert.equal(r.status, 'error');
    assert.equal(r.failedStage, 'generar');
    assert.equal(r.error, 'sin modelo');
});

test('mientras avanza dice en qué etapa va, y cuál es la siguiente', () => {
    assert.equal(deriveWorkflowStatus({}).status, 'analizando');
    assert.equal(deriveWorkflowStatus({}).nextStage, 'validar');
    const hechas = { validar: { status: 'ok' }, analizar: { status: 'ok' }, portada: { status: 'ok' }, multimedia: { status: 'ok' } };
    assert.equal(deriveWorkflowStatus(hechas).status, 'generando');
    assert.equal(nextStage(hechas).id, 'generar');
    assert.equal(nextStage(Object.fromEntries(STAGE_IDS.map(id => [id, { status: 'ok' }]))), null);
});

test('reintentar retoma SÓLO la etapa fallida; lo que está en ok no se regenera', () => {
    const stages = Object.fromEntries(STAGE_IDS.map(id => [id, { status: 'ok' }]));
    stages.seo = { status: 'error' };
    assert.equal(stageToRetry(stages), 'seo');
    assert.equal(stageToRetry(stages, 'portada'), 'portada');
    assert.equal(stageToRetry(stages, 'inexistente'), 'seo');
});

// ─── Validación previa e información no suministrada ──────────────────

test('una solicitud sin texto o sin club NO se procesa; sin fotos se avisa', () => {
    assert.equal(checkSubmissionReady({ title: 'Hola', club: 'X' }).ok, false);
    assert.equal(checkSubmissionReady({ ...SOLICITUD, club: '', clubs: [], participatingClubs: '' }).ok, false);
    const r = checkSubmissionReady(SOLICITUD, { files: [] });
    assert.equal(r.ok, true);
    assert.ok(r.warnings.some(w => /fotograf/i.test(w)));
    const r2 = checkSubmissionReady(SOLICITUD, { files: [{ kind: 'image' }, { kind: 'image', accessible: false }] });
    assert.ok(r2.warnings.some(w => /no se pudieron leer/.test(w)));
});

test('lo que falta se NOMBRA y viaja al prompt como «INFORMACIÓN NO SUMINISTRADA»', () => {
    const faltan = missingInfo({ ...SOLICITUD, activityDate: '', city: '', location: '' });
    const claves = faltan.map(f => f.key);
    assert.ok(claves.includes('fecha') && claves.includes('lugar'));
    assert.ok(!claves.includes('cifras'), 'el texto trae 120 y 40');
    assert.ok(!claves.includes('testimonios'), 'hay una cita textual');
    const ctx = buildArticleContext({ submission: { ...SOLICITUD, activityDate: '', city: '' }, campaign: { name: 'Emergencia Terremoto' }, siteName: 'Rotary 4281' });
    assert.match(ctx, /INFORMACIÓN NO SUMINISTRADA/);
    assert.match(ctx, /Fecha de la actividad/);
    assert.match(ctx, /Emergencia Terremoto/);
    assert.match(ctx, /Ana Pérez/);
});

test('una solicitud completa no declara huecos', () => {
    const faltan = missingInfo(SOLICITUD);
    assert.deepEqual(faltan.map(f => f.key), []);
    assert.doesNotMatch(buildArticleContext({ submission: SOLICITUD }), /NO SUMINISTRADA/);
});

test('las reglas extra piden los campos SEO y ofrecen el catálogo de categorías CERRADO', () => {
    const r = buildArticleExtraRules({ categories: ['Salud', 'Comunidad'], clubName: 'Sevilla' });
    for (const campo of ['extracto', 'etiquetas', 'categoria', 'categoria_sugerida', 'og_titulo', 'og_descripcion', 'no_suministrado']) assert.match(r, new RegExp(`"${campo}"`));
    assert.match(r, /Salud \| Comunidad/);
    assert.match(r, /Lo que no está ahí, no existe/);
    assert.match(r, /No inventes declaraciones/);
});

test('readArticleExtras acota y normaliza lo que el modelo propone', () => {
    const e = readArticleExtras({ extracto: '  Un resumen. ', etiquetas: Array.from({ length: 40 }, (_, i) => `t${i}`), categoria: 'Salud', og_titulo: 'x'.repeat(500), no_suministrado: 'fecha, lugar' });
    assert.equal(e.excerpt, 'Un resumen.');
    assert.equal(e.tags.length, 12);
    assert.equal(e.category, 'Salud');
    assert.ok(e.ogTitle.length < 500);
    assert.deepEqual(e.notProvided, ['fecha', 'lugar']);
});

test('el extracto siempre existe: sin el del modelo sale del cuerpo', () => {
    assert.equal(excerptFor('', '<p>El club entregó mercados a familias afectadas por el sismo en Sevilla.</p><p>Otro.</p>').startsWith('El club entregó'), true);
    assert.equal(excerptFor('Un resumen largo de verdad con más de cuarenta caracteres.', '<p>x</p>'), 'Un resumen largo de verdad con más de cuarenta caracteres.');
});

// ─── Veracidad: el código decide ───────────────────────────────────────

test('una cifra que la solicitud NO trae se rechaza; una que sí trae, pasa', () => {
    const ctx = veracityContextFor(SOLICITUD, { name: 'Emergencia' });
    const ok = checkArticleVeracity({ title: 'Sevilla entrega 120 mercados', body: '<p>El club entregó 120 mercados y 40 kits de aseo.</p>', excerpt: '120 mercados.' }, ctx);
    assert.equal(ok.ok, true, ok.issues.join(' | '));
    const mal = checkArticleVeracity({ title: 'Sevilla entrega 500 mercados', body: '<p>El club entregó 120 mercados.</p>' }, ctx);
    assert.equal(mal.ok, false);
    assert.ok(mal.issues.some(i => i.startsWith('[titular]')));
});

test('una atribución inventada («según reportes») se rechaza en el cuerpo', () => {
    const ctx = veracityContextFor(SOLICITUD, null);
    const r = checkArticleVeracity({ body: '<p>Según reportes oficiales, miles de familias recibieron ayuda.</p>' }, ctx);
    assert.equal(r.ok, false);
});

// ─── Etiquetas y categorías ────────────────────────────────────────────

test('tagKey iguala tildes, caja y signos', () => {
    assert.equal(tagKey('Sevilla'), tagKey('SEVILLA'));
    assert.equal(tagKey('Acción Social'), tagKey('accion-social'));
    assert.equal(tagKey(''), '');
});

test('mergeTags conserva la forma EXISTENTE del sitio, pone lo fijo primero y acota', () => {
    const t = mergeTags({ proposed: ['sevilla', 'mercados', 'Mercados', 'emergencia'], existing: ['Sevilla Capital Cafetera', 'Emergencia'], fixed: ['Rotary Distrito 4281', 'Sevilla Capital Cafetera'] });
    assert.equal(t[0], 'Rotary Distrito 4281');
    assert.equal(t[1], 'Sevilla Capital Cafetera');
    assert.ok(t.includes('Emergencia'), 'la forma existente manda');
    assert.equal(t.filter(x => tagKey(x) === 'mercados').length, 1, 'deduplicado');
    const muchas = mergeTags({ proposed: Array.from({ length: 30 }, (_, i) => `tema ${i}`) });
    assert.equal(muchas.length, MAX_TAGS);
});

test('las etiquetas fijas salen de los datos de la solicitud y la campaña', () => {
    const f = fixedTagsFor(SOLICITUD, { name: 'Emergencia Terremoto Colombia 2026' });
    assert.deepEqual(f, ['Rotary Distrito 4281', 'Sevilla Capital Cafetera', 'Emergencia Terremoto Colombia 2026', 'Sevilla']);
});

test('pickCategory elige entre las EXISTENTES y nunca crea una: lo nuevo vuelve como sugerencia', () => {
    assert.deepEqual(pickCategory({ proposed: 'salud', existing: ['Salud', 'Noticias'] }), { category: 'Salud', isNew: false, suggested: '' });
    assert.equal(pickCategory({ proposed: 'Servicio humanitario en emergencias', existing: [] }).category, 'Servicio Humanitario');
    const nueva = pickCategory({ proposed: '', suggested: 'Voluntariado juvenil', existing: ['Noticias'] });
    assert.equal(nueva.isNew, true);
    assert.equal(nueva.suggested, 'Voluntariado juvenil');
    assert.ok([...DEFAULT_CATEGORIES, 'Noticias'].includes(nueva.category));
    assert.equal(pickCategory({}).category, FALLBACK_CATEGORY);
});

// ─── Portada y galería ─────────────────────────────────────────────────

const foto = (id, over = {}) => ({ fileId: id, kind: 'image', width: 2000, height: 1300, sharpness: 15, brightness: 120, hash: '0'.repeat(64), sortOrder: 0, ...over });

test('los siete roles del pedido existen con su orden narrativo', () => {
    for (const r of ['portada', 'contexto', 'actividad', 'participantes', 'resultado', 'cierre', 'secundaria']) assert.ok(GALLERY_ROLES[r], r);
    assert.ok(GALLERY_ROLES.contexto.order < GALLERY_ROLES.actividad.order && GALLERY_ROLES.actividad.order < GALLERY_ROLES.resultado.order);
});

test('dHash y distancia de Hamming: dos muestras iguales dan distancia 0', () => {
    const muestra = Array.from({ length: 72 }, (_, i) => (i % 9) * 10);
    const a = dhashBits(muestra), b = dhashBits(muestra);
    assert.equal(a.length, 64);
    assert.equal(hammingDistance(a, b), 0);
    assert.equal(hammingDistance(a, ''), Infinity);
});

test('markDuplicates deja la primera y apunta las demás a ella', () => {
    const casi = '0'.repeat(62) + '11';
    const r = markDuplicates([foto('a'), foto('b', { hash: casi }), foto('c', { hash: '1'.repeat(64) })]);
    assert.equal(r[0].duplicateOf, null);
    assert.equal(r[1].duplicateOf, 'a');
    assert.equal(r[2].duplicateOf, null);
});

test('scoreImage castiga lo que el pedido excluye y premia lo que representa la actividad', () => {
    const buena = scoreImage(foto('a', { vision: { people: true, showsActivity: true, relevance: 9 } }));
    const borrosa = scoreImage(foto('b', { sharpness: 1 }));
    const captura = scoreImage(foto('c', { vision: { screenshot: true } }));
    const oscura = scoreImage(foto('d', { brightness: 20 }));
    assert.ok(buena.score > borrosa.score && buena.score > captura.score && buena.score > oscura.score);
    assert.ok(buena.score >= 0 && buena.score <= 100);
    assert.ok(scoreImage(foto('e')).reasons.some(r => /sin análisis de visión/.test(r)));
});

test('coverExcluded nombra el motivo: borrosa, captura, documento, oscura, repetida', () => {
    assert.equal(coverExcluded(foto('a')), null);
    assert.match(coverExcluded(foto('b', { sharpness: 1 })), /desenfocada/);
    assert.match(coverExcluded(foto('c', { vision: { screenshot: true } })), /captura/);
    assert.match(coverExcluded(foto('d', { vision: { document: true } })), /documento/);
    assert.match(coverExcluded(foto('e', { brightness: 10 })), /oscura/);
    assert.match(coverExcluded(foto('f', { duplicateOf: 'a' })), /repite/);
});

test('pickCover elige la mejor ELEGIBLE; sin elegibles sugiere la mejor y lo AVISA', () => {
    const r = pickCover([foto('mala', { sharpness: 1 }), foto('buena', { vision: { people: true, showsActivity: true, relevance: 9 } }), foto('video', { kind: 'video' })]);
    assert.equal(r.cover, 'buena');
    assert.equal(r.weak, false);
    const sin = pickCover([foto('a', { sharpness: 1 }), foto('b', { vision: { screenshot: true } })]);
    assert.ok(sin.cover);
    assert.equal(sin.weak, true);
    assert.match(sin.reason, /ninguna cumple/);
    assert.equal(pickCover([]).cover, null);
});

test('planGallery: portada primero, por rol, excluidos al final SIN borrarse, y bloques con más de cuatro fotos', () => {
    const fotos = [
        foto('r', { role: 'resultado' }), foto('c', { role: 'contexto' }), foto('cap', { vision: { screenshot: true } }),
        foto('a1', { role: 'actividad' }), foto('a2', { role: 'actividad' }), foto('p', { role: 'participantes' }),
        foto('v', { kind: 'video' }),
    ];
    const plan = planGallery(fotos, 'a1');
    assert.equal(plan.items[0].fileId, 'a1');
    assert.equal(plan.items[0].isCover, true);
    const incluidas = plan.items.filter(i => !i.excluded).map(i => i.fileId);
    assert.deepEqual(incluidas.slice(1, 3), ['c', 'a2'], 'contexto antes que actividad');
    assert.ok(plan.items.find(i => i.fileId === 'cap').excluded, 'la captura queda excluida, no borrada');
    assert.equal(plan.items.length, 7);
    assert.deepEqual(plan.videos, ['v']);
    assert.equal(plan.blocks.length, 2);
    assert.ok(plan.blocks[0].fileIds.includes('a1') && plan.blocks[1].fileIds.includes('r'));
    assert.equal(planGallery(fotos.slice(0, 2), 'r').blocks.length, 1);
});

test('la hoja de contacto: el prompt pide sólo lo VISIBLE y el parser descarta lo que no está en el catálogo', () => {
    assert.match(buildSheetSystemPrompt(4), /No nombres personas/);
    const r = parseSheetAnalysis('```json\n{"fotos":[{"n":1,"role":"actividad","people":true,"alt":"Voluntarios cargan mercados","relevance":14},{"n":2,"role":"portada"},{"n":9,"role":"contexto"},{"n":"x"}]}\n```', 3);
    assert.equal(r.ok, true);
    assert.equal(r.byIndex.get(1).role, 'actividad');
    assert.equal(r.byIndex.get(1).relevance, 10, 'acotado a 10');
    assert.equal(r.byIndex.get(2).role, 'secundaria', '«portada» no es un rol que el modelo asigne');
    assert.ok(!r.byIndex.has(9));
    assert.deepEqual(r.missing, [3]);
    assert.equal(parseSheetAnalysis('no es json', 2).ok, false);
});

test('el ALT nunca falta y se acota', () => {
    const a = altFallback(SOLICITUD, 3);
    assert.match(a, /Sevilla Capital Cafetera/);
    assert.match(a, /foto 3/);
    assert.ok(a.length <= 125);
});

// ─── Versiones y regeneración parcial ──────────────────────────────────

test('la foto de una versión cubre lo editable y el diff nombra sólo lo que cambió', () => {
    assert.ok(['title', 'content', 'seoTitle', 'image', 'images'].every(f => VERSION_FIELDS.includes(f)));
    const a = snapshotOf({ title: 'A', content: '<p>x</p>', tags: ['t'] });
    const b = snapshotOf({ title: 'B', content: '<p>x</p>', tags: ['t'] });
    assert.deepEqual(diffSnapshots(a, b), ['title']);
    assert.deepEqual(diffSnapshots(a, a), []);
});

test('las secciones regenerables son las del pedido y splitIntro separa el primer párrafo', () => {
    assert.deepEqual(Object.keys(REGENERABLE_SECTIONS), ['titulo', 'introduccion', 'extracto', 'seo', 'redaccion']);
    const { intro, rest } = splitIntro('<p>Lead.</p><h2>Contexto</h2><p>Más.</p>');
    assert.equal(intro, '<p>Lead.</p>');
    assert.equal(rest, '<h2>Contexto</h2><p>Más.</p>');
    assert.equal(splitIntro('sin p').intro, '');
});

test('la nota de origen lleva el número de solicitud', () => {
    assert.equal(originNote(SOLICITUD.id), 'Generado automáticamente desde Solicitud #ABCDEF12');
});

// ─── Tracking ──────────────────────────────────────────────────────────

test('shapeHit acota lo que llega del navegador', () => {
    const h = shapeHit({ kind: 'leave', viewId: 'abc', durationSec: 99999, scrollPct: 400, target: 'x'.repeat(500) });
    assert.equal(h.kind, 'leave');
    assert.equal(h.viewId, '', 'un viewId corto no se acepta');
    assert.equal(h.durationSec, 3600);
    assert.equal(h.scrollPct, 100);
    assert.ok(h.target.length <= 200);
    assert.equal(shapeHit({ kind: 'hackeo' }).kind, 'view');
});

test('describeHit: UTM manda sobre referer, WhatsApp es bot, la IP no viaja y el visitante lleva hash', () => {
    const utm = describeHit({ body: { search: '?utm_source=facebook&utm_medium=social', referrer: 'https://google.com/' }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile Safari/604.1', ip: '10.0.0.1', clubId: 'club-1', headers: { 'x-vercel-ip-country': 'co' } });
    assert.equal(utm.utmSource, 'facebook');
    assert.match(utm.sourceLabel, /facebook/i);
    assert.equal(utm.country, 'CO');
    assert.equal(utm.device, 'movil');
    assert.equal(utm.isBot, false);
    assert.ok(utm.seed && utm.identifiable, 'con IP o user-agent hay a quién contar');
    // La semilla es cruda a propósito (la misma de los enlaces); lo que se
    // GUARDA es su hash con sal: lo comprueba la lectura de articleAnalytics.
    assert.match(leer('server/lib/articleAnalytics.js'), /visitorKeyFor\(hit\.seed\)/);
    assert.doesNotMatch(leer('server/lib/articleAnalytics.js'), /hit\.seed[^\n]*INSERT|INSERT[^\n]*hit\.seed/, 'la semilla cruda no se inserta');
    const bot = describeHit({ body: {}, userAgent: 'WhatsApp/2.23.20.0 A' });
    assert.equal(bot.isBot, true);
    const otro = describeHit({ body: {}, userAgent: utm.seed ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile Safari/604.1' : '', ip: '10.0.0.1', clubId: 'club-2' });
    assert.notEqual(otro.seed, utm.seed, 'el sitio entra en la semilla: no hay rastreo entre organizaciones');
});

// ─── El informe de impacto ─────────────────────────────────────────────

const HECHOS = () => buildImpactFacts({
    publishedAt: '2026-08-01T12:00:00Z',
    totals: { views: 1250, uniques: 900, clicks: 30, seconds: 9000, samples: 100 },
    series: [{ day: '2026-08-01', views: 500 }, { day: '2026-08-02', views: 300 }, { day: '2026-08-03', views: 450 }],
    sources: [{ label: 'Facebook', views: 700 }, { label: 'Directo o desconocido', views: 550 }],
    now: new Date('2026-08-10T12:00:00Z'),
});

test('los hechos del informe los calcula el código', () => {
    const f = HECHOS();
    assert.equal(f.views, 1250);
    assert.equal(f.avgSeconds, 90);
    assert.equal(f.sources[0].label, 'Facebook');
    assert.equal(f.sources[0].pct, 56);
    assert.equal(f.socialPct, 56);
    assert.equal(f.firstTwoDaysPct, 64);
    assert.equal(f.daysSincePublished, 9);
    assert.equal(f.peakDay, '2026-08-01');
});

test('la conclusión escrita por código nombra las cifras del pedido', () => {
    const s = impactSentence(HECHOS());
    assert.match(s, /1\.250 visualizaciones/);
    assert.match(s, /900 visitantes únicos/);
    assert.match(s, /56 % del tráfico provino de redes sociales/);
    assert.match(s, /primeras 48 horas/);
    assert.match(s, /1m 30s/);
    assert.equal(impactSentence({ views: 0 }), 'El artículo todavía no registra visualizaciones.');
});

test('un resumen del modelo con una cifra que no está en los hechos se DESCARTA', () => {
    const f = HECHOS();
    assert.equal(summaryIsFaithful(impactSentence(f), f), true, 'la plantilla propia es fiel');
    assert.equal(summaryIsFaithful('El artículo recibió 1.250 visitas y el 56 % vino de redes.', f), true);
    assert.equal(summaryIsFaithful('El artículo recibió 2.000 visitas.', f), false);
    assert.equal(summaryIsFaithful('Un crecimiento del 300 %.', f), false);
    assert.ok(impactNumbers(f).has('1250'));
});

// ─── Invariantes leídas de los archivos ────────────────────────────────

test('el borrador NACE sin publicar: el INSERT del Post lleva published FALSE', () => {
    const src = leer('server/lib/submissionArticleEngine.js');
    const inserts = src.match(/INSERT INTO "Post"[\s\S]*?VALUES[\s\S]*?\)/g) || [];
    assert.ok(inserts.length >= 1);
    const principal = inserts[0];
    const cols = principal.match(/\(([^)]*)\)/)[1].split(',').map(s => s.trim().replace(/"/g, ''));
    const vals = principal.match(/VALUES\s*\(([^)]*)\)/)[1].split(',').map(s => s.trim());
    assert.equal(vals[cols.indexOf('published')], 'FALSE');
    assert.equal(vals[cols.indexOf('isAI')], 'TRUE');
    // Y el ÚNICO UPDATE que publica vive dentro de `publishArticle`, que es
    // la acción humana: el motor de etapas no lo llama.
    const publica = [...src.matchAll(/published = TRUE/g)].map(m => m.index);
    assert.equal(publica.length, 1, 'un solo punto que publica');
    const inicio = src.indexOf('export async function publishArticle');
    const fin = src.indexOf('async function afterPublished');
    assert.ok(publica[0] > inicio && publica[0] < fin, 'dentro de publishArticle');
    const etapas = src.slice(src.indexOf('export async function advanceArticle'), src.indexOf('export async function sweepArticles'));
    assert.doesNotMatch(etapas, /publishArticle\(/, 'el avance de etapas no publica');
});

test('sólo `publishArticle` y el hook de Noticias marcan «publicado»; el motor no', () => {
    const src = leer('server/lib/submissionArticleEngine.js');
    const marcas = src.match(/status = 'publicado'/g) || [];
    assert.ok(marcas.length >= 1 && marcas.length <= 2, `marcas de publicado: ${marcas.length}`);
    assert.match(src, /export async function publishArticle/);
});

test('`Post` no gana ni una columna en schema.prisma', () => {
    const schema = leer('server/prisma/schema.prisma');
    const modelo = schema.match(/model Post \{[\s\S]*?\n\}/)[0];
    for (const col of ['submissionId', 'articleId', 'generatedBy', 'campaignId', 'submissionOrigin']) assert.doesNotMatch(modelo, new RegExp(`\\b${col}\\b`));
});

test('la idempotencia es un índice ÚNICO sobre submissionId y el encolado es ON CONFLICT DO NOTHING', () => {
    const esquema = leer('server/lib/ensureSubmissionArticleSchema.js');
    assert.match(esquema, /CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionArticle_submission_key" ON "SubmissionArticle" \("submissionId"\)/);
    const motor = leer('server/lib/submissionArticleEngine.js');
    const enqueue = motor.match(/export async function enqueueArticle[\s\S]*?\n\}/)[0];
    assert.match(enqueue, /ON CONFLICT\s*\("submissionId"\)\s*DO NOTHING/);
    assert.match(motor, /AND attempts = \$/, 'el reclamo va sobre attempts, no sobre updatedAt');
});

test('ningún ADD COLUMN del esquema queda fuera del atajo del ensure (trampa v4.908)', () => {
    for (const f of ['server/lib/ensureSubmissionArticleSchema.js', 'server/lib/ensureArticleAnalyticsSchema.js']) {
        const src = leer(f);
        const alters = (src.match(/ADD COLUMN IF NOT EXISTS\s+"?([A-Za-z_]+)"?/g) || []).map(m => m.replace(/.*EXISTS\s+"?/, '').replace(/"$/, ''));
        const literales = alters.filter(c => c !== '${col}');
        assert.deepEqual(literales, [], `${f}: ${literales.join(', ')} debe enumerarse en OWNED_COLUMNS`);
    }
});

test('las rutas literales van ANTES de las paramétricas en contribution-campaigns.js', () => {
    const src = leer('server/routes/contribution-campaigns.js');
    const pos = (p) => src.indexOf(p);
    assert.ok(pos("'/submissions/articles/pending'") > 0);
    assert.ok(pos("'/submissions/articles/pending'") < pos("'/submissions/inbox/:submissionId'"));
    assert.ok(pos("'/submissions/inbox/:submissionId'") < pos("'/:id/submissions/:submissionId/article'"));
    assert.ok(pos("'/submissions/inbox/:submissionId'") < pos("router.get('/:id'"), 'antes de /:id');
    // Toda ruta del artículo pasa por el gate de la campaña.
    const rutas = src.match(/router\.\w+\('\/:id\/submissions\/:submissionId\/article[^']*'[^\n]*/g) || [];
    assert.ok(rutas.length >= 10);
    for (const r of rutas) assert.match(r, /requireCampaignAccess/, r);
    const publish = rutas.find(r => r.includes('/publish'));
    assert.match(publish, /newsPublish/, 'publicar exige el permiso de publicar noticias');
});

test('el asistente de redacción y el workflow comparten UN generador', () => {
    const ai = leer('server/routes/ai.js');
    assert.match(ai, /from '\.\.\/lib\/articleGenerate\.js'/);
    assert.match(ai, /generateArticleFromContext\(/);
    const motor = leer('server/lib/submissionArticleEngine.js');
    assert.match(motor, /generateArticleFromContext\(/);
    // El motor no arma un SEGUNDO prompt de artículo completo: lo que le pide
    // al modelo por su cuenta son las secciones parciales (título, intro, SEO).
    assert.doesNotMatch(motor, /buildArticlePrompt\(/, 'el prompt del artículo vive en articleGenerate');
    assert.doesNotMatch(motor, /generate-article/);
});

test('la solicitud se encola al recibirse y el motor no publica en redes ni manda correo', () => {
    const ctrl = leer('server/controllers/contentSubmissionController.js');
    assert.match(ctrl, /enqueueArticle\(\{ submissionId: submission\.id/);
    assert.match(ctrl, /config\.autoArticle !== false/);
    const motor = leer('server/lib/submissionArticleEngine.js');
    assert.doesNotMatch(motor, /sendPlatformEmail|sendEmail\(/, 'sin correos: el aviso es un estado observado');
    assert.doesNotMatch(motor, /publishToFacebook|publishToInstagram|socialPublish/, 'redes: preparado, no implementado');
});

test('el hook de Noticias registra la versión humana y se ESPERA antes de responder', () => {
    const cc = leer('server/controllers/contentController.js');
    assert.match(cc, /await onPostUpdated\(\{ before: antes, after: post/);
    assert.match(cc, /submissionOrigin: origenes\[row\.id\] \|\| null/);
});

test('el beacon público no guarda IP y las tablas de analítica no tienen columna de IP', () => {
    const esquema = leer('server/lib/ensureArticleAnalyticsSchema.js');
    assert.doesNotMatch(esquema, /\bip\b\s+TEXT|"ip"|ipAddress|"remoteAddress"/i);
    const tracking = leer('src/lib/articleTracking.ts');
    assert.match(tracking, /sendBeacon/);
    assert.doesNotMatch(tracking, /localStorage|document\.cookie/);
});

test('las tres pantallas están cableadas: ficha, bandeja, Noticias y campana', () => {
    assert.match(leer('src/components/admin/contribution/SubmissionDetail.tsx'), /<SubmissionArticlePanel campaignId=\{campaignId\} submissionId=\{ficha\.submission\.id\}/);
    const inbox = leer('src/pages/admin/SubmissionsInbox.tsx');
    assert.match(inbox, /articleBadge\(s\.article\?\.status\)/);
    assert.match(inbox, /params\.get\('abrir'\)/);
    const news = leer('src/pages/admin/News.tsx');
    assert.match(news, /params\.get\('post'\)/);
    assert.match(news, /Generados desde solicitudes/);
    assert.match(news, /solicitudes\?abrir=/);
    const layout = leer('src/components/admin/AdminLayout.tsx');
    assert.match(layout, /submissions\/articles\/pending/);
    assert.match(layout, /borradoresIA\.count > 0 &&/, 'el contador sólo se pinta con algo detrás');
});

test('el panel del artículo no publica sin confirmación y expone los dos botones de trazabilidad', () => {
    const panel = leer('src/components/admin/contribution/SubmissionArticlePanel.tsx');
    assert.match(panel, /REVISAR ART[IÍ]CULO/);
    assert.match(panel, /VER PUBLICACI[OÓ]N/);
    assert.match(panel, /ESTAD[IÍ]STICAS/);
    assert.match(panel, /confirm\(/, 'publicar pide confirmación');
    assert.match(panel, /\/admin\/noticias\?post=/);
});

test('las seis tablas nuevas están en la lista del guardián de db:push', () => {
    const guard = leer('scripts/db-push-guard.mjs');
    for (const t of ['SubmissionArticle', 'SubmissionArticleMedia', 'SubmissionArticleVersion', 'ArticleViewEvent', 'ArticleViewDaily', 'ArticleViewVisitor']) {
        assert.match(guard, new RegExp(`\\b${t}\\b`), t);
    }
});

test('los dos espejos del navegador dicen lo mismo que el servidor sobre estados y períodos', () => {
    const ts = leer('src/lib/submissionArticleSpec.ts');
    for (const id of ARTICLE_STATE_IDS) assert.match(ts, new RegExp(`\\b${id}:`), id);
    for (const id of ['h24', 'd7', 'd30', 'todo']) assert.match(ts, new RegExp(`id: '${id}'`));
});

// ════════════════════════════════════════════════════════════════════
// v4.1001 — lo que se reportó tras la primera prueba real
// ════════════════════════════════════════════════════════════════════

test('la profundidad del artículo se DERIVA del material, no se fija', () => {
    // Pedirle un reportaje a una solicitud de tres líneas es pedirle al modelo
    // que rellene, y rellenar acá es inventar.
    const pobre = articleDepth({ title: 'Entrega de ayudas', description: 'El club entregó ayudas.', club: 'Sevilla' });
    assert.equal(pobre.depth, 'estandar');
    assert.match(pobre.reason, /poco material/);

    const rica = articleDepth({
        ...SOLICITUD,
        story: `${SOLICITUD.story} ${'Los voluntarios organizaron seis puntos de entrega y acompañaron a las familias durante toda la jornada, que terminó pasado el mediodía en el coliseo municipal de Sevilla. '.repeat(3)}`,
        participatingClubs: 'Cartago, Tuluá',
    });
    assert.equal(rica.depth, 'reportaje');
    // El motivo se DICE: un perfil que se elige solo y no se explica no se puede
    // discutir cuando el artículo sale corto.
    assert.ok(rica.signals.length >= DEEP_ARTICLE_SIGNALS, JSON.stringify(rica.signals));
    assert.match(rica.reason, /material para un artículo desarrollado/);
});

test('el motor pide la profundidad que decidió el criterio y la deja escrita', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    assert.match(engine, /const profundidad = articleDepth\(ctx\.submission\)/);
    assert.match(engine, /depth: profundidad\.depth/, 'la profundidad viaja al generador');
    assert.match(engine, /depthReason: profundidad\.reason/, 'y queda guardada con el artículo');
});

test('el prompt del flujo pide desarrollar cada sección sin inventar', () => {
    const reglas = buildArticleExtraRules({ categories: ['Servicio'], clubName: 'Sevilla Capital Cafetera' });
    assert.match(reglas, /Cada sección DESARROLLA su asunto/);
    assert.match(reglas, /<blockquote>/, 'la declaración del contexto tiene su lugar');
    // La contracara, y es la que hace segura la exigencia de profundidad.
    assert.match(reglas, /Un artículo corto y cierto es mejor que uno largo e inventado/);
});

test('⚠️ el material a la Biblioteca tiene UN camino y se puede disparar desde el artículo', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    // La secuencia (aprobar → promover → sincronizar) vive en UNA función.
    assert.match(engine, /export async function sendMediaToLibrary\(/);
    const promociones = engine.match(/await promoteToLibrary\(/g) || [];
    assert.equal(promociones.length, 1, 'promoteToLibrary se llama desde un solo sitio');
    // Y publicar la usa, en vez de repetirla.
    const publicar = engine.slice(engine.indexOf('export async function publishArticle('));
    assert.match(publicar, /await sendMediaToLibrary\(/);
    assert.doesNotMatch(publicar.slice(0, publicar.indexOf('async function afterPublished')), /promoteToLibrary\(/);
});

test('⚠️ el aviso de que faltan las fotos lleva el botón que las trae', () => {
    // Desde v4.1003 el aviso y su botón viven en el componente COMPARTIDO, así
    // que están en las dos pantallas a la vez. Hasta v4.1000 el aviso decía que
    // las fotos entran «al aprobar el material» y no había forma de aprobarlo
    // desde ahí: el borrador salía sin portada y con la galería vacía, y se
    // reportó como un defecto. El aviso va junto al botón que lo dispara
    // (regla de v4.798).
    const picker = leer('src/components/admin/contribution/ArticleMediaPicker.tsx');
    // Se comprueba la INVARIANTE —que el aviso lleve el botón que dispara el
    // envío— y no el rótulo exacto: fijar el texto obliga a tocar la prueba
    // cada vez que se ajusta una palabra, y una prueba que se toca por rutina
    // deja de proteger (la lección de v4.984 con `surchargeLines`).
    assert.match(picker, /onClick=\{enviarABiblioteca\}/, 'el aviso lleva su botón');
    assert.match(picker, /\/library/);
    assert.match(picker, /confirm\(/, 'mover archivos a la Biblioteca se confirma');
    // La confirmación DICE qué va a pasar, no pregunta si estás seguro.
    assert.match(picker, /pasan a la Biblioteca Multimedia/);
    assert.match(picker, /El artículo NO se publica/);
    // Desde v4.1002 el botón es el REINTENTO de una etapa automática, y el
    // aviso lo dice: presentarlo como el único camino sería falso.
    assert.match(picker, /El workflow los manda solo/);
    // v4.1004 — se dice CUÁNTOS DE CUÁNTOS y el motivo por archivo: «faltan 3»
    // sin el total hace pensar que no llegó nada, y sin el motivo hay que
    // reintentar a ciegas.
    assert.match(picker, /archivo\(s\) sincronizados/);
    assert.match(picker, /m\.libraryError/);
});

test('la ruta del envío a la Biblioteca existe y pasa por la misma puerta', () => {
    const rutas = leer('server/routes/contribution-campaigns.js');
    const linea = rutas.split('\n').find(l => l.includes("article/library'"));
    assert.ok(linea, 'la ruta está declarada');
    for (const guardia of ['authMiddleware', 'siteWrite', 'requireCampaignAccess']) {
        assert.ok(linea.includes(guardia), `${guardia} falta en la ruta`);
    }
    // Publicar exige además `news.publish`; enviar a la Biblioteca no publica
    // nada, así que no lo pide — pedirlo dejaría el material sin poder aprobarse
    // a quien sí puede aprobar la solicitud.
    assert.ok(!linea.includes('newsPublish'));
});

test('el borrador sin portada se EXPLICA donde se mira, con su número', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    // El recuento va en la MISMA consulta del origen: una por fila dejaría el
    // listado de Noticias con una consulta por artículo.
    assert.match(engine, /AS "pendingLibrary"/);
    const origen = engine.slice(engine.indexOf('export async function originsForPosts'), engine.indexOf('export async function mediaOf'));
    assert.equal((origen.match(/db\.query\(/g) || []).length, 1);

    const news = leer('src/pages/admin/News.tsx');
    assert.match(news, /pendingLibrary/);
    assert.match(news, /Biblioteca Multimedia/);
    // v4.1002: ya no se manda a nadie a aprobar a mano como único camino.
    assert.match(news, /El workflow las envía solo/);
});

// ─────────────────────────────────────────────────────────────────────
// v4.1002 — La portada y la galería las pone el WORKFLOW
//
// v4.1001 dejó el camino resuelto y con un botón; el cliente lo rechazó con
// la pantalla delante: «NO QUEDAN LAS IMÁGENES DE PORTADA Y LA GALERÍA
// MULTIMEDIA, DEBERÍAN QUEDAR EN EL WORKFLOW DE LA AUTOMATIZACIÓN». Lo que
// se comprueba acá es que el disparo sea automático Y que no se haya abierto
// un segundo camino ni aflojado la publicación.
// ─────────────────────────────────────────────────────────────────────

test('⚠️ «biblioteca» es una etapa del workflow, DESPUÉS del borrador y OPCIONAL', () => {
    const ids = STAGES.map(s => s.id);
    assert.ok(ids.includes('biblioteca'), 'la etapa existe');
    assert.ok(ids.indexOf('biblioteca') > ids.indexOf('borrador'),
        'va después de «borrador»: necesita el Post creado para escribirle sus URLs');
    const etapa = STAGES.find(s => s.id === 'biblioteca');
    // OPCIONAL: un fallo copiando archivos no puede costar el artículo.
    assert.equal(etapa.optional, true);

    // Con el borrador hecho y la biblioteca sin correr, todavía no está listo.
    const hechas = {};
    for (const s of STAGES) { if (s.id === 'biblioteca') break; hechas[s.id] = { status: 'ok' }; }
    assert.equal(deriveWorkflowStatus(hechas).nextStage, 'biblioteca');
    // Y si falla, el borrador SÍ queda listo, nombrando lo que quedó pendiente.
    const conFallo = { ...hechas, biblioteca: { status: 'error', error: 'S3' } };
    const d = deriveWorkflowStatus(conFallo);
    assert.equal(d.status, 'borrador_listo');
    assert.deepEqual(d.pending, ['biblioteca']);
    // Reintentar esa etapa sola no regenera nada de lo que ya está en `ok`.
    assert.equal(stageToRetry(conFallo), 'biblioteca');
});

test('⚠️ la etapa dispara el MISMO camino, no uno propio', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    assert.match(engine, /biblioteca: stageBiblioteca/, 'la etapa está cableada en RUNNERS');
    const etapa = engine.slice(engine.indexOf('const stageBiblioteca ='), engine.indexOf('const RUNNERS ='));
    assert.match(etapa, /await sendMediaToLibrary\(/, 'llama a la función compartida');
    // Un segundo camino de promoción se separaría del primero en silencio.
    assert.doesNotMatch(etapa, /promoteToLibrary\(/);
    assert.doesNotMatch(etapa, /transitionSubmission\(/);
    // Y sigue habiendo UN solo sitio que promueve en todo el motor.
    assert.equal((engine.match(/await promoteToLibrary\(/g) || []).length, 1);
    // El autor queda escrito: el historial tiene que decir que no fue una persona.
    assert.match(etapa, /actor: 'ai_workflow'/);
});

test('⚠️ el workflow NO pisa una decisión humana sobre la solicitud', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    const etapa = engine.slice(engine.indexOf('const stageBiblioteca ='), engine.indexOf('const RUNNERS ='));
    // Lo que alguien mandó a «requiere info», descartó o archivó se deja como
    // está: aprobarlo solo sería desobedecer a quien lo decidió.
    const lista = etapa.match(/AUTO_APROBABLES = \[([^\]]*)\]/);
    assert.ok(lista, 'la lista de estados auto-aprobables está declarada');
    for (const prohibido of ['requiere_info', 'descartado', 'archivado']) {
        assert.ok(!lista[1].includes(prohibido), `${prohibido} no puede aprobarse solo`);
    }
    for (const permitido of ['recibido', 'en_revision']) {
        assert.ok(lista[1].includes(permitido), `${permitido} sí es un estado que nadie decidió`);
    }
    // Y se decide con una lectura FRESCA: entre `loadContext` y la etapa alguien
    // pudo tocar la ficha.
    assert.match(etapa, /await getSubmission\(row\.campaignId, row\.submissionId\)/);
    assert.ok(etapa.indexOf('getSubmission(') < etapa.indexOf('sendMediaToLibrary('), 'se relee ANTES de promover');
    // La guardia es de la ETAPA, no de la función compartida: ahí quien decide
    // es la persona que pulsa el botón.
    const compartida = engine.slice(engine.indexOf('export async function sendMediaToLibrary('), engine.indexOf('export async function publishArticle('));
    assert.doesNotMatch(compartida, /AUTO_APROBABLES/);
});

test('⚠️ automatizar la Biblioteca NO publica el artículo', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    // La regla estructural de v4.1000 sigue entera: el INSERT nace sin publicar
    // y el único UPDATE que publica vive dentro de `publishArticle`.
    assert.match(engine, /published, category[\s\S]{0,400}?FALSE/);
    const publica = [...engine.matchAll(/published = TRUE/g)].map(m => m.index);
    assert.equal(publica.length, 1, 'un solo punto que publica');
    const inicio = engine.indexOf('export async function publishArticle(');
    const fin = engine.indexOf('async function afterPublished(');
    assert.ok(publica[0] > inicio && publica[0] < fin, 'y está dentro de publishArticle');
});

test('el envío automático se puede apagar, por campaña y por entorno', () => {
    // Nace ENCENDIDO: es lo que se pidió.
    assert.equal(normalizeSubmissionsConfig({}).autoLibrary, true);
    assert.equal(normalizeSubmissionsConfig({ autoLibrary: false }).autoLibrary, false);
    // Aditivo: una campaña guardada antes de v4.1002 no lo trae y queda encendida.
    assert.equal(normalizeSubmissionsConfig({ enabled: true }).autoLibrary, true);

    const engine = leer('server/lib/submissionArticleEngine.js');
    assert.match(engine, /SUBMISSION_ARTICLE_LIBRARY/);
    const etapa = engine.slice(engine.indexOf('const stageBiblioteca ='), engine.indexOf('const RUNNERS ='));
    assert.match(etapa, /autoLibraryEnabled\(\)/);
    assert.match(etapa, /autoLibrary === false/);
    // Apagado NO deja el artículo con una etapa pendiente para siempre: se
    // cierra en `ok` con su motivo escrito, no en `error`.
    const apagados = etapa.slice(etapa.indexOf('autoLibraryEnabled()'), etapa.indexOf('AUTO_APROBABLES'));
    assert.doesNotMatch(apagados, /error:/);
    assert.equal((apagados.match(/note:/g) || []).length, 2, 'los dos interruptores dicen su motivo');
});

// ════════════════════════════════════════════════════════════════════════════
// v4.1003 — El material de la solicitud se elige DESDE NOTICIAS
// ════════════════════════════════════════════════════════════════════════════

test('⚠️ el selector de portada y galería es UNO y lo montan las DOS pantallas', () => {
    // Vivía en línea dentro del panel de la solicitud, así que quien revisaba
    // el artículo en Noticias —que es donde se edita el texto— no tenía forma
    // de poner la portada con el material del club: los dos campos de esa
    // pantalla sólo ofrecían «subir un archivo». Copiarlo habría dejado dos
    // selectores que se separan en silencio.
    const compartido = leer('src/components/admin/contribution/ArticleMediaPicker.tsx');
    assert.match(compartido, /export default ArticleMediaPicker/);

    const panel = leer('src/components/admin/contribution/SubmissionArticlePanel.tsx');
    const news = leer('src/pages/admin/News.tsx');
    for (const [nombre, src] of [['el panel de la solicitud', panel], ['el editor de Noticias', news]]) {
        assert.match(src, /import ArticleMediaPicker from/, `${nombre} importa el compartido`);
        assert.match(src, /<ArticleMediaPicker/, `${nombre} lo monta`);
    }
    // Y el panel ya no lleva su copia: el borrador y sus ayudantes se fueron
    // con el bloque.
    assert.doesNotMatch(panel, /borradorMedia/);
    assert.doesNotMatch(panel, /patchMedia/);
    // Noticias no reimplementa la rejilla: pinta el compartido y nada más.
    assert.doesNotMatch(news, /isCover/);
});

test('⚠️ el selector escribe por el camino de SIEMPRE', () => {
    const compartido = leer('src/components/admin/contribution/ArticleMediaPicker.tsx');
    // Guardar es `PUT …/article/media` y traer las fotos es
    // `POST …/article/library`: los dos endpoints que ya existían. Un segundo
    // camino de escritura se separaría del primero en silencio.
    assert.match(compartido, /\$\{base\}\/media/);
    assert.match(compartido, /\$\{base\}\/library/);
    const escrituras = [...compartido.matchAll(/method:\s*'(PUT|POST|DELETE|PATCH)'/g)];
    assert.equal(escrituras.length, 2, 'exactamente dos escrituras: guardar y promover');
    // Promover DICE su consecuencia completa antes de hacerla.
    const confirma = compartido.match(/window\.confirm\(`([^`]*)`\)/);
    assert.ok(confirma, 'hay confirmación');
    for (const frase of ['URL pública', 'NO se publica']) {
        assert.ok(confirma[1].includes(frase), `la confirmación dice «${frase}»`);
    }
});

test('⚠️ Noticias se entera de lo que el selector acaba de escribir en el Post', () => {
    // El servidor reescribe `image`, `images` y `videoGallery` del Post. Si el
    // formulario abierto no se refresca, «Guardar Cambios» escribiría encima la
    // portada anterior — y se leería como que elegir la foto no funcionó.
    const news = leer('src/pages/admin/News.tsx');
    assert.match(news, /const aplicarMediaDeSolicitud = /);
    const fn = news.slice(news.indexOf('const aplicarMediaDeSolicitud ='), news.indexOf('const handleImageUpload ='));
    for (const campo of ['image:', 'images:', 'videoGallery:']) {
        assert.ok(fn.includes(campo), `refresca ${campo}`);
    }
    assert.match(fn, /pendingLibrary/, 'y el recuento de lo que falta');
    // Los dos montajes lo usan: uno sin refrescar dejaría media pantalla mintiendo.
    assert.equal((news.match(/onView=\{aplicarMediaDeSolicitud\}/g) || []).length, 2);
});

test('⚠️ portada y galería de Noticias ofrecen las DOS vías (regla de v4.700)', () => {
    const news = leer('src/pages/admin/News.tsx');
    // Sólo se podía subir, así que reutilizar una foto ya cargada obligaba a
    // descargarla del sitio y volverla a subir.
    assert.match(news, /import MediaPicker from/);
    // Al menos una vía a la Biblioteca por casilla. Desde v4.1004 la portada
    // tiene DOS disparadores —el recuadro, cuando el artículo viene de una
    // solicitud, y el botón de abajo siempre—, así que se comprueba que exista
    // y no cuántos son: contar la forma exacta se rompe al agregar un camino
    // legítimo, que es justo lo que pasó acá.
    assert.ok((news.match(/setPickerTarget\('image'\)/g) || []).length >= 1, 'la portada abre la Biblioteca');
    assert.ok((news.match(/setPickerTarget\('gallery'\)/g) || []).length >= 1, 'la galería también');
    // ⚠️ Y SUBIR NO PUEDE DESAPARECER. Con el recuadro abriendo el selector, la
    // vía de subir desde el computador necesita su propia puerta: sin ella se
    // habría perdido una de las dos vías al arreglar la otra (regla de v4.700).
    assert.match(news, /SUBIR DESDE EL COMPUTADOR/);
    assert.equal((news.match(/onChange=\{\(e\) => handleImageUpload\(e\)\}/g) || []).length, 2,
        'la portada conserva su subida en las dos ramas: con carpeta y sin ella');
    // UNO solo, con el destino en el estado: uno por casilla los deja separarse.
    assert.equal((news.match(/<MediaPicker/g) || []).length, 1);
    assert.match(news, /pickerTarget === 'image' \? 1 :/, 'la portada admite una sola');
    // Un video elegido de la Biblioteca no puede acabar en un <img>.
    assert.match(news, /i\.type === 'video'/);
});

test('⚠️ la sincronización sólo pisa la portada que puso el workflow', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    const sync = engine.slice(engine.indexOf('export async function syncArticleMedia('), engine.indexOf('export async function updateArticleMedia('));
    const linea = sync.match(/const pisarPortada = .*/)[0];
    // Antes también pisaba CUALQUIER portada que fuera una foto de la
    // solicitud, y desde v4.1003 elegir una de ésas a mano es el caso normal:
    // la siguiente sincronización la revertía sin decir nada.
    assert.doesNotMatch(linea, /urlsConocidas\.has\(post\.image\)/);
    assert.match(linea, /coverSynced === post\.image/);
    // La excepción declarada: una persona acaba de elegirla en el selector.
    assert.match(linea, /forceCover/);
    const update = engine.slice(engine.indexOf('export async function updateArticleMedia('), engine.indexOf('export async function transitionArticle('));
    assert.match(update, /syncArticleMedia\(row\.submissionId, \{ forceCover: Boolean\(portada\) \}\)/);
    // Y sólo esa vía la fuerza: el workflow y la promoción no.
    assert.equal((engine.match(/forceCover: /g) || []).length, 1);
});

// ─── En qué sitio nace el artículo (v4.1006) ───────────────────────────

test('la cascada del sitio recorre las seis señales, en orden', () => {
    const row = { clubId: 'A' }, submission = { originClubId: 'B' };
    const campaign = { ownerClubId: 'C', recipientClubId: 'D' };
    assert.equal(resolveArticleSite({ row, submission, campaign, targetClubId: 'E', sessionClubId: 'F' }).source, 'articulo');
    assert.equal(resolveArticleSite({ submission, campaign, targetClubId: 'E', sessionClubId: 'F' }).source, 'origen');
    assert.equal(resolveArticleSite({ campaign, targetClubId: 'E', sessionClubId: 'F' }).source, 'dueno');
    assert.equal(resolveArticleSite({ campaign: { recipientClubId: 'D' }, targetClubId: 'E', sessionClubId: 'F' }).source, 'beneficiario');
    assert.equal(resolveArticleSite({ targetClubId: 'E', sessionClubId: 'F' }).source, 'alcance');
    assert.equal(resolveArticleSite({ sessionClubId: 'F' }).clubId, 'F');
    for (const id of ARTICLE_SITE_SOURCE_IDS) assert.ok(articleSiteSourceLabel(id).length > 5, id);
});

test('⚠️ el caso REPORTADO resuelve: campaña de la plataforma + solicitud anterior a v4.999', () => {
    // Las tres señales de v4.1000 dan null a la vez —el dueño es NULL por
    // definición en una campaña de la plataforma y el origen vale null para
    // toda solicitud anterior a v4.999—, y la etapa moría sin salida.
    const caso = { row: { clubId: null }, submission: { originClubId: null }, campaign: { ownerClubId: null, recipientClubId: null } };
    assert.equal(resolveArticleSite(caso).clubId, null);
    assert.equal(resolveArticleSite({ ...caso, sessionClubId: 'sitio-4281' }).clubId, 'sitio-4281');
    assert.equal(resolveArticleSite({ ...caso, sessionClubId: 'sitio-4281' }).source, 'sesion');
});

test('⚠️ lo que declara la CAMPAÑA manda sobre quién pregunta', () => {
    // Con la sesión primero, dos administradores distintos producirían dos
    // artículos en dos sitios distintos a partir del mismo material.
    const base = { campaign: { ownerClubId: null, recipientClubId: 'benef' }, targetClubId: 'alcance' };
    assert.equal(resolveArticleSite({ ...base, sessionClubId: 'quien-mira' }).clubId, 'benef');
    assert.equal(resolveArticleSite({ campaign: {}, targetClubId: 'alcance', sessionClubId: 'quien-mira' }).clubId, 'alcance');
});

test('un sitio ya resuelto no lo mueve ninguna otra señal', () => {
    const r = resolveArticleSite({ row: { clubId: 'ya' }, submission: { originClubId: 'otro' }, sessionClubId: 'tercero' });
    assert.equal(r.clubId, 'ya');
});

test('el error dice la SALIDA, y cuál según quién pregunta', () => {
    const sinSesion = articleSiteHelp({ campaign: { ownerClubId: null, recipientClubId: null }, hasSession: false });
    assert.match(sinSesion, /desde el panel del sitio/);
    assert.match(sinSesion, /beneficiario/);
    // Con sesión, mandarlo al panel del sitio sería mandarlo donde ya está.
    const conSesion = articleSiteHelp({ campaign: { ownerClubId: null, recipientClubId: null }, hasSession: true });
    assert.doesNotMatch(conSesion, /desde el panel del sitio/);
    assert.match(conSesion, /beneficiario/);
});

test('⚠️ el sitio de la sesión NO sale de req.user.clubId a secas', () => {
    // Para el operador de la plataforma ese valor es «Origen» —el sitio por el
    // que entró—, no el que va a publicar: usarlo pondría el artículo en el
    // listado de otra organización (la lección de v4.853). Quien lo pasa es el
    // alcance de la campaña, que ya vale null para el operador.
    const ctrl = leer('server/controllers/submissionArticleController.js');
    assert.match(ctrl, /const sessionClubIdOf = \(req\) => req\.campaignScope\?\.clubId \|\| null;/);
    const cuerpo = ctrl.slice(ctrl.indexOf('export const generateSubmissionArticle'), ctrl.indexOf('export const updateSubmissionArticleMedia'));
    assert.doesNotMatch(cuerpo, /req\.user\?\.clubId/);
});

test('⚠️ las CUATRO vías que hacen avanzar el workflow pasan el sitio de la sesión', () => {
    const ctrl = leer('server/controllers/submissionArticleController.js');
    // Generar, sondear y volver a la cola llaman a advanceArticle; reintentar
    // la etapa lo hace por dentro de retryArticleStage.
    const avances = ctrl.match(/advanceArticle\([^)]*\)/g) || [];
    assert.equal(avances.length, 3, 'llamadas a advanceArticle desde el controlador');
    for (const a of avances) assert.match(a, /sessionClubId: sessionClubIdOf\(req\)/, a);
    assert.match(ctrl, /retryArticleStage\(\{ row, stage: [^}]*sessionClubId: sessionClubIdOf\(req\) \}\)/);
    const engine = leer('server/lib/submissionArticleEngine.js');
    assert.match(engine, /const r = await advanceArticle\(rows\[0\], \{ sessionClubId \}\);/);
});

test('⚠️ el sitio se adopta en UN solo punto y nunca pisa uno ya resuelto', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    // Una adopción por vía dejaría a la cuarta sin ella, en silencio.
    assert.equal((engine.match(/adoptArticleSite\(/g) || []).length, 2, 'definición + un solo llamador');
    const fn = engine.slice(engine.indexOf('export async function adoptArticleSite('), engine.indexOf('// ─── Avanzar'));
    assert.match(fn, /WHERE id = \$1 AND "clubId" IS NULL/);
    assert.match(fn, /if \(!row\?\.id \|\| !clubId \|\| row\.clubId\) return row;/);
});

test('⚠️ la cascada vive en el criterio puro, no escrita con || en el motor', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    const ctx = engine.slice(engine.indexOf('const loadContext = async'), engine.indexOf('export async function publicHostFor'));
    assert.match(ctx, /resolveArticleSite\(\{/);
    assert.doesNotMatch(ctx, /row\.clubId \|\| submission\.originClubId/);
    // Y el alcance necesita la columna: sin ella la señal es siempre null.
    assert.match(ctx, /SELECT id, name, slug, content, targeting,/);
});

test('⚠️ el sitio de la sesión viaja como PARÁMETRO, no pegado a la fila', () => {
    // El reclamo devuelve una fila FRESCA de la base, y reasignarla se llevaría
    // por delante cualquier campo pegado encima, en silencio.
    const engine = leer('server/lib/submissionArticleEngine.js');
    assert.doesNotMatch(engine, /__sessionClubId/);
    assert.match(engine, /const loadContext = async \(row, \{ sessionClubId = null \} = \{\}\)/);
    assert.match(engine, /await loadContext\(row, \{ sessionClubId \}\)/);
});

test('el único sitio del alcance sólo cuenta cuando el alcance nombra UNO', () => {
    const engine = leer('server/lib/submissionArticleEngine.js');
    const fn = engine.slice(engine.indexOf('const singleTargetClubId = async'), engine.indexOf('// ─── Contexto compartido'));
    assert.match(fn, /t\.clubIds\.length !== 1/);
    assert.match(fn, /t\.districts\.length !== 1/);
    // «all» apunta a todos: elegir uno sería inventar cuál.
    assert.doesNotMatch(fn, /=== 'all'/);
    // El distrito se resuelve con el MISMO criterio de v4.744.
    assert.match(fn, /pickDistrictSite\(d\.rows\[0\], cand\.rows\)/);
    // Y nunca lanza: es una señal más, no un requisito.
    assert.match(fn, /catch \(e\) \{ console\.warn/);
});

test('⚠️ el motivo de una etapa fallida se lee ENTERO en la ficha', () => {
    // Iba con «truncate», así que la salida quedaba detrás de unos puntos
    // suspensivos y de un «title» que nadie abre.
    const panel = leer('src/components/admin/contribution/SubmissionArticlePanel.tsx');
    assert.doesNotMatch(panel, /truncate max-w-md/);
    assert.match(panel, /\{s\.error && <p className="ml-5 mt-0\.5 text-\[11px\] text-red-700 leading-snug">\{s\.error\}<\/p>\}/);
    // Y el resumen del estado se recorta sin partir palabras.
    const engine = leer('server/lib/submissionArticleEngine.js');
    assert.match(engine, /truncateAtWord\(String\(e\?\.message \|\| e\), 200\)/);
});
