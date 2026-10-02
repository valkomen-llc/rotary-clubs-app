// ════════════════════════════════════════════════════════════════════════════
// Panel de Propiedades Visuales de Texto y Subtítulos — v4.1150.0
// Club Platform Video Editor
// ════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
    Type,
    Bold,
    Italic,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Sparkles,
    Check,
    RotateCcw,
    Scissors,
    Copy,
    Trash2,
    Clock,
    Sliders,
    Layers,
    ChevronDown,
    Palette
} from 'lucide-react';
import type { SubtitleStyle } from './types';
import {
    AVAILABLE_FONTS,
    loadGoogleFont,
    resolveEffectiveStyle
} from './textStyleUtils';

interface TextPropertiesPanelProps {
    title: string;
    badge?: string;
    text: string;
    onTextChange: (newText: string) => void;
    style?: Partial<SubtitleStyle> | null;
    globalStyle?: Partial<SubtitleStyle> | null;
    onStyleChange: (updates: Partial<SubtitleStyle>) => void;
    isSubtitle?: boolean;
    activeLanguageName?: string;
    isTranslated?: boolean;
    onApplyToAllSubtitles?: () => void;
    start?: number;
    end?: number;
    duration?: number;
    onTimeChange?: (start: number, end: number) => void;
    onSplit?: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
}

