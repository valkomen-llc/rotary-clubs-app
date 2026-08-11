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
import { readFileSync } from 'node:fs';

import * as S from '../server/lib/designSpec.js';
import { TEMPLATES, templateById, catalog, availableTemplates } from '../server/lib/designTemplates.js';
import { ELEMENTS, elementById, elementToNode } from '../server/lib/designElements.js';
import { validateMessage, trimToLimit, TONES, CIERRE_FALLBACKS, CIERRE_MAX_CHARS, MESSAGE_ANGLES } from '../server/lib/designAI.js';
import * as P from '../server/lib/designPublish.js';
import * as PH from '../server/lib/designPhoto.js';
import * as CO from '../server/lib/designCompose.js';
import * as F from '../server/lib/designFields.js';
import * as PC from '../server/lib/publicClubs.js';
import * as G from '../server/lib/designGuard.js';
import { CLUBS_4271, CLUBS_4281 } from '../server/lib/rotaryClubs.js';

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

// El espejo de los CAMPOS VINCULADOS va aparte porque el editor lo importa
// aparte: `designSpec.ts` sólo toma de él un tipo, y un tipo no viaja al
// bundle. Sin cargarlo acá, las dos mitades del criterio de los campos podrían
// separarse sin que nada lo dijera.
const bundleF = await build({
    entryPoints: ['src/lib/designFields.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const CF = await import(`data:text/javascript,${encodeURIComponent(bundleF.outputFiles[0].text)}`);

// Y el espejo del LIENZO y el FONDO GENERADO. Lo usan el editor y el portal
// público, así que sin esta comparación las dos pantallas podrían acabar
// componiendo la pieza de maneras distintas — que es exactamente lo que pasaba
// hasta v4.731, con `withBackdrop` escrito a mano dentro del editor.
const bundleC = await build({
    entryPoints: ['src/lib/designCompose.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const CC = await import(`data:text/javascript,${encodeURIComponent(bundleC.outputFiles[0].text)}`);

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

// El título de la lámina: los años y el nombre del club (pedido del 11/8).
// El número no se inventa: es un campo obligatorio que quien genera afirma —
// llega calculado al elegir el club de la lista y queda editable.
check('el título lleva el nombre real del club',
    /Club Rotario Cali San Fernando!/.test(compilado.nodes.find(n => n.id === 'titulo')?.text || ''));
check('y lleva el número de años afirmado (v4.775)',
    /aniversario número 49/.test(compilado.nodes.find(n => n.id === 'titulo')?.text || ''));
check('la firma une gobernador, distrito y periodo',
    /Fabio Véjar/.test(compilado.nodes.find(n => n.id === 'firma')?.text || '')
    && /4281/.test(compilado.nodes.find(n => n.id === 'firma')?.text || ''));
check('la fotografía toma la URL de la variable',
    compilado.nodes.find(n => n.id === 'foto')?.src === 'https://x/f.jpg');
check('el nodo de imagen recuerda de qué variable salió',
    compilado.nodes.find(n => n.id === 'foto')?.srcVar === 'imagen');
check('un nodo de texto con variables recuerda su plantilla',
    /\{\{\s*club\s*\}\}/.test(compilado.nodes.find(n => n.id === 'titulo')?.srcText || ''));
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

// `keepSlots` es lo contrario, y hace falta cuando el documento se va a
// PUBLICAR: un hueco borrado no tiene variable, así que `variablesOf` no lo ve,
// el formulario público no genera su campo y nadie puede llenarlo nunca. Fue lo
// que dejó al portal de aniversarios sin el campo del logotipo (v4.722.3).
const conHueco = S.compileTemplate({ template: tpl, variables: { anios: '49' }, branding: { clubName: 'X' }, keepSlots: true });
check('con `keepSlots` el hueco del logotipo sobrevive',
    conHueco.nodes.some(n => n.id === 'logo'));
check('y sigue atado a su variable, que es lo que genera el campo',
    conHueco.nodes.find(n => n.id === 'logo')?.srcVar === 'logo');
check('pero vacío', conHueco.nodes.find(n => n.id === 'logo')?.src === null);
check('y la placa que depende de él también sobrevive',
    conHueco.nodes.some(n => n.id === 'placa_logo'));

// Dibujarlo o no se decide al PINTAR, con la misma regla en los tres lectores
// —vista previa, exportación y portal—. Es lo que sostiene que lo que se ve sea
// el archivo.
const pintados = S.visibleNodes(conHueco.nodes).map(n => n.id);
check('al pintar, el hueco vacío no se dibuja', !pintados.includes('logo'));
check('ni la placa blanca que sólo existía para respaldarlo', !pintados.includes('placa_logo'));
check('el resto de la pieza sí', pintados.includes('titulo') && pintados.includes('pie_azul'));
check('en modo EDITOR el hueco se ve, para poder seleccionarlo',
    S.visibleNodes(conHueco.nodes, { slots: true }).some(n => n.id === 'logo'));
check('pero la placa suelta no, porque no se puede llenar con nada',
    !S.visibleNodes(conHueco.nodes, { slots: true }).some(n => n.id === 'placa_logo'));
check('con el logotipo puesto se dibujan los dos',
    (() => {
        const llenos = conHueco.nodes.map(n => n.id === 'logo' ? { ...n, src: 'https://x/l.png' } : n);
        const ids = S.visibleNodes(llenos).map(n => n.id);
        return ids.includes('logo') && ids.includes('placa_logo');
    })());
check('un nodo oculto a mano tampoco se dibuja',
    !S.visibleNodes([{ id: 'z', type: 'shape', hidden: true }]).some(n => n.id === 'z'));

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

// `visibleNodes` decide qué se dibuja en la vista previa, en la exportación y
// en el portal. Que los dos lados coincidan es lo que sostiene el WYSIWYG.
const paraVer = [
    { id: 'placa', type: 'shape', requiresVar: 'logo' },
    { id: 'logo', type: 'image', src: null, srcVar: 'logo', dropIfEmpty: true },
    { id: 'foto', type: 'image', src: null, srcVar: 'imagen' },
    { id: 'oculto', type: 'shape', hidden: true },
];
check('visibleNodes decide LO MISMO en los dos lados',
    S.visibleNodes(paraVer).map(n => n.id).join(',') === C.visibleNodes(paraVer).map(n => n.id).join(',')
    && S.visibleNodes(paraVer, { slots: true }).map(n => n.id).join(',') === C.visibleNodes(paraVer, { slots: true }).map(n => n.id).join(','),
    `${S.visibleNodes(paraVer).map(n => n.id).join(',')} / ${C.visibleNodes(paraVer).map(n => n.id).join(',')}`);

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

// El portal público resuelve las variables en el navegador, así que la regla
// de `requiresVar`/`dropIfEmpty` tiene que existir de este lado o la pieza sale
// con la placa blanca del logotipo flotando vacía sobre la fotografía.
const conPlaca = [
    { id: 'placa', type: 'shape', requiresVar: 'logo' },
    { id: 'logo', type: 'image', src: null, srcVar: 'logo', dropIfEmpty: true },
    { id: 'foto', type: 'image', src: null, srcVar: 'imagen' },
    { id: 'saludo', type: 'text', text: '', srcText: 'Al {{club}}' },
];
const sinDatos = C.applyPublicValues(conPlaca, {});
check('sin logotipo, el nodo del logotipo NO se dibuja en el portal',
    !sinDatos.some(n => n.id === 'logo'));
check('y su placa de contraste tampoco', !sinDatos.some(n => n.id === 'placa'));
check('la fotografía sin `dropIfEmpty` se conserva como hueco',
    sinDatos.some(n => n.id === 'foto'));

const conDatos = C.applyPublicValues(conPlaca, { logo: 'e.png', club: 'Club Rotario Pasto' });
check('con logotipo vuelven los dos',
    conDatos.some(n => n.id === 'logo') && conDatos.some(n => n.id === 'placa'));
check('y el texto se resuelve igual que en el editor',
    conDatos.find(n => n.id === 'saludo').text === 'Al Club Rotario Pasto');
check('un valor en blanco cuenta como ausente',
    !C.applyPublicValues(conPlaca, { logo: '   ' }).some(n => n.id === 'placa'));

// El editor NO puede quitar nodos: un hueco vacío es donde el administrador va
// a poner algo, y sin verlo no lo puede seleccionar.
check('en el editor, en cambio, no se quita nada',
    C.applyVariables(conPlaca, {}).length === conPlaca.length);

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
grupo('Portal público: el formulario se DERIVA de las variables');

const docPub = { format: 'post_1_1', background: '#fff', nodes: compilado.nodes };

check('encuentra todas las variables del documento',
    ['club', 'mensaje', 'imagen', 'logo', 'gobernador', 'distrito', 'periodo']
        .every(v => P.variablesOf(docPub).includes(v)),
    P.variablesOf(docPub).join(','));

const campos = P.buildPublicFields(docPub);
// El formulario de la reingeniería: club, años, mensaje y fotografía. El
// LOGOTIPO ya no se pide en ESTA plantilla —la lámina de referencia del
// Distrito no lo lleva; firma el logo institucional del pie— y la vía es la
// declaración del nodo (`visible: false`), no una regla global: la decisión de
// v4.722.3 sigue en pie —el logotipo NO es institucional— y otra plantilla lo
// enciende marcándolo en Propiedades.
// El formulario: club, años, mensaje, cierre y fotografía. El mensaje y el
// cierre los escribe la IA y el portal los esconde hasta que haya texto que
// corregir. Los AÑOS volvieron en v4.775 —el pedido del 11/8 es que el título
// imprima el número— y son obligatorios: llegan calculados al elegir el club
// de la lista y quedan editables, así que el número lo afirma quien genera.
check('el formulario ofrece exactamente lo editable',
    campos.map(f => f.key).join(',') === 'club,anios,mensaje,cierre,imagen',
    campos.map(f => f.key).join(','));
check('cada campo trae su tipo',
    campos.find(f => f.key === 'mensaje')?.type === 'textarea'
    && campos.find(f => f.key === 'imagen')?.type === 'image');
check('el mensaje se marca como asistible por IA', campos.find(f => f.key === 'mensaje')?.ai === true);
check('el nombre del club es obligatorio', campos.find(f => f.key === 'club')?.required === true);
check('los campos salen en un orden estable', campos[0].key === 'club');

// El logotipo se APAGÓ en esta plantilla, pero NO por institucional: la regla
// de v4.722.3 sigue —es un dato del club—, y apagarlo es una decisión del
// diseño, reversible desde Propiedades.
check('el logotipo no sale en el formulario de esta plantilla', !campos.some(f => f.key === 'logo'));
check('y sigue sin estar marcado como institucional', !P.isInstitutional('logo'));
check('la plantilla lo declara apagado, no lo borra',
    templateById('aniversario_foto').nodes.some(n => n.id === 'logo' && n.field?.visible === false));

// Lo institucional NO se ofrece: es la firma de la pieza.
check('el gobernador no es un campo público', !campos.some(f => f.key === 'gobernador'));
check('el distrito tampoco', !campos.some(f => f.key === 'distrito'));
check('están marcados como institucionales',
    ['gobernador', 'distrito', 'periodo'].every(P.isInstitutional));
check('desbloquearlos es EXPLÍCITO, nunca por defecto',
    P.buildPublicFields(docPub, { unlock: ['gobernador'] }).some(f => f.key === 'gobernador'));
check('el administrador puede bloquear uno editable',
    !P.buildPublicFields(docPub, { locked: ['anios'] }).some(f => f.key === 'anios'));
// Una pieza del propio Distrito sí quiere el logotipo fijo: se bloquea al
// publicar, que es una decisión por publicación y no una regla del catálogo.
check('y también puede congelar el logotipo si la pieza es del Distrito',
    !P.buildPublicFields(docPub, { locked: ['logo'] }).some(f => f.key === 'logo'));

grupo('Marcar un elemento a mano lo vuelve un campo público');

// El caso que reportó el cliente: un diseño armado a mano —sin plantilla— no
// tenía NINGUNA variable, así que su formulario público salía vacío y no había
// forma de arreglarlo desde el editor. Marcar un nodo le pone la variable.
const aMano = { format: 'post_1_1', background: '#fff', nodes: [
    { id: 'fondo', type: 'image', src: 'https://x.s3.amazonaws.com/base.png', srcVar: null },
    { id: 'texto', type: 'text', text: 'Escrito a mano', srcText: null },
] };
check('un diseño hecho a mano no tiene campos', P.buildPublicFields(aMano).length === 0);

// Marcar = poner la variable, que es como lo declaran las plantillas.
const marcado = { ...aMano, nodes: [
    { ...aMano.nodes[0], srcVar: 'imagen' },
    { ...aMano.nodes[1], srcText: '{{club}}' },
] };
const camposMarcados = P.buildPublicFields(marcado);
check('al marcarlos aparecen como campos',
    camposMarcados.map(f => f.key).sort().join(',') === 'club,imagen', camposMarcados.map(f => f.key).join(','));
check('con el tipo que corresponde a cada uno',
    camposMarcados.find(f => f.key === 'imagen')?.type === 'image'
    && camposMarcados.find(f => f.key === 'club')?.type === 'text');
check('y el portal los resuelve con lo que escriba la persona',
    P.applyPublicValues(marcado, { club: 'Club Rotario Pasto' }).nodes.find(n => n.id === 'texto').text === 'Club Rotario Pasto');

// Sólo se pueden asignar las NO institucionales: el gobernador y el logotipo
// no se ofrecen ni marcándolos a mano.
check('el catálogo de claves asignables excluye lo institucional',
    !P.ASSIGNABLE_FIELDS.some(f => P.isInstitutional(f.key)),
    P.ASSIGNABLE_FIELDS.map(f => f.key).join(','));
check('cada clave asignable dice a qué tipo de nodo le sirve',
    P.ASSIGNABLE_FIELDS.every(f => f.forNode === 'text' || f.forNode === 'image'));
check('las de imagen son el logotipo y la fotografía',
    P.ASSIGNABLE_FIELDS.filter(f => f.forNode === 'image').map(f => f.key).join(',') === 'logo,imagen',
    P.ASSIGNABLE_FIELDS.filter(f => f.forNode === 'image').map(f => f.key).join(','));
check('y trae etiqueta legible', P.ASSIGNABLE_FIELDS.every(f => f.label && f.label !== f.key));

grupo('Portal público: lo que llega de afuera');

const san = P.sanitizeValues(
    { club: 'Club Rotario Pasto', mensaje: '  hola  ', logo: 'https://ok.s3.amazonaws.com/escudo.png', gobernador: 'Yo Mismo', periodo: '9999-9999', anios: '49a' },
    campos
);
check('acepta lo declarado', san.values.club === 'Club Rotario Pasto');
check('recorta espacios', san.values.mensaje === 'hola');
check('los años vuelven a ser un campo de esta pieza (v4.775)', 'anios' in san.values);
check('DESCARTA el logotipo: esta plantilla no lo pide', !('logo' in san.values));
check('DESCARTA al gobernador', !('gobernador' in san.values));
check('DESCARTA el periodo rotario', !('periodo' in san.values));
check('y reporta lo descartado en vez de callarlo',
    san.rejected.includes('gobernador') && san.rejected.includes('periodo'), san.rejected.join(','));
check('un logotipo de origen ajeno se rechaza con motivo',
    P.sanitizeValues({ logo: 'https://cualquiera.test/x.png' }, campos).errors.length > 0);
check('un campo obligatorio vacío se reporta',
    !P.sanitizeValues({ mensaje: 'x' }, campos).ok);
check('el texto se acota al máximo del campo',
    P.sanitizeValues({ club: 'x'.repeat(500) }, campos).values.club.length <= 90);

check('una imagen de nuestro almacenamiento pasa', P.isAcceptableImage('https://b.s3.amazonaws.com/a.jpg'));
check('un data URL de imagen pasa', P.isAcceptableImage('data:image/png;base64,AAA'));
check('un host cualquiera NO pasa', !P.isAcceptableImage('https://cualquiera.test/a.jpg'));
check('http sin cifrar NO pasa', !P.isAcceptableImage('http://b.s3.amazonaws.com/a.jpg'));
check('un javascript: NO pasa', !P.isAcceptableImage('javascript:alert(1)'));
check('y una imagen de origen ajeno se rechaza con motivo',
    P.sanitizeValues({ imagen: 'https://cualquiera.test/a.jpg' }, campos).errors.length > 0);

grupo('Portal público: no hay forma de tocar el diseño');

// Ésta es la comprobación central de la promesa: aunque llegue todo lo que
// se le ocurra a alguien, el documento resultante conserva sus nodos.
const atacado = P.applyPublicValues(
    docPub,
    P.sanitizeValues({ club: 'X', mensaje: 'Y', nodes: [], background: '#000', logo: 'https://evil/x.png' }, campos).values,
    { logo: 'https://ok.amazonaws.com/l.png', gobernador: 'Fabio', distrito: '4281', periodo: '2026-2027' }
);
check('el fondo no se puede cambiar', atacado.background === docPub.background);
check('no se pueden quitar nodos', atacado.nodes.length >= docPub.nodes.filter(n => !n.dropIfEmpty).length);
// Con el logotipo BLOQUEADO —una pieza del propio Distrito— lo congelado gana
// sobre lo que llegue, aunque `sanitizeValues` ya lo hubiera descartado.
check('un valor congelado gana sobre el que llega de afuera',
    atacado.nodes.find(n => n.id === 'logo')?.src === 'https://ok.amazonaws.com/l.png');
check('la firma del gobernador sobrevive',
    /Fabio/.test(atacado.nodes.find(n => n.id === 'firma')?.text || ''));
check('los colores de la plantilla no cambian',
    atacado.nodes.find(n => n.id === 'titulo')?.color === docPub.nodes.find(n => n.id === 'titulo')?.color);

grupo('Portal público: hornear lo institucional');

const horneado = P.bakeFrozen(docPub, { gobernador: 'Fabio Véjar', distrito: '4281', periodo: '2026-2027', logo: 'https://ok.amazonaws.com/l.png' });
const firma = horneado.nodes.find(n => n.id === 'firma');
check('la firma queda resuelta y sin marcadores', /Fabio Véjar/.test(firma.text) && !/\{\{/.test(firma.text), firma.text);
check('y deja de depender de variables', firma.srcText === null);
check('el logotipo queda fijo',
    horneado.nodes.find(n => n.id === 'logo')?.src === 'https://ok.amazonaws.com/l.png');
check('y deja de seguir a una variable',
    horneado.nodes.find(n => n.id === 'logo')?.srcVar === null);
// Éste es todo el motivo de que `bakeFrozen` no sea `resolveVariables`.
const tituloH = horneado.nodes.find(n => n.id === 'titulo');
check('lo que llena el público SIGUE siendo un marcador', /\{\{\s*club\s*\}\}/.test(tituloH.srcText || ''), String(tituloH.srcText));
check('y el nodo del mensaje también', /\{\{\s*mensaje\s*\}\}/.test(horneado.nodes.find(n => n.id === 'mensaje')?.srcText || ''));

grupo('Portal público: la dirección');

check('normaliza a minúsculas y guiones', P.slugify('Aniversario de Club!') === 'aniversario-de-club');
check('quita las tildes', P.slugify('Felicitación') === 'felicitacion');
check('una dirección vacía se rechaza', !P.validateSlug('  ').ok);
check('una demasiado corta también', !P.validateSlug('ab').ok);
check('las palabras reservadas del sitio se rechazan',
    !P.validateSlug('admin').ok && !P.validateSlug('api').ok && !P.validateSlug('plantillas').ok);
check('y el rechazo dice por qué', /reservada/.test(P.validateSlug('admin').error || ''));
check('una válida pasa', P.validateSlug('aniversario-4281').ok);

const publicacion = P.buildPublication({
    document: docPub, name: 'Aniversario de Club', slug: 'aniversario',
    settings: { frozen: { gobernador: 'Fabio', distrito: '4281', periodo: '2026-2027', logo: 'https://ok.amazonaws.com/l.png' }, intro: 'Completá los datos' },
});
// Cinco desde v4.775: club, años, mensaje, cierre y fotografía.
check('la publicación trae su formulario derivado', publicacion.fields.length === 5, String(publicacion.fields.length));
check('y congela lo institucional con su valor',
    publicacion.frozen.gobernador === 'Fabio' && publicacion.frozen.distrito === '4281');
check('no congela lo que el público SÍ llena', !('club' in publicacion.frozen) && !('mensaje' in publicacion.frozen));
// El logotipo está APAGADO en esta plantilla (`visible: false`): se congela
// con su valor por defecto —vacío— y con `dropIfEmpty` la pieza sale sin él,
// como la lámina de referencia. El del settings NO lo pisa: apagado es «este
// dato lo fijo yo», y el diseño lo fijó vacío.
check('el logotipo apagado queda CONGELADO, no ofrecido',
    'logo' in publicacion.frozen && !publicacion.fields.some(f => f.key === 'logo'),
    JSON.stringify(Object.keys(publicacion.frozen)));

// El escudo con el que el administrador DISEÑÓ no puede viajar dentro de la
// plantilla publicada: cada club que abra el enlace vería el de otro.
const conEjemplo = {
    ...docPub,
    nodes: docPub.nodes.map(n => n.id === 'logo' ? { ...n, src: 'https://ok.s3.amazonaws.com/escudo-del-admin.png' } : n),
};
// Para esta comprobación el campo se ENCIENDE: lo que se prueba es que el
// escudo del admin no viaje al público cuando el campo SÍ se ofrece.
const conEjemploVisible = {
    ...conEjemplo,
    nodes: conEjemplo.nodes.map(n => n.id === 'logo' ? { ...n, field: { ...(n.field || {}), visible: true } } : n),
};
const limpio = P.buildPublication({ document: conEjemploVisible, name: 'Aniversario', slug: 'aniversario-2' });
check('el documento publicado sale sin el valor de ejemplo del panel',
    limpio.document.nodes.find(n => n.id === 'logo')?.src === null,
    String(limpio.document.nodes.find(n => n.id === 'logo')?.src));
check('pero el nodo sigue atado a su variable',
    limpio.document.nodes.find(n => n.id === 'logo')?.srcVar === 'logo');
check('y un campo BLOQUEADO conserva el suyo, porque lo congela la publicación',
    P.stripPublicDefaults(conEjemploVisible, P.buildPublicFields(conEjemploVisible, { locked: ['logo'] }))
        .nodes.find(n => n.id === 'logo')?.src === 'https://ok.s3.amazonaws.com/escudo-del-admin.png');
check('un slug inválido impide publicar',
    (() => { try { P.buildPublication({ document: docPub, name: 'x', slug: 'admin' }); return false; } catch { return true; } })());

grupo('La fotografía se adapta sola');

check('una foto ya en formato NO se toca',
    PH.planPhoto({ width: 1000, height: 1000, targetWidth: 1080, targetHeight: 1080 }).action === 'keep');
check('una apaisada se recorta',
    PH.planPhoto({ width: 1600, height: 900, targetWidth: 1080, targetHeight: 1080 }).action === 'crop');
check('y se avisa cuánto se va a perder',
    PH.planPhoto({ width: 2400, height: 900, targetWidth: 1080, targetHeight: 1080 }).notes.some(n => /recortar/.test(n.consequence)));
check('el aviso dice la CONSECUENCIA, no sólo el motivo',
    PH.planPhoto({ width: 2400, height: 900, targetWidth: 1080, targetHeight: 1080 }).notes.every(n => n.reason && n.consequence));
check('una foto chica avisa que se va a ver borrosa',
    PH.planPhoto({ width: 400, height: 400, targetWidth: 1080, targetHeight: 1080 }).notes.some(n => /borrosa/.test(n.consequence)));
check('una foto grande y en formato no genera ningún aviso',
    PH.planPhoto({ width: 2000, height: 2000, targetWidth: 1080, targetHeight: 1080 }).notes.length === 0);
check('sin medidas no inventa un plan',
    !PH.planPhoto({ width: 0, height: 0, targetWidth: 1080, targetHeight: 1080 }).ok);
check('el hueco de la foto sale del propio documento',
    PH.photoSlotOf(docPub, 1080, 1080)?.nodeId === 'foto');
check('y una plantilla sin foto devuelve null',
    PH.photoSlotOf({ nodes: [{ type: 'text', id: 't' }] }, 1080, 1080) === null);

// ════════════════════════════════════════════════════════════════════
grupo('Composición con IA: el reparto y el prompt');

check('viene APAGADA por defecto', CO.normalizeComposition({}).enabled === false);
check('el número de variantes se acota', CO.normalizeComposition({ variants: 99 }).variants === CO.MAX_VARIANTS);
check('y nunca baja de 1', CO.normalizeComposition({ variants: 0 }).variants === 1);
check('un valor no numérico cae al de por defecto',
    CO.normalizeComposition({ variants: 'muchas' }).variants === CO.DEFAULT_VARIANTS);
check('el público arranca en 1 variante', CO.normalizeComposition({}).publicVariants === 1);
check('el prompt maestro tiene tope', CO.normalizeComposition({ masterPrompt: 'x'.repeat(5000) }).masterPrompt.length <= 1200);

// Hay MÁS planes que variantes por generación, y es a propósito: el tope de
// `MAX_VARIANTS` es lo que se paga de una vez, mientras que la lista es el
// repertorio del que `plansFor` elige el que le sirve a cada diseño.
check('hay más planes que variantes por generación, y ninguno se repite',
    CO.VARIANT_PLANS.length >= CO.MAX_VARIANTS
    && new Set(CO.VARIANT_PLANS.map(p => p.id)).size === CO.VARIANT_PLANS.length);
check('cada plan declara la franja que deja libre',
    CO.VARIANT_PLANS.every(p => p.textZone && p.textZone.h > 0 && p.textZone.y >= 0 && p.textZone.y + p.textZone.h <= 1));
check('cada plan dice dónde va la foto y qué queda limpio',
    CO.VARIANT_PLANS.every(p => p.photo && p.clear && p.label));
check('pedir una variante devuelve siempre la MISMA, no una ruleta',
    CO.plansFor(1)[0].id === CO.plansFor(1)[0].id && CO.plansFor(1).length === 1);
check('pedir más de las que hay no rompe', CO.plansFor(99).length === CO.MAX_VARIANTS);

const pr = CO.buildBackdropPrompt({
    composition: { enabled: true, masterPrompt: 'Keep it serene.', style: 'institucional' },
    plan: CO.VARIANT_PLANS[0],
    palette: { primary: '#17458F', accent: '#F7A81B' },
    photo: { url: 'x' }, hasBase: true,
});
check('el prompt nombra las dos imágenes en orden', /first image/.test(pr.prompt) && /second image/.test(pr.prompt));
check('pide que no se pierda a nadie de la foto', /exactly the people in the photograph/i.test(pr.prompt));
check('describe la zona limpia para el texto', /room to read/i.test(pr.prompt));
check('lleva la paleta del club', /17458F/i.test(pr.prompt));
check('incluye el prompt maestro', /Keep it serene/.test(pr.prompt));
check('cabe en el presupuesto', pr.prompt.length <= CO.PROMPT_MAX_CHARS, String(pr.prompt.length));
check('y no dejó nada fuera', pr.dropped.length === 0);

// La regla del sitio: en positivo. Lo prohibido va en su propio campo.
check('el prompt NO enumera prohibiciones', !/\bno\b|\bwithout\b|\bavoid\b|\bdon't\b/i.test(pr.prompt), pr.prompt.slice(0, 120));
check('el texto se prohíbe en el prompt NEGATIVO', /text/.test(CO.NEGATIVE_PROMPT) && /letters/.test(CO.NEGATIVE_PROMPT));
check('y también los logotipos y las marcas de agua',
    /logo/.test(CO.NEGATIVE_PROMPT) && /watermark/.test(CO.NEGATIVE_PROMPT));

const promptLargo = CO.buildBackdropPrompt({
    composition: { enabled: true, masterPrompt: 'y '.repeat(900), style: 'institucional' },
    plan: CO.VARIANT_PLANS[1], photo: { url: 'x' }, hasBase: true,
});
check('un prompt maestro enorme se recorta', promptLargo.prompt.length <= CO.PROMPT_MAX_CHARS, String(promptLargo.prompt.length));
check('y se DICE lo que se dejó fuera', promptLargo.dropped.includes('prompt maestro'));
check('lo que sostiene la composición sobrevive al recorte', /second image/.test(promptLargo.prompt));

check('sin base, el prompt pide construir el lienzo',
    /build a clean institutional canvas/i.test(
        CO.buildBackdropPrompt({ composition: {}, plan: CO.VARIANT_PLANS[0], photo: { url: 'x' }, hasBase: false }).prompt));

grupo('Composición con IA: el fondo dentro del documento');

const conFoto = { format: 'post_1_1', background: '#fff', nodes: [
    { id: 'foto', type: 'image', srcVar: 'imagen', src: 'f.jpg', hidden: false },
    { id: 'titulo', type: 'text', text: 'Hola' },
] };
const conFondo = CO.withBackdrop(conFoto, 'https://x/fondo.png');
check('el fondo entra AL PIE de la pila', conFondo.nodes[0].role === CO.BACKDROP_ROLE);
check('y viene bloqueado', conFondo.nodes[0].locked === true);
check('la fotografía original se OCULTA (ya está dentro del fondo)',
    conFondo.nodes.find(n => n.id === 'foto').hidden === true);
check('el texto sigue estando, para dibujarse encima',
    conFondo.nodes.some(n => n.id === 'titulo'));
check('componer dos veces no acumula fondos',
    CO.withBackdrop(conFondo, 'https://x/otro.png').nodes.filter(n => n.role === CO.BACKDROP_ROLE).length === 1);
check('el fondo nuevo reemplaza al anterior',
    CO.withBackdrop(conFondo, 'https://x/otro.png').nodes[0].src === 'https://x/otro.png');

const sinFondo = CO.withoutBackdrop(conFondo);
check('quitarlo devuelve la pieza a su composición declarada',
    !CO.hasBackdrop(sinFondo) && sinFondo.nodes.find(n => n.id === 'foto').hidden === false);
check('hasBackdrop distingue los dos estados', CO.hasBackdrop(conFondo) && !CO.hasBackdrop(conFoto));

grupo('Composición con IA: qué se acepta de vuelta');

check('una imagen del tamaño y la proporción pedidos pasa',
    CO.validateBackdrop({ width: 1080, height: 1080, format: 'post_1_1' }).ok);
check('una de otra proporción se avisa, no se rechaza en silencio',
    CO.validateBackdrop({ width: 1600, height: 900, format: 'post_1_1' }).problemas.some(p => /proporción/.test(p)));
check('una diminuta se avisa',
    CO.validateBackdrop({ width: 128, height: 128, format: 'post_1_1' }).problemas.some(p => /chica/.test(p)));
check('sin medidas no se inventa un veredicto',
    !CO.validateBackdrop({ width: 0, height: 0, format: 'post_1_1' }).ok);
check('la proporción que se le pide a KIE sale del formato', CO.aspectFor('post_1_1') === '1:1');
check('y de un formato apaisado sale 16:9', CO.aspectFor('post_16_9') === '16:9');
check('el modelo es configurable por entorno', typeof CO.COMPOSE_MODEL() === 'string' && CO.COMPOSE_MODEL().length > 0);

// ════════════════════════════════════════════════════════════════════
// CAMPOS VINCULADOS (v4.723)
//
// El pedido: que el administrador declare las zonas editables de una plantilla
// y que el formulario público se arme SOLO a partir de eso. Lo que se prueba
// acá es el criterio de esa declaración —dónde vive la clave, qué se admite,
// qué formulario sale— y, sobre todo, que un LOGOTIPO no se trate como una
// fotografía: es el defecto concreto que este trabajo corrige.
// ════════════════════════════════════════════════════════════════════
grupo('Campos vinculados: la clave se DERIVA del nodo');

check('una imagen declara su clave en srcVar',
    F.fieldKeyOf({ type: 'image', srcVar: 'logo' }) === 'logo');
check('un texto sólo declara campo si la variable ocupa TODO el contenido',
    F.fieldKeyOf({ type: 'text', srcText: '{{mensaje}}' }) === 'mensaje');
// `Al {{club}}` es una frase con un dato adentro. Dejar que el público
// reescriba la frase entera rompería la redacción de la pieza.
check('una frase con una variable adentro NO es un campo',
    F.fieldKeyOf({ type: 'text', srcText: 'Al {{club}}' }) === null);
check('un texto escrito a mano no declara nada',
    F.fieldKeyOf({ type: 'text', srcText: null }) === null);
check('una forma no puede ser campo', F.fieldKeyOf({ type: 'shape' }) === null);

grupo('Campos vinculados: el nombre interno');

check('se normaliza a minúsculas sin tildes ni espacios',
    F.normalizeKey('Presidente Entrante') === 'presidente_entrante');
check('no puede empezar por un número', F.normalizeKey('2026 sede') === 'sede');
check('se acota a 32 caracteres', F.normalizeKey('a'.repeat(80)).length === 32);
check('uno vacío se rechaza con motivo', !F.validateKey('   ').ok && !!F.validateKey('   ').error);
check('uno demasiado corto también', !F.validateKey('ab').ok);
check('uno válido vuelve normalizado', F.validateKey(' Sede Del Evento ').key === 'sede_del_evento');

grupo('Campos vinculados: la declaración');

const decl = F.normalizeField({ label: 'Logo', required: true, kind: 'logo' }, { key: 'logo', nodeType: 'image' });
check('una declaración vacía no existe', F.normalizeField(null, { key: 'logo' }) === null);
check('lo declarado se conserva', decl.label === 'Logo' && decl.required === true);
check('visible por omisión: un campo marcado existe para llenarse', decl.visible === true);
check('apagarlo es explícito',
    F.normalizeField({ visible: false }, { key: 'logo', nodeType: 'image' }).visible === false);
check('la etiqueta se acota', F.normalizeField({ label: 'x'.repeat(300) }, { key: 'club' }).label.length === F.FIELD_LIMITS.label);
check('la clase por defecto de una imagen es fotografía',
    F.normalizeField({}, { key: 'sede', nodeType: 'image' }).kind === 'foto');
check('la del logotipo sale de su clave',
    F.normalizeField({}, { key: 'logo', nodeType: 'image' }).kind === 'logo');
check('una clase inventada cae en la que le toca por defecto',
    F.normalizeField({ kind: 'inventada' }, { key: 'logo', nodeType: 'image' }).kind === 'logo');
check('el margen interno se acota', F.normalizeField({ image: { safeArea: 9 } }, { key: 'logo', nodeType: 'image' }).image.safeArea === 0.25);

grupo('Campos vinculados: un LOGOTIPO no es una fotografía');

const rLogo = F.imageRulesFor('logo');
const rFoto = F.imageRulesFor('foto');
// Es la diferencia que motiva todo esto: con las reglas de la fotografía, el
// escudo del club llegaba recortado y sin transparencia.
check('el logotipo NO se recorta', rLogo.crop === false && rLogo.fit === 'contain');
check('la fotografía SÍ', rFoto.crop === true && rFoto.fit === 'cover');
check('el logotipo conserva la transparencia', rLogo.transparent === true);
check('la fotografía no la necesita', rFoto.transparent === false);
check('al logotipo se le quitan los bordes vacíos, como en el pendón', rLogo.trim === true);
// El margen blanco de un QR es su zona de silencio: recortarlo deja un código
// que no escanea.
check('a un código QR NO se le recorta el margen', F.imageRulesFor('qr').trim === false);
check('y tampoco se recorta el código', F.imageRulesFor('qr').crop === false);

grupo('Campos vinculados: el formulario se DERIVA de la declaración');

const docCampos = S.normalizeDocument({
    nodes: [
        { type: 'image', id: 'logo', srcVar: 'logo', field: { kind: 'logo', label: 'El escudo de tu club', required: true } },
        { type: 'text', id: 'saludo', text: 'Al Club X', srcText: 'Al {{club}}' },
        { type: 'text', id: 'sede', text: 'Sede', srcText: '{{sede_del_evento}}', field: { kind: 'texto', label: 'Sede', maxChars: 40 } },
        { type: 'text', id: 'oculto', text: 'x', srcText: '{{lema_local}}', field: { visible: false, defaultValue: 'Servir para transformar vidas' } },
    ],
});
// `normalizeDocument` RECONSTRUYE cada nodo: si `field` no estuviera enumerado
// en `normalizeNode`, la declaración se perdería al guardar y al publicar, en
// silencio.
check('la declaración sobrevive a normalizar el documento', !!docCampos.nodes[0].field);
const camposDoc = P.buildPublicFields(docCampos);
const porClave = Object.fromEntries(camposDoc.map(f => [f.key, f]));
check('el logotipo es un campo del formulario', !!porClave.logo);
check('con la etiqueta que declaró el nodo, no la del catálogo', porClave.logo.label === 'El escudo de tu club');
check('y con su clase, que es la que decide cómo se adapta', porClave.logo.kind === 'logo');
check('el formulario dice qué archivos ofrecer', /png/.test(porClave.logo.accept || ''));
check('obligatorio si el nodo lo declara', porClave.logo.required === true);
check('el nombre del club sigue saliendo del catálogo', porClave.club?.label === 'Nombre del club');
// Es el requisito de escalabilidad del pedido: un campo que el catálogo no
// conoce entra igual porque el nodo lo declara. Sin esto, agregar un campo
// exigiría tocar código.
check('una clave NUEVA declarada por el diseñador entra en el formulario', !!porClave.sede_del_evento);
check('con su etiqueta y su tope propios',
    porClave.sede_del_evento.label === 'Sede' && porClave.sede_del_evento.maxChars === 40);
check('una clave sin catálogo y SIN declaración no entra',
    !P.buildPublicFields(S.normalizeDocument({ nodes: [{ type: 'text', srcText: '{{inventada}}' }] })).some(f => f.key === 'inventada'));
check('un campo apagado NO sale en el formulario', !porClave.lema_local);
check('lo institucional sigue bloqueado por omisión',
    !P.buildPublicFields(S.normalizeDocument({ nodes: [{ type: 'text', srcText: '{{gobernador}}' }] })).some(f => f.key === 'gobernador'));

grupo('Campos vinculados: qué se congela al publicar');

const pubCampos = P.buildPublication({ document: docCampos, name: 'Aniversario', slug: 'aniversario-x' });
// Apagar un campo significa «este dato lo fijo yo». Sin congelarlo con su valor
// por defecto, el nodo se publicaría con el marcador sin resolver.
check('un campo apagado se congela con su valor por defecto',
    pubCampos.frozen.lema_local === 'Servir para transformar vidas');
check('un campo visible NO se congela', pubCampos.frozen.logo === undefined);
// El escudo con el que diseñó el administrador no puede viajar dentro de la
// plantilla publicada: cada club vería el de otro.
check('la imagen de ejemplo del panel se vacía al publicar',
    P.stripPublicDefaults({ nodes: [{ type: 'image', srcVar: 'logo', src: 'https://x/escudo.png' }] },
        [{ key: 'logo' }]).nodes[0].src === null);

grupo('Campos vinculados: no se borra lo que nadie puede llenar');

// El defecto que dejaba la pieza publicada casi vacía: un marcador que el
// formulario no ofrece Y que tampoco quedó congelado se resolvía contra un
// diccionario vacío, así que el texto desaparecía y nadie podía escribirlo.
const docHuerfano = { nodes: [
    { type: 'text', id: 'saludo', srcText: 'Al {{club}}', text: 'Al Club Rotario Cali' },
    { type: 'text', id: 'lema', srcText: '{{lema_interno}}', text: 'Servir para transformar vidas' },
    { type: 'image', id: 'sello', srcVar: 'sello_local', src: 'https://x/sello.png' },
] };
const sinLlenables = P.applyPublicValues(docHuerfano, {}, {});
check('sin la lista, todo se re-resuelve (comportamiento de siempre)',
    sinLlenables.nodes.find(n => n.id === 'lema').text === '');
const conLlenables = P.applyPublicValues(docHuerfano, {}, {}, ['club']);
check('un marcador que NO se ofrece conserva lo que se publicó',
    conLlenables.nodes.find(n => n.id === 'lema').text === 'Servir para transformar vidas');
check('y una imagen que nadie puede cambiar tampoco se vacía',
    conLlenables.nodes.find(n => n.id === 'sello').src === 'https://x/sello.png');
// Lo que SÍ se ofrece sigue vaciándose hasta que la persona escriba: mostrar el
// nombre del club con el que se diseñó sería el defecto opuesto.
check('lo que sí se ofrece se vacía hasta que lo escriban',
    conLlenables.nodes.find(n => n.id === 'saludo').text === 'Al');
check('y se llena con lo que escriban',
    P.applyPublicValues(docHuerfano, { club: 'Club Rotario Pasto' }, {}, ['club'])
        .nodes.find(n => n.id === 'saludo').text === 'Al Club Rotario Pasto');
// El espejo del navegador tiene que decidir lo mismo: la vista previa del
// portal es la que se descarga.
const espejoConLlenables = C.applyPublicValues(docHuerfano.nodes, {}, ['club']);
check('el espejo del navegador aplica la misma regla',
    espejoConLlenables.find(n => n.id === 'lema').text === 'Servir para transformar vidas'
    && espejoConLlenables.find(n => n.id === 'saludo').text === 'Al');
check('y sin la lista se comporta como el servidor',
    C.applyPublicValues(docHuerfano.nodes, {}).find(n => n.id === 'lema').text
    === sinLlenables.nodes.find(n => n.id === 'lema').text);

grupo('El EJEMPLO viaja con el campo, no con el nodo');

// El administrador diseña con una imagen puesta y quien abre el enlace quiere
// ver cómo va a quedar. Las dos cosas son ciertas, y la separación es lo que
// las hace compatibles: el NODO se publica vacío —si no, la pieza se exporta
// con el escudo de otro club, el defecto de v4.722.3— y el ejemplo viaja como
// dato del CAMPO, para dibujarlo en la guía.
const docEjemplo = S.normalizeDocument({
    nodes: [
        { type: 'image', id: 'logo', srcVar: 'logo', src: 'https://x.amazonaws.com/escudo-cali-norte.png', field: { kind: 'logo' } },
        { type: 'image', id: 'foto', srcVar: 'imagen', src: 'https://x.amazonaws.com/grupo.jpg', field: { kind: 'foto' } },
        { type: 'text', id: 'saludo', text: 'Al Club X', srcText: 'Al {{club}}' },
    ],
});
const pubEjemplo = P.buildPublication({ document: docEjemplo, name: 'Aniversario', slug: 'aniversario-ej' });
const campoLogo = pubEjemplo.fields.find(f => f.key === 'logo');
const nodoLogoPub = pubEjemplo.document.nodes.find(n => n.id === 'logo');

check('el campo lleva la imagen de ejemplo', campoLogo.sample === 'https://x.amazonaws.com/escudo-cali-norte.png');
// Ésta es la comprobación que importa: el nodo publicado sigue vacío, así que
// la pieza NO se dibuja ni se exporta con el escudo del administrador.
check('el NODO publicado sigue vacío', nodoLogoPub.src === null);
check('cada campo de imagen trae el suyo',
    pubEjemplo.fields.find(f => f.key === 'imagen')?.sample === 'https://x.amazonaws.com/grupo.jpg');
check('un campo de texto no lleva ejemplo de imagen',
    pubEjemplo.fields.find(f => f.key === 'club')?.sample === undefined);
// Un `src` de origen desconocido no se publica ni como ejemplo: termina en un
// `<img>` de una página pública.
const docRaro = S.normalizeDocument({
    nodes: [{ type: 'image', id: 'logo', srcVar: 'logo', src: 'https://sitio-cualquiera.test/x.png', field: { kind: 'logo' } }],
});
check('un origen no aceptado no se publica como ejemplo',
    P.buildPublication({ document: docRaro, name: 'X', slug: 'x-ej' }).fields.find(f => f.key === 'logo')?.sample === undefined);
// Y la pieza que se descarga sin subir nada no lleva el ejemplo por ninguna vía.
const resuelto = P.applyPublicValues(pubEjemplo.document, {}, {}, pubEjemplo.fields.map(f => f.key));
check('sin subir nada, el logotipo resuelto sigue SIN imagen',
    resuelto.nodes.find(n => n.id === 'logo')?.src === null,
    String(resuelto.nodes.find(n => n.id === 'logo')?.src));
check('y con `dropIfEmpty` desaparece del todo, como en la plantilla real',
    !P.applyPublicValues(
        P.buildPublication({
            document: S.normalizeDocument({ nodes: [{ type: 'image', id: 'logo', srcVar: 'logo', dropIfEmpty: true, src: 'https://x.amazonaws.com/e.png', field: { kind: 'logo' } }] }),
            name: 'X', slug: 'x-drop',
        }).document, {}, {}, ['logo'],
    ).nodes.some(n => n.id === 'logo'));

grupo('El enlace público sigue al diseño');

// Lo reportado: se agrega un texto, se guarda, y el enlace público sigue
// mostrando la versión vieja. La publicación guarda una COPIA del documento —eso
// no cambia, y es lo que impide que un despliegue toque un enlace que ya
// circula— pero esa copia ahora se rehace cuando el administrador guarda.
//
// Lo que hace posible rehacerla sin volver a preguntar nada son los AJUSTES con
// los que se publicó: qué quedó bloqueado, qué se congeló, el texto de
// introducción.
const docV1 = S.normalizeDocument({
    nodes: [
        { type: 'text', id: 'saludo', text: 'Al Club X', srcText: 'Al {{club}}' },
        { type: 'text', id: 'firma', text: 'Gob. Fabio', srcText: '{{gobernador}}' },
    ],
});
const ajustes = { locked: [], frozen: { gobernador: 'Fabio Enrique Véjar Montañez' }, intro: 'Completá y descargá' };
const pubV1 = P.buildPublication({ document: docV1, name: 'Aniversario', slug: 'aniv-vivo', settings: ajustes });
check('la publicación arranca con los campos del documento',
    pubV1.fields.some(f => f.key === 'club'));
check('y congela lo institucional', pubV1.frozen.gobernador === 'Fabio Enrique Véjar Montañez');

// El administrador agrega un texto y guarda. Rehacer la publicación con los
// MISMOS ajustes tiene que traer el elemento nuevo y conservar todo lo demás.
const docV2 = S.normalizeDocument({
    nodes: [
        ...docV1.nodes,
        { type: 'text', id: 'nuevo', text: 'Gobernador, Distrito 4281', srcText: null },
    ],
});
const pubV2 = P.buildPublication({ document: docV2, name: pubV1.name, slug: pubV1.slug, settings: ajustes });
check('el elemento agregado llega a la publicación',
    pubV2.document.nodes.some(n => n.id === 'nuevo'));
check('la dirección pública NO cambia', pubV2.slug === pubV1.slug);
check('el texto de introducción se conserva', pubV2.intro === 'Completá y descargá');
check('y lo congelado sigue congelado', pubV2.frozen.gobernador === 'Fabio Enrique Véjar Montañez');
check('el formulario se recalcula con el documento nuevo',
    pubV2.fields.some(f => f.key === 'club') && !pubV2.fields.some(f => f.key === 'gobernador'));

// Un bloqueo hecho al publicar también sobrevive: sin guardar los ajustes, cada
// guardado devolvería al público un campo que se había cerrado a propósito.
const conBloqueo = { ...ajustes, locked: ['club'] };
const pubBloqueada = P.buildPublication({ document: docV2, name: 'X', slug: 'aniv-bloq', settings: conBloqueo });
check('un campo bloqueado al publicar sigue bloqueado al rehacer',
    !pubBloqueada.fields.some(f => f.key === 'club'));

grupo('Una publicación HEREDADA se rehace sin perder nada');

// El defecto reportado después de la v4.729: se agrega un texto, se guarda, y el
// enlace público sigue igual. La causa es que `settings` nació con la v4.729,
// así que TODA publicación anterior —que son todas— tiene la columna vacía.
//
// Rehacerlas con `settings` a secas no es neutral: se publicarían con los
// ajustes POR DEFECTO. Esto es lo que se perdería.
const heredada = {
    settings: {},                       // la columna nació vacía
    document: pubBloqueada.document,    // pero el RESULTADO está en la fila
    fields: pubBloqueada.fields,
    frozen: pubBloqueada.frozen,
    intro: pubBloqueada.intro,
};
const aPelo = P.buildPublication({ document: docV2, name: 'X', slug: 'aniv-bloq', settings: {} });
check('sin deducir, la firma del Distrito se perdería',
    Object.keys(aPelo.frozen).length === 0);
check('sin deducir, un campo bloqueado volvería a salir al público',
    aPelo.fields.some(f => f.key === 'club'));

const deducidos = P.settingsForRefresh(heredada);
check('el bloqueo se deduce del formulario que salió', deducidos.locked.includes('club'));
check('lo congelado se recupera de la propia fila',
    deducidos.frozen.gobernador === 'Fabio Enrique Véjar Montañez');
check('y el texto de introducción también', deducidos.intro === 'Completá y descargá');

const rehecha = P.buildPublication({ document: docV2, name: 'X', slug: 'aniv-bloq', settings: deducidos });
check('rehacer una heredada da el MISMO formulario',
    JSON.stringify(rehecha.fields.map(f => f.key)) === JSON.stringify(pubBloqueada.fields.map(f => f.key)));
check('y la MISMA firma', JSON.stringify(rehecha.frozen) === JSON.stringify(pubBloqueada.frozen));

// Lo que NO puede pasar: que la deducción congele para siempre el formulario.
// Por eso se deduce contra el documento PUBLICADO, no contra el nuevo — contra
// el nuevo, una variable recién marcada se leería como «no salía, luego estaba
// bloqueada» y no llegaría a ofrecerse nunca.
const docConCampoNuevo = S.normalizeDocument({
    nodes: [...docV2.nodes, { type: 'text', id: 'pres', text: '', srcText: '{{presidente}}' }],
});
const conNuevo = P.buildPublication({ document: docConCampoNuevo, name: 'X', slug: 'aniv-bloq', settings: P.settingsForRefresh(heredada) });
check('un campo recién marcado SÍ se ofrece', conNuevo.fields.some(f => f.key === 'presidente'));
check('y el que estaba bloqueado sigue sin ofrecerse', !conNuevo.fields.some(f => f.key === 'club'));

// Una institucional que se soltó a propósito al publicar tiene que seguir
// suelta: si no, el primer guardado la vuelve a cerrar sin decirlo.
const suelta = P.buildPublication({ document: docV1, name: 'X', slug: 'aniv-suelta', settings: { unlock: ['gobernador'] } });
check('una institucional soltada al publicar sale como campo',
    suelta.fields.some(f => f.key === 'gobernador'));
check('y sigue suelta al rehacer',
    P.settingsForRefresh({ settings: {}, document: suelta.document, fields: suelta.fields, frozen: suelta.frozen })
        .unlock.includes('gobernador'));

// Una publicación ya nacida con v4.729 no se toca: sus ajustes mandan.
const modernos = P.settingsForRefresh({ settings: { locked: ['mensaje'], frozen: { club: 'RC X' }, intro: 'Hola' }, document: docV2, fields: [], frozen: {}, intro: 'otro' });
check('los ajustes guardados mandan sobre la deducción',
    JSON.stringify(modernos.locked) === JSON.stringify(['mensaje']) && modernos.intro === 'Hola');

grupo('La preservación de la fotografía se MIDE');

// El prompt PIDE que no se invente ni se pierda a nadie. Pedirlo es necesario y
// no alcanza: un modelo generativo puede desobedecer y la pieza sale igual, con
// una persona de más, en una publicación institucional.
const okSemantico = { leftPeople: 6, rightPeople: 6, newSubjects: false, missingSubjects: false, faceConsistency: 9, notes: '' };
check('una composición fiel se usa',
    G.decidePreservation({ semantic: okSemantico, structural: { ok: true, score: 0.4 } }).use === true);

check('una persona INVENTADA descarta la composición',
    G.decidePreservation({ semantic: { ...okSemantico, newSubjects: true } }).use === false);
check('una persona de MÁS en el recuento descarta',
    G.decidePreservation({ semantic: { ...okSemantico, rightPeople: 7 } }).use === false);
check('unos rostros que no son los mismos descartan',
    G.decidePreservation({ semantic: { ...okSemantico, faceConsistency: 3 } }).use === false);

// Contar catorce cabezas no lo hace bien ningún modelo de visión: descartar por
// un ±1 en una multitud sería gastar créditos en un problema inexistente.
check('en multitud el recuento NO decide solo',
    G.decidePreservation({ semantic: { ...okSemantico, leftPeople: 14, rightPeople: 15 } }).use === true);
check('pero la señal explícita sigue valiendo en multitud',
    G.decidePreservation({ semantic: { ...okSemantico, leftPeople: 14, rightPeople: 15, newSubjects: true } }).use === false);

// ── RECORTAR NO ES BORRAR ─────────────────────────────────────────────
//
// La corrección de fondo. Componer una pieza es ENCUADRAR: el plan mete la foto
// en una forma redondeada o en una columna, y eso se lleva los bordes. Con una
// foto de treinta personas alguien de los extremos queda fuera SIEMPRE, así que
// reprobar por «falta alguien» vetaba TODA composición de una foto de grupo —el
// caso más común del cliente—. Se reportó como el respaldo saltando en todas
// las generaciones.
const recortada = { ...okSemantico, leftPeople: 30, rightPeople: 26, missingSubjects: true, missingAtEdge: true };
check('el recorte del ENCUADRE ya no descarta la composición',
    G.decidePreservation({ semantic: recortada }).use === true);
check('y se DICE, aunque la pieza se use',
    /recort[óo]/i.test(G.decidePreservation({ semantic: recortada }).notice || ''));
check('el aviso NO es un fallo: viaja aparte del motivo',
    G.decidePreservation({ semantic: recortada }).reason === null
    && G.decidePreservation({ semantic: recortada }).state === 'ok');
check('y queda marcado para quien lo quiera leer',
    G.decidePreservation({ semantic: recortada }).cropped === true);
check('una composición sin recorte no arrastra ningún aviso',
    G.decidePreservation({ semantic: okSemantico }).notice === null
    && G.decidePreservation({ semantic: okSemantico }).cropped === false);

// Lo que sí descalifica: alguien del INTERIOR. El encuadre no pudo llevárselo
// —estaba rodeado de gente—, así que el modelo lo borró o lo reemplazó.
check('alguien BORRADO del centro descarta igual que una persona inventada',
    G.decidePreservation({ semantic: { ...recortada, missingFromCentre: true } }).use === false);
check('y se dice que fue del centro, no un recorte',
    /centro/i.test(G.decidePreservation({ semantic: { ...recortada, missingFromCentre: true } }).reason || ''));

// Ante la duda se reprueba: dar por bueno un borrado porque el modelo no
// contestó dónde estaba quien falta sería al revés de lo que esto hace.
check('falta gente y no consta que fuera del borde: se descarta',
    G.decidePreservation({ semantic: { ...okSemantico, missingSubjects: true } }).use === false);
check('un modelo que no contesta el campo no da permiso',
    G.readPeopleVerdict('{"missingSubjects":true}')?.missingAtEdge === false);

// `strict` es para una plantilla donde aparecer es el punto de la pieza.
check('en modo estricto, perder a alguien del borde sí descarta',
    G.decidePreservation({ semantic: recortada, edgeCrop: G.EDGE_CROP.STRICT }).use === false);
check('y el recuento vuelve a ser simétrico',
    G.decidePreservation({ semantic: { ...okSemantico, leftPeople: 6, rightPeople: 5 }, edgeCrop: G.EDGE_CROP.STRICT }).use === false);
check('mientras que por defecto una persona de menos no descarta',
    G.decidePreservation({ semantic: { ...okSemantico, leftPeople: 6, rightPeople: 5 } }).use === true);
// La asimetría es el punto: de más es una persona inventada, de menos es el
// encuadre. Compararlo con `Math.abs` era lo que vetaba toda foto de grupo.
check('el exceso descalifica en cualquier modo',
    G.decidePreservation({ semantic: { ...okSemantico, rightPeople: 7 }, edgeCrop: G.EDGE_CROP.STRICT }).use === false);

// La estructural sola sólo atrapa el caso extremo: acá el lienzo alrededor es
// contenido NUEVO a propósito, así que un piso alto reprobaría toda composición
// buena — el error que costó dos rondas de créditos en el Creador de Reels.
check('sin modelo de visión, una composición razonable pasa',
    G.decidePreservation({ structural: { ok: true, score: 0.35 } }).use === true);
check('y una imagen sin relación con la fotografía se descarta',
    G.decidePreservation({ structural: { ok: true, score: 0.05 } }).use === false);
check('con modelo de visión, manda el modelo',
    G.decidePreservation({ semantic: okSemantico, structural: { ok: true, score: 0.05 } }).use === true);

// `unavailable` NO es un tipo de «bien»: significa que no se pudo mirar.
const sinNada = G.decidePreservation({});
check('sin ninguna señal se dice que no se pudo comprobar', sinNada.state === 'unavailable');
check('y aun así la pieza se entrega', sinNada.use === true);

// El motivo se dice con su CONSECUENCIA: «hay una persona de más» no le explica
// a nadie por qué su pieza salió sin el diseño compuesto.
const descartada = G.decidePreservation({ semantic: { ...okSemantico, newSubjects: true } });
check('un descarte explica la consecuencia',
    /fotograf[ií]a tal como la subiste/i.test(descartada.consequence || ''), descartada.consequence);

// Lo que devuelve el modelo se normaliza antes de decidir.
check('una respuesta con envoltorio de markdown se lee igual',
    G.readPeopleVerdict('```json\n{"leftPeople":3,"rightPeople":3,"faceConsistency":8}\n```')?.leftPeople === 3);
check('una respuesta ilegible no inventa un veredicto',
    G.readPeopleVerdict('no puedo') === null);
check('los booleanos son estrictos: sólo true es true',
    G.readPeopleVerdict('{"newSubjects":"si"}')?.newSubjects === false);

grupo('El buscador de clubes del portal');

// Sale del catálogo curado de la Feria —el mismo que ya vio quien postuló su
// proyecto o se inscribió al evento—, no del directorio de sitios alojados.
check('el catálogo son los clubes de los dos distritos',
    PC.allPublicClubs().length === CLUBS_4271.length + CLUBS_4281.length,
    String(PC.allPublicClubs().length));
check('cada club dice a qué distrito pertenece',
    PC.allPublicClubs().every(c => c.district === '4271' || c.district === '4281'));

// El catálogo guarda el nombre corto —«Bogotá»— porque es lo que hace usable un
// desplegable de 74 entradas. Pero la pieza dice «Al {{club}}», y «Al Bogotá»
// no es el nombre de nadie.
check('el nombre para imprimir se construye', PC.clubDisplayName('Bogotá') === 'Club Rotario Bogotá');
check('un club electrónico se llama distinto',
    PC.clubDisplayName('E-Club Origen') === 'Rotary E-Club Origen');
check('y no se le pone el prefijo dos veces',
    PC.clubDisplayName('Club Rotario Cali') === 'Club Rotario Cali'
    && PC.clubDisplayName('Rotary E-Club Origen') === 'Rotary E-Club Origen');
check('un nombre vacío no inventa nada', PC.clubDisplayName('  ') === '');

// Ordena por dónde CASA el término: quien escribe «cali» espera «Cali» antes
// que «Nuevo Cali».
const cali = PC.searchPublicClubs('cali');
check('buscar encuentra sin tildes ni mayúsculas',
    PC.searchPublicClubs('BOGOTA').some(c => c.name === 'Bogotá'));
check('lo que empieza con el término va primero',
    cali[0].name === 'Cali', cali.map(c => c.name).join(' | '));
check('el orden es reproducible',
    JSON.stringify(PC.searchPublicClubs('cali')) === JSON.stringify(cali));
check('sin término no se vuelcan los 133', PC.searchPublicClubs('').length <= PC.SEARCH_LIMIT);
check('el tope se respeta', PC.searchPublicClubs('a', 3).length === 3);
check('un término que no está da vacío', PC.searchPublicClubs('zzzz').length === 0);
check('un club escrito a mano se reconoce por su forma corta o larga',
    PC.findPublicClub('cali pance')?.name === 'Cali Pance'
    && PC.findPublicClub('Club Rotario Cali Pance')?.name === 'Cali Pance');
check('y uno que no está no se fuerza', PC.findPublicClub('Club de Ajedrez') === null);

grupo('Tres textos, tres cosas distintas');

// El pedido separa explícitamente: qué comunicar (referencia), cómo verse
// (prompt maestro) y el copy final de cada generación. Se guardan aparte
// porque los consume maquinaria distinta.
const conTextos = CO.normalizeComposition({
    enabled: true,
    referenceText: '  Celebramos la trayectoria del {{club}} y a sus socios.  ',
    masterPrompt: 'Elegante, con luz suave.',
});
check('el texto de referencia se guarda aparte del prompt maestro',
    conTextos.referenceText === 'Celebramos la trayectoria del {{club}} y a sus socios.'
    && conTextos.masterPrompt === 'Elegante, con luz suave.');
check('una composición sin ellos no los inventa',
    CO.normalizeComposition({}).referenceText === '' && CO.normalizeComposition({}).masterPrompt === '');
check('el texto de referencia tiene tope',
    CO.normalizeComposition({ referenceText: 'x'.repeat(5000) }).referenceText.length <= CO.REFERENCE_MAX_CHARS);

// Lo que NO puede pasar: que la intención acabe en el prompt de imagen. Ahí
// sería pedirle al motor generativo que redacte, que es justo lo que este
// módulo no le pide — y además gastaría presupuesto del prompt visual.
const promptVisual = CO.buildBackdropPrompt({
    composition: conTextos, plan: CO.VARIANT_PLANS[0],
    photo: { url: 'https://x/f.jpg' }, hasBase: true,
});
check('el texto de referencia NO viaja al modelo de imagen',
    !/Celebramos la trayectoria/.test(promptVisual.prompt));
check('pero la dirección de arte SÍ', /Elegante, con luz suave/.test(promptVisual.prompt));

// El prompt maestro pesa más que el estilo genérico: era al revés, y un
// administrador que escribía su dirección creativa podía quedarse sin ella
// mientras sobrevivía una cláusula escrita por nosotros.
const maestroGrande = CO.buildBackdropPrompt({
    // Medido: la base ocupa 935 de 2000, y 1055 con la paleta y el estilo. Una
    // dirección de arte de 900 sólo entra si se sacrifican el estilo y la
    // paleta — que es exactamente lo que hay que comprobar. (Era 1000 hasta
    // v4.772: el censo de personas y el brillo de la silueta agrandaron la
    // base, y con 1000 el propio prompt maestro dejaba de caber.)
    composition: CO.normalizeComposition({ enabled: true, masterPrompt: 'D'.repeat(900) }),
    plan: CO.VARIANT_PLANS[0], photo: { url: 'https://x/f.jpg' }, hasBase: true,
    palette: { primary: '#17458F', accent: '#F7A81B' },
});
check('al recortar se sacrifica el estilo antes que la dirección de arte',
    maestroGrande.dropped.includes('estilo') && /D{50}/.test(maestroGrande.prompt),
    maestroGrande.dropped.join(', '));
check('y el prompt sigue dentro del presupuesto',
    maestroGrande.prompt.length <= CO.PROMPT_MAX_CHARS);
check('lo que sostiene la composición nunca se recorta',
    /same number of people/.test(maestroGrande.prompt));

grupo('El encuadre y la ocasión los DECLARA la plantilla');

// Lo reportado tras la Fase 1: la composición ya sobrevivía, pero la
// fotografía salía «dentro de una forma cuadrada con bordes» y «cambia el color
// del fondo de base». Tres cosas distintas, y ninguna es el control de calidad.

// 1. EL ENCUADRE es dirección de arte, no una puntuación. `plansFor` lo elegía
//    sola comparando contra la franja del texto: buen respaldo, pero no sabe
//    que esta pieza quiere la forma grande mordida por la curva.
check('el plan declarado va primero',
    CO.plansFor(1, null, 'foto_recorte_curvo')[0].id === 'foto_recorte_curvo');
check('y con una sola variante es el ÚNICO que se genera',
    CO.plansFor(1, null, 'foto_recorte_curvo').length === 1);
check('los demás siguen detrás, para las variantes del panel',
    CO.plansFor(4, null, 'foto_recorte_curvo').length === 4
    && new Set(CO.plansFor(4, null, 'foto_recorte_curvo').map(p => p.id)).size === 4);
const docConTexto = S.normalizeDocument({
    nodes: [
        { type: 'image', id: 'foto', srcVar: 'imagen', x: 0, y: 0, w: 1, h: 0.47 },
        { type: 'text', id: 'saludo', text: 'Al Club X', x: 0.075, y: 0.535, w: 0.85, h: 0.095 },
    ],
});
check('`auto` conserva el criterio del documento',
    CO.plansFor(1, docConTexto, 'auto')[0].id === CO.plansFor(1, docConTexto)[0].id);
// Un id viejo se degrada al respaldo, no al primero de la lista: elegir un
// encuadre por descarte es peor que dejar decidir al documento.
check('un plan inexistente cae en `auto`, no en el primero',
    CO.normalizeComposition({ photo: { plan: 'nope' } }).photo.plan === 'auto');
// La referencia final (11/8, la pieza hecha en ChatGPT): la silueta del grupo
// sobre la lámina, sin forma que la contenga. El plan es la foto a lienzo
// entero y el prompt maestro pide el recorte del fondo.
check('la plantilla de aniversario declara la silueta inferior',
    templateById('aniversario_foto').composition.photo.plan === 'silueta_inferior');
// El recorte del fondo vive en el PLAN, no en el prompt maestro: el encuadre es
// quien dice dónde va la foto, y tenerlo en dos lados era la contradicción que
// hacía que el modelo pegara la foto arriba.
check('y el plan pide la silueta recortada, abajo, tras la banda',
    /cut out of their own background/i.test(CO.planById('silueta_inferior').photo)
    && /lower half/i.test(CO.planById('silueta_inferior').photo)
    && /behind the bottom band/i.test(CO.planById('silueta_inferior').photo));
check('y el brillo blanco traza el borde de la silueta (pedido 11/8)',
    /white glow tracing the cut edge/i.test(CO.planById('silueta_inferior').photo));
// El censo va EN POSITIVO —mismo criterio que Reels—: se afirma que el grupo es
// exactamente la gente de la foto, en número; lo que salió mal (la cinta
// degradada, figuras agregadas) va al campo negativo.
check('la preservación afirma el número exacto de personas',
    /same number of people/i.test(CO.buildBackdropPrompt({
        composition: { enabled: true }, plan: CO.planById('silueta_inferior'), photo: { url: 'x' }, hasBase: true,
    }).prompt));
check('la cinta degradada y las figuras agregadas van al negativo',
    /gradient ribbon across the people/.test(CO.NEGATIVE_PROMPT) && /added figures/.test(CO.NEGATIVE_PROMPT));
check('su zona tranquila es la columna superior izquierda, donde va el texto',
    /upper left/i.test(CO.planById('silueta_inferior').clear));

// ── El ancho del grupo y la variación de la base (v4.771) ─────────────
check('el ancho del grupo se declara y se normaliza',
    CO.normalizeComposition({ photo: { width: 'compacto' } }).photo.width === 'compacto'
    && CO.normalizeComposition({ photo: { width: 'raro' } }).photo.width === 'medio'
    && CO.normalizeComposition({}).photo.width === 'medio');
const anchoMedio = CO.buildBackdropPrompt({
    composition: { enabled: true, photo: { width: 'medio' } },
    plan: CO.planById('silueta_inferior'), photo: { url: 'x' }, hasBase: true,
});
check('«medio» pide dos tercios con aire a los lados',
    /two thirds of the width/i.test(anchoMedio.prompt));
check('«amplio» no agrega cláusula: manda el encuadre',
    !/width of the canvas, centred/i.test(CO.buildBackdropPrompt({
        composition: { enabled: true, photo: { width: 'amplio' } },
        plan: CO.planById('silueta_inferior'), photo: { url: 'x' }, hasBase: true,
    }).prompt));

check('la variación de la base se declara: sólo «variar» varía',
    CO.normalizeComposition({ baseVariation: 'variar' }).baseVariation === 'variar'
    && CO.normalizeComposition({ baseVariation: 'x' }).baseVariation === 'fiel'
    && CO.normalizeComposition({}).baseVariation === 'fiel');
const conVariacion = CO.buildBackdropPrompt({
    composition: { enabled: true, baseVariation: 'variar' },
    plan: CO.planById('silueta_inferior'), photo: { url: 'x' }, hasBase: true,
});
// Variar NO es rediseñar: lo fijo se AFIRMA — estructura, banda y el lado de
// los globos — y lo que se suelta es la textura y los globos mismos.
check('variar afirma lo que NO cambia: banda y globos a la derecha',
    /balloons living along the right edge/i.test(conVariacion.prompt)
    && /same stationery family/i.test(conVariacion.prompt));
check('y suelta la textura y los globos',
    /vary the texture curves/i.test(conVariacion.prompt));
check('fiel sigue pidiendo reproducir sin cambios',
    /reproduce it unchanged/i.test(CO.buildBackdropPrompt({
        composition: { enabled: true }, plan: CO.planById('silueta_inferior'), photo: { url: 'x' }, hasBase: true,
    }).prompt));
check('la plantilla de aniversario declara medio + variar',
    templateById('aniversario_foto').composition.photo.width === 'medio'
    && templateById('aniversario_foto').composition.baseVariation === 'variar');
check('el óvalo con brillo sigue en el repertorio, para quien lo elija',
    /white glow/i.test(CO.planById('foto_ovalo_brillo').photo));

// 2. EL LIENZO VUELVE INTACTO. «Conservá sus colores» sonaba suficiente y no lo
//    era: el modelo devolvía el fondo aclarado y la curva redibujada.
const conBase = CO.buildBackdropPrompt({
    composition: { enabled: true }, plan: CO.planById('foto_recorte_curvo'),
    photo: { url: 'https://x/f.jpg' }, hasBase: true,
});
check('el prompt pide REPRODUCIR el lienzo sin cambios',
    /reproduce it unchanged/i.test(conBase.prompt));
check('y lo dice también en negativo, que es lo que falló',
    /do not restyle it|do not shift its palette/i.test(conBase.prompt));
check('y afirma que lo ÚNICO que se agrega es la fotografía',
    /only thing added is the photograph/i.test(conBase.prompt));
// 3. EL TAMAÑO. Sin decirlo salía una miniatura con marco flotando en el medio.
check('la forma de la fotografía se pide GRANDE, y lo dice el PLAN',
    /substantial part of the layout/i.test(conBase.prompt)
    && /substantial part of the layout/i.test(CO.planById('foto_recorte_curvo').photo));
check('la cláusula común describe cómo se integra, no qué forma tiene',
    !/rounded shape/.test(CO.buildBackdropPrompt({
        composition: { enabled: true }, plan: { photo: 'X', clear: 'Y' },
        photo: { url: 'x' }, hasBase: true,
    }).prompt.split('The photograph')[0].split('The second image')[1] || ''));
check('y se dice que no va en un marco',
    /instead of sitting in a frame/i.test(conBase.prompt));
check('lo que salió mal entra en el prompt negativo, no en el positivo',
    /framed inset|thumbnail|photo border/.test(CO.NEGATIVE_PROMPT)
    && !/framed inset/.test(conBase.prompt));

// 4. LOS MOTIVOS de la ocasión. Una pieza de aniversario no se ve como una de
//    condolencias, y eso no lo resuelve el estilo genérico.
const conMotivos = CO.buildBackdropPrompt({
    composition: { enabled: true, motifs: 'A light scatter of fine confetti in the empty corners.' },
    plan: CO.VARIANT_PLANS[0], photo: { url: 'https://x/f.jpg' }, hasBase: true,
});
check('los motivos entran en el prompt', /fine confetti/i.test(conMotivos.prompt));
check('la plantilla de aniversario trae los suyos',
    /confetti/i.test(templateById('aniversario_foto').composition.motifs));
check('y van acotados: un motivo sin acotar se come la pieza',
    templateById('aniversario_foto').composition.motifs.length <= CO.MOTIF_MAX_CHARS
    && /never over the people/i.test(templateById('aniversario_foto').composition.motifs));
check('sin motivos declarados no se inventa ninguno',
    !/confetti|balloon/i.test(CO.buildBackdropPrompt({
        composition: { enabled: true }, plan: CO.VARIANT_PLANS[0], photo: { url: 'https://x/f.jpg' },
    }).prompt));

// El ORDEN DE SACRIFICIO. La dirección de arte del administrador se cae la
// última; los motivos importan y pesan menos que su criterio.
const promptCola = CO.buildBackdropPrompt({
    composition: {
        enabled: true,
        masterPrompt: 'M'.repeat(900),
        motifs: 'C'.repeat(240),
    },
    plan: CO.VARIANT_PLANS[0], photo: { url: 'https://x/f.jpg' }, hasBase: true,
    palette: { primary: '#17458F', accent: '#F7A81B' },
});
check('al recortar se va primero el estilo y la paleta',
    promptCola.dropped[0] === 'estilo' && promptCola.dropped[1] === 'paleta', JSON.stringify(promptCola.dropped));
check('después los motivos, y el prompt maestro se conserva',
    promptCola.dropped.includes('motivos de la ocasión') && !promptCola.dropped.includes('prompt maestro'),
    JSON.stringify(promptCola.dropped));
check('lo que sostiene la composición nunca se recorta',
    /reproduce it unchanged/i.test(promptCola.prompt)
    && /exactly the people in the photograph/i.test(promptCola.prompt));
check('y el prompt entra en el presupuesto', promptCola.prompt.length <= CO.PROMPT_MAX_CHARS, String(promptCola.prompt.length));

// `edgeCrop` ya no es sólo un parámetro del guard: lo declara la plantilla.
check('la plantilla declara qué hacer con el recorte del borde',
    CO.normalizeComposition({ photo: { edgeCrop: 'strict' } }).photo.edgeCrop === 'strict');
check('y por defecto se permite, que es lo que hace que componer sirva',
    CO.normalizeComposition({}).photo.edgeCrop === 'allow');
check('una configuración vieja, sin `photo`, se completa sola',
    CO.normalizeComposition({ enabled: true }).photo.plan === 'auto'
    && CO.normalizeComposition({ enabled: true }).photo.strategy === 'compose');

grupo('El lienzo institucional se DIBUJA');

// Lo reportado: la imagen base se elegía en el panel de Composición y no
// aparecía en ninguna parte. Era sólo un dato que viajaba al modelo, así que el
// administrador colocaba el texto a ciegas y la pieza salía sin ese fondo.
const docLienzo = S.normalizeDocument({
    nodes: [
        { type: 'image', id: 'foto', srcVar: 'imagen', src: 'https://x.amazonaws.com/f.jpg', x: 0, y: 0, w: 1, h: 0.47 },
        { type: 'text', id: 'titulo', text: '¡Felices 49 años!', x: 0.1, y: 0.6, w: 0.8, h: 0.1 },
    ],
});
const conLienzo = CO.withBase(docLienzo, 'https://x.amazonaws.com/lienzo.png');
check('la imagen base entra como nodo del documento',
    conLienzo.nodes.some(n => n.role === CO.BASE_ROLE));
check('al pie de la pila, para que todo se dibuje encima',
    conLienzo.nodes[0].role === CO.BASE_ROLE);
check('y bloqueado: es la papelería, no una capa que se arrastra',
    conLienzo.nodes[0].locked === true);
check('a sangre completa', conLienzo.nodes[0].w === 1 && conLienzo.nodes[0].h === 1);

// La distinción que importa: el LIENZO no es el FONDO GENERADO. Confundirlos
// apagaría el hueco de la fotografía apenas se elige una imagen base, y quien
// abre el enlace público subiría su foto y no la vería.
check('el lienzo NO apaga la fotografía',
    conLienzo.nodes.find(n => n.id === 'foto')?.hidden !== true);
check('cambiar la imagen base no acumula lienzos',
    CO.withBase(conLienzo, 'https://x.amazonaws.com/otro.png').nodes.filter(n => n.role === CO.BASE_ROLE).length === 1);
check('quitarla devuelve la pieza a como estaba',
    !CO.hasBase(CO.withBase(conLienzo, null)) && CO.withBase(conLienzo, null).nodes.length === docLienzo.nodes.length);

// El fondo generado SÍ apaga la fotografía —ya está dentro de la imagen— y va
// ENCIMA del lienzo: al pie del todo quedaría tapado por el propio lienzo.
const compuesto = CO.withBackdrop(conLienzo, 'https://x.amazonaws.com/ia.png');
check('el fondo generado va encima del lienzo, no debajo',
    compuesto.nodes[0].role === CO.BASE_ROLE && compuesto.nodes[1].role === CO.BACKDROP_ROLE);
check('y apaga el nodo de la fotografía',
    compuesto.nodes.find(n => n.id === 'foto')?.hidden === true);
check('el texto se sigue dibujando encima',
    compuesto.nodes.some(n => n.id === 'titulo' && !n.hidden));
check('componer dos veces reemplaza, no acumula',
    CO.withBackdrop(compuesto, 'https://x.amazonaws.com/ia2.png').nodes.filter(n => n.role === CO.BACKDROP_ROLE).length === 1);
check('quitar el fondo devuelve la fotografía',
    CO.withoutBackdrop(compuesto).nodes.find(n => n.id === 'foto')?.hidden === false);
check('y conserva el lienzo institucional', CO.hasBase(CO.withoutBackdrop(compuesto)));

// Sin lienzo, el fondo generado sigue yendo al pie: es el caso de una plantilla
// que compone sin imagen base.
check('sin lienzo, el fondo generado va al pie',
    CO.withBackdrop(docLienzo, 'https://x.amazonaws.com/ia.png').nodes[0].role === CO.BACKDROP_ROLE);

// ── La fotografía que se FUNDE no ocupa un recuadro ────────────────────
//
// Lo reportado: «aparece la mitad Sin imagen… la idea no es que la plantilla
// tenga estos espacios vacíos, la idea es que la fotografía se combine con la
// imagen de base». Con la composición encendida el hueco de la fotografía es
// una DECLARACIÓN de campo, no un elemento de la maquetación: el modelo mete la
// foto dentro del lienzo y decide dónde queda. Dibujar el hueco enseñaba un
// tablero gris ocupando media pieza y prometía un sitio que la foto no iba a
// ocupar.
const docVacio = S.normalizeDocument({
    nodes: [
        { type: 'image', id: 'foto', srcVar: 'imagen', src: null, dropIfEmpty: true, x: 0, y: 0, w: 1, h: 0.47 },
        { type: 'image', id: 'logo', srcVar: 'logo', src: null, dropIfEmpty: true, x: 0.07, y: 0.05, w: 0.28, h: 0.1 },
        { type: 'text', id: 'titulo', text: '¡Felices 49 años!', x: 0.1, y: 0.6, w: 0.8, h: 0.1 },
    ],
});
check('con la composición encendida, la fotografía es el nodo fundido',
    CO.fusedPhotoId(docVacio, { enabled: true }) === 'foto');
check('apagada, no se funde nada',
    CO.fusedPhotoId(docVacio, { enabled: false }) === null
    && CO.fusedPhotoId(docVacio, null) === null);
// Con un fondo ya generado manda `withBackdrop`, que apagó el nodo en el
// documento. Dos mecanismos para lo mismo se contradirían al cambiar uno.
check('con el fondo ya compuesto no hace falta: el documento ya lo apagó',
    CO.fusedPhotoId(CO.withBackdrop(docVacio, 'https://x/ia.png'), { enabled: true }) === null);
check('un diseño sin fotografía no funde nada',
    CO.fusedPhotoId(S.normalizeDocument({ nodes: [{ type: 'text', id: 't', text: 'X', x: 0, y: 0, w: 1, h: 0.1 }] }), { enabled: true }) === null);
// La distinción que decide si el respaldo del módulo funciona: con una
// fotografía PUESTA y todavía sin fondo generado, esa foto en su recuadro es lo
// que se entrega si componer falla o si el control de preservación descarta la
// composición («se usó tu fotografía tal como la subiste, dentro del diseño»).
// Ocultarla ahí dejaría la pieza sin la foto y sin nada que lo explicara.
check('una fotografía YA PUESTA se sigue dibujando: es el respaldo declarado',
    CO.fusedPhotoId(docLienzo, { enabled: true }) === null);
check('sólo se funde el hueco VACÍO',
    CO.fusedPhotoId(docVacio, { enabled: true }) === 'foto');
// Se reconoce por la clave o por el rol: una plantilla puede llamar `portada` a
// su fotografía. Misma condición que usa `withBackdrop`.
check('la fotografía se reconoce también por su rol',
    CO.fusedPhotoId(S.normalizeDocument({ nodes: [{ type: 'image', id: 'p', role: 'foto', srcVar: 'portada', x: 0, y: 0, w: 1, h: 0.4 }] }), { enabled: true }) === 'p');

// Y lo que decide QUÉ SE DIBUJA sigue siendo `visibleNodes`, en un solo sitio:
// la vista previa del editor, la exportación y el portal llaman a la misma
// función, que es lo que sostiene que lo que se ve sea el archivo.
const editor = S.visibleNodes(docVacio.nodes, { slots: true }).map(n => n.id);
const fundido = S.visibleNodes(docVacio.nodes, { slots: true, fusedId: 'foto' }).map(n => n.id);
check('en el editor, sin composición, el hueco se ve para poder llenarlo',
    editor.includes('foto'));
check('con la composición encendida NO se dibuja, ni siquiera en el editor',
    !fundido.includes('foto'));
check('el resto de la pieza se sigue dibujando',
    fundido.includes('logo') && fundido.includes('titulo'));
check('sin `fusedId` no cambia nada',
    JSON.stringify(S.visibleNodes(docVacio.nodes, { slots: true, fusedId: null }).map(n => n.id)) === JSON.stringify(editor));
// El nodo sigue EN el documento: es lo que declara el campo del formulario
// público. Si desapareciera, nadie podría subir la fotografía.
check('el nodo no se borra del documento, sólo no se pinta',
    docVacio.nodes.some(n => n.id === 'foto'));

grupo('La composición sabe dónde va a caer el texto');

// Lo pedido: que la fotografía quede COMBINADA con el lienzo, como una pieza de
// papelería y no como una foto encajada. Parte de eso es el prompt; la otra
// parte es que el modelo compone A CIEGAS —no sabe que encima vamos a imprimir
// el nombre del club y el mensaje—, así que una composición podía salir
// preciosa y quedar inservible, con las caras justo debajo del título.
const docTextoAbajo = S.normalizeDocument({
    nodes: [
        { type: 'image', id: 'foto', srcVar: 'imagen', x: 0, y: 0, w: 1, h: 0.47 },
        { type: 'text', id: 'saludo', text: 'Al Club X', x: 0.075, y: 0.535, w: 0.85, h: 0.095 },
        { type: 'text', id: 'mensaje', text: 'Hola', x: 0.10, y: 0.725, w: 0.80, h: 0.115 },
    ],
});
const bandaAbajo = CO.textBandOf(docTextoAbajo);
check('la franja del texto sale de los nodos reales',
    bandaAbajo && Math.abs(bandaAbajo.y - 0.535) < 0.001 && Math.abs(bandaAbajo.h - 0.305) < 0.001,
    JSON.stringify(bandaAbajo));
check('el logotipo cuenta como texto: también se imprime encima',
    CO.textBandOf(S.normalizeDocument({ nodes: [{ type: 'image', id: 'logo', srcVar: 'logo', x: 0.07, y: 0.05, w: 0.28, h: 0.1 }] }))?.y === 0.05);
check('un nodo apagado no reserva sitio',
    CO.textBandOf(S.normalizeDocument({ nodes: [{ type: 'text', id: 't', text: 'x', hidden: true, x: 0, y: 0.9, w: 1, h: 0.05 }] })) === null);
check('un documento sin texto no inventa una franja', CO.textBandOf({ nodes: [] }) === null);

check('la franja se dice en palabras, no en coordenadas',
    /lower third/.test(CO.clearClauseFor(bandaAbajo) || ''), CO.clearClauseFor(bandaAbajo));
check('y dice POR QUÉ tiene que quedar tranquila',
    /name and message are printed/.test(CO.clearClauseFor(bandaAbajo) || ''));
check('sin franja no se inventa la cláusula', CO.clearClauseFor(null) === null);

// Con una sola variante tiene que salir la que le sirve a ESTA pieza, no la
// primera de la lista.
const unoAbajo = CO.plansFor(1, docTextoAbajo);
check('con una variante se elige el plan que respeta esa franja',
    unoAbajo.length === 1 && unoAbajo[0].textZone.y >= 0.4, unoAbajo[0]?.id);
const docTextoArriba = S.normalizeDocument({
    nodes: [
        { type: 'text', id: 't', text: 'Al Club X', x: 0.1, y: 0.05, w: 0.8, h: 0.2 },
        { type: 'image', id: 'foto', srcVar: 'imagen', x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
});
check('con el texto arriba se elige otro plan',
    CO.plansFor(1, docTextoArriba)[0].id !== unoAbajo[0].id,
    `${CO.plansFor(1, docTextoArriba)[0].id} vs ${unoAbajo[0].id}`);
check('sin documento se conserva el orden declarado',
    CO.plansFor(2)[0].id === CO.VARIANT_PLANS[0].id && CO.plansFor(2)[1].id === CO.VARIANT_PLANS[1].id);
// Determinista: quien regenera espera una alternativa, no un sorteo.
check('el orden es estable entre llamadas',
    JSON.stringify(CO.plansFor(3, docTextoAbajo).map(p => p.id)) === JSON.stringify(CO.plansFor(3, docTextoAbajo).map(p => p.id)));
check('nunca se piden más planes que variantes', CO.plansFor(2, docTextoAbajo).length === 2);

// El prompt lo lleva, y sigue cabiendo en el presupuesto del modelo.
const conDoc = CO.buildBackdropPrompt({
    composition: { enabled: true, baseImageUrl: 'https://x/base.png', style: 'institucional' },
    plan: CO.VARIANT_PLANS[0], photo: { url: 'https://x/f.jpg' }, hasBase: true, document: docTextoAbajo,
});
check('el prompt lleva la franja del documento', /name and message are printed/.test(conDoc.prompt));
check('y describe CÓMO se integra, no sólo que se integre',
    /easing into the surface/.test(conDoc.prompt) && /read as a single designed piece/.test(conDoc.prompt));
check('el prompt entra en el presupuesto del modelo',
    conDoc.prompt.length <= CO.PROMPT_MAX_CHARS && !conDoc.dropped.length,
    `${conDoc.prompt.length} de ${CO.PROMPT_MAX_CHARS}`);
// El peor caso: con prompt maestro largo se recorta por el final y se DICE.
const maestroLargo = CO.buildBackdropPrompt({
    composition: { enabled: true, baseImageUrl: 'https://x/base.png', masterPrompt: 'x'.repeat(1200) },
    plan: CO.VARIANT_PLANS[0], photo: { url: 'https://x/f.jpg' }, hasBase: true, document: docTextoAbajo,
});
check('con un prompt maestro largo se recorta y se anota',
    maestroLargo.prompt.length <= CO.PROMPT_MAX_CHARS && maestroLargo.dropped.includes('prompt maestro'));
check('pero la franja del texto NO se sacrifica',
    /name and message are printed/.test(maestroLargo.prompt));
check('sin documento el prompt sigue armándose igual',
    CO.buildBackdropPrompt({ composition: { enabled: true }, plan: CO.VARIANT_PLANS[0], photo: { url: 'https://x/f.jpg' } }).prompt.length > 0);

grupo('El lienzo y el fondo: el espejo del navegador dice lo mismo');

const casosDoc = [docLienzo, conLienzo, compuesto];
check('los roles son los mismos',
    CC.BASE_ROLE === CO.BASE_ROLE && CC.BACKDROP_ROLE === CO.BACKDROP_ROLE);
check('poner el lienzo da lo mismo en los dos lados',
    casosDoc.every(d => JSON.stringify(CC.withBase(d, 'https://x.amazonaws.com/l.png')) === JSON.stringify(CO.withBase(d, 'https://x.amazonaws.com/l.png'))));
check('quitarlo también',
    casosDoc.every(d => JSON.stringify(CC.withBase(d, null)) === JSON.stringify(CO.withBase(d, null))));
check('poner el fondo generado da lo mismo',
    casosDoc.every(d => JSON.stringify(CC.withBackdrop(d, 'https://x.amazonaws.com/i.png')) === JSON.stringify(CO.withBackdrop(d, 'https://x.amazonaws.com/i.png'))));
check('quitarlo también',
    casosDoc.every(d => JSON.stringify(CC.withoutBackdrop(d)) === JSON.stringify(CO.withoutBackdrop(d))));
check('y las dos comprobaciones de presencia',
    casosDoc.every(d => CC.hasBase(d) === CO.hasBase(d) && CC.hasBackdrop(d) === CO.hasBackdrop(d)));

// Quién es el nodo que se funde lo deciden las DOS puntas: el editor para no
// pintar el hueco y el portal público para no pintar su guía. Si se separan,
// una de las dos pantallas vuelve a mostrar media pieza vacía.
check('el nodo que se funde es el mismo en los dos lados',
    [docVacio, ...casosDoc].every(d =>
        [{ enabled: true }, { enabled: false }, null].every(c =>
            CC.fusedPhotoId(d, c) === CO.fusedPhotoId(d, c))));
check('y el nodo de la fotografía se reconoce igual',
    [docVacio, ...casosDoc].every(d => (CC.photoNodeOf(d)?.id || null) === (CO.photoNodeOf(d)?.id || null)));
// `visibleNodes` es lo que sostiene que lo que se ve sea el archivo: si los dos
// espejos filtraran distinto, la vista previa dejaría de ser lo que se descarga.
check('y `visibleNodes` filtra igual con el nodo fundido',
    [docVacio, ...casosDoc].every(d =>
        [true, false].every(slots =>
            JSON.stringify(C.visibleNodes(d.nodes, { slots, fusedId: 'foto' }).map(n => n.id))
            === JSON.stringify(S.visibleNodes(d.nodes, { slots, fusedId: 'foto' }).map(n => n.id)))));

grupo('Campos vinculados: el hueco de CADA campo');

const fmt1080 = { w: 1080, h: 1080 };
const docHuecos = { nodes: [
    { type: 'image', id: 'foto', srcVar: 'imagen', x: 0, y: 0, w: 1, h: 0.47, fit: 'cover' },
    { type: 'image', id: 'logo', srcVar: 'logo', x: 0.068, y: 0.055, w: 0.28, h: 0.096, fit: 'contain' },
] };
const huecoLogo = PH.slotFor(docHuecos, 'logo', fmt1080.w, fmt1080.h);
const huecoFoto = PH.slotFor(docHuecos, 'imagen', fmt1080.w, fmt1080.h);
// El defecto de fondo: el portal resolvía SIEMPRE el hueco de la fotografía, así
// que un escudo se adaptaba a 1080×508 con recorte. Ahora sale del nodo que
// consume esa clave.
check('el hueco del logotipo es el del nodo del logotipo',
    huecoLogo.width === 302 && huecoLogo.height === 104, JSON.stringify(huecoLogo));
check('y no el de la fotografía', huecoFoto.width === 1080 && huecoFoto.height === 508);
check('cada uno trae su encuadre', huecoLogo.fit === 'contain' && huecoFoto.fit === 'cover');
check('una clave sin nodo no inventa un hueco', PH.slotFor(docHuecos, 'sello', 1080, 1080) === null);
check('photoSlotOf sigue devolviendo el de la fotografía',
    PH.photoSlotOf(docHuecos, 1080, 1080).nodeId === 'foto');

grupo('Campos vinculados: el plan del logotipo no recorta');

const planL = PH.planLogo({ width: 800, height: 300, targetWidth: 302, targetHeight: 104 });
// Un logotipo entra ENTERO por definición: no hay banda que se pierda, por
// desproporcionado que sea respecto de su recuadro.
check('un logotipo apaisado entra entero igual', planL.action === 'keep' && planL.keptFraction === 1);
check('y no se avisa de ningún recorte', planL.notes.every(n => !/recort/i.test(n.consequence)));
const planChico = PH.planLogo({ width: 90, height: 30, targetWidth: 604, targetHeight: 208 });
check('un logotipo diminuto SÍ se avisa', planChico.notes.some(n => /borroso/.test(n.consequence)));
check('y se dice dónde conseguir uno mejor', planChico.notes.some(n => /Brand Center/.test(n.consequence)));
// La fotografía conserva su propio criterio: ahí el recorte sí existe y hay que
// decirlo.
check('la fotografía sigue avisando del recorte cuando es grande',
    PH.planPhoto({ width: 3000, height: 600, targetWidth: 1080, targetHeight: 508 }).notes.some(n => /recort/i.test(n.consequence)));
check('y sigue diciendo que recorta, no que conserva',
    PH.planPhoto({ width: 3000, height: 600, targetWidth: 1080, targetHeight: 508 }).action === 'crop');

grupo('Campos vinculados: las plantillas del catálogo los declaran');

const tplFoto = templateById('aniversario_foto');
const nodoLogo = tplFoto.nodes.find(n => n.id === 'logo');
check('la plantilla de aniversario declara su logotipo', nodoLogo.field?.kind === 'logo');
check('y su fotografía como fotografía',
    tplFoto.nodes.find(n => n.id === 'foto').field?.kind === 'foto');
const compiladoCampos = S.compileTemplate({
    template: tplFoto, variables: { anios: '49' }, branding: { clubName: 'X' }, keepSlots: true,
});
// Es lo que hace que el formulario público salga completo desde el catálogo,
// sin que nadie marque nada a mano.
check('la declaración sobrevive a compilar la plantilla',
    compiladoCampos.nodes.find(n => n.id === 'logo').field?.kind === 'logo');
const camposTpl = P.buildPublicFields({ nodes: compiladoCampos.nodes });
check('el formulario derivado NO trae el logotipo: la plantilla lo apagó',
    !camposTpl.find(f => f.key === 'logo'));
// Sus reglas siguen vivas para cualquier plantilla que lo encienda.
const conLogoVivo = compiladoCampos.nodes.map(n => n.id === 'logo' ? { ...n, field: { ...(n.field || {}), visible: true } } : n);
check('y encendido vuelve con sus reglas de logotipo',
    P.buildPublicFields({ nodes: conLogoVivo }).find(f => f.key === 'logo')?.image?.crop === false);
check('y la fotografía con las suyas',
    camposTpl.find(f => f.key === 'imagen')?.image?.crop === true);

grupo('Cabecera: el recuadro de referencia del logotipo');

// El bloque «Cabecera» del Generador de Pendones, traído al panel. Lo que se
// prueba es la parte con criterio: que el tamaño tenga UNA sola verdad.
const nodoLogo2 = S.normalizeNode({
    type: 'image', id: 'logo', srcVar: 'logo',
    x: 0.068, y: 0.055, w: 0.28, h: 0.096,
    field: { kind: 'logo' },
});
// El recuadro de la plantilla se guarda al normalizar: es la constante que
// responde «¿el 100 % de qué?». Sin ella, el control de tamaño tendría que
// inventarse una referencia en cada montaje.
check('el recuadro de referencia sale de la propia declaración',
    nodoLogo2.field.image.frame.w === 0.28 && nodoLogo2.field.image.frame.x === 0.068);
check('recién declarado, está al 100 %', F.frameScaleOf(nodoLogo2) === 1);

// La escala se DERIVA del ancho actual: no se guarda, justamente para que no
// pueda contradecir al nodo cuando alguien lo arrastra o lo redimensiona.
const agrandado = { ...nodoLogo2, ...F.scaledBox(nodoLogo2, 2) };
check('al doble, el ancho es el doble del recuadro', Math.abs(agrandado.w - 0.56) < 1e-9);
check('y la escala derivada lo dice', Math.abs(F.frameScaleOf(agrandado) - 2) < 1e-9);
check('la proporción del recuadro se conserva',
    Math.abs((agrandado.w / agrandado.h) - (0.28 / 0.096)) < 1e-9);
// Desde el CENTRO: agrandar un logotipo colocado a ojo no puede moverlo de
// sitio, o cada ajuste de tamaño obligaría a recolocarlo.
check('crece desde el centro, no desde la esquina',
    Math.abs((agrandado.x + agrandado.w / 2) - (nodoLogo2.x + nodoLogo2.w / 2)) < 1e-9
    && Math.abs((agrandado.y + agrandado.h / 2) - (nodoLogo2.y + nodoLogo2.h / 2)) < 1e-9);
check('escalar dos veces seguidas es estable',
    Math.abs(F.frameScaleOf({ ...agrandado, ...F.scaledBox(agrandado, 0.5) }) - 0.5) < 1e-9);
check('la escala se acota', F.scaledBox(nodoLogo2, 999).w <= 0.28 * 4 + 1e-9);

// Mover NO cambia el tamaño, y por eso la escala no se toca: son dos ejes
// distintos y confundirlos es lo que produce el «se me movió al agrandarlo».
const movido = { ...nodoLogo2, x: 0.6, y: 0.4 };
check('mover no cambia la escala', F.frameScaleOf(movido) === 1);

const vuelto = F.resetBox(agrandado);
check('restablecer devuelve al recuadro de la plantilla',
    vuelto.x === 0.068 && vuelto.y === 0.055 && vuelto.w === 0.28 && vuelto.h === 0.096);
check('un nodo sin recuadro no inventa uno', F.resetBox({ x: 0, y: 0, w: 1, h: 1 }) === null);
check('y su escala es 1, no un error', F.frameScaleOf({ x: 0, y: 0, w: 1, h: 1 }) === 1);

// El recuadro sobrevive a guardar: `normalizeNode` reconstruye el nodo, así que
// lo que no se enumere se pierde en silencio.
const reNormalizado = S.normalizeNode({ ...agrandado });
check('el recuadro sobrevive a guardar y volver a normalizar',
    reNormalizado.field.image.frame.w === 0.28,
    JSON.stringify(reNormalizado.field?.image?.frame));
check('y la escala guardada se sigue derivando igual',
    Math.abs(F.frameScaleOf(reNormalizado) - 2) < 1e-9);

// Las plantillas del catálogo lo traen puesto sin escribir nada.
const logoTpl = S.compileTemplate({
    template: templateById('aniversario_foto'), variables: {}, branding: {}, keepSlots: true,
}).nodes.find(n => n.id === 'logo');
check('la plantilla de aniversario trae su recuadro de referencia',
    logoTpl.field?.image?.frame?.w === 0.28);

grupo('Campos vinculados: el espejo del navegador dice lo mismo');

// Duplicado a propósito —el servidor decide qué acepta, el navegador qué
// pinta—, así que lo que hay que comprobar es que las FUNCIONES coincidan.
check('las clases de campo son las mismas',
    JSON.stringify(Object.keys(F.FIELD_KINDS)) === JSON.stringify(Object.keys(CF.FIELD_KINDS)));
const clavesRaras = ['Presidente Entrante', '2026 sede', 'Ñandú del Valle', '  ', 'a'.repeat(80), 'sede-del-evento'];
check('normalizar un nombre interno da lo mismo en los dos lados',
    clavesRaras.every(k => F.normalizeKey(k) === CF.normalizeKey(k)));
check('validar también',
    clavesRaras.every(k => JSON.stringify(F.validateKey(k)) === JSON.stringify(CF.validateKey(k))));
const nodosRaros = [
    { type: 'image', srcVar: 'logo' }, { type: 'text', srcText: '{{mensaje}}' },
    { type: 'text', srcText: 'Al {{club}}' }, { type: 'shape' },
];
check('leer la clave de un nodo da lo mismo',
    nodosRaros.every(n => F.fieldKeyOf(n) === CF.fieldKeyOf(n)));
check('la clase por defecto también',
    ['logo', 'imagen', 'mensaje', 'sede'].every(k =>
        F.defaultKindFor(k, 'text') === CF.defaultKindFor(k, 'text')
        && F.defaultKindFor(k, 'image') === CF.defaultKindFor(k, 'image')));
check('y las reglas de imagen de cada clase',
    Object.keys(F.FIELD_KINDS).filter(k => F.isImageKind(k)).every(k =>
        JSON.stringify(F.FIELD_KINDS[k].image) === JSON.stringify(CF.FIELD_KINDS[k].image)));
check('un campo recién marcado nace visible y con las reglas de su clase',
    CF.newField('logo', 'image').visible === true && CF.newField('logo', 'image').image.crop === false);
const casosFrame = [
    { x: 0.068, y: 0.055, w: 0.28, h: 0.096, field: { image: { frame: { x: 0.068, y: 0.055, w: 0.28, h: 0.096 } } } },
    { x: 0.5, y: 0.5, w: 0.1, h: 0.4, field: { image: { frame: { x: 0.2, y: 0.2, w: 0.2, h: 0.2 } } } },
    { x: 0, y: 0, w: 1, h: 1 },
];
check('la escala del recuadro se deriva igual en los dos lados',
    casosFrame.every(n => F.frameScaleOf(n) === CF.frameScaleOf(n)));
check('el recuadro escalado también',
    casosFrame.every(n => [0.5, 1, 2.5, 99].every(sc =>
        JSON.stringify(F.scaledBox(n, sc)) === JSON.stringify(CF.scaledBox(n, sc)))));
check('y restablecer devuelve lo mismo',
    casosFrame.every(n => JSON.stringify(F.resetBox(n)) === JSON.stringify(CF.resetBox(n))));

// ════════════════════════════════════════════════════════════════════
grupo('El listado de diseños no depende de los enlaces públicos');
// ════════════════════════════════════════════════════════════════════
//
// Lo reportado: «no cargan los diseños ya guardados». El listado se leía con un
// LEFT JOIN contra `DesignPublicTemplate`, así que cualquier problema con esa
// tabla —una columna que falte en una instalación vieja, un permiso— tiraba la
// consulta entera y el panel se quedaba sin NINGÚN diseño.
//
// El enlace público es un dato ACCESORIO de la ficha; los diseños son lo que la
// pantalla existe para mostrar. Misma regla que la procedencia de un clon en el
// Ecosistema: toda lectura accesoria degrada, nunca revienta. Se comprueba
// leyendo el archivo porque es una consulta: no hay función que llamar sin base.
const ctrl = readFileSync('server/controllers/designStudioController.js', 'utf8');
const listado = ctrl.slice(ctrl.indexOf('export const listProjects'), ctrl.indexOf('export const saveProject'));

check('el listado NO une con la tabla de publicaciones',
    !/JOIN\s+"DesignPublicTemplate"/i.test(listado));
check('los diseños se leen de su propia tabla',
    /FROM\s+"DesignProject"/.test(listado));
check('los enlaces se leen aparte y su fallo se atrapa',
    /"DesignPublicTemplate"/.test(listado) && /catch/.test(listado));
check('el aislamiento por sitio sigue en el WHERE',
    /WHERE "clubId" IS NOT DISTINCT FROM \$1/.test(listado));

// La Composición con IA se guardaba desde v4.735 y no se leía de vuelta: al
// reabrir un diseño salía apagada y sin imagen base, y volver a guardar la
// apagaba también en el enlace público.
const fila = ctrl.slice(ctrl.indexOf('const rowToProject'), ctrl.indexOf('// ── GET /api/design-studio/projects'));
check('la ficha devuelve la composición guardada', /composition:\s*r\.composition/.test(fila));

// Esta columna estaba SÓLO en el CREATE TABLE: una instalación cuya tabla ya
// existiera no la habría recibido nunca, y es por la que se busca la
// publicación de un diseño.
const ensure = readFileSync('server/lib/ensureDesignSchema.js', 'utf8');
check('`projectId` tiene su ALTER aditivo',
    /ADD COLUMN IF NOT EXISTS "projectId"/.test(ensure));
check('y está en la comprobación rápida, o el ALTER no correría nunca',
    /column_name = 'projectId'/.test(ensure));

grupo('El mensaje y la frase de cierre VARÍAN por generación (v4.773)');

// Lo reportado el 11/8: la pieza salía sin título, sin mensaje y con la frase
// dorada siempre igual. El título ya varía con el club ({{club}}); lo que
// faltaba era que el CIERRE fuera una variable escrita por el modelo.
check('`cierre` es una variable del catálogo', 'cierre' in S.VARIABLES);
check('y un campo del formulario público, escrito por la IA',
    P.FIELD_SPECS.cierre?.ai === true && P.FIELD_SPECS.cierre?.type === 'text');

const nodoCierre = templateById('aniversario_foto').nodes.find(n => n.id === 'cierre');
check('el cierre del aniversario es un marcador, no un texto fijo',
    nodoCierre?.text === '{{cierre}}');
// El respaldo es lo que garantiza que la línea dorada NUNCA falte: si el
// modelo no responde, sale la fórmula clásica. Sin `defaultValue`, un fallo
// del proveedor dejaría la pieza sin remate.
check('con la fórmula clásica de respaldo: la línea nunca falta',
    /Gracias por marcar la diferencia/.test(nodoCierre?.field?.defaultValue || ''));

// El pool de respaldo del servidor: variado de verdad y dentro del recuadro.
check('el respaldo del cierre es un pool con variedad real',
    CIERRE_FALLBACKS.length >= 3 && new Set(CIERRE_FALLBACKS).size === CIERRE_FALLBACKS.length);
check('y cada frase del pool cabe en su recuadro',
    CIERRE_FALLBACKS.every(f => f.length <= CIERRE_MAX_CHARS));

// La variedad tiene MECANISMO, no deseo: un ángulo distinto por generación.
// Pedirle al modelo «sé variado» no es una instrucción; darle un enfoque
// distinto cada vez sí — el mismo criterio que los MUSIC_STYLES de Reels.
check('la variedad tiene mecanismo: ángulos de enfoque distintos',
    MESSAGE_ANGLES.length >= 4 && new Set(MESSAGE_ANGLES).size === MESSAGE_ANGLES.length);

// El campo derivado viaja con su valor por defecto hasta el portal: es de
// donde el formulario arranca ya completo.
check('el campo derivado lleva el valor por defecto',
    /Gracias por marcar la diferencia/.test(P.buildPublicFields(docPub).find(f => f.key === 'cierre')?.defaultValue || ''));

// El portal REESCRIBE los textos de IA en cada generación —es lo que hace que
// varíen— pero nunca por encima de lo escrito a mano. Es una conducta del
// navegador y desde acá sólo se puede leer el archivo: la marca `tocados` y el
// modo `soloNoTocados` tienen que estar en el flujo de generar.
const portal = readFileSync('src/pages/PlantillaPublica.tsx', 'utf8');
check('generar reescribe los textos de IA que nadie tocó',
    /soloNoTocados:\s*true/.test(portal) && /camposIA\.some\(f => !tocados\.has\(f\.key\)\)/.test(portal));
check('lo escrito a mano se marca y no se pisa',
    /setManual/.test(portal) && /tocados\.has\(k\)/.test(portal));
check('regenerar manda la pieza anterior para no repetirla',
    /previous: values\.mensaje/.test(portal));

grupo('El club se ELIGE de la lista del distrito (v4.775)');

// El pedido del 11/8: el mismo listado que Postular Proyecto, en un `select`.
// La lista es COMPLETA —un buscador truncado esconde a los del final del
// alfabeto— y ordenada; y sigue sin cerrar el valor.
const lista4281 = PC.districtClubs('4281');
check('la lista del 4281 llega completa', lista4281.length === CLUBS_4281.length,
    `${lista4281.length} de ${CLUBS_4281.length}`);
check('ordenada alfabéticamente, con tildes normalizadas',
    lista4281.every((c, i) => i === 0 || PC.norm(lista4281[i - 1].name).localeCompare(PC.norm(c.name)) <= 0));
check('cada entrada trae el nombre para IMPRIMIR', lista4281.every(c => c.display && c.display !== c.name || /^(Club Rotario|Rotary)/.test(c.display)));
check('el distrito se reconoce con adornos', PC.districtClubs('Distrito 4281').length === lista4281.length);
check('sin distrito no hay lista', PC.districtClubs('').length === 0);

// El título imprime los años y el nombre: los dos marcadores viven en el nodo.
const tituloFoto = templateById('aniversario_foto').nodes.find(n => n.id === 'titulo');
check('el título imprime los años y el club',
    /\{\{anios\}\}/.test(tituloFoto.text) && /\{\{club\}\}/.test(tituloFoto.text));
// Y por eso los años son OBLIGATORIOS: un marcador sin valor deja el saludo
// mocho. El número lo afirma quien genera —llega calculado al elegir el club
// y queda editable—, así que no se contradice con «no afirmar un aniversario
// que no se verificó».
check('los años son obligatorios en el formulario público',
    P.FIELD_SPECS.anios?.required === true);
check('y la plantilla los declara entre lo que exige',
    templateById('aniversario_foto').requires.includes('anios'));
// El portal degrada: sin distrito en la publicación o sin catálogo, queda el
// buscador de texto — misma regla que el DistrictPicker.
check('el desplegable ofrece la salida «no está en la lista»',
    /Mi club no está en la lista/.test(portal) && /Volver a la lista/.test(portal));
check('y sin lista el campo degrada al buscador de texto',
    /clubOptions && !clubManual/.test(portal));

// La FUNDACIÓN acompaña a los años en el portal (v4.777): se escribe la fecha
// y los años se calculan en vivo, con el criterio ESPEJADO del servidor. Si
// cambia un espejo, cambiar el otro.
check('la fundación se parsea igual en los dos espejos',
    ['1974', '1974-08-04', '04/08/1974', 'Fundado en 1974', '', 'sin fecha']
        .every(v => JSON.stringify(S.parseFoundation(v)) === JSON.stringify(C.parseFoundation(v))));
check('y los años que cumple dan lo mismo',
    [1974, 2026, 1800, 2100].every(y =>
        S.yearsSince(y, new Date('2026-08-11')) === C.yearsSince(y, new Date('2026-08-11'))));
check('el portal lleva el par fundación + años',
    /Fundación del club/.test(portal) && /parseFoundation/.test(portal));

grupo('Un marcador visible ES una declaración (v4.776)');

// El caso real (11/8): la pieza pública imprimía «¡Feliz aniversario,
// {{club}}!» LITERAL y el formulario no ofrecía la casilla. El nodo había
// quedado desligado (`srcText: null`) con el marcador dentro del texto, y los
// campos guardados se derivaron de ese documento. Dos cierres:
// (1) normalizar SANA: texto con marcador y sin fuente → el texto es la fuente;
check('normalizar re-liga un texto que conserva su marcador',
    S.normalizeDocument({ nodes: [{ type: 'text', text: '¡Feliz aniversario, {{club}}!', srcText: null }] })
        .nodes[0].srcText === '¡Feliz aniversario, {{club}}!');
check('un texto editado a mano SIN marcadores sigue desligado',
    S.normalizeDocument({ nodes: [{ type: 'text', text: 'Un saludo fijo', srcText: null }] })
        .nodes[0].srcText === null);
// (2) la fila publicada se DERIVA de nuevo al servirla.
const filaRota = {
    document: {
        format: 'post_1_1', background: '#fff',
        nodes: [
            { id: 'titulo', type: 'text', text: '¡Feliz aniversario, {{club}}!', srcText: null },
            { id: 'foto', type: 'image', src: null, srcVar: 'imagen' },
        ],
    },
    fields: [{ key: 'imagen', type: 'image', kind: 'foto', label: 'Fotografía del club', sample: 'https://ok.amazonaws.com/e.png' }],
    frozen: {}, settings: {},
};
const sanada = P.derivePublicRow(filaRota);
check('la fila desalineada recupera su casilla del club',
    sanada.fields.some(f => f.key === 'club'), sanada.fields.map(f => f.key).join(','));
// El sanado encadena con la migración de v4.778: el texto re-ligado es el del
// catálogo viejo, así que además se actualiza a la redacción vigente.
check('y el documento servido vuelve a declarar la variable',
    sanada.nodes === undefined && /\{\{club\}\}/.test(sanada.document.nodes[0].srcText));
check('los ejemplos guardados se conservan al derivar',
    sanada.fields.find(f => f.key === 'imagen')?.sample === 'https://ok.amazonaws.com/e.png');
// Los ajustes se deducen ANTES de sanar: el marcador recién re-ligado no puede
// leerse como «no salió de campo, luego estaba bloqueado».
check('el marcador sanado no se toma por bloqueado',
    !P.settingsForRefresh(filaRota).locked.includes('club'),
    P.settingsForRefresh(filaRota).locked.join(','));

// La MIGRACIÓN por procedencia (v4.778). El caso real, cuatro publicaciones
// seguidas: la plantilla del catálogo cambió su título para llevar los años y
// cada enlace publicado siguió con la redacción vieja — sin `{{anios}}` no se
// deriva el campo y el par fundación + años no aparecía por ninguna vía. Un
// texto que sigue siendo PALABRA POR PALABRA el del catálogo viejo no tiene
// trabajo del usuario adentro y se actualiza al servirse; uno editado a mano
// no coincide con ninguna clave y no se toca.
const filaVieja = {
    document: {
        format: 'post_1_1', background: '#fff',
        nodes: [
            { id: 'titulo', type: 'text', text: '¡Feliz aniversario, Club X!', srcText: '¡Feliz aniversario,\n{{club}}!' },
            { id: 'foto', type: 'image', src: null, srcVar: 'imagen' },
        ],
    },
    fields: [
        { key: 'club', type: 'text', label: 'Nombre del club' },
        { key: 'imagen', type: 'image', kind: 'foto', label: 'Fotografía del club' },
    ],
    frozen: {}, settings: {},
};
const migrada = P.derivePublicRow(filaVieja);
check('la redacción del catálogo viejo se migra a la vigente',
    /aniversario número \{\{anios\}\}/.test(migrada.document.nodes[0].srcText),
    migrada.document.nodes[0].srcText);
check('y con ella aparece el campo de los años, obligatorio',
    migrada.fields.some(f => f.key === 'anios' && f.required),
    migrada.fields.map(f => f.key).join(','));
check('un título editado a mano NO se migra',
    P.derivePublicRow({
        ...filaVieja,
        document: {
            ...filaVieja.document,
            nodes: [{ id: 'titulo', type: 'text', text: 'x', srcText: 'Nuestro saludo, {{club}}' }, filaVieja.document.nodes[1]],
        },
    }).document.nodes[0].srcText === 'Nuestro saludo, {{club}}');

// ── El tamaño que se ve es el que sale (v4.779) ───────────────────────
//
// El defecto reportado: el administrador agranda el título en el editor y el
// portal público lo sirve chico. No es un dato que se pierda: es `autoFit`
// haciendo su trabajo sobre el texto REAL —largo—, mientras el editor
// previsualizaba con las variables vacías —texto corto— y además con la
// redacción vieja del catálogo (la migración sólo corría al servir el
// enlace). Dos pantallas, dos textos, dos tamaños.
grupo('El tamaño que se ve es el que sale (v4.779)');

// El mecanismo, demostrado con el nodo del título del catálogo: el texto
// corto del editor sin datos cabe al tamaño configurado; el resuelto con un
// club de nombre largo baja hasta el piso. Es la diferencia que el usuario
// fotografió.
const tituloCat = TEMPLATES[0].nodes.find(n => n.id === 'titulo');
// Medida realista (~0,5 em por carácter, como una sans a peso 800); la de 0,1
// em del resto del arnés daría por caber lo que en un navegador no cabe.
const mReal = fakeMeasure(50);
const caja = { boxW: tituloCat.w * 1080, boxH: tituloCat.h * 1080, fontSize: 0.05 * 1080, minFontSize: tituloCat.minFontSize * 1080, measure: mReal };
const corto = S.layoutText({ ...caja, text: '¡Feliz aniversario, !' });
const real = S.layoutText({ ...caja, text: '¡Feliz aniversario número 30,\nClub Rotario Villa de Leyva y el Alto Ricaurte!' });
check('el texto corto de un editor sin datos no encoge', corto.fontSize === caja.fontSize, String(corto.fontSize));
check('el título real de un club largo se encoge para caber', real.fontSize <= caja.fontSize * 0.8, String(real.fontSize));

// Por eso el editor tiene que previsualizar con el texto que el público va a
// ver: la redacción vigente (migrada también al LEER el diseño) y datos de
// ejemplo cuando el panel aún no los tiene.
check('rowToProject migra la redacción al leer el diseño',
    /document:\s*r\.document\s*\?\s*migrateTemplateTexts\(r\.document\)/.test(ctrl));
const studio = readFileSync('src/components/admin/design-studio/DesignStudio.tsx', 'utf8');
check('la vista previa del editor rellena con datos de ejemplo',
    /PREVIEW_SAMPLES/.test(studio) && /club:\s*rawVars\.club\s*\|\|\s*PREVIEW_SAMPLES\.club/.test(studio));
const sampleClub = studio.match(/club:\s*'([^']+)'/)?.[1] || '';
check('el club de ejemplo es LARGO (el caso que encoge) y se declara ejemplo',
    sampleClub.length >= 30 && /Ejemplo/.test(sampleClub), sampleClub);
check('lo que se GUARDA es lo crudo, nunca el ejemplo',
    /variables:\s*rawVars/.test(studio) && !/variables:\s*liveVars/.test(studio));
check('y con el ejemplo a la vista, se dice',
    /previewConEjemplo/.test(studio) && /datos de ejemplo/.test(studio));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    malos.forEach(f => console.log(`   · ${f}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
