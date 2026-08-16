// ════════════════════════════════════════════════════════════════════
// Plantillas IA — la tipografía de verdad
// v4.837.0
//
// Hasta v4.836 el grafo de escena sólo podía usar ONCE familias del SISTEMA
// (Arial, Verdana, Impact, Georgia…). El comentario que lo justificaba en
// `designSpec.FONTS` decía, con razón:
//
//     «Una fuente web habría que cargarla antes de exportar, y el exportador
//      dibuja en un canvas del navegador: si la fuente no llegó, el archivo
//      sale con otra y la vista previa deja de ser el archivo.»
//
// Esa cautela era correcta y el precio era alto: las piezas de referencia del
// Distrito están compuestas en una sans CONDENSADA PESADA en mayúsculas, y
// ningún stack del sistema la reproduce. Medido contra las piezas reales, la
// tipografía es —sola— la mayor distancia entre lo que componemos y ellas:
// más que la maquetación, más que la paleta.
//
// ── POR QUÉ AHORA SÍ SE PUEDE ───────────────────────────────────────
//
// El peligro que enunciaba aquel comentario ocurre si la fuente llega para UNO
// de los dos caminos y no para el otro. No es el caso: la vista previa (DOM) y
// la exportación (canvas) viven en el MISMO documento y comparten
// `document.fonts`. Esperando `document.fonts.ready` antes de MEDIR y antes de
// DIBUJAR, los dos ven exactamente el mismo estado.
//
// Y el modo de fallo es seguro: si la descarga falla, los dos caen JUNTOS a la
// cadena de respaldo, porque los dos leen el mismo `fontStack`. Se pierde el
// parecido con la referencia —y se dice—, nunca la paridad entre lo que se ve
// y lo que se baja. Eso es lo que hace aceptable el cambio.
//
// ── POR QUÉ SE EMPAQUETAN Y NO SE PIDEN A GOOGLE ────────────────────
//
// Un `<link>` a `fonts.googleapis.com` fue exactamente la causa medida en
// v4.659 de que el primer pintado tardara 13,2 s con el servidor de terceros
// inaccesible: ningún recurso de terceros bloquea el pintado en este sitio.
// Además, un canvas que dibuja con una fuente de otro origen no se contamina
// —las fuentes no «tiñen» el canvas—, pero sí quedaría a merced de la red
// justo en el momento de exportar.
//
// Los archivos viven en `public/fonts/` (los sirve Vite desde la raíz) y son
// los subconjuntos `latin` y `latin-ext` en woff2. Los dos son VARIABLES: un
// archivo por subconjunto cubre todo el rango de pesos, así que son cuatro
// archivos y ~128 KB en total.
//
// ── Y NO SE CARGAN EN TODA VISITA ───────────────────────────────────
//
// No hay `@font-face` en el CSS global ni `<link>` en `index.html`: eso las
// descargaría en cada visita de la página pública, que no dibuja ninguna
// pieza. Se registran desde JavaScript y sólo cuando algo va a componer —el
// editor, el preset de campañas, el portal público de una plantilla—.
//
// ── LICENCIA ────────────────────────────────────────────────────────
//
// Open Sans y Oswald están bajo SIL OFL 1.1, que permite empaquetarlas y
// redistribuirlas. Las licencias viajan junto a los archivos, en
// `public/fonts/OFL-*.txt`, que es lo que la OFL exige. Al agregar una
// familia, agregar su licencia ahí — no es una formalidad: sin ella la
// redistribución no está amparada.
//
// Open Sans es, además, la tipografía de marca de Rotary International: no se
// eligió por gusto.
// ════════════════════════════════════════════════════════════════════

import { WEB_FONTS } from './designSpec';

/** Los subconjuntos de cada familia. `latin` cubre el español entero
 *  (U+0000-00FF incluye á é í ó ú ñ ü ¿ ¡) y también el francés, el portugués,
 *  el alemán y el italiano; `latin-ext` se agrega por los idiomas que puedan
 *  entrar después. El japonés y el coreano no tienen subconjunto acá y caen a
 *  la cadena de respaldo del sistema, que es lo correcto: empaquetar CJK son
 *  megabytes. */
