import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Languages, RefreshCw, Check, Pencil, AlertTriangle, Trash2,
    Search, Zap, Database, Clock, ShieldCheck, X, Loader2, Server,
} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { LOCALES } from '../../lib/locale';

// ════════════════════════════════════════════════════════════════════════════
// Gestión de Traducciones — v4.661
//
// Lo que se puede hacer aquí, y por qué existe cada cosa:
//   · Elegir el proveedor y su respaldo, sin desplegar.
//   · Ver la cobertura por idioma y lo que falta.
//   · Corregir a mano cualquier traducción automática y APROBARLA: una
//     traducción aprobada no la vuelve a pisar el proveedor, nunca.
//   · Ver los errores del proveedor, el uso y el estado de la caché.
//   · Descartar automáticas para que se regeneren (las manuales no se tocan).
// ════════════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token') || ''}`,
});

interface Entry {
    sourceHash: string; sourceText: string; targetLang: string; value: string;
    status: string; kind: string; provider: string | null; version: number;
    approvedBy: string | null; approvedAt: string | null;
    useCount: number; lastUsedAt: string | null; updatedAt: string;
}

interface LangRow {
    lang: string; total: number; auto: number; manual: number;
    approved: number; failed: number; chars: number; lastUpdate: string | null;
}

interface Overview {
    byLanguage: LangRow[];
    totals: { total: number; sourceChars: number; uniqueTexts: number };
    pendingByLanguage: Record<string, number>;
    errors: Array<{ id: string; targetLang: string; provider: string | null; error: string; createdAt: string; textCount: number }>;
    activity30d: {
        ok: { calls: number; texts: number; chars: number; avgMs: number | null };
        error: { calls: number; texts: number; chars: number; avgMs: number | null };
        edits: number;
    };
    provider: { configured: string | null; fallback: string | null; chain: string[]; active: string | null };
    cache: { entries: number; max: number };
    providers: Array<{ key: string; label: string; note: string; available: boolean; envKey: string }>;
}

