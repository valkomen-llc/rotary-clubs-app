// ════════════════════════════════════════════════════════════════════════════
// Modal de Renderizado y Exportación de Video (Tema Claro) — v4.1143.0
//
// Selección de resolución (720p, 1080p), progreso por etapas progresivas,
// previsualización y descarga directa en alta calidad.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import {
    X,
    Film,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Download,
    Check,
    RotateCcw
} from 'lucide-react';
import type { Resolution, AspectRatio } from './types';
import { getStudioAuthToken } from '../../../lib/contentStudioFeatures';
import { toast } from 'sonner';

interface VideoEditorExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    projectTitle: string;
    format: AspectRatio;
    resolution: Resolution;
    onResolutionChange: (res: Resolution) => void;
    duration: number;
    videoUrl?: string | null;
    renderStatus: 'idle' | 'rendering' | 'completed' | 'error';
    renderProgress: number;
    renderStage?: string;
    errorDetail?: string | null;
    onRenderStarted: () => void;
    onRefreshStatus: () => void;
    subtitles?: any;
    clips?: any[];
    tracks?: any[];
}

const STAGES = [
    'Preparando archivos',
    'Descargando recursos',
    'Normalizando video',
    'Procesando audio',
    'Componiendo línea de tiempo',
    'Renderizando subtítulos',
    'Codificando video',
    'Generando archivo final',
    'Completado'
];

