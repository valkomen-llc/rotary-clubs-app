// ════════════════════════════════════════════════════════════════════════════
// EL ENCUADRE DE UNA FOTOGRAFÍA — v4.1007
//
// El CRITERIO, y nada más: sin base, sin red, sin DOM. Lo consumen el servidor
// (al leer y al escribir el encuadre) y el navegador a través del espejo
// `src/lib/mediaFocal.ts`, comparado por SALIDAS en `test:media:focal`.
//
// ⚠️ POR QUÉ UN PUNTO FOCAL Y NO UN RECORTE, que es lo que parecía faltar.
// El recorte YA existe en el editor de Noticias (`CropModal`, 16:6) y aun así
// la portada salía «mocha»: el hero del artículo público es
// `w-full h-[400px] md:h-[500px]`, o sea que su PROPORCIÓN cambia con el ancho
// de la ventana —≈0,98 en un teléfono de 390 px, 2,88 a 1440 y 3,84 a 1920— y
// `object-fit: cover` recorta lo que sobra AL CENTRO. Ningún recorte fijo
// satisface a la vez esas proporciones: un 16:6 (2,667) metido en 3,84 pierde
// arriba y abajo, que es exactamente donde están las cabezas. Medido con una
// foto 4:3 en el hero de 1920×500: con el centro por defecto lo visible empieza
// en el 32,6 % de alto de la foto —todo lo de arriba se va—, y con el foco en
// 0,15 empieza en el 9,8 % y las cabezas se conservan.
//
// Un punto focal SOBREVIVE al recorte: dice qué parte tiene que quedar dentro
// pase lo que pase con la proporción de la caja. Por eso lo que se elige es un
// punto y no un rectángulo, y por eso no se genera ningún archivo nuevo.
//
// ⚠️ Y POR ESO ES DE LA FOTOGRAFÍA, NO DEL ARTÍCULO. «Dónde están las caras»
// es una propiedad de la foto, así que vive en `Media."focal"` y se resuelve
// POR URL (regla de v4.967): la misma foto se encuadra una vez y queda bien en
// el hero, en las tarjetas del listado y en la portada de cualquier artículo
// que la use. Guardarlo por artículo obligaría a repetir el trabajo, y en
// `Post` es imposible: esa tabla NO gana columnas (regla de `logo_intl`,
// v4.699, reafirmada en v4.1000).
// ════════════════════════════════════════════════════════════════════════════

/** El encuadre por defecto: el centro, que es lo que hace `object-cover` solo. */
export const DEFAULT_FOCAL = Object.freeze({ x: 0.5, y: 0.5 });

/** Cuánto se acerca un valor al del centro para considerarlo «sin encuadre». */
export const FOCAL_EPSILON = 0.005;

/**
 * Las cajas contra las que el editor enseña cómo va a quedar la portada.
 *
 * Son los DOS extremos reales del hero de `BlogPost.tsx` —`h-[400px]` en un
 * teléfono y `h-[500px]` desde `md`—, no proporciones inventadas: el defecto
 * reportado es justamente que el recorte del escritorio se lleva las cabezas.
 * Una prueba lee `BlogPost.tsx` y falla si esas alturas cambian sin que estos
 * números las sigan; si no, la vista previa afirmaría un encuadre que no es.
 */
export const HERO_PREVIEWS = Object.freeze([
    Object.freeze({ id: 'desktop', label: 'Escritorio', width: 1440, height: 500 }),
    Object.freeze({ id: 'mobile', label: 'Móvil', width: 390, height: 400 }),
]);

const num = (v) => {
    const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
    return Number.isFinite(n) ? n : null;
};

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Cuatro decimales: por debajo de eso el ajuste no se ve y ensucia el JSON. */
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * Lee un encuadre venga como venga —el JSONB de la fila, el cuerpo de una
 * petición, el estado de la pantalla— y devuelve `{x, y}` acotado a 0-1, o
 * `null` cuando no hay ninguno declarado.
 *
 * `null` y «el centro» son cosas distintas a propósito: el primero significa
 * que nadie eligió y el segundo que alguien eligió el centro. Sólo el primero
 * permite decir «sin encuadre» en la pantalla sin mentir.
 */
