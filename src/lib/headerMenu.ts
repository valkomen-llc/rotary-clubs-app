// ════════════════════════════════════════════════════════════════════
// Qué se ve en el MENÚ PRINCIPAL — v4.1022
//
// Dos cosas que se piden juntas y hasta ahora no se podían apagar desde
// ninguna pantalla:
//
//   1. LOS SUBÍTEMS DE «SOBRE NOSOTROS» — las catorce entradas del
//      desplegable. Estaban escritas a mano dentro del `Navbar` y se pintaban
//      todas, siempre.
//   2. LOS BOTONES DE LA CABECERA — «Contribuye» y «Únete a un club». Se
//      podían renombrar y re-enlazar (`headerCtas`) y no OCULTAR.
//
// Los ítems de primer nivel —Inicio, Proyectos, Noticias, Contacto…— ya se
// activan y desactivan desde «Menú Principal» (`eventNavOrder`) y **no se
// tocan acá**: un segundo interruptor sobre lo mismo daría dos verdades sobre
// el mismo enlace, y ganaría la que se consulte de último.
//
// ─── LO QUE SOSTIENE ESTE MÓDULO ───────────────────────────────────────────
//
// · TODO NACE VISIBLE. El ajuste es ADITIVO: una clave ausente significa «se
//   ve», así que un sitio que nunca lo configuró se comporta exactamente como
//   antes. Es lo que hace que desplegar esto no cambie ningún menú.
//
// · ⚠️ EL CATÁLOGO ES CERRADO. Lo que no está en `ABOUT_MENU_ITEMS` no se
//   guarda ni decide nada: sin esa puerta, el ajuste acabaría con claves de
//   enlaces que ya no existen y nadie sabría cuáles siguen mandando.
//
// · ⚠️ LAS TRES CATEGORÍAS ESPECIALES NO ENTRAN EN ESTE AJUSTE, y es la
//   decisión que más importa. Socios Honorarios, Nuestros Gobernadores y
//   Nuestros Autores YA tienen su interruptor —`honoraryMembersVisible`,
//   `governorsVisible`, `authorsVisible`— guardado en su propio campo del
//   sitio, que además consumen sus páginas. Copiarlos acá daría DOS verdades
//   sobre el mismo enlace. Lo que se hace es LEERLOS: aparecen en la misma
//   lista, con el mismo aspecto, y cada casilla escribe donde ya vivía su
//   dato. (De paso dejan de ser inalcanzables: existían en la base desde
//   siempre y no había ninguna pantalla donde tocarlos.)
//
// · Y esas tres siguen dependiendo de que el club TENGA socios de esa
//   categoría. Son dos condiciones distintas —«hay a quién mostrar» y «se
//   quiere mostrar»— y ninguna sustituye a la otra.
// ════════════════════════════════════════════════════════════════════

import { SPECIAL_CATEGORIES, type SpecialCategoryKey } from './memberCategories';

export interface AboutMenuItemDef {
    /** Clave estable. Es lo que se guarda; el rótulo puede cambiar. */
    key: string;
    label: string;
    href: string;
    /**
     * Categoría especial de socios. Su visibilidad NO vive en este ajuste sino
     * en el campo del sitio que ya la guardaba (`visibleField`).
     */
    special?: SpecialCategoryKey;
    visibleField?: string;
}

/**
 * Lo que se guarda del desplegable: SÓLO lo apagado.
 *
 * La ausencia de una clave es «visible», así que un sitio que nunca lo tocó
 * tiene el objeto vacío y se comporta como siempre (regla aditiva).
 */
export type AboutMenuConfig = Record<string, boolean>;

/**
 * El desplegable «Sobre Nosotros», en su orden real.
 *
 * ⚠️ EL ORDEN ES EL QUE YA SE PINTABA y no se cambia acá: las tres categorías
 * especiales van entre «Nuestra Junta Directiva» y «Programa de Intercambios»,
 * como estaban. Reordenar el menú es otra función y otra decisión.
 */
export const ABOUT_MENU_ITEMS: AboutMenuItemDef[] = [
    { key: 'quienesSomos', label: 'Quienes Somos', href: '/quienes-somos' },
    { key: 'nuestrasCausas', label: 'Nuestras Causas', href: '/nuestras-causas' },
    { key: 'manerasDeContribuir', label: 'Maneras de contribuir', href: '/maneras-de-contribuir' },
    { key: 'nuestraHistoria', label: 'Nuestra Historia', href: '/nuestra-historia' },
    { key: 'nuestrosSocios', label: 'Nuestros Socios', href: '/nuestros-socios' },
    { key: 'juntaDirectiva', label: 'Nuestra Junta Directiva', href: '/nuestra-junta-directiva' },
    // Las tres especiales, leídas del catálogo que ya las declara: un segundo
    // catálogo de categorías se separaría del primero en silencio.
    ...SPECIAL_CATEGORIES.map(c => ({
        key: c.key,
        label: c.label,
        href: c.href,
        special: c.key,
        visibleField: c.visibleField,
    })),
    { key: 'intercambios', label: 'Programa de Intercambios', href: '/intercambio-jovenes' },
    { key: 'rotaract', label: 'Rotaract', href: '/rotaract' },
    { key: 'interact', label: 'Interact', href: '/interact' },
    { key: 'fundacion', label: 'La Fundación Rotaria', href: '/la-fundacion-rotaria' },
    { key: 'estadosFinancieros', label: 'Estados Financieros', href: '/estados-financieros' },
];

