// ════════════════════════════════════════════════════════════════════════════
// El copy con el que sale un Reel a las redes — el CRITERIO (v4.1052)
//
// **Puro**: sin base, sin red, sin modelo, sin DOM. Decide qué texto puede
// acompañar a un Reel, cómo se compone uno que cumpla, qué se le dice a quien
// lo edita y con qué palabras se le pide a un modelo que lo reescriba.
//
// ⚠️ UN REEL NO SE PUBLICA COMO UN ARTÍCULO, y de eso cuelga todo lo demás.
// Un post de Facebook admite 63.206 caracteres y un artículo los aprovecha:
// el copy estratégico cuenta la historia entera porque el enlace es lo que se
// pulsa. Un Reel se ve, no se lee — el texto es un pie que aparece recortado
// sobre el video y compite con él. La regla del cliente, con la pieza
// delante: hasta 100 caracteres, un resumen de lo que el Reel muestra de
// verdad, terminado en un emoji pertinente y SIN hashtags.
//
// ⚠️ ESTO SUPERSEDE «EL COPY ES POR RED» (v4.1042) SÓLO PARA EL REEL, y la
// decisión se tomó con el argumento en contra delante. Aquella regla dice que
// un Reel ya tiene su copy escrito para cada plataforma (`ReelCopy`) y que
// mandarle a Facebook el de TikTok sería tirar trabajo pagado. Sigue siendo
// cierto para el trabajo: ese copy es la MATERIA PRIMA de la que sale este
// resumen (`REEL_COPY_BY_NETWORK` sigue decidiendo cuál se lee). Lo que
// cambia es que el texto QUE SALE es uno solo para Facebook e Instagram:
// pedido expreso —«no generar dos copies distintos salvo que en el futuro se
// habilite explícitamente esa funcionalidad»— y además lo único que hace
// verdadera la promesa de una sola fuente de verdad entre el editor, la vista
// previa y lo que recibe Meta.
//
// ⚠️ Y SE ESPEJA EN EL NAVEGADOR (`src/lib/reelShareCopy.ts`), al revés que
// el alcance de la Bandeja (v4.999). La diferencia no es de gusto: aquél
// decide QUIÉN VE QUÉ —aislamiento entre organizaciones, y con dos criterios
// lo que se separa es a qué datos llega alguien—; éste decide la FORMA DE UN
// TEXTO, que hay que pintar mientras se escribe (un contador no puede pagar
// un viaje de red por pulsación) y que el SERVIDOR vuelve a decidir antes de
// publicar. Lo que lo hace seguro es que la prueba compara las SALIDAS de los
// dos módulos sobre una matriz de textos — el patrón de `fxRates` (v4.870) y
// de `checkoutSurcharge` (v4.980).
// ════════════════════════════════════════════════════════════════════════════

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// ─── La política, como DATOS ────────────────────────────────────────────────
//
// Catálogo CERRADO por tipo de entidad. Un `if (entityType === 'reel')`
// repartido por el servicio, el controlador y la pantalla es cómo se llega a
// que una de las tres puertas se olvide —y el fallo sería MUDO: el copy sale
// igual, con sus hashtags—. Acá hay UNA entrada y todo lo demás la consulta.
//
// Hoy sólo el Reel tiene política. Lo que NO la tiene se comporta EXACTAMENTE
// como antes de v4.1052: el artículo conserva sus 63.206 caracteres, sus
// enlaces y su copy por red.
export const REEL_COPY_MAX = 100;

export const COPY_POLICIES = {
    reel: {
        id: 'reel',
        label: 'Reel',
        maxChars: REEL_COPY_MAX,
        requireEmoji: true,
        allowHashtags: false,
        // Un enlace no BLOQUEA: avisa. Ver `validateShareCopy`.
        allowLinks: false,
        // Facebook e Instagram reciben el MISMO texto.
        singleCopy: true,
    },
};

export const COPY_POLICY_IDS = Object.keys(COPY_POLICIES);

/** La política de un tipo de entidad, o `null` cuando no tiene ninguna.
 *  `null` significa «comportate como siempre», no «aplicá la del Reel». */
