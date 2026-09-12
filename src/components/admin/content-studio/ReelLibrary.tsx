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
    Share2, Save, Ban, RotateCcw, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import type { Reel, ReelOutro } from '../../../lib/reelSpec';
import { isTerminal, formatEta } from '../../../lib/reelSpec';
import MediaPicker from './MediaPicker';
import { uploadMediaFiles, VIDEO_ACCEPT } from '../../../lib/mediaUpload';
import ReelUsagePanel from './ReelUsagePanel';
import ScenePeopleCheck from './ScenePeopleCheck';
import SceneBrandCheck from './SceneBrandCheck';
import SceneLifeCheck from './SceneLifeCheck';

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
// Biblioteca es el inventario de lo generado, no la lista de lo aprobado. Y
// desde v4.670 también están los que se están generando. El estado se ve
// siempre, para que nadie publique sin saber qué tiene delante.
const StatusChip: React.FC<{ reel: Reel }> = ({ reel }) => {
    const running = !isTerminal(reel.status);
    const tone = running ? 'bg-sky-50 text-sky-700 border-sky-200'
        : reel.status === 'ready' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : reel.status === 'error' ? 'bg-red-50 text-red-700 border-red-200'
                : reel.status === 'cancelled' ? 'bg-gray-100 text-gray-600 border-gray-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200';
    const Icon = running ? Loader2
        : reel.status === 'ready' ? CheckCircle2
            : reel.status === 'cancelled' ? Ban : AlertTriangle;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${tone}`}>
            <Icon className={`w-3 h-3 ${running ? 'animate-spin' : ''}`} />
            {reel.statusLabel}
        </span>
    );
};

// Barra de avance de un Reel en curso. Sólo se pinta mientras se está
// generando: en un Reel terminado una barra al 100 % no informa de nada.
const ProgressBar: React.FC<{ reel: Reel }> = ({ reel }) => {
    if (isTerminal(reel.status)) return null;
    const pct = Math.round((reel.progress || 0) * 100);
    const eta = formatEta(reel.etaSec);
    return (
        <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(3, pct)}%` }}
                />
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span className="font-bold tabular-nums">{pct}%</span>
                {/* «aprox.» no es un adorno: la cola del proveedor no la
                    controlamos y prometer un minuto exacto sería inventarlo. */}
                {eta && <span>aprox. {eta}</span>}
            </div>
        </div>
    );
};


