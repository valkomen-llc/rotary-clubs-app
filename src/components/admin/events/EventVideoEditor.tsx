// ════════════════════════════════════════════════════════════════════
// Editor de Video del Evento — Club Platform
//
// Administra `metadata.video` del evento:
//   • URL del video (YouTube, Vimeo, enlace directo o archivo propio)
//   • Portada personalizada con subida a S3 o selección de biblioteca
//   • Título y descripción / pie de video opcionales
//   • Detección y validación en tiempo real del proveedor
//   • Previsualización en vivo integrada para verificar la reproducción
// ════════════════════════════════════════════════════════════════════
import React, { useRef, useState } from 'react';
import {
    Video, Play, Upload, Trash2, CheckCircle2,
    AlertCircle, Image as ImageIcon, Loader2, Sparkles, ExternalLink
} from 'lucide-react';
import ImageSourceOverlay from '../ImageSourceOverlay';
import MediaPicker from '../content-studio/MediaPicker';
import { resolveEventVideo, type EventVideoConfig } from '../../../lib/eventVideo';
import EventVideoPlayer from '../../EventVideoPlayer';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

const inputClass = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1';

interface Props {
    video: EventVideoConfig | null | undefined;
    onChange: (video: EventVideoConfig | null) => void;
    fallbackCover?: string | null;
}

