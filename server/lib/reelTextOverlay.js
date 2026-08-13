// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — texto en pantalla y tarjeta de cierre
// v4.783.0
//
// Los rótulos que se ven SOBRE el video y la placa institucional del final.
//
// ─── POR QUÉ SVG → PNG Y NO `drawtext` ─────────────────────────────────────
//
// `drawtext` es el camino obvio y tiene dos problemas que no se ven hasta que
// falla en producción:
//
//   1. NECESITA UNA FUENTE EN EL SISTEMA. La función corre en Vercel, donde no
//      hay fuentes instaladas, así que habría que empaquetar un `.ttf` y
//      apuntar `fontfile=` a él. Y si el binario de `ffmpeg-static` viniera sin
//      freetype, el filtro no existe y el fallo es un error de filtro
//      críptico a mitad del montaje, después de haber pagado los clips.
//   2. NO SABE REPARTIR LÍNEAS. Un rótulo de dos frases hay que partirlo a
//      mano igual, así que la mitad del trabajo se hace fuera de todos modos.
//
// `sharp` ya es dependencia de la plataforma y rasteriza SVG con su propio
// motor de texto. Se compone un PNG transparente del tamaño del cuadro y se
// pega con `overlay`, que es un filtro básico presente en cualquier build. La
// tipografía, el interlineado y el contraste quedan bajo control nuestro, y el
// reparto de líneas lo hace `layoutText` — el MISMO de Plantillas IA, con su
// medidor inyectado, en vez de un segundo repartidor que se separe del primero.
//
// ─── ESTO NO ES POSTPROCESAR ───────────────────────────────────────────────
//
// La regla #1 del sitio prohíbe retocar el archivo que devuelve un modelo
// —composite, máscara, blur, recorte— porque se ve pegado. Un rótulo declarado
// de antemano sobre el montaje es EDICIÓN, la misma categoría que los fundidos
// y la banda sonora: el CONTENIDO de cada clip viaja intacto y ningún píxel de
// la fotografía se reinterpreta. Es la distinción que ya está escrita para el
// montaje en `reelSpec.js`.
//
// Este archivo NO llama a ffmpeg: compone imágenes. Quien las pega es
// `buildFilterGraph`.
// ════════════════════════════════════════════════════════════════════

import sharp from 'sharp';
import { layoutText } from './designSpec.js';

// ─── Tipografía ────────────────────────────────────────────────────────────
//
// Fuentes del SISTEMA solamente, igual que en Plantillas IA: una fuente web
// habría que cargarla antes de rasterizar y, si no llegó, el rótulo sale con
// otra letra sin que nada avise. `sans-serif` al final es la red — el
// contenedor de la función tiene al menos una.
const FONT_STACK = 'DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif';

// Anchos de avance por carácter, en fracción del tamaño de fuente, para una
// sans-serif en negrita. No es la métrica exacta de la fuente: es la
// aproximación que necesita `layoutText` para repartir líneas.
//
// ── ESTOS NÚMEROS ESTÁN MEDIDOS, NO ESTIMADOS ──
//
// Se obtuvieron rasterizando muestras con la misma `sharp` que compone el
// rótulo y midiendo la extensión real del píxel dibujado, a 78 px y peso 700:
//
//   minúsculas normales  0,671 em     mayúsculas  0,674 em
//   angostas (iltfrI.,)  0,382 em     anchas (mwMW@)  0,997 em
//
// La primera versión de esta tabla iba a ojo y daba 0,56 em a las minúsculas:
// un 19 % de menos, y el resultado era que `layoutText` creía que la línea
// entraba, no bajaba el tamaño, y el texto se salía del margen lateral por los
// dos lados. Se veía en la primera imagen compuesta. Si se toca esta tabla,
// MEDIRLA otra vez — a ojo se subestima siempre, y el error no se nota hasta
// que hay una frase larga.
const NARROW = new Set(['i', 'j', 'l', 't', 'f', 'r', 'I', '.', ',', ':', ';', '!', '|', "'", '’', ' ']);
const WIDE = new Set(['m', 'w', 'M', 'W', '—', '@']);

