// ════════════════════════════════════════════════════════════════════
// Generador de Outro IA — pantalla del módulo
// v4.646.0 · Motion Graphics, duración, presets, costos y predeterminado: v4.1035.0
// Modo MP4 importado (v4.1036.0): el archivo subido ES el maestro visual. La
// plataforma no lo regenera ni lo redibuja: sólo agrega voz, música y mezcla.
//
// Cierres de 3-7 segundos a partir de una imagen fija: se elige la imagen, la
// duración y el preset, se escribe (o no) el mensaje/CTA que dirá la voz, se
// genera y se aprueba en la vista previa antes de que llegue a la Biblioteca.
//
// DOS MOTORES. El predeterminado es Motion Graphics DETERMINISTA (ffmpeg):
// anima la imagen tal cual —logo, textos, colores y composición intactos—,
// cuesta cero créditos de generación y contesta en segundos, así que el outro
// suele volver ya `ready` en la misma respuesta. El generativo (Kling vía
// KIE) queda como alternativa expresa con su aviso: puede redibujar la marca y
// tarda 1-3 minutos, y ahí esta pantalla sondea `/sync` hasta el estado
// terminal. Los catálogos, los costos y las etapas vienen del servidor
// RESUELTOS: la pantalla pinta, no decide.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Clapperboard, Image as ImageIcon, Upload, Sparkles, Loader2, Mic, MicOff,
    Play, RefreshCw, Copy, Save, Trash2, Download, AlertTriangle, CheckCircle2,
    Wand2, Info, X, Gauge, Film, Star, Pencil, Timer, ShieldCheck, FileVideo, Music, SlidersHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import MediaPicker from './MediaPicker';
import { uploadMediaFiles, VIDEO_ACCEPT } from '../../../lib/mediaUpload';
import {
    checkSpeechFit, isPending, STATUS_STYLES, formatBytes,
    type Outro, type OutroOptions, type OutroVoice, type SourceReport, type OutroCosts,
    type OutroImportPreflight, type OutroMusic
} from '../../../lib/outroSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

const stageWord = (state: string) => (
    { ok: 'listo', skipped: 'omitida', failed: 'falló', running: 'en curso', pending: 'pendiente' } as Record<string, string>
)[state] || state;

interface PickedImage {
    url: string;
    mediaId: string | null;
    filename: string;
}

interface PickedVideo {
    url: string;
    mediaId: string | null;
    filename: string;
}

// Los dos modos del módulo (v4.1036). `motion` es el flujo de siempre —imagen
// fija animada o generada—; `import` toma un MP4 terminado como maestro visual
// y sólo le agrega audio. Ninguno redibuja lo que el otro produce.
type OutroMode = 'motion' | 'import';

const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg';
const NO_MUSIC: OutroMusic = { mode: 'none', url: null, mediaId: null, filename: null, style: null, source: null };
const aspectLabel = (aspect: number | null, format: string | null): string =>
    format || (aspect ? `${aspect.toFixed(2)}:1` : '—');

interface Preflight {
    engine: { id: string; label: string; nativeAudio: boolean; deterministic?: boolean };
    format: string;
    durationSec: number;
    resolution: string;
    master: { width: number; height: number };
    voiceEnabled: boolean;
    voiceMode?: 'none' | 'native' | 'tts';
    ttsConfigured?: boolean;
    notes: string[];
    sourceReport: SourceReport | null;
    creditEstimate: number;
    costs?: OutroCosts | null;
}

// Las duraciones que se OFRECEN como botón. «Personalizado» sólo existe si el
// motor lo admite (`customDuration`): a Kling no se le pide 4 s porque no los
// entrega, y eso lo decide el catálogo del servidor, no esta pantalla.
type DurationChoice = number | 'custom';

