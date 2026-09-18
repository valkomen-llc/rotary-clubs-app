// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — EL COMPOSITOR
// v4.898.0
//
// ⚠️ HAY UN SOLO CAMINO DE COMPOSICIÓN, Y ES ÉSTE.
//
// El requisito 14 del pedido es obligatorio: «la imagen que aparece en la vista
// previa debe ser exactamente la misma que se descarga». La forma más barata de
// cumplirlo a medias sería pintar la vista previa en el DOM y exportar por
// canvas — y entonces habría dos maquetadores que se separan en silencio, que
// es exactamente el problema que Plantillas IA tiene que resolver con una
// prueba de paridad píxel a píxel.
//
// Acá no hace falta ninguna prueba de paridad, porque no hay dos cosas que
// comparar: `renderAnniversary` devuelve UN canvas, la pantalla MUESTRA ese
// canvas y la descarga EXPORTA ese mismo canvas. La vista previa no se parece
// al archivo: **es** el archivo. No reintroducir una vista previa en DOM.
//
// ── LAS TRES CAPAS ──────────────────────────────────────────────────
//
//   1. DISEÑO — el fondo que devolvió el modelo (modo `ai`) o la fotografía
//      sobre blanco (modo `plain`). Es lo único que puede venir de la IA.
//   2. CONTENIDO — nombre del club, años, titular y mensaje. Lo escribimos
//      nosotros, así que la ortografía y las cifras están garantizadas POR
//      CONSTRUCCIÓN. Es el motivo por el que existe la arquitectura híbrida:
//      los modelos generativos no escriben texto de forma fiable.
//   3. BRANDING — logotipos y pie, desde archivos REALES. Nada se dibuja: el
//      emblema de Rotary es marca registrada y se reproduce, no se imita.
//
// ── QUÉ SE REUTILIZA DE LA PLATAFORMA ───────────────────────────────
//
// `ensureDesignFonts` — el cargador de las tipografías empaquetadas (Open Sans,
// que es la tipografía de marca de Rotary, y Oswald). Es un servicio GLOBAL,
// no el editor: hay UN registro de caras en `document.fonts` y un segundo
// cargador registraría las mismas dos veces. Lo que NO se importa es el
// compilador de plantillas, el grafo de escena ni `designRender`.
//
// El proxy de imágenes es el mismo que ya usan el Generador de Pendones y
// Plantillas IA: una imagen de S3 pintada directo deja el canvas «tainted» y
// `toBlob` lanza. No se abre un proxy nuevo.
// ════════════════════════════════════════════════════════════════════
import { ensureDesignFonts } from './designFonts';
import { zoneById, FOOTER_BAND, STANDARD_LAYOUT, PHOTO_FRAME, canvasSize, type TextZone, type LayoutBand } from './anniversarySpec';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

// ─── Paleta ────────────────────────────────────────────────────────────
//
// Está acá y no es configurable, a propósito: el requisito 6 dice que todas
// las piezas tienen que pertenecer claramente a la misma familia visual, y el
// contraste del texto sobre el fondo no es una decisión editorial. Quien
// configura elige las instrucciones y las referencias; la legibilidad la
// garantiza el sistema. Misma regla que el Slider Global (v4.879).
export const INK = '#1F2937';
export const ROTARY_BLUE = '#17458F';
export const ROTARY_GOLD = '#B5A16B';
export const PAPER = '#FFFFFF';

const DISPLAY = "'Oswald', 'Arial Narrow', Impact, sans-serif";
const BODY = "'Open Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ─── Imágenes ──────────────────────────────────────────────────────────

const proxied = (url: string): string =>
    url.startsWith('data:') || url.startsWith('blob:')
        ? url
        : `${API}/public/banner-image?url=${encodeURIComponent(url)}`;

const cache = new Map<string, Promise<HTMLImageElement>>();

// ⚠️ TODA CARGA DE IMAGEN TIENE TOPE DE TIEMPO (v4.911). Una petición que se
// queda colgada —el proxy contra una conexión estancada, un CDN que no
// contesta— dejaba la promesa sin resolver PARA SIEMPRE: la vista previa en
// blanco, sin error y sin lienzo, con los botones pintados (reporte con
// captura). Con el tope, el rechazo cae en los caminos de degradación que ya
// existen y la pieza SIEMPRE se pinta, con su aviso.
export const IMAGE_TIMEOUT_MS = 25_000;

export const loadImage = (src: string, { timeoutMs = IMAGE_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<HTMLImageElement> => {
    const key = proxied(src);
    const hit = cache.get(key);
    if (hit) return hit;
    const p = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (!key.startsWith('data:') && !key.startsWith('blob:')) img.crossOrigin = 'anonymous';
        const reloj = setTimeout(() => {
            img.src = '';
            reject(new Error(`La imagen tardó demasiado en cargar: ${src}`));
        }, timeoutMs);
        img.onload = () => { clearTimeout(reloj); resolve(img); };
        img.onerror = () => { clearTimeout(reloj); reject(new Error(`No se pudo cargar la imagen: ${src}`)); };
        img.src = key;
    });
    cache.set(key, p);
    // Un fallo NO se cachea: la próxima vez puede ser un tropiezo de red que ya
    // pasó, y dejar el rechazo guardado lo convertiría en permanente.
    p.catch(() => cache.delete(key));
    return p;
};

/** El aviso EXACTO de la degradación del diseño. Es una constante exportada
 *  para que la pantalla pueda reconocerlo y ofrecer el reintento sin duplicar
 *  el texto — dos copias del mismo aviso se separan en silencio. */
export const BACKDROP_FAILED_WARNING =
    'El diseño sí se generó, pero no se pudo cargar al navegador. «Reintentar la carga» trae la MISMA pieza — no gasta una nueva generación.';

/**
 * ⚠️ EL DISEÑO GENERADO SE CARGA CON REINTENTOS (v4.915). Es la imagen que ES
 * la pieza y ya está pagada: un 502 puntual del proxy o un corte de red no
 * pueden costarla — y eso fue exactamente el reporte: el diseño existía en el
 * almacenamiento y la pieza salió plana porque el ÚNICO intento de cargarlo
 * falló. Tres intentos con pausa corta; `loadImage` no cachea los fallos, así
 * que cada reintento vuelve a pedir de verdad. Las imágenes del BRANDING
 * siguen con un solo intento a propósito: su degradación es cosmética y tres
 * esperas de 25 s por una marca de agua atrasarían la pieza entera.
 */
const BACKDROP_ATTEMPTS = 3;
const loadBackdrop = async (url: string): Promise<HTMLImageElement> => {
    let ultimo: unknown = null;
    for (let intento = 1; intento <= BACKDROP_ATTEMPTS; intento++) {
        try {
            return await loadImage(url);
        } catch (e) {
            ultimo = e;
            if (intento < BACKDROP_ATTEMPTS) await new Promise(r => setTimeout(r, 1000 * intento));
        }
    }
    throw ultimo instanceof Error ? ultimo : new Error('No se pudo cargar el diseño generado.');
};

// ─── El documento ──────────────────────────────────────────────────────

export interface AnniversaryBranding {
    clubLogo?: string | null;
    districtLine?: string | null;
    period?: string | null;
    footerImage?: string | null;
    watermark?: string | null;
    missing?: string[];
}

export interface AnniversaryDocument {
    format: string;
    width: number;
    height: number;
    /** `ai` usa el fondo que compuso el modelo; `plain` compone con la
     *  fotografía intacta sobre blanco. NO es un segundo sistema de diseño:
     *  es este mismo compositor con la capa 1 vacía. */
    renderMode: 'ai' | 'plain';
    /** FLUJO SIMPLE (v4.907): la pieza ES la imagen del modelo — el texto
     *  viene dibujado dentro, como en el ejemplo de ChatGPT del cliente — y
     *  la plataforma sólo imprime el pie institucional encima. Con `simple`
     *  la capa 2 (texto) NO se dibuja; `plain` la conserva, porque ahí no hay
     *  imagen que traiga el texto. */
    simple?: boolean;
    /** ¿ROTULA EL MODELO? (v4.1064). Lo decide el SERVIDOR con `modelLetters`
     *  y viaja resuelto: con el prompt vigente el modelo no recibe el nombre y
     *  esta capa imprime el saludo, el nombre oficial y la cifra; con un
     *  prompt editado que sí se los manda, rotula el modelo y esta capa se
     *  calla —dos capas darían el nombre dos veces—. Ausente se comporta como
     *  el default: imprime la plataforma, que es lo exacto. */
    lettered?: boolean;
    /** ¿PEGA LA PLATAFORMA LA FOTOGRAFÍA EN SU MARCO? (v4.1065). Lo decide el
     *  SERVIDOR con `modelPlacesPhoto` y viaja resuelto: con el prompt vigente
     *  el modelo deja el hueco limpio y el compositor pega ahí la foto, en la
     *  banda fija, así que el layout es determinista. Con un Prompt Maestro
     *  editado que le pida al modelo integrarla, esta capa se calla —dos capas
     *  darían la foto dos veces—. AUSENTE se comporta como antes de v4.1065:
     *  la coloca el modelo, que es lo que un servidor anterior espera. */
    framed?: boolean;
    /** v4.920: la frase conmemorativa la imprime el COMPOSITOR como capa —
     *  con tipografía real, imposible de deformar. Sólo viene en piezas cuyo
     *  prompt NO llevó la frase adentro (gate anti-doble del servidor). */
    backdropUrl: string | null;
    photoUrl: string;
    zoneId: string;
    clubName: string;
    years: number | null;
    title: string;
    message: string;
    branding: AnniversaryBranding;
}