// Margen de seguridad sobre lo medido. Existe porque la fuente que resuelva el
// contenedor de producción puede no ser la misma con la que se calibró —el
// stack es una lista de preferencias, no una garantía—, y porque equivocarse
// por exceso sólo cuesta una línea de más, mientras que equivocarse por defecto
// saca el texto del cuadro.
const WIDTH_SAFETY = 1.04;

const measureText = (text, fontPx) => {
    let units = 0;
    for (const ch of String(text)) {
        if (NARROW.has(ch)) units += 0.382;
        else if (WIDE.has(ch)) units += 0.997;
        else if (ch >= 'A' && ch <= 'Z') units += 0.674;
        else units += 0.671;
    }
    return units * fontPx * WIDTH_SAFETY;
};

// ─── Escapado ──────────────────────────────────────────────────────────────
//
// El texto viene de un modelo de lenguaje y termina dentro de un documento XML.
// Un `&` o un `<` sin escapar rompen el SVG entero y `sharp` lanza: el rótulo
// no sale y el Reel se queda sin texto sin decir por qué. Mismo criterio que
// `escapeAttr` en `seoRender.js`.
const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// ─── Posición del rótulo ───────────────────────────────────────────────────
//
// `lower` por defecto: en una pieza vertical el tercio inferior es donde menos
// tapa —las caras suelen estar arriba y al centro— y es donde el ojo ya busca
// el subtítulo. La franja de la interfaz de Instagram come los últimos ~180 px,
// así que el texto no baja de ahí.
const SAFE_BOTTOM = 0.17;   // fracción del alto reservada abajo
const SAFE_SIDE = 0.08;     // margen lateral

export const TEXT_POSITIONS = {
    lower: { id: 'lower', label: 'Tercio inferior', isDefault: true },
    upper: { id: 'upper', label: 'Tercio superior' },
    center: { id: 'center', label: 'Centrado' }
};

/**
 * Compone el PNG transparente de un rótulo, del tamaño completo del cuadro.
 *
 * Full-frame y no un recorte ajustado a propósito: pegarlo con `overlay=0:0`
 * hace que la posición viva ENTERA en esta función, que es la que sabe de
 * tipografía. Con un PNG pequeño, el grafo de filtros tendría que calcular
 * coordenadas y la decisión quedaría partida en dos sitios que se desincronizan.
 * Un PNG de 1080×1920 mayormente transparente pesa unos pocos KB.
 *
 * Devuelve `null` si no hay texto: un rótulo vacío no se pega, y así quien
 * llama no necesita comprobarlo.
 */
