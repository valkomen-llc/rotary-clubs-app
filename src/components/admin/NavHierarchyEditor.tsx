// ════════════════════════════════════════════════════════════════════
// EDITOR VISUAL DE MENÚS JERÁRQUICOS Y SUBMENÚS — v4.1173.0
//
// Drag & Drop, selección accesible de padre, sangrías (indent/outdent),
// reordenamiento, prevención de referencias circulares, creación de submenús
// directa y vista previa en escritorio y móvil.
// ════════════════════════════════════════════════════════════════════

import React, { useState, useRef } from 'react';
import {
    GripVertical, ChevronUp, ChevronDown, Plus, Trash2,
    ExternalLink, Indent, Outdent, CornerDownRight,
    Eye, Monitor, Smartphone, AlertCircle, CheckCircle2,
    Palette, X, Link as LinkIcon, FolderTree, ChevronRight,
    Copy, Check, FileText, Globe
} from 'lucide-react';
import {
    NavOrderItem,
    SYSTEM_NAV_SECTIONS,
    MAX_NAV_LEVELS,
    getItemLevel,
    canSetParent,
    getValidParentCandidates,
    indentItem,
    outdentItem,
    reparentItem,
    deleteItemSafely,
    moveItem,
    buildNavTree,
    generateNavId,
    normalizeNavItems,
    validateNavUrl,
    isExternalUrl,
    isDocumentUrl,
    ensureExternalProtocol,
    resolveNavTarget,
} from '../../lib/navigation';

interface NavHierarchyEditorProps {
    items: NavOrderItem[];
    onChange: (items: NavOrderItem[]) => void;
    club?: any;
}

