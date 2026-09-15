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
        // Un Reel no lleva enlace: lo que se publica es el archivo.
        wantsLink: false,
        // Facebook e Instagram reciben el MISMO texto.
        singleCopy: true,
        // ⚠️ LOS RÓTULOS SON DATOS DE LA POLÍTICA, no cadenas escritas dentro
        // del validador. Con el texto pegado al `if`, agregar una política
        // nueva obligaría a un `if (pol.id === …)` por mensaje, y el copy de
        // un artículo diría «El copy del Reel». Los valores de acá reproducen
        // LETRA POR LETRA los de antes de v4.1061: el Reel no cambia en nada.
        subject: 'Reel',
        hashtagReason: 'Los Reels se publican sin hashtags.',
        emptyReason: 'Escribí el texto de la publicación: Meta rechaza un video sin nada que decir.',
        linkNote: 'El copy lleva una dirección web. En un Reel no se puede pulsar, así que ocupa caracteres sin llevar a ninguna parte.',
    },
};

// ─── El artículo: una política POR RED ──────────────────────────────────────
//
// ⚠️ UN REEL LLEVA UNA SOLA POLÍTICA Y UN ARTÍCULO LLEVA UNA POR RED, y la
// diferencia no es de gusto. El Reel es UNA pieza de video que sale con el
// mismo pie a Facebook e Instagram (`singleCopy: true`); un artículo es un
// ENLACE, y los 280 caracteres de X y los 3.000 de LinkedIn no admiten el
// mismo texto. Por eso `copyPolicyFor` recibe la RED: sin ella, el tope de
// una acabaría aplicado a la otra y el fallo sería MUDO —el contador diría un
// número y el proveedor rechazaría otro—.
//
// ⚠️ TRES DE LOS CUATRO TOPES SON EL REAL DE LA PLATAFORMA y uno es
// EDITORIAL, y conviene tenerlo escrito: Instagram (2.200), X (280) y
// LinkedIn (3.000) son lo que la red acepta. Facebook admite 63.206 —un tope
// con el que el contador no diría nada—, así que el suyo es NUESTRO: 2.000
// caracteres son las «2 a 4 párrafos breves» que el pedido describe, y por
// encima de eso el feed corta con «Ver más» y el llamado a la acción queda
// debajo del pliegue.
//
// ⚠️ EL ENLACE CUENTA COMO LOS CARACTERES QUE MIDE. X lo contrae a 23 en
// t.co, así que acá se cuenta de MÁS — hacia el lado seguro, que es el que no
// deja publicar de largo.
export const ARTICLE_COPY_NETWORKS = ['facebook', 'instagram', 'x', 'linkedin'];

const articlePolicy = (id, label, subject, maxChars, extra = {}) => ({
    id: `post:${id}`,
    network: id,
    label,
    subject,
    maxChars,
    // ⚠️ NINGUNA POLÍTICA DE ARTÍCULO PIDE EMOJI. Es una regla del Reel —su
    // pie mide 100 caracteres y el emoji lo cierra—; exigirlo en un artículo
    // institucional de LinkedIn sería una regla que nadie pidió.
    requireEmoji: false,
    // ⚠️ SIN HASHTAGS, QUE ES EL PUNTO DE TODO ESTO. La estructura del copy
    // termina en la dirección: gancho, contexto, llamado a la acción y enlace.
    allowHashtags: false,
    allowLinks: true,
    // ⚠️ `wantsLink` DECLARA, NO BLOQUEA, y el nombre lo dice a propósito.
    // El enlace no es decorativo —es a dónde va quien lee— así que el
    // compositor lo reserva, el redactor lo tiene que escribir y el bucle de
    // la IA reintenta sin él. Lo que NO hace es impedir publicar: en Facebook
    // el enlace viaja en su PROPIO campo y Meta arma la tarjeta igual, así
    // que un texto sin la URL se publica bien. Bloquearlo sería rechazar de
    // más (v4.1042) y dejaría sin publicar un pie perfectamente válido.
    wantsLink: true,
    // Cada red recibe SU texto.
    singleCopy: false,
    // ⚠️ UN ARTÍCULO SE ESCRIBE EN PÁRRAFOS. El pedido lo dice para Facebook
    // («2 a 4 párrafos cortos») y vale para las cuatro: la línea en blanco
    // separa el gancho del contexto y el contexto del llamado a la acción.
    // Un Reel NO la lleva —son 100 caracteres corridos— y por eso es una
    // declaración de la política y no una constante del saneado.
    multiline: true,
    hashtagReason: 'Las publicaciones de un artículo salen sin hashtags.',
    emptyReason: 'Escribí el texto de la publicación: Meta rechaza una publicación sin nada que decir.',
    linkNote: '',
    linkMissingNote: 'El texto no termina con la dirección de la noticia: la publicación la cuenta y no lleva a ella.',
    ...extra,
});

