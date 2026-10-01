// ════════════════════════════════════════════════════════════════════════════
// Panel Contextual de Propiedades (Inspector) — v4.1143.0
//
// Muestra y permite editar en tiempo real los atributos del elemento
// seleccionado (Clip de video, imagen, texto, subtítulo o ajustes generales).
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import {
    Sliders,
    Type,
    Video,
    Image as ImageIcon,
    Music,
    Volume2,
    VolumeX,
    Move,
    Trash2,
    Copy,
    ChevronRight,
    Sparkles,
    Settings,
    Tv,
    Smartphone,
    Square
} from 'lucide-react';
import type {
    Clip,
    Track,
    SubtitleConfig,
    Resolution,
    VideoEditorProjectData
} from './types';

interface VideoEditorInspectorProps {
    selectedClip: Clip | null;
    tracks: Track[];
    project: VideoEditorProjectData;
    onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
    onDeleteClip: (clipId: string) => void;
    onDuplicateClip: (clipId: string) => void;
    onUpdateSubtitles: (updates: Partial<SubtitleConfig>) => void;
    onUpdateProject: (updates: Partial<VideoEditorProjectData>) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

export const VideoEditorInspector: React.FC<VideoEditorInspectorProps> = ({
    selectedClip,
    tracks,
    project,
    onUpdateClip,
    onDeleteClip,
    onDuplicateClip,
    onUpdateProject,
    isCollapsed,
    onToggleCollapse
}) => {
    if (isCollapsed) {
        return (
            <div className="w-10 bg-white border-l border-gray-200 flex flex-col items-center py-3 select-none shrink-0 transition-all">
                <button
                    onClick={onToggleCollapse}
                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                    title="Expandir Inspector de Propiedades"
                >
                    <Sliders className="w-4 h-4 text-[#013388]" />
                </button>
            </div>
        );
    }

    const currentTrack = selectedClip ? tracks.find(t => t.id === selectedClip.trackId) : null;

    return (
        <aside className="w-80 bg-white border-l border-gray-200 flex flex-col select-none shrink-0 z-10 overflow-hidden shadow-xs">
            {/* Header del Inspector */}
            <div className="h-12 px-4 border-b border-gray-200 flex items-center justify-between bg-slate-50/80">
                <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#013388]" />
                    <span className="text-xs font-bold text-gray-800 tracking-tight">
                        {selectedClip ? 'Propiedades del Clip' : 'Ajustes del Proyecto'}
                    </span>
                </div>
                <button
                    onClick={onToggleCollapse}
                    className="p-1 hover:bg-gray-200/70 rounded text-gray-400 hover:text-gray-700 transition-colors"
                    title="Contraer Inspector"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Contenido con scroll */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs text-gray-700">
                {selectedClip ? (
                    <>
                        {/* Identificación del Clip */}
                        <div className="bg-slate-50 rounded-xl p-3 border border-gray-200 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 font-bold text-gray-900 truncate">
                                    {selectedClip.type === 'video' && <Video className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                                    {selectedClip.type === 'image' && <ImageIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                                    {selectedClip.type === 'text' && <Type className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                                    {selectedClip.type === 'audio' && <Music className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                                    <span className="truncate">{selectedClip.name}</span>
                                </div>
                                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">
                                    {selectedClip.type}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-200">
                                <span>Pista: <strong>{currentTrack?.name || 'General'}</strong></span>
                                <span>Duración: <strong>{selectedClip.duration.toFixed(1)}s</strong></span>
                            </div>
                        </div>

                        {/* Propiedades de Texto si es Clip de Texto */}
                        {selectedClip.type === 'text' && (
                            <div className="space-y-3">
                                <label className="block text-xs font-bold text-gray-800">
                                    Contenido del Texto
                                </label>
                                <textarea
                                    value={selectedClip.text || ''}
                                    onChange={(e) => onUpdateClip(selectedClip.id, { text: e.target.value })}
                                    rows={3}
                                    className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-800 focus:bg-white focus:border-[#013388] focus:ring-1 focus:ring-[#013388] outline-none"
                                    placeholder="Escribe el rótulo o título..."
                                />

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                                            Tamaño Fuente
                                        </label>
                                        <input
                                            type="number"
                                            min={12}
                                            max={96}
                                            value={selectedClip.style?.fontSize || 28}
                                            onChange={(e) => onUpdateClip(selectedClip.id, {
                                                style: { ...selectedClip.style, fontSize: Number(e.target.value) }
                                            })}
                                            className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                                            Color Texto
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={selectedClip.style?.color || '#FFFFFF'}
                                                onChange={(e) => onUpdateClip(selectedClip.id, {
                                                    style: { ...selectedClip.style, color: e.target.value }
                                                })}
                                                className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0"
                                            />
                                            <span className="font-mono text-[11px] text-gray-600">
                                                {selectedClip.style?.color || '#FFFFFF'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                                            Fondo de Caja
                                        </label>
                                        <select
                                            value={selectedClip.style?.backgroundColor || 'transparent'}
                                            onChange={(e) => onUpdateClip(selectedClip.id, {
                                                style: { ...selectedClip.style, backgroundColor: e.target.value }
                                            })}
                                            className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 outline-none"
                                        >
                                            <option value="transparent">Sin Fondo</option>
                                            <option value="rgba(0,0,0,0.65)">Negro Semitransparente</option>
                                            <option value="#013388">Azul Rotary</option>
                                            <option value="#D97706">Dorado / Ámbar</option>
                                            <option value="#FFFFFF">Blanco Sólido</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                                            Alineación
                                        </label>
                                        <select
                                            value={selectedClip.style?.align || 'center'}
                                            onChange={(e) => onUpdateClip(selectedClip.id, {
                                                style: { ...selectedClip.style, align: e.target.value as any }
                                            })}
                                            className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 outline-none"
                                        >
                                            <option value="center">Centrado</option>
                                            <option value="left">Izquierda</option>
                                            <option value="right">Derecha</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Transformación y Posición (Video / Imagen / Texto) */}
                        <div className="space-y-3 pt-3 border-t border-gray-200">
                            <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                <Move className="w-3.5 h-3.5 text-blue-600" />
                                <span>Posición y Escala</span>
                            </h4>

                            <div>
                                <div className="flex justify-between text-[11px] font-medium text-gray-600 mb-1">
                                    <span>Escala (Zoom)</span>
                                    <span>{Math.round((selectedClip.transform?.scale || 1) * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min={50}
                                    max={200}
                                    value={Math.round((selectedClip.transform?.scale || 1) * 100)}
                                    onChange={(e) => onUpdateClip(selectedClip.id, {
                                        transform: {
                                            scale: Number(e.target.value) / 100,
                                            x: selectedClip.transform?.x || 0,
                                            y: selectedClip.transform?.y || 0
                                        }
                                    })}
                                    className="w-full accent-[#013388] cursor-pointer"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                                        Desplazamiento X (%)
                                    </label>
                                    <input
                                        type="number"
                                        min={-50}
                                        max={50}
                                        value={selectedClip.transform?.x || 0}
                                        onChange={(e) => onUpdateClip(selectedClip.id, {
                                            transform: {
                                                scale: selectedClip.transform?.scale || 1,
                                                x: Number(e.target.value),
                                                y: selectedClip.transform?.y || 0
                                            }
                                        })}
                                        className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-800 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                                        Desplazamiento Y (%)
                                    </label>
                                    <input
                                        type="number"
                                        min={-50}
                                        max={50}
                                        value={selectedClip.transform?.y || 0}
                                        onChange={(e) => onUpdateClip(selectedClip.id, {
                                            transform: {
                                                scale: selectedClip.transform?.scale || 1,
                                                x: selectedClip.transform?.x || 0,
                                                y: Number(e.target.value)
                                            }
                                        })}
                                        className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-800 outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Controles de Audio si el clip tiene sonido (video o audio) */}
                        {(selectedClip.type === 'video' || selectedClip.type === 'audio') && (
                            <div className="space-y-3 pt-3 border-t border-gray-200">
                                <h4 className="text-xs font-bold text-gray-800 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <Volume2 className="w-3.5 h-3.5 text-amber-600" />
                                        <span>Audio y Volumen</span>
                                    </span>
                                    <button
                                        onClick={() => onUpdateClip(selectedClip.id, { muted: !selectedClip.muted })}
                                        className={`p-1 rounded text-xs transition-colors ${
                                            selectedClip.muted ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                        title={selectedClip.muted ? 'Activar sonido' : 'Silenciar clip'}
                                    >
                                        {selectedClip.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                                    </button>
                                </h4>

                                <div>
                                    <div className="flex justify-between text-[11px] font-medium text-gray-600 mb-1">
                                        <span>Nivel de Ganancia</span>
                                        <span>{selectedClip.muted ? 'Silenciado' : `${selectedClip.volume || 100}%`}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0}
                                        max={200}
                                        disabled={selectedClip.muted}
                                        value={selectedClip.volume || 100}
                                        onChange={(e) => onUpdateClip(selectedClip.id, { volume: Number(e.target.value) })}
                                        className="w-full accent-amber-600 cursor-pointer disabled:opacity-40"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Transición */}
                        <div className="space-y-2 pt-3 border-t border-gray-200">
                            <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Efecto de Entrada</span>
                            </h4>
                            <select
                                value={selectedClip.transition?.type || 'none'}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'none') {
                                        onUpdateClip(selectedClip.id, { transition: undefined });
                                    } else {
                                        onUpdateClip(selectedClip.id, {
                                            transition: { type: val as any, duration: 0.8 }
                                        });
                                    }
                                }}
                                className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 outline-none"
                            >
                                <option value="none">Sin transición (Corte directo)</option>
                                <option value="fade">Fundido Suave (Fade)</option>
                                <option value="dissolve">Disolución Cruzada</option>
                                <option value="slide_left">Deslizar a la Izquierda</option>
                                <option value="slide_right">Deslizar a la Derecha</option>
                                <option value="zoom_in">Zoom Dinámico</option>
                            </select>
                        </div>

                        {/* Acciones del Clip */}
                        <div className="pt-3 border-t border-gray-200 flex items-center gap-2">
                            <button
                                onClick={() => onDuplicateClip(selectedClip.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-gray-700 rounded-xl font-semibold transition-colors shadow-xs"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Duplicar</span>
                            </button>
                            <button
                                onClick={() => onDeleteClip(selectedClip.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-semibold transition-colors border border-rose-200"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Eliminar</span>
                            </button>
                        </div>
                    </>
                ) : (
                    /* Ajustes Generales del Proyecto cuando no hay clip seleccionado */
                    <div className="space-y-5">
                        <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-3.5 text-blue-950">
                            <p className="font-bold flex items-center gap-1.5 text-xs text-[#013388]">
                                <Settings className="w-3.5 h-3.5" /> Configuración General
                            </p>
                            <p className="text-[11px] text-blue-800/80 mt-1 leading-relaxed">
                                Selecciona un clip en la línea de tiempo o canvas para editar sus propiedades individuales, o modifica aquí las especificaciones del video.
                            </p>
                        </div>

                        {/* Nombre del Proyecto */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700">Título del Proyecto</label>
                            <input
                                type="text"
                                value={project.title}
                                onChange={(e) => onUpdateProject({ title: e.target.value })}
                                className="w-full bg-slate-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold text-gray-900 outline-none focus:bg-white focus:border-[#013388]"
                            />
                        </div>

                        {/* Formato y Relación de Aspecto */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-gray-700">Formato / Relación de Aspecto</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => onUpdateProject({ format: '16:9' })}
                                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                                        project.format === '16:9'
                                            ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                            : 'bg-slate-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    <Tv className="w-4 h-4" />
                                    <span className="text-[11px]">16:9</span>
                                </button>
                                <button
                                    onClick={() => onUpdateProject({ format: '9:16' })}
                                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                                        project.format === '9:16'
                                            ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                            : 'bg-slate-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    <Smartphone className="w-4 h-4" />
                                    <span className="text-[11px]">9:16</span>
                                </button>
                                <button
                                    onClick={() => onUpdateProject({ format: '1:1' })}
                                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                                        project.format === '1:1'
                                            ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                            : 'bg-slate-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    <Square className="w-4 h-4" />
                                    <span className="text-[11px]">1:1</span>
                                </button>
                            </div>
                        </div>

                        {/* Resolución */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-gray-700">Resolución de Exportación</label>
                            <select
                                value={project.resolution}
                                onChange={(e) => onUpdateProject({ resolution: e.target.value as Resolution })}
                                className="w-full bg-slate-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold text-gray-900 outline-none"
                            >
                                <option value="1080p">Full HD (1080p · Recomendado)</option>
                                <option value="720p">HD Rápido (720p)</option>
                            </select>
                        </div>

                        {/* Duración */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-bold text-gray-700">
                                <span>Duración Total del Video</span>
                                <span>{project.duration} segundos</span>
                            </div>
                            <input
                                type="range"
                                min={5}
                                max={120}
                                value={project.duration}
                                onChange={(e) => onUpdateProject({ duration: Number(e.target.value) })}
                                className="w-full accent-[#013388] cursor-pointer"
                            />
                        </div>

                        {/* Resumen de Composición */}
                        <div className="bg-slate-50 rounded-xl p-3 border border-gray-200 space-y-1.5 text-[11px] text-gray-600">
                            <div className="flex justify-between">
                                <span>Clips montados:</span>
                                <strong className="text-gray-900">{project.clips.length}</strong>
                            </div>
                            <div className="flex justify-between">
                                <span>Pistas activas:</span>
                                <strong className="text-gray-900">{project.tracks.length}</strong>
                            </div>
                            <div className="flex justify-between">
                                <span>Subtítulos generados:</span>
                                <strong className="text-gray-900">{project.subtitles.segments?.length || 0}</strong>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
};