export const copyPolicyFor = (entityType) => COPY_POLICIES[str(entityType)] || null;

// ─── Cuánto mide un texto ───────────────────────────────────────────────────
//
// ⚠️ SE CUENTA EN PUNTOS DE CÓDIGO, NO EN UNIDADES UTF-16 NI EN GRAFEMAS, y
// los tres dan números distintos sobre el mismo texto. `'🤝'.length` es 2 —el
// contador diría 2 por un carácter que una persona cuenta como 1— y
// `Intl.Segmenter` daría 1 pero **no está garantizado en todos los
// navegadores**: con el servidor contando grafemas y el navegador puntos de
// código, el contador de la pantalla y la puerta de la publicación dirían
// cosas distintas sobre el mismo copy, que es exactamente lo que este módulo
// existe para no tener.
//
// Los puntos de código son idénticos en las dos puntas y sin dependencias. El
// precio conocido: una secuencia ZWJ («👨‍👩‍👧») cuenta 5 en vez de 1. Se
// paga a sabiendas porque el error cae del lado SEGURO —se bloquea antes, y
// nunca se publica un texto que se pase del tope—.
export const copyLength = (text) => [...str(text)].length;

// ─── Hashtags ───────────────────────────────────────────────────────────────
//
// ⚠️ UN TOKEN SÓLO DE DÍGITOS NO ES UN HASHTAG. `#Rotary` lo es; `#1` se lee
// como «número 1» y `#4281` como el número del Distrito, y borrarlos
// destruiría una frase legítima que alguien escribió a propósito. Se exige al
// menos una LETRA. El precio: un `#4281` suelto llega a Meta y ahí se pinta
// como etiqueta. Se acepta a sabiendas — equivocarse hacia el otro lado es
// romper el texto de una persona, que no se deshace.
const HASHTAG = /#(?=[\p{L}\p{N}_]*\p{L})[\p{L}\p{N}_]+/gu;

// ⚠️ `.test()` sobre una regex GLOBAL avanza `lastIndex` y la llamada
// siguiente empieza donde terminó la anterior: la segunda comprobación del
// mismo texto daría `false`. Se pregunta siempre por la LISTA, que no arrastra
// estado.
export const hashtagsIn = (text) => str(text).match(HASHTAG) || [];
export const hasHashtags = (text) => hashtagsIn(text).length > 0;

// ─── Enlaces ────────────────────────────────────────────────────────────────
//
// Lo que una persona reconoce como una dirección: con esquema, con `www.` o un
// dominio suelto con extensión conocida. No se valida que exista: se reconoce
// para poder AVISAR y, si se pide, quitarla.
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[\p{L}\p{N}-]+\.(?:org|com|co|net|edu|info|io|gov|app)(?:\/\S*)?/giu;

export const linksIn = (text) => str(text).match(URL_RE) || [];

// ─── Emoji ──────────────────────────────────────────────────────────────────
//
// ⚠️ `™`, `©`, `®` y `ℹ` SON `Extended_Pictographic` Y NO SON EMOJI. Su
// presentación por defecto es TEXTO: sin el selector `U+FE0F` se dibujan como
// un símbolo tipográfico. Con la prueba ingenua —`\p{Extended_Pictographic}`
// a secas— «Rotary International®» pasaría por «termina en emoji» y el copy
// saldría sin ninguno, que es justo lo que la regla existe para impedir.
//
// La unidad es: un pictográfico de presentación EMOJI por defecto, o uno de
// presentación textual con su `U+FE0F`; con su modificador de tono opcional y
// sus secuencias unidas por `U+200D` (familias, profesiones). Aparte, las
// banderas —dos indicadores regionales— y los teclados numéricos.
const UNIDAD = '(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F)(?:\\p{Emoji_Modifier})?';
const SECUENCIA = `(?:(?:${UNIDAD})(?:\\u200D(?:${UNIDAD}))*|[\\u{1F1E6}-\\u{1F1FF}]{2}|[0-9#*]\\uFE0F?\\u20E3)`;
const EMOJI_TAIL = new RegExp(`(?:${SECUENCIA})+\\s*$`, 'u');
const EMOJI_ANY = new RegExp(SECUENCIA, 'u');

