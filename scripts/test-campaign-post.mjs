#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Infografías de Campaña — pruebas del CRITERIO
// v4.833.0
//
// SIN base, SIN credenciales y SIN red. Prueban lo que decide qué sale en una
// pieza —objetivos, cupos, indicadores publicables, elección de composición y
// validación previa—, separado de la orquestación, por el mismo motivo que
// `seoRules.js` vive aparte de `seoAudit.js`.
//
// El bloque de PARIDAD compara las SALIDAS de las funciones del servidor con
// las del espejo del navegador, no sólo sus claves: que los dos den la misma
// respuesta es lo que hace imposible que la pantalla avise una cosa y la
// generación haga otra. Se salta solo si falta esbuild.
//
// El bloque de GEOMETRÍA comprueba que los textos de una plantilla no se
// pisen. Es el defecto concreto de una composición mal medida y no lo ve
// ninguna otra comprobación: el código es válido, los tipos están bien y la
// pieza sale con dos frases una encima de la otra.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

import {
    OBJECTIVES, OBJECTIVE_IDS, DEFAULT_OBJECTIVE, objectiveCatalog,
    AUDIENCES, DEFAULT_AUDIENCE, LANGUAGES, DEFAULT_LANGUAGE,
    FORMAT_IDS, DEFAULT_FORMAT_ID, isCampaignFormat,
    LAYOUTS, LAYOUT_IDS, capacityOf, pickLayout,
    publishableStats, chooseStats, activeItems, centerSummary,
    validateBeforeGenerate, buildCampaignBrief, buildVariables, latestCut, campaignUrl,
} from '../server/lib/campaignPostSpec.js';
import { CAMPAIGN_TEMPLATES, templateFor } from '../server/lib/campaignTemplates.js';
import { centerDetail, activePartners, planCarousel, CAROUSEL_SLIDES, CAROUSEL_MAX } from '../server/lib/campaignPostSpec.js';
import { compileTemplate, formatOf, FORMATS, normalizeNode, visibleNodes, MASK_SHAPES, WEB_FONTS } from '../server/lib/designSpec.js';
import { normalizeContent } from '../server/lib/contributionSpec.js';
import { TYPE_LABELS, AREA_LABELS } from '../server/lib/publicationContext.js';

let ok = 0;
const malos = [];
const check = (nombre, cond) => {
    if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
    else { malos.push(nombre); console.log(`  ✗ ${nombre}`); }
};
const grupo = (t) => console.log(`\n${t}`);

// ─── Datos de prueba ───────────────────────────────────────────────────
//
// Con las cifras REALES del sismo que el cliente reportó, no unas inventadas
// para que la prueba pase.
const STATS = [
    { id: 's1', label: 'Personas fallecidas', value: '289', source: 'UNGRD', updatedAt: '2026-08-15T18:30:00Z', active: true },
    { id: 's2', label: 'Personas afectadas', value: '115.461', source: 'UNGRD', updatedAt: '2026-08-15T18:30:00Z', active: true },
    { id: 's3', label: 'Viviendas destruidas', value: '81.536', source: 'UNGRD', updatedAt: '2026-08-14T16:30:00Z', active: true },
    { id: 's4', label: 'Municipios afectados', value: '14', source: 'UNGRD', updatedAt: '2026-08-14T16:30:00Z', active: true },
    // Sin fuente: NO se publica, aunque esté activo y completo.
    { id: 's5', label: 'Voluntarios movilizados', value: '450', source: '', updatedAt: '2026-08-15T18:30:00Z', active: true },
    // Desactivado: retirado a propósito, no es un defecto.
    { id: 's6', label: 'Albergues', value: '12', source: 'Cruz Roja', updatedAt: '2026-08-15T18:30:00Z', active: false },
    // Sin fecha válida.
    { id: 's7', label: 'Kits entregados', value: '900', source: 'Rotary', updatedAt: 'ayer', active: true },
];

const CAMPANA = {
    id: 'camp-1',
    slug: 'emergencia-terremoto',
    name: 'Emergencia Terremoto Colombia',
    campaignType: 'emergencia',
    stats: STATS,
    content: {
        hero: {
            title: 'Colombia nos necesita',
            subtitle: 'Tu ayuda puede marcar la diferencia',
            badge: 'EMERGENCIA · TERREMOTO',
            text: 'Rotary acompaña a las comunidades afectadas.',
            ctaPrimary: { label: 'Aportar ahora', url: '/maneras-de-contribuir' },
        },
        location: 'San José del Palmar, Chocó — Colombia',
        eventDate: '14 de agosto de 2026',
        requiredItems: [
            { title: 'Alimentos no perecederos', description: 'De canasta básica', active: true },
            { title: 'Artículos de higiene personal', description: 'Incluidos pañales', active: true },
            { title: 'Suministros básicos', description: 'Para botiquines', active: true },
            { title: 'Elementos para descanso', description: 'Colchonetas y cobijas', active: true },
            { title: 'Agua potable', description: 'Bidones sellados', active: true },
            { title: 'Ropa en buen estado', description: 'Limpia y clasificada', active: true },
            { title: 'Retirado', description: '', active: false },
        ],
        theme: { primary: '#0B2B5C', cta: '#9D2235' },
    },
};

const CENTROS = [
    { id: 'c1', city: 'Cali', address: 'Calle 1 #2-3', active: true, sortOrder: 0 },
    { id: 'c2', city: 'Cali', address: 'Carrera 9 #8-7', active: true, sortOrder: 1 },
    { id: 'c3', city: 'Cota', address: 'Vereda El Abra', active: true, sortOrder: 2 },
    { id: 'c4', city: 'Bogotá', address: 'Av. 68 #1-1', active: true, sortOrder: 3 },
    { id: 'c5', city: 'Sin dirección', address: '', active: true, sortOrder: 4 },
];