export const EventVideoEditor: React.FC<Props> = ({
    video: raw,
    onChange,
    fallbackCover,
}) => {
    const video = raw || {};
    const [pickerOpen, setPickerOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const videoFileRef = useRef<HTMLInputElement>(null);

    const update = (patch: Partial<EventVideoConfig>) => {
        onChange({
            ...video,
            ...patch,
            enabled: patch.enabled !== undefined ? patch.enabled : (video.enabled !== false),
        });
    };

    const handleClear = () => {
        if (confirm('¿Deseas eliminar la configuración del video para este evento?')) {
            onChange(null);
        }
    };

    const resolved = resolveEventVideo(video);
    const hasUrl = Boolean(video.url?.trim());

    // Subida de imagen de portada personalizada
    const uploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const form = new FormData();
            form.append('image', file);
            const res = await fetch(`${API}/calendar/events/upload-image`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
                body: form,
            });
            const data = await res.json();
            if (data.url) update({ coverImage: data.url });
            else alert('No pudimos subir la imagen de portada.');
        } catch {
            alert('No pudimos subir la imagen de portada.');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    // Subida directa de archivo de video (MP4/WEBM)
    const uploadVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingVideo(true);
        try {
            const form = new FormData();
            form.append('video', file);
            const res = await fetch(`${API}/calendar/events/upload-video`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
                body: form,
            });
            const data = await res.json();
            if (data.url) update({ url: data.url });
            else alert(data?.error || 'No pudimos subir el archivo de video.');
        } catch {
            alert('No pudimos subir el archivo de video. Verifica el tamaño de archivo o tu conexión.');
        } finally {
            setUploadingVideo(false);
            if (videoFileRef.current) videoFileRef.current.value = '';
        }
    };

    return (
        <div className="space-y-6 bg-white border border-gray-200/80 rounded-2xl p-5 sm:p-6 shadow-sm">
            {/* Cabecera del Módulo */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 text-rotary-blue flex items-center justify-center font-bold">
                        <Video className="w-5 h-5 text-rotary-blue" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-900">
                            Video Promocional / Informativo del Evento
                        </h3>
                        <p className="text-xs text-gray-500">
                            Aparece destacado en la página pública entre la descripción y la galería de fotos.
                        </p>
                    </div>
                </div>

                {hasUrl && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors self-start sm:self-auto"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Quitar video
                    </button>
                )}
            </div>

            {/* Input URL del Video */}
            <div>
                <label className={labelClass}>
                    Enlace del video (YouTube, Vimeo o URL directa)
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={video.url || ''}
                        onChange={e => update({ url: e.target.value })}
                        placeholder="Ej: https://www.youtube.com/watch?v=... o https://vimeo.com/... o código iframe"
                        className={`${inputClass} pr-28`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {/* Botón opcional para subir archivo de video */}
                        <button
                            type="button"
                            onClick={() => videoFileRef.current?.click()}
                            disabled={uploadingVideo}
                            className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-rotary-blue bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex items-center gap-1"
                            title="Subir archivo MP4/WEBM directamente"
                        >
                            {uploadingVideo ? (
                                <Loader2 className="w-3 h-3 animate-spin text-rotary-blue" />
                            ) : (
                                <Upload className="w-3 h-3" />
                            )}
                            <span className="hidden sm:inline">Subir MP4</span>
                        </button>
                        <input
                            ref={videoFileRef}
                            type="file"
                            accept="video/mp4,video/webm,video/ogg,video/quicktime"
                            className="hidden"
                            onChange={uploadVideoFile}
                        />
                    </div>
                </div>

                {/* Badge de estado en tiempo real */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {hasUrl ? (
                        resolved ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md font-medium border border-emerald-200/60">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                {resolved.provider === 'youtube' && `YouTube detectado (ID: ${resolved.videoId})`}
                                {resolved.provider === 'vimeo' && `Vimeo detectado (ID: ${resolved.videoId})`}
                                {resolved.provider === 'direct' && 'Archivo de video directo detectado'}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md font-medium border border-amber-200/60">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                Ingresa un enlace válido de YouTube, Vimeo o archivo .mp4/.webm
                            </span>
                        )
                    ) : (
                        <span className="text-gray-400">
                            Pega un enlace de YouTube, Vimeo, Short o pega el bloque iframe completo. Si lo dejas vacío, no se mostrará nada en la página pública.
                        </span>
                    )}
                </div>
            </div>

            {/* Fila: Portada del Video y Título/Descripción */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                {/* ── Portada personalizada del video ── */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className={labelClass}>Imagen de portada (Poster)</span>
                        {resolved?.provider === 'youtube' && !video.coverImage && (
                            <span className="text-[11px] text-sky-600 font-medium flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> Miniatura automática de YouTube activa
                            </span>
                        )}
                    </div>

                    <div className="group relative aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
                        {video.coverImage || resolved?.thumbnailUrl || fallbackCover ? (
                            <img
                                src={video.coverImage || resolved?.thumbnailUrl || fallbackCover || ''}
                                alt="Portada de video"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="flex flex-col items-center gap-1.5 text-gray-400 text-xs">
                                <ImageIcon className="w-6 h-6 stroke-1" />
                                <span>Sin portada definida</span>
                            </div>
                        )}

                        {uploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-xs">
                                <Loader2 className="h-6 w-6 animate-spin text-rotary-blue" />
                            </div>
                        )}

                        {/* Capa de opciones: Subir / Biblioteca / Quitar */}
                        <ImageSourceOverlay
                            hasImage={Boolean(video.coverImage)}
                            onUploadClick={() => fileRef.current?.click()}
                            onPickerClick={() => setPickerOpen(true)}
                            onRemove={() => update({ coverImage: '' })}
                        />

                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={uploadCover}
                        />
                    </div>

                    <p className="mt-1.5 text-[11px] text-gray-400">
                        Opcional. Se muestra con el botón central de reproducir antes de iniciar el video.
                    </p>
                </div>

                {/* ── Título y Descripción Opcionales ── */}
                <div className="space-y-4">
                    <div>
                        <label className={labelClass}>Título del video (Opcional)</label>
                        <input
                            type="text"
                            value={video.title || ''}
                            onChange={e => update({ title: e.target.value })}
                            placeholder="Ej: Video Promocional Villavicencio 2027"
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Pie de video / Descripción (Opcional)</label>
                        <textarea
                            rows={3}
                            value={video.description || ''}
                            onChange={e => update({ description: e.target.value })}
                            placeholder="Breve reseña sobre lo que presenta el video..."
                            className={`${inputClass} resize-none`}
                        />
                    </div>
                </div>
            </div>

            {/* ── Previsualización en Vivo en el Panel ── */}
            {resolved && (
                <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                            <Play className="w-3.5 h-3.5 text-rotary-blue fill-rotary-blue" />
                            Vista previa en vivo (Así se verá en la página del evento)
                        </span>
                        {resolved.embedUrl && (
                            <a
                                href={resolved.originalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-rotary-blue hover:underline inline-flex items-center gap-1 font-medium"
                            >
                                Probar enlace directo <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>

                    <div className="max-w-2xl mx-auto">
                        <EventVideoPlayer
                            video={video}
                            fallbackCover={fallbackCover}
                            className="border border-gray-200/80 rounded-2xl overflow-hidden shadow-md"
                        />
                    </div>
                </div>
            )}

            {/* Selector de la Librería de Medios */}
            <MediaPicker
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={(media: any) => {
                    if (media?.url) update({ coverImage: media.url });
                    setPickerOpen(false);
                }}
            />
        </div>
    );
};

export default EventVideoEditor;
