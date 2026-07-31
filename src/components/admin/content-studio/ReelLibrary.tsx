/**
 * Biblioteca de Reels — Estudio de Contenido IA (v4.669)
 * ======================================================
 *
 * Inventario de todos los Reels generados, con su ficha completa.
 *
 * Por qué existe: el Reel SÍ se guardaba —`autoSaveToLibrary` crea su fila en
 * `Media` desde v4.663—, pero la pestaña «Biblioteca» sólo pintaba las
 * publicaciones sociales y, colapsada al fondo, la videoteca del Creador de
 * Video ANTERIOR (`VideoProject`). Ningún Reel aparecía por ninguna parte. El
 * fallo no era del guardado sino de que nadie los leía.
 *
 * De dónde salen los datos: la fila de `Media` es el ARCHIVO —nombre, url,
 * peso— y es lo que consumen los demás módulos. La FICHA —motor, escenas,
 * copies, locución, prompts, créditos— vive en `ReelProject` y sus tablas
 * hijas, que es lo que lee esta pantalla. No se duplica en `Media`: duplicarla
 * obligaría a mantener dos verdades y a tocar el modelo de Prisma.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Film, Search, Download, Copy as CopyIcon, Pencil, Trash2, X, Loader2,
    CheckCircle2, AlertTriangle, Clock, Coins, Music, Mic, Image as ImageIcon,
    Share2, Activity, Save
} from 'lucide-react';
import { toast } from 'sonner';
import type { Reel } from '../../../lib/reelSpec';
import ReelUsagePanel from './ReelUsagePanel';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`,
    'Content-Type': 'application/json'
});

const fmtBytes = (b: number | null) => {
    if (!b) return '—';
    const mb = b / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
};

const fmtDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtMs = (ms: number | null) => {
    if (!ms) return '—';
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

// Un Reel `needs_review` está en la Biblioteca a propósito desde v4.669: la
// Biblioteca es el inventario de lo generado, no la lista de lo aprobado. Pero
// el estado se ve, para que nadie publique sin saberlo.
const StatusChip: React.FC<{ reel: Reel }> = ({ reel }) => {
    const ok = reel.status === 'ready';
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
               : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
            {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            {reel.statusLabel}
        </span>
    );
};

// ─── Ficha ─────────────────────────────────────────────────────────────────

const ReelDetail: React.FC<{
    reel: Reel;
    onClose: () => void;
    onChanged: (r: Reel) => void;
    onDeleted: (id: string) => void;
    onDuplicate: (r: Reel) => void;
}> = ({ reel, onClose, onChanged, onDeleted, onDuplicate }) => {
    const [tab, setTab] = useState<'ficha' | 'escenas' | 'textos' | 'consumo'>('ficha');
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(reel.title);
    const [description, setDescription] = useState(reel.description || '');
    const [tags, setTags] = useState((reel.tags || []).join(', '));
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({
                    title,
                    description,
                    tags: tags.split(',').map(t => t.trim()).filter(Boolean)
                })
            });
            if (!r.ok) throw new Error((await r.json()).error || 'No se pudo guardar');
            onChanged(await r.json());
            setEditing(false);
            toast.success('Ficha actualizada');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!window.confirm(`¿Quitar «${reel.title}» del Creador de Reels?\n\nEl archivo y su ficha en la Biblioteca multimedia se conservan: si ya se publicó, el enlace sigue funcionando.`)) return;
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}`, {
                method: 'DELETE', headers: authHeaders()
            });
            if (!r.ok) throw new Error('No se pudo eliminar');
            onDeleted(reel.id);
            toast.success('Reel eliminado del creador');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo eliminar');
        }
    };

    const TABS = [
        { id: 'ficha' as const, label: 'Ficha' },
        { id: 'escenas' as const, label: `Escenas (${reel.scenes?.length || 0})` },
        { id: 'textos' as const, label: `Textos (${reel.copies?.length || 0})` },
        { id: 'consumo' as const, label: 'Consumo' }
    ];

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-gray-100 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                        {editing ? (
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full text-lg font-black text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        ) : (
                            <h3 className="text-lg font-black text-gray-900 truncate">{reel.title}</h3>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <StatusChip reel={reel} />
                            <span className="text-xs text-gray-500">{reel.formatLabel}</span>
                            <span className="text-xs text-gray-400">·</span>
                            <span className="text-xs text-gray-500">{fmtDate(reel.savedToLibraryAt || reel.createdAt)}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 shrink-0">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="px-5 pt-3 flex gap-1 border-b border-gray-100">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors ${
                                tab === t.id ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {tab === 'ficha' && (
                        <div className="grid md:grid-cols-[280px_1fr] gap-6">
                            <div>
                                {reel.videoUrl && (
                                    <video
                                        src={reel.videoUrl}
                                        poster={reel.posterUrl || undefined}
                                        controls
                                        className="w-full rounded-2xl bg-black aspect-[9/16] object-contain"
                                    />
                                )}
                                <div className="mt-3 flex gap-2">
                                    <a
                                        href={reel.videoUrl || '#'}
                                        download
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800"
                                    >
                                        <Download className="w-3.5 h-3.5" /> Descargar
                                    </a>
                                    <button
                                        onClick={() => onDuplicate(reel)}
                                        title="Abre el creador con las mismas fotos y ajustes. No gasta créditos hasta que confirmes."
                                        className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200"
                                    >
                                        <CopyIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setEditing(e => !e)}
                                        className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={remove}
                                        className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4 min-w-0">
                                {editing && (
                                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
                                        <div>
                                            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Descripción</label>
                                            <textarea
                                                value={description}
                                                onChange={e => setDescription(e.target.value)}
                                                rows={3}
                                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                placeholder="Para qué se hizo, dónde se publicó…"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Etiquetas (separadas por coma)</label>
                                            <input
                                                value={tags}
                                                onChange={e => setTags(e.target.value)}
                                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                placeholder="feria, valledupar, 2027"
                                            />
                                        </div>
                                        <button
                                            onClick={save}
                                            disabled={saving}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                            Guardar ficha
                                        </button>
                                    </div>
                                )}

                                {!editing && reel.description && (
                                    <p className="text-sm text-gray-600 leading-relaxed">{reel.description}</p>
                                )}
                                {!editing && (reel.tags?.length || 0) > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {reel.tags!.map(t => (
                                            <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{t}</span>
                                        ))}
                                    </div>
                                )}

                                <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
                                    {[
                                        ['Identificador', reel.id],
                                        ['Creado por', reel.userEmail || '—'],
                                        ['Organización', reel.organizationName || '—'],
                                        ['Fecha de creación', fmtDate(reel.createdAt)],
                                        ['En Biblioteca desde', fmtDate(reel.savedToLibraryAt)],
                                        ['Motor de video', reel.engineLabel],
                                        ['Modelo', reel.engineModel || '—'],
                                        ['Montaje', reel.renderProviderLabel || '—'],
                                        ['Resolución', reel.width && reel.height ? `${reel.width} × ${reel.height}` : '—'],
                                        ['Relación de aspecto', reel.formatLabel],
                                        ['Duración', reel.durationSec ? `${reel.durationSec.toFixed(1)} s` : '—'],
                                        ['Peso', fmtBytes(reel.sizeBytes)],
                                        ['Tasa de bits', reel.bitrateKbps ? `${reel.bitrateKbps} kbps` : '—'],
                                        ['Audio', reel.hasAudio ? 'Sí' : 'No'],
                                        ['Música', reel.musicStyleLabel || (reel.musicUrl ? 'Sí' : 'No')],
                                        ['Locución', reel.narration ? 'Sí' : 'No'],
                                        ['Créditos estimados', String(reel.creditsEstimated ?? 0)],
                                        ['Tiempo total', fmtMs(reel.processingMs)]
                                    ].map(([k, v]) => (
                                        <div key={k as string} className="min-w-0">
                                            <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{k}</dt>
                                            <dd className="text-gray-800 font-medium truncate" title={String(v)}>{v}</dd>
                                        </div>
                                    ))}
                                </dl>

                                {/* Recursos que produjo la pieza. Son enlaces al archivo real,
                                    no una promesa: si no existe, no se pinta el botón. */}
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {reel.musicUrl && (
                                        <a href={reel.musicUrl} target="_blank" rel="noreferrer"
                                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100">
                                            <Music className="w-3.5 h-3.5" /> Banda sonora
                                        </a>
                                    )}
                                    {reel.narration?.audioUrl && (
                                        <a href={reel.narration.audioUrl} target="_blank" rel="noreferrer"
                                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-[11px] font-bold hover:bg-sky-100">
                                            <Mic className="w-3.5 h-3.5" /> Locución
                                        </a>
                                    )}
                                    <a href={`${API}/content-studio/reels/${reel.id}/export?format=zip`}
                                       className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold hover:bg-gray-200">
                                        <Download className="w-3.5 h-3.5" /> Exportar textos
                                    </a>
                                </div>

                                {reel.notes?.length > 0 && (
                                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                                        <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">Anotaciones del proceso</div>
                                        <ul className="text-[11px] text-amber-900 space-y-1 list-disc list-inside">
                                            {reel.notes.map((n, i) => <li key={i}>{n}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'escenas' && (
                        <div className="grid sm:grid-cols-3 gap-4">
                            {(reel.scenes || []).map(sc => (
                                <div key={sc.id} className="rounded-2xl border border-gray-100 overflow-hidden">
                                    {sc.videoUrl ? (
                                        <video src={sc.videoUrl} controls className="w-full bg-black aspect-[9/16] object-contain" />
                                    ) : (
                                        <div className="w-full aspect-[9/16] bg-gray-100 flex items-center justify-center">
                                            <ImageIcon className="w-6 h-6 text-gray-300" />
                                        </div>
                                    )}
                                    <div className="p-3 space-y-1">
                                        <div className="text-xs font-black text-gray-900">Escena {sc.position + 1}</div>
                                        <div className="text-[11px] text-gray-500">
                                            {sc.styleLabel} · {sc.durationSec}s
                                        </div>
                                        {sc.fidelity && (
                                            <div className={`text-[10px] font-bold ${
                                                sc.fidelity.state === 'ok' ? 'text-emerald-600'
                                                    : sc.fidelity.state === 'failed' ? 'text-red-600' : 'text-gray-400'
                                            }`}>
                                                Fidelidad: {sc.fidelity.state === 'ok' ? `${Math.round((sc.fidelity.score || 0) * 100)}%`
                                                    : sc.fidelity.state === 'failed' ? 'no conservó la foto' : 'no comprobada'}
                                            </div>
                                        )}
                                        {sc.sourceImageUrl && (
                                            <a href={sc.sourceImageUrl} target="_blank" rel="noreferrer"
                                               className="text-[10px] font-bold text-indigo-600 hover:underline block">
                                                Foto original
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'textos' && (
                        <div className="space-y-3">
                            {(reel.copies || []).length === 0 && (
                                <p className="text-sm text-gray-500">Este Reel no tiene textos generados.</p>
                            )}
                            {(reel.copies || []).map(c => (
                                <div key={c.id} className="rounded-2xl border border-gray-100 p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Share2 className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="text-xs font-black text-gray-900">{c.platformLabel}</span>
                                        <span className="text-[10px] text-gray-400">v{c.version} · {c.charCount} caracteres</span>
                                    </div>
                                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{c.fullText}</pre>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'consumo' && <ReelUsagePanel reelId={reel.id} />}
                </div>
            </div>
        </div>
    );
};

// ─── Listado ───────────────────────────────────────────────────────────────

const ReelLibrary: React.FC<{ onDuplicate?: (prefill: unknown) => void }> = ({ onDuplicate }) => {
    const [reels, setReels] = useState<Reel[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Reel | null>(null);

    const load = useCallback(async (term: string) => {
        setLoading(true);
        try {
            const qs = new URLSearchParams({ limit: '60' });
            if (term) qs.set('search', term);
            const r = await fetch(`${API}/content-studio/reels/library?${qs}`, { headers: authHeaders() });
            if (!r.ok) throw new Error('No se pudo cargar la biblioteca');
            const data = await r.json();
            setReels(data.reels || []);
            setTotal(data.total || 0);
        } catch {
            toast.error('No se pudieron cargar los Reels');
        } finally {
            setLoading(false);
        }
    }, []);

    // Se espera a que el usuario deje de escribir antes de consultar: sin esto
    // son seis peticiones para escribir «feria».
    useEffect(() => {
        const id = window.setTimeout(() => load(search), search ? 350 : 0);
        return () => window.clearTimeout(id);
    }, [search, load]);

    const duplicate = async (reel: Reel) => {
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/duplicate`, {
                method: 'POST', headers: authHeaders()
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo duplicar');
            setSelected(null);
            onDuplicate?.(data.prefill);
            toast.success('Ajustes copiados al creador', {
                description: 'Revisá las fotos y confirmá para generar. Todavía no se gastó ningún crédito.'
            });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo duplicar');
        }
    };

    const stats = useMemo(() => ({
        credits: reels.reduce((s, r) => s + (r.creditsEstimated || 0), 0),
        bytes: reels.reduce((s, r) => s + (r.sizeBytes || 0), 0)
    }), [reels]);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="p-5 border-b border-gray-100 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center">
                        <Film className="w-4.5 h-4.5 text-violet-600" />
                    </span>
                    <div>
                        <h3 className="font-black text-gray-900 text-sm">Reels IA</h3>
                        <p className="text-[11px] text-gray-500">
                            {total} pieza{total === 1 ? '' : 's'}
                            {stats.credits > 0 && <> · {stats.credits} créditos estimados</>}
                            {stats.bytes > 0 && <> · {fmtBytes(stats.bytes)}</>}
                        </p>
                    </div>
                </div>
                <div className="flex-1" />
                <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por título o descripción…"
                        className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                </div>
            </div>

            <div className="p-5">
                {loading && reels.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
                    </div>
                )}

                {!loading && reels.length === 0 && (
                    <div className="text-center py-12">
                        <Film className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-sm font-bold text-gray-600">
                            {search ? 'Ningún Reel coincide con la búsqueda' : 'Todavía no hay Reels generados'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                            {search
                                ? 'Probá con otro término.'
                                : 'Los Reels entran acá solos en cuanto terminan de montarse.'}
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {reels.map(reel => (
                        <button
                            key={reel.id}
                            onClick={() => setSelected(reel)}
                            className="text-left rounded-2xl border border-gray-100 overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all group"
                        >
                            <div className="relative bg-black aspect-[9/16]">
                                {reel.posterUrl ? (
                                    <img src={reel.posterUrl} alt={reel.title} className="w-full h-full object-cover" />
                                ) : reel.videoUrl ? (
                                    <video src={reel.videoUrl} muted preload="metadata" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Film className="w-6 h-6 text-gray-600" />
                                    </div>
                                )}
                                <span className="absolute bottom-2 right-2 text-[10px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded">
                                    {reel.durationSec ? `${Math.round(reel.durationSec)}s` : ''}
                                </span>
                            </div>
                            <div className="p-3 space-y-1.5">
                                <div className="text-xs font-black text-gray-900 line-clamp-2 leading-snug">{reel.title}</div>
                                <StatusChip reel={reel} />
                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                    <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{fmtDate(reel.savedToLibraryAt || reel.createdAt)}</span>
                                    {reel.creditsEstimated > 0 && (
                                        <span className="flex items-center gap-0.5"><Coins className="w-3 h-3" />{reel.creditsEstimated}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                                        <Activity className="w-3 h-3" /> Ver ficha
                                    </span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {selected && (
                <ReelDetail
                    reel={selected}
                    onClose={() => setSelected(null)}
                    onChanged={updated => {
                        setSelected(updated);
                        setReels(rs => rs.map(r => (r.id === updated.id ? { ...r, ...updated } : r)));
                    }}
                    onDeleted={id => {
                        setSelected(null);
                        setReels(rs => rs.filter(r => r.id !== id));
                        setTotal(t => Math.max(0, t - 1));
                    }}
                    onDuplicate={duplicate}
                />
            )}
        </div>
    );
};

export default ReelLibrary;
