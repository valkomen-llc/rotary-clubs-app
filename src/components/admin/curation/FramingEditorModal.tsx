import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    X, Sparkles, Move, ZoomIn, RotateCcw, CheckCircle, Copy,
    Smartphone, Tablet, Monitor, Grid, Eye, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';

export interface FramingConfig {
    x: number; // 0 - 100
    y: number; // 0 - 100
    zoom: number; // 100 - 200
    mode: 'cover' | 'contain' | 'smart';
    focalPoint?: { x: number; y: number };
    mobile?: { x: number; y: number; zoom: number };
    tablet?: { x: number; y: number; zoom: number };
}

interface FramingEditorModalProps {
    rec: any;
    isOpen: boolean;
    onClose: () => void;
    onSaveFraming: (recId: string, framing: FramingConfig) => Promise<void>;
    onConfirmAndApprove: (recId: string, framing: FramingConfig, exceptionData?: { isException?: boolean; exceptionReason?: string }) => Promise<void>;
}

export const FramingEditorModal: React.FC<FramingEditorModalProps> = ({
    rec,
    isOpen,
    onClose,
    onSaveFraming,
    onConfirmAndApprove,
}) => {
    // Hooks MUST be called unconditionally at the top (Rules of Hooks)
    const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
    const [mode, setMode] = useState<'cover' | 'contain' | 'smart'>('cover');
    const [posX, setPosX] = useState<number>(50);
    const [posY, setPosY] = useState<number>(50);
    const [zoom, setZoom] = useState<number>(100);
    const [showGrid, setShowGrid] = useState<boolean>(true);
    const [showComparison, setShowComparison] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [approving, setApproving] = useState<boolean>(false);
    const [isExceptionAuthorized, setIsExceptionAuthorized] = useState<boolean>(false);
    const [exceptionReason, setExceptionReason] = useState<string>('');

    // Drag-to-pan state
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ clientX: number; clientY: number; initialX: number; initialY: number } | null>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);

    // Reset when rec changes
    useEffect(() => {
        if (!isOpen || !rec) return;
        const c = rec.cropSuggested || {};
        setPosX(c.x ?? 50);
        setPosY(c.y ?? 50);
        setZoom(c.zoom ?? 100);
        setMode(c.mode || 'cover');
        setIsExceptionAuthorized(false);
        setExceptionReason('');
    }, [isOpen, rec?.id]);

    if (!isOpen || !rec) return null;

    const cropSuggested = rec.cropSuggested || {};
    const conflictInfo = rec.conflictInfo;
    const hasConflict = Boolean(conflictInfo?.hasConflict && rec.containerKey === 'hero');

    const candidate = rec.candidate || {
        url: rec.candidateUrl,
        title: rec.candidateTitle,
        club: rec.candidateClub,
    };

    const containerKey = rec.containerKey || 'hero';
    const containerLabel = containerKey === 'hero'
        ? `Hero — Slide ${(rec.slotIndex || 0) + 1}`
        : containerKey === 'foundation'
        ? 'Fundación Rotaria'
        : containerKey === 'join'
        ? 'Sección Únete'
        : containerKey === 'causes'
        ? `Áreas de Interés · Causa ${(rec.slotIndex || 0) + 1}`
        : containerKey;

    const targetDimension = containerKey === 'hero'
        ? '1600 × 700 px'
        : containerKey === 'foundation'
        ? '1600 × 700 px'
        : containerKey === 'join'
        ? '800 × 600 px'
        : '1200 × 675 px';

    // Handle mouse/touch drag
    const handlePointerDown = (e: React.PointerEvent) => {
        if (mode === 'contain') return; // In contain mode panning is disabled
        setIsDragging(true);
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        dragStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            initialX: posX,
            initialY: posY,
        };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !dragStartRef.current || !canvasContainerRef.current) return;
        const rect = canvasContainerRef.current.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        // Inverting delta so dragging moves the viewing window intuitively
        const deltaX = ((e.clientX - dragStartRef.current.clientX) / rect.width) * -100;
        const deltaY = ((e.clientY - dragStartRef.current.clientY) / rect.height) * -100;

        const newX = Math.round(Math.min(100, Math.max(0, dragStartRef.current.initialX + deltaX)));
        const newY = Math.round(Math.min(100, Math.max(0, dragStartRef.current.initialY + deltaY)));

        setPosX(newX);
        setPosY(newY);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        dragStartRef.current = null;
        try {
            (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        } catch {}
    };

    // Actions
    const handleReset = () => {
        setPosX(50);
        setPosY(50);
        setZoom(100);
        setMode('cover');
        toast.info('Encuadre restablecido al centro por omisión');
    };

    const handleApplyAiSuggestion = () => {
        const c = rec.cropSuggested || {};
        setPosX(c.x ?? 50);
        setPosY(c.y ?? 65);
        setZoom(100);
        setMode(c.mode || 'cover');
        toast.success('Encuadre inteligente de IA aplicado');
    };

    const handleCopyConfig = () => {
        const payload: FramingConfig = {
            x: posX,
            y: posY,
            zoom,
            mode,
            focalPoint: { x: posX, y: posY },
        };
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        toast.success('Parámetros de encuadre copiados al portapapeles');
    };

    const buildCurrentFraming = (): FramingConfig => ({
        x: posX,
        y: posY,
        zoom,
        mode,
        focalPoint: { x: posX, y: posY },
        mobile: {
            x: posX,
            y: Math.max(25, posY - 10),
            zoom,
        },
    });

    const handleSaveOnly = async () => {
        setSaving(true);
        try {
            await onSaveFraming(rec.id, buildCurrentFraming());
            toast.success('Encuadre guardado exitosamente');
            onClose();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar encuadre');
        } finally {
            setSaving(false);
        }
    };

    const handleConfirmAndApprove = async () => {
        if (hasConflict && !isExceptionAuthorized) {
            toast.error('Debes autorizar explícitamente la excepción editorial para publicar esta imagen en el Hero.');
            return;
        }
        setApproving(true);
        try {
            await onConfirmAndApprove(rec.id, buildCurrentFraming(), {
                isException: hasConflict ? isExceptionAuthorized : undefined,
                exceptionReason: hasConflict ? (exceptionReason.trim() || 'Excepción editorial autorizada por administrador') : undefined,
            });
            toast.success('¡Imagen encuadrada y publicada con éxito en producción!');
            onClose();
        } catch (err: any) {
            toast.error(err.message || 'Error al confirmar y publicar');
        } finally {
            setApproving(false);
        }
    };

    // Responsive aspect ratio styles
    const getContainerAspect = () => {
        if (device === 'mobile') return 'aspect-[9/10] max-w-[340px]';
        if (device === 'tablet') return 'aspect-[16/10] max-w-[620px]';
        // Desktop
        if (containerKey === 'hero') return 'aspect-[16/7] max-w-[960px]';
        if (containerKey === 'foundation') return 'aspect-[16/7] max-w-[960px]';
        if (containerKey === 'join') return 'aspect-[4/3] max-w-[680px]';
        return 'aspect-[16/9] max-w-[850px]';
    };

    const isContain = mode === 'contain';
    const isAi = mode === 'smart';
    const effectivePosX = isAi ? (cropSuggested.x ?? 50) : posX;
    const effectivePosY = isAi ? (cropSuggested.y ?? 65) : posY;
    const effectiveZoom = isAi ? 100 : zoom;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in">
            <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col my-auto max-h-[96vh]">
                {/* Header */}
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-sky-100 flex items-center justify-center text-rotary-blue shadow-inner">
                            <Sparkles className="w-5 h-5 text-sky-600" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                                    Editor de encuadre inteligente
                                </h2>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-800">
                                    Vista previa en vivo
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {containerLabel} · {targetDimension} · {candidate.club || 'Rotary Distrito 4281'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Device Selector */}
                        <div className="hidden sm:flex items-center bg-gray-200/70 p-1 rounded-xl gap-1">
                            <button
                                onClick={() => setDevice('desktop')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${device === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                title="Vista Escritorio"
                            >
                                <Monitor className="w-3.5 h-3.5" /> Escritorio
                            </button>
                            <button
                                onClick={() => setDevice('tablet')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${device === 'tablet' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                title="Vista Tableta"
                            >
                                <Tablet className="w-3.5 h-3.5" /> Tableta
                            </button>
                            <button
                                onClick={() => setDevice('mobile')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${device === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                title="Vista Móvil"
                            >
                                <Smartphone className="w-3.5 h-3.5" /> Móvil
                            </button>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Main Body */}
                <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
                    {/* Exclusivity Conflict & Exception Authorization Alert */}
                    {hasConflict && (
                        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-3 shadow-sm">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <h4 className="font-bold text-xs text-amber-900 uppercase tracking-wide">
                                        Conflicto Editorial: Portada de Noticia Publicada
                                    </h4>
                                    <p className="text-xs text-amber-900 leading-relaxed">
                                        Esta fotografía ya está publicada como portada en el artículo: <strong className="font-bold text-amber-950">«{conflictInfo?.newsTitle || 'Noticia publicada'}»</strong> ({conflictInfo?.matchType === 'exact' ? 'coincidencia exacta' : 'similitud visual detectada'}).
                                    </p>
                                    <p className="text-[11px] text-amber-800">
                                        Por directriz editorial del Distrito 4281, las portadas de noticias no deben repetirse en el Hero principal para evitar duplicaciones visuales. Para publicarla en el Hero se requiere autorización explícita de excepción.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white/90 rounded-xl p-3 border border-amber-200/90 space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={isExceptionAuthorized}
                                        onChange={(e) => setIsExceptionAuthorized(e.target.checked)}
                                        className="w-4 h-4 rounded text-amber-600 accent-amber-600 cursor-pointer"
                                    />
                                    <span className="text-xs font-bold text-gray-900">
                                        Autorizar como excepción editorial justificada
                                    </span>
                                </label>
                                {isExceptionAuthorized && (
                                    <div className="space-y-1 pt-1">
                                        <label className="block text-[11px] font-semibold text-gray-700">
                                            Justificación de la excepción (quedará registrada en el historial y auditoría):
                                        </label>
                                        <input
                                            type="text"
                                            value={exceptionReason}
                                            onChange={(e) => setExceptionReason(e.target.value)}
                                            placeholder="Ej: Cobertura principal de campaña distrital autorizada por Gobernación"
                                            className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Advice / Crop risk alert */}
                    {cropSuggested.requiresCropAdjustment && (
                        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <strong className="font-bold">Advertencia de recorte: </strong>
                                <span>{cropSuggested.advice || 'Esta imagen requiere ajuste de encuadre para evitar cortar rostros o personas.'}</span>
                                {cropSuggested.elementsToPreserve && (
                                    <div className="mt-1 text-[11px] text-amber-800 font-medium">
                                        💡 Elementos prioritarios a preservar: <strong>{cropSuggested.elementsToPreserve}</strong>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Canvas Stage */}
                    <div className="flex flex-col items-center">
                        <div
                            ref={canvasContainerRef}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            className={`relative w-full ${getContainerAspect()} rounded-2xl overflow-hidden shadow-2xl border border-gray-800 bg-[#071326] select-none ${isContain ? '' : 'cursor-grab active:cursor-grabbing'}`}
                        >
                            {/* Comparison before / after */}
                            {showComparison ? (
                                <div className="absolute inset-0 z-10 flex">
                                    <div className="w-1/2 h-full overflow-hidden relative border-r-2 border-white">
                                        <img
                                            src={candidate.url}
                                            alt="Antes (Sin ajuste)"
                                            className="w-full h-full object-cover object-top"
                                        />
                                        <span className="absolute top-3 left-3 px-2 py-0.5 bg-black/70 backdrop-blur rounded text-[10px] font-bold text-white uppercase">
                                            Antes (Top)
                                        </span>
                                    </div>
                                    <div className="w-1/2 h-full overflow-hidden relative">
                                        {isContain && (
                                            <div
                                                className="absolute inset-0 bg-cover bg-center blur-2xl scale-110 opacity-60"
                                                style={{ backgroundImage: `url(${candidate.url})` }}
                                            />
                                        )}
                                        <img
                                            src={candidate.url}
                                            alt="Después (Ajustado)"
                                            className={`w-full h-full ${isContain ? 'relative z-10 object-contain' : 'object-cover'}`}
                                            style={!isContain ? {
                                                objectPosition: `${effectivePosX}% ${effectivePosY}%`,
                                                transform: effectiveZoom > 100 ? `scale(${effectiveZoom / 100})` : undefined,
                                            } : undefined}
                                        />
                                        <span className="absolute top-3 right-3 px-2 py-0.5 bg-emerald-600/80 backdrop-blur rounded text-[10px] font-bold text-white uppercase">
                                            Nuevo Encuadre
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Contain blurred backdrop */}
                                    {isContain && (
                                        <div
                                            className="absolute inset-0 bg-cover bg-center blur-2xl scale-125 opacity-60"
                                            style={{ backgroundImage: `url(${candidate.url})` }}
                                        />
                                    )}

                                    {/* The Image */}
                                    <img
                                        src={candidate.url}
                                        alt={candidate.title || 'Foto'}
                                        draggable={false}
                                        className={`w-full h-full ${isContain ? 'relative z-10 object-contain' : 'object-cover'} pointer-events-none transition-transform duration-100 ease-out`}
                                        style={!isContain ? {
                                            objectPosition: `${effectivePosX}% ${effectivePosY}%`,
                                            transform: effectiveZoom > 100 ? `scale(${effectiveZoom / 100})` : undefined,
                                        } : undefined}
                                    />
                                </>
                            )}

                            {/* Hero Overlay Simulation (for hero container) */}
                            {containerKey === 'hero' && !showComparison && (
                                <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-end p-6 bg-gradient-to-t from-[#02132b]/80 via-transparent to-black/20">
                                    <div className="max-w-md text-white drop-shadow-md">
                                        <h3 className="text-xl sm:text-2xl font-light tracking-tight">Somos gente de acción</h3>
                                        <p className="text-[11px] sm:text-xs text-white/80 mt-1 line-clamp-2">
                                            Nuestra red mundial de vecinos, amigos y líderes voluntarios ofrecen sus conocimientos para resolver problemas.
                                        </p>
                                    </div>
                                    <div className="flex gap-1.5 mt-3">
                                        <div className="w-6 h-1.5 rounded-full bg-white" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
                                    </div>
                                </div>
                            )}

                            {/* Rule of Thirds Grid Overlay */}
                            {showGrid && !showComparison && (
                                <div className="absolute inset-0 pointer-events-none z-30 grid grid-cols-3 grid-rows-3">
                                    <div className="border-r border-b border-white/25" />
                                    <div className="border-r border-b border-white/25" />
                                    <div className="border-b border-white/25" />
                                    <div className="border-r border-b border-white/25" />
                                    <div className="border-r border-b border-white/25" />
                                    <div className="border-b border-white/25" />
                                    <div className="border-r border-white/25" />
                                    <div className="border-r border-white/25" />
                                    <div />
                                </div>
                            )}

                            {/* Focal Point Indicator (amber dot) */}
                            {!showComparison && !isContain && (
                                <div
                                    className="absolute w-4 h-4 rounded-full bg-amber-400 border-2 border-white shadow-lg pointer-events-none z-40 -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
                                    style={{
                                        left: `${effectivePosX}%`,
                                        top: `${effectivePosY}%`,
                                    }}
                                >
                                    <div className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-75" />
                                </div>
                            )}
                        </div>

                        {/* Caption under canvas */}
                        <div className="flex items-center justify-between w-full max-w-4xl mt-2 px-1 text-[11px] text-gray-400">
                            <span>
                                {isContain
                                    ? 'Modo imagen completa activo (sin recorte, fondo ambiental difuminado)'
                                    : 'Arrastra directamente la fotografía en el área visible para mover el encuadre.'}
                            </span>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowGrid(!showGrid)}
                                    className={`flex items-center gap-1 font-bold ${showGrid ? 'text-sky-600' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    <Grid className="w-3.5 h-3.5" /> Cuadrícula
                                </button>
                                <button
                                    onClick={() => setShowComparison(!showComparison)}
                                    className={`flex items-center gap-1 font-bold ${showComparison ? 'text-sky-600' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    <Eye className="w-3.5 h-3.5" /> {showComparison ? 'Volver al Editor' : 'Comparar Antes/Después'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Mode Selector and Controls Panel */}
                    <div className="bg-gray-50/80 rounded-2xl p-5 border border-gray-200/70 space-y-5">
                        {/* Mode selection buttons */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Modo de ajuste
                            </label>
                            <div className="grid grid-cols-3 gap-2 bg-gray-200/60 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('cover');
                                    }}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center ${mode === 'cover' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                >
                                    Cubrir contenedor
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('contain');
                                    }}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center ${mode === 'contain' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                >
                                    Mostrar completa
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('smart');
                                        handleApplyAiSuggestion();
                                    }}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1 ${mode === 'smart' ? 'bg-sky-600 text-white shadow-sm' : 'text-sky-800 hover:bg-sky-100'}`}
                                >
                                    <Sparkles className="w-3.5 h-3.5" /> Encuadre IA
                                </button>
                            </div>
                        </div>

                        {/* Sliders (enabled for cover and smart modes) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {/* Vertical Position */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-gray-700">Posición vertical</span>
                                    <span className="font-mono text-gray-500 font-bold bg-white px-2 py-0.5 rounded border border-gray-200">
                                        {effectivePosY}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={effectivePosY}
                                    disabled={isContain}
                                    onChange={(e) => {
                                        setMode('cover');
                                        setPosY(Number(e.target.value));
                                    }}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-rotary-blue disabled:opacity-40"
                                />
                                <div className="flex justify-between text-[10px] text-gray-400">
                                    <span>0% (Superior)</span>
                                    <span>50%</span>
                                    <span>100% (Inferior)</span>
                                </div>
                            </div>

                            {/* Horizontal Position */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-gray-700">Posición horizontal</span>
                                    <span className="font-mono text-gray-500 font-bold bg-white px-2 py-0.5 rounded border border-gray-200">
                                        {effectivePosX}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={effectivePosX}
                                    disabled={isContain}
                                    onChange={(e) => {
                                        setMode('cover');
                                        setPosX(Number(e.target.value));
                                    }}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-rotary-blue disabled:opacity-40"
                                />
                                <div className="flex justify-between text-[10px] text-gray-400">
                                    <span>0% (Izquierda)</span>
                                    <span>50%</span>
                                    <span>100% (Derecha)</span>
                                </div>
                            </div>

                            {/* Zoom */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-gray-700">Zoom / Escala</span>
                                    <span className="font-mono text-gray-500 font-bold bg-white px-2 py-0.5 rounded border border-gray-200">
                                        {effectiveZoom}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={100}
                                    max={200}
                                    step={2}
                                    value={effectiveZoom}
                                    disabled={isContain}
                                    onChange={(e) => {
                                        setMode('cover');
                                        setZoom(Number(e.target.value));
                                    }}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-rotary-blue disabled:opacity-40"
                                />
                                <div className="flex justify-between text-[10px] text-gray-400">
                                    <span>100% (Nativo)</span>
                                    <span>150%</span>
                                    <span>200%</span>
                                </div>
                            </div>
                        </div>

                        {/* Secondary tool buttons */}
                        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-gray-200/60 gap-3">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-white text-gray-600 font-bold text-xs flex items-center gap-1.5 transition-colors"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" /> Restablecer
                                </button>
                                <button
                                    type="button"
                                    onClick={handleApplyAiSuggestion}
                                    className="px-3 py-1.5 rounded-xl border border-sky-200 hover:bg-sky-50 text-sky-800 font-bold text-xs flex items-center gap-1.5 transition-colors"
                                >
                                    <Sparkles className="w-3.5 h-3.5 text-sky-600" /> Aplicar sugerencia IA
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCopyConfig}
                                    className="px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-white text-gray-600 font-bold text-xs flex items-center gap-1.5 transition-colors"
                                >
                                    <Copy className="w-3.5 h-3.5" /> Copiar ajuste
                                </button>
                            </div>

                            <span className="text-[11px] text-gray-400 font-medium">
                                Los cambios se guardan como metadato del contenedor sin alterar la foto original.
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold text-xs transition-colors"
                    >
                        Cancelar
                    </button>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSaveOnly}
                            disabled={saving || approving}
                            className="px-5 py-2.5 rounded-xl border border-sky-300 hover:bg-sky-50 text-sky-900 font-bold text-xs transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Guardando...' : 'Guardar Encuadre'}
                        </button>

                        <button
                            onClick={handleConfirmAndApprove}
                            disabled={saving || approving || (hasConflict && !isExceptionAuthorized)}
                            className={`px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 ${hasConflict ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-900/20' : 'bg-rotary-blue hover:bg-sky-800 shadow-blue-900/20'}`}
                        >
                            <CheckCircle className="w-4 h-4" />
                            {approving ? 'Publicando en Sitio...' : hasConflict ? 'Autorizar Excepción y Publicar' : 'Confirmar y Publicar en Sitio'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
