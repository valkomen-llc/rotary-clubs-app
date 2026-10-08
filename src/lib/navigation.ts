// ════════════════════════════════════════════════════════════════════
// GESTOR DE NAVEGACIÓN Y MENÚS JERÁRQUICOS DINÁMICOS — v4.1173.0
//
// Estructura, relaciones padre-hijo, validación contra dependencias circulares,
// límites de 3 niveles, ordenamiento, indentación y utilidades de renderizado
// para escritorio y móvil.
// ════════════════════════════════════════════════════════════════════

export type NavItemKind = 'fixed' | 'custom';

export interface NavOrderItem {
    /** Identificador único y estable del elemento */
    id: string;
    /** 'fixed' para secciones predeterminadas del sistema, 'custom' para enlaces, documentos o páginas */
    kind: NavItemKind;
    /** Clave de sección fija (inicio, sobreNosotros, proyectos, etc.) */
    key?: string;
    /** Nombre visible en el menú */
    label: string;
    /** URL, ruta o enlace a documento */
    href?: string;
    /** Si es un enlace externo fuera del sitio */
    external?: boolean;
    /** Si abre en una pestaña nueva (target="_blank"). Por defecto true para enlaces externos */
    openInNewTab?: boolean;
    /** Estado activo / inactivo en el menú */
    enabled?: boolean;
    /** Identificador del elemento padre (null o undefined = menú principal de nivel 1) */
    parentId?: string | null;
}

export interface NavTreeItem extends NavOrderItem {
    /** Nivel en el árbol: 1 = Principal, 2 = Submenú, 3 = Sub-submenú */
    level: number;
    /** Submenús hijos anidados */
    children: NavTreeItem[];
}

export const MAX_NAV_LEVELS = 3;

export type NavDestinationType = 'internal' | 'external' | 'document';

/**
 * Limpia y normaliza URLs eliminando barras accidentales que se anteponen a enlaces externos
 * (ej: cuando un usuario pega https:// sobre un campo que contenía '/' por defecto).
 */
export function cleanNavUrl(url?: string): string {
    let trimmed = String(url || '').trim();
    if (!trimmed) return '';
    // Corregir URLs donde se antepuso accidentalmente '/' o '///' a una URL externa o protocolo
    if (/^\/+(https?:\/\/|\/\/|[a-z0-9+.-]+:)/i.test(trimmed)) {
        trimmed = trimmed.replace(/^\/+/, '');
    } else if (/^\/+([a-z0-9-]+\.[a-z0-9-]+\.[a-z]{2,})/i.test(trimmed)) {
        trimmed = trimmed.replace(/^\/+/, '');
    }
    return trimmed;
}

/**
 * Detecta si una URL apunta a un documento descargable (PDF, Word, Excel, S3 docs).
 */
