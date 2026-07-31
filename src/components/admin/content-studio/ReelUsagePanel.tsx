/**
 * Panel de auditoría de consumo — Creador de Reels IA (v4.669)
 * ============================================================
 *
 * Muestra qué proveedor hizo qué en un Reel concreto: llamadas, tiempo,
 * unidades y —si hay tarifa configurada— costo aproximado.
 *
 * Lo que este panel NO hace, a propósito:
 *
 * · **No muestra el saldo de ningún proveedor.** Los créditos son la
 *   estimación propia de la plataforma, igual que el resto del medidor del
 *   módulo. Presentarlo como el saldo de KIE sería mentir sobre el origen del
 *   número.
 * · **No inventa precios.** Si no hay tarifa en el entorno, dice «sin tarifa
 *   configurada» en vez de pintar «$0». Un cero es una afirmación; un hueco es
 *   la verdad.
 *
 * La franja de «reparto de responsabilidades» compara lo declarado con lo
 * ocurrido. Es la respuesta a la pregunta que originó el panel: si KIE
 * apareciera atendiendo una locución, saldría acá en rojo.
 */

import React, { useEffect, useState } from 'react';
import {
    Activity, AlertTriangle, CheckCircle2, Clock, Coins, Cpu,
    Loader2, Music, Video, FileText, Film, RefreshCw
} from 'lucide-react';
import type { ReelUsageReport, ReelUsageProvider } from '../../../lib/reelSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`,
    'Content-Type': 'application/json'
});

const PROVIDER_ICON: Record<string, React.ElementType> = {
    kie: Video,
    elevenlabs: Music,
    stability: Music,
    llm: FileText,
    ffmpeg: Film,
    render: Film
};

const PROVIDER_TONE: Record<string, string> = {
    kie: 'bg-violet-50 text-violet-700 border-violet-200',
    elevenlabs: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    stability: 'bg-teal-50 text-teal-700 border-teal-200',
    llm: 'bg-sky-50 text-sky-700 border-sky-200',
    ffmpeg: 'bg-amber-50 text-amber-700 border-amber-200',
    render: 'bg-amber-50 text-amber-700 border-amber-200'
};