export const endsWithEmoji = (text) => EMOJI_TAIL.test(str(text));
export const hasEmoji = (text) => EMOJI_ANY.test(str(text));

/** Parte un texto en cuerpo y emoji final. Es lo que permite acortar SIN
 *  perder el emoji: sin esto, recortar a 100 caracteres se llevaría justo el
 *  carácter que la regla exige conservar. */
export const splitTrailingEmoji = (text) => {
    const t = str(text);
    const m = t.match(EMOJI_TAIL);
    if (!m) return { body: t, emoji: '' };
    const body = t.slice(0, m.index).replace(/[\s,;:·|—–-]+$/u, '').trim();
    // Un texto que es SÓLO un emoji no tiene cuerpo que separar.
    return { body, emoji: m[0].trim() };
};

// ─── El emoji por defecto ───────────────────────────────────────────────────
//
// De lo exacto a lo inseguro, igual que la varita de íconos (v4.810): primero
// un catálogo DECLARADO de palabras —determinista, gratis y reproducible— y
// sólo el modelo, cuando se le pide expresamente, elige uno por sentido.
//
// ⚠️ EL CATÁLOGO ES UN VALOR POR DEFECTO, NO UNA PROMESA DE PERTINENCIA. La
// pertinencia de verdad la decide quien mira la pieza: el emoji se edita a
// mano y «✨ Regenerar copy» propone uno elegido leyendo el Reel entero.
// Ante la duda, el neutro institucional — nunca un emoji «divertido» sobre
// una pieza que puede ser de una emergencia.
export const EMOJI_HINTS = [
    { test: /\b(terremoto|sismo|emergencia|damnificad|desastre|inundaci|deslizamiento)/i, emoji: '🙏' },
    { test: /\b(agua|acueducto|pozo|potable|saneamiento)/i, emoji: '💧' },
    { test: /\b(salud|m[eé]dic|jornada m[eé]dica|vacuna|hospital|odontol)/i, emoji: '🩺' },
    { test: /\b(educaci|escuela|colegio|beca|estudiante|biblioteca|[uú]tiles)/i, emoji: '📚' },
    { test: /\b(alimento|mercado|comida|nutrici|hambre|desayun)/i, emoji: '🍲' },
    { test: /\b(ropa|prenda|calzado|zapato|abrigo|vestuario)/i, emoji: '👕' },
    { test: /\b(medioambiente|ambiental|[aá]rbol|siembra|reforest|reciclaje|planeta)/i, emoji: '🌱' },
    { test: /\b(ni[ñn]o|infancia|juvenil|juventud|interact)/i, emoji: '🧒' },
    { test: /\b(beca|liderazgo|intercambio|rotaract|capacitaci|taller)/i, emoji: '🎓' },
    { test: /\b(polio|erradic)/i, emoji: '💜' },
    { test: /\b(aniversario|celebra|conferencia|encuentro|congreso)/i, emoji: '🎉' },
    { test: /\b(volunta|servicio|jornada|brigada)/i, emoji: '💪' },
];

const EMOJI_NEUTRO = '🤝';

export const emojiForText = (text) => {
    const t = str(text);
    return (EMOJI_HINTS.find(h => h.test.test(t))?.emoji) || EMOJI_NEUTRO;
};

// ─── Limpiar ────────────────────────────────────────────────────────────────

const normalizeSpaces = (s) => String(s)
    .replace(/[^\S\r\n]+/g, ' ')        // espacios horizontales seguidos
    .replace(/[ \t]*\r?\n[ \t]*/g, '\n')  // el respiro alrededor de un salto
    .replace(/\n{2,}/g, '\n')            // varios saltos son uno
    .replace(/\s+([,.;:!?])/g, '$1')     // el hueco que deja un hashtag antes de un signo
    .replace(/([¡¿])\s+/g, '$1')
    .trim();

