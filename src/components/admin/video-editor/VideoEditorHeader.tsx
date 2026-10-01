// ════════════════════════════════════════════════════════════════════════════
// Barra Superior del Editor de Video (Tema Claro e Institucional) — v4.1143.0
//
// Identidad Club Platform / Rotary, estado de guardado, deshacer/rehacer,
// selector de aspecto, zoom, botones de colapso y exportación.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
    Undo2,
    Redo2,
    FolderKanban,
    Check,
    Loader2,
    Film,
    Maximize2,
    Minimize2,
    Tv,
    Smartphone,
    Square,
    Edit3,
    ArrowLeft,
    PanelLeft,
    PanelRight,
    Sparkles,
    X
} from 'lucide-react';
import type { AspectRatio } from './types';

const PLATFORM_LOGO = 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/platform/logo/1776225800089-Club_Platform_for_Rotary.png';

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
    isLeftCollapsed?: boolean;
    onToggleLeftCollapse?: () => void;
    isRightCollapsed?: boolean;
    onToggleRightCollapse?: () => void;
    onClose?: () => void;
    isStandalone?: boolean;
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
    onToggleFullscreen,
    isLeftCollapsed,
    onToggleLeftCollapse,
    isRightCollapsed,
    onToggleRightCollapse,
    onClose,
    isStandalone
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

    const handleReturn = () => {
        if (onClose) {
            onClose();
            return;
        }
        if (window.opener) {
            window.close();
        } else {
            window.location.href = '/admin/content-studio?tab=editor';
        }
    };

    return (
        <header className="h-14 px-4 bg-white border-b border-gray-200 flex items-center justify-between text-gray-800 select-none shadow-xs z-20 shrink-0">
            {/* ── Izquierda: Identidad, Proyectos y Título ── */}
            <div className="flex items-center gap-3">
                {/* Botón Salir / Volver a Estudio */}
                <button
                    onClick={handleReturn}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors border border-gray-200 text-xs font-semibold"
                    title={isStandalone ? 'Cerrar pestaña y volver a Estudio de Contenido' : 'Volver a Estudio de Contenido'}
                >
                    <ArrowLeft className="w-3.5 h-3.5 text-[#013388]" />
                    <span className="hidden sm:inline">Estudio</span>
                </button>

                {/* Logo Institucional */}
                <div className="flex items-center gap-2">
                    <img
                        src={PLATFORM_LOGO}
                        alt="Club Platform"
                        className="h-6 w-auto object-contain hidden md:block"
                        onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                        }}
                    />
                    <span className="text-[11px] font-black uppercase tracking-wider text-[#013388] px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 hidden lg:inline-block">
                        Editor de Video
                    </span>
                </div>

                <div className="h-4 w-[1px] bg-gray-200" />

                {/* Botón Proyectos */}
                <button
                    onClick={onOpenProjects}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-gray-700 text-xs font-semibold transition-colors border border-gray-200"
                    title="Ver catálogo de proyectos guardados"
                >
                    <FolderKanban className="w-3.5 h-3.5 text-[#013388]" />
                    <span className="hidden sm:inline">Proyectos</span>
                </button>

                {/* Título editable */}
                {isEditingTitle ? (
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={titleInput}
                            onChange={(e) => setTitleInput(e.target.value)}
                            onBlur={handleTitleSubmit}
                            onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                            autoFocus
                            className="bg-white border-2 border-[#013388] rounded-lg px-2.5 py-1 text-xs text-gray-900 font-bold outline-none w-44 shadow-inner"
                        />
                        <button
                            onClick={handleTitleSubmit}
                            className="p-1 hover:bg-gray-100 rounded text-emerald-600"
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
                        className="group flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors max-w-[200px] md:max-w-xs"
                        title="Clic para renombrar proyecto"
                    >
                        <span className="text-xs font-bold text-gray-900 truncate">{title}</span>
                        <Edit3 className="w-3 h-3 text-gray-400 group-hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                )}

                {/* Badge de Guardado */}
                <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    {saveStatus === 'saving' && (
                        <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span className="hidden sm:inline">Guardando...</span>
                        </span>
                    )}
                    {saveStatus === 'saved' && (
                        <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <Check className="w-3 h-3" />
                            <span className="hidden sm:inline">Guardado</span>
                        </span>
                    )}
                    {saveStatus === 'draft' && (
                        <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Borrador</span>
                    )}
                    {saveStatus === 'error' && (
                        <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">Error al guardar</span>
                    )}
                </div>
            </div>

            {/* ── Centro: Deshacer / Rehacer, Formato y Zoom ── */}
            <div className="flex items-center gap-2">
                {/* Deshacer / Rehacer */}
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-gray-200">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        className="p-1.5 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent rounded text-gray-600 hover:text-gray-900 transition-colors shadow-xs"
                        title="Deshacer (⌘Z / Ctrl+Z)"
                    >
                        <Undo2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        className="p-1.5 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent rounded text-gray-600 hover:text-gray-900 transition-colors shadow-xs"
                        title="Rehacer (⇧⌘Z / Ctrl+Y)"
                    >
                        <Redo2 className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="h-4 w-[1px] bg-gray-200 hidden sm:block" />

                {/* Selector de Relación de Aspecto */}
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-gray-200 text-xs font-semibold">
                    <button
                        onClick={() => onFormatChange('16:9')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                            format === '16:9' ? 'bg-[#013388] text-white shadow-xs font-bold' : 'text-gray-600 hover:text-gray-900'
                        }`}
                        title="16:9 Horizontal (YouTube, Web, TV)"
                    >
                        <Tv className="w-3 h-3" />
                        <span className="hidden sm:inline">16:9</span>
                    </button>
                    <button
                        onClick={() => onFormatChange('9:16')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                            format === '9:16' ? 'bg-[#013388] text-white shadow-xs font-bold' : 'text-gray-600 hover:text-gray-900'
                        }`}
                        title="9:16 Vertical (Reels, TikTok, Shorts)"
                    >
                        <Smartphone className="w-3 h-3" />
                        <span className="hidden sm:inline">9:16</span>
                    </button>
                    <button
                        onClick={() => onFormatChange('1:1')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                            format === '1:1' ? 'bg-[#013388] text-white shadow-xs font-bold' : 'text-gray-600 hover:text-gray-900'
                        }`}
                        title="1:1 Cuadrado (Feed Instagram / Facebook)"
                    >
                        <Square className="w-3 h-3" />
                        <span className="hidden sm:inline">1:1</span>
                    </button>
                </div>

                {/* Selector de Zoom */}
                <div className="relative hidden md:block">
                    <select
                        value={zoomLevel}
                        onChange={(e) => onZoomLevelChange(Number(e.target.value))}
                        className="bg-slate-50 border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:border-gray-300"
                    >
                        <option value={0}>Ajustar (Fit)</option>
                        <option value={50}>50%</option>
                        <option value={75}>75%</option>
                        <option value={100}>100%</option>
                    </select>
                </div>
            </div>

            {/* ── Derecha: Alternar Paneles, Fullscreen y Exportar ── */}
            <div className="flex items-center gap-2">
                {/* Alternar Panel Izquierdo */}
                {onToggleLeftCollapse && (
                    <button
                        onClick={onToggleLeftCollapse}
                        className={`p-2 rounded-lg border text-xs transition-colors hidden lg:flex items-center gap-1 ${
                            isLeftCollapsed ? 'bg-slate-100 border-gray-300 text-gray-500' : 'bg-white border-gray-200 text-[#013388] shadow-xs'
                        }`}
                        title={isLeftCollapsed ? 'Mostrar Herramientas' : 'Ocultar Herramientas'}
                    >
                        <PanelLeft className="w-3.5 h-3.5" />
                    </button>
                )}

                {/* Alternar Inspector Derecho */}
                {onToggleRightCollapse && (
                    <button
                        onClick={onToggleRightCollapse}
                        className={`p-2 rounded-lg border text-xs transition-colors hidden lg:flex items-center gap-1 ${
                            isRightCollapsed ? 'bg-slate-100 border-gray-300 text-gray-500' : 'bg-white border-gray-200 text-[#013388] shadow-xs'
                        }`}
                        title={isRightCollapsed ? 'Mostrar Propiedades' : 'Ocultar Propiedades'}
                    >
                        <PanelRight className="w-3.5 h-3.5" />
                    </button>
                )}

                {/* Pantalla Completa */}
                <button
                    onClick={onToggleFullscreen}
                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors border border-transparent hover:border-gray-200"
                    title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                {/* Botón Principal Exportar Video */}
                <button
                    onClick={onOpenExport}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#013388] hover:bg-[#002868] text-white text-xs font-bold shadow-md shadow-blue-900/20 transition-all active:scale-95"
                >
                    <Film className="w-4 h-4" />
                    <span className="hidden sm:inline">Exportar Video</span>
                </button>
            </div>
        </header>
    );
};
