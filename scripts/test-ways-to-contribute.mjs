// ════════════════════════════════════════════════════════════════════
// «Maneras de Contribuir» en el Generador de Publicaciones — v4.967
//
// Prueba el CRITERIO, separado de la orquestación: no necesita base,
// credenciales ni red. El bloque del espejo pide `esbuild` y se salta solo si
// no está.
//
// Lo que estas pruebas existen para atrapar, y que ninguna otra ve:
//   · que el décimo tipo llegue de verdad al generador (la duplicación de
//     `TYPE_PROMPTS` en el controlador lo hacía caer a `standard` en silencio);
//   · que el brief DECLARE lo que no se sabe, en vez de dejar el hueco;
//   · que el contexto adicional del usuario cuente como dato suministrado;
//   · que la recomendación no pueda elegir una foto que no está.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    campaignAssets, pickableAssets, describeAsset, assetsHaveText,
    buildWaysBrief, waysFactContext, factClauseFor, normalizeAdditionalContext,
    buildRecommendPrompt, parseRecommendation, RECOMMEND_MAX,
    waysObjectiveCatalog, CONTRIBUTION_FACT_CLAUSE,
    WAYS_TYPE_ID, MAX_ADDITIONAL_CONTEXT, DEFAULT_CONTEXT_NOTE,
} from '../server/lib/waysToContribute.js';
import {
    TYPE_PROMPTS, TYPE_LABELS, resolveContext, needsCampaign, publicationTypes,
} from '../server/lib/publicationContext.js';
import { validateEmergencyCopy, EMERGENCY_FACT_CLAUSE } from '../server/lib/emergencySpec.js';
import { OBJECTIVES } from '../server/lib/campaignPostSpec.js';

const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Una campaña de verdad, con la forma que `normalizeContent` produce.
const CAMPANA = {
    id: 'camp-1',
    slug: 'terremoto-colombia',
    name: 'Terremoto Colombia',
    campaignType: 'terremoto',
    content: {
        hero: {
            title: 'Colombia nos necesita',
            subtitle: 'Una respuesta rotaria al sismo',
            text: 'Comunidades del Chocó están enfrentando las consecuencias del sismo.',
            badge: 'EMERGENCIA · TERREMOTO',
            image: 'https://s3/hero.jpg',
            imageAlt: 'Voluntarios descargando ayuda',
            images: [{ url: 'https://s3/hero-2.jpg', alt: 'Entrega de mercados' }],
        },
        location: 'San José del Palmar, Chocó — Colombia',
        eventDate: '14 de agosto de 2026',
        waysToHelp: [
            { id: 'w1', title: 'Llevá elementos a un punto de acopio', description: '', active: true },
            { id: 'w2', title: 'Aportá en línea', description: '', active: true },
            { id: 'w3', title: 'Retirada', description: '', active: false },
        ],
        requiredItems: [
            { id: 'i1', title: 'Agua potable', description: 'Botellas selladas', active: true },
            { id: 'i2', title: 'Frazadas', description: '', active: true },
        ],
        gallery: {
            items: [
                { url: 'https://s3/g1.jpg', caption: 'Voluntarios en el acopio de Cali', credit: 'RC Cali', alt: '' },
                { url: 'https://s3/g2.mp4', caption: 'Recorrido por la zona', credit: '', alt: '' },
                { url: 'https://s3/hero.jpg', caption: 'repetida', credit: '', alt: '' },
            ],
        },
        requiredItemsVideos: [{ url: 'https://s3/v.mp4', title: 'Jornada', poster: 'https://s3/poster.jpg' }],
        partners: [{ id: 'p1', name: 'ABACO', logo: 'https://s3/abaco.png', active: true }],
        seo: { ogImage: 'https://s3/og.jpg' },
        finalCta: { quote: 'Servir para cambiar vidas' },
        infoBlocks: [{ id: 'b1', title: 'Cómo trabajamos', text: 'Con los clubes de la zona.', active: true }],
    },
};
const STATS = [{ id: 's1', label: 'Familias atendidas', value: '1.240', source: 'UNGRD', updatedAt: '2026-08-20' }];
const ITEMS = [{ title: 'Agua potable', description: 'Botellas selladas' }];

