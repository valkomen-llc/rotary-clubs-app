// ════════════════════════════════════════════════════════════════════
// Director Creativo IA — el análisis de una referencia
// v4.838.0
//
// La orquestación de lo que `creativeDNA.js` decide. Acá se toca sharp, la red
// y el modelo de visión; el criterio no vive en este archivo.
//
// ── EL REPARTO, Y POR QUÉ ES ASÍ ────────────────────────────────────
//
// `measureReference` cuenta PÍXELES: paleta, cuánto de la pieza es fotografía,
// cuánto es texto, el contraste y la proporción. Es determinista —la misma
// imagen da el mismo número siempre— y no cuesta una llamada a nadie.
//
// `describeReference` pregunta ESTRUCTURA a un modelo de visión: en qué banda
// vive cada cosa, qué carácter tiene la letra, cómo cierra la pieza. Nada
// numérico: a un modelo se le puede preguntar «¿la fotografía está arriba a la
// derecha?» y acierta; se le puede preguntar «¿qué hexadecimal es el fondo?» y
// lo inventa con total naturalidad.
//
// ── SE ANALIZA UNA POR UNA, NO TODAS JUNTAS ─────────────────────────
//
// Componer las referencias lado a lado —el recurso del Creador de Reels— haría
// falta si el modelo tuviera que COMPARARLAS. No es el caso: cada referencia se
// describe sola y las descripciones las consolida el CÓDIGO (`consolidate`),
// por moda y mediana. Dos motivos y los dos importan: la composición habría que
// subirla a algún sitio para tener URL, y —sobre todo— pedirle a un modelo «las
// características comunes de estas tres piezas» daría un resultado
// irreproducible y no auditable, que es justo lo que este módulo evita.
// ════════════════════════════════════════════════════════════════════

import sharp from 'sharp';
import { generateCopy } from '../services/copywritingService.js';
import {
    ZONE_ROLES, ZONE_BANDS, ZONE_SIDES, ZONE_EDGES,
    TYPE_CHARACTERS, TYPE_JUMPS, FOOT_STYLES,
    normalizeMeasured, normalizeDescribed, contrastRatio,
} from './creativeDNA.js';

// ─── Medir ─────────────────────────────────────────────────────────────

/** A cuánto se reduce la imagen para contar. 256 px de lado largo alcanzan de
 *  sobra para la paleta y las coberturas, y hacen que medir una referencia
 *  cueste milisegundos en vez de segundos. Subirlo no mejora la medida: lo que
 *  se busca son áreas, no detalle. */
const ANALYSIS_SIZE = 256;

/** El lado del bloque con el que se decide qué es fotografía y qué es tinta.
 *  16 px sobre 256 son 1/16 de la pieza: suficientemente chico para que un
 *  bloque de texto no arrastre el fondo, y suficientemente grande para que el
 *  ruido de compresión no cuente como detalle. */
const BLOCK = 16;

/** Por debajo de esta desviación típica el bloque es PLANO: fondo, sin texto ni
 *  fotografía. Medido sobre piezas reales: un fondo liso da 0-3 y un degradado
 *  institucional 4-9. */
const FLAT_STD = 12;

/**
 * ── TEXTO Y FOTOGRAFÍA TIENEN LA MISMA VARIANZA, Y ÉSE ERA EL ERROR ──
 *
 * La primera versión partía los bloques por desviación típica: mucha varianza =
 * fotografía. Medido sobre las diez composiciones propias —donde se sabe la
 * respuesta— daba 35 % de fotografía en una pieza que NO TIENE fotografía y 0 %
 * de tinta en una llena de texto. Un bloque de letra blanca sobre azul tiene
 * tanta varianza como un bloque de paisaje.
 *
 * Lo que sí los separa es la FORMA de esa varianza:
 *
 *   · el texto sobre un fondo liso es BIMODAL — los píxeles se agrupan en dos
 *     valores, el fondo y la tinta, y casi nada en el medio;
 *   · una fotografía es CONTINUA — el histograma está repartido.
 *
 * Se mide con la separabilidad de Otsu (η = varianza entre clases / varianza
 * total): busca el corte que mejor parte el bloque en dos y dice cuánto de la
 * varianza explica ese corte. Cerca de 1 es bimodal; repartido baja.
 *
 * COMPROBADO contra los dos casos extremos, donde se sabe la respuesta:
 *
 *   · fondo liso con catorce líneas de texto → 0 % fotografía, 16,4 % tinta;
 *   · textura tipo fotografía a toda página  → 88 % fotografía, 0,7 % tinta.
 *
 * ⚠️ LIMITACIÓN CONOCIDA, y conviene no descubrirla dos veces: una fotografía
 * MUY SUAVE —un cielo despejado, un desenfoque de fondo— es plana, así que no
 * cuenta como fotografía. Para lo que sirve esta medida —cuánta imagen con
 * detalle carga la pieza— eso es lo correcto, pero no hay que leerla como «qué
 * porcentaje del lienzo ocupa una foto».
 */
