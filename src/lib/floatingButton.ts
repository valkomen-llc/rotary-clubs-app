// ════════════════════════════════════════════════════════════════════
// El BOTÓN FLOTANTE del sitio — v4.1021
//
// Un botón redondo fijo en la esquina INFERIOR IZQUIERDA de las páginas
// públicas, espejo del que abre el chatbot a la derecha. Lo configura el
// administrador de cada sitio: sube su imagen y escribe a dónde lleva.
//
// ─── LO QUE SOSTIENE ESTE MÓDULO ───────────────────────────────────────────
//
// 1. NACE VACÍO Y ENTONCES NO SE PINTA — ni el espacio. Este botón se monta
//    en TODAS las páginas públicas de TODOS los sitios de la plataforma: una
//    imagen o un enlace escritos acá aparecerían en cada club. Es la lección
//    de v4.737, cuando la campaña de un distrito se convirtió en la portada
//    de todos los distritos, y la misma regla del Bloque Destacado (v4.746).
//
// 2. EL ENLACE TERMINA COMO `href` DE UNA PÁGINA PÚBLICA, así que su ESQUEMA
//    se cierra a un catálogo (`SAFE_SCHEMES`). Se valida por FORMA —un club
//    puede enlazar un acortador, un dominio propio o una campaña— pero
//    `javascript:` y `data:` no son enlaces: son código. Es la regla del mapa
//    de la sede (v4.717), la de las redirecciones (v4.781) y la de las
//    publicaciones del formulario público (v4.972).
//
//    ⚠️ Y NO ALCANZA CON `ctaTarget`. Aquél decide cómo se ABRE un enlace
//    —misma pestaña o pestaña nueva— y para hacerlo pregunta si apunta a otro
//    dominio; `javascript:alert(1)` no apunta a ningún dominio, así que lo
//    devuelve como EXTERNO y lo pondría tal cual en el `href`. La comprobación
//    del esquema va ANTES, acá, y también en el servidor al guardar.
//
// 3. EL CÓDIGO DECIDE QUÉ SE GUARDA. `normalizeFloatingButton` es el único
//    punto que da forma a la configuración, y lo llaman las dos puntas: el
//    servidor al guardar y el navegador al pintar. Con dos saneados, el panel
//    aceptaría un enlace que la página no dibuja —o al revés—, y eso se lee
//    como que el botón no funciona.
//
// 4. NO SE PINTA EN EL PANEL. Es contenido del SITIO, no una herramienta de
//    administración: sobre `/admin` sería ruido encima de una pantalla de
//    trabajo, y a la izquierda choca justo con la barra lateral. La
//    comparación es por SEGMENTO y no por prefijo —`/admin` cubre
//    `/admin/noticias` y NO `/administracion`, que sería otra página—: es la
//    misma lección que las reglas de `robots.txt` (v4.702).
// ════════════════════════════════════════════════════════════════════

/** La configuración, ya en su forma canónica. */
export interface FloatingButtonConfig {
    /** Interruptor del administrador. Apagar NO borra lo configurado. */
    enabled: boolean;
    /** Dirección de la imagen del botón. Vacía = no hay botón. */
    imageUrl: string;
    /** A dónde lleva. Vacío o inseguro = no hay botón. */
    url: string;
    /**
     * Nombre accesible y tooltip. Un botón que es SÓLO una imagen necesita
     * nombre: sin él, el lector de pantalla lee la dirección del enlace.
     */
    label: string;
}

export const FLOATING_BUTTON_DEFAULTS: FloatingButtonConfig = {
    enabled: false,
    imageUrl: '',
    url: '',
    label: '',
};

/**
 * Rótulo de respaldo cuando el administrador no escribió ninguno.
 *
 * NO es contenido inventado: es un nombre FUNCIONAL, como «Abrir chat» en el
 * botón del chatbot. Lo que no se inventa es el enlace ni la imagen — sin
 * ellos el botón no existe.
 */
export const FLOATING_BUTTON_FALLBACK_LABEL = 'Enlace destacado';

/**
 * Esquemas admitidos en el enlace. Catálogo CERRADO: lo que no está acá no se
 * guarda. `http`/`https` son el caso normal; `mailto` y `tel` son los otros
 * dos que un club de verdad querría en un botón flotante («escríbenos»,
 * «llámanos») y ninguno de los cuatro ejecuta código.
 */
export const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'] as const;

/** ¿La cadena empieza por un esquema (`algo:`)? */
const hasScheme = (value: string) => /^[a-z][a-z0-9+.-]*:/i.test(value);

/**
 * ¿Este enlace se puede poner en un `href` de una página pública?
 *
 * Admite:
 *   · una ruta interna relativa (`/proyectos`, `/contacto?x=1`);
 *   · una dirección con uno de los cuatro esquemas del catálogo.
 *
 * Rechaza el resto, y en particular DOS casos que no se ven a simple vista:
 *   · `javascript:` / `data:` / `vbscript:` — no son enlaces, son código;
 *   · `//otrositio.com` — parece interno y el navegador lo trata como externo,
 *     así que se lee como una ruta del propio sitio y lleva a otro (v4.781).
 */