/**
 * Quitar lo que la regla excluye y volver a juntar el texto. NO acorta y NO
 * agrega un emoji: son cosas distintas y mezclarlas haría que el botón
 * reescribiera un texto que la persona acaba de escribir.
 *
 * ⚠️ LOS HASHTAGS SE QUITAN SIEMPRE Y LAS DIRECCIONES SÓLO SI SE PIDE, y la
 * asimetría es deliberada. Un hashtag se borra y la frase sigue leyéndose
 * («Gracias #Rotary por todo» → «Gracias por todo»); una dirección suele venir
 * sostenida por una preposición, así que quitarla puede dejar un resto roto
 * («Mirá todo en rotary4281.org» → «Mirá todo en»). Por eso:
 *
 *   · el compositor del servidor la CONSERVA —nadie pidió alterar ese texto, y
 *     una dirección sólo avisa—;
 *   · «Limpiar automáticamente» la QUITA, porque es un gesto expreso y su
 *     resultado se ve en pantalla antes de publicar.
 *
 * La limitación se acepta a sabiendas: sin la dirección puede quedar una
 * preposición colgando, y eso lo corrige quien mira — nunca se publica sin
 * que lo vea.
 */
export const sanitizeShareCopy = (text, { allowHashtags = false, stripLinks = false } = {}) => {
    let t = String(text ?? '');
    if (!allowHashtags) t = t.replace(HASHTAG, '');
    if (stripLinks) t = t.replace(URL_RE, '');
    return normalizeSpaces(t);
};

/** Lo que hace «Limpiar automáticamente»: los hashtags Y las direcciones. */
export const cleanShareCopy = (text, policy = COPY_POLICIES.reel) => {
    const pol = policy || COPY_POLICIES.reel;
    return sanitizeShareCopy(text, { allowHashtags: pol.allowHashtags, stripLinks: !pol.allowLinks });
};

// ─── Acortar sin romper ─────────────────────────────────────────────────────
//
// ⚠️ NUNCA SE PARTE UNA PALABRA, y los puntos suspensivos son el ÚLTIMO
// recurso. El orden es el que pidió el cliente: primero la oración completa
// que quepa —lo que da un texto que se lee entero y no parece cortado—, y
// sólo si ni la primera oración entra, el último límite de palabra con «…».
// Un corte a mitad de palabra se lee como un error del sistema; una oración
// entera, como una decisión.
export const fitShareCopy = (text, max) => {
    const t = str(text);
    const tope = Math.max(1, Number(max) || 0);
    if (copyLength(t) <= tope) return { text: t, shortened: false, cut: null };

    // 1. La mayor cantidad de oraciones COMPLETAS que entren.
    const oraciones = t.match(/[^.!?…]+[.!?…]+(?:\s|$)|[^.!?…]+$/gu) || [t];
    let acumulado = '';
    for (const o of oraciones) {
        const intento = (acumulado + o);
        if (copyLength(intento.trim()) > tope) break;
        acumulado = intento;
    }
    const porOracion = acumulado.trim();
    if (porOracion && copyLength(porOracion) >= Math.min(tope * 0.4, 24)) {
        return { text: porOracion, shortened: true, cut: 'oracion' };
    }

    // 2. El último límite de palabra, reservando el carácter de los puntos
    //    suspensivos. Acá sí hacen falta: sin ellos, una oración cortada a
    //    mitad se lee como un texto roto y no como un resumen.
    const crudo = [...t].slice(0, Math.max(1, tope - 1)).join('');
    const porPalabra = crudo.replace(/\s+\S*$/u, '').replace(/[\s,;:·|—–-]+$/u, '').trim();
    const cuerpo = porPalabra || crudo.trim();
    return { text: `${cuerpo}…`, shortened: true, cut: 'palabra' };
};

// ─── Componer un copy que cumpla ────────────────────────────────────────────

/**
 * De un texto cualquiera —el copy que el Reel ya tenía escrito, su guion, su
 * título— al copy corto que la regla admite.
 *
 * Devuelve además QUÉ hubo que hacerle, porque eso es lo que decide qué se le
 * dice a quien publica: un texto que se acortó a mitad de oración no es lo
 * mismo que uno que ya cumplía, y sólo el primero merece el empujón a
 * «Regenerar copy».
 */
