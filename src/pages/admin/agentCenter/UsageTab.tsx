// Consumo de IA — el módulo de medición pedido por el cliente (v4.1316).
import { useCallback, useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import { ErrorNote, Kpi, SectionHeader, fmtDate } from './agentCenterUi';

interface Row { calls: number; errors: number; inputTokens: number; outputTokens: number; costUsd: number }
interface Summary {
    days: number; totals: Row; byDay: (Row & { day: string })[];
    byModel: (Row & { provider: string; model: string })[]; byFeature: (Row & { feature: string; label: string })[];
    bySite: (Row & { siteId: string; siteName: string | null; siteType: string | null })[]; unpricedModels: string[];
}
interface Price { model: string; provider: string | null; inputPerMTok: number; outputPerMTok: number; custom: boolean }
interface UsageEvent { id: string; createdAt: string; provider: string | null; model: string | null; feature: string; siteId: string | null; inputTokens: number; outputTokens: number; costUsd: number; ok: boolean; error: string | null; latencyMs: number | null }

const usd = (v: number) => `US$ ${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;
const num = (v: number) => Number(v || 0).toLocaleString('es-CO');

function DailyBars({ rows }: { rows: (Row & { day: string })[] }) {
    if (!rows.length) return <p className="text-sm text-gray-400">Sin consumo registrado en el período.</p>;
    const max = Math.max(...rows.map(r => r.costUsd), 0.000001);
    const W = 720; const H = 160; const pad = 28; const bw = Math.min(28, Math.max(4, (W - pad * 2) / rows.length - 4));
    return (
        <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full min-w-[520px] h-auto" role="img" aria-label="Costo estimado por día">
                <line x1={pad} y1={H} x2={W - pad} y2={H} stroke="#e5e7eb" />
                <text x={pad} y={12} fontSize="10" fill="#9ca3af">{usd(max)}</text>
                {rows.map((r, i) => {
                    const h = (r.costUsd / max) * (H - 20);
                    const x = pad + i * ((W - pad * 2) / rows.length) + 2;
                    return (
                        <g key={r.day}>
                            <rect x={x} y={H - h} width={bw} height={Math.max(1, h)} rx="3" fill={r.errors > 0 ? '#f59e0b' : '#004080'} opacity={0.85}><title>{`${String(r.day).slice(0, 10)}: ${usd(r.costUsd)} · ${num(r.calls)} llamadas · ${r.errors} errores`}</title></rect>
                            {(i === 0 || i === rows.length - 1 || rows.length <= 10) && <text x={x + bw / 2} y={H + 14} fontSize="9" textAnchor="middle" fill="#9ca3af">{String(r.day).slice(5, 10)}</text>}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

function PriceRow({ price, onSave }: { price: Price; onSave: (p: Price) => Promise<void> }) {
    const [i, setI] = useState(String(price.inputPerMTok));
    const [o, setO] = useState(String(price.outputPerMTok));
    const dirty = i !== String(price.inputPerMTok) || o !== String(price.outputPerMTok);
    return (
        <tr className="border-b border-gray-50">
            <td className="px-3 py-1.5 text-sm"><code>{price.model}</code>{price.custom && <span className="ml-1 text-[10px] text-blue-600 font-bold">editado</span>}</td>
            <td className="px-3 py-1.5 text-xs text-gray-500">{price.provider}</td>
            <td className="px-3 py-1.5"><input aria-label={`Entrada ${price.model}`} className="w-24 px-2 py-1 rounded-lg border border-gray-200 text-sm tabular-nums" value={i} onChange={e => setI(e.target.value)} /></td>
            <td className="px-3 py-1.5"><input aria-label={`Salida ${price.model}`} className="w-24 px-2 py-1 rounded-lg border border-gray-200 text-sm tabular-nums" value={o} onChange={e => setO(e.target.value)} /></td>
            <td className="px-3 py-1.5"><button type="button" disabled={!dirty} onClick={() => onSave({ ...price, inputPerMTok: Number(i), outputPerMTok: Number(o) })} className="text-xs font-bold text-rotary-blue disabled:text-gray-300">Guardar</button></td>
        </tr>
    );
}

export default function UsageTab({ scope = 'platform' }: { scope?: 'platform' | 'site' }) {
    const [days, setDays] = useState(30);
    const [data, setData] = useState<Summary | null>(null);
    const [prices, setPrices] = useState<Price[]>([]);
    const [events, setEvents] = useState<UsageEvent[]>([]);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        acApi<Summary>(`/usage?days=${days}`).then(setData).catch(e => setError(e.message));
        if (scope === 'platform') acApi<{ prices: Price[] }>('/usage/prices').then(d => setPrices(d.prices)).catch(() => setPrices([]));
        acApi<{ events: UsageEvent[] }>('/usage/events?limit=40').then(d => setEvents(d.events)).catch(() => setEvents([]));
    }, [days, scope]);
    useEffect(load, [load]);

    const savePrice = async (p: Price) => {
        try { const r = await acApi<{ prices: Price[] }>('/usage/prices', { method: 'PUT', body: p }); setPrices(r.prices); setError(null); } catch (e: any) { setError(e.message); }
    };

    const t = data?.totals;
    return (
        <div className="space-y-5">
            <SectionHeader title="Consumo de IA" subtitle="Cada llamada a un modelo que pasa por el enrutador de la plataforma o por el motor de agentes: tokens, costo estimado, errores y quién lo gastó. El costo es una ESTIMACIÓN con los precios de referencia de abajo; la factura real la emite cada proveedor."
                actions={<div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1">{[7, 30, 90].map(d => <button key={d} type="button" onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${days === d ? 'bg-gray-100 text-gray-800' : 'text-gray-400'}`}>{d} días</button>)}</div>} />
            <ErrorNote message={error} />
            {!data ? <div className="text-sm text-gray-400">Cargando…</div> : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                        <Kpi label="Costo estimado" value={usd(t!.costUsd)} hint={`últimos ${data.days} días`} />
                        <Kpi label="Llamadas" value={num(t!.calls)} />
                        <Kpi label="Tokens de entrada" value={num(t!.inputTokens)} />
                        <Kpi label="Tokens de salida" value={num(t!.outputTokens)} />
                        <Kpi label="Errores" value={num(t!.errors)} hint={t!.calls ? `${Math.round((t!.errors / t!.calls) * 100)}% de las llamadas` : ''} />
                    </div>
                    {data.unpricedModels.length > 0 && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-2.5">Sin precio de referencia (cuentan como US$ 0): {data.unpricedModels.join(', ')}. Agrégalos abajo.</div>}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5"><p className="font-black text-gray-800 mb-2">Costo por día</p><DailyBars rows={data.byDay} /></div>
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        {[
                            { title: 'Por modelo', rows: data.byModel.map(r => ({ ...r, k: `${r.provider}·${r.model}`, label: r.model, sub: r.provider })) },
                            { title: 'Por función', rows: data.byFeature.map(r => ({ ...r, k: r.feature, label: r.label, sub: r.feature })) },
                            { title: 'Por sitio', rows: data.bySite.map(r => ({ ...r, k: r.siteId || 'plataforma', label: r.siteName || (r.siteId ? r.siteId : 'Administración central / sin sitio'), sub: r.siteType || '' })) },
                        ].map(b => (
                            <div key={b.title} className="bg-white rounded-2xl border border-gray-100 p-4 min-w-0">
                                <p className="font-black text-gray-800 mb-2">{b.title}</p>
                                {b.rows.length === 0 ? <p className="text-sm text-gray-400">Sin datos.</p> : (
                                    <ul className="divide-y divide-gray-50">
                                        {b.rows.slice(0, 12).map(r => (
                                            <li key={b.title + r.k} className="py-1.5 flex justify-between gap-2 text-sm">
                                                <span className="min-w-0"><span className="block truncate text-gray-700">{r.label}</span><span className="text-[11px] text-gray-400">{r.sub} · {num(r.calls)} llamadas{r.errors ? ` · ${r.errors} errores` : ''}</span></span>
                                                <b className="tabular-nums text-gray-800 shrink-0">{usd(r.costUsd)}</b>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="font-black text-gray-800">Llamadas recientes</p>
                <div className="overflow-x-auto mt-2">
                    <table className="w-full text-sm">
                        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="px-3 py-2">Cuándo</th><th className="px-3 py-2">Función</th><th className="px-3 py-2">Modelo</th><th className="px-3 py-2 text-right">Tokens</th><th className="px-3 py-2 text-right">Costo</th><th className="px-3 py-2">Resultado</th></tr></thead>
                        <tbody>
                            {events.map(e => (
                                <tr key={e.id} className="border-b border-gray-50">
                                    <td className="px-3 py-1.5 whitespace-nowrap text-gray-500 tabular-nums">{fmtDate(e.createdAt)}</td>
                                    <td className="px-3 py-1.5 text-gray-700">{e.feature}</td>
                                    <td className="px-3 py-1.5 text-gray-500">{e.model || '—'}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{num(e.inputTokens)} / {num(e.outputTokens)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{usd(e.costUsd)}</td>
                                    <td className="px-3 py-1.5">{e.ok ? <span className="text-emerald-700 text-xs font-bold">OK{e.latencyMs ? ` · ${(e.latencyMs / 1000).toFixed(1)} s` : ''}</span> : <span className="text-red-600 text-xs font-bold" title={e.error || ''}>Error</span>}</td>
                                </tr>
                            ))}
                            {events.length === 0 && <tr><td colSpan={6} className="px-3 py-3 text-sm text-gray-400">Todavía no hay llamadas registradas.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
            {scope === 'platform' && <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="font-black text-gray-800">Precios de referencia</p>
                <p className="text-xs text-gray-500">USD por millón de tokens. Verifícalos con cada proveedor: cambian sin aviso.</p>
                <div className="overflow-x-auto mt-2">
                    <table className="w-full"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="px-3 py-2">Modelo</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Entrada</th><th className="px-3 py-2">Salida</th><th className="px-3 py-2" /></tr></thead>
                        <tbody>{prices.map(p => <PriceRow key={p.model} price={p} onSave={savePrice} />)}</tbody></table>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">Qué se mide: todo lo que pasa por el enrutador de modelos (asistentes, agente de WhatsApp, generadores que lo usan) y por el motor de agentes. Algunos módulos antiguos llaman al proveedor directamente y todavía no aparecen aquí.</p>
            </div>}
        </div>
    );
}
