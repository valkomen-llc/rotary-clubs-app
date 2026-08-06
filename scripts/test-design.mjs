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
import * as P from '../server/lib/designPublish.js';
import * as PH from '../server/lib/designPhoto.js';
import * as CO from '../server/lib/designCompose.js';
import * as F from '../server/lib/designFields.js';

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
check('el resto de la pieza sí', pintados.includes('saludo') && pintados.includes('pie_azul'));
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
    ['club', 'anios', 'mensaje', 'imagen', 'logo', 'gobernador', 'distrito', 'periodo']
        .every(v => P.variablesOf(docPub).includes(v)),
    P.variablesOf(docPub).join(','));

const campos = P.buildPublicFields(docPub);
// Los cuatro datos que pidió el cliente, en el mismo orden en que se completan
// en el Generador de Pendones: logotipo, nombre, años y fotografía.
check('el formulario ofrece exactamente lo editable',
    campos.map(f => f.key).join(',') === 'logo,club,anios,mensaje,imagen',
    campos.map(f => f.key).join(','));
check('cada campo trae su tipo',
    campos.find(f => f.key === 'mensaje')?.type === 'textarea'
    && campos.find(f => f.key === 'imagen')?.type === 'image'
    && campos.find(f => f.key === 'logo')?.type === 'image'
    && campos.find(f => f.key === 'anios')?.type === 'number');
check('el mensaje se marca como asistible por IA', campos.find(f => f.key === 'mensaje')?.ai === true);
check('el nombre del club es obligatorio', campos.find(f => f.key === 'club')?.required === true);
check('los campos salen en un orden estable', campos[0].key === 'logo');

// El logotipo es del CLUB que cumple años, no del Distrito: es un campo
// público, como en el Generador de Pendones. La firma del Distrito es el pie.
check('el logotipo SÍ es un campo público', campos.some(f => f.key === 'logo'));
check('y no está marcado como institucional', !P.isInstitutional('logo'));

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
check('deja los años en dígitos', san.values.anios === '49');
check('acepta el logotipo del club', san.values.logo === 'https://ok.s3.amazonaws.com/escudo.png');
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
check('lo que llena el público SIGUE siendo un marcador', /\{\{\s*anios\s*\}\}/.test(tituloH.srcText || ''), String(tituloH.srcText));
check('y el nodo del saludo también', /\{\{\s*club\s*\}\}/.test(horneado.nodes.find(n => n.id === 'saludo')?.srcText || ''));

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
check('la publicación trae su formulario derivado', publicacion.fields.length === 5, String(publicacion.fields.length));
check('y congela lo institucional con su valor',
    publicacion.frozen.gobernador === 'Fabio' && publicacion.frozen.distrito === '4281');
check('no congela lo que el público SÍ llena', !('club' in publicacion.frozen) && !('mensaje' in publicacion.frozen));
check('y el logotipo tampoco queda congelado: lo sube cada club',
    !('logo' in publicacion.frozen), JSON.stringify(Object.keys(publicacion.frozen)));

// El escudo con el que el administrador DISEÑÓ no puede viajar dentro de la
// plantilla publicada: cada club que abra el enlace vería el de otro.
const conEjemplo = {
    ...docPub,
    nodes: docPub.nodes.map(n => n.id === 'logo' ? { ...n, src: 'https://ok.s3.amazonaws.com/escudo-del-admin.png' } : n),
};
const limpio = P.buildPublication({ document: conEjemplo, name: 'Aniversario', slug: 'aniversario-2' });
check('el documento publicado sale sin el valor de ejemplo del panel',
    limpio.document.nodes.find(n => n.id === 'logo')?.src === null,
    String(limpio.document.nodes.find(n => n.id === 'logo')?.src));
check('pero el nodo sigue atado a su variable',
    limpio.document.nodes.find(n => n.id === 'logo')?.srcVar === 'logo');
check('y un campo BLOQUEADO conserva el suyo, porque lo congela la publicación',
    P.stripPublicDefaults(conEjemplo, P.buildPublicFields(conEjemplo, { locked: ['logo'] }))
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

check('hay cuatro planes de variante y no se repiten',
    CO.VARIANT_PLANS.length === 4 && new Set(CO.VARIANT_PLANS.map(p => p.id)).size === 4);
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
check('pide que no se pierda a nadie de la foto', /everyone in the photograph/i.test(pr.prompt));
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
check('y el formulario derivado trae el logotipo con sus reglas',
    camposTpl.find(f => f.key === 'logo')?.image?.crop === false);
check('y la fotografía con las suyas',
    camposTpl.find(f => f.key === 'imagen')?.image?.crop === true);

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

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    malos.forEach(f => console.log(`   · ${f}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
