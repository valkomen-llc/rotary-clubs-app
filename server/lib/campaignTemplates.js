// ════════════════════════════════════════════════════════════════════
// Infografías de Campaña — el catálogo de composiciones
// v4.833.0
//
// Una plantilla es DATO, no código: una lista de nodos en coordenadas
// normalizadas con `{{variables}}` dentro. Es el mismo catálogo que
// `designTemplates.js` y lo compila el mismo `compileTemplate`; lo que cambia
// es de dónde salen las variables —de una campaña de contribución, no de un
// club—.
//
// ── SEIS ENTRADAS, NO TRES ──────────────────────────────────────────
//
// Tres composiciones × dos formatos. NO es una plantilla estirada: el motor
// trabaja en fracciones, así que estirar «funciona» y produce una pieza mal
// compuesta —el mismo bloque de cifras que en 1:1 llena el cuadro, en 4:5 deja
// un hueco en el medio y el texto flotando—. Lo que cambia entre formatos es
// CUÁNTO entra y dónde respira, y eso se declara, no se calcula.
//
// ── LAS CIFRAS SE DIBUJAN, NO SE ESCRIBEN ───────────────────────────
//
// Cada indicador ocupa TRES nodos —valor, etiqueta y fuente— y los tres llevan
// `dropIfEmpty`: una pieza con dos cifras en una composición de tres no deja
// recuadros vacíos, simplemente no los dibuja. La fuente va SIEMPRE pegada a su
// cifra y no en un pie común: una campaña puede tener indicadores de fuentes
// distintas, y un pie único los atribuiría a todos a la misma.
// ════════════════════════════════════════════════════════════════════

import { PALETTE } from './designSpec.js';

const W = PALETTE.white;

// ─── Piezas que se repiten ─────────────────────────────────────────────
//
// Se comparten para que las seis composiciones no se separen en silencio —el
// mismo motivo por el que `footerBlock` existe en `designTemplates.js` y por el
// que `ctaStyles.ts` existe para los botones.

/** La insignia de la campaña: «EMERGENCIA · TERREMOTO COLOMBIA». */
const badge = (y) => ({
    id: 'insignia', type: 'text', name: 'Insignia', role: 'insignia', dropIfEmpty: true,
    text: '{{insignia}}', x: 0.07, y, w: 0.66, h: 0.042,
    fontSize: 0.0225, fontWeight: 800, color: W, align: 'left',
    uppercase: true, letterSpacing: 0.006, minFontSize: 0.016,
});

/** El logotipo, arriba a la derecha. Sin logotipo no deja hueco. */
const logo = (y, h) => ({
    id: 'logo', type: 'image', name: 'Logotipo', role: 'logo', dropIfEmpty: true,
    src: '{{logo}}', fit: 'contain', x: 0.79, y, w: 0.14, h,
});

/**
 * Un indicador: valor, etiqueta y fuente. Tres nodos con `dropIfEmpty`, así una
 * composición de tres cifras usada con dos no dibuja el tercer bloque.
 *
 * La FUENTE va pegada al valor a propósito. Es el requisito duro del módulo
 * —no se publica una cifra sin decir de dónde salió— y ponerla en un pie común
 * atribuiría todas las cifras a la misma fuente, que es falso en cuanto la
 * campaña mezcla un balance oficial con otro dato.
 */