export const isSafeFloatingUrl = (raw?: unknown): boolean => {
    const value = String(raw ?? '').trim();
    if (!value) return false;

    // Protocolo relativo: parece una ruta y sale del sitio.
    if (value.startsWith('//')) return false;

    // Sin esquema es una ruta del propio sitio. `ctaTarget` la resuelve.
    if (!hasScheme(value)) return true;

    const scheme = value.slice(0, value.indexOf(':') + 1).toLowerCase();
    return (SAFE_SCHEMES as readonly string[]).includes(scheme);
};

/**
 * ¿El enlace abre el cliente de correo o el marcador del teléfono?
 *
 * Sirve para NO ponerle `target="_blank"`: un `mailto:` en una pestaña nueva
 * deja una pestaña en blanco abierta detrás en varios navegadores.
 */
export const opensExternalApp = (raw?: unknown): boolean => {
    const value = String(raw ?? '').trim().toLowerCase();
    return value.startsWith('mailto:') || value.startsWith('tel:');
};

/** Recorta sin dejar espacios de más, y acota lo que se guarda. */
const text = (raw: unknown, max: number) =>
    String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export const MAX_LABEL_CHARS = 80;
export const MAX_URL_CHARS = 2048;

/**
 * La forma canónica de lo guardado. ÚNICO punto de saneado del módulo: lo
 * llaman el servidor al guardar y el navegador al pintar.
 *
 * Un enlace inseguro se DESCARTA aquí en vez de guardarse: si se guardara,
 * cada lector tendría que acordarse de comprobarlo, y el que se olvide lo
 * pone en un `href`.
 */
export const normalizeFloatingButton = (raw?: unknown): FloatingButtonConfig => {
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw))
        ? raw as Record<string, unknown>
        : {};

    const url = text(src.url, MAX_URL_CHARS);
    const imageUrl = text(src.imageUrl, MAX_URL_CHARS);

    return {
        // El almacenamiento de ajustes ha guardado booleanos como texto, así
        // que la cadena 'true' también enciende. Cualquier otra cosa, no:
        // ante la duda no se publica algo que el sitio no eligió publicar.
        enabled: src.enabled === true || src.enabled === 'true',
        // La imagen se pinta en un `<img src>`: mismo criterio que el enlace.
        imageUrl: isSafeFloatingUrl(imageUrl) ? imageUrl : '',
        url: isSafeFloatingUrl(url) ? url : '',
        label: text(src.label, MAX_LABEL_CHARS),
    };
};

/**
 * Rutas donde el botón NO se pinta, comparadas por SEGMENTO.
 *
 * `/admin` es el panel: el botón es contenido del sitio y ahí sería ruido
 * encima de una pantalla de trabajo —y a la izquierda choca justo con la
 * barra lateral—. `/restablecer` es la puerta de servicio del panel.
 */
export const HIDDEN_PATH_PREFIXES = ['/admin', '/restablecer'];

/** ¿Esta ruta cuelga de ese prefijo? Por segmento, nunca por texto. */
export const pathIsUnder = (path: string, prefix: string): boolean => {
    const p = String(path || '/');
    return p === prefix || p.startsWith(`${prefix}/`);
};

export interface FloatingButtonVisibility {
    /** Ruta actual del navegador. */
    path?: string;
}

/**
 * ¿Se pinta el botón en esta página?
 *
 * Las tres condiciones son independientes y las tres hacen falta: el
 * administrador lo encendió, hay algo que mostrar (imagen) y hay a dónde ir
 * (enlace). Sin enlace sería un botón que no lleva a ninguna parte, que es
 * peor que ninguno (v4.650); sin imagen sería un círculo vacío.
 */
export const floatingButtonVisible = (
    config: FloatingButtonConfig,
    { path = '/' }: FloatingButtonVisibility = {},
): boolean => {
    if (!config.enabled) return false;
    if (!config.imageUrl) return false;
    if (!config.url) return false;
    return !HIDDEN_PATH_PREFIXES.some(prefix => pathIsUnder(path, prefix));
};

/** El nombre accesible que de verdad se pinta. */
export const floatingButtonLabel = (config: FloatingButtonConfig): string =>
    config.label || FLOATING_BUTTON_FALLBACK_LABEL;

/**
 * Qué le falta a la configuración para salir al aire, en palabras.
 *
 * El panel lo pinta junto al interruptor: encender un botón que no se va a
 * ver y no enterarse es exactamente lo que hace que se reporte como roto.
 * Devuelve `null` cuando no falta nada.
 */
export const floatingButtonNotice = (raw: FloatingButtonConfig, rawUrl?: string): string | null => {
    const escrito = String(rawUrl ?? '').trim();
    if (escrito && !raw.url) {
        return 'El enlace no se guardó: sólo se admiten direcciones que empiecen por http://, https://, mailto: o tel:, o una ruta de este mismo sitio como /proyectos.';
    }
    if (!raw.imageUrl && !raw.url) return 'Sube la imagen del botón y escribe a dónde lleva. Sin las dos cosas el botón no aparece en el sitio.';
    if (!raw.imageUrl) return 'Falta la imagen del botón. Sin ella no aparece en el sitio.';
    if (!raw.url) return 'Falta el enlace. Un botón que no lleva a ninguna parte no se publica.';
    if (!raw.enabled) return 'Está apagado: la configuración se guarda, pero el botón no aparece en el sitio hasta que lo enciendas.';
    return null;
};
