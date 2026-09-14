// Qué entrada de la barra lateral está ACTIVA — v4.1054
//
// Casi todas las entradas del panel son una ruta a secas, pero algunas
// enlazan una VISTA dentro de una pantalla que ya existe: «Dominio y
// Publicación» (`/admin/configuracion?tab=avanzado`), «WhatsApp CRM»
// (`/admin/crm?tab=wa-chat`) y, desde v4.1054, «Analítica de Redes Sociales»
// (`/admin/analytics?vista=social`).
//
// ⚠️ ESAS ENTRADAS NO SE PUEDEN COMPARAR CON `location.pathname`, y por eso
// esto existe. `location.pathname === item.path` nunca es cierto para una
// entrada con query —el pathname no lleva el `?`—, así que esa entrada no se
// resaltaba NUNCA y su hermana sin query se resaltaba SIEMPRE: estando en
// «Redes Sociales» la barra decía «Analytics». No falla ruidosamente: pinta
// el sitio equivocado y nadie lo nota hasta que alguien lo mira.
//
// ⚠️ Y MANDA LA MÁS ESPECÍFICA. Con la comparación suelta, `/admin/analytics`
// y `/admin/analytics?vista=social` casarían las dos a la vez sobre la misma
// dirección y se pintarían dos entradas activas — que es la contradicción que
// este panel ya prohibió una vez (v4.787: un indicador en contra de su propio
// veredicto).
//
// El criterio es PURO —recibe la dirección, no la consulta— para poder
// probarlo sin montar el panel.

export interface MenuPathParts { pathname: string; query: string }

/** La entrada partida en su ruta y su consulta. El ancla se descarta: el
 *  navegador nunca la manda al servidor y no distingue una vista de otra. */
export const splitMenuPath = (path: string): MenuPathParts => {
    const limpio = String(path || '').split('#')[0];
    const corte = limpio.indexOf('?');
    return corte === -1
        ? { pathname: limpio, query: '' }
        : { pathname: limpio.slice(0, corte), query: limpio.slice(corte + 1) };
};

/** ¿Esta entrada describe la dirección que se está mirando?
 *
 *  Una entrada CON consulta exige que cada parámetro que declara esté puesto
 *  y con ese valor; lo demás de la dirección no le importa —un filtro o un
 *  `utm_` no pueden apagar el resaltado—. Una entrada SIN consulta casa por
 *  ruta: es la vista por defecto de esa pantalla, y quien decide entre ella y
 *  su hermana más específica es `activeMenuPath`. */
export const menuItemMatches = (itemPath: string, pathname: string, search = ''): boolean => {
    const { pathname: ruta, query } = splitMenuPath(itemPath);
    if (!ruta || ruta !== String(pathname || '')) return false;
    if (!query) return true;
    const actual = new URLSearchParams(String(search || ''));
    for (const [clave, valor] of new URLSearchParams(query)) {
        if (actual.get(clave) !== valor) return false;
    }
    return true;
};

/** La entrada activa, o `null`. Gana la que declara MÁS parámetros: así
 *  `/admin/analytics?vista=social` le gana a `/admin/analytics` cuando la
 *  vista está pedida, y le cede cuando no. A igualdad manda la primera
 *  declarada, que es el orden del menú — el resaltado no puede depender de en
 *  qué orden se recorra una lista. */
export const activeMenuPath = (paths: string[], pathname: string, search = ''): string | null => {
    let mejor: string | null = null;
    let declarados = -1;
    for (const path of paths || []) {
        if (!menuItemMatches(path, pathname, search)) continue;
        const { query } = splitMenuPath(path);
        const n = query ? [...new URLSearchParams(query)].length : 0;
        if (n > declarados) { declarados = n; mejor = path; }
    }
    return mejor;
};

export default { splitMenuPath, menuItemMatches, activeMenuPath };