// ─── Qué se imprime: la ESTRUCTURA FIJA de la referencia ───────────────

/**
 * ⚠️ NFC ANTES DE MEDIR Y DE DIBUJAR (v4.1063).
 *
 * `measureText` y `fillText` trabajan sobre lo que se les pasa, y «á» tiene
 * DOS formas Unicode válidas: compuesta (un carácter) y descompuesta (la «a»
 * y su tilde por separado). Las dos se ven igual en pantalla y ninguna es
 * incorrecta, pero se miden distinto —una fuente sin la marca combinante
 * dibuja la tilde corrida o la deja caer—, así que el reparto de líneas y el
 * `autoFit` del titular podrían dar resultados distintos para el MISMO nombre
 * según de dónde venga. Componer a NFC es lo que hace que no dependa de eso.
 *
 * COMPONER NO ES QUITAR. Esto une la letra con su tilde; lo que quita tildes
 * es NFD seguido de borrar las marcas, y sobre texto visible eso no se hace
 * en ninguna parte de este módulo. `flat` —que sí las quita— compara, nunca
 * dibuja, y `safeFileName` nombra un archivo, no la pieza.
 */
const visible = (s: string) => String(s ?? '').normalize('NFC');

/** ⚠️ SÓLO PARA COMPARAR: su salida no se dibuja ni se guarda jamás.
 *  Descarta también los signos, porque desde v4.1066 el saludo impreso ya no
 *  los lleva y un titular del redactor que diga «¡Feliz aniversario!» sigue
 *  siendo el MISMO saludo: sin esto se repetiría como línea de cierre. */
const flat = (s: string) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[¡!¿?.,;:]/g, '').replace(/\s+/g, ' ').trim();

export type BlockKind = 'headline' | 'kicker' | 'years' | 'club' | 'rule' | 'message' | 'closing';
export interface TextBlock { kind: BlockKind; text: string }

/** El saludo FIJO de la pieza y el pase que lo sigue. Son lenguaje de la
 *  PIEZA — constantes del código, no algo que escriba un modelo.
 *
 *  ⚠️ SIN SIGNOS DE ADMIRACIÓN (v4.1066, pedido expreso con la pieza
 *  delante): dice exactamente FELIZ / ANIVERSARIO. Los signos no son
 *  decoración — `headlineLines` parte por palabras, así que «¡FELIZ» y
 *  «ANIVERSARIO!» los arrastraba cada línea, y el «¡» además desalineaba
 *  ópticamente el centrado de la línea corta. */
export const HEADLINE_TEXT = 'Feliz aniversario';
export const KICKER_TEXT = 'Felicidades';

/**
 * Decide qué bloques entran en la pieza.
 *
 * ⚠️ LA ESTRUCTURA ES PREESTABLECIDA (v4.902) — es el pedido literal del
 * cliente con la referencia delante: «necesito estilos preestablecidos… que
 * quede distribuida tal cual la proporción de la referencia». Hasta v4.901 el
 * titular de la IA MANDABA y suprimía los bloques que ya nombrara: con
 * «Club Rotario Bello: cuatro décadas…» desaparecían el saludo, el pase y el
 * club en dos tonos, y la pieza dejaba de parecerse a la referencia.
 *
 * Ahora la jerarquía es SIEMPRE la de la referencia:
 *   FELIZ ANIVERSARIO    (saludo fijo, dos líneas, subrayado dorado)
 *   FELICIDADES          (pase)
 *   CLUB ROTARIO X       (dato exacto, dos tonos)
 *   [ 40 AÑOS ]          (banda dorada)
 *   « mensaje »          (la CITA que escribe la IA, centrada)
 *   ───                  (filete)
 *   cierre               (el titular de la IA, como línea de cierre)
 *
 * La IA escribe la cita y el cierre; el nombre y la cifra son datos y salen
 * SIEMPRE — exactos por construcción.
 */
export const planTextBlocks = (doc: Pick<AnniversaryDocument, 'title' | 'message' | 'clubName' | 'years'>): TextBlock[] => {
    // NFC en el punto donde el texto ENTRA a la pieza: de acá en adelante
    // todo lo que se mide y se dibuja tiene una sola forma Unicode.
    const title = visible(doc.title).trim();
    const message = visible(doc.message).trim();
    const club = visible(doc.clubName).trim();
    const years = doc.years ?? null;

    const bloques: TextBlock[] = [{ kind: 'headline', text: HEADLINE_TEXT }];
    if (club) {
        bloques.push({ kind: 'kicker', text: KICKER_TEXT });
        bloques.push({ kind: 'club', text: club });
    }
    if (years !== null) bloques.push({ kind: 'years', text: String(years) });
    if (message) bloques.push({ kind: 'message', text: message });
    // El titular de la IA es la LÍNEA DE CIERRE de la referencia («¡Gracias
    // por tanto!…»), no el encabezado. Si repite el saludo fijo, sobra.
    if (title && flat(title) !== flat(HEADLINE_TEXT)) {
        if (message) bloques.push({ kind: 'rule', text: '' });
        bloques.push({ kind: 'closing', text: title });
    }
    return bloques;
};

// ─── Medición y reparto de líneas ──────────────────────────────────────
//
// Se escribe acá y no se importa de `designSpec` a propósito: este módulo no
// depende del editor de Plantillas IA. Es reparto de líneas, no un criterio
// que pueda divergir — dos implementaciones de «cortar por palabras» no se
// contradicen entre sí, y el compositor tiene que poder leerse solo.

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const out: string[] = [];
    for (const parrafo of visible(text).split('\n')) {
        const palabras = parrafo.split(/\s+/).filter(Boolean);
        if (!palabras.length) { out.push(''); continue; }
        let linea = palabras[0];
        for (let i = 1; i < palabras.length; i++) {
            const prueba = `${linea} ${palabras[i]}`;
            if (ctx.measureText(prueba).width > maxWidth && linea) { out.push(linea); linea = palabras[i]; }
            else linea = prueba;
        }
        out.push(linea);
    }
    return out;
};

interface BlockStyle { font: string; size: number; lineHeight: number; color: string; gapBefore: number; upper?: boolean; letterSpacing?: number; align?: 'left' | 'center'; weight?: number }

/** Tamaños en FRACCIÓN del ancho del lienzo: así la pieza se compone igual a
 *  1080 que a 2160 y la descarga en alta no es otra maquetación. Las medidas
 *  están tomadas de la REFERENCIA aprobada, no puestas a ojo. */
const STYLES: Record<BlockKind, BlockStyle> = {
    // El saludo fijo: DOS líneas («FELIZ» más liviana, «ANIVERSARIO» plena)
    // con un subrayado dorado corto debajo — como la referencia. Se
    // special-casea en la medición y el dibujo, con las MISMAS cuentas.
    headline: { font: DISPLAY, size: 0.072, lineHeight: 1.04, color: ROTARY_BLUE, gapBefore: 0, upper: true },
    // El pase chico de la referencia («FELICIDADES»): letra espaciada, tinta.
    kicker: { font: BODY, size: 0.019, lineHeight: 1.2, color: INK, gapBefore: 0.034, upper: true, letterSpacing: 0.32 },
    club: { font: DISPLAY, size: 0.043, lineHeight: 1.18, color: ROTARY_BLUE, gapBefore: 0.012, upper: true },
    // Los años van dentro de una BANDA dorada con muescas y puntos a los
    // lados («• 40 AÑOS •»). `size` es el cuerpo; la banda mide 1,9× eso.
    years: { font: DISPLAY, size: 0.040, lineHeight: 1, color: PAPER, gapBefore: 0.030, upper: true },
    // La cita va CENTRADA, con comillas doradas — es el tratamiento de la
    // referencia y por eso su alineación no sigue a la zona.
    message: { font: BODY, size: 0.026, lineHeight: 1.5, color: INK, gapBefore: 0.034, align: 'center' },
    rule: { font: BODY, size: 0.005, lineHeight: 1, color: ROTARY_GOLD, gapBefore: 0.030, align: 'center' },
    closing: { font: BODY, size: 0.023, lineHeight: 1.45, color: INK, gapBefore: 0.024, align: 'center', weight: 700 },
};