export const composeShareCopy = (raw, { policy = COPY_POLICIES.reel, emoji = null } = {}) => {
    const pol = policy || COPY_POLICIES.reel;
    const original = String(raw ?? '');
    const partido = splitTrailingEmoji(original);
    const cuerpo = sanitizeShareCopy(partido.body, { allowHashtags: pol.allowHashtags });

    if (!cuerpo) {
        // Sin nada que resumir no se inventa un texto: se devuelve vacío y
        // quien llama decide (el título, el guion, o pedirle uno al modelo).
        return { text: '', body: '', emoji: '', shortened: false, cut: null, sanitized: false, empty: true };
    }

    const elegido = pol.requireEmoji
        ? (str(partido.emoji) || str(emoji) || emojiForText(`${cuerpo} ${original}`))
        : str(partido.emoji);
    // El emoji va con su espacio delante, y los dos entran en el tope: el
    // límite es del copy COMPLETO, «incluido el emoji final».
    const reserva = elegido ? copyLength(elegido) + 1 : 0;
    const ajustado = fitShareCopy(cuerpo, pol.maxChars - reserva);
    const texto = elegido ? `${ajustado.text} ${elegido}` : ajustado.text;

    return {
        text: texto,
        body: ajustado.text,
        emoji: elegido,
        shortened: ajustado.shortened,
        cut: ajustado.cut,
        sanitized: cuerpo !== normalizeSpaces(partido.body),
        // Lo que se conservó y la regla excluye: viaja para que la pantalla lo
        // AVISE en vez de descubrirse al publicar.
        links: linksIn(cuerpo),
        empty: false,
    };
};

// ─── El veredicto ───────────────────────────────────────────────────────────
//
// ⚠️ LO QUE BLOQUEA Y LO QUE AVISA SON DOS LISTAS DISTINTAS. Bloquean las
// cuatro condiciones que el cliente enumeró para el momento de publicar:
// vacío, pasado del tope, con hashtags y sin emoji final. Avisa —y NO
// bloquea— una dirección: la regla la excluye y el botón de limpiar la quita,
// pero convertir toda observación en un bloqueo es cómo se llega a que nadie
// las lea (v4.854), y puede haber una necesidad que no conocemos.
export const COPY_ISSUE_CODES = ['empty', 'too_long', 'hashtags', 'no_emoji'];

export const validateShareCopy = (text, policy = COPY_POLICIES.reel) => {
    const pol = policy || COPY_POLICIES.reel;
    const t = str(text);
    const largo = copyLength(t);
    const avisos = [];

    if (!pol.allowLinks && linksIn(t).length) {
        avisos.push({
            code: 'link',
            text: 'El copy lleva una dirección web. En un Reel no se puede pulsar, así que ocupa caracteres sin llevar a ninguna parte.',
            fix: 'Quitala con «Limpiar automáticamente», o dejala si tenés un motivo.',
        });
    }

    if (!t) {
        return {
            ok: false, code: 'empty', length: 0, max: pol.maxChars, warnings: avisos,
            reason: 'Escribí el texto de la publicación: Meta rechaza un video sin nada que decir.',
            fix: 'Podés pedirle uno a la IA con «Regenerar copy».',
        };
    }
    if (!pol.allowHashtags) {
        const tags = hashtagsIn(t);
        if (tags.length) {
            return {
                ok: false, code: 'hashtags', length: largo, max: pol.maxChars, warnings: avisos,
                reason: `Los Reels se publican sin hashtags. Eliminá ${tags.length === 1 ? tags[0] : `${tags.slice(0, 3).join(', ')}${tags.length > 3 ? '…' : ''}`} para continuar.`,
                fix: 'Pulsá «Limpiar automáticamente» y se quitan solos.',
            };
        }
    }
    if (largo > pol.maxChars) {
        return {
            ok: false, code: 'too_long', length: largo, max: pol.maxChars, warnings: avisos,
            reason: `El copy del Reel debe tener máximo ${pol.maxChars} caracteres. Lleva ${largo}.`,
            fix: 'Acortalo a mano o pedile a la IA un resumen con «Regenerar copy».',
        };
    }
    if (pol.requireEmoji && !endsWithEmoji(t)) {
        return {
            ok: false, code: 'no_emoji', length: largo, max: pol.maxChars, warnings: avisos,
            reason: 'El copy del Reel tiene que terminar con un emoji.',
            // No se agrega solo: cuál va depende de lo que el Reel muestra, y
            // elegirlo por la persona sería poner un emoji que no le
            // corresponde a la pieza.
            fix: 'Escribí uno al final, o pedile a la IA que lo elija con «Regenerar copy».',
        };
    }
    return { ok: true, code: null, length: largo, max: pol.maxChars, reason: null, fix: null, warnings: avisos };
};

