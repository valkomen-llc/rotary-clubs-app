// Carpetas de la Librería de Medios — el CRITERIO.
//
// PURO a propósito: sin base, sin red, sin S3. Todo lo que decide si un nombre
// vale, si un movimiento es legal y cómo se arma el árbol vive acá, separado de
// la orquestación (`server/routes/media.js`), por el mismo motivo que
// `seoRules.js` vive aparte de `seoAudit.js`: un criterio que sólo se puede
// ejercitar contra una base real termina sin pruebas.
//
// Espejado en `src/lib/mediaFolders.ts` — al tocar uno, tocar el otro.

/** Profundidad máxima de anidación (la raíz es el nivel 0). */
export const MAX_DEPTH = 5;

/** Largo máximo del nombre de una carpeta. */
export const MAX_NAME = 60;

/**
 * Caracteres que NO se aceptan en el nombre de una carpeta.
 *
 * No es una lista estética: `/` y `\` se leen como separadores de ruta en
 * cuanto alguien arma una migaja de pan o una clave de S3, y los de control
 * rompen el JSON de la respuesta. El resto —tildes, ñ, espacios, signos— se
 * acepta: los clubes nombran sus carpetas en español.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[/\\\u0000-\u001f\u007f]/;

/** Nombres que el sistema se reserva para sí. */
const RESERVED = new Set(['..', '.']);

/**
 * Normaliza el nombre tal como se va a guardar: sin espacios en los extremos y
 * sin espacios repetidos dentro. No cambia mayúsculas — «Logos» se guarda como
 * lo escribió el usuario; la comparación de duplicados es la que ignora la caja.
 */