// ─── 1. El décimo tipo llega al catálogo ───────────────────────────────

test('el tipo existe en el catálogo del servidor y sale en la rejilla', () => {
    assert.ok(TYPE_PROMPTS[WAYS_TYPE_ID], 'falta en TYPE_PROMPTS');
    assert.equal(TYPE_LABELS[WAYS_TYPE_ID], 'Maneras de Contribuir');
    assert.ok(publicationTypes().some(t => t.id === WAYS_TYPE_ID));
    assert.equal(publicationTypes().length, 10);
});

test('«contribuir» no es «donar», y el foco lo dice', () => {
    const foco = TYPE_PROMPTS[WAYS_TYPE_ID].focus.toLowerCase();
    assert.ok(/no es la única|no la única/.test(foco),
        'el foco tiene que decir que pedir dinero es UNA manera, o todo copy termina pidiendo plata');
});

test('resolveContext declara si el tipo exige campaña', () => {
    assert.equal(resolveContext({ type: WAYS_TYPE_ID }).needsCampaign, true);
    assert.equal(resolveContext({ type: 'standard' }).needsCampaign, false);
    // Un tipo inventado cae al default en vez de romper el prompt.
    assert.equal(resolveContext({ type: 'inventado' }).type, 'standard');
    assert.equal(resolveContext({ type: 'inventado' }).needsCampaign, false);
    assert.equal(needsCampaign('inventado'), false);
});

// ─── 2. La duplicación que impedía que el tipo llegara ─────────────────