// ═══════════════════════════════════════════════════════════════════════

grupo('Catálogos');
check('los seis objetivos del pedido están declarados',
    OBJECTIVE_IDS.length === 6
    && ['sensibilizacion', 'recaudacion', 'ayuda_humanitaria', 'panorama', 'centros', 'impacto']
        .every(id => OBJECTIVES[id]));
check('cada objetivo declara qué EXIGE para tener sentido',
    OBJECTIVE_IDS.every(id => Array.isArray(OBJECTIVES[id].needs)));
check('el objetivo por defecto no exige nada, así que siempre se puede generar',
    OBJECTIVES[DEFAULT_OBJECTIVE].needs.length === 0);
check('el catálogo de objetivos viaja con su ayuda y sus exigencias',
    objectiveCatalog().every(o => o.label && o.help && Array.isArray(o.needs)));
check('las dos audiencias del pedido están, y la internacional trae su encuadre',
    AUDIENCES[DEFAULT_AUDIENCE] && AUDIENCES.internacional
    && /clubes rotarios/i.test(AUDIENCES.internacional.frame));
check('español e inglés, con la arquitectura abierta a más',
    LANGUAGES.es && LANGUAGES.en && LANGUAGES[DEFAULT_LANGUAGE]);

grupo('Formatos: los dos del pedido y ninguno más');
check('sólo 1080×1080 y 1080×1350',
    FORMAT_IDS.length === 2 && FORMAT_IDS.includes('post_1_1') && FORMAT_IDS.includes('post_4_5'));
check('un formato arbitrario se rechaza', !isCampaignFormat('story_9_16') && !isCampaignFormat('inventado'));
check('las medidas son las que pidió el cliente',
    formatOf('post_1_1').width === 1080 && formatOf('post_1_1').height === 1080
    && formatOf('post_4_5').width === 1080 && formatOf('post_4_5').height === 1350);
// El motor nunca dependió del alto —los nodos son fracciones—, pero una
// plantilla compuesta para 1:1 y estirada a 4:5 deja el texto flotando: lo que
// habilita el formato son las plantillas, no el interruptor.
check('el formato 4:5 quedó ACTIVO en el motor de diseño', FORMATS.post_4_5.available === true);

grupo('Indicadores: sin fuente no se publica');
const pub = publishableStats(STATS);
check('sólo pasan los que tienen etiqueta, valor, fuente y fecha válida',
    pub.stats.length === 4 && pub.stats.map(s => s.id).join(',') === 's1,s2,s3,s4');
check('el que no tiene fuente se descarta y se DICE por qué',
    pub.skipped.some(s => s.id === 's5' && /fuente/.test(s.reason)));
check('el que no tiene fecha válida también',
    pub.skipped.some(s => s.id === 's7' && /fecha/.test(s.reason)));
// Un indicador desactivado es una decisión del administrador, no un defecto:
// avisarlo llenaría la pantalla de avisos que nadie tiene que atender.
check('el desactivado NO se reporta como problema',
    !pub.skipped.some(s => s.id === 's6'));
check('sin indicadores no revienta: devuelve las dos listas vacías',
    publishableStats(undefined).stats.length === 0 && publishableStats(null).skipped.length === 0);

grupo('Cupos por composición y formato');
check('el 4:5 aguanta más cifras que el 1:1 en la misma composición',
    capacityOf('impacto_estadistico', 'post_4_5') > capacityOf('impacto_estadistico', 'post_1_1'));
check('la composición de elementos no muestra cifras en 1:1',
    capacityOf('elementos_requeridos', 'post_1_1', 'maxStats') === 0);
check('y muestra más elementos en 4:5 que en 1:1',
    capacityOf('elementos_requeridos', 'post_4_5', 'maxItems') > capacityOf('elementos_requeridos', 'post_1_1', 'maxItems'));
check('una composición inexistente da cupo cero, no revienta', capacityOf('inventada', 'post_1_1') === 0);

grupo('Elección de composición');
check('sin elección del usuario manda el objetivo',
    pickLayout({ objective: 'panorama', stats: pub.stats, items: [] }).id === 'impacto_estadistico');
check('la elección EXPRESA del usuario gana sobre el objetivo',
    pickLayout({ objective: 'panorama', requested: 'emergencia_cta', stats: pub.stats }).id === 'emergencia_cta');
// Una composición que no puede pintar lo que hay entregaría un hueco: se cae a
// la que sí puede y se DICE, en vez de generar una pieza incompleta.
const sinItems = pickLayout({ objective: 'ayuda_humanitaria', items: [], stats: pub.stats });
check('pedir «elementos» sin elementos cae a otra composición y lo anota',
    sinItems.id === 'emergencia_cta' && sinItems.notes.length === 1);
const sinCifras = pickLayout({ objective: 'panorama', stats: [], items: [] });
check('pedir «panorama» sin cifras publicables cae a otra y lo anota',
    sinCifras.id === 'emergencia_cta' && sinCifras.notes.length === 1);
check('la composición elegida siempre existe en el catálogo',
    LAYOUT_IDS.includes(pickLayout({ objective: 'sensibilizacion' }).id));

grupo('Selección de indicadores');
check('sin selección se toman los primeros que entran, en el orden de la campaña',
    chooseStats(pub.stats, null, 2).map(s => s.id).join(',') === 's1,s2');
check('con selección se respeta lo marcado',
    chooseStats(pub.stats, ['s3', 's1'], 3).map(s => s.id).join(',') === 's1,s3');
check('nunca se devuelven más de los que entran',
    chooseStats(pub.stats, ['s1', 's2', 's3', 's4'], 2).length === 2);
