// ════════════════════════════════════════════════════════════════════
// Editor de Widgets y Contenido Complementario del Evento — v4.1207.0
// Carrusel de la imagen lateral — v4.1273.0
//
// Permite configurar componentes laterales por evento:
// - Imagen lateral del evento (afiche oficial, código de vestuario, etc.)
//   que desde v4.1273.0 admite VARIAS imágenes y se publica como carrusel.
// - Subida múltiple desde el equipo (JPG, PNG, WebP), selección múltiple de
//   la Biblioteca Multimedia o URL externa.
// - Miniaturas reordenables (arrastrar y soltar, o flechas para teclado y
//   pantallas táctiles), reemplazo y eliminación individual.
// - Cada imagen conserva su alt, su enlace, su destino y si se muestra.
// - «Configuración del carrusel» guardada por evento.
// - Vista previa con EL MISMO componente que el sitio público.
// - El interruptor «Visualización activa» sigue gobernando TODO el widget.
//
// Los datos viven en metadata.widgets.sidebarImage (ver src/lib/eventWidgets.ts
// y docs/claude/carrusel-de-la-imagen-lateral-del-evento.md).
// ════════════════════════════════════════════════════════════════════
import React, { useRef, useState } from 'react';
import {
    Image as ImageIcon,
    Upload,
    FolderOpen,
    Trash2,
    Eye,
    EyeOff,
    ExternalLink,
    Link2,
    Type,
    Sparkles,
    AlertCircle,
    Layers,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    GripVertical,
    Plus,
    RefreshCw,
    SlidersHorizontal,
    RotateCcw,
} from 'lucide-react';
import MediaPicker from '../content-studio/MediaPicker';
import EventSidebarImageCarousel from '../../EventSidebarImageCarousel';
import { leerJson } from '../../../lib/leerJson';
import {
    CAROUSEL_LIMITS,
    DEFAULT_CAROUSEL_SETTINGS,
    draftSidebarImageWidget,
    newSlideId,
    normalizeSidebarImageWidget,
    sanitizeImageUrl,
    serializeSidebarImageWidget,
    visibleSidebarSlides,
    type EventSidebarCarouselSettings,
    type EventSidebarImageSlide,
    type EventSidebarImageWidget,
    type EventWidgetsConfig,
} from '../../../lib/eventWidgets';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const isValidImageFile = (file: File) =>
    VALID_IMAGE_TYPES.includes(file.type.toLowerCase()) || /\.(jpe?g|png|webp)$/i.test(file.name);

/** Opciones de «Tiempo entre imágenes» (segundos). */
const INTERVAL_OPTIONS_MS = [2000, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 12000, 15000, 20000, 30000];
/** Opciones de «Duración de transición» (milisegundos). */
const TRANSITION_OPTIONS_MS = [200, 300, 400, 500, 600, 800, 1000, 1500, 2000];

const withCurrent = (options: number[], current: number) =>
    options.includes(current) ? options : [...options, current].sort((a, b) => a - b);

const fileNameOf = (url: string) => {
    if (/^data:/i.test(url || '')) return 'Imagen incrustada';
    const last = (url || '').split('?')[0].split('/').pop() || '';
    try { return decodeURIComponent(last) || 'Imagen'; } catch { return last || 'Imagen'; }
};

/** Sube UN archivo con el mismo endpoint que el resto de imágenes del evento. */
const uploadEventImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    const token = localStorage.getItem('rotary_token');
    const res = await fetch(`${API}/calendar/events/upload-image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    });
    const { data } = await leerJson<{ url?: string; error?: string }>(res);
    if (!res.ok) throw new Error(data?.error || `Error al subir la imagen (HTTP ${res.status})`);
    if (!data?.url) throw new Error('Respuesta inválida del servidor');
    return data.url;
};

// ── Piezas de interfaz (declaradas fuera del editor: nunca un componente dentro de otro) ──

const ToggleSwitch: React.FC<{
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    size?: 'md' | 'sm';
}> = ({ checked, onChange, label, size = 'md' }) => {
    const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
    const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
    const shift = size === 'sm' ? 'translate-x-4' : 'translate-x-5';
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex ${track} shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-rotary-blue focus:ring-offset-2 ${
                checked ? 'bg-rotary-blue' : 'bg-gray-200'
            }`}
        >
            <span
                className={`pointer-events-none inline-block ${knob} transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    checked ? shift : 'translate-x-0'
                }`}
            />
        </button>
    );
};

