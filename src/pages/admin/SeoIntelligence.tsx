import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Search, RefreshCw, AlertTriangle, Zap, Check, X, Loader2, FileText,
    KeyRound, Settings, Gauge, TrendingUp, TrendingDown, Minus, Sparkles,
    ExternalLink, Eye, ShieldCheck, Info, Plug,
} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    LIMITS, SEVERITY_LABEL, SEVERITY_STYLE, AXIS_LABEL, AXIS_HINT,
    PROVENANCE_LABEL, PROVENANCE_STYLE, INTEGRATION_LABEL, INTEGRATION_STYLE,
    KIND_LABEL, scoreTone, lengthState,
    type Severity, type Axis, type Provenance, type IntegrationState,
} from '../../lib/seoSpec';

// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente (AI SEO Engine) — v4.703
//
// Qué se puede hacer acá y por qué existe cada cosa:
//
//   · Tablero — la nota del sitio, su salud, la evolución y qué integraciones
//     están conectadas DE VERDAD. Un indicador que depende de Search Console y
//     no está conectado se muestra VACÍO con su motivo, no en cero: un cero es
//     una afirmación, un hueco es la verdad.
//   · Recomendaciones — los hallazgos de la auditoría, ordenados por impacto,
//     con "Aplicar" en los que el módulo puede resolver solo.
//   · Páginas — el inventario real del sitio, la vista previa de lo que se ve en
//     Google y en WhatsApp, y la edición manual. Lo editado a mano no lo pisa
//     la IA nunca.
//   · Palabras clave — con su procedencia a la vista.
//   · Configuración — lo global del sitio.
//
// TODOS los hooks van arriba del componente, antes de cualquier return: es la
// regla del proyecto tras la pantalla en blanco de v4.689.
// ════════════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token') || ''}`,
});

type Tab = 'dashboard' | 'issues' | 'pages' | 'keywords' | 'config';

interface Overview {
    club: { id: string; name: string; domain: string | null; subdomain: string | null };
    origin: string;
    audit: null | {
        id: string; score: number; healthScore: number;
        axisScores: Record<string, number>; pagesScanned: number;
        issuesCount: number; criticalCount: number;
        summary: any; notes: string[]; finishedAt: string; trigger: string;
    };
    delta: null | { score: number; healthScore: number; since: string };
    history: Array<{ date: string; score: number; healthScore: number; issues: number; critical: number }>;
    openIssues: { total: number; bySeverity: Record<string, number>; autoFixable: number };
    topKeywords: any[];
    autoMode: boolean;
    lastAuditAt: string | null;
    integrations: Record<string, any>;
}

interface Issue {
    id: string; path: string; code: string; axis: Axis; severity: Severity;
    impact: number; effort: string; autoFixable: boolean;
    evidence: any; recommendation: string | null; recommendationSource: 'ai' | 'rule';
    status: string; label: string;
}

interface PageRow {
    path: string; kind: string; label: string; priority: number;
    lastmod: string | null; hasOverride: boolean; source: string | null;
    title: string | null; description: string | null; indexable: boolean;
    issues: Array<{ code: string; severity: Severity }>;
    missingSlug?: boolean;
}

// ── Piezas de presentación (a nivel de módulo, nunca dentro de un .map) ──────

const ScoreDial: React.FC<{ value: number | null; label: string; hint?: string }> = ({ value, label, hint }) => (
    <div className="flex flex-col items-center justify-center p-5 bg-white rounded-xl border border-slate-200">
        <div className={`text-5xl font-bold tabular-nums ${scoreTone(value)}`}>
            {value == null ? '—' : value}
        </div>
        <div className="mt-1 text-sm font-medium text-slate-700">{label}</div>
        {hint && <div className="mt-1 text-xs text-slate-500 text-center max-w-[16rem]">{hint}</div>}
    </div>
);

const Delta: React.FC<{ value: number | undefined | null }> = ({ value }) => {
    if (value == null || value === 0) {
        return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Minus size={12} /> sin cambio</span>;
    }
    const up = value > 0;
    return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {up ? '+' : ''}{value}
        </span>
    );
};

/**
 * Un indicador que puede NO tener dato.
 *
 * Es la pieza que hace cumplir la regla del módulo en pantalla: cuando la
 * fuente no está conectada se muestra un guion y el motivo, jamás un 0.
 */