/**
 * Todo lo que la pantalla necesita para pintarse, en una sola llamada.
 *
 * `canClean` sólo es cierto cuando el botón de limpiar DE VERDAD cambiaría
 * algo: uno que no hace nada es peor que ninguno (v4.650).
 */
export const describeShareCopy = (text, policy = COPY_POLICIES.reel) => {
    const pol = policy || COPY_POLICIES.reel;
    const t = String(text ?? '');
    const v = validateShareCopy(t, pol);
    const limpio = cleanShareCopy(t, pol);
    return {
        ...v,
        remaining: pol.maxChars - v.length,
        over: Math.max(0, v.length - pol.maxChars),
        hashtags: hashtagsIn(t),
        links: linksIn(t),
        endsWithEmoji: endsWithEmoji(t),
        canClean: limpio !== str(t) && !!limpio,
        cleaned: limpio,
    };
};

// ─── Lo que se le pide a un modelo ──────────────────────────────────────────
//
// ⚠️ EL MODELO ESCRIBE Y EL CÓDIGO DECIDE. Es la regla del sitio desde
// `templateComposer.js`: las reglas de este copy son aritmética —cuántos
// caracteres, si hay un `#`, si el último carácter es un emoji— y un modelo
// las incumple con naturalidad aunque se le pidan. Se le devuelve LA REGLA
// CONCRETA que rompió y se reintenta; pedirle «revisá el formato» no corrige
// nada.
export const COPY_RULES_TEXT = (pol = COPY_POLICIES.reel) => `REGLAS DEL COPY (obligatorias, se comprueban por código):
1. MÁXIMO ${pol.maxChars} CARACTERES en total, contando el emoji final y los espacios.
2. Es un RESUMEN de lo que el video muestra de verdad: qué se hizo, quién lo hizo y para quién. Nada genérico ni intercambiable con cualquier otra pieza.
3. Termina SIEMPRE con UN emoji, y ese emoji tiene que ser pertinente a lo que se cuenta.
4. SIN hashtags. Ni uno. Ni al final ni dentro de la frase.
5. SIN direcciones web ni «link en la bio».
6. Tono institucional y humano, en español neutro. Sin signos de exclamación encadenados y sin mayúsculas sostenidas.
7. Una sola frase, o dos muy cortas. Nada de listas ni de saltos de línea.
8. Si no entrás en ${pol.maxChars} caracteres, REESCRIBILO más conciso. No lo cortes ni lo termines en puntos suspensivos.`;

/** El contexto se arma con lo que se SABE del Reel, y lo que no se sabe NO se
 *  menciona: un hueco en silencio es una invitación a que el modelo lo llene
 *  (la lección de v4.783 y v4.967). */
