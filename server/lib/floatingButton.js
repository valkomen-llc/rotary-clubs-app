// ════════════════════════════════════════════════════════════════════
// El BOTÓN FLOTANTE del sitio — el saneado del SERVIDOR (v4.1021)
//
// Espejo MÍNIMO de `src/lib/floatingButton.ts`: sólo lo que hace falta para
// decidir QUÉ SE GUARDA. No trae `floatingButtonVisible` ni el aviso del
// panel, que responden otra pregunta —qué se PINTA con lo guardado— y viven
// donde se pinta.
//
// ⚠️ EL SERVIDOR ES QUIEN DECIDE. La pantalla comprueba el enlace mientras se
// escribe, pero eso es comodidad: quien conoce el endpoint no pasa por la
// pantalla, y este valor termina como `href` de una página PÚBLICA. Esconder
// un control no protege un endpoint (v4.868).
//
// Los dos espejos se comparan por SALIDAS en `npm run test:floating-button`:
// con dos saneados, el panel aceptaría un enlace que la página no dibuja.
// Al tocar uno, tocar el otro.
// ════════════════════════════════════════════════════════════════════

export const FLOATING_BUTTON_DEFAULTS = {
    enabled: false,
    imageUrl: '',
    url: '',
    label: '',
};

/** Catálogo CERRADO de esquemas. Ver el porqué en el espejo del navegador. */
export const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

export const MAX_LABEL_CHARS = 80;
export const MAX_URL_CHARS = 2048;

const hasScheme = (value) => /^[a-z][a-z0-9+.-]*:/i.test(value);

/** ¿Este enlace se puede poner en un `href` de una página pública? */
export const isSafeFloatingUrl = (raw) => {
    const value = String(raw ?? '').trim();
    if (!value) return false;
    // `//otrositio.com` parece una ruta interna y sale del sitio (v4.781).
    if (value.startsWith('//')) return false;
    // Sin esquema es una ruta de este mismo sitio.
    if (!hasScheme(value)) return true;
    const scheme = value.slice(0, value.indexOf(':') + 1).toLowerCase();
    return SAFE_SCHEMES.includes(scheme);
};

const text = (raw, max) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** La forma canónica de lo guardado. Un enlace inseguro se DESCARTA acá. */
export const normalizeFloatingButton = (raw) => {
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

    const url = text(src.url, MAX_URL_CHARS);
    const imageUrl = text(src.imageUrl, MAX_URL_CHARS);

    return {
        enabled: src.enabled === true || src.enabled === 'true',
        imageUrl: isSafeFloatingUrl(imageUrl) ? imageUrl : '',
        url: isSafeFloatingUrl(url) ? url : '',
        label: text(src.label, MAX_LABEL_CHARS),
    };
};
