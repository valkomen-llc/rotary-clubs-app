#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL COPY CON EL QUE SALE UN REEL.  npm run test:reels:sharecopy
// v4.1052.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro; el CAMINO de la
// varita corre de verdad con la base y el redactor sustituidos por un hook de
// resolución de módulos.
//
// ⚠️ LAS DOS MITADES HACEN FALTA, y es la lección de v4.744 y de v4.889: el
// criterio puede estar entero y el defecto vivir en el camino. Acá se ejercita
// además que el modelo de verdad reciba la regla rota y reescriba, que un
// fallo del redactor no deje el modal sin texto y que la varita NO toque el
// video.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE REGENERAR EL COPY NO CUESTE UN CRÉDITO DE VIDEO. El fallo sería
//      MUDO: el texto sale igual y el gasto aparece en el medidor un mes
//      después. Se lee el archivo y se cuenta que no importe el cliente de
//      KIE, el compositor, la música ni la narración.
//
//   2. QUE UN COPY CON HASHTAGS O DE MÁS DE 100 CARACTERES NO SALGA A META,
//      aunque lo mande un navegador con el bundle anterior en caché. La puerta
//      que no se puede saltar es la del servidor.
//
//   3. QUE LOS DOS ESPEJOS DEN LO MISMO. Con dos criterios, el contador de la
//      pantalla diría 98 y el servidor rechazaría por 101 — y lo que se
//      separaría es si alguien puede publicar.
//
//   4. QUE EL MODELO REESCRIBA DE VERDAD. Si el veredicto se calculara sobre
//      el texto YA REPARADO, diría «cumple» siempre y la instrucción de
//      reescritura no saldría nunca: el pedido dice «preferimos una
//      reescritura completa», no un recorte.
//
//   5. QUE NO SE TIRE EL TRABAJO. Agotados los intentos se repara por código y
//      se DICE qué hubo que hacerle; un copy dos caracteres largo es mejor que
//      ningún copy.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-share-stub.mjs', HERE).href;
const WRITER = new URL('./scripts/fixtures/copywriting-copy-stub.mjs', HERE).href;

register(
    `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)db\\.js$/.test(s)) return {url:encodeURI(${JSON.stringify(DB)}),shortCircuit:true};
        if(/copywritingService\\.js$/.test(s)) return {url:encodeURI(${JSON.stringify(WRITER)}),shortCircuit:true};
        return n(s,c);
     }`,
    HERE
);

const C = await import('../server/lib/reelShareCopy.js');
const AI = await import('../server/lib/reelShareCopyAI.js');
const db = await import(DB);
const writer = await import(WRITER);

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');
/** El archivo SIN comentarios: el comentario que explica un cambio no puede
 *  hacer fallar la comprobación que lo defiende (la lección de v4.1005). */
const codigo = f => leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const POL = C.copyPolicyFor('reel');

// ════════════════════════════════════════════════════════════════════
grupo('1. La regla, dicha con números');

eq('El tope son 100 caracteres', POL.maxChars, 100);
check('…y el copy tiene que terminar en emoji', POL.requireEmoji === true);
check('…y no admite hashtags', POL.allowHashtags === false);
check('⚠️ …y es UNO para Facebook y para Instagram', POL.singleCopy === true);
check('⚠️ Un artículo SIN red no resuelve regla: la suya es POR RED (v4.1061)',
      C.copyPolicyFor('post') === null);
check('…ni un tipo que nadie declaró', C.copyPolicyFor('inventado') === null);

// ════════════════════════════════════════════════════════════════════
grupo('2. Cuánto mide un copy');

eq('Se cuenta en PUNTOS DE CÓDIGO, no en unidades UTF-16', C.copyLength('🤝'), 1);
eq('…así que un emoji vale UNO', C.copyLength('Hola 🤝'), 6);
eq('Una bandera es un solo signo para quien la lee, y se cuenta como dos',
   C.copyLength('🇨🇴'), 2);
eq('El texto se recorta de los bordes antes de contar', C.copyLength('  Hola  '), 4);
eq('Sin texto, cero', C.copyLength(null), 0);

// ════════════════════════════════════════════════════════════════════
grupo('3. Hashtags: qué es uno y qué no');

eq('Se reconocen los hashtags', C.hashtagsIn('Entrega #Rotary y #EmergenciaColombia').length, 2);
check('…con tildes y eñes', C.hashtagsIn('#AcciónRotaria').length === 1);
check('⚠️ Un número NO es un hashtag: «#4281» es un distrito, no una etiqueta',
      C.hashtagsIn('Distrito #4281').length === 0);
check('…ni «#1»', C.hashtagsIn('El #1 del país').length === 0);
check('⚠️ Preguntar dos veces por el mismo texto contesta lo mismo',
      C.hasHashtags('con #Rotary') && C.hasHashtags('con #Rotary'));
check('…y sin hashtags, no', C.hasHashtags('sin etiquetas') === false);

// ════════════════════════════════════════════════════════════════════
grupo('4. El emoji del final');

check('Un copy que termina en emoji cumple', C.endsWithEmoji('Gracias por tanto 🤝'));
check('…con espacios al final también', C.endsWithEmoji('Gracias 🤝   '));
check('Uno que termina en punto, no', C.endsWithEmoji('Gracias por tanto.') === false);
check('⚠️ «®» NO es un emoji, y tomarlo por uno dejaría pasar un copy sin él',
      C.endsWithEmoji('Rotary International®') === false);