export const buildShareCopyPrompt = ({
    policy = COPY_POLICIES.reel,
    title = '', organizationName = '', publicationType = '', interestArea = '',
    narration = '', existingCopy = '', sourceContext = '', campaign = '',
    durationSec = null, sceneCount = null, factsBrief = '', instruction = '',
} = {}) => {
    const pol = policy || COPY_POLICIES.reel;
    const bloque = (rotulo, valor) => (str(valor) ? `${rotulo}: ${str(valor)}` : null);
    const datos = [
        bloque('Título de la pieza', title),
        bloque('Organización que publica', organizationName),
        bloque('Tipo de publicación', publicationType),
        bloque('Área de enfoque Rotary', interestArea),
        bloque('Campaña', campaign),
        durationSec != null && Number.isFinite(Number(durationSec))
            ? `Duración del video: ${Number(durationSec).toFixed(1)} s` : null,
        sceneCount != null && Number.isFinite(Number(sceneCount))
            ? `Escenas: ${sceneCount}` : null,
        bloque('Guion hablado del video', narration),
        bloque('Copy largo que ya tiene escrito (materia prima, NO lo copies tal cual)', existingCopy),
        bloque('Contexto de origen', sourceContext),
    ].filter(Boolean);

    return [
        `Escribí el pie con el que este Reel sale publicado en Facebook e Instagram.`,
        '',
        COPY_RULES_TEXT(pol),
        '',
        'LO QUE SE SABE DE LA PIEZA:',
        datos.length ? datos.join('\n') : '(sin más contexto que el título)',
        factsBrief ? `\n${factsBrief}` : '',
        str(instruction) ? `\nAJUSTE PEDIDO: ${str(instruction)}` : '',
        '',
        'Ejemplo del largo y el tono que se busca:',
        '"Rotary Popayán entregó prendas y calzado para apoyar a familias afectadas en Sevilla. 🤝"',
        '',
        'Devolvé SOLO un JSON: {"copy":"…"}. Sin explicaciones, sin comentarios y sin hashtags.',
    ].filter(l => l !== '').join('\n');
};

/** Lo que contestó el modelo, leído sin confiar en la forma.
 *
 *  Un modelo devuelve el JSON pedido, o el JSON dentro de un bloque de código,
 *  o el texto suelto entre comillas, o con un «Copy:» delante. Se aceptan las
 *  cuatro formas y se descarta lo que sobra: rechazar por el envoltorio
 *  gastaría un reintento por un problema que no es del texto. */
export const readShareCopy = (raw) => {
    let t = String(raw ?? '').trim();
    if (!t) return '';
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();
    try {
        const o = JSON.parse(t);
        if (o && typeof o === 'object') {
            const v = o.copy ?? o.text ?? o.caption ?? o.mensaje;
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
        if (typeof o === 'string' && o.trim()) return o.trim();
    } catch { /* no era JSON: se lee como texto */ }
    const m = t.match(/"copy"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
    if (m) { try { return JSON.parse(`"${m[1]}"`).trim(); } catch { /* sigue */ } }
    return t
        .replace(/^\s*(?:copy|texto|caption|pie)\s*[:=]\s*/i, '')
        .split(/\r?\n/)[0]
        .replace(/^["'«“]+|["'»”]+$/g, '')
        .trim();
};

/** La regla concreta que rompió, para devolvérsela al modelo. */
export const retryInstructionFor = (veredicto, pol = COPY_POLICIES.reel) => {
    const p = pol || COPY_POLICIES.reel;
    switch (veredicto?.code) {
        case 'too_long':
            return `El texto anterior tenía ${veredicto.length} caracteres y el máximo son ${p.maxChars}. Reescribilo más corto conservando el sentido — no lo cortes, escribí otra frase más concisa. Acordate de que el emoji final también cuenta.`;
        case 'hashtags':
            return `El texto anterior llevaba hashtags (${(veredicto.hashtags || []).join(' ') || 'al menos uno'}). Escribilo otra vez SIN un solo «#», con la frase completa y natural.`;
        case 'no_emoji':
            return 'El texto anterior no terminaba con un emoji. Escribilo otra vez y cerralo con UN emoji pertinente a lo que se cuenta.';
        case 'empty':
            return 'No devolviste ningún texto. Devolvé el JSON {"copy":"…"} con el pie del video.';
        default:
            return 'Reescribilo cumpliendo todas las reglas.';
    }
};

export default {
    REEL_COPY_MAX, COPY_POLICIES, COPY_POLICY_IDS, copyPolicyFor,
    copyLength, hashtagsIn, hasHashtags, linksIn,
    endsWithEmoji, hasEmoji, splitTrailingEmoji, EMOJI_HINTS, emojiForText,
    sanitizeShareCopy, cleanShareCopy, fitShareCopy, composeShareCopy,
    COPY_ISSUE_CODES, validateShareCopy, describeShareCopy,
    COPY_RULES_TEXT, buildShareCopyPrompt, readShareCopy, retryInstructionFor,
};