export const ARTICLE_COPY_POLICIES = {
    facebook: articlePolicy('facebook', 'Facebook', 'artículo en Facebook', 2000, {
        shape: 'Dos a cuatro párrafos breves, humanos y con contexto.',
        // En Facebook el enlace viaja aparte, así que la tarjeta sale igual:
        // el aviso dice lo que de verdad se pierde, no que no se pueda.
        linkMissingNote: 'El texto no termina con la dirección de la noticia. La tarjeta de Facebook sale igual —el enlace viaja aparte— pero el copy no invita a abrirla.',
    }),
    // ⚠️ INSTAGRAM NO LLEVA ENLACE, ni pegado al final. Un pie de Instagram no
    // hace pulsable una dirección: escribirla ocupa caracteres y no lleva a
    // ninguna parte —la misma razón por la que el Reel tampoco la lleva—. Así
    // que ni se compone ni se pide, y la que alguien pegue a mano AVISA y se
    // puede quitar de un clic. Hoy un artículo ni siquiera llega acá
    // (`NETWORKS.instagram` declara `kinds: ['video']`): la política existe
    // para que el día que se pueda, el texto no salga prometiendo un enlace
    // muerto.
    instagram: articlePolicy('instagram', 'Instagram', 'artículo en Instagram', 2200, {
        allowLinks: false,
        wantsLink: false,
        shape: 'Más visual y emocional, en pocas líneas.',
        linkNote: 'El copy lleva una dirección web. En Instagram no se puede pulsar: ocupa caracteres sin llevar a ninguna parte.',
    }),
    x: articlePolicy('x', 'X (Twitter)', 'artículo en X', 280, {
        shape: 'Una sola idea: gancho, el dato esencial y el enlace.',
    }),
    linkedin: articlePolicy('linkedin', 'LinkedIn', 'artículo en LinkedIn', 3000, {
        shape: 'Institucional y profesional, con el impacto explicado.',
    }),
};

export const COPY_POLICY_IDS = Object.keys(COPY_POLICIES);

/**
 * La política de un tipo de entidad, o `null` cuando no tiene ninguna.
 * `null` significa «comportate como siempre», no «aplicá la del Reel».
 *
 * ⚠️ `network` ES ADITIVO: `copyPolicyFor('reel')` devuelve lo de siempre y
 * `copyPolicyFor('post')` SIN red sigue devolviendo `null` —el artículo se
 * comporta como antes de v4.1061 para cualquier camino que no sepa de redes—.
 * Sólo con la red se entrega la política del artículo, que es cuando de verdad
 * se sabe contra qué tope medir.
 */
export const copyPolicyFor = (entityType, network = '') => {
    const tipo = str(entityType);
    const red = str(network).toLowerCase();
    if (tipo === 'post') return (red && ARTICLE_COPY_POLICIES[red]) || null;
    return COPY_POLICIES[tipo] || null;
};

/** Todas las políticas de un tipo, por red. Es lo que la pantalla necesita
 *  para pintar el contador de la pestaña activa sin pagar un viaje de red por
 *  pulsación; `null` para lo que no tiene política por red. */
export const copyPoliciesFor = (entityType) =>
    (str(entityType) === 'post' ? { ...ARTICLE_COPY_POLICIES } : null);

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