export const NavHierarchyEditor: React.FC<NavHierarchyEditorProps> = ({
    items,
    onChange,
    club,
}) => {
    // Normalizar elementos para asegurar IDs y estructura válida
    const normalizedItems = normalizeNavItems(items);

    // Estado de Drag & Drop
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const [dropMode, setDropMode] = useState<'above' | 'below' | 'inside' | null>(null);

    // Estado de copiado
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Estado de Vista Previa
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
    const [previewActiveDropdown, setPreviewActiveDropdown] = useState<string | null>(null);
    const [previewExpandedAccordions, setPreviewExpandedAccordions] = useState<Record<string, boolean>>({});

    // ── Drag & Drop Handlers ───────────────────────────────────────────
    const handleDragStart = (idx: number, e: React.DragEvent) => {
        setDraggedIdx(idx);
        e.dataTransfer.setData('text/plain', String(idx));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (idx: number, e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (draggedIdx === null || draggedIdx === idx) {
            setDragOverIdx(null);
            setDropMode(null);
            return;
        }

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        // Si se mueve sobre el tercio central y no es ciclo, ofrecer 'inside' (submenú)
        const targetItem = normalizedItems[idx];
        const draggedItem = normalizedItems[draggedIdx];
        const canBeChild = canSetParent(draggedItem.id, targetItem.id, normalizedItems).allowed;

        if (y < height * 0.28) {
            setDropMode('above');
        } else if (y > height * 0.72) {
            setDropMode('below');
        } else if (canBeChild) {
            setDropMode('inside');
        } else {
            setDropMode(y < height / 2 ? 'above' : 'below');
        }

        setDragOverIdx(idx);
    };

    const handleDragLeave = () => {
        setDragOverIdx(null);
        setDropMode(null);
    };

    const handleDrop = (targetIdx: number, e: React.DragEvent) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === targetIdx) {
            setDraggedIdx(null);
            setDragOverIdx(null);
            setDropMode(null);
            return;
        }

        const draggedItem = normalizedItems[draggedIdx];
        const targetItem = normalizedItems[targetIdx];

        if (dropMode === 'inside') {
            // Convertir en hijo del target
            const check = canSetParent(draggedItem.id, targetItem.id, normalizedItems);
            if (check.allowed) {
                // Reubicar debajo del target y asignar parentId
                let updated = reparentItem(draggedItem.id, targetItem.id, normalizedItems);
                // Si estaba antes, el índice no cambia; si estaba después, se inserta inmediatamente tras target
                const newDraggedIdx = updated.findIndex(i => i.id === draggedItem.id);
                const newTargetIdx = updated.findIndex(i => i.id === targetItem.id);
                updated = moveItem(newDraggedIdx, newTargetIdx + 1, updated);
                onChange(updated);
            }
        } else {
            // Reordenar por encima o por debajo
            let toIdx = targetIdx;
            if (dropMode === 'below') {
                toIdx = targetIdx > draggedIdx ? targetIdx : targetIdx + 1;
            } else if (dropMode === 'above') {
                toIdx = targetIdx < draggedIdx ? targetIdx : targetIdx - 1;
            }
            // Al mover arriba/abajo conservamos el parentId del elemento hermano si es conveniente
            const updated = moveItem(draggedIdx, Math.max(0, Math.min(normalizedItems.length - 1, toIdx)), normalizedItems);
            onChange(updated);
        }

        setDraggedIdx(null);
        setDragOverIdx(null);
        setDropMode(null);
    };

    // ── Helper Actions ────────────────────────────────────────────────
    const handleMove = (idx: number, dir: -1 | 1) => {
        const toIdx = idx + dir;
        if (toIdx < 0 || toIdx >= normalizedItems.length) return;
        onChange(moveItem(idx, toIdx, normalizedItems));
    };

    const handleIndent = (idx: number) => {
        onChange(indentItem(idx, normalizedItems));
    };

    const handleOutdent = (idx: number) => {
        onChange(outdentItem(idx, normalizedItems));
    };

    const handleParentChange = (itemId: string, newParentId: string | null) => {
        onChange(reparentItem(itemId, newParentId, normalizedItems));
    };

    const handleToggleEnabled = (idx: number) => {
        const updated = normalizedItems.map((it, i) =>
            i === idx ? { ...it, enabled: it.enabled === false } : it
        );
        onChange(updated);
    };

    const handleUpdateField = (idx: number, field: keyof NavOrderItem, value: any) => {
        const updated = normalizedItems.map((it, i) =>
            i === idx ? { ...it, [field]: value } : it
        );
        onChange(updated);
    };

    const handleDelete = (itemId: string) => {
        onChange(deleteItemSafely(itemId, normalizedItems));
    };

    const handleCopyUrl = async (id: string, url?: string) => {
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (e) {
            console.error('Clipboard copy error:', e);
        }
    };

    const handleTestUrl = (url?: string, external?: boolean) => {
        if (!url) return;
        const target = resolveNavTarget({ href: url, external });
        window.open(target.href, '_blank', 'noopener,noreferrer');
    };

    const handleFixProtocol = (idx: number) => {
        const item = normalizedItems[idx];
        if (!item.href) return;
        const fixedHref = ensureExternalProtocol(item.href);
        const updated = normalizedItems.map((it, i) =>
            i === idx ? {
                ...it,
                href: fixedHref,
                external: true,
                openInNewTab: it.openInNewTab !== false
            } : it
        );
        onChange(updated);
    };

    const handleAddRootCustom = (item?: { label: string; href: string }) => {
        const defaultHref = item?.href || '/';
        const isExt = isExternalUrl(defaultHref);
        const newItem: NavOrderItem = {
            id: generateNavId('custom'),
            kind: 'custom',
            label: item?.label || 'Nuevo Enlace',
            href: defaultHref,
            external: isExt,
            openInNewTab: isExt,
            enabled: true,
            parentId: null,
        };
        onChange([...normalizedItems, newItem]);
    };

    const handleAddSubmenu = (parentId: string) => {
        const newItem: NavOrderItem = {
            id: generateNavId('sub'),
            kind: 'custom',
            label: 'Nuevo Submenú',
            href: '',
            external: false,
            openInNewTab: false,
            enabled: true,
            parentId,
        };
        // Insertar inmediatamente después del último descendiente del padre
        const parentIdx = normalizedItems.findIndex(i => i.id === parentId);
        if (parentIdx === -1) {
            onChange([...normalizedItems, newItem]);
            return;
        }

        // Buscar el último ítem que sea hijo del mismo padre o subhijo
        let insertIdx = parentIdx + 1;
        while (
            insertIdx < normalizedItems.length &&
            getItemLevel(normalizedItems[insertIdx].id, normalizedItems) > getItemLevel(parentId, normalizedItems)
        ) {
            insertIdx++;
        }

        const next = [...normalizedItems];
        next.splice(insertIdx, 0, newItem);
        onChange(next);
    };

    // Árbol para vista previa
    const navTree = buildNavTree(normalizedItems.filter(i => i.enabled !== false));

    // Validaciones de enlaces incompletos y protocolos
    const validationWarnings: string[] = [];
    normalizedItems.forEach(it => {
        if (it.enabled !== false && it.kind === 'custom') {
            if (!it.label || it.label.trim() === '') {
                validationWarnings.push(`Existe un elemento con el texto del menú vacío.`);
            }
            const check = validateNavUrl(it.href, it.external);
            if (!check.isValid && check.warning) {
                validationWarnings.push(`"${it.label || 'Elemento'}": ${check.warning}`);
            } else if (check.missingProtocol && check.warning) {
                validationWarnings.push(`"${it.label || 'Elemento'}": ${check.warning}`);
            }
        }
    });

    const primaryColor = club?.colors?.primary || '#013388';

    return (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-6">
            {/* Header del módulo */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2.5">
                        <Palette className="w-5 h-5 text-rotary-blue" /> Gestor Visual de Menús Jerárquicos
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
                        Organiza la navegación de tu sitio. Arrastra elementos para reordenar, usa las flechas de sangría (<Indent className="w-3.5 h-3.5 inline text-indigo-600" /> / <Outdent className="w-3.5 h-3.5 inline text-indigo-600" />) para anidar submenús hasta 3 niveles, o define el menú padre con el selector accesible.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Botón Vista Previa */}
                    <button
                        type="button"
                        onClick={() => setPreviewOpen(true)}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3.5 py-2 rounded-xl transition-colors shadow-sm"
                        title="Ver cómo se desplegará el menú en escritorio y móvil"
                    >
                        <Eye className="w-4 h-4 text-rotary-blue" /> Vista Previa
                    </button>

                    {/* Añadir desde sección */}
                    <select
                        value=""
                        onChange={e => {
                            const sec = SYSTEM_NAV_SECTIONS.find(s => s.href === e.target.value);
                            if (sec) handleAddRootCustom({ label: sec.label, href: sec.href });
                            e.target.value = '';
                        }}
                        className="px-3 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue bg-white text-xs font-medium text-gray-700 cursor-pointer shadow-sm"
                    >
                        <option value="">+ Desde una sección…</option>
                        {SYSTEM_NAV_SECTIONS.map(s => (
                            <option key={s.href} value={s.href}>{s.label}</option>
                        ))}
                    </select>

                    {/* Crear enlace nuevo */}
                    <button
                        type="button"
                        onClick={() => handleAddRootCustom()}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-blue/90 px-3.5 py-2 rounded-xl transition-all shadow-sm shadow-blue-500/20"
                    >
                        <Plus className="w-4 h-4" /> Crear Enlace
                    </button>
                </div>
            </div>

            {/* Avisos de advertencia si los hay */}
            {validationWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-xs font-bold text-amber-900">Configuración incompleta en el menú:</p>
                        <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
                            {validationWarnings.map((w, i) => (
                                <li key={i}>{w}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Lista jerárquica interactiva */}
            <div className="space-y-2.5">
                {normalizedItems.map((item, idx) => {
                    const level = getItemLevel(item.id, normalizedItems);
                    const isSubmenu = level > 1;
                    const isDragOverThis = dragOverIdx === idx;
                    const canIndent = idx > 0 && getItemLevel(normalizedItems[idx - 1].id, normalizedItems) >= level && level < MAX_NAV_LEVELS;
                    const canOutdent = level > 1;
                    const parentCandidates = getValidParentCandidates(item.id, normalizedItems);

                    // Estilo de sangría según nivel
                    const indentClass = level === 1 ? 'ml-0' : level === 2 ? 'ml-5 sm:ml-9' : 'ml-10 sm:ml-18';
                    const borderLeftColor = level === 1 ? 'border-transparent' : level === 2 ? 'border-l-2 border-indigo-400' : 'border-l-2 border-violet-500';

                    // Clases dinámicas de drop zone
                    let dropRingClass = '';
                    if (isDragOverThis) {
                        if (dropMode === 'above') dropRingClass = 'ring-2 ring-blue-500 ring-offset-2 border-blue-400';
                        else if (dropMode === 'below') dropRingClass = 'ring-2 ring-blue-500 ring-offset-2 border-blue-400';
                        else if (dropMode === 'inside') dropRingClass = 'ring-2 ring-indigo-500 bg-indigo-50/50';
                    }

                    return (
                        <div
                            key={item.id}
                            draggable
                            onDragStart={e => handleDragStart(idx, e)}
                            onDragOver={e => handleDragOver(idx, e)}
                            onDragLeave={handleDragLeave}
                            onDrop={e => handleDrop(idx, e)}
                            className={`transition-all duration-150 ${indentClass}`}
                        >
                            <div
                                className={`flex items-stretch gap-2 p-2.5 sm:p-3 rounded-2xl border transition-all ${borderLeftColor} ${
                                    item.enabled === false
                                        ? 'border-gray-200 bg-gray-50/70 opacity-65'
                                        : 'border-gray-200 bg-white hover:border-blue-200 hover:shadow-sm'
                                } ${dropRingClass}`}
                            >
                                {/* Grip & Reordenar vertical (▲ ▼) */}
                                <div className="flex flex-col items-center justify-center text-gray-300 select-none pl-1">
                                    <div className="cursor-grab active:cursor-grabbing p-1 hover:text-gray-600 rounded" title="Arrastra para reordenar o convertir en submenú">
                                        <GripVertical className="w-4 h-4 text-gray-400" />
                                    </div>
                                    <div className="flex flex-col">
                                        <button
                                            type="button"
                                            onClick={() => handleMove(idx, -1)}
                                            disabled={idx === 0}
                                            className="p-0.5 hover:text-rotary-blue disabled:opacity-20 disabled:hover:text-gray-300"
                                            title="Subir posición"
                                        >
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleMove(idx, 1)}
                                            disabled={idx === normalizedItems.length - 1}
                                            className="p-0.5 hover:text-rotary-blue disabled:opacity-20 disabled:hover:text-gray-300"
                                            title="Bajar posición"
                                        >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Checkbox Activar / Desactivar */}
                                <label className="flex items-center px-1 cursor-pointer" title={item.enabled === false ? 'Activar menú' : 'Desactivar menú'}>
                                    <input
                                        type="checkbox"
                                        checked={item.enabled !== false}
                                        onChange={() => handleToggleEnabled(idx)}
                                        className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue cursor-pointer"
                                    />
                                </label>

                                {/* Indicador visual de jerarquía */}
                                <div className="flex items-center pl-0.5 pr-1">
                                    {level === 1 ? (
                                        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 whitespace-nowrap">
                                            Principal
                                        </span>
                                    ) : level === 2 ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 whitespace-nowrap">
                                            <CornerDownRight className="w-3 h-3 text-indigo-500" /> Submenú
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200/60 whitespace-nowrap">
                                            <CornerDownRight className="w-3 h-3 text-violet-500" /> Nivel 3
                                        </span>
                                    )}
                                </div>

                                {/* Contenido del elemento */}
                                {/* Contenido del elemento */}
                                {item.kind === 'fixed' ? (
                                    <div className="flex-1 flex items-center justify-between gap-3 px-2 flex-wrap min-w-0">
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-[13px] font-bold text-gray-800">{item.label}</span>
                                            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                Sección fija
                                            </span>
                                        </div>
                                    </div>
                                ) : (() => {
                                    const urlCheck = validateNavUrl(item.href, item.external);
                                    const isDoc = isDocumentUrl(item.href);
                                    const isExt = item.external || isExternalUrl(item.href);

                                    return (
                                        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                                            {/* Fila principal de campos de edición */}
                                            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 min-w-0">
                                                {/* Texto del menú (~26% del ancho editable en desktop) */}
                                                <div className="w-full lg:w-[26%] lg:min-w-[130px] flex-shrink-0">
                                                    <input
                                                        type="text"
                                                        value={item.label || ''}
                                                        onChange={e => handleUpdateField(idx, 'label', e.target.value)}
                                                        placeholder="Texto del menú"
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue text-xs font-bold text-gray-800 bg-white shadow-sm"
                                                    />
                                                </div>

                                                {/* URL o destino (45% - 55% del ancho editable en desktop) */}
                                                <div className="flex-1 min-w-0 relative flex items-center group">
                                                    {/* Icono inteligente de tipo de URL */}
                                                    <div
                                                        className="absolute left-2.5 z-10 flex items-center pointer-events-none"
                                                        title={isDoc ? 'Documento PDF o archivo descargable' : isExt ? 'Enlace externo' : 'Ruta interna'}
                                                    >
                                                        {isDoc ? (
                                                            <FileText className="w-3.5 h-3.5 text-rose-500" />
                                                        ) : isExt ? (
                                                            <Globe className="w-3.5 h-3.5 text-sky-600" />
                                                        ) : (
                                                            <LinkIcon className="w-3.5 h-3.5 text-gray-400" />
                                                        )}
                                                    </div>

                                                    {/* Campo de texto URL amplio y adaptable */}
                                                    <input
                                                        type="text"
                                                        value={item.href || ''}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            const autoExt = isExternalUrl(val);
                                                            const updated = normalizedItems.map((it, i) =>
                                                                i === idx ? {
                                                                    ...it,
                                                                    href: val,
                                                                    ...(autoExt && !it.external ? { external: true, openInNewTab: true } : {})
                                                                } : it
                                                            );
                                                            onChange(updated);
                                                        }}
                                                        placeholder="/ruta o https://... (PDF, AWS S3)"
                                                        title={item.href ? `URL completa (${item.href.length} car.):\n${item.href}` : ''}
                                                        className={`w-full pl-8 pr-24 py-2 border rounded-xl outline-none text-xs font-mono transition-all bg-white shadow-sm ${
                                                            urlCheck.isDangerous
                                                                ? 'border-red-300 text-red-700 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                                                                : urlCheck.missingProtocol
                                                                ? 'border-amber-300 text-amber-900 bg-amber-50/20 focus:ring-2 focus:ring-amber-400'
                                                                : 'border-gray-200 text-blue-600 focus:ring-2 focus:ring-rotary-blue'
                                                        }`}
                                                    />

                                                    {/* Botones de acción integrados en el campo URL */}
                                                    <div className="absolute right-1.5 flex items-center gap-0.5 bg-white/90 backdrop-blur-sm px-1 py-0.5 rounded-lg border border-gray-100 shadow-sm">
                                                        {/* Corrección rápida de protocolo */}
                                                        {urlCheck.missingProtocol && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleFixProtocol(idx)}
                                                                className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded transition-colors mr-0.5"
                                                                title="Añadir https:// automáticamente"
                                                            >
                                                                +https://
                                                            </button>
                                                        )}

                                                        {/* Botón Copiar enlace */}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopyUrl(item.id, item.href)}
                                                            disabled={!item.href}
                                                            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded transition-colors"
                                                            title={copiedId === item.id ? '¡Enlace copiado!' : 'Copiar enlace al portapapeles'}
                                                        >
                                                            {copiedId === item.id ? (
                                                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                            ) : (
                                                                <Copy className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>

                                                        {/* Botón Probar enlace en nueva pestaña */}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTestUrl(item.href, item.external)}
                                                            disabled={!item.href || urlCheck.isDangerous}
                                                            className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 rounded transition-colors"
                                                            title="Probar enlace en una pestaña nueva"
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Opciones de destino y pestaña */}
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    {/* Checkbox Externo */}
                                                    <label
                                                        className={`flex items-center gap-1 px-2.5 py-2 border rounded-xl cursor-pointer text-[11px] font-semibold select-none whitespace-nowrap transition-colors shadow-sm ${
                                                            item.external
                                                                ? 'bg-sky-50 text-sky-800 border-sky-200'
                                                                : 'bg-gray-50/80 text-gray-600 border-gray-200 hover:bg-gray-100'
                                                        }`}
                                                        title="Marca el enlace como externo para conservar la dirección original sin anteponer el dominio del sitio"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={!!item.external}
                                                            onChange={e => {
                                                                const checked = e.target.checked;
                                                                const updated = normalizedItems.map((it, i) =>
                                                                    i === idx ? {
                                                                        ...it,
                                                                        external: checked,
                                                                        openInNewTab: checked ? (it.openInNewTab !== false) : false
                                                                    } : it
                                                                );
                                                                onChange(updated);
                                                            }}
                                                            className="w-3.5 h-3.5 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue"
                                                        />
                                                        <span>Externo</span>
                                                    </label>

                                                    {/* Checkbox Nueva Pestaña */}
                                                    <label
                                                        className={`flex items-center gap-1 px-2 py-2 border rounded-xl cursor-pointer text-[11px] font-semibold select-none whitespace-nowrap transition-colors shadow-sm ${
                                                            item.openInNewTab !== false && (item.openInNewTab || item.external)
                                                                ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                                                : 'bg-gray-50/80 text-gray-600 border-gray-200 hover:bg-gray-100'
                                                        }`}
                                                        title="Abrir enlace en una pestaña nueva (target='_blank')"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={item.openInNewTab !== false && (item.openInNewTab || item.external)}
                                                            onChange={e => handleUpdateField(idx, 'openInNewTab', e.target.checked)}
                                                            className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-600"
                                                        />
                                                        <span className="hidden xl:inline">Nueva pestaña</span>
                                                        <ExternalLink className="w-3 h-3 text-gray-400 xl:hidden" />
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Advertencia contextual si hay problema con la URL */}
                                            {item.enabled !== false && urlCheck.warning && (
                                                <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg px-2.5 py-1">
                                                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                                    <span>{urlCheck.warning}</span>
                                                    {urlCheck.missingProtocol && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleFixProtocol(idx)}
                                                            className="underline font-bold text-amber-900 hover:text-amber-950 ml-1 cursor-pointer"
                                                        >
                                                            Corregir añadiendo https://
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {/* Selector de padre móvil/tablet */}
                                            <div className="lg:hidden flex items-center gap-2 pt-1 text-[11px] text-gray-500">
                                                <span>Elemento padre:</span>
                                                <select
                                                    value={item.parentId || ''}
                                                    onChange={e => handleParentChange(item.id, e.target.value || null)}
                                                    className="flex-1 text-[11px] font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none"
                                                >
                                                    <option value="">— Menú principal (Nivel 1) —</option>
                                                    {parentCandidates.map(c => (
                                                        <option key={c.id} value={c.id}>
                                                            ↳ {c.label} ({c.level === 1 ? 'N1' : 'N2'})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Selector accesible de elemento padre en pantallas grandes */}
                                <div className="hidden lg:flex items-center flex-shrink-0">
                                    <select
                                        value={item.parentId || ''}
                                        onChange={e => handleParentChange(item.id, e.target.value || null)}
                                        className="max-w-[160px] xl:max-w-[185px] truncate text-[11px] font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 outline-none focus:ring-2 focus:ring-rotary-blue shadow-sm"
                                        title="Seleccionar elemento padre"
                                    >
                                        <option value="">— Principal (Nivel 1) —</option>
                                        {parentCandidates.map(c => (
                                            <option key={c.id} value={c.id}>
                                                ↳ {c.label} ({c.level === 1 ? 'N1' : 'N2'})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Botones accesibles de sangría (Indent / Outdent) */}
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleOutdent(idx)}
                                        disabled={!canOutdent}
                                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                                        title="Quitar sangría / Subir nivel (←)"
                                    >
                                        <Outdent className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleIndent(idx)}
                                        disabled={!canIndent}
                                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                                        title="Sangría / Convertir en submenú del elemento anterior (→)"
                                    >
                                        <Indent className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                {/* Botón crear submenú directo (si nivel < 3) */}
                                {level < MAX_NAV_LEVELS && (
                                    <button
                                        type="button"
                                        onClick={() => handleAddSubmenu(item.id)}
                                        className="hidden sm:flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 px-2.5 py-2 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
                                        title="Crear un nuevo submenú dentro de este elemento"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Submenú
                                    </button>
                                )}

                                {/* Eliminar elemento */}
                                <div className="flex items-center flex-shrink-0">
                                    {item.kind === 'custom' ? (
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(item.id)}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Eliminar elemento (los submenús serán promovidos de nivel para no perderse)"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <span className="w-8" />
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal de Vista Previa Antes de Publicar */}
            {previewOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
                        {/* Cabecera del modal */}
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 text-rotary-blue rounded-xl">
                                    <Eye className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-gray-900">Vista Previa del Menú de Navegación</h4>
                                    <p className="text-xs text-gray-500">Prueba la interacción de submenús antes de guardar</p>
                                </div>
                            </div>

                            {/* Selector Escritorio / Móvil */}
                            <div className="flex items-center gap-1 bg-gray-200/70 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode('desktop')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        previewMode === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <Monitor className="w-3.5 h-3.5" /> Escritorio
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode('mobile')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        previewMode === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <Smartphone className="w-3.5 h-3.5" /> Móvil
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setPreviewOpen(false)}
                                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Contenido interactivo según el modo */}
                        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 min-h-[350px] flex items-center justify-center">
                            {previewMode === 'desktop' ? (
                                <div className="w-full max-w-3xl bg-white rounded-2xl shadow-md border border-gray-200 overflow-visible p-4">
                                    <div className="border-b border-gray-100 pb-3 mb-4 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-rotary-blue font-bold text-xs">
                                                RC
                                            </div>
                                            <span className="font-bold text-sm text-gray-800">{club?.name || 'Sitio Rotario'}</span>
                                        </div>
                                        <span className="text-[11px] text-gray-400">Barra de Navegación de Escritorio</span>
                                    </div>

                                    {/* Menú de Escritorio Simulado */}
                                    <nav className="flex items-center space-x-6 relative">
                                        {navTree.map(item => {
                                            const hasChildren = item.children && item.children.length > 0;
                                            const isOpen = previewActiveDropdown === item.id;

                                            if (!hasChildren) {
                                                return (
                                                    <span
                                                        key={item.id}
                                                        className="text-gray-700 hover:text-rotary-blue font-medium text-sm transition-colors cursor-pointer"
                                                    >
                                                        {item.label}
                                                    </span>
                                                );
                                            }

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="relative"
                                                    onMouseEnter={() => setPreviewActiveDropdown(item.id)}
                                                    onMouseLeave={() => setPreviewActiveDropdown(null)}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewActiveDropdown(isOpen ? null : item.id)}
                                                        className="flex items-center gap-1 text-gray-700 hover:text-rotary-blue font-medium text-sm transition-colors py-1 cursor-pointer"
                                                    >
                                                        <span>{item.label}</span>
                                                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-rotary-blue' : 'text-gray-400'}`} />
                                                    </button>

                                                    {/* Dropdown flotante */}
                                                    {isOpen && (
                                                        <div className="absolute top-full left-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                                                            {item.children.map(child => {
                                                                const hasGrandChildren = child.children && child.children.length > 0;
                                                                return (
                                                                    <div key={child.id} className="relative group/sub">
                                                                        <div className="flex items-center justify-between px-4 py-2.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-rotary-blue transition-colors cursor-pointer font-medium">
                                                                            <span>{child.label}</span>
                                                                            {child.external && <ExternalLink className="w-3 h-3 text-gray-400 ml-1" />}
                                                                            {hasGrandChildren && <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-auto" />}
                                                                        </div>

                                                                        {/* Sub-submenú Nivel 3 en flyout */}
                                                                        {hasGrandChildren && (
                                                                            <div className="hidden group-hover/sub:block absolute left-full top-0 ml-1 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
                                                                                {child.children.map(grandChild => (
                                                                                    <div
                                                                                        key={grandChild.id}
                                                                                        className="px-4 py-2.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-rotary-blue transition-colors cursor-pointer font-medium flex items-center justify-between"
                                                                                    >
                                                                                        <span>{grandChild.label}</span>
                                                                                        {grandChild.external && <ExternalLink className="w-3 h-3 text-gray-400 ml-1" />}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </nav>
                                </div>
                            ) : (
                                /* Vista Móvil Simulada */
                                <div className="w-[320px] bg-white rounded-3xl shadow-xl border-4 border-gray-800 overflow-hidden flex flex-col">
                                    {/* Notch móvil */}
                                    <div className="bg-gray-800 h-6 flex items-center justify-center">
                                        <div className="w-16 h-2 bg-gray-700 rounded-full" />
                                    </div>

                                    {/* Cabecera móvil */}
                                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
                                        <span className="font-bold text-xs text-gray-800">{club?.name || 'Club Rotario'}</span>
                                        <div className="w-6 h-6 flex flex-col justify-center gap-1 cursor-pointer">
                                            <div className="h-0.5 bg-gray-600 rounded" />
                                            <div className="h-0.5 bg-gray-600 rounded" />
                                            <div className="h-0.5 bg-gray-600 rounded" />
                                        </div>
                                    </div>

                                    {/* Acordeón Móvil */}
                                    <div className="p-4 space-y-1.5 max-h-[380px] overflow-y-auto">
                                        {navTree.map(item => {
                                            const hasChildren = item.children && item.children.length > 0;
                                            const isExpanded = !!previewExpandedAccordions[item.id];

                                            if (!hasChildren) {
                                                return (
                                                    <div key={item.id} className="py-2 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-xl cursor-pointer">
                                                        {item.label}
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={item.id} className="rounded-xl border border-gray-100 overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewExpandedAccordions(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                                        className="w-full flex items-center justify-between p-2.5 text-xs font-bold text-gray-800 hover:bg-gray-50 transition-colors"
                                                    >
                                                        <span>{item.label}</span>
                                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-rotary-blue' : ''}`} />
                                                    </button>

                                                    {/* Despliegue Acordeón Móvil */}
                                                    {isExpanded && (
                                                        <div className="bg-gray-50/80 px-3 py-2 space-y-1 border-t border-gray-100">
                                                            {item.children.map(child => {
                                                                const hasGrandChildren = child.children && child.children.length > 0;
                                                                const isChildExpanded = !!previewExpandedAccordions[child.id];

                                                                if (!hasGrandChildren) {
                                                                    return (
                                                                        <div key={child.id} className="py-1.5 px-2 text-xs font-medium text-gray-600 hover:text-rotary-blue cursor-pointer flex items-center justify-between">
                                                                            <span>{child.label}</span>
                                                                            {child.external && <ExternalLink className="w-3 h-3 text-gray-400" />}
                                                                        </div>
                                                                    );
                                                                }

                                                                return (
                                                                    <div key={child.id} className="space-y-1 pl-1">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setPreviewExpandedAccordions(prev => ({ ...prev, [child.id]: !prev[child.id] }))}
                                                                            className="w-full flex items-center justify-between py-1.5 px-2 text-xs font-semibold text-gray-700 hover:text-rotary-blue"
                                                                        >
                                                                            <span>{child.label}</span>
                                                                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isChildExpanded ? 'rotate-180' : ''}`} />
                                                                        </button>
                                                                        {isChildExpanded && (
                                                                            <div className="pl-3 border-l-2 border-indigo-200 space-y-1 py-1">
                                                                                {child.children.map(grandChild => (
                                                                                    <div key={grandChild.id} className="py-1 px-2 text-[11px] font-medium text-gray-600 hover:text-rotary-blue cursor-pointer flex items-center justify-between">
                                                                                        <span>{grandChild.label}</span>
                                                                                        {grandChild.external && <ExternalLink className="w-3 h-3 text-gray-400" />}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Pie del modal */}
                        <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-between">
                            <span className="text-xs text-gray-500">
                                {navTree.length} elementos principales · {normalizedItems.filter(i => (getItemLevel(i.id, normalizedItems) > 1) && i.enabled !== false).length} submenús activos
                            </span>
                            <button
                                type="button"
                                onClick={() => setPreviewOpen(false)}
                                className="px-5 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                            >
                                Cerrar Vista Previa
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NavHierarchyEditor;