export const TextPropertiesPanel: React.FC<TextPropertiesPanelProps> = ({
    title,
    badge,
    text,
    onTextChange,
    style,
    globalStyle,
    onStyleChange,
    isSubtitle = false,
    activeLanguageName,
    isTranslated = false,
    onApplyToAllSubtitles,
    start,
    end,
    duration,
    onTimeChange,
    onSplit,
    onDuplicate,
    onDelete
}) => {
    const [appliedFeedback, setAppliedFeedback] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Resolver estilo efectivo
    const currentStyle = resolveEffectiveStyle(style, globalStyle);

    const handleFontChange = (fontFamily: string) => {
        loadGoogleFont(fontFamily);
        onStyleChange({ fontFamily });
    };

    const handleApplyToAll = () => {
        if (!onApplyToAllSubtitles) return;
        onApplyToAllSubtitles();
        setAppliedFeedback(true);
        setTimeout(() => setAppliedFeedback(false), 2500);
    };

    // Toggle background
    const bgEnabled = currentStyle.backgroundEnabled ?? (currentStyle.backgroundColor && currentStyle.backgroundColor !== 'transparent');

    // Toggle stroke
    const strokeEnabled = (currentStyle.strokeWidth ?? 0) > 0;

    // Toggle shadow
    const shadowEnabled = (currentStyle.shadowOpacity ?? 0) > 0;

    return (
        <div className="space-y-4 text-xs text-gray-700">
            {/* ── Encabezado e Identificación ── */}
            <div className="bg-slate-50 rounded-xl p-3 border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-gray-900">
                        <Type className="w-3.5 h-3.5 text-[#013388] shrink-0" />
                        <span>{title}</span>
                    </div>
                    {badge && (
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700 font-mono">
                            {badge}
                        </span>
                    )}
                </div>

                {typeof duration === 'number' && typeof start === 'number' && (
                    <div className="flex items-center justify-between text-[11px] text-gray-600 pt-1 border-t border-gray-200">
                        <span>Duración: <strong>{duration.toFixed(2)}s</strong></span>
                        <span>Inicio: <strong className="font-mono">{start.toFixed(2)}s</strong></span>
                    </div>
                )}
            </div>

            {/* ── Edición de Contenido del Texto ── */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-gray-800">
                        Contenido del Texto {activeLanguageName ? `(${activeLanguageName})` : ''}
                    </label>
                    {isTranslated && (
                        <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                            Traducción activa
                        </span>
                    )}
                </div>
                <textarea
                    value={text}
                    onChange={(e) => onTextChange(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-800 focus:bg-white focus:border-[#013388] focus:ring-1 focus:ring-[#013388] outline-none transition-all resize-y"
                    placeholder="Escribe el texto aquí..."
                />
            </div>

            {/* ── Botón Prominente: "Aplicar Estilo a Todos los Subtítulos" ── */}
            {isSubtitle && onApplyToAllSubtitles && (
                <button
                    onClick={handleApplyToAll}
                    disabled={appliedFeedback}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs transition-all shadow-sm ${
                        appliedFeedback
                            ? 'bg-emerald-600 text-white'
                            : 'bg-gradient-to-r from-[#013388] to-[#175CBE] hover:from-[#002868] hover:to-[#0f4a9b] text-white active:scale-98'
                    }`}
                    title="Aplica la tipografía, tamaño, colores, sombras y fondo configurados a TODOS los subtítulos del video"
                >
                    {appliedFeedback ? (
                        <>
                            <Check className="w-4 h-4 animate-scale-in" />
                            <span>¡Estilo aplicado a todos los subtítulos!</span>
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4 text-amber-300" />
                            <span>Aplicar estilo a todos los subtítulos</span>
                        </>
                    )}
                </button>
            )}

            {/* ── 1. Tipografía y Formato ── */}
            <div className="space-y-3 pt-2 border-t border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-[#013388]" />
                    <span>Tipografía y Formato</span>
                </h4>

                {/* Selector de Fuente */}
                <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Fuente / Tipografía
                    </label>
                    <div className="relative">
                        <select
                            value={currentStyle.fontFamily}
                            onChange={(e) => handleFontChange(e.target.value)}
                            className="w-full bg-slate-50 border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-xs text-gray-800 outline-none focus:bg-white focus:border-[#013388] appearance-none"
                        >
                            {AVAILABLE_FONTS.map(f => (
                                <option key={f.name} value={f.family}>
                                    {f.name} ({f.category})
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                </div>

                {/* Tamaño y Peso */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                            <span>Tamaño</span>
                            <span className="font-mono text-gray-900">{currentStyle.fontSize}px</span>
                        </div>
                        <input
                            type="range"
                            min={14}
                            max={72}
                            value={currentStyle.fontSize}
                            onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
                            className="w-full accent-[#013388] cursor-pointer"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                            Peso (Weight)
                        </label>
                        <select
                            value={currentStyle.fontWeight || 'bold'}
                            onChange={(e) => onStyleChange({ fontWeight: e.target.value as any })}
                            className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 outline-none"
                        >
                            <option value="300">300 · Ligera</option>
                            <option value="400">400 · Regular</option>
                            <option value="500">500 · Media</option>
                            <option value="600">600 · Seminegrita</option>
                            <option value="700">700 · Negrita</option>
                            <option value="800">800 · Extra Negrita</option>
                            <option value="900">900 · Black</option>
                        </select>
                    </div>
                </div>

                {/* Botonera de Estilo Rápido: Negrita, Cursiva, Subrayado, Mayúsculas, Alineación */}
                <div className="flex items-center justify-between gap-1 p-1 bg-slate-100 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => onStyleChange({
                                fontWeight: currentStyle.fontWeight === 'bold' || currentStyle.fontWeight === '700' || currentStyle.fontWeight === '800' || currentStyle.fontWeight === '900' ? 'normal' : 'bold'
                            })}
                            className={`p-1.5 rounded transition-colors ${
                                currentStyle.fontWeight === 'bold' || currentStyle.fontWeight === '700' || currentStyle.fontWeight === '800' || currentStyle.fontWeight === '900'
                                    ? 'bg-white text-[#013388] shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                            title="Negrita"
                        >
                            <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onStyleChange({
                                fontStyle: currentStyle.fontStyle === 'italic' ? 'normal' : 'italic'
                            })}
                            className={`p-1.5 rounded transition-colors ${
                                currentStyle.fontStyle === 'italic'
                                    ? 'bg-white text-[#013388] shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                            title="Cursiva"
                        >
                            <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onStyleChange({
                                textDecoration: currentStyle.textDecoration === 'underline' ? 'none' : 'underline'
                            })}
                            className={`p-1.5 rounded transition-colors ${
                                currentStyle.textDecoration === 'underline'
                                    ? 'bg-white text-[#013388] shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                            title="Subrayado"
                        >
                            <Underline className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onStyleChange({
                                textTransform: currentStyle.textTransform === 'uppercase' ? 'none' : 'uppercase'
                            })}
                            className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                                currentStyle.textTransform === 'uppercase'
                                    ? 'bg-white text-[#013388] shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                            title="Mayúsculas"
                        >
                            Aa
                        </button>
                    </div>

                    <div className="h-4 w-px bg-gray-300" />

                    <div className="flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => onStyleChange({ align: 'left' })}
                            className={`p-1.5 rounded transition-colors ${
                                currentStyle.align === 'left' ? 'bg-white text-[#013388] shadow-xs' : 'text-gray-600 hover:text-gray-900'
                            }`}
                            title="Alinear a la izquierda"
                        >
                            <AlignLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onStyleChange({ align: 'center' })}
                            className={`p-1.5 rounded transition-colors ${
                                currentStyle.align === 'center' || !currentStyle.align ? 'bg-white text-[#013388] shadow-xs' : 'text-gray-600 hover:text-gray-900'
                            }`}
                            title="Centrar texto"
                        >
                            <AlignCenter className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onStyleChange({ align: 'right' })}
                            className={`p-1.5 rounded transition-colors ${
                                currentStyle.align === 'right' ? 'bg-white text-[#013388] shadow-xs' : 'text-gray-600 hover:text-gray-900'
                            }`}
                            title="Alinear a la derecha"
                        >
                            <AlignRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── 2. Color y Opacidad ── */}
            <div className="space-y-3 pt-2 border-t border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-blue-600" />
                    <span>Color y Opacidad</span>
                </h4>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                            Color del Texto
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={currentStyle.color?.startsWith('#') ? currentStyle.color : '#FFFFFF'}
                                onChange={(e) => onStyleChange({ color: e.target.value })}
                                className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0"
                            />
                            <input
                                type="text"
                                value={currentStyle.color}
                                onChange={(e) => onStyleChange({ color: e.target.value })}
                                className="w-20 bg-slate-50 border border-gray-200 rounded px-1.5 py-1 text-[11px] font-mono text-gray-800 uppercase"
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                            <span>Opacidad</span>
                            <span className="font-mono text-gray-900">{currentStyle.opacity ?? 100}%</span>
                        </div>
                        <input
                            type="range"
                            min={20}
                            max={100}
                            value={currentStyle.opacity ?? 100}
                            onChange={(e) => onStyleChange({ opacity: Number(e.target.value) })}
                            className="w-full accent-[#013388] cursor-pointer"
                        />
                    </div>
                </div>

                {/* Paleta rápida de colores recomendados */}
                <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase mr-1">Rápido:</span>
                    {[
                        { label: 'Blanco', color: '#FFFFFF' },
                        { label: 'Amarillo', color: '#FACC15' },
                        { label: 'Rotary', color: '#013388' },
                        { label: 'Dorado', color: '#D97706' },
                        { label: 'Cian', color: '#38BDF8' },
                        { label: 'Negro', color: '#0F172A' }
                    ].map(sw => (
                        <button
                            key={sw.color}
                            type="button"
                            onClick={() => onStyleChange({ color: sw.color })}
                            className="w-4 h-4 rounded-full border border-gray-300 shadow-2xs hover:scale-125 transition-transform"
                            style={{ backgroundColor: sw.color }}
                            title={sw.label}
                        />
                    ))}
                </div>
            </div>

            {/* ── 3. Fondo y Caja del Texto ── */}
            <div className="space-y-3 pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Fondo / Caja de Texto</span>
                    </h4>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={bgEnabled}
                            onChange={(e) => onStyleChange({
                                backgroundEnabled: e.target.checked,
                                backgroundColor: e.target.checked && currentStyle.backgroundColor === 'transparent' ? '#000000' : currentStyle.backgroundColor
                            })}
                            className="rounded border-gray-300 text-[#013388] focus:ring-[#013388] w-3.5 h-3.5"
                        />
                        <span className="text-[11px] font-semibold text-gray-600">Activo</span>
                    </label>
                </div>

                {bgEnabled && (
                    <div className="space-y-2.5 bg-slate-50 p-2.5 rounded-xl border border-gray-200 animate-in fade-in duration-200">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                                    Color de Fondo
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={currentStyle.backgroundColor?.startsWith('#') ? currentStyle.backgroundColor : '#000000'}
                                        onChange={(e) => onStyleChange({ backgroundColor: e.target.value })}
                                        className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0"
                                    />
                                    <input
                                        type="text"
                                        value={currentStyle.backgroundColor}
                                        onChange={(e) => onStyleChange({ backgroundColor: e.target.value })}
                                        className="w-20 bg-white border border-gray-200 rounded px-1.5 py-1 text-[11px] font-mono text-gray-800 uppercase"
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] font-semibold text-gray-500 mb-1">
                                    <span>Opacidad Fondo</span>
                                    <span>{currentStyle.backgroundOpacity ?? 80}%</span>
                                </div>
                                <input
                                    type="range"
                                    min={10}
                                    max={100}
                                    value={currentStyle.backgroundOpacity ?? 80}
                                    onChange={(e) => onStyleChange({ backgroundOpacity: Number(e.target.value) })}
                                    className="w-full accent-indigo-600 cursor-pointer"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <div className="flex justify-between text-[10px] font-semibold text-gray-500 mb-1">
                                    <span>Relleno (Padding)</span>
                                    <span>{currentStyle.backgroundPadding ?? 8}px</span>
                                </div>
                                <input
                                    type="range"
                                    min={2}
                                    max={24}
                                    value={currentStyle.backgroundPadding ?? 8}
                                    onChange={(e) => onStyleChange({ backgroundPadding: Number(e.target.value) })}
                                    className="w-full accent-indigo-600 cursor-pointer"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] font-semibold text-gray-500 mb-1">
                                    <span>Redondeo (Bordes)</span>
                                    <span>{currentStyle.borderRadius ?? 8}px</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={24}
                                    value={currentStyle.borderRadius ?? 8}
                                    onChange={(e) => onStyleChange({ borderRadius: Number(e.target.value) })}
                                    className="w-full accent-indigo-600 cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 4. Contorno y Sombra ── */}
            <div className="space-y-3 pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Trazo y Sombra</span>
                    </h4>
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-[11px] text-[#013388] font-bold hover:underline"
                    >
                        {showAdvanced ? 'Ocultar' : 'Ajustar'}
                    </button>
                </div>

                {/* Trazo / Contorno */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                            <span>Grosor Trazo</span>
                            <span className="font-mono text-gray-900">{currentStyle.strokeWidth || 0}px</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={10}
                            value={currentStyle.strokeWidth || 0}
                            onChange={(e) => onStyleChange({ strokeWidth: Number(e.target.value) })}
                            className="w-full accent-amber-600 cursor-pointer"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                            Color Trazo
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={currentStyle.strokeColor?.startsWith('#') ? currentStyle.strokeColor : '#000000'}
                                onChange={(e) => onStyleChange({ strokeColor: e.target.value })}
                                className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0"
                            />
                            <span className="text-[11px] font-mono text-gray-600">
                                {currentStyle.strokeColor || '#000000'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Sombra de Texto */}
                {showAdvanced && (
                    <div className="space-y-2 bg-slate-50 p-2.5 rounded-xl border border-gray-200 animate-in fade-in duration-200">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <div className="flex justify-between text-[10px] font-semibold text-gray-500 mb-1">
                                    <span>Desenfoque (Blur)</span>
                                    <span>{currentStyle.shadowBlur ?? 4}px</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={25}
                                    value={currentStyle.shadowBlur ?? 4}
                                    onChange={(e) => onStyleChange({ shadowBlur: Number(e.target.value) })}
                                    className="w-full accent-[#013388] cursor-pointer"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] font-semibold text-gray-500 mb-1">
                                    <span>Opacidad Sombra</span>
                                    <span>{currentStyle.shadowOpacity ?? 50}%</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={currentStyle.shadowOpacity ?? 50}
                                    onChange={(e) => onStyleChange({ shadowOpacity: Number(e.target.value) })}
                                    className="w-full accent-[#013388] cursor-pointer"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <div className="flex justify-between text-[10px] font-semibold text-gray-500 mb-1">
                                    <span>Desplazamiento X</span>
                                    <span>{currentStyle.shadowOffsetX ?? 0}px</span>
                                </div>
                                <input
                                    type="range"
                                    min={-15}
                                    max={15}
                                    value={currentStyle.shadowOffsetX ?? 0}
                                    onChange={(e) => onStyleChange({ shadowOffsetX: Number(e.target.value) })}
                                    className="w-full accent-[#013388] cursor-pointer"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] font-semibold text-gray-500 mb-1">
                                    <span>Desplazamiento Y</span>
                                    <span>{currentStyle.shadowOffsetY ?? 2}px</span>
                                </div>
                                <input
                                    type="range"
                                    min={-15}
                                    max={15}
                                    value={currentStyle.shadowOffsetY ?? 2}
                                    onChange={(e) => onStyleChange({ shadowOffsetY: Number(e.target.value) })}
                                    className="w-full accent-[#013388] cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 5. Transformación y Posición ── */}
            <div className="space-y-3 pt-2 border-t border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-blue-600" />
                        <span>Posición y Transformación</span>
                    </span>
                    {(currentStyle.rotation !== 0 || currentStyle.scale !== 1 || (currentStyle.x !== 0 && currentStyle.x !== undefined)) && (
                        <button
                            type="button"
                            onClick={() => onStyleChange({ rotation: 0, scale: 1, x: 0, y: 0 })}
                            className="text-[10px] text-gray-500 hover:text-gray-900 flex items-center gap-1"
                            title="Restablecer geometría"
                        >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset</span>
                        </button>
                    )}
                </h4>

                {/* Accesos Rápidos de Posición Vertical */}
                <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Posición Vertical Preconfigurada
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                        <button
                            type="button"
                            onClick={() => onStyleChange({ position: 'top', y: -35 })}
                            className={`py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                                currentStyle.position === 'top' || (currentStyle.y ?? 0) <= -25
                                    ? 'bg-blue-50 border-[#013388] text-[#013388]'
                                    : 'bg-slate-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            Superior
                        </button>
                        <button
                            type="button"
                            onClick={() => onStyleChange({ position: 'center', y: 0 })}
                            className={`py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                                currentStyle.position === 'center' || (Math.abs(currentStyle.y ?? 0) < 15 && currentStyle.position !== 'bottom' && currentStyle.position !== 'top')
                                    ? 'bg-blue-50 border-[#013388] text-[#013388]'
                                    : 'bg-slate-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            Centro
                        </button>
                        <button
                            type="button"
                            onClick={() => onStyleChange({ position: 'bottom', y: 35 })}
                            className={`py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                                currentStyle.position === 'bottom' || (!currentStyle.position && (currentStyle.y ?? 0) >= 20)
                                    ? 'bg-blue-50 border-[#013388] text-[#013388]'
                                    : 'bg-slate-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            Inferior (Estándar)
                        </button>
                    </div>
                </div>

                {/* Escala y Rotación */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                            <span>Escala</span>
                            <span className="font-mono text-gray-900">{Math.round((currentStyle.scale || 1) * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min={50}
                            max={200}
                            value={Math.round((currentStyle.scale || 1) * 100)}
                            onChange={(e) => onStyleChange({ scale: Number(e.target.value) / 100 })}
                            className="w-full accent-[#013388] cursor-pointer"
                        />
                    </div>
                    <div>
                        <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                            <span>Rotación</span>
                            <span className="font-mono text-gray-900">{currentStyle.rotation || 0}°</span>
                        </div>
                        <input
                            type="range"
                            min={-180}
                            max={180}
                            value={currentStyle.rotation || 0}
                            onChange={(e) => onStyleChange({ rotation: Number(e.target.value) })}
                            className="w-full accent-[#013388] cursor-pointer"
                        />
                    </div>
                </div>

                {/* Desplazamiento fino X / Y */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <div className="flex justify-between text-[10px] font-semibold text-gray-500 mb-1">
                            <span>Desplazamiento X (%)</span>
                            <button
                                type="button"
                                onClick={() => onStyleChange({ x: 0 })}
                                className="text-[10px] text-[#013388] hover:underline"
                            >
                                Centrar
                            </button>
                        </div>
                        <input
                            type="number"
                            min={-50}
                            max={50}
                            value={currentStyle.x || 0}
                            onChange={(e) => onStyleChange({ x: Number(e.target.value) })}
                            className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-800 outline-none"
                        />
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] font-semibold text-gray-500 mb-1">
                            <span>Desplazamiento Y (%)</span>
                            <span>{currentStyle.y || 0}%</span>
                        </div>
                        <input
                            type="number"
                            min={-50}
                            max={50}
                            value={currentStyle.y || 0}
                            onChange={(e) => onStyleChange({ y: Number(e.target.value) })}
                            className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-800 outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* ── 6. Marcas de Tiempo y Operaciones de Timeline ── */}
            {typeof start === 'number' && typeof end === 'number' && onTimeChange && (
                <div className="space-y-2 pt-2 border-t border-gray-200">
                    <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Tiempos de Inicio y Fin</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 mb-1">Inicio (s)</label>
                            <input
                                type="number"
                                step="0.05"
                                min={0}
                                value={start}
                                onChange={(e) => {
                                    const s = Math.max(0, parseFloat(e.target.value) || 0);
                                    onTimeChange(s, Math.max(s + 0.1, end));
                                }}
                                className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-800 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-gray-500 mb-1">Fin (s)</label>
                            <input
                                type="number"
                                step="0.05"
                                min={0.1}
                                value={end}
                                onChange={(e) => {
                                    const fin = Math.max(start + 0.1, parseFloat(e.target.value) || 0);
                                    onTimeChange(start, fin);
                                }}
                                className="w-full bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-800 outline-none"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ── 7. Acciones Principales: Dividir, Duplicar, Eliminar ── */}
            {(onSplit || onDuplicate || onDelete) && (
                <div className="pt-3 border-t border-gray-200 flex items-center gap-2">
                    {onSplit && (
                        <button
                            onClick={onSplit}
                            className="flex-1 flex items-center justify-center gap-1 px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-gray-700 rounded-xl font-semibold transition-colors shadow-2xs"
                            title="Dividir en cabezal (S)"
                        >
                            <Scissors className="w-3.5 h-3.5 text-blue-600" />
                            <span>Dividir</span>
                        </button>
                    )}
                    {onDuplicate && (
                        <button
                            onClick={onDuplicate}
                            className="flex-1 flex items-center justify-center gap-1 px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-gray-700 rounded-xl font-semibold transition-colors shadow-2xs"
                            title="Duplicar elemento"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Duplicar</span>
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={onDelete}
                            className="flex-1 flex items-center justify-center gap-1 px-2.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-semibold transition-colors border border-rose-200"
                            title="Eliminar elemento"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