export const renderTextOverlay = async ({
    text,
    width,
    height,
    position = 'lower',
    // El realce oscuro detrás del texto. No es decoración: sobre una fotografía
    // clara, un texto blanco sin fondo es ilegible, y estas piezas se miran en
    // un teléfono al sol. Es un degradado y no una caja porque un rectángulo
    // sólido se lee como una tarjeta pegada encima.
    scrim = true
}) => {
    const clean = String(text || '').trim();
    if (!clean) return null;

    const boxW = Math.round(width * (1 - SAFE_SIDE * 2));
    // Alto disponible para el rótulo: un tercio del cuadro. Más que eso deja de
    // ser un rótulo y tapa la fotografía, que es lo que se vino a mostrar.
    const boxH = Math.round(height * 0.28);

    // El tamaño base es proporcional al ancho para que el rótulo se vea igual
    // en 1080 y en 2160. `autoFit` lo baja si el texto no entra, y el piso evita
    // que un texto largo acabe ilegible: por debajo de ese tamaño, lo correcto
    // es que se desborde y se vea, no que se encoja hasta no leerse.
    const baseFont = Math.round(width * 0.072);
    const minFont = Math.round(width * 0.042);

    const laid = layoutText({
        text: clean,
        boxW, boxH,
        fontSize: baseFont,
        lineHeight: 1.22,
        minFontSize: minFont,
        autoFit: true,
        measure: measureText
    });

    const lineH = laid.fontSize * 1.22;
    const blockH = laid.lines.length * lineH;

    // Dónde arranca la primera línea de base.
    let top;
    if (position === 'upper') top = Math.round(height * 0.12);
    else if (position === 'center') top = Math.round((height - blockH) / 2);
    else top = Math.round(height * (1 - SAFE_BOTTOM) - blockH);

    const cx = Math.round(width / 2);

    const tspans = laid.lines.map((line, i) =>
        `<tspan x="${cx}" y="${Math.round(top + i * lineH + laid.fontSize * 0.82)}">${esc(line)}</tspan>`
    ).join('');

    // El degradado cubre desde algo por encima del texto HASTA EL BORDE
    // INFERIOR del cuadro, siempre. Se calcula sobre la posición real del
    // bloque —un scrim fijo dejaría el texto fuera de su propia sombra cuando
    // el rótulo es de tres líneas—, pero su final no se acota: recortarlo antes
    // del borde deja una línea horizontal visible donde el degradado se
    // interrumpe, que se lee como una banda pegada encima. Se vio en la primera
    // imagen compuesta.
    const scrimTop = Math.max(0, top - laid.fontSize * 0.9);
    const scrimH = height - scrimTop;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="45%" stop-color="#000" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.62"/>
    </linearGradient>
  </defs>
  ${scrim && position === 'lower' ? `<rect x="0" y="${Math.round(scrimTop)}" width="${width}" height="${Math.round(scrimH)}" fill="url(#scrim)"/>` : ''}
  <text font-family="${FONT_STACK}" font-size="${Math.round(laid.fontSize)}" font-weight="700"
        fill="#FFFFFF" text-anchor="middle"
        stroke="#000000" stroke-width="${Math.max(1, Math.round(laid.fontSize * 0.045))}"
        stroke-opacity="0.34" paint-order="stroke fill">${tspans}</text>
</svg>`;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return { buffer: png, lines: laid.lines, fontSize: Math.round(laid.fontSize), overflow: laid.overflow };
};

// ─── Tarjeta de cierre ─────────────────────────────────────────────────────

/**
 * La placa institucional del final: quién convoca y a dónde ir.
 *
 * Se compone como una imagen COMPLETA y opaca —no un rótulo transparente—
 * porque es una escena propia, no una capa sobre una fotografía. El montaje la
 * añade como un clip más.
 *
 * El logotipo entra como imagen, nunca dibujado: la rueda de Rotary es marca
 * registrada, con proporciones y colores propios que se reproducen desde el
 * Brand Center. Es la misma regla que Plantillas IA — no hay ninguna rueda
 * dibujada en este repositorio y no debe haberla.
 */
export const renderClosingCard = async ({
    width, height,
    headline = 'ROTARIOS EN ACCIÓN',
    message = null,
    clubName = null,
    districtName = null,
    url = null,
    logoBuffer = null,
    // Azul institucional. Se pasa como parámetro para que un club con su propia
    // identidad pueda cambiarlo sin tocar este archivo.
    background = '#17458F'
}) => {
    const pad = Math.round(width * 0.1);
    const boxW = width - pad * 2;

    // El bloque se arma de arriba abajo y se centra al final. Se mide antes de
    // posicionar porque el alto depende de cuántas piezas haya: una tarjeta sin
    // mensaje ni URL no puede dejar el hueco donde iban.
    const logoH = logoBuffer ? Math.round(height * 0.11) : 0;
    const headFont = Math.round(width * 0.062);
    const msgFont = Math.round(width * 0.044);
    const metaFont = Math.round(width * 0.034);

    const headLaid = layoutText({
        text: String(headline || '').trim(),
        boxW, boxH: height * 0.2, fontSize: headFont,
        lineHeight: 1.16, minFontSize: Math.round(headFont * 0.6),
        autoFit: true, measure: measureText
    });

    const msgLaid = message
        ? layoutText({
            text: String(message).trim(),
            boxW, boxH: height * 0.22, fontSize: msgFont,
            lineHeight: 1.3, minFontSize: Math.round(msgFont * 0.66),
            autoFit: true, measure: measureText
        })
        : null;

    const metaLines = [clubName, districtName, url].filter(Boolean).map(String);

    const gapL = Math.round(height * 0.035);
    const headH = headLaid.lines.length * headLaid.fontSize * 1.16;
    const msgH = msgLaid ? msgLaid.lines.length * msgLaid.fontSize * 1.3 : 0;
    const metaH = metaLines.length * metaFont * 1.45;

    const totalH = logoH + (logoH ? gapL : 0)
        + headH + (msgH ? gapL + msgH : 0)
        + (metaH ? gapL * 1.2 + metaH : 0);

    let y = Math.round((height - totalH) / 2);
    const cx = Math.round(width / 2);
    const logoY = y;
    if (logoH) y += logoH + gapL;

    const headTspans = headLaid.lines.map((l, i) =>
        `<tspan x="${cx}" y="${Math.round(y + i * headLaid.fontSize * 1.16 + headLaid.fontSize * 0.82)}">${esc(l)}</tspan>`
    ).join('');
    y += headH;

    let msgTspans = '';
    if (msgLaid) {
        y += gapL;
        msgTspans = msgLaid.lines.map((l, i) =>
            `<tspan x="${cx}" y="${Math.round(y + i * msgLaid.fontSize * 1.3 + msgLaid.fontSize * 0.8)}">${esc(l)}</tspan>`
        ).join('');
        y += msgH;
    }

    let metaTspans = '';
    if (metaLines.length) {
        y += gapL * 1.2;
        metaTspans = metaLines.map((l, i) =>
            `<tspan x="${cx}" y="${Math.round(y + i * metaFont * 1.45 + metaFont * 0.8)}">${esc(l)}</tspan>`
        ).join('');
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${esc(background)}"/>
  <text font-family="${FONT_STACK}" font-size="${Math.round(headLaid.fontSize)}" font-weight="800"
        fill="#FFFFFF" text-anchor="middle" letter-spacing="${Math.round(headLaid.fontSize * 0.03)}">${headTspans}</text>
  ${msgTspans ? `<text font-family="${FONT_STACK}" font-size="${Math.round(msgLaid.fontSize)}" font-weight="500" fill="#F7F1E1" text-anchor="middle">${msgTspans}</text>` : ''}
  ${metaTspans ? `<text font-family="${FONT_STACK}" font-size="${metaFont}" font-weight="700" fill="#F0B323" text-anchor="middle">${metaTspans}</text>` : ''}
</svg>`;

    let img = sharp(Buffer.from(svg));

    // El logotipo se compone encima, ya rasterizado el fondo. Va aparte y no
    // como `<image href="data:...">` dentro del SVG porque incrustarlo en base64
    // multiplica por 1,33 el tamaño del documento que `sharp` tiene que parsear,
    // y porque un PNG con transparencia se compone mejor con `composite`.
    if (logoBuffer && logoH) {
        try {
            const logo = await sharp(logoBuffer)
                .resize({ height: logoH, fit: 'inside', withoutEnlargement: false })
                .png()
                .toBuffer();
            const meta = await sharp(logo).metadata();
            img = sharp(await img.png().toBuffer()).composite([{
                input: logo,
                top: logoY,
                left: Math.round((width - (meta.width || logoH)) / 2)
            }]);
        } catch (e) {
            // Sin logotipo la tarjeta sigue sirviendo: dice quién convoca por su
            // nombre. Perder la pieza entera por una imagen que no se pudo leer
            // sería el intercambio equivocado.
            console.warn('[REEL] no se pudo componer el logotipo del cierre:', e.message);
        }
    }

    return { buffer: await img.png().toBuffer() };
};

/**
 * El texto de cierre por defecto, a partir de lo que se sabe del club.
 *
 * No inventa: sin nombre de club no escribe ninguno, y sin URL no pone
 * ninguna. Es la misma regla que gobierna el resto de la campaña.
 */
export const defaultClosingCopy = ({ ctaLabel = null } = {}) => ({
    headline: 'ROTARIOS EN ACCIÓN',
    message: ctaLabel || 'Tu ayuda puede generar un impacto duradero.'
});
