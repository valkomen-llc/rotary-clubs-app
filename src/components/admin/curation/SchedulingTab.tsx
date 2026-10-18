import React, { useState } from 'react';
import {
    Clock, ShieldCheck, Sliders, Check, Save,
    RotateCcw, Sparkles, Layers, ShieldAlert,
    CheckCircle2, Info
} from 'lucide-react';
import { toast } from 'sonner';

interface SchedulingTabProps {
    config: any;
    onSaveConfig: (updated: any) => Promise<void>;
}

export const SchedulingTab: React.FC<SchedulingTabProps> = ({ config, onSaveConfig }) => {
    const [mode, setMode] = useState<string>(config?.mode || 'recommendation');
    const [intervalDays, setIntervalDays] = useState<number>(config?.intervalDays || 15);
    const [targetContainers, setTargetContainers] = useState<string[]>(
        config?.targetContainers || ['hero', 'foundation', 'join']
    );
    const [weights, setWeights] = useState({
        institutional: config?.weights?.institutional ?? 0.30,
        technical: config?.weights?.technical ?? 0.20,
        composition: config?.weights?.composition ?? 0.20,
        containerFit: config?.weights?.containerFit ?? 0.20,
        narrative: config?.weights?.narrative ?? 0.10,
    });
    const [exclusivityRules, setExclusivityRules] = useState({
        avoidHeroNewsDuplicates: config?.exclusivityRules?.avoidHeroNewsDuplicates ?? true,
        detectResizedOrCropped: config?.exclusivityRules?.detectResizedOrCropped ?? true,
        avoidHeroSlideDuplicates: config?.exclusivityRules?.avoidHeroSlideDuplicates ?? true,
        prioritizeClubDiversity: config?.exclusivityRules?.prioritizeClubDiversity ?? true,
        checkNewsCoversOnCuration: config?.exclusivityRules?.checkNewsCoversOnCuration ?? true,
    });
    const [saving, setSaving] = useState(false);

    const toggleContainer = (key: string) => {
        if (targetContainers.includes(key)) {
            setTargetContainers(targetContainers.filter((k) => k !== key));
        } else {
            setTargetContainers([...targetContainers, key]);
        }
    };

    const toggleRule = (key: keyof typeof exclusivityRules) => {
        setExclusivityRules((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSaveConfig({
                mode,
                intervalDays,
                targetContainers,
                weights,
                exclusivityRules,
                enabled: true,
            });
            toast.success('✅ Configuración de programación y reglas guardada');
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar configuración');
        } finally {
            setSaving(false);
        }
    };

    const resetWeights = () => {
        setWeights({
            institutional: 0.30,
            technical: 0.20,
            composition: 0.20,
            containerFit: 0.20,
            narrative: 0.10,
        });
        toast.info('Ponderaciones reestablecidas a los valores recomendados.');
    };

    return (
        <div className="w-full space-y-6">
            {/* Top Row: Modalidad de Operación & Frecuencia (2 balanced columns on desktop) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                {/* Modalidad de Operación */}
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex flex-col justify-between space-y-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-rotary-blue" />
                            <h3 className="text-base font-bold text-gray-900">Modalidad de Operación</h3>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Define si la inteligencia artificial prepara propuestas para revisión humana o si publica de forma autónoma.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {/* Modalidad 1 */}
                        <div
                            onClick={() => setMode('recommendation')}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${mode === 'recommendation' ? 'border-sky-500 bg-sky-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-gray-900">Modalidad 1 — Editorial</span>
                                    {mode === 'recommendation' && <Check className="w-4 h-4 text-sky-600 font-bold" />}
                                </div>
                                <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">
                                    Recomendada
                                </span>
                                <p className="mt-2 text-[11px] text-gray-600 leading-relaxed">
                                    Genera una bandeja de recomendaciones. El administrador revisa y aprueba visualmente antes de publicar.
                                </p>
                            </div>
                        </div>

                        {/* Modalidad 2 */}
                        <div
                            onClick={() => setMode('auto_publish')}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${mode === 'auto_publish' ? 'border-sky-500 bg-sky-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-gray-900">Modalidad 2 — Autónoma</span>
                                    {mode === 'auto_publish' && <Check className="w-4 h-4 text-sky-600 font-bold" />}
                                </div>
                                <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                                    Con Reversión
                                </span>
                                <p className="mt-2 text-[11px] text-gray-600 leading-relaxed">
                                    Publica automáticamente fotos sin conflictos que superen 90 puntos en slots no bloqueados. Mantiene historial completo.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Frecuencia del Ciclo de Análisis */}
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex flex-col justify-between space-y-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-rotary-blue" />
                            <h3 className="text-base font-bold text-gray-900">Frecuencia del Ciclo de Análisis</h3>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            ¿Con qué periodicidad debe Club Platform descubrir nuevas imágenes y actualizar la selección visual?
                        </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2">
                        {[
                            { label: 'Cada 7 días', value: 7 },
                            { label: 'Cada 15 días', value: 15 },
                            { label: 'Cada 30 días', value: 30 },
                            { label: 'Cada 90 días', value: 90 },
                            { label: 'Solo Manual', value: 0 },
                        ].map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setIntervalDays(opt.value)}
                                className={`py-3 px-2 rounded-xl border text-xs font-bold transition-all text-center ${intervalDays === opt.value ? 'bg-sky-50 border-sky-400 text-sky-800 shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                        <Info className="w-4 h-4 text-sky-600 flex-shrink-0" />
                        <span>También puedes ejecutar el análisis bajo demanda en cualquier momento desde el botón superior.</span>
                    </div>
                </div>
            </div>

            {/* Middle Section: Reglas de Exclusividad y Diversidad Visual (Full Width) */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-700">
                            <Layers className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">Reglas de Exclusividad y Diversidad Visual</h3>
                            <p className="text-xs text-gray-500">
                                Previene la duplicación de fotografías entre el Hero y las noticias, y calibra la representatividad distrital.
                            </p>
                        </div>
                    </div>
                    <span className="self-start md:self-auto px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Motor Antiduplicados Activo
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-1">
                    {/* Regla 1: Hero vs Noticias */}
                    <div
                        onClick={() => toggleRule('avoidHeroNewsDuplicates')}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${exclusivityRules.avoidHeroNewsDuplicates ? 'bg-sky-50/50 border-sky-300' : 'bg-gray-50/50 border-gray-200 opacity-60'}`}
                    >
                        <div className="space-y-1">
                            <h4 className="font-bold text-xs text-gray-900 leading-tight">
                                Evitar fotografías duplicadas entre Hero y Noticias
                            </h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                Las fotografías que son portada de un artículo de Noticias publicado se excluyen automáticamente de las recomendaciones del Hero.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={exclusivityRules.avoidHeroNewsDuplicates}
                            onChange={() => {}}
                            className="w-4 h-4 mt-0.5 rounded text-rotary-blue accent-rotary-blue cursor-pointer"
                        />
                    </div>

                    {/* Regla 2: Recortadas o Redimensionadas */}
                    <div
                        onClick={() => toggleRule('detectResizedOrCropped')}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${exclusivityRules.detectResizedOrCropped ? 'bg-sky-50/50 border-sky-300' : 'bg-gray-50/50 border-gray-200 opacity-60'}`}
                    >
                        <div className="space-y-1">
                            <h4 className="font-bold text-xs text-gray-900 leading-tight">
                                Detectar imágenes recortadas o redimensionadas
                            </h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                Emplea comparación de hash perceptual (dHash) para identificar variaciones de encuadre, compresión o escala de la misma toma fotográfica.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={exclusivityRules.detectResizedOrCropped}
                            onChange={() => {}}
                            className="w-4 h-4 mt-0.5 rounded text-rotary-blue accent-rotary-blue cursor-pointer"
                        />
                    </div>

                    {/* Regla 3: Duplicadas en el mismo Hero */}
                    <div
                        onClick={() => toggleRule('avoidHeroSlideDuplicates')}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${exclusivityRules.avoidHeroSlideDuplicates ? 'bg-sky-50/50 border-sky-300' : 'bg-gray-50/50 border-gray-200 opacity-60'}`}
                    >
                        <div className="space-y-1">
                            <h4 className="font-bold text-xs text-gray-900 leading-tight">
                                Evitar fotos repetidas entre diapositivas del Hero
                            </h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                Garantiza que cada diapositiva del slider presente una actividad diferente, sin reutilizar tomas de la misma solicitud.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={exclusivityRules.avoidHeroSlideDuplicates}
                            onChange={() => {}}
                            className="w-4 h-4 mt-0.5 rounded text-rotary-blue accent-rotary-blue cursor-pointer"
                        />
                    </div>

                    {/* Regla 4: Diversidad de Clubes */}
                    <div
                        onClick={() => toggleRule('prioritizeClubDiversity')}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${exclusivityRules.prioritizeClubDiversity ? 'bg-sky-50/50 border-sky-300' : 'bg-gray-50/50 border-gray-200 opacity-60'}`}
                    >
                        <div className="space-y-1">
                            <h4 className="font-bold text-xs text-gray-900 leading-tight">
                                Priorizar diversidad de clubes y actividades
                            </h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                Distribuye equitativamente la visibilidad entre clubes del distrito en lugar de concentrarla en un solo club, preservando la calidad.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={exclusivityRules.prioritizeClubDiversity}
                            onChange={() => {}}
                            className="w-4 h-4 mt-0.5 rounded text-rotary-blue accent-rotary-blue cursor-pointer"
                        />
                    </div>

                    {/* Regla 5: Consultar Portadas de Noticias */}
                    <div
                        onClick={() => toggleRule('checkNewsCoversOnCuration')}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${exclusivityRules.checkNewsCoversOnCuration ? 'bg-sky-50/50 border-sky-300' : 'bg-gray-50/50 border-gray-200 opacity-60'}`}
                    >
                        <div className="space-y-1">
                            <h4 className="font-bold text-xs text-gray-900 leading-tight">
                                Consultar portadas de noticias en cada ciclo
                            </h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                Sincroniza en tiempo real las portadas de artículos publicados (incluyendo cargas manuales) antes de emitir recomendaciones.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={exclusivityRules.checkNewsCoversOnCuration}
                            onChange={() => {}}
                            className="w-4 h-4 mt-0.5 rounded text-rotary-blue accent-rotary-blue cursor-pointer"
                        />
                    </div>

                    {/* Protocolo Distrito 4281 */}
                    <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1 text-[11px] text-amber-900">
                            <strong className="font-bold block">Protocolo Distrito 4281:</strong>
                            <p className="leading-relaxed">
                                La exclusividad Hero/Noticias es obligatoria para publicaciones automáticas. Cualquier excepción manual requiere justificación editorial registrada en el historial.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row: Contenedores Participantes & Ponderaciones IA (2 balanced columns on desktop) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                {/* Contenedores Participantes */}
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex flex-col justify-between space-y-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Sliders className="w-5 h-5 text-rotary-blue" />
                            <h3 className="text-base font-bold text-gray-900">Contenedores Participantes</h3>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Selecciona los espacios visuales donde la IA propondrá o actualizará fotografías:
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {[
                            { key: 'hero', label: 'Hero — Slider Principal (5 slides)', desc: '1600 × 700 px' },
                            { key: 'foundation', label: 'Fundación Rotaria', desc: '1600 × 700 px' },
                            { key: 'join', label: 'Sección Únete', desc: '800 × 600 px' },
                            { key: 'causes', label: 'Áreas de Interés (7 causas)', desc: 'Grid 1:1' },
                            { key: 'homeBanner', label: 'Banda del Inicio', desc: '3:2 sin recorte' },
                            { key: 'spotlight', label: 'Bloque Destacado del Inicio', desc: '1600 × 700 px panorámica' },
                        ].map((c) => {
                            const active = targetContainers.includes(c.key);
                            return (
                                <div
                                    key={c.key}
                                    onClick={() => toggleContainer(c.key)}
                                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${active ? 'bg-sky-50/60 border-sky-300' : 'border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border ${active ? 'bg-rotary-blue border-rotary-blue text-white' : 'border-gray-300'}`}>
                                        {active && <Check className="w-3 h-3" />}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-xs text-gray-900 leading-tight">{c.label}</h4>
                                        <p className="text-[10px] text-gray-400 mt-0.5">{c.desc}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Ponderaciones de Puntuación Configurables */}
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-rotary-blue" />
                            <h3 className="text-base font-bold text-gray-900">Ponderaciones de Evaluación IA</h3>
                        </div>
                        <button
                            onClick={resetWeights}
                            className="text-xs text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1"
                        >
                            <RotateCcw className="w-3 h-3" /> Restaurar por omisión
                        </button>
                    </div>
                    <p className="text-xs text-gray-500">
                        Ajusta la importancia relativa de cada dimensión para calcular el puntaje de 0 a 100 de cada fotografía:
                    </p>

                    <div className="space-y-3 pt-2 text-xs">
                        {[
                            { key: 'institutional', label: 'Relevancia Institucional (Causas, TRF, Servicio)', val: weights.institutional },
                            { key: 'technical', label: 'Calidad Técnica (Nitidez, Iluminación, Resolución)', val: weights.technical },
                            { key: 'composition', label: 'Composición Visual (Encuadre, Punto Focal, Títulos)', val: weights.composition },
                            { key: 'containerFit', label: 'Compatibilidad con Contenedor (Proporción y Recorte)', val: weights.containerFit },
                            { key: 'narrative', label: 'Impacto Narrativo (Acción, Emociones, Beneficiarios)', val: weights.narrative },
                        ].map((w) => (
                            <div key={w.key} className="space-y-1">
                                <div className="flex justify-between font-semibold text-gray-700 text-xs">
                                    <span>{w.label}</span>
                                    <span className="font-mono text-sky-700 font-bold">{Math.round(w.val * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.05"
                                    max="0.60"
                                    step="0.05"
                                    value={w.val}
                                    onChange={(e) => setWeights({ ...weights, [w.key]: parseFloat(e.target.value) })}
                                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-rotary-blue"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold text-sm shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Guardando...' : 'Guardar Programación y Reglas'}
                </button>
            </div>
        </div>
    );
};
