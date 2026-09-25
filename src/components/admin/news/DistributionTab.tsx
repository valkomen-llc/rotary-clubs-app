import React, { useMemo, useState } from 'react';
import {
    Globe, Search, Sparkles, Building2, Check, CheckCircle2,
    Send, AlertCircle, ArrowUpRight, ShieldCheck, RefreshCw,
    Users, Compass, Layers, Info, Filter, ExternalLink
} from 'lucide-react';

export interface DistributionTarget {
    id: string;
    name: string;
    category: string;
    organizationType: string;
    city?: string;
    country?: string;
    domain?: string | null;
    subdomain?: string | null;
    logo?: string | null;
    status?: string;
    type?: string;
    districtId?: string;
    districtName?: string;
    districtNumber?: number;
    group: 'clubes' | 'rotaract' | 'interact' | 'programas' | 'satelites' | 'distrito';
    groupLabel: string;
}

export interface SuggestedDestination {
    clubId: string;
    clubName: string;
    category?: string;
    organizationType?: string;
    city?: string;
    reason: string;
    matchType?: 'direct_mention' | 'location_match' | 'ai_semantic';
    confidence: number;
}

interface DistributionTabProps {
    formData: {
        title: string;
        content: string;
        targetClubIds: string[];
        publishToDistrict?: boolean;
        canonicalUrl?: string;
        scheduledAt?: string;
        distributionStatus?: Record<string, any>;
        deliveryMode?: 'immediate' | 'approval';
    };
    setFormData: React.Dispatch<React.SetStateAction<any>>;
    club: any;
    user: any;
    targets: DistributionTarget[];
    aiSuggestions: SuggestedDestination[];
    onSuggestWithAI: () => void;
    isSuggestingAI: boolean;
}