test('el controlador NO declara su propio catálogo de tipos', () => {
    const src = leer('server/controllers/contentStudioController.js');
    assert.ok(!/^const TYPE_PROMPTS = \{/m.test(src),
        'volvió la copia local: un tipo nuevo caería a `standard` en silencio');
    assert.ok(!/^const INTEREST_AREAS = \{/m.test(src), 'volvió la copia local de las áreas');
    assert.ok(src.includes("from '../lib/publicationContext.js'"), 'no lee la fuente única');
});

test('el alcance de campañas se resuelve en UN solo sitio', () => {
    const post = leer('server/controllers/campaignPostController.js');
    const ways = leer('server/controllers/waysToContributeController.js');
    assert.ok(!/^const campaignsInScope = async/m.test(post), 'campaignPostController re-declaró el alcance');
    assert.ok(!/^const campaignsInScope = async/m.test(ways), 'waysToContributeController declaró su propio alcance');
    for (const [nombre, src] of [['post', post], ['ways', ways]]) {
        assert.ok(src.includes("from '../lib/campaignScope.js'"), `${nombre} no importa el alcance compartido`);
    }
});

test('los objetivos son los de la Infografía de Campaña, no un catálogo propio', () => {
    const ids = waysObjectiveCatalog().map(o => o.id).sort();
    assert.deepEqual(ids, Object.keys(OBJECTIVES).sort(),
        'un segundo catálogo haría que «Ayuda humanitaria» signifique cosas distintas en un post y en una infografía');
});

// ─── 3. Las fotos de la campaña ────────────────────────────────────────

test('las fotos salen del contenido de la campaña, sin tabla puente', () => {
    const a = campaignAssets(CAMPANA.content);
    const urls = a.map(x => x.url);
    assert.ok(urls.includes('https://s3/hero.jpg'));
    assert.ok(urls.includes('https://s3/hero-2.jpg'));
    assert.ok(urls.includes('https://s3/g1.jpg'));
    assert.ok(urls.includes('https://s3/poster.jpg'));
    assert.ok(urls.includes('https://s3/og.jpg'));
    // La portada va PRIMERA: es la que el administrador eligió como principal.
    assert.equal(urls[0], 'https://s3/hero.jpg');
});

test('una foto repetida entre secciones aparece UNA vez', () => {
    const urls = campaignAssets(CAMPANA.content).map(x => x.url);
    assert.equal(urls.filter(u => u === 'https://s3/hero.jpg').length, 1);
});

test('los videos se marcan y no se ofrecen como fotografía', () => {
    const todos = campaignAssets(CAMPANA.content);
    assert.ok(todos.some(a => a.url.endsWith('.mp4') && a.kind === 'video'));
    const elegibles = pickableAssets(todos);
    assert.ok(!elegibles.some(a => a.kind === 'video'), 'un video no es la foto de un post');
    assert.ok(!elegibles.some(a => a.origin === 'partner'),
        'un escudo de aliado como foto de publicación se ve roto');
});

test('el pie, el alt y el crédito son lo que describe una foto', () => {
    const g = campaignAssets(CAMPANA.content).find(a => a.url === 'https://s3/g1.jpg');
    const d = describeAsset(g);
    assert.ok(d.includes('Voluntarios en el acopio de Cali'));
    assert.ok(d.includes('RC Cali'));
});

test('sin ninguna descripción NO se ofrece recomendar', () => {
    assert.equal(assetsHaveText(campaignAssets(CAMPANA.content)), true);
    const pelada = campaignAssets({ hero: { image: 'https://s3/x.jpg' } });
    assert.equal(assetsHaveText(pelada), false,
        'recomendar sin metadata sería ordenar al azar y presentarlo como criterio');
});

test('una campaña sin fotos devuelve lista vacía, no revienta', () => {
    assert.deepEqual(campaignAssets(null), []);
    assert.deepEqual(campaignAssets({}), []);
});

// ─── 4. El brief ───────────────────────────────────────────────────────

const brief = (extra = {}) => buildWaysBrief({
    campaign: CAMPANA, objective: 'sensibilizacion', audience: 'local', language: 'es',
    stats: STATS, items: ITEMS, campaignUrl: 'https://rotary4281.org/maneras-de-contribuir?c=terremoto-colombia',
    ...extra,
});

test('el brief trae el contexto real de la campaña', () => {
    const b = brief();
    assert.ok(b.includes('Terremoto Colombia'));
    assert.ok(b.includes('Colombia nos necesita'));
    assert.ok(b.includes('San José del Palmar'));
    assert.ok(b.includes('14 de agosto de 2026'));
    assert.ok(b.includes('Familias atendidas: 1.240'));
    assert.ok(b.includes('UNGRD'), 'la fuente de la cifra tiene que viajar con la cifra');
    assert.ok(b.includes('Agua potable'));
    assert.ok(b.includes('ABACO'));
});

test('lo que NO se sabe se DECLARA; el hueco no se deja en silencio', () => {
    const sinDatos = buildWaysBrief({
        campaign: { name: 'Campaña X', content: {} }, stats: [], items: [],
    });
    assert.ok(/NO se conoce el lugar/.test(sinDatos));
    assert.ok(/NO se conoce la fecha/.test(sinDatos));
    assert.ok(/NO tiene cifras registradas/.test(sinDatos));
    assert.ok(/no enumera elementos necesarios/.test(sinDatos));
    assert.ok(/no inventes ninguna dirección/i.test(sinDatos), 'sin enlace, hay que decirlo');
});

test('sin contexto adicional se genera igual, y el brief lo dice', () => {
    const b = brief({ additionalContext: '' });
    assert.ok(b.includes(DEFAULT_CONTEXT_NOTE),
        'el hueco vacío es una invitación a completarlo');
});

test('el contexto adicional viaja literal y se declara como suministrado', () => {
    const texto = 'Entregamos 300 mercados con los clubes de Quibdó.';
    const b = brief({ additionalContext: texto });
    assert.ok(b.includes(texto));
    assert.ok(/información suministrada/.test(b));
    assert.ok(!b.includes(DEFAULT_CONTEXT_NOTE));
});

test('el contexto adicional se acota al tope declarado', () => {
    const largo = 'x'.repeat(MAX_ADDITIONAL_CONTEXT + 500);
    assert.equal(normalizeAdditionalContext(largo).length, MAX_ADDITIONAL_CONTEXT);
    assert.equal(normalizeAdditionalContext(null), '');
});

test('el brief prohíbe deducir hechos de la fotografía', () => {
    const asset = campaignAssets(CAMPANA.content).find(a => a.url === 'https://s3/g1.jpg');
    const b = brief({ asset });
    assert.ok(b.includes('Voluntarios en el acopio de Cali'));
    assert.ok(/no son datos hasta que estén escritos/.test(b),
        'sin esta frase, el modelo cuenta cuántas personas hay en la foto y lo escribe como hecho');
});

test('sin foto de campaña se dice que no hay nada registrado sobre ella', () => {
    const b = brief({ asset: null });
    assert.ok(/No hay información registrada sobre la fotografía/.test(b));
});

test('el brief recuerda que contribuir no es sólo donar', () => {
    assert.ok(/no pidas donaciones|no es la única|pedir dinero es UNA/i.test(brief()));
});

test('las maneras de contribuir ACTIVAS entran; las apagadas no', () => {
    const b = brief();
    assert.ok(b.includes('Llevá elementos a un punto de acopio'));
    assert.ok(!b.includes('Retirada'), 'una manera desactivada no se ofrece');
});

test('objetivo, audiencia e idioma inválidos caen al default sin romper', () => {
    const b = buildWaysBrief({
        campaign: CAMPANA, objective: 'inventado', audience: 'inventada', language: 'kl',
        stats: [], items: [],
    });
    assert.ok(b.includes(OBJECTIVES.sensibilizacion.label));
    assert.ok(/español/i.test(b));
});

// ─── 5. La veracidad ───────────────────────────────────────────────────

test('la cláusula la decide el TIPO de campaña, no su nombre', () => {
    assert.equal(factClauseFor('terremoto'), EMERGENCY_FACT_CLAUSE);
    assert.equal(factClauseFor('educacion'), CONTRIBUTION_FACT_CLAUSE);
    // Un tipo desconocido no puede describir un desastre que quizá no ocurrió.
    assert.equal(factClauseFor('inventado'), CONTRIBUTION_FACT_CLAUSE);
});

test('la cláusula institucional prohíbe lo mismo sin hablar de un desastre', () => {
    assert.ok(!/desastre/i.test(CONTRIBUTION_FACT_CLAUSE),
        'aplicada a una campaña de educación describiría una situación que no existe');
    assert.ok(/beneficiarios/i.test(CONTRIBUTION_FACT_CLAUSE));
    assert.ok(/dinero recaudado/i.test(CONTRIBUTION_FACT_CLAUSE));
});

test('una cifra que la campaña NO tiene se rechaza', () => {
    const ctx = waysFactContext({ content: CAMPANA.content, stats: STATS, items: ITEMS });
    const r = validateEmergencyCopy('Ya atendimos a 9.999 familias en la zona.', ctx);
    assert.equal(r.ok, false);
    // El aviso NOMBRA el número, ya normalizado sin separador de miles: es lo
    // que se le devuelve al modelo para que lo corrija.
    assert.ok(r.issues.join(' ').includes('9999'), r.issues.join(' '));
});

test('una cifra registrada en la campaña SÍ se puede mencionar', () => {
    const ctx = waysFactContext({ content: CAMPANA.content, stats: STATS, items: ITEMS });
    assert.equal(validateEmergencyCopy('Familias atendidas: 1.240.', ctx).ok, true);
});

test('⚠️ lo que escribió el usuario cuenta como dato suministrado', () => {
    const sin = waysFactContext({ content: CAMPANA.content, stats: STATS, items: ITEMS });
    assert.equal(validateEmergencyCopy('Entregamos 300 mercados.', sin).ok, false);

    const con = waysFactContext({
        content: CAMPANA.content, stats: STATS, items: ITEMS,
        additionalContext: 'Entregamos 300 mercados con los clubes de Quibdó.',
    });
    assert.equal(validateEmergencyCopy('Entregamos 300 mercados.', con).ok, true,
        'sin esto, contar lo que de verdad pasó sería imposible aunque quien lo escribe lo sepa');
});

test('los cuantificadores vagos siguen siendo cifras disfrazadas', () => {
    const ctx = waysFactContext({ content: CAMPANA.content, stats: [], items: [] });
    assert.equal(validateEmergencyCopy('Miles de familias esperan ayuda.', ctx).ok, false);
});

// ─── 6. La recomendación ───────────────────────────────────────────────

test('el modelo propone y el código decide: catálogo CERRADO de índices', () => {
    const picks = parseRecommendation('{"picks":[{"index":0},{"index":99},{"index":-1},{"index":1}]}', 3);
    assert.deepEqual(picks.map(p => p.index), [0, 1],
        'un índice que no existe no puede elegir una foto que no está');
});

test('la recomendación no repite ni se pasa del tope', () => {
    const muchas = { picks: Array.from({ length: 20 }, (_, i) => ({ index: i % 3 })) };
    const picks = parseRecommendation(muchas, 3);
    assert.equal(picks.length, 3);
    assert.equal(new Set(picks.map(p => p.index)).size, picks.length);
    const largo = { picks: Array.from({ length: 20 }, (_, i) => ({ index: i })) };
    assert.equal(parseRecommendation(largo, 20).length, RECOMMEND_MAX);
});

test('una respuesta ilegible NO impide elegir la foto a mano', () => {
    assert.deepEqual(parseRecommendation('no soy json', 5), []);
    assert.deepEqual(parseRecommendation(null, 5), []);
    assert.deepEqual(parseRecommendation({ picks: 'nada' }, 5), []);
});

test('el prompt de recomendación enumera índices y admite quedarse vacío', () => {
    const p = buildRecommendPrompt({
        assets: campaignAssets(CAMPANA.content),
        additionalContext: 'el trabajo de los voluntarios',
        campaignName: 'Terremoto Colombia',
    });
    assert.ok(p.includes('0.'));
    assert.ok(p.includes('Voluntarios en el acopio de Cali'));
    assert.ok(/lista vacía/.test(p), 'sin esa salida, el modelo elige al azar antes que no elegir');
});

// ─── 7. La procedencia ─────────────────────────────────────────────────

test('la procedencia NO es una columna de SocialPublication', () => {
    const schema = leer('server/prisma/schema.prisma');
    const modelo = schema.slice(schema.indexOf('model SocialPublication'));
    const cuerpo = modelo.slice(0, modelo.indexOf('\n}'));
    for (const campo of ['campaignId', 'additionalContext', 'publicationType']) {
        assert.ok(!cuerpo.includes(campo),
            `${campo} entró a Prisma: una columna declarada y todavía inexistente deja el listado de la Biblioteca y el cron de programadas en 500 (regla de logo_intl)`);
    }
    assert.ok(leer('server/lib/ensurePublicationOriginSchema.js').includes('SocialPublicationOrigin'));
});

test('escribir la procedencia nunca revierte la publicación', () => {
    const src = leer('server/lib/publicationOrigin.js');
    assert.ok(/catch \(e\)/.test(src), 'sin captura, un fallo de traza tumbaría la generación');
    assert.ok(src.includes('return { ok: false'), 'tiene que devolver el motivo, no lanzarlo');
    const ctrl = leer('server/controllers/contentStudioController.js');
    assert.ok(!/await savePublicationOrigin[^;]*\n\s*draftId = null/.test(ctrl));
});

test('la tabla se AMPLÍA y nunca se recrea', () => {
    const src = leer('server/lib/ensurePublicationOriginSchema.js');
    assert.ok(src.includes('CREATE TABLE IF NOT EXISTS'));
    assert.ok(!/DROP TABLE|TRUNCATE/i.test(src));
});

// ─── 8. El espejo del navegador ────────────────────────────────────────

test('el espejo del catálogo de tipos coincide con el servidor', async (t) => {
    let build;
    try { ({ build } = await import('esbuild')); }
    catch { return t.skip('esbuild no está instalado'); }

    const out = await build({
        entryPoints: [new URL('../src/lib/publicationContext.ts', import.meta.url).pathname],
        bundle: true, write: false, format: 'esm', platform: 'neutral',
    });
    const espejo = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

    // Se comparan las SALIDAS, no sólo las claves: es lo único que impide que
    // «Narración de historias» de un lado sea «Storytelling» del otro.
    assert.deepEqual(
        Object.keys(espejo.TYPE_LABELS).sort(),
        Object.keys(TYPE_LABELS).sort(),
        'las dos listas de tipos se separaron'
    );
    for (const id of Object.keys(TYPE_LABELS)) {
        assert.equal(espejo.TYPE_LABELS[id], TYPE_LABELS[id], `la etiqueta de ${id} difiere`);
    }
    for (const t2 of [...Object.keys(TYPE_LABELS), 'inventado', '']) {
        assert.equal(espejo.needsCampaign(t2), needsCampaign(t2), `needsCampaign difiere en ${t2}`);
    }
    assert.equal(espejo.WAYS_TYPE_ID, WAYS_TYPE_ID);
    assert.equal(espejo.WAYS_MAX_CONTEXT, MAX_ADDITIONAL_CONTEXT,
        'el tope del contexto adicional difiere entre la pantalla y el servidor');
});

test('los dos «Maneras de Contribuir» de la pantalla no se llaman igual', async (t) => {
    let build;
    try { ({ build } = await import('esbuild')); }
    catch { return t.skip('esbuild no está instalado'); }
    const out = await build({
        entryPoints: [new URL('../src/lib/publicationContext.ts', import.meta.url).pathname],
        bundle: true, write: false, format: 'esm', platform: 'neutral',
    });
    const espejo = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
    assert.notEqual(espejo.CAMPAIGN_TYPE_LABEL, espejo.TYPE_LABELS[WAYS_TYPE_ID],
        'la infografía y el tipo de publicación se llamarían igual en la misma pantalla');
    assert.equal(espejo.CAMPAIGN_TYPE_ID, 'contribution',
        'el id de la infografía está guardado en publicaciones ya generadas: no se renombra');
});

// ─── 9. La pantalla ────────────────────────────────────────────────────

test('el panel se monta DENTRO del generador, no como pantalla aparte', () => {
    const src = leer('src/components/admin/content-studio/PostGenerator.tsx');
    assert.ok(src.includes('WaysToContributePanel'));
    assert.ok(!/WaysToContributePanel[\s\S]{0,80}return/.test(src.split('const esCampana')[0] || ''),
        'no puede cortar el render como hace la Infografía de Campaña');
});

test('la campaña y el contexto SÍ llegan a la petición', () => {
    const src = leer('src/components/admin/content-studio/PostGenerator.tsx');
    assert.ok(/\.\.\.\(esManeras \? waysConfig : \{\}\)/.test(src),
        'una dependencia o un spread olvidado no lo ve el typecheck: el ajuste simplemente no llega nunca (lección de conQr, v4.836)');
});

test('el panel no tiene su propio botón de generar', () => {
    const src = leer('src/components/admin/content-studio/WaysToContributePanel.tsx');
    assert.ok(!/GENERAR CON IA/.test(src),
        'un segundo camino de generación se separaría del de siempre');
});

test('el aviso va junto al botón que lo dispara', () => {
    const src = leer('src/components/admin/content-studio/PostGenerator.tsx');
    const i = src.indexOf('GENERAR CON IA');
    const antes = src.slice(Math.max(0, i - 3000), i);
    assert.ok(/Se generará con el contexto de/.test(antes),
        'quien va a gastar el gesto es quien tiene que leerlo (regla del modo Fotográfico, v4.798)');
});

test('la generación se bloquea sin campaña, y se dice por qué', () => {
    const src = leer('src/components/admin/content-studio/PostGenerator.tsx');
    assert.ok(/faltaCampana/.test(src));
    assert.ok(/Elegí una campaña arriba/.test(src),
        'un botón apagado sin explicación se lee como que el módulo está roto');
});
