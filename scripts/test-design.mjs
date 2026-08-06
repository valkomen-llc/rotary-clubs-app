// ════════════════════════════════════════════════════════════════════
// Plantillas IA — pruebas del CRITERIO — v4.720
//
// Sin base, sin credenciales y sin red. Se prueba lo que DECIDE el módulo
// —cómo se resuelven las variables, cómo se compila una plantilla, cómo se
// reparte el texto en líneas y qué trazo sale de cada forma—, separado de la
// orquestación, por el mismo motivo que `seoRules.js` vive aparte de
// `seoAudit.js`.
//
// Y una cosa más que no se ve mirando una pantalla: que el ESPEJO del navegador
// (`src/lib/designSpec.ts`) y el criterio del servidor (`server/lib/
// designSpec.js`) sigan diciendo lo mismo. Están duplicados a propósito —el
// servidor decide qué acepta, el navegador qué pinta—, y si se separan, la
// vista previa deja de ser lo que se descarga. Esa avería es silenciosa: nada
// falla, simplemente el archivo sale distinto.
//
//   npm run test:design
// ════════════════════════════════════════════════════════════════════

import { build } from 'esbuild';

import * as S from '../server/lib/designSpec.js';
import { TEMPLATES, templateById, catalog, availableTemplates } from '../server/lib/designTemplates.js';
import { ELEMENTS, elementById, elementToNode } from '../server/lib/designElements.js';
import { validateMessage, trimToLimit, TONES } from '../server/lib/designAI.js';

// Las fechas rotarias se importan del CRITERIO, no de `designBranding.js`: ese
// archivo importa la base de datos y arrastrarlo acá obligaría a tener Prisma
// generado y una conexión para probar «cuántos años cumple un club de 1977».
const { parseFoundation, yearsSince, rotaryPeriod } = S;