const BAND_RATIO = 1.9;          // alto de la banda dorada respecto del cuerpo de su texto
const HEADLINE_TOP_RATIO = 0.62; // «FELIZ» respecto de «ANIVERSARIO»
// ⚠️ EL HUECO DEL SUBRAYADO ES DONDE VIVE EL AIRE DEL SALUDO (v4.1066). La
// banda del saludo se reparte entre las dos líneas y este hueco, que sólo
// contiene un filete de 2 px: bajarlo de 0,55 a 0,34 no quita nada visible y
// le deja ~10 % más de cuerpo a «ANIVERSARIO» dentro de la MISMA banda. Es la
// única forma de agrandar el saludo sin empujar hacia abajo la fotografía.
const HEADLINE_RULE_GAP = 0.34;  // hueco + subrayado dorado bajo el saludo, en cuerpos
// ⚠️ EL RESPIRO SOBRE «FELIZ» ES FIJO Y SE PAGA CON EL HUECO DEL SUBRAYADO
// (v4.1067). «FELIZ» arrancaba en el borde mismo de la banda —el bloque la
// llena EXACTA, así que no había ningún centrado que dejara aire— y quedaba
// pegado al borde superior de la forma blanca del fondo. El respiro no puede
// salir de mover la banda (debajo está el nombre del club, que no se toca) ni
// de achicar el saludo (el pedido lo prohíbe con esas palabras): sale del
// hueco del subrayado, que sólo contiene un filete de 2 px.
//
// ⚠️ LA SUMA ES LA INVARIANTE, y por eso el hueco se DERIVA en vez de
// escribirse como un segundo número. El cuerpo del saludo es
// `alto = bh / (PAD + TOP_RATIO·1,04 + 1,04 + BAND_GAP)`: mientras
// `PAD + BAND_GAP === HEADLINE_RULE_GAP` el denominador no cambia y el
// tamaño de «FELIZ ANIVERSARIO» es EL MISMO al último decimal. Con dos
// constantes sueltas, tocar una encogería el saludo sin que nada avisara.
const HEADLINE_PAD_TOP = 0.14;   // respiro FIJO sobre «FELIZ», en cuerpos
const HEADLINE_BAND_GAP = HEADLINE_RULE_GAP - HEADLINE_PAD_TOP;

const weightFor = (kind: BlockKind, st?: BlockStyle) => st?.weight ?? (kind === 'headline' || kind === 'years' ? 600 : (kind === 'club' ? 700 : 400));

/** Las dos líneas del saludo fijo: la última palabra es la plena. */
const headlineLines = (text: string): [string, string] => {
    const palabras = String(text || '').trim().split(/\s+/);
    if (palabras.length < 2) return ['', palabras[0] || ''];
    return [palabras.slice(0, -1).join(' '), palabras[palabras.length - 1]];
};

/** El nombre del club en DOS tonos, como la referencia: el prefijo
 *  institucional en azul y la parte distintiva en dorado. Si el nombre no
 *  tiene prefijo reconocible, va entero en azul. */
export const splitClubName = (line: string): { prefix: string; rest: string } => {
    const m = String(line || '').match(/^((?:club\s+rotario|rotary\s+e-?club|rotary)\s+)(.+)$/i);
    return m ? { prefix: m[1], rest: m[2] } : { prefix: '', rest: String(line || '') };
};

/** El rótulo de la banda dorada. El número es un dato NUESTRO: la cifra que
 *  la persona escribió, jamás una que escriba un modelo. */
export const yearsBandLabel = (years: string | number) =>
    `${years} ${Number(years) === 1 ? 'AÑO' : 'AÑOS'}`;

// ════════════════════════════════════════════════════════════════════
// LA CAPA INSTITUCIONAL DETERMINÍSTICA (v4.1064)
//
// ⚠️ ESTOS TEXTOS NO LOS DIBUJA NINGÚN MODELO. El saludo, el nombre oficial
// del club y la cifra de años son DATOS —no contenido creativo— y se imprimen
// acá, con tipografía real, a partir del string que la persona eligió. Son
// exactos POR CONSTRUCCIÓN: no hay ninguna capa que pueda alterarlos.
//
// POR QUÉ. Hasta v4.1063 los rotulaba el modelo de imagen (flujo simple,
// v4.907) y el nombre salía mal escrito: «Bogotá Capital» se dibujaba «Bogota
// Capital» y, en el caso reportado, «Bogoto Capital» —una letra cambiada, no
// sólo la tilde—. Auditado el recorrido completo, NINGUNA capa de la
// plataforma pierde el diacrítico: el prompt sale con U+00E1. Lo que falla es
// que un modelo generativo no escribe texto de forma fiable, que es
// exactamente lo que el encabezado de `anniversarySpec.js` declara desde
// v4.895. Contra eso no hay codificación que valga: hay que dejar de pedírselo.
//
// ⚠️ Y NO ES UN COMPOSITE DE LOS PROHIBIDOS (regla #1 del sitio). Lo que se
// prohíbe es RETOCAR la salida de un modelo generativo —pegarle encima un
// trozo de la imagen original para corregirla, que es lo que el equipo rechazó
// dos veces con las palabras «se ve overlay / montaje»—. Acá el modelo entrega
// un FONDO decorado que nunca llevó texto, y la tipografía se compone encima:
// es exactamente el reparto de las tres capas con el que nació el módulo, y el
// mismo que ya usa el pie institucional de la capa 3.
//
// Dónde va cada texto lo dice `STANDARD_LAYOUT`, la tabla que comparten el
// prompt y este compositor. Al mover una banda, se mueven las dos.

/** Baja el cuerpo hasta que el texto entra en el ancho dado. Devuelve el
 *  cuerpo que de verdad se va a dibujar, nunca uno que desborde: un nombre
 *  largo se achica, no se recorta — recortarlo sería alterar el dato. */
const fitToWidth = (
    ctx: CanvasRenderingContext2D,
    text: string, family: string, weight: number,
    maxW: number, start: number, min: number,
): number => {
    let size = start;
    while (size > min) {
        ctx.font = `${weight} ${size}px ${family}`;
        if (ctx.measureText(text).width <= maxW) return size;
        size -= Math.max(1, start * 0.02);
    }
    return Math.max(min, size);
};

/** El saludo fijo, en dos líneas y con su subrayado dorado corto — la cabecera
 *  de la referencia aprobada. Es una constante del código, no algo que escriba
 *  un modelo. */
const drawHeadlineBand = (ctx: CanvasRenderingContext2D, W: number, H: number, band: LayoutBand) => {
    const [arriba, abajo] = headlineLines(visible(HEADLINE_TEXT).toUpperCase());
    const bx = band.x * W, by = band.y * H, bw = band.w * W, bh = band.h * H;
    const cx = bx + bw / 2;

    // El cuerpo lo manda la línea plena, que es la más ancha; la de arriba va
    // en la proporción de la referencia y la medida reserva su alto.
    const alto = bh / (HEADLINE_PAD_TOP + HEADLINE_TOP_RATIO * 1.04 + 1.04 + HEADLINE_BAND_GAP);
    let fs = Math.min(alto, fitToWidth(ctx, abajo, DISPLAY, 700, bw, alto, alto * 0.45));
    const fsTop = fs * HEADLINE_TOP_RATIO;
    // La línea de arriba («FELIZ») también tiene que entrar: es más corta,
    // pero un saludo traducido o editado podría no serlo.
    if (arriba) fs = Math.min(fs, fitToWidth(ctx, arriba, DISPLAY, 500, bw, fsTop, fsTop * 0.5) / HEADLINE_TOP_RATIO);

    const totalH = fs * HEADLINE_PAD_TOP
        + (arriba ? fs * HEADLINE_TOP_RATIO * 1.04 : 0) + fs * 1.04 + fs * HEADLINE_BAND_GAP;
    // El respiro se suma DESPUÉS del centrado: es una reserva del bloque, no
    // un desplazamiento de la banda — la banda no se mueve ni un punto.
    let y = by + Math.max(0, (bh - totalH) / 2) + fs * HEADLINE_PAD_TOP;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = ROTARY_BLUE;
    if (arriba) {
        ctx.font = `500 ${fs * HEADLINE_TOP_RATIO}px ${DISPLAY}`;
        ctx.fillText(arriba, cx, y);
        y += fs * HEADLINE_TOP_RATIO * 1.04;
    }
    ctx.font = `700 ${fs}px ${DISPLAY}`;
    ctx.fillText(abajo, cx, y);
    y += fs * 1.04;

    const ruleW = Math.min(bw * 0.30, ctx.measureText(abajo).width * 0.55);
    const ruleH = Math.max(2, fs * 0.045);
    ctx.fillStyle = ROTARY_GOLD;
    ctx.fillRect(cx - ruleW / 2, y + fs * (HEADLINE_BAND_GAP / 2) - ruleH / 2, ruleW, ruleH);
};