export const DistributionTab: React.FC<DistributionTabProps> = ({
    formData,
    setFormData,
    club,
    user,
    targets,
    aiSuggestions,
    onSuggestWithAI,
    isSuggestingAI
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeGroup, setActiveGroup] = useState<'all' | 'clubes' | 'rotaract' | 'interact' | 'programas' | 'selected'>('all');
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

    // ── Detección reactiva de menciones en el texto ──────────────────────
    const directMentions = useMemo(() => {
        if (!targets || targets.length === 0) return [];
        const fullText = `${formData.title} ${formData.content}`
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        if (fullText.length < 15) return [];

        return targets.filter(t => {
            if (formData.targetClubIds.includes(t.id)) return false;
            if (dismissedIds.has(t.id)) return false;

            const cleanName = t.name
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/^club rotario\s+/i, '')
                .replace(/^rotary club\s+/i, '')
                .replace(/^rotaract club\s+/i, '')
                .replace(/^interact club\s+/i, '')
                .trim();

            if (cleanName.length > 3 && fullText.includes(cleanName)) return true;
            if (t.city && t.city.length > 3 && formData.title.toLowerCase().includes(t.city.toLowerCase())) return true;
            return false;
        }).map(t => ({
            clubId: t.id,
            clubName: t.name,
            category: t.category,
            organizationType: t.organizationType,
            city: t.city,
            reason: `El club o su localidad (${t.city || t.name}) aparece mencionado en el artículo.`,
            matchType: 'direct_mention' as const,
            confidence: 0.95,
        }));
    }, [formData.title, formData.content, targets, formData.targetClubIds, dismissedIds]);

    // Combinar menciones directas con sugerencias IA
    const activeSuggestions = useMemo(() => {
        const map = new Map<string, SuggestedDestination>();
        for (const m of directMentions) {
            map.set(m.clubId, m);
        }
        for (const s of aiSuggestions) {
            if (!formData.targetClubIds.includes(s.clubId) && !dismissedIds.has(s.clubId)) {
                if (!map.has(s.clubId)) {
                    map.set(s.clubId, s);
                }
            }
        }
        return Array.from(map.values());
    }, [directMentions, aiSuggestions, formData.targetClubIds, dismissedIds]);

    const handleToggleTarget = (id: string) => {
        setFormData((prev: any) => {
            const current = prev.targetClubIds || [];
            const next = current.includes(id)
                ? current.filter((x: string) => x !== id)
                : [...current, id];
            return { ...prev, targetClubIds: next };
        });
    };

    const handleAcceptSuggestion = (clubId: string) => {
        setFormData((prev: any) => {
            const current = prev.targetClubIds || [];
            if (!current.includes(clubId)) {
                return { ...prev, targetClubIds: [...current, clubId] };
            }
            return prev;
        });
    };

    const handleDismissSuggestion = (clubId: string) => {
        setDismissedIds(prev => new Set(prev).add(clubId));
    };

    // Filtrado de destinos
    const filteredTargets = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return targets.filter(t => {
            // No listar el sitio emisor propio si está en la lista de clubes (se maneja en Publicación Principal)
            if (t.id === club?.id) return false;

            if (activeGroup === 'selected') {
                if (!formData.targetClubIds.includes(t.id)) return false;
            } else if (activeGroup !== 'all') {
                if (t.group !== activeGroup) return false;
            }

            if (q) {
                const matchName = t.name.toLowerCase().includes(q);
                const matchCity = (t.city || '').toLowerCase().includes(q);
                const matchOrg = (t.organizationType || '').toLowerCase().includes(q);
                if (!matchName && !matchCity && !matchOrg) return false;
            }

            return true;
        });
    }, [targets, club?.id, activeGroup, searchQuery, formData.targetClubIds]);

    const allFilteredSelected = filteredTargets.length > 0 && filteredTargets.every(t => formData.targetClubIds.includes(t.id));

    const handleSelectAllFiltered = () => {
        setFormData((prev: any) => {
            const current = new Set(prev.targetClubIds || []);
            if (allFilteredSelected) {
                // Quitar todos los filtrados
                for (const t of filteredTargets) current.delete(t.id);
            } else {
                // Agregar todos los filtrados
                for (const t of filteredTargets) current.add(t.id);
            }
            return { ...prev, targetClubIds: Array.from(current) };
        });
    };

    // Contadores de grupos
    const counts = useMemo(() => {
        const valid = targets.filter(t => t.id !== club?.id);
        return {
            all: valid.length,
            clubes: valid.filter(t => t.group === 'clubes').length,
            rotaract: valid.filter(t => t.group === 'rotaract').length,
            interact: valid.filter(t => t.group === 'interact').length,
            programas: valid.filter(t => t.group === 'programas' || t.group === 'satelites').length,
            selected: formData.targetClubIds.length,
        };
    }, [targets, club?.id, formData.targetClubIds]);

    const districtName = club?.name || user?.district?.name || 'Distrito 4281';

    return (
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
            {/* Header Banner */}
            <div className="rounded-3xl bg-gradient-to-br from-rotary-blue via-sky-900 to-indigo-950 p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-bold uppercase tracking-wider mb-2">
                            <Send className="w-3.5 h-3.5 text-rotary-gold" />
                            <span>Centro de Distribución Editorial</span>
                        </div>
                        <h3 className="text-xl font-black text-white tracking-tight">
                            Difusión Jerárquica Multisitio
                        </h3>
                        <p className="text-xs text-sky-100/90 mt-1 max-w-2xl font-medium leading-relaxed">
                            Redacta tu artículo una sola vez desde el Distrito y replícalo de manera controlada y sincronizada hacia los clubes, programas y satélites de tu red rotaria.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <div className="px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 text-xs">
                            <span className="text-[10px] text-sky-200 uppercase font-black tracking-wider block">Ámbito Emisor</span>
                            <span className="font-bold text-white flex items-center gap-1.5 mt-0.5">
                                <Building2 className="w-3.5 h-3.5 text-rotary-gold" />
                                {districtName}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onSuggestWithAI}
                            disabled={isSuggestingAI}
                            className="px-4 py-2.5 rounded-2xl bg-rotary-gold hover:bg-amber-500 text-gray-950 font-bold text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Sparkles className={`w-3.5 h-3.5 ${isSuggestingAI ? 'animate-spin' : ''}`} />
                            {isSuggestingAI ? 'Analizando artículo...' : 'Sugerir destinos con IA'}
                        </button>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 1: PUBLICACIÓN PRINCIPAL */}
            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-rotary-blue/10 flex items-center justify-center text-rotary-blue">
                            <Globe className="w-4 h-4" />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide">Publicación Principal</h4>
                            <p className="text-xs text-gray-500">Determina si la noticia se publicará en el portal institucional del Distrito.</p>
                        </div>
                    </div>
                </div>

                <label className="flex items-start gap-3.5 p-4 rounded-2xl border border-sky-100 bg-sky-50/50 hover:bg-sky-50 transition-colors cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={formData.publishToDistrict !== false}
                        onChange={(e) => setFormData((prev: any) => ({ ...prev, publishToDistrict: e.target.checked }))}
                        className="w-5 h-5 rounded-md text-rotary-blue focus:ring-rotary-blue border-gray-300 mt-0.5 cursor-pointer"
                    />
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-900">
                                Publicar en el portal web de {districtName}
                            </span>
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rotary-blue/10 text-rotary-blue">
                                Fuente Maestra
                            </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                            El artículo aparecerá en la sección de Noticias y Blog oficial del sitio web del distrito con toda su identidad visual.
                        </p>
                    </div>
                </label>
            </div>

            {/* SECCIÓN 2: DESTINOS SUGERIDOS POR IA O DETECCIÓN */}
            {activeSuggestions.length > 0 && (
                <div className="rounded-3xl border border-amber-200/80 bg-amber-50/40 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                                <Sparkles className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide">Destinos Recomendados</h4>
                                <p className="text-xs text-gray-600">La plataforma detectó posibles clubes y entidades relacionadas con este artículo.</p>
                            </div>
                        </div>
                        <span className="text-xs font-bold text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-full">
                            {activeSuggestions.length} sugerencia(s)
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeSuggestions.map((sug) => (
                            <div
                                key={sug.clubId}
                                className="bg-white rounded-2xl border border-amber-200/60 p-4 flex flex-col justify-between gap-3 shadow-xs hover:border-amber-300 transition-all"
                            >
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <span className="font-bold text-xs text-gray-900 truncate">{sug.clubName}</span>
                                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
                                            {sug.matchType === 'direct_mention' ? 'Mención Directa' : 'Relevancia IA'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 leading-relaxed font-medium">
                                        {sug.reason}
                                    </p>
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => handleDismissSuggestion(sug.clubId)}
                                        className="px-2.5 py-1 text-xs text-gray-400 hover:text-gray-600 font-bold transition-colors"
                                    >
                                        Ignorar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAcceptSuggestion(sug.clubId)}
                                        className="px-3.5 py-1.5 text-xs bg-rotary-blue hover:bg-sky-800 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-xs"
                                    >
                                        <Check className="w-3.5 h-3.5" /> Agregar destino
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* SECCIÓN 3: SELECTOR DE DESTINOS */}
            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xs space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-rotary-gold/20 flex items-center justify-center text-rotary-navy">
                            <Layers className="w-4 h-4" />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide">Distribuir También En</h4>
                            <p className="text-xs text-gray-500">Selecciona los sitios donde se publicará este artículo.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-rotary-blue bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
                            {formData.targetClubIds.length} seleccionado(s)
                        </span>
                    </div>
                </div>

                {/* Filtros y Buscador */}
                <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Buscar club, programa, ciudad o entidad..."
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue/20 focus:bg-white transition-all"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleSelectAllFiltered}
                            disabled={filteredTargets.length === 0}
                            className={`px-4 py-2.5 rounded-2xl font-bold text-xs border transition-all flex items-center justify-center gap-2 shrink-0 ${allFilteredSelected
                                ? 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                                : 'bg-rotary-blue/5 text-rotary-blue border-rotary-blue/20 hover:bg-rotary-blue/10'
                                }`}
                        >
                            <Check className="w-3.5 h-3.5" />
                            {allFilteredSelected
                                ? `Deseleccionar visibles (${filteredTargets.length})`
                                : `Seleccionar visibles (${filteredTargets.length})`}
                        </button>
                    </div>

                    {/* Pestañas de Segmentación */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        {[
                            { id: 'all', label: 'Todos', count: counts.all },
                            { id: 'clubes', label: 'Clubes', count: counts.clubes },
                            { id: 'rotaract', label: 'Rotaract', count: counts.rotaract },
                            { id: 'interact', label: 'Interact', count: counts.interact },
                            { id: 'programas', label: 'Programas', count: counts.programas },
                            { id: 'selected', label: 'Seleccionados', count: counts.selected },
                        ].map((grp) => (
                            <button
                                key={grp.id}
                                type="button"
                                onClick={() => setActiveGroup(grp.id as any)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${activeGroup === grp.id
                                    ? 'bg-rotary-blue text-white shadow-xs'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/70'
                                    }`}
                            >
                                <span>{grp.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeGroup === grp.id ? 'bg-white/20 text-white' : 'bg-white text-gray-600'}`}>
                                    {grp.count}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Lista de Destinos */}
                <div className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50/50">
                    <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
                        {filteredTargets.length === 0 ? (
                            <div className="text-center py-10 px-4">
                                <Building2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                <p className="text-xs font-bold text-gray-500">No se encontraron destinos disponibles</p>
                                <p className="text-[11px] text-gray-400 mt-1">Prueba cambiando los filtros o la búsqueda.</p>
                            </div>
                        ) : (
                            filteredTargets.map((t) => {
                                const selected = formData.targetClubIds.includes(t.id);
                                return (
                                    <div
                                        key={t.id}
                                        onClick={() => handleToggleTarget(t.id)}
                                        className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${selected
                                            ? 'bg-blue-50/80 border-rotary-blue/30 shadow-xs'
                                            : 'bg-white border-gray-100 hover:border-gray-200'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${selected
                                                ? 'bg-rotary-blue border-rotary-blue text-white'
                                                : 'border-gray-300 bg-white'
                                                }`}>
                                                {selected && <Check className="w-3.5 h-3.5" />}
                                            </div>

                                            <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center shrink-0 border border-gray-100">
                                                {t.logo ? (
                                                    <img src={t.logo} alt="" className="w-full h-full object-contain" />
                                                ) : (
                                                    <Building2 className="w-4 h-4 text-gray-400" />
                                                )}
                                            </div>

                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-900 truncate">
                                                    {t.name}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] font-semibold text-gray-500">
                                                        {t.organizationType || t.category}
                                                    </span>
                                                    {t.city && (
                                                        <>
                                                            <span className="text-gray-300 text-[10px]">·</span>
                                                            <span className="text-[10px] text-gray-400">{t.city}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status === 'active'
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                {t.status === 'active' ? 'Sitio Activo' : (t.status || 'Borrador')}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Modo de Publicación */}
                <div className="pt-2 border-t border-gray-100">
                    <span className="text-xs font-black uppercase text-gray-700 tracking-wider block mb-2">
                        Modo de Entrega a los Clubes
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${formData.deliveryMode !== 'approval'
                            ? 'bg-blue-50/60 border-rotary-blue/30 text-rotary-blue'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}>
                            <input
                                type="radio"
                                name="deliveryMode"
                                checked={formData.deliveryMode !== 'approval'}
                                onChange={() => setFormData((prev: any) => ({ ...prev, deliveryMode: 'immediate' }))}
                                className="mt-0.5 text-rotary-blue focus:ring-rotary-blue"
                            />
                            <div>
                                <span className="font-bold text-xs text-gray-900 block">⚡ Publicación Directa (Recomendado)</span>
                                <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">
                                    El artículo se publicará de inmediato en todos los clubes seleccionados como contenido oficial del Distrito.
                                </span>
                            </div>
                        </label>

                        <label className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${formData.deliveryMode === 'approval'
                            ? 'bg-blue-50/60 border-rotary-blue/30 text-rotary-blue'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}>
                            <input
                                type="radio"
                                name="deliveryMode"
                                checked={formData.deliveryMode === 'approval'}
                                onChange={() => setFormData((prev: any) => ({ ...prev, deliveryMode: 'approval' }))}
                                className="mt-0.5 text-rotary-blue focus:ring-rotary-blue"
                            />
                            <div>
                                <span className="font-bold text-xs text-gray-900 block">📩 Enviar para Aprobación</span>
                                <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">
                                    El artículo llegará al panel del club como sugerencia pendiente; el club decidirá cuándo publicarlo.
                                </span>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Resumen de Garantías Editoriales */}
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span><strong>Garantía Editorial:</strong> Los activos multimedia se comparten desde la biblioteca sin duplicar archivos. Se inyecta canonical URL para blindar el SEO de los clubes.</span>
                    </div>
                    <span className="font-bold text-rotary-blue shrink-0">
                        {formData.targetClubIds.length} club(es) vinculado(s)
                    </span>
                </div>
            </div>
        </div>
    );
};

export default DistributionTab;