/** Las claves que este ajuste puede guardar: las fijas, sin las especiales. */
export const ABOUT_MENU_KEYS = ABOUT_MENU_ITEMS.filter(i => !i.special).map(i => i.key);

/**
 * La forma canónica del ajuste. Catálogo CERRADO: lo que no reconoce se
 * descarta, y sólo se guarda lo APAGADO —una clave ausente significa «se ve»,
 * así que escribir los `true` sería guardar el valor por omisión y volver el
 * ajuste ilegible cuando el catálogo crezca.
 */
export const normalizeAboutMenu = (raw?: unknown): Record<string, boolean> => {
    const src = (raw && typeof raw === 'object' && !Array.isArray(raw))
        ? raw as Record<string, unknown>
        : {};
    const out: Record<string, boolean> = {};
    for (const key of ABOUT_MENU_KEYS) {
        // El almacenamiento de ajustes ha guardado booleanos como texto, y sólo
        // un `false` explícito apaga: ante la duda se muestra, que es como se
        // comportaba antes de existir este ajuste.
        if (src[key] === false || src[key] === 'false') out[key] = false;
    }
    return out;
};

/** ¿Este ítem fijo está encendido? Ausente = sí. */
export const aboutItemEnabled = (key: string, menu?: Record<string, boolean> | null): boolean =>
    (menu || {})[key] !== false;

export interface AboutMenuContext {
    /** El ajuste guardado, ya normalizado o crudo. */
    menu?: unknown;
    /** El sitio: de ahí salen los interruptores de las categorías especiales. */
    club?: Record<string, unknown> | null;
    /** ¿El club tiene socios de esta categoría? Lo resuelve quien llama. */
    hasMembersOf?: (key: SpecialCategoryKey) => boolean;
}

/**
 * Los ítems que de verdad se pintan en el desplegable.
 *
 * Una categoría especial necesita las DOS cosas: que haya socios de esa
 * categoría y que su interruptor no esté apagado. Un ítem fijo, sólo lo
 * segundo.
 */
export const resolveAboutMenu = (
    { menu, club, hasMembersOf }: AboutMenuContext = {},
): { key: string; label: string; href: string }[] => {
    const normal = normalizeAboutMenu(menu);
    const sitio = (club || {}) as Record<string, unknown>;

    return ABOUT_MENU_ITEMS.filter(item => {
        if (item.special) {
            const hay = hasMembersOf ? hasMembersOf(item.special) : false;
            const encendido = sitio[item.visibleField as string] !== false;
            return hay && encendido;
        }
        return aboutItemEnabled(item.key, normal);
    }).map(({ key, label, href }) => ({ key, label, href }));
};

// ─── Los botones de la cabecera ────────────────────────────────────────────

/** Cuántos botones tiene la cabecera. Su contenido lo decide `ctaLinks`. */
export const HEADER_CTA_COUNT = 2;

/**
 * ¿Este botón está oculto?
 *
 * ADITIVO: `hidden` ausente significa que se ve, así que los sitios que ya
 * tenían botones configurados no cambian. Sólo un `true` explícito lo apaga —
 * ante la duda se muestra, que es como se comportaba antes.
 */
export const ctaHidden = (cfg?: unknown): boolean => {
    const src = (cfg && typeof cfg === 'object') ? cfg as Record<string, unknown> : {};
    return src.hidden === true || src.hidden === 'true';
};

/**
 * Deja los dos botones en su forma canónica, conservando lo que ya traían.
 *
 * No se recorta a las claves conocidas a propósito: `headerCtas` guarda texto y
 * enlace por idioma y este módulo sólo se ocupa de si se ve. Lo que sí se
 * garantiza es que haya SIEMPRE dos entradas — el editor las pinta por índice y
 * con una lista corta la segunda casilla no existiría.
 */
export const normalizeHeaderCtas = (raw?: unknown): Record<string, unknown>[] => {
    const list = Array.isArray(raw) ? raw : [];
    return Array.from({ length: HEADER_CTA_COUNT }, (_, i) => {
        const cfg = (list[i] && typeof list[i] === 'object') ? { ...list[i] as object } as Record<string, unknown> : {};
        // Se normaliza a booleano real: guardado como la cadena 'false', un
        // `!!cfg.hidden` lo leería como oculto y el botón desaparecería solo.
        cfg.hidden = ctaHidden(cfg);
        return cfg;
    });
};

/**
 * Qué se le dice al administrador cuando apaga los dos botones.
 *
 * No se bloquea —un sitio puede querer la cabecera limpia— pero callarlo
 * dejaría una cabecera sin ninguna llamada a la acción sin que nadie lo haya
 * mirado dos veces. Devuelve `null` cuando no hay nada que decir.
 */
export const headerCtasNotice = (ctas?: unknown): string | null => {
    const list = normalizeHeaderCtas(ctas);
    return list.every(c => c.hidden === true)
        ? 'Los dos botones están apagados: la cabecera del sitio queda sin botones de acción.'
        : null;
};

/**
 * Qué se le dice cuando apaga TODO el desplegable.
 *
 * Con los catorce apagados, «Sobre Nosotros» sería un botón que abre un
 * recuadro vacío — peor que no tenerlo (v4.650). La salida se dice con todas
 * las letras: se apaga «Sobre Nosotros» entero desde «Menú Principal».
 */
export const aboutMenuNotice = (visibles: number): string | null =>
    visibles === 0
        ? 'No queda ninguna entrada visible: «Sobre Nosotros» abriría un desplegable vacío. Si quieres quitarlo del menú, apágalo en «Menú Principal».'
        : null;
