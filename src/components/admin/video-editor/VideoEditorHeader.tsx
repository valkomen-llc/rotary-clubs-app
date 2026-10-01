// ════════════════════════════════════════════════════════════════════════════
// Barra Superior del Editor de Video — v4.1141.0
// ════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
    Undo2,
    Redo2,
    Download,
    FolderKanban,
    Sparkles,
    Check,
    Loader2,
    Film,
    Maximize2,
    Minimize2,
    Tv,
    Smartphone,
    Square,
    ZoomIn,
    Edit3
} from 'lucide-react';
import type { AspectRatio } from './types';

interface VideoEditorHeaderProps {
    title: string;
    onTitleChange: (newTitle: string) => void;
    format: AspectRatio;
    onFormatChange: (newFormat: AspectRatio) => void;
    saveStatus: 'draft' | 'saving' | 'saved' | 'error';
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onOpenProjects: () => void;
    onOpenExport: () => void;
    zoomLevel: number;
    onZoomLevelChange: (zoom: number) => void;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
}

export const VideoEditorHeader: React.FC<VideoEditorHeaderProps> = ({
    title,
    onTitleChange,
    format,
    onFormatChange,
    saveStatus,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onOpenProjects,
    onOpenExport,
    zoomLevel,
    onZoomLevelChange,
    isFullscreen,
    onToggleFullscreen
}) => {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleInput, setTitleInput] = useState(title);

    const handleTitleSubmit = () => {
        setIsEditingTitle(false);
        if (titleInput.trim() && titleInput !== title) {
            onTitleChange(titleInput.trim());
        } else {
            setTitleInput(title);
        }
    };

    const getFormatIcon = (fmt: AspectRatio) => {
        switch (fmt) {
            case '16:9':
                return <Tv className="w-3.5 h-3.5" />;
            case '9:16':
                return <Smartphone className="w-3.5 h-3.5" />;
            case '1:1':
                return <Square className="w-3.5 h-3.5" />;
            default:
                return <Tv className="w-3.5 h-3.5" />;
        }
    };

    return (
        <header className="h-14 px-4 bg-gray-900 border-b border-gray-800 flex items-center justify-between text-white select-none">
            {/* Izquierda: Título y Navegación de Proyectos */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onOpenProjects}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition-colors border border-gray-700/60 shadow-sm"
                    title="Ver proyectos de video guardados"
                >
                    <FolderKanban className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Proyectos</span>
                </button>

                <div className="h-4 w-[1px] bg-gray-700" />

                {/* Título editable */}
                {isEditingTitle ? (
                    <div className="flex items-center gap-1.5">
                        <input
                            type="text"
                            value={titleInput}
                            onChange={(e) => setTitleInput(e.target.value)}
                            onBlur={handleTitleSubmit}
                            onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                            autoFocus
                            className="bg-gray-800 border border-indigo-500 rounded px-2.5 py-1 text-xs text-white font-semibold outline-none w-48 shadow-inner"
                        />
                        <button
                            onClick={handleTitleSubmit}
                            className="p-1 hover:bg-gray-800 rounded text-emerald-400"
                        >
                            <Check className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <div
                        onClick={() => {
                            setTitleInput(title);
                            setIsEditingTitle(true);
                        }}
                        className="group flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-800/80 cursor-pointer transition-colors max-w-xs"
                        title="Clic para renombrar proyecto"
                    >
                        <span className="text-xs font-bold text-gray-100 truncate">{title}</span>
                        <Edit3 className="w-3 h-3 text-gray-500 group-hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                )}

                {/* Badge de Guardado */}
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400">
                    {saveStatus === 'saving' && (
                        <span className="flex items-center gap-1 text-amber-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Guardando...</span>
                        </span>
                    )}
                    {saveStatus === 'saved' && (
                        <span className="flex items-center gap-1 text-emerald-400">
                            <Check className="w-3 h-3" />
                            <span>Guardado</span>
                        </span>
                    )}
                    {saveStatus === 'draft' && (
                        <span className="text-gray-400">Borrador</span>
                    )}
                    {saveStatus === 'error' && (
                        <span className="text-rose-400">Error al guardar</span>
                    )}
                </div>
            </div>

            {/* Centro: Formato, Zoom y Deshacer/Rehacer */}
            <div className="flex items-center gap-2">
                {/* Deshacer / Rehacer */}
                <div className="flex items-center bg-gray-800/90 rounded-lg p-0.5 border border-gray-700/60">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        className="p-1.5 hover:bg-gray-700/80 disabled:opacity-30 disabled:hover:bg-transparent rounded text-gray-300 transition-colors"
                        title="Deshacer (⌘Z / Ctrl+Z)"
                    >
                        <Undo2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        className="p-1.5 hover:bg-gray-700/80 disabled:opacity-30 disabled:hover:bg-transparent rounded text-gray-300 transition-colors"
                        title="Rehacer (⇧⌘Z / Ctrl+Y)"
                    >
                        <Redo2 className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="h-4 w-[1px] bg-gray-700" />

                {/* Selector de Relación de Aspecto */}
                <div className="flex items-center bg-gray-800/90 rounded-lg p-0.5 border border-gray-700/60 text-xs font-semibold">
                    <button
                        onClick={() => onFormatChange('16:9')}
                        className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                            format === '16:9' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
                        }`}
                        title="16:9 Horizontal (YouTube, Presentaciones)"
                    >
                        <Tv className="w-3 h-3" />
                        <span>16:9</span>
                    </button>
                    <button
                        onClick={() => onFormatChange('9:16')}
                        className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                            format === '9:16' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
                        }`}
                        title="9:16 Vertical (Reels, Shorts, TikTok)"
                    >
                        <Smartphone className="w-3 h-3" />
                        <span>9:16</span>
                    </button>
                    <button
                        onClick={() => onFormatChange('1:1')}
                        className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                            format === '1:1' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
                        }`}
                        title="1:1 Cuadrado (Publicaciones sociales)"
                    >
                        <Square className="w-3 h-3" />
                        <span>1:1</span>
                    </button>
                </div>

                {/* Zoom del lienzo */}
                <div className="relative">
                    <select
                        value={zoomLevel}
                        onChange={(e) => onZoomLevelChange(Number(e.target.value))}
                        className="bg-gray-800/90 border border-gray-700/60 text-gray-300 text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
                    >
                        <option value={0}>Ajustar (Fit)</option>
                        <option value={50}>50%</option>
                        <option value={75}>75%</option>
                        <option value={100}>100%</option>
                    </select>
                </div>
            </div>

            {/* Derecha: Pantalla Completa y Exportar */}
            <div className="flex items-center gap-2.5">
                <button
                    onClick={onToggleFullscreen}
                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                    title={isFullscreen ? 'Salir de pantalla completa' : 'Modo enfoque completo'}
                >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                <button
                    onClick={onOpenExport}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
                >
                    <Film className="w-4 h-4" />
                    <span>Exportar Video</span>
                </button>
            </div>
        </header>
    );
};