const fmtMs = (ms: number) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)} s`;
    return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
};

const fmtUnits = (units: number, unit: string | null) => {
    if (!units) return '—';
    const n = units >= 100 ? Math.round(units).toLocaleString('es-CO') : units.toFixed(1).replace(/\.0$/, '');
    const label = unit === 'credits' ? 'créditos'
        : unit === 'characters' ? 'caracteres'
            : unit === 'tokens' ? 'tokens'
                : unit === 'seconds' ? 's' : '';
    return `${n} ${label}`.trim();
};

const fmtUsd = (v: number | null) => v == null ? null : `US$ ${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`;

const ProviderCard: React.FC<{ p: ReelUsageProvider }> = ({ p }) => {
    const Icon = PROVIDER_ICON[p.id] || Cpu;
    const tone = PROVIDER_TONE[p.id] || 'bg-gray-50 text-gray-700 border-gray-200';
    const [open, setOpen] = useState(false);

    return (
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full p-4 flex items-start gap-3 text-left hover:bg-gray-50/70 transition-colors"
            >
                <span className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${tone}`}>
                    <Icon className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-gray-900 text-sm">{p.label}</span>
                        {p.role && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{p.role}</span>
                        )}
                        {p.errors > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                                {p.errors} con error
                            </span>
                        )}
                    </span>
                    <span className="mt-1 flex items-center gap-4 flex-wrap text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5 text-gray-400" />
                            {p.calls} llamada{p.calls === 1 ? '' : 's'}
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            {fmtMs(p.ms)}
                        </span>
                        {p.units > 0 && (
                            <span className="flex items-center gap-1">
                                <Coins className="w-3.5 h-3.5 text-gray-400" />
                                {fmtUnits(p.units, p.operations[0]?.unit || null)}
                            </span>
                        )}
                        <span className="font-bold text-gray-800">
                            {p.costKnown && p.costUsd != null
                                ? fmtUsd(p.costUsd)
                                : p.costKnown ? '—' : 'sin tarifa configurada'}
                        </span>
                    </span>
                </span>
                <span className="text-[10px] font-bold text-gray-400 shrink-0 mt-1">
                    {open ? 'Ocultar' : 'Detalle'}
                </span>
            </button>

            {p.violations.length > 0 && (
                <div className="px-4 pb-3">
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                        <div className="flex items-center gap-1.5 font-bold mb-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Este proveedor atendió trabajo que no le corresponde
                        </div>
                        <ul className="list-disc list-inside space-y-0.5">
                            {p.violations.map((v, i) => (
                                <li key={i}>
                                    {v.label} — es trabajo de tipo «{v.scope}»
                                    {v.expected && <> y le corresponde a <strong>{v.expected}</strong></>}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {open && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                    {p.note && (
                        <p className="px-4 pt-3 text-[11px] text-gray-500 leading-relaxed">{p.note}</p>
                    )}
                    <div className="p-4 pt-3 space-y-1.5">
                        {p.operations.map((o, i) => (
                            <div key={i} className="flex items-baseline gap-3 text-xs">
                                <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${o.status === 'ok' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                <span className="flex-1 min-w-0">
                                    <span className="font-bold text-gray-800">{o.label}</span>
                                    {o.target && <span className="text-gray-500"> · {o.target}</span>}
                                    {o.detail && (
                                        <span className={`block text-[11px] ${o.status === 'ok' ? 'text-gray-500' : 'text-red-600'}`}>
                                            {o.detail}
                                        </span>
                                    )}
                                </span>
                                <span className="shrink-0 text-gray-500 tabular-nums">{fmtUnits(o.units, o.unit)}</span>
                                <span className="shrink-0 text-gray-400 tabular-nums w-16 text-right">{fmtMs(o.ms)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const ReelUsagePanel: React.FC<{ reelId: string }> = ({ reelId }) => {
    const [report, setReport] = useState<ReelUsageReport | null>(null);
    const [loading, setLoading] = useState(true);

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reelId}/usage`, { headers: authHeaders() });
            if (r.ok) setReport(await r.json());
        } catch { /* el panel es informativo: un fallo de red no rompe la ficha */ } finally {
            setLoading(false);
        }
    }, [reelId]);

    useEffect(() => { load(); }, [load]);

    if (loading && !report) {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-500 p-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Leyendo el consumo…
            </div>
        );
    }

    if (!report?.available) {
        return (
            <p className="text-sm text-gray-500 p-4">
                Todavía no hay registro de consumo para este Reel.
                {report?.reason && <span className="block text-xs text-gray-400 mt-1">{report.reason}</span>}
            </p>
        );
    }

    const t = report.totals;
    const clean = (t?.violations || 0) === 0;

    return (
        <div className="space-y-4">
            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Llamadas</div>
                    <div className="text-lg font-black text-gray-900">{t?.calls ?? 0}</div>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Tiempo de proveedores</div>
                    <div className="text-lg font-black text-gray-900">{fmtMs(t?.ms || 0)}</div>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Créditos estimados</div>
                    <div className="text-lg font-black text-gray-900">{t?.credits ?? 0}</div>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Costo aproximado</div>
                    <div className="text-lg font-black text-gray-900">
                        {t?.costKnown && t?.costUsd != null ? fmtUsd(t.costUsd) : '—'}
                    </div>
                    {!t?.costKnown && (
                        <div className="text-[10px] text-gray-400 leading-tight mt-0.5">
                            Falta configurar las tarifas
                        </div>
                    )}
                </div>
            </div>

            {/* Reparto de responsabilidades */}
            <div className={`rounded-xl border p-3 flex items-start gap-2 text-xs ${
                clean ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
            }`}>
                {clean
                    ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                <div>
                    <div className="font-bold">
                        {clean
                            ? 'Cada motor hizo sólo lo suyo'
                            : `${t?.violations} operación/es fuera del reparto declarado`}
                    </div>
                    <div className="mt-0.5 opacity-90">
                        KIE anima y adapta imágenes · ElevenLabs pone voz y música ·
                        el modelo de lenguaje escribe · FFmpeg monta.
                    </div>
                </div>
            </div>

            {/* Por proveedor */}
            <div className="space-y-2">
                {report.providers.map(p => <ProviderCard key={p.id} p={p} />)}
            </div>

            <button
                onClick={load}
                disabled={loading}
                className="text-xs font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1.5 disabled:opacity-50"
            >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
            </button>

            <p className="text-[11px] text-gray-400 leading-relaxed">
                Los tiempos y las unidades son medidas reales. Los créditos son la estimación
                propia de la plataforma —no el saldo de la cuenta del proveedor—, y el costo
                sólo aparece cuando hay tarifa configurada en el entorno.
            </p>
        </div>
    );
};

export default ReelUsagePanel;
