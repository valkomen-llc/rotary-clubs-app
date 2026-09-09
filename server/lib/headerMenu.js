// ════════════════════════════════════════════════════════════════════
// El menú principal — el saneado del SERVIDOR (v4.1022)
//
// Espejo MÍNIMO de `src/lib/headerMenu.ts`: sólo lo que decide QUÉ SE GUARDA
// del desplegable «Sobre Nosotros». No trae `resolveAboutMenu` ni los avisos
// del panel —eso responde qué se PINTA con lo guardado y vive donde se pinta.
//
// ⚠️ EL CATÁLOGO DE CLAVES ES CERRADO Y VIVE EN LOS DOS ESPEJOS. Sin esa
// puerta, el ajuste acabaría con claves de enlaces que ya no existen y nadie
// sabría cuáles siguen mandando. Se comparan por SALIDAS en
// `npm run test:header-menu`; al tocar uno, tocar el otro.
//
// Las tres categorías especiales (honorary/governor/author) NO están acá a
// propósito: su visibilidad ya vive en `honorary_members_visible`,
// `governors_visible` y `authors_visible`, y duplicarla daría dos verdades
// sobre el mismo enlace.
// ════════════════════════════════════════════════════════════════════

/** Las claves guardables del desplegable, en su orden real. */
export const ABOUT_MENU_KEYS = [
    'quienesSomos',
    'nuestrasCausas',
    'manerasDeContribuir',
    'nuestraHistoria',
    'nuestrosSocios',
    'juntaDirectiva',
    'intercambios',
    'rotaract',
    'interact',
    'fundacion',
    'estadosFinancieros',
];

/**
 * La forma canónica del ajuste.
 *
 * Sólo se guarda lo APAGADO: una clave ausente significa «se ve», así que
 * escribir los `true` sería guardar el valor por omisión. Es lo que hace el
 * ajuste aditivo — un sitio que nunca lo tocó se comporta como antes.
 */
export const normalizeAboutMenu = (raw) => {
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const out = {};
    for (const key of ABOUT_MENU_KEYS) {
        if (src[key] === false || src[key] === 'false') out[key] = false;
    }
    return out;
};

/** Cuántos botones tiene la cabecera. */
export const HEADER_CTA_COUNT = 2;

/** ¿Este botón está oculto? Ausente = se ve (aditivo). */
export const ctaHidden = (cfg) => {
    const src = (cfg && typeof cfg === 'object') ? cfg : {};
    return src.hidden === true || src.hidden === 'true';
};

/**
 * Los dos botones, con `hidden` ya como booleano real.
 *
 * Lo demás —texto y enlace por idioma— se conserva tal cual: este módulo sólo
 * se ocupa de si el botón se ve, y recortar las claves desconocidas borraría
 * lo que el administrador escribió.
 */
export const normalizeHeaderCtas = (raw) => {
    const list = Array.isArray(raw) ? raw : [];
    return Array.from({ length: HEADER_CTA_COUNT }, (_, i) => {
        const cfg = (list[i] && typeof list[i] === 'object') ? { ...list[i] } : {};
        cfg.hidden = ctaHidden(cfg);
        return cfg;
    });
};
