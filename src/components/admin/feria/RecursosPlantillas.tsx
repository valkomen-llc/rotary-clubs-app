// ════════════════════════════════════════════════════════════════════
// Recursos y plantillas — Postulación de Proyectos (v4.1264.0)
//
// Pestaña del módulo donde el comité administra la PLANTILLA OFICIAL DE
// PRESENTACIÓN que los clubes descargan desde «Mi proyecto», y donde ve quién
// la descargó y quién no.
//
//   · Subir / reemplazar: el archivo va DIRECTO a S3 con una URL prefirmada
//     (no pasa por la función, que corta en 4,5 MB) y después el servidor lo
//     valida por sus bytes y lo registra como versión nueva. La anterior se
//     conserva, con sus descargas.
//   · Publicar / desactivar, título, descripción y tamaño máximo.
//   · Analítica: indicadores, adopción, por distrito, evolución y la tabla de
//     seguimiento con filtros y exportación.
//
// Los permisos llegan del servidor (`access`): sin `config` la pantalla es de
// lectura, sin `export` no hay botones de exportar. El servidor los vuelve a
// validar en cada petición.
//
// Todo componente de este archivo vive en el ámbito del MÓDULO (v4.971).
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, BarChart3, CheckCircle2, Download, Eye, EyeOff, FileDown, FileSpreadsheet, History,
    Loader2, RefreshCw, Save, Search, Upload, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { leerJson } from '../../../lib/leerJson';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const BLUE = '#17458F';
const KEY = 'presentation_template';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

// ── Tipos ────────────────────────────────────────────────────────────
interface Version {
    id: string; number: number; fileName: string; format: string; formatLabel: string; contentType: string;
    sizeBytes: number; note: string | null; publishedAt: string; publishedBy: string | null; current: boolean; deliveredCount: number;
}
interface HistoryItem { id: string; type: string; title: string; detail: string | null; actorName: string | null; createdAt: string }
interface ResourceView {
    key: string; exists: boolean; id?: string; title: string; description: string; active: boolean; maxSizeMb: number;
    updatedAt?: string; updatedBy?: string | null; current: Version | null; versions: Version[]; history: HistoryItem[];
    status: 'empty' | 'published' | 'inactive';
}
interface ListResponse {
    resources: ResourceView[]; access: { config: boolean; export: boolean; view: boolean };
    accept: string; limits: { min: number; max: number; default: number };
}
interface TrackingRow {
    submissionId: string; accountId: string | null; publicRef: string; responsible: string; email: string;
    clubName: string; district: string; projectName: string; projectStateLabel: string; eligible: boolean;
    deliveredCount: number; failedCount: number; firstDeliveredAt: string | null; lastDeliveredAt: string | null; lastVersionNumber: number | null;
}
interface Kpis {
    eligibleProjects: number; projectsWithDownload: number; pendingProjects: number; uniqueUsers: number;
    totalDelivered: number; totalFailed: number; adoptionPct: number; clubsWithDownload: number; clubsPending: number;
    lastDeliveredAt: string | null;
}
interface Analytics {
    exists: boolean; currentVersion: number | null; active?: boolean; kpis: Kpis;
    byDistrict: { district: string; eligible: number; withDownload: number; delivered: number; adoptionPct: number }[];
    timeline: { day: string; delivered: number; projects: number }[];
    rows: TrackingRow[]; total: number; filters: { key: string; label: string }[];
    versions: number[]; clubs: string[]; districts: string[];
}

