import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useClub } from '../../contexts/ClubContext';
import { toast } from 'sonner';
import {
    Save, Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, HandCoins, ExternalLink, RefreshCw,
    Sparkles, X, Loader2,
} from 'lucide-react';
import {
    PaymentBlock, PaymentBlockKind, KIND_LABELS,
    BLOCK_ICONS, BLOCK_ICON_KEYS, getBlockIcon,
    BLOCK_THEMES, BLOCK_THEME_KEYS, getBlockTheme,
    DEFAULT_PAYMENT_BLOCKS, resolvePaymentBlocks, normalizeBlock,
    RECURRING_INTERVAL_ORDER, RECURRING_INTERVAL_LABELS,
} from '../../lib/paymentBlocks';

const API = import.meta.env.VITE_API_URL || '/api';

const newBlock = (): PaymentBlock => normalizeBlock({
    id: `block-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true, kind: 'donation', title: 'Nuevo bloque', description: '',
    icon: 'heart', theme: 'blue', presetAmounts: [25, 50, 100], allowCustom: true,
    showMessage: true, showAnonymous: false, buttonText: 'Aportar', benefits: [],
});

const PaymentBlocksManager: React.FC = () => {
    const { club, refreshClub } = useClub();
    const [blocks, setBlocks] = useState<PaymentBlock[]>([]);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);
    const [aiInstruction, setAiInstruction] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    useEffect(() => {
        if (club) setBlocks(resolvePaymentBlocks((club as any).paymentBlocks));
    }, [club]);

    const update = (idx: number, patch: Partial<PaymentBlock>) => {
        setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, ...patch } : b));
        setDirty(true);
    };
    const move = (idx: number, dir: -1 | 1) => {
        setBlocks(prev => {
            const arr = [...prev];
            const j = idx + dir;
            if (j < 0 || j >= arr.length) return prev;
            [arr[idx], arr[j]] = [arr[j], arr[idx]];
            return arr;
        });
        setDirty(true);
    };
    const remove = (idx: number) => { setBlocks(prev => prev.filter((_, i) => i !== idx)); setDirty(true); };
    const add = () => { setBlocks(prev => [...prev, newBlock()]); setDirty(true); };
    const resetDefaults = () => { setBlocks(DEFAULT_PAYMENT_BLOCKS.map((b, i) => normalizeBlock(b, i))); setDirty(true); };

    const generateWithAI = async () => {
        if (!aiInstruction.trim() || !(club as any)?.id) return;
        setAiLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/content-studio/generate-payment-block`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ clubId: (club as any).id, instruction: aiInstruction.trim() }),
            });
            const data = await res.json();
            if (!res.ok || !data.block) throw new Error(data.error || 'No se pudo generar el bloque');
            setBlocks(prev => [...prev, normalizeBlock(data.block, prev.length)]);
            setDirty(true);
            setAiOpen(false);
            setAiInstruction('');
            toast.success('Bloque generado con IA. Revísalo y guarda.');
        } catch (e: any) {
            toast.error(e.message || 'Error generando el bloque');
        } finally {
            setAiLoading(false);
        }
    };

    const save = async () => {
        if (!(club as any)?.id) return;
        setSaving(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/admin/clubs/${(club as any).id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ paymentBlocks: blocks.map((b, i) => normalizeBlock(b, i)) }),
            });
            if (!res.ok) throw new Error('Error al guardar');
            await refreshClub?.();
            setDirty(false);
            toast.success('Bloques de pago guardados');
        } catch (e: any) {
            toast.error(e.message || 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminLayout>
            <div className="max-w-4xl space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                            <HandCoins className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Bloques de Pago</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                Configura las tarjetas de <b>Donaciones</b>, <b>Aportes</b> y <b>Membresías</b> de la página de Aportes.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <a href="#/aportes" target="_blank" rel="noreferrer"
                            className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-rotary-blue hover:bg-gray-50 transition">
                            <ExternalLink className="w-4 h-4" /> Ver página
                        </a>
                        <button onClick={save} disabled={saving || !dirty}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 ${dirty ? 'bg-rotary-blue text-white hover:bg-sky-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'}`}>
                            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>

                {dirty && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2 font-medium">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        Tienes cambios sin guardar.
                    </div>
                )}

                {/* Blocks */}
                <div className="space-y-5">
                    {blocks.map((block, idx) => {
                        const theme = getBlockTheme(block.theme);
                        const Icon = getBlockIcon(block.icon);
                        return (
                            <div key={block.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${block.enabled ? 'border-gray-100' : 'border-gray-100 opacity-70'}`}>
                                {/* Block header */}
                                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50 bg-gray-50/40">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${theme.bubble}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-800 truncate">{block.title || 'Sin título'}</p>
                                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{KIND_LABELS[block.kind]}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => move(idx, -1)} disabled={idx === 0} title="Subir" className="p-1.5 text-gray-400 hover:text-rotary-blue disabled:opacity-30 rounded-lg"><ChevronUp className="w-4 h-4" /></button>
                                        <button onClick={() => move(idx, 1)} disabled={idx === blocks.length - 1} title="Bajar" className="p-1.5 text-gray-400 hover:text-rotary-blue disabled:opacity-30 rounded-lg"><ChevronDown className="w-4 h-4" /></button>
                                        <button onClick={() => update(idx, { enabled: !block.enabled })} title={block.enabled ? 'Ocultar' : 'Mostrar'} className="p-1.5 text-gray-400 hover:text-rotary-blue rounded-lg">
                                            {block.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        </button>
                                        <button onClick={() => remove(idx)} title="Eliminar" className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>

                                {/* Block editor */}
                                <div className="p-5 space-y-4">
                                    {/* Tipo */}
                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Tipo de bloque</label>
                                        <div className="flex flex-wrap gap-2 mt-1.5">
                                            {(['donation', 'aporte', 'membership'] as PaymentBlockKind[]).map(k => (
                                                <button key={k} onClick={() => update(idx, { kind: k })}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${block.kind === k ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                                                    {KIND_LABELS[k]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Título</label>
                                            <input value={block.title} onChange={e => update(idx, { title: e.target.value })}
                                                className="mt-1.5 w-full px-4 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none font-bold text-gray-800" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Texto del botón</label>
                                            <input value={block.buttonText} onChange={e => update(idx, { buttonText: e.target.value })}
                                                className="mt-1.5 w-full px-4 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none font-medium text-gray-800" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Descripción</label>
                                        <textarea value={block.description} onChange={e => update(idx, { description: e.target.value })} rows={2}
                                            className="mt-1.5 w-full px-4 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none text-sm resize-none" />
                                    </div>

                                    {/* Ícono */}
                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Ícono</label>
                                        <div className="flex flex-wrap gap-2 mt-1.5">
                                            {BLOCK_ICON_KEYS.map(key => {
                                                const IcoO = BLOCK_ICONS[key];
                                                return (
                                                    <button key={key} onClick={() => update(idx, { icon: key })} title={key}
                                                        className={`w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-all ${block.icon === key ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                                                        <IcoO className="w-4 h-4" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Color */}
                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Color</label>
                                        <div className="flex flex-wrap gap-2 mt-1.5">
                                            {BLOCK_THEME_KEYS.map(key => (
                                                <button key={key} onClick={() => update(idx, { theme: key })} title={BLOCK_THEMES[key].label}
                                                    className={`w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-all ${block.theme === key ? 'border-gray-800' : 'border-transparent hover:border-gray-200'}`}>
                                                    <span className={`w-5 h-5 rounded-full ${BLOCK_THEMES[key].bubble}`} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Montos */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Montos sugeridos (separados por coma)</label>
                                            <input value={block.presetAmounts.join(', ')}
                                                onChange={e => update(idx, { presetAmounts: e.target.value.split(',').map(s => Number(s.trim())).filter(n => n > 0) })}
                                                placeholder="25, 50, 100"
                                                className="mt-1.5 w-full px-4 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none font-medium text-gray-800" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Monto por defecto (opcional)</label>
                                            <input type="number" min="1" value={block.defaultAmount ?? ''}
                                                onChange={e => update(idx, { defaultAmount: e.target.value ? Number(e.target.value) : undefined })}
                                                placeholder="—"
                                                className="mt-1.5 w-full px-4 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none font-medium text-gray-800" />
                                        </div>
                                    </div>

                                    {/* Beneficios */}
                                    <div>
                                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Beneficios (uno por línea, opcional)</label>
                                        <textarea value={block.benefits.join('\n')} onChange={e => update(idx, { benefits: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} rows={2}
                                            placeholder={'Acceso a eventos exclusivos\nCarnet de socio'}
                                            className="mt-1.5 w-full px-4 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none text-sm resize-none" />
                                    </div>

                                    {/* Toggles */}
                                    <div className="flex flex-wrap gap-4 pt-1">
                                        {([
                                            ['allowCustom', 'Permitir monto libre'],
                                            ['showMessage', 'Campo de mensaje'],
                                            ['showAnonymous', 'Opción anónimo'],
                                        ] as [keyof PaymentBlock, string][]).map(([field, label]) => (
                                            <label key={field} className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={!!block[field]} onChange={e => update(idx, { [field]: e.target.checked } as any)}
                                                    className="w-4 h-4 accent-rotary-blue rounded" />
                                                <span className="text-xs font-bold text-gray-500">{label}</span>
                                            </label>
                                        ))}
                                    </div>

                                    {/* Cobro recurrente (solo membresías) */}
                                    {block.kind === 'membership' && (
                                        <div className="pt-3 border-t border-gray-50">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={block.recurring} onChange={e => update(idx, { recurring: e.target.checked })}
                                                    className="w-4 h-4 accent-emerald-500 rounded" />
                                                <span className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                                                    <RefreshCw className="w-3.5 h-3.5" /> Cobro recurrente (suscripción)
                                                </span>
                                            </label>
                                            {block.recurring && (
                                                <div className="mt-3 space-y-2 pl-1">
                                                    <p className="text-[11px] text-gray-400">Activa las periodicidades a ofrecer y su precio. El socio elige una al suscribirse.</p>
                                                    {RECURRING_INTERVAL_ORDER.map(key => {
                                                        const iv = block.recurringIntervals.find(r => r.key === key);
                                                        const on = !!iv;
                                                        return (
                                                            <div key={key} className="flex items-center gap-3">
                                                                <label className="flex items-center gap-2 w-32 cursor-pointer">
                                                                    <input type="checkbox" checked={on} onChange={e => {
                                                                        const rest = block.recurringIntervals.filter(r => r.key !== key);
                                                                        update(idx, { recurringIntervals: e.target.checked ? [...rest, { key, amount: iv?.amount || block.defaultAmount || 50 }] : rest });
                                                                    }} className="w-4 h-4 accent-emerald-500 rounded" />
                                                                    <span className="text-sm font-bold text-gray-600">{RECURRING_INTERVAL_LABELS[key]}</span>
                                                                </label>
                                                                {on && (
                                                                    <div className="relative flex-1 max-w-[160px]">
                                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                                                        <input type="number" min="1" value={iv!.amount}
                                                                            onChange={e => {
                                                                                const amt = Number(e.target.value) || 0;
                                                                                update(idx, { recurringIntervals: block.recurringIntervals.map(r => r.key === key ? { ...r, amount: amt } : r) });
                                                                            }}
                                                                            className="w-full pl-7 pr-3 py-2 bg-gray-50 border-2 border-transparent rounded-lg focus:border-rotary-blue/30 focus:bg-white outline-none font-bold text-gray-800 text-sm" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer actions */}
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={add} className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-rotary-blue/5 text-rotary-blue hover:bg-rotary-blue/10 transition">
                        <Plus className="w-4 h-4" /> Agregar bloque
                    </button>
                    <button onClick={() => setAiOpen(true)} className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 transition shadow-sm">
                        <Sparkles className="w-4 h-4" /> Generar con IA
                    </button>
                    <button onClick={resetDefaults} className="text-xs font-bold text-gray-400 hover:text-gray-600 transition">
                        Restaurar bloques por defecto
                    </button>
                </div>
            </div>

            {/* Modal: Generar con IA */}
            {aiOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !aiLoading && setAiOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-indigo-500" /> Generar bloque con IA
                            </h2>
                            <button onClick={() => setAiOpen(false)} disabled={aiLoading} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <p className="text-sm text-gray-500">Describe el aporte que quieres crear. La IA usará el <b>Cerebro</b> del club para ajustar el tono y los datos.</p>
                            <textarea
                                value={aiInstruction}
                                onChange={e => setAiInstruction(e.target.value)}
                                rows={3}
                                placeholder="Ej: Crea una membresía anual de $150.000 con 3 beneficios para socios jóvenes"
                                className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-indigo-300 focus:bg-white outline-none text-sm resize-none"
                            />
                            <div className="flex flex-wrap gap-2">
                                {[
                                    'Donación para End Polio con opción de mensaje',
                                    'Aporte voluntario con certificado tributario',
                                    'Membresía mensual de $120.000 con 4 beneficios',
                                ].map(ex => (
                                    <button key={ex} onClick={() => setAiInstruction(ex)} className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition">
                                        {ex}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={generateWithAI}
                                disabled={aiLoading || !aiInstruction.trim()}
                                className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {aiLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</> : <><Sparkles className="w-4 h-4" /> Generar bloque</>}
                            </button>
                            <p className="text-[11px] text-gray-400 text-center">El bloque se agrega al final para que lo revises y ajustes antes de <b>Guardar</b>.</p>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default PaymentBlocksManager;
