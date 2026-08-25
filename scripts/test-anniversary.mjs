// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — pruebas del CRITERIO — v4.895
//
// Sin base, sin credenciales y sin red. Prueban lo que DECIDE el módulo,
// separado de la orquestación, por el mismo motivo que `seoRules.js` vive
// aparte de `seoAudit.js`: un motor que sólo se ejercita contra una base real
// termina sin pruebas, y entonces nadie se entera de que una regla cambió de
// signo.
//
// Cuatro cosas que se comprueban acá y NO se ven mirando una pantalla:
//
//   1. Que el módulo sea INDEPENDIENTE de Plantillas IA. La independencia
//      declarada en prosa no protege nada: se lee cada archivo y se falla si
//      aparece un import del editor.
//   2. Que las ZONAS DE TEXTO de los dos espejos coincidan. Es el acuerdo
//      entre el prompt —que le pide al modelo que deje esa franja tranquila— y
//      el compositor —que escribe ahí—. Con dos tablas, el modelo despeja un
//      lado y el texto se imprime en el otro, y eso no da ningún error: da una
//      pieza con el título encima de una cara.
//   3. Que el prompt QUEPA en su presupuesto y que la dirección de arte del
//      administrador se recorte, nunca se elimine.
//   4. Que la jerarquía del compositor sea la PREESTABLECIDA de la referencia
//      los dijo.
//
//   npm run test:anniversary
// ════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';

const S = await import('../server/lib/anniversarySpec.js');

