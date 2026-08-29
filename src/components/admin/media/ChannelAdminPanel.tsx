// ════════════════════════════════════════════════════════════════════════════
// «Administrar canal» — el canal de capacitaciones DENTRO de la Biblioteca
// Multimedia (v4.954). No hay un CMS aparte: la decisión se toma donde ya se
// trabaja con los archivos (regla de las pantallas del segundo lugar).
//
// La ficha de cada video vive en `MediaChannelVideo` (relacionada con `Media`
// por id): el archivo no se toca, no se mueve y su URL directa de S3 sigue
// sirviendo — cero enlaces rotos. Lo que este panel edita es la CAPACITACIÓN
// lógica: título público, slug, acceso, vista previa, comentarios, orden.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    X, Loader2, GraduationCap, Copy, ExternalLink, ChevronUp, ChevronDown,
    MessageCircle, BarChart3, Settings2, Film, Pin, Check,
} from 'lucide-react';
import MediaPicker from '../content-studio/MediaPicker';
import { uploadMediaFiles } from '../../../lib/mediaUpload';
import { ACCESS_MODE_LABELS, VIDEO_STATE_LABELS, VIEWER_ROLE_LABELS, PREVIEW_CHOICES, fmtDuration } from '../../../lib/trainingChannel';

const API = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

interface Ficha {
    id: string; slug: string; title: string; description: string;
    thumbUrl: string | null; durationSec: number | null; category: string | null;
    tags: string[]; instructor: string | null; publishedAt: string | null;
    previewSec: number | null; accessMode: string; allowedRoles: string[];
    commentsEnabled: boolean | null; status: string; sortOrder: number | null;
}

interface VideoRow {
    mediaId: string; filename: string; url: string; mediaThumbUrl: string | null;
    size: number; uploadedAt: string; ficha: Ficha | null;
}

interface Channel {
    id: string; slug: string; name: string; description: string;
    bannerUrl: string | null; active: boolean; defaultPreviewSec: number;
    completionPct: number; commentsEnabled: boolean;
    seoTitle: string | null; seoDescription: string | null;
}

interface Props {
    folderId: string;
    folderName: string;
    clubId: string | null; // el del operador parado en otro sitio; null = el propio
    onClose: () => void;
}

