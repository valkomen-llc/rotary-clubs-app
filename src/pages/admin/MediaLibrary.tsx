import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Trash2, Search, FileText, ImageIcon,
    Plus, X, Loader2, Copy, ExternalLink,
    LayoutGrid, List, Folder, ChevronRight, Video,
    ArrowLeft, FolderPlus, FolderInput, Pencil, Home, CornerLeftUp, FileImage,
    Check, Square, CheckSquare, Scissors, RotateCcw, Play
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';
import { compressImage } from '../../utils/compressImage';
import { validateFolderName, breadcrumbOf, type FolderRow } from '../../lib/mediaFolders';
import { isHeicFile } from '../../lib/heicImages';

/**
 * Estado del recorte de un video (v4.934), tal como lo guarda el servidor en
 * `Media.trim`. `current` presente = hay una versión anterior restaurable.
 */
interface TrimState {
    current?: {
        backupKey?: string | null;
        appliedAt?: string | null;
        by?: string | null;
        startSec?: number;
        endSec?: number;
        prevDurationSec?: number | null;
        newDurationSec?: number | null;
        prevSize?: number | null;
        newSize?: number | null;
    } | null;
    log?: unknown[];
    // Marcadores del intento en curso / fallido (v4.936). Los escribe el
    // servidor: el reclamo al arrancar, y el final del intento los limpia.
    processing?: { startedAt?: string | null; by?: string | null } | null;
    lastError?: { at?: string | null; message?: string | null } | null;
}

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    // Miniatura WebP de ~400 px (v4.786); vacía o ausente, se usa el original.
    thumbUrl?: string | null;
    type: 'image' | 'video' | 'document';
    size: number;
    createdAt: string;
    folderId?: string | null;
    trim?: TrimState | null;
}

// ── Recorte de video: helpers puros de la pantalla ─────────────────────────

/** Segundos → «MM:SS» (u «H:MM:SS»), para pintar tiempos del recorte. */
const fmtTime = (sec: number): string => {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const two = (n: number) => String(n).padStart(2, '0');
    return hh > 0 ? `${hh}:${two(mm)}:${two(ss)}` : `${two(mm)}:${two(ss)}`;
};

/** «02:47» → segundos, o null si no es un tiempo. Espejo de `parseTimecode`. */
const parseTime = (input: string): number | null => {
    const text = String(input ?? '').trim();
    if (!text || !/^\d+(?::\d{1,2}){0,2}(?:[.,]\d+)?$/.test(text)) return null;
    const parts = text.replace(',', '.').split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n) || n < 0)) return null;
    if (parts.length > 1 && parts.slice(1).some(n => n >= 60)) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
};

// Espejo mínimo de PROCESSING_STALE_MS del servidor: un marcador de hace más
// de 10 minutos es un intento que murió, no uno vivo.
const TRIM_STALE_MS = 10 * 60 * 1000;
const trimEnCurso = (item: MediaItem): boolean => {
    const at = item.trim?.processing?.startedAt;
    if (!at) return false;
    const started = Date.parse(at);
    return Number.isFinite(started) && Date.now() - started < TRIM_STALE_MS;
};

/**
 * El `src` con el que se PINTA un video. La URL guardada no cambia jamás —esa
 * es la promesa del recorte—, pero después de recortar el navegador puede
 * tener la versión vieja en caché: para la VISTA PREVIA se le agrega un
 * parámetro derivado de `appliedAt` (S3 lo ignora), sólo para mirar. Lo que
 * se copia y se comparte sigue siendo `item.url` tal cual.
 */
const videoPreviewSrc = (item: MediaItem): string => {
    const at = item.trim?.current?.appliedAt;
    if (!at) return item.url;
    return `${item.url}${item.url.includes('?') ? '&' : '?'}v=${encodeURIComponent(at)}`;
};

/**
 * El modal de recorte. Interfaz mínima a propósito: reproductor, línea de
 * tiempo con el tramo que se CONSERVA resaltado, inicio y final (deslizador y
 * campo manual), vista previa del tramo y «Aplicar recorte». La validación de
 * verdad la hace el servidor; acá sólo se evita mandar un rango absurdo.
 */
