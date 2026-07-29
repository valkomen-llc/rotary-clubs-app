// ════════════════════════════════════════════════════════════════════
// Generador de Outros IA — pantalla del módulo
// v4.646.0
//
// Cierres de ~5 segundos a partir de una imagen fija: se elige la imagen, se
// escribe lo que debe decir la voz, se ajusta estilo y formato, se genera y se
// aprueba en la vista previa antes de que llegue a la Biblioteca.
//
// La generación es asíncrona (KIE tarda 1-3 minutos): al crear el outro el
// servidor responde de inmediato y esta pantalla sondea `/sync` hasta que el
// estado sea terminal. Los catálogos vienen de `/outros/options`, no están
// escritos acá, para que no se desfasen del servidor.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Clapperboard, Image as ImageIcon, Upload, Sparkles, Loader2, Mic, MicOff,
    Play, RefreshCw, Copy, Save, Trash2, Download, AlertTriangle, CheckCircle2,
    Wand2, Info, X, Gauge, Film
} from 'lucide-react';
import { toast } from 'sonner';
import MediaPicker from './MediaPicker';
import {
    checkSpeechFit, isPending, STATUS_STYLES, formatBytes,
    type Outro, type OutroOptions, type OutroVoice, type SourceReport
} from '../../../lib/outroSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

interface PickedImage {
    url: string;
    mediaId: string | null;
    filename: string;
}