check('…ni «™»', C.endsWithEmoji('Marca™') === false);
check('Un emoji con tono de piel sigue siendo el final', C.endsWithEmoji('Gracias 👏🏽'));
check('Una familia unida con ZWJ también', C.endsWithEmoji('La familia 👨‍👩‍👧'));
check('Una bandera también', C.endsWithEmoji('Desde Colombia 🇨🇴'));
check('Un emoji en el MEDIO no basta', C.endsWithEmoji('🤝 gracias por tanto') === false);
check('…pero se reconoce que lo lleva', C.hasEmoji('🤝 gracias'));

const partido = C.splitTrailingEmoji('Rotary entregó mercados 🤝');
eq('El emoji se separa del cuerpo', partido.emoji, '🤝');
eq('…y el cuerpo queda limpio', partido.body, 'Rotary entregó mercados');

// ════════════════════════════════════════════════════════════════════
grupo('5. Limpiar sin destrozar la frase');

eq('Los hashtags se quitan y los espacios se normalizan',
   C.sanitizeShareCopy('Rotary entregó ayudas. #Rotary #Emergencia 🤝'),
   'Rotary entregó ayudas. 🤝');
check('⚠️ Una dirección web NO se quita por defecto: quitarla deja «Mirá todo en y sumate»',
      C.sanitizeShareCopy('Mirá todo en www.rotary4281.org y sumate 🤝').includes('rotary4281.org'));
check('…y sí con el gesto expreso de «Limpiar automáticamente»',
      C.cleanShareCopy('Mirá todo en www.rotary4281.org y sumate 🤝', POL).includes('rotary4281.org') === false);
eq('Un texto ya limpio no cambia',
   C.sanitizeShareCopy('Rotary entregó ayudas. 🤝'), 'Rotary entregó ayudas. 🤝');

// ════════════════════════════════════════════════════════════════════
grupo('6. Acortar: frases completas antes que puntos suspensivos');

const dosFrases = 'Rotary Popayán entregó prendas y calzado. Las familias de Sevilla agradecieron el gesto de la comunidad rotaria entera.';
const cortado = C.fitShareCopy(dosFrases, 100);
check('⚠️ Se conservan las FRASES que entran, sin puntos suspensivos',
      cortado.text === 'Rotary Popayán entregó prendas y calzado.' && !cortado.text.includes('…'));
eq('…y se dice cómo se cortó', cortado.cut, 'oracion');
check('…y que hubo que cortar', cortado.shortened === true);

const unaFraseLarga = `${'palabra '.repeat(30)}final`;
const porPalabra = C.fitShareCopy(unaFraseLarga, 100);
check('Sin frase que quepa, se corta en el último espacio', porPalabra.text.endsWith('…'));
check('⚠️ …y NUNCA a mitad de palabra', /palabra\s*…$/.test(porPalabra.text));
check('…sin pasarse del tope', C.copyLength(porPalabra.text) <= 100);
eq('…y se dice que fue por palabra', porPalabra.cut, 'palabra');

const corto = C.fitShareCopy('Rotary entregó ayudas.', 100);
check('Un texto que ya entra no se toca', corto.shortened === false && corto.cut === null);

// ════════════════════════════════════════════════════════════════════
grupo('7. Componer: el copy que de verdad sale');

const compuesto = C.composeShareCopy('Rotary Popayán entregó prendas y calzado a familias de Sevilla. #Rotary #Emergencia', { policy: POL });
check('Los hashtags se quitan', C.hashtagsIn(compuesto.text).length === 0);
check('…y se DICE que se quitaron', compuesto.sanitized === true);
check('El copy termina en emoji', C.endsWithEmoji(compuesto.text));
check('…y entra en el tope', C.copyLength(compuesto.text) <= 100);

const conEmergencia = C.composeShareCopy('Ayuda para las familias damnificadas por la emergencia', { policy: POL });
eq('⚠️ El emoji se elige por lo que DICE el texto, no al azar', conEmergencia.emoji, '🙏');
eq('…y sin ninguna palabra reconocida, el neutro',
   C.composeShareCopy('Así fue la tarde de ayer en el parque', { policy: POL }).emoji, '🤝');
check('El emoji que el texto ya traía se respeta',
      C.composeShareCopy('Entrega de mercados 🍲', { policy: POL }).emoji === '🍲');

const vacio = C.composeShareCopy('   ', { policy: POL });
check('⚠️ Un texto vacío NO se convierte en un emoji suelto', vacio.empty === true && vacio.text === '');

const justo = C.composeShareCopy(`${'a'.repeat(120)}`, { policy: POL });
check('Un texto larguísimo entra en el tope CON su emoji', C.copyLength(justo.text) <= 100);
check('…y sigue terminando en emoji', C.endsWithEmoji(justo.text));

// ════════════════════════════════════════════════════════════════════
grupo('8. El veredicto: qué bloquea y qué sólo avisa');

const bien = C.validateShareCopy('Rotary Popayán entregó prendas y calzado a familias de Sevilla. 🤝', POL);
check('El copy del ejemplo del pedido pasa', bien.ok === true);
eq('…y se cuenta cuánto mide', bien.length, 65);