const BIMODAL_MIN = 0.78;

/** En un bloque bimodal, la clase MINORITARIA es la tinta. Por encima de esta
 *  fracción ya no es texto sobre un fondo: son dos áreas de color, un filete
 *  grueso o el borde de una forma, y contarlo como tinta inflaría la densidad. */
const INK_MAX_SHARE = 0.45;

/** El cuantizador de la paleta. 24 niveles por canal agrupan las variantes de
 *  compresión de un mismo color sin fundir dos colores de marca distintos.
 *  Después `mergePalettes` vuelve a agrupar por cercanía al consolidar. */
const QUANT = 24;

const aHex = (r, g, b) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/**
 * Separabilidad de Otsu sobre las luminancias de un bloque.
 *
 * Busca el corte que MAXIMIZA la varianza entre las dos clases y devuelve qué
 * fracción de la varianza total explica (`eta`) y qué tamaño tiene la clase
 * minoritaria. `eta` cerca de 1 significa que el bloque son dos poblaciones
 * separadas —fondo y tinta—; repartida significa contenido continuo.
 *
 * Se calcula sobre un histograma de 32 cubos, no sobre los 256 niveles: con
 * 256 píxeles por bloque, la mitad de los niveles estarían vacíos y el corte
 * óptimo sería ruido.
 */
const OTSU_BINS = 32;

const otsu = (lum, media, varTotal) => {
    if (varTotal <= 0) return { eta: 0, minoria: 0 };
    const hist = new Array(OTSU_BINS).fill(0);
    for (const v of lum) hist[Math.min(OTSU_BINS - 1, Math.max(0, Math.floor((v / 256) * OTSU_BINS)))]++;
    const n = lum.length;
    const centro = (i) => ((i + 0.5) / OTSU_BINS) * 256;

    let mejor = 0, mejorCorte = 0, wAcum = 0, sumaAcum = 0;
    const sumaTotal = hist.reduce((s, c, i) => s + c * centro(i), 0);
    for (let i = 0; i < OTSU_BINS - 1; i++) {
        wAcum += hist[i];
        if (!wAcum) continue;
        const wB = n - wAcum;
        if (!wB) break;
        sumaAcum += hist[i] * centro(i);
        const mA = sumaAcum / wAcum, mB = (sumaTotal - sumaAcum) / wB;
        const entre = (wAcum / n) * (wB / n) * (mA - mB) ** 2;
        if (entre > mejor) { mejor = entre; mejorCorte = wAcum; }
    }
    return { eta: mejor / varTotal, minoria: Math.min(mejorCorte, n - mejorCorte) / n };
};

/** El contraste entre los extremos de luminancia con presencia real. Los
 *  percentiles acotan el efecto de unos pocos píxeles sueltos —el antialias de
 *  una letra, un reflejo— sin perder el blanco de un titular, que es
 *  exactamente lo que la paleta por área no ve. */