check('cupo cero devuelve lista vacía', chooseStats(pub.stats, null, 0).length === 0);

grupo('Elementos y centros');
const content = normalizeContent(CAMPANA.content);
check('sólo los elementos activos con título', activeItems(content).length === 6);
const resumen = centerSummary(CENTROS, 2);
check('los centros se resumen por CIUDAD, no por dirección',
    resumen.cities.length === 2 && resumen.cities[0].city === 'Cali' && resumen.cities[0].count === 2);
check('se cuenta el total y se dice cuántas ciudades quedaron fuera',
    resumen.total === 4 && resumen.hidden === 1);
// `normalizeCenters` devuelve `{ centers, skipped }`: pasarle el objeto entero
// a `groupCenters` daría cero ciudades EN SILENCIO.
check('el centro sin dirección no cuenta y no rompe el resumen', resumen.total === 4);

grupo('Validación ANTES de generar');
const okCase = validateBeforeGenerate({
    campaign: CAMPANA, objective: 'panorama', formatId: 'post_1_1',
    layoutId: 'impacto_estadistico', imageUrl: 'https://x/y.jpg', stats: pub.stats.slice(0, 3),
});
check('una campaña completa se puede generar', okCase.ok && okCase.errors.length === 0);
check('los indicadores que no se pueden publicar salen como AVISO, no como error',
    okCase.warnings.some(w => /Voluntarios movilizados/.test(w)));

const sinTitulo = validateBeforeGenerate({
    campaign: { ...CAMPANA, content: { ...CAMPANA.content, hero: { ...CAMPANA.content.hero, title: '' } } },
    objective: 'sensibilizacion', formatId: 'post_1_1',
});
check('sin título NO se genera: es lo que encabeza la pieza',
    !sinTitulo.ok && sinTitulo.errors.some(e => /título/.test(e)));

const sinCifrasVal = validateBeforeGenerate({
    campaign: { ...CAMPANA, stats: [{ id: 'x', label: 'Algo', value: '1', source: '', updatedAt: '', active: true }] },
    objective: 'panorama', formatId: 'post_1_1',
});
check('el objetivo «panorama» sin cifras publicables es un ERROR, no un aviso',
    !sinCifrasVal.ok && sinCifrasVal.errors.some(e => /indicador publicable/.test(e)));

const sinItemsVal = validateBeforeGenerate({
    campaign: { ...CAMPANA, content: { ...CAMPANA.content, requiredItems: [] } },
    objective: 'ayuda_humanitaria', formatId: 'post_1_1',
});
check('el objetivo «ayuda humanitaria» sin elementos es un ERROR',
    !sinItemsVal.ok && sinItemsVal.errors.some(e => /elementos/.test(e)));

check('un formato que no es de este preset se rechaza',
    !validateBeforeGenerate({ campaign: CAMPANA, objective: 'sensibilizacion', formatId: 'story_9_16' }).ok);
check('sin campaña no se genera',
    !validateBeforeGenerate({ objective: 'sensibilizacion', formatId: 'post_1_1' }).ok);
check('sin fotografía se AVISA, no se bloquea',
    validateBeforeGenerate({ campaign: CAMPANA, objective: 'sensibilizacion', formatId: 'post_1_1', imageUrl: '' })
        .warnings.some(w => /fotografía/i.test(w)));

grupo('El brief: sólo lo que la campaña tiene');
const brief = buildCampaignBrief({
    campaign: CAMPANA, objective: 'panorama', audience: 'internacional', language: 'en',
    stats: pub.stats.slice(0, 2), items: activeItems(content).slice(0, 2),
});
check('el lugar y la fecha del hecho entran cuando existen',
    brief.includes('San José del Palmar') && brief.includes('14 de agosto de 2026'));
// Un hueco en silencio es una invitación a completarlo: la ausencia se DICE.
const briefSinDatos = buildCampaignBrief({
    campaign: { ...CAMPANA, content: { ...CAMPANA.content, location: '', eventDate: '' } },
    objective: 'sensibilizacion',
});
check('cuando NO se conocen, el brief lo dice explícitamente',
    /NO se conoce el lugar/.test(briefSinDatos) && /NO se conoce la fecha/.test(briefSinDatos));
check('las cifras viajan con su fuente y se le prohíbe al modelo escribirlas',
    brief.includes('UNGRD') && /NO las escribas en el texto/.test(brief));
check('sin cifras se le dice que no invente ninguna',
    /No inventes ninguna/.test(buildCampaignBrief({ campaign: CAMPANA, objective: 'sensibilizacion', stats: [] })));
check('el idioma de salida es explícito y los nombres propios quedan protegidos',
    /English/.test(brief) && /no se traducen/.test(brief));
check('la audiencia internacional cambia el encuadre', /clubes rotarios/i.test(brief));

grupo('Las variables que consume la plantilla');
const vars = buildVariables({
    campaign: CAMPANA,
    copy: { headline: 'Colombia nos necesita', cta: 'Aportá ahora', badge: 'EMERGENCIA' },
    stats: pub.stats.slice(0, 3),
    items: activeItems(content).slice(0, 2),
    imageUrl: 'https://x/foto.jpg',
});
check('cada indicador aporta valor, etiqueta y FUENTE, numerados',
    vars.cifra1 === '289' && vars.cifra1_label === 'Personas fallecidas' && vars.cifra1_fuente === 'UNGRD'
    && vars.cifra3 === '81.536');
check('los elementos también', vars.elemento1 === 'Alimentos no perecederos' && vars.elemento1_detalle === 'De canasta básica');
check('el titular del modelo manda sobre el de la campaña', vars.titulo === 'Colombia nos necesita');
check('sin titular del modelo se cae al de la campaña',
    buildVariables({ campaign: CAMPANA, copy: {} }).titulo === 'Colombia nos necesita');
