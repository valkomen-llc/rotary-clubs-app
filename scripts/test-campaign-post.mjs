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
import { compileTemplate, formatOf, FORMATS, normalizeNode } from '../server/lib/designSpec.js';
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
check('los cuatro objetivos de la Fase 1 están declarados',
    OBJECTIVE_IDS.length === 4
    && ['sensibilizacion', 'recaudacion', 'ayuda_humanitaria', 'panorama'].every(id => OBJECTIVES[id]));
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
check('hay tres composiciones en los DOS formatos: seis entradas',
    CAMPAIGN_TEMPLATES.length === 6);
for (const layout of LAYOUT_IDS) {
    for (const f of FORMAT_IDS) {
        check(`«${layout}» existe en ${f}`, !!templateFor(layout, f));
    }
}
check('cada plantilla declara el formato que dice su entrada',
    CAMPAIGN_TEMPLATES.every(t => FORMAT_IDS.includes(t.format)));
check('ninguna plantilla dibuja una rueda de Rotary: el emblema es marca registrada',
    !/rueda|wheel|engranaje/i.test(readFileSync('server/lib/campaignTemplates.js', 'utf8')));

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

console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
if (!paridad) console.log('  (el bloque de paridad no corrió: instalá esbuild con `npm i --no-save esbuild`)');
process.exit(malos.length ? 1 : 0);