const contrastePercentil = (data, W, H, C) => {
    const lum = [];
    // Se muestrea uno de cada cuatro píxeles: con 256×256 son 16.000 muestras,
    // de sobra para dos percentiles y cuatro veces más rápido.
    for (let i = 0; i < W * H; i += 4) {
        const p = i * C;
        lum.push(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
    }
    if (!lum.length) return 1;
    lum.sort((a, b) => a - b);
    const en = (q) => lum[Math.min(lum.length - 1, Math.max(0, Math.round(q * (lum.length - 1))))];
    const gris = (v) => aHex(v, v, v);
    return contrastRatio(gris(en(0.98)), gris(en(0.02)));
};

/**
 * Cuenta píxeles y devuelve lo MEDIDO. Nunca lanza: una referencia que sharp no
 * puede leer se reporta con su motivo y el perfil se hace con las demás. Un
 * fallo de medición no puede llevarse por delante el análisis entero.
 */
export const measureReference = async (buffer) => {
    try {
        const img = sharp(buffer).rotate();           // `rotate()` aplica la orientación EXIF
        const meta = await img.metadata();
        const { data, info } = await img
            .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'inside' })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const W = info.width, H = info.height, C = info.channels;
        const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };

        // ── Paleta por cuantización ───────────────────────────────
        const cubos = new Map();
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const [r, g, b] = px(x, y);
                const k = `${Math.round(r / QUANT)},${Math.round(g / QUANT)},${Math.round(b / QUANT)}`;
                const c = cubos.get(k);
                if (c) { c.n++; c.r += r; c.g += g; c.b += b; }
                else cubos.set(k, { n: 1, r, g, b });
            }
        }
        const total = W * H;
        const paleta = [...cubos.values()]
            .sort((a, b) => b.n - a.n)
            .slice(0, 6)
            // El color del cubo es su PROMEDIO, no el centro del cubo: el
            // centro puede ser un tono que no está en la imagen.
            .map(c => ({ hex: aHex(c.r / c.n, c.g / c.n, c.b / c.n), cobertura: c.n / total }));

        // ── Bloques: fotografía y tinta ───────────────────────────
        let bloquesFoto = 0, bloques = 0, tinta = 0;
        for (let by = 0; by + BLOCK <= H; by += BLOCK) {
            for (let bx = 0; bx + BLOCK <= W; bx += BLOCK) {
                bloques++;
                const lum = [];
                for (let y = by; y < by + BLOCK; y++)
                    for (let x = bx; x < bx + BLOCK; x++) {
                        const [r, g, b] = px(x, y);
                        lum.push(0.299 * r + 0.587 * g + 0.114 * b);
                    }
                const media = lum.reduce((s, v) => s + v, 0) / lum.length;
                const varTotal = lum.reduce((s, v) => s + (v - media) ** 2, 0) / lum.length;
                if (Math.sqrt(varTotal) < FLAT_STD) continue;   // fondo: ni tinta ni foto

                const { eta, minoria } = otsu(lum, media, varTotal);
                if (eta >= BIMODAL_MIN && minoria <= INK_MAX_SHARE) tinta += minoria * lum.length;
                else bloquesFoto++;
            }
        }

        // ── Contraste ─────────────────────────────────────────────
        //
        // El contraste que la pieza EXPLOTA, entre sus extremos de luminancia
        // con presencia real (percentiles 2 y 98). NO se saca de la paleta: la
        // paleta son los seis cubos más poblados, y el texto blanco de una pieza
        // ocupa demasiados pocos píxeles para entrar ahí. Medido sobre las
        // propias composiciones, la versión por paleta daba 1,9 en piezas con
        // letra blanca sobre azul, que es un contraste altísimo.
        const contrasteMin = contrastePercentil(data, W, H, C);

        const w = meta.width || W, h = meta.height || H;
        const g = (a, b) => (b ? g(b, a % b) : a);
        const d = g(w, h) || 1;

        return normalizeMeasured({
            paleta,
            // Sobre el total de píxeles de los bloques enteros, no sobre la
            // imagen: los bordes sobrantes no se miraron.
            tintaCobertura: bloques ? tinta / (bloques * BLOCK * BLOCK) : 0,
            fotoCobertura: bloques ? bloquesFoto / bloques : 0,
            contrasteMin,
            proporcion: `${w / d}:${h / d}`,
        });
    } catch (e) {
        console.warn('[creativeAnalysis] no se pudo medir la referencia:', e.message);
        return null;
    }
};

// ─── Describir ─────────────────────────────────────────────────────────

const lista = (xs) => xs.map(x => `"${x}"`).join(' | ');