const stat = (n, { x, y, w, size = 0.072, labelSize = 0.020, sourceSize = 0.0145, valueH = 0.088, labelH = 0.042, sourceH = 0.05 }) => {
    // Los tres bloques se apilan SUMANDO sus alturas, no con separaciones
    // sueltas. Es lo que hace imposible que se pisen: con un `gap` por su
    // cuenta, bastaba que la altura del valor creciera más que su separación
    // para que la etiqueta le quedara encima —y pasó en tres de las seis
    // composiciones, detectado por la prueba de geometría, no leyendo el
    // archivo—.
    //
    // Ojo con las unidades: `fontSize` es fracción del ANCHO y `h` lo es del
    // ALTO. En 4:5 no son lo mismo, así que la altura del bloque se declara
    // aparte del tamaño de letra en vez de deducirse de él.
    const yLabel = y + valueH;
    const ySource = yLabel + labelH;
    return [
        {
            id: `cifra${n}`, type: 'text', name: `Cifra ${n}`, role: 'cifra', dropIfEmpty: true,
            text: `{{cifra${n}}}`, x, y, w, h: valueH,
            fontSize: size, fontWeight: 900, brand: 'accent', align: 'left',
            lineHeight: 1.0, letterSpacing: -0.002, minFontSize: size * 0.5,
        },
        {
            id: `cifra${n}_label`, type: 'text', name: `Etiqueta ${n}`, role: 'cifra', dropIfEmpty: true,
            text: `{{cifra${n}_label}}`, x, y: yLabel, w, h: labelH,
            fontSize: labelSize, fontWeight: 700, color: W, align: 'left',
            lineHeight: 1.2, minFontSize: labelSize * 0.75,
        },
        {
            id: `cifra${n}_fuente`, type: 'text', name: `Fuente ${n}`, role: 'fuente', dropIfEmpty: true,
            text: `{{cifra${n}_fuente}}`, x, y: ySource, w, h: sourceH,
            fontSize: sourceSize, fontWeight: 500, color: W, opacity: 0.72, align: 'left',
            lineHeight: 1.25, minFontSize: sourceSize * 0.8,
        },
    ];
};

/** Un elemento de la lista de «lo que se necesita»: viñeta, título y detalle. */
const item = (n, { y, size = 0.030, detailSize = 0.019, gap = 0.048 }) => ([
    {
        id: `vineta${n}`, type: 'shape', name: `Viñeta ${n}`, role: 'decoracion',
        shape: 'rect', brand: 'accent', radius: 0.006,
        x: 0.07, y: y + 0.008, w: 0.011, h: gap + detailSize + 0.006,
        requiresVar: `elemento${n}`,
    },
    {
        id: `elemento${n}`, type: 'text', name: `Elemento ${n}`, role: 'elemento', dropIfEmpty: true,
        text: `{{elemento${n}}}`, x: 0.105, y, w: 0.82, h: gap - 0.006,
        fontSize: size, fontWeight: 800, color: W, align: 'left', lineHeight: 1.15, minFontSize: size * 0.7,
    },
    {
        id: `elemento${n}_detalle`, type: 'text', name: `Detalle ${n}`, role: 'elemento', dropIfEmpty: true,
        text: `{{elemento${n}_detalle}}`, x: 0.105, y: y + gap, w: 0.82, h: detailSize + 0.012,
        fontSize: detailSize, fontWeight: 500, color: W, opacity: 0.8, align: 'left',
        lineHeight: 1.25, minFontSize: detailSize * 0.8,
    },
]);

/** Una CIUDAD con su cantidad de puntos. Es lo que cabe en un cuadrado. */
const city = (n, { y, h = 0.052, size = 0.030 }) => ([
    {
        id: `vineta_c${n}`, type: 'shape', name: `Alfiler ${n}`, role: 'decoracion',
        shape: 'ellipse', brand: 'accent',
        x: 0.072, y: y + 0.012, w: 0.016, h: 0.016 * (1080 / 1080),
        requiresVar: `ciudad${n}`,
    },
    {
        id: `ciudad${n}`, type: 'text', name: `Ciudad ${n}`, role: 'ciudad', dropIfEmpty: true,
        text: `{{ciudad${n}}}`, x: 0.105, y, w: 0.52, h,
        fontSize: size, fontWeight: 800, color: W, align: 'left', lineHeight: 1.15, minFontSize: size * 0.7,
    },
    {
        id: `ciudad${n}_puntos`, type: 'text', name: `Puntos ${n}`, role: 'ciudad', dropIfEmpty: true,
        text: `{{ciudad${n}_puntos}}`, x: 0.63, y: y + 0.006, w: 0.30, h: h - 0.008,
        fontSize: size * 0.62, fontWeight: 600, color: W, opacity: 0.75, align: 'right',
        lineHeight: 1.2, minFontSize: size * 0.45,
    },
]);

/** Un CENTRO con su dirección. Sólo en vertical: en un cuadrado, ocho
 *  direcciones legibles no entran y achicar el texto para que quepan produce
 *  una pieza que no se puede leer en un teléfono. */
