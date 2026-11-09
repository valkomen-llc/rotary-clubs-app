// ════════════════════════════════════════════════════════════════════
// Club Media Uploader — v4.1306.0
//
// El componente ÚNICO de carga de archivos del Directorio Distrital de
// Clubes: el formulario público de seis pasos (/clubes/registro) y el portal
// del club lo usan igual. Gestiona selección (botón, arrastrar y soltar,
// cámara del móvil), validación previa, progreso real, «Procesando» mientras
// el servidor revisa los bytes, confirmación, vista previa, reintento,
// reemplazo y eliminación con confirmación.
//
// ⚠️ «Guardado» = el servidor lo confirmó. Al volver a abrir el formulario
// (otro día, otro dispositivo) el componente PREGUNTA al servidor si el
// archivo sigue ahí antes de decir que está guardado.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    Upload, Image as ImageIcon, Camera, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Trash2, Star,
} from 'lucide-react';
import {
    ACCEPT_ATTRIBUTE, checkFileBeforeUpload, mediaIdFromUrl, formatBytes, formatLimit, ROLE_TEXT,
    DEFAULT_MAX_MB, DEFAULT_GALLERY_MAX, type ClubMediaRole,
} from '../../lib/clubMediaSpec';
import {
    uploadClubMedia, fetchClubMediaStatus, deleteClubMedia, fetchClubMediaLimits, displayUrl,
    ClubMediaUploadError, type ClubMedia, type ClubMediaAuth, type UploadPhase,
} from '../../lib/clubMediaUpload';

type Phase = 'idle' | 'verificando' | 'subiendo' | 'procesando' | 'guardado' | 'legacy' | 'error' | 'missing';

interface UploadErrorState { message: string; hint?: string; retryable: boolean }

const toErrorState = (err: unknown): UploadErrorState => {
    if (err instanceof ClubMediaUploadError) return { message: err.message, hint: err.hint, retryable: err.retryable };
    return { message: 'No pudimos subir el archivo.', hint: 'Vuelve a intentarlo.', retryable: true };
};

const useLimits = (role: ClubMediaRole) => {
    const [maxBytes, setMaxBytes] = useState(DEFAULT_MAX_MB[role] * 1024 * 1024);
    const [galleryMax, setGalleryMax] = useState(DEFAULT_GALLERY_MAX);
    useEffect(() => {
        let alive = true;
        fetchClubMediaLimits().then((l) => {
            if (!alive || !l) return;
            if (l.roles?.[role]?.maxBytes) setMaxBytes(l.roles[role].maxBytes);
            if (l.galleryMax) setGalleryMax(l.galleryMax);
        });
        return () => { alive = false; };
    }, [role]);
    return { maxBytes, galleryMax };
};

const StatusBadge: React.FC<{ phase: Phase; progress?: number; published?: boolean }> = ({ phase, progress, published }) => {
    if (phase === 'guardado') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> {published ? 'Publicado' : 'Guardado'}
            </span>
        );
    }
    if (phase === 'subiendo') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-rotary-blue border border-blue-200 text-[11px] font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo {progress ?? 0}%
            </span>
        );
    }
    if (phase === 'procesando' || phase === 'verificando') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {phase === 'procesando' ? 'Procesando' : 'Verificando'}
            </span>
        );
    }
    if (phase === 'error' || phase === 'missing') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">
                <AlertTriangle className="w-3.5 h-3.5" /> {phase === 'missing' ? 'No disponible' : 'Falló'}
            </span>
        );
    }
    if (phase === 'legacy') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 text-[11px] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> En el directorio
            </span>
        );
    }
    return null;
};

const ProgressBar: React.FC<{ phase: Phase; progress: number }> = ({ phase, progress }) => (
    <div className="w-full">
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase === 'procesando' ? 100 : progress}>
            <div
                className={`h-full rounded-full transition-all duration-300 ${phase === 'procesando' ? 'bg-amber-400 animate-pulse w-full' : 'bg-rotary-blue'}`}
                style={phase === 'procesando' ? undefined : { width: `${Math.max(3, progress)}%` }}
            />
        </div>
        <p className="mt-1.5 text-[11px] text-gray-500">
            {phase === 'procesando'
                ? 'Procesando: verificando el archivo y preparando la versión para el directorio…'
                : `Subiendo… ${progress}%`}
        </p>
    </div>
);

