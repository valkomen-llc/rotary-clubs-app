import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, BadgeCheck, BarChart3, Building2, CheckCircle2,
    CircleDashed, Database, Globe2, History, Loader2, MapPin, RefreshCw,
    RotateCcw, ShieldCheck, Sparkles, Users, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

const STATUS_STYLE: Record<string, string> = {
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ambiguous: 'bg-amber-50 text-amber-700 border-amber-200',
    pending: 'bg-orange-50 text-orange-700 border-orange-200',
    unreconciled: 'bg-sky-50 text-sky-700 border-sky-200',
    unlinked: 'bg-gray-50 text-gray-600 border-gray-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

const PLATFORM_STYLE: Record<string, string> = {
    active: 'bg-emerald-500',
    pending: 'bg-amber-500',
    inactive: 'bg-gray-400',
    unverified: 'bg-slate-300',
};

const RUN_STYLE: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    running: 'bg-sky-50 text-sky-700 border-sky-200',
    failed: 'bg-rose-50 text-rose-700 border-rose-200',
    rolled_back: 'bg-gray-100 text-gray-600 border-gray-200',
};

function Kpi({ icon, label, value, hint, tone = 'gray' }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; tone?: string }) {
    const tones: Record<string, string> = {
        gray: 'bg-gray-50 text-gray-600',
        blue: 'bg-sky-50 text-sky-700',
        emerald: 'bg-emerald-50 text-emerald-700',
        amber: 'bg-amber-50 text-amber-700',
        violet: 'bg-violet-50 text-violet-700',
    };
    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tones[tone] || tones.gray}`}>{icon}</div>
                <div className="text-right">
                    <div className="text-2xl font-black text-gray-900 leading-none">{value}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-1">{label}</div>
                </div>
            </div>
            {hint && <p className="text-[11px] text-gray-500 mt-3">{hint}</p>}
        </div>
    );
}

export default function InstitutionalIntelligence() {
    const { token } = useAuth();
    const [overview, setOverview] = useState<any>(null);
    const [catalog, setCatalog] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [preview, setPreview] = useState<any>(null);
    const [previewing, setPreviewing] = useState(false);
    const [applying, setApplying] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [confirmAmbiguous, setConfirmAmbiguous] = useState(false);
    const [busyRun, setBusyRun] = useState<string | null>(null);

    const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [overviewRes, catalogRes] = await Promise.all([
                fetch(`${API}/crm/institutional/overview`, { headers }),
                fetch(`${API}/crm/institutional/catalog`, { headers }),
            ]);
            if (overviewRes.ok) setOverview(await overviewRes.json());
            else toast.error('No se pudo cargar la analítica institucional');
            if (catalogRes.ok) setCatalog(await catalogRes.json());
        } catch {
            toast.error('Error de conexión con la inteligencia institucional');
        } finally {
            setLoading(false);
        }
    }, [headers]);

    useEffect(() => { load(); }, [load]);

    const runPreview = async () => {
        setPreviewing(true);
        try {
            const res = await fetch(`${API}/crm/institutional/reconcile/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({ limit: 50 }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo generar la vista previa');
            setPreview(data);
            toast.success('Vista previa calculada sin escribir datos');
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setPreviewing(false);
        }
    };

    const apply = async () => {
        if (confirmText.trim().toUpperCase() !== 'CONCILIAR') {
            toast.error('Escribe CONCILIAR para confirmar la escritura de vínculos');
            return;
        }
        setApplying(true);
        try {
            const res = await fetch(`${API}/crm/institutional/reconcile/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({ confirm: true, confirmText: 'CONCILIAR', confirmAmbiguous }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo aplicar la conciliación');
            toast.success(`Conciliación guardada: ${data.summary.linksInserted + data.summary.linksUpdated} vínculo(s)`);
            setPreview(null);
            setConfirmText('');
            await load();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setApplying(false);
        }
    };

    const rollback = async (runId: string) => {
        if (!window.confirm('¿Revertir esta ejecución? Se restauran los vínculos anteriores y se conserva la auditoría.')) return;
        setBusyRun(runId);
        try {
            const res = await fetch(`${API}/crm/institutional/runs/${runId}/rollback`, {
                method: 'POST',
                headers,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo revertir');
            toast.success(`Ejecución revertida: ${data.summary.linksDeleted} alta(s) deshechas, ${data.summary.linksRestored} vínculo(s) restaurados`);
            await load();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setBusyRun(null);
        }
    };

    if (loading && !overview) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 flex flex-col items-center justify-center text-gray-400">
                <Loader2 className="w-7 h-7 animate-spin mb-3 text-violet-500" />
                <p className="text-sm font-medium">Leyendo Directorio, contactos y vínculos institucionales…</p>
            </div>
        );
    }

    if (!overview) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                <h3 className="font-bold text-gray-900">No se pudo cargar la inteligencia institucional</h3>
                <button onClick={load} className="mt-4 px-4 py-2 rounded-xl bg-rotary-blue text-white text-sm font-bold">Reintentar</button>
            </div>
        );
    }

    const totals = overview.totals || {};
    const statuses = catalog?.statuses || [];
    const platformStatuses = catalog?.platformStatuses || [];
    const completionBuckets = overview.completionBuckets || {};
    const platformProfiles = overview.platformProfiles || {};
    const maxBucket = Math.max(1, ...Object.values(completionBuckets).map((n: any) => Number(n) || 0));
    const summary = preview?.summary;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-violet-600" /> Inteligencia institucional
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Contactos del CRM cruzados con el Directorio Oficial. La completitud y el estado Club Platform se leen de sus fuentes reales.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={load} disabled={loading} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                    </button>
                    <button onClick={runPreview} disabled={previewing} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 flex items-center gap-1.5 disabled:opacity-50">
                        {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                        Analizar conciliación
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi icon={<Users className="w-4 h-4" />} label="Contactos" value={totals.contacts ?? 0} hint={`${totals.contactsWithClubName ?? 0} declaran club · ${totals.contactsWithDistrictOnly ?? 0} sólo distrito`} tone="blue" />
                <Kpi icon={<BadgeCheck className="w-4 h-4" />} label="Club confirmado" value={totals.confirmedContacts ?? 0} hint={`${totals.profileCoverage ?? 0}% de cobertura sobre quienes declaran club`} tone="emerald" />
                <Kpi icon={<Building2 className="w-4 h-4" />} label="Clubes con contacto" value={totals.clubsWithContacts ?? 0} hint={`${totals.clubsWithoutContacts ?? 0} club(es) del Directorio sin contacto vinculado`} tone="violet" />
                <Kpi icon={<Database className="w-4 h-4" />} label="Perfiles del Directorio" value={totals.directoryProfiles ?? 0} hint={`Distrito(s): ${(totals.directoryDistricts || []).join(', ') || 'sin datos'}`} tone="amber" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gray-400" /> Estado de conciliación</h3>
                    <p className="text-[11px] text-gray-500 mt-1">«Sin conciliar» es una sugerencia visible, no una relación confirmada.</p>
                    <div className="mt-4 space-y-2">
                        {statuses.map((status: any) => {
                            const count = overview.statusContacts?.[status.key] ?? 0;
                            const pct = totals.contacts ? Math.round((count / totals.contacts) * 100) : 0;
                            return (
                                <div key={status.key}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="font-bold text-gray-700">{status.label}</span>
                                        <span className="text-gray-500">{count} · {pct}%</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                        <div className={`h-full rounded-full ${
                                            status.key === 'confirmed' ? 'bg-emerald-500'
                                                : status.key === 'ambiguous' ? 'bg-amber-500'
                                                    : status.key === 'pending' ? 'bg-orange-500'
                                                        : status.key === 'unreconciled' ? 'bg-sky-500'
                                                            : status.key === 'rejected' ? 'bg-rose-500' : 'bg-gray-300'
                                        }`} style={{ width: `${Math.min(100, pct)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><Globe2 className="w-4 h-4 text-gray-400" /> Club Platform en el Directorio</h3>
                    <p className="text-[11px] text-gray-500 mt-1">Derivado de Club.status/dominio y RotaryClubActivation. No se usan etiquetas del CRM.</p>
                    <div className="mt-4 space-y-3">
                        {platformStatuses.map((status: any) => {
                            const count = platformProfiles?.[status.key] ?? 0;
                            const pct = (totals.directoryProfiles || 0) ? Math.round((count / totals.directoryProfiles) * 100) : 0;
                            return (
                                <div key={status.key}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="font-bold text-gray-700">{status.label}</span>
                                        <span className="text-gray-500">{count} club(es) · {pct}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                        <div className={`h-full rounded-full ${PLATFORM_STYLE[status.key] || 'bg-slate-300'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-gray-400" /> Completitud del Directorio</h3>
                    <div className="mt-4 space-y-2">
                        {Object.entries(completionBuckets).map(([bucket, count]: any) => (
                            <div key={bucket} className="flex items-center gap-2">
                                <span className="w-16 text-[11px] font-bold text-gray-500">{bucket}%</span>
                                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${(Number(count) / maxBucket) * 100}%` }} />
                                </div>
                                <span className="w-7 text-right text-[11px] font-bold text-gray-700">{count}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-3">El CRM no recalcula este porcentaje: lo publica el perfil oficial.</p>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> Contactos por distrito</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(overview.byDistrict || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 12).map(([district, count]: any) => (
                            <span key={district} className="px-2.5 py-1 rounded-full bg-sky-50 border border-sky-100 text-sky-800 text-[11px] font-bold">
                                D{district}: {count}
                            </span>
                        ))}
                        {!Object.keys(overview.byDistrict || {}).length && <p className="text-xs text-gray-400 italic">Sin distritos declarados.</p>}
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><Users className="w-4 h-4 text-gray-400" /> Cargos confirmados</h3>
                    <div className="mt-3 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                        {Object.entries(overview.byRole || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 10).map(([role, count]: any) => (
                            <div key={role} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600 truncate">{role}</span>
                                <span className="font-black text-gray-900">{count}</span>
                            </div>
                        ))}
                        {!Object.keys(overview.byRole || {}).length && <p className="text-xs text-gray-400 italic">Todavía no hay cargos confirmados.</p>}
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-black text-gray-900">Segmentos dinámicos</h3>
                        <p className="text-[11px] text-gray-500 mt-1">Se recalculan en cada consulta. Email Marketing puede usarlos como audiencia.</p>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {(overview.segments || []).map((segment: any) => (
                        <div key={segment.key} className="rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-gray-800">{segment.label}</span>
                                <span className="text-sm font-black text-gray-900">{segment.count}</span>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{segment.description}</p>
                            <p className="text-[10px] text-emerald-700 mt-1 font-semibold">{segment.emailReady} con email listo</p>
                        </div>
                    ))}
                </div>
            </div>

            {preview && (
                <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><Wand2 className="w-4 h-4 text-violet-600" /> Vista previa de conciliación</h3>
                            <p className="text-[11px] text-gray-500 mt-1">Calculada del lado del servidor. Nada se escribió todavía.</p>
                        </div>
                        <button onClick={() => setPreview(null)} className="text-xs font-bold text-gray-400 hover:text-gray-600">Cerrar</button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                            ['Procesados', summary.contactsProcessed],
                            ['Con club declarado', summary.contactsWithClubData],
                            ['Exactos', summary.confirmedContacts],
                            ['Aproximados', summary.ambiguousContacts],
                            ['Pendientes', summary.pendingContacts],
                            ['Sin club', summary.unlinkedContacts],
                            ['Vínculos a escribir', summary.linksToWrite],
                            ['Ya confirmados', summary.alreadyConfirmed],
                        ].map(([label, value]: any) => (
                            <div key={label} className="rounded-xl bg-gray-50 px-3 py-2">
                                <div className="text-lg font-black text-gray-900">{value ?? 0}</div>
                                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
                            </div>
                        ))}
                    </div>

                    {summary.unmatchedClubs?.length > 0 && (
                        <div>
                            <h4 className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">Clubes declarados sin coincidencia exacta</h4>
                            <div className="max-h-44 overflow-y-auto space-y-1">
                                {summary.unmatchedClubs.slice(0, 12).map((item: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between text-xs rounded-lg bg-gray-50 px-3 py-1.5">
                                        <span className="text-gray-700 truncate">{item.rawClubName}</span>
                                        <span className="text-gray-400 shrink-0 ml-2">D{item.districtNumber || '—'} · {item.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {preview.items?.length > 0 && (
                        <div>
                            <h4 className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">Primeros contactos del plan</h4>
                            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                                {preview.items.slice(0, 20).map((item: any) => (
                                    <div key={item.contactId} className="flex items-center justify-between gap-3 py-2 text-xs">
                                        <div className="min-w-0">
                                            <p className="font-bold text-gray-800 truncate">{item.contact?.name || item.contactId}</p>
                                            <p className="text-[10px] text-gray-400 truncate">
                                                {item.rawClubName || 'Sin club'} · D{item.districtNumber || '—'} · {item.roleLabel}
                                                {item.candidateProfileName ? ` · candidato: ${item.candidateProfileName}` : ''}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${STATUS_STYLE[item.status] || STATUS_STYLE.unlinked}`}>
                                            {item.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                        <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> La escritura sólo crea o actualiza vínculos institucionales.</p>
                        <p className="text-[11px] text-amber-800">No modifica contactos, perfiles ni tenants. Puedes revertirla desde el historial.</p>
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-amber-900">
                            <input type="checkbox" checked={confirmAmbiguous} onChange={(e) => setConfirmAmbiguous(e.target.checked)} className="rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                            Confirmar también las coincidencias aproximadas (no recomendado sin revisarlas)
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="Escribe CONCILIAR"
                                className="px-3 py-2 rounded-lg border border-amber-300 bg-white text-xs font-bold w-44 outline-none focus:ring-2 focus:ring-amber-500"
                            />
                            <button
                                onClick={apply}
                                disabled={applying || confirmText.trim().toUpperCase() !== 'CONCILIAR'}
                                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-40 flex items-center gap-1.5"
                            >
                                {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                Aplicar conciliación
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><History className="w-4 h-4 text-gray-400" /> Ejecuciones y reversión</h3>
                    <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
                        {(overview.runs || []).map((run: any) => (
                            <div key={run.id} className="rounded-xl border border-gray-100 px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${RUN_STYLE[run.status] || RUN_STYLE.completed}`}>{run.status}</span>
                                    <span className="text-[10px] text-gray-400">{run.createdAt ? new Date(run.createdAt).toLocaleString() : ''}</span>
                                </div>
                                <p className="text-[11px] text-gray-600 mt-1">
                                    {run.summary?.linksInserted ?? 0} alta(s) · {run.summary?.linksUpdated ?? 0} actualización(es) · {run.actor || 'sistema'}
                                </p>
                                {run.status === 'completed' && (
                                    <button
                                        onClick={() => rollback(run.id)}
                                        disabled={busyRun === run.id}
                                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                                    >
                                        {busyRun === run.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Revertir
                                    </button>
                                )}
                            </div>
                        ))}
                        {!(overview.runs || []).length && <p className="text-xs text-gray-400 italic">Todavía no hay ejecuciones de conciliación.</p>}
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-400" /> Clubes sin contactos vinculados</h3>
                    <p className="text-[11px] text-gray-500 mt-1">Ordenados por menor completitud en el Directorio.</p>
                    <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
                        {(overview.clubsWithoutContacts || []).map((club: any) => (
                            <div key={club.id} className="flex items-center justify-between gap-2 text-xs rounded-lg bg-gray-50 px-3 py-1.5">
                                <span className="text-gray-700 truncate">{club.officialName}</span>
                                <span className="text-gray-400 shrink-0">{club.completionPercentage}%</span>
                            </div>
                        ))}
                        {!(overview.clubsWithoutContacts || []).length && <p className="text-xs text-gray-400 italic">Todos los clubes del Directorio tienen al menos un contacto confirmado.</p>}
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
                <h4 className="text-[11px] font-black uppercase tracking-wide text-sky-800 flex items-center gap-1.5"><CircleDashed className="w-3.5 h-3.5" /> Reglas de lectura</h4>
                <ul className="mt-2 space-y-1 text-[11px] text-sky-900 list-disc pl-4">
                    {(overview.notes || []).map((note: string, index: number) => <li key={index}>{note}</li>)}
                </ul>
            </div>
        </div>
    );
}