/** EL NOMBRE OFICIAL DEL CLUB. Sale del dato que la persona eligió y llega acá
 *  letra por letra: es el texto que esta versión existe para hacer exacto.
 *
 *  Va en DOS tonos cuando cabe en una línea —prefijo institucional azul, parte
 *  distintiva dorada, como la referencia— y entre dos líneas finas doradas. En
 *  dos líneas se queda entero en azul: partir el color por el salto de línea se
 *  lee como un error. */
const drawClubBand = (ctx: CanvasRenderingContext2D, W: number, H: number, band: LayoutBand, club: string) => {
    const nombre = visible(club).trim().toUpperCase();
    if (!nombre) return;
    const bx = band.x * W, by = band.y * H, bw = band.w * W, bh = band.h * H;
    const cx = bx + bw / 2;

    // Las dos líneas doradas se llevan un trozo del ancho a cada lado: el
    // nombre se mide contra lo que queda, no contra la banda entera.
    const anchoTexto = bw * 0.74;
    // ⚠️ LA BANDA ESTABA INFRAUTILIZADA (v4.1066). Con 0,52 el nombre ocupaba
    // el 61 % del alto de su banda y se leía pequeño al lado del saludo; 0,74
    // lo sube ~42 % SIN mover la banda ni un punto, así que la fotografía no
    // paga nada. El auto-ajuste de abajo sigue mandando: un nombre largo
    // reduce el cuerpo y, si ni así entra, pasa a dos líneas centradas.
    const base = bh * 0.74;
    let fs = fitToWidth(ctx, nombre, DISPLAY, 700, anchoTexto, base, base * 0.52);

    ctx.font = `700 ${fs}px ${DISPLAY}`;
    let lineas = [nombre];
    // Sólo si al cuerpo mínimo sigue sin entrar se parte en dos: un nombre
    // muy largo prefiere dos líneas legibles a una ilegible.
    if (ctx.measureText(nombre).width > anchoTexto) {
        lineas = wrap(ctx, nombre, anchoTexto).slice(0, 2);
        fs = Math.min(fs, bh * 0.40);
    }

    ctx.textBaseline = 'top';

    // ⚠️ EL BLOQUE SE CENTRA POR SU TINTA, NO POR SU CAJA EM (v4.1066). Con el
    // centrado nominal —`(bh - lineas*fs*1.18) / 2`— el acento de una Á o una Ó
    // MAYÚSCULA se salía de la banda: en muchas tipografías ese acento se
    // dibuja POR ENCIMA del borde superior de la caja em, y el nombre del club
    // es justamente donde viven «BOGOTÁ CHICÓ» y «TULUÁ». Medido: la tinta
    // dorada del acento caía una fila por encima de `by`. La salida NO puede
    // ser achicar el cuerpo ni mover la banda —el pedido lo prohíbe con esas
    // palabras—, así que se le pregunta al navegador dónde empieza y dónde
    // termina la tinta de verdad y se centra ESA caja. Un navegador que no
    // exponga las métricas cae al centrado de siempre.
    ctx.font = `700 ${fs}px ${DISPLAY}`;
    const alturaTotal = lineas.length * fs * 1.18;
    let y = by + Math.max(0, (bh - alturaTotal) / 2);
    try {
        const primera = ctx.measureText(lineas[0]);
        const ultima = ctx.measureText(lineas[lineas.length - 1]);
        const sube = primera.actualBoundingBoxAscent;
        const baja = ultima.actualBoundingBoxDescent;
        if (Number.isFinite(sube) && Number.isFinite(baja)) {
            const tinta = sube + (lineas.length - 1) * fs * 1.18 + baja;
            y = by + Math.max(0, (bh - tinta) / 2) + sube;
        }
    } catch { /* sin métricas de tinta: queda el centrado por caja em */ }

    for (const linea of lineas) {
        ctx.font = `700 ${fs}px ${DISPLAY}`;
        const dosTonos = lineas.length === 1 ? splitClubName(linea) : null;
        if (dosTonos && dosTonos.prefix) {
            const wPrefix = ctx.measureText(dosTonos.prefix).width;
            const wTotal = wPrefix + ctx.measureText(dosTonos.rest).width;
            const x0 = cx - wTotal / 2;
            ctx.textAlign = 'left';
            ctx.fillStyle = ROTARY_BLUE;
            ctx.fillText(dosTonos.prefix, x0, y);
            ctx.fillStyle = ROTARY_GOLD;
            ctx.fillText(dosTonos.rest, x0 + wPrefix, y);
        } else {
            ctx.textAlign = 'center';
            ctx.fillStyle = ROTARY_BLUE;
            ctx.fillText(linea, cx, y);
        }
        y += fs * 1.18;
    }

    // Las dos líneas finas doradas, a la altura del centro del nombre.
    const anchoReal = lineas.length === 1
        ? (() => { ctx.font = `700 ${fs}px ${DISPLAY}`; return ctx.measureText(lineas[0]).width; })()
        : anchoTexto;
    const hueco = Math.min(bw / 2 - anchoReal / 2 - fs * 0.45, bw * 0.16);
    if (hueco > fs * 0.25) {
        const ly = by + bh / 2;
        const lh = Math.max(1.5, fs * 0.035);
        ctx.fillStyle = ROTARY_GOLD;
        ctx.fillRect(bx, ly - lh / 2, hueco, lh);
        ctx.fillRect(bx + bw - hueco, ly - lh / 2, hueco, lh);
    }
};

/** LA CIFRA DE AÑOS: el número grande en dorado y, debajo, la cinta banderín
 *  con «AÑOS» — el componente fijo de la referencia aprobada. El número es el
 *  que la persona escribió; la palabra la decide `yearsBandLabel`, que ya sabe
 *  que uno es «AÑO». */
