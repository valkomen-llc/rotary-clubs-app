import React, { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { toast } from 'sonner';
import {
    BarChart3, Search, Loader2, FileDown, Share2, Mail, Save, Sparkles, Calendar,
    Building2, Check, Trash2, Clock, Copy, X, Link2, ChevronRight, FileText, Plus,
} from 'lucide-react';
import ExecutiveReportView from '../../components/admin/insights/ExecutiveReportView';
import { exportReportPdf } from '../../lib/reportPdf';
import type { ReportDataset, SiteOption, ReportSummary } from '../../lib/reportTypes';

const API = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token') || '';
const authFetch = (url: string, opts: RequestInit = {}) =>
    fetch(`${API}${url}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(opts.headers || {}) } });

const PERIODS = [
    { key: 'all', label: 'Hasta la fecha' },
    { key: 'month', label: 'Mensual' },
    { key: 'quarter', label: 'Trimestral' },
    { key: 'semester', label: 'Semestral' },
    { key: 'year', label: 'Anual' },
    { key: 'custom', label: 'Personalizado' },
];

type Tab = 'generate' | 'history' | 'schedule';

const ClubPlatformInsights: React.FC = () => {
    const [tab, setTab] = useState<Tab>('generate');
    const [sites, setSites] = useState<SiteOption[]>([]);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [periodKey, setPeriodKey] = useState('all');
    const [custom, setCustom] = useState<{ start?: string; end?: string }>({});
    const [loadingSites, setLoadingSites] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [datasets, setDatasets] = useState<ReportDataset[] | null>(null);
    const [activeIdx, setActiveIdx] = useState(0);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [emailOpen, setEmailOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loadSites(); }, []);

    const loadSites = async () => {
        try {
            setLoadingSites(true);
            const r = await authFetch('/reports/sites');
            if (!r.ok) throw new Error();
            const d = await r.json();
            setSites(d.sites || []);
        } catch { toast.error('No se pudieron cargar los sitios'); }
        finally { setLoadingSites(false); }
    };

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return sites.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q) || (s.categoryLabel || '').toLowerCase().includes(q));
    }, [sites, search]);

    const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

    const generate = async () => {
        if (selected.length === 0) { toast.error('Selecciona al menos un sitio'); return; }
        if (periodKey === 'custom' && (!custom.start || !custom.end)) { toast.error('Indica el rango de fechas'); return; }
        try {
            setGenerating(true);
            setDatasets(null); setSavedId(null); setShareUrl(null);
            const r = await authFetch('/reports/preview', { method: 'POST', body: JSON.stringify({ siteIds: selected, periodKey, custom }) });
            if (!r.ok) throw new Error((await r.json()).error);
            const d = await r.json();
            setDatasets(d.datasets); setActiveIdx(0);
            toast.success('Informe generado');
        } catch (e: any) { toast.error(e?.message || 'Error al generar el informe'); }
        finally { setGenerating(false); }
    };

    const save = async () => {
        if (!datasets) return;
        try {
            const r = await authFetch('/reports', { method: 'POST', body: JSON.stringify({ siteIds: selected, periodKey, custom, share: true }) });
            if (!r.ok) throw new Error((await r.json()).error);
            const d = await r.json();
            setSavedId(d.report.id); setShareUrl(d.shareUrl);
            toast.success('Informe guardado en el historial');
        } catch (e: any) { toast.error(e?.message || 'No se pudo guardar'); }
    };

    const downloadPdf = async () => {
        if (!reportRef.current) return;
        try {
            setExporting(true);
            const ds = datasets![activeIdx];
            const name = `informe-${ds.meta.site.name}-${ds.meta.period.label}`;
            const b64 = await exportReportPdf(reportRef.current, name);
            if (b64 && savedId) {
                // nada que subir aquí; se podría persistir vía backend si se desea
            }
            toast.success('PDF generado');
        } catch { toast.error('No se pudo exportar el PDF'); }
        finally { setExporting(false); }
    };

    const copyShare = async () => {
        let url = shareUrl;
        if (!url && savedId) {
            const r = await authFetch(`/reports/${savedId}/share`, { method: 'PATCH', body: JSON.stringify({ shared: true }) });
            const d = await r.json(); url = d.shareUrl; setShareUrl(url);
        }
        if (!url) { toast.error('Guarda el informe primero'); return; }
        navigator.clipboard.writeText(url); toast.success('Enlace copiado');
    };

    const openReportFromHistory = async (id: string) => {
        try {
            const r = await authFetch(`/reports/${id}`);
            const d = await r.json();
            const arr = Array.isArray(d.report.dataset) ? d.report.dataset : [d.report.dataset];
            // reinyecta narrativa si vino separada
            if (d.report.narrative && Array.isArray(d.report.narrative)) arr.forEach((ds: ReportDataset, i: number) => { if (!ds.narrative) ds.narrative = d.report.narrative[i]; });
            setDatasets(arr); setActiveIdx(0); setSavedId(id);
            setShareUrl(d.report.shareToken ? `${window.location.origin}/informe/${d.report.shareToken}` : null);
            setSelected(d.report.siteIds || []); setPeriodKey(d.report.periodKey || 'all');
            setTab('generate');
        } catch { toast.error('No se pudo abrir el informe'); }
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0c3c7c] to-[#013388] flex items-center justify-center text-white shadow-lg">
                            <BarChart3 className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                Club Platform Insights <Sparkles className="w-4 h-4 text-amber-500" />
                            </h1>
                            <p className="text-sm text-slate-400 font-medium">Informes Ejecutivos Inteligentes por sitio</p>
                        </div>
                    </div>
                    <div className="flex bg-slate-100 rounded-xl p-1">
                        {([['generate', 'Generar'], ['history', 'Historial'], ['schedule', 'Programación']] as [Tab, string][]).map(([k, l]) => (
                            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-bold transition ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
                        ))}
                    </div>
                </div>

                {tab === 'generate' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Config panel */}
                        <div className="lg:col-span-4 space-y-4">
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                <h3 className="text-sm font-black text-slate-700 mb-3 flex items-center gap-2"><Building2 className="w-4 h-4" /> Sitios ({selected.length})</h3>
                                <div className="relative mb-3">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar sitio, ciudad, categoría…" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" />
                                </div>
                                <div className="flex items-center justify-between mb-2 text-xs">
                                    <button onClick={() => setSelected(filtered.map((s) => s.id))} className="text-blue-600 font-bold hover:underline">Seleccionar visibles</button>
                                    <button onClick={() => setSelected([])} className="text-slate-400 font-bold hover:underline">Limpiar</button>
                                </div>
                                <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                                    {loadingSites ? (
                                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
                                    ) : filtered.length === 0 ? (
                                        <p className="text-xs text-slate-400 text-center py-6">Sin resultados</p>
                                    ) : filtered.map((s) => {
                                        const on = selected.includes(s.id);
                                        return (
                                            <button key={s.id} onClick={() => toggle(s.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition ${on ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                                                <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-blue-600 text-white' : 'border border-slate-300'}`}>{on && <Check className="w-3.5 h-3.5" />}</span>
                                                {s.logo ? <img src={s.logo} alt="" className="w-6 h-6 rounded object-contain" /> : <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-400">{s.name.slice(0, 2).toUpperCase()}</span>}
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm font-bold text-slate-700 truncate">{s.name}</span>
                                                    <span className="block text-[10px] text-slate-400 truncate">{s.categoryLabel}{s.city ? ` · ${s.city}` : ''}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                <h3 className="text-sm font-black text-slate-700 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4" /> Período</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {PERIODS.map((p) => (
                                        <button key={p.key} onClick={() => setPeriodKey(p.key)} className={`px-3 py-2 rounded-xl text-xs font-bold transition ${periodKey === p.key ? 'bg-[#0c3c7c] text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>{p.label}</button>
                                    ))}
                                </div>
                                {periodKey === 'custom' && (
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        <input type="date" value={custom.start || ''} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs" />
                                        <input type="date" value={custom.end || ''} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs" />
                                    </div>
                                )}
                            </div>

                            <button onClick={generate} disabled={generating} className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#0c3c7c] to-[#013388] text-white font-bold shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2 disabled:opacity-60">
                                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</> : <><Sparkles className="w-4 h-4" /> Generar Informe</>}
                            </button>

                            {datasets && (
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 grid grid-cols-2 gap-2">
                                    <button onClick={save} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"><Save className="w-3.5 h-3.5" /> Guardar</button>
                                    <button onClick={downloadPdf} disabled={exporting} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-60">{exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} PDF</button>
                                    <button onClick={copyShare} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"><Share2 className="w-3.5 h-3.5" /> Compartir</button>
                                    <button onClick={() => { if (!savedId) { toast.error('Guarda el informe primero'); return; } setEmailOpen(true); }} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"><Mail className="w-3.5 h-3.5" /> Correo</button>
                                </div>
                            )}
                            {shareUrl && (
                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-2">
                                    <Link2 className="w-4 h-4 text-blue-500 shrink-0" />
                                    <input readOnly value={shareUrl} className="flex-1 bg-transparent text-xs text-blue-700 font-medium truncate outline-none" />
                                    <button onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success('Copiado'); }}><Copy className="w-3.5 h-3.5 text-blue-500" /></button>
                                </div>
                            )}
                        </div>

                        {/* Preview */}
                        <div className="lg:col-span-8">
                            {!datasets ? (
                                <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-slate-200 text-slate-400 p-10 text-center">
                                    <FileText className="w-14 h-14 mb-4 opacity-20" />
                                    <p className="font-bold text-slate-500">Selecciona uno o más sitios y un período</p>
                                    <p className="text-sm mt-1">El informe ejecutivo se generará aquí, listo para descargar en PDF o compartir.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {datasets.length > 1 && (
                                        <div className="flex gap-2 overflow-x-auto pb-1">
                                            {datasets.map((d, i) => (
                                                <button key={i} onClick={() => setActiveIdx(i)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${activeIdx === i ? 'bg-[#0c3c7c] text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{d.meta.site.name}</button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="rounded-3xl overflow-hidden border border-slate-200 shadow-lg bg-white">
                                        <ExecutiveReportView dataset={datasets[activeIdx]} innerRef={reportRef} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'history' && <HistoryTab sites={sites} onOpen={openReportFromHistory} />}
                {tab === 'schedule' && <ScheduleTab sites={sites} />}
            </div>

            {emailOpen && savedId && <EmailModal reportId={savedId} onClose={() => setEmailOpen(false)} />}
        </AdminLayout>
    );
};

// ─── Historial ───────────────────────────────────────────────────────────────
const HistoryTab: React.FC<{ sites: SiteOption[]; onOpen: (id: string) => void }> = ({ onOpen }) => {
    const [reports, setReports] = useState<ReportSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');

    const load = async () => {
        try { setLoading(true); const r = await authFetch(`/reports?search=${encodeURIComponent(q)}`); const d = await r.json(); setReports(d.reports || []); }
        catch { toast.error('No se pudo cargar el historial'); } finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const del = async (id: string) => { if (!confirm('¿Eliminar este informe?')) return; await authFetch(`/reports/${id}`, { method: 'DELETE' }); setReports((r) => r.filter((x) => x.id !== id)); toast.success('Eliminado'); };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Buscar informe…" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <button onClick={load} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200">Buscar</button>
            </div>
            {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                : reports.length === 0 ? <p className="text-center text-slate-400 py-10 text-sm">Aún no hay informes generados.</p>
                : <div className="space-y-2">
                    {reports.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0c3c7c] to-[#013388] flex items-center justify-center text-white shrink-0">
                                <span className="text-xs font-black">{r.maturityScore ?? '—'}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-800 truncate">{r.title}</p>
                                <p className="text-[11px] text-slate-400">{r.maturityLevel || ''} · {new Date(r.createdAt).toLocaleDateString('es')} {r.shared && <span className="text-blue-500 font-bold">· Compartido</span>} {r.emailedTo?.length ? <span className="text-emerald-500 font-bold">· Enviado</span> : ''}</p>
                            </div>
                            {r.shareToken && <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/informe/${r.shareToken}`); toast.success('Enlace copiado'); }} className="p-2 text-slate-400 hover:text-blue-600"><Link2 className="w-4 h-4" /></button>}
                            <button onClick={() => onOpen(r.id)} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-1 hover:bg-slate-800">Abrir <ChevronRight className="w-3.5 h-3.5" /></button>
                            <button onClick={() => del(r.id)} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>}
        </div>
    );
};

