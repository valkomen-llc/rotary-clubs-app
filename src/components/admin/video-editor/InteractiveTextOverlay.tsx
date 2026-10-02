// ════════════════════════════════════════════════════════════════════════════
// Bounding Box Interactivo de Transformación de Texto / Subtítulos — v4.1150.0
// Club Platform Video Editor
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect } from 'react';
import {
    RotateCw,
    AlignCenter,
    Sparkles,
    Trash2,
    Copy,
    Check
} from 'lucide-react';
import type { SubtitleStyle } from './types';
import {
    computeCssProperties,
    loadGoogleFont
} from './textStyleUtils';

interface InteractiveTextOverlayProps {
    id: string;
    text: string;
    style: SubtitleStyle;
    isSelected: boolean;
    isSubtitle?: boolean;
    canvasRectRef: React.RefObject<HTMLDivElement>;
    onSelect: () => void;
    onUpdateStyle: (updates: Partial<SubtitleStyle>) => void;
    onUpdateText?: (newText: string) => void;
    onCenterHorizontal?: () => void;
    onApplyToAll?: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
}

export const InteractiveTextOverlay: React.FC<InteractiveTextOverlayProps> = ({
    id,
    text,
    style,
    isSelected,
    isSubtitle = false,
    canvasRectRef,
    onSelect,
    onUpdateStyle,
    onUpdateText,
    onCenterHorizontal,
    onApplyToAll,
    onDuplicate,
    onDelete
}) => {
    const [isEditingInline, setIsEditingInline] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isRotating, setIsRotating] = useState(false);
    const [isScaling, setIsScaling] = useState(false);
    const [showSnapGuide, setShowSnapGuide] = useState(false);
    const [appliedFeedback, setAppliedFeedback] = useState(false);

    const elementRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
        mouseX: 0,
        mouseY: 0,
        startX: 0,
        startY: 0
    });
    const rotateStartRef = useRef<{ centerX: number; centerY: number; startAngle: number; initialRotation: number }>({
        centerX: 0,
        centerY: 0,
        startAngle: 0,
        initialRotation: 0
    });
    const scaleStartRef = useRef<{ mouseDistance: number; initialScale: number; centerX: number; centerY: number }>({
        mouseDistance: 0,
        initialScale: 1,
        centerX: 0,
        centerY: 0
    });

    // Cargar fuente dinámicamente si aplica
    useEffect(() => {
        if (style.fontFamily) {
            loadGoogleFont(style.fontFamily);
        }
    }, [style.fontFamily]);

    // Salir del modo edición inline si se deselecciona
    useEffect(() => {
        if (!isSelected) {
            setIsEditingInline(false);
        }
    }, [isSelected]);

    // ── 1. Mover / Arrastrar Posición ──────────────────────────────────────────
    const handleMouseDownMove = (e: React.MouseEvent) => {
        if (isEditingInline || e.button !== 0) return;
        e.stopPropagation();
        onSelect();

        dragStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            startX: style.x ?? 0,
            startY: style.y ?? 0
        };

        setIsDragging(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!canvasRectRef.current) return;
            const canvasRect = canvasRectRef.current.getBoundingClientRect();
            if (canvasRect.width === 0 || canvasRect.height === 0) return;

            const deltaPixelX = moveEvent.clientX - dragStartRef.current.mouseX;
            const deltaPixelY = moveEvent.clientY - dragStartRef.current.mouseY;

            const deltaPercentX = (deltaPixelX / canvasRect.width) * 100;
            const deltaPercentY = (deltaPixelY / canvasRect.height) * 100;

            let newX = Math.round(dragStartRef.current.startX + deltaPercentX);
            let newY = Math.round(dragStartRef.current.startY + deltaPercentY);

            // Ajustar límites de seguridad
            newX = Math.max(-48, Math.min(48, newX));
            newY = Math.max(-45, Math.min(45, newY));

            // Guía inteligente de centrado horizontal (snap a 0 si está a menos de 2%)
            if (Math.abs(newX) <= 2) {
                newX = 0;
                setShowSnapGuide(true);
            } else {
                setShowSnapGuide(false);
            }

            onUpdateStyle({ x: newX, y: newY, position: 'custom' });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setShowSnapGuide(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // ── 2. Rotación con Asa Superior ───────────────────────────────────────────
    const handleMouseDownRotate = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (!elementRef.current) return;
        const rect = elementRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

        rotateStartRef.current = {
            centerX,
            centerY,
            startAngle,
            initialRotation: style.rotation ?? 0
        };

        setIsRotating(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const currentAngle = Math.atan2(
                moveEvent.clientY - rotateStartRef.current.centerY,
                moveEvent.clientX - rotateStartRef.current.centerX
            ) * (180 / Math.PI);

            let diff = currentAngle - rotateStartRef.current.startAngle;
            let newRotation = Math.round((rotateStartRef.current.initialRotation + diff) % 360);

            // Snap a 0° si está muy cerca de los ángulos estándar
            if (Math.abs(newRotation) <= 3) newRotation = 0;
            if (Math.abs(newRotation - 90) <= 3) newRotation = 90;
            if (Math.abs(newRotation + 90) <= 3) newRotation = -90;
            if (Math.abs(newRotation - 180) <= 3 || Math.abs(newRotation + 180) <= 3) newRotation = 180;

            onUpdateStyle({ rotation: newRotation });
        };

        const handleMouseUp = () => {
            setIsRotating(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // ── 3. Escalar con Esquinas ────────────────────────────────────────────────
    const handleMouseDownScale = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (!elementRef.current) return;
        const rect = elementRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);

        scaleStartRef.current = {
            mouseDistance: startDist,
            initialScale: style.scale ?? 1,
            centerX,
            centerY
        };

        setIsScaling(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const currentDist = Math.hypot(
                moveEvent.clientX - scaleStartRef.current.centerX,
                moveEvent.clientY - scaleStartRef.current.centerY
            );

            if (scaleStartRef.current.mouseDistance === 0) return;
            const ratio = currentDist / scaleStartRef.current.mouseDistance;
            let newScale = Math.round(scaleStartRef.current.initialScale * ratio * 100) / 100;

            // Restringir escala entre 0.4 y 2.5
            newScale = Math.max(0.4, Math.min(2.5, newScale));

            onUpdateStyle({ scale: newScale });
        };

        const handleMouseUp = () => {
            setIsScaling(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // ── 4. Posición Base en Canvas ─────────────────────────────────────────────
    let baseY = 82; // Inferior por defecto
    if (style.position === 'top') baseY = 18;
    else if (style.position === 'center') baseY = 50;

    const posY = Math.max(5, Math.min(95, baseY + (style.y ?? 0)));
    const posX = Math.max(5, Math.min(95, 50 + (style.x ?? 0)));

    const cssStyles = computeCssProperties(style);

    return (
        <>
            {/* Guía inteligente de alineación central vertical */}
            {showSnapGuide && (
                <div
                    className="absolute top-0 bottom-0 left-1/2 w-px bg-cyan-400 border-l border-dashed border-cyan-300 pointer-events-none z-50 shadow-sm"
                    aria-hidden="true"
                />
            )}

            <div
                ref={elementRef}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (onUpdateText) {
                        setIsEditingInline(true);
                    }
                }}
                onMouseDown={handleMouseDownMove}
                style={{
                    position: 'absolute',
                    top: `${posY}%`,
                    left: `${posX}%`,
                    transform: `translate(-50%, -50%) scale(${style.scale || 1}) rotate(${style.rotation || 0}deg)`,
                    transformOrigin: 'center center',
                    cursor: isDragging ? 'grabbing' : isSelected ? 'move' : 'pointer',
                    userSelect: 'none',
                    zIndex: isSelected ? 40 : 25
                }}
                className="group inline-block transition-transform duration-75 select-none"
            >
                {/* ── Bounding Box Visual Activo ── */}
                {isSelected && (
                    <div className="absolute -inset-2 border-2 border-[#013388] rounded-md ring-1 ring-white/80 pointer-events-none shadow-sm z-30">
                        {/* Indicador de Límites en Esquinas */}
                        <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-[#013388] rounded-xs shadow-xs pointer-events-auto cursor-nwse-resize" onMouseDown={handleMouseDownScale} />
                        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#013388] rounded-xs shadow-xs pointer-events-auto cursor-nesw-resize" onMouseDown={handleMouseDownScale} />
                        <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-[#013388] rounded-xs shadow-xs pointer-events-auto cursor-nesw-resize" onMouseDown={handleMouseDownScale} />
                        <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#013388] rounded-xs shadow-xs pointer-events-auto cursor-nwse-resize" onMouseDown={handleMouseDownScale} />

                        {/* Asa de Rotación Superior */}
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
                            <div
                                onMouseDown={handleMouseDownRotate}
                                className="w-5 h-5 rounded-full bg-white border-2 border-[#013388] shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
                                title="Rotar texto libremente"
                            >
                                <RotateCw className="w-2.5 h-2.5 text-[#013388]" />
                            </div>
                            <div className="w-0.5 h-2 bg-[#013388]" />
                        </div>
                    </div>
                )}

                {/* ── Barra de Acciones Flotante Rápida Superior ── */}
                {isSelected && !isEditingInline && (
                    <div
                        className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl px-2 py-1 shadow-xl flex items-center gap-1.5 z-40 text-gray-700 animate-in fade-in duration-150 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Centrar Horizontalmente */}
                        <button
                            type="button"
                            onClick={() => {
                                onUpdateStyle({ x: 0 });
                                onCenterHorizontal?.();
                            }}
                            className="p-1 hover:bg-blue-50 text-gray-600 hover:text-[#013388] rounded-md transition-colors flex items-center gap-1 text-[11px] font-bold"
                            title="Centrar horizontalmente"
                        >
                            <AlignCenter className="w-3.5 h-3.5" />
                            <span>Centrar</span>
                        </button>

                        {/* Si es subtítulo: Aplicar a todos */}
                        {isSubtitle && onApplyToAll && (
                            <button
                                type="button"
                                onClick={() => {
                                    onApplyToAll();
                                    setAppliedFeedback(true);
                                    setTimeout(() => setAppliedFeedback(false), 2000);
                                }}
                                className={`p-1 px-1.5 rounded-md transition-colors flex items-center gap-1 text-[11px] font-bold ${
                                    appliedFeedback ? 'bg-emerald-500 text-white' : 'hover:bg-blue-50 text-[#013388]'
                                }`}
                                title="Aplicar estilo actual a todos los subtítulos"
                            >
                                {appliedFeedback ? <Check className="w-3 h-3" /> : <Sparkles className="w-3 h-3 text-amber-500" />}
                                <span>{appliedFeedback ? '¡Listo!' : 'Aplicar a todos'}</span>
                            </button>
                        )}

                        {/* Duplicar (para clip de texto) */}
                        {onDuplicate && (
                            <button
                                type="button"
                                onClick={onDuplicate}
                                className="p-1 hover:bg-gray-100 rounded-md text-gray-600 hover:text-gray-900 transition-colors"
                                title="Duplicar texto"
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                        )}

                        {/* Eliminar */}
                        {onDelete && (
                            <button
                                type="button"
                                onClick={onDelete}
                                className="p-1 hover:bg-rose-50 rounded-md text-rose-600 transition-colors"
                                title="Eliminar (Supr)"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                {/* ── Contenido del Texto o Editor Inline ── */}
                {isEditingInline ? (
                    <textarea
                        autoFocus
                        value={text}
                        onChange={(e) => onUpdateText?.(e.target.value)}
                        onBlur={() => setIsEditingInline(false)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                setIsEditingInline(false);
                            }
                        }}
                        style={{
                            ...cssStyles,
                            outline: '2px solid #013388',
                            resize: 'none',
                            minWidth: '160px',
                            minHeight: '40px'
                        }}
                        className="shadow-2xl"
                    />
                ) : (
                    <div
                        style={cssStyles}
                        className={`transition-shadow ${
                            !isSelected ? 'hover:ring-1 hover:ring-white/70' : ''
                        }`}
                        title="Doble clic para editar texto directamente"
                    >
                        {text || 'Escribe tu texto...'}
                    </div>
                )}
            </div>
        </>
    );
};