interface Preflight {
    engine: { id: string; label: string; nativeAudio: boolean };
    format: string;
    durationSec: number;
    resolution: string;
    master: { width: number; height: number };
    voiceEnabled: boolean;
    notes: string[];
    sourceReport: SourceReport | null;
    creditEstimate: number;
}

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
    const [format, setFormat] = useState('9:16');
    const [voice, setVoice] = useState<OutroVoice>({
        enabled: false, language: 'es-CO', gender: 'female', pace: 'normal', tone: 'institutional', volume: 'normal'
    });

    const [preflight, setPreflight] = useState<Preflight | null>(null);
    const [generating, setGenerating] = useState(false);
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

    // ── Comprobación previa ────────────────────────────────────────────────
    // Se dispara al cambiar imagen, formato o voz. Devuelve la duración real del
    // motor que se va a usar (de ahí sale el presupuesto de palabras), el
    // análisis de la imagen y los ajustes que el servidor tuvo que aplicar.
    useEffect(() => {
        if (!image?.url) { setPreflight(null); return; }
        let cancelled = false;
        const handle = setTimeout(async () => {
            try {
                const r = await fetch(`${API}/content-studio/outros/preflight`, {
                    method: 'POST',
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageUrl: image.url, format, voice, speechText })
                });
                if (r.ok && !cancelled) setPreflight(await r.json());
            } catch { /* silencioso: es una ayuda, no un requisito */ }
        }, 300);
        return () => { cancelled = true; clearTimeout(handle); };
        // speechText queda fuera a propósito: el contador se calcula localmente
        // en cada tecla y no necesita ir al servidor.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [image?.url, format, voice.enabled, voice.language, voice.pace]);

    const durationSec = preflight?.durationSec ?? options?.targetDurationSec ?? 5;
    const fit = useMemo(
        () => checkSpeechFit(speechText, { durationSec, language: voice.language, pace: voice.pace }),
        [speechText, durationSec, voice.language, voice.pace]
    );

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
                body: JSON.stringify({ text: speechText, voice, format })
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
        if (voice.enabled && !fit.fits) { toast.error(`El texto no cabe en ${durationSec} segundos. Resumilo antes de generar.`); return; }

        setGenerating(true);
        const toastId = toast.loading('Enviando el outro al motor de IA...');
        try {
            const r = await fetch(`${API}/content-studio/outros`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: image.url, imageMediaId: image.mediaId,
                    speechText, organizationName, style, format, voice
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
            toast.success('Generando. Te aviso cuando esté listo.', { id: toastId });
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

    const handleDelete = async (o: Outro) => {
        if (!window.confirm(`¿Eliminar "${o.title}" del generador?${o.mediaId ? ' El archivo ya guardado en la Biblioteca se conserva.' : ''}`)) return;
        const data = await act(o.id, '', 'DELETE', null, 'Outro eliminado');
        if (data) {
            setOutros(prev => prev.filter(x => x.id !== o.id));
            if (previewId === o.id) setPreviewId(null);
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

            {!options?.providerConfigured && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-amber-800">
                        El motor de video no está configurado (falta <code className="font-mono">KIE_API_KEY</code> en el entorno).
                        Podés recorrer el módulo, pero la generación va a fallar.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* ── Columna de configuración ── */}
                <div className="lg:col-span-8 flex flex-col gap-6">

                    {/* Imagen */}
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

                    {/* Voz en off */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                {voice.enabled ? <Mic className="w-5 h-5 text-indigo-600" /> : <MicOff className="w-5 h-5 text-gray-400" />}
                                <div>
                                    <h3 className="font-black text-gray-900">Voz en off</h3>
                                    <p className="text-xs text-gray-500 font-medium">Opcional. La locución se ajusta a la duración del cierre.</p>
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
                                                Texto que se pronuncia
                                            </label>
                                            <span className={`text-[10px] font-black ${fit.fits ? 'text-gray-400' : 'text-red-500'}`}>
                                                {fit.words} / {fit.maxWords} palabras · ≈{fit.estimatedSec}s de {fit.availableSec}s
                                            </span>
                                        </div>
                                        <textarea
                                            value={speechText}
                                            onChange={(e) => setSpeechText(e.target.value)}
                                            placeholder="Rotary Distrito 4281. Servir para cambiar vidas."
                                            className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 transition-all resize-none h-24 ${
                                                fit.fits
                                                    ? 'border-gray-100 focus:ring-indigo-600/10 focus:border-indigo-600'
                                                    : 'border-red-200 focus:ring-red-500/10 focus:border-red-400'
                                            }`}
                                        />
                                        {!fit.fits && (
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                                                <p className="flex-1 text-xs font-bold text-red-700">
                                                    Sobran {fit.overflowWords} palabra{fit.overflowWords !== 1 ? 's' : ''}: la locución quedaría cortada al final del outro.
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

                    {/* Estilo y formato */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <Film className="w-5 h-5 text-indigo-600" />
                            <div>
                                <h3 className="font-black text-gray-900">Estilo y formato</h3>
                                <p className="text-xs text-gray-500 font-medium">Cada estilo cambia cámara, luz, ritmo y sonido.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                            {(options?.styles || []).map(s => (
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
                            ) : image ? (
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
                                    {preflight ? `${preflight.durationSec}s · ${preflight.format}` : `~${options?.targetDurationSec ?? 5}s · ${format}`}
                                </span>
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                    {preflight ? `${preflight.master.width}×${preflight.master.height}` : 'Maestro'}
                                </span>
                            </div>

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

                            <p className="text-[9px] text-white/30 text-center font-bold leading-relaxed px-2">
                                {preflight?.engine.label || 'KIE.AI'} · el archivo maestro se guarda tal cual lo entrega el modelo,
                                sin recortes ni recompresión.
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
                            Los que están listos aparecen como clip de cierre en el Creador de Video.
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
                                        {o.mediaId && (
                                            <span className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-white/90 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                                                En biblioteca
                                            </span>
                                        )}
                                    </div>

                                    <div className="p-4 flex-1 flex flex-col gap-3">
                                        <div>
                                            <p className="text-sm font-black text-gray-900 leading-tight line-clamp-2">{o.title}</p>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">
                                                {o.styleLabel} · {o.format} · {o.hasAudio ? 'con voz' : 'sin voz'}
                                            </p>
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
                                                </>
                                            )}
                                            {!isPending(o.status) && (
                                                <>
                                                    <button onClick={() => handleRetry(o)} disabled={busy} title="Regenerar"
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
                                        ['Trabajo KIE', preview.kieJobId?.slice(0, 12) || '—'],
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
        </div>
    );
};

export default OutroGenerator;