export function isDocumentUrl(url?: string): boolean {
    const raw = cleanNavUrl(url).toLowerCase();
    if (!raw) return false;
    if (/\.(pdf|docx?|xlsx?|pptx?|zip|rar|csv)(\?|$|#)/i.test(raw)) return true;
    if (raw.includes('.s3.') || raw.includes('.amazonaws.com/')) {
        if (raw.includes('/documents/') || raw.includes('/docs/')) return true;
    }
    return false;
}

/**
 * Detecta de forma inteligente si una URL es o aparenta ser externa (protocolos http/https, mailto, dominios o servicios S3).
 */
export function isExternalUrl(url?: string): boolean {
    const raw = cleanNavUrl(url);
    if (!raw) return false;
    // Protocolo http(s) o //
    if (/^(https?:)?\/\//i.test(raw)) return true;
    // Protocolos externos como mailto:, tel:, whatsapp:
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return true;
    // S3 o dominios conocidos sin protocolo explícito
    if (raw.includes('.amazonaws.com') || raw.includes('.s3.')) return true;
    // Patrón de dominio sin protocolo (ej: drive.google.com, www.rotary.org, ejemplo.org/documento)
    if (/^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(raw)) return true;
    return false;
}

/**
 * Determina el tipo de destino de una URL para facilitar la interfaz de usuario.
 */
export function getNavDestinationType(url?: string, isExplicitExternal?: boolean): NavDestinationType {
    const raw = cleanNavUrl(url);
    if (!raw) return 'internal';
    if (isDocumentUrl(raw)) return 'document';
    if (isExplicitExternal || isExternalUrl(raw)) return 'external';
    return 'internal';
}

/**
 * Valida una URL para detectar errores, advertencias de protocolo o riesgos de seguridad.
 */
export function validateNavUrl(url?: string, isExternalMarked?: boolean): {
    isValid: boolean;
    isDangerous: boolean;
    isExternal: boolean;
    missingProtocol: boolean;
    warning?: string;
    suggestedUrl?: string;
} {
    const raw = cleanNavUrl(url);
    if (!raw) {
        return {
            isValid: false,
            isDangerous: false,
            isExternal: !!isExternalMarked,
            missingProtocol: false,
            warning: 'La dirección URL está vacía.',
        };
    }

    // Protocolos peligrosos
    if (/^(javascript|data|vbscript):/i.test(raw)) {
        return {
            isValid: false,
            isDangerous: true,
            isExternal: false,
            missingProtocol: false,
            warning: 'Protocolo no permitido por seguridad.',
        };
    }

    const looksExternal = isExternalUrl(raw) || !!isExternalMarked;

    // Si parece externa o se marcó como tal pero no tiene http://, https:// ni protocolo
    if (looksExternal && !/^(https?:\/\/|[a-z0-9+.-]+:|\/\/)/i.test(raw)) {
        return {
            isValid: true,
            isDangerous: false,
            isExternal: true,
            missingProtocol: true,
            warning: 'Enlace externo sin protocolo. Se recomienda añadir https://.',
            suggestedUrl: `https://${raw}`,
        };
    }

    return {
        isValid: true,
        isDangerous: false,
        isExternal: looksExternal,
        missingProtocol: false,
    };
}

/**
 * Asegura que una dirección externa cuente con su protocolo sin alterar parámetros, firmas ni queries.
 */
export function ensureExternalProtocol(url: string): string {
    const trimmed = cleanNavUrl(url);
    if (!trimmed) return trimmed;
    if (/^(https?:)?\/\//i.test(trimmed)) {
        if (trimmed.startsWith('//')) return `https:${trimmed}`;
        return trimmed;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
        return trimmed;
    }
    return `https://${trimmed}`;
}

export interface ResolvedNavTarget {
    href: string;
    isExternal: boolean;
    target?: '_blank';
    rel?: 'noopener noreferrer';
}

/**
 * Resuelve de forma unificada y segura cómo debe navegar un elemento del menú.
 * Evita que el navegador o React Router antepongan el dominio local a direcciones externas.
 */
export function resolveNavTarget(item: {
    href?: string;
    external?: boolean;
    openInNewTab?: boolean;
}): ResolvedNavTarget {
    const raw = cleanNavUrl(item.href);
    if (!raw) {
        return { href: '/', isExternal: false };
    }

    // Descartar protocolos peligrosos
    if (/^(javascript|data|vbscript):/i.test(raw)) {
        return { href: '#', isExternal: false };
    }

    const isExplicitExternal = !!item.external;
    const isAutoExternal = isExternalUrl(raw);
    const isExternal = isExplicitExternal || isAutoExternal;

    if (isExternal) {
        const finalUrl = ensureExternalProtocol(raw);
        // Si openInNewTab está definido se respeta; por defecto un enlace externo abre en _blank
        const shouldOpenNewTab = item.openInNewTab !== undefined ? !!item.openInNewTab : true;
        return {
            href: finalUrl,
            isExternal: true,
            ...(shouldOpenNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        };
    }

    // Enlace interno
    const internalHref = (raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('?')) ? raw : `/${raw}`;
    const shouldOpenNewTab = !!item.openInNewTab;
    return {
        href: internalHref,
        isExternal: false,
        ...(shouldOpenNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
    };
}

/** Secciones y páginas del sistema que pueden añadirse al menú */
export const SYSTEM_NAV_SECTIONS: { label: string; href: string }[] = [
    { label: 'Inicio', href: '/' },
    { label: 'Quiénes Somos', href: '/quienes-somos' },
    { label: 'Nuestras Causas', href: '/nuestras-causas' },
    { label: 'Aportes', href: '/maneras-de-contribuir' },
    { label: 'Aportes (Alternativo)', href: '/aportes' },
    { label: 'Nuestra Historia', href: '/nuestra-historia' },
    { label: 'Nuestros Socios', href: '/nuestros-socios' },
    { label: 'Junta Directiva', href: '/nuestra-junta-directiva' },
    { label: 'La Fundación Rotaria', href: '/la-fundacion-rotaria' },
    { label: 'Programa de Intercambios', href: '/intercambio-jovenes' },
    { label: 'Rotaract', href: '/rotaract' },
    { label: 'Interact', href: '/interact' },
    { label: 'Estados Financieros', href: '/estados-financieros' },
    { label: 'Proyectos', href: '/proyectos' },
    { label: 'Noticias', href: '/blog' },
    { label: 'Eventos', href: '/eventos' },
    { label: 'Calendario', href: '/calendario' },
    { label: 'Tienda', href: '/shop' },
    { label: 'Contacto', href: '/contacto' },
];

/** Ítems fijos del menú principal predeterminado */
export const FIXED_NAV_ITEMS: { key: string; label: string }[] = [
    { key: 'inicio', label: 'Inicio' },
    { key: 'sobreNosotros', label: 'Sobre Nosotros' },
    { key: 'proyectos', label: 'Proyectos' },
    { key: 'noticias', label: 'Noticias' },
    { key: 'eventos', label: 'Eventos' },
    { key: 'contacto', label: 'Contacto' },
];

/**
 * Genera un identificador único seguro para elementos del menú.
 */
export function generateNavId(prefix: string = 'nav'): string {
    const random = Math.random().toString(36).substring(2, 8);
    const ts = Date.now().toString(36).slice(-4);
    return `${prefix}-${ts}${random}`;
}

/**
 * Normaliza una lista de elementos (incluyendo esquemas legados planos sin IDs ni parentId).
 * Garantiza identificadores únicos estables, parentId coherente y booleanos válidos.
 */
export function normalizeNavItems(rawItems: any[]): NavOrderItem[] {
    if (!Array.isArray(rawItems)) return [];

    const usedIds = new Set<string>();

    return rawItems.map((raw, idx) => {
        let id: string = raw.id ? String(raw.id) : '';
        if (!id) {
            if (raw.kind === 'fixed' && raw.key) {
                id = `fixed-${raw.key}`;
            } else if (raw.key) {
                id = `fixed-${raw.key}`;
            } else {
                const slug = (raw.label || 'item')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .slice(0, 15);
                id = `nav-${idx}-${slug}`;
            }
        }

        // Si ya está duplicado por alguna razón, hacerlo único
        if (usedIds.has(id)) {
            id = `${id}-${idx}`;
        }
        usedIds.add(id);

        const kind: NavItemKind = raw.kind === 'fixed' || (raw.key && !raw.href) ? 'fixed' : 'custom';
        const label = String(raw.label || raw.key || 'Enlace').trim();
        const rawHref = kind === 'fixed' ? undefined : String(raw.href !== undefined ? raw.href : '/').trim();
        const href = rawHref !== undefined ? cleanNavUrl(rawHref) : undefined;
        const enabled = raw.enabled !== false;
        const external = raw.external !== undefined ? !!raw.external : (href ? isExternalUrl(href) : false);
        const openInNewTab = raw.openInNewTab !== undefined
            ? !!raw.openInNewTab
            : (external ? true : undefined);
        const parentId = (raw.parentId && typeof raw.parentId === 'string' && raw.parentId !== id)
            ? raw.parentId
            : null;

        const item: NavOrderItem = {
            id,
            kind,
            label,
            enabled,
            external,
            openInNewTab,
            parentId,
        };

        if (raw.key) item.key = String(raw.key);
        if (href !== undefined) item.href = href;

        return item;
    });
}

/**
 * Encuentra todos los IDs de descendientes directos e indirectos de un elemento.
 */
export function findItemDescendantIds(itemId: string, items: NavOrderItem[]): Set<string> {
    const descendants = new Set<string>();
    const queue = [itemId];

    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const it of items) {
            if (it.parentId === current && !descendants.has(it.id)) {
                descendants.add(it.id);
                queue.push(it.id);
            }
        }
    }

    return descendants;
}

/**
 * Calcula el nivel jerárquico de un elemento (1 = principal, 2 = submenú, 3 = sub-submenú).
 * Protegido contra ciclos infinitos.
 */
export function getItemLevel(itemId: string, items: NavOrderItem[]): number {
    const itemMap = new Map(items.map(i => [i.id, i]));
    let current = itemMap.get(itemId);
    let level = 1;
    const visited = new Set<string>();

    while (current && current.parentId && level < MAX_NAV_LEVELS + 2) {
        if (visited.has(current.id)) break; // Prevención de ciclo infinito
        visited.add(current.id);

        const parent = itemMap.get(current.parentId);
        if (!parent) break; // Padre no existe -> se comporta como raíz
        level++;
        current = parent;
    }

    return Math.min(level, MAX_NAV_LEVELS);
}

/**
 * Calcula la profundidad máxima del subárbol de un elemento (0 si no tiene hijos).
 */
export function getSubtreeDepth(itemId: string, items: NavOrderItem[]): number {
    const itemMap = new Map(items.map(i => [i.id, i]));
    const childrenMap = new Map<string, string[]>();

    for (const it of items) {
        if (it.parentId) {
            const list = childrenMap.get(it.parentId) || [];
            list.push(it.id);
            childrenMap.set(it.parentId, list);
        }
    }

    function maxDepth(id: string, visited: Set<string>): number {
        if (visited.has(id)) return 0;
        visited.add(id);

        const children = childrenMap.get(id) || [];
        if (children.length === 0) return 0;

        let maxChild = 0;
        for (const childId of children) {
            maxChild = Math.max(maxChild, 1 + maxDepth(childId, new Set(visited)));
        }
        return maxChild;
    }

    return maxDepth(itemId, new Set());
}

/**
 * Valida si un elemento puede adoptar un candidato como padre sin violar
 * dependencias circulares ni exceder el límite de 3 niveles.
 */
export function canSetParent(
    itemId: string,
    candidateParentId: string | null,
    items: NavOrderItem[]
): { allowed: boolean; reason?: string } {
    // Si se desea convertir en raíz (nivel 1), siempre es permitido
    if (!candidateParentId) {
        return { allowed: true };
    }

    // Un elemento no puede ser su propio padre
    if (itemId === candidateParentId) {
        return { allowed: false, reason: 'Un elemento no puede ser su propio padre' };
    }

    // El candidato a padre debe existir en la lista
    const parent = items.find(i => i.id === candidateParentId);
    if (!parent) {
        return { allowed: false, reason: 'El elemento padre seleccionado no existe' };
    }

    // Prevención de dependencia circular: el padre no puede ser descendiente del elemento
    const descendants = findItemDescendantIds(itemId, items);
    if (descendants.has(candidateParentId)) {
        return { allowed: false, reason: 'Referencia circular: no puedes seleccionar a un submenú descendiente como padre' };
    }

    // Nivel del padre propuesto
    const parentLevel = getItemLevel(candidateParentId, items);
    if (parentLevel >= MAX_NAV_LEVELS) {
        return { allowed: false, reason: `No se permite más de ${MAX_NAV_LEVELS} niveles de navegación` };
    }

    // Altura del subárbol del elemento a mover
    const subtreeDepth = getSubtreeDepth(itemId, items);
    if (parentLevel + 1 + subtreeDepth > MAX_NAV_LEVELS) {
        return { allowed: false, reason: `Mover este elemento excedería el límite de ${MAX_NAV_LEVELS} niveles para sus submenús` };
    }

    return { allowed: true };
}

/**
 * Devuelve la lista de elementos que son válidos como candidatos a padre para `itemId`.
 */
export function getValidParentCandidates(
    itemId: string,
    items: NavOrderItem[]
): { id: string; label: string; level: number }[] {
    const candidates: { id: string; label: string; level: number }[] = [];

    for (const it of items) {
        if (it.id === itemId) continue;
        const check = canSetParent(itemId, it.id, items);
        if (check.allowed) {
            candidates.push({
                id: it.id,
                label: it.label || (it.kind === 'fixed' ? `Sección ${it.key}` : 'Enlace'),
                level: getItemLevel(it.id, items),
            });
        }
    }

    return candidates;
}

/**
 * Convierte una lista plana de elementos en un árbol jerárquico ordenado (hasta 3 niveles).
 * Incluye solo elementos que existen. Si un parentId no existe, el ítem se promueve a raíz.
 */
export function buildNavTree(items: NavOrderItem[]): NavTreeItem[] {
    const normalized = normalizeNavItems(items);
    const itemMap = new Map<string, NavTreeItem>();

    // Primero creamos todas las instancias con children vacíos
    for (const it of normalized) {
        itemMap.set(it.id, {
            ...it,
            level: 1,
            children: [],
        });
    }

    const rootItems: NavTreeItem[] = [];

    for (const it of normalized) {
        const treeItem = itemMap.get(it.id)!;
        const parentId = it.parentId;

        if (parentId && itemMap.has(parentId) && parentId !== it.id) {
            const parent = itemMap.get(parentId)!;
            // Verificar que no sea un ciclo directo
            if (parent.parentId !== it.id) {
                parent.children.push(treeItem);
            } else {
                rootItems.push(treeItem);
            }
        } else {
            rootItems.push(treeItem);
        }
    }

    // Asignar niveles recursivamente y recortar a MAX_NAV_LEVELS
    function assignLevels(nodes: NavTreeItem[], currentLevel: number) {
        for (const node of nodes) {
            node.level = currentLevel;
            if (currentLevel < MAX_NAV_LEVELS) {
                assignLevels(node.children, currentLevel + 1);
            } else {
                // Si excede el nivel 3, no permitir más hijos
                node.children = [];
            }
        }
    }

    assignLevels(rootItems, 1);
    return rootItems;
}

/**
 * Aplana un árbol jerárquico a una lista lineal ordenada de NavOrderItem (pre-order traversal).
 */
export function flattenNavTree(tree: NavTreeItem[]): NavOrderItem[] {
    const result: NavOrderItem[] = [];

    function traverse(nodes: NavTreeItem[], parentId: string | null = null) {
        for (const node of nodes) {
            const { level, children, ...rest } = node;
            result.push({
                ...rest,
                parentId,
            });
            if (children && children.length > 0) {
                traverse(children, node.id);
            }
        }
    }

    traverse(tree, null);
    return result;
}

/**
 * Aumenta la sangría de un ítem (Indent / →), convirtiéndolo en submenú del elemento anterior.
 */
export function indentItem(idx: number, items: NavOrderItem[]): NavOrderItem[] {
    if (idx <= 0 || idx >= items.length) return items;

    const current = items[idx];
    const prev = items[idx - 1];

    // Proponer el ítem anterior como padre
    // Si el ítem anterior está en el mismo nivel o nivel superior, puede ser el nuevo padre
    const check = canSetParent(current.id, prev.id, items);
    if (!check.allowed) return items;

    return items.map((it, i) => i === idx ? { ...it, parentId: prev.id } : it);
}

/**
 * Disminuye la sangría de un ítem (Outdent / ←), promoviéndolo un nivel hacia arriba.
 */
export function outdentItem(idx: number, items: NavOrderItem[]): NavOrderItem[] {
    if (idx < 0 || idx >= items.length) return items;

    const current = items[idx];
    if (!current.parentId) return items; // Ya es raíz (nivel 1)

    const parent = items.find(i => i.id === current.parentId);
    // Si el padre tenía a su vez un padre (abuelo), ahora dependerá del abuelo (nivel 2);
    // si no tenía abuelo, se convierte en raíz (nivel 1).
    const newParentId = parent?.parentId || null;

    const check = canSetParent(current.id, newParentId, items);
    if (!check.allowed) return items;

    return items.map((it, i) => i === idx ? { ...it, parentId: newParentId } : it);
}

/**
 * Asigna un nuevo padre a un elemento de forma segura.
 */
export function reparentItem(itemId: string, newParentId: string | null, items: NavOrderItem[]): NavOrderItem[] {
    const check = canSetParent(itemId, newParentId, items);
    if (!check.allowed) return items;

    return items.map(it => it.id === itemId ? { ...it, parentId: newParentId } : it);
}

/**
 * Elimina un elemento sin afectar a sus submenús descendientes:
 * los hijos directos son promovidos al padre del elemento eliminado.
 */
export function deleteItemSafely(itemId: string, items: NavOrderItem[]): NavOrderItem[] {
    const target = items.find(i => i.id === itemId);
    if (!target) return items;

    const promotedParentId = target.parentId || null;

    return items
        .filter(i => i.id !== itemId)
        .map(i => i.parentId === itemId ? { ...i, parentId: promotedParentId } : i);
}

/**
 * Reordena un elemento en el array plano.
 */
export function moveItem(fromIdx: number, toIdx: number, items: NavOrderItem[]): NavOrderItem[] {
    if (fromIdx < 0 || fromIdx >= items.length || toIdx < 0 || toIdx >= items.length || fromIdx === toIdx) {
        return items;
    }

    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    return next;
}