const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${API}/trainings/${path}`, {
        method,
        headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* HTML de error */ }
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
    return data;
};

/** Duración leída del PROPIO archivo en el navegador, sin descargarlo entero. */
const readDuration = (url: string): Promise<number | null> => new Promise(resolve => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    const done = (d: number | null) => { v.src = ''; resolve(d); };
    const timer = window.setTimeout(() => done(null), 8000);
    v.onloadedmetadata = () => { window.clearTimeout(timer); done(Number.isFinite(v.duration) ? Math.round(v.duration) : null); };
    v.onerror = () => { window.clearTimeout(timer); done(null); };
    v.src = url;
});

const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1';

const ChannelAdminPanel = ({ folderId, folderName, clubId, onClose }: Props) => {
    const [channel, setChannel] = useState<Channel | null>(null);
    const [videos, setVideos] = useState<VideoRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<'canal' | 'videos' | 'metricas'>('videos');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    // Ajustes del canal (borrador local; guardar es explícito).
    const [form, setForm] = useState<Partial<Channel>>({});
    const [pickerFor, setPickerFor] = useState<'banner' | string | null>(null);
    const bannerFileRef = useRef<HTMLInputElement | null>(null);

    // Ficha abierta en edición.
    const [editing, setEditing] = useState<string | null>(null); // mediaId
    const [ficha, setFicha] = useState<Partial<Ficha>>({});
    const [tagsText, setTagsText] = useState('');
    const [previewMode, setPreviewMode] = useState<'hereda' | 'propio'>('hereda');

    // Miniatura desde un fotograma del propio video (v4.956, estilo YouTube):
    // el video se reproduce acá para ELEGIR el segundo; la extracción la hace
    // el servidor con ffmpeg — dibujarlo en un canvas del navegador dejaría
    // el canvas «tainted» y toBlob lanzaría.
    const [frameOpen, setFrameOpen] = useState(false);
    const [frameBusy, setFrameBusy] = useState(false);
    const frameVideoRef = useRef<HTMLVideoElement | null>(null);

    // Comentarios de una ficha.
    const [commentsFor, setCommentsFor] = useState<Ficha | null>(null);
    const [adminComments, setAdminComments] = useState<any[]>([]);

    // Métricas.
    const [metrics, setMetrics] = useState<{ counters: any[]; progress: any[] } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ folderId });
            if (clubId) params.set('clubId', clubId);
            const data = await call('GET', `admin/channel?${params.toString()}`);
            setChannel(data.channel);
            setVideos(data.videos || []);
            if (data.channel) setForm(data.channel);
        } catch (e: any) {
            setError(e?.message || 'No se pudo cargar el canal.');
        } finally {
            setLoading(false);
        }
    }, [folderId, clubId]);

    useEffect(() => { load(); }, [load]);

    const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(null), 3500); };

    const activar = async () => {
        setBusy(true);
        try {
            await call('POST', 'admin/channel', { folderId, clubId: clubId || undefined, name: folderName });
            await load();
            setTab('canal');
            flash('Canal creado. Configúralo y actívalo cuando esté listo.');
        } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
    };

    const guardarCanal = async () => {
        if (!channel) return;
        setBusy(true);
        try {
            const data = await call('PATCH', `admin/channel/${channel.id}${clubId ? `?clubId=${clubId}` : ''}`, form);
            setChannel(data.channel);
            setForm(data.channel);
            flash('Canal guardado.');
        } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
    };

    const crearFicha = async (row: VideoRow) => {
        if (!channel) return;
        setBusy(true);
        try {
            const durationSec = await readDuration(row.url);
            await call('POST', `admin/channel/${channel.id}/videos${clubId ? `?clubId=${clubId}` : ''}`, { mediaId: row.mediaId, durationSec });
            await load();
        } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
    };

    const abrirEdicion = (row: VideoRow) => {
        if (!row.ficha) return;
        setEditing(row.mediaId);
        setFicha(row.ficha);
        setTagsText((row.ficha.tags || []).join(', '));
        setPreviewMode(row.ficha.previewSec === null || row.ficha.previewSec === undefined ? 'hereda' : 'propio');
        setFrameOpen(false);
    };

    const capturarFotograma = async () => {
        const el = frameVideoRef.current;
        if (!el || !ficha.id || frameBusy) return;
        setFrameBusy(true);
        try {
            const atSec = Math.max(0, Math.floor(el.currentTime || 0));
            const data = await call('POST', `admin/videos/${ficha.id}/frame${clubId ? `?clubId=${clubId}` : ''}`, { atSec });
            setFicha(v => ({ ...v, thumbUrl: data.url }));
            setFrameOpen(false);
            flash('Fotograma capturado. Guarda la ficha para aplicarlo.');
        } catch (e: any) {
            setError(e?.message || 'No se pudo extraer el fotograma.');
        } finally {
            setFrameBusy(false);
        }
    };

    const guardarFicha = async () => {
        if (!ficha.id) return;
        setBusy(true);
        try {
            const body: Record<string, unknown> = {
                title: ficha.title, slug: ficha.slug, description: ficha.description,
                thumbUrl: ficha.thumbUrl, category: ficha.category, instructor: ficha.instructor,
                durationSec: ficha.durationSec, publishedAt: ficha.publishedAt,
                accessMode: ficha.accessMode, allowedRoles: ficha.allowedRoles,
                commentsEnabled: ficha.commentsEnabled, status: ficha.status,
                previewSec: previewMode === 'hereda' ? null : (ficha.previewSec ?? 0),
                tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
            };
            const data = await call('PATCH', `admin/videos/${ficha.id}${clubId ? `?clubId=${clubId}` : ''}`, body);
            if (data.slugChanged) flash(`El slug ya estaba ocupado: quedó «${data.ficha.slug}».`);
            else flash('Ficha guardada.');
            setEditing(null);
            await load();
        } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
    };

    const mover = async (index: number, dir: -1 | 1) => {
        if (!channel) return;
        const conFicha = videos.filter(v => v.ficha);
        const target = index + dir;
        if (target < 0 || target >= conFicha.length) return;
        const order = conFicha.map(v => v.ficha!.id);
        [order[index], order[target]] = [order[target], order[index]];
        setBusy(true);
        try {
            await call('POST', `admin/channel/${channel.id}/reorder${clubId ? `?clubId=${clubId}` : ''}`, { order });
            await load();
        } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
    };

    const abrirComentarios = async (f: Ficha) => {
        setCommentsFor(f);
        try {
            const data = await call('GET', `admin/videos/${f.id}/comments${clubId ? `?clubId=${clubId}` : ''}`);
            setAdminComments(data.comments || []);
        } catch (e: any) { setError(e?.message); }
    };

    const moderar = async (id: string, patch: { status?: string; pinned?: boolean }) => {
        try {
            const data = await call('PATCH', `admin/comments/${id}${clubId ? `?clubId=${clubId}` : ''}`, patch);
            setAdminComments(prev => prev.map(c => (c.id === id ? data.comment : c)));
        } catch (e: any) { setError(e?.message); }
    };

    const cargarMetricas = useCallback(async () => {
        if (!channel) return;
        try {
            const data = await call('GET', `admin/channel/${channel.id}/metrics${clubId ? `?clubId=${clubId}` : ''}`);
            setMetrics(data);
        } catch (e: any) { setError(e?.message); }
    }, [channel, clubId]);

    useEffect(() => { if (tab === 'metricas') cargarMetricas(); }, [tab, cargarMetricas]);

    const publicBase = `${window.location.origin}/capacitaciones`;
    const copiar = (text: string, msg: string) => { navigator.clipboard.writeText(text); flash(msg); };

    const subirBanner = async (files: FileList | null) => {
        if (!files?.length) return;
        setBusy(true);
        try {
            const res = await uploadMediaFiles([files[0]], { clubId: clubId || undefined });
            const up = res.uploaded[0];
            if (up) setForm(f => ({ ...f, bannerUrl: up.url }));
            if (res.failed.length) setError(`No se pudo subir ${res.failed[0].name}: ${res.failed[0].reason}`);
        } finally {
            setBusy(false);
            if (bannerFileRef.current) bannerFileRef.current.value = '';
        }
    };

    const conFicha = videos.filter(v => v.ficha);
    const sinFicha = videos.filter(v => !v.ficha);

    const counterOf = (videoId: string, type: string) =>
        metrics?.counters.find(c => c.videoId === videoId && c.type === type)?.n ?? 0;
    const channelCounter = (type: string) =>
        (metrics?.counters || []).filter(c => c.type === type).reduce((a, c) => a + c.n, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Cabecera */}
                <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3 rounded-t-2xl">
                    <span className="w-9 h-9 rounded-xl bg-sky-50 text-rotary-blue flex items-center justify-center"><GraduationCap className="w-5 h-5" /></span>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-gray-900 truncate">Canal de capacitaciones — {folderName}</h2>
                        {channel && (
                            <p className="text-[12px] text-gray-400 flex items-center gap-2">
                                <span className={`font-bold ${channel.active ? 'text-emerald-600' : 'text-amber-600'}`}>{channel.active ? 'Activo' : 'Inactivo'}</span>
                                <span data-no-translate>{publicBase}</span>
                                <button onClick={() => copiar(publicBase, 'Enlace del canal copiado.')} className="text-gray-400 hover:text-rotary-blue" title="Copiar enlace del canal"><Copy className="w-3.5 h-3.5" /></button>
                                <a href={publicBase} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-rotary-blue" title="Abrir el canal"><ExternalLink className="w-3.5 h-3.5" /></a>
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                {notice && <div className="mx-6 mt-4 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold">{notice}</div>}
                {error && <div className="mx-6 mt-4 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-bold">{error}</div>}

                {loading ? (
                    <div className="py-24 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-rotary-blue" /></div>
                ) : !channel ? (
                    <div className="px-6 py-16 text-center">
                        <GraduationCap className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                        <h3 className="text-lg font-bold text-gray-800 mb-2">Esta carpeta todavía no es un canal</h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
                            Al activarlo, los videos de «{folderName}» se pueden publicar en la página pública
                            <span data-no-translate> /capacitaciones</span> con su propia ficha, vista previa y comentarios.
                            Los archivos no se mueven y sus enlaces directos siguen funcionando.
                        </p>
                        <button onClick={activar} disabled={busy} className="px-6 py-2.5 bg-rotary-blue text-white rounded-xl font-bold hover:bg-rotary-navy transition-all disabled:opacity-50">
                            {busy ? 'Creando…' : 'Activar canal en esta carpeta'}
                        </button>
                    </div>
                ) : (
                    <div className="px-6 py-5">
                        {/* Pestañas */}
                        <div className="flex gap-2 mb-5">
                            {([['videos', 'Videos', Film], ['canal', 'Ajustes del canal', Settings2], ['metricas', 'Métricas', BarChart3]] as const).map(([id, label, Icon]) => (
                                <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === id ? 'bg-rotary-blue text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                                    <Icon className="w-4 h-4" /> {label}
                                </button>
                            ))}
                        </div>

                        {/* ── Ajustes del canal ── */}
                        {tab === 'canal' && (
                            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Nombre público</label>
                                        <input className={inputCls} value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Vista previa por defecto (segundos)</label>
                                        <div className="flex gap-2">
                                            {PREVIEW_CHOICES.map(s => (
                                                <button key={s} onClick={() => setForm(f => ({ ...f, defaultPreviewSec: s }))} className={`px-3 py-2 rounded-xl text-sm font-bold border ${form.defaultPreviewSec === s ? 'bg-rotary-blue text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'}`} data-no-translate>{s}</button>
                                            ))}
                                            <input type="number" min={0} max={3600} className={`${inputCls} w-24`} value={form.defaultPreviewSec ?? 60} onChange={e => setForm(f => ({ ...f, defaultPreviewSec: Number(e.target.value) }))} />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Descripción</label>
                                    <textarea rows={3} className={inputCls} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                                </div>
                                <div>
                                    <label className={labelCls}>Imagen de cabecera</label>
                                    <div className="flex items-center gap-3">
                                        {form.bannerUrl && <img src={form.bannerUrl} alt="" className="h-14 rounded-lg object-cover" />}
                                        <button onClick={() => bannerFileRef.current?.click()} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-100">Subir archivo</button>
                                        <button onClick={() => setPickerFor('banner')} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-100">Elegir de la Biblioteca</button>
                                        {form.bannerUrl && <button onClick={() => setForm(f => ({ ...f, bannerUrl: null }))} className="text-sm font-bold text-gray-400 hover:text-red-500">Quitar</button>}
                                        <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={e => subirBanner(e.target.files)} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className={labelCls}>Completada al llegar al…</label>
                                        <div className="flex items-center gap-2">
                                            <input type="number" min={50} max={100} className={`${inputCls} w-24`} value={form.completionPct ?? 90} onChange={e => setForm(f => ({ ...f, completionPct: Number(e.target.value) }))} />
                                            <span className="text-sm text-gray-500">% del video</span>
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm font-bold text-gray-600 pt-5">
                                        <input type="checkbox" checked={form.commentsEnabled !== false} onChange={e => setForm(f => ({ ...f, commentsEnabled: e.target.checked }))} className="w-4 h-4" />
                                        Comentarios habilitados
                                    </label>
                                    <label className="flex items-center gap-2 text-sm font-bold text-gray-600 pt-5">
                                        <input type="checkbox" checked={Boolean(form.active)} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="w-4 h-4" />
                                        Canal activo (visible al público)
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Título SEO (opcional)</label>
                                        <input className={inputCls} value={form.seoTitle || ''} onChange={e => setForm(f => ({ ...f, seoTitle: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Descripción SEO (opcional)</label>
                                        <input className={inputCls} value={form.seoDescription || ''} onChange={e => setForm(f => ({ ...f, seoDescription: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button onClick={guardarCanal} disabled={busy} className="px-6 py-2.5 bg-rotary-blue text-white rounded-xl font-bold hover:bg-rotary-navy transition-all disabled:opacity-50">
                                        {busy ? 'Guardando…' : 'Guardar canal'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Videos ── */}
                        {tab === 'videos' && (
                            <div className="space-y-3">
                                {conFicha.length === 0 && sinFicha.length === 0 && (
                                    <p className="text-sm text-gray-500 py-8 text-center">Esta carpeta no tiene videos. Sube los archivos desde la Biblioteca y vuelve acá.</p>
                                )}

                                {conFicha.map((row, i) => {
                                    const f = row.ficha!;
                                    const abierto = editing === row.mediaId;
                                    return (
                                        <div key={row.mediaId} className="bg-white rounded-2xl border border-gray-100 p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col gap-0.5">
                                                    <button onClick={() => mover(i, -1)} disabled={busy || i === 0} className="p-0.5 text-gray-300 hover:text-rotary-blue disabled:opacity-30" title="Subir en el orden"><ChevronUp className="w-4 h-4" /></button>
                                                    <button onClick={() => mover(i, 1)} disabled={busy || i === conFicha.length - 1} className="p-0.5 text-gray-300 hover:text-rotary-blue disabled:opacity-30" title="Bajar en el orden"><ChevronDown className="w-4 h-4" /></button>
                                                </div>
                                                <div className="w-20 aspect-video rounded-lg overflow-hidden bg-gray-900 shrink-0">
                                                    {(f.thumbUrl || row.mediaThumbUrl) && <img src={f.thumbUrl || row.mediaThumbUrl || ''} alt="" className="w-full h-full object-cover" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-gray-800 truncate">{f.title}</p>
                                                    <p className="text-[12px] text-gray-400 truncate">
                                                        <span className={`font-bold ${f.status === 'publicado' ? 'text-emerald-600' : 'text-amber-600'}`}>{VIDEO_STATE_LABELS[f.status] || f.status}</span>
                                                        {' · '}{ACCESS_MODE_LABELS[f.accessMode] || f.accessMode}
                                                        {f.durationSec ? <span data-no-translate>{' · '}{fmtDuration(f.durationSec)}</span> : null}
                                                    </p>
                                                </div>
                                                <button onClick={() => copiar(`${publicBase}/${f.slug}`, 'Enlace de la capacitación copiado.')} className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-sky-50 text-rotary-blue hover:bg-sky-100" title="Copiar enlace de capacitación (la página, no el archivo)">
                                                    Copiar enlace
                                                </button>
                                                <button onClick={() => abrirComentarios(f)} className="p-2 text-gray-400 hover:text-rotary-blue rounded-lg hover:bg-sky-50" title="Comentarios"><MessageCircle className="w-4 h-4" /></button>
                                                <button onClick={() => (abierto ? setEditing(null) : abrirEdicion(row))} className={`px-3 py-1.5 text-[12px] font-bold rounded-lg ${abierto ? 'bg-gray-100 text-gray-600' : 'bg-rotary-blue text-white hover:bg-rotary-navy'}`}>
                                                    {abierto ? 'Cerrar' : 'Editar'}
                                                </button>
                                            </div>

                                            {abierto && (
                                                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className={labelCls}>Título público</label>
                                                        <input className={inputCls} value={ficha.title || ''} onChange={e => setFicha(v => ({ ...v, title: e.target.value }))} />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Slug (la dirección /capacitaciones/…)</label>
                                                        <input className={inputCls} value={ficha.slug || ''} onChange={e => setFicha(v => ({ ...v, slug: e.target.value }))} data-no-translate />
                                                    </div>
                                                    <div className="sm:col-span-2">
                                                        <label className={labelCls}>Descripción</label>
                                                        <textarea rows={3} className={inputCls} value={ficha.description || ''} onChange={e => setFicha(v => ({ ...v, description: e.target.value }))} />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Categoría</label>
                                                        <input className={inputCls} value={ficha.category || ''} onChange={e => setFicha(v => ({ ...v, category: e.target.value }))} />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Instructor / ponente</label>
                                                        <input className={inputCls} value={ficha.instructor || ''} onChange={e => setFicha(v => ({ ...v, instructor: e.target.value }))} />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Etiquetas (separadas por coma)</label>
                                                        <input className={inputCls} value={tagsText} onChange={e => setTagsText(e.target.value)} />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Fecha de publicación</label>
                                                        <input type="date" className={inputCls} value={ficha.publishedAt ? String(ficha.publishedAt).slice(0, 10) : ''} onChange={e => setFicha(v => ({ ...v, publishedAt: e.target.value || null }))} />
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Duración (segundos)</label>
                                                        <input type="number" min={0} className={inputCls} value={ficha.durationSec ?? ''} onChange={e => setFicha(v => ({ ...v, durationSec: e.target.value ? Number(e.target.value) : null }))} data-no-translate />
                                                    </div>
                                                    <div className="sm:col-span-2">
                                                        <label className={labelCls}>Miniatura</label>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            {ficha.thumbUrl && <img src={ficha.thumbUrl} alt="" className="h-12 rounded object-cover" />}
                                                            <button onClick={() => setFrameOpen(o => !o)} className={`px-3 py-2 rounded-xl text-[12px] font-bold ${frameOpen ? 'bg-rotary-blue text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                                                                Elegir fotograma del video
                                                            </button>
                                                            <button onClick={() => setPickerFor(row.mediaId)} className="px-3 py-2 rounded-xl border border-gray-200 text-[12px] font-bold text-gray-600 hover:bg-gray-100">Elegir de la Biblioteca</button>
                                                            {ficha.thumbUrl && <button onClick={() => setFicha(v => ({ ...v, thumbUrl: null }))} className="text-[12px] font-bold text-gray-400 hover:text-red-500">Quitar</button>}
                                                        </div>
                                                        {frameOpen && (
                                                            <div className="mt-3 bg-gray-900 rounded-xl overflow-hidden">
                                                                {/* Se navega con los controles del reproductor hasta el
                                                                    cuadro exacto; la extracción la hace el servidor. */}
                                                                <video ref={frameVideoRef} src={row.url} controls preload="metadata" className="w-full max-h-72" />
                                                                <div className="flex items-center justify-between gap-3 p-3 bg-gray-800">
                                                                    <p className="text-[12px] text-gray-300">Pausa el video en el cuadro que quieras y captúralo.</p>
                                                                    <button onClick={capturarFotograma} disabled={frameBusy} className="px-4 py-2 rounded-xl bg-rotary-gold text-gray-900 text-[12px] font-bold disabled:opacity-60 shrink-0">
                                                                        {frameBusy ? 'Extrayendo…' : 'Usar este fotograma'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Modo de acceso</label>
                                                        <select className={inputCls} value={ficha.accessMode || 'publico'} onChange={e => setFicha(v => ({ ...v, accessMode: e.target.value }))}>
                                                            {Object.entries(ACCESS_MODE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                                                        </select>
                                                    </div>
                                                    {ficha.accessMode === 'roles' && (
                                                        <div className="sm:col-span-2">
                                                            <label className={labelCls}>Roles permitidos</label>
                                                            <div className="flex flex-wrap gap-3">
                                                                {Object.entries(VIEWER_ROLE_LABELS).map(([k, l]) => (
                                                                    <label key={k} className="flex items-center gap-1.5 text-sm text-gray-600">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={(ficha.allowedRoles || []).includes(k)}
                                                                            onChange={e => setFicha(v => ({ ...v, allowedRoles: e.target.checked ? [...(v.allowedRoles || []), k] : (v.allowedRoles || []).filter(r => r !== k) }))}
                                                                        />
                                                                        {l}
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {ficha.accessMode === 'preview' && (
                                                        <div>
                                                            <label className={labelCls}>Vista previa</label>
                                                            <div className="flex items-center gap-2">
                                                                <select className={`${inputCls} w-auto`} value={previewMode} onChange={e => setPreviewMode(e.target.value as 'hereda' | 'propio')}>
                                                                    <option value="hereda">Hereda del canal ({channel.defaultPreviewSec}s)</option>
                                                                    <option value="propio">Propia de este video</option>
                                                                </select>
                                                                {previewMode === 'propio' && (
                                                                    <input type="number" min={0} max={3600} className={`${inputCls} w-24`} value={ficha.previewSec ?? 60} onChange={e => setFicha(v => ({ ...v, previewSec: Number(e.target.value) }))} data-no-translate />
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <label className={labelCls}>Comentarios</label>
                                                        <select className={inputCls} value={ficha.commentsEnabled === null || ficha.commentsEnabled === undefined ? 'hereda' : (ficha.commentsEnabled ? 'si' : 'no')} onChange={e => setFicha(v => ({ ...v, commentsEnabled: e.target.value === 'hereda' ? null : e.target.value === 'si' }))}>
                                                            <option value="hereda">Hereda del canal</option>
                                                            <option value="si">Habilitados</option>
                                                            <option value="no">Desactivados</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className={labelCls}>Estado</label>
                                                        <select className={inputCls} value={ficha.status || 'borrador'} onChange={e => setFicha(v => ({ ...v, status: e.target.value }))}>
                                                            {Object.entries(VIDEO_STATE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="sm:col-span-2 flex justify-end gap-2">
                                                        <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100">Cancelar</button>
                                                        <button onClick={guardarFicha} disabled={busy} className="px-5 py-2 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-rotary-navy disabled:opacity-50">
                                                            {busy ? 'Guardando…' : 'Guardar ficha'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {sinFicha.length > 0 && (
                                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-4">
                                        <p className="text-[12px] font-bold uppercase tracking-wide text-gray-400 mb-3">Videos de la carpeta sin ficha (no salen al público)</p>
                                        <div className="space-y-2">
                                            {sinFicha.map(row => (
                                                <div key={row.mediaId} className="flex items-center gap-3">
                                                    <Film className="w-4 h-4 text-gray-300 shrink-0" />
                                                    <span className="flex-1 text-sm text-gray-600 truncate" data-no-translate>{row.filename}</span>
                                                    <button onClick={() => crearFicha(row)} disabled={busy} className="px-3 py-1.5 text-[12px] font-bold rounded-lg bg-sky-50 text-rotary-blue hover:bg-sky-100 disabled:opacity-50">
                                                        Crear ficha
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Métricas ── */}
                        {tab === 'metricas' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                    {[
                                        ['Vistas del canal', channelCounter('channel_view')],
                                        ['Vistas de videos', channelCounter('video_view')],
                                        ['Llegaron al límite', channelCounter('preview_lock')],
                                        ['Compartidos', channelCounter('share')],
                                        ['Cuentas creadas desde el candado', channelCounter('signup_from_lock')],
                                    ].map(([label, n]) => (
                                        <div key={String(label)} className="bg-white rounded-2xl border border-gray-100 p-4">
                                            <p className="text-2xl font-light text-gray-900" data-no-translate>{n as number}</p>
                                            <p className="text-[12px] text-gray-400 font-bold">{label}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-100">
                                                <th className="px-4 py-3">Capacitación</th>
                                                <th className="px-4 py-3">Vistas</th>
                                                <th className="px-4 py-3">Espectadores</th>
                                                <th className="px-4 py-3">Con cuenta</th>
                                                <th className="px-4 py-3">Prom. visto</th>
                                                <th className="px-4 py-3">% prom.</th>
                                                <th className="px-4 py-3">Completadas</th>
                                                <th className="px-4 py-3">Me gusta</th>
                                                <th className="px-4 py-3">Comentarios</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {conFicha.map(row => {
                                                const f = row.ficha!;
                                                const p = metrics?.progress.find(x => x.videoId === f.id);
                                                return (
                                                    <tr key={f.id} className="border-b border-gray-50">
                                                        <td className="px-4 py-3 font-bold text-gray-700 max-w-[220px] truncate">{f.title}</td>
                                                        <td className="px-4 py-3" data-no-translate>{counterOf(f.id, 'video_view')}</td>
                                                        <td className="px-4 py-3" data-no-translate>{p?.viewers ?? 0}</td>
                                                        <td className="px-4 py-3" data-no-translate>{p?.authedViewers ?? 0}</td>
                                                        <td className="px-4 py-3" data-no-translate>{fmtDuration(p?.avgWatchSec ?? 0)}</td>
                                                        <td className="px-4 py-3" data-no-translate>{p?.avgPct ?? 0}%</td>
                                                        <td className="px-4 py-3" data-no-translate>{p?.completions ?? 0}</td>
                                                        <td className="px-4 py-3" data-no-translate>{p?.likes ?? 0}</td>
                                                        <td className="px-4 py-3" data-no-translate>{counterOf(f.id, 'comment')}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[12px] text-gray-400">
                                    Los espectadores sin sesión se cuentan con un identificador anónimo del navegador, sin rastreo entre sitios.
                                    Las «vistas» son un contador diario agregado; puede diferir levemente de los espectadores únicos.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Moderación de comentarios */}
                {commentsFor && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => setCommentsFor(null)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-900">Comentarios — {commentsFor.title}</h3>
                                <button onClick={() => setCommentsFor(null)} className="p-2 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                            </div>
                            {adminComments.length === 0 ? (
                                <p className="text-sm text-gray-400">No hay comentarios.</p>
                            ) : (
                                <div className="space-y-3">
                                    {adminComments.map(c => (
                                        <div key={c.id} className={`rounded-xl border p-3 ${c.status === 'visible' ? 'border-gray-100' : 'border-amber-100 bg-amber-50/40'}`}>
                                            <div className="flex items-center gap-2 text-sm">
                                                <strong className="text-gray-800" data-no-translate>{c.authorName}</strong>
                                                {c.parentId && <span className="text-[11px] text-gray-400">respuesta</span>}
                                                {c.pinned && <Pin className="w-3.5 h-3.5 text-rotary-blue" />}
                                                <span className="ml-auto flex items-center gap-2">
                                                    <select value={c.status} onChange={e => moderar(c.id, { status: e.target.value })} className="text-[12px] border border-gray-200 rounded-lg px-2 py-1">
                                                        <option value="visible">Visible</option>
                                                        <option value="oculto">Oculto</option>
                                                        <option value="spam">Spam</option>
                                                        <option value="borrado">Eliminado</option>
                                                    </select>
                                                    {!c.parentId && (
                                                        <button onClick={() => moderar(c.id, { pinned: !c.pinned })} className={`p-1.5 rounded-lg ${c.pinned ? 'bg-sky-50 text-rotary-blue' : 'text-gray-400 hover:text-rotary-blue'}`} title={c.pinned ? 'Quitar de fijados' : 'Fijar arriba'}>
                                                            {c.pinned ? <Check className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                                                        </button>
                                                    )}
                                                </span>
                                            </div>
                                            <p className="mt-1.5 text-sm text-gray-600 whitespace-pre-line">{c.body}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* UN solo MediaPicker por pantalla, con destino declarado (regla v4.700). */}
                <MediaPicker
                    isOpen={pickerFor !== null}
                    onClose={() => setPickerFor(null)}
                    maxSelection={1}
                    mediaType="image"
                    onSelect={(items) => {
                        const url = items[0]?.url;
                        if (!url) return;
                        if (pickerFor === 'banner') setForm(f => ({ ...f, bannerUrl: url }));
                        else if (pickerFor) setFicha(v => ({ ...v, thumbUrl: url }));
                        setPickerFor(null);
                    }}
                />
            </div>
        </div>
    );
};

export default ChannelAdminPanel;