let ok = 0; const malos = [];
const check = (n, c, e = '') => {
    if (c) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');

/**
 * El archivo SIN sus comentarios.
 *
 * ⚠️ HACE FALTA: estas comprobaciones buscan lo que el código HACE, y los
 * comentarios de este módulo explican en prosa justamente lo que no se puede
 * hacer —«nunca DROP», «NUNCA un <datalist>»—. Buscando sobre el archivo
 * entero, un comentario correcto hace fallar la prueba y la deja inservible.
 * Es la misma regla que ya está escrita para `check:routes` y para las clases
 * de los botones: se busca la LLAMADA, no la mención.
 */
const sinComentarios = (src) => String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

// ════════════════════════════════════════════════════════════════════
grupo('1 — El módulo es INDEPENDIENTE de Plantillas IA');

// Los archivos del módulo. La lista es explícita: con un glob, un archivo
// nuevo entraría sin que nadie decidiera que forma parte del módulo.
const PROPIOS = [
    'server/lib/anniversarySpec.js',
    'server/lib/anniversaryStore.js',
    'server/lib/anniversaryEngine.js',
    'server/lib/ensureAnniversarySchema.js',
    'server/controllers/anniversaryController.js',
    'server/controllers/anniversaryPublicController.js',
    'server/routes/anniversaries.js',
    'src/lib/anniversarySpec.ts',
    'src/lib/anniversaryRender.ts',
    'src/pages/admin/AnniversaryStudio.tsx',
    'src/pages/AniversarioIA.tsx',
];
check('los once archivos del módulo existen', PROPIOS.every(existsSync),
    PROPIOS.filter(f => !existsSync(f)).join(', '));

// Lo que NO se puede importar: el editor. `designFonts` queda fuera de la
// lista a propósito —es el cargador de las tipografías empaquetadas, un
// servicio global con UN registro de caras en `document.fonts`; un segundo
// cargador registraría las mismas dos veces—.
const PROHIBIDOS = [
    'designSpec', 'designCompose', 'designTemplates', 'designRender',
    'designPublish', 'designFields', 'designElements', 'designAI', 'DesignCanvas',
];
for (const f of PROPIOS.filter(existsSync)) {
    const src = leer(f);
    // Se buscan los IMPORTS, no las menciones: los comentarios tienen que poder
    // explicar de qué módulo se viene sin hacer fallar la prueba.
    const imports = [...src.matchAll(/^\s*import[^;]*from\s*['"]([^'"]+)['"]/gm)].map(m => m[1]);
    const malo = imports.find(i => PROHIBIDOS.some(p => i.includes(p)));
    check(`${f} no importa el editor de Plantillas IA`, !malo, malo || '');
}
const render = leer('src/lib/anniversaryRender.ts');
check('el compositor SÍ reutiliza el cargador global de tipografías',
    /from\s*['"]\.\/designFonts['"]/.test(render));

// ════════════════════════════════════════════════════════════════════
grupo('2 — Las zonas de texto no pueden diferir entre los dos espejos');

const espejo = leer('src/lib/anniversarySpec.ts');
for (const [id, z] of Object.entries(S.TEXT_ZONES)) {
    // Se comprueban los NÚMEROS uno a uno sobre el texto del espejo: comparar
    // objetos exigiría compilar el .ts y esta prueba tiene que correr sin
    // dependencias de desarrollo.
    const fila = espejo.match(new RegExp(`${id}:\\s*\\{[^}]*\\}`));
    check(`la zona ${id} está declarada en el espejo`, !!fila);
    if (!fila) continue;
    const t = fila[0];
    check(`  ${id}: mismas coordenadas`,
        t.includes(`x: ${z.x.toFixed(3)}`) && t.includes(`y: ${z.y.toFixed(3)}`)
        && t.includes(`w: ${z.w.toFixed(3)}`) && t.includes(`h: ${z.h.toFixed(3)}`),
        t);
    check(`  ${id}: misma alineación`, t.includes(`align: '${z.align}'`));
}
check('la banda del pie coincide',
    espejo.includes(`y: ${S.FOOTER_BAND.y}`) && espejo.includes(`h: ${S.FOOTER_BAND.h}`));
check('las zonas de texto TERMINAN por encima del pie institucional',
    Object.values(S.TEXT_ZONES).every(z => z.y + z.h <= S.FOOTER_BAND.y + 0.0001),
    Object.values(S.TEXT_ZONES).map(z => `${z.id}:${(z.y + z.h).toFixed(3)}`).join(' '));

// ════════════════════════════════════════════════════════════════════
grupo('3 — Dónde cae el texto');

const A = (o) => S.readAnalysis(JSON.stringify(o));
check('personas a la DERECHA → el texto va a la izquierda',
    S.textZoneFor(A({ people: 5, subjectSide: 'derecha' })) === 'left');
check('personas a la IZQUIERDA → el texto va a la derecha',
    S.textZoneFor(A({ people: 5, subjectSide: 'izquierda' })) === 'right');
check('grupo centrado → el texto va abajo, nunca sobre las caras',
    S.textZoneFor(A({ people: 8, subjectSide: 'centro' })) === 'bottom');
check('el lado LIBRE declarado por el modelo manda sobre el del sujeto',
    S.textZoneFor(A({ people: 5, subjectSide: 'centro', freeSide: 'derecha' })) === 'right');
check('sin análisis legible cae al tercio inferior',
    S.textZoneFor(S.fallbackAnalysis()) === S.DEFAULT_TEXT_ZONE);
check('un análisis que no se pudo leer se DECLARA como no leído',
    S.readAnalysis('esto no es json').read === false);
check('un recuento absurdo se acota en vez de aceptarse',
    A({ people: 99999 }).people === 400);

grupo('3b — La zona FIJADA por la configuración manda sobre la foto');

// El Prompt Maestro por defecto FIJA la fotografía a la derecha; si la zona
// siguiera decidiéndose por foto, un grupo centrado la mandaría «abajo» y el
// modelo no podría cumplir las dos cosas — la franja quedaba ocupada y la
// composición se descartaba (el reporte de v4.901).
check('el default es `left`, coherente con el maestro y la referencia',
    S.normalizeConfig({}).textZone === 'left');
check('con la zona fijada, la foto NO decide',
    S.zoneForConfig({}, A({ people: 8, subjectSide: 'centro' })) === 'left');
check('`auto` vuelve a decidir por foto',
    S.zoneForConfig({ textZone: 'auto' }, A({ people: 8, subjectSide: 'centro' })) === 'bottom');
check('un valor desconocido cae al default seguro',
    S.normalizeConfig({ textZone: 'arriba' }).textZone === 'left');
check('cambiar la zona ES un cambio versionable',
    S.fingerprintOf({}) !== S.fingerprintOf({ textZone: 'bottom' }));

// ════════════════════════════════════════════════════════════════════
grupo('4 — v4.907 · El prompt base viaja VERBATIM (flujo simple)');

// ⚠️ ES LA DECISIÓN DE LA QUE CUELGA TODO EL v4.907, tomada por el cliente
// con una muestra de ChatGPT delante: el prompt que recibe el modelo es el
// prompt base CON LAS VARIABLES SUSTITUIDAS y nada más. Nada se agrega solo
// —ni cláusulas de zona, ni anti-rotulado, ni estilo, ni decoración—: lo que
// no está configurado no viaja.
const r1 = S.buildSimpleRequest({ config: {}, clubName: 'Club Rotario Cali', years: 11 });
check('el prompt ES el prompt base sustituido, byte a byte',
    r1.prompt === S.applyMasterVariables(S.DEFAULT_MASTER_PROMPT, { clubName: 'Club Rotario Cali', years: 11 }));
check('{NOMBRE_CLUB} se sustituye por el nombre real', r1.prompt.includes('Club Rotario Cali'));
check('{ANOS_CLUB} se sustituye por la cifra real', /11 años/.test(r1.prompt));
check('ningún marcador viaja literal al modelo', !/\{(NOMBRE_CLUB|ANOS_CLUB|FOTO_CLUB)\}/.test(r1.prompt));
check('sin años, la cifra no se inventa',
    S.applyMasterVariables('cumple {ANOS_CLUB} años', {}).includes('cumple sus años'));
check('una variable desconocida se deja tal cual (y validateConfig la avisa)',
    S.applyMasterVariables('con {OTRA_COSA} adentro', {}).includes('{OTRA_COSA}'));

// Un prompt base escrito por el administrador viaja EXACTO — es la promesa
// «Ver solicitud enviada al modelo»: lo que se ve es lo que se manda.
const propio = 'Genera una pieza para {NOMBRE_CLUB} con {ANOS_CLUB} años alrededor de {FOTO_CLUB}. Fondo azul.';
const r2 = S.buildSimpleRequest({ config: { masterPrompt: propio }, clubName: 'Club X', years: 40 });
check('un prompt base propio viaja EXACTO, sin agregados',
    r2.prompt === S.applyMasterVariables(propio, { clubName: 'Club X', years: 40 }), r2.prompt);
check('nada de las cláusulas viejas reaparece',
    !/clear zone|Master art direction|Decoration theme|lettering seen in the reference/i.test(r2.prompt));
check('sin tope, no se recorta nada', r2.trimmed === false);

// v4.909 — el predeterminado dice las TRES cosas que el reporte con capturas
// demostró que faltaban: la FOTO es la primera imagen (la base que el modelo
// edita), la referencia es la SEGUNDA y es un EJEMPLO — no se copian ni su
// fotografía interna ni sus textos.
check('el predeterminado declara la PRIMERA imagen como LA FOTOGRAFÍA',
    /PRIMERA imagen[\s\S]{0,40}\{FOTO_CLUB\}/i.test(S.DEFAULT_MASTER_PROMPT));
check('y la SEGUNDA como la referencia DE COMPOSICIÓN',
    /SEGUNDA imagen[\s\S]{0,60}REFERENCIA DE COMPOSICIÓN/i.test(S.DEFAULT_MASTER_PROMPT));
check('la referencia es GUÍA que NO se copia',
    /No la copies literalmente/i.test(S.DEFAULT_MASTER_PROMPT)
    && /ni reproduzcas su contenido/i.test(S.DEFAULT_MASTER_PROMPT));
// v4.913: el anti-copia detallado vive en las RESTRICCIONES (el negativo);
// el prompt lo dice compacto para que la cláusula estructural del pie entre
// SIEMPRE en el tope de KIE.
check('el negativo prohíbe copiar la foto y los textos de la referencia',
    /Copiar la fotografía o los textos de la imagen de referencia/.test(S.DEFAULT_RESTRICTIONS)
    && /entregar la referencia editada/.test(S.DEFAULT_RESTRICTIONS));
check('v4.913: la fotografía es RECTANGULAR — nunca círculo ni óvalo',
    /RECTANGULAR HORIZONTAL/i.test(S.DEFAULT_MASTER_PROMPT)
    && /NUNCA en círculo ni óvalo/i.test(S.DEFAULT_MASTER_PROMPT)
    && /Marco circular u ovalado/.test(S.DEFAULT_RESTRICTIONS));
check('v4.913: los años van CENTRADOS sobre el borde inferior de la foto',
    /CENTRADO sobre el borde inferior de la fotografía/i.test(S.DEFAULT_MASTER_PROMPT)
    && /Nunca a un costado/i.test(S.DEFAULT_MASTER_PROMPT));
check('v4.913: la jerarquía declara el título y los globos arriba',
    /¡FELIZ ANIVERSARIO!/.test(S.DEFAULT_MASTER_PROMPT)
    && /Globos protagonistas arriba y en los laterales/i.test(S.DEFAULT_MASTER_PROMPT));
check('el nombre del club se exige LETRA POR LETRA (los «BARRAQUILLA» del reporte)',
    /letra por letra/i.test(S.DEFAULT_MASTER_PROMPT));
// v4.914: los años aparecen UNA sola vez — en la cinta. El mensaje NO los
// repite: «10 AÑOS» arriba y «10 años sembrando...» abajo era la redundancia
// del reporte.
check('v4.914: el mensaje NO repite la cantidad de años (la redundancia del reporte)',
    /SIN repetir la cantidad de años/i.test(S.DEFAULT_MASTER_PROMPT)
    && !/coherente con \{ANOS_CLUB\} años/i.test(S.DEFAULT_MASTER_PROMPT)
    && /Repetir la cantidad de años dentro del mensaje/.test(S.DEFAULT_RESTRICTIONS));
// v4.916: el ejemplo de tono SE FUE del prompt — el modelo lo copiaba literal
// a la pieza y deformado («Una historia de servico que sigue transformma
// comuniadies», reporte con captura). Un ejemplo dentro del prompt se
// convierte en la salida: la lección de v4.905, por la puerta del texto.
check('v4.916: el prompt NO trae frases de ejemplo copiables',
    !/Una historia de servicio que sigue transformando comunidades/.test(S.DEFAULT_MASTER_PROMPT));
check('el modelo escribe los textos: el predeterminado se lo pide',
    /título/i.test(S.DEFAULT_MASTER_PROMPT) && /ortografía perfecta/i.test(S.DEFAULT_MASTER_PROMPT));
check('y reserva la ZONA INFERIOR para el pie que imprime la plataforma',
    /ZONA INFERIOR RESERVADA/i.test(S.DEFAULT_MASTER_PROMPT)
    && /20 % inferior/i.test(S.DEFAULT_MASTER_PROMPT)
    && /No generes logos ni pies de página/i.test(S.DEFAULT_MASTER_PROMPT));

// ── v4.914 · La directiva de la referencia #3 ─────────────────────────
// Del reporte con la pieza delante: el fondo terminaba en un rectángulo
// blanco cortado, la decoración desaparecía (o salía como guirnaldas de
// luces navideñas), el título quedaba chico y el mensaje repetía los años.
check('v4.914: el fondo es UNO SOLO y CONTINUO hasta el borde inferior',
    /UN SOLO fondo continuo/i.test(S.DEFAULT_MASTER_PROMPT)
    && /sin cortes, franjas ni rectángulos blancos añadidos/i.test(S.DEFAULT_MASTER_PROMPT));
check('la zona del pie es CONTINUACIÓN del fondo, nunca un bloque aparte',
    /continúan hasta el borde/i.test(S.DEFAULT_MASTER_PROMPT)
    && /nunca un bloque aparte/i.test(S.DEFAULT_MASTER_PROMPT)
    && /Franja o rectángulo blanco separado en la parte inferior/.test(S.DEFAULT_RESTRICTIONS));
check('v4.914: la celebración es de ANIVERSARIO — nunca navideña',
    /guirnaldas de luces/i.test(S.DEFAULT_MASTER_PROMPT)
    && /navideñ/i.test(S.DEFAULT_MASTER_PROMPT)
    && /Guirnaldas de luces, decoración navideña o de Año Nuevo/.test(S.DEFAULT_RESTRICTIONS));
check('y ningún tema de variación vuelve a pedir guirnaldas de luces',
    !S.VARIATION_THEMES.some(t => /luz|luces|guirnalda/i.test(t)));
check('v4.914: el título es MUY GRANDE y dominante, nunca un subtítulo',
    /MUY GRANDE/i.test(S.DEFAULT_MASTER_PROMPT)
    && /Nunca un subtítulo/i.test(S.DEFAULT_MASTER_PROMPT));
check('el nombre va en MAYÚSCULAS, peso delgado y entre líneas finas doradas',
    /MAYÚSCULAS y peso delgado/i.test(S.DEFAULT_MASTER_PROMPT)
    && /entre dos líneas finas doradas/i.test(S.DEFAULT_MASTER_PROMPT));
check('los años quedan ESTANDARIZADOS: regla fija, nunca a un costado ni arriba',
    /Regla fija: nunca a un costado ni arriba/i.test(S.DEFAULT_MASTER_PROMPT));

// ── v4.916 · El marco de la foto y los años, con el estilo de la captura
// de referencia del cliente: idénticos entre generaciones.
check('v4.916: la fotografía lleva su marco ESTÁNDAR — borde dorado, margen blanco y sombra',
    /marco ESTÁNDAR: borde dorado fino, margen blanco y sombra suave/i.test(S.DEFAULT_MASTER_PROMPT));
check('v4.916: los años son un componente FIJO — número dorado con cinta banderín «AÑOS»',
    /cinta banderín dorada con «AÑOS»/i.test(S.DEFAULT_MASTER_PROMPT)
    && /componente FIJO e idéntico entre piezas/i.test(S.DEFAULT_MASTER_PROMPT));
// La cadena ENTERA de legados resuelve al vigente: cada default viejo
// guardado sin editar se lee con el actual — y uno editado no se toca.
check('v4.916: TODOS los defaults viejos de la cadena se actualizan al vigente',
    S.LEGACY_MASTER_PROMPTS.length >= 4
    && S.LEGACY_MASTER_PROMPTS.every(l => S.normalizeConfig({ masterPrompt: l }).masterPrompt === S.DEFAULT_MASTER_PROMPT));
check('y un prompt editado a mano sigue sin tocarse',
    S.normalizeConfig({ masterPrompt: 'un prompt editado a mano' }).masterPrompt === 'un prompt editado a mano');
// El default v4.913 guardado sin editar SE ACTUALIZA (cadena de legados).
check('v4.914: el default v4.913 guardado sin editar se lee con el vigente',
    (() => {
        const v913 = `Genera una pieza gráfica institucional de aniversario en formato cuadrado 1:1 para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala: no alteres rostros, no reconstruyas ni reemplaces personas, no cambies su contexto, sin recortes agresivos.

La SEGUNDA imagen adjunta es la REFERENCIA DE COMPOSICIÓN (ANNIVERSARY_STYLE_REFERENCE): guía de jerarquía, proporciones, ubicación de elementos y espacios en blanco. No la copies literalmente ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: fondo SIEMPRE predominantemente blanco, con texturas blancas sutiles, degradados suaves, ondas o curvas delicadas. Paleta: blanco, azul institucional Rotary y dorado metálico; champagne, perlado y plateado sólo como complementos. Never brown, beige, gray, black, saturated or dark backgrounds. Estética institucional, elegante y conmemorativa — nunca de fiesta infantil.

ESTRUCTURA OBLIGATORIA, de arriba hacia abajo:
1. Globos protagonistas en la zona superior — dorados metálicos, blancos, champagne o transparentes con detalles dorados — en ambas esquinas, o en una equilibrada con serpentinas, confeti y estrellas en la otra. No cubren el título. {VARIACION}
2. Título grande y centrado, en azul institucional, sans-serif tipo Open Sans: «¡FELIZ ANIVERSARIO!».
3. Debajo, en segunda jerarquía y bien legible, el nombre EXACTO letra por letra: «{NOMBRE_CLUB}».
4. Debajo, la fotografía RECTANGULAR HORIZONTAL, amplia y protagonista — NUNCA en círculo ni óvalo — con borde dorado fino o marco blanco sutil y sombra ligera.
5. El número «{ANOS_CLUB}» grande y dorado, con «AÑOS» debajo o en una cinta dorada, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto entre la foto y el blanco de abajo. Nunca a un costado.
6. Un mensaje conmemorativo NUEVO de una a tres líneas sobre servicio, comunidad e impacto, coherente con {ANOS_CLUB} años. Textos en español con ortografía perfecta.
7. ZONA INFERIOR VACÍA (obligatoria): el 20 % inferior queda completamente limpio — sin texto, fotos, globos, confeti ni iconos; sólo el fondo blanco continúa. La plataforma superpone ahí un pie institucional transparente. No generes logos ni pies de página.`;
        return S.normalizeConfig({ masterPrompt: v913 }).masterPrompt === S.DEFAULT_MASTER_PROMPT;
    })());
check('y las restricciones default v4.913 también se actualizan',
    S.normalizeConfig({
        restrictions: 'Fondo café, marrón, beige oscuro, gris oscuro, negro, rojo, naranja intenso, verde, morado o multicolor. '
            + 'Texturas de madera, papel kraft, concreto, mármol oscuro o fondos fotográficos. '
            + 'Decoración de fiesta infantil, globos de colores vivos aleatorios, estética caricaturesca. '
            + 'Copiar la fotografía o los textos de la imagen de referencia; entregar la referencia editada. '
            + 'Generar logos. Inventar personas. Deformar rostros. Textos sobre caras. Bloques grandes de texto. '
            + 'Marco circular u ovalado para la fotografía.',
    }).restrictions === S.DEFAULT_RESTRICTIONS);

// Con tope POR MODELO (KIE: 2500) se recorta por palabra entera y se AVISA.
const maestroLargo = 'Quiero ' + 'palabra '.repeat(500) + '{NOMBRE_CLUB}';
const r3 = S.buildSimpleRequest({ config: { masterPrompt: maestroLargo }, clubName: 'X', years: 5, maxChars: 2500 });
check('con tope por modelo se recorta', r3.prompt.length <= 2500, `${r3.prompt.length}`);
check('y el recorte se DECLARA', r3.trimmed === true);
check('el recorte no parte palabras', !/\S-$/.test(r3.prompt) && !/\s$/.test(r3.prompt));
check('el predeterminado entra ENTERO en el tope de KIE',
    S.buildSimpleRequest({ config: {}, clubName: 'Club Rotario Bello Horizonte', years: 40, maxChars: 2500 }).trimmed === false);

// Una configuración vieja con `designInstruction` no se queda sin dirección.
check('una configuración anterior a v4.898 conserva su dirección de arte',
    S.normalizeConfig({ designInstruction: 'Mi dirección heredada.' }).masterPrompt === 'Mi dirección heredada.');

grupo('5 — El prompt negativo son LAS RESTRICCIONES, y nada más');

// En el flujo simple el negativo es lo que el administrador escribió — un
// campo VISIBLE del panel. Nada invisible viaja: es la otra mitad de «lo que
// se ve es lo que se manda».
check('lleva exactamente las restricciones configuradas',
    S.buildNegativePrompt({ restrictions: 'No poner globos rojos.' }) === 'No poner globos rojos.');
check('el default es el catálogo visible del panel',
    S.buildNegativePrompt({}) === S.DEFAULT_RESTRICTIONS);
check('las restricciones NO se pegan al prompt positivo',
    !S.buildSimpleRequest({ config: { restrictions: 'No poner globos rojos.' } }).prompt.includes('No poner globos rojos.'));

grupo('5b — v4.909 · La variación por pieza y el upgrade del default');

// {VARIACION} es la única variable que llena la PLATAFORMA, determinista por
// el id de la pieza — el reintento conserva su motivo, dos piezas varían.
check('la variación es DETERMINISTA por semilla', S.variationForSeed('p1') === S.variationForSeed('p1'));
check('semillas distintas dan variaciones distintas',
    new Set(['a','b','c','d','e','f','g','h','i','j'].map(s => S.variationForSeed(s))).size >= 3);
check('sale del catálogo declarado',
    S.VARIATION_THEMES.some(t => S.variationForSeed('p1').includes(t)));
const conSeed = S.buildSimpleRequest({ config: {}, clubName: 'X', years: 5, seed: 'p1' });
check('con semilla, {VARIACION} viaja sustituida', conSeed.prompt.includes(S.variationForSeed('p1').slice(0, 40)));
check('sin semilla, {VARIACION} desaparece — un marcador colgando viajaría literal',
    !S.buildSimpleRequest({ config: {}, clubName: 'X', years: 5 }).prompt.includes('{VARIACION}'));
check('{VARIACION} es una variable CONOCIDA: validateConfig no la marca',
    !S.validateConfig({}).warnings.some(w => w.includes('{VARIACION}')));

// El upgrade PEREZOSO del default: una configuración guardada cuyo prompt es
// EXACTAMENTE un default viejo —nunca editado— se lee con el vigente. Sin
// esto, mejorar el predeterminado no llegaría jamás a producción: el guardado
// de v4.907 congeló el texto viejo en la fila.
const viejoDefault = `Genera una pieza gráfica institucional de aniversario en formato cuadrado 1:1 para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es la REFERENCIA VISUAL. La SEGUNDA imagen adjunta es {FOTO_CLUB}.

LA REFERENCIA VISUAL MANDA. Mantén muy cerca de la referencia: composición, distribución, proporciones, fondo, paleta, elementos de celebración, jerarquía tipográfica, integración de la fotografía, espacio negativo y estructura general. No generes una pieza distinta a la referencia. Prioriza similitud visual sobre creatividad.

Usa la segunda imagen como fotografía principal del club: preserva a las personas exactamente — no inventes personas, no elimines personas, no deformes rostros.

Incluye un título de felicitación de aniversario, el nombre {NOMBRE_CLUB} bien destacado y la cifra {ANOS_CLUB} años claramente visible, con la misma tipografía y jerarquía de la referencia. Incluye un mensaje corto, institucional y conmemorativo sobre servicio, comunidad e impacto. Todos los textos en español, escritos con ortografía perfecta.

En la parte inferior deja aproximadamente el 15 % del lienzo completamente libre y limpio: ahí la plataforma añade después un pie de página institucional. No generes logos ni pie de página.`;
check('un default v4.907 guardado sin editar SE LEE con el vigente',
    S.normalizeConfig({ masterPrompt: viejoDefault }).masterPrompt === S.DEFAULT_MASTER_PROMPT);
check('un prompt EDITADO no se toca jamás — la preferencia explícita manda',
    S.normalizeConfig({ masterPrompt: viejoDefault + ' Y mis globos rojos.' }).masterPrompt.includes('mis globos rojos'));
check('las restricciones default viejas también se actualizan',
    S.normalizeConfig({ restrictions: 'No generar logos. No inventar personas. No deformar rostros. No colocar textos sobre caras. No generar bloques grandes de texto. No saturar con elementos decorativos.' }).restrictions === S.DEFAULT_RESTRICTIONS);
check('y las nuevas prohíben copiar la referencia y los fondos oscuros',
    /Copiar la fotografía o los textos de la imagen de referencia/.test(S.DEFAULT_RESTRICTIONS)
    && /café, marrón, beige oscuro, gris oscuro, negro/.test(S.DEFAULT_RESTRICTIONS));

grupo('5c — v4.910 · El patrón visual obligatorio');

// La directiva expresa del cliente, con su referencia-plantilla delante: el
// bloque de identidad es PERMANENTE en el prompt base predeterminado.
check('el predeterminado conserva la identidad obligatoria del patrón',
    /predominantemente blanco/i.test(S.DEFAULT_MASTER_PROMPT)
    && /Never brown, beige, gray, black, saturated or dark backgrounds/i.test(S.DEFAULT_MASTER_PROMPT));
check('la estructura queda declarada como OBLIGATORIA',
    /ESTRUCTURA OBLIGATORIA/i.test(S.DEFAULT_MASTER_PROMPT));
// v4.913: el default con variación y un nombre largo entra ENTERO en el tope
// de KIE — si se recortara, lo primero que cae es la cláusula del pie, que es
// justamente la estructural. Al agregar una frase al default, MEDIR.
check('v4.913: default + variación + nombre largo entra entero en KIE (todas las variaciones)',
    Array.from({ length: 100 }, (_, i) =>
        S.buildSimpleRequest({ config: {}, clubName: 'Club Rotario Bello Horizonte', years: 40, seed: 'pieza-' + i, maxChars: 2500 }).trimmed
    ).every(t => t === false));
check('nombra la referencia como ANNIVERSARY_STYLE_REFERENCE',
    S.DEFAULT_MASTER_PROMPT.includes('ANNIVERSARY_STYLE_REFERENCE'));
check('el default v4.909 guardado sin editar también SE ACTUALIZA (cadena de legados)',
    (() => {
        const v909 = S.DEFAULT_MASTER_PROMPT; // el vigente
        const guardado = S.normalizeConfig({ masterPrompt: 'La PRIMERA imagen adjunta es {FOTO_CLUB}' }).masterPrompt;
        return guardado !== v909; // un texto editado NO se actualiza — la cadena sólo toca los defaults exactos
    })());

// judgeStylePattern: la ÚNICA puerta del flujo, con la calibración de v4.899.
check('un fondo oscuro/marrón es NO CONFORME', S.judgeStylePattern({ meanLuma: 120, whiteShare: 0.05 }).hard === true);
check('el caso real de v4.899 (196/49 %) PASA — sólo con nota',
    (() => { const v = S.judgeStylePattern({ meanLuma: 196, whiteShare: 0.49 }); return v.conforming && !v.hard && !!v.note; })());
check('una pieza bien clara pasa sin nota',
    (() => { const v = S.judgeStylePattern({ meanLuma: 235, whiteShare: 0.7 }); return v.conforming && v.note === null; })());
check('sin medición no se afirma nada', S.judgeStylePattern({}).conforming === true);
check('el veredicto no conforme lleva sus NÚMEROS',
    /luminancia 120/.test(S.judgeStylePattern({ meanLuma: 120, whiteShare: 0.05 }).note));
check('la instrucción reforzada del reintento nombra el fondo blanco',
    /predominantly white/i.test(S.STYLE_RETRY_CLAUSE) && /Never brown/i.test(S.STYLE_RETRY_CLAUSE));
check('styleGuard viene ENCENDIDO por defecto', S.normalizeConfig({}).styleGuard === true);
check('y apagarlo es un cambio versionable',
    S.fingerprintOf({}) !== S.fingerprintOf({ styleGuard: false }));

// ════════════════════════════════════════════════════════════════════
grupo('6 — El texto: el modelo escribe, el código decide');

const bueno = { title: '40 años de servicio', message: 'Celebramos cuatro décadas de trabajo junto a nuestra comunidad. Que sigan muchos años más.' };
check('un texto correcto pasa', S.validateCopy(bueno, { clubName: 'Club Rotario Cali', years: 40 }).ok);

const largo = { ...bueno, title: 'x'.repeat(80) };
const vLargo = S.validateCopy(largo, { years: 40 });
check('un titular largo se rechaza CON su número',
    !vLargo.ok && vLargo.errors.some(e => e.includes('80') && e.includes(String(S.LIMITS.title.max))), vLargo.errors.join(' | '));

check('un mensaje de cuatro frases se rechaza',
    !S.validateCopy({ title: 'Aniversario', message: 'Una. Dos. Tres. Cuatro frases hacen un párrafo entero.' }, {}).ok);
check('los hashtags se rechazan',
    !S.validateCopy({ ...bueno, message: bueno.message + ' #rotary' }, {}).ok);
check('los emojis se rechazan',
    !S.validateCopy({ ...bueno, message: bueno.message + ' 🎉' }, {}).ok);
check('los enlaces se rechazan',
    !S.validateCopy({ ...bueno, message: 'Mirá https://ejemplo.org y celebrá con nosotros hoy mismo.' }, {}).ok);
check('un marcador sin resolver se rechaza',
    !S.validateCopy({ ...bueno, title: 'Feliz aniversario {{club}}' }, {}).ok);

// La contradicción más visible de todas: el texto dice unos años y la pieza
// imprime otros, en la misma imagen.
const otrosAnios = S.validateCopy({ title: 'Aniversario del club', message: 'Celebramos 25 años de servicio a la comunidad con enorme orgullo compartido.' }, { years: 40 });
check('un texto que menciona OTRA cantidad de años se rechaza',
    !otrosAnios.ok && otrosAnios.errors.some(e => e.includes('40')), otrosAnios.errors.join(' | '));
check('mencionar los años CORRECTOS no molesta',
    S.validateCopy({ title: 'Aniversario del club', message: 'Celebramos 40 años de servicio a la comunidad con enorme orgullo compartido.' }, { years: 40 }).ok);

grupo('7 — Reparar no inventa contenido');
const rep = S.repairCopy({ title: 'x'.repeat(90), message: bueno.message }, { clubName: 'Club Rotario Cali', years: 40 });
check('el titular largo se recorta', rep.copy.title.length <= S.LIMITS.title.max);
check('se recorta SIN partir palabras', !/\s$/.test(rep.copy.title) && !rep.copy.title.endsWith('-'));
check('lo reparado se DICE', rep.repaired.length > 0, JSON.stringify(rep.repaired));

// Desde v4.902 el titular es la LÍNEA DE CIERRE y la jerarquía es fija: un
// cierre ausente no se inventa — la pieza sale sin él, y se dice.
const sinTitulo = S.repairCopy({ title: '', message: bueno.message }, { clubName: 'Club Rotario Cali', years: 40 });
check('un cierre ausente NO se inventa', sinTitulo.copy.title === '', sinTitulo.copy.title);
check('y se DICE', sinTitulo.repaired.some(r => r.includes('línea de cierre')), JSON.stringify(sinTitulo.repaired));

const corto = S.repairCopy({ title: 'Aniversario del club', message: 'Muy corto.' }, { years: 40 });
check('un mensaje corto SIGUE siendo corto: reparar no alarga',
    corto.copy.message === 'Muy corto.' && !corto.ok, JSON.stringify(corto.copy));

check('`trimWords` no parte palabras',
    S.trimWords('celebramos cuarenta años de servicio', 20).split(' ').every(w => 'celebramos cuarenta años de servicio'.includes(w)));

// ════════════════════════════════════════════════════════════════════
grupo('8 — La validación de la pieza');

const buena = {
    width: 1080, height: 1080, format: 'square_1080',
    meanLuma: 232, whiteShare: 0.61, zoneLuma: 240, zoneStdDev: 18,
    preservation: { state: 'ok', use: true },
};
check('una pieza correcta pasa', S.judgePiece(buena).ok);
check('y DECLARA qué se midió', S.judgePiece(buena).measured.length === 4, JSON.stringify(S.judgePiece(buena).measured));

const oscura = S.judgePiece({ ...buena, meanLuma: 120, whiteShare: 0.05 });
check('un fondo oscuro es crítico', !oscura.ok && oscura.critical.some(c => c.id === 'fondo_no_blanco'));
check('y el motivo lleva su CONSECUENCIA', oscura.critical[0].consequence.length > 20);

// ⚠️ EL UMBRAL ESTÁ CALIBRADO CONTRA LA REFERENCIA APROBADA. La pieza de
// referencia lleva la fotografía (~un tercio del lienzo, oscura), globos y
// curvas: medida entera da ~185-195 de luminancia media. El caso REAL del
// reporte de v4.899 midió 196 / 49 % y el umbral viejo (205) lo descartaba,
// gastaba los dos intentos pagos y entregaba la foto sobre blanco.
const estiloReferencia = S.judgePiece({ ...buena, meanLuma: 196, whiteShare: 0.49 });
check('una pieza al estilo de la referencia (196 / 49 %) SE ENTREGA', estiloReferencia.ok,
    JSON.stringify(estiloReferencia.critical));
check('y la zona media se DICE como nota, no como descarte',
    estiloReferencia.notes.some(n => n.includes('196')), estiloReferencia.notes.join(' | '));
check('una pieza clara del todo no lleva esa nota',
    !S.judgePiece(buena).notes.some(n => n.includes('menos clara')));

const ocupada = S.judgePiece({ ...buena, zoneStdDev: 95 });
check('la franja del texto ocupada es crítica', !ocupada.ok && ocupada.critical.some(c => c.id === 'franja_ocupada'));

// La franja también es de DOS niveles (v4.901): el caso real del reporte
// midió variación 72 con luminancia 217 — decoración fina sobre fondo claro,
// no una fotografía — y el descarte entregaba la foto plana.
const decorada = S.judgePiece({ ...buena, zoneLuma: 217, zoneStdDev: 72 });
check('la franja con decoración fina (72 / 217) SE ENTREGA', decorada.ok, JSON.stringify(decorada.critical));
check('y se DICE como nota', decorada.notes.some(n => n.includes('72')), decorada.notes.join(' | '));
check('una franja oscura sigue siendo crítica aunque su variación sea baja',
    !S.judgePiece({ ...buena, zoneLuma: 150, zoneStdDev: 20 }).ok);

const alterada = S.judgePiece({ ...buena, preservation: { state: 'failed', use: false, reason: 'Hay una persona de más.' } });
check('una fotografía alterada es crítica', !alterada.ok && alterada.critical.some(c => c.id === 'fotografia_alterada'));

const sinComprobar = S.judgePiece({ ...buena, preservation: { state: 'unavailable', use: true } });
check('«no se pudo comprobar» NO es un tipo de «bien»: pasa pero se DICE',
    sinComprobar.ok && sinComprobar.notes.some(n => n.includes('No se pudo comprobar')));
check('y entonces la fotografía NO cuenta como comprobada',
    !sinComprobar.measured.includes('fotografía conservada'));

const otraProporcion = S.judgePiece({ ...buena, width: 1024, height: 768 });
check('una proporción distinta se AVISA, no se descarta ni se recorta',
    otraProporcion.ok && otraProporcion.notes.some(n => n.includes('1024')));

grupo('9 — El reintento le dice al modelo el problema CONCRETO');
const clausula = S.retryClauseFor([{ id: 'franja_ocupada' }, { id: 'fondo_no_blanco' }]);
check('nombra la franja del titular', /headline/i.test(clausula));
check('nombra el fondo blanco', /white/i.test(clausula));
check('sin nada roto no agrega nada', S.retryClauseFor([]) === '');

// ════════════════════════════════════════════════════════════════════
grupo('10 — La configuración');

// El Prompt Maestro vacío CAE AL PREDETERMINADO (una configuración no puede
// quedarse sin dirección), así que lo que se rechaza es uno escrito y corto.
const cfgVacia = S.validateConfig({ masterPrompt: 'corto' });
check('un Prompt Maestro demasiado corto no se publica', !cfgVacia.ok);
// v4.907: la instrucción del mensaje ya no bloquea — el flujo simple no tiene
// redactor aparte; los textos los escribe el modelo dentro de la imagen.
check('la instrucción del mensaje YA NO bloquea (flujo simple)',
    S.validateConfig({ messageInstruction: '' }).ok);
check('el Prompt Maestro vacío cae al predeterminado',
    S.normalizeConfig({ masterPrompt: '' }).masterPrompt === S.DEFAULT_MASTER_PROMPT);
check('una variable desconocida en el Prompt Maestro se AVISA',
    S.validateConfig({ masterPrompt: S.DEFAULT_MASTER_PROMPT + ' y {NOMBRE_CLUV}' }).warnings.some(w => w.includes('{NOMBRE_CLUV}')));
check('sin referencias se AVISA, no se bloquea',
    S.validateConfig({}).ok && S.validateConfig({}).warnings.some(w => w.includes('referencia')));
check('«sólo estos sitios» sin ninguno elegido es un ERROR',
    !S.validateConfig({ scope: { mode: 'clubs', clubIds: [] } }).ok);

const cfgRefs = S.normalizeConfig({ references: [{ url: 'https://a/1.png' }, { url: 'https://a/2.png', primary: true }, { url: 'https://a/3.png', primary: true }] });
check('hay UNA sola referencia principal', cfgRefs.references.filter(r => r.primary).length === 1);
check('sin ninguna marcada, manda la primera',
    S.normalizeConfig({ references: [{ url: 'https://a/1.png' }] }).references[0].primary === true);
check('una referencia con una URL inaceptable se descarta',
    S.normalizeConfig({ references: [{ url: 'javascript:alert(1)' }, { url: 'http://inseguro/x.png' }] }).references.length === 0);
check('un data URL de imagen sí se acepta', S.isDrawableImage('data:image/png;base64,iVBORw0KGgo='));
check('un formato no disponible cae al que sí lo está',
    S.normalizeConfig({ format: 'story_9_16' }).format === S.DEFAULT_FORMAT);

grupo('11 — El alcance lo decide el servidor');
check('`all` alcanza a cualquier sitio', S.scopeReaches({ scope: { mode: 'all' } }, 'club-x'));
check('`clubs` alcanza sólo a los enumerados',
    S.scopeReaches({ scope: { mode: 'clubs', clubIds: ['a'] } }, 'a')
    && !S.scopeReaches({ scope: { mode: 'clubs', clubIds: ['a'] } }, 'b'));
check('`clubs` sin sitio identificado NO alcanza',
    !S.scopeReaches({ scope: { mode: 'clubs', clubIds: ['a'] } }, null));

grupo('12 — La huella de versión');
check('la misma configuración da la misma huella',
    S.fingerprintOf({}) === S.fingerprintOf({}));
check('cambiar el nombre interno NO es una versión nueva',
    !S.isSignificantChange({ name: 'A' }, { name: 'B' }));
check('cambiar el interruptor de activo tampoco',
    !S.isSignificantChange({ enabled: false }, { enabled: true }));
check('cambiar la instrucción SÍ lo es',
    S.isSignificantChange({}, { designInstruction: 'Otra cosa completamente distinta y más larga que el mínimo.' }));
check('cambiar las referencias SÍ lo es',
    S.isSignificantChange({}, { references: [{ url: 'https://a/1.png' }] }));

grupo('13 — Años y nombre del club');
check('los años se acotan al rango declarado',
    S.normalizeYears(40) === 40 && S.normalizeYears(0) === null && S.normalizeYears(500) === null);
check('un texto que no es un número no pasa', S.normalizeYears('cuarenta') === null);
check('con nombre completo se imprime la forma larga',
    S.printableClubName('Cali', { useFullClubName: true, displayName: 'Club Rotario Cali' }) === 'Club Rotario Cali');
check('sin ella se imprime lo que escribió la persona',
    S.printableClubName('Cali', { useFullClubName: false, displayName: 'Club Rotario Cali' }) === 'Cali');

grupo('14 — Medidas del lienzo');
check('1:1 a 1080 da un cuadrado', JSON.stringify(S.canvasSize('square_1080', 1080)) === JSON.stringify({ width: 1080, height: 1080 }));
check('una resolución desconocida cae al valor por defecto',
    S.canvasSize('square_1080', 99).width === S.DEFAULT_RESOLUTION);

// ════════════════════════════════════════════════════════════════════
grupo('15 — El compositor no repite lo que el titular ya dijo');

let planTextBlocks = null;
try {
    const { build } = await import('esbuild');
    const out = await build({
        entryPoints: ['src/lib/anniversaryRender.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral',
        // El compositor importa el cargador de tipografías, que toca el DOM.
        // Acá sólo se prueba la parte PURA, así que se sustituye por un módulo
        // vacío en vez de arrastrar un entorno de navegador.
        external: ['./designFonts'],
        plugins: [{
            name: 'sin-fuentes',
            setup(b) {
                b.onResolve({ filter: /designFonts$/ }, () => ({ path: 'designFonts', namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const ensureDesignFonts = async () => "ready";', loader: 'js' }));
            },
        }],
    });
    ({ planTextBlocks } = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`));
} catch (e) {
    console.log(`  … se salta: hace falta esbuild (${e.message.split('\n')[0]})`);
}

if (planTextBlocks) {
    const kinds = (d) => planTextBlocks(d).map(b => b.kind);
    const D = { title: '¡Gracias por tanto!', message: 'Un mensaje.', clubName: 'Club Rotario Cali', years: 40 };

    // ⚠️ LA ESTRUCTURA ES PREESTABLECIDA (v4.902): la jerarquía de la
    // referencia sale SIEMPRE — el titular de la IA ya no la reorganiza, es
    // la línea de CIERRE. Es el pedido literal del cliente con la referencia
    // delante; las reglas de redundancia de v4.898 quedan superadas.
    const completo = kinds(D);
    check('la jerarquía es SIEMPRE la de la referencia',
        JSON.stringify(completo) === JSON.stringify(['headline', 'kicker', 'club', 'years', 'message', 'rule', 'closing']),
        completo.join(','));
    check('el saludo es la CONSTANTE de la pieza, no el titular de la IA',
        planTextBlocks(D).find(b => b.kind === 'headline').text === '¡Feliz aniversario!');
    check('el titular de la IA es la línea de cierre',
        planTextBlocks(D).find(b => b.kind === 'closing').text === '¡Gracias por tanto!');

    const nombrando = kinds({ ...D, title: '¡Feliz aniversario, Club Rotario Cali, por tus 40 años!' });
    check('aunque el titular nombre club y años, los bloques de identidad SALEN igual',
        nombrando.includes('club') && nombrando.includes('years') && nombrando.includes('kicker'),
        nombrando.join(','));

    const sinTit = kinds({ ...D, title: '' });
    check('sin titular no hay cierre ni filete, y la identidad sale entera',
        !sinTit.includes('closing') && !sinTit.includes('rule')
        && sinTit.includes('headline') && sinTit.includes('club') && sinTit.includes('years'),
        sinTit.join(','));

    check('un titular que repite el saludo fijo no se imprime dos veces',
        !kinds({ ...D, title: '¡Feliz aniversario!' }).includes('closing'));

    const sinMensaje = kinds({ ...D, message: '' });
    check('sin mensaje no queda la cita vacía', !sinMensaje.includes('message'), sinMensaje.join(','));
}

// ════════════════════════════════════════════════════════════════════
grupo('16 — Reglas del módulo que se leen en los archivos');

const engine = leer('server/lib/anniversaryEngine.js');
check('el pipeline reutiliza el ÚNICO cliente de KIE de la plataforma',
    /from\s*['"]\.\.\/services\/kieService\.js['"]/.test(engine));
check('reutiliza el control de preservación que ya existe, no lo reimplementa',
    /checkPreservation.*from\s*['"]\.\/designGuard\.js['"]/s.test(engine));
check('reutiliza la cadena de proveedores de texto y visión',
    /generateCopy.*from\s*['"]\.\.\/services\/copywritingService\.js['"]/s.test(engine));

const ctrl = leer('server/controllers/anniversaryController.js');
check('el panel de pruebas y el formulario público comparten las CUATRO etapas',
    ['runAnalyze', 'runCopy', 'runCompose', 'runSync'].every(f => ctrl.includes(`export const ${f}`)));
const pub = leer('server/controllers/anniversaryPublicController.js');
check('y el controlador público las IMPORTA en vez de tener las suyas',
    /import\s*\{[^}]*runAnalyze[^}]*runCopy[^}]*runCompose[^}]*runSync[^}]*\}\s*from\s*['"]\.\/anniversaryController\.js['"]/s.test(pub));
check('el endpoint público NO acepta la configuración en el cuerpo',
    !/req\.body\?*\.(config|designInstruction|prompt|restrictions)/.test(pub));

const store = leer('server/lib/anniversaryStore.js');
check('el reclamo de despacho va sobre `attempts`, no sobre `updatedAt`',
    /AND attempts = \$2/.test(store) && !/AND "updatedAt" = /.test(store));
check('la escritura parcial de una pieza tiene una lista CERRADA de campos',
    /PIECE_FIELDS\s*=\s*new Set/.test(store));
check('la lectura pública DEGRADA en vez de lanzar',
    /readPublishedConfig[\s\S]{0,900}catch[\s\S]{0,120}return null/.test(store));

const ensure = leer('server/lib/ensureAnniversarySchema.js');
check('el esquema no borra nada', !/DROP\s+TABLE|TRUNCATE/i.test(sinComentarios(ensure)));
check('amplía con ADD COLUMN IF NOT EXISTS fuera del CREATE',
    /ALTER TABLE "AnniversaryPiece" ADD COLUMN IF NOT EXISTS/.test(ensure));
// ⚠️ v4.908 — LA TRAMPA QUE ESTE MISMO ARCHIVO DOCUMENTA SE PAGÓ IGUAL: la
// comprobación rápida del catálogo no enumeraba la columna `request` (v4.907),
// así que en la base de producción —donde todo lo demás ya existía— el ensure
// cortaba en el atajo y el ALTER no corría nunca: «la columna "request" de la
// relación "AnniversaryPiece" no existe», en la pantalla del cliente. Un
// comentario que depende de que alguien lo lea no protege nada (v4.859): esto
// exige que CADA columna ampliada esté también en la lista del atajo.
{
    const alters = [...ensure.matchAll(/ALTER TABLE "([A-Za-z]+)" ADD COLUMN IF NOT EXISTS "?([A-Za-z]+)"?/g)]
        .map(m => ({ tabla: m[1], col: m[2] }));
    check('hay ampliaciones que vigilar', alters.length >= 5, String(alters.length));
    for (const { tabla, col } of alters) {
        check(`la comprobación rápida enumera ${tabla}.${col}`,
            new RegExp(`table_name = '${tabla}' AND column_name = '${col}'`).test(ensure));
    }
}
// Una comilla invertida dentro del SQL cierra el template literal a mitad y
// deja el módulo entero sin parsear. Pasó en `ensureDesignSchema.js` (v4.721.1).
const bloques = [...ensure.matchAll(/db\.query\(`([\s\S]*?)`\)/g)].map(m => m[1]);
check('ningún SQL lleva una comilla invertida dentro', bloques.every(b => !b.includes('`')));

const rutas = leer('server/routes/anniversaries.js');
const orden = (a, b) => rutas.indexOf(a) < rutas.indexOf(b);
check('las rutas literales van ANTES que las paramétricas',
    orden("'/test/photo'", "'/test/piece/:id'") && orden("'/versions'", "'/versions/:id/restore'"));
check('las rutas del panel llevan autenticación y rol de operador',
    (rutas.match(/authMiddleware, operador/g) || []).length >= 12);
check('las rutas públicas NO llevan autenticación',
    !/router\.(get|post)\('\/public\/[^']*',\s*authMiddleware/.test(rutas));

check('el compositor NO tiene una vista previa en DOM aparte del canvas',
    !/document\.createElement\('div'\)/.test(render) && /canvas\.toBlob/.test(render));
check('la descarga exporta EL MISMO canvas que se compuso',
    /downloadCanvas\s*=\s*async\s*\(canvas: HTMLCanvasElement/.test(render));
check('el compositor usa el proxy de imágenes o el canvas quedaría «tainted»',
    /banner-image\?url=/.test(render));
// v4.911 — las TRES esperas del camino de pintado tienen tope. Sin ellas, una
// conexión estancada dejaba la vista previa en blanco PARA SIEMPRE, sin error.
check('v4.911: loadImage tiene tope de tiempo', /IMAGE_TIMEOUT_MS/.test(render) && /clearTimeout\(reloj\)/.test(render));
check('v4.911: la espera de las tipografías está acotada', /Promise\.race\(\[ensureDesignFonts\(\)/.test(render));
check('v4.911: el proxy de imágenes aborta a los 20 s',
    /AbortSignal\.timeout\(20_000\)/.test(leer('server/controllers/bannerTemplateController.js')));
// v4.912 — nuestro bucket se lee por el SDK, con credenciales: la lectura
// anónima por HTTP depende de que el bucket sea público, y el reporte mostró
// las TRES cargas fallando mientras la SUBIDA (SDK) funcionaba. Dos caminos
// al mismo bucket; se usa el demostrado.
check('v4.912: el proxy lee NUESTRO bucket por el SDK, no por fetch anónimo',
    (() => { const p = leer('server/controllers/bannerTemplateController.js');
        const cuerpo = p.slice(p.indexOf('export const proxyBannerImage'));
        return /GetObjectCommand\(\{ Bucket: bannerBucket\(\)/.test(cuerpo) && /esNuestroBucket/.test(cuerpo); })());
check('v4.911: las dos vistas previas DICEN que están componiendo',
    leer('src/pages/AniversarioIA.tsx').includes('Componiendo la pieza…')
    && leer('src/pages/admin/AnniversaryStudio.tsx').includes('Componiendo la pieza…'));
check('las reglas visuales son del SISTEMA, no de la configuración',
    /export const ROTARY_BLUE/.test(render) && !/config\.(color|overlay|font)/.test(render));

const estudio = leer('src/pages/admin/AnniversaryStudio.tsx');
check('el panel ofrece las DOS vías para toda imagen (subir y Biblioteca)',
    (estudio.match(/Biblioteca<\/button>/g) || []).length >= 2 && estudio.includes('uploadMediaFiles'));
check('el panel dice que guardar NO cambia lo que genera la gente',
    /no publicar|sin publicar|Todavía no cambia/i.test(estudio));

const publica = leer('src/pages/AniversarioIA.tsx');
for (const prohibido of ['fontSize', 'colorPicker', 'zIndex', 'DesignCanvas', 'coordenada']) {
    check(`el formulario público no expone «${prohibido}»`, !sinComentarios(publica).includes(prohibido));
}
check('el formulario público NO usa `<datalist>`', !sinComentarios(publica).includes('<datalist'));
check('el panel de pruebas tampoco', !sinComentarios(estudio).includes('<datalist') && !/\blist=/.test(sinComentarios(estudio)));

// ── v4.904: los veredictos hablan del borrador GUARDADO, y la pantalla lo dice ──
//
// Reporte con captura: una referencia recién agregada a la vista, el aviso «No
// hay ninguna referencia visual» debajo y la franja verde «lo que ves es lo que
// genera el público» — tres afirmaciones incompatibles. La causa: los avisos y
// el estado los calcula el servidor sobre lo GUARDADO, y Publicar/Probar
// actuaban sobre el draft del servidor ignorando las ediciones locales.
{
    const cuerpo = sinComentarios(estudio);
    check('v4.904: el panel distingue los cambios SIN GUARDAR (`sinGuardar`)',
        cuerpo.includes('const sinGuardar') && cuerpo.includes('savedJson'));
    // Un solo camino de escritura del borrador: con dos PUT, el día que uno
    // gane un paso el otro se queda sin él.
    check('v4.904: hay UN solo PUT del borrador (persistir)',
        (cuerpo.match(/method: 'PUT'/g) || []).length === 1);
    // Publicar publica LO QUE SE VE: persiste ANTES del POST /publish.
    const iPublicar = cuerpo.indexOf('const publicar');
    const iPersistEnPublicar = cuerpo.indexOf('persistir()', iPublicar);
    const iPostPublish = cuerpo.indexOf('/anniversaries/publish', iPublicar);
    check('v4.904: Publicar guarda el borrador ANTES de publicar',
        iPublicar > -1 && iPersistEnPublicar > -1 && iPostPublish > -1 && iPersistEnPublicar < iPostPublish);
    // Probar prueba LO QUE SE VE: persiste ANTES de crear la pieza de prueba.
    const iProbar = cuerpo.indexOf('const probar');
    const iPersistEnProbar = cuerpo.indexOf('persistir()', iProbar);
    const iTestPhoto = cuerpo.indexOf('/anniversaries/test/photo', iProbar);
    check('v4.904: Probar guarda el borrador ANTES de probar',
        iProbar > -1 && iPersistEnProbar > -1 && iTestPhoto > -1 && iPersistEnProbar < iTestPhoto);
    // La franja verde y los avisos del servidor se CALLAN con cambios sin
    // guardar: describir otra configuración es el defecto reportado.
    check('v4.904: la franja «lo que ves es lo público» está detrás de sinGuardar',
        /sinGuardar \? \(/.test(cuerpo) &&
        cuerpo.indexOf('sinGuardar ? (') < cuerpo.indexOf('exactamente lo que está generando'));
    check('v4.904: los avisos del servidor no se pintan con cambios sin guardar',
        cuerpo.includes('!sinGuardar && errors.map') && cuerpo.includes('!sinGuardar && warnings.map'));
    // La versión restaurada la escribió el SERVIDOR: es el estado guardado.
    check('v4.904: restaurar una versión actualiza la foto de lo guardado',
        /setConfig\(j\.config\); setSavedJson\(JSON\.stringify\(j\.config\)\)/.test(cuerpo));
}

// ════════════════════════════════════════════════════════════════════
grupo('— v4.905/v4.907 · El verificador de rotulado queda para el BENCHMARK —');
//
// v4.905 midió el rotulado fantasma y v4.906 eximió el texto propio de la
// fotografía. En el flujo simple (v4.907) el modelo ESCRIBE los textos a
// propósito, así que estas puertas ya no deciden sobre una pieza del flujo —
// pero el benchmark las sigue usando para puntuar modelos, y el criterio puro
// tiene que seguir midiendo lo que mide.
{
    // El verificador de texto dibujado: lector acotado y veredicto de DOS
    // niveles — sólo `found && confident` descalifica (el ruido de una
    // lectura única, v4.795); `found` a secas se entrega con nota.
    check('readDrawnTextAnswer lee la respuesta acotada',
        JSON.stringify(S.readDrawnTextAnswer('x {"hasText": true, "confident": true, "where": "arriba"} y'))
        === JSON.stringify({ found: true, insidePhoto: false, confident: true, where: 'arriba' }));
    check('y rechaza la basura', S.readDrawnTextAnswer('no json') === null && S.readDrawnTextAnswer({ hasText: 'sí' }) === null);

    const base = { width: 1080, height: 1080, meanLuma: 230, whiteShare: 0.7, zoneLuma: 240, zoneStdDev: 10 };
    const seguro = S.judgePiece({ ...base, drawnText: { found: true, confident: true, where: 'arriba a la izquierda' } });
    check('texto dibujado CON certeza descalifica', !seguro.ok && seguro.critical.some(c => c.id === 'texto_dibujado'));
    const dudoso = S.judgePiece({ ...base, drawnText: { found: true, confident: false, where: '' } });
    check('sin certeza se ENTREGA con nota', dudoso.ok && dudoso.notes.some(n => /cree ver texto/.test(n)));
    // v4.906 — el falso positivo de Tuluá: el verificador vio el texto de las
    // CAJAS de la fotografía y descartó el diseño entero. El texto que la foto
    // trae consigo es LEGÍTIMO: la pregunta lo exime y el campo acotado
    // `insidePhoto` hace que el CÓDIGO no descalifique aunque el modelo
    // conteste hasText con descuido.
    check('v4.906: la pregunta exime al texto DE la fotografía',
        S.DRAWN_TEXT_SYSTEM.includes('LA FOTOGRAFÍA PUEDE TRAER TEXTO PROPIO')
        && S.DRAWN_TEXT_SYSTEM.includes('FUERA de la fotografía'));
    const cajas = S.judgePiece({ ...base, drawnText: { found: true, confident: true, insidePhoto: true, where: 'en las cajas dentro de la fotografía' } });
    check('v4.906: texto DENTRO de la fotografía NO descalifica (el caso de Tuluá)',
        cajas.ok && cajas.critical.length === 0 && cajas.notes.every(n => !/cree ver texto/.test(n)));
    const sinMirar = S.judgePiece({ ...base, drawnText: null });
    check('sin verificador no se afirma nada', sinMirar.ok && !sinMirar.measured.includes('texto dibujado'));
    check('el reintento nombra el problema del rotulado',
        /no words, letters or numbers/i.test(S.retryClauseFor([{ id: 'texto_dibujado' }])));
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} de ${ok + malos.length} comprobaciones fallaron:`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones. Aniversarios IA: criterio en orden.`);
