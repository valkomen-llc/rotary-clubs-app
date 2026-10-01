// ════════════════════════════════════════════════════════════════════════════
// Modal de Renderizado y Exportación de Video — v4.1141.0
//
// Selección de resolución (720p, 1080p), visualización de progreso en tiempo real
// por etapas: Preparando proyecto → Procesando multimedia → Renderizando → Finalizando → Completado.
// Descarga directa y disponibilidad en Biblioteca Multimedia.
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
    Layers,
    RotateCcw,
    Check
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
}

const STAGES = [
    'Preparando proyecto',
    'Procesando multimedia',
    'Renderizando',
    'Finalizando',
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
    onRefreshStatus
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
            const token = getStudioAuthToken();
            const res = await fetch(`/api/video-editor/projects/${projectId}/render`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ resolution, format })
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
        : (renderProgress >= 85 ? 3 : renderProgress >= 50 ? 2 : renderProgress >= 25 ? 1 : 0);

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-white animate-in fade-in zoom-in-95 duration-200">
                {/* Encabezado */}
                <div className="p-5 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <Film className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white tracking-tight">Exportar Video Final</h3>
                            <p className="text-xs text-gray-400">{projectTitle}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
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
                                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-2">
                                    Resolución de Renderizado
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => onResolutionChange('1080p')}
                                        className={`p-3.5 rounded-xl border text-left transition-all ${
                                            resolution === '1080p'
                                                ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                                                : 'bg-gray-800/80 border-gray-700/60 text-gray-300 hover:border-gray-600'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-bold">1080p Full HD</span>
                                            {resolution === '1080p' && <Check className="w-4 h-4 text-indigo-400" />}
                                        </div>
                                        <p className="text-[11px] text-gray-400">Máxima nitidez para redes y pantallas grandes</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => onResolutionChange('720p')}
                                        className={`p-3.5 rounded-xl border text-left transition-all ${
                                            resolution === '720p'
                                                ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                                                : 'bg-gray-800/80 border-gray-700/60 text-gray-300 hover:border-gray-600'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-bold">720p HD</span>
                                            {resolution === '720p' && <Check className="w-4 h-4 text-indigo-400" />}
                                        </div>
                                        <p className="text-[11px] text-gray-400">Renderizado rápido y menor peso de archivo</p>
                                    </button>
                                </div>
                            </div>

                            {/* Resumen del Proyecto */}
                            <div className="bg-gray-950 p-3.5 rounded-xl border border-gray-800 space-y-2 text-xs">
                                <div className="flex justify-between text-gray-400">
                                    <span>Formato:</span>
                                    <span className="font-semibold text-white">{format}</span>
                                </div>
                                <div className="flex justify-between text-gray-400">
                                    <span>Duración aproximada:</span>
                                    <span className="font-semibold text-white">{duration.toFixed(1)} segundos</span>
                                </div>
                                <div className="flex justify-between text-gray-400">
                                    <span>Almacenamiento:</span>
                                    <span className="font-semibold text-emerald-400">Biblioteca Multimedia de Club Platform</span>
                                </div>
                            </div>

                            <button
                                onClick={handleStartRender}
                                disabled={submitting}
                                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 transition-transform active:scale-95"
                            >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                <span>Iniciar Renderizado Asíncrono</span>
                            </button>
                        </>
                    )}

                    {renderStatus === 'rendering' && (
                        <div className="py-4 space-y-5">
                            {/* Barra de Progreso */}
                            <div>
                                <div className="flex justify-between text-xs font-semibold mb-2">
                                    <span className="text-indigo-400 flex items-center gap-1.5">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>{renderStage || 'Procesando...'}</span>
                                    </span>
                                    <span className="text-gray-400">{renderProgress}%</span>
                                </div>
                                <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        style={{ width: `${renderProgress}%` }}
                                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 rounded-full"
                                    />
                                </div>
                            </div>

                            {/* Pasos / Etapas */}
                            <div className="space-y-2 pt-2">
                                {STAGES.map((stg, idx) => {
                                    const isDone = idx < currentStageIndex;
                                    const isCurrent = idx === currentStageIndex;
                                    return (
                                        <div
                                            key={stg}
                                            className={`flex items-center gap-2.5 text-xs transition-colors ${
                                                isDone
                                                    ? 'text-emerald-400 font-medium'
                                                    : isCurrent
                                                    ? 'text-indigo-300 font-bold'
                                                    : 'text-gray-600'
                                            }`}
                                        >
                                            {isDone ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                            ) : isCurrent ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                                            ) : (
                                                <div className="w-4 h-4 rounded-full border border-gray-700 shrink-0" />
                                            )}
                                            <span>{stg}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            <p className="text-[11px] text-gray-400 text-center">
                                Puedes cerrar esta ventana. El video se procesa en el servidor y estará listo en tu Biblioteca Multimedia.
                            </p>
                        </div>
                    )}

                    {renderStatus === 'completed' && videoUrl && (
                        <div className="space-y-4">
                            <div className="aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 shadow-lg">
                                <video
                                    src={videoUrl}
                                    controls
                                    playsInline
                                    className="w-full h-full object-contain"
                                />
                            </div>

                            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-center gap-2.5 text-emerald-300 text-xs">
                                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                                <span>Video renderizado con éxito y respaldado en la Biblioteca Multimedia.</span>
                            </div>

                            <div className="flex gap-2">
                                <a
                                    href={videoUrl}
                                    download={`${projectTitle}.mp4`}
                                    className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>Descargar MP4</span>
                                </a>

                                <button
                                    onClick={handleStartRender}
                                    className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                                    title="Volver a renderizar"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    <span>Re-renderizar</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {renderStatus === 'error' && (
                        <div className="space-y-4 text-center py-4">
                            <div className="w-12 h-12 rounded-full bg-rose-950/60 border border-rose-800/80 flex items-center justify-center mx-auto text-rose-400">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-white">Error en el Renderizado</h4>
                                <p className="text-xs text-rose-300 mt-1 max-w-sm mx-auto">
                                    {errorDetail || 'Ocurrió un error inesperado al procesar los clips.'}
                                </p>
                            </div>
                            <p className="text-[11px] text-gray-400">
                                Tu proyecto y clips se mantienen intactos. Puedes reintentar la operación.
                            </p>
                            <button
                                onClick={handleStartRender}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl inline-flex items-center gap-2 shadow-lg"
                            >
                                <RotateCcw className="w-4 h-4" />
                                <span>Reintentar Render</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
