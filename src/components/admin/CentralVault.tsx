// La BÓVEDA CENTRAL — lo que recaudaron TODOS los sitios.
//
// v4.853 — Fase 1 de la wallet multi-sitio.
//
// ═════════════════════════════════════════════════════════════════════
// CONSOLIDAR NO ES MEZCLAR
// ═════════════════════════════════════════════════════════════════════
//
// Arriba, el consolidado POR MONEDA —nunca una cifra que sume COP con USD—.
// Abajo, una fila por sitio, y cada sitio conserva su detalle: el dinero del
// Distrito 4281 es del Distrito 4281, no de un fondo común. Ese es el principio
// del rediseño y es lo que separa una vista consolidada de una que miente.
//
// Es una vista de SÓLO LECTURA. Los retiros, la sincronización y la
// trazabilidad viven en la Bóveda de cada sitio, que no se toca: pulsar una
// fila lleva allí.

import { useEffect, useState } from 'react';
import axios from 'axios';
import {
    Building2, Wallet, TrendingUp, AlertCircle, ChevronRight, Info,
} from 'lucide-react';
import { formatMoney } from '../../lib/locale';
import { useLang } from '../../contexts/LanguageContext';
import FeeRulesPanel from './FeeRulesPanel';
// v4.980 — El recargo que se le SUMA a quien se inscribe. Va al lado de las
// tarifas porque son las dos mitades de la misma pregunta —cuánto cuesta
// cobrar— y no en una pantalla propia: las que se olvidan son las del segundo
// lugar.
import SurchargePanel from './SurchargePanel';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';

interface MonedaDeSitio {
    currency: string;
    aportes: number;
    bruto: number;
    procesador: number;
    plataforma: number;
    neto: number;
    enTransito: number;
    disponible: number;
    retirado: number;
}

interface SitioFila {
    clubId: string;
    clubName: string;
    clubType: string | null;
    district: string | null;
    aportes: number;
    monedas: MonedaDeSitio[];
}

interface Overview {
    generadoEn: string;
    total: Record<string, MonedaDeSitio & { sitios: number }>;
    takeRate: Record<string, number | null>;
    ticketPromedio: Record<string, number | null>;
    sitios: SitioFila[];
    sitiosConMovimiento: number;
    sitiosTotales: number;
    sinConciliar: { clubId: string; currency: string; amount: number }[];
    fuente: string;
}

const money = (n: number | null | undefined, currency: string) =>
    formatMoney(Number(n ?? 0), currency || 'USD');

