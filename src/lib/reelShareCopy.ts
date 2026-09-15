/**
 * El copy con el que sale un Reel a las redes — el espejo del navegador
 * (v4.1052).
 *
 * ⚠️ ESTE ESPEJO SÍ TRAE EL CRITERIO, al revés que `socialShare.ts`. La
 * diferencia no es de gusto y conviene tenerla escrita: aquél deja fuera el
 * ALCANCE —quién puede publicar en qué página— porque con dos criterios lo que
 * se separa es en la cuenta de qué organización aparece una publicación.
 * Éste decide la FORMA DE UN TEXTO, que hay que pintar MIENTRAS SE ESCRIBE: un
 * contador «72 / 100» no puede pagar un viaje de red por pulsación. Y el
 * servidor vuelve a decidir antes de publicar, así que el navegador no es la
 * última palabra sobre nada.
 *
 * ⚠️ LO QUE NO TRAE, a propósito: el prompt del modelo, cómo se lee su
 * respuesta y qué se le reintenta. Eso es del servidor —es quien llama al
 * proveedor— y copiarlo acá daría dos formas de pedir el mismo texto. Una
 * prueba comprueba su AUSENCIA.
 *
 * ⚠️ AL TOCAR ESTE ARCHIVO, TOCAR `server/lib/reelShareCopy.js`. La prueba
 * compara las SALIDAS de los dos sobre una matriz de textos, no que se
 * parezcan (el patrón de `fxRates` y de `checkoutSurcharge`).
 */

export interface CopyPolicy {
    id: string;
    label: string;
    maxChars: number;
    requireEmoji: boolean;
    allowHashtags: boolean;
    allowLinks: boolean;
    singleCopy: boolean;
    /** ⚠️ DECLARA, NO BLOQUEA. Un artículo quiere cerrar con su dirección
     *  pública y un Reel no lleva ninguna; lo que falta AVISA. ADITIVO: sin
     *  el campo se comporta como antes. */
    wantsLink?: boolean;
    /** Qué se pierde cuando falta. Es del policy porque en Facebook el enlace
     *  viaja aparte y en X no. */
    linkMissingNote?: string;
    /** La red a la que corresponde, cuando la política es por red. */
    network?: string;
    /** ⚠️ LOS RÓTULOS SON DATOS DE LA POLÍTICA, no cadenas escritas dentro del
     *  validador: con el texto pegado al `if`, el copy de un artículo diría
     *  «El copy del Reel». Los valores por omisión de abajo reproducen LETRA
     *  POR LETRA los de antes de v4.1061. */
    subject?: string;
    hashtagReason?: string;
    emptyReason?: string;
    linkNote?: string;
    /** Qué forma se le pide al modelo. La pantalla la muestra como ayuda. */
    shape?: string;
}

export const REEL_COPY_MAX = 100;

export const REEL_COPY_POLICY: CopyPolicy = {
    id: 'reel',
    label: 'Reel',
    maxChars: REEL_COPY_MAX,
    requireEmoji: true,
    allowHashtags: false,
    allowLinks: false,
    wantsLink: false,
    singleCopy: true,
    subject: 'Reel',
    hashtagReason: 'Los Reels se publican sin hashtags.',
    emptyReason: 'Escribí el texto de la publicación: Meta rechaza un video sin nada que decir.',
    linkNote: 'El copy lleva una dirección web. En un Reel no se puede pulsar, así que ocupa caracteres sin llevar a ninguna parte.',
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** ⚠️ PUNTOS DE CÓDIGO, no unidades UTF-16 ni grafemas: es la única cuenta
 *  idéntica en el servidor y en el navegador sin depender de `Intl.Segmenter`.
 *  Con dos cuentas, el contador de la pantalla y la puerta de la publicación
 *  dirían cosas distintas del mismo copy. */
export const copyLength = (text: string | null | undefined): number => [...str(text)].length;

/** Un token sólo de dígitos NO es un hashtag: «#1» se lee como «número 1». */
const HASHTAG = /#(?=[\p{L}\p{N}_]*\p{L})[\p{L}\p{N}_]+/gu;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[\p{L}\p{N}-]+\.(?:org|com|co|net|edu|info|io|gov|app)(?:\/\S*)?/giu;

export const hashtagsIn = (text: string | null | undefined): string[] => str(text).match(HASHTAG) || [];
export const linksIn = (text: string | null | undefined): string[] => str(text).match(URL_RE) || [];

/** ⚠️ `™`, `©` y `®` son `Extended_Pictographic` y NO son emoji: su
 *  presentación por defecto es texto. Sin esta distinción, «Rotary
 *  International®» pasaría por «termina en emoji». */
const UNIDAD = '(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F)(?:\\p{Emoji_Modifier})?';
const SECUENCIA = `(?:(?:${UNIDAD})(?:\\u200D(?:${UNIDAD}))*|[\\u{1F1E6}-\\u{1F1FF}]{2}|[0-9#*]\\uFE0F?\\u20E3)`;
const EMOJI_TAIL = new RegExp(`(?:${SECUENCIA})+\\s*$`, 'u');

export const endsWithEmoji = (text: string | null | undefined): boolean => EMOJI_TAIL.test(str(text));

const normalizeSpaces = (s: string): string => String(s)
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/[ \t]*\r?\n[ \t]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([¡¿])\s+/g, '$1')
    .trim();