const center = (n, { y, gap = 0.030 }) => ([
    {
        id: `vineta_p${n}`, type: 'shape', name: `Alfiler ${n}`, role: 'decoracion',
        shape: 'rect', brand: 'accent', radius: 0.005,
        x: 0.07, y: y + 0.006, w: 0.009, h: gap + 0.020,
        requiresVar: `centro${n}`,
    },
    {
        id: `centro${n}`, type: 'text', name: `Punto ${n}`, role: 'centro', dropIfEmpty: true,
        text: `{{centro${n}}}`, x: 0.10, y, w: 0.83, h: gap - 0.004,
        fontSize: 0.0235, fontWeight: 800, color: W, align: 'left', lineHeight: 1.15, minFontSize: 0.017,
    },
    {
        id: `centro${n}_dir`, type: 'text', name: `Dirección ${n}`, role: 'centro', dropIfEmpty: true,
        text: `{{centro${n}_dir}}`, x: 0.10, y: y + gap, w: 0.83, h: 0.026,
        fontSize: 0.0175, fontWeight: 500, color: W, opacity: 0.8, align: 'left',
        lineHeight: 1.2, minFontSize: 0.013,
    },
]);

/**
 * La franja de ALIADOS: un rótulo y hasta cinco escudos.
 *
 * Sólo escudos. Un aliado sin logotipo no se nombra en texto al lado de los
 * otros: una mezcla de escudos y nombres sueltos se lee como un error de
 * maquetación, no como una lista.
 */
const partners = (y, { count = 4, h = 0.048, gap = 0.012 } = {}) => {
    const total = count * h * (1080 / 1080) + (count - 1) * gap;
    const ancho = (0.86 - (count - 1) * gap) / count;
    const nodes = [{
        id: 'aliados_rotulo', type: 'text', name: 'Con el apoyo de', role: 'aliados', dropIfEmpty: true,
        text: 'Con el apoyo de', x: 0.07, y, w: 0.86, h: 0.026,
        fontSize: 0.0165, fontWeight: 700, color: W, opacity: 0.6, align: 'left',
        uppercase: true, letterSpacing: 0.005, minFontSize: 0.012,
        requiresVar: 'aliado1',
    }];
    for (let i = 1; i <= count; i++) {
        nodes.push({
            id: `aliado${i}`, type: 'image', name: `Aliado ${i}`, role: 'aliado', dropIfEmpty: true,
            src: `{{aliado${i}}}`, fit: 'contain',
            x: 0.07 + (i - 1) * (ancho + gap), y: y + 0.034, w: ancho, h,
        });
    }
    return nodes;
};

/**
 * El pie de acción: la fecha de corte, el botón, la dirección y el QR.
 *
 * El QR lleva `dropIfEmpty`, así que en una pieza sin QR el resto no se mueve:
 * el hueco simplemente no se dibuja. Es lo que permite que la Fase 2 lo encienda
 * sin rehacer las seis composiciones.
 */
const actionFooter = ({ cut, pill, pillH = 0.072, url, qr, qrH }) => ([
    {
        id: 'corte', type: 'text', name: 'Fecha de corte', role: 'corte', dropIfEmpty: true,
        text: 'Cifras al {{corte}}', x: 0.07, y: cut, w: 0.60, h: 0.032,
        fontSize: 0.0165, fontWeight: 600, color: W, opacity: 0.68, align: 'left', minFontSize: 0.013,
    },
    {
        id: 'pastilla', type: 'shape', name: 'Botón', role: 'decoracion',
        shape: 'rect', brand: 'accent', radius: pillH / 2,
        x: 0.07, y: pill, w: 0.44, h: pillH, requiresVar: 'cta',
    },
    {
        id: 'cta', type: 'text', name: 'Llamado a la acción', role: 'cta', dropIfEmpty: true,
        text: '{{cta}}', x: 0.085, y: pill + pillH * 0.28, w: 0.41, h: pillH * 0.48,
        fontSize: 0.0245, fontWeight: 900, color: W, align: 'center',
        uppercase: true, letterSpacing: 0.004, minFontSize: 0.017,
    },
    {
        id: 'url', type: 'text', name: 'Dirección', role: 'url', dropIfEmpty: true,
        text: '{{url}}', x: 0.53, y: url, w: 0.30, h: 0.05,
        fontSize: 0.0185, fontWeight: 700, color: W, opacity: 0.9, align: 'left',
        lineHeight: 1.2, minFontSize: 0.014,
    },
    {
        id: 'qr', type: 'image', name: 'Código QR', role: 'qr', dropIfEmpty: true,
        src: '{{qr}}', fit: 'contain', x: 0.855, y: qr, w: qrH, h: qrH,
    },
]);