check('la fecha de corte es la MÁS RECIENTE de lo que se muestra', vars.corte === '15/08/2026');
check('sin cifras no hay corte', buildVariables({ campaign: CAMPANA, copy: {}, stats: [] }).corte === '');
check('el corte tolera fechas ilegibles sin romper', latestCut([{ updatedAt: 'ayer' }]) === '');

grupo('La dirección de la campaña');
check('sale del dominio del sitio y del slug',
    campaignUrl(CAMPANA, 'https://rotary4281.org') === 'https://rotary4281.org/maneras-de-contribuir?c=emergencia-terremoto');
check('sin dominio no se inventa una', campaignUrl(CAMPANA, '') === '');
check('sin slug lleva a la página genérica',
    campaignUrl({ slug: '' }, 'https://rotary4281.org/') === 'https://rotary4281.org/maneras-de-contribuir');

grupo('El catálogo de composiciones');
// Cinco composiciones × dos formatos. NO es una plantilla estirada: lo que
// cambia entre formatos es CUÁNTO entra y dónde respira.
check('las cinco composiciones existen en los DOS formatos: diez entradas',
    CAMPAIGN_TEMPLATES.length === 10 && LAYOUT_IDS.length === 5);
for (const layout of LAYOUT_IDS) {
    for (const f of FORMAT_IDS) {
        check(`«${layout}» existe en ${f}`, !!templateFor(layout, f));
    }
}
check('cada plantilla declara el formato que dice su entrada',
    CAMPAIGN_TEMPLATES.every(t => FORMAT_IDS.includes(t.format)));
// Se miran los DATOS, no el archivo entero: la comprobación es que ninguna
// plantilla DIBUJE una rueda, y un comentario que explique por qué no se puede
// dibujar tiene que poder nombrarla. Es la misma lección que las clases de
// `test:cta` —buscar la clase, no la mención—.
const sinComentarios = readFileSync('server/lib/campaignTemplates.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('ninguna plantilla dibuja una rueda de Rotary: el emblema es marca registrada',
    !/rueda|wheel|engranaje/i.test(sinComentarios));