export default function CentralVault({ onAbrirSitio }: { onAbrirSitio?: (clubId: string) => void }) {
    useLang();   // el importe se reescribe al cambiar de idioma
    const [datos, setDatos] = useState<Overview | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Por defecto, sólo los sitios que recaudaron: sin esto la tabla lista
    // cientos de sitios en cero y el que importa se pierde entre ellos.
    const [soloActivos, setSoloActivos] = useState(true);

    useEffect(() => {
        let vivo = true;
        (async () => {
            setCargando(true);
            setError(null);
            try {
                const { data } = await axios.get(
                    `${API_URL}/payouts/admin/overview?movimiento=${soloActivos ? 'activos' : 'todos'}`,
                    { headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` } }
                );
                if (vivo) setDatos(data);
            } catch (e: any) {
                // Un fallo se DICE con su motivo. «No se pudo cargar» a secas
                // obliga a diagnosticar a ciegas — es la regla del sitio.
                if (vivo) setError(e?.response?.data?.error || e?.message || 'No pudimos cargar la Bóveda Central.');
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, [soloActivos]);

    if (cargando) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-rotary-blue rounded-full border-t-transparent animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                    <p className="font-bold text-amber-900">No pudimos cargar la Bóveda Central</p>
                    <p className="text-sm text-amber-800 mt-1">{error}</p>
                </div>
            </div>
        );
    }

    const monedas = Object.keys(datos?.total || {}).sort();

    return (
        <div className="space-y-6">
            {/* ── El consolidado, UNA TARJETA POR MONEDA ──────────────
                Nunca una cifra que sume COP con USD. En la vista central el
                error se multiplicaría por la cantidad de sitios. */}
            {monedas.length === 0 ? (
                <div className="rounded-3xl border border-gray-100 bg-white p-10 text-center">
                    <Wallet className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                    <p className="text-gray-500">Ningún sitio de la plataforma ha recibido aportes todavía.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {monedas.map(code => {
                        const t = datos!.total[code];
                        return (
                            <div key={code} className="bg-rotary-blue rounded-3xl p-6 text-white relative overflow-hidden shadow-xl shadow-rotary-blue/20">
                                <div className="absolute top-0 right-0 p-8 opacity-10">
                                    <Wallet className="w-40 h-40 rotate-12" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <span className="text-xs font-black tracking-[0.15em] bg-white/15 rounded-md px-2 py-1" data-no-translate>
                                            {code}
                                        </span>
                                        <h3 className="text-sm font-medium text-blue-100">
                                            Aportes brutos · {t.sitios} sitio{t.sitios === 1 ? '' : 's'}
                                        </h3>
                                    </div>
                                    <div className="text-3xl md:text-5xl font-black mb-5 mt-2" data-no-translate>
                                        {money(t.bruto, code)}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <Celda titulo="Tarifa de procesamiento" valor={money(t.procesador, code)} />
                                        <Celda titulo="Retención de la plataforma" valor={money(t.plataforma, code)} />
                                        <Celda titulo="Neto de los sitios" valor={money(t.neto, code)} />
                                        <Celda titulo="Disponible para retiro" valor={money(t.disponible, code)} />
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap gap-x-6 gap-y-1 text-xs text-blue-100">
                                        <span data-no-translate>{t.aportes} aporte{t.aportes === 1 ? '' : 's'}</span>
                                        {/* ⚠️ `null` es «no se sabe», no «cero por ciento». Sin
                                            bruto no es que la plataforma no cobre: es que no
                                            hubo nada que cobrar. */}
                                        <span>
                                            Take rate:{' '}
                                            <b data-no-translate>
                                                {datos!.takeRate[code] == null ? 'sin aportes' : `${datos!.takeRate[code]} %`}
                                            </b>
                                        </span>
                                        <span>
                                            Ticket promedio:{' '}
                                            <b data-no-translate>
                                                {datos!.ticketPromedio[code] == null ? '—' : money(datos!.ticketPromedio[code], code)}
                                            </b>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* De dónde salen las cifras. Cuando la fuente pase al libro mayor
                esta pantalla tiene que poder decirlo sin que nadie lo adivine. */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <Info className="w-4 h-4 shrink-0 text-gray-400" aria-hidden="true" />
                <p className="flex-1 min-w-[16rem]">
                    Cada sitio conserva su dinero por separado: el consolidado suma dentro de una misma
                    moneda y nunca entre monedas.
                </p>
                <label className="flex items-center gap-2 whitespace-nowrap">
                    <input
                        type="checkbox"
                        checked={soloActivos}
                        onChange={e => setSoloActivos(e.target.checked)}
                        className="rounded border-gray-300"
                    />
                    Sólo sitios con aportes
                    {datos && (
                        <span className="text-gray-400" data-no-translate>
                            ({datos.sitiosConMovimiento} de {datos.sitiosTotales})
                        </span>
                    )}
                </label>
            </div>

            {/* ── Una fila por sitio ──────────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-rotary-blue" />
                    <h3 className="text-lg font-bold text-gray-900">Por sitio</h3>
                </div>

                {(datos?.sitios || []).length === 0 ? (
                    <p className="px-6 py-10 text-center text-sm text-gray-400">
                        Ningún sitio con aportes.
                    </p>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {datos!.sitios.map(s => (
                            <button
                                key={s.clubId}
                                type="button"
                                onClick={() => onAbrirSitio?.(s.clubId)}
                                className="w-full text-left px-6 py-4 hover:bg-gray-50/70 transition-colors flex items-start gap-4"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 truncate" data-no-translate>{s.clubName}</p>
                                    <p className="text-xs text-gray-400 mt-0.5" data-no-translate>
                                        {[s.clubType, s.district && `Distrito ${s.district}`].filter(Boolean).join(' · ') || '—'}
                                    </p>
                                </div>
                                {/* Un sitio con dos monedas es UN sitio con dos filas
                                    dentro, no dos sitios. */}
                                <div className="shrink-0 space-y-1 text-right">
                                    {s.monedas.map(m => (
                                        <div key={m.currency} className="flex items-baseline justify-end gap-3 text-sm">
                                            <span className="text-[10px] font-black tracking-wider text-gray-400" data-no-translate>
                                                {m.currency}
                                            </span>
                                            <span className="font-bold text-gray-900 tabular-nums" data-no-translate>
                                                {money(m.bruto, m.currency)}
                                            </span>
                                            <span className="text-gray-400 text-xs tabular-nums w-28" data-no-translate>
                                                neto {money(m.neto, m.currency)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-300 mt-1 shrink-0" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* La tarifa que explica el take rate de arriba. Va acá y no en una
                pantalla propia: la decisión se toma donde ya se está mirando el
                número que esa tarifa produce. */}
            <FeeRulesPanel />

            <SurchargePanel />

            {/* ⚠️ Un retiro en una moneda en la que el sitio nunca recibió
                aportes no se puede conciliar. Se REPORTA en vez de restarse
                contra otra: hasta v4.840 la moneda del retiro no se escribía y
                toda fila vieja quedó en dólares por omisión. */}
            {(datos?.sinConciliar || []).length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-amber-900">
                        <p className="font-bold">
                            {datos!.sinConciliar.length} retiro(s) en una moneda sin aportes
                        </p>
                        <p className="mt-1 text-amber-800">
                            Su moneda real no está guardada y no se adivina — adivinarla sería adivinar
                            cuánto dinero salió. No se restan de ningún saldo.
                        </p>
                    </div>
                </div>
            )}

            <p className="text-xs text-gray-400 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                Cifras tomadas de los cobros registrados
                {datos?.generadoEn && (
                    <> · <span data-no-translate>{new Date(datos.generadoEn).toLocaleString('es-CO')}</span></>
                )}
            </p>
        </div>
    );
}

function Celda({ titulo, valor }: { titulo: string; valor: string }) {
    return (
        <div className="bg-white/10 rounded-xl px-3 py-2">
            <span className="text-blue-200 block mb-0.5 text-[11px] leading-tight">{titulo}</span>
            <span className="font-bold" data-no-translate>{valor}</span>
        </div>
    );
}
