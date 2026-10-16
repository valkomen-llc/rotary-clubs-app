// ════════════════════════════════════════════════════════════════════
// Editor de Widgets y Contenido Complementario del Evento — v4.1207.0
//
// Permite configurar componentes laterales por evento:
// - Imagen lateral del evento (afiche oficial, código de vestuario, etc.)
// - Subida desde el equipo (JPG, PNG, WebP) o selección de Biblioteca Multimedia
// - Vista previa en tiempo real
// - Activación / desactivación
// - Título configurable, texto alternativo (alt) y enlace opcional de destino
// - Preparado para admitir widgets complementarios adicionales
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
    CheckCircle2,
    AlertCircle,
    Layers,
    ArrowUpRight
} from 'lucide-react';
import MediaPicker from '../content-studio/MediaPicker';
import {
    draftSidebarImageWidget,
    type EventSidebarImageWidget,
    type EventWidgetsConfig,
} from '../../../lib/eventWidgets';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

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
    const sidebarImage: EventSidebarImageWidget = draftSidebarImageWidget(widgets.sidebarImage);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [activeInputTab, setActiveInputTab] = useState<'upload' | 'url'>('upload');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const updateSidebarImage = (patch: Partial<EventSidebarImageWidget>) => {
        const updated: EventSidebarImageWidget = {
            ...sidebarImage,
            ...patch,
        };
        onChange({
            ...widgets,
            sidebarImage: updated,
        });
    };

    const handleFileUpload = async (file: File) => {
        // Validar tipos admitidos: JPG, PNG, WebP
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type.toLowerCase()) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
            setUploadError('Formato no admitido. Selecciona una imagen JPG, PNG o WebP.');
            return;
        }

        setUploadError(null);
        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('image', file);

            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/calendar/events/upload-image`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => null);
                throw new Error(errData?.error || 'Error al subir la imagen');
            }

            const data = await res.json();
            if (data.url) {
                updateSidebarImage({
                    imageUrl: data.url,
                    enabled: true, // Si sube una imagen, se activa por comodidad
                });
            } else {
                throw new Error('Respuesta inválida del servidor');
            }
        } catch (err: any) {
            setUploadError(err.message || 'No pudimos subir la imagen. Inténtalo de nuevo.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileUpload(file);
    };

    const handleRemoveImage = () => {
        updateSidebarImage({
            imageUrl: '',
        });
    };

    const hasImage = Boolean(sidebarImage.imageUrl && sidebarImage.imageUrl.trim().length > 0);

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
                                    Imagen lateral activa
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
                            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                Imagen lateral del evento
                                <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-medium border border-blue-100">
                                    Columna derecha · Debajo del mapa
                                </span>
                            </h3>
                            <p className="mt-0.5 text-xs text-gray-500">
                                Ubicada inmediatamente debajo del mapa de la sede. Ideal para afiches oficiales, código de vestuario, patrocinadores o material promocional vertical.
                            </p>
                        </div>
                    </div>

                    {/* Interruptor de activación / desactivación */}
                    <div className="flex items-center gap-3 shrink-0 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-xs">
                        <span className="text-xs font-medium text-gray-700">
                            {sidebarImage.enabled ? 'Visualización activa' : 'Visualización pausada'}
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={sidebarImage.enabled}
                            onClick={() => updateSidebarImage({ enabled: !sidebarImage.enabled })}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-rotary-blue focus:ring-offset-2 ${
                                sidebarImage.enabled ? 'bg-rotary-blue' : 'bg-gray-200'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    sidebarImage.enabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>
                </div>

                {/* Contenido del editor */}
                <div className="p-6 space-y-6">
                    {/* Alerta si está desactivado pero tiene imagen */}
                    {hasImage && !sidebarImage.enabled && (
                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                            <span>La imagen está cargada pero su visualización está pausada. Activa el interruptor para que se muestre en la página pública del evento.</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Columna izquierda: Subida y Controles de la imagen (7 cols) */}
                        <div className="lg:col-span-7 space-y-5">
                            {/* Selector de modo: Subir / URL externa */}
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                                    Archivo de imagen
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

                            {activeInputTab === 'upload' ? (
                                <div className="space-y-3">
                                    {/* Zona de acción: Subir o Biblioteca */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {/* Botón 1: Subir desde el computador */}
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="group relative flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed border-gray-300 hover:border-rotary-blue bg-gray-50/50 hover:bg-blue-50/30 cursor-pointer transition-all text-center"
                                        >
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp,image/*"
                                                className="hidden"
                                                onChange={handleFileChange}
                                            />
                                            {uploading ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-7 h-7 border-2 border-rotary-blue border-t-transparent rounded-full animate-spin" />
                                                    <span className="text-xs text-gray-600 font-medium">Subiendo imagen...</span>
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
                                                        JPG, PNG o WebP (ej: 1080×1350)
                                                    </span>
                                                </>
                                            )}
                                        </div>

                                        {/* Botón 2: Biblioteca multimedia */}
                                        <button
                                            type="button"
                                            onClick={() => setPickerOpen(true)}
                                            className="group relative flex flex-col items-center justify-center p-5 rounded-xl border border-gray-200 hover:border-rotary-blue bg-white hover:bg-blue-50/30 cursor-pointer transition-all text-center shadow-xs"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-rotary-blue group-hover:text-white transition-colors mb-2">
                                                <FolderOpen className="w-5 h-5" />
                                            </div>
                                            <span className="text-xs font-bold text-gray-800 group-hover:text-rotary-blue">
                                                Elegir de la Biblioteca
                                            </span>
                                            <span className="text-[11px] text-gray-400 mt-0.5">
                                                Reutilizar fotos cargadas en el sitio
                                            </span>
                                        </button>
                                    </div>

                                    {uploadError && (
                                        <p className="text-xs text-red-600 flex items-center gap-1.5 font-medium">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            {uploadError}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <input
                                            type="url"
                                            value={sidebarImage.imageUrl}
                                            onChange={e => updateSidebarImage({ imageUrl: e.target.value })}
                                            placeholder="https://ejemplo.com/afiche-promocional.webp"
                                            className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none pr-10"
                                        />
                                        <Link2 className="absolute right-3.5 top-3 w-4 h-4 text-gray-400" />
                                    </div>
                                    <p className="text-[11px] text-gray-400">
                                        Pega la dirección web directa de la imagen (debe comenzar con https://).
                                    </p>
                                </div>
                            )}

                            {/* Acciones de la imagen actual (si existe) */}
                            {hasImage && (
                                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200/80">
                                    <div className="flex items-center gap-2 truncate max-w-xs sm:max-w-md">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                        <span className="text-xs text-gray-600 font-medium truncate">
                                            {sidebarImage.imageUrl.split('/').pop() || 'Imagen asignada'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <a
                                            href={sidebarImage.imageUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-rotary-blue hover:underline inline-flex items-center gap-1 font-semibold"
                                        >
                                            Ver original <ArrowUpRight className="w-3 h-3" />
                                        </a>
                                        <span className="text-gray-300">|</span>
                                        <button
                                            type="button"
                                            onClick={handleRemoveImage}
                                            className="text-xs text-red-600 hover:text-red-700 hover:underline inline-flex items-center gap-1 font-semibold"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" /> Quitar imagen
                                        </button>
                                    </div>
                                </div>
                            )}

                            <hr className="border-gray-100 my-4" />

                            {/* Configuración de Título Opcional */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={sidebarImage.showTitle}
                                            onChange={e => updateSidebarImage({ showTitle: e.target.checked })}
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
                                                onChange={e => updateSidebarImage({ title: e.target.value })}
                                                placeholder="Ej: Código de vestuario"
                                                className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none"
                                            />
                                            <Type className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                                        </div>
                                        <p className="text-[11px] text-gray-400">
                                            Aparece en un encabezado sutil sobre la imagen, con la tipografía oficial del sitio.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Configuración de Accesibilidad (Alt Text) */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                                    Texto alternativo (Alt) para accesibilidad y SEO
                                </label>
                                <input
                                    type="text"
                                    value={sidebarImage.altText || ''}
                                    onChange={e => updateSidebarImage({ altText: e.target.value })}
                                    placeholder={eventTitle ? `Ej: Código de vestuario para ${eventTitle}` : 'Ej: Afiche promocional del evento'}
                                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none"
                                />
                                <p className="text-[11px] text-gray-400">
                                    Describe brevemente el contenido de la imagen para personas con discapacidad visual y motores de búsqueda.
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
                                            value={sidebarImage.linkUrl || ''}
                                            onChange={e => updateSidebarImage({ linkUrl: e.target.value })}
                                            placeholder="Ej: /eventos/villavicencio2027/registro o https://..."
                                            className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none pr-10"
                                        />
                                        <ExternalLink className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                                    </div>
                                    <p className="text-[11px] text-gray-400">
                                        Si se especifica, la imagen se convertirá en un enlace interactivo al ser pulsada.
                                    </p>
                                </div>

                                {sidebarImage.linkUrl && (
                                    <div className="flex items-center gap-4 pl-1">
                                        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="linkTarget"
                                                checked={sidebarImage.openInNewTab === true}
                                                onChange={() => updateSidebarImage({ openInNewTab: true })}
                                                className="w-3.5 h-3.5 text-rotary-blue focus:ring-rotary-blue"
                                            />
                                            Abrir en pestaña nueva (_blank)
                                        </label>
                                        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="linkTarget"
                                                checked={sidebarImage.openInNewTab !== true}
                                                onChange={() => updateSidebarImage({ openInNewTab: false })}
                                                className="w-3.5 h-3.5 text-rotary-blue focus:ring-rotary-blue"
                                            />
                                            Abrir en la misma pestaña
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Columna derecha: Vista previa en vivo en proporción real (5 cols) */}
                        <div className="lg:col-span-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                                    <Eye className="w-3.5 h-3.5 text-rotary-blue" />
                                    Vista previa (Ancho lateral)
                                </span>
                                <span className="text-[11px] text-gray-400">
                                    Ajuste 100% automático
                                </span>
                            </div>

                            {/* Contenedor que simula la columna derecha del sitio */}
                            <div className="bg-gray-100/70 p-4 rounded-2xl border border-gray-200">
                                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">
                                    Columna Lateral Derecha
                                </div>

                                {hasImage ? (
                                    <div className={`bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-200 ${
                                        !sidebarImage.enabled ? 'opacity-50 ring-2 ring-dashed ring-gray-300' : ''
                                    }`}>
                                        {/* Título preview */}
                                        {sidebarImage.showTitle && sidebarImage.title && (
                                            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/70">
                                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 truncate">
                                                    {sidebarImage.title}
                                                </h4>
                                            </div>
                                        )}

                                        {/* Imagen preview con proporción original (4:5 / 1080x1350) */}
                                        <div className="relative bg-gray-50 flex items-center justify-center overflow-hidden">
                                            <img
                                                src={sidebarImage.imageUrl}
                                                alt={sidebarImage.altText || 'Vista previa'}
                                                className="w-full h-auto object-contain block max-h-[460px]"
                                            />

                                            {!sidebarImage.enabled && (
                                                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex flex-col items-center justify-center text-white p-4 text-center">
                                                    <EyeOff className="w-6 h-6 mb-1 opacity-80" />
                                                    <span className="text-xs font-bold">Oculto en la página</span>
                                                    <span className="text-[10px] opacity-80">Activa la visualización para mostrarlo</span>
                                                </div>
                                            )}
                                        </div>

                                        {sidebarImage.linkUrl && (
                                            <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
                                                <span className="truncate max-w-[180px]">🔗 {sidebarImage.linkUrl}</span>
                                                <span className="text-blue-600 font-medium">
                                                    {sidebarImage.openInNewTab ? 'Nueva pestaña' : 'Misma pestaña'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-8 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-300 mb-2">
                                            <ImageIcon className="w-6 h-6" />
                                        </div>
                                        <p className="text-xs font-semibold text-gray-600">Sin imagen configurada</p>
                                        <p className="text-[11px] text-gray-400 mt-1 max-w-[200px]">
                                            Sube un afiche o código de vestuario (1080×1350 vertical o similar) para visualizarlo aquí.
                                        </p>
                                    </div>
                                )}

                                <p className="text-[10px] text-gray-400 mt-3 text-center">
                                    Se adapta automáticamente al ancho del contenedor sin recortes ni distorsión.
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
                maxSelection={1}
                mediaType="image"
                onSelect={items => {
                    if (items[0]?.url) {
                        updateSidebarImage({
                            imageUrl: items[0].url,
                            enabled: true,
                        });
                    }
                    setPickerOpen(false);
                }}
            />
        </div>
    );
};

export default EventWidgetsEditor;