const OutroGenerator: React.FC = () => {
    const [options, setOptions] = useState<OutroOptions | null>(null);
    const [outros, setOutros] = useState<Outro[]>([]);
    const [loading, setLoading] = useState(true);

    const [image, setImage] = useState<PickedImage | null>(null);
    const [showPicker, setShowPicker] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [organizationName, setOrganizationName] = useState('');
    const [speechText, setSpeechText] = useState('');
    const [style, setStyle] = useState('institucional');
    const [engine, setEngine] = useState('motion');
    const [preset, setPreset] = useState('institucional_elegante');
    const [durationChoice, setDurationChoice] = useState<DurationChoice>(5);
    const [customDuration, setCustomDuration] = useState(5);
    const [format, setFormat] = useState('9:16');
    const [defaultOutroId, setDefaultOutroId] = useState<string | null>(null);
    const [voice, setVoice] = useState<OutroVoice>({
        enabled: false, language: 'es-CO', gender: 'female', pace: 'normal', tone: 'institutional', volume: 'normal'
    });

    const [preflight, setPreflight] = useState<Preflight | null>(null);
    const [generating, setGenerating] = useState(false);

    // ── Modo MP4 importado (v4.1036) ──────────────────────────────────────
    const [mode, setMode] = useState<OutroMode>('motion');
    const [video, setVideo] = useState<PickedVideo | null>(null);
    const [showVideoPicker, setShowVideoPicker] = useState(false);
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const [keepOriginalAudio, setKeepOriginalAudio] = useState(true);
    const [music, setMusic] = useState<OutroMusic>(NO_MUSIC);
    const [musicTracks, setMusicTracks] = useState<{ id: string; filename: string; url: string; sizeBytes: number | null }[] | null>(null);
    const [uploadingMusic, setUploadingMusic] = useState(false);
    const musicInputRef = useRef<HTMLInputElement>(null);
    const [importPreflight, setImportPreflight] = useState<OutroImportPreflight | null>(null);
    const [importing, setImporting] = useState(false);
    // Remezcla de un outro importado: cambia niveles sin volver a tocar el video.
    const [remix, setRemix] = useState<{ keepOriginalAudio: boolean; musicGainDb: number; voiceVolume: string } | null>(null);
    const isImport = mode === 'import';
    const [summarizing, setSummarizing] = useState(false);
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [busyIds, setBusyIds] = useState<string[]>([]);

    const markBusy = (id: string, on: boolean) =>
        setBusyIds(prev => on ? [...new Set([...prev, id])] : prev.filter(x => x !== id));

    // ── Carga inicial ──────────────────────────────────────────────────────
    const loadOptions = useCallback(async () => {
        try {
            const r = await fetch(`${API}/content-studio/outros/options`, { headers: authHeaders() });
            if (!r.ok) throw new Error('No se pudieron cargar las opciones');
            const data: OutroOptions = await r.json();
            setOptions(data);
            setStyle(data.defaultStyle);
            if (data.defaultEngine) setEngine(data.defaultEngine);
            if (data.defaultPreset) setPreset(data.defaultPreset);
            if (data.defaultOutroId !== undefined) setDefaultOutroId(data.defaultOutroId);
            setFormat(data.defaultFormat);
            setVoice(v => ({ ...data.voice.defaults, ...v }));
        } catch (e) {
            toast.error((e as Error).message);
        }
    }, []);

    const loadOutros = useCallback(async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const r = await fetch(`${API}/content-studio/outros`, { headers: authHeaders() });
            if (r.ok) {
                const data = await r.json();
                setOutros(data.outros || []);
                if (data.defaultOutroId !== undefined) setDefaultOutroId(data.defaultOutroId);
                if (data.credits) setOptions(o => o ? { ...o, credits: data.credits } : o);
            }
        } catch { /* la lista se reintenta en el próximo sondeo */ } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    useEffect(() => { loadOptions(); loadOutros(); }, [loadOptions, loadOutros]);

    // ── Sondeo de los outros en curso ──────────────────────────────────────
    // Cada uno se consulta por separado porque es ese endpoint el que, cuando
    // KIE termina, descarga el archivo, lo valida y lo sube a nuestro bucket.
    useEffect(() => {
        const pending = outros.filter(o => isPending(o.status));
        if (pending.length === 0) return;

        const interval = setInterval(async () => {
            const updates = await Promise.all(pending.map(async (o) => {
                try {
                    const r = await fetch(`${API}/content-studio/outros/${o.id}/sync`, { headers: authHeaders() });
                    return r.ok ? (await r.json()) as Outro : null;
                } catch { return null; }
            }));

            const byId = new Map(updates.filter(Boolean).map(u => [u!.id, u!]));
            if (byId.size === 0) return;

            setOutros(prev => prev.map(o => {
                const next = byId.get(o.id);
                if (!next) return o;
                if (next.status !== o.status && !isPending(next.status)) {
                    if (next.status === 'ready') toast.success(`"${next.title}" quedó listo.`);
                    if (next.status === 'needs_review') toast.warning(`"${next.title}" requiere revisión: ${next.statusDetail || 'no pasó la validación de calidad'}`);
                    if (next.status === 'error') toast.error(`"${next.title}" falló: ${next.statusDetail || 'error del proveedor'}`);
                }
                return next;
            }));
        }, 6000);

        return () => clearInterval(interval);
    }, [outros]);

    // ── Motor y duración ───────────────────────────────────────────────────
    const engineInfo = useMemo(
        () => options?.engines.find(e => e.id === engine) || options?.engines.find(e => e.isDefault) || null,
        [options, engine]
    );
    const isMotion = Boolean(engineInfo?.deterministic ?? true);
    const durationButtons: DurationChoice[] = useMemo(() => {
        const listed = engineInfo?.durations?.length ? engineInfo.durations : [3, 5, 7];
        return engineInfo?.customDuration ? [...listed, 'custom'] : listed;
    }, [engineInfo]);
    // Al cambiar de motor, una duración que ése no ofrece vuelve a la suya por
    // defecto (5 s si la entrega; si no, la primera de su lista).
    useEffect(() => {
        if (!engineInfo) return;
        const valid = durationChoice === 'custom' ? Boolean(engineInfo.customDuration) : engineInfo.durations.includes(durationChoice);
        if (!valid) setDurationChoice(engineInfo.durations.includes(5) ? 5 : (engineInfo.durations[0] ?? 5));
    }, [engineInfo, durationChoice]);
    const requestedDurationSec = durationChoice === 'custom' ? customDuration : durationChoice;

    // ── Comprobación previa ────────────────────────────────────────────────
    // Se dispara al cambiar imagen, motor, duración, formato o voz. Devuelve
    // la duración REAL que el motor va a entregar (de ahí sale el presupuesto
    // de palabras), el desglose de costos, el análisis de la imagen y los
    // ajustes que el servidor tuvo que aplicar. Nunca se manda al motor una
    // duración que el servidor no haya validado antes.
    useEffect(() => {
        if (!image?.url) { setPreflight(null); return; }
        let cancelled = false;
        const handle = setTimeout(async () => {
            try {
                const r = await fetch(`${API}/content-studio/outros/preflight`, {
                    method: 'POST',
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageUrl: image.url, format, voice, speechText, engine, durationSec: requestedDurationSec })
                });
                if (r.ok && !cancelled) setPreflight(await r.json());
            } catch { /* silencioso: es una ayuda, no un requisito */ }
        }, 300);
        return () => { cancelled = true; clearTimeout(handle); };
        // speechText queda fuera a propósito: el contador se calcula localmente
        // en cada tecla y no necesita ir al servidor.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [image?.url, format, voice.enabled, voice.language, voice.pace, engine, requestedDurationSec]);

    const durationSec = isImport
        ? (importPreflight?.durationSec ?? 5)
        : (preflight?.durationSec ?? requestedDurationSec ?? options?.targetDurationSec ?? 5);
    const costs: OutroCosts | null = isImport
        ? (importPreflight?.costs ?? {
            generationCost: 0,
            ttsCost: voice.enabled ? (options?.tts.creditEstimate ?? 0) : 0,
            musicCost: music.mode === 'generate' ? (options?.importing?.music.creditEstimate ?? 0) : 0,
            compositionCost: 0,
            total: 0
        })
        : preflight?.costs
        ?? (engineInfo ? {
            generationCost: voice.enabled && engineInfo.nativeAudio ? engineInfo.creditEstimateAudio : engineInfo.creditEstimate,
            ttsCost: voice.enabled && engineInfo.ttsVoice ? (options?.tts.creditEstimate ?? 0) : 0,
            compositionCost: 0,
            total: 0
        } : null);
    if (costs && (isImport ? !importPreflight?.costs : !preflight?.costs)) costs.total = costs.generationCost + costs.ttsCost + (costs.musicCost ?? 0) + costs.compositionCost;
    const ttsMissing = voice.enabled && (isImport || Boolean(engineInfo?.ttsVoice)) && options ? !options.tts.configured : false;
    const fit = useMemo(
        () => checkSpeechFit(speechText, { durationSec, language: voice.language, pace: voice.pace }),
        [speechText, durationSec, voice.language, voice.pace]
    );
    // El presupuesto de palabras sólo LIMITA al motor generativo (Kling), cuya
    // voz la produce el modelo dentro de un clip de duración fija. Con el MP4
    // importado y con Motion Graphics el texto se pronuncia entero: la
    // locución se mide al generar y, si dura más que el video, el outro se
    // extiende solo manteniendo el último fotograma (v4.1038). Ahí el contador
    // es informativo y nunca bloquea «Procesar outro».
    const speechLimited = !isImport && !isMotion;
    const mayExtend = isImport
        ? Boolean(importPreflight?.speech?.mayExtend)
        : (!speechLimited && fit.words > 0 && fit.estimatedSec > fit.availableSec);

    // ── Comprobación previa del MP4 importado ──────────────────────────────
    // El servidor mide el archivo (contenedor, sin decodificar), decide el
    // escenario de mezcla y dice si el mensaje cabe en la duración REAL.
    useEffect(() => {
        if (!isImport || !video?.url) { setImportPreflight(null); return; }
        let cancelled = false;
        const handle = setTimeout(async () => {
            try {
                const r = await fetch(`${API}/content-studio/outros/import/preflight`, {
                    method: 'POST',
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ videoUrl: video.url, mediaId: video.mediaId, voice, speechText, music, keepOriginalAudio })
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error || 'No se pudo inspeccionar el video');
                if (!cancelled) setImportPreflight(data);
            } catch (e) {
                if (!cancelled) toast.error((e as Error).message);
            }
        }, 400);
        return () => { cancelled = true; clearTimeout(handle); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isImport, video?.url, voice.enabled, voice.language, voice.pace, speechText, music.mode, music.url, music.style, keepOriginalAudio]);

    const handleVideoPick = (items: { id: string; url: string; filename: string }[]) => {
        const first = items[0];
        if (!first) return;
        setVideo({ url: first.url, mediaId: first.id, filename: first.filename });
    };

    const handleVideoUpload = async (file: File) => {
        const isVideo = file.type.startsWith('video/') || /\.(mp4|m4v|mov)$/i.test(file.name);
        if (!isVideo) { toast.error('Subí un video MP4 (también .mov o .m4v)'); return; }
        const max = options?.importing?.maxBytes;
        if (max && file.size > max) { toast.error(`El archivo pesa ${formatBytes(file.size)} y el tope es ${formatBytes(max)}.`); return; }
        setUploadingVideo(true);
        const toastId = toast.loading('Subiendo el video a la Biblioteca...');
        try {
            const { uploaded, failed } = await uploadMediaFiles([file]);
            if (failed[0]) throw new Error(failed[0].reason);
            const up = uploaded[0];
            setVideo({ url: up.url, mediaId: up.id, filename: up.filename });
            toast.success('Video cargado. Inspeccionando...', { id: toastId });
        } catch (e) {
            toast.error((e as Error).message, { id: toastId });
        } finally {
            setUploadingVideo(false);
            if (videoInputRef.current) videoInputRef.current.value = '';
        }
    };

    const loadMusicTracks = useCallback(async () => {
        try {
            const r = await fetch(`${API}/content-studio/outros/music/library`, { headers: authHeaders() });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo leer la Biblioteca');
            setMusicTracks(data.tracks || []);
        } catch (e) {
            setMusicTracks([]);
            toast.error((e as Error).message);
        }
    }, []);

    useEffect(() => {
        if (isImport && music.mode === 'library' && musicTracks === null) loadMusicTracks();
    }, [isImport, music.mode, musicTracks, loadMusicTracks]);

    const handleMusicUpload = async (file: File) => {
        const isAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg)$/i.test(file.name);
        if (!isAudio) { toast.error('Subí un archivo de audio (MP3, M4A, WAV, OGG)'); return; }
        setUploadingMusic(true);
        const toastId = toast.loading('Subiendo la pista...');
        try {
            const { uploaded, failed } = await uploadMediaFiles([file]);
            if (failed[0]) throw new Error(failed[0].reason);
            const up = uploaded[0];
            setMusic({ mode: 'library', url: up.url, mediaId: up.id, filename: up.filename, style: null, source: 'upload' });
            setMusicTracks(null);
            toast.success('Pista cargada', { id: toastId });
        } catch (e) {
            toast.error((e as Error).message, { id: toastId });
        } finally {
            setUploadingMusic(false);
            if (musicInputRef.current) musicInputRef.current.value = '';
        }
    };

    // ── Procesar el MP4 importado ──────────────────────────────────────────
    const handleImport = async () => {
        if (!video?.url) { toast.error('Subí o elegí primero el video MP4'); return; }
        if (importPreflight && !importPreflight.report.ok) { toast.error('El video no pasa la validación: revisá los motivos.'); return; }
        if (voice.enabled && !speechText.trim()) { toast.error('Escribí el texto que va a pronunciar la voz'); return; }
        // Sin límite de longitud: la locución se mide al generar y el outro se
        // extiende si hace falta. Nada bloquea acá por el largo del texto.
        if (ttsMissing) { toast.error('No hay proveedor de voz configurado: desactivá la voz en off o configurá uno.'); return; }
        if (music.mode === 'library' && !music.url) { toast.error('Elegí o subí la pista de música, o marcá «Sin música».'); return; }

        setImporting(true);
        const toastId = toast.loading('Procesando el audio del outro. El video no se toca...');
        try {
            const r = await fetch(`${API}/content-studio/outros/import`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoUrl: video.url, mediaId: video.mediaId,
                    voice, speechText, music, keepOriginalAudio, organizationName
                })
            });
            const data = await r.json();
            if (!r.ok) {
                toast.error(data.error || 'No se pudo procesar el outro', { id: toastId, duration: 8000 });
                return;
            }
            setOutros(prev => [data, ...prev]);
            if (data.credits) setOptions(o => o ? { ...o, credits: data.credits } : o);
            if (data.status === 'ready') toast.success(`"${data.title}" quedó listo.`, { id: toastId });
            else if (data.status === 'needs_review') toast.warning(`"${data.title}" requiere revisión: ${data.statusDetail || 'no pasó la validación'}`, { id: toastId, duration: 8000 });
            else if (data.status === 'error') toast.error(`"${data.title}" falló: ${data.statusDetail || 'error'}`, { id: toastId, duration: 8000 });
            else toast.success('Procesando. Te aviso cuando esté listo.', { id: toastId });
            (data.notes || []).forEach((n: string) => toast.info(n, { duration: 7000 }));
        } catch (e) {
            toast.error((e as Error).message, { id: toastId });
        } finally {
            setImporting(false);
        }
    };

    // ── Selección de imagen ────────────────────────────────────────────────
    const handleLibraryPick = (items: { id: string; url: string; filename: string }[]) => {
        const first = items[0];
        if (!first) return;
        setImage({ url: first.url, mediaId: first.id, filename: first.filename });
    };

    const handleUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('El outro se genera desde una imagen fija');
            return;
        }
        setUploading(true);
        const toastId = toast.loading('Subiendo la imagen...');
        try {
            const body = new FormData();
            body.append('file', file);
            const r = await fetch(`${API}/media/upload`, { method: 'POST', headers: authHeaders(), body });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo subir la imagen');
            setImage({ url: data.url, mediaId: data.id, filename: data.filename });
            toast.success('Imagen cargada', { id: toastId });
        } catch (e) {
            toast.error((e as Error).message, { id: toastId });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Resumen con IA ─────────────────────────────────────────────────────
    const handleSummarize = async () => {
        setSummarizing(true);
        const toastId = toast.loading('Resumiendo el mensaje...');
        try {
            const r = await fetch(`${API}/content-studio/outros/speech/summary`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(isImport
                    ? { text: speechText, voice, format: importPreflight?.format || format, engine: 'motion', durationSec: durationSec }
                    : { text: speechText, voice, format, engine, durationSec: requestedDurationSec })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo resumir');
            setSpeechText(data.summary);
            toast.success(`Ajustado a ${data.fit.words} palabras`, { id: toastId });
        } catch (e) {
            toast.error((e as Error).message, { id: toastId });
        } finally {
            setSummarizing(false);
        }
    };

    // ── Generación ─────────────────────────────────────────────────────────
    const handleGenerate = async () => {
        if (!image?.url) { toast.error('Elegí primero la imagen del outro'); return; }
        if (voice.enabled && !speechText.trim()) { toast.error('Escribí el texto que va a pronunciar la voz'); return; }
        if (voice.enabled && speechLimited && !fit.fits) { toast.error(`El texto no cabe en ${durationSec} segundos con el motor generativo. Resumilo o elegí Motion Graphics.`); return; }
        if (ttsMissing) { toast.error('No hay proveedor de voz configurado: desactivá la voz en off o configurá uno.'); return; }

        setGenerating(true);
        const toastId = toast.loading(isMotion ? 'Componiendo el outro (Motion Graphics)...' : 'Enviando el outro al motor de IA...');
        try {
            const r = await fetch(`${API}/content-studio/outros`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: image.url, imageMediaId: image.mediaId,
                    speechText, organizationName, style, preset, engine,
                    format, voice, durationSec: requestedDurationSec
                })
            });
            const data = await r.json();
            if (!r.ok) {
                if (data.needsSummary) {
                    toast.error(data.error, { id: toastId, duration: 6000 });
                } else {
                    throw new Error(data.error || 'No se pudo iniciar la generación');
                }
                return;
            }
            setOutros(prev => [data, ...prev]);
            if (data.credits) setOptions(o => o ? { ...o, credits: data.credits } : o);
            // El motor determinista suele contestar con el outro YA listo.
            if (data.status === 'ready') toast.success(`"${data.title}" quedó listo.`, { id: toastId });
            else if (data.status === 'needs_review') toast.warning(`"${data.title}" requiere revisión: ${data.statusDetail || 'no pasó la validación'}`, { id: toastId, duration: 8000 });
            else if (data.status === 'error') toast.error(`"${data.title}" falló: ${data.statusDetail || 'error'}`, { id: toastId, duration: 8000 });
            else toast.success('Generando. Te aviso cuando esté listo.', { id: toastId });
            (data.notes || []).forEach((n: string) => toast.info(n, { duration: 7000 }));
        } catch (e) {
            toast.error((e as Error).message, { id: toastId });
        } finally {
            setGenerating(false);
        }
    };

    // ── Acciones sobre un outro ────────────────────────────────────────────
    const act = async (id: string, path: string, method: string, body: unknown, okMessage: string) => {
        markBusy(id, true);
        try {
            const r = await fetch(`${API}/content-studio/outros/${id}${path}`, {
                method,
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'La acción falló');
            toast.success(okMessage);
            return data;
        } catch (e) {
            toast.error((e as Error).message);
            return null;
        } finally {
            markBusy(id, false);
        }
    };

    const handleRetry = async (o: Outro) => {
        const data = await act(o.id, '/retry', 'POST', null, 'Regenerando el outro');
        if (data) setOutros(prev => prev.map(x => x.id === o.id ? data : x));
    };

    const handleDuplicate = async (o: Outro) => {
        const data = await act(o.id, '/duplicate', 'POST', {}, 'Variante en camino');
        if (data) setOutros(prev => [data, ...prev]);
    };

    const handleSaveToLibrary = async (o: Outro) => {
        const force = o.status === 'needs_review';
        if (force && !window.confirm('Este outro no pasó la validación de calidad. ¿Guardarlo igual en la Biblioteca?')) return;
        const data = await act(o.id, '/library', 'POST', { force }, 'Guardado en la Biblioteca, carpeta Outros');
        if (data?.outro) setOutros(prev => prev.map(x => x.id === o.id ? data.outro : x));
    };

    // «Usar como outro predeterminado»: un ajuste del SITIO que el Creador de
    // Reels lee al abrirse. El servidor decide el sitio desde el token.
    const handleSetDefault = async (o: Outro) => {
        const data = await act(o.id, '/default', 'PUT', {}, `"${o.title}" es ahora el outro predeterminado del sitio`);
        if (data) {
            setDefaultOutroId(o.id);
            setOutros(prev => prev.map(x => ({ ...x, isDefault: x.id === o.id })));
        }
    };

    const handleClearDefault = async (o: Outro) => {
        markBusy(o.id, true);
        try {
            const r = await fetch(`${API}/content-studio/outros/default`, { method: 'DELETE', headers: authHeaders() });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'No se pudo quitar el predeterminado');
            setDefaultOutroId(null);
            setOutros(prev => prev.map(x => ({ ...x, isDefault: false })));
            toast.success('El sitio ya no tiene outro predeterminado');
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            markBusy(o.id, false);
        }
    };

    const handleRename = async (o: Outro) => {
        const title = window.prompt('Nuevo nombre del outro', o.title);
        if (title == null) return;
        if (!title.trim()) { toast.error('El nombre no puede quedar vacío'); return; }
        const data = await act(o.id, '', 'PATCH', { title: title.trim() }, 'Outro renombrado');
        if (data) setOutros(prev => prev.map(x => x.id === o.id ? data : x));
    };

    // Cambiar niveles de un outro importado NO regenera el video: el servidor
    // vuelve a mezclar con los intermedios que ya están en S3 (video `-c:v copy`).
    const handleRemix = async (o: Outro) => {
        if (!remix) return;
        const data = await act(o.id, '/remix', 'POST', remix, 'Audio remezclado; el video no se tocó');
        if (data) { setOutros(prev => prev.map(x => x.id === o.id ? data : x)); setRemix(null); }
    };

    const handleDelete = async (o: Outro) => {
        if (!window.confirm(`¿Eliminar "${o.title}" del generador?${o.mediaId ? ' El archivo ya guardado en la Biblioteca se conserva.' : ''}`)) return;
        const data = await act(o.id, '', 'DELETE', null, 'Outro eliminado');
        if (data) {
            setOutros(prev => prev.filter(x => x.id !== o.id));
            if (previewId === o.id) setPreviewId(null);
            if (defaultOutroId === o.id) setDefaultOutroId(null);
        }
    };

    const downloadUrl = (o: Outro) =>
        `${API}/content-studio/download?url=${encodeURIComponent(o.videoUrl || '')}&filename=${encodeURIComponent(o.title)}`;

    const preview = outros.find(o => o.id === previewId) || null;
    const latest = outros[0] || null;
    const credits = options?.credits;

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ── Modo: generar o importar (v4.1036) ── */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3">¿Cómo quieres crear tu outro?</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                        onClick={() => setMode('motion')}
                        className={`p-4 rounded-2xl border text-left transition-all ${mode === 'motion' ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-600/10' : 'bg-gray-50 border-gray-100 hover:border-indigo-200'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-600" />
                            <p className={`text-sm font-black ${mode === 'motion' ? 'text-indigo-700' : 'text-gray-800'}`}>Generar con Motion Graphics</p>
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium leading-snug mt-2">
                            Desde una imagen fija: la plataforma la anima, le pone voz y la mezcla. El flujo de siempre.
                        </p>
                    </button>
                    <button
                        onClick={() => setMode('import')}
                        className={`p-4 rounded-2xl border text-left transition-all ${mode === 'import' ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-600/10' : 'bg-gray-50 border-gray-100 hover:border-indigo-200'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Upload className="w-4 h-4 text-emerald-600" />
                            <p className={`text-sm font-black ${mode === 'import' ? 'text-indigo-700' : 'text-gray-800'}`}>Importar video MP4</p>
                            <span className="ml-auto px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-100 text-[9px] font-black uppercase tracking-wide text-emerald-700">Sin IA de imagen</span>
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium leading-snug mt-2">
                            Ya tenés el outro terminado: el archivo es el maestro visual y se conserva tal cual. Sólo se agrega voz, música y mezcla.
                        </p>
                    </button>
                </div>
            </div>

            {options && !isImport && !isMotion && !options.providerConfigured && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-amber-800">
                        El motor generativo no está configurado (falta <code className="font-mono">KIE_API_KEY</code> en el entorno).
                        El motor de Motion Graphics no la necesita: elegilo para generar igual.
                    </p>
                </div>
            )}
            {ttsMissing && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-amber-800">
                        No hay proveedor de voz configurado (<code className="font-mono">ELEVENLABS_API_KEY</code> u <code className="font-mono">OPENAI_API_KEY</code>):
                        el outro saldría sin locución. Desactivá la voz en off o configurá uno.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* ── Columna de configuración ── */}
                <div className="lg:col-span-8 flex flex-col gap-6">

                    {/* Video MP4 importado (v4.1036) */}
                    {isImport && (
                        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-lg font-black text-gray-900">Video del outro (MP4)</h3>
                                    <p className="text-sm text-gray-500 font-medium">
                                        Es el maestro visual. No se regenera, no se redibuja y no gasta créditos de generación: se conserva fotograma a fotograma.
                                    </p>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => setShowVideoPicker(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all border border-indigo-100/50"
                                    >
                                        <Film className="w-4 h-4" />
                                        Elegir desde Biblioteca
                                    </button>
                                    <button
                                        onClick={() => videoInputRef.current?.click()}
                                        disabled={uploadingVideo}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-600 rounded-xl font-black text-xs hover:bg-gray-100 transition-all border border-gray-100 disabled:opacity-50"
                                    >
                                        {uploadingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                        Subir
                                    </button>
                                    <input
                                        ref={videoInputRef}
                                        type="file"
                                        accept={VIDEO_ACCEPT}
                                        className="hidden"
                                        onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
                                    />
                                </div>
                            </div>

                            {!video ? (
                                <div
                                    onClick={() => videoInputRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleVideoUpload(f); }}
                                    className={`aspect-[16/5] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50/30' : 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/10'}`}
                                >
                                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                                        <FileVideo className="w-6 h-6 text-gray-300" />
                                    </div>
                                    <p className="text-sm text-gray-400 font-bold">Arrastrá el MP4 acá o hacé clic para elegirlo</p>
                                    <p className="text-[10px] text-gray-400 font-medium">
                                        Ideal 1080×1920 (9:16) · {options?.importing ? `${options.importing.minSec}-${options.importing.maxSec} s · hasta ${formatBytes(options.importing.maxBytes)}` : 'hasta 20 s'}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col sm:flex-row gap-5">
                                    <div className="w-full sm:w-44 aspect-[9/16] max-h-72 rounded-2xl overflow-hidden border border-gray-100 flex-shrink-0 bg-black">
                                        <video key={video.url} src={video.url} controls playsInline className="w-full h-full object-contain bg-black" />
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-3">
                                        <p className="text-sm font-bold text-gray-800 truncate">{video.filename}</p>
                                        {importPreflight ? (
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">
                                                    <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                                                        {importPreflight.source.width}×{importPreflight.source.height}
                                                    </span>
                                                    <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                                                        {aspectLabel(importPreflight.source.aspect, importPreflight.report.format)}
                                                    </span>
                                                    <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                                                        {importPreflight.source.durationSec?.toFixed(1)} s
                                                    </span>
                                                    <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                                                        {formatBytes(importPreflight.source.sizeBytes)}
                                                    </span>
                                                    <span className={`px-2 py-1 rounded-lg border ${importPreflight.source.hasAudio ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                                                        Audio original: {importPreflight.source.hasAudio ? 'Sí' : 'No'}
                                                    </span>
                                                    {importPreflight.source.videoCodec && (
                                                        <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                                                            {importPreflight.source.videoCodec}{importPreflight.source.fps ? ` · ${importPreflight.source.fps} fps` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                                {importPreflight.report.failures.map((f, i) => (
                                                    <p key={`f${i}`} className="flex items-start gap-2 text-xs font-bold text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
                                                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{f}
                                                    </p>
                                                ))}
                                                {importPreflight.report.warnings.map((w, i) => (
                                                    <p key={`w${i}`} className="flex items-start gap-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                                                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{w}
                                                    </p>
                                                ))}
                                                {importPreflight.report.ok && !importPreflight.report.warnings.length && (
                                                    <p className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        El video es compatible con el compositor: se usa tal cual.
                                                    </p>
                                                )}
                                                {importPreflight.report.normalization.needed && (
                                                    <p className="flex items-start gap-2 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-100 rounded-xl p-3">
                                                        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                                        Se normaliza el contenedor/códec ({importPreflight.report.normalization.reasons.join('; ')}). El contenido no cambia.
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="flex items-center gap-2 text-xs font-bold text-gray-400"><Loader2 className="w-4 h-4 animate-spin" />Inspeccionando el archivo...</p>
                                        )}
                                        <button onClick={() => { setVideo(null); setImportPreflight(null); }} className="text-xs font-black text-gray-400 hover:text-red-500 transition-colors">
                                            Quitar video
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Imagen */}
                    {!isImport && (
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Imagen del outro</h3>
                                <p className="text-sm text-gray-500 font-medium">
                                    Es la base visual del cierre. Se conserva tal cual: logo, textos, colores y composición.
                                </p>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                                <button
                                    onClick={() => setShowPicker(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all border border-indigo-100/50"
                                >
                                    <ImageIcon className="w-4 h-4" />
                                    Biblioteca
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-600 rounded-xl font-black text-xs hover:bg-gray-100 transition-all border border-gray-100 disabled:opacity-50"
                                >
                                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    Subir
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                                />
                            </div>
                        </div>

                        {!image ? (
                            <div
                                onClick={() => setShowPicker(true)}
                                className="aspect-[16/5] border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/10 transition-all"
                            >
                                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                                    <Clapperboard className="w-6 h-6 text-gray-300" />
                                </div>
                                <p className="text-sm text-gray-400 font-bold">Elegí la imagen del cierre</p>
                            </div>
                        ) : (
                            <div className="flex flex-col sm:flex-row gap-5">
                                <div className="w-full sm:w-40 aspect-square rounded-2xl overflow-hidden border border-gray-100 flex-shrink-0 bg-gray-50">
                                    <img src={image.url} alt={image.filename} className="w-full h-full object-contain" />
                                </div>
                                <div className="flex-1 min-w-0 space-y-3">
                                    <p className="text-sm font-bold text-gray-800 truncate">{image.filename}</p>

                                    {preflight?.sourceReport && (
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">
                                                {preflight.sourceReport.width && (
                                                    <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                                                        {preflight.sourceReport.width}×{preflight.sourceReport.height}px
                                                    </span>
                                                )}
                                                {preflight.sourceReport.sharpness != null && (
                                                    <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                                                        Nitidez {preflight.sourceReport.sharpness}
                                                    </span>
                                                )}
                                                <span className="px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700">
                                                    Maestro {preflight.master.width}×{preflight.master.height}
                                                </span>
                                            </div>
                                            {preflight.sourceReport.warnings?.map((w, i) => (
                                                <p key={i} className="flex items-start gap-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                                    {w}
                                                </p>
                                            ))}
                                            {preflight.sourceReport.ok && !preflight.sourceReport.warnings?.length && (
                                                <p className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    La imagen entra con resolución y nitidez suficientes.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        onClick={() => setImage(null)}
                                        className="text-xs font-black text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        Quitar imagen
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    )}

                    {/* Voz en off */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                {voice.enabled ? <Mic className="w-5 h-5 text-indigo-600" /> : <MicOff className="w-5 h-5 text-gray-400" />}
                                <div>
                                    <h3 className="font-black text-gray-900">Mensaje / CTA y voz en off</h3>
                                    <p className="text-xs text-gray-500 font-medium">
                                        Opcional. La voz se ajusta a la duración del cierre: primero se estima si entra; nunca se acelera para que quepa.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setVoice(v => ({ ...v, enabled: !v.enabled }))}
                                className={`relative w-12 h-7 rounded-full transition-all flex-shrink-0 ${voice.enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
                                aria-label="Activar voz en off"
                            >
                                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${voice.enabled ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">
                                    Organización o nombre del sitio
                                </label>
                                <input
                                    type="text"
                                    value={organizationName}
                                    onChange={(e) => setOrganizationName(e.target.value)}
                                    placeholder="Club Rotario de Pasto, Distrito 4281, XII Feria de Proyectos..."
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all"
                                />
                            </div>

                            {voice.enabled && (
                                <>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-baseline">
                                            <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                                                Mensaje / CTA que pronuncia la voz
                                            </label>
                                            {speechLimited ? (
                                                <span className={`text-[10px] font-black ${fit.fits ? 'text-gray-400' : 'text-red-500'}`}>
                                                    {fit.words} / {fit.maxWords} palabras · ≈{fit.estimatedSec}s de {fit.availableSec}s
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-black text-gray-400">
                                                    {fit.words} palabra{fit.words !== 1 ? 's' : ''} · ≈{fit.estimatedSec}s estimados · la duración real se mide al generar
                                                </span>
                                            )}
                                        </div>
                                        <textarea
                                            value={speechText}
                                            onChange={(e) => setSpeechText(e.target.value)}
                                            placeholder="Rotary Distrito 4281. Servir para cambiar vidas."
                                            className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 transition-all resize-none h-24 ${
                                                (!speechLimited || fit.fits)
                                                    ? 'border-gray-100 focus:ring-indigo-600/10 focus:border-indigo-600'
                                                    : 'border-red-200 focus:ring-red-500/10 focus:border-red-400'
                                            }`}
                                        />
                                        {speechLimited && !fit.fits && (
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                                                <p className="flex-1 text-xs font-bold text-red-700">
                                                    {`Sobran ${fit.overflowWords} palabra${fit.overflowWords !== 1 ? 's' : ''} para ${durationSec} s: el motor generativo pronuncia la voz dentro de un clip de duración fija. Acortá el texto, subí la duración o elegí Motion Graphics, que se extiende solo.`}
                                                </p>
                                                <button
                                                    onClick={handleSummarize}
                                                    disabled={summarizing}
                                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-black hover:bg-red-700 transition-all disabled:opacity-50 flex-shrink-0"
                                                >
                                                    {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                                    Resumir con IA
                                                </button>
                                            </div>
                                        )}
                                        {!speechLimited && mayExtend && (
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                                                <p className="flex-1 text-xs font-bold text-indigo-800">
                                                    {isImport && importPreflight?.speech?.note
                                                        ? importPreflight.speech.note
                                                        : `La locución se estima en ≈${fit.estimatedSec} s y el outro dura ${durationSec} s: si al generarla mide más, el cierre se extiende solo. La voz no se acelera ni se corta.`}
                                                </p>
                                                <button
                                                    onClick={handleSummarize}
                                                    disabled={summarizing}
                                                    title="Opcional: acorta el mensaje con IA. No hace falta para procesar."
                                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-indigo-700 border border-indigo-200 rounded-lg text-xs font-black hover:bg-indigo-100 transition-all disabled:opacity-50 flex-shrink-0"
                                                >
                                                    {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                                    Resumir con IA (opcional)
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {([
                                            ['language', 'Idioma y acento', options?.voice.languages],
                                            ['gender', 'Voz', options?.voice.genders],
                                            ['pace', 'Velocidad', options?.voice.paces],
                                            ['tone', 'Tono', options?.voice.tones],
                                            ['volume', 'Volumen', options?.voice.volumes]
                                        ] as const).map(([key, label, list]) => (
                                            <div key={key} className="space-y-2">
                                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">{label}</label>
                                                <select
                                                    value={voice[key] as string}
                                                    onChange={(e) => setVoice(v => ({ ...v, [key]: e.target.value }))}
                                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all"
                                                >
                                                    {(list || []).map(item => (
                                                        <option key={item.id} value={item.id}>{item.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Audio original y música (modo importado) */}
                    {isImport && (
                        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                            <div className="flex items-center gap-3 mb-6">
                                <Music className="w-5 h-5 text-indigo-600" />
                                <div>
                                    <h3 className="font-black text-gray-900">Audio original y música de fondo</h3>
                                    <p className="text-xs text-gray-500 font-medium">
                                        La música se ajusta exactamente a la duración del video, con fundido de entrada y salida. Con voz, se atenúa sola mientras habla (ducking).
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-gray-100 bg-gray-50 mb-6">
                                <div>
                                    <p className="text-xs font-black text-gray-800">Conservar el audio original del MP4</p>
                                    <p className="text-[10px] text-gray-500 font-medium">
                                        {importPreflight
                                            ? (importPreflight.source.hasAudio
                                                ? 'El archivo trae pista de audio. Se conserva y se mezcla con lo que agregues; nunca se descarta en silencio.'
                                                : 'El archivo no trae pista de audio: no hay nada que conservar.')
                                            : 'Se decide cuando el archivo esté inspeccionado.'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setKeepOriginalAudio(k => !k)}
                                    disabled={importPreflight ? !importPreflight.source.hasAudio : false}
                                    className={`relative w-12 h-7 rounded-full transition-all flex-shrink-0 disabled:opacity-40 ${keepOriginalAudio ? 'bg-indigo-600' : 'bg-gray-200'}`}
                                    aria-label="Conservar audio original"
                                >
                                    <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${keepOriginalAudio ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                {([
                                    ['none', 'Sin música', 'Sólo el audio original y/o la voz.'],
                                    ['library', 'Seleccionar de la Biblioteca', 'Una pista de audio que ya está cargada.'],
                                    ['upload', 'Subir archivo', 'MP3, M4A, WAV u OGG desde tu computador.'],
                                    ['generate', 'Generar', options?.importing?.music.generateAvailable ? `Con el motor de música (${options.importing.music.creditEstimate} créditos).` : 'No hay motor de música configurado.']
                                ] as const).map(([id, label, desc]) => {
                                    const active = id === 'upload' ? (music.mode === 'library' && music.source === 'upload') : (music.mode === id && !(id === 'library' && music.source === 'upload'));
                                    const disabled = id === 'generate' && !options?.importing?.music.generateAvailable;
                                    return (
                                        <button
                                            key={id}
                                            disabled={disabled}
                                            onClick={() => {
                                                if (id === 'none') setMusic(NO_MUSIC);
                                                else if (id === 'library') setMusic({ ...NO_MUSIC, mode: 'library', source: 'library' });
                                                else if (id === 'upload') musicInputRef.current?.click();
                                                else setMusic({ ...NO_MUSIC, mode: 'generate', style: options?.importing?.music.defaultStyle || null, source: 'generate' });
                                            }}
                                            className={`p-3 rounded-2xl border text-left transition-all disabled:opacity-40 ${active ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-600/10' : 'bg-gray-50 border-gray-100 hover:border-indigo-200'}`}
                                        >
                                            <p className={`text-xs font-black ${active ? 'text-indigo-700' : 'text-gray-700'}`}>{label}</p>
                                            <p className="text-[10px] text-gray-400 font-medium leading-snug mt-1">{desc}</p>
                                        </button>
                                    );
                                })}
                                <input ref={musicInputRef} type="file" accept={AUDIO_ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && handleMusicUpload(e.target.files[0])} />
                            </div>

                            {uploadingMusic && <p className="flex items-center gap-2 text-xs font-bold text-gray-400 mt-4"><Loader2 className="w-4 h-4 animate-spin" />Subiendo la pista...</p>}

                            {music.mode === 'library' && music.source !== 'upload' && (
                                <div className="mt-5 space-y-2">
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">Pista de la Biblioteca</label>
                                    {musicTracks === null ? (
                                        <p className="flex items-center gap-2 text-xs font-bold text-gray-400"><Loader2 className="w-4 h-4 animate-spin" />Cargando pistas...</p>
                                    ) : musicTracks.length === 0 ? (
                                        <p className="text-xs font-bold text-gray-400">La Biblioteca no tiene pistas de audio todavía. Subí una con «Subir archivo».</p>
                                    ) : (
                                        <select
                                            value={music.mediaId || ''}
                                            onChange={(e) => {
                                                const t = musicTracks.find(x => x.id === e.target.value);
                                                setMusic(t ? { mode: 'library', url: t.url, mediaId: t.id, filename: t.filename, style: null, source: 'library' } : { ...NO_MUSIC, mode: 'library', source: 'library' });
                                            }}
                                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all"
                                        >
                                            <option value="">Elegí una pista...</option>
                                            {musicTracks.map(t => <option key={t.id} value={t.id}>{t.filename}{t.sizeBytes ? ` · ${formatBytes(t.sizeBytes)}` : ''}</option>)}
                                        </select>
                                    )}
                                </div>
                            )}
                            {music.mode === 'library' && music.source === 'upload' && music.filename && (
                                <p className="mt-4 text-xs font-bold text-gray-600">Pista subida: <span className="text-gray-900">{music.filename}</span></p>
                            )}
                            {music.mode === 'generate' && options?.importing && (
                                <div className="mt-5 space-y-2">
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">Estilo de la música</label>
                                    <select
                                        value={music.style || options.importing.music.defaultStyle}
                                        onChange={(e) => setMusic(m => ({ ...m, style: e.target.value }))}
                                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all"
                                    >
                                        {options.importing.music.styles.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
                                    </select>
                                </div>
                            )}
                            {music.url && (
                                <audio key={music.url} src={music.url} controls className="w-full mt-4 h-9" />
                            )}

                            {importPreflight?.audioPlan && (
                                <p className="mt-5 flex items-start gap-2 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-100 rounded-xl p-3">
                                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    Escenario {importPreflight.audioPlan.scenario}: {importPreflight.audioPlan.note}
                                    {importPreflight.audioPlan.ducking ? ' La música baja sola mientras habla la voz y vuelve en los silencios.' : ''}
                                </p>
                            )}
                            {importPreflight?.notes?.filter(n => !importPreflight.report.warnings.includes(n)).map((n, i) => (
                                <p key={i} className="mt-2 flex items-start gap-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{n}
                                </p>
                            ))}
                        </div>
                    )}

                    {/* Motor y duración */}
                    {!isImport && (
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <Timer className="w-5 h-5 text-indigo-600" />
                            <div>
                                <h3 className="font-black text-gray-900">Motor y duración</h3>
                                <p className="text-xs text-gray-500 font-medium">
                                    Sólo se ofrecen las duraciones que el motor elegido entrega de verdad.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                            {(options?.engines || []).filter(e => !e.imported).map(e => (
                                <button
                                    key={e.id}
                                    onClick={() => setEngine(e.id)}
                                    disabled={!e.available}
                                    className={`p-4 rounded-2xl border text-left transition-all disabled:opacity-40 ${
                                        engine === e.id
                                            ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-600/10'
                                            : 'bg-gray-50 border-gray-100 hover:border-indigo-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        {e.deterministic ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <Sparkles className="w-4 h-4 text-purple-600" />}
                                        <p className={`text-xs font-black ${engine === e.id ? 'text-indigo-700' : 'text-gray-700'}`}>{e.label}</p>
                                        {e.isDefault && (
                                            <span className="ml-auto px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-100 text-[9px] font-black uppercase tracking-wide text-emerald-700">Recomendado</span>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-medium leading-snug mt-2">{e.note}</p>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mt-2">
                                        {e.durations.join(' · ')} s{e.customDuration ? ` · personalizado ${e.customDuration.min}-${e.customDuration.max} s` : ''}
                                        {' · '}{e.creditEstimate === 0 ? 'sin créditos de generación' : `${e.creditEstimate} créditos`}
                                    </p>
                                </button>
                            ))}
                        </div>

                        {!isMotion && (
                            <p className="flex items-start gap-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3 mb-6">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                El motor generativo REDIBUJA la imagen: puede deformar el logotipo o los textos. Para un cierre institucional se recomienda Motion Graphics, que los conserva píxel a píxel.
                            </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mr-2">Duración</span>
                            {durationButtons.map(d => (
                                <button
                                    key={String(d)}
                                    onClick={() => setDurationChoice(d)}
                                    className={`px-4 py-2 rounded-xl border text-xs font-black transition-all ${
                                        durationChoice === d
                                            ? 'bg-gray-900 border-gray-900 text-white'
                                            : 'bg-gray-50 border-gray-100 text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    {d === 'custom' ? 'Personalizado' : `${d} s`}
                                </button>
                            ))}
                            {durationChoice === 'custom' && engineInfo?.customDuration && (
                                <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                                    <input
                                        type="number"
                                        min={engineInfo.customDuration.min}
                                        max={engineInfo.customDuration.max}
                                        step={engineInfo.customDuration.step}
                                        value={customDuration}
                                        onChange={(e) => setCustomDuration(Number(e.target.value))}
                                        className="w-24 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600"
                                    />
                                    segundos ({engineInfo.customDuration.min}-{engineInfo.customDuration.max})
                                </label>
                            )}
                            {preflight && preflight.durationSec !== requestedDurationSec && (
                                <span className="text-[10px] font-black text-blue-700">→ el motor entrega {preflight.durationSec} s</span>
                            )}
                        </div>
                    </div>
                    )}

                    {/* Preset / estilo y formato */}
                    {!isImport && (
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <Film className="w-5 h-5 text-indigo-600" />
                            <div>
                                <h3 className="font-black text-gray-900">{isMotion ? 'Preset de movimiento y formato' : 'Estilo y formato'}</h3>
                                <p className="text-xs text-gray-500 font-medium">
                                    {isMotion
                                        ? 'Cada preset cambia la cadencia y los fundidos. Ninguno redibuja la imagen: el último tramo queda quieto para que la marca se lea.'
                                        : 'Cada estilo cambia cámara, luz, ritmo y sonido.'}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                            {isMotion ? (options?.presets || []).map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setPreset(p.id)}
                                    title={p.description}
                                    className={`p-3 rounded-2xl border text-left transition-all ${
                                        preset === p.id
                                            ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-600/10'
                                            : 'bg-gray-50 border-gray-100 hover:border-indigo-200'
                                    }`}
                                >
                                    <p className={`text-xs font-black ${preset === p.id ? 'text-indigo-700' : 'text-gray-700'}`}>{p.label}</p>
                                    <p className="text-[10px] text-gray-400 font-medium leading-snug mt-1 line-clamp-2">{p.description}</p>
                                </button>
                            )) : (options?.styles || []).map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => setStyle(s.id)}
                                    title={s.description}
                                    className={`p-3 rounded-2xl border text-left transition-all ${
                                        style === s.id
                                            ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-600/10'
                                            : 'bg-gray-50 border-gray-100 hover:border-indigo-200'
                                    }`}
                                >
                                    <p className={`text-xs font-black ${style === s.id ? 'text-indigo-700' : 'text-gray-700'}`}>{s.label}</p>
                                    <p className="text-[10px] text-gray-400 font-medium leading-snug mt-1 line-clamp-2">{s.description}</p>
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {(options?.formats || []).map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setFormat(f.id)}
                                    className={`px-4 py-2 rounded-xl border text-xs font-black transition-all ${
                                        format === f.id
                                            ? 'bg-gray-900 border-gray-900 text-white'
                                            : 'bg-gray-50 border-gray-100 text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    {f.id} · {f.label}
                                </button>
                            ))}
                        </div>

                        {preflight?.notes?.length ? (
                            <div className="mt-5 space-y-2">
                                {preflight.notes.map((n, i) => (
                                    <p key={i} className="flex items-start gap-2 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-100 rounded-xl p-3">
                                        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                        {n}
                                    </p>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    )}
                </div>

                {/* ── Columna de vista previa y acción ── */}
                <div className="lg:col-span-4 lg:sticky lg:top-10 flex flex-col gap-6">
                    <div className="bg-gray-900 rounded-[32px] p-6 shadow-2xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/40 via-transparent to-purple-950/20" />

                        <div className="relative aspect-[9/16] bg-black rounded-[24px] border border-gray-800 overflow-hidden flex items-center justify-center">
                            {latest && isPending(latest.status) ? (
                                <div className="flex flex-col items-center gap-4 px-6 text-center">
                                    <Sparkles className="w-12 h-12 text-indigo-400 animate-pulse" />
                                    <div className="space-y-1">
                                        <p className="text-white font-black text-sm uppercase tracking-wider">{latest.statusLabel}</p>
                                        <p className="text-blue-400/60 text-[10px] font-bold">{latest.engineLabel}</p>
                                    </div>
                                </div>
                            ) : latest?.videoUrl ? (
                                <video
                                    key={latest.id}
                                    src={latest.videoUrl}
                                    controls
                                    playsInline
                                    className="w-full h-full object-contain bg-black"
                                />
                            ) : isImport && video ? (
                                <video key={video.url} src={video.url} muted playsInline className="w-full h-full object-contain opacity-80" />
                            ) : !isImport && image ? (
                                <img src={image.url} alt="" className="w-full h-full object-contain opacity-70" />
                            ) : (
                                <div className="flex flex-col items-center gap-3">
                                    <Clapperboard className="w-10 h-10 text-gray-700" />
                                    <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest">Vista previa</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 space-y-4 relative z-10">
                            <div className="flex justify-between items-center text-white/60">
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                    {isImport
                                        ? (importPreflight ? `${importPreflight.durationSec?.toFixed(1)}s · ${aspectLabel(importPreflight.source.aspect, importPreflight.format)}` : 'MP4 importado')
                                        : (preflight ? `${preflight.durationSec}s · ${preflight.format}` : `~${options?.targetDurationSec ?? 5}s · ${format}`)}
                                </span>
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                    {isImport
                                        ? (importPreflight?.master?.width ? `${importPreflight.master.width}×${importPreflight.master.height}` : 'Maestro = tu MP4')
                                        : (preflight ? `${preflight.master.width}×${preflight.master.height}` : 'Maestro')}
                                </span>
                            </div>

                            {isImport ? (
                                <button
                                    onClick={handleImport}
                                    disabled={!video || !importPreflight || !importPreflight.report.ok || importing || (Boolean(credits?.exceeded) && (costs?.total ?? 0) > 0)}
                                    className="w-full bg-white text-gray-900 py-4 rounded-2xl font-black text-lg hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-xl disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center gap-3"
                                >
                                    {importing ? (
                                        <><Loader2 className="w-5 h-5 animate-spin" />Procesando...</>
                                    ) : (
                                        <><Upload className="w-5 h-5 text-emerald-600" />Procesar outro</>
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick={handleGenerate}
                                    disabled={!image || generating || Boolean(credits?.exceeded)}
                                    className="w-full bg-white text-gray-900 py-4 rounded-2xl font-black text-lg hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-xl disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center gap-3"
                                >
                                    {generating ? (
                                        <><Loader2 className="w-5 h-5 animate-spin" />Enviando...</>
                                    ) : (
                                        <><Sparkles className="w-5 h-5 text-indigo-600" />Generar outro</>
                                    )}
                                </button>
                            )}

                            {costs && (
                                <div className={`grid ${isImport ? 'grid-cols-4' : 'grid-cols-3'} gap-2 text-center`}>
                                    {([
                                        ['Generación IA', costs.generationCost],
                                        ['Voz', costs.ttsCost],
                                        ...(isImport ? [['Música', costs.musicCost ?? 0] as const] : []),
                                        ['Composición', costs.compositionCost]
                                    ] as readonly (readonly [string, number])[]).map(([k, v]) => (
                                        <div key={k} className="bg-white/5 border border-white/10 rounded-xl py-2">
                                            <p className="text-[9px] font-black text-white/40 uppercase tracking-wider">{k}</p>
                                            <p className="text-sm font-black text-white">{v}</p>
                                        </div>
                                    ))}
                                    <p className={`${isImport ? 'col-span-4' : 'col-span-3'} text-[10px] font-black text-white/60 uppercase tracking-widest`}>
                                        Total estimado: {costs.total} crédito{costs.total !== 1 ? 's' : ''}
                                    </p>
                                </div>
                            )}

                            <p className="text-[9px] text-white/30 text-center font-bold leading-relaxed px-2">
                                {isImport
                                    ? 'MP4 importado · el video es el maestro: cero créditos de generación; sólo se agrega voz, música y mezcla, sin recodificar la imagen.'
                                    : `${preflight?.engine.label || engineInfo?.label || 'Motion Graphics'} · ${isMotion
                                        ? 'la imagen se anima tal cual; la voz se mezcla sin recodificar el video.'
                                        : 'el archivo maestro se guarda tal cual lo entrega el modelo, sin recortes ni recompresión.'}`}
                            </p>
                        </div>
                    </div>

                    {/* Consumo */}
                    {credits && (
                        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <Gauge className="w-4 h-4 text-indigo-600" />
                                <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Consumo del mes</h4>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-gray-900">{credits.spent}</span>
                                <span className="text-xs font-bold text-gray-400">
                                    {credits.limit ? `de ${credits.limit} créditos` : 'créditos estimados'}
                                </span>
                            </div>
                            {credits.limit && (
                                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-3">
                                    <div
                                        className={`h-full rounded-full ${credits.exceeded ? 'bg-red-500' : 'bg-indigo-500'}`}
                                        style={{ width: `${Math.min(100, (credits.spent / credits.limit) * 100)}%` }}
                                    />
                                </div>
                            )}
                            <p className="text-[10px] text-gray-400 font-bold mt-3 leading-relaxed">
                                {credits.generations} generación{credits.generations !== 1 ? 'es' : ''} este mes. Es una estimación
                                propia por motor, no el saldo real de KIE.AI.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Historial ── */}
            <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-black text-gray-900">Outros generados</h3>
                        <p className="text-sm text-gray-500 font-medium">
                            Los que están listos aparecen como clip de cierre en el Creador de Reels; el predeterminado se preselecciona solo.
                            Reutilizarlos no gasta créditos.
                        </p>
                    </div>
                    <button
                        onClick={() => loadOutros()}
                        className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-all"
                        title="Actualizar"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                        <p className="text-gray-400 font-bold text-sm">Cargando outros...</p>
                    </div>
                ) : outros.length === 0 ? (
                    <div className="text-center py-16">
                        <Clapperboard className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                        <p className="text-gray-400 font-bold">Todavía no generaste ningún outro</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {outros.map(o => {
                            const chip = STATUS_STYLES[o.status];
                            const busy = busyIds.includes(o.id);
                            return (
                                <div key={o.id} className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50/40 flex flex-col">
                                    <div className="relative aspect-[9/16] max-h-64 bg-black flex items-center justify-center overflow-hidden">
                                        <img src={o.sourceImageUrl} alt="" className="w-full h-full object-cover opacity-40" />
                                        {o.videoUrl && (
                                            <button
                                                onClick={() => setPreviewId(o.id)}
                                                className="absolute inset-0 flex items-center justify-center group"
                                            >
                                                <Play className="w-12 h-12 text-white/60 group-hover:scale-110 group-hover:text-white transition-all" />
                                            </button>
                                        )}
                                        {isPending(o.status) && (
                                            <Loader2 className="absolute w-10 h-10 text-indigo-300 animate-spin" />
                                        )}
                                        <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wide ${chip.chip}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
                                            {o.statusLabel}
                                        </span>
                                        <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                                            {(o.isDefault || o.id === defaultOutroId) && (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-400 text-[9px] font-black uppercase tracking-wide text-amber-950">
                                                    <Star className="w-3 h-3" />Predeterminado
                                                </span>
                                            )}
                                            {o.mediaId && (
                                                <span className="px-2 py-1 rounded-lg bg-white/90 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                                                    En biblioteca
                                                </span>
                                            )}
                                            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide ${o.imported ? 'bg-emerald-600 text-white' : 'bg-white/90 text-gray-600'}`}>
                                                {o.imported ? 'Importado' : 'Generado'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-4 flex-1 flex flex-col gap-3">
                                        <div>
                                            <p className="text-sm font-black text-gray-900 leading-tight line-clamp-2">{o.title}</p>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">
                                                {o.styleLabel} · {o.format} · {o.hasAudio ? 'con voz' : 'sin voz'}{o.deterministic ? ' · sin IA generativa' : ''}
                                            </p>
                                            {o.stages && (
                                                <p className="text-[10px] font-bold text-gray-400 mt-1">
                                                    {o.imported ? 'MP4' : 'Video'} {stageWord(o.stages.video)} · Voz {stageWord(o.stages.voice)}
                                                    {o.imported && o.stages.music ? ` · Música ${stageWord(o.stages.music)}` : ''} · Mezcla {stageWord(o.stages.mix)}
                                                    {o.costs ? ` · ${o.costs.total} crédito${o.costs.total !== 1 ? 's' : ''}` : ''}
                                                </p>
                                            )}
                                        </div>

                                        {o.speechUsed && (
                                            <p className="text-xs text-gray-500 font-medium italic line-clamp-2">"{o.speechUsed}"</p>
                                        )}

                                        {o.status === 'ready' && (
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                                {o.width}×{o.height} · {o.durationSec}s · {o.bitrateKbps} kbps · {formatBytes(o.sizeBytes)}
                                            </p>
                                        )}

                                        {(o.status === 'needs_review' || o.status === 'error') && o.statusDetail && (
                                            <p className="flex items-start gap-2 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                                <span className="line-clamp-3">{o.statusDetail}</span>
                                            </p>
                                        )}

                                        <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
                                            {o.videoUrl && (
                                                <>
                                                    <button onClick={() => setPreviewId(o.id)} title="Vista previa"
                                                        className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-all">
                                                        <Play className="w-3.5 h-3.5" />
                                                    </button>
                                                    <a href={downloadUrl(o)} title="Descargar"
                                                        className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-all">
                                                        <Download className="w-3.5 h-3.5" />
                                                    </a>
                                                    {!o.mediaId && (
                                                        <button onClick={() => handleSaveToLibrary(o)} disabled={busy} title="Guardar en la Biblioteca"
                                                            className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500 hover:text-emerald-600 hover:border-emerald-200 transition-all disabled:opacity-40">
                                                            <Save className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    {(o.isDefault || o.id === defaultOutroId) ? (
                                                        <button onClick={() => handleClearDefault(o)} disabled={busy} title="Dejar de usar como outro predeterminado"
                                                            className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-all disabled:opacity-40">
                                                            <Star className="w-3.5 h-3.5 fill-current" />
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => handleSetDefault(o)} disabled={busy} title="Usar como outro predeterminado"
                                                            className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500 hover:text-amber-600 hover:border-amber-200 transition-all disabled:opacity-40">
                                                            <Star className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                            <button onClick={() => handleRename(o)} disabled={busy} title="Renombrar"
                                                className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-all disabled:opacity-40">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            {!isPending(o.status) && (
                                                <>
                                                    <button onClick={() => handleRetry(o)} disabled={busy} title={o.imported ? 'Reprocesar el audio (el video no se toca)' : 'Regenerar'}
                                                        className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-all disabled:opacity-40">
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDuplicate(o)} disabled={busy} title="Duplicar como variante"
                                                        className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-all disabled:opacity-40">
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                            <button onClick={() => handleDelete(o)} disabled={busy} title="Eliminar"
                                                className="p-2 rounded-lg bg-white border border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-200 transition-all disabled:opacity-40 ml-auto">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Vista previa a pantalla completa ── */}
            {preview?.videoUrl && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => setPreviewId(null)}>
                    <div className="bg-white w-full max-w-3xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div className="min-w-0">
                                <h3 className="text-lg font-black text-gray-900 truncate">{preview.title}</h3>
                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-0.5">
                                    {preview.engineLabel} · {preview.width}×{preview.height} · {preview.durationSec}s
                                </p>
                            </div>
                            <button onClick={() => setPreviewId(null)} className="p-2 hover:bg-gray-200 rounded-full transition-all flex-shrink-0">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
                            <div className="md:w-1/2 flex-shrink-0">
                                <video src={preview.videoUrl} controls playsInline autoPlay className="w-full rounded-2xl bg-black" />
                            </div>

                            <div className="md:w-1/2 space-y-4 text-sm">
                                <div>
                                    <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2">Informe de calidad</p>
                                    {preview.quality ? (
                                        <div className="space-y-2">
                                            <p className={`flex items-center gap-2 font-black text-xs ${preview.quality.verdict === 'ready' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                {preview.quality.verdict === 'ready'
                                                    ? <><CheckCircle2 className="w-4 h-4" />Cumple el estándar mínimo</>
                                                    : <><AlertTriangle className="w-4 h-4" />Requiere revisión</>}
                                            </p>
                                            {preview.quality.failures.map((f, i) => (
                                                <p key={i} className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 rounded-lg p-2.5">{f}</p>
                                            ))}
                                            {preview.quality.warnings.map((w, i) => (
                                                <p key={i} className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">{w}</p>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-400 font-bold">Sin informe.</p>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                                    {[
                                        ['Formato', preview.format],
                                        ['Estilo', preview.styleLabel],
                                        ['Duración', preview.durationSec ? `${preview.durationSec}s` : '—'],
                                        ['Resolución', preview.width ? `${preview.width}×${preview.height}` : '—'],
                                        ['Tasa de bits', preview.bitrateKbps ? `${preview.bitrateKbps} kbps` : '—'],
                                        ['Peso', formatBytes(preview.sizeBytes)],
                                        ['Audio', preview.hasAudio ? 'Sí' : 'No'],
                                        ['Motor', preview.imported ? 'MP4 importado (sin IA)' : preview.deterministic ? 'Motion Graphics' : (preview.kieJobId ? `KIE ${preview.kieJobId.slice(0, 10)}` : preview.engineLabel)],
                                        ['Origen', preview.imported ? 'Importado' : 'Generado'],
                                        ['Créditos', preview.costs ? `${preview.costs.total} (gen. ${preview.costs.generationCost} · voz ${preview.costs.ttsCost}${preview.imported ? ` · música ${preview.costs.musicCost ?? 0}` : ''})` : String(preview.creditsEstimated)],
                                        ['Versión', preview.version || '—'],
                                        ['Intentos', String(preview.attempts)]
                                    ].map(([k, v]) => (
                                        <div key={k as string}>
                                            <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">{k}</p>
                                            <p className="font-bold text-gray-700 truncate">{v}</p>
                                        </div>
                                    ))}
                                </div>

                                {preview.speechUsed && (
                                    <div>
                                        <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">Locución</p>
                                        <p className="text-xs font-medium text-gray-600 italic">"{preview.speechUsed}"</p>
                                    </div>
                                )}

                                {preview.imported && preview.audioPlan && (
                                    <div>
                                        <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">Mezcla de audio</p>
                                        <p className="text-xs font-medium text-gray-600">
                                            Escenario {preview.audioPlan.scenario}: {preview.audioPlan.note}
                                            {preview.music?.mode && preview.music.mode !== 'none' ? ` · Música: ${preview.music.filename || preview.music.style || preview.music.mode}` : ''}
                                        </p>
                                    </div>
                                )}

                                {preview.imported && !isPending(preview.status) && (
                                    <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/60 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                                            <p className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest">Ajustar niveles sin regenerar</p>
                                        </div>
                                        {remix ? (
                                            <>
                                                <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
                                                    <input type="checkbox" checked={remix.keepOriginalAudio} disabled={!preview.importReport?.hasAudio}
                                                        onChange={(e) => setRemix(r => r ? { ...r, keepOriginalAudio: e.target.checked } : r)} />
                                                    Conservar el audio original
                                                </label>
                                                <label className="block text-xs font-bold text-gray-700">
                                                    Nivel de la música: {remix.musicGainDb} dB
                                                    <input type="range" min={-30} max={6} step={1} value={remix.musicGainDb}
                                                        onChange={(e) => setRemix(r => r ? { ...r, musicGainDb: Number(e.target.value) } : r)} className="w-full" />
                                                </label>
                                                {preview.voice?.enabled && (
                                                    <label className="block text-xs font-bold text-gray-700">
                                                        Volumen de la voz
                                                        <select value={remix.voiceVolume} onChange={(e) => setRemix(r => r ? { ...r, voiceVolume: e.target.value } : r)}
                                                            className="w-full mt-1 bg-white border border-gray-100 rounded-xl px-3 py-2 text-sm font-bold text-gray-700">
                                                            {(options?.voice.volumes || []).map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                                                        </select>
                                                    </label>
                                                )}
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleRemix(preview)} disabled={busyIds.includes(preview.id)}
                                                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 disabled:opacity-40">
                                                        Volver a mezclar
                                                    </button>
                                                    <button onClick={() => setRemix(null)} className="px-4 py-2 text-xs font-black text-gray-500 hover:bg-gray-200 rounded-xl">Cancelar</button>
                                                </div>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => setRemix({ keepOriginalAudio: preview.config?.keepOriginalAudio !== false, musicGainDb: preview.config?.musicGainDb ?? -12, voiceVolume: preview.voice?.volume || 'normal' })}
                                                className="text-xs font-black text-indigo-600 hover:underline"
                                            >
                                                Cambiar niveles de voz, música o audio original
                                            </button>
                                        )}
                                        <p className="text-[10px] text-gray-400 font-medium">El video se copia tal cual; sólo se rehace la pista de audio.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-5 border-t border-gray-100 flex flex-wrap justify-end gap-2 bg-gray-50/50">
                            <button onClick={() => handleRetry(preview)} disabled={busyIds.includes(preview.id)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black text-gray-600 hover:bg-gray-200 transition-all disabled:opacity-40">
                                <RefreshCw className="w-4 h-4" />Regenerar
                            </button>
                            <button onClick={() => handleDuplicate(preview)} disabled={busyIds.includes(preview.id)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black text-gray-600 hover:bg-gray-200 transition-all disabled:opacity-40">
                                <Copy className="w-4 h-4" />Duplicar
                            </button>
                            <a href={downloadUrl(preview)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black text-gray-600 hover:bg-gray-200 transition-all">
                                <Download className="w-4 h-4" />Descargar
                            </a>
                            {!preview.mediaId && (
                                <button onClick={() => handleSaveToLibrary(preview)} disabled={busyIds.includes(preview.id)}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-40">
                                    <Save className="w-4 h-4" />Guardar en la Biblioteca
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <MediaPicker
                isOpen={showPicker}
                maxSelection={1}
                initialSelection={image?.mediaId ? [image.mediaId] : []}
                onClose={() => setShowPicker(false)}
                onSelect={handleLibraryPick}
            />
            <MediaPicker
                isOpen={showVideoPicker}
                maxSelection={1}
                mediaType="video"
                initialSelection={video?.mediaId ? [video.mediaId] : []}
                onClose={() => setShowVideoPicker(false)}
                onSelect={handleVideoPick}
            />
        </div>
    );
};

export default OutroGenerator;