// ─── Programación ────────────────────────────────────────────────────────────
const ScheduleTab: React.FC<{ sites: SiteOption[] }> = ({ sites }) => {
    const [schedules, setSchedules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState<{ name: string; siteIds: string[]; frequency: string; periodKey: string; recipients: string }>({ name: '', siteIds: [], frequency: 'monthly', periodKey: 'month', recipients: '' });
    const [creating, setCreating] = useState(false);

    const load = async () => { try { setLoading(true); const r = await authFetch('/reports/schedules/all'); const d = await r.json(); setSchedules(d.schedules || []); } catch {} finally { setLoading(false); } };
    useEffect(() => { load(); }, []);

    const create = async () => {
        if (!form.name || form.siteIds.length === 0) { toast.error('Nombre y al menos un sitio'); return; }
        try { setCreating(true); const r = await authFetch('/reports/schedules', { method: 'POST', body: JSON.stringify(form) }); if (!r.ok) throw new Error(); toast.success('Programación creada'); setForm({ name: '', siteIds: [], frequency: 'monthly', periodKey: 'month', recipients: '' }); load(); }
        catch { toast.error('No se pudo crear'); } finally { setCreating(false); }
    };
    const remove = async (id: string) => { await authFetch(`/reports/schedules/${id}`, { method: 'DELETE' }); setSchedules((s) => s.filter((x) => x.id !== id)); };
    const toggleActive = async (s: any) => { await authFetch(`/reports/schedules/${s.id}`, { method: 'PATCH', body: JSON.stringify({ active: !s.active }) }); load(); };

    const FREQ: Record<string, string> = { monthly: 'Mensual', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2"><Plus className="w-4 h-4" /> Nueva programación</h3>
                <div className="space-y-3">
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre (ej. Informe mensual clubes)" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                    <select multiple value={form.siteIds} onChange={(e) => setForm({ ...form, siteIds: Array.from(e.target.selectedOptions).map((o) => o.value) })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm h-32">
                        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                        <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
                            {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <select value={form.periodKey} onChange={(e) => setForm({ ...form, periodKey: e.target.value })} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
                            {PERIODS.filter((p) => p.key !== 'custom').map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                    </div>
                    <input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="Correos destino (separados por coma)" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                    <button onClick={create} disabled={creating} className="w-full py-2.5 rounded-xl bg-[#0c3c7c] text-white text-sm font-bold disabled:opacity-60">{creating ? 'Creando…' : 'Crear programación'}</button>
                </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2"><Clock className="w-4 h-4" /> Programaciones activas</h3>
                {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
                    : schedules.length === 0 ? <p className="text-center text-slate-400 py-8 text-sm">Sin programaciones. Crea una para enviar informes automáticamente.</p>
                    : <div className="space-y-2">
                        {schedules.map((s) => (
                            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100">
                                <span className={`w-2 h-2 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-slate-700 truncate">{s.name}</p>
                                    <p className="text-[11px] text-slate-400">{FREQ[s.frequency]} · {s.siteIds.length} sitio(s) · {s.recipients?.length || 0} destinatario(s)</p>
                                </div>
                                <button onClick={() => toggleActive(s)} className="text-[11px] font-bold text-slate-500 hover:text-slate-700">{s.active ? 'Pausar' : 'Activar'}</button>
                                <button onClick={() => remove(s.id)} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>}
                <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">La ejecución automática requiere un cron que invoque <code className="bg-slate-100 px-1 rounded">POST /api/reports/schedules/run-due</code>. Puedes dispararlo manualmente desde tu proveedor de cron (Vercel Cron).</p>
            </div>
        </div>
    );
};

// ─── Modal de correo ─────────────────────────────────────────────────────────
const EmailModal: React.FC<{ reportId: string; onClose: () => void }> = ({ reportId, onClose }) => {
    const [recipients, setRecipients] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    const send = async () => {
        if (!recipients.trim()) { toast.error('Indica al menos un correo'); return; }
        try { setSending(true); const r = await authFetch(`/reports/${reportId}/email`, { method: 'POST', body: JSON.stringify({ recipients: recipients.split(',').map((s) => s.trim()).filter(Boolean), message }) }); if (!r.ok) throw new Error((await r.json()).error); toast.success('Informe enviado por correo'); onClose(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo enviar'); } finally { setSending(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Mail className="w-5 h-5" /> Enviar por correo</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
                </div>
                <label className="text-xs font-bold text-slate-500">Destinatarios (separados por coma)</label>
                <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="responsable@sitio.org, presidente@…" className="w-full mt-1 mb-3 px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                <label className="text-xs font-bold text-slate-500">Mensaje (opcional)</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full mt-1 mb-4 px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none" />
                <button onClick={send} disabled={sending} className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-60 flex items-center justify-center gap-2">{sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : <>Enviar informe</>}</button>
            </div>
        </div>
    );
};

export default ClubPlatformInsights;
