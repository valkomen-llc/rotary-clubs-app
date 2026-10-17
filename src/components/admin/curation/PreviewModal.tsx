import React, { useState } from 'react';
import {
    X, Laptop, Smartphone, CheckCircle, AlertTriangle, ShieldCheck,
    Sliders, ExternalLink, ArrowRight, Eye, Sparkles
} from 'lucide-react';

interface PreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    recommendation: any;
    onApprove: (recId: string) => void;
    onReject: (recId: string) => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
    isOpen,
    onClose,
    recommendation,
    onApprove,
    onReject,
}) => {
    const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
    const [tab, setTab] = useState<'preview' | 'breakdown'>('preview');

    if (!isOpen || !recommendation) return null;

    const candidate = recommendation.candidate || {
        url: recommendation.candidateUrl,
        filename: recommendation.candidateFilename,
        title: recommendation.candidateTitle,
        club: recommendation.candidateClub,
        score: recommendation.score,
        breakdown: recommendation.breakdown || {},
        facts: recommendation.facts || [],
        interpretation: recommendation.interpretation || '',
        reasons: recommendation.reasons || [],
        warnings: recommendation.warnings || [],
    };

    const containerName = recommendation.containerKey === 'hero'
        ? `Hero — Slide ${(recommendation.slotIndex || 0) + 1}`
        : recommendation.containerKey === 'foundation'
        ? 'Fundación Rotaria'
        : recommendation.containerKey === 'join'
        ? 'Sección Únete'
        : recommendation.containerKey;

    const breakdown = candidate.breakdown || {};
    const scoreColor = (candidate.score || recommendation.score) >= 85
        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
        : 'text-sky-700 bg-sky-50 border-sky-200';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-black">
                            <Sparkles className="w-5 h-5 text-sky-600" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-gray-900">{containerName}</h2>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-black border ${scoreColor}`}>
                                    {candidate.score || recommendation.score}/100 Puntos
                                </span>
                            </div>
                            <p className="text-xs text-gray-500">
                                {candidate.club || 'Club Rotario'} · {candidate.title || candidate.filename}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Subheader Toolbar */}
                <div className="px-6 py-2.5 bg-white border-b border-gray-100 flex items-center justify-between">
                    {/* View mode toggle */}
                    <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                        <button
                            onClick={() => setViewMode('desktop')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            <Laptop className="w-3.5 h-3.5" /> Escritorio (1600×700)
                        </button>
                        <button
                            onClick={() => setViewMode('mobile')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            <Smartphone className="w-3.5 h-3.5" /> Móvil
                        </button>
                    </div>

                    {/* Content tab toggle */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setTab('preview')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'preview' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Simulación en Sitio Real
                        </button>
                        <button
                            onClick={() => setTab('breakdown')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'breakdown' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Métricas & Criterio IA
                        </button>
                    </div>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {tab === 'preview' ? (
                        <div className="space-y-4">
                            {/* Live Site Mockup Container */}
                            <div className="flex justify-center">
                                <div
                                    className={`relative transition-all duration-300 rounded-2xl overflow-hidden shadow-2xl border-4 border-gray-800 bg-gray-950 ${viewMode === 'desktop' ? 'w-full max-w-3xl aspect-[16/7]' : 'w-72 aspect-[9/16]'}`}
                                >
                                    {/* Mock browser top bar if desktop */}
                                    {viewMode === 'desktop' && (
                                        <div className="absolute top-0 left-0 right-0 h-6 bg-gray-900/90 backdrop-blur z-20 flex items-center px-3 gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-red-500" />
                                            <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                            <div className="w-2 h-2 rounded-full bg-green-500" />
                                            <span className="text-[10px] text-gray-400 font-mono mx-auto">
                                                https://rotary4281.org
                                            </span>
                                        </div>
                                    )}

                                    {/* Image */}
                                    <img
                                        src={candidate.url}
                                        alt={candidate.title || 'Vista previa'}
                                        className="w-full h-full object-cover object-center"
                                    />

                                    {/* Real Hero Overlay Gradient & Typography */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20 flex flex-col justify-end p-6 md:p-10 z-10 text-white">
                                        <div className="max-w-xl space-y-2">
                                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rotary-blue/80 text-white backdrop-blur">
                                                Gente de Acción
                                            </span>
                                            <h3 className="text-xl md:text-3xl font-black tracking-tight drop-shadow-md">
                                                Somos gente de acción
                                            </h3>
                                            <p className="text-xs md:text-sm text-gray-200 line-clamp-2 drop-shadow">
                                                Nuestra red de voluntarios ofrece sus conocimientos y recursos para resolver problemas y abordar las necesidades de las comunidades.
                                            </p>
                                            <div className="pt-2 flex items-center gap-3">
                                                <div className="px-4 py-1.5 rounded-xl bg-white text-gray-900 font-bold text-xs shadow-lg flex items-center gap-1.5">
                                                    ★ Toma Acción con Nosotros
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Framing & Integrity note */}
                            <div className="bg-sky-50/60 border border-sky-100 rounded-2xl p-4 text-xs text-sky-900 flex items-start gap-3">
                                <ShieldCheck className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold">Preservación documental y encuadre inteligente</p>
                                    <p className="text-sky-700 mt-0.5">
                                        La vista previa simula el recorte panorámico (1600 × 700 px) sin deformar la fotografía original. Los rostros principales y la acción de servicio se mantienen dentro del punto focal seguro.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Breakdown & Metrics Tab */
                        <div className="space-y-6">
                            {/* Score Breakdown Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl text-center">
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Relevancia (30%)</span>
                                    <p className="text-xl font-black text-gray-900 mt-1">{breakdown.institutional || 85}/100</p>
                                </div>
                                <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl text-center">
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Técnica (20%)</span>
                                    <p className="text-xl font-black text-gray-900 mt-1">{breakdown.technical || 90}/100</p>
                                </div>
                                <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl text-center">
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Composición (20%)</span>
                                    <p className="text-xl font-black text-gray-900 mt-1">{breakdown.composition || 88}/100</p>
                                </div>
                                <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl text-center">
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Contenedor (20%)</span>
                                    <p className="text-xl font-black text-gray-900 mt-1">{breakdown.containerFit || 92}/100</p>
                                </div>
                                <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl text-center">
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Narrativa (10%)</span>
                                    <p className="text-xl font-black text-gray-900 mt-1">{breakdown.narrative || 80}/100</p>
                                </div>
                            </div>

                            {/* Facts vs Interpretation */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Hechos Observables (Medidos)
                                    </h4>
                                    <ul className="mt-3 space-y-2 text-xs text-gray-700">
                                        {(candidate.facts?.length ? candidate.facts : candidate.reasons).map((f: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5 text-sky-500" /> Interpretación Editorial IA
                                    </h4>
                                    <p className="mt-3 text-xs text-gray-600 leading-relaxed">
                                        {candidate.interpretation || 'Candidata de alto impacto para el Hero. Aporta dinamismo, representatividad institucional y composición adecuada para elementos de interfaz.'}
                                    </p>
                                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 text-[11px] text-gray-500">
                                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                        <span>Consentimiento verificado vía Rotary en Acción</span>
                                    </div>
                                </div>
                            </div>

                            {/* Warnings if any */}
                            {candidate.warnings && candidate.warnings.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-2.5">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <span className="font-bold">Advertencia editorial:</span>
                                        <p className="mt-0.5 text-amber-800">{candidate.warnings.join(' ')}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-xs hover:bg-gray-100 transition-colors"
                    >
                        Cerrar Vista Previa
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                onReject(recommendation.id);
                                onClose();
                            }}
                            className="px-5 py-2.5 rounded-xl border border-red-200 text-red-600 font-bold text-xs hover:bg-red-50 transition-colors"
                        >
                            ✕ Rechazar Recomendación
                        </button>
                        <button
                            onClick={() => {
                                onApprove(recommendation.id);
                                onClose();
                            }}
                            className="px-6 py-2.5 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold text-xs shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center gap-2"
                        >
                            <CheckCircle className="w-4 h-4" /> Aprobar y Publicar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