/** El fondo: color de la campaña. Sin fotografía es lo único que se ve, y por
 *  eso no es blanco — una pieza institucional en blanco con texto blanco no se
 *  lee, y el aviso de «sin fotografía» ya dice que ese espacio queda al color. */
const backdrop = () => ({
    id: 'fondo', type: 'shape', name: 'Fondo', role: 'decoracion', locked: true,
    shape: 'rect', brand: 'primary', x: 0, y: 0, w: 1, h: 1,
});

/** El velo sobre la fotografía. No lleva `requiresVar`: sin foto sigue estando
 *  y oscurece el color de la campaña, que es lo que mantiene legible el texto
 *  blanco en los dos casos. */
const scrim = (y, h, opacity = 0.62) => ({
    id: 'velo', type: 'shape', name: 'Velo', role: 'decoracion', locked: true,
    shape: 'rect', fill: PALETTE.ink, opacity, x: 0, y, w: 1, h,
});

const photo = (y, h, { id = 'foto' } = {}) => ({
    id, type: 'image', name: 'Fotografía', role: 'foto', dropIfEmpty: true,
    src: '{{imagen}}', fit: 'cover', x: 0, y, w: 1, h,
});

const title = (y, h, size) => ({
    id: 'titulo', type: 'text', name: 'Título', role: 'titulo',
    text: '{{titulo}}', x: 0.07, y, w: 0.86, h,
    fontSize: size, fontWeight: 900, color: W, align: 'left',
    lineHeight: 1.06, letterSpacing: -0.001, minFontSize: size * 0.55,
});

const paragraph = (id, name, y, h, size, { role = 'texto', opacity = 0.88, w = 0.86 } = {}) => ({
    id, type: 'text', name, role, dropIfEmpty: true,
    text: `{{${id}}}`, x: 0.07, y, w, h,
    fontSize: size, fontWeight: 600, color: W, opacity, align: 'left',
    lineHeight: 1.3, minFontSize: size * 0.75,
});

// ─── Las seis composiciones ────────────────────────────────────────────

