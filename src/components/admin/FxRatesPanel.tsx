// LAS TASAS DE CAMBIO, desde el panel.
//
// v4.870 — Existen por una sola razón: PayPal no procesa pesos colombianos, así
// que sin una tasa configurada el botón no aparece nunca en el sitio de un
// distrito colombiano — que es donde vive la mayoría de los aportes.
//
// ⚠️ LA REGLA DE SIEMPRE NO CAMBIA: «no se inventa una tasa». Si acá no hay
// ninguna escrita, no se convierte y el método no se ofrece. Lo que cambia es
// que ahora se puede escribir una, y que la conversión se le DICE al visitante
// antes de cobrarle.

import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeftRight, Save, Plus, Trash2, AlertTriangle } from 'lucide-react';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';

interface Tasa {
    pair: string;
    perUnit: number;
    source: string | null;
    updatedAt: string | null;
    ageDays: number | null;
}

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` } });

const mensajeDeFallo = (e: any): string => {
    const status = e?.response?.status;
    if (status === 401) return 'Tu sesión venció. Volvé a entrar y probá de nuevo.';
    if (status === 403) return 'Sólo el operador de la plataforma puede cambiar esto.';
    if (!e?.response) return 'No se pudo contactar al servidor. Revisá la conexión.';
    const errs = e?.response?.data?.errors;
    return Array.isArray(errs) && errs.length ? errs.join(' · ') : (e?.response?.data?.error || 'No se pudo guardar.');
};

const partes = (pair: string) => {
    const [from = '', to = ''] = String(pair).split('_');
    return { from, to };
};

export default function FxRatesPanel() {
    const [tasas, setTasas] = useState<Tasa[] | null>(null);
    const [staleDays, setStaleDays] = useState(45);
    const [avisos, setAvisos] = useState<string[]>([]);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);
    const [nuevo, setNuevo] = useState({ from: 'COP', to: 'USD', perUnit: '', source: '' });

    const cargar = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/payouts/admin/fx-rates`, auth());
            setTasas(data.rates || []);
            setStaleDays(data.staleDays ?? 45);
        } catch (e: any) {
            setError(mensajeDeFallo(e));
            setTasas([]);
        }
    };
    useEffect(() => { cargar(); }, []);

    const guardar = async (lista: Tasa[]) => {
        setGuardando(true); setError(null); setOk(null); setAvisos([]);
        try {
            const cuerpo = Object.fromEntries(lista.map(t => [t.pair, {
                perUnit: t.perUnit,
                source: t.source || '',
                // Al tocar una tasa se sella HOY: la fecha es lo que permite
                // avisar de que está vieja, y una fecha vieja sobre un número
                // recién cambiado sería falsa.
                updatedAt: new Date().toISOString(),
            }]));
            const { data } = await axios.put(`${API_URL}/payouts/admin/fx-rates`, { rates: cuerpo }, auth());
            setTasas(data.rates || []);
            setAvisos(data.warnings || []);
            setOk(data.aviso);
        } catch (e: any) {
            setError(mensajeDeFallo(e));
        } finally {
            setGuardando(false);
        }
    };

    const agregar = () => {
        const perUnit = Number(String(nuevo.perUnit).replace(',', '.'));
        if (!Number.isFinite(perUnit) || perUnit <= 0) {
            setError('La tasa tiene que ser un número mayor que cero.');
            return;
        }
        const pair = `${nuevo.from.toUpperCase()}_${nuevo.to.toUpperCase()}`;
        const resto = (tasas || []).filter(t => t.pair !== pair);
        guardar([...resto, { pair, perUnit, source: nuevo.source || null, updatedAt: null, ageDays: 0 }]);
        setNuevo({ ...nuevo, perUnit: '', source: '' });
    };

    if (!tasas) return null;

    return (
        <div className="border border-gray-100 rounded-2xl p-4 mt-4">
            <div className="flex items-center gap-2 mb-1">
                <ArrowLeftRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
                <h3 className="font-bold text-gray-900 text-sm">Tasas de cambio</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">
                Sólo se usan cuando la cuenta de un proveedor <b>no</b> cobra en la moneda del aporte.
                Sin una tasa escrita acá no se convierte nada y ese método no se ofrece — nunca se inventa una.
                Al visitante se le muestra el importe convertido <b>antes</b> de cobrarle.
            </p>

            {tasas.length === 0 && (
                <p className="text-xs text-gray-400 mb-3">
                    No hay ninguna tasa configurada todavía.
                </p>
            )}

            {tasas.map((t, i) => {
                const { from, to } = partes(t.pair);
                const vieja = t.ageDays !== null && t.ageDays > staleDays;
                return (
                    <div key={t.pair} className="flex items-center gap-2 flex-wrap py-2 border-t border-gray-50">
                        <span className="text-sm font-bold text-gray-700 w-24 shrink-0" data-no-translate>
                            {from} → {to}
                        </span>
                        <input
                            type="number"
                            step="any"
                            value={t.perUnit}
                            onChange={e => setTasas(tasas.map((x, j) => j === i ? { ...x, perUnit: Number(e.target.value) } : x))}
                            className="w-32 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                            aria-label={`Cuántos ${from} vale un ${to}`}
                        />
                        <span className="text-xs text-gray-500" data-no-translate>{from} por {to}</span>
                        <input
                            type="text"
                            value={t.source || ''}
                            placeholder="Fuente (ej. TRM del Banco de la República)"
                            onChange={e => setTasas(tasas.map((x, j) => j === i ? { ...x, source: e.target.value } : x))}
                            className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-2 py-1 text-sm"
                            aria-label={`Fuente de la tasa ${from} a ${to}`}
                        />
                        {vieja && (
                            <span className="text-[11px] text-amber-700" data-no-translate>
                                {t.ageDays} días
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => guardar(tasas.filter((_, j) => j !== i))}
                            className="text-gray-400 hover:text-red-600 p-1"
                            aria-label={`Quitar la tasa ${from} a ${to}`}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}

            {tasas.length > 0 && (
                <button
                    type="button"
                    onClick={() => guardar(tasas)}
                    disabled={guardando}
                    className="mt-3 inline-flex items-center gap-2 bg-rotary-blue hover:bg-rotary-navy text-white font-bold rounded-lg px-4 py-2 text-xs disabled:opacity-50 transition-colors"
                >
                    <Save className="w-3.5 h-3.5" />
                    {guardando ? 'Guardando…' : 'Guardar las tasas'}
                </button>
            )}

            <div className="flex items-end gap-2 flex-wrap mt-4 pt-3 border-t border-gray-100">
                <label className="text-xs text-gray-500">
                    Origen
                    <input
                        value={nuevo.from}
                        onChange={e => setNuevo({ ...nuevo, from: e.target.value.toUpperCase().slice(0, 3) })}
                        className="block w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm font-mono"
                    />
                </label>
                <label className="text-xs text-gray-500">
                    Destino
                    <input
                        value={nuevo.to}
                        onChange={e => setNuevo({ ...nuevo, to: e.target.value.toUpperCase().slice(0, 3) })}
                        className="block w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm font-mono"
                    />
                </label>
                <label className="text-xs text-gray-500">
                    Cuántos {nuevo.from || '???'} vale un {nuevo.to || '???'}
                    <input
                        type="number"
                        step="any"
                        value={nuevo.perUnit}
                        onChange={e => setNuevo({ ...nuevo, perUnit: e.target.value })}
                        placeholder="4032"
                        className="block w-32 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                    />
                </label>
                <label className="text-xs text-gray-500 flex-1 min-w-[200px]">
                    Fuente
                    <input
                        value={nuevo.source}
                        onChange={e => setNuevo({ ...nuevo, source: e.target.value })}
                        placeholder="TRM del Banco de la República"
                        className="block w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                    />
                </label>
                <button
                    type="button"
                    onClick={agregar}
                    disabled={guardando}
                    className="inline-flex items-center gap-1 border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
                >
                    <Plus className="w-3.5 h-3.5" /> Agregar
                </button>
            </div>

            {avisos.map((a, i) => (
                <p key={i} className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />{a}
                </p>
            ))}
            {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">{error}</p>}
            {ok && <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mt-3">{ok}</p>}
        </div>
    );
}