export function normalizeFocal(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const x = num(raw.x);
    const y = num(raw.y);
    if (x === null || y === null) return null;
    return { x: round4(clamp01(x)), y: round4(clamp01(y)) };
}

/** ¿Este encuadre dice algo distinto del centro? */
export function isCenteredFocal(focal) {
    const f = normalizeFocal(focal);
    if (!f) return true;
    return Math.abs(f.x - DEFAULT_FOCAL.x) <= FOCAL_EPSILON
        && Math.abs(f.y - DEFAULT_FOCAL.y) <= FOCAL_EPSILON;
}

/**
 * El valor de `object-position` que corresponde a un encuadre.
 *
 * Sin encuadre devuelve el centro EXPLÍCITO en vez de `undefined`: así el
 * atributo se escribe siempre y no hay dos caminos de pintado —uno con
 * `style` y otro sin él— que puedan comportarse distinto.
 */
export function objectPositionOf(focal) {
    const f = normalizeFocal(focal) || DEFAULT_FOCAL;
    const pct = (n) => `${round4(n * 100)}%`;
    return `${pct(f.x)} ${pct(f.y)}`;
}

/**
 * Qué parte de la fotografía sobrevive dentro de una caja con `object-cover`,
 * en fracciones de la imagen original (0-1).
 *
 * Es la aritmética de CSS, no una aproximación: la imagen se escala al MAYOR
 * de los dos factores y lo que sobra se reparte según el porcentaje del
 * `object-position`. Vive acá —y no dentro de la pantalla— porque es lo que
 * hace honesta la vista previa del editor y lo que permite PROBAR el defecto
 * reportado en vez de mirarlo.
 *
 * Devuelve `null` con medidas imposibles: inventar una región sobre datos que
 * no se tienen sería afirmar un encuadre que nadie puede comprobar.
 */
export function visibleRegion({ imageWidth, imageHeight, boxWidth, boxHeight, focal } = {}) {
    const iw = num(imageWidth), ih = num(imageHeight);
    const bw = num(boxWidth), bh = num(boxHeight);
    if (!iw || !ih || !bw || !bh || iw <= 0 || ih <= 0 || bw <= 0 || bh <= 0) return null;

    const f = normalizeFocal(focal) || DEFAULT_FOCAL;
    const scale = Math.max(bw / iw, bh / ih);
    const renderedW = iw * scale;
    const renderedH = ih * scale;

    const overflowX = Math.max(0, renderedW - bw);
    const overflowY = Math.max(0, renderedH - bh);

    const left = (overflowX * f.x) / renderedW;
    const top = (overflowY * f.y) / renderedH;
    const width = bw / renderedW;
    const height = bh / renderedH;

    return {
        left: round4(left),
        top: round4(top),
        width: round4(Math.min(1, width)),
        height: round4(Math.min(1, height)),
        right: round4(Math.min(1, left + width)),
        bottom: round4(Math.min(1, top + height)),
    };
}

/**
 * ¿El punto `{x, y}` de la fotografía queda dentro de la caja?
 *
 * Es la pregunta del reporte —«no se ven las cabezas»— escrita como criterio,
 * y lo que permite comprobar a la inversa que el encuadre sirve para algo.
 */
export function pointSurvives({ point, ...box }) {
    const region = visibleRegion(box);
    const p = normalizeFocal(point);
    if (!region || !p) return false;
    return p.x >= region.left && p.x <= region.right
        && p.y >= region.top && p.y <= region.bottom;
}

/**
 * Lo que se guarda en `Media."focal"`.
 *
 * Un encuadre centrado se guarda como `null`, o sea que se BORRA: una fila que
 * dice «el centro» y la ausencia de fila significan lo mismo para quien pinta,
 * y dejar escrito lo que no aporta nada convierte «esta foto tiene encuadre»
 * en una afirmación que no distingue nada.
 */
export function focalRecord(raw, { by = null, at = null } = {}) {
    const f = normalizeFocal(raw);
    if (!f || isCenteredFocal(f)) return null;
    return { x: f.x, y: f.y, at: at || new Date().toISOString(), by: by || null };
}

export default {
    DEFAULT_FOCAL,
    FOCAL_EPSILON,
    HERO_PREVIEWS,
    normalizeFocal,
    isCenteredFocal,
    objectPositionOf,
    visibleRegion,
    pointSurvives,
    focalRecord,
};
