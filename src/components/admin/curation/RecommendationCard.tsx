import React, { useState } from 'react';
import {
    CheckCircle, XCircle, Eye, MoreHorizontal, Lock, Unlock,
    ArrowRightLeft, Sparkles, AlertTriangle, ShieldCheck, MapPin, Sliders
} from 'lucide-react';

interface RecommendationCardProps {
    rec: any;
    onApprove: (id: string, framingConfig?: any) => void;
    onReject: (id: string) => void;
    onPreview: (rec: any) => void;
    onAdjustFraming: (rec: any) => void;
    onReassign: (id: string, newContainer: string) => void;
    onToggleLock?: (containerKey: string, slotIndex: number, locked: boolean) => void;
    isLocked?: boolean;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
    rec,
    onApprove,
    onReject,
    onPreview,
    onAdjustFraming,
    onReassign,
    onToggleLock,
    isLocked = false,
}) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const candidate = rec.candidate || {
        url: rec.candidateUrl,
        filename: rec.candidateFilename,
        title: rec.candidateTitle,
        club: rec.candidateClub,
        activityDate: rec.candidateActivityDate,
        score: rec.score,
        facts: rec.facts || [],
        reasons: rec.reasons || [],
        interpretation: rec.interpretation,
    };

    const containerLabel = rec.containerKey === 'hero'
        ? `Hero — Slide ${(rec.slotIndex || 0) + 1}`
        : rec.containerKey === 'foundation'
        ? 'Fundación Rotaria'
        : rec.containerKey === 'join'
        ? 'Sección Únete'
        : rec.containerKey === 'causes'
        ? `Áreas de Interés · Causa ${(rec.slotIndex || 0) + 1}`
        : rec.containerKey;

    const targetDimension = rec.containerKey === 'hero'
        ? '1600 × 700 px'
        : rec.containerKey === 'foundation'
        ? '1600 × 700 px'
        : rec.containerKey === 'join'
        ? '800 × 600 px'
        : 'Formato adaptable';

    const score = rec.score || candidate.score || 85;
    const isApproved = rec.status === 'approved';
    const isRejected = rec.status === 'rejected';

    const cropSuggested = rec.cropSuggested || {};
    const requiresAdjustment = rec.requiresCropAdjustment || cropSuggested.requiresCropAdjustment || rec.cropRisk === 'high';
    const posX = cropSuggested.x ?? 50;
    const posY = cropSuggested.y ?? 50;
    const zoom = (cropSuggested.zoom ?? 100) / 100;
    const isContain = cropSuggested.mode === 'contain';

    const conflictInfo = rec.conflictInfo;
    const isHero = rec.containerKey === 'hero';
    const hasConflict = Boolean(conflictInfo?.hasConflict);
    const isAlternative = Boolean(rec.isAlternative || rec.alternativeReason);

    return (
        <div className={`relative bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md flex flex-col ${isApproved ? 'border-emerald-300 ring-2 ring-emerald-100' : isRejected ? 'border-gray-200 opacity-60' : hasConflict ? 'border-amber-300 ring-1 ring-amber-100' : 'border-gray-200/80 hover:border-sky-300'}`}>
            {/* Top Bar with Container & Score */}
            <div className="px-5 py-3.5 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 text-sm">{containerLabel}</span>
                    {hasConflict && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200" title="Utilizada como portada de noticia">
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> En Noticia
                        </span>
                    )}
                    {isAlternative && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Sparkles className="w-2.5 h-2.5 text-emerald-600" /> Alternativa
                        </span>
                    )}
                    {isLocked && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            <Lock className="w-2.5 h-2.5" /> Bloqueado
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 ${score >= 90 ? 'bg-emerald-100 text-emerald-800' : score >= 75 ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`} title={`Calidad visual: ${score}/100${hasConflict ? ' (No penalizada por duplicación)' : ''}`}>
                        <Sparkles className="w-3 h-3" />
                        {score}/100
                    </span>

                    {/* Quick options menu */}
                    <div className="relative">
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-30 text-xs font-semibold text-gray-700 animate-fade-in">
                                <button
                                    onClick={() => {
                                        setMenuOpen(false);
                                        onAdjustFraming(rec);
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-sky-700 font-bold"
                                >
                                    <Sliders className="w-3.5 h-3.5 text-sky-600" /> Ajustar imagen y previsualizar
                                </button>
                                <button
                                    onClick={() => {
                                        setMenuOpen(false);
                                        onPreview(rec);
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <Eye className="w-3.5 h-3.5 text-gray-500" /> Ver mockup general
                                </button>
                                <button
                                    onClick={() => {
                                        setMenuOpen(false);
                                        const newTarget = rec.containerKey === 'hero' ? 'foundation' : 'hero';
                                        onReassign(rec.id, newTarget);
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                                    Cambiar a {rec.containerKey === 'hero' ? 'Fundación Rotaria' : 'Hero'}
                                </button>
                                {onToggleLock && (
                                    <button
                                        onClick={() => {
                                            setMenuOpen(false);
                                            onToggleLock(rec.containerKey, rec.slotIndex || 0, !isLocked);
                                        }}
                                        className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                                    >
                                        {isLocked ? (
                                            <>
                                                <Unlock className="w-3.5 h-3.5 text-amber-600" /> Desbloquear contenedor
                                            </>
                                        ) : (
                                            <>
                                                <Lock className="w-3.5 h-3.5 text-amber-600" /> Bloquear slot para rotaciones
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Thumbnail Preview Area with custom crop representation */}
            <div
                className="relative aspect-[16/9] w-full bg-gray-900 overflow-hidden group cursor-pointer"
                onClick={() => onAdjustFraming(rec)}
            >
                {isContain && (
                    <div
                        className="absolute inset-0 bg-cover bg-center blur-lg opacity-50 scale-110"
                        style={{ backgroundImage: `url(${candidate.url})` }}
                    />
                )}
                <img
                    src={candidate.url}
                    alt={candidate.title || 'Recomendación IA'}
                    className={`w-full h-full ${isContain ? 'relative z-10 object-contain' : 'object-cover'} group-hover:scale-105 transition-transform duration-300`}
                    style={!isContain ? {
                        objectPosition: `${posX}% ${posY}%`,
                        transform: zoom > 1 ? `scale(${zoom})` : undefined,
                    } : undefined}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-xs z-20">
                    <Sliders className="w-4 h-4 text-sky-400" /> Ajustar imagen y previsualizar
                </div>
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-[10px] text-white font-mono z-20">
                    Destino: {targetDimension}
                </div>
                {cropSuggested.userAdjusted && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-emerald-600/90 text-white text-[10px] font-bold z-20">
                        ✓ Encuadre calibrado
                    </div>
                )}
            </div>

            {/* Card Content & Reasons */}
            <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-sky-800 font-bold">
                        <MapPin className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                        <span className="truncate">{candidate.club || 'Rotary Distrito 4281'}</span>
                    </div>
                    <h4 className="font-bold text-gray-900 text-sm leading-snug line-clamp-1">
                        {candidate.title || candidate.filename}
                    </h4>
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {candidate.interpretation || (candidate.facts?.[0] ? candidate.facts.join('. ') : 'Alineada con las prioridades visuales del sitio.')}
                    </p>

                    {/* Exclusivity Alert if Cover of News */}
                    {hasConflict && isHero && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/90 text-[11px] text-amber-900 space-y-1">
                            <div className="flex items-center gap-1.5 font-bold text-amber-800">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                <span>No elegible automáticamente para Hero</span>
                            </div>
                            <p className="leading-snug text-gray-800">
                                Portada activa en la noticia: <strong className="text-amber-950 font-bold">«{conflictInfo.newsTitle || 'Noticia publicada'}»</strong>.
                            </p>
                            <p className="text-[10px] text-amber-700">
                                {conflictInfo.matchType === 'exact' ? 'Coincidencia exacta de archivo.' : 'Similitud visual / recorte detectado.'} Excluida del slider principal para no duplicar contenidos.
                            </p>
                        </div>
                    )}

                    {/* Alternative Image Note */}
                    {isAlternative && (
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold block text-emerald-950">Alternativa inteligente sugerida:</span>
                                <span className="text-emerald-800 text-[10px] leading-relaxed">
                                    {rec.alternativeReason || 'Toma diferente de la misma actividad seleccionada para preservar la diversidad y evitar repetir la portada de noticia.'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Warning if crop risk is high */}
                    {requiresAdjustment && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-1.5 rounded-xl">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                            <span className="truncate">Requiere ajuste de encuadre antes de publicar</span>
                        </div>
                    )}
                </div>

                {/* Consent & Ethics Indicator */}
                <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                    <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Autorizado para difusión
                    </span>
                    {candidate.activityDate && (
                        <span>{candidate.activityDate}</span>
                    )}
                </div>

                {/* Status or Action Buttons */}
                <div className="pt-2">
                    {isApproved ? (
                        <div className="w-full py-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-200">
                            <CheckCircle className="w-4 h-4" /> Aprobada y Publicada
                        </div>
                    ) : isRejected ? (
                        <div className="w-full py-2 bg-gray-100 text-gray-500 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5">
                            <XCircle className="w-4 h-4" /> Descartada
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {/* Primary action: Ajustar imagen y previsualizar */}
                            <button
                                onClick={() => onAdjustFraming(rec)}
                                className="w-full py-2 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 border border-sky-200"
                            >
                                <Sliders className="w-3.5 h-3.5 text-sky-600" />
                                <span>Ajustar imagen y previsualizar</span>
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => onReject(rec.id)}
                                    className="py-2 px-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs transition-colors flex items-center justify-center gap-1"
                                >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Rechazar</span>
                                </button>
                                <button
                                    onClick={() => {
                                        if (hasConflict && isHero) {
                                            // Open framing modal to solicit exception justification
                                            onAdjustFraming(rec);
                                        } else {
                                            onApprove(rec.id);
                                        }
                                    }}
                                    className={`py-2 px-2 rounded-xl text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1 ${hasConflict && isHero ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-900/10' : 'bg-rotary-blue hover:bg-sky-800 shadow-blue-900/10'}`}
                                >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>{hasConflict && isHero ? 'Revisar Excepción' : 'Aprobar'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