const VideoTrimModal: React.FC<{
    item: MediaItem;
    api: string;
    authToken: () => string | null;
    onClose: () => void;
    onDone: (updated: MediaItem) => void;
}> = ({ item, api, authToken, onClose, onDone }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [duration, setDuration] = useState<number | null>(null);
    const [start, setStart] = useState(0);
    const [end, setEnd] = useState(0);
    const [startText, setStartText] = useState('00:00');
    const [endText, setEndText] = useState('00:00');
    const [busy, setBusy] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    // Segundos REALES transcurridos mientras procesa — nunca un porcentaje
    // inventado (regla de v4.756: un progreso fingido hace esperar por nada).
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!busy) { setElapsed(0); return; }
        const t = window.setInterval(() => setElapsed(e => e + 1), 1000);
        return () => window.clearInterval(t);
    }, [busy]);

    const isWebm = item.filename.toLowerCase().endsWith('.webm');

    const onMeta = () => {
        const d = videoRef.current?.duration;
        if (d && Number.isFinite(d)) {
            setDuration(d);
            setEnd(d);
            setEndText(fmtTime(d));
        }
    };

    const clampStart = (v: number) => {
        if (duration == null) return;
        const nv = Math.min(Math.max(0, v), Math.max(0, end - 1));
        setStart(nv);
        setStartText(fmtTime(nv));
        if (videoRef.current) videoRef.current.currentTime = nv;
    };
    const clampEnd = (v: number) => {
        if (duration == null) return;
        const nv = Math.max(Math.min(duration, v), Math.min(duration, start + 1));
        setEnd(nv);
        setEndText(fmtTime(nv));
        if (videoRef.current) videoRef.current.currentTime = nv;
    };

    // La vista previa reproduce SÓLO el tramo elegido: arranca en el inicio y
    // se detiene sola al llegar al final.
    const onTime = () => {
        const v = videoRef.current;
        if (previewing && v && v.currentTime >= end) {
            v.pause();
            setPreviewing(false);
        }
    };
    const preview = () => {
        const v = videoRef.current;
        if (!v || duration == null) return;
        v.currentTime = start;
        setPreviewing(true);
        v.play().catch(() => setPreviewing(false));
    };

    const apply = async () => {
        if (duration == null) { toast.error('Todavía no se conoce la duración del video.'); return; }
        if (end - start < 1) { toast.error('El fragmento a conservar tiene que durar al menos 1 segundo.'); return; }
        if (start <= 0.05 && end >= duration - 0.05) {
            toast.error('El rango elegido es el video completo: no hay nada que recortar.');
            return;
        }
        setBusy(true);
        try {
            const res = await fetch(`${api}/media/${item.id}/trim`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ startSec: start, endSec: end, durationSec: duration }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data?.details || data?.error || 'No se pudo recortar el video');
                return;
            }
            toast.success('Video actualizado correctamente. El enlace original se conserva.');
            onDone(data as MediaItem);
        } catch {
            toast.error('Error de conexión al recortar el video');
        } finally {
            setBusy(false);
        }
    };

    const pct = (v: number) => duration ? `${(v / duration) * 100}%` : '0%';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !busy && onClose()}>
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Scissors className="w-4 h-4 text-rotary-blue" /> Recortar video
                    </h3>
                    <button onClick={() => !busy && onClose()} className="p-2 hover:bg-white rounded-full text-gray-400 shadow-sm transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <video
                        ref={videoRef}
                        src={item.url}
                        controls
                        onLoadedMetadata={onMeta}
                        onTimeUpdate={onTime}
                        onPause={() => setPreviewing(false)}
                        className="w-full max-h-72 bg-black rounded-xl"
                    />

                    {duration == null ? (
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Leyendo la duración del video…
                        </p>
                    ) : (
                        <>
                            {/* La línea de tiempo: el tramo azul es lo que SE CONSERVA. */}
                            <div>
                                <div className="flex justify-between text-[11px] font-bold text-gray-400 mb-1">
                                    <span>00:00</span>
                                    <span>Duración total: {fmtTime(duration)}</span>
                                </div>
                                <div className="relative h-2.5 bg-gray-200 rounded-full">
                                    <div
                                        className="absolute top-0 h-full bg-rotary-blue rounded-full"
                                        style={{ left: pct(start), width: pct(end - start) }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1">Inicio</label>
                                    <input
                                        type="range" min={0} max={duration} step={0.1} value={start}
                                        onChange={(e) => clampStart(Number(e.target.value))}
                                        className="w-full accent-sky-700"
                                        disabled={busy}
                                    />
                                    <input
                                        value={startText}
                                        onChange={(e) => setStartText(e.target.value)}
                                        onBlur={() => {
                                            const v = parseTime(startText);
                                            if (v == null) setStartText(fmtTime(start));
                                            else clampStart(v);
                                        }}
                                        disabled={busy}
                                        className="mt-1 w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm font-bold text-gray-700"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1">Final</label>
                                    <input
                                        type="range" min={0} max={duration} step={0.1} value={end}
                                        onChange={(e) => clampEnd(Number(e.target.value))}
                                        className="w-full accent-sky-700"
                                        disabled={busy}
                                    />
                                    <input
                                        value={endText}
                                        onChange={(e) => setEndText(e.target.value)}
                                        onBlur={() => {
                                            const v = parseTime(endText);
                                            if (v == null) setEndText(fmtTime(end));
                                            else clampEnd(v);
                                        }}
                                        disabled={busy}
                                        className="mt-1 w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm font-bold text-gray-700"
                                    />
                                </div>
                            </div>

                            <p className="text-sm text-gray-600">
                                Duración resultante: <span className="font-bold text-gray-800">{fmtTime(end - start)}</span>
                                <span className="text-gray-400"> · se elimina {fmtTime(Math.max(0, duration - (end - start)))}</span>
                            </p>

                            {isWebm && start > 0.05 && (
                                <p className="text-xs text-amber-600 font-medium">
                                    Un WebM sólo se puede recortar desde el principio (quitar el final). Para mover el inicio, convertí el video a MP4 primero.
                                </p>
                            )}
                        </>
                    )}

                    {busy && (
                        <div className="rounded-xl bg-sky-50 border border-sky-100 p-4">
                            <p className="text-sm font-bold text-sky-800 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Procesando video… ({elapsed}s)
                            </p>
                            <div className="mt-2 h-1.5 bg-sky-100 rounded-full overflow-hidden">
                                <div className="h-full w-1/3 bg-sky-600 rounded-full animate-pulse" />
                            </div>
                            <p className="text-xs text-sky-700 mt-2">
                                Un video grande puede tardar un par de minutos. El proceso corre en el
                                servidor: el original queda intacto hasta que la nueva versión esté
                                validada, y la baldosa del archivo muestra «Recortando…» mientras tanto.
                            </p>
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-gray-100 flex flex-wrap justify-end gap-2 bg-gray-50">
                    <button
                        onClick={preview}
                        disabled={busy || duration == null}
                        className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-100 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        <Play className="w-4 h-4" /> Vista previa
                    </button>
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-100 transition-all disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={apply}
                        disabled={busy || duration == null}
                        className="px-4 py-2.5 rounded-xl bg-rotary-blue text-white font-bold text-sm hover:bg-rotary-navy transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</> : <><Scissors className="w-4 h-4" /> Aplicar recorte</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface ClubFolder {
    id: string;
    name: string;
    count: number;
}

/** Una carpeta de la Librería, tal como la devuelve el servidor. */
interface LibraryFolder extends FolderRow {
    clubId?: string | null;
}

/** El árbol con los conteos ya repartidos hacia los ancestros. */
interface FolderTreeNode extends LibraryFolder {
    children: FolderTreeNode[];
    ownCount: number;
    totalCount: number;
}

const MediaLibrary: React.FC = () => {
    const { user } = useAuth();
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [folders, setFolders] = useState<ClubFolder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'document'>('all');
    const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
    const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
    const [selectedClubName, setSelectedClubName] = useState<string | null>(null);

    // ── Carpetas de la Librería (v4.738) ──────────────────────────────
    // `currentFolder` es NULL en la raíz del sitio. No se confunde con
    // `selectedClubId`, que es el otro eje: de qué SITIO son los archivos.
    const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>([]);
    const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
    const [rootCount, setRootCount] = useState(0);
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [renaming, setRenaming] = useState<LibraryFolder | null>(null);
    const [movingItem, setMovingItem] = useState<MediaItem | null>(null);
    const [busyFolder, setBusyFolder] = useState(false);
    const [converting, setConverting] = useState<string | null>(null);
    const [trimming, setTrimming] = useState<MediaItem | null>(null);
    const [restoringTrim, setRestoringTrim] = useState(false);

    // ── Selección múltiple (v4.740) ───────────────────────────────────
    // `Set` y no array: las operaciones que importan acá son «¿está?» y
    // «agregar/quitar», y con cientos de archivos un array las vuelve
    // cuadráticas al pintar la rejilla.
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState<'convert' | 'delete' | null>(null);
    const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

    const isSuperAdmin = user?.role === 'administrator';
    const API = import.meta.env.VITE_API_URL || '/api';
    const token = () => localStorage.getItem('rotary_token');

    /** La ruta de la carpeta abierta, de la raíz hacia adentro. */
    const breadcrumb = useMemo(
        () => breadcrumbOf(libraryFolders, currentFolder),
        [libraryFolders, currentFolder]
    );

    /** Las carpetas que se ven en el nivel actual: las hijas de la abierta. */
    const visibleFolders = useMemo(() => {
        if (!currentFolder) return folderTree;
        const find = (nodes: FolderTreeNode[]): FolderTreeNode | null => {
            for (const n of nodes) {
                if (n.id === currentFolder) return n;
                const hit = find(n.children);
                if (hit) return hit;
            }
            return null;
        };
        return find(folderTree)?.children ?? [];
    }, [folderTree, currentFolder]);

    // El árbol y los archivos se piden por separado: cambiar de carpeta sólo
    // cambia los ARCHIVOS, así que volver a traer el árbol en cada navegación
    // sería una consulta por clic para recibir lo mismo.
    useEffect(() => {
        if (isSuperAdmin && !selectedClubId) fetchFolders();
        else fetchLibraryFolders();
    }, [user, selectedClubId]);

    useEffect(() => {
        if (isSuperAdmin && !selectedClubId) return;
        // La selección se limpia al cambiar de carpeta o de sitio: lo
        // seleccionado ya no está a la vista, y actuar sobre archivos que no se
        // ven es exactamente cómo alguien borra lo que no quería borrar.
        setSelected(new Set());
        fetchMedia();
    }, [user, selectedClubId, currentFolder]);

    // ── Backfill de miniaturas (v4.786) ──
    //
    // La generación al subir sólo alcanza a lo nuevo; esto va completando lo
    // heredado, en tandas con presupuesto del lado del servidor, mientras el
    // administrador tiene la pantalla abierta. Tope de vueltas por visita: un
    // bucle sin tope que gira contra un error persistente es peor que dejar
    // miniaturas pendientes para la próxima visita. Silencioso a propósito —
    // es mantenimiento, no una acción del usuario— y con una sola pasada por
    // montaje (el ref), para que un repintado no lo relance.
    const backfillStarted = useRef(false);
    useEffect(() => {
        if (backfillStarted.current) return;
        backfillStarted.current = true;
        let cancelado = false;
        (async () => {
            const token = localStorage.getItem('rotary_token');
            for (let ronda = 0; ronda < 8 && !cancelado; ronda++) {
                try {
                    const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media/backfill-thumbs`, {
                        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!r.ok) break;
                    const { done, pending } = await r.json();
                    if (!pending || (!done && pending)) break;
                } catch { break; }
            }
        })();
        return () => { cancelado = true; };
    }, []);

    const fetchFolders = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media/folders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setFolders(data);
            }
        } catch (error) {
            toast.error('Error al cargar carpetas de clubes');
        } finally {
            setLoading(false);
        }
    };

    const fetchMedia = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (isSuperAdmin && selectedClubId) params.set('clubId', selectedClubId);
            // `root` es la raíz; sin el parámetro el servidor no filtra. Son
            // cosas distintas y por eso se manda siempre uno de los dos.
            params.set('folderId', currentFolder || 'root');

            const response = await fetch(`${API}/media?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token()}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMedia(data);
            }
        } catch (error) {
            toast.error('Error al cargar la librería de medios');
        } finally {
            setLoading(false);
        }
    };

    /** El árbol de carpetas del sitio abierto. */
    const fetchLibraryFolders = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (isSuperAdmin && selectedClubId) params.set('clubId', selectedClubId);
            const res = await fetch(`${API}/media/library-folders?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token()}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            // `?.` en cada eslabón: una respuesta sin `folders` —una versión
            // anterior de la API, un error devuelto como objeto— dejaría la
            // pantalla EN BLANCO, no un aviso.
            setLibraryFolders(data?.folders ?? []);
            setFolderTree(data?.tree ?? []);
            setRootCount(data?.rootCount ?? 0);
        } catch {
            // Sin carpetas la Librería sigue sirviendo: se ve como siempre,
            // con todo en la raíz. Degradar es mejor que no cargar nada.
        }
    }, [API, isSuperAdmin, selectedClubId]);

    const handleCreateFolder = async () => {
        const check = validateFolderName(newFolderName);
        if (!check.ok) { toast.error(check.error!); return; }

        setBusyFolder(true);
        try {
            const res = await fetch(`${API}/media/library-folders`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: check.name,
                    parentId: currentFolder,
                    clubId: isSuperAdmin ? selectedClubId : undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data?.error || 'No se pudo crear la carpeta'); return; }
            toast.success(`Carpeta «${check.name}» creada`);
            setNewFolderName('');
            setCreatingFolder(false);
            fetchLibraryFolders();
        } catch {
            toast.error('Error de conexión al crear la carpeta');
        } finally {
            setBusyFolder(false);
        }
    };

    const handleRenameFolder = async () => {
        if (!renaming) return;
        const check = validateFolderName(renaming.name);
        if (!check.ok) { toast.error(check.error!); return; }

        setBusyFolder(true);
        try {
            const res = await fetch(`${API}/media/library-folders/${renaming.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: check.name, clubId: isSuperAdmin ? selectedClubId : undefined }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data?.error || 'No se pudo renombrar'); return; }
            toast.success('Carpeta renombrada');
            setRenaming(null);
            fetchLibraryFolders();
        } catch {
            toast.error('Error de conexión al renombrar');
        } finally {
            setBusyFolder(false);
        }
    };

    const handleDeleteFolder = async (folder: LibraryFolder) => {
        // La confirmación dice lo que va a pasar DE VERDAD: los archivos no se
        // borran, suben un nivel. Prometer otra cosa —en cualquiera de las dos
        // direcciones— es lo que hace que alguien pulse sin querer.
        const where = folder.parentId ? 'a la carpeta que la contiene' : 'a la raíz de la Librería';
        if (!window.confirm(
            `¿Eliminar la carpeta «${folder.name}»?\n\n` +
            `Los archivos y las subcarpetas que tenga adentro NO se eliminan: pasan ${where}.`
        )) return;

        try {
            const params = new URLSearchParams();
            if (isSuperAdmin && selectedClubId) params.set('clubId', selectedClubId);
            const res = await fetch(`${API}/media/library-folders/${folder.id}?${params.toString()}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token()}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data?.error || 'No se pudo eliminar la carpeta'); return; }

            const moved = (data.movedFiles || 0) + (data.movedFolders || 0);
            toast.success(moved
                ? `Carpeta eliminada · ${data.movedFiles || 0} archivo(s) y ${data.movedFolders || 0} subcarpeta(s) se movieron`
                : 'Carpeta eliminada');
            if (currentFolder === folder.id) setCurrentFolder(folder.parentId ?? null);
            fetchLibraryFolders();
            fetchMedia();
        } catch {
            toast.error('Error de conexión al eliminar la carpeta');
        }
    };

    /**
     * Convierte a JPEG un HEIC que ya está en la Librería.
     *
     * Desde v4.739 lo que se sube se convierte solo, así que esto es para lo
     * que ya estaba cargado desde antes — que es exactamente lo que se ve roto
     * hoy en la pantalla.
     */
    /**
     * El recorte terminó: la fila vuelve actualizada del servidor y se aplica
     * en el listado y en la ficha abierta. La URL no cambió — sólo cambian el
     * tamaño y el estado `trim`.
     */
    const onTrimDone = (updated: MediaItem) => {
        setMedia(prev => prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m)));
        setSelectedItem(prev => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
        setTrimming(null);
    };

    /** Vuelve a la versión anterior al último recorte. El enlace no cambia. */
    const restoreTrim = async (item: MediaItem) => {
        const c = item.trim?.current;
        if (!c) return;
        const prevDur = c.prevDurationSec ? ` (${fmtTime(c.prevDurationSec)})` : '';
        if (!window.confirm(`Se restaurará la versión anterior al último recorte${prevDur}. El enlace público del video no cambia. ¿Continuar?`)) return;
        setRestoringTrim(true);
        try {
            const res = await fetch(`${API}/media/${item.id}/restore-trim`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token()}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data?.details || data?.error || 'No se pudo restaurar la versión anterior');
                return;
            }
            toast.success('Versión original restaurada. El enlace se conserva.');
            onTrimDone(data as MediaItem);
        } catch {
            toast.error('Error de conexión al restaurar');
        } finally {
            setRestoringTrim(false);
        }
    };

    const convertHeic = async (item: MediaItem) => {
        setConverting(item.id);
        try {
            const res = await fetch(`${API}/media/${item.id}/convert`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token()}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                // El motivo del servidor se muestra tal cual: «no se pudo
                // convertir» a secas no le dice a nadie qué hacer.
                toast.error(data?.details || data?.error || 'No se pudo convertir el archivo');
                return;
            }
            toast.success('Convertido a JPEG: ya se puede ver');
            setSelectedItem(null);
            fetchMedia();
        } catch {
            toast.error('Error de conexión al convertir');
        } finally {
            setConverting(null);
        }
    };

    // ── Acciones sobre la selección ───────────────────────────────────

    const toggleSelected = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    /**
     * Convierte a JPG todos los HEIC de la selección.
     *
     * El servidor atiende lo que le entra en su presupuesto de tiempo y
     * devuelve lo que falta, así que acá se vuelve a pedir hasta terminar. Sin
     * este bucle, una selección grande se convertiría a medias y la pantalla
     * diría que terminó.
     */
    const bulkConvert = async () => {
        const targets = filteredMedia.filter(m => selected.has(m.id) && isHeicFile({ filename: m.filename }));
        if (!targets.length) { toast.info('No hay archivos HEIC en la selección.'); return; }

        setBulkBusy('convert');
        setBulkProgress({ done: 0, total: targets.length });
        let queue = targets.map(m => m.id);
        let done = 0;
        const problems: { filename: string; error: string }[] = [];

        try {
            // Tope de vueltas: si el servidor dejara de avanzar, esto pararía en
            // vez de pedir para siempre.
            for (let round = 0; queue.length && round < 50; round++) {
                const res = await fetch(`${API}/media/bulk-convert`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mediaIds: queue }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { toast.error(data?.details || data?.error || 'No se pudieron convertir'); break; }

                done += data.converted || 0;
                problems.push(...(data.failed || []));
                setBulkProgress({ done, total: targets.length });

                const next: string[] = data.pending || [];
                // Sin avance y con cola pendiente: parar y decirlo, en vez de
                // girar sin fin.
                if (!data.converted && !data.failed?.length && next.length === queue.length) {
                    toast.error('La conversión no avanzó. Probá con menos archivos a la vez.');
                    break;
                }
                queue = next;
            }

            if (done) toast.success(`${done} archivo(s) convertido(s) a JPG`);
            if (problems.length) {
                toast.error(`${problems.length} no se pudo(ieron) convertir: ${problems[0].filename} — ${problems[0].error}`);
            }
            setSelected(new Set());
            fetchMedia();
            fetchLibraryFolders();
        } catch {
            toast.error('Error de conexión al convertir');
        } finally {
            setBulkBusy(null);
            setBulkProgress(null);
        }
    };

    /** Elimina los archivos seleccionados. */
    const bulkDelete = async () => {
        const ids = [...selected];
        if (!ids.length) return;
        // La confirmación dice CUÁNTOS y que no tiene vuelta atrás. Un archivo
        // puede estar publicado en el sitio o ser el logo del club.
        if (!window.confirm(
            `¿Eliminar ${ids.length} archivo(s) de forma permanente?\n\n` +
            'Esta acción no se puede deshacer. Si alguno está publicado en el sitio, dejará de verse ahí.'
        )) return;

        setBulkBusy('delete');
        try {
            const res = await fetch(`${API}/media/bulk-delete`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaIds: ids }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data?.details || data?.error || 'No se pudieron eliminar'); return; }

            toast.success(`${data.deleted} archivo(s) eliminado(s)`);
            if (data.notFound) toast.info(`${data.notFound} ya no estaba(n) en la Librería.`);
            setSelected(new Set());
            setSelectedItem(null);
            fetchMedia();
            fetchLibraryFolders();
        } catch {
            toast.error('Error de conexión al eliminar');
        } finally {
            setBulkBusy(null);
        }
    };

    /** Manda un archivo a otra carpeta. `folderId: null` lo devuelve a la raíz. */
    const moveMediaTo = async (item: MediaItem, folderId: string | null) => {
        try {
            const res = await fetch(`${API}/media/library-folders/move`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaIds: [item.id],
                    folderId,
                    clubId: isSuperAdmin ? selectedClubId : undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data?.error || 'No se pudo mover el archivo'); return; }
            toast.success(folderId ? 'Archivo movido' : 'Archivo devuelto a la raíz');
            setMovingItem(null);
            setSelectedItem(null);
            fetchLibraryFolders();
            fetchMedia();
        } catch {
            toast.error('Error de conexión al mover el archivo');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsUploading(true);
        const token = localStorage.getItem('rotary_token');
        let successCount = 0;
        let errorCount = 0;
        
        const toastId = toast.loading(`Subiendo 0 de ${files.length} archivos...`);

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const heic = isHeicFile({ filename: file.name, mimetype: file.type });
                toast.loading(
                    heic
                        ? `Convirtiendo HEIC ${i + 1} de ${files.length}…`
                        : `Optimizando y subiendo ${i + 1} de ${files.length}...`,
                    { id: toastId }
                );

                // Un HEIC NO pasa por `compressImage`: esa función dibuja en un
                // canvas y ningún navegador salvo Safari sabe decodificar HEIC,
                // así que la carga fallaba y devolvía el archivo intacto de
                // todos modos. Saltearlo ahorra el intento y deja claro, al
                // leer el código, que de este formato se encarga el servidor.
                const processedFile = heic
                    ? file
                    : await compressImage(file, { maxDimension: 4096, quality: 1.0 });

                const targetClubId = (isSuperAdmin ? selectedClubId : user?.clubId) || '';
                
                // 1. Obtener Presigned URL
                const presignRes = await fetch(
                    `${import.meta.env.VITE_API_URL || '/api'}/media/presigned-url?fileName=${encodeURIComponent(processedFile.name)}&fileType=${encodeURIComponent(processedFile.type)}&clubId=${targetClubId}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                if (!presignRes.ok) {
                    errorCount++;
                    continue;
                }

                const { uploadUrl, fileUrl, key } = await presignRes.json();

                // 2. Subir directo a S3
                const s3Res = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': processedFile.type },
                    body: processedFile
                });

                if (!s3Res.ok) {
                    errorCount++;
                    continue;
                }

                // 3. Registrar en base de datos
                const saveRes = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media/save`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        clubId: targetClubId,
                        fileName: processedFile.name,
                        fileUrl,
                        s3Key: key,
                        fileType: processedFile.type,
                        fileSize: processedFile.size,
                        // Cae en la carpeta abierta. Quien entró a «Logos» y
                        // pulsó «Subir Nuevo» espera que quede en Logos, no
                        // tener que buscarlo en la raíz y moverlo.
                        folderId: currentFolder,
                    })
                });

                if (saveRes.ok) {
                    successCount++;
                } else {
                    errorCount++;
                }
            }

            toast.dismiss(toastId);

            if (successCount > 0) {
                toast.success(`${successCount} archivo(s) subido(s) con éxito`);
                fetchMedia();
            }
            if (errorCount > 0) {
                toast.error(`Error al subir ${errorCount} archivo(s)`);
            }
        } catch (error) {
            toast.dismiss(toastId);
            toast.error('Error de conexión al subir archivos');
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (item: MediaItem) => {
        if (!window.confirm('¿Estás seguro de eliminar este archivo permanentemente?')) return;

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media/${item.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                toast.success('Archivo eliminado');
                setMedia(prev => prev.filter(m => m.id !== item.id));
                setSelectedItem(null);
            }
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const copyToClipboard = (url: string) => {
        navigator.clipboard.writeText(url);
        toast.info('URL copiada al portapapeles');
    };

    const filteredMedia = media.filter(m => {
        const matchesSearch = m.filename.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'all' || m.type === filterType;
        return matchesSearch && matchesType;
    });

    /** Cuántos de los seleccionados son HEIC: decide si se ofrece convertir. */
    const selectedHeicCount = filteredMedia
        .filter(m => selected.has(m.id) && isHeicFile({ filename: m.filename })).length;

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleEnterFolder = (folder: ClubFolder) => {
        setSelectedClubId(folder.id);
        setSelectedClubName(folder.name);
    };

    const handleBackToFolders = () => {
        setSelectedClubId(null);
        setSelectedClubName(null);
        setMedia([]);
    };

    return (
        <AdminLayout>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-rotary-blue" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            {isSuperAdmin && selectedClubId && (
                                <button
                                    onClick={handleBackToFolders}
                                    className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-all mr-1"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                            )}
                            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                                {isSuperAdmin && !selectedClubId ? 'Gestión Global de Medios' : 'Librería de Medios'}
                            </h1>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            {isSuperAdmin && !selectedClubId
                                ? 'Explora los archivos organizados por club.'
                                : `Gestionando archivos ${selectedClubName ? `de ${selectedClubName}` : 'de tu club'} · ${media.length} archivos`}
                        </p>
                    </div>
                </div>

                {(!isSuperAdmin || selectedClubId) && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { setCreatingFolder(true); setNewFolderName(''); }}
                            className="flex items-center gap-2 bg-white text-rotary-blue border border-gray-200 px-4 py-2.5 rounded-xl hover:border-rotary-blue hover:bg-sky-50 transition-all font-bold shadow-sm active:scale-95"
                        >
                            <FolderPlus className="w-5 h-5" />
                            <span className="hidden sm:inline">Nueva carpeta</span>
                        </button>
                        <label className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl hover:bg-sky-800 transition-all font-bold shadow-xl shadow-blue-900/20 cursor-pointer disabled:opacity-50 active:scale-95">
                            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                            <span>{isUploading ? 'Subiendo...' : 'Subir Nuevo'}</span>
                            <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                        </label>
                    </div>
                )}
            </div>

            {isSuperAdmin && !selectedClubId ? (
                // FOLDERS VIEW
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        Array(6).fill(0).map((_, i) => (
                            <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
                        ))
                    ) : folders.length === 0 ? (
                        <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-200">
                            <Folder className="w-16 h-16 text-gray-100 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold">No hay clubes registrados</p>
                        </div>
                    ) : (
                        folders.map(folder => (
                            <button
                                key={folder.id}
                                onClick={() => handleEnterFolder(folder)}
                                className="flex items-center justify-between p-6 bg-white rounded-2xl border border-gray-100 hover:border-rotary-blue hover:shadow-xl hover:-translate-y-1 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center text-rotary-blue group-hover:bg-rotary-blue group-hover:text-white transition-all">
                                        <Folder className="w-6 h-6" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-bold text-gray-800 group-hover:text-rotary-blue transition-colors">{folder.name}</h3>
                                        <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest">{folder.count} archivos</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-rotary-blue" />
                            </button>
                        ))
                    )}
                </div>
            ) : (
                // FILES VIEW
                <>
                    {/* Migaja de pan. Se pinta siempre —también en la raíz—
                        porque es lo que dice DÓNDE va a caer lo que se suba. */}
                    <div className="flex items-center gap-1 flex-wrap mb-5 text-sm">
                        <button
                            onClick={() => setCurrentFolder(null)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${currentFolder ? 'text-gray-500 hover:bg-gray-100' : 'bg-sky-50 text-rotary-blue'}`}
                        >
                            <Home className="w-4 h-4" />
                            Librería
                            {rootCount > 0 && (
                                <span className="text-[10px] font-extrabold text-gray-400">{rootCount}</span>
                            )}
                        </button>
                        {breadcrumb.map((crumb, i) => (
                            <React.Fragment key={crumb.id}>
                                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                <button
                                    onClick={() => setCurrentFolder(crumb.id)}
                                    className={`px-3 py-1.5 rounded-lg font-bold transition-all truncate max-w-[200px] ${i === breadcrumb.length - 1 ? 'bg-sky-50 text-rotary-blue' : 'text-gray-500 hover:bg-gray-100'}`}
                                >
                                    {crumb.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Alta de carpeta en línea, dentro del nivel abierto. */}
                    {creatingFolder && (
                        <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-sky-50/60 border border-sky-100 rounded-2xl">
                            <div className="flex items-center gap-3 flex-1">
                                <FolderPlus className="w-5 h-5 text-rotary-blue flex-shrink-0" />
                                <input
                                    autoFocus
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateFolder();
                                        if (e.key === 'Escape') setCreatingFolder(false);
                                    }}
                                    placeholder={currentFolder ? `Nombre de la subcarpeta en «${breadcrumb[breadcrumb.length - 1]?.name}»` : 'Nombre de la carpeta'}
                                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/10 bg-white font-medium"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCreateFolder}
                                    disabled={busyFolder}
                                    className="px-5 py-2.5 bg-rotary-blue text-white rounded-xl font-bold hover:bg-rotary-navy transition-all disabled:opacity-50"
                                >
                                    {busyFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear'}
                                </button>
                                <button
                                    onClick={() => setCreatingFolder(false)}
                                    className="px-4 py-2.5 text-gray-500 rounded-xl font-bold hover:bg-white transition-all"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col md:flex-row gap-4 mb-8">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar archivos..."
                                className="w-full pl-11 pr-4 py-3 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rotary-blue/10 bg-white transition-all shadow-sm font-medium"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-2">
                            <div className="flex p-1 bg-gray-100 rounded-xl">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-rotary-blue' : 'text-gray-400'}`}
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-rotary-blue' : 'text-gray-400'}`}
                                >
                                    <List className="w-4 h-4" />
                                </button>
                            </div>

                            <select
                                className="px-4 py-3 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/10 bg-white text-sm font-bold text-gray-600 shadow-sm"
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value as any)}
                            >
                                <option value="all">Todos los tipos</option>
                                <option value="image">Imágenes</option>
                                <option value="video">Videos</option>
                                <option value="document">Documentos</option>
                            </select>

                            {/* Entrar a seleccionar. Vive al lado del filtro de
                                tipos, que es donde el usuario lo pidió. */}
                            {filteredMedia.length > 0 && selected.size === 0 && (
                                <button
                                    onClick={() => setSelected(new Set([filteredMedia[0].id]))}
                                    className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-100 bg-white text-sm font-bold text-gray-600 shadow-sm hover:border-rotary-blue hover:text-rotary-blue transition-all"
                                    title="Seleccionar archivos para convertir o eliminar en bloque"
                                >
                                    <CheckSquare className="w-4 h-4" />
                                    <span className="hidden sm:inline">Seleccionar</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Barra de la selección. Sólo aparece con algo seleccionado:
                        una barra siempre presente ocuparía sitio para no decir nada. */}
                    {selected.size > 0 && (
                        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6 p-3 pl-4 bg-rotary-blue/5 border border-rotary-blue/20 rounded-2xl">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <span className="text-sm font-extrabold text-rotary-blue whitespace-nowrap">
                                    {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                                </span>
                                <button
                                    onClick={() => setSelected(new Set(filteredMedia.map(m => m.id)))}
                                    disabled={selected.size === filteredMedia.length}
                                    className="text-xs font-bold text-gray-500 hover:text-rotary-blue transition-colors disabled:opacity-40 whitespace-nowrap"
                                >
                                    Seleccionar todo ({filteredMedia.length})
                                </button>
                                <button
                                    onClick={() => setSelected(new Set())}
                                    className="text-xs font-bold text-gray-500 hover:text-rotary-blue transition-colors whitespace-nowrap"
                                >
                                    Quitar selección
                                </button>
                                {bulkProgress && (
                                    <span className="text-xs font-bold text-gray-500 whitespace-nowrap">
                                        Convirtiendo {bulkProgress.done} de {bulkProgress.total}…
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Convertir sólo se ofrece si hay algo que convertir:
                                    un botón que no va a hacer nada es peor que no tenerlo. */}
                                {selectedHeicCount > 0 && (
                                    <button
                                        onClick={bulkConvert}
                                        disabled={!!bulkBusy}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-amber-700 border border-amber-200 text-sm font-bold hover:bg-amber-50 transition-all disabled:opacity-50"
                                    >
                                        {bulkBusy === 'convert'
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <FileImage className="w-4 h-4" />}
                                        Convertir a JPG ({selectedHeicCount})
                                    </button>
                                )}
                                <button
                                    onClick={bulkDelete}
                                    disabled={!!bulkBusy}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-red-600 border border-red-200 text-sm font-bold hover:bg-red-50 transition-all disabled:opacity-50"
                                >
                                    {bulkBusy === 'delete'
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <Trash2 className="w-4 h-4" />}
                                    Eliminar ({selected.size})
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Las carpetas del nivel, antes de los archivos. Se
                        esconden al buscar: una búsqueda mira archivos, y dejar
                        las carpetas ahí haría creer que el resultado está
                        filtrado por ellas. */}
                    {!searchQuery && visibleFolders.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                            {visibleFolders.map(folder => (
                                <div
                                    key={folder.id}
                                    onClick={() => setCurrentFolder(folder.id)}
                                    className="group flex items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-100 hover:border-rotary-blue hover:shadow-lg transition-all cursor-pointer"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 flex-shrink-0 group-hover:bg-rotary-blue group-hover:text-white transition-all">
                                            <Folder className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-gray-800 truncate group-hover:text-rotary-blue transition-colors">{folder.name}</p>
                                            <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest">
                                                {folder.totalCount} archivo{folder.totalCount === 1 ? '' : 's'}
                                                {folder.children.length > 0 && ` · ${folder.children.length} subcarpeta${folder.children.length === 1 ? '' : 's'}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setRenaming({ ...folder }); }}
                                            className="p-2 text-gray-300 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-all"
                                            title="Renombrar"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="Eliminar carpeta"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                            <Loader2 className="w-10 h-10 text-rotary-blue animate-spin mb-4" />
                            <p className="text-gray-500 font-medium">Cargando archivos...</p>
                        </div>
                    ) : filteredMedia.length === 0 ? (
                        // Una carpeta que sólo tiene subcarpetas NO está vacía.
                        // El cartel de «no hay archivos» a pantalla completa
                        // decía lo contrario y tapaba lo que sí había.
                        visibleFolders.length > 0 && !searchQuery ? (
                            <p className="text-sm text-gray-400 font-medium px-1">
                                {currentFolder ? 'Esta carpeta no tiene archivos sueltos.' : 'No hay archivos fuera de las carpetas.'}
                            </p>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200 text-center">
                                <ImageIcon className="w-16 h-16 text-gray-100 mb-6 mx-auto" />
                                <h3 className="text-lg font-bold text-gray-800">No se encontraron archivos</h3>
                                <p className="text-gray-400 text-sm mt-1 max-w-xs mx-auto">
                                    {searchQuery
                                        ? 'Ninguno coincide con la búsqueda en esta carpeta.'
                                        : 'Sube archivos para que aparezcan en esta librería.'}
                                </p>
                            </div>
                        )
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                            {filteredMedia.map((item) => (
                                <div
                                    key={item.id}
                                    className={`group relative aspect-square bg-gray-50 rounded-2xl border transition-all overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 ${selected.has(item.id)
                                        ? 'border-rotary-blue ring-4 ring-rotary-blue/20'
                                        : selectedItem?.id === item.id ? 'border-rotary-blue ring-4 ring-rotary-blue/10' : 'border-gray-100'
                                        }`}
                                    // Con una selección en curso, pulsar la baldosa AGREGA o QUITA
                                    // en vez de abrir la ficha: quien está eligiendo varios espera
                                    // seguir eligiendo, no que se le abra un panel encima.
                                    onClick={() => (selected.size > 0 ? toggleSelected(item.id) : setSelectedItem(item))}
                                >
                                    {/* La casilla aparece al pasar el ratón, y se queda fija
                                        mientras haya algo seleccionado. Siempre visible llenaría
                                        la rejilla de controles para el uso normal, que es mirar. */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleSelected(item.id); }}
                                        className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-md flex items-center justify-center transition-all shadow-sm ${selected.has(item.id)
                                            ? 'bg-rotary-blue text-white opacity-100'
                                            : 'bg-white/90 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-rotary-blue'
                                            } ${selected.size > 0 ? 'opacity-100' : ''}`}
                                        // La etiqueta lleva el NOMBRE del archivo: con la rejilla
                                        // llena, «Seleccionar» a secas se repite en cada baldosa y
                                        // un lector de pantalla no puede distinguirlas.
                                        title={`${selected.has(item.id) ? 'Quitar de la selección' : 'Seleccionar'}: ${item.filename}`}
                                        aria-label={`${selected.has(item.id) ? 'Quitar de la selección' : 'Seleccionar'}: ${item.filename}`}
                                        aria-pressed={selected.has(item.id)}
                                    >
                                        {selected.has(item.id)
                                            ? <Check className="w-4 h-4" strokeWidth={3} />
                                            : <Square className="w-3.5 h-3.5" />}
                                    </button>
                                    {isHeicFile({ filename: item.filename }) ? (
                                        // Un HEIC no lo dibuja ningún navegador salvo Safari, así
                                        // que un `<img>` acá deja el recuadro roto y sin explicación.
                                        // Se muestra qué es y cómo arreglarlo.
                                        <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-amber-50 text-center gap-2">
                                            <FileImage className="w-8 h-8 text-amber-400" />
                                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-600">HEIC</span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); convertHeic(item); }}
                                                disabled={converting === item.id}
                                                className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-white text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all disabled:opacity-50"
                                                aria-label={`Convertir a JPG: ${item.filename}`}
                                                title={`Convertir a JPG: ${item.filename}`}
                                            >
                                                {converting === item.id
                                                    ? <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                                                    : 'Convertir a JPG'}
                                            </button>
                                        </div>
                                    ) : item.type === 'image' ? (
                                        <img src={item.thumbUrl || item.url} alt={item.filename} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                    ) : item.type === 'video' ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 overflow-hidden relative">
                                            <Video className="w-10 h-10 text-white/20" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                                    <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-white border-b-[6px] border-b-transparent ml-1" />
                                                </div>
                                            </div>
                                            <span className="absolute bottom-2 left-2 right-2 text-[8px] font-bold text-white/50 truncate uppercase tracking-tighter">Video</span>
                                            {trimEnCurso(item) && (
                                                <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-sky-600/90 text-white text-[9px] font-bold">
                                                    <Loader2 className="w-3 h-3 animate-spin" /> Recortando…
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center p-4">
                                            <FileText className="w-10 h-10 text-gray-300" />
                                            <span className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-tighter truncate w-full text-center">
                                                {item.filename.split('.').pop()}
                                            </span>
                                        </div>
                                    )}

                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); copyToClipboard(item.url); }}
                                            className="p-2 bg-white text-gray-800 rounded-lg hover:bg-rotary-blue hover:text-white transition-all shadow-lg"
                                            title="Copiar URL"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setMovingItem(item); }}
                                            className="p-2 bg-white text-gray-800 rounded-lg hover:bg-rotary-blue hover:text-white transition-all shadow-lg"
                                            title="Mover a una carpeta"
                                        >
                                            <FolderInput className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                                            className="p-2 bg-white text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-lg"
                                            title="Eliminar"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm overflow-x-auto">
                            <table className="w-full text-left min-w-[600px]">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="pl-6 pr-2 py-4 w-10">
                                            {/* Seleccionar todo desde la cabecera: es donde se
                                                busca en una tabla. */}
                                            <button
                                                onClick={() => setSelected(prev =>
                                                    prev.size === filteredMedia.length
                                                        ? new Set()
                                                        : new Set(filteredMedia.map(m => m.id)))}
                                                className="w-5 h-5 rounded flex items-center justify-center border border-gray-300 text-white transition-all hover:border-rotary-blue"
                                                style={{ background: selected.size === filteredMedia.length && filteredMedia.length ? '#013388' : 'transparent' }}
                                                title="Seleccionar todo"
                                                aria-label="Seleccionar todo"
                                            >
                                                {selected.size === filteredMedia.length && filteredMedia.length > 0 && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                                            </button>
                                        </th>
                                        <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Archivo</th>
                                        <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Tipo</th>
                                        <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Tamaño</th>
                                        <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredMedia.map((item) => (
                                        <tr key={item.id} className={`transition-colors ${selected.has(item.id) ? 'bg-sky-50/60' : 'hover:bg-gray-50/50'}`}>
                                            <td className="pl-6 pr-2 py-4">
                                                <button
                                                    onClick={() => toggleSelected(item.id)}
                                                    className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${selected.has(item.id)
                                                        ? 'bg-rotary-blue border-rotary-blue text-white'
                                                        : 'border-gray-300 text-transparent hover:border-rotary-blue'}`}
                                                    aria-label={`${selected.has(item.id) ? 'Quitar de la selección' : 'Seleccionar'}: ${item.filename}`}
                                                    aria-pressed={selected.has(item.id)}
                                                >
                                                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden border border-gray-100">
                                                        {isHeicFile({ filename: item.filename }) ? (
                                                            <FileImage className="w-5 h-5 text-amber-400" />
                                                        ) : item.type === 'image' ? (
                                                            <img src={item.thumbUrl || item.url} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                                        ) : item.type === 'video' ? (
                                                            <Video className="w-5 h-5 text-rotary-blue" />
                                                        ) : (
                                                            <FileText className="w-5 h-5 text-gray-300" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-800 text-sm truncate max-w-xs">{item.filename}</p>
                                                        <p className="text-[10px] text-gray-400 font-bold">Subido el {new Date(item.createdAt).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`text-[10px] font-bold uppercase ${item.type === 'image' ? 'text-blue-600' :
                                                        item.type === 'video' ? 'text-purple-600' : 'text-amber-600'
                                                    }`}>
                                                    {item.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 font-medium">
                                                {formatSize(item.size)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {isHeicFile({ filename: item.filename }) && (
                                                        <button
                                                            onClick={() => convertHeic(item)}
                                                            disabled={converting === item.id}
                                                            className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all disabled:opacity-50"
                                                            title="Convertir a JPG para poder verlo"
                                                        >
                                                            {converting === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Convertir a JPG'}
                                                        </button>
                                                    )}
                                                    <button onClick={() => copyToClipboard(item.url)} className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-all" title="Copiar URL">
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => setMovingItem(item)} className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-all" title="Mover a una carpeta">
                                                        <FolderInput className="w-4 h-4" />
                                                    </button>
                                                    <a href={item.url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-rotary-gold hover:bg-amber-50 rounded-lg transition-all" title="Ver original">
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                    <button onClick={() => handleDelete(item)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Eliminar">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* Renombrar una carpeta */}
            {renaming && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setRenaming(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-bold text-gray-800 text-lg mb-1">Renombrar carpeta</h3>
                        <p className="text-sm text-gray-500 mb-5">Los archivos que tiene adentro no se mueven.</p>
                        <input
                            autoFocus
                            value={renaming.name}
                            onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameFolder();
                                if (e.key === 'Escape') setRenaming(null);
                            }}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/10 font-medium mb-5"
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setRenaming(null)} className="px-4 py-2.5 text-gray-500 rounded-xl font-bold hover:bg-gray-50 transition-all">
                                Cancelar
                            </button>
                            <button
                                onClick={handleRenameFolder}
                                disabled={busyFolder}
                                className="px-5 py-2.5 bg-rotary-blue text-white rounded-xl font-bold hover:bg-rotary-navy transition-all disabled:opacity-50"
                            >
                                {busyFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mover un archivo a otra carpeta. Se ofrece el árbol COMPLETO,
                no sólo el nivel actual: mover suele ser precisamente sacar el
                archivo de donde está. */}
            {movingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setMovingItem(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="font-bold text-gray-800 text-lg">Mover archivo</h3>
                            <p className="text-sm text-gray-500 mt-1 truncate">{movingItem.filename}</p>
                        </div>
                        <div className="p-3 overflow-y-auto">
                            <button
                                onClick={() => moveMediaTo(movingItem, null)}
                                disabled={!movingItem.folderId}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-sky-50 transition-all text-left disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                                <CornerLeftUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="font-bold text-gray-700">Raíz de la Librería</span>
                                {!movingItem.folderId && <span className="ml-auto text-[10px] font-extrabold uppercase tracking-widest text-gray-300">Está acá</span>}
                            </button>
                            {folderTree.length === 0 && (
                                <p className="px-4 py-6 text-sm text-gray-400 text-center">
                                    Todavía no hay carpetas. Creá una con «Nueva carpeta».
                                </p>
                            )}
                            {(function renderOptions(nodes: FolderTreeNode[], depth: number): React.ReactNode {
                                return nodes.map(node => (
                                    <React.Fragment key={node.id}>
                                        <button
                                            onClick={() => moveMediaTo(movingItem, node.id)}
                                            disabled={movingItem.folderId === node.id}
                                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-sky-50 transition-all text-left disabled:opacity-40 disabled:hover:bg-transparent"
                                            style={{ paddingLeft: `${16 + depth * 20}px` }}
                                        >
                                            <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                            <span className="font-bold text-gray-700 truncate">{node.name}</span>
                                            {movingItem.folderId === node.id && (
                                                <span className="ml-auto text-[10px] font-extrabold uppercase tracking-widest text-gray-300">Está acá</span>
                                            )}
                                        </button>
                                        {renderOptions(node.children, depth + 1)}
                                    </React.Fragment>
                                ));
                            })(folderTree, 0)}
                        </div>
                    </div>
                </div>
            )}

            {/* Selection Modal / Sidebar */}
            {trimming && (
                <VideoTrimModal
                    item={trimming}
                    api={API}
                    authToken={token}
                    onClose={() => setTrimming(null)}
                    onDone={onTrimDone}
                />
            )}

            {selectedItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-end p-4 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
                    <div
                        className="bg-white h-full w-full max-w-sm shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">Detalles del Archivo</h3>
                            <button onClick={() => setSelectedItem(null)} className="p-2 hover:bg-white rounded-full text-gray-400 shadow-sm transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="aspect-square bg-gray-50 rounded-2xl border border-gray-100 mb-6 overflow-hidden flex items-center justify-center">
                                {isHeicFile({ filename: selectedItem.filename }) ? (
                                    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                                        <FileImage className="w-14 h-14 text-amber-300" />
                                        <p className="text-sm font-bold text-gray-700">Formato HEIC</p>
                                        <p className="text-xs text-gray-500 leading-relaxed">
                                            Es el formato con el que un iPhone guarda las fotos. Los navegadores
                                            no lo muestran, y en el sitio publicado tampoco se vería.
                                        </p>
                                        <button
                                            onClick={() => convertHeic(selectedItem)}
                                            disabled={converting === selectedItem.id}
                                            className="mt-1 px-4 py-2.5 rounded-xl bg-rotary-blue text-white font-bold text-sm hover:bg-rotary-navy transition-all disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {converting === selectedItem.id
                                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Convirtiendo…</>
                                                : 'Convertir a JPG'}
                                        </button>
                                    </div>
                                ) : selectedItem.type === 'image' ? (
                                    <img src={selectedItem.url} className="w-full h-full object-contain" />
                                ) : selectedItem.type === 'video' ? (
                                    <video key={videoPreviewSrc(selectedItem)} src={videoPreviewSrc(selectedItem)} controls className="w-full h-full object-contain bg-black" />
                                ) : (
                                    <FileText className="w-20 h-20 text-gray-200" />
                                )}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1">Nombre</label>
                                    <p className="font-bold text-gray-800 break-all">{selectedItem.filename}</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1">URL Pública</label>
                                    <div className="flex gap-2">
                                        <input
                                            readOnly
                                            value={selectedItem.url}
                                            className="flex-1 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs font-medium text-gray-500"
                                        />
                                        <button
                                            onClick={() => copyToClipboard(selectedItem.url)}
                                            className="p-2 bg-rotary-blue text-white rounded-lg hover:bg-sky-800 transition-all font-bold"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1">Tamaño</label>
                                        <p className="text-sm font-bold text-gray-700">{formatSize(selectedItem.size)}</p>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1">Subido</label>
                                        <p className="text-sm font-bold text-gray-700">{new Date(selectedItem.createdAt).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            </div>

                            {selectedItem.type === 'video' && (
                                <div className="mt-6 space-y-2">
                                    {trimEnCurso(selectedItem) && (
                                        <p className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 flex items-center gap-2">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Hay un recorte en proceso. Recargá la Biblioteca en un momento para ver el resultado.
                                        </p>
                                    )}
                                    {!trimEnCurso(selectedItem) && selectedItem.trim?.lastError?.message && (
                                        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                            El último recorte falló: {selectedItem.trim.lastError.message}. El original quedó intacto.
                                        </p>
                                    )}
                                    <button
                                        disabled={trimEnCurso(selectedItem)}
                                        onClick={() => setTrimming(selectedItem)}
                                        className="w-full bg-rotary-blue text-white py-3 rounded-xl font-extrabold hover:bg-rotary-navy transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                                    >
                                        <Scissors className="w-4 h-4" /> Recortar video
                                    </button>
                                    {selectedItem.trim?.current && (
                                        <>
                                            <button
                                                onClick={() => restoreTrim(selectedItem)}
                                                disabled={restoringTrim}
                                                className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {restoringTrim
                                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Restaurando…</>
                                                    : <><RotateCcw className="w-4 h-4" /> Restaurar versión original</>}
                                            </button>
                                            <p className="text-[11px] text-gray-400 leading-relaxed">
                                                Recortado el {selectedItem.trim.current.appliedAt ? new Date(selectedItem.trim.current.appliedAt).toLocaleDateString() : '—'}
                                                {typeof selectedItem.trim.current.newDurationSec === 'number' ? ` · dura ${fmtTime(selectedItem.trim.current.newDurationSec)}` : ''}
                                                {typeof selectedItem.trim.current.prevDurationSec === 'number' ? ` (antes ${fmtTime(selectedItem.trim.current.prevDurationSec)})` : ''}.
                                                El enlace público no cambió.
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={() => handleDelete(selectedItem)}
                                className="w-full mt-6 bg-red-50 text-red-500 py-3.5 rounded-xl font-extrabold hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                <Trash2 className="w-4 h-4" /> Eliminar permanentemente
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default MediaLibrary;