const Metric: React.FC<{
    label: string; value: number | string | null; provenance: Provenance; reason?: string | null; suffix?: string;
}> = ({ label, value, provenance, reason, suffix }) => (
    <div className="p-4 bg-white rounded-lg border border-slate-200">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">
            {value == null ? <span className="text-slate-300">—</span> : <>{value}{suffix}</>}
        </div>
        <div className="mt-2 flex items-center gap-2">
            <span className={`px-1.5 py-0.5 text-[10px] rounded border ${PROVENANCE_STYLE[provenance]}`}>
                {PROVENANCE_LABEL[provenance]}
            </span>
        </div>
        {value == null && reason && <div className="mt-1.5 text-[11px] text-slate-500 leading-snug">{reason}</div>}
    </div>
);

const AxisBar: React.FC<{ axis: Axis; score: number }> = ({ axis, score }) => (
    <div>
        <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-700">{AXIS_LABEL[axis]}</span>
            <span className={`text-sm font-semibold tabular-nums ${scoreTone(score)}`}>{score}</span>
        </div>
        <div className="mt-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
                className={`h-full rounded-full ${score >= 90 ? 'bg-emerald-500' : score >= 70 ? 'bg-lime-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.max(2, score)}%` }}
            />
        </div>
        <div className="mt-1 text-[11px] text-slate-500">{AXIS_HINT[axis]}</div>
    </div>
);

/** Barra de longitud de un campo. Verde dentro del rango, ámbar fuera. */
const LengthMeter: React.FC<{ value: string; range: { min: number; max: number } }> = ({ value, range }) => {
    const len = value?.length || 0;
    const state = lengthState(len, range);
    const tone = state === 'ok' ? 'text-emerald-600' : 'text-amber-600';
    return (
        <div className="flex items-center gap-2 text-xs">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={`h-full ${state === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, (len / range.max) * 100)}%` }}
                />
            </div>
            <span className={`tabular-nums ${tone}`}>{len}/{range.max}</span>
        </div>
    );
};

/** Vista previa del resultado en Google. */
const SerpPreview: React.FC<{ title: string; url: string; description: string }> = ({ title, url, description }) => (
    <div className="p-4 bg-white rounded-lg border border-slate-200 font-sans">
        <div className="text-xs text-slate-600 truncate">{url}</div>
        <div className="mt-0.5 text-[18px] leading-snug text-[#1a0dab] hover:underline cursor-default line-clamp-1">
            {title || 'Sin título'}
        </div>
        <div className="mt-0.5 text-[13px] leading-snug text-[#4d5156] line-clamp-2">
            {description || 'Sin descripción'}
        </div>
    </div>
);

/** Vista previa de la tarjeta al compartir (WhatsApp / Facebook). */
const SocialPreview: React.FC<{ title: string; description: string; image: string; host: string }> = ({ title, description, image, host }) => (
    <div className="rounded-lg overflow-hidden border border-slate-200 bg-white max-w-sm">
        {image
            ? <img src={image} alt="" className="w-full h-40 object-cover bg-slate-100" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            : <div className="w-full h-40 bg-slate-100 flex items-center justify-center text-xs text-slate-400">Sin imagen — el enlace se verá sin tarjeta</div>}
        <div className="p-3">
            <div className="text-sm font-semibold text-slate-800 line-clamp-2">{title || 'Sin título'}</div>
            <div className="mt-1 text-xs text-slate-600 line-clamp-2">{description}</div>
            <div className="mt-1.5 text-[11px] text-slate-400 uppercase tracking-wide">{host}</div>
        </div>
    </div>
);

// ════════════════════════════════════════════════════════════════════════════