// ── Formato ──────────────────────────────────────────────────────────
const fmtBytes = (n?: number | null) => {
    const b = Number(n) || 0;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
    if (b >= 1024) return `${Math.round(b / 1024)} KB`;
    return `${b} B`;
};
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtPct = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} %`;
const fmtDayShort = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

const STATUS_META: Record<ResourceView['status'], { label: string; cls: string }> = {
    published: { label: 'Publicada', cls: 'bg-emerald-100 text-emerald-700' },
    inactive: { label: 'Desactivada', cls: 'bg-amber-100 text-amber-800' },
    empty: { label: 'Sin archivo', cls: 'bg-slate-100 text-slate-600' },
};

/** Sube un archivo a una URL prefirmada informando el avance (fetch no lo da). */
const putWithProgress = (url: string, file: File, contentType: string, onProgress: (pct: number) => void) =>
    new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.timeout = 30 * 60 * 1000;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`El almacenamiento rechazó el archivo (HTTP ${xhr.status}).`)));
        xhr.onerror = () => reject(new Error('Se cortó la conexión con el almacenamiento.'));
        xhr.ontimeout = () => reject(new Error('La subida tardó demasiado.'));
        xhr.send(file);
    });

// ── Piezas ───────────────────────────────────────────────────────────
const Card = ({ title, icon: Icon, right, children }: { title: string; icon: any; right?: React.ReactNode; children: React.ReactNode }) => (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Icon size={16} style={{ color: BLUE }} /> {title}</h3>
            {right}
        </div>
        {children}
    </section>
);

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
    <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
        {children}
        {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
);

const Info = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</p>
        <p className="break-words text-sm font-semibold text-slate-800">{v}</p>
    </div>
);

const Kpi = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
);

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500';

// ════════════════════════════════════════════════════════════════════
const RecursosPlantillas = ({ eventId }: { eventId: string }) => {
    const withEvento = useCallback((url: string) => (eventId ? `${url}${url.includes('?') ? '&' : '?'}evento=${encodeURIComponent(eventId)}` : url), [eventId]);

    const [list, setList] = useState<ListResponse | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [draft, setDraft] = useState({ title: '', description: '', maxSizeMb: 50 });
    const [saving, setSaving] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [note, setNote] = useState('');
    const [upload, setUpload] = useState<{ phase: 'idle' | 'presign' | 'put' | 'verify'; pct: number }>({ phase: 'idle', pct: 0 });
    const fileInput = useRef<HTMLInputElement | null>(null);

    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);
    const [filters, setFilters] = useState({ estado: 'all', club: '', distrito: '', proyecto: '', desde: '', hasta: '', version: '', q: '' });

    const resource = list?.resources.find(r => r.key === KEY) || null;
    const canConfig = !!list?.access.config;
    const canExport = !!list?.access.export;

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/recursos`), { headers: authHeaders() });
            const { data } = await leerJson<ListResponse & { error?: string }>(res);
            if (!res.ok || !data) throw new Error(data?.error || `No se pudo cargar la plantilla (HTTP ${res.status}).`);
            setList(data);
            const r = data.resources.find(x => x.key === KEY);
            if (r) setDraft({ title: r.title, description: r.description, maxSizeMb: r.maxSizeMb });
        } catch (e: any) {
            setLoadError(e?.message || 'No se pudo cargar la plantilla.');
        }
    }, [withEvento]);

    const analyticsQuery = useMemo(() => {
        const p = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'all') p.set(k, v); });
        return p.toString();
    }, [filters]);

    const loadAnalytics = useCallback(async () => {
        setAnalyticsError(null);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/recursos/${KEY}/analytics?${analyticsQuery}`), { headers: authHeaders() });
            const { data } = await leerJson<Analytics & { error?: string }>(res);
            if (!res.ok || !data) throw new Error(data?.error || `No se pudo cargar la analítica (HTTP ${res.status}).`);
            setAnalytics(data);
        } catch (e: any) {
            setAnalyticsError(e?.message || 'No se pudo cargar la analítica.');
        }
    }, [withEvento, analyticsQuery]);

    useEffect(() => { load(); }, [load]);
    // Los filtros de texto disparan la consulta con una pequeña espera.
    useEffect(() => {
        const t = setTimeout(loadAnalytics, 300);
        return () => clearTimeout(t);
    }, [loadAnalytics]);

    // ── Acciones ─────────────────────────────────────────────────────
    const save = async (patch: Partial<{ title: string; description: string; maxSizeMb: number; active: boolean }>, okText: string) => {
        setSaving(true);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/recursos/${KEY}`), {
                method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(patch),
            });
            const { data } = await leerJson<ResourceView & { error?: string }>(res);
            if (!res.ok) throw new Error(data?.error || `No se pudo guardar (HTTP ${res.status}).`);
            toast.success(okText);
            await load();
            loadAnalytics();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar.');
        } finally {
            setSaving(false);
        }
    };

    const uploadVersion = async () => {
        if (!file) return;
        try {
            setUpload({ phase: 'presign', pct: 0 });
            const pre = await fetch(withEvento(`${API}/project-fair/admin/recursos/${KEY}/presign`), {
                method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ filename: file.name, size: file.size }),
            });
            const { data: signed } = await leerJson<{ storageKey?: string; uploadUrl?: string; contentType?: string; error?: string }>(pre);
            if (!pre.ok || !signed?.uploadUrl || !signed.storageKey) throw new Error(signed?.error || `No se pudo preparar la subida (HTTP ${pre.status}).`);

            setUpload({ phase: 'put', pct: 0 });
            await putWithProgress(signed.uploadUrl, file, signed.contentType || 'application/octet-stream', pct => setUpload({ phase: 'put', pct }));

            setUpload({ phase: 'verify', pct: 100 });
            const reg = await fetch(withEvento(`${API}/project-fair/admin/recursos/${KEY}/versions`), {
                method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ storageKey: signed.storageKey, filename: file.name, note }),
            });
            const { data: registered } = await leerJson<ResourceView & { error?: string }>(reg);
            if (!reg.ok) throw new Error(registered?.error || `No se pudo registrar la versión (HTTP ${reg.status}).`);

            toast.success(resource?.current ? 'Plantilla reemplazada: la nueva versión es la vigente.' : 'Plantilla cargada. Publícala para que los clubes la vean.');
            setFile(null); setNote('');
            if (fileInput.current) fileInput.current.value = '';
            await load();
            loadAnalytics();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo subir la plantilla.');
        } finally {
            setUpload({ phase: 'idle', pct: 0 });
        }
    };

    const downloadVersion = async (v: Version) => {
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/recursos/${KEY}/versions/${v.id}/download`), { headers: authHeaders() });
            const { data } = await leerJson<{ url?: string; error?: string }>(res);
            if (!res.ok || !data?.url) throw new Error(data?.error || `No se pudo descargar (HTTP ${res.status}).`);
            window.location.assign(data.url);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo descargar el archivo.');
        }
    };

    const exportCsv = async () => {
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/recursos/${KEY}/analytics.csv?${analyticsQuery}`), { headers: authHeaders() });
            if (!res.ok) throw new Error(`No se pudo exportar (HTTP ${res.status}).`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'descargas-plantilla-presentacion.csv';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo exportar.');
        }
    };

    const exportExcel = async () => {
        if (!analytics) return;
        try {
            const XLSX = await import('xlsx');
            const sheet = analytics.rows.map(r => ({
                Responsable: r.responsible, Correo: r.email, 'Club Rotario': r.clubName, Distrito: r.district,
                Proyecto: r.projectName, Código: r.publicRef, Postulación: r.eligible ? r.projectStateLabel : `${r.projectStateLabel} (no elegible)`,
                'Estado de descarga': r.deliveredCount > 0 ? 'Descargó' : 'No ha descargado', Descargas: r.deliveredCount,
                'Primera descarga': fmtDateTime(r.firstDeliveredAt), 'Última descarga': fmtDateTime(r.lastDeliveredAt),
                'Versión descargada': r.lastVersionNumber ? `v${r.lastVersionNumber}` : '', 'Intentos fallidos': r.failedCount,
            }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), 'Descargas');
            XLSX.writeFile(wb, 'descargas-plantilla-presentacion.xlsx');
        } catch {
            toast.error('No se pudo generar el Excel.');
        }
    };

    const setFilter = (k: keyof typeof filters, v: string) => setFilters(f => ({ ...f, [k]: v }));

    // ── Render ───────────────────────────────────────────────────────
    if (loadError) {
        return (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertTriangle size={16} /> {loadError}
                <button onClick={load} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw size={13} /> Reintentar</button>
            </div>
        );
    }
    if (!list || !resource) {
        return <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Cargando recursos…</div>;
    }

    const status = STATUS_META[resource.status];
    const busy = upload.phase !== 'idle';
    const dirty = draft.title !== resource.title || draft.description !== resource.description || Number(draft.maxSizeMb) !== resource.maxSizeMb;
    const k = analytics?.kpis;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-slate-900">Recursos y plantillas</h2>
                <p className="text-sm text-slate-500">
                    La plantilla publicada aquí es la que descargan los clubes desde «Mi proyecto». Reemplazarla crea una versión
                    nueva: la anterior y sus descargas se conservan.
                </p>
            </div>

            {/* ── La plantilla ─────────────────────────────────────── */}
            <Card title="Plantilla oficial de presentación de proyectos" icon={FileDown}
                right={<span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${status.cls}`}>{status.label}</span>}>
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-3">
                        <Field label="Título que ve el club">
                            <input className={inputCls} value={draft.title} disabled={!canConfig} maxLength={160}
                                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
                        </Field>
                        <Field label="Descripción">
                            <textarea className={inputCls} rows={4} value={draft.description} disabled={!canConfig} maxLength={600}
                                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
                        </Field>
                        <Field label="Tamaño máximo del archivo (MB)" hint={`Entre ${list.limits.min} y ${list.limits.max} MB.`}>
                            <input type="number" className={inputCls} min={list.limits.min} max={list.limits.max} value={draft.maxSizeMb} disabled={!canConfig}
                                onChange={e => setDraft(d => ({ ...d, maxSizeMb: Number(e.target.value) }))} />
                        </Field>
                        {canConfig && (
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => save({ title: draft.title, description: draft.description, maxSizeMb: Number(draft.maxSizeMb) }, 'Cambios guardados.')}
                                    disabled={!dirty || saving}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: BLUE }}>
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar cambios
                                </button>
                                {resource.current && (
                                    resource.active ? (
                                        <button onClick={() => save({ active: false }, 'Plantilla desactivada: los clubes verán «disponible próximamente».')} disabled={saving}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50">
                                            <EyeOff size={14} /> Desactivar
                                        </button>
                                    ) : (
                                        <button onClick={() => save({ active: true }, 'Plantilla publicada en «Mi proyecto».')} disabled={saving}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                                            <Eye size={14} /> Publicar en «Mi proyecto»
                                        </button>
                                    )
                                )}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        {resource.current ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Archivo vigente</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2"><Info k="Nombre del archivo" v={resource.current.fileName} /></div>
                                    <Info k="Formato" v={resource.current.formatLabel} />
                                    <Info k="Tamaño" v={fmtBytes(resource.current.sizeBytes)} />
                                    <Info k="Versión" v={`v${resource.current.number}`} />
                                    <Info k="Publicada" v={fmtDateTime(resource.current.publishedAt)} />
                                    <div className="col-span-2"><Info k="Cargada por" v={resource.current.publishedBy || '—'} /></div>
                                </div>
                                <button onClick={() => downloadVersion(resource.current!)}
                                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                    <Download size={14} /> Descargar el archivo publicado
                                </button>
                            </div>
                        ) : (
                            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                                Todavía no hay archivo. Los clubes ven «La plantilla oficial estará disponible próximamente».
                            </p>
                        )}

                        {canConfig && (
                            <div className="rounded-xl border border-slate-200 p-4">
                                <p className="mb-2 text-sm font-bold text-slate-800">{resource.current ? 'Reemplazar por una versión actualizada' : 'Subir la plantilla oficial'}</p>
                                <p className="mb-3 text-xs text-slate-500">PowerPoint (PPTX) o PDF, hasta {resource.maxSizeMb} MB. Se comprueba el tipo real del archivo, no sólo su extensión.</p>
                                <input ref={fileInput} type="file" accept={list.accept} disabled={busy}
                                    onChange={e => setFile(e.target.files?.[0] || null)}
                                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold" />
                                {file && <p className="mt-2 break-words text-xs text-slate-500">{file.name} · {fmtBytes(file.size)}</p>}
                                <input className={`${inputCls} mt-3`} placeholder="Nota de la versión (opcional): qué cambió" value={note} maxLength={300}
                                    disabled={busy} onChange={e => setNote(e.target.value)} />
                                {busy && (
                                    <div className="mt-3">
                                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                                            <div className="h-full rounded-full transition-all" style={{ width: `${upload.phase === 'put' ? upload.pct : upload.phase === 'verify' ? 100 : 5}%`, background: BLUE }} />
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {upload.phase === 'presign' ? 'Preparando la subida…' : upload.phase === 'put' ? `Subiendo… ${upload.pct}%` : 'Verificando el archivo…'}
                                        </p>
                                    </div>
                                )}
                                <button onClick={uploadVersion} disabled={!file || busy}
                                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: BLUE }}>
                                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                    {resource.current ? 'Subir versión nueva' : 'Subir plantilla'}
                                </button>
                                {resource.current && resource.active && (
                                    <p className="mt-2 text-[11px] text-slate-500">La versión nueva queda vigente y publicada en cuanto termine de subir.</p>
                                )}
                            </div>
                        )}
                        {!canConfig && (
                            <p className="text-xs text-slate-500">Tu perfil puede consultar la plantilla y sus estadísticas, pero no modificarla.</p>
                        )}
                    </div>
                </div>
            </Card>

            {/* ── Historial de versiones ───────────────────────────── */}
            <Card title="Historial de versiones" icon={History}>
                {resource.versions.length === 0 ? (
                    <p className="text-sm text-slate-500">Sin versiones todavía.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                                    <th className="py-2 pr-3">Versión</th><th className="py-2 pr-3">Archivo</th><th className="py-2 pr-3">Formato</th>
                                    <th className="py-2 pr-3">Tamaño</th><th className="py-2 pr-3">Publicada</th><th className="py-2 pr-3">Por</th>
                                    <th className="py-2 pr-3 text-right">Descargas</th><th className="py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {resource.versions.map(v => (
                                    <tr key={v.id} className="border-b border-slate-100 align-top">
                                        <td className="py-2 pr-3 font-semibold">v{v.number}{v.current && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Vigente</span>}</td>
                                        <td className="max-w-[240px] break-words py-2 pr-3">{v.fileName}{v.note && <span className="block text-xs text-slate-500">{v.note}</span>}</td>
                                        <td className="py-2 pr-3">{v.formatLabel}</td>
                                        <td className="py-2 pr-3">{fmtBytes(v.sizeBytes)}</td>
                                        <td className="py-2 pr-3">{fmtDateTime(v.publishedAt)}</td>
                                        <td className="py-2 pr-3">{v.publishedBy || '—'}</td>
                                        <td className="py-2 pr-3 text-right font-semibold">{v.deliveredCount}</td>
                                        <td className="py-2 text-right">
                                            <button onClick={() => downloadVersion(v)} title="Descargar esta versión" className="text-slate-500 hover:text-slate-800"><Download size={15} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {resource.history.length > 0 && (
                    <details className="mt-4 text-sm">
                        <summary className="cursor-pointer font-semibold text-slate-700">Registro de cambios ({resource.history.length})</summary>
                        <ul className="mt-2 space-y-1.5">
                            {resource.history.map(h => (
                                <li key={h.id} className="text-slate-600">
                                    <span className="font-semibold text-slate-800">{h.title}</span>
                                    {h.detail && <span> · {h.detail}</span>}
                                    <span className="text-xs text-slate-400"> · {h.actorName || 'Sistema'} · {fmtDateTime(h.createdAt)}</span>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
            </Card>

            {/* ── Analítica ────────────────────────────────────────── */}
            <Card title="Analítica de descargas de plantillas" icon={BarChart3}
                right={
                    <button onClick={loadAnalytics} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
                        <RefreshCw size={13} /> Actualizar
                    </button>
                }>
                {analyticsError && (
                    <p className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><AlertTriangle size={14} /> {analyticsError}</p>
                )}
                {!analytics ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Cargando analítica…</div>
                ) : !analytics.exists ? (
                    <p className="text-sm text-slate-500">La analítica aparece cuando la plantilla esté cargada.</p>
                ) : (
                    <AnalyticsBody analytics={analytics} k={k!} filters={filters} setFilter={setFilter}
                        canExport={canExport} onCsv={exportCsv} onExcel={exportExcel} />
                )}
            </Card>
        </div>
    );
};

/**
 * Indicadores, adopción, distritos, evolución y la tabla de seguimiento. En el
 * ámbito del módulo, como todo lo de este archivo.
 */
const AnalyticsBody = ({ analytics, k, filters, setFilter, canExport, onCsv, onExcel }: {
    analytics: Analytics; k: Kpis;
    filters: { estado: string; club: string; distrito: string; proyecto: string; desde: string; hasta: string; version: string; q: string };
    setFilter: (k: 'estado' | 'club' | 'distrito' | 'proyecto' | 'desde' | 'hasta' | 'version' | 'q', v: string) => void;
    canExport: boolean; onCsv: () => void; onExcel: () => void;
}) => (
    <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi label="Usuarios únicos que descargaron" value={k.uniqueUsers} />
            <Kpi label="Proyectos con descarga" value={`${k.projectsWithDownload} de ${k.eligibleProjects}`} sub="Proyectos postulados con al menos una entrega" />
            <Kpi label="Descargas exitosas" value={k.totalDelivered} sub={k.totalFailed ? `${k.totalFailed} intento(s) fallido(s), no contados` : 'Sin intentos fallidos'} />
            <Kpi label="Aún no han descargado" value={k.pendingProjects} sub={`${k.clubsPending} club(es) pendiente(s) · ${k.clubsWithDownload} con descarga`} />
            <Kpi label="Última descarga" value={<span className="text-base">{fmtDateTime(k.lastDeliveredAt)}</span>} />
            <Kpi label="Versión actual" value={analytics.currentVersion ? `v${analytics.currentVersion}` : '—'} sub={analytics.active ? 'Publicada' : 'Sin publicar'} />
        </div>

        {/* Adopción: un solo número con su medidor. */}
        <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-slate-700">Adopción de la plantilla</p>
                <p className="text-xl font-bold text-slate-900">{fmtPct(k.adoptionPct)}</p>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={k.adoptionPct} aria-label="Adopción de la plantilla">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, k.adoptionPct)}%`, background: BLUE }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
                Proyectos postulados (no archivados) con al menos una descarga entregada ÷ total de proyectos postulados. Los indicadores respetan el rango de fechas y la versión elegidos abajo.
            </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">Descargas por distrito</p>
                {analytics.byDistrict.length === 0 ? <p className="text-sm text-slate-500">Sin proyectos postulados.</p> : (
                    <table className="w-full text-sm">
                        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="py-1">Distrito</th><th className="py-1 text-right">Proyectos</th><th className="py-1 text-right">Con descarga</th><th className="py-1 text-right">Adopción</th></tr></thead>
                        <tbody>
                            {analytics.byDistrict.map(d => (
                                <tr key={d.district} className="border-t border-slate-100">
                                    <td className="py-1.5">{d.district}</td><td className="py-1.5 text-right">{d.eligible}</td>
                                    <td className="py-1.5 text-right">{d.withDownload}</td><td className="py-1.5 text-right font-semibold">{fmtPct(d.adoptionPct)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">Descargas entregadas por día</p>
                {analytics.timeline.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay descargas.</p> : (
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analytics.timeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="day" tickFormatter={fmtDayShort} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: '#f1f5f9' }} labelFormatter={(d: any) => fmtDayShort(String(d))}
                                    formatter={(v: any, name: any) => [v, name === 'delivered' ? 'Descargas' : 'Proyectos']} />
                                <Bar dataKey="delivered" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>

        {/* Seguimiento */}
        <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Users size={15} /> Seguimiento por proyecto</p>
                {canExport && (
                    <div className="flex gap-2">
                        <button onClick={onCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download size={13} /> CSV</button>
                        <button onClick={onExcel} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={13} /> Excel</button>
                    </div>
                )}
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
                {analytics.filters.map(f => (
                    <button key={f.key} onClick={() => setFilter('estado', f.key)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${filters.estado === f.key ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        style={filters.estado === f.key ? { background: BLUE } : undefined}>
                        {f.label}
                    </button>
                ))}
            </div>
            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative sm:col-span-2">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input className={`${inputCls} pl-8`} placeholder="Buscar por nombre, correo, club o proyecto" value={filters.q} onChange={e => setFilter('q', e.target.value)} />
                </div>
                <select className={inputCls} value={filters.club} onChange={e => setFilter('club', e.target.value)}>
                    <option value="">Todos los clubes</option>
                    {analytics.clubs.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className={inputCls} value={filters.distrito} onChange={e => setFilter('distrito', e.target.value)}>
                    <option value="">Todos los distritos</option>
                    {analytics.districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <input className={inputCls} placeholder="Proyecto" value={filters.proyecto} onChange={e => setFilter('proyecto', e.target.value)} />
                <select className={inputCls} value={filters.version} onChange={e => setFilter('version', e.target.value)}>
                    <option value="">Todas las versiones</option>
                    {analytics.versions.map(v => <option key={v} value={String(v)}>Versión {v}</option>)}
                </select>
                <input type="date" className={inputCls} value={filters.desde} onChange={e => setFilter('desde', e.target.value)} aria-label="Desde" title="Desde" />
                <input type="date" className={inputCls} value={filters.hasta} onChange={e => setFilter('hasta', e.target.value)} aria-label="Hasta" title="Hasta" />
            </div>

            <p className="mb-2 text-xs text-slate-500">{analytics.rows.length} de {analytics.total} proyecto(s)</p>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                            <th className="py-2 pr-3">Usuario responsable</th><th className="py-2 pr-3">Club rotario</th><th className="py-2 pr-3">Distrito</th>
                            <th className="py-2 pr-3">Proyecto</th><th className="py-2 pr-3">Estado de descarga</th><th className="py-2 pr-3 text-right">Descargas</th>
                            <th className="py-2 pr-3">Primera</th><th className="py-2 pr-3">Última</th><th className="py-2">Versión</th>
                        </tr>
                    </thead>
                    <tbody>
                        {analytics.rows.map(r => (
                            <tr key={r.submissionId} className="border-b border-slate-100 align-top">
                                <td className="py-2 pr-3"><span className="font-semibold text-slate-800">{r.responsible || '—'}</span><span className="block break-all text-xs text-slate-500">{r.email}</span></td>
                                <td className="py-2 pr-3">{r.clubName || '—'}</td>
                                <td className="py-2 pr-3">{r.district || '—'}</td>
                                <td className="max-w-[220px] py-2 pr-3"><span className="break-words">{r.projectName || '—'}</span><span className="block text-xs text-slate-400">{r.publicRef}{!r.eligible ? ` · ${r.projectStateLabel}` : ''}</span></td>
                                <td className="py-2 pr-3">
                                    {r.deliveredCount > 0
                                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Descargó</span>
                                        : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">No ha descargado</span>}
                                    {r.failedCount > 0 && <span className="mt-1 block text-[11px] text-red-600">{r.failedCount} intento(s) fallido(s)</span>}
                                </td>
                                <td className="py-2 pr-3 text-right font-semibold">{r.deliveredCount}</td>
                                <td className="py-2 pr-3 text-xs">{fmtDateTime(r.firstDeliveredAt)}</td>
                                <td className="py-2 pr-3 text-xs">{fmtDateTime(r.lastDeliveredAt)}</td>
                                <td className="py-2 text-xs">{r.lastVersionNumber ? `v${r.lastVersionNumber}` : '—'}</td>
                            </tr>
                        ))}
                        {analytics.rows.length === 0 && (
                            <tr><td colSpan={9} className="py-6 text-center text-sm text-slate-400">Ningún proyecto coincide con los filtros.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
);

export default RecursosPlantillas;
