// ════════════════════════════════════════════════════════════════════
// 🏨 Hoteles y alojamiento — editor del panel — v4.1275.0
//
// Pestaña propia del evento (Eventos → el evento → «🏨 Hoteles y alojamiento»)
// para la sección pública «Hoteles de la conferencia». Todo es por evento y
// viaja en `metadata.hotels` con «Guardar todos los cambios», como el resto
// de las pestañas; el servidor lo normaliza y lo sella (quién, cuándo, qué).
//
//   · Publicar / ocultar, título, descripción y fecha de actualización de tarifas.
//   · Diapositivas: subida múltiple (o soltando los archivos), Biblioteca,
//     miniaturas reordenables (arrastrar o flechas: el arrastre nativo no
//     funciona en pantallas táctiles), reemplazar una sin tocar las demás,
//     texto alternativo y activa/inactiva por diapositiva, eliminar.
//   · Guía descargable en PDF + «Permitir descargar presentación de hoteles».
//   · Vista previa con EL MISMO componente del sitio público.
//   · Historial de cambios y limpieza controlada de archivos sin uso.
//
// Las subidas leen el estado y el `onChange` MÁS RECIENTES (`latestRef`) para
// no pisar lo que se editó mientras subían (lección del carrusel lateral).
// ════════════════════════════════════════════════════════════════════
import React, { useRef, useState } from 'react';
import {
    AlertCircle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileText, FolderOpen,
    GripVertical, History, Hotel, Image as ImageIcon, RefreshCw, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import MediaPicker from '../content-studio/MediaPicker';
import EventHotelsSection from '../../EventHotelsSection';
import { ToggleSwitch } from './EventWidgetsEditor';
import {
    HOTEL_LIMITS, draftHotelsConfig, formatBytes, formatRatesDate, isPdfName, declaredImageFormat,
    newHotelSlideId, normalizeHotelsConfig, sanitizeHotelUrl, suggestedHotelsDescription, visibleHotelSlides,
    type HotelsConfig, type HotelSlide,
} from '../../../../server/lib/eventHotels.js';
import {
    deleteHotelOrphans, fetchHotelOrphans, uploadHotelDocument, uploadHotelSlide,
    type HotelOrphans, type UploadedSlide,
} from '../../../lib/eventHotelsUpload';

const PDF_HINT = 'Los PDF todavía no se convierten en diapositivas. Súbelo en «Guía descargable» y, para mostrarlo aquí, exporta sus páginas como imágenes (PowerPoint o Keynote: Archivo → Exportar → JPEG o PNG).';

const formatWhen = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ── Piezas de interfaz (fuera del editor: nunca un componente dentro de otro) ──

const SlideTile: React.FC<{
    slide: HotelSlide;
    index: number;
    total: number;
    selected: boolean;
    dragOver: boolean;
    onSelect: () => void;
    onMove: (delta: number) => void;
    onToggle: () => void;
    onRemove: () => void;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
}> = ({
    slide, index, total, selected, dragOver,
    onSelect, onMove, onToggle, onRemove, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}) => {
    const src = sanitizeHotelUrl(slide.thumbUrl || slide.mediumUrl || slide.imageUrl);
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
                aria-label={`Editar la diapositiva ${index + 1} de ${total}`}
                aria-pressed={selected}
                className="block w-full aspect-[16/10] bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue focus-visible:ring-inset"
            >
                {src ? (
                    <img
                        src={src}
                        alt={slide.altText || `Diapositiva ${index + 1}`}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className={`w-full h-full object-contain ${slide.enabled ? '' : 'opacity-40 grayscale'}`}
                    />
                ) : (
                    <span className="flex h-full w-full items-center justify-center text-gray-300"><ImageIcon className="w-6 h-6" /></span>
                )}
            </button>
            <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                <GripVertical className="w-3 h-3 opacity-80" />{index + 1}
            </span>
            {!slide.enabled && (
                <span className="pointer-events-none absolute top-1.5 right-1.5 flex items-center gap-1 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    <EyeOff className="w-3 h-3" /> Inactiva
                </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1.5 pt-4">
                <div className="flex gap-1">
                    <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Mover la diapositiva ${index + 1} antes`}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed">
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Mover la diapositiva ${index + 1} después`}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed">
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
                <div className="flex gap-1">
                    <button type="button" onClick={onToggle} aria-label={slide.enabled ? `Ocultar la diapositiva ${index + 1}` : `Mostrar la diapositiva ${index + 1}`}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white">
                        {slide.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button type="button" onClick={onRemove} aria-label={`Eliminar la diapositiva ${index + 1}`}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

const Card: React.FC<{ title: string; hint?: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, icon, right, children }) => (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-rotary-blue border border-blue-100">{icon}</span>
                <div>
                    <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                    {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
                </div>
            </div>
            {right}
        </div>
        <div className="p-5 space-y-4">{children}</div>
    </div>
);

interface Props {
    eventId: string;
    eventTitle?: string;
    /** `metadata.hotels` del evento (lo que hay en memoria en el panel). */
    hotels: unknown;
    /** Notifica la nueva configuración (se guarda con «Guardar todos los cambios»). */
    onChange: (hotels: HotelsConfig) => void;
}

const EventHotelsEditor: React.FC<Props> = ({ eventId, eventTitle, hotels: rawHotels, onChange }) => {
    const draft = draftHotelsConfig(rawHotels, eventTitle);
    // Los sellos del servidor (sólo lectura aquí).
    const stored = rawHotels && typeof rawHotels === 'object' ? rawHotels as HotelsConfig : null;
    const slides = draft.slides;

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [uploading, setUploading] = useState<{ done: number; total: number; label: string } | null>(null);
    const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
    const [docUploading, setDocUploading] = useState(false);
    const [docError, setDocError] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerMode, setPickerMode] = useState<'add' | 'replace'>('add');
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [fileDragActive, setFileDragActive] = useState(false);
    const [showAllHistory, setShowAllHistory] = useState(false);
    const [orphans, setOrphans] = useState<HotelOrphans | null>(null);
    const [orphansBusy, setOrphansBusy] = useState(false);
    const [orphansMsg, setOrphansMsg] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);
    const latestRef = useRef<{ draft: HotelsConfig; onChange: Props['onChange']; stored: HotelsConfig | null }>({ draft, onChange, stored });
    latestRef.current = { draft, onChange, stored };

    const selected = slides.find(s => s.id === selectedId) || slides[0] || null;
    const selectedIndex = selected ? slides.findIndex(s => s.id === selected.id) : -1;
    const visible = visibleHotelSlides(draft);
    const remaining = Math.max(0, HOTEL_LIMITS.maxSlides - slides.length);
    const isPublic = draft.enabled && visible.length > 0;

    /** Escribe conservando los sellos del servidor (los vuelve a calcular él al guardar). */
    const commit = (patch: Partial<HotelsConfig>) => {
        const { draft: d, onChange: notify, stored: st } = latestRef.current;
        const next = { ...d, ...patch };
        const keep = st ? { updatedAt: st.updatedAt, updatedBy: st.updatedBy, history: st.history } : {};
        const out = { ...next, ...keep } as HotelsConfig;
        latestRef.current = { ...latestRef.current, draft: next };
        notify(out);
    };
    const commitSlides = (next: HotelSlide[]) => commit({ slides: next });
    const updateSlide = (id: string, patch: Partial<HotelSlide>) =>
        commitSlides(latestRef.current.draft.slides.map(s => (s.id === id ? { ...s, ...patch } : s)));

    const slideFromUpload = (u: UploadedSlide): HotelSlide => ({
        id: newHotelSlideId(),
        imageUrl: u.imageUrl,
        ...(u.mediumUrl ? { mediumUrl: u.mediumUrl } : {}),
        ...(u.thumbUrl ? { thumbUrl: u.thumbUrl } : {}),
        ...(u.width && u.height ? { width: u.width, height: u.height } : {}),
        ...(u.fileName ? { fileName: u.fileName } : {}),
        altText: '',
        enabled: true,
    });

    const handleFiles = async (fileList: FileList | File[]) => {
        const files = Array.from(fileList);
        if (files.length === 0) return;
        setNotice(null);
        const pdfs = files.filter(f => isPdfName(f.name, f.type));
        const images = files.filter(f => !isPdfName(f.name, f.type) && declaredImageFormat(f.name, f.type));
        const others = files.length - pdfs.length - images.length;
        const tooBig = images.filter(f => f.size > HOTEL_LIMITS.maxImageMb * 1024 * 1024);
        const candidates = images.filter(f => f.size <= HOTEL_LIMITS.maxImageMb * 1024 * 1024);
        const room = Math.max(0, HOTEL_LIMITS.maxSlides - latestRef.current.draft.slides.length);
        const toUpload = candidates.slice(0, room);

        const notes: string[] = [];
        if (pdfs.length) notes.push(PDF_HINT);
        if (others) notes.push(`${others} archivo(s) con formato no admitido (sólo JPG, PNG o WebP).`);
        if (tooBig.length) notes.push(`Superan ${HOTEL_LIMITS.maxImageMb} MB: ${tooBig.map(f => f.name).join(', ')}.`);
        if (candidates.length > toUpload.length) notes.push(`Se omitieron ${candidates.length - toUpload.length}: el máximo es ${HOTEL_LIMITS.maxSlides} diapositivas.`);

        if (toUpload.length > 0) {
            setUploading({ done: 0, total: toUpload.length, label: 'Subiendo' });
            const failures: string[] = [];
            let selectedFirst = false;
            // De una en una: el orden de las diapositivas es el orden elegido.
            for (const file of toUpload) {
                try {
                    const up = await uploadHotelSlide(eventId, file);
                    const current = latestRef.current.draft.slides;
                    const added = slideFromUpload(up);
                    commitSlides([...current, added]);
                    if (!selectedFirst) { setSelectedId(added.id); selectedFirst = true; }
                } catch (err: any) {
                    failures.push(`${file.name}: ${err?.message || 'error al subir'}`);
                }
                setUploading(u => (u ? { ...u, done: u.done + 1 } : u));
            }
            if (failures.length) notes.push(`No se pudieron subir: ${failures.join(' · ')}`);
            setUploading(null);
        }
        if (notes.length) setNotice({ tone: pdfs.length && notes.length === 1 ? 'info' : 'error', text: notes.join(' ') });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleReplace = async (file: File) => {
        if (!selected) return;
        const targetId = selected.id;
        setNotice(null);
        if (isPdfName(file.name, file.type)) { setNotice({ tone: 'info', text: PDF_HINT }); return; }
        if (!declaredImageFormat(file.name, file.type)) { setNotice({ tone: 'error', text: 'Formato no admitido. Usa JPG, PNG o WebP.' }); return; }
        setUploading({ done: 0, total: 1, label: 'Reemplazando' });
        try {
            const up = await uploadHotelSlide(eventId, file);
            // Reemplazar conserva la posición, el texto alternativo y si está activa.
            updateSlide(targetId, {
                imageUrl: up.imageUrl,
                mediumUrl: up.mediumUrl,
                thumbUrl: up.thumbUrl,
                width: up.width,
                height: up.height,
                fileName: up.fileName,
            });
        } catch (err: any) {
            setNotice({ tone: 'error', text: err?.message || 'No pudimos reemplazar la diapositiva.' });
        } finally {
            setUploading(null);
            if (replaceInputRef.current) replaceInputRef.current.value = '';
        }
    };

    const handleDocument = async (file: File) => {
        setDocError(null);
        if (!isPdfName(file.name, file.type)) { setDocError('La guía descargable debe ser un PDF.'); return; }
        if (file.size > HOTEL_LIMITS.maxDocumentMb * 1024 * 1024) { setDocError(`El PDF supera el tope de ${HOTEL_LIMITS.maxDocumentMb} MB.`); return; }
        setDocUploading(true);
        try {
            const doc = await uploadHotelDocument(eventId, file);
            commit({ document: doc });
        } catch (err: any) {
            setDocError(err?.message || 'No pudimos subir la guía.');
        } finally {
            setDocUploading(false);
            if (docInputRef.current) docInputRef.current.value = '';
        }
    };

    const removeSlide = (id: string) => {
        const current = latestRef.current.draft.slides;
        const idx = current.findIndex(s => s.id === id);
        const next = current.filter(s => s.id !== id);
        commitSlides(next);
        if (selected?.id === id) setSelectedId(next[Math.min(idx, next.length - 1)]?.id || null);
    };

    const moveSlide = (fromId: string, toIndex: number) => {
        const current = [...latestRef.current.draft.slides];
        const from = current.findIndex(s => s.id === fromId);
        if (from < 0) return;
        const target = Math.max(0, Math.min(current.length - 1, toIndex));
        if (target === from) return;
        const [moved] = current.splice(from, 1);
        current.splice(target, 0, moved);
        commitSlides(current);
    };

    const onPick = (urls: string[]) => {
        const clean = urls.map(sanitizeHotelUrl).filter(Boolean);
        if (clean.length === 0) return;
        if (pickerMode === 'replace' && selected) {
            // Una imagen de la Biblioteca no tiene versiones optimizadas propias.
            updateSlide(selected.id, { imageUrl: clean[0], mediumUrl: undefined, thumbUrl: undefined, width: undefined, height: undefined, fileName: undefined });
            return;
        }
        const room = Math.max(0, HOTEL_LIMITS.maxSlides - latestRef.current.draft.slides.length);
        const added = clean.slice(0, room).map(url => ({ id: newHotelSlideId(), imageUrl: url, altText: '', enabled: true }));
        if (added.length === 0) { setNotice({ tone: 'error', text: `El máximo es ${HOTEL_LIMITS.maxSlides} diapositivas.` }); return; }
        commitSlides([...latestRef.current.draft.slides, ...added]);
        setSelectedId(added[0].id);
    };

    const checkOrphans = async () => {
        setOrphansBusy(true); setOrphansMsg(null);
        try { setOrphans(await fetchHotelOrphans(eventId)); }
        catch (err: any) { setOrphansMsg(err?.message || 'No pudimos revisar los archivos.'); }
        finally { setOrphansBusy(false); }
    };
    const releaseOrphans = async () => {
        if (!orphans?.orphans.length) return;
        if (!confirm(`¿Liberar ${orphans.orphans.length} archivo(s) que ninguna página usa? Esta acción no se puede deshacer.`)) return;
        setOrphansBusy(true); setOrphansMsg(null);
        try {
            const r = await deleteHotelOrphans(eventId);
            setOrphansMsg(`Se liberaron ${r.deleted} archivo(s) (${formatBytes(r.bytes) || '0 KB'}).`);
            setOrphans(null);
        } catch (err: any) { setOrphansMsg(err?.message || 'No pudimos liberar los archivos.'); }
        finally { setOrphansBusy(false); }
    };

    const history = Array.isArray(stored?.history) ? stored!.history! : [];
    const shownHistory = showAllHistory ? history : history.slice(0, 5);
    const previewConfig = normalizeHotelsConfig(draft);
    const statusChip = isPublic
        ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500 animate-pulse', text: `Publicada · ${visible.length} diapositiva(s)` }
        : draft.enabled
            ? { cls: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500', text: 'Activa, sin diapositivas visibles' }
            : { cls: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400', text: 'Oculta en el sitio público' };

    return (
        <div className="space-y-6">
            {/* Encabezado */}
            <div className="border-b border-gray-200/80 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-rotary-blue border border-blue-100"><Hotel className="h-5 w-5" /></span>
                        <h2 className="text-xl font-bold text-gray-900 tracking-tight">🏨 Hoteles y alojamiento</h2>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 max-w-2xl">
                        Diapositivas con los hoteles, tarifas y condiciones de reserva. Se publican en la página del evento como «Hoteles de la conferencia», entre el carrusel de fotos y el contenido HTML.
                    </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 self-start sm:self-auto px-3 py-1 rounded-full text-xs font-semibold border ${statusChip.cls}`}>
                    <span className={`h-2 w-2 rounded-full ${statusChip.dot}`} />{statusChip.text}
                </span>
            </div>

            {/* Publicación y textos */}
            <Card
                title="Publicación y textos"
                hint="El título y la descripción encabezan la sección pública."
                icon={<Sparkles className="h-4 w-4" />}
                right={(
                    <div className="flex items-center gap-3 shrink-0 bg-white px-4 py-2 rounded-xl border border-gray-200">
                        <span className="text-xs font-medium text-gray-700">{draft.enabled ? 'Sección publicada' : 'Sección oculta'}</span>
                        <ToggleSwitch checked={draft.enabled} onChange={next => commit({ enabled: next })} label="Mostrar la sección de hoteles en la página pública" />
                    </div>
                )}
            >
                {draft.enabled && visible.length === 0 && (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>La sección está activa pero no tiene diapositivas visibles: no aparecerá en la página pública hasta que agregues o actives al menos una.</span>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5" htmlFor={`hotels-title-${eventId}`}>Título</label>
                        <input
                            id={`hotels-title-${eventId}`}
                            type="text"
                            value={draft.title}
                            maxLength={HOTEL_LIMITS.titleMax}
                            onChange={e => commit({ title: e.target.value })}
                            className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none"
                            placeholder="Hoteles de la conferencia"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5" htmlFor={`hotels-rates-${eventId}`}>Tarifas actualizadas al</label>
                        <div className="flex gap-2">
                            <input
                                id={`hotels-rates-${eventId}`}
                                type="date"
                                value={draft.ratesUpdatedOn}
                                onChange={e => commit({ ratesUpdatedOn: e.target.value })}
                                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none"
                            />
                            {draft.ratesUpdatedOn && (
                                <button type="button" onClick={() => commit({ ratesUpdatedOn: '' })} aria-label="Quitar la fecha de tarifas" className="px-2 text-gray-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                            )}
                        </div>
                        <p className="mt-1 text-[11px] text-gray-400">Opcional. Se muestra como «Tarifas actualizadas al …» para evitar confusiones con precios viejos.</p>
                    </div>
                    <div className="md:col-span-3">
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600" htmlFor={`hotels-desc-${eventId}`}>Descripción</label>
                            <button type="button" onClick={() => commit({ description: suggestedHotelsDescription(eventTitle) })} className="text-[11px] font-semibold text-rotary-blue hover:underline">
                                Usar texto sugerido
                            </button>
                        </div>
                        <textarea
                            id={`hotels-desc-${eventId}`}
                            rows={3}
                            value={draft.description}
                            maxLength={HOTEL_LIMITS.descriptionMax}
                            onChange={e => commit({ description: e.target.value })}
                            className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none resize-y"
                        />
                    </div>
                </div>
            </Card>

            {/* Diapositivas */}
            <Card
                title={`Diapositivas (${slides.length} de ${HOTEL_LIMITS.maxSlides})`}
                hint={`JPG, PNG o WebP de hasta ${HOTEL_LIMITS.maxImageMb} MB y al menos ${HOTEL_LIMITS.minLongSide} px en el lado largo (recomendado 1920 × 1080). Se optimizan para la web sin recortarlas.`}
                icon={<ImageIcon className="h-4 w-4" />}
                right={(
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                        Miniaturas bajo el visor
                        <ToggleSwitch size="sm" checked={draft.showThumbnails} onChange={next => commit({ showThumbnails: next })} label="Mostrar miniaturas bajo el visor" />
                    </label>
                )}
            >
                <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
                    onChange={e => { if (e.target.files) handleFiles(e.target.files); }} />
                <input ref={replaceInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleReplace(f); }} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        type="button"
                        disabled={Boolean(uploading) || remaining === 0}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setFileDragActive(true); } }}
                        onDragLeave={() => setFileDragActive(false)}
                        onDrop={e => { e.preventDefault(); setFileDragActive(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
                        className={`group flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed text-center transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                            fileDragActive ? 'border-rotary-blue bg-blue-50/50' : 'border-gray-300 hover:border-rotary-blue bg-gray-50/50 hover:bg-blue-50/30'
                        }`}
                    >
                        {uploading ? (
                            <span className="flex flex-col items-center gap-2">
                                <span className="w-7 h-7 border-2 border-rotary-blue border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs text-gray-600 font-medium">
                                    {uploading.total > 1 ? `${uploading.label} ${Math.min(uploading.done + 1, uploading.total)} de ${uploading.total}…` : `${uploading.label} y optimizando…`}
                                </span>
                            </span>
                        ) : (
                            <>
                                <span className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 group-hover:text-rotary-blue mb-2"><Upload className="w-5 h-5" /></span>
                                <span className="text-xs font-bold text-gray-800 group-hover:text-rotary-blue">Subir diapositivas</span>
                                <span className="text-[11px] text-gray-400 mt-0.5">Una o varias, en el orden elegido · o suéltalas aquí</span>
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        disabled={remaining === 0}
                        onClick={() => { setPickerMode('add'); setPickerOpen(true); }}
                        className="group flex flex-col items-center justify-center p-5 rounded-xl border border-gray-200 hover:border-rotary-blue bg-white hover:bg-blue-50/30 text-center transition-all disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <span className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-rotary-blue group-hover:text-white mb-2"><FolderOpen className="w-5 h-5" /></span>
                        <span className="text-xs font-bold text-gray-800 group-hover:text-rotary-blue">Elegir de la Biblioteca</span>
                        <span className="text-[11px] text-gray-400 mt-0.5">Reutilizar imágenes ya cargadas en el sitio</span>
                    </button>
                </div>

                {notice && (
                    <p className={`text-xs flex items-start gap-1.5 font-medium ${notice.tone === 'error' ? 'text-red-600' : 'text-blue-800'}`}>
                        <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" /><span>{notice.text}</span>
                    </p>
                )}

                {slides.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-600">
                        <Hotel className="h-6 w-6 shrink-0 text-gray-400" />
                        <span>Todavía no has agregado diapositivas de hoteles para este evento.</span>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Orden de presentación</span>
                            {slides.length > 1 && <span className="text-[11px] text-gray-400">Arrastra las miniaturas o usa las flechas</span>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                            {slides.map((s, i) => (
                                <SlideTile
                                    key={s.id}
                                    slide={s}
                                    index={i}
                                    total={slides.length}
                                    selected={selected?.id === s.id}
                                    dragOver={dragOverId === s.id && dragId !== s.id}
                                    onSelect={() => setSelectedId(s.id)}
                                    onMove={delta => moveSlide(s.id, i + delta)}
                                    onToggle={() => updateSlide(s.id, { enabled: !s.enabled })}
                                    onRemove={() => removeSlide(s.id)}
                                    onDragStart={e => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); }}
                                    onDragOver={e => { if (dragId) { e.preventDefault(); setDragOverId(s.id); } }}
                                    onDragLeave={() => setDragOverId(prev => (prev === s.id ? null : prev))}
                                    onDrop={e => { e.preventDefault(); if (dragId) moveSlide(dragId, i); setDragId(null); setDragOverId(null); }}
                                    onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                                />
                            ))}
                        </div>

                        {selected && (
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                                <div className="md:col-span-2 rounded-lg bg-white ring-1 ring-gray-200 overflow-hidden aspect-[16/10]">
                                    <img src={sanitizeHotelUrl(selected.mediumUrl || selected.imageUrl)} alt="" className="h-full w-full object-contain" />
                                </div>
                                <div className="md:col-span-3 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-bold text-gray-900">Diapositiva {selectedIndex + 1}</p>
                                        <div className="flex items-center gap-1">
                                            <button type="button" onClick={() => moveSlide(selected.id, selectedIndex - 1)} disabled={selectedIndex <= 0} aria-label="Subir en el orden" className="p-1.5 rounded-lg text-gray-500 hover:bg-white disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                                            <button type="button" onClick={() => moveSlide(selected.id, selectedIndex + 1)} disabled={selectedIndex >= slides.length - 1} aria-label="Bajar en el orden" className="p-1.5 rounded-lg text-gray-500 hover:bg-white disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-gray-500 break-all">
                                        {selected.fileName || selected.imageUrl.split('/').pop()}
                                        {selected.width && selected.height ? ` · ${selected.width} × ${selected.height} px` : ''}
                                        {selected.mediumUrl ? ' · optimizada' : ' · desde la Biblioteca o URL'}
                                    </p>
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1" htmlFor={`hotels-alt-${selected.id}`}>Texto alternativo (accesibilidad)</label>
                                        <input
                                            id={`hotels-alt-${selected.id}`}
                                            type="text"
                                            value={selected.altText}
                                            maxLength={HOTEL_LIMITS.altMax}
                                            onChange={e => updateSlide(selected.id, { altText: e.target.value })}
                                            placeholder="Ej.: Hotel Estelar Villavicencio: tarifas, servicios y reservas"
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none bg-white"
                                        />
                                        <p className="mt-1 text-[11px] text-gray-400">Lo leen los lectores de pantalla. Nombra el hotel y lo esencial (tarifa, contacto).</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 mr-2">
                                            <ToggleSwitch size="sm" checked={selected.enabled} onChange={next => updateSlide(selected.id, { enabled: next })} label="Mostrar esta diapositiva" />
                                            {selected.enabled ? 'Visible' : 'Oculta'}
                                        </label>
                                        <button type="button" disabled={Boolean(uploading)} onClick={() => replaceInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-rotary-blue hover:text-rotary-blue disabled:opacity-50">
                                            <RefreshCw className="h-3.5 w-3.5" /> Reemplazar
                                        </button>
                                        <button type="button" onClick={() => { setPickerMode('replace'); setPickerOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-rotary-blue hover:text-rotary-blue">
                                            <FolderOpen className="h-3.5 w-3.5" /> Desde la Biblioteca
                                        </button>
                                        <button type="button" onClick={() => removeSlide(selected.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 bg-white text-xs font-semibold text-red-600 hover:bg-red-50">
                                            <Trash2 className="h-3.5 w-3.5" /> Eliminar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Card>

            {/* Guía descargable */}
            <Card
                title="Guía descargable"
                hint="La presentación completa (PDF) para que los asistentes la guarden."
                icon={<FileText className="h-4 w-4" />}
                right={(
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                        Permitir descargar presentación de hoteles
                        <ToggleSwitch size="sm" checked={draft.allowDownload} onChange={next => commit({ allowDownload: next })} label="Permitir descargar presentación de hoteles" />
                    </label>
                )}
            >
                <input ref={docInputRef} type="file" accept="application/pdf,.pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleDocument(f); }} />
                {draft.document ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                        <div className="flex items-start gap-3 min-w-0">
                            <FileText className="h-8 w-8 shrink-0 text-red-500" />
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{draft.document.fileName}</p>
                                <p className="text-[11px] text-gray-500">
                                    PDF{draft.document.sizeBytes ? ` · ${formatBytes(draft.document.sizeBytes)}` : ''}
                                    {draft.document.uploadedAt ? ` · subido el ${formatWhen(draft.document.uploadedAt)}` : ''}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <a href={draft.document.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:text-rotary-blue">
                                <Download className="h-3.5 w-3.5" /> Ver
                            </a>
                            <button type="button" disabled={docUploading} onClick={() => docInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:text-rotary-blue disabled:opacity-50">
                                <RefreshCw className="h-3.5 w-3.5" /> {docUploading ? 'Subiendo…' : 'Reemplazar'}
                            </button>
                            <button type="button" onClick={() => commit({ document: null })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 bg-white text-xs font-semibold text-red-600 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5" /> Quitar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        disabled={docUploading}
                        onClick={() => docInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:border-rotary-blue hover:text-rotary-blue disabled:opacity-60"
                    >
                        {docUploading ? <><span className="w-4 h-4 border-2 border-rotary-blue border-t-transparent rounded-full animate-spin" /> Subiendo y verificando el PDF…</> : <><Upload className="h-4 w-4" /> Subir la guía en PDF (hasta {HOTEL_LIMITS.maxDocumentMb} MB)</>}
                    </button>
                )}
                {docError && <p className="text-xs text-red-600 flex items-start gap-1.5 font-medium"><AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />{docError}</p>}
                {draft.allowDownload && !draft.document && (
                    <p className="text-xs text-amber-700 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />La descarga está permitida pero no hay archivo: el botón no aparecerá hasta que subas la guía.</p>
                )}
                {!draft.allowDownload && draft.document && (
                    <p className="text-xs text-gray-500">El archivo está cargado pero la descarga está desactivada: el botón no aparece en la página pública.</p>
                )}
            </Card>

            {/* Vista previa con el componente público */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5"><Eye className="h-4 w-4" /> Vista previa</p>
                    {!draft.enabled && visible.length > 0 && (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">Oculta en el sitio: así se verá al publicarla</span>
                    )}
                </div>
                {visible.length > 0 ? (
                    <div className="mx-auto max-w-3xl">
                        <EventHotelsSection hotels={previewConfig} eventTitle={eventTitle} preview />
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 text-center py-8">Todavía no has agregado diapositivas de hoteles para este evento.</p>
                )}
                <p className="mt-4 text-[11px] text-gray-400 text-center">Los cambios se publican al pulsar «Guardar todos los cambios».</p>
            </div>

            {/* Historial y mantenimiento */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Historial de cambios" hint="Lo registra el servidor al guardar: quién, cuándo y qué." icon={<History className="h-4 w-4" />}>
                    {stored?.updatedAt && (
                        <p className="text-xs text-gray-600">
                            Última actualización: <b>{formatWhen(stored.updatedAt)}</b>{stored.updatedBy?.name ? ` por ${stored.updatedBy.name}` : ''}
                        </p>
                    )}
                    {draft.ratesUpdatedOn && <p className="text-xs text-gray-600">Tarifas vigentes al <b>{formatRatesDate(draft.ratesUpdatedOn)}</b>.</p>}
                    {history.length === 0 ? (
                        <p className="text-xs text-gray-400">Sin cambios registrados todavía.</p>
                    ) : (
                        <ol className="space-y-2.5">
                            {shownHistory.map((h, i) => (
                                <li key={`${h.at}-${i}`} className="text-xs border-l-2 border-blue-100 pl-3">
                                    <p className="font-semibold text-gray-800">{formatWhen(h.at)}{h.by?.name ? ` · ${h.by.name}` : ''}</p>
                                    <p className="text-gray-500">{h.changes.join(' · ')}</p>
                                </li>
                            ))}
                        </ol>
                    )}
                    {history.length > 5 && (
                        <button type="button" onClick={() => setShowAllHistory(v => !v)} className="text-xs font-semibold text-rotary-blue hover:underline">
                            {showAllHistory ? 'Ver menos' : `Ver los ${history.length} cambios`}
                        </button>
                    )}
                </Card>

                <Card title="Archivos sin uso" hint="Diapositivas o guías reemplazadas que ya ninguna página usa." icon={<Trash2 className="h-4 w-4" />}>
                    <p className="text-xs text-gray-500">
                        Sólo se revisan los archivos que este módulo subió para este evento y que llevan más de 24 horas sin usarse. Las imágenes de la Biblioteca y de otras secciones nunca se tocan.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" disabled={orphansBusy} onClick={checkOrphans} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:text-rotary-blue disabled:opacity-50">
                            <RefreshCw className={`h-3.5 w-3.5 ${orphansBusy ? 'animate-spin' : ''}`} /> Revisar
                        </button>
                        {orphans && orphans.orphans.length > 0 && (
                            <button type="button" disabled={orphansBusy} onClick={releaseOrphans} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 bg-white text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                                <Trash2 className="h-3.5 w-3.5" /> Liberar {orphans.orphans.length} archivo(s) · {formatBytes(orphans.totalBytes)}
                            </button>
                        )}
                    </div>
                    {orphans && orphans.orphans.length === 0 && <p className="text-xs text-emerald-700">No hay archivos sin uso.</p>}
                    {orphansMsg && <p className="text-xs text-gray-700">{orphansMsg}</p>}
                </Card>
            </div>

            <MediaPicker
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                maxSelection={pickerMode === 'replace' ? 1 : Math.max(1, remaining)}
                mediaType="image"
                onSelect={items => {
                    onPick(items.map(it => it?.url).filter((u): u is string => Boolean(u)));
                    setPickerOpen(false);
                }}
            />
        </div>
    );
};

export default EventHotelsEditor;
