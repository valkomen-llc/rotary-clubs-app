// EL RECARGO DE INSCRIPCIÓN, desde el panel.
//
// v4.980 — Vive junto a «Reglas de comisión» y no en una pantalla propia: son
// las dos mitades de la misma pregunta —cuánto cuesta cobrar— y la decisión se
// toma donde ya se está mirando el take rate. Mismo criterio que la tarjeta de
// tarifas dentro de la Bóveda Central.
//
// ⚠️ SON DOS CONFIGURACIONES DISTINTAS Y LA PANTALLA LO DICE. Arriba, lo que la
// plataforma DESCUENTA de un aporte antes de entregárselo a la organización.
// Acá, lo que se le SUMA a quien se inscribe a la Feria o al evento. Con un
// solo número, cambiar la retención de los aportes movería en silencio lo que
// paga un inscrito — y con la retención por defecto en 5 % habría cobrado
// ~7,9 % sin que nadie lo decidiera.
//
// Nace PLEGADO, como su vecina.

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Receipt, AlertTriangle, ChevronDown, Save, Info } from 'lucide-react';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';

interface Linea { key: string; label: string; percent: number; fixed: number; currency: string }
interface Cotizacion {
    enabled: boolean; currency: string; base: number;
    lines: { key: string; label: string; percent: number; fixed: number; amount: number }[];
    surcharge: number; total: number; percent: number;
}
interface Config {
    enabled: Record<string, boolean>;
    lines: Record<string, { percent: number; fixed: number }>;
    byCurrency: Record<string, any>;
}
interface Respuesta {
    config: Config;
    flujos: { key: string; label: string; enabled: boolean }[];
    resuelto: Record<string, { tasas: Linea[]; ejemplo: Cotizacion }>;
    warnings: string[];
}

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` } });

// El porcentaje se guarda en tanto por uno y se ESCRIBE en por ciento: nadie
// teclea «0.029» pensando en una comisión. La conversión vive acá, en un solo
// sitio, y no en cada casilla.
const aPorCiento = (v: number) => Math.round((Number(v) || 0) * 10000) / 100;
const aTantoPorUno = (v: string) => Number(v) / 100;

const dinero = (n: number, moneda: string) =>
    `${Number(n || 0).toLocaleString('es-CO', {
        maximumFractionDigits: String(moneda).toUpperCase() === 'COP' ? 0 : 2,
    })} ${String(moneda).toUpperCase()}`;

// Un fallo se dice como lo que es — la lección de v4.860, que este panel
// comparte con su vecina: se abre, se piensa y se guarda un rato después, así
// que el GET puede funcionar y el PUT ya no.
const mensajeDeFallo = (e: any): string => {
    const status = e?.response?.status;
    if (status === 401) return 'Tu sesión venció mientras esta pantalla estaba abierta. Volvé a entrar y guardá de nuevo: lo que escribiste sigue acá.';
    if (status === 403) return 'Este recargo sólo lo puede cambiar el operador de la plataforma.';
    if (!e?.response) return 'No se pudo contactar al servidor. Revisá la conexión y probá de nuevo.';
    return e?.response?.data?.error || 'No se pudo guardar.';
};

export default function SurchargePanel() {
    const [datos, setDatos] = useState<Respuesta | null>(null);
    const [borrador, setBorrador] = useState<Config | null>(null);
    const [abierto, setAbierto] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const cargar = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/payouts/admin/surcharge`, auth());
            setDatos(data);
            setBorrador(JSON.parse(JSON.stringify(data.config)));
        } catch (e: any) {
            setError(mensajeDeFallo(e));
        }
    };

    useEffect(() => { cargar(); }, []);

    const guardar = async () => {
        if (!borrador) return;
        setGuardando(true); setError(null); setAviso(null);
        try {
            const { data } = await axios.put(`${API_URL}/payouts/admin/surcharge`, { config: borrador }, auth());
            setAviso(data.aviso || null);
            await cargar();
        } catch (e: any) {
            const errs = e?.response?.data?.errors;
            setError(Array.isArray(errs) && errs.length ? errs.join(' · ') : mensajeDeFallo(e));
        } finally {
            setGuardando(false);
        }
    };

    if (!datos || !borrador) return null;

    const monedas = Object.keys(datos.resuelto);
    const activos = datos.flujos.filter(f => f.enabled);

    return (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setAbierto(v => !v)}
                className="w-full px-6 py-4 flex items-center gap-3 text-left hover:bg-gray-50/70 transition-colors"
                aria-expanded={abierto}
            >
                <Receipt className="w-5 h-5 text-rotary-blue shrink-0" />
                <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-900">Recargo de inscripción</h3>
                    {!abierto && (
                        <p className="text-xs text-gray-400 truncate">
                            {activos.length === 0
                                ? 'Apagado: las inscripciones se cobran sin comisión'
                                : `Se suma al valor en ${activos.map(f => f.label).join(' y ')}`}
                        </p>
                    )}
                </div>
                {/* Plegar no puede ESCONDER un problema: la regla de v4.826. */}
                {datos.warnings.length > 0 && !abierto && (
                    <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">
                        {datos.warnings.length} aviso{datos.warnings.length === 1 ? '' : 's'}
                    </span>
                )}
                <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
            </button>

            {abierto && (
                <div className="px-6 pb-6 space-y-5 border-t border-gray-100 pt-5">
                    {/* ⚠️ Lo primero, porque es la pregunta que se hace quien va
                        a mover esto: en qué se diferencia de la tarifa de arriba
                        y a quién le cuesta. */}
                    <div className="flex gap-2.5 text-[13px] text-gray-600 bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3">
                        <Info className="w-4 h-4 text-rotary-blue shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                            Esto lo paga <strong>quien se inscribe</strong>: el precio publicado no cambia y el
                            recargo se le suma al final, desglosado, cuando va a pagar. Es lo contrario de
                            «Reglas de comisión», que se le <strong>descuenta</strong> a la organización que
                            recibe un aporte. Cambiarlo no toca ninguna inscripción ya pagada.
                        </p>
                    </div>

                    {datos.warnings.map((w, i) => (
                        <div key={i} className="flex gap-2.5 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">{w}</p>
                        </div>
                    ))}

                    {/* Dónde se aplica. Por FLUJO y no un interruptor único: la
                        Feria y el evento son dos cobros distintos. */}
                    <div>
                        <p className="text-sm font-bold text-gray-800 mb-2">Dónde se aplica</p>
                        <div className="space-y-2">
                            {datos.flujos.map(f => (
                                <label key={f.key} className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={borrador.enabled?.[f.key] !== false}
                                        onChange={e => setBorrador({
                                            ...borrador,
                                            enabled: { ...borrador.enabled, [f.key]: e.target.checked },
                                        })}
                                        className="w-4 h-4 rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue"
                                    />
                                    {f.label}
                                </label>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                            En el evento alcanza a las tres audiencias —nacional, internacional y CADRE—: el
                            recargo no depende de la categoría, así que una categoría nueva lo hereda sola.
                        </p>
                    </div>

                    {/* Las dos líneas. Se muestran con su nombre porque es el que
                        ve quien paga: un recargo sin nombre es un cobro sin
                        explicar. */}
                    <div>
                        <p className="text-sm font-bold text-gray-800 mb-2">Qué se cobra</p>
                        <div className="space-y-3">
                            {Object.entries(borrador.lines || {}).map(([key, val]) => {
                                const meta = datos.resuelto[monedas[0]]?.tasas.find(t => t.key === key);
                                return (
                                    <div key={key} className="flex flex-wrap items-center gap-3">
                                        <span className="text-sm text-gray-700 min-w-0 flex-1">
                                            {meta?.label || key}
                                        </span>
                                        <label className="flex items-center gap-1.5 text-sm">
                                            <input
                                                type="number" step="0.01" min="0" max="100"
                                                value={aPorCiento(val.percent)}
                                                onChange={e => setBorrador({
                                                    ...borrador,
                                                    lines: { ...borrador.lines, [key]: { ...val, percent: aTantoPorUno(e.target.value) } },
                                                })}
                                                className="w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-right"
                                            />
                                            <span className="text-gray-500">%</span>
                                        </label>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ⚠️ EL EJEMPLO NO ES DECORATIVO. Un porcentaje suelto no
                        dice cuánto paga de más quien se inscribe, y ése es el
                        número por el que van a preguntar. Sale del MISMO
                        cálculo del cobro, así que lo que muestra el panel es lo
                        que se cobra. */}
                    <div>
                        <p className="text-sm font-bold text-gray-800 mb-2">Cómo queda</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {monedas.map(c => {
                                const ej = datos.resuelto[c].ejemplo;
                                return (
                                    <div key={c} className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-sm">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500" data-no-translate>{c}</p>
                                        <div className="mt-1.5 flex justify-between text-gray-600">
                                            <span>Inscripción</span>
                                            <span data-no-translate>{dinero(ej.base, c)}</span>
                                        </div>
                                        {ej.lines.map(l => (
                                            <div key={l.key} className="flex justify-between gap-3 text-gray-600">
                                                <span className="truncate">{l.label}</span>
                                                <span data-no-translate>{dinero(l.amount, c)}</span>
                                            </div>
                                        ))}
                                        <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-bold text-gray-900">
                                            <span>Paga</span>
                                            <span data-no-translate>{dinero(ej.total, c)}</span>
                                        </div>
                                        {!ej.enabled && (
                                            <p className="mt-1 text-xs text-gray-400">Apagado: se cobra el valor sin recargo.</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {error && (
                        <div className="flex gap-2.5 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">{error}</p>
                        </div>
                    )}
                    {aviso && (
                        <div className="flex gap-2.5 text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">{aviso}</p>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={guardar}
                        disabled={guardando}
                        className="inline-flex items-center gap-2 rounded-xl bg-rotary-blue px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rotary-navy disabled:opacity-60"
                    >
                        <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar el recargo'}
                    </button>
                </div>
            )}
        </div>
    );
}
