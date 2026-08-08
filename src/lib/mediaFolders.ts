// Carpetas de la Librería de Medios — espejo del criterio en el navegador.
//
// Duplicado A PROPÓSITO de `server/lib/mediaFolders.js`, igual que
// `designSpec.ts` y `entityTypes.ts`: el navegador valida para poder avisar
// mientras se escribe, y el servidor valida porque es el que no se puede
// saltar. Si cambia uno, cambiar el otro — lo comprueba `npm run test:media`,
// que carga los dos y compara LAS SALIDAS de las funciones, no sólo las
// constantes.

export const MAX_DEPTH = 5;
export const MAX_NAME = 60;

// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[/\\\u0000-\u001f\u007f]/;
const RESERVED = new Set(['..', '.']);

export interface FolderRow {
    id: string;
    name: string;
    parentId: string | null;
    ownCount?: number;
}

export interface FolderNode extends FolderRow {
    children: FolderNode[];
    ownCount: number;
    totalCount: number;
}

export function normalizeFolderName(raw: unknown): string {
    return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

export function folderKey(raw: unknown): string {
    return normalizeFolderName(raw).toLocaleLowerCase('es');
}

export function validateFolderName(raw: unknown): { ok: boolean; name: string; error: string | null } {
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

export function depthOf(folders: FolderRow[], id: string): number {
    const byId = new Map(folders.map(f => [f.id, f]));
    const seen = new Set<string>();
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

export function descendantsOf(folders: FolderRow[], id: string): FolderRow[] {
    const out: FolderRow[] = [];
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

export function maxRelativeDepth(folders: FolderRow[], id: string): number {
    const children = folders.filter(f => f.parentId === id);
    if (!children.length) return 0;
    return 1 + Math.max(...children.map(c => maxRelativeDepth(folders, c.id)));
}

export function canMoveFolder(
    folders: FolderRow[], id: string, targetId: string | null
): { ok: boolean; error: string | null } {
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

export function breadcrumbOf(folders: FolderRow[], id: string | null): { id: string; name: string }[] {
    if (!id) return [];
    const byId = new Map(folders.map(f => [f.id, f]));
    const chain: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    let current = byId.get(id);
    while (current) {
        if (seen.has(current.id)) return [];
        seen.add(current.id);
        chain.unshift({ id: current.id, name: current.name });
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain;
}

export function buildFolderTree(folders: FolderRow[]): FolderNode[] {
    const byId = new Map<string, FolderNode>(
        folders.map(f => [f.id, { ...f, ownCount: f.ownCount || 0, totalCount: 0, children: [] }])
    );
    const roots: FolderNode[] = [];
    for (const node of byId.values()) {
        const parent = node.parentId ? byId.get(node.parentId) : null;
        if (parent && parent.id !== node.id) parent.children.push(node);
        else roots.push(node);
    }
    const sort = (list: FolderNode[]) => {
        list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        list.forEach(n => sort(n.children));
    };
    sort(roots);
    return roots;
}

export function withRollupCounts(tree: FolderNode[]): FolderNode[] {
    const walk = (node: FolderNode): FolderNode => {
        const own = node.ownCount || 0;
        const kids = node.children.map(walk);
        const total = own + kids.reduce((sum, k) => sum + k.totalCount, 0);
        return { ...node, ownCount: own, totalCount: total, children: kids };
    };
    return tree.map(walk);
}