const SeoIntelligence: React.FC = () => {
    const [tab, setTab] = useState<Tab>('dashboard');
    const [overview, setOverview] = useState<Overview | null>(null);
    const [issues, setIssues] = useState<Issue[]>([]);
    const [pages, setPages] = useState<PageRow[]>([]);
    const [pageNotes, setPageNotes] = useState<string[]>([]);
    const [keywords, setKeywords] = useState<any[]>([]);
    const [keywordNote, setKeywordNote] = useState<string | null>(null);
    const [config, setConfig] = useState<any>(null);
    const [integrations, setIntegrations] = useState<Record<string, any>>({});

    const [loading, setLoading] = useState(true);
    const [auditing, setAuditing] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [preview, setPreview] = useState<any>(null);
    const [draft, setDraft] = useState<{ title: string; description: string; image: string; keywords: string }>({
        title: '', description: '', image: '', keywords: '',
    });
    const [previewLoading, setPreviewLoading] = useState(false);

    const say = useCallback((kind: 'ok' | 'err', text: string) => {
        setToast({ kind, text });
        setTimeout(() => setToast(null), 6000);
    }, []);

    const call = useCallback(async (path: string, init?: RequestInit) => {
        const res = await fetch(`${API}/seo-engine${path}`, { headers: authHeaders(), ...init });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || body.detail || `Error ${res.status}`);
        return body;
    }, []);

    const loadOverview = useCallback(async () => {
        const data = await call('/overview');
        setOverview(data);
        setIntegrations(data.integrations || {});
    }, [call]);

    const loadIssues = useCallback(async () => setIssues(await call('/issues?status=open&limit=300')), [call]);
    const loadPages = useCallback(async () => {
        const data = await call('/pages');
        setPages(data.pages || []);
        setPageNotes(data.notes || []);
    }, [call]);
    const loadKeywords = useCallback(async () => setKeywords(await call('/keywords')), [call]);
    const loadConfig = useCallback(async () => {
        const data = await call('/config');
        setConfig(data.config);
        setIntegrations(data.integrations || {});
    }, [call]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                await loadOverview();
                if (alive) await loadIssues();
            } catch (e: any) {
                if (alive) say('err', e.message);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [loadOverview, loadIssues, say]);

    // Cada pestaña carga lo suyo la primera vez que se abre. Cargarlo todo al
    // entrar serían cinco consultas para ver una.
    useEffect(() => {
        (async () => {
            try {
                if (tab === 'pages' && !pages.length) await loadPages();
                if (tab === 'keywords' && !keywords.length) await loadKeywords();
                if (tab === 'config' && !config) await loadConfig();
            } catch (e: any) { say('err', e.message); }
        })();
    }, [tab, pages.length, keywords.length, config, loadPages, loadKeywords, loadConfig, say]);

    // La vista previa se pide al servidor y no se compone acá: tiene que ser
    // EXACTAMENTE lo que se va a servir, no una aproximación del navegador.
    useEffect(() => {
        if (!selectedPath) { setPreview(null); return; }
        let alive = true;
        setPreviewLoading(true);
        (async () => {
            try {
                const data = await call(`/pages/preview?path=${encodeURIComponent(selectedPath)}`);
                if (!alive) return;
                setPreview(data);
                setDraft({
                    title: data.override?.title || '',
                    description: data.override?.description || '',
                    image: data.override?.image || '',
                    keywords: (data.override?.keywords || []).join(', '),
                });
            } catch (e: any) {
                if (alive) say('err', e.message);
            } finally {
                if (alive) setPreviewLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [selectedPath, call, say]);

    const runAudit = useCallback(async () => {
        setAuditing(true);
        try {
            const out = await call('/audit', { method: 'POST', body: JSON.stringify({ trigger: 'manual' }) });
            say('ok', `Auditoría completa: ${out.pagesScanned} páginas, ${out.issuesCount} hallazgos (${out.criticalCount} críticos).`);
            await loadOverview();
            await loadIssues();
            if (pages.length) await loadPages();
        } catch (e: any) { say('err', e.message); }
        finally { setAuditing(false); }
    }, [call, say, loadOverview, loadIssues, loadPages, pages.length]);

    const applyIssue = useCallback(async (issue: Issue) => {
        setBusyId(issue.id);
        try {
            const out = await call(`/issues/${issue.id}/apply`, { method: 'POST' });
            if (out.applied) {
                say('ok', `Resuelto: ${issue.label}`);
                setIssues(prev => prev.filter(i => i.id !== issue.id));
                await loadOverview();
            } else {
                say('ok', out.message || 'Se propuso un cambio que requiere tu confirmación.');
            }
        } catch (e: any) { say('err', e.message); }
        finally { setBusyId(null); }
    }, [call, say, loadOverview]);

    const ignoreIssue = useCallback(async (issue: Issue) => {
        setBusyId(issue.id);
        try {
            await call(`/issues/${issue.id}/ignore`, { method: 'POST', body: JSON.stringify({ status: 'ignored' }) });
            setIssues(prev => prev.filter(i => i.id !== issue.id));
            await loadOverview();
        } catch (e: any) { say('err', e.message); }
        finally { setBusyId(null); }
    }, [call, say, loadOverview]);

    const generateMeta = useCallback(async () => {
        if (!selectedPath) return;
        setBusyId('generate');
        try {
            const out = await call('/pages/generate', { method: 'POST', body: JSON.stringify({ path: selectedPath }) });
            setDraft(d => ({
                ...d,
                title: out.proposal.title || d.title,
                description: out.proposal.description || d.description,
                keywords: (out.proposal.keywords || []).join(', ') || d.keywords,
            }));
            say('ok', 'Propuesta generada. Revisala y guardá si te sirve.');
        } catch (e: any) { say('err', e.message); }
        finally { setBusyId(null); }
    }, [call, say, selectedPath]);

    const savePage = useCallback(async () => {
        if (!selectedPath) return;
        setBusyId('save');
        try {
            await call('/pages', {
                method: 'PUT',
                body: JSON.stringify({
                    path: selectedPath,
                    kind: preview?.kind,
                    title: draft.title || null,
                    description: draft.description || null,
                    image: draft.image || null,
                    keywords: draft.keywords.split(',').map(s => s.trim()).filter(Boolean),
                }),
            });
            say('ok', 'Guardado. A partir de ahora la IA no lo sobrescribe.');
            const data = await call(`/pages/preview?path=${encodeURIComponent(selectedPath)}`);
            setPreview(data);
            await loadPages();
        } catch (e: any) { say('err', e.message); }
        finally { setBusyId(null); }
    }, [call, say, selectedPath, draft, preview, loadPages]);

    const suggestKeywords = useCallback(async () => {
        setBusyId('kw');
        try {
            const out = await call('/keywords/suggest', { method: 'POST', body: JSON.stringify({ save: true }) });
            setKeywordNote(out.disclaimer);
            await loadKeywords();
            say('ok', `${out.saved} términos guardados.`);
        } catch (e: any) { say('err', e.message); }
        finally { setBusyId(null); }
    }, [call, say, loadKeywords]);

    const saveConfig = useCallback(async (patch: any, autoMode?: boolean) => {
        setBusyId('config');
        try {
            const out = await call('/config', { method: 'PUT', body: JSON.stringify({ config: patch, autoMode }) });
            setConfig(out.config);
            say('ok', 'Configuración guardada.');
        } catch (e: any) { say('err', e.message); }
        finally { setBusyId(null); }
    }, [call, say]);

    const sortedIssues = useMemo(
        () => [...issues].sort((a, b) => b.impact - a.impact),
        [issues],
    );

    const host = useMemo(
        () => (overview?.origin || '').replace(/^https?:\/\//, ''),
        [overview],
    );

    // ── Pintado ──────────────────────────────────────────────────────────────
    const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
        { id: 'dashboard', label: 'Tablero', icon: <Gauge size={16} /> },
        { id: 'issues', label: `Recomendaciones${issues.length ? ` (${issues.length})` : ''}`, icon: <Sparkles size={16} /> },
        { id: 'pages', label: 'Páginas', icon: <FileText size={16} /> },
        { id: 'keywords', label: 'Palabras clave', icon: <KeyRound size={16} /> },
        { id: 'config', label: 'Configuración', icon: <Settings size={16} /> },
    ];

    return (
        <AdminLayout>
            <div className="p-6 max-w-7xl mx-auto">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Search className="text-sky-600" size={24} /> SEO Inteligente
                        </h1>
                        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
                            Analiza el sitio, encuentra lo que le impide posicionar y propone la corrección.
                            Los hallazgos se calculan sobre tu contenido; la IA los redacta y propone los textos.
                        </p>
                        {overview?.origin && (
                            <a href={overview.origin} target="_blank" rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 hover:underline">
                                {host} <ExternalLink size={11} />
                            </a>
                        )}
                    </div>
                    <button
                        onClick={runAudit}
                        disabled={auditing}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-60"
                    >
                        {auditing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        {auditing ? 'Analizando el sitio…' : 'Analizar ahora'}
                    </button>
                </div>

                {toast && (
                    <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-start gap-2 ${toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                        {toast.kind === 'ok' ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                        <span className="flex-1">{toast.text}</span>
                        <button onClick={() => setToast(null)}><X size={14} /></button>
                    </div>
                )}

                <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${tab === t.id ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            {t.icon}{t.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
                        <Loader2 className="animate-spin" size={18} /> Cargando módulo…
                    </div>
                ) : (
                    <>
                        {/* ── TABLERO ─────────────────────────────────────── */}
                        {tab === 'dashboard' && (
                            <div className="space-y-6">
                                {!overview?.audit && (
                                    <div className="p-5 bg-sky-50 border border-sky-200 rounded-xl text-sm text-sky-900">
                                        <div className="font-semibold flex items-center gap-2"><Info size={16} /> Todavía no se analizó este sitio.</div>
                                        <p className="mt-1">Pulsá «Analizar ahora». El módulo recorre las páginas publicadas, mide y te dice qué corregir. También se analiza solo cada día.</p>
                                    </div>
                                )}

                                {overview?.audit && (
                                    <>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div className="relative">
                                                <ScoreDial value={overview.audit.score} label="Nota SEO" hint="Qué tan optimizado está el sitio." />
                                                <div className="absolute top-3 right-3"><Delta value={overview.delta?.score} /></div>
                                            </div>
                                            <div className="relative">
                                                <ScoreDial value={overview.audit.healthScore} label="Salud" hint="Qué tan roto está. Responde otra pregunta que la nota." />
                                                <div className="absolute top-3 right-3"><Delta value={overview.delta?.healthScore} /></div>
                                            </div>
                                            <ScoreDial value={overview.audit.pagesScanned} label="Páginas analizadas" hint="Sólo se auditan las indexables." />
                                            <ScoreDial value={overview.openIssues.total} label="Hallazgos abiertos" hint={`${overview.openIssues.autoFixable} con arreglo automático.`} />
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            <div className="p-5 bg-white rounded-xl border border-slate-200">
                                                <h3 className="text-sm font-semibold text-slate-800 mb-4">Nota por eje</h3>
                                                <div className="space-y-4">
                                                    {(Object.keys(AXIS_LABEL) as Axis[]).map(axis => (
                                                        <AxisBar key={axis} axis={axis} score={overview.audit!.axisScores[axis] ?? 0} />
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="p-5 bg-white rounded-xl border border-slate-200">
                                                <h3 className="text-sm font-semibold text-slate-800 mb-1">Datos de buscadores</h3>
                                                <p className="text-xs text-slate-500 mb-4">
                                                    Impresiones, clics, CTR y posición sólo existen conectando Search Console.
                                                    El módulo no los estima: no hay forma honesta de hacerlo.
                                                </p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <Metric label="Impresiones" value={null} provenance="unavailable"
                                                        reason={integrations.search_console?.reason || 'Search Console no está conectado.'} />
                                                    <Metric label="Clics" value={null} provenance="unavailable"
                                                        reason={integrations.search_console?.reason || 'Search Console no está conectado.'} />
                                                    <Metric label="CTR" value={null} provenance="unavailable"
                                                        reason={integrations.search_console?.reason || 'Search Console no está conectado.'} />
                                                    <Metric label="Posición media" value={null} provenance="unavailable"
                                                        reason={integrations.search_console?.reason || 'Search Console no está conectado.'} />
                                                </div>
                                            </div>
                                        </div>

                                        {overview.history.length > 1 && (
                                            <div className="p-5 bg-white rounded-xl border border-slate-200">
                                                <h3 className="text-sm font-semibold text-slate-800 mb-4">Evolución</h3>
                                                <div className="flex items-end gap-1 h-28">
                                                    {overview.history.map((h, i) => (
                                                        <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
                                                            <div
                                                                className={`w-full rounded-t ${h.score >= 90 ? 'bg-emerald-400' : h.score >= 70 ? 'bg-lime-400' : h.score >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                                                                style={{ height: `${Math.max(3, h.score)}%` }}
                                                            />
                                                            <div className="absolute -top-7 hidden group-hover:block bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
                                                                {h.score} · {new Date(h.date).toLocaleDateString('es-CO')}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {overview.audit.notes?.length > 0 && (
                                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                                <div className="text-xs font-semibold text-amber-900 mb-1">Alcance de este análisis</div>
                                                <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
                                                    {overview.audit.notes.map((n, i) => <li key={i}>{n}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="p-5 bg-white rounded-xl border border-slate-200">
                                    <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
                                        <Plug size={15} /> Integraciones
                                    </h3>
                                    <p className="text-xs text-slate-500 mb-4">
                                        Una integración sin conectar se muestra como tal. Nunca se rellena su indicador con ceros.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {Object.values(integrations).map((it: any) => (
                                            <div key={it.key} className="p-3 border border-slate-200 rounded-lg">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-medium text-slate-800">{it.label}</span>
                                                    <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${INTEGRATION_STYLE[it.state as IntegrationState]}`}>
                                                        {INTEGRATION_LABEL[it.state as IntegrationState]}
                                                    </span>
                                                </div>
                                                <div className="mt-1 text-[11px] text-slate-500">{it.provides?.join(' · ')}</div>
                                                {it.reason && <div className="mt-1 text-[11px] text-slate-500">{it.reason}</div>}
                                                {it.note && <div className="mt-1 text-[11px] text-slate-400 italic">{it.note}</div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── RECOMENDACIONES ─────────────────────────────── */}
                        {tab === 'issues' && (
                            <div className="space-y-3">
                                {!sortedIssues.length && (
                                    <div className="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                                        <ShieldCheck size={32} className="mx-auto mb-2 text-emerald-500" />
                                        No hay hallazgos abiertos. Si todavía no analizaste el sitio, pulsá «Analizar ahora».
                                    </div>
                                )}
                                {sortedIssues.map(issue => (
                                    <div key={issue.id} className="p-4 bg-white rounded-xl border border-slate-200">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded border ${SEVERITY_STYLE[issue.severity]}`}>
                                                        {SEVERITY_LABEL[issue.severity]}
                                                    </span>
                                                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                                        {AXIS_LABEL[issue.axis]}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400">impacto {issue.impact}</span>
                                                    {issue.autoFixable && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                                                            arreglo automático
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1.5 font-medium text-slate-800">{issue.label}</div>
                                                <button
                                                    onClick={() => { setSelectedPath(issue.path); setTab('pages'); }}
                                                    className="mt-0.5 text-xs text-sky-600 hover:underline font-mono"
                                                >
                                                    {issue.path}
                                                </button>
                                                {issue.recommendation && (
                                                    <p className="mt-2 text-sm text-slate-600 leading-snug">
                                                        {issue.recommendation}
                                                        {issue.recommendationSource === 'rule' && (
                                                            <span className="ml-1 text-[10px] text-slate-400">(texto de la regla; la IA no redactó éste)</span>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {issue.autoFixable && (
                                                    <button
                                                        onClick={() => applyIssue(issue)}
                                                        disabled={busyId === issue.id}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-medium hover:bg-sky-700 disabled:opacity-60"
                                                    >
                                                        {busyId === issue.id ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                                                        Aplicar
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => ignoreIssue(issue)}
                                                    disabled={busyId === issue.id}
                                                    className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-50 disabled:opacity-60"
                                                >
                                                    Descartar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── PÁGINAS ─────────────────────────────────────── */}
                        {tab === 'pages' && (
                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_1fr] gap-6">
                                <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
                                    {pageNotes.map((n, i) => (
                                        <div key={i} className="p-2 mb-2 text-[11px] bg-amber-50 border border-amber-200 rounded text-amber-800">{n}</div>
                                    ))}
                                    {pages.map(p => (
                                        <button
                                            key={p.path}
                                            onClick={() => setSelectedPath(p.path)}
                                            className={`w-full text-left px-3 py-2 rounded-lg border transition ${selectedPath === p.path ? 'bg-sky-50 border-sky-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-mono text-slate-700 truncate">{p.path}</span>
                                                {p.issues.length > 0 && (
                                                    <span className="text-[10px] px-1.5 rounded-full bg-red-100 text-red-700 shrink-0">{p.issues.length}</span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                                                <span>{KIND_LABEL[p.kind] || p.kind}</span>
                                                {p.source === 'manual' && <span className="px-1 rounded bg-amber-100 text-amber-800">manual</span>}
                                                {p.source === 'ai' && <span className="px-1 rounded bg-violet-100 text-violet-800">IA</span>}
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                <div>
                                    {!selectedPath && (
                                        <div className="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                                            <Eye size={28} className="mx-auto mb-2 text-slate-300" />
                                            Elegí una página para ver cómo se muestra en Google y al compartirla.
                                        </div>
                                    )}
                                    {selectedPath && previewLoading && (
                                        <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
                                            <Loader2 className="animate-spin" size={16} /> Resolviendo la página…
                                        </div>
                                    )}
                                    {selectedPath && preview && !previewLoading && (
                                        <div className="space-y-5">
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                <div>
                                                    <div className="text-xs font-semibold text-slate-600 mb-2">Cómo se ve en Google</div>
                                                    <SerpPreview title={preview.meta.title} url={preview.meta.canonical} description={preview.meta.description} />
                                                </div>
                                                <div>
                                                    <div className="text-xs font-semibold text-slate-600 mb-2">Cómo se ve al compartir</div>
                                                    <SocialPreview
                                                        title={preview.meta.socialTitle || preview.meta.title}
                                                        description={preview.meta.description}
                                                        image={preview.meta.image}
                                                        host={host}
                                                    />
                                                </div>
                                            </div>

                                            <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <h3 className="text-sm font-semibold text-slate-800">Metadatos de esta página</h3>
                                                    <button
                                                        onClick={generateMeta}
                                                        disabled={busyId === 'generate'}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-violet-200 bg-violet-50 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-100 disabled:opacity-60"
                                                    >
                                                        {busyId === 'generate' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                                        Proponer con IA
                                                    </button>
                                                </div>

                                                {preview.override?.source === 'manual' && (
                                                    <div className="px-3 py-2 text-[11px] bg-amber-50 border border-amber-200 rounded text-amber-800">
                                                        Editado a mano. El análisis automático no lo sobrescribe.
                                                    </div>
                                                )}

                                                <div>
                                                    <label className="text-xs font-medium text-slate-600">Título SEO</label>
                                                    <input
                                                        value={draft.title}
                                                        onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                                                        placeholder={preview.meta.title}
                                                        className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                    />
                                                    <div className="mt-1"><LengthMeter value={draft.title || preview.meta.title} range={LIMITS.title} /></div>
                                                </div>

                                                <div>
                                                    <label className="text-xs font-medium text-slate-600">Meta descripción</label>
                                                    <textarea
                                                        value={draft.description}
                                                        onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                                                        placeholder={preview.meta.description}
                                                        rows={3}
                                                        className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                    />
                                                    <div className="mt-1"><LengthMeter value={draft.description || preview.meta.description} range={LIMITS.description} /></div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-600">Imagen al compartir</label>
                                                        <input
                                                            value={draft.image}
                                                            onChange={e => setDraft(d => ({ ...d, image: e.target.value }))}
                                                            placeholder={preview.meta.image || 'URL de la imagen'}
                                                            className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-600">Palabras clave (separadas por coma)</label>
                                                        <input
                                                            value={draft.keywords}
                                                            onChange={e => setDraft(d => ({ ...d, keywords: e.target.value }))}
                                                            className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={savePage}
                                                        disabled={busyId === 'save'}
                                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-60"
                                                    >
                                                        {busyId === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                        Guardar
                                                    </button>
                                                    <a
                                                        href={preview.meta.canonical}
                                                        target="_blank" rel="noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                                                    >
                                                        Ver la página <ExternalLink size={13} />
                                                    </a>
                                                </div>
                                            </div>

                                            {preview.jsonLd && (
                                                <details className="p-4 bg-white rounded-xl border border-slate-200">
                                                    <summary className="text-sm font-semibold text-slate-800 cursor-pointer">
                                                        Datos estructurados que se publican
                                                    </summary>
                                                    <pre className="mt-3 text-[11px] bg-slate-50 p-3 rounded overflow-x-auto text-slate-700">
                                                        {JSON.stringify(preview.jsonLd, null, 2)}
                                                    </pre>
                                                </details>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── PALABRAS CLAVE ──────────────────────────────── */}
                        {tab === 'keywords' && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-sm text-slate-600 max-w-2xl">
                                        Términos por los que este sitio debería encontrarse.
                                    </p>
                                    <button
                                        onClick={suggestKeywords}
                                        disabled={busyId === 'kw'}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 border border-violet-200 bg-violet-50 text-violet-700 rounded-lg text-sm font-medium hover:bg-violet-100 disabled:opacity-60"
                                    >
                                        {busyId === 'kw' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                        Proponer con IA
                                    </button>
                                </div>

                                <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-900 flex gap-2">
                                    <Info size={14} className="shrink-0 mt-0.5" />
                                    <span>
                                        {keywordNote || 'El volumen y la dificultad son estimaciones de un modelo, no datos de un proveedor de SEO. Las cifras reales de impresiones, clics y posición sólo llegan conectando Search Console.'}
                                    </span>
                                </div>

                                <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-slate-600">
                                            <tr>
                                                <th className="text-left px-4 py-2 font-medium">Término</th>
                                                <th className="text-left px-4 py-2 font-medium">Tipo</th>
                                                <th className="text-left px-4 py-2 font-medium">Intención</th>
                                                <th className="text-right px-4 py-2 font-medium">Volumen</th>
                                                <th className="text-right px-4 py-2 font-medium">Dificultad</th>
                                                <th className="text-left px-4 py-2 font-medium">Página objetivo</th>
                                                <th className="text-left px-4 py-2 font-medium">Origen</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {!keywords.length && (
                                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                                                    Todavía no hay términos. Pulsá «Proponer con IA».
                                                </td></tr>
                                            )}
                                            {keywords.map(k => (
                                                <tr key={k.id}>
                                                    <td className="px-4 py-2 font-medium text-slate-800">{k.keyword}</td>
                                                    <td className="px-4 py-2 text-slate-600">{k.kind}</td>
                                                    <td className="px-4 py-2 text-slate-600">{k.intent || '—'}</td>
                                                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                                                        {k.volume == null ? <span className="text-slate-300">—</span> : k.volume}
                                                    </td>
                                                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                                                        {k.difficulty == null ? <span className="text-slate-300">—</span> : k.difficulty}
                                                    </td>
                                                    <td className="px-4 py-2 text-xs font-mono text-slate-500">{k.targetPath || '—'}</td>
                                                    <td className="px-4 py-2">
                                                        <span className={`px-1.5 py-0.5 text-[10px] rounded border ${PROVENANCE_STYLE[(k.provenance || 'estimated') as Provenance]}`}>
                                                            {PROVENANCE_LABEL[(k.provenance || 'estimated') as Provenance]}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ── CONFIGURACIÓN ───────────────────────────────── */}
                        {tab === 'config' && config && (
                            <div className="space-y-5 max-w-3xl">
                                <div className="p-5 bg-white rounded-xl border border-slate-200">
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config.autoMode !== false}
                                            onChange={e => saveConfig({}, e.target.checked)}
                                            className="mt-1"
                                        />
                                        <span>
                                            <span className="text-sm font-medium text-slate-800">Análisis automático</span>
                                            <span className="block text-xs text-slate-500 mt-0.5">
                                                El sitio se revisa solo una vez al día y los hallazgos aparecen acá.
                                                El módulo no publica nada por su cuenta: propone.
                                            </span>
                                        </span>
                                    </label>
                                </div>

                                <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-800">Identidad del sitio</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Imagen por defecto al compartir</label>
                                            <input
                                                defaultValue={config.defaultImage || ''}
                                                onBlur={e => saveConfig({ defaultImage: e.target.value || null })}
                                                placeholder="URL de una imagen 1200×630"
                                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                            />
                                            <p className="mt-1 text-[11px] text-slate-500">Se usa cuando la página no tiene imagen propia.</p>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Palabras clave principales</label>
                                            <input
                                                defaultValue={(config.keywords || []).join(', ')}
                                                onBlur={e => saveConfig({ keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Idioma del contenido</label>
                                            <input
                                                defaultValue={config.language || 'es-CO'}
                                                onBlur={e => saveConfig({ language: e.target.value })}
                                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Usuario de X / Twitter</label>
                                            <input
                                                defaultValue={config.twitterHandle || ''}
                                                onBlur={e => saveConfig({ twitterHandle: e.target.value || null })}
                                                placeholder="@organizacion"
                                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-800">SEO local</h3>
                                    <p className="text-xs text-slate-500">
                                        Se publica como datos estructurados sólo si está completo. Un dato inventado en el JSON-LD
                                        es peor que uno ausente: Google penaliza el desajuste con lo que se ve en la página.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Dirección</label>
                                            <input defaultValue={config.streetAddress || ''} onBlur={e => saveConfig({ streetAddress: e.target.value || null })}
                                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Teléfono</label>
                                            <input defaultValue={config.phone || ''} onBlur={e => saveConfig({ phone: e.target.value || null })}
                                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Correo de contacto</label>
                                            <input defaultValue={config.email || ''} onBlur={e => saveConfig({ email: e.target.value || null })}
                                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">NIT</label>
                                            <input defaultValue={config.taxId || ''} onBlur={e => saveConfig({ taxId: e.target.value || null })}
                                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Latitud</label>
                                            <input defaultValue={config.lat ?? ''} onBlur={e => saveConfig({ lat: e.target.value ? Number(e.target.value) : null })}
                                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Longitud</label>
                                            <input defaultValue={config.lng ?? ''} onBlur={e => saveConfig({ lng: e.target.value ? Number(e.target.value) : null })}
                                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-3">
                                    <h3 className="text-sm font-semibold text-slate-800">Perfiles oficiales</h3>
                                    <p className="text-xs text-slate-500">
                                        Una dirección por línea. Es lo que ata el sitio a sus redes a ojos del buscador.
                                    </p>
                                    <textarea
                                        defaultValue={(config.socialProfiles || []).join('\n')}
                                        onBlur={e => saveConfig({ socialProfiles: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                                        rows={4}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                                    />
                                </div>

                                <div className="p-5 bg-white rounded-xl border border-slate-200 space-y-3">
                                    <h3 className="text-sm font-semibold text-slate-800">Reglas extra de robots.txt</h3>
                                    <p className="text-xs text-slate-500">
                                        Se añaden al archivo que genera la plataforma. Las reglas con <code>#</code> no bloquean
                                        nada: el navegador nunca manda el fragmento al servidor.
                                    </p>
                                    <textarea
                                        defaultValue={config.robotsExtra || ''}
                                        onBlur={e => saveConfig({ robotsExtra: e.target.value })}
                                        rows={4}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                                    />
                                    <div className="flex gap-3 text-xs">
                                        <a href="/robots.txt" target="_blank" rel="noreferrer" className="text-sky-600 hover:underline inline-flex items-center gap-1">
                                            Ver robots.txt <ExternalLink size={11} />
                                        </a>
                                        <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="text-sky-600 hover:underline inline-flex items-center gap-1">
                                            Ver sitemap.xml <ExternalLink size={11} />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </AdminLayout>
    );
};

export default SeoIntelligence;