export function normalizeFolderName(raw) {
    return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/** Clave de comparación para detectar duplicados: misma carpeta, otra caja. */
export function folderKey(raw) {
    return normalizeFolderName(raw).toLocaleLowerCase('es');
}

/**
 * ¿Sirve este nombre? Devuelve `{ ok, name, error }`.
 *
 * El error se devuelve REDACTADO, no como un código: lo pinta la pantalla tal
 * cual, y «El nombre no puede llevar / ni \» le dice a alguien qué corregir,
 * mientras que `INVALID_NAME` no.
 */
export function validateFolderName(raw) {
    const name = normalizeFolderName(raw);
    if (!name) return { ok: false, name, error: 'La carpeta necesita un nombre.' };
    if (name.length > MAX_NAME) {
        return { ok: false, name, error: `El nombre no puede pasar de ${MAX_NAME} caracteres.` };
    }
    if (FORBIDDEN.test(name)) {
        return { ok: false, name, error: 'El nombre no puede llevar / ni \\.' };
    }
    if (RESERVED.has(name)) {
        return { ok: false, name, error: 'Ese nombre está reservado.' };
    }
    return { ok: true, name, error: null };
}

/**
 * Profundidad de una carpeta dentro del árbol, contando desde la raíz (0).
 * `folders` es la lista plana; `id` la carpeta que se mide.
 *
 * Corta si encuentra un ciclo en vez de girar sin fin: una fila corrupta no
 * puede colgar la petición. Devuelve `Infinity` para que quien decide con este
 * número rechace, que es lo conservador.
 */
export function depthOf(folders, id) {
    const byId = new Map(folders.map(f => [f.id, f]));
    const seen = new Set();
    let depth = 0;
    let current = byId.get(id);
    while (current && current.parentId) {
        if (seen.has(current.id)) return Infinity;
        seen.add(current.id);
        current = byId.get(current.parentId);
        depth += 1;
        if (depth > MAX_DEPTH + 1) return Infinity;
    }
    return current ? depth : Infinity;
}

/** Todos los descendientes de una carpeta, en cualquier nivel. */
export function descendantsOf(folders, id) {
    const out = [];
    const pending = [id];
    const seen = new Set([id]);
    while (pending.length) {
        const parent = pending.pop();
        for (const f of folders) {
            if (f.parentId === parent && !seen.has(f.id)) {
                seen.add(f.id);
                out.push(f);
                pending.push(f.id);
            }
        }
    }
    return out;
}

/**
 * ¿Se puede mover `id` dentro de `targetId`? Devuelve `{ ok, error }`.
 *
 * Las dos formas de romper el árbol son moverla dentro de sí misma y moverla
 * dentro de una hija suya: las dos dejan un ciclo, y un ciclo no se ve —la
 * carpeta simplemente desaparece del árbol, porque deja de colgar de la raíz—.
 * Por eso se comprueba acá y no se confía en que la pantalla no lo ofrezca.
 */
export function canMoveFolder(folders, id, targetId) {
    if (!id) return { ok: false, error: 'Falta la carpeta que se quiere mover.' };
    if (targetId === id) return { ok: false, error: 'Una carpeta no puede ir dentro de sí misma.' };
    if (targetId) {
        const target = folders.find(f => f.id === targetId);
        if (!target) return { ok: false, error: 'La carpeta de destino no existe.' };
        if (descendantsOf(folders, id).some(f => f.id === targetId)) {
            return { ok: false, error: 'Una carpeta no puede ir dentro de una de sus subcarpetas.' };
        }
    }
    const moved = folders.find(f => f.id === id);
    const subtree = moved ? 1 + maxRelativeDepth(folders, id) : 1;
    const base = targetId ? depthOf(folders, targetId) + 1 : 0;
    if (base + subtree - 1 > MAX_DEPTH) {
        return { ok: false, error: `No se puede anidar más de ${MAX_DEPTH} niveles.` };
    }
    return { ok: true, error: null };
}

/** Cuántos niveles cuelgan por debajo de una carpeta (0 si no tiene hijas). */
export function maxRelativeDepth(folders, id) {
    const children = folders.filter(f => f.parentId === id);
    if (!children.length) return 0;
    return 1 + Math.max(...children.map(c => maxRelativeDepth(folders, c.id)));
}

/**
 * La migaja de pan de una carpeta, de la raíz hacia adentro.
 * Devuelve [] si la carpeta no existe o si su cadena está rota — sin lanzar:
 * una carpeta huérfana se muestra en la raíz, no tumba la pantalla.
 */
export function breadcrumbOf(folders, id) {
    const byId = new Map(folders.map(f => [f.id, f]));
    const chain = [];
    const seen = new Set();
    let current = byId.get(id);
    while (current) {
        if (seen.has(current.id)) return [];
        seen.add(current.id);
        chain.unshift({ id: current.id, name: current.name });
        current = current.parentId ? byId.get(current.parentId) : null;
    }
    return chain;
}

/**
 * Arma el árbol a partir de la lista plana.
 *
 * Una carpeta cuyo padre no existe se cuelga de la RAÍZ en vez de perderse. Es
 * la decisión importante de esta función: al borrar un padre las hijas suben,
 * pero si alguna quedara apuntando a un id que ya no está, esconderla la
 * volvería invisible y no habría forma de recuperarla desde la pantalla.
 */
export function buildFolderTree(folders) {
    const byId = new Map(folders.map(f => [f.id, { ...f, children: [] }]));
    const roots = [];
    for (const node of byId.values()) {
        const parent = node.parentId ? byId.get(node.parentId) : null;
        if (parent && parent.id !== node.id) parent.children.push(node);
        else roots.push(node);
    }
    const sort = (list) => {
        list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        list.forEach(n => sort(n.children));
    };
    sort(roots);
    return roots;
}

/**
 * Reparte el conteo de archivos de cada carpeta hacia sus ancestros.
 *
 * La carpeta «Logos» con dos subcarpetas de diez archivos cada una y ninguno
 * suyo dice «20», no «0»: quien mira una carpeta cerrada quiere saber si hay
 * algo adentro, y el conteo propio contesta que no cuando la respuesta es que
 * sí. El conteo propio se conserva aparte (`ownCount`) para el rótulo de la
 * carpeta abierta, donde lo que importa es lo que se ve.
 */
export function withRollupCounts(tree) {
    const walk = (node) => {
        const own = node.ownCount || 0;
        const kids = node.children.map(walk);
        const total = own + kids.reduce((sum, k) => sum + k.totalCount, 0);
        return { ...node, ownCount: own, totalCount: total, children: kids };
    };
    return tree.map(walk);
}

export default {
    MAX_DEPTH, MAX_NAME, normalizeFolderName, folderKey, validateFolderName,
    depthOf, descendantsOf, canMoveFolder, maxRelativeDepth, breadcrumbOf,
    buildFolderTree, withRollupCounts,
};