/**
 * ⚠️ UN COPY DE UNA LÍNEA Y UNO DE VARIOS PÁRRAFOS NO SE JUNTAN IGUAL, y
 * confundirlos destruye la estructura que el pedido pide. El copy de un Reel
 * son 100 caracteres corridos: ahí dos saltos seguidos son un descuido y se
 * funden. El de un ARTÍCULO es gancho, contexto, llamado a la acción y enlace
 * —«2 a 4 párrafos cortos» en Facebook—, así que la línea en blanco ES la
 * estructura. Con `keepParagraphs` se conserva UNA línea en blanco (nunca
 * más), que es lo que separa dos párrafos sin dejar huecos.
 */
const normalizeSpaces = (s, { keepParagraphs = false } = {}) => String(s)
    .replace(/[^\S\r\n]+/g, ' ')        // espacios horizontales seguidos
    .replace(/[ \t]*\r?\n[ \t]*/g, '\n')  // el respiro alrededor de un salto
    .replace(keepParagraphs ? /\n{3,}/g : /\n{2,}/g, keepParagraphs ? '\n\n' : '\n')
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
export const sanitizeShareCopy = (text, { allowHashtags = false, stripLinks = false, keepParagraphs = false } = {}) => {
    let t = String(text ?? '');
    if (!allowHashtags) t = t.replace(HASHTAG, '');
    if (stripLinks) t = t.replace(URL_RE, '');
    return normalizeSpaces(t, { keepParagraphs });
};

