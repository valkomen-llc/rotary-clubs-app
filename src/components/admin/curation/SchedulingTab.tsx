import React, { useState } from 'react';
import {
    Calendar, Clock, ShieldCheck, Zap, Sliders, Check, Save,
    AlertCircle, RotateCcw
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
    const [saving, setSaving] = useState(false);

    const toggleContainer = (key: string) => {
        if (targetContainers.includes(key)) {
            setTargetContainers(targetContainers.filter((k) => k !== key));
        } else {
            setTargetContainers([...targetContainers, key]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSaveConfig({
                mode,
                intervalDays,
                targetContainers,
                weights,
                enabled: true,
            });
            toast.success('✅ Configuración de programación guardada');
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
        <div className="space-y-6 max-w-4xl">
            {/* Modalidad de Operación */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-rotary-blue" />
                    <h3 className="text-base font-bold text-gray-900">Modalidad de Operación</h3>
                </div>
                <p className="text-xs text-gray-500">
                    Define si la inteligencia artificial prepara propuestas para revisión humana o si publica de forma autónoma.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {/* Modalidad 1 */}
                    <div
                        onClick={() => setMode('recommendation')}
                        className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${mode === 'recommendation' ? 'border-sky-500 bg-sky-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-gray-900">Modalidad 1 — Recomendación Editorial</span>
                            {mode === 'recommendation' && <Check className="w-4 h-4 text-sky-600 font-bold" />}
                        </div>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">
                            Predeterminada (Recomendada)
                        </span>
                        <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                            El sistema analiza periódicamente las fotografías de Rotary en Acción y prepara una bandeja de recomendaciones. El administrador revisa y aprueba visualmente antes de publicar.
                        </p>
                    </div>

                    {/* Modalidad 2 */}
                    <div
                        onClick={() => setMode('auto_publish')}
                        className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${mode === 'auto_publish' ? 'border-sky-500 bg-sky-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-gray-900">Modalidad 2 — Publicación Autorizada</span>
                            {mode === 'auto_publish' && <Check className="w-4 h-4 text-sky-600 font-bold" />}
                        </div>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                            Autónoma con Reversión
                        </span>
                        <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                            Publica automáticamente fotografías autorizadas que superen 90 puntos para contenedores no bloqueados. Mantiene historial completo y permite deshacer cambios al instante.
                        </p>
                    </div>
                </div>
            </div>

            {/* Frecuencia de Rotación */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-rotary-blue" />
                    <h3 className="text-base font-bold text-gray-900">Frecuencia del Ciclo de Análisis</h3>
                </div>
                <p className="text-xs text-gray-500">
                    ¿Con qué periodicidad debe Club Platform descubrir nuevas imágenes y actualizar la selección visual?
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
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
                            className={`py-3 px-3 rounded-xl border text-xs font-bold transition-all ${intervalDays === opt.value ? 'bg-sky-50 border-sky-400 text-sky-800 shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Contenedores Participantes */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-rotary-blue" />
                    <h3 className="text-base font-bold text-gray-900">Contenedores que Participan en la Curaduría</h3>
                </div>
                <p className="text-xs text-gray-500">
                    Selecciona los espacios visuales donde la IA propondrá o actualizará fotografías:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
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
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sliders className="w-5 h-5 text-rotary-blue" />
                        <h3 className="text-base font-bold text-gray-900">Ponderaciones de Evaluación IA</h3>
                    </div>
                    <button
                        onClick={resetWeights}
                        className="text-xs text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1"
                    >
                        <RotateCcw className="w-3 h-3" /> Restaurar valores por defecto
                    </button>
                </div>
                <p className="text-xs text-gray-500">
                    Ajusta la importancia relativa de cada dimensión para calcular el puntaje de 0 a 100 de cada fotografía:
                </p>

                <div className="space-y-4 pt-2 text-xs">
                    {[
                        { key: 'institutional', label: 'Relevancia Institucional (Causas, TRF, Servicio)', val: weights.institutional },
                        { key: 'technical', label: 'Calidad Técnica (Nitidez, Iluminación, Resolución)', val: weights.technical },
                        { key: 'composition', label: 'Composición Visual (Encuadre, Punto Focal, Títulos)', val: weights.composition },
                        { key: 'containerFit', label: 'Compatibilidad con Contenedor (Proporción y Recorte)', val: weights.containerFit },
                        { key: 'narrative', label: 'Impacto Narrativo (Acción, Emociones, Beneficiarios)', val: weights.narrative },
                    ].map((w) => (
                        <div key={w.key} className="space-y-1">
                            <div className="flex justify-between font-semibold text-gray-700">
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

            {/* Save Button */}
            <div className="flex justify-end pt-2">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-8 py-3 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold text-sm shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Guardando...' : 'Guardar Programación'}
                </button>
            </div>
        </div>
    );
};