// ─── Outro (v4.1032) ───────────────────────────────────────────────────────
//
// Un clip ya renderizado que cierra el Reel después de la última escena.
// Vive en `config.outro` del proyecto y sólo toca el MONTAJE: activarlo,
// cambiarlo o quitarlo relanza la composición con las escenas que ya existen
// — ninguna se regenera y no se gasta un crédito de image-to-video. La
// pantalla lo dice junto al botón que monta.
//
// Las dos vías de siempre para un archivo (v4.700): elegir de la Biblioteca
// Multimedia o subir uno nuevo, que entra a la Biblioteca por
// `uploadMediaFiles` —el mismo camino que toda subida del sitio— y queda como
// asset reutilizable del sitio. Duración, medidas y relación de aspecto llegan
// MEDIDAS del servidor; acá se pintan.
//
// Vive en el ámbito del módulo: declarado dentro de `ReelDetail` sería un
// tipo nuevo en cada render y React desmontaría el árbol a cada pulsación
// (v4.971).
const OutroSection: React.FC<{
    reel: Reel;
    onChanged: (r: Reel) => void;
}> = ({ reel, onChanged }) => {
    const outro: ReelOutro | null = reel.outro || null;
    const options = reel.outroOptions;
    const [pickerOpen, setPickerOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const quieto = isTerminal(reel.status);
    const puedeMontar = quieto && reel.status !== 'cancelled' && (reel.scenesPending ?? 0) === 0;

    const guardar = async (body: Record<string, unknown>, label = 'Outro guardado') => {
        setBusy(label);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/outro`, {
                method: 'PUT', headers: authHeaders(), body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo guardar el outro');
            onChanged(data);
            toast.success(label);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar el outro');
        } finally {
            setBusy(null);
        }
    };

    const quitar = async () => {
        if (!confirm('El outro se quita de este Reel. El archivo sigue en la Biblioteca Multimedia y se puede volver a elegir.')) return;
        setBusy('quitar');
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/outro`, { method: 'DELETE', headers: authHeaders() });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo quitar el outro');
            onChanged(data);
            toast.success('Outro quitado. Volvé a montar para que el video final no lo lleve.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo quitar el outro');
        } finally {
            setBusy(null);
        }
    };

    const subir = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Se limpia tras cada elección: volver a elegir el MISMO archivo no
        // dispara `change` (v4.784).
        e.target.value = '';
        if (!file) return;
        setUploading(true);
        try {
            const { uploaded, failed } = await uploadMediaFiles([file], { clubId: reel.clubId });
            if (failed.length || !uploaded[0]) throw new Error(failed[0]?.reason || 'No se pudo subir el video');
            const m = uploaded[0];
            if (m.type !== 'video') throw new Error('El outro tiene que ser un video.');
            await guardar({ mediaId: m.id, url: m.url, title: m.filename, enabled: true }, 'Outro subido a la Biblioteca y asociado al Reel');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo subir el video');
        } finally {
            setUploading(false);
        }
    };

    const montar = async () => {
        setBusy('montar');
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/render`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({})
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo relanzar el montaje');
            onChanged(data);
            toast.success('Montaje relanzado con las escenas existentes. No se regenera ninguna.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo relanzar el montaje');
        } finally {
            setBusy(null);
        }
    };

    const transitions = options?.transitions || [];
    const secOpts = [0.4, 0.6, 0.8];
    const montadoCon = reel.outroRendered?.src || null;
    const desincronizado = Boolean(reel.videoUrl) && (
        (outro?.enabled ? montadoCon !== outro.url : Boolean(montadoCon))
    );

    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Outro</div>
                    <p className="text-[11px] text-gray-500">
                        Clip de cierre después de la última escena, con transición suave. Cambiarlo sólo vuelve a montar: no regenera escenas ni gasta créditos de video.
                    </p>
                </div>
                {outro && (
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={outro.enabled}
                            disabled={!quieto || Boolean(busy)}
                            onChange={e => guardar({ enabled: e.target.checked }, e.target.checked ? 'Outro activado' : 'Outro desactivado')}
                            className="rounded"
                        />
                        Activar outro
                    </label>
                )}
            </div>

            {!quieto && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    El Reel está en proceso. El outro se puede cambiar cuando termine.
                </p>
            )}

            {outro ? (
                <div className="grid sm:grid-cols-[120px_1fr] gap-3">
                    <video
                        src={outro.url}
                        poster={outro.posterUrl || undefined}
                        controls
                        muted
                        className="w-full rounded-xl bg-black aspect-[9/16] object-contain"
                    />
                    <div className="space-y-2 min-w-0">
                        {outro.title && <p className="text-sm font-bold text-gray-800 truncate">{outro.title}</p>}
                        <dl className="grid grid-cols-3 gap-2 text-[11px]">
                            <div>
                                <dt className="text-gray-400 font-bold uppercase tracking-wide text-[9px]">Duración</dt>
                                <dd className="text-gray-800 font-semibold" data-no-translate>{outro.durationSec != null ? `${outro.durationSec.toFixed(1)} s` : '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-400 font-bold uppercase tracking-wide text-[9px]">Resolución</dt>
                                <dd className="text-gray-800 font-semibold" data-no-translate>{outro.width && outro.height ? `${outro.width} × ${outro.height}` : '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-400 font-bold uppercase tracking-wide text-[9px]">Relación de aspecto</dt>
                                <dd className="text-gray-800 font-semibold" data-no-translate>{outro.aspectRatio || '—'}</dd>
                            </div>
                        </dl>
                        {outro.aspectRatio && reel.format === '9:16' && outro.aspectRatio !== '9:16' && (
                            <p className="text-[11px] text-gray-500">
                                El outro no es 9:16: el montaje lo escala y lo recorta al centro para llenar el cuadro, sin bandas negras.
                            </p>
                        )}
                        {outro.problems.length > 0 && (
                            <p className="text-[11px] text-red-600">{outro.problems.join(' ')}</p>
                        )}

                        <div className="flex flex-wrap gap-2 items-center">
                            <label className="text-[11px] text-gray-600 flex items-center gap-1.5">
                                Transición
                                <select
                                    value={outro.transitionType}
                                    disabled={!quieto || Boolean(busy)}
                                    onChange={e => guardar({ transitionType: e.target.value }, 'Transición guardada')}
                                    className="text-[11px] border border-gray-200 rounded-lg px-2 py-1"
                                >
                                    {transitions.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                            </label>
                            {outro.transitionType !== 'cut' && (
                                <label className="text-[11px] text-gray-600 flex items-center gap-1.5">
                                    Duración
                                    <select
                                        value={String(secOpts.includes(outro.transitionSec) ? outro.transitionSec : outro.transitionSec)}
                                        disabled={!quieto || Boolean(busy)}
                                        onChange={e => guardar({ transitionSec: Number(e.target.value) }, 'Transición guardada')}
                                        className="text-[11px] border border-gray-200 rounded-lg px-2 py-1"
                                    >
                                        {(secOpts.includes(outro.transitionSec) ? secOpts : [...secOpts, outro.transitionSec]).sort((a, b) => a - b).map(v => (
                                            <option key={v} value={String(v)}>{v.toFixed(1)} s</option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            {outro.hasAudio === true && (
                                <label className="text-[11px] text-gray-600 flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={outro.audioEnabled}
                                        disabled={!quieto || Boolean(busy)}
                                        onChange={e => guardar({ audioEnabled: e.target.checked }, e.target.checked ? 'El outro sonará con su propio audio' : 'El outro irá mudo; la música del Reel sigue debajo')}
                                        className="rounded"
                                    />
                                    Usar el audio del outro
                                </label>
                            )}
                            {outro.hasAudio === false && (
                                <span className="text-[11px] text-gray-400">Sin audio propio: la música del Reel continúa y cierra con fundido.</span>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setPickerOpen(true)}
                                disabled={!quieto || Boolean(busy)}
                                className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold hover:bg-gray-200 disabled:opacity-50"
                            >
                                Reemplazar desde Biblioteca
                            </button>
                            <label className={`px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold hover:bg-gray-200 cursor-pointer ${(!quieto || uploading || Boolean(busy)) ? 'opacity-50 pointer-events-none' : ''}`}>
                                {uploading ? 'Subiendo…' : 'Subir nuevo video'}
                                <input type="file" accept={VIDEO_ACCEPT} className="hidden" onChange={subir} disabled={!quieto || uploading} />
                            </label>
                            <button
                                onClick={quitar}
                                disabled={!quieto || Boolean(busy)}
                                className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100 disabled:opacity-50"
                            >
                                Quitar
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setPickerOpen(true)}
                        disabled={!quieto || Boolean(busy)}
                        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-bold hover:bg-gray-800 disabled:opacity-50"
                    >
                        Seleccionar desde Biblioteca
                    </button>
                    <label className={`px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold hover:bg-gray-200 cursor-pointer ${(!quieto || uploading) ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploading ? 'Subiendo…' : 'Subir nuevo video'}
                        <input type="file" accept={VIDEO_ACCEPT} className="hidden" onChange={subir} disabled={!quieto || uploading} />
                    </label>
                </div>
            )}

            {desincronizado && puedeMontar && (
                <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2">
                    <p className="text-[11px] text-indigo-800">
                        El video final todavía no refleja este cambio. Volver a montar usa las escenas que ya existen: no regenera ninguna ni consume créditos de video.
                    </p>
                    <button
                        onClick={montar}
                        disabled={Boolean(busy)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {busy === 'montar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Volver a montar con el outro
                    </button>
                </div>
            )}

            <MediaPicker
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                maxSelection={1}
                mediaType="video"
                onSelect={items => {
                    setPickerOpen(false);
                    const m = items[0];
                    if (!m) return;
                    void guardar({ mediaId: m.id, title: m.filename, enabled: true }, 'Outro asociado al Reel');
                }}
            />
        </div>
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

    // ── Regenerar UNA escena desde la ficha (v4.1031) ──
    // «Editar en el Estudio» aterriza acá, y hasta v4.1030 la pestaña de
    // escenas no ofrecía ninguna acción: el clip se miraba y nada más. Es el
    // MISMO endpoint que usan el Creador y la ficha de la solicitud; gasta
    // una generación y se dice antes. Sólo sobre un Reel que no esté en
    // curso y una escena terminal: el servidor vuelve a comprobarlo (409).
    const [regenerating, setRegenerating] = useState<string | null>(null);
    const regenerateScene = async (sc: { id: string; position: number; creditsEstimated?: number }) => {
        const costo = sc.creditsEstimated ? ` (${sc.creditsEstimated} créditos estimados, medidor propio)` : '';
        if (!window.confirm(`Se vuelve a generar SÓLO la escena ${sc.position + 1}. Gasta una generación de video${costo}. El clip actual se conserva en la Biblioteca y las demás escenas no se tocan. ¿Seguir?`)) return;
        setRegenerating(sc.id);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/scenes/${sc.id}/regenerate`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({})
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || 'No se pudo regenerar la escena');
            onChanged(data);
            toast.success(`Se regenera la escena ${sc.position + 1}. Las demás no se tocan.`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo regenerar la escena');
        } finally {
            setRegenerating(null);
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
                                {/* ── De dónde salió (v4.1006) ──
                                    La trazabilidad del punto 21: un Reel que nació de una
                                    solicitud lo DICE, con su campaña y su artículo. Sin
                                    esto se ve igual que uno hecho a mano y no hay forma
                                    de saber qué material lo alimentó. */}
                                {!editing && reel.origin && (
                                    <div className="rounded-xl bg-fuchsia-50 border border-fuchsia-200 p-3 space-y-0.5">
                                        <p className="text-[10px] font-black text-fuchsia-700 uppercase tracking-wider">
                                            Generado desde Solicitud{reel.origin.versionNumber > 1 ? ` · v${reel.origin.versionNumber}` : ''}
                                        </p>
                                        {reel.origin.campaignName && (
                                            <p className="text-[11px] text-gray-700">Campaña: <b data-no-translate>{reel.origin.campaignName}</b></p>
                                        )}
                                        {(reel.origin.submissionTitle || reel.origin.club) && (
                                            <p className="text-[11px] text-gray-700">
                                                Solicitud: <span data-no-translate>{reel.origin.submissionTitle || '—'}</span>
                                                {reel.origin.club ? <> · <span data-no-translate>{reel.origin.club}</span></> : null}
                                            </p>
                                        )}
                                        {reel.origin.articleTitle && (
                                            <p className="text-[11px] text-gray-700">Artículo: <span data-no-translate>{reel.origin.articleTitle}</span></p>
                                        )}
                                        <a href={`/admin/campanas-contribucion/solicitudes?abrir=${reel.origin.submissionId}`}
                                            className="inline-block mt-1 text-[11px] font-bold text-fuchsia-700 hover:underline">
                                            Ver la solicitud de origen
                                        </a>
                                    </div>
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

                                <OutroSection reel={reel} onChanged={onChanged} />

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

                    {/* ── Por qué una escena no se animó, ARRIBA (v4.790) ──
                        v4.787 puso el aviso en la tarjeta de cada escena y aun
                        así el reporte siguiente fue «no veo ninguna de las
                        dos»: hay que bajar hasta la tarjeta y saber qué se
                        busca. El resumen va antes de la rejilla, que es lo
                        primero que se mira al abrir la pestaña. */}
                    {tab === 'escenas' && (reel.scenes || []).some(sc => sc.fidelity?.substituted) && (
                        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50/70 p-4">
                            <div className="text-xs font-black uppercase tracking-wide text-amber-800">
                                {(reel.scenes || []).filter(sc => sc.fidelity?.substituted).length} de {(reel.scenes || []).length} escenas
                                no se animaron con IA
                            </div>
                            <p className="text-[11px] text-amber-800 mt-1 leading-snug">
                                El motor generó estas escenas, el control de calidad las descartó y se
                                resolvieron con la fotografía en movimiento cinematográfico, sin IA y sin
                                gastar más créditos. Se pueden volver a intentar una por una.
                            </p>
                            <ul className="mt-2 space-y-1">
                                {(reel.scenes || []).filter(sc => sc.fidelity?.substituted).map(sc => (
                                    <li key={sc.id} className="text-[11px] text-amber-900 leading-snug">
                                        <b>Escena {sc.position + 1}:</b>{' '}
                                        {sc.fidelity?.reason || sc.statusDetail || 'sin motivo registrado'}
                                    </li>
                                ))}
                            </ul>
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
                                                sc.fidelity.method === 'still-motion' ? 'text-gray-500'
                                                    : sc.fidelity.state === 'ok' ? 'text-emerald-600'
                                                    : sc.fidelity.state === 'failed' ? 'text-red-600' : 'text-gray-400'
                                            }`}>
                                                {/* La escala de fidelidad es 0-10, no 0-1: mostrarla como
                                                    porcentaje daba «800 %». Se muestra igual que en el
                                                    Creador, que es donde el usuario la ve primero. */}
                                                {/* Una escena resuelta sin motor no se puntúa como
                                                    una animada: «10/10» sobre la fotografía misma
                                                    es cierto y se lee como una escena lograda, que
                                                    es justo la confusión reportada. */}
                                                Fidelidad: {sc.fidelity.method === 'still-motion' ? 'es la fotografía original'
                                                    : sc.fidelity.state === 'ok' ? `${sc.fidelity.score ?? '—'}/10`
                                                    : sc.fidelity.state === 'failed' ? 'no conservó la foto' : 'no comprobada'}
                                            </div>
                                        )}
                                        {/* Que la escena VIVA es otra pregunta que la fidelidad,
                                            y hasta v4.786 esta ficha no la hacía: una escena
                                            sustituida por la fotografía en movimiento se leía
                                            como lograda porque sólo se veía «Fidelidad: 10/10».
                                            Es el mismo componente que el Creador, a propósito. */}
                                        <SceneLifeCheck fidelity={sc.fidelity} engine={sc.engine} />
                                        <ScenePeopleCheck people={sc.fidelity?.people} />
                                        <SceneBrandCheck brand={sc.fidelity?.brand} />
                                        {sc.sourceImageUrl && (
                                            <a href={sc.sourceImageUrl} target="_blank" rel="noreferrer"
                                               className="text-[10px] font-bold text-indigo-600 hover:underline block">
                                                Foto original
                                            </a>
                                        )}
                                        {isTerminal(reel.status) && (
                                            <button
                                                onClick={() => regenerateScene(sc)}
                                                disabled={regenerating !== null}
                                                title="Vuelve a generar sólo esta escena. Gasta una generación de video; el clip actual se conserva."
                                                className="mt-1 px-2 py-1 rounded-md border border-gray-200 text-[10px] font-bold text-gray-700 hover:border-indigo-300 flex items-center gap-1 disabled:opacity-50"
                                            >
                                                {regenerating === sc.id
                                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                                    : <RefreshCw className="w-3 h-3" />}
                                                Regenerar escena
                                            </button>
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

const ReelLibrary: React.FC<{ onDuplicate?: (prefill: unknown) => void; initialReelId?: string | null }> = ({ onDuplicate, initialReelId = null }) => {
    const [reels, setReels] = useState<Reel[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Reel | null>(null);

    // ── Abrir un Reel EXISTENTE por su id (v4.1030) ──
    // «Editar en el Estudio» tiene que aterrizar en la ficha del MISMO
    // proyecto —con sus escenas listas, la fallida y sus acciones—, no en un
    // creador vacío. Se pide la ficha completa al servidor: el listado trae
    // 60 y el Reel puede no estar entre ellos. Un id que no existe se dice.
    useEffect(() => {
        if (!initialReelId) return;
        let cancelled = false;
        (async () => {
            try {
                const r = await fetch(`${API}/content-studio/reels/${initialReelId}`, { headers: authHeaders() });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json();
                if (!cancelled && data?.id) setSelected(data);
            } catch {
                // Un id que no existe para ESTE sitio se dice con su causa: la
                // ficha del Reel vive en el sitio que lo generó.
                if (!cancelled) toast.error('No se encontró ese Reel en la Biblioteca de este sitio: puede pertenecer a otro sitio o haberse eliminado.');
            }
        })();
        return () => { cancelled = true; };
    }, [initialReelId]);

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

    // ── Refresco automático mientras haya algo generándose ──
    //
    // Sondeo y no WebSocket/SSE a propósito: la API corre en funciones
    // serverless con un tope de 120 s por invocación, así que una conexión
    // abierta se cortaría sola y consumiría tiempo de función mientras espera.
    //
    // El intervalo sólo existe mientras hay trabajo: en cuanto los Reels
    // terminan, el efecto se desmonta y la Biblioteca deja de consultar. Una
    // pantalla abierta toda la tarde sobre Reels terminados no genera tráfico.
    const hasRunning = useMemo(() => reels.some(r => !isTerminal(r.status)), [reels]);
    useEffect(() => {
        if (!hasRunning) return;
        const id = window.setInterval(() => { load(search); }, 5000);
        return () => window.clearInterval(id);
    }, [hasRunning, search, load]);

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

    // Cancelar no detiene al proveedor —su API no lo permite y los créditos ya
    // se gastaron—: detiene NUESTRA máquina de estados. El texto lo dice así.
    const cancel = async (reel: Reel) => {
        if (!window.confirm(
            `¿Cancelar la generación de «${reel.title}»?\n\n` +
            'Los clips que el proveedor ya esté generando no se pueden retirar y sus créditos ya se consumieron. ' +
            'Lo que se detiene es el resto del proceso: no se montará el Reel. Podrás reintentarlo después.'
        )) return;
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/cancel`, {
                method: 'POST', headers: authHeaders()
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo cancelar');
            setReels(rs => rs.map(x => (x.id === data.id ? data : x)));
            if (selected?.id === data.id) setSelected(data);
            toast.success('Generación cancelada');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo cancelar');
        }
    };

    const retry = async (reel: Reel) => {
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/retry`, {
                method: 'POST', headers: authHeaders()
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo reintentar');
            setReels(rs => rs.map(x => (x.id === data.id ? data : x)));
            if (selected?.id === data.id) setSelected(data);
            toast.success(reel.status === 'incomplete' ? 'Continuando las escenas pendientes' : 'Reintentando', {
                description: 'Se conservan las fotos, los textos, la música, la locución y las escenas ya generadas. Sólo se relanza lo que falló, y lo listo no vuelve a consumir créditos.'
            });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo reintentar');
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
                    {reels.map(reel => {
                        const running = !isTerminal(reel.status);
                        // La miniatura provisional es la PRIMERA FOTO de origen.
                        // Un Reel en curso no tiene portada todavía, y un
                        // rectángulo gris no dice de cuál se trata; su propia
                        // foto sí, y es la que el usuario acaba de elegir.
                        const placeholder = reel.config?.sourceImages?.[0]?.url || null;
                        return (
                            <div
                                key={reel.id}
                                className="text-left rounded-2xl border border-gray-100 overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all group flex flex-col"
                            >
                                <button onClick={() => setSelected(reel)} className="text-left">
                                    <div className="relative bg-black aspect-[9/16]">
                                        {reel.posterUrl ? (
                                            <img src={reel.posterUrl} alt={reel.title} className="w-full h-full object-cover" />
                                        ) : reel.videoUrl ? (
                                            <video src={reel.videoUrl} muted preload="metadata" className="w-full h-full object-cover" />
                                        ) : placeholder ? (
                                            <img src={placeholder} alt="" className={`w-full h-full object-cover ${running ? 'opacity-40' : 'opacity-70'}`} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Film className="w-6 h-6 text-gray-600" />
                                            </div>
                                        )}
                                        {running && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30">
                                                <Loader2 className="w-6 h-6 text-white animate-spin" />
                                                <span className="text-[10px] font-black text-white tabular-nums">
                                                    {Math.round((reel.progress || 0) * 100)}%
                                                </span>
                                            </div>
                                        )}
                                        {!running && reel.durationSec && (
                                            <span className="absolute bottom-2 right-2 text-[10px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded">
                                                {Math.round(reel.durationSec)}s
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-3 space-y-1.5">
                                        <div className="text-xs font-black text-gray-900 line-clamp-2 leading-snug">{reel.title}</div>
                                        <StatusChip reel={reel} />
                                        <ProgressBar reel={reel} />
                                        <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                            <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{fmtDate(reel.savedToLibraryAt || reel.createdAt)}</span>
                                            {reel.creditsEstimated > 0 && (
                                                <span className="flex items-center gap-0.5"><Coins className="w-3 h-3" />{reel.creditsEstimated}</span>
                                            )}
                                            {reel.engineLabel && (
                                                <span className="truncate">{reel.engineLabel.split('—')[0].trim()}</span>
                                            )}
                                        </div>
                                    </div>
                                </button>

                                {(reel.cancellable || reel.retryable) && (
                                    <div className="px-3 pb-3 -mt-1 flex gap-1.5">
                                        {reel.cancellable && (
                                            <button
                                                onClick={() => cancel(reel)}
                                                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-[10px] font-bold hover:bg-gray-200"
                                            >
                                                <Ban className="w-3 h-3" /> Cancelar
                                            </button>
                                        )}
                                        {reel.retryable && (
                                            <button
                                                onClick={() => retry(reel)}
                                                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-bold hover:bg-indigo-100"
                                            >
                                                <RotateCcw className="w-3 h-3" />
                                                {reel.status === 'incomplete'
                                                    ? `Continuar ${reel.scenesPending ?? ''} pendiente${(reel.scenesPending ?? 0) === 1 ? '' : 's'}`.replace(/\s+/g, ' ')
                                                    : 'Reintentar'}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {reel.status === 'error' && reel.statusDetail && (
                                    <p className="px-3 pb-3 -mt-1 text-[10px] text-red-600 line-clamp-2">{reel.statusDetail}</p>
                                )}
                            </div>
                        );
                    })}
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