/** Lo que hace «Limpiar automáticamente»: los hashtags Y las direcciones. */
export const cleanShareCopy = (text, policy = COPY_POLICIES.reel) => {
    const pol = policy || COPY_POLICIES.reel;
    return sanitizeShareCopy(text, {
        allowHashtags: pol.allowHashtags,
        stripLinks: !pol.allowLinks,
        // Limpiar no puede aplanar la estructura: un artículo se escribe en
        // párrafos y el botón existe para quitar hashtags, no para rehacer la
        // maquetación de un texto que alguien acaba de revisar.
        keepParagraphs: !!pol.multiline,
    });
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

// ─── El copy de un artículo, compuesto SIN modelo ───────────────────────────
//
// ⚠️ ABRIR EL MODAL NO CUESTA UNA LLAMADA AL MODELO (la regla de v4.1052).
// El copy por defecto se COMPONE con lo que el artículo ya tiene escrito: su
// Copy Estratégico, o su extracto, o su título. La IA es el gesto EXPRESO
// —«Regenerar copy», «Acortar con IA»—, no lo que ocurre por abrir una
// pantalla en la que quizá nadie va a publicar nada.
//
// ⚠️ LA ESTRUCTURA ES GANCHO + CONTEXTO + LLAMADO A LA ACCIÓN + ENLACE, y el
// cierre lo pone el CÓDIGO. Dejárselo al modelo significaría que un reintento
// fallido entrega una publicación sin dirección —que es la mitad del sentido
// de compartir una noticia— y que la URL se pueda reescribir por el camino.
export const ARTICLE_CTA = 'Conocé la historia completa:';

/**
 * De lo que el artículo ya tiene escrito al copy de UNA red.
 *
 * ⚠️ EL ENLACE SE RESERVA ANTES DE ACORTAR. Al revés —acortar el cuerpo al
 * tope y pegarle la URL después— el resultado se pasa SIEMPRE por el largo del
 * cierre, y en X eso son 280 + 60. El tope es del texto COMPLETO, que es lo
 * que el proveedor mide.
 */
export const composeArticleCopy = ({
    source = '', title = '', publicUrl = '', cta = '',
    policy = ARTICLE_COPY_POLICIES.facebook,
} = {}) => {
    const pol = policy || ARTICLE_COPY_POLICIES.facebook;
    const url = str(publicUrl);
    const llamado = str(cta) || ARTICLE_CTA;

    // Del cuerpo se quitan los hashtags —la regla— y las direcciones: la
    // única que va es la del cierre, y una repetida adentro gasta caracteres
    // llevando dos veces al mismo sitio.
    const cuerpo = sanitizeShareCopy(str(source) || str(title), {
        allowHashtags: pol.allowHashtags,
        stripLinks: true,
        // ⚠️ EL CUERPO CONSERVA SUS PÁRRAFOS. Aplanarlo dejaba a Facebook con
        // un solo bloque corrido donde el pedido pide «2 a 4 párrafos
        // cortos», y era el propio saneado —escrito para el copy de una línea
        // de un Reel— el que se los comía.
        keepParagraphs: !!pol.multiline,
    });

    const cierre = url && pol.allowLinks ? `${llamado} ${url}` : '';
    // Dos saltos de línea entre el cuerpo y el cierre: cuentan, así que se
    // reservan.
    const reserva = cierre ? copyLength(cierre) + 2 : 0;
    const ajustado = fitShareCopy(cuerpo, Math.max(0, pol.maxChars - reserva));
    const texto = cierre
        ? (ajustado.text ? `${ajustado.text}\n\n${cierre}` : cierre)
        : ajustado.text;

    const crudo = str(source) || str(title);
    return {
        text: texto,
        body: ajustado.text,
        cta: cierre,
        shortened: ajustado.shortened,
        cut: ajustado.cut,
        // Si hubo que quitarle algo —hashtags o una dirección repetida—. Es lo
        // que permite DECIR «el redactor devolvió hashtags y se quitaron» en
        // vez de entregar el texto ajustado como si fuera el suyo.
        sanitized: !!crudo && cuerpo !== normalizeSpaces(crudo, { keepParagraphs: !!pol.multiline }),
        hashtags: hashtagsIn(crudo),
        // Sin cuerpo Y sin enlace no hay copy: quien llama decide qué hacer
        // —pedirle uno al modelo— en vez de recibir una cadena vacía que se
        // pinte como si fuera un texto.
        empty: !texto,
    };
};

/** El copy por defecto de CADA red, compuesto de una vez. Lo consume el
 *  servidor al abrir el modal: con una composición por pestaña, cambiar de
 *  pestaña pediría al servidor lo que ya se podía saber. */
export const defaultArticleCopies = ({ source = '', title = '', publicUrl = '', cta = '' } = {}) => {
    const out = {};
    for (const red of ARTICLE_COPY_NETWORKS) {
        out[red] = composeArticleCopy({ source, title, publicUrl, cta, policy: ARTICLE_COPY_POLICIES[red] }).text;
    }
    return out;
};

// ─── El veredicto ───────────────────────────────────────────────────────────
//
// ⚠️ LO QUE BLOQUEA Y LO QUE AVISA SON DOS LISTAS DISTINTAS. Bloquean las
// cuatro condiciones que el cliente enumeró para el momento de publicar:
// vacío, pasado del tope, con hashtags y sin emoji final. Avisan DOS cosas
// sobre la dirección: la que sobra —en un Reel no se puede pulsar— y la que
// falta —un artículo cierra con ella—. Ninguna detiene la publicación:
// convertir toda observación en un bloqueo es cómo se llega a que nadie las
// lea (v4.854), y puede haber una necesidad que no conocemos.
export const COPY_ISSUE_CODES = ['empty', 'too_long', 'hashtags', 'no_emoji'];

/** Lo que AVISA. Un aviso se ve y no detiene la publicación. */
export const COPY_WARNING_CODES = ['link', 'no_link'];

export const validateShareCopy = (text, policy = COPY_POLICIES.reel) => {
    const pol = policy || COPY_POLICIES.reel;
    const t = str(text);
    const largo = copyLength(t);
    const avisos = [];

    if (!pol.allowLinks && linksIn(t).length) {
        avisos.push({
            code: 'link',
            text: pol.linkNote || 'El copy lleva una dirección web. En un Reel no se puede pulsar, así que ocupa caracteres sin llevar a ninguna parte.',
            fix: 'Quitala con «Limpiar automáticamente», o dejala si tenés un motivo.',
        });
    }
    // ⚠️ LA DIRECCIÓN QUE FALTA AVISA; NO BLOQUEA. La estructura que se pide
    // —gancho, contexto, llamado a la acción y enlace— la garantiza el
    // COMPOSITOR, que reserva el cierre antes de acortar, y el bucle de la IA,
    // que reintenta sin él. Acá manda la otra regla: sólo se bloquea lo que la
    // red rechaza seguro (v4.1042), y Facebook publica igual porque el enlace
    // va en su propio campo. Con el bloqueo puesto, alguien que borra la URL a
    // propósito se queda sin poder publicar un texto correcto.
    if (t && pol.wantsLink && !linksIn(t).length) {
        avisos.push({
            code: 'no_link',
            text: pol.linkMissingNote || 'El texto no termina con la dirección de la noticia: la publicación la cuenta y no lleva a ella.',
            fix: 'Pedile a la IA que la escriba con «Regenerar copy», o pegala al final.',
        });
    }

    if (!t) {
        return {
            ok: false, code: 'empty', length: 0, max: pol.maxChars, warnings: avisos,
            reason: pol.emptyReason || 'Escribí el texto de la publicación: Meta rechaza un video sin nada que decir.',
            fix: 'Podés pedirle uno a la IA con «Regenerar copy».',
        };
    }
    if (!pol.allowHashtags) {
        const tags = hashtagsIn(t);
        if (tags.length) {
            return {
                ok: false, code: 'hashtags', length: largo, max: pol.maxChars, warnings: avisos,
                reason: `${pol.hashtagReason || 'Los Reels se publican sin hashtags.'} Eliminá ${tags.length === 1 ? tags[0] : `${tags.slice(0, 3).join(', ')}${tags.length > 3 ? '…' : ''}`} para continuar.`,
                fix: 'Pulsá «Limpiar automáticamente» y se quitan solos.',
            };
        }
    }
    if (largo > pol.maxChars) {
        return {
            ok: false, code: 'too_long', length: largo, max: pol.maxChars, warnings: avisos,
            reason: `El copy del ${pol.subject || 'Reel'} debe tener máximo ${pol.maxChars} caracteres. Lleva ${largo}.`,
            fix: 'Acortalo a mano o pedile a la IA un resumen con «Regenerar copy».',
        };
    }
    if (pol.requireEmoji && !endsWithEmoji(t)) {
        return {
            ok: false, code: 'no_emoji', length: largo, max: pol.maxChars, warnings: avisos,
            reason: `El copy del ${pol.subject || 'Reel'} tiene que terminar con un emoji.`,
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

// ─── Lo que se le pide a un modelo para un ARTÍCULO ─────────────────────────
//
// ⚠️ LA INSTRUCCIÓN CENTRAL ES LA QUE DICTÓ EL CLIENTE, LETRA POR LETRA
// (`ARTICLE_BRIEF`). No se parafrasea ni se «mejora»: es el encargo, y
// reescribirlo es cómo el copy deja de parecerse a lo que se pidió sin que
// nadie sepa cuándo cambió. Lo que el código agrega alrededor son las reglas
// que además COMPRUEBA — el modelo escribe y el código decide.
export const ARTICLE_BRIEF = (plataforma) => `Analiza la noticia completa y conviértela en una publicación optimizada para ${plataforma}. No copies literalmente el artículo. Identifica primero el elemento con mayor capacidad de captar atención y utilízalo como gancho. Después explica brevemente el contexto y termina con un llamado a la acción natural para consultar la noticia completa. Mantén un tono institucional, humano, claro y profesional. No utilices hashtags, etiquetas ni listas de keywords. No inventes personas, cifras, organizaciones, hechos ni resultados que no aparezcan en la noticia. Incluye al final únicamente la URL pública/canónica proporcionada por el sistema. Respeta estrictamente las limitaciones de longitud de ${plataforma}.`;

export const ARTICLE_COPY_RULES_TEXT = (pol = ARTICLE_COPY_POLICIES.facebook, publicUrl = '') => {
    const p = pol || ARTICLE_COPY_POLICIES.facebook;
    const url = str(publicUrl);
    return `REGLAS DEL COPY (obligatorias, se comprueban por código):
1. MÁXIMO ${p.maxChars} CARACTERES en total, contando los espacios, los saltos de línea y la dirección final.
2. ESTRUCTURA: gancho, contexto breve, llamado a la acción y la dirección. En ese orden.
3. SIN hashtags. Ni uno. Ni al final ni dentro de la frase. Tampoco listas de palabras clave ni etiquetas.
4. ${url ? `TERMINÁ con esta dirección EXACTA, sin acortarla ni cambiarle nada: ${url}` : 'No inventes ninguna dirección: no se te dio ninguna.'}
5. NO inventes personas, cifras, organizaciones, hechos ni resultados que no estén en la noticia. Si un dato no aparece, no lo menciones.
6. ${p.shape || 'Tono institucional, humano, claro y profesional.'}
7. Sin mayúsculas sostenidas y sin signos de exclamación encadenados.
8. Si no entrás en ${p.maxChars} caracteres, REESCRIBILO más conciso. No lo cortes ni lo termines en puntos suspensivos.`;
};

/** El contexto de la noticia. Lo que no se sabe NO se menciona: un hueco en
 *  silencio es una invitación a que el modelo lo llene (v4.783, v4.967). */
export const buildArticleCopyPrompt = ({
    policy = ARTICLE_COPY_POLICIES.facebook,
    title = '', excerpt = '', body = '', organizationName = '',
    existingCopy = '', publicUrl = '', instruction = '',
} = {}) => {
    const pol = policy || ARTICLE_COPY_POLICIES.facebook;
    const bloque = (rotulo, valor) => (str(valor) ? `${rotulo}: ${str(valor)}` : null);
    const datos = [
        bloque('Titular de la noticia', title),
        bloque('Organización que publica', organizationName),
        bloque('Extracto', excerpt),
        // El cuerpo se acota: lo que decide el gancho está arriba, y mandar el
        // artículo entero gasta el presupuesto de entrada en párrafos que no
        // cambian el resultado.
        bloque('Cuerpo de la noticia', str(body).slice(0, 4000)),
        bloque('Copy que ya tiene escrito (materia prima, NO lo copies tal cual)', existingCopy),
    ].filter(Boolean);

    return [
        ARTICLE_BRIEF(pol.label),
        '',
        ARTICLE_COPY_RULES_TEXT(pol, publicUrl),
        '',
        'LA NOTICIA:',
        datos.length ? datos.join('\n') : '(sin más contexto que el titular)',
        str(instruction) ? `\nAJUSTE PEDIDO: ${str(instruction)}` : '',
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
        case 'no_link':
            return 'El texto anterior no terminaba con la dirección pública. Escribilo otra vez y cerralo con la URL EXACTA que se te dio, sin acortarla y sin inventar otra.';
        case 'empty':
            return 'No devolviste ningún texto. Devolvé el JSON {"copy":"…"} con el pie del video.';
        default:
            return 'Reescribilo cumpliendo todas las reglas.';
    }
};

export default {
    REEL_COPY_MAX, COPY_POLICIES, COPY_POLICY_IDS, copyPolicyFor, copyPoliciesFor,
    ARTICLE_COPY_POLICIES, ARTICLE_COPY_NETWORKS, ARTICLE_CTA,
    composeArticleCopy, defaultArticleCopies,
    ARTICLE_BRIEF, ARTICLE_COPY_RULES_TEXT, buildArticleCopyPrompt,
    copyLength, hashtagsIn, hasHashtags, linksIn,
    endsWithEmoji, hasEmoji, splitTrailingEmoji, EMOJI_HINTS, emojiForText,
    sanitizeShareCopy, cleanShareCopy, fitShareCopy, composeShareCopy,
    COPY_ISSUE_CODES, COPY_WARNING_CODES, validateShareCopy, describeShareCopy,
    COPY_RULES_TEXT, buildShareCopyPrompt, readShareCopy, retryInstructionFor,
};