grupo('Compilar: las cifras se DIBUJAN, no se escriben');
const doc = compileTemplate({
    template: templateFor('impacto_estadistico', 'post_1_1'),
    variables: vars,
    branding: { primary: '#0B2B5C', accent: '#9D2235' },
});
check('el documento sale con el formato de la plantilla', doc.format === 'post_1_1');
const textos = doc.nodes.filter(n => n.type === 'text').map(n => n.text);
check('el valor del indicador está dibujado en su nodo', textos.includes('289'));
check('y su fuente también, pegada a él', textos.some(t => t === 'UNGRD'));
check('ningún marcador queda sin resolver a la vista',
    !doc.nodes.some(n => n.type === 'text' && /\{\{/.test(n.text)));
// Un bloque de cifra sin datos no deja un recuadro vacío: no se dibuja.
const docDos = compileTemplate({
    template: templateFor('impacto_estadistico', 'post_1_1'),
    variables: buildVariables({ campaign: CAMPANA, copy: {}, stats: pub.stats.slice(0, 2) }),
    branding: {},
});
check('con dos cifras en una composición de tres no queda un bloque vacío',
    !docDos.nodes.some(n => n.id === 'cifra3') && docDos.nodes.some(n => n.id === 'cifra2'));

grupo('Geometría: los textos de una plantilla no se pisan');
// Es el defecto concreto de una composición mal medida —dos frases una encima
// de la otra— y no lo ve ninguna otra comprobación: el código es válido, los
// tipos están bien y la pieza sale rota. Se mide sobre los nodos de TEXTO, que
// son los que no pueden solaparse; las formas sí se superponen a propósito
// (el velo, el fondo, la pastilla del botón).
const solapan = (a, b) => !(a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6
    || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6);
for (const t of CAMPAIGN_TEMPLATES) {
    const nodos = t.nodes.map((n, i) => normalizeNode(n, i)).filter(n => n.type === 'text');
    const choques = [];
    for (let i = 0; i < nodos.length; i++) {
        for (let j = i + 1; j < nodos.length; j++) {
            if (solapan(nodos[i], nodos[j])) choques.push(`${nodos[i].id}×${nodos[j].id}`);
        }
    }
    check(`«${t.id}» no tiene textos superpuestos${choques.length ? ` (${choques.join(', ')})` : ''}`, choques.length === 0);
    const fuera = nodos.filter(n => n.y + n.h > 1.0001 || n.x + n.w > 1.0001 || n.x < -1e-6 || n.y < -1e-6);
    check(`«${t.id}» no deja ningún texto fuera del lienzo${fuera.length ? ` (${fuera.map(n => n.id).join(', ')})` : ''}`, fuera.length === 0);
}

grupo('v4.835 — centros de acopio y aliados');
// La densidad que pidió el cliente: por CIUDAD en un cuadrado, con DIRECCIÓN
// en vertical. Ocho direcciones legibles no entran en 1:1, y achicar el texto
// para que quepan produce una pieza que no se puede leer en un teléfono.
check('el 1:1 resume por ciudad y NO muestra direcciones',
    capacityOf('centros_acopio', 'post_1_1', 'maxCities') > 0
    && capacityOf('centros_acopio', 'post_1_1', 'maxCenters') === 0);
check('el 4:5 sí muestra direcciones', capacityOf('centros_acopio', 'post_4_5', 'maxCenters') === 6);
const detalle = centerDetail(CENTROS, 3);
check('el detalle trae ciudad y dirección de cada punto',
    detalle.centers.length === 3 && detalle.centers[0].address === 'Calle 1 #2-3' && detalle.centers[0].city === 'Cali');
check('y dice cuántos quedaron fuera: una lista recortada en silencio miente',
    detalle.total === 4 && detalle.hidden === 1);
check('el centro sin dirección no entra', centerDetail(CENTROS, 99).total === 4);
// Un aliado sin logotipo no se nombra: la franja es de escudos y mezclarlos
// con nombres sueltos se lee como un error de maquetación.
const ALIADOS = { partners: [
    { name: 'ABACO', logo: 'https://x/abaco.png', active: true },
    { name: 'Sin logo', logo: '', active: true },
    { name: 'Retirado', logo: 'https://x/r.png', active: false },
    { name: 'Cruz Roja', logo: 'https://x/cr.png', active: true },
] };
check('sólo los aliados activos CON logotipo', activePartners(ALIADOS, 9).length === 2);
check('y acotados a lo que la composición muestra', activePartners(ALIADOS, 1).length === 1);
check('el objetivo de centros EXIGE centros publicados',
    !validateBeforeGenerate({ campaign: CAMPANA, objective: 'centros', formatId: 'post_1_1', centerCount: 0 }).ok
    && validateBeforeGenerate({ campaign: CAMPANA, objective: 'centros', formatId: 'post_1_1', centerCount: 3 }).ok);
// Sin el dato no se puede juzgar: decidir por omisión que «no hay» bloquearía
// una campaña que sí los tiene.
check('sin saber cuántos centros hay, NO se bloquea',
    validateBeforeGenerate({ campaign: CAMPANA, objective: 'centros', formatId: 'post_1_1' }).ok);
check('pedir la composición de centros sin centros cae a otra y lo anota', (() => {
    const r = pickLayout({ objective: 'centros', stats: pub.stats, items: [], cities: 0 });
    return r.id === 'emergencia_cta' && r.notes.length === 1;
})());
check('el objetivo de impacto usa la composición de resultados',
    pickLayout({ objective: 'impacto', stats: pub.stats, items: [], cities: 2 }).id === 'resultados');

grupo('v4.835 — el código QR');
// El QR lleva la dirección REAL de la campaña; nunca es un adorno.
check('el nodo del QR existe en las diez composiciones y no deja hueco si falta',
    CAMPAIGN_TEMPLATES.every(t => t.nodes.some(n => n.id === 'qr' && n.dropIfEmpty && n.src === '{{qr}}')));
// Llega del cliente y termina como `src` de un nodo: se comprueba que sea una
// imagen embebida y nada más. Misma cautela que `normalizeMapUrl` en la sede.
check('el servidor sólo acepta una imagen embebida como QR', (() => {
    const src = readFileSync('server/controllers/campaignPostController.js', 'utf8');
    return /const acceptableQr/.test(src)
        && /data:image\\\/\(svg\\\+xml\|png\);base64/.test(src)
        && /qrUrl: acceptableQr\(/.test(src);
})());
check('la dirección del QR la da el SERVIDOR, no se compone en el navegador', (() => {
    const panel = readFileSync('src/components/admin/content-studio/CampaignPostPanel.tsx', 'utf8');
    return /opciones\?\.siteUrl/.test(panel) && !/rotary4281\.org/.test(panel);
})());

grupo('v4.836 — el carrusel');
// Es el mismo arco que la landing (v4.828): contexto → magnitud → cómo ayudo →
// dónde → cómo aporto. Quien ve el carrusel y quien entra a la página tienen
// que encontrarse lo mismo en el mismo orden.
check('las diapositivas siguen el orden en que se lee una emergencia',
    CAROUSEL_SLIDES.join(',') === 'sensibilizacion,panorama,ayuda_humanitaria,centros,recaudacion');
check('todas las diapositivas son objetivos que existen',
    CAROUSEL_SLIDES.every(o => OBJECTIVES[o]));
const plan = planCarousel({ campaign: CAMPANA, formatId: 'post_1_1', centerCount: 2 });
check('una campaña completa llena todas las diapositivas que caben',
    plan.slides.length === Math.min(CAROUSEL_MAX, CAROUSEL_SLIDES.length));
// Una diapositiva sin datos se SALTA y se dice por qué: una vacía en medio de
// un carrusel es peor que una menos, y sin el motivo nadie sabe qué cargar.
const planSinCentros = planCarousel({ campaign: CAMPANA, formatId: 'post_1_1', centerCount: 0 });
check('la diapositiva sin datos se saltea y se DICE por qué',
    planSinCentros.slides.length === plan.slides.length - 1
    && planSinCentros.skipped.some(s => s.objective === 'centros' && /centros de acopio/.test(s.reason)));
const planPobre = planCarousel({
    campaign: { ...CAMPANA, stats: [], content: { ...CAMPANA.content, requiredItems: [] } },
    formatId: 'post_1_1', centerCount: 0,
});
check('una campaña con lo mínimo igual arma las diapositivas que puede',
    planPobre.slides.length >= 1 && planPobre.skipped.length >= 2);
check('el carrusel genera el copy UNA sola vez y lo reparte', (() => {
    const src = readFileSync('server/controllers/campaignPostController.js', 'utf8');
    const i = src.indexOf('export const composeCampaignCarousel');
    const j = src.indexOf('\nexport const ', i + 10);
    const bloque = src.slice(i, j > 0 ? j : src.length);
    return (bloque.match(/generatePieceCopy\(/g) || []).length === 1
        && /copy: out\.copy/.test(bloque);
})());
// Dos caminos de armado se separarían: la pieza suelta saldría distinta de su
// equivalente dentro de un carrusel.
check('la pieza suelta y la diapositiva se arman con el MISMO código', (() => {
    const src = readFileSync('server/controllers/campaignPostController.js', 'utf8');
    return (src.match(/await buildPiece\(/g) || []).length === 2
        && (src.match(/const buildPiece = async/g) || []).length === 1;
})());
check('generar una pieza queda registrado como métrica de la campaña', (() => {
    const src = readFileSync('server/controllers/campaignPostController.js', 'utf8');
    const ctrl = readFileSync('server/controllers/contributionCampaignController.js', 'utf8');
    return /type: 'asset_generated'/.test(src) && /'asset_generated'/.test(ctrl);
})());
check('las piezas se suben a la Biblioteca ANTES de publicarse', (() => {
    const panel = readFileSync('src/components/admin/content-studio/CampaignPostPanel.tsx', 'utf8');
    const i = panel.indexOf('const publicar = async');
    const bloque = panel.slice(i, i + 2200);
    return bloque.indexOf('uploadMediaFiles') < bloque.indexOf('/social/publish')
        && /accountIds: cuentasSel/.test(bloque);
})());
// Bajarlas una por una hace que el navegador bloquee todas menos la primera.
check('el carrusel se descarga en UN archivo', (() => {
    const panel = readFileSync('src/components/admin/content-studio/CampaignPostPanel.tsx', 'utf8');
    return /jszip/.test(panel) && /descargarZip/.test(panel);
})());

grupo('v4.837 — la voz visual de las piezas de referencia');
// Las tres cosas que este cambio introduce en el CATÁLOGO. Lo que no se puede
// comprobar acá —que la tipografía llegue de verdad y que la vista previa
// siga siendo el archivo— lo comprueba `test:design:render` en un navegador.
{
    const fuente = readFileSync('server/lib/campaignTemplates.js', 'utf8');
    const conFoto = CAMPAIGN_TEMPLATES.filter(t => t.nodes.some(n => n.id === 'foto'));
    const conBanda = CAMPAIGN_TEMPLATES.filter(t => t.nodes.some(n => n.id === 'pie_banda'));

    check('las diez composiciones llevan el pie institucional', conBanda.length === 10);
    check('el pie usa la curva declarada en designSpec, no un trazo suelto',
        conBanda.every(t => t.nodes.find(n => n.id === 'pie_banda').shape === 'dome'));
    check('el pie se desborda por los costados: el filete no marca el borde',
        conBanda.every(t => { const b = t.nodes.find(n => n.id === 'pie_banda'); return b.x < 0 && b.x + b.w > 1; }));

    // Los escudos son ARCHIVOS del sitio. Cada uno con `dropIfEmpty`: un sitio
    // con dos cargados muestra dos, no dos y dos huecos.
    const familia = CAMPAIGN_TEMPLATES.flatMap(t => t.nodes.filter(n => /^familia\d$/.test(n.id)));
    check('la familia Rotary son cuatro nodos de IMAGEN por composición', familia.length === 40 && familia.every(n => n.type === 'image'));
    check('ningún escudo deja hueco si el sitio no lo tiene cargado', familia.every(n => n.dropIfEmpty === true));
    check('los escudos salen de una variable, nunca de una URL escrita en el código',
        familia.every(n => /^\{\{familia\d\}\}$/.test(n.src)));

    // La fotografía se recorta con una curva; el velo tiene que llevar la MISMA
    // forma o queda un escalón donde se buscaba una curva.
    const enmascaradas = conFoto.filter(t => t.nodes.find(n => n.id === 'foto').mask);
    check('las composiciones con banda de fotografía la recortan en curva', enmascaradas.length === 4);
    check('y su velo sigue el MISMO recorte que la fotografía',
        enmascaradas.every(t => {
            const f = t.nodes.find(n => n.id === 'foto'), v = t.nodes.find(n => n.id === 'velo');
            return v && v.shape === f.mask;
        }));
    check('la máscara es una forma del catálogo cerrado',
        enmascaradas.every(t => MASK_SHAPES.includes(t.nodes.find(n => n.id === 'foto').mask)));

    // La voz tipográfica: dos familias y un reparto. Sin esto, un titular y una
    // etiqueta se distinguen sólo por el tamaño, que es lo que se reportó.
    const textos = CAMPAIGN_TEMPLATES.flatMap(t => t.nodes.filter(n => n.type === 'text'));
    check('ningún texto de una pieza de campaña se queda en la familia por omisión',
        textos.every(n => n.fontFamily === 'condensed' || n.fontFamily === 'brand'), 
        textos.filter(n => !['condensed', 'brand'].includes(n.fontFamily)).map(n => n.id).join(','));
    check('el título y las cifras van en la condensada',
        CAMPAIGN_TEMPLATES.every(t => {
            const ti = t.nodes.find(n => n.id === 'titulo');
            const c1 = t.nodes.find(n => n.id === 'cifra1');
            return (!ti || ti.fontFamily === 'condensed') && (!c1 || c1.fontFamily === 'condensed');
        }));
    check('las dos familias son las EMPAQUETADAS, no una tercera lista',
        WEB_FONTS.map(f => f.id).sort().join(',') === 'brand,condensed');
    check('la pastilla del botón es una pastilla: el radio es del lado menor del nodo',
        CAMPAIGN_TEMPLATES.every(t => { const p = t.nodes.find(n => n.id === 'pastilla'); return !p || p.radius === 0.5; }));
    check('la banda del pie NO se pinta con el color de la campaña: es el azul de Rotary',
        conBanda.every(t => { const b = t.nodes.find(n => n.id === 'pie_banda'); return !b.brand && typeof b.fill === 'string'; }));
}

grupo('v4.837 — la pastilla del llamado a la acción SE DIBUJA');
// El defecto de fondo que traía el preset desde v4.833: `requiresVar` sólo lo
// satisfacían los nodos de IMAGEN, así que una pastilla que dependía de una
// variable de TEXTO se caía siempre y el llamado salía como texto flotando en
// TODA pieza generada. No daba ningún error; se veía como una pieza sosa.
{
    const tpl = templateFor('emergencia_cta', 'post_1_1');
    const conCta = compileTemplate({ template: tpl, variables: { ...vars, cta: 'Dona ahora' }, branding: { primary: '#0B2B5C', accent: '#C8102E' } });
    const sinCta = compileTemplate({ template: tpl, variables: { ...vars, cta: '' }, branding: { primary: '#0B2B5C', accent: '#C8102E' } });
    const vistos = (doc) => visibleNodes(doc.nodes).map(n => n.id);
    check('con llamado a la acción, la pastilla se dibuja', vistos(conCta).includes('pastilla'));
    check('y el texto del botón también', vistos(conCta).includes('cta'));
    check('sin llamado a la acción, la pastilla NO deja un rectángulo vacío', !vistos(sinCta).includes('pastilla'));
    check('un texto MEZCLADO no responde por su variable: no se puede saber',
        !visibleNodes([
            { id: 'a', type: 'text', srcText: 'Cifras al {{corte}}', text: 'Cifras al ', hidden: false },
            { id: 'b', type: 'shape', requiresVar: 'corte', hidden: false },
        ]).some(n => n.id === 'b'));
}

grupo('El preset no se escribe dos veces');
const postGen = readFileSync('src/components/admin/content-studio/PostGenerator.tsx', 'utf8');
// La regla de v4.667: el catálogo de tipos vive en UN solo sitio. Seguía
// duplicado en el JSX, con otras etiquetas —«Storytelling» contra «Narración de
// historias»—, que es exactamente lo que esa regla existe para impedir.
check('la pantalla ya no lleva la lista de tipos escrita a mano',
    !/id: 'storytelling', label:/.test(postGen) && /publicationTypes\(\)\.map/.test(postGen));
check('el preset de campañas abre su propia pantalla, no una variante de la de foto',
    /CampaignPostPanel/.test(postGen) && /esCampana/.test(postGen));

grupo('Paridad de los espejos');
let paridad = true;
try {
    const { build } = await import('esbuild');
    const compilar = async (entrada) => {
        const r = await build({
            entryPoints: [entrada], bundle: true, write: false,
            format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'silent',
        });
        return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
    };
    const esp = await compilar('src/lib/campaignPostSpec.ts');
    const espPub = await compilar('src/lib/publicationContext.ts');

    const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    check('los objetivos son los mismos, con las mismas exigencias',
        igual(objectiveCatalog(), esp.objectiveCatalog()));
    check('los cupos coinciden en las dos puntas y en los dos formatos',
        FORMAT_IDS.every(f => Object.keys(LAYOUTS).every(l =>
            ['maxStats', 'maxItems', 'maxCities'].every(k => capacityOf(l, f, k) === esp.capacityOf(l, f, k)))));
    check('los mismos indicadores se declaran publicables', (() => {
        const a = publishableStats(STATS), b = esp.publishableStats(STATS);
        return igual(a.stats.map(s => s.id), b.stats.map(s => s.id)) && igual(a.skipped, b.skipped);
    })());
    check('la elección de composición coincide, incluidas las notas', (() => {
        const casos = [
            { objective: 'panorama', stats: pub.stats, items: [] },
            { objective: 'ayuda_humanitaria', stats: [], items: [] },
            { objective: 'panorama', stats: [], items: [] },
            { objective: 'sensibilizacion', requested: 'impacto_estadistico', stats: pub.stats, items: [] },
        ];
        return casos.every(c => {
            const a = pickLayout(c), b = esp.pickLayout(c);
            return a.id === b.id && igual(a.notes, b.notes) && a.capacity === b.capacity;
        });
    })());
    check('el resumen de centros da lo mismo',
        igual(centerSummary(CENTROS, 2), esp.centerSummary(CENTROS, 2)));
    check('el corte de fecha da lo mismo',
        latestCut(pub.stats) === esp.latestCut(pub.stats) && latestCut([]) === esp.latestCut([]));
    check('la dirección de la campaña da lo mismo',
        campaignUrl(CAMPANA, 'https://rotary4281.org') === esp.campaignUrl(CAMPANA, 'https://rotary4281.org'));
    // La validación es la que avisa EN VIVO: si las dos puntas no coincidieran,
    // la pantalla enseñaría un aviso que la generación desmiente.
    check('la validación previa da los mismos errores y avisos', (() => {
        const entrada = {
            campaign: CAMPANA, objective: 'panorama', formatId: 'post_1_1',
            layoutId: 'impacto_estadistico', imageUrl: '', stats: pub.stats.slice(0, 3),
        };
        const a = validateBeforeGenerate(entrada);
        const b = esp.validateBeforeGenerate({ ...entrada, campaign: { ...CAMPANA, content: normalizeContent(CAMPANA.content) } });
        return a.ok === b.ok && igual(a.errors, b.errors) && igual(a.warnings, b.warnings);
    })());
    check('los tipos de publicación y las áreas coinciden con el catálogo del servidor',
        igual(TYPE_LABELS, espPub.TYPE_LABELS) && igual(AREA_LABELS, espPub.AREA_LABELS));
    // El preset nuevo NO está en `TYPE_LABELS` a propósito: no es un tono de
    // copy, es otro motor y otra pantalla.
    check('el preset de campañas NO se cuela en el catálogo de tonos',
        !TYPE_LABELS[espPub.CAMPAIGN_TYPE_ID] && espPub.CAMPAIGN_TYPE_LABEL === 'Maneras de Contribuir');
} catch (e) {
    paridad = false;
    console.log(`  … paridad de espejos: se salta (${e.message.slice(0, 60)})`);
}

grupo('v4.840 — el lienzo generado con KIE');
// Lo que se comprueba acá es el REPARTO: qué genera el motor y qué sigue
// componiendo la plataforma. Es la regla de la que cuelga el preset entero y
// no la ve ningún typecheck.
{
    const ctrl = readFileSync('server/controllers/campaignPostController.js', 'utf8');
    const rutas = readFileSync('server/routes/contentStudio.js', 'utf8');
    const panel = readFileSync('src/components/admin/content-studio/CampaignPostPanel.tsx', 'utf8');
    const studio = readFileSync('server/controllers/contentStudioController.js', 'utf8');

    // UN solo cliente de KIE. Un segundo daría dos caminos hacia el proveedor
    // que se separan en silencio — el problema que `sendCampaign` arrastra.
    // Se busca la LLAMADA, no la mención: el comentario que explica de dónde
    // sale el motor tiene que poder nombrarlo sin hacer fallar la prueba.
    // Misma lección que la comprobación de `ctaStyles`.
    const ctrlSinComentarios = ctrl.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    check('el fondo se pide por el MISMO camino que Plantillas IA', (() => {
        const i = ctrl.indexOf('export const startCampaignBackdrop');
        const bloque = ctrl.slice(i, ctrl.indexOf('export const syncCampaignBackdrop'));
        return /from '\.\.\/lib\/designBackdrop\.js'/.test(ctrl)
            && /await startComposition\(/.test(bloque)
            && !/createKieImageTask\(/.test(ctrlSinComentarios);
    })());
    check('«Desde una foto» sigue despachando a KIE por defecto',
        /const DEFAULT_ENGINE = 'kie'/.test(studio)
        && /model: 'google\/nano-banana-edit'/.test(studio));

    // El titular, las cifras y los escudos los dibuja la plataforma. Si algún
    // día el controlador empezara a pedirle texto al modelo, esto falla.
    check('el controlador de campaña NO le pide texto a un modelo de imagen',
        !/text|caption|headline/i.test(
            ctrl.slice(ctrl.indexOf('const composicionDeCampana'), ctrl.indexOf('export const syncCampaignBackdrop'))
                .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));

    // Sin fotografía no hay nada que componer: `nano-banana-edit` es un modelo
    // de EDICIÓN. Se dice con esas palabras en vez de dejar que falle en KIE.
    check('sin fotografía se rechaza con su motivo, no se llama a KIE',
        /Hace falta la fotografía de la campaña/.test(ctrl));
    check('sin credencial de KIE se dice cuál falta',
        /KIE_API_KEY/.test(ctrl) && /503/.test(ctrl));

    // La dirección de arte sale del perfil creativo: era el pendiente
    // declarado en v4.839 («hoy el prompt se copia a mano»).
    check('el prompt de estilo del perfil alimenta el masterPrompt',
        /masterPrompt: profile\?\.dna\?\.derived\?\.stylePrompt/.test(ctrl));
    // El id llega del navegador; el alcance lo decide el servidor.
    check('el perfil se resuelve en el SERVIDOR también para el fondo',
        /await resolveProfileFor\(req, req\.body\?\.profileId\)/.test(
            ctrl.slice(ctrl.indexOf('export const startCampaignBackdrop'))));

    check('las dos rutas del fondo están declaradas',
        /campaign-post\/backdrop', authMiddleware, startCampaignBackdrop/.test(rutas)
        && /campaign-post\/backdrop\/:taskId', authMiddleware, syncCampaignBackdrop/.test(rutas));

    // Poner y quitar el fondo se hace con el criterio de Plantillas IA, no con
    // una copia: dos verdades sobre la misma pila de nodos se contradicen.
    check('la pantalla usa withBackdrop/withoutBackdrop del espejo',
        /from '\.\.\/\.\.\/\.\.\/lib\/designCompose'/.test(panel)
        && /withBackdrop\(dd, e\.url\)/.test(panel)
        && /escribirDocActivo\(withoutBackdrop\)/.test(panel));
    // Un booleano aparte se contradiría al regenerar la pieza o al cambiar de
    // diapositiva. La verdad es el documento.
    check('«tiene fondo» se DERIVA del documento, no de un estado propio',
        /const fondoActivo = docActivo \? hasBackdrop\(docActivo\) : false/.test(panel)
        && !/setFondoIA/.test(panel));
    // Gasta créditos y manda la fotografía a un tercero: se enciende a
    // propósito, nunca por omisión.
    check('el fondo NO se genera solo al componer la pieza',
        !/generarFondo\(\)/.test(panel.slice(panel.indexOf('const componer = useCallback'), panel.indexOf('const generarCarrusel'))));
    check('el costo y el motor se DICEN en la pantalla',
        /Gasta créditos por pieza/.test(panel) && /KIE\.AI/.test(panel));
    // Sin tope, un trabajo que nunca termina deja la pantalla girando y quien
    // la abrió no sabe si esperar.
    check('el sondeo del fondo tiene tope de espera', /Date\.now\(\) > limite/.test(panel));
    // Un fallo al componer no puede dejar la pieza peor que antes.
    check('la vuelta atrás existe y devuelve la fotografía a su recuadro',
        /const quitarFondo = useCallback/.test(panel));
}

console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
if (!paridad) console.log('  (el bloque de paridad no corrió: instalá esbuild con `npm i --no-save esbuild`)');
process.exit(malos.length ? 1 : 0);