interface WebFontFile {
    /** El nombre de familia que declara `fontStack` en `designSpec`. */
    family: string;
    /** Rango de pesos del archivo variable, en la forma que espera `FontFace`. */
    weight: string;
    url: string;
}

const FILES: WebFontFile[] = [
    { family: 'Open Sans', weight: '300 800', url: '/fonts/open-sans-latin.woff2' },
    { family: 'Open Sans', weight: '300 800', url: '/fonts/open-sans-latin-ext.woff2' },
    { family: 'Oswald', weight: '200 700', url: '/fonts/oswald-latin.woff2' },
    { family: 'Oswald', weight: '200 700', url: '/fonts/oswald-latin-ext.woff2' },
];

export type FontState = 'idle' | 'loading' | 'ready' | 'failed';

let state: FontState = 'idle';
let inFlight: Promise<FontState> | null = null;
const listeners = new Set<(s: FontState) => void>();

const announce = (s: FontState) => {
    state = s;
    for (const fn of listeners) { try { fn(s); } catch { /* un oyente roto no puede tumbar a los otros */ } };
};

export const fontState = (): FontState => state;

/** Avisa cuando cambia el estado. Devuelve la baja. */
export const onFontState = (fn: (s: FontState) => void): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
};

/**
 * Registra y carga las tipografías empaquetadas. Idempotente: varias llamadas
 * a la vez comparten la misma promesa, que es lo que evita que el editor, la
 * exportación y la miniatura pidan lo mismo tres veces.
 *
 * **Hay que ESPERARLA antes de medir o de dibujar.** Medir con la fuente de
 * respaldo y dibujar con la definitiva es lo que produce un texto que se sale
 * del recuadro en el archivo y entra en pantalla — el defecto que este módulo
 * existe para no tener.
 *
 * Nunca rechaza: un fallo devuelve `'failed'` y la composición sigue con la
 * cadena de respaldo. No poder componer sería peor que componer con otra letra.
 */
export const ensureDesignFonts = async (): Promise<FontState> => {
    if (state === 'ready' || state === 'failed') return state;
    if (inFlight) return inFlight;

    // Sin `FontFace` ni `document.fonts` —un entorno sin DOM, un navegador muy
    // viejo— no hay nada que cargar y tampoco nada que romper.
    if (typeof document === 'undefined' || typeof (globalThis as any).FontFace !== 'function' || !document.fonts) {
        announce('failed');
        return state;
    }

    announce('loading');
    inFlight = (async () => {
        try {
            await Promise.all(FILES.map(async f => {
                // `document.fonts` es un Set: registrar dos veces la misma cara
                // —al volver a montar el editor— duplicaría entradas sin avisar.
                for (const cara of document.fonts as unknown as Iterable<FontFace>) {
                    if (cara.family === f.family && (cara as any)._designSrc === f.url) return;
                }
                const face = new FontFace(f.family, `url(${f.url}) format('woff2')`, {
                    weight: f.weight,
                    style: 'normal',
                    display: 'block',
                });
                (face as any)._designSrc = f.url;
                await face.load();
                document.fonts.add(face);
            }));

            // `document.fonts.ready` es lo que garantiza que el motor terminó
            // de aplicarlas: `load()` resuelve con la cara lista, pero el
            // documento puede tener todavía otra carga en vuelo, y medir en ese
            // hueco daría las métricas del respaldo.
            await document.fonts.ready;
            announce('ready');
        } catch (e) {
            console.warn('[designFonts] no se pudieron cargar las tipografías; se compone con las del sistema:', e);
            announce('failed');
        }
        return state;
    })();

    return inFlight;
};

/** ¿Alguna de las familias empaquetadas está realmente disponible? Sirve para
 *  DECIR en la pantalla que la pieza salió con la letra de respaldo, en vez de
 *  dejar que el usuario descubra solo por qué no se parece a la referencia. */
export const webFontsAvailable = (): boolean => state === 'ready';

/** Las familias que dependen de una descarga. La consume la pantalla para
 *  avisar; el criterio de cuáles son vive en `designSpec`, no acá. */
export const webFontIds = (): string[] => WEB_FONTS.map(f => f.id);

export default { ensureDesignFonts, fontState, onFontState, webFontsAvailable, webFontIds };