export const sanitizeShareCopy = (
    text: string | null | undefined,
    { allowHashtags = false, stripLinks = false }: { allowHashtags?: boolean; stripLinks?: boolean } = {}
): string => {
    let t = String(text ?? '');
    if (!allowHashtags) t = t.replace(HASHTAG, '');
    if (stripLinks) t = t.replace(URL_RE, '');
    return normalizeSpaces(t);
};

/** Lo que hace «Limpiar automáticamente»: los hashtags Y las direcciones. */
export const cleanShareCopy = (text: string | null | undefined, policy: CopyPolicy = REEL_COPY_POLICY): string =>
    sanitizeShareCopy(text, { allowHashtags: policy.allowHashtags, stripLinks: !policy.allowLinks });

export interface CopyWarning { code: string; text: string; fix: string | null }

export interface CopyVerdict {
    ok: boolean;
    code: 'empty' | 'too_long' | 'hashtags' | 'no_emoji' | null;
    length: number;
    max: number;
    reason: string | null;
    fix: string | null;
    warnings: CopyWarning[];
}

/** ⚠️ BLOQUEAN cuatro cosas —vacío, largo, hashtags y sin emoji— y AVISAN dos:
 *  la dirección web que sobra y la que falta. Convertir toda observación en
 *  bloqueo es cómo se llega a que nadie las lea (v4.854). */
export const validateShareCopy = (
    text: string | null | undefined,
    policy: CopyPolicy = REEL_COPY_POLICY
): CopyVerdict => {
    const pol = policy || REEL_COPY_POLICY;
    const t = str(text);
    const largo = copyLength(t);
    const avisos: CopyWarning[] = [];

    if (!pol.allowLinks && linksIn(t).length) {
        avisos.push({
            code: 'link',
            text: pol.linkNote || 'El copy lleva una dirección web. En un Reel no se puede pulsar, así que ocupa caracteres sin llevar a ninguna parte.',
            fix: 'Quitala con «Limpiar automáticamente», o dejala si tenés un motivo.',
        });
    }
    // ⚠️ LA DIRECCIÓN QUE FALTA AVISA; NO BLOQUEA. La estructura que se pide
    // la garantiza el compositor del servidor —reserva el cierre antes de
    // acortar— y el bucle de la IA. Acá manda la otra regla: sólo se bloquea
    // lo que la red rechaza seguro (v4.1042), y en Facebook el enlace viaja en
    // su propio campo.
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
            fix: 'Escribí uno al final, o pedile a la IA que lo elija con «Regenerar copy».',
        };
    }
    return { ok: true, code: null, length: largo, max: pol.maxChars, reason: null, fix: null, warnings: avisos };
};

export interface CopyDescription extends CopyVerdict {
    remaining: number;
    over: number;
    hashtags: string[];
    links: string[];
    endsWithEmoji: boolean;
    /** Sólo cierto cuando limpiar DE VERDAD cambiaría algo: un botón que no
     *  hace nada es peor que ninguno (v4.650). */
    canClean: boolean;
    cleaned: string;
}

export const describeShareCopy = (
    text: string | null | undefined,
    policy: CopyPolicy = REEL_COPY_POLICY
): CopyDescription => {
    const pol = policy || REEL_COPY_POLICY;
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

export default {
    REEL_COPY_MAX, REEL_COPY_POLICY, copyLength, hashtagsIn, linksIn,
    endsWithEmoji, sanitizeShareCopy, cleanShareCopy, validateShareCopy, describeShareCopy,
};