// El espejo del navegador se compila con esbuild (es TypeScript) y se carga
// como módulo. Mismo procedimiento que `test-audience-assets.mjs`.
const bundle = await build({
    entryPoints: ['src/lib/designSpec.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const C = await import(`data:text/javascript,${encodeURIComponent(bundle.outputFiles[0].text)}`);

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

// Medidor falso: ancho fijo por carácter. Es lo que permite probar el reparto
// de líneas sin un navegador — y por eso `layoutText` recibe `measure` como
// parámetro en vez de crear un canvas por su cuenta.
const fakeMeasure = (perChar = 10) => (text, fontPx) => text.length * perChar * ((fontPx || 100) / 100);

// ════════════════════════════════════════════════════════════════════
grupo('Variables: se resuelven, y lo que falta se DICE');

check('sustituye una variable conocida',
    S.resolveVariables('Al {{club}}', { club: 'Club Rotario Pasto' }).text === 'Al Club Rotario Pasto');

check('una variable sin valor NO deja el marcador a la vista',
    !S.resolveVariables('Al {{club}}', {}).text.includes('{{'),
    S.resolveVariables('Al {{club}}', {}).text);

check('y se reporta como faltante',
    S.resolveVariables('Al {{club}}', {}).missing.includes('club'));

check('una cadena vacía cuenta como faltante, no como valor',
    S.resolveVariables('Al {{club}}', { club: '   ' }).missing.includes('club'));

check('varias variables en el mismo texto',
    S.resolveVariables('{{club}} de {{ciudad}}', { club: 'A', ciudad: 'B' }).text === 'A de B');

check('tolera espacios dentro de las llaves',
    S.resolveVariables('{{ club }}', { club: 'X' }).text === 'X');

check('enumera las variables usadas',
    S.variablesUsedIn('{{club}} {{ciudad}} {{club}}').sort().join(',') === 'ciudad,club');

check('el catálogo de variables es cerrado y trae las del pedido',
    ['club', 'presidente', 'ciudad', 'distrito', 'fecha', 'mensaje', 'logo', 'imagen'].every(v => v in S.VARIABLES));

// ════════════════════════════════════════════════════════════════════
grupo('Normalización: nada de lo que llega del navegador entra crudo');

const raro = S.normalizeNode({ type: 'text', w: 'mucho', h: null, fontSize: 999, opacity: 5, rotation: 725, color: 'javascript:alert(1)' });
check('un ancho no numérico cae al valor por defecto', raro.w === S.NODE_DEFAULTS.w, String(raro.w));
check('el tamaño de fuente tiene techo', raro.fontSize <= 0.4, String(raro.fontSize));
check('la opacidad se acota a 0-1', raro.opacity === 1, String(raro.opacity));
check('la rotación se normaliza a 0-359', raro.rotation === 5, String(raro.rotation));
check('un color que no es color se descarta', raro.color === S.TEXT_DEFAULTS.color, raro.color);

check('un tipo desconocido cae a texto', S.normalizeNode({ type: 'iframe' }).type === 'text');
check('acepta hex de 6', S.normalizeColor('#17458F') === '#17458F');
check('acepta rgba', S.normalizeColor('rgba(0,0,0,0.5)') === 'rgba(0,0,0,0.5)');
check('rechaza una expresión CSS', S.normalizeColor('url(x)') === S.PALETTE.royal);
check('un degradado de un solo tono no es degradado',
    typeof S.normalizeGradient({ stops: [{ at: 0, color: '#fff' }] }) === 'string');

const doc = S.normalizeDocument({ format: 'inventado', nodes: Array.from({ length: 500 }, () => ({ type: 'text' })) });
check('un formato desconocido cae al de por defecto', doc.format === S.DEFAULT_FORMAT);
check('el número de nodos tiene tope', doc.nodes.length === S.MAX_NODES, String(doc.nodes.length));

// ════════════════════════════════════════════════════════════════════
grupo('Compilación de una plantilla');

const tpl = templateById('aniversario_foto');
const compilado = S.compileTemplate({
    template: tpl,
    variables: { anios: '49', mensaje: 'Un mensaje.', imagen: 'https://x/f.jpg' },
    branding: { clubName: 'Club Rotario Cali San Fernando', district: '4281', governor: 'Fabio Véjar', period: '2026-2027', logo: 'https://x/l.png' },
});

check('el saludo lleva el nombre real del club',
    compilado.nodes.find(n => n.id === 'saludo')?.text === 'Al Club Rotario Cali San Fernando');
check('el título lleva los años',
    compilado.nodes.find(n => n.id === 'titulo')?.text === '¡Felices 49 años!');
check('la firma une gobernador, distrito y periodo',
    /Fabio Véjar/.test(compilado.nodes.find(n => n.id === 'firma')?.text || '')
    && /4281/.test(compilado.nodes.find(n => n.id === 'firma')?.text || ''));
check('la fotografía toma la URL de la variable',
    compilado.nodes.find(n => n.id === 'foto')?.src === 'https://x/f.jpg');
check('el nodo de imagen recuerda de qué variable salió',
    compilado.nodes.find(n => n.id === 'foto')?.srcVar === 'imagen');
check('un nodo de texto con variables recuerda su plantilla',
    compilado.nodes.find(n => n.id === 'titulo')?.srcText === '¡Felices {{anios}} años!');
check('no quedan marcadores sin resolver en ningún texto',
    !compilado.nodes.filter(n => n.type === 'text').some(n => /\{\{/.test(n.text)));

// `dropIfEmpty` es lo que evita el rectángulo gris donde iba el logotipo.
const sinLogo = S.compileTemplate({ template: tpl, variables: { anios: '49' }, branding: { clubName: 'X' } });
check('sin logotipo, el nodo del logotipo NO se dibuja',
    !sinLogo.nodes.some(n => n.id === 'logo'));
check('sin gobernador, la firma NO se dibuja',
    !sinLogo.nodes.some(n => n.id === 'firma'));
check('pero la curva del pie sigue estando',
    sinLogo.nodes.some(n => n.id === 'pie_azul'));
check('y lo que falta se reporta', sinLogo.missing.includes('logo'));

check('el compilador se queja si no le dan plantilla',
    (() => { try { S.compileTemplate({}); return false; } catch { return true; } })());

// El branding sólo pisa lo que la plantilla DECLARA. Una curva dorada que
// cambiara de color con cada club dejaría de ser la papelería del Distrito.
const marca = S.compileTemplate({
    template: { id: 't', format: 'post_1_1', nodes: [
        { id: 'a', type: 'shape', shape: 'rect', fill: '#111111', brand: 'primary' },
        { id: 'b', type: 'shape', shape: 'rect', fill: '#111111' },
    ] },
    branding: { primary: '#ABCDEF' },
});
check('un nodo con `brand` adopta el color del club', marca.nodes[0].fill === '#ABCDEF');
check('uno sin `brand` conserva el suyo', marca.nodes[1].fill === '#111111');

// ════════════════════════════════════════════════════════════════════
grupo('Reparto del texto y ajuste al recuadro');

const m = fakeMeasure(10);
// Con el medidor falso a 10 px por carácter: «aaa» mide 30 y «aaa bbb» mide 70,
// así que con 60 de ancho cada palabra cae en su línea; con 80 entran de a dos.
check('parte donde deja de caber',
    S.wrapText('aaa bbb ccc', 60, t => m(t, 100)).join('|') === 'aaa|bbb|ccc',
    JSON.stringify(S.wrapText('aaa bbb ccc', 60, t => m(t, 100))));
check('y agrupa lo que sí cabe',
    S.wrapText('aaa bbb ccc', 80, t => m(t, 100)).join('|') === 'aaa bbb|ccc',
    JSON.stringify(S.wrapText('aaa bbb ccc', 80, t => m(t, 100))));
check('respeta los saltos de línea escritos',
    S.wrapText('uno\ndos', 10000, t => m(t, 100)).length === 2);
check('una palabra sola no se parte aunque no quepa',
    S.wrapText('supercalifragilistico', 10, t => m(t, 100)).length === 1);

const cabe = S.layoutText({ text: 'hola', boxW: 400, boxH: 200, fontSize: 100, measure: m });
check('lo que cabe no se achica', cabe.fontSize === 100 && !cabe.overflow);

// Éste es el caso real: el nombre de un club largo con tamaño fijo se sale de
// la pieza. `autoFit` es lo que lo mete.
const largo = S.layoutText({ text: 'Club Rotario Cali San Fernando del Valle', boxW: 300, boxH: 120, fontSize: 100, minFontSize: 10, measure: m });
check('un texto largo se achica hasta entrar', largo.fontSize < 100, String(largo.fontSize));
check('y entonces cabe de verdad', !largo.overflow, `alto ${largo.height} en 120`);

const imposible = S.layoutText({ text: 'x'.repeat(400), boxW: 50, boxH: 20, fontSize: 100, minFontSize: 90, measure: m });
check('si ni con el mínimo entra, se avisa en vez de recortar', imposible.overflow);
check('y aun así devuelve algo dibujable', imposible.lines.length > 0);
check('sin autoFit el tamaño no se toca',
    S.layoutText({ text: 'x'.repeat(80), boxW: 50, boxH: 20, fontSize: 100, autoFit: false, measure: m }).fontSize === 100);
check('sin medidor, se rompe en vez de adivinar',
    (() => { try { S.layoutText({ text: 'a', boxW: 1, boxH: 1, fontSize: 1 }); return false; } catch { return true; } })());

// ════════════════════════════════════════════════════════════════════
grupo('Geometría: un solo trazo para el DOM y para el canvas');

for (const shape of ['rect', 'ellipse', 'wave', 'arc', 'ribbon']) {
    const d = S.shapePath(shape, 100, 50);
    check(`«${shape}» produce un trazo cerrado`, d.startsWith('M') && d.trim().endsWith('Z'), d.slice(0, 40));
}
check('un rectángulo con radio usa curvas', S.shapePath('rect', 100, 100, { radius: 10 }).includes('Q'));
check('un rectángulo sin radio no las usa', !S.shapePath('rect', 100, 100).includes('Q'));
check('el radio no puede pasar de la mitad del lado',
    S.shapePath('rect', 100, 40, { radius: 999 }) === S.shapePath('rect', 100, 40, { radius: 20 }));

// ════════════════════════════════════════════════════════════════════
grupo('El espejo del navegador dice lo MISMO que el servidor');

check('los formatos coinciden uno por uno',
    Object.keys(S.FORMATS).length === Object.keys(C.FORMATS).length
    && Object.keys(S.FORMATS).every(k => C.FORMATS[k]
        && C.FORMATS[k].width === S.FORMATS[k].width
        && C.FORMATS[k].height === S.FORMATS[k].height
        && C.FORMATS[k].available === S.FORMATS[k].available));

check('el formato por defecto es el mismo', S.DEFAULT_FORMAT === C.DEFAULT_FORMAT);

check('la paleta coincide',
    Object.keys(S.PALETTE).every(k => S.PALETTE[k] === C.PALETTE[k]),
    JSON.stringify(Object.keys(S.PALETTE).filter(k => S.PALETTE[k] !== C.PALETTE[k])));

check('las tipografías coinciden',
    S.FONTS.length === C.FONTS.length && S.FONTS.every((f, i) => f.id === C.FONTS[i].id && f.stack === C.FONTS[i].stack));

check('las guías del editor coinciden',
    S.SAFE_AREA === C.SAFE_AREA && S.MARGIN === C.MARGIN && S.SNAP_PX === C.SNAP_PX);

// Lo importante no es que las constantes coincidan, es que las FUNCIONES den
// el mismo resultado: es lo que hace que la vista previa sea el archivo.
const mismosTrazos = ['rect', 'ellipse', 'wave', 'arc', 'ribbon']
    .every(s => S.shapePath(s, 137, 89, { radius: 7 }) === C.shapePath(s, 137, 89, { radius: 7 }));
check('shapePath da EXACTAMENTE el mismo trazo en los dos lados', mismosTrazos);

const casos = [
    { text: 'Al Club Rotario Cali San Fernando', boxW: 300, boxH: 120, fontSize: 60, minFontSize: 12 },
    { text: 'corto', boxW: 500, boxH: 200, fontSize: 40, minFontSize: 10 },
    { text: 'una frase bastante más larga que la anterior para forzar varios saltos', boxW: 220, boxH: 90, fontSize: 48, minFontSize: 8 },
    { text: 'con\nsaltos\nescritos', boxW: 400, boxH: 300, fontSize: 30, minFontSize: 10 },
];
const mismoLayout = casos.every(c => {
    const a = S.layoutText({ ...c, measure: m });
    const b = C.layoutText({ ...c, measure: m });
    return a.fontSize === b.fontSize && a.lines.join('|') === b.lines.join('|') && a.overflow === b.overflow;
});
check('layoutText reparte las líneas igual en los dos lados', mismoLayout);

check('resolveVariables coincide en el texto resultante',
    S.resolveVariables('Al {{club}} de {{ciudad}}', { club: 'A' }).text === C.resolveVariables('Al {{club}} de {{ciudad}}', { club: 'A' }));

// ════════════════════════════════════════════════════════════════════
grupo('Variables en vivo (sólo existe en el navegador)');

const vivos = [
    { id: 'a', type: 'text', text: '¡Felices 10 años!', srcText: '¡Felices {{anios}} años!' },
    { id: 'b', type: 'text', text: 'Escrito a mano', srcText: null },
    { id: 'c', type: 'image', src: 'viejo.jpg', srcVar: 'imagen' },
];
const despues = C.applyVariables(vivos, { anios: '49', imagen: 'nuevo.jpg' });
check('un nodo atado a una variable se repinta', despues[0].text === '¡Felices 49 años!');
check('un nodo editado a mano NO se pisa', despues[1].text === 'Escrito a mano');
check('la imagen sigue a su variable', despues[2].src === 'nuevo.jpg');
check('un nodo sin cambios conserva su identidad (no repinta de más)', despues[1] === vivos[1]);

check('duplicar desplaza la copia', (() => {
    const d = C.duplicateNode({ id: 'x', type: 'shape', x: 0.1, y: 0.1, w: 0.2, h: 0.2, rotation: 0, opacity: 1, locked: true });
    return d.id !== 'x' && d.x > 0.1 && d.y > 0.1 && d.locked === false;
})());

// ════════════════════════════════════════════════════════════════════
grupo('El catálogo de plantillas');

check('hay al menos una plantilla disponible', availableTemplates().length >= 1);
check('todas las disponibles son 1:1 en la fase 1',
    availableTemplates().every(t => t.format === 'post_1_1'));
check('las dos variantes del aniversario están',
    ['aniversario_foto', 'aniversario_clasico'].every(id => templateById(id)?.available));
check('la variante con foto la EXIGE y la clásica no',
    templateById('aniversario_foto').requires.includes('imagen')
    && !templateById('aniversario_clasico').requires.includes('imagen'));
check('los ids no se repiten', new Set(TEMPLATES.map(t => t.id)).size === TEMPLATES.length);
check('dentro de una plantilla los ids de nodo tampoco',
    TEMPLATES.every(t => new Set(t.nodes.map(n => n.id)).size === t.nodes.length));
check('cada plantilla declara una categoría del catálogo',
    TEMPLATES.every(t => S.TEMPLATE_CATEGORIES.some(c => c.id === t.category)));
check('todo nodo cabe dentro del lienzo o lo desborda a propósito (nunca más de medio lienzo fuera)',
    TEMPLATES.every(t => t.nodes.every(n => (n.x ?? 0) >= -0.5 && (n.y ?? 0) >= -0.5)));

// Las 16 categorías del pedido se declaran aunque estén vacías: es el mapa de
// hacia dónde crece el módulo.
check('el catálogo expone las 16 categorías pedidas', catalog().length === 16, String(catalog().length));
check('una categoría sin plantillas se declara vacía, no se esconde',
    catalog().some(c => c.templates.length === 0));

check('todo icono de la biblioteca trae un trazo o una forma',
    ELEMENTS.every(e => e.path || e.shape));
check('los ids de los elementos no se repiten', new Set(ELEMENTS.map(e => e.id)).size === ELEMENTS.length);
check('no hay ningún elemento que imite el emblema de Rotary',
    !ELEMENTS.some(e => /rotary|engranaje|rueda|wheel|gear/i.test(`${e.id} ${e.label}`)));
check('un elemento se convierte en nodo centrado',
    (() => { const n = elementToNode(elementById('estrellas'), { at: { x: 0.5, y: 0.5 }, size: 0.2 }); return Math.abs(n.x + n.w / 2 - 0.5) < 1e-9; })());

// ════════════════════════════════════════════════════════════════════
grupo('El texto que se imprime: lo valida el CÓDIGO, no el modelo');

check('un mensaje vacío no pasa', !validateMessage('').ok);
check('uno que se pasa del límite no pasa', !validateMessage('x'.repeat(400), { maxChars: 300 }).ok);
check('y el error dice el número concreto',
    /300/.test(validateMessage('x'.repeat(400), { maxChars: 300 }).errors.join(' ')));
check('un hashtag no pasa: eso va en el copy, no impreso', !validateMessage('Feliz aniversario #Rotary').ok);
check('un enlace no pasa', !validateMessage('Mirá https://ejemplo.org').ok);
check('un marcador sin resolver no pasa', !validateMessage('Al {{club}}').ok);
check('«link en la bio» no pasa', !validateMessage('Más info, link en la bio').ok);
check('un mensaje normal pasa', validateMessage('Celebramos su trayectoria y su compromiso con el servicio.').ok);

check('el recorte no parte palabras',
    !/\s\w{1,3}…$/.test(trimToLimit('palabras que se van a cortar en algún punto exacto', 30))
    && trimToLimit('palabras que se van a cortar en algún punto exacto', 30).length <= 31);
check('el recorte prefiere terminar en punto',
    trimToLimit('Primera frase completa. Segunda frase que sobra.', 30).endsWith('.'));
check('lo que ya cabe no se toca', trimToLimit('corto', 100) === 'corto');

check('todos los tonos del pedido están',
    ['emotivo', 'formal', 'institucional', 'corto', 'elegante', 'inspirador', 'juvenil', 'protocolario', 'internacional', 'bilingue']
        .every(t => t in TONES));
check('«más corto» dice CUÁNTO más corto', typeof TONES.corto.maxChars === 'number');

// ════════════════════════════════════════════════════════════════════
grupo('Fundación y años: no se inventan');

check('acepta un año suelto', parseFoundation('1974').year === 1974);
check('acepta una fecha ISO', parseFoundation('1974-08-04').iso === '1974-08-04');
check('acepta día/mes/año', parseFoundation('4/8/1974').iso === '1974-08-04');
check('un texto sin año no devuelve año', parseFoundation('no me acuerdo').year === null);
check('una cadena vacía tampoco', parseFoundation('').year === null);
check('los años se calculan contra una fecha dada',
    yearsSince(1977, new Date(Date.UTC(2026, 7, 6))) === 49);
check('un año futuro no devuelve un negativo', yearsSince(2100, new Date(Date.UTC(2026, 0, 1))) === null);
check('el periodo rotario arranca en julio',
    rotaryPeriod(new Date(Date.UTC(2026, 6, 1))) === '2026-2027'
    && rotaryPeriod(new Date(Date.UTC(2026, 5, 30))) === '2025-2026');

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    malos.forEach(f => console.log(`   · ${f}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