export const VideoEditorExportModal: React.FC<VideoEditorExportModalProps> = ({
    isOpen,
    onClose,
    projectId,
    projectTitle,
    format,
    resolution,
    onResolutionChange,
    duration,
    videoUrl,
    renderStatus,
    renderProgress,
    renderStage,
    errorDetail,
    onRenderStarted,
    onRefreshStatus,
    subtitles,
    clips,
    tracks
}) => {
    const [submitting, setSubmitting] = useState(false);

    // Sondeo de estado cuando renderStatus === 'rendering'
    useEffect(() => {
        if (!isOpen || renderStatus !== 'rendering') return;

        const interval = setInterval(() => {
            onRefreshStatus();
        }, 2000);

        return () => clearInterval(interval);
    }, [isOpen, renderStatus, onRefreshStatus]);

    if (!isOpen) return null;

    const handleStartRender = async () => {
        try {
            setSubmitting(true);
            console.log('[EXPORT] Iniciando solicitud de render:', {
                projectId,
                resolution,
                format,
                activeLanguage: subtitles?.activeLanguage,
                segmentsCount: subtitles?.segments?.length,
                clipsCount: clips?.length
            });
            const token = getStudioAuthToken();
            const res = await fetch(`/api/video-editor/projects/${projectId}/render`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    resolution,
                    format,
                    ...(subtitles ? { subtitles } : {}),
                    ...(clips ? { clips } : {}),
                    ...(tracks ? { tracks } : {})
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Error al iniciar render');
            }

            toast.success('¡Renderizado iniciado en segundo plano!');
            onRenderStarted();
        } catch (err: any) {
            console.error('[VideoEditorExportModal] Render error:', err);
            toast.error(err.message || 'Error al iniciar render');
        } finally {
            setSubmitting(false);
        }
    };

    const currentStageIndex = STAGES.indexOf(renderStage || '') !== -1
        ? STAGES.indexOf(renderStage || '')
        : (renderProgress >= 95 ? 7 : renderProgress >= 85 ? 6 : renderProgress >= 75 ? 5 : renderProgress >= 65 ? 4 : renderProgress >= 50 ? 3 : renderProgress >= 35 ? 2 : renderProgress >= 15 ? 1 : 0);

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
            <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-gray-800">
                {/* Encabezado */}
                <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-slate-50/70">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#013388]">
                            <Film className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900 tracking-tight">Exportar Video Final</h3>
                            <p className="text-xs text-gray-500">{projectTitle}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Contenido según el estado */}
                <div className="p-6 space-y-5">
                    {renderStatus === 'idle' && (
                        <>
                            {/* Selección de Resolución */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-gray-600 block mb-2">
                                    Resolución de Renderizado
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => onResolutionChange('1080p')}
                                        className={`p-3.5 rounded-xl border text-left transition-all ${
                                            resolution === '1080p'
                                                ? 'bg-blue-50 border-[#013388] text-gray-900 shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-bold text-gray-900">1080p Full HD</span>
                                            {resolution === '1080p' && <Check className="w-4 h-4 text-[#013388]" />}
                                        </div>
                                        <p className="text-[11px] text-gray-500">Máxima nitidez para redes y pantallas grandes</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => onResolutionChange('720p')}
                                        className={`p-3.5 rounded-xl border text-left transition-all ${
                                            resolution === '720p'
                                                ? 'bg-blue-50 border-[#013388] text-gray-900 shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-bold text-gray-900">720p HD</span>
                                            {resolution === '720p' && <Check className="w-4 h-4 text-[#013388]" />}
                                        </div>
                                        <p className="text-[11px] text-gray-500">Renderizado rápido y menor peso de archivo</p>
                                    </button>
                                </div>
                            </div>

                            {/* Ficha técnica */}
                            <div className="p-3.5 bg-slate-50 rounded-xl border border-gray-200 space-y-2 text-xs text-gray-600">
                                <div className="flex items-center justify-between">
                                    <span>Formato:</span>
                                    <strong className="text-gray-900">{format}</strong>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Duración estimada:</span>
                                    <strong className="text-gray-900">{duration} segundos</strong>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Motor de procesamiento:</span>
                                    <strong className="text-gray-900">FFmpeg Cloud Cluster</strong>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleStartRender}
                                disabled={submitting}
                                className="w-full py-3 bg-[#013388] hover:bg-[#002868] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-900/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                <span>Iniciar Renderizado Asíncrono</span>
                            </button>
                        </>
                    )}

                    {renderStatus === 'rendering' && (
                        <div className="space-y-6 py-4">
                            <div className="text-center space-y-2">
                                <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-[#013388]">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                                <h4 className="text-sm font-bold text-gray-900">Componiendo video en la nube...</h4>
                                <p className="text-xs text-gray-500">
                                    Puedes cerrar este modal o continuar trabajando mientras el render concluye.
                                </p>
                            </div>

                            {/* Barra de progreso */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs font-semibold text-gray-600">
                                    <span>{renderStage || 'Procesando fotogramas...'}</span>
                                    <span>{Math.round(renderProgress)}%</span>
                                </div>
                                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        style={{ width: `${renderProgress}%` }}
                                        className="h-full bg-[#013388] transition-all duration-300 rounded-full"
                                    />
                                </div>
                            </div>

                            {/* Etapas */}
                            <div className="grid grid-cols-9 gap-1 pt-2">
                                {STAGES.map((stg, i) => (
                                    <div key={stg} className="text-center space-y-1" title={stg}>
                                        <div
                                            className={`h-1.5 rounded-full transition-colors ${
                                                i <= currentStageIndex ? 'bg-[#013388]' : 'bg-gray-200'
                                            }`}
                                        />
                                        <span className={`text-[8px] block truncate leading-tight transition-colors ${
                                            i === currentStageIndex ? 'font-bold text-[#013388]' : (i < currentStageIndex ? 'text-gray-600 font-medium' : 'text-gray-400')
                                        }`}>
                                            {stg.split(' ')[0]}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {renderStatus === 'completed' && (
                        <div className="space-y-5 text-center py-2">
                            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600 shadow-xs">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <div>
                                <h4 className="text-base font-bold text-gray-900">¡Video renderizado con éxito!</h4>
                                <p className="text-xs text-gray-500 mt-1">
                                    Tu video ha sido procesado en {resolution} y guardado en tu Biblioteca Multimedia.
                                </p>
                            </div>

                            {videoUrl && (
                                <div className="aspect-video bg-neutral-900 rounded-xl overflow-hidden shadow-lg border border-gray-200">
                                    <video src={videoUrl} controls className="w-full h-full object-contain" />
                                </div>
                            )}

                            <div className="flex items-center gap-3 pt-2">
                                {videoUrl && (
                                    <a
                                        href={videoUrl}
                                        download={`${projectTitle || 'video'}.mp4`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-2.5 bg-[#013388] hover:bg-[#002868] text-white rounded-xl text-xs font-bold shadow-md shadow-blue-900/20 flex items-center justify-center gap-2 transition-all"
                                    >
                                        <Download className="w-4 h-4" />
                                        <span>Descargar Video MP4</span>
                                    </a>
                                )}
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-gray-700 rounded-xl text-xs font-semibold transition-colors"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    )}

                    {renderStatus === 'error' && (
                        <div className="space-y-4 text-center py-4">
                            <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
                                <AlertCircle className="w-7 h-7" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Error durante el renderizado</h4>
                                <p className="text-xs text-rose-600 mt-1">{errorDetail || 'Ocurrió un error inesperado al componer el video.'}</p>
                            </div>
                            <button
                                onClick={handleStartRender}
                                className="px-4 py-2 bg-[#013388] text-white rounded-xl text-xs font-bold hover:bg-[#002868] transition-colors inline-flex items-center gap-1.5"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Reintentar Render</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
