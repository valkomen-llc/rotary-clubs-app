// ════════════════════════════════════════════════════════════════════
// Plantillas IA — el lienzo y el fondo generado, en el navegador
// v4.732.0
//
// Espejo de la parte de `server/lib/designCompose.js` que el navegador
// necesita: cómo entra el lienzo institucional en el documento y cómo entra —o
// sale— el fondo que devuelve el modelo. **Si cambia uno, cambiar el otro**; lo
// comprueba `npm run test:design` cargando los dos y comparando las SALIDAS,
// igual que con `designSpec` y `designFields`.
//
// Está duplicado a propósito y por el mismo motivo de siempre: el servidor no
// puede importar del bundle y el navegador no puede importar del servidor. Lo
// que NO puede pasar es que cada pantalla lo escriba a su manera — hasta v4.731
// `DesignStudio.tsx` llevaba su propia copia de `withBackdrop` a mano, y al
// llegar el portal público habría habido tres.
//
// El prompt, los planes de variante y la validación de lo que devuelve el
// modelo NO están acá: son del servidor y el navegador no los usa.
// ════════════════════════════════════════════════════════════════════

import type { DesignDocument, DesignNode, ImageNode } from './designSpec';

/** El fondo que devuelve el modelo, con la fotografía ya integrada. */
export const BACKDROP_ROLE = 'backdrop';

/** La papelería del Distrito sobre la que se diseña. Es un rol DISTINTO del
 *  fondo generado: no tapa la fotografía del club, se dibuja debajo de ella. */
export const BASE_ROLE = 'lienzo';

const fullBleed = (url: string, id: string, name: string, role: string): ImageNode => ({
    id,
    type: 'image',
    name,
    role,
    src: url,
    srcVar: null,
    fit: 'cover',
    x: 0, y: 0, w: 1, h: 1,
    rotation: 0, opacity: 1,
    radius: 0,
    locked: true,
} as ImageNode);

export const backdropNode = (url: string, id = 'fondo_ia'): ImageNode =>
    fullBleed(url, id, 'Fondo generado', BACKDROP_ROLE);

export const baseNode = (url: string, id = 'lienzo_base'): ImageNode =>
    fullBleed(url, id, 'Lienzo institucional', BASE_ROLE);

const esFoto = (n: DesignNode): boolean =>
    n.type === 'image' && ((n as ImageNode).srcVar === 'imagen' || n.role === 'foto');

/** Pone, cambia o quita el lienzo institucional al pie de la pila. */
export const withBase = (document: DesignDocument, url: string | null): DesignDocument => {
    const resto = (document?.nodes || []).filter(n => n.role !== BASE_ROLE);
    return { ...document, nodes: url ? [baseNode(url), ...resto] : resto };
};

export const hasBase = (document: DesignDocument): boolean =>
    (document?.nodes || []).some(n => n.role === BASE_ROLE);

/** Mete el fondo generado ENCIMA del lienzo institucional y debajo de todo lo
 *  demás, y apaga el nodo de la fotografía: la foto ya está dentro de la
 *  imagen compuesta y dejarla encima la mostraría dos veces. */
export const withBackdrop = (document: DesignDocument, url: string): DesignDocument => {
    const resto = (document?.nodes || [])
        .filter(n => n.role !== BACKDROP_ROLE)
        .map(n => (esFoto(n) ? { ...n, hidden: true } : n));
    const i = resto.findIndex(n => n.role !== BASE_ROLE);
    const at = i === -1 ? resto.length : i;
    return { ...document, nodes: [...resto.slice(0, at), backdropNode(url), ...resto.slice(at)] };
};

/** La vuelta atrás: devuelve la pieza a su composición declarada, con la
 *  fotografía visible. Una generación que no gusta no puede dejarla peor. */
export const withoutBackdrop = (document: DesignDocument): DesignDocument => ({
    ...document,
    nodes: (document?.nodes || [])
        .filter(n => n.role !== BACKDROP_ROLE)
        .map(n => (esFoto(n) ? { ...n, hidden: false } : n)),
});

export const hasBackdrop = (document: DesignDocument): boolean =>
    (document?.nodes || []).some(n => n.role === BACKDROP_ROLE);