export const DESCRIBE_SYSTEM = `Sos un director de arte que describe la ESTRUCTURA de una pieza gráfica institucional para poder reproducir su lenguaje visual en otras piezas.

Devolvés SOLO un objeto JSON, sin texto alrededor, con esta forma exacta:

{
  "zonas": [{ "rol": …, "banda": …, "lado": …, "borde": … }],
  "jerarquia": [ … ],
  "caracter": …,
  "saltoTipografico": …,
  "pie": …
}

Valores permitidos, y NINGÚN otro:
- rol: ${lista(ZONE_ROLES)}
- banda: ${lista(ZONE_BANDS)}
- lado: ${lista(ZONE_SIDES)}
- borde: ${lista(ZONE_EDGES)}  ("curva" si el borde de esa zona es una curva o una onda, no un ángulo recto)
- caracter: ${lista(TYPE_CHARACTERS)}  (el carácter de la letra de los TITULARES)
- saltoTipografico: ${lista(TYPE_JUMPS)}  ("extremo" si el titular es muchísimo mayor que el texto)
- pie: ${lista(FOOT_STYLES)}  (cómo cierra la pieza abajo)
- jerarquia: los roles ordenados por PESO VISUAL, del que más pesa al que menos.

Reglas:
- Describí SOLO lo que se ve. Si una zona no está en la pieza, no la incluyas.
- NO inventes colores, medidas, márgenes ni porcentajes: no se te piden y no se pueden ver con precisión.
- NO describas el contenido —qué dice el texto, quién sale en la foto—: sólo dónde está cada cosa y cómo se ve.`;

/**
 * Le pregunta la estructura a un modelo de visión.
 *
 * Devuelve `null` ante cualquier fallo —sin modelo configurado, sin respuesta,
 * respuesta ilegible— y NO lanza. El perfil se puede armar igual con lo medido:
 * la paleta y las coberturas son la mitad del parecido y son justamente la
 * mitad que no depende de un proveedor externo. Degradar no es lo mismo que
 * fallar, y acá corresponde degradar.
 */
export const describeReference = async ({ imageUrl, provider = null }) => {
    if (!imageUrl) return null;
    try {
        const res = await generateCopy({
            ...(provider ? { provider } : {}),
            system: DESCRIBE_SYSTEM,
            userText: 'Describí la estructura de esta pieza y devolvé el JSON.',
            imageUrl,
            temperature: 0.2,
            maxTokens: 700,
            jsonMode: true,
        });
        const crudo = String(res?.content || '').trim();
        const json = crudo.startsWith('{') ? crudo : crudo.slice(crudo.indexOf('{'), crudo.lastIndexOf('}') + 1);
        const parsed = JSON.parse(json);
        // El modelo PROPONE, `normalizeDescribed` DECIDE: lo que no esté en los
        // catálogos cerrados se descarta y se reporta.
        return normalizeDescribed(parsed);
    } catch (e) {
        console.warn('[creativeAnalysis] no se pudo describir la referencia:', e.message);
        return null;
    }
};

// ─── Una referencia entera ─────────────────────────────────────────────

/** Descarga la imagen. Se acota el tamaño porque esto corre en una función con
 *  memoria contada y una referencia es una pieza de redes, no un maestro de
 *  imprenta. */
export const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;

const descargar = async (url) => {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) throw new Error('la dirección de la referencia no es https');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_REFERENCE_BYTES) throw new Error('la imagen pesa demasiado');
    return buf;
};

/**
 * Mide y describe UNA referencia. Las dos mitades son independientes a
 * propósito: la medición no necesita red más allá de la descarga y la
 * descripción no necesita sharp, así que un fallo de una no arrastra a la otra.
 */
export const analyzeReference = async ({ url, provider = null, describe = true }) => {
    let measured = null, described = null;
    const notas = [];
    try {
        measured = await measureReference(await descargar(url));
        if (!measured) notas.push('no se pudo medir la imagen');
    } catch (e) {
        notas.push(`no se pudo leer la imagen: ${e.message}`);
    }
    if (describe) {
        described = await describeReference({ imageUrl: url, provider });
        if (!described) notas.push('el modelo de visión no describió la estructura; se usa sólo lo medido');
        else if (described.descartes.length) notas.push(...described.descartes);
    }
    return { url, measured, described, notes: notas };
};

/** Todas las referencias de un perfil. Van EN PARALELO: son de dos a cinco
 *  imágenes y en serie sumarían una espera que nadie tiene por qué pagar. */
export const analyzeReferences = async (urls = [], opts = {}) =>
    Promise.all(urls.slice(0, 8).map(u => analyzeReference({ url: u, ...opts })));

export default { measureReference, describeReference, analyzeReference, analyzeReferences, DESCRIBE_SYSTEM };