// ─── Un archivo (logotipo, portada) ───────────────────────────────────
export interface ClubMediaUploaderProps {
    role: Exclude<ClubMediaRole, 'gallery'>;
    value: string;
    onChange: (url: string) => void;
    auth: ClubMediaAuth;
    label?: string;
    hint?: string;
    /** Texto bajo el archivo guardado (p. ej. en el portal: recordar publicar). */
    savedNote?: string;
    disabled?: boolean;
}

export const ClubMediaUploader: React.FC<ClubMediaUploaderProps> = ({ role, value, onChange, auth, label, hint, savedNote, disabled }) => {
    const text = ROLE_TEXT[role];
    const { maxBytes } = useLimits(role);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [phase, setPhase] = useState<Phase>(value ? 'verificando' : 'idle');
    const [progress, setProgress] = useState(0);
    const [media, setMedia] = useState<ClubMedia | null>(null);
    const [error, setError] = useState<UploadErrorState | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [imgFailed, setImgFailed] = useState(false);
    const busy = phase === 'subiendo' || phase === 'procesando';
    const authRef = useRef(auth);
    authRef.current = auth;

    // Verificar con el servidor lo que el formulario dice tener (al recargar,
    // al retomar un borrador, al llegar con un perfil ya existente).
    useEffect(() => {
        if (busy) return;
        if (!value) {
            if (phase !== 'error') { setPhase('idle'); setMedia(null); }
            return;
        }
        const id = mediaIdFromUrl(value);
        if (!id) { setPhase('legacy'); setMedia(null); setImgFailed(false); return; }
        if (media?.id === id && phase === 'guardado') return;
        let alive = true;
        setPhase('verificando');
        fetchClubMediaStatus([id], authRef.current)
            .then((list) => {
                if (!alive) return;
                const found = list.find(m => m.id === id);
                if (found && (found.status === 'guardado' || found.status === 'publicado')) {
                    setMedia(found);
                    setPhase('guardado');
                    setImgFailed(false);
                } else {
                    setMedia(null);
                    setPhase('missing');
                }
            })
            .catch(() => {
                // Sin red para verificar: se muestra la imagen tal cual; si no
                // carga, el `onError` del <img> lo dice.
                if (alive) { setPhase('guardado'); setMedia(null); }
            });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleFile = useCallback(async (file: File) => {
        if (disabled) return;
        setConfirmDelete(false);
        const verdict = checkFileBeforeUpload(file, role, maxBytes);
        if (!verdict.ok) {
            setError({ message: verdict.error || 'Archivo no admitido.', hint: verdict.hint, retryable: false });
            setPendingFile(null);
            setPhase('error');
            return;
        }
        setPendingFile(file);
        setError(null);
        setProgress(0);
        setPhase('subiendo');
        const previous = value;
        try {
            const out = await uploadClubMedia(file, role, authRef.current, {
                onPhase: (p: UploadPhase, pct: number) => { setPhase(p); setProgress(pct); },
            });
            setMedia(out.media);
            setPhase('guardado');
            setImgFailed(false);
            setPendingFile(null);
            onChange(out.media.url || '');
            toast.success(out.duplicate ? `${text.saved} (era el mismo archivo).` : text.saved);
            // Reemplazo: el anterior se retira DESPUÉS de que el nuevo quedó
            // asociado. Nunca hay un momento sin archivo.
            const prevId = mediaIdFromUrl(previous);
            if (prevId && prevId !== out.media.id) {
                deleteClubMedia(prevId, authRef.current).catch(() => { /* queda para la limpieza */ });
            }
        } catch (err) {
            const st = toErrorState(err);
            setError(st);
            setPhase('error');
            toast.error(st.message);
        }
    }, [disabled, role, maxBytes, value, onChange, text.saved]);

    const handleDelete = async () => {
        const id = mediaIdFromUrl(value);
        setConfirmDelete(false);
        if (id) {
            try {
                await deleteClubMedia(id, authRef.current);
            } catch (err) {
                const st = toErrorState(err);
                // Si el servidor ya no lo tiene, quitarlo del formulario igual.
                if (!(err instanceof ClubMediaUploadError && err.code === 'not_found')) {
                    toast.error(st.message);
                    return;
                }
            }
        }
        setMedia(null);
        setPhase('idle');
        setError(null);
        onChange('');
        toast.success(role === 'logo' ? 'Logotipo eliminado.' : 'Imagen eliminada.');
    };

    const openPicker = () => { if (!busy && !disabled) inputRef.current?.click(); };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
    };

    const showSaved = (phase === 'guardado' || phase === 'legacy') && value;
    const fileName = media?.name || (value ? decodeURIComponent(String(value).split('?')[0].split('/').pop() || '') : '');
    const preview = displayUrl(value);

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-2">
                <span className="block text-xs font-black text-gray-700 uppercase tracking-wider">{label || text.label}</span>
                <StatusBadge phase={phase} progress={progress} published={media?.published} />
            </div>

            <div
                onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`rounded-2xl p-4 transition-colors border-2 ${showSaved ? 'border-solid border-gray-200 bg-white' : 'border-dashed'} ${dragOver ? 'border-rotary-blue bg-blue-50/40' : (!showSaved ? 'border-gray-200 hover:border-rotary-blue' : '')}`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT_ATTRIBUTE}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        // Vaciar el input: permite volver a elegir EL MISMO
                        // archivo después de un error (si no, `onChange` no
                        // vuelve a dispararse).
                        e.target.value = '';
                        if (f) handleFile(f);
                    }}
                />

                {busy && (
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 shrink-0 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400">
                            <ImageIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate mb-1.5">{pendingFile?.name}</p>
                            <ProgressBar phase={phase} progress={progress} />
                        </div>
                    </div>
                )}

                {!busy && phase === 'verificando' && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 py-4 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" /> Verificando el archivo guardado…
                    </div>
                )}

                {!busy && showSaved && (
                    <div>
                        <div className="flex items-center gap-3">
                            <div className={`shrink-0 rounded-xl border border-gray-200 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] overflow-hidden flex items-center justify-center ${role === 'logo' ? 'w-16 h-16' : 'w-24 h-14'}`}>
                                {imgFailed ? (
                                    <ImageIcon className="w-5 h-5 text-gray-400" />
                                ) : (
                                    <img
                                        src={preview}
                                        alt={role === 'logo' ? 'Vista previa del logotipo' : 'Vista previa de la portada'}
                                        className={`w-full h-full ${role === 'logo' ? 'object-contain p-1' : 'object-cover'}`}
                                        onError={() => setImgFailed(true)}
                                    />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate" title={fileName}>{fileName || 'Imagen'}</p>
                                <p className="text-[11px] text-gray-500">
                                    {phase === 'legacy'
                                        ? 'Imagen actual del directorio'
                                        : imgFailed
                                            ? 'Guardado, pero la vista previa no cargó. Recarga la página.'
                                            : [
                                                'Archivo almacenado correctamente',
                                                media?.bytes ? formatBytes(media.bytes) : null,
                                                media?.width && media?.height ? `${media.width}×${media.height} px` : null,
                                                media?.converted ? 'convertido de HEIC' : null,
                                            ].filter(Boolean).join(' · ')}
                                </p>
                            </div>
                            {phase === 'guardado' && !imgFailed && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-label="Guardado" />}
                        </div>
                        {phase === 'guardado' && (
                            <p className="mt-2 text-xs font-bold text-emerald-700">{text.saved}.</p>
                        )}
                        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] text-gray-500">{savedNote || 'Puedes continuar con el formulario.'}</p>
                            {confirmDelete ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-red-700">¿Eliminar este archivo?</span>
                                    <button type="button" onClick={handleDelete} className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold">Sí, eliminar</button>
                                    <button type="button" onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold">Cancelar</button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={openPicker} disabled={disabled} className="text-xs font-bold text-rotary-blue hover:underline">Reemplazar archivo</button>
                                    <button type="button" onClick={() => setConfirmDelete(true)} disabled={disabled} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline">
                                        <Trash2 className="w-3.5 h-3.5" /> Eliminar
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!busy && (phase === 'idle' || phase === 'error' || phase === 'missing') && (
                    <div className="text-center">
                        {phase === 'error' && error && (
                            <div className="mb-3 text-left rounded-xl bg-red-50 border border-red-200 p-3" role="alert">
                                <p className="text-xs font-bold text-red-800">{error.message}</p>
                                {error.hint && <p className="text-[11px] text-red-700 mt-0.5">{error.hint}</p>}
                                {error.retryable && pendingFile && (
                                    <button type="button" onClick={() => handleFile(pendingFile)} className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold">
                                        <RefreshCw className="w-3.5 h-3.5" /> Reintentar
                                    </button>
                                )}
                            </div>
                        )}
                        {phase === 'missing' && (
                            <div className="mb-3 text-left rounded-xl bg-amber-50 border border-amber-200 p-3" role="alert">
                                <p className="text-xs font-bold text-amber-800">El archivo que estaba en este borrador ya no está disponible.</p>
                                <p className="text-[11px] text-amber-700 mt-0.5">Vuelve a subirlo para que quede guardado.</p>
                            </div>
                        )}
                        {role === 'logo' ? <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" /> : <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />}
                        <p className="text-xs text-gray-500 mb-2">{hint || text.hint}</p>
                        <button
                            type="button"
                            onClick={openPicker}
                            disabled={disabled}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs disabled:opacity-50"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            <span>{phase === 'error' ? 'Elegir otro archivo' : text.button}</span>
                        </button>
                        <p className="mt-2 text-[10px] text-gray-400">
                            PNG, JPG, WEBP o HEIC · hasta {formatLimit(maxBytes)} · <span className="hidden sm:inline">o arrástralo aquí</span>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── La galería (varias fotos) ────────────────────────────────────────
export interface GalleryItem { url: string; caption?: string; isMain?: boolean }

interface QueueItem { key: string; file: File; phase: UploadPhase | 'error' | 'esperando'; progress: number; error?: UploadErrorState }

export interface ClubGalleryUploaderProps {
    value: GalleryItem[];
    /** Recibe una función sobre el valor VIGENTE (varias fotos terminan a la vez). */
    onChange: (updater: (prev: GalleryItem[]) => GalleryItem[]) => void;
    auth: ClubMediaAuth;
    label?: string;
    disabled?: boolean;
}

export const ClubGalleryUploader: React.FC<ClubGalleryUploaderProps> = ({ value, onChange, auth, label, disabled }) => {
    const { maxBytes, galleryMax } = useLimits('gallery');
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [statusById, setStatusById] = useState<Record<string, ClubMedia | 'missing'>>({});
    const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [broken, setBroken] = useState<Record<string, boolean>>({});
    const authRef = useRef(auth);
    authRef.current = auth;
    const runningRef = useRef(false);
    const startedRef = useRef<Set<string>>(new Set());
    const queueRef = useRef<QueueItem[]>([]);
    queueRef.current = queue;

    // Verificar de una vez todo lo que la galería dice tener.
    const idsKey = value.map(g => mediaIdFromUrl(g.url)).filter(Boolean).sort().join(',');
    useEffect(() => {
        const ids = idsKey ? idsKey.split(',') : [];
        const unknown = ids.filter(id => !statusById[id]);
        if (!unknown.length) return;
        let alive = true;
        fetchClubMediaStatus(unknown, authRef.current)
            .then((list) => {
                if (!alive) return;
                setStatusById((prev) => {
                    const next = { ...prev };
                    for (const id of unknown) {
                        const m = list.find(x => x.id === id);
                        next[id] = m && (m.status === 'guardado' || m.status === 'publicado') ? m : 'missing';
                    }
                    return next;
                });
            })
            .catch(() => { /* sin red: se muestran tal cual */ });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsKey]);

    const patch = (key: string, p: Partial<QueueItem>) => setQueue(q => q.map(it => (it.key === key ? { ...it, ...p } : it)));

    const runQueue = useCallback(async () => {
        if (runningRef.current) return;
        runningRef.current = true;
        try {
            // Una a la vez: en una red móvil, dos subidas en paralelo tardan
            // lo mismo y fallan el doble.
            for (;;) {
                const next = queueRef.current.find(it => it.phase === 'esperando' && !startedRef.current.has(it.key));
                if (!next) break;
                startedRef.current.add(next.key);
                patch(next.key, { phase: 'subiendo', progress: 0, error: undefined });
                try {
                    const out = await uploadClubMedia(next.file, 'gallery', authRef.current, {
                        onPhase: (p, pct) => patch(next.key, { phase: p, progress: pct }),
                    });
                    const url = out.media.url || '';
                    setStatusById(prev => ({ ...prev, [out.media.id]: out.media }));
                    onChange((prev) => {
                        if (prev.some(g => mediaIdFromUrl(g.url) === out.media.id)) return prev;
                        return [...prev, { url, isMain: prev.length === 0 }];
                    });
                    const remaining = queueRef.current.filter(it => it.key !== next.key);
                    queueRef.current = remaining;
                    setQueue(q => q.filter(it => it.key !== next.key));
                    if (out.duplicate) toast.info(`«${next.file.name}» ya estaba guardada: no se duplica.`);
                    else toast.success(ROLE_TEXT.gallery.saved);
                } catch (err) {
                    const st = toErrorState(err);
                    queueRef.current = queueRef.current.map(it => (it.key === next.key ? { ...it, phase: 'error' as const, error: st } : it));
                    patch(next.key, { phase: 'error', error: st });
                }
                // Refrescar la referencia antes de buscar la siguiente.
                await new Promise(r => setTimeout(r, 0));
            }
        } finally {
            runningRef.current = false;
        }
    }, [onChange]);

    const addFiles = (files: FileList | File[]) => {
        if (disabled) return;
        const list = Array.from(files || []);
        if (!list.length) return;
        const room = galleryMax - value.length - queue.filter(q => q.phase !== 'error').length;
        if (room <= 0) {
            toast.error(`La galería admite hasta ${galleryMax} fotografías.`);
            return;
        }
        const accepted: QueueItem[] = [];
        const rejected: QueueItem[] = [];
        list.slice(0, room).forEach((file, i) => {
            const v = checkFileBeforeUpload(file, 'gallery', maxBytes);
            const key = `${Date.now()}-${i}-${file.name}`;
            if (v.ok) accepted.push({ key, file, phase: 'esperando', progress: 0 });
            else rejected.push({ key, file, phase: 'error', progress: 0, error: { message: v.error || 'Archivo no admitido.', hint: v.hint, retryable: false } });
        });
        if (list.length > room) toast.warning(`Sólo se agregarán ${room} de ${list.length}: la galería admite hasta ${galleryMax} fotografías.`);
        const nextQueue = [...queue, ...rejected, ...accepted];
        queueRef.current = nextQueue;
        setQueue(nextQueue);
        if (accepted.length) setTimeout(runQueue, 0);
    };

    const retry = (key: string) => {
        startedRef.current.delete(key);
        const nextQueue = queue.map(it => (it.key === key ? { ...it, phase: 'esperando' as const, error: undefined } : it));
        queueRef.current = nextQueue;
        setQueue(nextQueue);
        setTimeout(runQueue, 0);
    };

    const removeSaved = async (idx: number) => {
        const item = value[idx];
        setConfirmIdx(null);
        const id = mediaIdFromUrl(item?.url);
        if (id) {
            try {
                await deleteClubMedia(id, authRef.current);
            } catch (err) {
                if (!(err instanceof ClubMediaUploadError && err.code === 'not_found')) {
                    toast.error(toErrorState(err).message);
                    return;
                }
            }
        }
        onChange(prev => {
            const next = prev.filter((g) => g.url !== item.url);
            if (next.length && !next.some(g => g.isMain)) next[0] = { ...next[0], isMain: true };
            return next;
        });
        toast.success('Fotografía eliminada de la galería.');
    };

    const setMain = (idx: number) => {
        const url = value[idx]?.url;
        onChange(prev => prev.map(g => ({ ...g, isMain: g.url === url })));
    };

    const uploading = queue.some(q => q.phase === 'subiendo' || q.phase === 'procesando' || q.phase === 'esperando');

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-2">
                <span className="block text-xs font-black text-gray-700 uppercase tracking-wider">{label || ROLE_TEXT.gallery.label}</span>
                <span className="text-[11px] font-bold text-gray-500">{value.length} / {galleryMax}</span>
            </div>
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors mb-4 ${dragOver ? 'border-rotary-blue bg-blue-50/40' : 'border-gray-200 hover:border-rotary-blue'}`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPT_ATTRIBUTE}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                        const files = e.target.files ? Array.from(e.target.files) : [];
                        e.target.value = '';
                        addFiles(files);
                    }}
                />
                <Camera className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-600 font-bold mb-1">Carga fotografías de servicio y compañerismo</p>
                <p className="text-[11px] text-gray-400 mb-4">
                    PNG, JPG, WEBP o HEIC (iPhone) · hasta {formatLimit(maxBytes)} cada una · puedes elegir varias a la vez<span className="hidden sm:inline"> o arrastrarlas aquí</span>
                </p>
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled || value.length >= galleryMax}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-rotary-blue hover:bg-blue-900 text-white font-bold rounded-xl text-xs shadow-sm disabled:opacity-50"
                >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span>{uploading ? 'Cargando fotografías…' : ROLE_TEXT.gallery.button}</span>
                </button>
            </div>

            {queue.length > 0 && (
                <ul className="space-y-2 mb-4">
                    {queue.map((it) => (
                        <li key={it.key} className={`rounded-xl border p-3 ${it.phase === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-gray-800 truncate">{it.file.name}</p>
                                {it.phase === 'esperando' && <span className="text-[11px] text-gray-500">En cola</span>}
                            </div>
                            {(it.phase === 'subiendo' || it.phase === 'procesando') && (
                                <div className="mt-2"><ProgressBar phase={it.phase} progress={it.progress} /></div>
                            )}
                            {it.phase === 'error' && it.error && (
                                <div className="mt-1" role="alert">
                                    <p className="text-xs font-bold text-red-800">{it.error.message}</p>
                                    {it.error.hint && <p className="text-[11px] text-red-700">{it.error.hint}</p>}
                                    <div className="mt-2 flex gap-2">
                                        {it.error.retryable && (
                                            <button type="button" onClick={() => retry(it.key)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold">
                                                <RefreshCw className="w-3.5 h-3.5" /> Reintentar
                                            </button>
                                        )}
                                        <button type="button" onClick={() => setQueue(q => q.filter(x => x.key !== it.key))} className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-700 text-[11px] font-bold">
                                            Quitar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {value.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {value.map((item, idx) => {
                        const id = mediaIdFromUrl(item.url);
                        const st = id ? statusById[id] : undefined;
                        const missing = st === 'missing';
                        const meta = st && st !== 'missing' ? st : null;
                        return (
                            <div key={`${item.url}-${idx}`} className="rounded-xl overflow-hidden border border-gray-200 bg-white">
                                <div className="relative aspect-video bg-gray-100">
                                    {missing || broken[item.url] ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-center p-2">
                                            <AlertTriangle className="w-5 h-5 text-amber-500 mb-1" />
                                            <span className="text-[10px] text-gray-600">{missing ? 'Ya no está disponible: vuelve a subirla' : 'La vista previa no cargó'}</span>
                                        </div>
                                    ) : (
                                        <img src={displayUrl(item.url)} alt={`Fotografía ${idx + 1}`} className="w-full h-full object-cover" onError={() => setBroken(b => ({ ...b, [item.url]: true }))} />
                                    )}
                                    {item.isMain && (
                                        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-400 text-white text-[10px] font-bold"><Star className="w-3 h-3" /> Principal</span>
                                    )}
                                </div>
                                <div className="p-2">
                                    <p className="text-[11px] font-bold text-gray-800 truncate" title={meta?.name}>{meta?.name || `Fotografía ${idx + 1}`}</p>
                                    <p className={`text-[10px] font-bold ${missing ? 'text-amber-700' : 'text-emerald-700'}`}>
                                        {missing ? 'No disponible' : id ? (meta?.published ? 'Publicada' : 'Guardada') : 'En el directorio'}
                                        {meta?.bytes ? <span className="font-normal text-gray-500"> · {formatBytes(meta.bytes)}</span> : null}
                                    </p>
                                    {confirmIdx === idx ? (
                                        <div className="mt-1.5 flex gap-1.5">
                                            <button type="button" onClick={() => removeSaved(idx)} className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">Eliminar</button>
                                            <button type="button" onClick={() => setConfirmIdx(null)} className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-bold">Cancelar</button>
                                        </div>
                                    ) : (
                                        <div className="mt-1.5 flex items-center justify-between">
                                            {!item.isMain ? (
                                                <button type="button" onClick={() => setMain(idx)} disabled={disabled} className="text-[10px] font-bold text-rotary-blue hover:underline">Principal</button>
                                            ) : <span />}
                                            <button type="button" onClick={() => setConfirmIdx(idx)} disabled={disabled} className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600 hover:underline" aria-label={`Eliminar fotografía ${idx + 1}`}>
                                                <Trash2 className="w-3 h-3" /> Eliminar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ClubMediaUploader;