const SettingToggleRow: React.FC<{
    label: string;
    hint: string;
    checked: boolean;
    onChange: (next: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
    <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-200 bg-white">
        <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800">{label}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
        </div>
        <ToggleSwitch checked={checked} onChange={onChange} label={label} size="sm" />
    </div>
);

const SlideThumbnail: React.FC<{
    slide: EventSidebarImageSlide;
    index: number;
    total: number;
    selected: boolean;
    inPreview: boolean;
    dragOver: boolean;
    onSelect: () => void;
    onMove: (delta: number) => void;
    onRemove: () => void;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
}> = ({
    slide, index, total, selected, inPreview, dragOver,
    onSelect, onMove, onRemove, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}) => {
    const validUrl = sanitizeImageUrl(slide.imageUrl);
    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            className={`group relative rounded-xl border-2 bg-gray-50 overflow-hidden transition-all ${
                selected ? 'border-rotary-blue shadow-md' : 'border-gray-200 hover:border-gray-300'
            } ${dragOver ? 'ring-2 ring-offset-2 ring-blue-300' : ''}`}
        >
            <button
                type="button"
                onClick={onSelect}
                aria-label={`Editar la imagen ${index + 1} de ${total}`}
                aria-pressed={selected}
                className="block w-full aspect-[4/5] bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue focus-visible:ring-inset"
            >
                {validUrl ? (
                    <img
                        src={validUrl}
                        alt={slide.altText || `Imagen ${index + 1}`}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className={`w-full h-full object-contain ${slide.enabled ? '' : 'opacity-40 grayscale'}`}
                    />
                ) : (
                    <span className="flex h-full w-full items-center justify-center text-gray-300">
                        <ImageIcon className="w-6 h-6" />
                    </span>
                )}
            </button>

            {/* Número de orden + asa de arrastre */}
            <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                <GripVertical className="w-3 h-3 opacity-80" />
                {index + 1}
            </span>

            {!slide.enabled && (
                <span className="pointer-events-none absolute top-1.5 right-1.5 flex items-center gap-1 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    <EyeOff className="w-3 h-3" /> Inactiva
                </span>
            )}
            {slide.enabled && inPreview && (
                <span className="pointer-events-none absolute top-1.5 right-1.5 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    En vista
                </span>
            )}

            {/* Acciones rápidas: mover y eliminar (alternativa al arrastre en táctil y teclado) */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1.5 pt-4">
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => onMove(-1)}
                        disabled={index === 0}
                        aria-label={`Mover la imagen ${index + 1} antes`}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onMove(1)}
                        disabled={index === total - 1}
                        aria-label={`Mover la imagen ${index + 1} después`}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={`Eliminar la imagen ${index + 1}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-red-600 hover:bg-red-50"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};

interface Props {
    /** Objeto de widgets del evento (de metadata.widgets). */
    widgets?: EventWidgetsConfig | null;
    /** Título del evento para sugerencias y contexto. */
    eventTitle?: string;
    /** Notifica los cambios al editor padre del evento. */
    onChange: (widgets: EventWidgetsConfig) => void;
}

const EventWidgetsEditor: React.FC<Props> = ({
    widgets: rawWidgets,
    eventTitle,
    onChange,
}) => {
    const widgets: EventWidgetsConfig = rawWidgets && typeof rawWidgets === 'object' ? rawWidgets : {};
    // Un widget heredado de una sola imagen llega aquí migrado a una lista de una.
    const sidebarImage: EventSidebarImageWidget = draftSidebarImageWidget(widgets.sidebarImage);
    const images = sidebarImage.images || [];
    const carousel: EventSidebarCarouselSettings = sidebarImage.carousel || DEFAULT_CAROUSEL_SETTINGS;

    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerMode, setPickerMode] = useState<'add' | 'replace'>('add');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [activeInputTab, setActiveInputTab] = useState<'upload' | 'url'>('upload');
    const [externalUrl, setExternalUrl] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [fileDragActive, setFileDragActive] = useState(false);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewRequest, setPreviewRequest] = useState<{ index: number; nonce: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    // Último estado conocido: las subidas son asíncronas y no deben pisar lo
    // que se editó mientras tanto.
    const latestRef = useRef<{ widgets: EventWidgetsConfig; draft: EventSidebarImageWidget; onChange: Props['onChange'] }>({ widgets, draft: sidebarImage, onChange });
    latestRef.current = { widgets, draft: sidebarImage, onChange };

    const selected = images.find(img => img.id === selectedId) || images[0] || null;
    const selectedIndex = selected ? images.findIndex(img => img.id === selected.id) : -1;
    const remainingSlots = Math.max(0, CAROUSEL_LIMITS.maxImages - images.length);

    // Lo que verá el sitio público (mismas reglas: URL válida e imagen activa).
    const previewWidget = normalizeSidebarImageWidget(serializeSidebarImageWidget(sidebarImage));
    const previewSlides = visibleSidebarSlides(previewWidget);
    const previewActiveSlide = previewSlides[Math.min(previewIndex, Math.max(0, previewSlides.length - 1))];
    const hasImage = previewSlides.length > 0;
    const hasAnyImage = images.some(img => img.imageUrl.trim().length > 0);

    const commit = (patch: Partial<EventSidebarImageWidget>) => {
        const { widgets: w, draft, onChange: notify } = latestRef.current;
        const next = serializeSidebarImageWidget({ ...draft, ...patch });
        latestRef.current = { widgets: { ...w, sidebarImage: next }, draft: { ...draft, ...patch }, onChange: notify };
        // El onChange MÁS RECIENTE: tras una subida asíncrona, el del render
        // en que empezó tendría una metadata del evento ya vieja.
        notify({ ...w, sidebarImage: next });
    };

    const commitImages = (nextImages: EventSidebarImageSlide[]) => commit({ images: nextImages });

    const updateSlide = (id: string, patch: Partial<EventSidebarImageSlide>) => {
        const current = latestRef.current.draft.images || [];
        commitImages(current.map(img => (img.id === id ? { ...img, ...patch } : img)));
    };

    const updateCarousel = (patch: Partial<EventSidebarCarouselSettings>) => {
        commit({ carousel: { ...(latestRef.current.draft.carousel || DEFAULT_CAROUSEL_SETTINGS), ...patch } });
    };

    const appendUrls = (urls: string[]) => {
        if (urls.length === 0) return;
        const current = latestRef.current.draft.images || [];
        const room = Math.max(0, CAROUSEL_LIMITS.maxImages - current.length);
        const added: EventSidebarImageSlide[] = urls.slice(0, room).map(url => ({
            id: newSlideId(),
            imageUrl: url,
            altText: '',
            linkUrl: '',
            openInNewTab: false,
            enabled: true,
        }));
        if (added.length === 0) {
            setUploadError(`El carrusel admite hasta ${CAROUSEL_LIMITS.maxImages} imágenes.`);
            return;
        }
        // Agregar una imagen activa el widget por comodidad (igual que antes).
        commit({ images: [...current, ...added], enabled: true });
        setSelectedId(added[0].id);
        if (urls.length > added.length) {
            setUploadError(`Se agregaron ${added.length}; el carrusel admite hasta ${CAROUSEL_LIMITS.maxImages} imágenes.`);
        }
    };

    const handleFilesUpload = async (fileList: FileList | File[]) => {
        const files = Array.from(fileList);
        if (files.length === 0) return;
        const valid = files.filter(isValidImageFile);
        const rejected = files.length - valid.length;
        const room = Math.max(0, CAROUSEL_LIMITS.maxImages - (latestRef.current.draft.images || []).length);
        const toUpload = valid.slice(0, room);

        setUploadError(null);
        if (toUpload.length === 0) {
            setUploadError(valid.length === 0
                ? 'Formato no admitido. Selecciona imágenes JPG, PNG o WebP.'
                : `El carrusel admite hasta ${CAROUSEL_LIMITS.maxImages} imágenes.`);
            return;
        }

        setUploading(true);
        setUploadProgress({ done: 0, total: toUpload.length });
        const urls: string[] = [];
        const failures: string[] = [];
        // De una en una: el endpoint recibe un archivo por petición y así el
        // orden de las imágenes es el orden en que se eligieron.
        for (const file of toUpload) {
            try {
                urls.push(await uploadEventImage(file));
            } catch (err: any) {
                failures.push(`${file.name}: ${err?.message || 'error al subir'}`);
            }
            setUploadProgress(p => (p ? { ...p, done: p.done + 1 } : p));
        }
        appendUrls(urls);

        const notes: string[] = [];
        if (rejected > 0) notes.push(`${rejected} archivo(s) con formato no admitido (sólo JPG, PNG o WebP).`);
        if (valid.length > toUpload.length) notes.push(`Se omitieron ${valid.length - toUpload.length}: el carrusel admite hasta ${CAROUSEL_LIMITS.maxImages} imágenes.`);
        if (failures.length > 0) notes.push(`No se pudieron subir: ${failures.join(' · ')}`);
        if (notes.length > 0) setUploadError(notes.join(' '));

        setUploading(false);
        setUploadProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleReplaceUpload = async (file: File) => {
        if (!selected) return;
        const targetId = selected.id;
        if (!isValidImageFile(file)) {
            setUploadError('Formato no admitido. Selecciona una imagen JPG, PNG o WebP.');
            return;
        }
        setUploadError(null);
        setUploading(true);
        setUploadProgress({ done: 0, total: 1 });
        try {
            const url = await uploadEventImage(file);
            updateSlide(targetId, { imageUrl: url });
        } catch (err: any) {
            setUploadError(err?.message || 'No pudimos subir la imagen. Inténtalo de nuevo.');
        } finally {
            setUploading(false);
            setUploadProgress(null);
            if (replaceInputRef.current) replaceInputRef.current.value = '';
        }
    };

    const addExternalUrl = () => {
        const url = sanitizeImageUrl(externalUrl);
        if (!url) {
            setUploadError('La dirección no es una imagen válida. Debe comenzar con https://');
            return;
        }
        setUploadError(null);
        appendUrls([url]);
        setExternalUrl('');
    };

    const removeSlide = (id: string) => {
        const current = latestRef.current.draft.images || [];
        const idx = current.findIndex(img => img.id === id);
        const next = current.filter(img => img.id !== id);
        commitImages(next);
        if (selectedId === id || (!selectedId && idx === 0)) {
            setSelectedId(next[Math.min(idx, next.length - 1)]?.id || null);
        }
    };

    const moveSlide = (fromId: string, toIndex: number) => {
        const current = [...(latestRef.current.draft.images || [])];
        const from = current.findIndex(img => img.id === fromId);
        if (from < 0) return;
        const target = Math.max(0, Math.min(current.length - 1, toIndex));
        if (target === from) return;
        const [moved] = current.splice(from, 1);
        current.splice(target, 0, moved);
        commitImages(current);
    };

    const selectSlide = (slide: EventSidebarImageSlide) => {
        setSelectedId(slide.id);
        const visibleIdx = previewSlides.findIndex(s => s.id === slide.id);
        if (visibleIdx >= 0) setPreviewRequest({ index: visibleIdx, nonce: Date.now() });
    };

    const openPicker = (mode: 'add' | 'replace') => {
        setPickerMode(mode);
        setPickerOpen(true);
    };

    const onUploadZoneDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setFileDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFilesUpload(e.dataTransfer.files);
        }
    };

    const previewLabel = previewSlides.length > 1
        ? `${previewSlides.length} imágenes · ${carousel.transition === 'slide' ? 'deslizamiento' : 'desvanecimiento'}`
        : 'Ajuste 100% automático';

    return (
        <div className="space-y-8">
            {/* Encabezado de la sección */}
            <div className="border-b border-gray-200/80 pb-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-rotary-blue border border-blue-100">
                                <Layers className="h-5 w-5" />
                            </span>
                            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
                                Widgets y contenido complementario
                            </h2>
                        </div>
                        <p className="mt-1 text-sm text-gray-500 max-w-2xl">
                            Configura componentes visuales y bloques interactivos que se muestran en la columna lateral de la página de detalles del evento.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                            hasImage && sidebarImage.enabled
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}>
                            {hasImage && sidebarImage.enabled ? (
                                <>
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                    {previewSlides.length > 1
                                        ? `Carrusel activo · ${previewSlides.length} imágenes`
                                        : 'Imagen lateral activa'}
                                </>
                            ) : (
                                <>
                                    <span className="h-2 w-2 rounded-full bg-gray-400" />
                                    Imagen lateral inactiva
                                </>
                            )}
                        </span>
                    </div>
                </div>
            </div>

            {/* Tarjeta principal: Imagen lateral del evento */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-all duration-200 hover:border-gray-300">
                {/* Cabecera de la tarjeta */}
                <div className="p-6 bg-gradient-to-r from-gray-50/80 via-white to-gray-50/50 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                            <ImageIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900 flex flex-wrap items-center gap-2">
                                Imagen lateral del evento
                                <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-medium border border-blue-100">
                                    Columna derecha · Debajo del mapa
                                </span>
                            </h3>
                            <p className="mt-0.5 text-xs text-gray-500">
                                Ubicada inmediatamente debajo del mapa de la sede. Ideal para afiches oficiales, código de vestuario, patrocinadores o material promocional vertical. Con varias imágenes se muestra como carrusel.
                            </p>
                        </div>
                    </div>

                    {/* Interruptor de activación / desactivación de TODO el widget */}
                    <div className="flex items-center gap-3 shrink-0 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-xs">
                        <span className="text-xs font-medium text-gray-700">
                            {sidebarImage.enabled ? 'Visualización activa' : 'Visualización pausada'}
                        </span>
                        <ToggleSwitch
                            checked={sidebarImage.enabled}
                            onChange={next => commit({ enabled: next })}
                            label="Visualización activa del widget"
                        />
                    </div>
                </div>

                {/* Contenido del editor */}
                <div className="p-6 space-y-6">
                    {/* Alerta si está desactivado pero tiene imagen */}
                    {hasAnyImage && !sidebarImage.enabled && (
                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                            <span>Las imágenes están cargadas pero la visualización está pausada. Activa el interruptor para que se muestren en la página pública del evento.</span>
                        </div>
                    )}
                    {hasAnyImage && sidebarImage.enabled && !hasImage && (
                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                            <span>Ninguna imagen está activa. Activa al menos una para que el widget se muestre en la página pública.</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Columna izquierda: imágenes y controles (7 cols) */}
                        <div className="lg:col-span-7 space-y-5">
                            {/* Selector de modo: Subir / URL externa */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                                    Archivo de imagen
                                    {images.length > 0 && (
                                        <span className="ml-2 normal-case tracking-normal font-semibold text-gray-400">
                                            {images.length} de {CAROUSEL_LIMITS.maxImages}
                                        </span>
                                    )}
                                </label>
                                <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setActiveInputTab('upload')}
                                        className={`px-3 py-1 rounded-md font-medium transition-all ${
                                            activeInputTab === 'upload'
                                                ? 'bg-white text-rotary-blue shadow-xs font-semibold'
                                                : 'text-gray-500 hover:text-gray-800'
                                        }`}
                                    >
                                        Subir / Biblioteca
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveInputTab('url')}
                                        className={`px-3 py-1 rounded-md font-medium transition-all ${
                                            activeInputTab === 'url'
                                                ? 'bg-white text-rotary-blue shadow-xs font-semibold'
                                                : 'text-gray-500 hover:text-gray-800'
                                        }`}
                                    >
                                        URL externa
                                    </button>
                                </div>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/jpeg,image/png,image/webp,image/*"
                                className="hidden"
                                onChange={e => { if (e.target.files) handleFilesUpload(e.target.files); }}
                            />
                            <input
                                ref={replaceInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/*"
                                className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceUpload(f); }}
                            />

                            {activeInputTab === 'upload' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Botón 1: Subir desde el computador (varias a la vez, o soltarlas aquí) */}
                                    <button
                                        type="button"
                                        disabled={uploading || remainingSlots === 0}
                                        onClick={() => fileInputRef.current?.click()}
                                        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setFileDragActive(true); } }}
                                        onDragLeave={() => setFileDragActive(false)}
                                        onDrop={onUploadZoneDrop}
                                        className={`group relative flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all text-center disabled:cursor-not-allowed disabled:opacity-60 ${
                                            fileDragActive
                                                ? 'border-rotary-blue bg-blue-50/50'
                                                : 'border-gray-300 hover:border-rotary-blue bg-gray-50/50 hover:bg-blue-50/30'
                                        }`}
                                    >
                                        {uploading ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-7 h-7 border-2 border-rotary-blue border-t-transparent rounded-full animate-spin" />
                                                <span className="text-xs text-gray-600 font-medium">
                                                    {uploadProgress && uploadProgress.total > 1
                                                        ? `Subiendo ${Math.min(uploadProgress.done + 1, uploadProgress.total)} de ${uploadProgress.total}…`
                                                        : 'Subiendo imagen...'}
                                                </span>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="w-10 h-10 rounded-xl bg-white shadow-xs border border-gray-200 flex items-center justify-center text-gray-600 group-hover:text-rotary-blue group-hover:border-blue-200 transition-colors mb-2">
                                                    <Upload className="w-5 h-5" />
                                                </div>
                                                <span className="text-xs font-bold text-gray-800 group-hover:text-rotary-blue">
                                                    Subir desde el equipo
                                                </span>
                                                <span className="text-[11px] text-gray-400 mt-0.5">
                                                    Una o varias · JPG, PNG o WebP (ej: 1080×1350)
                                                </span>
                                            </>
                                        )}
                                    </button>

                                    {/* Botón 2: Biblioteca multimedia (selección múltiple) */}
                                    <button
                                        type="button"
                                        disabled={remainingSlots === 0}
                                        onClick={() => openPicker('add')}
                                        className="group relative flex flex-col items-center justify-center p-5 rounded-xl border border-gray-200 hover:border-rotary-blue bg-white hover:bg-blue-50/30 cursor-pointer transition-all text-center shadow-xs disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-rotary-blue group-hover:text-white transition-colors mb-2">
                                            <FolderOpen className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-bold text-gray-800 group-hover:text-rotary-blue">
                                            Elegir de la Biblioteca
                                        </span>
                                        <span className="text-[11px] text-gray-400 mt-0.5">
                                            Reutilizar fotos cargadas en el sitio (varias)
                                        </span>
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="url"
                                                value={externalUrl}
                                                onChange={e => setExternalUrl(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExternalUrl(); } }}
                                                placeholder="https://ejemplo.com/afiche-promocional.webp"
                                                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none pr-10"
                                            />
                                            <Link2 className="absolute right-3.5 top-3 w-4 h-4 text-gray-400" />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={addExternalUrl}
                                            disabled={!externalUrl.trim() || remainingSlots === 0}
                                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rotary-blue text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <Plus className="w-4 h-4" /> Agregar
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-gray-400">
                                        Pega la dirección web directa de la imagen (debe comenzar con https://). Se agrega al final del carrusel.
                                    </p>
                                </div>
                            )}

                            {uploadError && (
                                <p className="text-xs text-red-600 flex items-start gap-1.5 font-medium">
                                    <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
                                    <span>{uploadError}</span>
                                </p>
                            )}

                            {/* Miniaturas: orden de presentación, arrastrar para reordenar */}
                            {images.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                            Orden de presentación
                                        </span>
                                        {images.length > 1 && (
                                            <span className="text-[11px] text-gray-400">
                                                Arrastra las miniaturas o usa las flechas para reordenar
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                                        {images.map((img, i) => (
                                            <SlideThumbnail
                                                key={img.id}
                                                slide={img}
                                                index={i}
                                                total={images.length}
                                                selected={selected?.id === img.id}
                                                inPreview={previewSlides.length > 1 && previewActiveSlide?.id === img.id}
                                                dragOver={dragOverId === img.id && dragId !== img.id}
                                                onSelect={() => selectSlide(img)}
                                                onMove={delta => moveSlide(img.id, i + delta)}
                                                onRemove={() => removeSlide(img.id)}
                                                onDragStart={e => {
                                                    setDragId(img.id);
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    try { e.dataTransfer.setData('text/plain', img.id); } catch { /* Firefox exige datos; otros navegadores pueden negarlo */ }
                                                }}
                                                onDragOver={e => {
                                                    if (!dragId) return;
                                                    e.preventDefault();
                                                    e.dataTransfer.dropEffect = 'move';
                                                    if (dragOverId !== img.id) setDragOverId(img.id);
                                                }}
                                                onDragLeave={() => { if (dragOverId === img.id) setDragOverId(null); }}
                                                onDrop={e => {
                                                    if (!dragId) return;
                                                    e.preventDefault();
                                                    moveSlide(dragId, i);
                                                    setDragId(null);
                                                    setDragOverId(null);
                                                }}
                                                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Propiedades de la imagen seleccionada */}
                            {selected && (
                                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="shrink-0 rounded-md bg-rotary-blue px-2 py-0.5 text-[11px] font-bold text-white">
                                                Imagen {selectedIndex + 1} de {images.length}
                                            </span>
                                            <span className="text-xs text-gray-600 font-medium truncate max-w-[220px] sm:max-w-xs">
                                                {fileNameOf(selected.imageUrl)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
                                            {selected.enabled ? 'Se muestra' : 'Oculta'}
                                            <ToggleSwitch
                                                checked={selected.enabled}
                                                onChange={next => updateSlide(selected.id, { enabled: next })}
                                                label={`Mostrar la imagen ${selectedIndex + 1}`}
                                                size="sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                                        <button
                                            type="button"
                                            disabled={uploading}
                                            onClick={() => replaceInputRef.current?.click()}
                                            className="inline-flex items-center gap-1 font-semibold text-rotary-blue hover:underline disabled:opacity-50"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" /> Reemplazar desde el equipo
                                        </button>
                                        <span className="text-gray-300">|</span>
                                        <button
                                            type="button"
                                            onClick={() => openPicker('replace')}
                                            className="inline-flex items-center gap-1 font-semibold text-rotary-blue hover:underline"
                                        >
                                            <FolderOpen className="w-3.5 h-3.5" /> Reemplazar desde la Biblioteca
                                        </button>
                                        {sanitizeImageUrl(selected.imageUrl) && (
                                            <>
                                                <span className="text-gray-300">|</span>
                                                <a
                                                    href={selected.imageUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 font-semibold text-rotary-blue hover:underline"
                                                >
                                                    Ver original <ArrowUpRight className="w-3 h-3" />
                                                </a>
                                            </>
                                        )}
                                        <span className="text-gray-300">|</span>
                                        <button
                                            type="button"
                                            onClick={() => removeSlide(selected.id)}
                                            className="inline-flex items-center gap-1 font-semibold text-red-600 hover:text-red-700 hover:underline"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" /> Quitar imagen
                                        </button>
                                    </div>

                                    {/* Origen (editable: reemplazar por URL) */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                                            Archivo o URL de origen
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="url"
                                                value={selected.imageUrl}
                                                onChange={e => updateSlide(selected.id, { imageUrl: e.target.value })}
                                                placeholder="https://ejemplo.com/afiche-promocional.webp"
                                                className={`w-full px-3.5 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none pr-10 bg-white ${
                                                    selected.imageUrl && !sanitizeImageUrl(selected.imageUrl) ? 'border-red-300' : 'border-gray-300'
                                                }`}
                                            />
                                            <Link2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                                        </div>
                                        {selected.imageUrl && !sanitizeImageUrl(selected.imageUrl) && (
                                            <p className="text-[11px] text-red-600">La dirección no es válida: esta imagen no se mostrará hasta corregirla.</p>
                                        )}
                                    </div>

                                    {/* Configuración de Accesibilidad (Alt Text) */}
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                                            Texto alternativo (Alt) para accesibilidad y SEO
                                        </label>
                                        <input
                                            type="text"
                                            value={selected.altText || ''}
                                            onChange={e => updateSlide(selected.id, { altText: e.target.value })}
                                            placeholder={eventTitle ? `Ej: Código de vestuario para ${eventTitle}` : 'Ej: Afiche promocional del evento'}
                                            className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none bg-white"
                                        />
                                        <p className="text-[11px] text-gray-400">
                                            Describe brevemente el contenido de esta imagen para personas con discapacidad visual y motores de búsqueda.
                                        </p>
                                    </div>

                                    {/* Enlace opcional al hacer clic */}
                                    <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                                                Enlace al hacer clic (opcional)
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={selected.linkUrl || ''}
                                                    onChange={e => updateSlide(selected.id, { linkUrl: e.target.value })}
                                                    placeholder="Ej: /eventos/villavicencio2027/registro o https://..."
                                                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none pr-10 bg-white"
                                                />
                                                <ExternalLink className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                                            </div>
                                            <p className="text-[11px] text-gray-400">
                                                Si se especifica, esta imagen se convertirá en un enlace interactivo al ser pulsada.
                                            </p>
                                        </div>

                                        {selected.linkUrl && (
                                            <div className="flex flex-wrap items-center gap-4 pl-1">
                                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name={`linkTarget-${selected.id}`}
                                                        checked={selected.openInNewTab === true}
                                                        onChange={() => updateSlide(selected.id, { openInNewTab: true })}
                                                        className="w-3.5 h-3.5 text-rotary-blue focus:ring-rotary-blue"
                                                    />
                                                    Abrir en pestaña nueva (_blank)
                                                </label>
                                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name={`linkTarget-${selected.id}`}
                                                        checked={selected.openInNewTab !== true}
                                                        onChange={() => updateSlide(selected.id, { openInNewTab: false })}
                                                        className="w-3.5 h-3.5 text-rotary-blue focus:ring-rotary-blue"
                                                    />
                                                    Abrir en la misma pestaña
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <hr className="border-gray-100 my-4" />

                            {/* Configuración de Título Opcional (de todo el widget) */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={sidebarImage.showTitle}
                                            onChange={e => commit({ showTitle: e.target.checked })}
                                            className="w-4 h-4 rounded text-rotary-blue focus:ring-rotary-blue"
                                        />
                                        Mostrar título sobre el widget
                                    </label>
                                    <span className="text-[11px] text-gray-400">Opcional</span>
                                </div>

                                {sidebarImage.showTitle && (
                                    <div className="space-y-1.5 pl-6">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={sidebarImage.title || ''}
                                                onChange={e => commit({ title: e.target.value })}
                                                placeholder="Ej: Código de vestuario"
                                                className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none"
                                            />
                                            <Type className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                                        </div>
                                        <p className="text-[11px] text-gray-400">
                                            Aparece en un encabezado sutil sobre la imagen o el carrusel, con la tipografía oficial del sitio.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <hr className="border-gray-100 my-4" />

                            {/* Configuración del carrusel (por evento) */}
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700">
                                        <SlidersHorizontal className="w-4 h-4 text-rotary-blue" />
                                        Configuración del carrusel
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => commit({ carousel: { ...DEFAULT_CAROUSEL_SETTINGS } })}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-rotary-blue"
                                    >
                                        <RotateCcw className="w-3 h-3" /> Restablecer valores predeterminados
                                    </button>
                                </div>
                                {previewSlides.length < 2 && (
                                    <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                        Con una sola imagen activa el widget se muestra como imagen fija, sin flechas ni indicadores. Esta configuración se aplica en cuanto haya dos o más.
                                    </p>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <SettingToggleRow
                                        label="Reproducción automática"
                                        hint="Pasa a la siguiente imagen sin intervención."
                                        checked={carousel.autoplay}
                                        onChange={next => updateCarousel({ autoplay: next })}
                                    />
                                    <div className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 bg-white">
                                        <div className="min-w-0">
                                            <label htmlFor="carousel-interval" className="text-xs font-semibold text-gray-800">Tiempo entre imágenes</label>
                                            <p className="text-[11px] text-gray-400 mt-0.5">Cuánto permanece cada imagen.</p>
                                        </div>
                                        <select
                                            id="carousel-interval"
                                            value={carousel.intervalMs}
                                            disabled={!carousel.autoplay}
                                            onChange={e => updateCarousel({ intervalMs: Number(e.target.value) })}
                                            className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-rotary-blue outline-none disabled:opacity-50"
                                        >
                                            {withCurrent(INTERVAL_OPTIONS_MS, carousel.intervalMs).map(ms => (
                                                <option key={ms} value={ms}>
                                                    {Number.isInteger(ms / 1000) ? ms / 1000 : (ms / 1000).toFixed(1)} segundos
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 bg-white">
                                        <div className="min-w-0">
                                            <label htmlFor="carousel-transition" className="text-xs font-semibold text-gray-800">Tipo de transición</label>
                                            <p className="text-[11px] text-gray-400 mt-0.5">Cómo entra la siguiente imagen.</p>
                                        </div>
                                        <select
                                            id="carousel-transition"
                                            value={carousel.transition}
                                            onChange={e => updateCarousel({ transition: e.target.value === 'slide' ? 'slide' : 'fade' })}
                                            className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-rotary-blue outline-none"
                                        >
                                            <option value="fade">Desvanecimiento (fade)</option>
                                            <option value="slide">Deslizamiento (slide)</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 bg-white">
                                        <div className="min-w-0">
                                            <label htmlFor="carousel-duration" className="text-xs font-semibold text-gray-800">Duración de transición</label>
                                            <p className="text-[11px] text-gray-400 mt-0.5">Velocidad del efecto.</p>
                                        </div>
                                        <select
                                            id="carousel-duration"
                                            value={carousel.transitionMs}
                                            onChange={e => updateCarousel({ transitionMs: Number(e.target.value) })}
                                            className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-rotary-blue outline-none"
                                        >
                                            {withCurrent(TRANSITION_OPTIONS_MS, carousel.transitionMs).map(ms => (
                                                <option key={ms} value={ms}>{ms} ms</option>
                                            ))}
                                        </select>
                                    </div>
                                    <SettingToggleRow
                                        label="Flechas de navegación"
                                        hint="Flechas laterales discretas."
                                        checked={carousel.showArrows}
                                        onChange={next => updateCarousel({ showArrows: next })}
                                    />
                                    <SettingToggleRow
                                        label="Indicadores de posición"
                                        hint="Puntos bajo las imágenes."
                                        checked={carousel.showDots}
                                        onChange={next => updateCarousel({ showDots: next })}
                                    />
                                    <SettingToggleRow
                                        label="Reproducción continua"
                                        hint="Tras la última vuelve a la primera."
                                        checked={carousel.loop}
                                        onChange={next => updateCarousel({ loop: next })}
                                    />
                                    <SettingToggleRow
                                        label="Pausar al interactuar"
                                        hint="Se detiene al pasar el cursor, tocar o enfocar."
                                        checked={carousel.pauseOnInteraction}
                                        onChange={next => updateCarousel({ pauseOnInteraction: next })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Columna derecha: Vista previa en vivo con el MISMO componente público (5 cols) */}
                        <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                                    <Eye className="w-3.5 h-3.5 text-rotary-blue" />
                                    Vista previa (Ancho lateral)
                                </span>
                                <span className="text-[11px] text-gray-400">
                                    {previewLabel}
                                </span>
                            </div>

                            {/* Contenedor que simula la columna derecha del sitio */}
                            <div className="bg-gray-100/70 p-4 rounded-2xl border border-gray-200">
                                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">
                                    Columna Lateral Derecha
                                </div>

                                {hasImage ? (
                                    <div className={`relative bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-200 ${
                                        !sidebarImage.enabled ? 'ring-2 ring-dashed ring-gray-300' : ''
                                    }`}>
                                        {/* Título preview */}
                                        {sidebarImage.showTitle && sidebarImage.title && (
                                            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/70">
                                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 truncate">
                                                    {sidebarImage.title}
                                                </h4>
                                            </div>
                                        )}

                                        <div className={!sidebarImage.enabled ? 'opacity-50' : ''}>
                                            <EventSidebarImageCarousel
                                                slides={previewSlides}
                                                settings={carousel}
                                                fallbackAlt="Vista previa"
                                                onIndexChange={setPreviewIndex}
                                                requestedIndex={previewRequest}
                                                showCounter={previewSlides.length > 1}
                                                disableLinks
                                            />
                                        </div>

                                        {!sidebarImage.enabled && (
                                            <div className="pointer-events-none absolute inset-0 bg-black/30 flex flex-col items-center justify-center text-white p-4 text-center">
                                                <EyeOff className="w-6 h-6 mb-1 opacity-80" />
                                                <span className="text-xs font-bold">Oculto en la página</span>
                                                <span className="text-[10px] opacity-80">Activa la visualización para mostrarlo</span>
                                            </div>
                                        )}

                                        {previewActiveSlide?.linkUrl && (
                                            <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
                                                <span className="truncate max-w-[180px]">🔗 {previewActiveSlide.linkUrl}</span>
                                                <span className="text-blue-600 font-medium">
                                                    {previewActiveSlide.openInNewTab ? 'Nueva pestaña' : 'Misma pestaña'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-8 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-300 mb-2">
                                            <ImageIcon className="w-6 h-6" />
                                        </div>
                                        <p className="text-xs font-semibold text-gray-600">
                                            {hasAnyImage ? 'Ninguna imagen activa' : 'Sin imagen configurada'}
                                        </p>
                                        <p className="text-[11px] text-gray-400 mt-1 max-w-[200px]">
                                            Sube uno o varios afiches o el código de vestuario (1080×1350 vertical o similar) para visualizarlos aquí.
                                        </p>
                                    </div>
                                )}

                                {previewSlides.length > 1 && (
                                    <p className="text-[11px] text-gray-600 mt-3 text-center font-medium">
                                        Mostrando la imagen {Math.min(previewIndex, previewSlides.length - 1) + 1} de {previewSlides.length}
                                        {images.length > previewSlides.length && (
                                            <span className="text-gray-400 font-normal"> · {images.length - previewSlides.length} inactiva(s) no se muestran</span>
                                        )}
                                    </p>
                                )}
                                <p className="text-[10px] text-gray-400 mt-2 text-center">
                                    Se adapta automáticamente al ancho del contenedor sin recortes ni distorsión.
                                    {previewSlides.length > 1 && ' Prueba las flechas, los puntos o desliza: es el mismo carrusel del sitio público.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Arquitectura para futuros widgets complementarios */}
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                                Arquitectura modular de widgets complementarios
                            </h4>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                                La base de datos y la arquitectura están preparadas para incorporar nuevos widgets independientes (banners de patrocinadores, cuenta regresiva, bloques HTML).
                            </p>
                        </div>
                    </div>
                    <span className="text-[10px] font-semibold bg-gray-200 text-gray-700 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        Extensible
                    </span>
                </div>
            </div>

            {/* Modal de selección desde Biblioteca Multimedia */}
            <MediaPicker
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                maxSelection={pickerMode === 'replace' ? 1 : Math.max(1, remainingSlots)}
                mediaType="image"
                onSelect={items => {
                    const urls = items.map(it => it?.url).filter((u): u is string => Boolean(u));
                    if (pickerMode === 'replace') {
                        if (selected && urls[0]) updateSlide(selected.id, { imageUrl: urls[0] });
                    } else {
                        setUploadError(null);
                        appendUrls(urls);
                    }
                    setPickerOpen(false);
                }}
            />
        </div>
    );
};

export default EventWidgetsEditor;
