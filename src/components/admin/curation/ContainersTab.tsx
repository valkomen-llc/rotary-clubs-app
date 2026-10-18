import React from 'react';
import { Lock, Unlock, Monitor, CheckCircle, AlertCircle, Shield, Sparkles } from 'lucide-react';

interface ContainersTabProps {
    containers: any[];
    siteImages: any;
    locks: any[];
    onToggleLock: (containerKey: string, slotIndex: number, locked: boolean) => void;
}

export const ContainersTab: React.FC<ContainersTabProps> = ({
    containers,
    siteImages,
    locks,
    onToggleLock,
}) => {
    const isLocked = (key: string, idx: number) => {
        return locks.some((l) => l.containerKey === key && Number(l.slotIndex) === idx);
    };

    return (
        <div className="w-full space-y-6">
            <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 text-xs text-sky-900 flex items-start gap-3">
                <Shield className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                <div>
                    <span className="font-bold">Control de Bloqueo Editorial:</span>
                    <p className="mt-0.5 text-sky-700">
                        Puedes bloquear cualquier espacio visual para preservar una imagen fija que no deba ser rotada automáticamente por la IA (por ejemplo, una fotografía histórica o de campaña oficial).
                    </p>
                </div>
            </div>

            <div className="space-y-5">
                {containers.map((c) => {
                    const currentSlots = Array.isArray(siteImages?.[c.key])
                        ? siteImages[c.key]
                        : siteImages?.[c.key]
                        ? [siteImages[c.key]]
                        : [];

                    return (
                        <div key={c.key} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                                        <Monitor className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">{c.label}</h4>
                                        <p className="text-xs text-gray-400">{c.desc}</p>
                                    </div>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                                    {c.count} {c.count === 1 ? 'Espacio' : 'Espacios'}
                                </span>
                            </div>

                            {/* Slot Cards Grid: adaptable de 1 a 5 columnas según breakpoint */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4 pt-2">
                                {Array.from({ length: c.count }).map((_, idx) => {
                                    const currentImg = currentSlots[idx]?.url;
                                    const locked = isLocked(c.key, idx);
                                    const slotLabel = c.key === 'hero' ? `Slide ${idx + 1}` : c.key === 'causes' ? `Causa ${idx + 1}` : `Espacio ${idx + 1}`;

                                    return (
                                        <div
                                            key={idx}
                                            className={`p-3.5 rounded-2xl border flex items-center gap-3 transition-all ${locked ? 'bg-amber-50/60 border-amber-300 shadow-sm' : 'bg-gray-50/50 border-gray-200 hover:border-gray-300'}`}
                                        >
                                            <div className="relative w-16 h-12 bg-gray-200 rounded-xl overflow-hidden flex-shrink-0 border border-gray-300/80 shadow-xs">
                                                {currentImg ? (
                                                    <img
                                                        src={currentImg}
                                                        alt={`${c.label} ${idx + 1}`}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 font-bold bg-gray-100">
                                                        Vacío
                                                    </div>
                                                )}
                                                {locked && (
                                                    <div className="absolute inset-0 bg-amber-900/50 backdrop-blur-[1px] flex items-center justify-center text-white">
                                                        <Lock className="w-3.5 h-3.5" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-xs text-gray-900 truncate">
                                                        {slotLabel}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => onToggleLock(c.key, idx, !locked)}
                                                        className={`p-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${locked ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200/70'}`}
                                                        title={locked ? 'Desbloquear para permitir rotación IA' : 'Bloquear slot'}
                                                    >
                                                        {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-gray-500 truncate mt-0.5">
                                                    {locked ? 'Fijado por administrador' : 'Elegible para curaduría IA'}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