export const CAMPAIGN_TEMPLATES = [
    // ══ Impacto estadístico ══════════════════════════════════════════
    {
        id: 'campana_impacto_1_1',
        layout: 'impacto_estadistico',
        format: 'post_1_1',
        name: 'Impacto estadístico · cuadrado',
        summary: 'Fotografía arriba, tres cifras con su fuente y el llamado abajo.',
        available: true,
        requires: ['titulo'],
        background: PALETTE.navy,
        nodes: [
            backdrop(),
            photo(0, 0.38),
            scrim(0, 0.38, 0.38),
            badge(0.055),
            logo(0.042, 0.075),
            title(0.415, 0.13, 0.058),
            ...stat(1, { x: 0.07, y: 0.565, w: 0.27 }),
            ...stat(2, { x: 0.365, y: 0.565, w: 0.27 }),
            ...stat(3, { x: 0.66, y: 0.565, w: 0.27 }),
            ...actionFooter({ cut: 0.775, pill: 0.845, url: 0.862, qr: 0.835, qrH: 0.10 }),
        ],
    },
    {
        id: 'campana_impacto_4_5',
        layout: 'impacto_estadistico',
        format: 'post_4_5',
        name: 'Impacto estadístico · vertical',
        summary: 'Con contexto y cuatro cifras en dos filas.',
        available: true,
        requires: ['titulo'],
        background: PALETTE.navy,
        nodes: [
            backdrop(),
            photo(0, 0.30),
            scrim(0, 0.30, 0.38),
            badge(0.042),
            logo(0.032, 0.06),
            title(0.335, 0.105, 0.058),
            paragraph('contexto', 'Contexto', 0.448, 0.075, 0.023),
            ...stat(1, { x: 0.07, y: 0.545, w: 0.40, size: 0.068, valueH: 0.075, labelH: 0.040, sourceH: 0.042 }),
            ...stat(2, { x: 0.53, y: 0.545, w: 0.40, size: 0.068, valueH: 0.075, labelH: 0.040, sourceH: 0.042 }),
            ...stat(3, { x: 0.07, y: 0.705, w: 0.40, size: 0.068, valueH: 0.075, labelH: 0.040, sourceH: 0.042 }),
            ...stat(4, { x: 0.53, y: 0.705, w: 0.40, size: 0.068, valueH: 0.075, labelH: 0.040, sourceH: 0.042 }),
            // El pie arranca DESPUÉS de la segunda fila de cifras: 0,705 + 0,157.
            ...actionFooter({ cut: 0.868, pill: 0.905, pillH: 0.058, url: 0.917, qr: 0.897, qrH: 0.075 }),
        ],
    },

    // ══ Emergencia + llamado ═════════════════════════════════════════
    {
        id: 'campana_emergencia_1_1',
        layout: 'emergencia_cta',
        format: 'post_1_1',
        name: 'Emergencia + llamado · cuadrado',
        summary: 'Fotografía a sangre, título fuerte, dos cifras y el botón.',
        available: true,
        requires: ['titulo'],
        background: PALETTE.navy,
        nodes: [
            backdrop(),
            photo(0, 1),
            scrim(0.28, 0.72, 0.74),
            badge(0.055),
            logo(0.042, 0.075),
            title(0.395, 0.145, 0.066),
            paragraph('subtitulo', 'Subtítulo', 0.552, 0.062, 0.027, { role: 'subtitulo' }),
            ...stat(1, { x: 0.07, y: 0.645, w: 0.40, size: 0.062, valueH: 0.076, labelH: 0.040, sourceH: 0.042 }),
            ...stat(2, { x: 0.53, y: 0.645, w: 0.40, size: 0.062, valueH: 0.076, labelH: 0.040, sourceH: 0.042 }),
            // 0,645 + 0,158: el corte va debajo de la fuente, no encima.
            ...actionFooter({ cut: 0.810, pill: 0.845, url: 0.862, qr: 0.835, qrH: 0.10 }),
        ],
    },
    {
        id: 'campana_emergencia_4_5',
        layout: 'emergencia_cta',
        format: 'post_4_5',
        name: 'Emergencia + llamado · vertical',
        summary: 'Con más aire para el contexto y una cifra más.',
        available: true,
        requires: ['titulo'],
        background: PALETTE.navy,
        nodes: [
            backdrop(),
            photo(0, 1),
            scrim(0.24, 0.76, 0.74),
            badge(0.042),
            logo(0.032, 0.06),
            title(0.335, 0.125, 0.066),
            paragraph('subtitulo', 'Subtítulo', 0.472, 0.055, 0.027, { role: 'subtitulo' }),
            paragraph('contexto', 'Contexto', 0.538, 0.070, 0.021),
            ...stat(1, { x: 0.07, y: 0.632, w: 0.27, size: 0.054, valueH: 0.066, labelH: 0.036, sourceH: 0.055 }),
            ...stat(2, { x: 0.365, y: 0.632, w: 0.27, size: 0.054, valueH: 0.066, labelH: 0.036, sourceH: 0.055 }),
            ...stat(3, { x: 0.66, y: 0.632, w: 0.27, size: 0.054, valueH: 0.066, labelH: 0.036, sourceH: 0.055 }),
            ...actionFooter({ cut: 0.800, pill: 0.848, pillH: 0.058, url: 0.860, qr: 0.840, qrH: 0.075 }),
        ],
    },

    // ══ Elementos que se requieren ═══════════════════════════════════
    //
    // Sin fotografía: la lista ES la pieza. Con una foto detrás, un listado de
    // cuatro renglones sobre una escena real no se lee — y bajarle el contraste
    // a la foto para que se lea deja las dos cosas a medias.
    {
        id: 'campana_elementos_1_1',
        layout: 'elementos_requeridos',
        format: 'post_1_1',
        name: 'Elementos que se requieren · cuadrado',
        summary: 'Cuatro elementos con su detalle, sobre el color de la campaña.',
        available: true,
        requires: ['titulo'],
        background: PALETTE.navy,
        nodes: [
            backdrop(),
            { id: 'ola', type: 'shape', name: 'Curva', role: 'decoracion', locked: true, shape: 'wave', brand: 'accent', opacity: 0.22, x: -0.02, y: 0.72, w: 1.04, h: 0.30 },
            badge(0.062),
            logo(0.048, 0.075),
            title(0.135, 0.10, 0.055),
            paragraph('subtitulo', 'Subtítulo', 0.248, 0.052, 0.024, { role: 'subtitulo' }),
            ...item(1, { y: 0.335 }),
            ...item(2, { y: 0.450 }),
            ...item(3, { y: 0.565 }),
            ...item(4, { y: 0.680 }),
            ...actionFooter({ cut: 0.795, pill: 0.845, url: 0.862, qr: 0.835, qrH: 0.10 }),
        ],
    },
    {
        id: 'campana_elementos_4_5',
        layout: 'elementos_requeridos',
        format: 'post_4_5',
        name: 'Elementos que se requieren · vertical',
        summary: 'Seis elementos y dos cifras de contexto.',
        available: true,
        requires: ['titulo'],
        background: PALETTE.navy,
        nodes: [
            backdrop(),
            { id: 'ola', type: 'shape', name: 'Curva', role: 'decoracion', locked: true, shape: 'wave', brand: 'accent', opacity: 0.22, x: -0.02, y: 0.78, w: 1.04, h: 0.24 },
            badge(0.048),
            logo(0.038, 0.06),
            title(0.108, 0.085, 0.055),
            paragraph('subtitulo', 'Subtítulo', 0.204, 0.045, 0.024, { role: 'subtitulo' }),
            ...item(1, { y: 0.272, gap: 0.040 }),
            ...item(2, { y: 0.367, gap: 0.040 }),
            ...item(3, { y: 0.462, gap: 0.040 }),
            ...item(4, { y: 0.557, gap: 0.040 }),
            ...item(5, { y: 0.652, gap: 0.040 }),
            ...item(6, { y: 0.747, gap: 0.040 }),
            ...actionFooter({ cut: 0.845, pill: 0.888, pillH: 0.058, url: 0.900, qr: 0.880, qrH: 0.075 }),
        ],
    },

    // ══ Centros de acopio (v4.835) ═══════════════════════════════════
    //
    // Sin fotografía: es un directorio, y una escena real detrás de una lista
    // de direcciones no deja leer ninguna de las dos cosas.
    {
        id: 'campana_centros_1_1',
        layout: 'centros_acopio',
        format: 'post_1_1',
        name: 'Centros de acopio · cuadrado',
        summary: 'Las ciudades con su cantidad de puntos. El detalle vive en la página.',
        available: true,
        requires: ['titulo'],
        background: PALETTE.navy,
        nodes: [
            backdrop(),
            { id: 'ola', type: 'shape', name: 'Curva', role: 'decoracion', locked: true, shape: 'wave', brand: 'accent', opacity: 0.22, x: -0.02, y: 0.74, w: 1.04, h: 0.28 },
            badge(0.062),
            logo(0.048, 0.075),
            title(0.135, 0.10, 0.055),
            paragraph('subtitulo', 'Subtítulo', 0.248, 0.052, 0.024, { role: 'subtitulo' }),
            ...city(1, { y: 0.335 }),
            ...city(2, { y: 0.405 }),
            ...city(3, { y: 0.475 }),
            ...city(4, { y: 0.545 }),
            ...city(5, { y: 0.615 }),
            // Cuántos puntos hay en total. Recortar la lista en silencio haría
            // creer que ésos son todos, y quien vive en otra ciudad no buscaría.
            paragraph('centros_total', 'Total de puntos', 0.695, 0.036, 0.019, { role: 'total', opacity: 0.7 }),
            ...actionFooter({ cut: 0.750, pill: 0.845, url: 0.862, qr: 0.835, qrH: 0.10 }),
        ],
    },
    {
        id: 'campana_centros_4_5',
        layout: 'centros_acopio',
        format: 'post_4_5',
        name: 'Centros de acopio · vertical',
        summary: 'Con las direcciones, que es lo que hace falta para ir.',
        available: true,
        requires: ['titulo'],
        background: PALETTE.navy,
        nodes: [
            backdrop(),
            { id: 'ola', type: 'shape', name: 'Curva', role: 'decoracion', locked: true, shape: 'wave', brand: 'accent', opacity: 0.22, x: -0.02, y: 0.80, w: 1.04, h: 0.22 },
            badge(0.048),
            logo(0.038, 0.06),
            title(0.108, 0.085, 0.055),
            paragraph('subtitulo', 'Subtítulo', 0.204, 0.045, 0.024, { role: 'subtitulo' }),
            ...center(1, { y: 0.272 }),
            ...center(2, { y: 0.355 }),
            ...center(3, { y: 0.438 }),
            ...center(4, { y: 0.521 }),
            ...center(5, { y: 0.604 }),
            ...center(6, { y: 0.687 }),
            paragraph('centros_total', 'Total de puntos', 0.775, 0.030, 0.018, { role: 'total', opacity: 0.7 }),
            ...actionFooter({ cut: 0.815, pill: 0.888, pillH: 0.058, url: 0.900, qr: 0.880, qrH: 0.075 }),
        ],
    },

    // ══ Impacto de la campaña (v4.835) ═══════════════════════════════
    {
        id: 'campana_resultados_1_1',
        layout: 'resultados',
        format: 'post_1_1',
        name: 'Impacto de la campaña · cuadrado',
        summary: 'Lo logrado, la frase institucional y los escudos de los aliados.',
        available: true,
        requires: ['titulo'],
        background: PALETTE.navy,
        nodes: [
            backdrop(),
            photo(0, 0.32),
            scrim(0, 0.32, 0.38),
            badge(0.055),
            logo(0.042, 0.075),
            title(0.355, 0.10, 0.052),
            ...stat(1, { x: 0.07, y: 0.478, w: 0.27, size: 0.058, valueH: 0.070, labelH: 0.038, sourceH: 0.040 }),
            ...stat(2, { x: 0.365, y: 0.478, w: 0.27, size: 0.058, valueH: 0.070, labelH: 0.038, sourceH: 0.040 }),
            ...stat(3, { x: 0.66, y: 0.478, w: 0.27, size: 0.058, valueH: 0.070, labelH: 0.038, sourceH: 0.040 }),
            paragraph('cierre', 'Frase de cierre', 0.640, 0.055, 0.023, { role: 'cierre' }),
            ...partners(0.710, { count: 4 }),
            ...actionFooter({ cut: 0.812, pill: 0.845, url: 0.862, qr: 0.835, qrH: 0.10 }),
        ],
    },
    {
        id: 'campana_resultados_4_5',
        layout: 'resultados',
        format: 'post_4_5',
        name: 'Impacto de la campaña · vertical',
        summary: 'Con una cifra más y sitio para cinco aliados.',
        available: true,
        requires: ['titulo'],
        background: PALETTE.navy,
        nodes: [
            backdrop(),
            photo(0, 0.28),
            scrim(0, 0.28, 0.38),
            badge(0.042),
            logo(0.032, 0.06),
            title(0.310, 0.085, 0.052),
            paragraph('contexto', 'Contexto', 0.408, 0.058, 0.021),
            ...stat(1, { x: 0.07, y: 0.492, w: 0.40, size: 0.055, valueH: 0.062, labelH: 0.034, sourceH: 0.036 }),
            ...stat(2, { x: 0.53, y: 0.492, w: 0.40, size: 0.055, valueH: 0.062, labelH: 0.034, sourceH: 0.036 }),
            ...stat(3, { x: 0.07, y: 0.630, w: 0.40, size: 0.055, valueH: 0.062, labelH: 0.034, sourceH: 0.036 }),
            ...stat(4, { x: 0.53, y: 0.630, w: 0.40, size: 0.055, valueH: 0.062, labelH: 0.034, sourceH: 0.036 }),
            paragraph('cierre', 'Frase de cierre', 0.768, 0.040, 0.022, { role: 'cierre' }),
            ...partners(0.816, { count: 5, h: 0.038 }),
            // La composición más apretada de las diez: el pie se corre para que
            // la fecha de corte no se meta debajo de la dirección. Lo detectó
            // la prueba de geometría, no leyendo el archivo.
            ...actionFooter({ cut: 0.892, pill: 0.928, pillH: 0.052, url: 0.936, qr: 0.918, qrH: 0.062 }),
        ],
    },
];

export const CAMPAIGN_TEMPLATE_IDS = CAMPAIGN_TEMPLATES.map(t => t.id);

/** La plantilla que le toca a una composición en un formato. Es la ÚNICA vía:
 *  elegir por id desde el navegador dejaría pedir una plantilla de 4:5 con el
 *  formato 1:1 y la pieza saldría descuadrada sin que nada avisara. */
export const templateFor = (layoutId, formatId) =>
    CAMPAIGN_TEMPLATES.find(t => t.layout === layoutId && t.format === formatId && t.available) || null;

export const campaignTemplateById = (id) => CAMPAIGN_TEMPLATES.find(t => t.id === id) || null;

export default { CAMPAIGN_TEMPLATES, CAMPAIGN_TEMPLATE_IDS, templateFor, campaignTemplateById };
