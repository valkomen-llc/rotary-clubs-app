// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — espejo MÍNIMO en el navegador
// v4.895.0
//
// Sólo lo que hace falta para PINTAR y para COMPONER. Las instrucciones, los
// prompts, la validación de la pieza y el criterio de publicación viven en el
// servidor y no tienen espejo a propósito: un espejo sin consumidor es una
// copia que se separa en silencio.
//
// ⚠️ LO QUE SÍ ESTÁ ACÁ ES `TEXT_ZONES`, Y NO PUEDE DIFERIR. Es el acuerdo
// entre las dos mitades del módulo: el servidor le pide al modelo que deje esa
// franja tranquila y el compositor escribe exactamente ahí. Con dos tablas, el
// modelo despeja un lado y el texto se imprime en el otro — y eso no da ningún
// error, da una pieza con el título encima de una cara. Lo comprueba
// `npm run test:anniversary` comparando las salidas de los dos archivos.
// ════════════════════════════════════════════════════════════════════

export interface TextZone {
    id: string;
    x: number; y: number; w: number; h: number;
    align: 'left' | 'center';
    words: string;
}

export const TEXT_ZONES: Record<string, TextZone> = {
    left: { id: 'left', x: 0.070, y: 0.180, w: 0.400, h: 0.560, align: 'left', words: 'la mitad izquierda' },
    right: { id: 'right', x: 0.530, y: 0.180, w: 0.400, h: 0.560, align: 'left', words: 'la mitad derecha' },
    bottom: { id: 'bottom', x: 0.090, y: 0.500, w: 0.820, h: 0.320, align: 'center', words: 'el tercio inferior' },
};
export const DEFAULT_TEXT_ZONE = 'bottom';
export const zoneById = (id?: string | null): TextZone => TEXT_ZONES[id || ''] || TEXT_ZONES[DEFAULT_TEXT_ZONE];

/** La banda del pie institucional. Va SIEMPRE en el mismo sitio y por eso las
 *  zonas de texto terminan por encima: el branding no compite con el mensaje. */
export const FOOTER_BAND = { y: 0.84, h: 0.16 };

/** LA GEOMETRÍA ESTÁNDAR — el otro lado del acuerdo (v4.1064).
 *
 *  ⚠️ NO PUEDE DIFERIR de `STANDARD_LAYOUT` en `server/lib/anniversarySpec.js`:
 *  el servidor le pide al modelo que deje estas bandas sin una sola letra y
 *  este compositor imprime exactamente ahí. Con dos tablas, el modelo despeja
 *  una franja y el texto se escribe en otra — y eso no da ningún error: da una
 *  pieza con el nombre del club encima de la fotografía. Lo comprueba
 *  `npm run test:anniversary` comparando los dos archivos, banda por banda.
 *
 *  Existe porque el rotulado dejó de ser del modelo: «Bogotá Capital» salía
 *  «Bogota Capital» —y en el caso reportado «Bogoto Capital»— porque un modelo
 *  generativo no escribe texto de forma fiable. El nombre del club, la cifra y
 *  el saludo son DATOS y se imprimen con tipografía real: exactos por
 *  construcción. */
export interface LayoutBand { x: number; y: number; w: number; h: number }

export const STANDARD_LAYOUT: Record<string, LayoutBand> = {
    headline: { x: 0.100, y: 0.118, w: 0.800, h: 0.150 },
    club: { x: 0.090, y: 0.274, w: 0.820, h: 0.052 },
    photo: { x: 0.197, y: 0.330, w: 0.606, h: 0.356 },
    years: { x: 0.215, y: 0.704, w: 0.570, h: 0.120 },
};

/** El marco de la fotografía, en fracciones del ancho de su banda. `ratio` es
 *  la proporción INTERIOR —la misma 16:9 a la que la plataforma estandariza la
 *  foto— y `mat` el margen blanco. El alto del marco se DERIVA de los dos: no
 *  se declara, para que no pueda quedar incoherente con el ancho.
 *
 *  ⚠️ Tiene que coincidir con `PHOTO_FRAME` del servidor: de ahí sale la frase
 *  que le dice al modelo qué rectángulo dejar limpio. */
export const PHOTO_FRAME = { ratio: 16 / 9, mat: 0.026, border: 0.006 };

export interface AnniversaryFormat { id: string; label: string; aspect: string; ratio: number; available: boolean }

export const FORMATS: Record<string, AnniversaryFormat> = {
    square_1080: { id: 'square_1080', label: 'Cuadrado 1:1', aspect: '1:1', ratio: 1, available: true },
    portrait_4_5: { id: 'portrait_4_5', label: 'Vertical 4:5', aspect: '4:5', ratio: 0.8, available: false },
    story_9_16: { id: 'story_9_16', label: 'Historia 9:16', aspect: '9:16', ratio: 9 / 16, available: false },
};
export const DEFAULT_FORMAT = 'square_1080';
export const RESOLUTIONS = [1080, 1440, 2160];
export const DEFAULT_RESOLUTION = 1080;

export const formatById = (id?: string | null): AnniversaryFormat => FORMATS[id || ''] || FORMATS[DEFAULT_FORMAT];

export const canvasSize = (formatId = DEFAULT_FORMAT, resolution: number = DEFAULT_RESOLUTION) => {
    const f = formatById(formatId);
    const res = RESOLUTIONS.includes(Number(resolution)) ? Number(resolution) : DEFAULT_RESOLUTION;
    if (f.ratio >= 1) return { width: res, height: Math.round(res / f.ratio) };
    return { width: Math.round(res * f.ratio), height: res };
};

/** Las etapas que ve quien genera. Cada una corresponde a una llamada REAL:
 *  una barra de progreso inventada hace esperar por nada. */
export const STAGES = [
    { id: 'prepare', label: 'Preparando los datos', icon: '✨' },
    { id: 'compose', label: 'Diseñando la pieza', icon: '🎨' },
    { id: 'done', label: 'Aniversario listo', icon: '✓' },
] as const;
export type StageId = typeof STAGES[number]['id'];

export const YEARS_LIMITS = { min: 1, max: 130 };

/** Lo que se admite subir. El servidor lo comprueba otra vez —la pantalla
 *  ahorra un viaje, no decide—. */
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_PHOTO_LABEL = 'JPG, PNG o WebP';
export const MAX_PHOTO_BYTES = 18 * 1024 * 1024;

export default {
    TEXT_ZONES, DEFAULT_TEXT_ZONE, zoneById, FOOTER_BAND,
    FORMATS, DEFAULT_FORMAT, RESOLUTIONS, DEFAULT_RESOLUTION, formatById, canvasSize,
    STAGES, YEARS_LIMITS, ACCEPTED_PHOTO_TYPES, ACCEPTED_PHOTO_LABEL, MAX_PHOTO_BYTES,
};