const STATUS_STYLE: Record<string, string> = {
    auto: 'bg-slate-100 text-slate-700',
    manual: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<string, string> = {
    auto: 'Automática', manual: 'Manual', approved: 'Aprobada', failed: 'Falló',
};

const langName = (code: string) => LOCALES.find(l => l.code === code)?.name || code;
const fmtDate = (v: string | null) =>
    v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const Translations: React.FC = () => {
    const [overview, setOverview] = useState<Overview | null>(null);
    const [entries, setEntries] = useState<Entry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const [lang, setLang] = useState('');
    const [status, setStatus] = useState('');
    const [q, setQ] = useState('');
    const [page, setPage] = useState(0);
    const PAGE = 25;

    const [editing, setEditing] = useState<Entry | null>(null);
    const [draft, setDraft] = useState('');

    const flash = (kind: 'ok' | 'err', text: string) => {
        setMsg({ kind, text });
        setTimeout(() => setMsg(null), 4000);
    };

    const loadOverview = useCallback(async () => {
        try {
            const r = await fetch(`${API}/translate/admin/overview`, { headers: authHeaders() });
            if (!r.ok) throw new Error(`No se pudo cargar el resumen (${r.status})`);
            setOverview(await r.json());
        } catch (e) {
            flash('err', (e as Error).message);
        }
    }, []);

    const loadEntries = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
            if (lang) p.set('lang', lang);
            if (status) p.set('status', status);
            if (q.trim()) p.set('q', q.trim());
            const r = await fetch(`${API}/translate/admin/entries?${p}`, { headers: authHeaders() });
            if (!r.ok) throw new Error(`No se pudo cargar el listado (${r.status})`);
            const data = await r.json();
            setEntries(data.items || []);
            setTotal(data.total || 0);
        } catch (e) {
            flash('err', (e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [lang, status, q, page]);

    useEffect(() => { loadOverview(); }, [loadOverview]);
    useEffect(() => {
        const t = setTimeout(loadEntries, q ? 350 : 0); // la búsqueda no dispara por tecla
        return () => clearTimeout(t);
    }, [loadEntries, q]);

    // ── Acciones ───────────────────────────────────────────────────────────
    const saveEdit = async (approve: boolean) => {
        if (!editing || !draft.trim()) return;
        setBusy('save');
        try {
            const r = await fetch(
                `${API}/translate/admin/entries/${editing.sourceHash}/${editing.targetLang}`,
                { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ value: draft.trim(), approve }) },
            );
            if (!r.ok) throw new Error((await r.json()).error || 'No se pudo guardar');
            flash('ok', approve
                ? 'Guardada y aprobada: el proveedor ya no la sobrescribe.'
                : 'Traducción guardada.');
            setEditing(null);
            await Promise.all([loadEntries(), loadOverview()]);
        } catch (e) {
            flash('err', (e as Error).message);
        } finally { setBusy(null); }
    };

    const approveRow = async (e: Entry) => {
        setBusy(e.sourceHash);
        try {
            const r = await fetch(
                `${API}/translate/admin/entries/${e.sourceHash}/${e.targetLang}/approve`,
                { method: 'POST', headers: authHeaders() },
            );
            if (!r.ok) throw new Error('No se pudo aprobar');
            flash('ok', 'Traducción aprobada.');
            await Promise.all([loadEntries(), loadOverview()]);
        } catch (err) {
            flash('err', (err as Error).message);
        } finally { setBusy(null); }
    };

    const setProvider = async (provider?: string, fallback?: string) => {
        setBusy('provider');
        try {
            const r = await fetch(`${API}/translate/admin/provider`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ provider, fallback }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'No se pudo guardar');
            flash('ok', 'Proveedor actualizado.');
            await loadOverview();
        } catch (e) {
            flash('err', (e as Error).message);
        } finally { setBusy(null); }
    };

    const probe = async (key: string) => {
        setBusy(`probe:${key}`);
        try {
            const r = await fetch(`${API}/translate/admin/probe`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ provider: key, lang: 'en' }),
            });
            const d = await r.json();
            flash(d.ok ? 'ok' : 'err', d.ok
                ? `${key}: «${d.sample}» en ${d.durationMs} ms.`
                : `${key}: ${d.error}`);
        } catch (e) {
            flash('err', (e as Error).message);
        } finally { setBusy(null); }
    };

    const invalidate = async (targetLang?: string) => {
        const scope = targetLang ? `de ${langName(targetLang)}` : 'de TODOS los idiomas';
        if (!confirm(
            `¿Descartar las traducciones automáticas ${scope}?\n\n`
            + 'Se regenerarán solas la próxima vez que alguien visite el sitio.\n'
            + 'Las manuales y las aprobadas NO se tocan.',
        )) return;
        setBusy('invalidate');
        try {
            const r = await fetch(`${API}/translate/admin/invalidate`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ lang: targetLang }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'No se pudo descartar');
            flash('ok', `${d.removed} traducciones descartadas.`);
            await Promise.all([loadEntries(), loadOverview()]);
        } catch (e) {
            flash('err', (e as Error).message);
        } finally { setBusy(null); }
    };

    const pages = Math.ceil(total / PAGE);
    const act = overview?.activity30d;
    const coverage = useMemo(() => {
        if (!overview) return [];
        const byLang = new Map(overview.byLanguage.map(r => [r.lang, r]));
        return LOCALES.filter(l => l.code !== 'es').map(l => ({
            ...l,
            row: byLang.get(l.code),
            pending: overview.pendingByLanguage?.[l.code] ?? 0,
        }));
    }, [overview]);

    return (
        <AdminLayout>
        <div className="p-6 max-w-[1400px] mx-auto space-y-6">
            {/* Cabecera */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                        <Languages className="w-8 h-8 text-violet-600" />
                        Gestión de Traducciones
                    </h1>
                    <p className="text-gray-500 mt-1 max-w-3xl">
                        El sitio público se traduce solo al idioma que elige cada visitante. Aquí se
                        controla quién traduce, qué se ha traducido y qué se corrigió a mano.
                    </p>
                </div>
                <button
                    onClick={() => { loadOverview(); loadEntries(); }}
                    className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center gap-2 font-semibold text-sm">
                    <RefreshCw className="w-4 h-4" /> Actualizar
                </button>
            </div>

            {msg && (
                <div className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${msg.kind === 'ok'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {msg.kind === 'ok' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {msg.text}
                </div>
            )}

            {/* Métricas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { icon: Database, label: 'Traducciones guardadas', value: overview?.totals.total ?? '—', hint: `${overview?.totals.uniqueTexts ?? 0} textos distintos` },
                    { icon: Zap, label: 'Llamadas (30 días)', value: act?.ok.calls ?? '—', hint: `${act?.ok.texts ?? 0} textos traducidos` },
                    { icon: Clock, label: 'Tiempo medio', value: act?.ok.avgMs != null ? `${act.ok.avgMs} ms` : '—', hint: 'por llamada al proveedor' },
                    { icon: AlertTriangle, label: 'Fallos (30 días)', value: act?.error.calls ?? '—', hint: act?.error.calls ? 'ver abajo' : 'sin incidencias' },
                ].map(({ icon: Icon, label, value, hint }) => (
                    <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                        <Icon className="w-5 h-5 text-gray-400 mb-2" />
                        <div className="text-2xl font-black text-gray-900">{value}</div>
                        <div className="text-sm font-semibold text-gray-700">{label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{hint}</div>
                    </div>
                ))}
            </div>

            {/* Proveedores */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2 mb-1">
                    <Server className="w-5 h-5 text-violet-600" /> Motor de traducción
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                    Se usa el principal; si falla, el de respaldo. Sólo aparecen disponibles los que
                    tienen su credencial cargada en el entorno. Cambiarlo no exige desplegar.
                </p>

                <div className="grid md:grid-cols-2 gap-4 mb-5">
                    {(['configured', 'fallback'] as const).map(slot => (
                        <label key={slot} className="block">
                            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                                {slot === 'configured' ? 'Proveedor principal' : 'Respaldo'}
                            </span>
                            <select
                                value={overview?.provider[slot] || ''}
                                disabled={busy === 'provider'}
                                onChange={e => setProvider(
                                    slot === 'configured' ? e.target.value : undefined,
                                    slot === 'fallback' ? e.target.value : undefined,
                                )}
                                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium">
                                <option value="">— sin definir —</option>
                                {overview?.providers.map(p => (
                                    <option key={p.key} value={p.key} disabled={!p.available}>
                                        {p.label}{p.available ? '' : ' (falta credencial)'}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ))}
                </div>

                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {overview?.providers.map(p => {
                        const active = overview.provider.active === p.key;
                        return (
                            <div key={p.key}
                                className={`rounded-xl border p-4 ${active ? 'border-violet-300 bg-violet-50/50' : 'border-gray-150 bg-gray-50/50'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-sm text-gray-900">{p.label}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.available ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                                        {active ? 'EN USO' : p.available ? 'LISTO' : 'SIN CLAVE'}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1.5 leading-snug">{p.note}</p>
                                <div className="flex items-center justify-between mt-3">
                                    <code className="text-[10px] text-gray-400">{p.envKey}</code>
                                    <button
                                        onClick={() => probe(p.key)}
                                        disabled={!p.available || busy === `probe:${p.key}`}
                                        className="text-xs font-bold text-violet-700 hover:text-violet-900 disabled:text-gray-300 flex items-center gap-1">
                                        {busy === `probe:${p.key}`
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : <Zap className="w-3 h-3" />}
                                        Probar
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Cobertura por idioma */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                    <h2 className="text-lg font-black text-gray-900">Cobertura por idioma</h2>
                    <button onClick={() => invalidate()} disabled={busy === 'invalidate'}
                        className="text-xs font-bold text-red-600 hover:text-red-800 flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" /> Descartar automáticas (todos)
                    </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                    «Pendientes» son textos que ya existen en otro idioma pero todavía no en éste.
                    Se traducen solos en cuanto alguien visite la página que los contiene.
                </p>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                                <th className="py-2 pr-3">Idioma</th>
                                <th className="py-2 px-3 text-right">Total</th>
                                <th className="py-2 px-3 text-right">Automáticas</th>
                                <th className="py-2 px-3 text-right">Manuales</th>
                                <th className="py-2 px-3 text-right">Aprobadas</th>
                                <th className="py-2 px-3 text-right">Pendientes</th>
                                <th className="py-2 px-3">Última actualización</th>
                                <th className="py-2 pl-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {coverage.map(c => (
                                <tr key={c.code} className="border-b border-gray-50 hover:bg-gray-50/60">
                                    <td className="py-2.5 pr-3 font-bold text-gray-900">
                                        {c.name} <span className="text-gray-400 font-mono text-xs">{c.locale}</span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-semibold">{c.row?.total ?? 0}</td>
                                    <td className="py-2.5 px-3 text-right text-gray-500">{c.row?.auto ?? 0}</td>
                                    <td className="py-2.5 px-3 text-right text-amber-700">{c.row?.manual ?? 0}</td>
                                    <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">{c.row?.approved ?? 0}</td>
                                    <td className={`py-2.5 px-3 text-right ${c.pending ? 'text-orange-600 font-bold' : 'text-gray-300'}`}>
                                        {c.pending || '—'}
                                    </td>
                                    <td className="py-2.5 px-3 text-gray-500 text-xs">{fmtDate(c.row?.lastUpdate ?? null)}</td>
                                    <td className="py-2.5 pl-3 text-right">
                                        <button onClick={() => { setLang(c.code); setPage(0); }}
                                            className="text-xs font-bold text-violet-700 hover:text-violet-900">
                                            Ver
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-4 text-xs text-gray-400 flex items-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5" />
                        Caché en memoria: {overview?.cache.entries ?? 0} / {overview?.cache.max ?? 0}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Las manuales y aprobadas nunca se sobrescriben.
                    </span>
                </div>
            </div>

            {/* Errores del proveedor */}
            {!!overview?.errors.length && (
                <div className="bg-white rounded-2xl border border-red-100 p-6 shadow-sm">
                    <h2 className="text-lg font-black text-red-800 flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5" /> Errores del proveedor
                    </h2>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                        {overview.errors.map(e => (
                            <div key={e.id} className="text-xs bg-red-50/60 border border-red-100 rounded-lg px-3 py-2">
                                <div className="flex items-center justify-between gap-3 mb-0.5">
                                    <span className="font-bold text-red-900">
                                        {langName(e.targetLang)} · {e.provider || 'sin proveedor'} · {e.textCount} textos
                                    </span>
                                    <span className="text-red-500 shrink-0">{fmtDate(e.createdAt)}</span>
                                </div>
                                <div className="text-red-700 font-mono break-all">{e.error}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Listado y edición */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h2 className="text-lg font-black text-gray-900 mb-4">Traducciones</h2>

                <div className="flex flex-wrap gap-3 mb-4">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            value={q}
                            onChange={e => { setQ(e.target.value); setPage(0); }}
                            placeholder="Buscar en el original o en la traducción…"
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                    </div>
                    <select value={lang} onChange={e => { setLang(e.target.value); setPage(0); }}
                        className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium">
                        <option value="">Todos los idiomas</option>
                        {LOCALES.filter(l => l.code !== 'es').map(l => (
                            <option key={l.code} value={l.code}>{l.name}</option>
                        ))}
                    </select>
                    <select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}
                        className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium">
                        <option value="">Todos los estados</option>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </div>

                {loading ? (
                    <div className="py-16 text-center text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Cargando…
                    </div>
                ) : !entries.length ? (
                    <div className="py-16 text-center text-gray-400 text-sm">
                        No hay traducciones que coincidan.
                        <div className="text-xs mt-1">
                            Se crean solas cuando un visitante navega el sitio en otro idioma.
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {entries.map(e => (
                            <div key={`${e.sourceHash}:${e.targetLang}`}
                                className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs text-gray-400 mb-1 flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-full font-bold ${STATUS_STYLE[e.status] || STATUS_STYLE.auto}`}>
                                                {STATUS_LABEL[e.status] || e.status}
                                            </span>
                                            <span className="font-semibold text-gray-600">{langName(e.targetLang)}</span>
                                            {e.provider && <span>· {e.provider}</span>}
                                            <span>· v{e.version}</span>
                                            <span>· {e.useCount} usos</span>
                                            <span>· {fmtDate(e.updatedAt)}</span>
                                            {e.approvedBy && (
                                                <span className="text-emerald-600">· aprobada por {e.approvedBy}</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-400 line-clamp-2 break-words">{e.sourceText}</p>
                                        <p className="text-sm text-gray-900 font-medium mt-1 line-clamp-3 break-words">{e.value}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => { setEditing(e); setDraft(e.value); }}
                                            title="Corregir"
                                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        {e.status !== 'approved' && (
                                            <button
                                                onClick={() => approveRow(e)}
                                                disabled={busy === e.sourceHash}
                                                title="Aprobar: el proveedor ya no la sobrescribe"
                                                className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600 disabled:opacity-40">
                                                {busy === e.sourceHash
                                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                                    : <Check className="w-4 h-4" />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {pages > 1 && (
                    <div className="flex items-center justify-between mt-4 text-sm">
                        <span className="text-gray-400">
                            {total} resultados · página {page + 1} de {pages}
                        </span>
                        <div className="flex gap-2">
                            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 font-semibold">
                                Anterior
                            </button>
                            <button disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 font-semibold">
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Corrección manual */}
            {editing && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
                    onClick={() => setEditing(null)}>
                    <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl"
                        onClick={ev => ev.stopPropagation()}>
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">Corregir traducción</h3>
                                <p className="text-sm text-gray-500">{langName(editing.targetLang)}</p>
                            </div>
                            <button onClick={() => setEditing(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Original</label>
                        <p className="mt-1 mb-4 p-3 bg-gray-50 rounded-xl text-sm text-gray-600 max-h-32 overflow-y-auto">
                            {editing.sourceText}
                        </p>

                        <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Traducción</label>
                        <textarea
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            rows={5}
                            className="mt-1 w-full border border-gray-200 rounded-xl p-3 text-sm" />

                        <div className="flex items-center gap-2 mt-4 text-xs text-gray-500 bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                            Al aprobarla queda blindada: el traductor automático no la volverá a
                            sobrescribir, ni siquiera al regenerar el idioma completo.
                        </div>

                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setEditing(null)}
                                className="px-4 py-2.5 rounded-xl border border-gray-200 font-semibold text-sm">
                                Cancelar
                            </button>
                            <button onClick={() => saveEdit(false)} disabled={busy === 'save' || !draft.trim()}
                                className="px-4 py-2.5 rounded-xl border border-gray-200 font-semibold text-sm disabled:opacity-40">
                                Guardar
                            </button>
                            <button onClick={() => saveEdit(true)} disabled={busy === 'save' || !draft.trim()}
                                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2">
                                {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Guardar y aprobar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </AdminLayout>
    );
};

export default Translations;
