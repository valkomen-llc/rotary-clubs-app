import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BarChart3, RefreshCw, AlertTriangle, TrendingUp, DollarSign, Lightbulb,
    CalendarDays, Megaphone, Info, CheckCircle2, Wallet, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

type View = 'dashboard' | 'campaigns' | 'calendar' | 'recommendations';

const SEVERITY_STYLE: Record<string, string> = {
    critical: 'bg-red-50 border-red-200 text-red-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
};

const nf = (n: number | null | undefined) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('es-CO').format(n));
const pf = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n} %`);

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="bg-white border rounded-xl p-3">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
);

export default function CrmAnalytics() {
    const { token } = useAuth();

    // Todos los hooks arriba, antes de cualquier return.
    const [view, setView] = useState<View>('dashboard');
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<any>(null);
    const [campaigns, setCampaigns] = useState<any>(null);
    const [calendar, setCalendar] = useState<any>(null);
    const [recs, setRecs] = useState<any>(null);
    const [savingBudget, setSavingBudget] = useState(false);
    const [budgetForm, setBudgetForm] = useState<any>(null);

    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    }), [token]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API}/crm/analytics/dashboard?days=${days}`, { headers });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo cargar la analítica');
            const body = await res.json();
            setData(body);
            setBudgetForm({
                monthlyBudget: body.budget?.budget ?? 0,
                rates: body.cost?.lines?.reduce((acc: any, l: any) => {
                    acc[String(l.category).toLowerCase()] = l.rate ?? '';
                    return acc;
                }, {}) || {},
            });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [headers, days]);

    useEffect(() => { load(); }, [load]);

    const loadView = useCallback(async () => {
        try {
            if (view === 'campaigns' && !campaigns) {
                const r = await fetch(`${API}/crm/analytics/campaigns?days=${days}`, { headers });
                if (r.ok) setCampaigns(await r.json());
            }
            if (view === 'calendar' && !calendar) {
                const r = await fetch(`${API}/crm/analytics/calendar`, { headers });
                if (r.ok) setCalendar(await r.json());
            }
            if (view === 'recommendations' && !recs) {
                const r = await fetch(`${API}/crm/analytics/recommendations?days=${days}`, { headers });
                if (r.ok) setRecs(await r.json());
            }
        } catch { /* cada vista falla sola sin tumbar el panel */ }
    }, [view, days, headers, campaigns, calendar, recs]);

    useEffect(() => { loadView(); }, [loadView]);

    const saveBudget = async () => {
        setSavingBudget(true);
        try {
            const rates: Record<string, number> = {};
            for (const [k, v] of Object.entries(budgetForm.rates || {})) {
                const n = Number(v);
                if (Number.isFinite(n) && n > 0) rates[k] = n;
            }
            const res = await fetch(`${API}/crm/automation/budget`, {
                method: 'PUT', headers,
                body: JSON.stringify({ monthlyBudget: Number(budgetForm.monthlyBudget) || 0, rates }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo guardar');
            toast.success('Presupuesto y tarifas actualizados');
            load();
        } catch (e: any) { toast.error(e.message); }
        finally { setSavingBudget(false); }
    };

    const runSweep = async () => {
        try {
            const res = await fetch(`${API}/crm/alerts/sweep`, { method: 'POST', headers });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo revisar');
            toast.success(body.created > 0 ? `${body.created} alerta(s) nueva(s)` : 'Sin alertas nuevas');
        } catch (e: any) { toast.error(e.message); }
    };

    if (loading) return <div className="p-12 text-center text-gray-500">Cargando la analítica…</div>;

    if (error) {
        return (
            <div className="p-8 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> {error}</p>
                <button onClick={load} className="mt-3 text-sm px-3 py-1.5 bg-white border rounded-lg">Reintentar</button>
            </div>
        );
    }

    if (!data) return null;
    const m = data.messaging;
    const maxSent = Math.max(1, ...(data.series || []).map((d: any) => d.sent));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-green-600" /> Analítica y optimización
                    </h2>
                    <p className="text-sm text-gray-500">Qué se mandó, qué se leyó y qué pasó después.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select value={days} onChange={e => setDays(Number(e.target.value))} className="border rounded-lg px-2 py-2 text-sm">
                        <option value={7}>7 días</option>
                        <option value={30}>30 días</option>
                        <option value={90}>90 días</option>
                    </select>
                    <button onClick={runSweep} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">Revisar alertas</button>
                    <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {([
                    { k: 'dashboard', label: 'Resumen', icon: <TrendingUp className="w-3.5 h-3.5" /> },
                    { k: 'campaigns', label: 'Centro de campañas', icon: <Megaphone className="w-3.5 h-3.5" /> },
                    { k: 'calendar', label: 'Calendario', icon: <CalendarDays className="w-3.5 h-3.5" /> },
                    { k: 'recommendations', label: 'Recomendaciones', icon: <Lightbulb className="w-3.5 h-3.5" /> },
                ] as const).map(v => (
                    <button
                        key={v.k}
                        onClick={() => setView(v.k as View)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 ${
                            view === v.k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'
                        }`}
                    >{v.icon} {v.label}</button>
                ))}
            </div>

            {view === 'dashboard' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        <Stat label="Enviados" value={nf(m.sent)} />
                        <Stat label="Entregados" value={nf(m.delivered)} sub={pf(m.deliveryRate)} />
                        <Stat label="Leídos" value={nf(m.read)} sub={pf(m.readRate)} />
                        <Stat label="Respondidos" value={nf(m.responded)} sub={pf(m.responseRate)} />
                        <Stat label="Fallidos" value={nf(m.failed)} sub={pf(m.failureRate)} />
                        <Stat label="Entrantes" value={nf(m.inbound)} />
                    </div>

                    <div className="bg-white border rounded-xl p-4">
                        <h3 className="font-semibold text-gray-900 text-sm mb-3">Actividad diaria</h3>
                        <div className="flex items-end gap-1 h-32 overflow-x-auto">
                            {(data.series || []).map((d: any) => (
                                <div key={d.day} className="flex flex-col justify-end items-center gap-0.5 min-w-[10px] flex-1" title={`${d.day}: ${d.sent} enviados, ${d.read} leídos`}>
                                    <div className="w-full bg-green-500 rounded-sm" style={{ height: `${(d.sent / maxSent) * 100}%` }} />
                                    <div className="w-full bg-green-200 rounded-sm" style={{ height: `${(d.read / maxSent) * 100}%` }} />
                                </div>
                            ))}
                            {!data.series?.length && <p className="text-sm text-gray-400">Sin actividad en el período.</p>}
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-4">
                        <div className="bg-white border rounded-xl p-4">
                            <h3 className="font-semibold text-gray-900 text-sm">Conversiones por recorrido</h3>
                            <p className="text-[11px] text-gray-500 mt-0.5 mb-3">{data.attributionNote}</p>
                            <div className="space-y-2">
                                {(data.journeys || []).filter((j: any) => j.sites > 0).map((j: any) => (
                                    <div key={j.journeyId} className="border rounded-lg p-2.5">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-gray-900">{j.name}</p>
                                            <span className="text-[11px] text-gray-500">{j.sites} sitio(s)</span>
                                        </div>
                                        {j.conversions.length ? (
                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                {j.conversions.map((c: any) => (
                                                    <span key={c.key} className="text-[11px] bg-green-50 text-green-800 border border-green-200 px-1.5 py-0.5 rounded">
                                                        {c.label}: {c.n} ({c.rate} %)
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-gray-400 mt-1">Sin conversiones atribuidas.</p>
                                        )}
                                    </div>
                                ))}
                                {!(data.journeys || []).some((j: any) => j.sites > 0) && (
                                    <p className="text-sm text-gray-400 py-4 text-center">Todavía no hay recorridos con alcance.</p>
                                )}
                            </div>
                        </div>

                        <div className="bg-white border rounded-xl p-4">
                            <h3 className="font-semibold text-gray-900 text-sm mb-3">Rendimiento por plantilla</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="text-gray-500">
                                        <tr>
                                            <th className="text-left py-1">Plantilla</th>
                                            <th className="text-right py-1">Env.</th>
                                            <th className="text-right py-1">Lectura</th>
                                            <th className="text-right py-1">Respuesta</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {(data.templates || []).slice(0, 12).map((t: any) => (
                                            <tr key={t.templateName} className={t.enoughSample ? '' : 'text-gray-400'}>
                                                <td className="py-1.5 truncate max-w-[160px]">
                                                    {t.templateName}
                                                    {!t.enoughSample && <span className="ml-1 text-[10px]">(muestra corta)</span>}
                                                </td>
                                                <td className="text-right">{nf(t.sent)}</td>
                                                <td className="text-right">{pf(t.readRate)}</td>
                                                <td className="text-right">{pf(t.responseRate)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {!data.templates?.length && <p className="text-sm text-gray-400 py-4 text-center">Sin envíos con plantilla.</p>}
                            </div>
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-4">
                        <div className="bg-white border rounded-xl p-4">
                            <h3 className="font-semibold text-gray-900 text-sm mb-3">Rendimiento por segmento</h3>
                            <div className="space-y-1.5">
                                {(data.segments || []).map((s: any) => (
                                    <div key={s.state} className="flex items-center justify-between text-xs">
                                        <span className="truncate">{s.label}</span>
                                        <span className="text-gray-500 shrink-0 ml-2">{nf(s.sent)} env. · {pf(s.readRate)} lectura</span>
                                    </div>
                                ))}
                                {!data.segments?.length && <p className="text-sm text-gray-400 py-3 text-center">Sin datos.</p>}
                            </div>
                        </div>

                        <div className="bg-white border rounded-xl p-4 space-y-3">
                            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                                <Wallet className="w-4 h-4" /> Costo y presupuesto
                            </h3>
                            <p className="text-[11px] text-gray-500">{data.cost?.note}</p>

                            <div className="space-y-1">
                                {(data.cost?.lines || []).map((l: any) => (
                                    <div key={l.category} className="flex items-center justify-between text-xs">
                                        <span>{l.category}</span>
                                        <span className="text-gray-600">
                                            {nf(l.windows)} conversaciones ·{' '}
                                            {l.cost !== null
                                                ? <strong>{l.cost}</strong>
                                                : <span className="text-amber-700">sin tarifa configurada</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {data.budget?.configured ? (
                                <div>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span>Presupuesto del mes</span>
                                        <span className={data.budget.exceeded ? 'text-red-700 font-bold' : 'text-gray-600'}>
                                            {data.budget.used} / {data.budget.budget} ({data.budget.ratio} %)
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${data.budget.exceeded ? 'bg-red-500' : data.budget.ratio >= 80 ? 'bg-amber-500' : 'bg-green-500'}`}
                                            style={{ width: `${Math.min(100, data.budget.ratio)}%` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs bg-gray-50 border rounded-lg px-2 py-1.5 text-gray-600 flex items-start gap-1.5">
                                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    {data.budget?.reason === 'sin_tarifas'
                                        ? 'Hay presupuesto pero faltan tarifas por categoría, así que el gasto es desconocido — no cero.'
                                        : 'Sin presupuesto configurado.'}
                                </p>
                            )}

                            {budgetForm && (
                                <div className="border-t pt-3 space-y-2">
                                    <label className="text-xs block">
                                        <span className="text-gray-500">Presupuesto mensual</span>
                                        <input
                                            type="number" min={0} value={budgetForm.monthlyBudget}
                                            onChange={e => setBudgetForm({ ...budgetForm, monthlyBudget: e.target.value })}
                                            className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                                        />
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.keys(budgetForm.rates || {}).map(cat => (
                                            <label key={cat} className="text-xs">
                                                <span className="text-gray-500">Tarifa {cat}</span>
                                                <input
                                                    type="number" step="0.0001" min={0}
                                                    value={budgetForm.rates[cat] ?? ''}
                                                    onChange={e => setBudgetForm({
                                                        ...budgetForm,
                                                        rates: { ...budgetForm.rates, [cat]: e.target.value },
                                                    })}
                                                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                                                />
                                            </label>
                                        ))}
                                    </div>
                                    <button
                                        onClick={saveBudget} disabled={savingBudget}
                                        className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
                                    ><DollarSign className="w-3.5 h-3.5" /> {savingBudget ? 'Guardando…' : 'Guardar'}</button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white border rounded-xl p-4">
                        <h3 className="font-semibold text-gray-900 text-sm mb-3">Bandeja</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <Stat label="Asignación (mediana)" value={data.inbox.medianAssignMin !== null ? `${data.inbox.medianAssignMin} min` : '—'} />
                            <Stat label="Resolución (mediana)" value={data.inbox.medianResolveHours !== null ? `${data.inbox.medianResolveHours} h` : '—'} />
                            <Stat label="Agentes activos" value={nf(data.inbox.byAgent?.length)} />
                            <Stat label="Intenciones distintas" value={nf(data.inbox.byIntent?.length)} />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {(data.inbox.byIntent || []).slice(0, 10).map((i: any, idx: number) => (
                                <span key={idx} className="text-[11px] bg-gray-50 border px-1.5 py-0.5 rounded">
                                    {i.label}: {i.n}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {view === 'campaigns' && (
                <div className="space-y-4">
                    {!campaigns ? <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p> : (
                        <>
                            <div className="bg-white border rounded-xl p-4">
                                <h3 className="font-semibold text-gray-900 text-sm mb-3">Recorridos automatizados</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="text-gray-500">
                                            <tr>
                                                <th className="text-left py-1">Recorrido</th>
                                                <th className="text-left py-1">Estado</th>
                                                <th className="text-right py-1">Activas</th>
                                                <th className="text-right py-1">Enviados</th>
                                                <th className="text-right py-1">Leídos</th>
                                                <th className="text-right py-1">Fallidos</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {campaigns.journeys.map((j: any) => (
                                                <tr key={j.id}>
                                                    <td className="py-1.5">{j.name}</td>
                                                    <td><span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100">{j.status}</span></td>
                                                    <td className="text-right">{nf(j.activeRuns)}</td>
                                                    <td className="text-right">{nf(j.sent)}</td>
                                                    <td className="text-right">{nf(j.read)}</td>
                                                    <td className="text-right">{nf(j.failed)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="bg-white border rounded-xl p-4">
                                <h3 className="font-semibold text-gray-900 text-sm mb-3">Campañas manuales</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="text-gray-500">
                                            <tr>
                                                <th className="text-left py-1">Campaña</th>
                                                <th className="text-left py-1">Estado</th>
                                                <th className="text-left py-1">Plantilla</th>
                                                <th className="text-right py-1">Dest.</th>
                                                <th className="text-right py-1">Enviados</th>
                                                <th className="text-right py-1">Leídos</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {campaigns.campaigns.map((c: any) => (
                                                <tr key={c.id}>
                                                    <td className="py-1.5 truncate max-w-[180px]">{c.name}</td>
                                                    <td><span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100">{c.status}</span></td>
                                                    <td className="truncate max-w-[140px] text-gray-500">{c.templateName || '—'}</td>
                                                    <td className="text-right">{nf(c.totalContacts)}</td>
                                                    <td className="text-right">{nf(c.sent)}</td>
                                                    <td className="text-right">{nf(c.read)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {!campaigns.campaigns.length && <p className="text-sm text-gray-400 py-4 text-center">Sin campañas en el período.</p>}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {view === 'calendar' && (
                <div className="bg-white border rounded-xl p-4">
                    {!calendar ? <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p> : (
                        <>
                            <p className="text-[11px] text-gray-500 mb-3">{calendar.note}</p>
                            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                                {[...calendar.events]
                                    .sort((a: any, b: any) => new Date(a.at).getTime() - new Date(b.at).getTime())
                                    .map((e: any, i: number) => (
                                        <div key={i} className="flex items-center gap-3 text-xs border-b pb-1.5">
                                            <span className="text-gray-400 w-24 shrink-0">
                                                {new Date(e.at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                                                e.kind === 'expiration' ? 'bg-amber-100 text-amber-800'
                                                : e.kind === 'training' ? 'bg-indigo-100 text-indigo-800'
                                                : e.kind === 'journey_due' ? 'bg-green-100 text-green-800'
                                                : e.kind === 'campaign_scheduled' ? 'bg-blue-100 text-blue-800'
                                                : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {e.kind === 'expiration' ? 'vence'
                                                    : e.kind === 'training' ? 'capacitación'
                                                    : e.kind === 'journey_due' ? 'recorrido'
                                                    : e.kind === 'campaign_scheduled' ? 'campaña'
                                                    : 'enviados'}
                                            </span>
                                            <span className="truncate">
                                                {e.name || (e.n !== undefined ? `${e.n} mensaje(s)` : '')}
                                                {e.kind === 'journey_due' && e.n ? ` · ${e.n} inscripción(es)` : ''}
                                            </span>
                                        </div>
                                    ))}
                                {!calendar.events.length && <p className="text-sm text-gray-400 py-6 text-center">Nada programado en el rango.</p>}
                            </div>
                        </>
                    )}
                </div>
            )}

            {view === 'recommendations' && (
                <div className="space-y-3">
                    {!recs ? <p className="text-sm text-gray-400 py-8 text-center">Analizando…</p> : (
                        <>
                            {recs.summary && (
                                <div className="bg-white border rounded-xl p-4">
                                    <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                                        <Sparkles className="w-3.5 h-3.5" /> Resumen
                                        <span className="font-normal text-gray-400">— redactado por el modelo sobre los números medidos</span>
                                    </p>
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{recs.summary}</p>
                                </div>
                            )}
                            <p className="text-[11px] text-gray-500">{recs.note}</p>

                            {recs.findings.map((f: any) => (
                                <div key={f.key} className={`border rounded-xl p-3 ${SEVERITY_STYLE[f.severity]}`}>
                                    <p className="text-sm font-semibold">{f.title}</p>
                                    <p className="text-xs mt-1 opacity-80">{f.evidence}</p>
                                    <p className="text-xs mt-1.5">{f.suggestion}</p>
                                </div>
                            ))}

                            {!recs.findings.length && (
                                <div className="text-center py-12 text-gray-400">
                                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">Nada para recomendar todavía.</p>
                                    <p className="text-xs mt-1">
                                        Hacen falta al menos {recs.sampleFloor} envíos por caso para que un número signifique algo.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
