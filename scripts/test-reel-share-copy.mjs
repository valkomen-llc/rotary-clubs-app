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
        if(/(^|\\/)db\\.js$/.test(s)) return {url:${JSON.stringify(DB)},shortCircuit:true};
        if(/copywritingService\\.js$/.test(s)) return {url:${JSON.stringify(WRITER)},shortCircuit:true};
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
check('Un artículo NO tiene regla propia: su Copy Estratégico es otra cosa',
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
check('…con la política resuelta en el servidor', /copyPolicyFor\s*\(\s*entityType\s*\)/.test(svc));
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
check('…y el botón de publicar se apaga con el veredicto',
      /puedePublicar[\s\S]{0,400}estadoCopy\.ok/.test(modal));

// ⚠️ EL ESPEJO NO DECIDE NADA QUE NO PUEDA REHACER EL SERVIDOR.
check('⚠️ El espejo del navegador no lleva el prompt del modelo',
      !/buildShareCopyPrompt|EMOJI_HINTS/.test(espejo));

// ⚠️ EL CONTROLADOR COMPRUEBA LA POLÍTICA ANTES DE ESCRIBIR NADA: un artículo
// no pasa por la varita, su Copy Estratégico es otra cosa.
check('La varita rechaza lo que no tiene regla propia', /if\s*\(!policy\)/.test(ctrl));
check('…y resuelve la entidad con el aislamiento de siempre', /resolveEntity\s*\(/.test(ctrl));

// ════════════════════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} comprobaciones fallaron:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