const malo = C.validateShareCopy('Rotary Popayán entregó ayudas a Sevilla. #Rotary #EmergenciaColombia 🤝', POL);
check('El copy INCORRECTO del pedido se rechaza', malo.ok === false);
eq('…por hashtags', malo.code, 'hashtags');
check('…y se dice cuáles hay que quitar', /#Rotary/.test(malo.reason));
check('…y dónde se corrige', /Limpiar autom/i.test(malo.fix || ''));

const largo = C.validateShareCopy(`${'a'.repeat(120)} 🤝`, POL);
eq('Un copy de más de 100 caracteres se rechaza', largo.code, 'too_long');
check('…con el texto exacto que pidió el cliente',
      largo.reason === 'El copy del Reel debe tener máximo 100 caracteres. Lleva 122.');

const sinEmoji = C.validateShareCopy('Rotary entregó prendas y calzado.', POL);
eq('Un copy sin emoji final se rechaza', sinEmoji.code, 'no_emoji');
eq('Un copy vacío también', C.validateShareCopy('', POL).code, 'empty');

const conLink = C.validateShareCopy('Mirá todo en rotary4281.org y sumate 🤝', POL);
check('⚠️ Una dirección web AVISA y NO bloquea', conLink.ok === true);
check('…y se dice por qué está de más', conLink.warnings.some(w => w.code === 'link'));

// ⚠️ UN ARTÍCULO NO PASA POR ESTA REGLA, y quien lo decide es el ÚNICO punto
// que mira la política: `validateShareMessage`. `validateShareCopy` ES el
// criterio del Reel —sin política cae en el suyo— así que preguntárselo
// directamente por un artículo sería preguntarle lo que no contesta.
const SPEC = await import('../server/lib/socialShareSpec.js');
check('⚠️ Sin política, se acepta lo que el flujo de Noticias siempre mandó',
      SPEC.validateShareMessage('Una noticia larguísima con #Rotary '.repeat(20), null).ok === true);
check('…y con la del Reel, no', SPEC.validateShareMessage('Con #Rotary 🤝', POL).ok === false);

// ════════════════════════════════════════════════════════════════════
grupo('9. Lo que la pantalla necesita para pintar');

const desc = C.describeShareCopy('Rotary entregó ayudas. #Rotary', POL);
eq('Se dice cuánto falta para el tope', desc.remaining, 100 - desc.length);
eq('…y cuánto sobra cuando se pasa', C.describeShareCopy(`${'a'.repeat(120)} 🤝`, POL).over, 22);
check('…qué hashtags hay', desc.hashtags.length === 1);
check('…y que limpiar CAMBIARÍA algo', desc.canClean === true);
check('…con el resultado ya calculado', desc.cleaned === 'Rotary entregó ayudas.');
check('⚠️ Sobre un texto ya limpio, el botón no se ofrece',
      C.describeShareCopy('Rotary entregó ayudas. 🤝', POL).canClean === false);

// ════════════════════════════════════════════════════════════════════
grupo('10. Los dos espejos dan LO MISMO');

const { build } = await import('esbuild').catch(() => ({ build: null }));
if (!build) {
    console.log('  · esbuild no está instalado; el bloque del espejo se salta.');
} else {
    const out = '/tmp/reel-share-copy-mirror.mjs';
    await build({ entryPoints: ['src/lib/reelShareCopy.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
    const M = await import(pathToFileURL(out).href);

    // ⚠️ SE COMPARAN LAS SALIDAS, no que se parezcan: es el patrón de
    // `fxRates` y de `checkoutSurcharge`. Con dos criterios, el contador de la
    // pantalla y la puerta de la publicación dirían cosas distintas del mismo
    // texto — y lo que se separaría es si alguien puede publicar.
    const MUESTRAS = [
        '',
        '   ',
        'Rotary Popayán entregó prendas y calzado a familias de Sevilla. 🤝',
        'Rotary Popayán entregó ayudas a Sevilla. #Rotary #EmergenciaColombia 🤝',
        'Rotary entregó prendas y calzado.',
        `${'a'.repeat(120)} 🤝`,
        'Distrito #4281 en acción 🤝',
        'Mirá todo en www.rotary4281.org y sumate 🤝',
        'Rotary International®',
        'Desde Colombia 🇨🇴',
        'La familia 👨‍👩‍👧',
        'Gracias 👏🏽',
        'Entrega de mercados 🍲 #Rotary',
        // Justo entre 100 y 120: discrimina un tope movido en un solo espejo.
        `${'a'.repeat(108)} 🤝`,
    ];
    let pares = 0;
    for (const t of MUESTRAS) {
        const a = C.validateShareCopy(t, POL);
        const b = M.validateShareCopy(t, M.REEL_COPY_POLICY);
        if (a.ok !== b.ok || a.code !== b.code || a.length !== b.length) {
            check(`Los espejos discrepan sobre ${JSON.stringify(t)}`, false,
                  `servidor ${a.code}/${a.length}, navegador ${b.code}/${b.length}`);
        } else if (C.copyLength(t) !== M.copyLength(t)) {
            check(`Los espejos cuentan distinto ${JSON.stringify(t)}`, false);
        } else if (C.cleanShareCopy(t, POL) !== M.cleanShareCopy(t, M.REEL_COPY_POLICY)) {
            check(`Los espejos limpian distinto ${JSON.stringify(t)}`, false);
        } else if (C.endsWithEmoji(t) !== M.endsWithEmoji(t)) {
            check(`Los espejos leen el emoji distinto ${JSON.stringify(t)}`, false);
        } else pares++;
    }
    check(`⚠️ Los dos espejos dan lo mismo en las ${MUESTRAS.length} muestras`, pares === MUESTRAS.length);
    eq('…y el tope es el mismo número', M.REEL_COPY_MAX, C.REEL_COPY_MAX);

    // ⚠️ Y TAMBIÉN SOBRE LAS POLÍTICAS DE ARTÍCULO. El espejo no las declara
    // —las manda el servidor en la respuesta del modal—, así que lo que se
    // comprueba es que su validador lea el MISMO objeto y dé el MISMO
    // veredicto: con dos lecturas, el contador de la pestaña de X diría que
    // entra y la puerta del servidor diría que no.
    const ART = [
        ['facebook', 'Rotary Popayán entregó prendas y calzado a familias de Sevilla.\n\nConocé la historia completa: https://rotary4281.org/blog/sevilla'],
        ['x', `${'a'.repeat(300)}`],
        ['x', 'Corto y con enlace https://rotary4281.org/blog/sevilla'],
        ['instagram', 'Sin enlace, que en Instagram no se puede pulsar.'],
        ['linkedin', 'Con #Rotary y enlace https://rotary4281.org/blog/sevilla'],
        ['facebook', 'Sin la dirección al final.'],
        ['facebook', '   '],
    ];
    let paresArt = 0;
    for (const [red, t] of ART) {
        const pol = C.copyPolicyFor('post', red);
        const a = C.validateShareCopy(t, pol);
        const b = M.validateShareCopy(t, pol);
        const wa = (a.warnings || []).map(w => w.code).join(',');
        const wb = (b.warnings || []).map(w => w.code).join(',');
        if (a.ok !== b.ok || a.code !== b.code || a.length !== b.length || wa !== wb) {
            check(`Los espejos discrepan sobre ${red}: ${JSON.stringify(t.slice(0, 40))}`, false,
                  `servidor ${a.code}/${wa}, navegador ${b.code}/${wb}`);
        } else paresArt++;
    }
    check(`⚠️ Los dos espejos dan lo mismo en las ${ART.length} muestras de artículo`, paresArt === ART.length);

    // ⚠️ EL ESPEJO ES MÍNIMO. Lo que DECIDE el servidor —cómo se le pide al
    // modelo, cómo se lee su respuesta y qué se le devuelve al reintentar— no
    // viaja al bundle: con el prompt en el navegador, cualquiera podría pedirle
    // al modelo lo que quisiera, y el bundle crecería por nada.
    for (const k of ['buildShareCopyPrompt', 'readShareCopy', 'retryInstructionFor', 'COPY_RULES_TEXT', 'EMOJI_HINTS']) {
        check(`⚠️ El espejo NO trae \`${k}\``, typeof M[k] === 'undefined');
    }
}

// ════════════════════════════════════════════════════════════════════
grupo('11. Leer lo que contesta el modelo');

eq('Un JSON con el copy', C.readShareCopy('{"copy":"Rotary entregó ayudas 🤝"}'), 'Rotary entregó ayudas 🤝');
eq('…envuelto en una valla de código',
   C.readShareCopy('```json\n{"copy":"Rotary entregó ayudas 🤝"}\n```'), 'Rotary entregó ayudas 🤝');
eq('Texto suelto, tal cual', C.readShareCopy('Rotary entregó ayudas 🤝'), 'Rotary entregó ayudas 🤝');
eq('…sin las comillas con que a veces lo envuelve', C.readShareCopy('"Rotary entregó ayudas 🤝"'), 'Rotary entregó ayudas 🤝');
eq('…y sin el «Copy:» que a veces antepone', C.readShareCopy('Copy: Rotary entregó ayudas 🤝'), 'Rotary entregó ayudas 🤝');
eq('Nada legible da vacío, no una excepción', C.readShareCopy(null), '');

// ════════════════════════════════════════════════════════════════════
grupo('12. El CAMINO — la varita');

const REEL = {
    id: 'r1', clubId: 'A', title: 'Entrega de prendas y calzado en Sevilla',
    status: 'ready', videoUrl: 'https://cdn/r1.mp4', durationSec: 14.2,
    config: {},
};
const sembrar = (extra = {}) => {
    db.seed({
        clubs: [{ id: 'A', name: 'Rotary Popayán', type: 'club' }],
        reels: [{ ...REEL }],
        narrations: [{ projectId: 'r1', script: 'Rotary Popayán entregó 117 prendas dobles y 31 pares de zapatos a familias de Sevilla.', isCurrent: true }],
        ...extra,
    });
    writer.limpiar();
};

sembrar();
writer.responder(['{"copy":"Rotary Popayán entregó prendas y calzado a familias de Sevilla. 🤝"}']);
let r = await AI.generateReelShareCopy({ reel: { ...REEL }, entityType: 'reel' });
eq('El modelo escribe y su texto sale tal cual', r.copy, 'Rotary Popayán entregó prendas y calzado a familias de Sevilla. 🤝');
check('…y cumple', r.ok === true);
eq('…y se dice que lo escribió la IA', r.source, 'ia');
eq('Se llamó al redactor UNA vez', writer.llamadas.length, 1);
check('⚠️ El guion del Reel viaja al contexto: es lo que la pieza CUENTA',
      /117 prendas/.test(writer.llamadas[0].userText));
check('…y el título también', /Sevilla/.test(writer.llamadas[0].userText));
check('⚠️ La regla viaja en el prompt del SISTEMA, con su número',
      /100/.test(writer.llamadas[0].system));

// ⚠️ SE JUZGA LO QUE EL MODELO ESCRIBIÓ, NO LO QUE QUEDARÍA DESPUÉS DE
// REPARARLO. Validando la salida reparada, el veredicto diría «cumple»
// siempre y la instrucción de reescritura no saldría nunca.
sembrar();
writer.responder([
    'Rotary Popayán entregó ayudas a Sevilla. #Rotary #EmergenciaColombia 🤝',
    'Rotary Popayán entregó prendas y calzado a familias de Sevilla. 🤝',
]);
r = await AI.generateReelShareCopy({ reel: { ...REEL }, entityType: 'reel' });
eq('⚠️ Un copy con hashtags hace REESCRIBIR, no recortar', writer.llamadas.length, 2);
check('…y al modelo se le devuelve la regla CONCRETA que rompió',
      /hashtag/i.test(writer.llamadas[1].userText) || /hashtag/i.test(writer.llamadas[1].system));
eq('…y sale el segundo intento, entero', r.copy, 'Rotary Popayán entregó prendas y calzado a familias de Sevilla. 🤝');
eq('…escrito por la IA', r.source, 'ia');

sembrar();
writer.responder([
    `${'palabra '.repeat(40)}🤝`,
    `${'palabra '.repeat(40)}🤝`,
    `${'palabra '.repeat(40)}🤝`,
]);
r = await AI.generateReelShareCopy({ reel: { ...REEL }, entityType: 'reel' });
eq('⚠️ Se reintenta como mucho TRES veces: el que falló dos no acierta a la tercera', writer.llamadas.length, 3);
check('…y agotados los intentos NO se tira el trabajo', r.copy.length > 0);
check('…el texto entregado cumple', C.copyLength(r.copy) <= 100 && C.endsWithEmoji(r.copy));
eq('…y se DICE que hubo que repararlo', r.source, 'ia_reparado');
check('…con el motivo escrito', r.notes.some(n => /acortar|largo/i.test(n)));

sembrar();
writer.responder([new Error('todos los proveedores caídos')]);
r = await AI.generateReelShareCopy({ reel: { ...REEL }, entityType: 'reel' });
check('⚠️ Sin redactor, el modal NO se queda sin copy', r.copy.length > 0);
eq('…y se dice que salió sin pasar por la IA', r.source, 'plantilla');
check('…compuesto con lo que el Reel ya tenía', /Sevilla/i.test(r.copy));
check('…y cumpliendo la regla igual', C.copyLength(r.copy) <= 100 && C.hashtagsIn(r.copy).length === 0);
check('…con el motivo a la vista', r.notes.some(n => /redactor|IA/i.test(n)));

// ════════════════════════════════════════════════════════════════════
grupo('13. Invariantes que ninguna otra comprobación ve');

const ia = codigo('server/lib/reelShareCopyAI.js');
const crit = codigo('server/lib/reelShareCopy.js');
const spec = codigo('server/lib/socialShareSpec.js');
const svc = codigo('server/lib/socialPublishingService.js');
const ctrl = codigo('server/controllers/contentShareController.js');
const rutas = codigo('server/routes/social.js');
const modal = codigo('src/components/admin/social/ShareModal.tsx');
const espejo = codigo('src/lib/reelShareCopy.ts');

// ⚠️ REGENERAR EL COPY NO TOCA EL VIDEO. Es la mitad del pedido que no se ve:
// el texto sale igual y el gasto aparecería en el medidor un mes después.
const MOTORES = ['kieService', 'reelFfmpeg', 'reelMusic', 'reelNarration', 'canvasExpansion', 'reelRenderProviders'];
for (const m of MOTORES) {
    check(`⚠️ La varita NO importa \`${m}\``, !new RegExp(`from ['"][^'"]*${m}`).test(ia));
}
check('…ni despacha una escena', !/dispatchScene|createKieVideoTask|createKieImageTask/.test(ia));

// ⚠️ EL CRITERIO ES PURO. Con una consulta o una llamada de red adentro no se
// podría probar sin infraestructura, y entonces en la práctica no se probaría
// (la regla de `seoRules.js` frente a `seoAudit.js`).
check('⚠️ El criterio no importa la base', !/from ['"][^'"]*db\.js/.test(crit));
check('…ni el redactor', !/copywritingService/.test(crit));
check('…ni toca el reloj', !/Date\.now|new Date\(/.test(crit));

// ⚠️ UN SOLO PUNTO DE DECISIÓN. Con la regla escrita en dos sitios, el modal
// dejaría publicar lo que el servicio rechaza.
check('⚠️ El servicio no escribe su propia regla de copy',
      !/maxChars\s*[:=]\s*100|length\s*>\s*100/.test(svc));
check('…sino que valida por `validateShareMessage`', /validateShareMessage\s*\(/.test(svc));
// ⚠️ SOBRE LA INVARIANTE, NO SOBRE LA FORMA LITERAL. Pedía
// `copyPolicyFor(entityType)` EXACTO y falló en v4.1061 al pasar a resolverse
// POR RED —`copyPolicyFor(entityType, red)`—, con el criterio intacto y MÁS
// estricto. Lo que hay que fijar es que la política salga de ese resolutor,
// no cuántos argumentos lleva (la lección de v4.984).
check('…con la política resuelta en el servidor', /copyPolicyFor\s*\(\s*entityType/.test(svc));
check('⚠️ Y `validateShareMessage` delega en el criterio, no lo repite',
      /validateShareCopy\s*\(/.test(spec));

// ⚠️ LA VARITA ES UNA RUTA LITERAL Y VA ANTES DE `/share`.
check('La varita tiene su ruta', /router\.post\(['"]\/share\/copy['"]/.test(rutas));
check('⚠️ …declarada ANTES de `/share`',
      rutas.indexOf("'/share/copy'") < rutas.indexOf("router.post('/share'"));
check('…y con sesión', /router\.post\(['"]\/share\/copy['"],\s*authMiddleware/.test(rutas));

// ⚠️ UNA SOLA FUENTE DE VERDAD EN LA PANTALLA: el textarea, la vista previa y
// el payload leen la MISMA variable. Con el copy compuesto en dos sitios, la
// vista previa dejaría de prometer lo que se publica.
// Se comprueba la INVARIANTE —que el texto se componga en un solo sitio y que
// de ahí lo lean los tres consumidores—, no la forma exacta de escribirlo:
// fijar la sintaxis se rompe al refactorizar con el criterio intacto (v4.984).
eq('⚠️ El modal compone el texto UNA vez', (modal.match(/const textoActual\s*=/g) || []).length, 1);
eq('…y nadie más lo vuelve a componer',
   (modal.match(/textoDe\(porRed \? redActiva : 'facebook'\)/g) || []).length, 1);
check('…y el textarea lo lee', /value=\{textoActual\}/.test(modal));
check('…y la vista previa también', modal.split('Vista previa')[1]?.includes('textoActual'));
check('⚠️ El modal no vuelve a escribir el tope: lo pide a la política',
      !/maxChars\s*[:=]\s*100/.test(modal) && /politica\.maxChars/.test(modal));
check('La varita llama a su endpoint', /share\/copy/.test(modal));
// ⚠️ TAMBIÉN SOBRE LA INVARIANTE. Desde v4.1061 el modal comprueba TODAS las
// redes elegidas y no sólo la pestaña abierta (`redesConProblema`), que es más
// estricto que mirar `estadoCopy.ok`: con una sola, alguien corrige el copy de
// Facebook, publica, y el de X lo rechaza el servidor cuando Facebook ya salió.
check('…y el botón de publicar se apaga con el veredicto',
      /puedePublicar[\s\S]{0,600}(estadoCopy\.ok|redesConProblema\.length === 0)/.test(modal));

// ⚠️ EL ESPEJO NO DECIDE NADA QUE NO PUEDA REHACER EL SERVIDOR.
check('⚠️ El espejo del navegador no lleva el prompt del modelo',
      !/buildShareCopyPrompt|EMOJI_HINTS/.test(espejo));

// ⚠️ EL CONTROLADOR COMPRUEBA LA POLÍTICA ANTES DE ESCRIBIR NADA: un artículo
// no pasa por la varita, su Copy Estratégico es otra cosa.
check('La varita rechaza lo que no tiene regla propia', /if\s*\(!policy\)/.test(ctrl));
check('…y resuelve la entidad con el aislamiento de siempre', /resolveEntity\s*\(/.test(ctrl));

// ════════════════════════════════════════════════════════════════════
grupo('14. El copy de un ARTÍCULO va POR RED (v4.1061)');

const FB = C.copyPolicyFor('post', 'facebook');
const X = C.copyPolicyFor('post', 'x');
const IG = C.copyPolicyFor('post', 'instagram');
const LI = C.copyPolicyFor('post', 'linkedin');

eq('Cada red trae su tope real', [FB.maxChars, IG.maxChars, X.maxChars, LI.maxChars], [2000, 2200, 280, 3000]);
check('⚠️ NINGUNA admite hashtags: es el pedido del cliente',
      [FB, IG, X, LI].every(p => p.allowHashtags === false));
check('…y NINGUNA exige emoji: ésa es la regla del Reel',
      [FB, IG, X, LI].every(p => p.requireEmoji === false));
check('⚠️ Cada red recibe SU texto', [FB, IG, X, LI].every(p => p.singleCopy === false));
check('Instagram NO pide el enlace ni lo admite: ahí no se puede pulsar',
      IG.wantsLink === false && IG.allowLinks === false);
check('…y las demás redes tampoco meten el enlace en el cuerpo (se adjunta aparte)',
      [FB, X, LI].every(p => p.wantsLink === false && p.allowLinks === false));
check('Una red que nadie declaró no resuelve política', C.copyPolicyFor('post', 'tiktok') === null);
eq('…y el catálogo por red trae las cuatro',
   Object.keys(C.copyPoliciesFor('post')).sort(), ['facebook', 'instagram', 'linkedin', 'x']);
check('Un Reel no tiene catálogo por red', C.copyPoliciesFor('reel') === null);

// ─── El compositor ──────────────────────────────────────────────────
//
// ⚠️ EL CIERRE SE RESERVA ANTES DE ACORTAR. Compuesto al revés —acortar el
// cuerpo al tope y pegarle después el llamado— el copy de X saldría
// SIEMPRE pasado, que es exactamente lo que el cliente fotografió («359 / 260
// ch»). Es el punto que sostiene todo este módulo.
const DIR = 'https://rotary4281.org/blog/sevilla';
const LARGO = 'Rotary Popayán entregó prendas y calzado a decenas de familias de Sevilla tras la emergencia. ';

const enX = C.composeArticleCopy({ source: LARGO.repeat(5), publicUrl: DIR, policy: X });
check('⚠️ El copy de X entra en su tope', C.copyLength(enX.text) <= 280);
check('…NO incluye la URL dentro del cuerpo', !enX.text.includes(DIR));
check('…y termina con un emoji contextual', C.endsWithEmoji(enX.text));
check('…y se dice que hubo que acortarlo', enX.shortened === true);
check('…cortando por frases completas, no a mitad de palabra', enX.cut === 'oracion');

const enFB = C.composeArticleCopy({ source: LARGO, publicUrl: DIR, policy: FB });
check('En Facebook el mismo texto entra entero', enFB.shortened === false);
check('…tampoco repite la URL en el cuerpo', !enFB.text.includes(DIR));
check('⚠️ El llamado a la acción es natural y sin dos puntos para enlaces', /Conocé la historia completa\./.test(enFB.text));
check('…y termina con un emoji contextual coherente', C.endsWithEmoji(enFB.text));

const conTags = C.composeArticleCopy({ source: 'Rotary entregó ayudas. #Rotary #Colombia', publicUrl: DIR, policy: FB });
check('⚠️ Los hashtags se quitan al componer', !/#/.test(conTags.text));
check('…y se dice que venían', conTags.hashtags.length === 2);
check('…y se conserva la frase, sin dobles espacios', /^Rotary entregó ayudas\./.test(conTags.text));

const enIG = C.composeArticleCopy({ source: LARGO, publicUrl: DIR, policy: IG });
check('⚠️ Instagram NO lleva el enlace pegado: ahí no se puede pulsar',
      !enIG.text.includes(DIR));
check('…y el que alguien pegue a mano AVISA, y se puede quitar de un clic',
      C.describeShareCopy(`Un pie. ${DIR}`, IG).warnings.some(w => w.code === 'link')
      && C.describeShareCopy(`Un pie. ${DIR}`, IG).canClean === true);

const sinUrl = C.composeArticleCopy({ source: 'Rotary entregó ayudas.', publicUrl: '', policy: FB });
check('Sin dirección pública se compone con gancho, contexto, llamado y emoji',
      sinUrl.text.includes('Rotary entregó ayudas.') && /Conocé la historia completa\./.test(sinUrl.text) && C.endsWithEmoji(sinUrl.text));

check('⚠️ Las comillas angulares y tipográficas se limpian de nombres y títulos',
      C.cleanQuotesAndSymbols('«Petronio Solidario» y “Campaña”') === 'Petronio Solidario y Campaña');

const todas = C.defaultArticleCopies({ source: LARGO.repeat(5), publicUrl: URL });
eq('Se compone un texto por red de una sola vez',
   Object.keys(todas).sort(), ['facebook', 'instagram', 'linkedin', 'x']);
check('…y cada uno cumple SU regla',
   Object.entries(todas).every(([red, t]) => C.validateShareCopy(t, C.copyPolicyFor('post', red)).ok));
check('…y NO son todos el mismo texto', new Set(Object.values(todas)).size > 1);

// ─── Qué bloquea y qué avisa ────────────────────────────────────────
//
// ⚠️ LA DIRECCIÓN QUE FALTA NO AVISA NI BLOQUEA porque viaja en su propio
// campo de enlace interactivo. Si alguien pega una URL a mano, el sistema
// avisa que no hace falta incluirla en el texto.
const vSinUrl = C.validateShareCopy('Un pie sin la dirección al final.', FB);
check('Un artículo sin la URL en el texto SE PUBLICA correctamente', vSinUrl.ok === true);
check('…y no produce avisos porque la URL viaja como enlace interactivo', vSinUrl.warnings.length === 0);
check('Si alguien pega una URL a mano, AVISA que el enlace ya se adjunta solo',
      C.validateShareCopy(`Un pie. ${DIR}`, FB).warnings.some(w => w.code === 'link'));
check('Un texto vacío no arrastra el aviso del enlace',
      C.validateShareCopy('   ', FB).warnings.length === 0);
check('Instagram no avisa si no lleva dirección',
      C.validateShareCopy('Sin enlace.', IG).warnings.length === 0);

const vTags = C.validateShareCopy(`Rotary entregó ayudas. #Rotary`, FB);
check('⚠️ Los hashtags SÍ bloquean: es el pedido expreso del cliente', vTags.ok === false);
eq('…con su código', vTags.code, 'hashtags');
check('…nombrando la etiqueta', /#Rotary/.test(vTags.reason));
check('…y su salida de un clic', /Limpiar/i.test(vTags.fix || ''));

const vLargo = C.validateShareCopy(`${'a'.repeat(300)}`, X);
check('Pasarse del tope de X bloquea', vLargo.ok === false && vLargo.code === 'too_long');
check('…diciendo cuánto lleva y cuánto cabe', /280/.test(vLargo.reason) && /\d{3}/.test(vLargo.reason));
check('⚠️ …y el mensaje NOMBRA la red, no «el Reel»', /artículo en X/.test(vLargo.reason));
check('Y ese mismo texto entra holgado en LinkedIn',
      C.validateShareCopy(`${'a'.repeat(300)}`, LI).ok === true);

check('⚠️ Un artículo no exige emoji al validar para permitir edición manual',
      C.validateShareCopy(`Un pie sin emoji.`, FB).ok === true);

// ⚠️ EL BUCLE DE LA IA ES MÁS ESTRICTO QUE LA PUERTA DE PUBLICAR, y esa
// diferencia es deliberada: a un modelo se le pide la estructura entera y se
// le vuelve a pedir si la omite; a una persona que borró la URL a propósito no
// se le impide publicar. Sin esto, el modelo entregaría el primer texto sin
// enlace y nadie lo repondría.
const IA = codigo('server/lib/reelShareCopyAI.js');
check('El bucle reintenta cuando falta el enlace', /faltaEnlace/.test(IA));
check('…y lo tiene en cuenta al elegir el mejor intento', /faltaEnlace\)\s*p \+=/.test(IA));
check('…y lo DICE cuando hubo que reponerlo', /se agregó al final/.test(IA));
check('⚠️ …y la reparación la escribe el CÓDIGO con la URL exacta',
      /repair:\s*\(crudo\)\s*=>\s*composeArticleCopy/.test(IA));

// ⚠️ EL ESPEJO SIGUE SIN DECIDIR LO QUE DECIDE EL SERVIDOR: las políticas de
// artículo viajan en la respuesta, no compiladas en el bundle.
check('⚠️ El espejo no declara las políticas de artículo',
      !/ARTICLE_COPY_POLICIES|composeArticleCopy/.test(espejo));

grupo('15. El copy de un artículo se escribe en PÁRRAFOS (v4.1062)');

// ⚠️ EL SANEADO ESTABA ESCRITO PARA EL COPY DE UN REEL —100 caracteres en una
// línea— y aplanaba `\n\n`. Aplicado a un artículo se comía la estructura que
// el pedido pide («2 a 4 párrafos cortos» en Facebook) y, peor, hacía que
// `canClean` fuera SIEMPRE cierto: el botón «Limpiar automáticamente» se
// ofrecía sobre un copy impecable y, al pulsarlo, destruía los párrafos.
const CUERPO = 'Primer párrafo del artículo.\n\nSegundo párrafo con el contexto.';
const DIR2 = 'https://rotary4281.org/blog/nota';

for (const red of C.ARTICLE_COPY_NETWORKS) {
    const pol = C.copyPolicyFor('post', red);
    check(`⚠️ La política de ${red} se declara multipárrafo`, pol.multiline === true);
}
check('⚠️ La del Reel NO: es de una línea', !C.copyPolicyFor('reel').multiline);

const conParrafos = C.composeArticleCopy({
    source: CUERPO, title: 'Nota', publicUrl: DIR2,
    policy: C.ARTICLE_COPY_POLICIES.facebook,
}).text;
check('⚠️ El cuerpo conserva su línea en blanco', /Primer párrafo del artículo\.\n\nSegundo párrafo/.test(conParrafos));
check('…y el cierre sigue separado por otra', /\n\nConocé la historia completa\./.test(conParrafos));

// ⚠️ LO QUE SE REPORTÓ: el botón de limpiar aparecía sobre un copy sin un solo
// hashtag. `canClean` sólo puede ser cierto cuando limpiar CAMBIARÍA algo.
const vLimpio15 = C.describeShareCopy(conParrafos, C.ARTICLE_COPY_POLICIES.facebook);
check('⚠️ Un copy compuesto NO ofrece «Limpiar automáticamente»', vLimpio15.canClean === false);
check('…y es válido', vLimpio15.ok === true);
check('⚠️ Limpiar no aplana los párrafos',
      C.cleanShareCopy(conParrafos, C.ARTICLE_COPY_POLICIES.facebook).includes('\n\nSegundo párrafo'));
// Con hashtags SÍ hay algo que limpiar, y limpiar los quita sin tocar la forma.
const conTags15 = `${conParrafos}\n\n#Rotary #Colombia`;
const vTags15 = C.describeShareCopy(conTags15, C.ARTICLE_COPY_POLICIES.facebook);
check('Con hashtags sí se ofrece limpiar', vTags15.canClean === true);
check('…y limpiar los quita', !/#Rotary/.test(C.cleanShareCopy(conTags15, C.ARTICLE_COPY_POLICIES.facebook)));
check('…conservando los párrafos', C.cleanShareCopy(conTags15, C.ARTICLE_COPY_POLICIES.facebook).includes('\n\nSegundo párrafo'));

// El pie de un Reel es de UNA línea y eso no cambió.
check('⚠️ El copy de un Reel sigue fundiendo los saltos',
      !C.cleanShareCopy('Una cosa.\n\nOtra cosa. 🤝', C.copyPolicyFor('reel')).includes('\n\n'));

grupo('16. El modal redacta las CUATRO redes y nombra lo que va a pasar (v4.1062)');

const MODAL = codigo('src/components/admin/social/ShareModal.tsx');

// ⚠️ LAS PESTAÑAS SALÍAN DE LAS CUENTAS CONECTADAS, así que con sólo Meta
// conectado se pintaban DOS: las políticas de X (280) y LinkedIn (3.000) que
// v4.1061 introdujo no se podían ni mirar, y el copy de esas redes viajaba sin
// que nadie pudiera revisarlo. Redactar y publicar son dos cosas distintas.
check('⚠️ Las pestañas de copy salen de las redes CON REGLA', /redesDeCopy/.test(MODAL));
check('…y no de las cuentas conectadas', !/redesListas\.map\(red =>/.test(MODAL));
check('…con el orden del catálogo del servidor', /datos\?\.networks \|\| \[\]\)\.map\(n => n\.id\)/.test(MODAL));
check('⚠️ Una pestaña sin destino se DICE', /todav[ií]a\s*\n?\s*no se publica desde la plataforma/.test(MODAL));
// Y no bloquea: lo que exige texto y regla son las redes ELEGIDAS.
check('⚠️ Sólo las redes ELEGIDAS bloquean el botón', /redesElegidas\s*\n?\s*\.map\(red => \{/.test(MODAL));

// ⚠️ EL RÓTULO NOMBRABA UNA SOLA RED. Decía «Publicar en Facebook (2)» con
// Instagram también marcado: nombraba una red que no era la única y el propio
// contador de al lado lo desmentía.
check('⚠️ El botón nombra las redes elegidas', /Publicar en \$\{redesElegidas\.length/.test(MODAL));
check('…y no una escrita a mano', !/`Publicar en Facebook\$\{/.test(MODAL));

// ════════════════════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} comprobaciones fallaron:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