const drawYearsBand = (ctx: CanvasRenderingContext2D, W: number, H: number, band: LayoutBand, years: number) => {
    const bx = band.x * W, by = band.y * H, bw = band.w * W, bh = band.h * H;
    const cx = bx + bw / 2;
    const cifra = String(years);
    const palabra = Number(years) === 1 ? 'AÑO' : 'AÑOS';

    const fsNum = fitToWidth(ctx, cifra, DISPLAY, 700, bw * 0.55, bh * 0.64, bh * 0.28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${fsNum}px ${DISPLAY}`;
    // ⚠️ CONTORNO BLANCO: preservado del diseño aprobado, aporta contraste,
    // definición y nitidez a la cifra dorada sobre el fondo limpio bajo el marco.
    ctx.lineWidth = Math.max(2, fsNum * 0.085);
    ctx.strokeStyle = PAPER;
    ctx.lineJoin = 'round';
    ctx.strokeText(cifra, cx, by);
    ctx.fillStyle = ROTARY_GOLD;
    ctx.fillText(cifra, cx, by);

    // La cinta: banderín dorado con muescas y un punto a cada lado.
    const fsPal = bh * 0.185;
    ctx.font = `600 ${fsPal}px ${DISPLAY}`;
    const bandaH = fsPal * 1.9;
    const bandaW = Math.min(bw * 0.7, ctx.measureText(palabra).width + fsPal * 2.2);
    // ⚠️ EL NÚMERO Y SU CINTA SE JUNTAN (v4.1066): 1,02 dejaba casi un tercio
    // de cuerpo de aire muerto entre la cifra y el banderín. Con 0,86 el
    // bloque entero mide ~0,011 del lienzo menos, y eso es exactamente lo que
    // permite BAJARLO sin comerse el margen contra la curva dorada del pie.
    const yB = by + fsNum * 0.86;
    const bxB = cx - bandaW / 2;
    const muesca = bandaH * 0.32;
    const rPunto = Math.max(2, bandaH * 0.10);

    ctx.fillStyle = ROTARY_GOLD;
    ctx.beginPath();
    ctx.moveTo(bxB, yB);
    ctx.lineTo(bxB + bandaW, yB);
    ctx.lineTo(bxB + bandaW - muesca, yB + bandaH / 2);
    ctx.lineTo(bxB + bandaW, yB + bandaH);
    ctx.lineTo(bxB, yB + bandaH);
    ctx.lineTo(bxB + muesca, yB + bandaH / 2);
    ctx.closePath();
    ctx.fill();
    for (const px of [bxB - rPunto * 3, bxB + bandaW + rPunto * 3]) {
        ctx.beginPath(); ctx.arc(px, yB + bandaH / 2, rPunto, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = PAPER;
    ctx.textBaseline = 'middle';
    ctx.fillText(palabra, cx, yB + bandaH / 2 + fsPal * 0.04);
    ctx.textBaseline = 'top';
};

// ─── EL MARCO DE LA FOTOGRAFÍA (v4.1065) ───────────────────────────────
//
// ⚠️ LA FOTOGRAFÍA LA COLOCA LA PLATAFORMA, NO EL MODELO, y ése es el arreglo
// de fondo de esta versión.
//
// v4.1064 dejó los textos en manos del compositor y la fotografía en manos del
// modelo, y le pidió al modelo POR ESCRITO que la pusiera «del 40 % al 68 % del
// alto» y que dejara tres bandas limpias en porcentajes exactos. Un modelo
// generativo no cumple geometría pedida en palabras: en el caso reportado
// colocó la foto arrancando cerca del 29 % del alto, la banda del nombre cayó
// DENTRO de ella y «CLUB ROTARIO BOGOTÁ CENTENARIO» salió impreso encima de la
// fotografía. No falló ruidosamente — entregó otra composición.
//
// Es la misma lección que el rotulado, una capa más abajo: contra un modelo que
// no cumple una instrucción no hay prompt que valga, hay que dejar de
// pedírselo. La fotografía es CONTENIDO VARIABLE dentro de un MARCO FIJO, así
// que el layout queda determinista POR CONSTRUCCIÓN y el nombre no puede caer
// sobre la imagen. Al modelo le queda lo que sí hace bien: el fondo, los
// globos, las serpentinas y el dorado de los márgenes.
//
// Y de paso la foto sale INTACTA —los píxeles son los que subió la persona—,
// que es lo que este módulo venía midiendo con `checkPreservation` en vez de
// poder garantizarlo.

/**
 * La geometría del marco, DERIVADA de su banda. El alto no se declara: sale de
 * la proporción interior (16:9, la misma a la que se estandariza la foto) más
 * el margen blanco. Declararlo aparte permitiría mover el ancho y dejar un
 * marco que ya no es 16:9 — y entonces la foto saldría deformada o con franjas.
 *
 * Si el alto derivado no entra en la banda, el marco se reduce ENTERO y se
 * centra: nunca se recorta la banda ni se deforma la proporción.
 */
export const photoFrameBox = (band: LayoutBand, W: number, H: number) => {
    const bx = band.x * W, by = band.y * H, bw = band.w * W, bh = band.h * H;
    let outerW = bw;
    let innerW = outerW - bw * PHOTO_FRAME.mat * 2;
    let innerH = innerW / PHOTO_FRAME.ratio;
    let outerH = innerH + (outerW - innerW);
    if (outerH > bh) {
        const k = bh / outerH;
        outerW *= k; outerH = bh; innerW *= k; innerH *= k;
    }
    const x = bx + (bw - outerW) / 2;
    const y = by + (bh - outerH) / 2;
    const m = (outerW - innerW) / 2;
    return { x, y, w: outerW, h: outerH, inner: { x: x + m, y: y + m, w: innerW, h: innerH } };
};

/** El desvanecido del velo de la zona reservada, en fracción del ancho, y el
 *  radio de sus esquinas. El desvanecido va HACIA AFUERA del rectángulo: por
 *  dentro el velo es pleno —ahí van los textos— y por fuera se apaga en esa
 *  distancia, así que los globos de la franja superior y de los márgenes
 *  laterales quedan intactos. */
const WASH_FADE = 0.05;
const WASH_RADIUS = 0.06;
/** Separación interna superior adicional sobre el saludo (~15 px en lienzo 1080)
 * para que la palabra "FELIZ" quede completamente dentro del área blanca y con
 * suficiente aire visual respecto al borde superior del fondo blanco. */
const WASH_PAD_TOP = 0.014;

/**
 * LA ZONA RESERVADA, GARANTIZADA POR EL COMPOSITOR.
 *
 * ⚠️ NO ES DECORACIÓN NI UN RECUADRO BLANCO PEGADO: el rectángulo es pleno por
 * dentro y se desvanece HACIA AFUERA, así que no tiene ningún borde visible.
 * Con un fondo correcto —blanco liso ahí, que es lo que el prompt pide— no
 * cambia ni un píxel; lo que hace es que el saludo, el nombre y la cifra se
 * lean SEA CUAL SEA lo que el modelo devuelva en esa zona.
 *
 * Hace falta porque el defecto reportado en v4.1064 fue exactamente eso: el
 * modelo ocupó el centro con la fotografía y el nombre del club quedó impreso
 * encima. La geometría ya se le quitó al modelo (`{MARCO_FOTO}`), pero la
 * composición del fondo sigue siendo suya y un modelo generativo puede
 * desobedecer. Un pedido en palabras no es una garantía; esto sí.
 *
 * ⚠️ EL ÁREA SE DERIVA DE `STANDARD_LAYOUT` —la unión de las cuatro bandas— y
 * es la MISMA que el prompt declara limpia. No se agranda «por si acaso»: cada
 * punto que se le sume se le resta a los globos, que es lo que hace que la
 * pieza se vea de aniversario. Es la misma técnica del halo del marco, que ya
 * tapa lo que el modelo deje en el hueco de la fotografía.
 */
const drawReservedWash = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const bandas = Object.values(STANDARD_LAYOUT);
    const x0 = Math.min(...bandas.map(b => b.x)) * W;
    const x1 = Math.max(...bandas.map(b => b.x + b.w)) * W;
    const y0 = Math.min(...bandas.map(b => b.y)) * H - H * WASH_PAD_TOP;
    const y1 = Math.max(...bandas.map(b => b.y + b.h)) * H;
    const r = W * WASH_RADIUS;

    ctx.save();
    ctx.fillStyle = PAPER;
    ctx.shadowColor = 'rgba(255,255,255,1)';
    ctx.shadowBlur = W * WASH_FADE;
    // Dos pasadas: una sola deja el desvanecido demasiado tenue sobre un fondo
    // oscuro y tres lo vuelven un borde marcado.
    for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x0 + r, y0);
        ctx.lineTo(x1 - r, y0);
        ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
        ctx.lineTo(x1, y1 - r);
        ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
        ctx.lineTo(x0 + r, y1);
        ctx.quadraticCurveTo(x0, y1, x0, y1 - r);
        ctx.lineTo(x0, y0 + r);
        ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
};

/**
 * Dibuja el marco y encuadra la fotografía dentro (cover): se adapta al área
 * sin deformarse, y su tamaño original no puede alterar la estructura de la
 * pieza — que es el requisito literal del pedido.
 *
 * ⚠️ EL HALO BLANCO NO ES DECORACIÓN. El fondo del modelo es blanco liso en esa
 * zona, así que ahí no se ve; lo que hace es TAPAR con un desvanecido cualquier
 * resto que el modelo haya dibujado en el hueco a pesar de habérselo pedido
 * limpio. Sin él, un marco fantasma del modelo asomaría por detrás del nuestro.
 */
const drawPhotoFrame = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, band: LayoutBand, W: number, H: number) => {
    const box = photoFrameBox(band, W, H);
    ctx.save();

    // 1. El halo: dos pasadas de blanco muy difuso alrededor del marco.
    ctx.fillStyle = PAPER;
    ctx.shadowColor = 'rgba(255,255,255,1)';
    ctx.shadowBlur = box.w * 0.10;
    for (let i = 0; i < 3; i++) ctx.fillRect(box.x, box.y, box.w, box.h);

    // 2. La sombra suave de la referencia, hacia abajo.
    ctx.shadowColor = 'rgba(31,41,55,0.20)';
    ctx.shadowBlur = box.w * 0.035;
    ctx.shadowOffsetY = box.w * 0.012;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 3. La fotografía, encuadrada dentro del hueco y recortada a él.
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.inner.x, box.inner.y, box.inner.w, box.inner.h);
    ctx.clip();
    drawCover(ctx, img, box.inner.x, box.inner.y, box.inner.w, box.inner.h);
    ctx.restore();

    // 4. El filete dorado fino, por dentro del margen blanco.
    const lw = Math.max(1, box.w * PHOTO_FRAME.border * 0.5);
    ctx.strokeStyle = ROTARY_GOLD;
    ctx.lineWidth = lw;
    ctx.strokeRect(box.inner.x - lw / 2, box.inner.y - lw / 2, box.inner.w + lw, box.inner.h + lw);

    ctx.restore();
};

/**
 * La capa 2 del flujo simple: los tres textos institucionales sobre el fondo
 * que compuso el modelo, cada uno en su banda declarada.
 *
 * ⚠️ NO HAY NINGÚN CAMINO POR EL QUE ESTOS TEXTOS VENGAN DE UN MODELO. Entran
 * por el documento (`clubName`, `years`) y salen dibujados con `fillText`.
 */
export const drawInstitutionalLayer = (
    ctx: CanvasRenderingContext2D,
    doc: Pick<AnniversaryDocument, 'clubName' | 'years'>,
    W: number, H: number,
) => {
    ctx.save();
    try { (ctx as any).letterSpacing = '0px'; } catch { /* navegador sin soporte */ }
    drawHeadlineBand(ctx, W, H, STANDARD_LAYOUT.headline);
    drawClubBand(ctx, W, H, STANDARD_LAYOUT.club, doc.clubName);
    if (doc.years !== null && doc.years !== undefined) {
        drawYearsBand(ctx, W, H, STANDARD_LAYOUT.years, doc.years);
    }
    ctx.restore();
};

interface Measured { block: TextBlock; style: BlockStyle; lines: string[]; height: number; fontSize: number }

/** El espaciado de letra se fija ANTES de medir y de dibujar, con el mismo
 *  valor: medir sin él y dibujar con él es lo que saca un texto del recuadro. */
const applyLetterSpacing = (ctx: CanvasRenderingContext2D, st: BlockStyle, fontSize: number) => {
    try { (ctx as any).letterSpacing = st.letterSpacing ? `${(st.letterSpacing * fontSize).toFixed(2)}px` : '0px'; } catch { /* navegador sin soporte: se compone sin espaciado */ }
};

const measure = (ctx: CanvasRenderingContext2D, bloques: TextBlock[], W: number, boxW: number, escala: number): { items: Measured[]; total: number } => {
    const items: Measured[] = [];
    let total = 0;
    for (const b of bloques) {
        const st = STYLES[b.kind];
        const fontSize = st.size * W * escala;
        if (b.kind === 'rule') {
            const h = Math.max(2, fontSize);
            total += st.gapBefore * W * escala + h;
            items.push({ block: b, style: st, lines: [], height: h, fontSize: h });
            continue;
        }
        // El saludo fijo: dos líneas de cuerpos distintos + el subrayado. La
        // MISMA cuenta que usa el dibujo, o el bloque se sale de su medida.
        if (b.kind === 'headline') {
            const [arriba, abajo] = headlineLines(st.upper ? b.text.toUpperCase() : b.text);
            const h = (arriba ? fontSize * HEADLINE_TOP_RATIO * st.lineHeight : 0)
                + fontSize * st.lineHeight + fontSize * HEADLINE_RULE_GAP;
            total += st.gapBefore * W * escala + h;
            items.push({ block: b, style: st, lines: [arriba, abajo], height: h, fontSize });
            continue;
        }
        ctx.font = `${weightFor(b.kind, st)} ${fontSize}px ${st.font}`;
        applyLetterSpacing(ctx, st, fontSize);
        const texto = st.upper ? b.text.toUpperCase() : b.text;
        // Los años van en su banda y no se reparten en líneas: son un rótulo.
        const lines = b.kind === 'years' ? [yearsBandLabel(b.text)] : wrap(ctx, texto, boxW);
        const h = b.kind === 'years' ? fontSize * BAND_RATIO : lines.length * fontSize * st.lineHeight;
        total += st.gapBefore * W * escala + h;
        items.push({ block: b, style: st, lines, height: h, fontSize });
        applyLetterSpacing(ctx, {} as BlockStyle, fontSize);
    }
    return { items, total };
};

/**
 * Ajusta el bloque entero a la zona con UNA escala global.
 *
 * Una escala por bloque rompería la jerarquía —el titular podría quedar más
 * chico que el mensaje— y es justo lo que hace que una pieza se vea armada por
 * un programa. Con una sola escala, las proporciones se conservan.
 */
const AUTOFIT_FLOOR = 0.62;

const fit = (ctx: CanvasRenderingContext2D, bloques: TextBlock[], W: number, boxW: number, boxH: number) => {
    let escala = 1;
    let m = measure(ctx, bloques, W, boxW, escala);
    let guardia = 40;
    while (m.total > boxH && escala > AUTOFIT_FLOOR && guardia-- > 0) {
        escala = Math.max(AUTOFIT_FLOOR, escala * 0.96);
        m = measure(ctx, bloques, W, boxW, escala);
    }
    // Si ni con el piso entra, se DICE. Recortar el mensaje acá sería perder
    // contenido en silencio; quien mira la pieza tiene que poder verlo.
    return { ...m, escala, overflow: m.total > boxH + 1 };
};

// ─── Dibujo ────────────────────────────────────────────────────────────

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
};

/** Dibuja una imagen cubriendo el recuadro, centrada, sin deformarla. La
 *  fotografía NO se filtra, no se corrige de color y no se estira: sólo se
 *  encuadra. */
const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const escala = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * escala;
    const dh = img.naturalHeight * escala;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
};

/** Dibuja una imagen ENTERA dentro del recuadro, sin recortarla. Es lo que
 *  corresponde a un logotipo: recortarlo lo destruye. */
const drawContain = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, align: 'left' | 'right' | 'center' = 'left') => {
    const escala = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * escala;
    const dh = img.naturalHeight * escala;
    const dx = align === 'left' ? x : (align === 'right' ? x + w - dw : x + (w - dw) / 2);
    ctx.drawImage(img, dx, y + (h - dh) / 2, dw, dh);
    return { width: dw, height: dh, x: dx };
};

/** Dónde va la fotografía en modo `plain`: siempre del lado contrario al
 *  texto. Con el texto abajo, la foto ocupa la mitad de arriba. */
const photoBoxFor = (zone: TextZone, W: number, H: number) => {
    const pie = FOOTER_BAND.y * H;
    if (zone.id === 'left') return { x: W * 0.48, y: 0, w: W * 0.52, h: pie };
    if (zone.id === 'right') return { x: 0, y: 0, w: W * 0.52, h: pie };
    return { x: 0, y: 0, w: W, h: H * 0.50 };
};

export interface RenderResult {
    canvas: HTMLCanvasElement;
    /** Lo que no se pudo dibujar. Se DICE en la pantalla en vez de dejar un
     *  hueco sin explicación: una imagen que falla en silencio se lee como que
     *  el módulo está roto. */
    warnings: string[];
    /** El texto no entró en su zona ni con la reducción máxima. */
    overflow: boolean;
    /** El diseño generado EXISTE pero no se pudo cargar ni con reintentos:
     *  la pantalla puede ofrecer volver a componer SIN gastar una generación. */
    backdropFailed: boolean;
}


/**
 * Compone la pieza. **Ésta es la única función que dibuja un aniversario.**
 *
 * `scale` multiplica la resolución nominal: 1 devuelve el tamaño del documento
 * y 2 el doble, para imprimir. La maquetación NO cambia —todo está en
 * fracciones del ancho—, así que la descarga en alta es la misma pieza con más
 * píxeles, no otra composición.
 */
export const renderAnniversary = async (doc: AnniversaryDocument, { scale = 1 }: { scale?: number } = {}): Promise<RenderResult> => {
    // ⚠️ HAY QUE ESPERAR LAS TIPOGRAFÍAS ANTES DE MEDIR. Medir con la letra de
    // respaldo y dibujar con la definitiva es lo que produce un texto que se
    // sale del recuadro. Nunca rechaza: si la descarga falla, se compone con
    // las del sistema y la pieza sale igual. Y CON TOPE (v4.911): una descarga
    // de fuente estancada no puede dejar la pieza sin componer para siempre —
    // pasados 8 s se sigue con las del sistema; si la fuente llega después, la
    // próxima composición la usa.
    await Promise.race([ensureDesignFonts(), new Promise(res => setTimeout(res, 8000))]);

    const base = canvasSize(doc.format, Math.max(doc.width || 0, doc.height || 0) || undefined);
    const W = Math.round((doc.width || base.width) * scale);
    const H = Math.round((doc.height || base.height) * scale);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no pudo abrir el lienzo para componer la pieza.');

    const warnings: string[] = [];
    const zone = zoneById(doc.zoneId);

    // ── Capa 0 — el papel ───────────────────────────────────────────
    // Siempre blanco, incluso en modo `ai`: si la imagen del modelo no cubre
    // el lienzo entero, lo que asoma es papel y no negro.
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    // ── Capa 1 — el diseño ──────────────────────────────────────────
    //
    // ⚠️ SIN PIEZA SUSTITUTA (v4.924, directiva expresa del cliente:
    // «la IA genera A → A se muestra → A se descarga; nunca A falla →
    // se muestra B»). Hasta v4.923 un fallo de carga componía la fotografía
    // sobre fondo blanco y la presentaba como la pieza — el usuario veía un
    // diseño que NO corresponde a su generación. Ahora el fallo deja el
    // lienzo vacío y `backdropFailed`: la pantalla muestra el ERROR con
    // «Reintentar la carga», que vuelve a pedir la MISMA imagen (la pieza ya
    // está persistida en NUESTRO almacenamiento desde el sondeo) sin gastar
    // una generación. El modo `plain` NO es esto: es una decisión del
    // SERVIDOR (pieza sin composición) y conserva su camino.
    let backdropFailed = false;
    if (doc.renderMode === 'ai' && doc.backdropUrl) {
        try {
            const fondo = await loadBackdrop(doc.backdropUrl);
            // Encuadrado, no estirado: si el modelo devolvió otra proporción,
            // deformarla sería peor que recortarla, y el aviso de que volvió en
            // otra proporción ya lo dio la validación del servidor.
            drawCover(ctx, fondo, 0, 0, W, H);
        } catch {
            backdropFailed = true;
            warnings.push(BACKDROP_FAILED_WARNING);
            return { canvas, warnings, overflow: false, backdropFailed };
        }
    } else {
        await drawPlainPhoto(ctx, doc, zone, W, H, warnings);
    }

    // ── Capa 2 — el contenido ───────────────────────────────────────
    //
    // ⚠️ EN EL FLUJO SIMPLE LOS TEXTOS INSTITUCIONALES LOS IMPRIME LA
    // PLATAFORMA (v4.1064), no el modelo. Hasta v4.1063 esta línea los
    // SUPRIMÍA —«la imagen del modelo ya trae el texto dibujado»— y el precio
    // se cobró donde v4.895 lo había anunciado: «Bogotá Capital» se rotulaba
    // «Bogota Capital», y en el caso reportado «Bogoto Capital». El prompt ya
    // no le pide al modelo ni una letra, así que no hay nada que doblar: el
    // saludo, el nombre y la cifra se dibujan acá, con tipografía real, en las
    // bandas de `STANDARD_LAYOUT` que ese mismo prompt reserva.
    //
    // El modo `plain` conserva su camino: ahí no hay fondo generado y la pieza
    // se compone entera con la pila de bloques de siempre.
    //
    // Y LA FRASE CONMEMORATIVA SIGUE RETIRADA (v4.924, directiva expresa del
    // cliente): la jerarquía termina en «{AÑOS}». El compositor no imprime
    // ninguna frase — tampoco en piezas viejas que guarden `printPhrase`.
    const simpleAi = doc.simple === true && doc.renderMode === 'ai';

    // ⚠️ LA FOTOGRAFÍA VA ANTES QUE LOS TEXTOS, y el orden importa: la cifra de
    // años se superpone a propósito al borde inferior del marco —es el diseño
    // aprobado—, así que tiene que dibujarse encima. Y va DESPUÉS del fondo,
    // para tapar cualquier resto que el modelo haya dejado en el hueco.
    // ⚠️ PRIMERO EL VELO DE LA ZONA RESERVADA. Sólo en la configuración
    // vigente —el compositor coloca la fotografía Y escribe los textos—: con un
    // prompt editado en el que el modelo rotula o dibuja la foto, lavar el
    // centro le borraría su propio trabajo.
    if (simpleAi && doc.framed === true && doc.lettered !== true) drawReservedWash(ctx, W, H);

    if (simpleAi && doc.framed === true && doc.photoUrl) {
        try {
            const foto = await loadImage(doc.photoUrl);
            drawPhotoFrame(ctx, foto, STANDARD_LAYOUT.photo, W, H);
        } catch {
            // La pieza NO se pierde por esto: sale con su hueco y su aviso, que
            // es visible y se resuelve, en vez de quedarse sin componer.
            warnings.push('No se pudo cargar la fotografía en su marco. Volvé a componer la pieza — no gasta una generación nueva.');
        }
    }

    if (simpleAi && doc.lettered !== true) drawInstitutionalLayer(ctx, doc, W, H);
    const bloques = simpleAi ? [] : planTextBlocks(doc);

    const boxX = zone.x * W;
    const boxY = zone.y * H;
    const boxW = zone.w * W;
    const boxH = zone.h * H;

    const ajuste = fit(ctx, bloques, W, boxW, boxH);

    // Centrado vertical dentro de la zona: con el bloque pegado arriba, un
    // mensaje corto deja un hueco que se lee como si faltara algo.
    let y = boxY + Math.max(0, (boxH - ajuste.total) / 2);
    ctx.textBaseline = 'top';

    for (const item of ajuste.items) {
        y += item.style.gapBefore * W * ajuste.escala;
        // La CITA y el CIERRE van centrados sea cual sea la zona: es el
        // tratamiento de la referencia, no una preferencia de maquetación.
        const alineado = item.style.align || zone.align;
        const cx = alineado === 'center' ? boxX + boxW / 2 : boxX;

        if (item.block.kind === 'rule') {
            ctx.fillStyle = item.style.color;
            const ancho = Math.min(boxW * 0.30, boxW);
            const rx = alineado === 'center' ? cx - ancho / 2 : boxX;
            ctx.fillRect(rx, y, ancho, item.height);
            y += item.height;
            continue;
        }

        // El saludo fijo: «FELIZ» liviana arriba, «ANIVERSARIO» plena
        // abajo, y el subrayado dorado corto — la cabecera de la referencia.
        if (item.block.kind === 'headline') {
            const [arriba, abajo] = item.lines as [string, string];
            ctx.fillStyle = item.style.color;
            ctx.textAlign = alineado === 'center' ? 'center' : 'left';
            const fsTop = item.fontSize * HEADLINE_TOP_RATIO;
            if (arriba) {
                ctx.font = `500 ${fsTop}px ${item.style.font}`;
                ctx.fillText(arriba, cx, y);
                y += fsTop * item.style.lineHeight;
            }
            ctx.font = `700 ${item.fontSize}px ${item.style.font}`;
            ctx.fillText(abajo, cx, y);
            y += item.fontSize * item.style.lineHeight;
            // El subrayado corto, a mitad del hueco que la medición reservó.
            const ruleW = Math.min(boxW * 0.30, ctx.measureText(abajo).width * 0.55);
            const ruleH = Math.max(2, item.fontSize * 0.045);
            ctx.fillStyle = ROTARY_GOLD;
            ctx.fillRect(alineado === 'center' ? cx - ruleW / 2 : boxX, y + item.fontSize * (HEADLINE_RULE_GAP / 2) - ruleH / 2, ruleW, ruleH);
            y += item.fontSize * HEADLINE_RULE_GAP;
            continue;
        }

        ctx.font = `${weightFor(item.block.kind, item.style)} ${item.fontSize}px ${item.style.font}`;
        applyLetterSpacing(ctx, item.style, item.fontSize);

        // La BANDA dorada de los años, como en la referencia: cinta con
        // muescas en los extremos y un punto dorado a cada lado, con
        // «40 AÑOS» en blanco. La cifra la escribimos nosotros — exacta POR
        // CONSTRUCCIÓN.
        if (item.block.kind === 'years') {
            const rotulo = item.lines[0] || yearsBandLabel(item.block.text);
            const anchoTexto = ctx.measureText(rotulo).width;
            const pad = item.fontSize * 0.95;
            const bandaW = Math.min(boxW * 0.9, anchoTexto + pad * 2);
            const bandaH = item.height;
            const rPunto = Math.max(2, bandaH * 0.10);
            // Alineada a la izquierda, la cinta deja sitio para SU punto: si
            // arranca en el borde de la zona, el punto izquierdo se recorta.
            const bx = alineado === 'center' ? cx - bandaW / 2 : boxX + rPunto * 5;
            const muesca = bandaH * 0.32;
            ctx.fillStyle = ROTARY_GOLD;
            ctx.beginPath();
            ctx.moveTo(bx, y);
            ctx.lineTo(bx + bandaW, y);
            ctx.lineTo(bx + bandaW - muesca, y + bandaH / 2);
            ctx.lineTo(bx + bandaW, y + bandaH);
            ctx.lineTo(bx, y + bandaH);
            ctx.lineTo(bx + muesca, y + bandaH / 2);
            ctx.closePath();
            ctx.fill();
            // Los puntos que flanquean la cinta en la referencia.
            for (const px of [bx - rPunto * 3, bx + bandaW + rPunto * 3]) {
                if (px > boxX - rPunto && px < boxX + boxW + rPunto) {
                    ctx.beginPath(); ctx.arc(px, y + bandaH / 2, rPunto, 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.fillStyle = PAPER;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(rotulo, bx + bandaW / 2, y + bandaH / 2 + item.fontSize * 0.04);
            ctx.textBaseline = 'top';
            y += bandaH;
            applyLetterSpacing(ctx, {} as BlockStyle, item.fontSize);
            continue;
        }

        // Las comillas doradas de la cita — el tratamiento de la referencia.
        // Se dibujan pegadas a la primera y la última línea, acotadas a la
        // zona: son decoración del bloque, no parte de la medida.
        if (item.block.kind === 'message' && item.lines.length) {
            ctx.save();
            ctx.fillStyle = ROTARY_GOLD;
            ctx.font = `900 ${item.fontSize * 1.9}px Georgia, 'Times New Roman', serif`;
            ctx.textAlign = 'left';
            const w1 = (() => { ctx.font = `${weightFor(item.block.kind, item.style)} ${item.fontSize}px ${item.style.font}`; const w = ctx.measureText(item.lines[0]).width; ctx.font = `900 ${item.fontSize * 1.9}px Georgia, serif`; return w; })();
            const qx = Math.max(boxX, cx - w1 / 2 - item.fontSize * 2.1);
            ctx.fillText('\u201C', qx, y - item.fontSize * 0.55);
            const wUlt = (() => { ctx.font = `${weightFor(item.block.kind, item.style)} ${item.fontSize}px ${item.style.font}`; const w = ctx.measureText(item.lines[item.lines.length - 1]).width; ctx.font = `900 ${item.fontSize * 1.9}px Georgia, serif`; return w; })();
            const hCita = item.lines.length * item.fontSize * item.style.lineHeight;
            const q2 = Math.min(boxX + boxW - item.fontSize * 1.4, cx + wUlt / 2 + item.fontSize * 0.95);
            ctx.fillText('\u201D', q2, y + hCita - item.fontSize * 1.05);
            ctx.restore();
        }

        ctx.fillStyle = item.style.color;
        ctx.textAlign = alineado === 'center' ? 'center' : 'left';

        for (const linea of item.lines) {
            // El nombre del club va en DOS tonos cuando cabe en una línea:
            // prefijo institucional azul + parte distintiva dorada. En dos
            // líneas se queda entero en azul — partir el color por el salto
            // de línea se lee como un error.
            const dosTonos = item.block.kind === 'club' && item.lines.length === 1 ? splitClubName(linea) : null;
            if (dosTonos && dosTonos.prefix) {
                const wPrefix = ctx.measureText(dosTonos.prefix).width;
                const wTotal = wPrefix + ctx.measureText(dosTonos.rest).width;
                const x0 = alineado === 'center' ? cx - wTotal / 2 : boxX;
                ctx.textAlign = 'left';
                ctx.fillStyle = ROTARY_BLUE;
                ctx.fillText(dosTonos.prefix, x0, y);
                ctx.fillStyle = ROTARY_GOLD;
                ctx.fillText(dosTonos.rest, x0 + wPrefix, y);
                ctx.textAlign = alineado === 'center' ? 'center' : 'left';
                ctx.fillStyle = item.style.color;
            } else {
                ctx.fillText(linea, cx, y);
            }
            y += item.fontSize * item.style.lineHeight;
        }
        applyLetterSpacing(ctx, {} as BlockStyle, item.fontSize);
    }

    // ── Capa 3 — el branding ────────────────────────────────────────
    await drawBranding(ctx, doc, W, H, warnings);

    if (ajuste.overflow) {
        warnings.push('El mensaje es más largo de lo que entra en la pieza y quedó ajustado al mínimo. Conviene regenerarlo.');
    }
    return { canvas, warnings, overflow: ajuste.overflow, backdropFailed };
};

/** La capa 1 en modo `plain`: la fotografía intacta sobre papel blanco. */
const drawPlainPhoto = async (ctx: CanvasRenderingContext2D, doc: AnniversaryDocument, zone: TextZone, W: number, H: number, warnings: string[]) => {
    if (!doc.photoUrl) return;
    try {
        const foto = await loadImage(doc.photoUrl);
        const caja = photoBoxFor(zone, W, H);
        ctx.save();
        // Esquinas suaves para que no se lea como un rectángulo pegado. No es
        // un filtro sobre la imagen: es por dónde se la recorta. Los píxeles
        // viajan intactos.
        roundRect(ctx, caja.x, caja.y, caja.w, caja.h, Math.min(caja.w, caja.h) * 0.06);
        ctx.clip();
        drawCover(ctx, foto, caja.x, caja.y, caja.w, caja.h);
        ctx.restore();
    } catch {
        warnings.push('No se pudo cargar la fotografía.');
    }
};

/**
 * La capa 3. Todo lo que se dibuja acá viene de un ARCHIVO REAL o de un dato
 * de la base. Nada se inventa: un club sin logotipo cargado no muestra
 * logotipo, y eso es la verdad — dibujar un emblema «parecido» es justo lo que
 * una institución no puede publicar.
 */
const drawBranding = async (ctx: CanvasRenderingContext2D, doc: AnniversaryDocument, W: number, H: number, warnings: string[]) => {
    const b = doc.branding || {};
    const bandaY = FOOTER_BAND.y * H;
    const bandaH = FOOTER_BAND.h * H;
    const hayAlgo = !!(b.clubLogo || b.districtLine || b.footerImage);

    // ⚠️ EL PIE INSTITUCIONAL SE IMPRIME TAL CUAL (v4.917, pedido expreso del
    // cliente): la imagen que subió el administrador va al ancho COMPLETO del
    // lienzo, con su proporción NATIVA, anclada al borde inferior — como una
    // capa encima de la pieza, sin recortarla ni estirarla. Hasta v4.916 se
    // dibujaba con `cover` recortada a la banda del 16 %: un pie con otra
    // proporción salía mutilado. El archivo del administrador manda; si su
    // pie es más alto que la banda, sube sobre el diseño a propósito — la
    // zona inferior de la pieza ya viene reservada por el prompt. Y se carga
    // con los MISMOS reintentos que el diseño (v4.915): desde este pedido el
    // pie es la firma estándar de todas las piezas, no un adorno.
    let pieCubierto = false;
    if (b.footerImage) {
        try {
            const img = await loadBackdrop(b.footerImage);
            if (img.naturalWidth > 0) {
                const altoPie = W * (img.naturalHeight / img.naturalWidth);
                ctx.drawImage(img, 0, H - altoPie, W, altoPie);
                pieCubierto = true;
            }
        } catch { warnings.push('No se pudo cargar el pie institucional.'); }
    }
    if (hayAlgo && !pieCubierto) {
        // Sin imagen de pie: un velo blanco para que el pie se lea sobre
        // cualquier fondo, y un filete dorado que garantiza la separación.
        // Con la imagen puesta no hace falta ninguno: ELLA es el pie.
        ctx.fillStyle = 'rgba(255,255,255,0.93)';
        ctx.fillRect(0, bandaY, W, bandaH);
        ctx.fillStyle = ROTARY_GOLD;
        ctx.fillRect(0, bandaY, W, Math.max(2, H * 0.0022));
    }

    const margen = W * 0.055;
    const alto = bandaH * 0.46;
    const centro = bandaY + bandaH / 2 - alto / 2;
    const izquierda0 = margen;
    let izquierda = izquierda0;
    const derecha = W - margen;

    // ⚠️ CON EL PIE PUESTO, NADA SE IMPRIME ENCIMA (v4.922, supersede el «el
    // logotipo del club y la línea del distrito se imprimen ENCIMA» de
    // v4.917). El PNG del pie es la firma institucional COMPLETA — ya trae
    // sus emblemas y su línea de gobierno — y el reporte con captura mostró
    // el resultado de no respetarlo: NUESTRO logotipo del club y NUESTRA
    // línea «Distrito 4271 · 2026-2027» pintados sobre el pie real, leídos
    // como «la IA volvió a generar logos». El pie va pixel-perfect y es la
    // capa final; el logotipo y la línea sólo se imprimen cuando NO hay pie.
    if (b.clubLogo && !pieCubierto) {
        try {
            const img = await loadImage(b.clubLogo);
            const r = drawContain(ctx, img, izquierda, centro, W * 0.22, alto, 'left');
            izquierda += r.width + W * 0.03;
        } catch { warnings.push('No se pudo cargar el logotipo del club.'); }
    }
    if (b.districtLine && !pieCubierto) {
        const size = W * 0.0175;
        ctx.font = `600 ${size}px ${BODY}`;
        ctx.fillStyle = INK;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const disponible = Math.max(0, derecha - izquierda);
        const lineas = wrap(ctx, b.districtLine, disponible);
        // Una sola línea: el pie no es sitio para un párrafo, y dos líneas
        // desalinean el logotipo.
        ctx.fillText(lineas[0] || '', izquierda, bandaY + bandaH / 2);
        ctx.textBaseline = 'top';
    }

    if (b.watermark) {
        try {
            const img = await loadImage(b.watermark);
            ctx.save();
            ctx.globalAlpha = 0.22;
            drawContain(ctx, img, W - margen - W * 0.14, H * 0.035, W * 0.14, H * 0.075, 'right');
            ctx.restore();
        } catch { warnings.push('No se pudo cargar la marca de agua.'); }
    }
};

// ─── Descarga ──────────────────────────────────────────────────────────
//
// Se exporta EL MISMO canvas que se está mirando. No se vuelve a componer: si
// se recompusiera, volverían a ser dos cosas y podrían diferir.

export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.95): Promise<Blob> =>
    new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo exportar la pieza.'))),
            type, quality
        );
    });

export const safeFileName = (clubName: string, years: number | null) => {
    const base = String(clubName || 'aniversario')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return `${base || 'aniversario'}${years ? `-${years}-anios` : ''}.png`;
};

export const downloadCanvas = async (canvas: HTMLCanvasElement, filename: string) => {
    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Se libera en el siguiente tick: revocarlo en el acto cancela la descarga
    // en algunos navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export default { renderAnniversary, planTextBlocks, canvasToBlob, downloadCanvas, safeFileName, loadImage };
