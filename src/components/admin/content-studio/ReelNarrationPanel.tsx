/**
 * LA VOZ EN OFF DE UN REEL — un solo panel para las dos pantallas (v4.1058)
 * ========================================================================
 *
 * ⚠️ NO HAY UN SEGUNDO PANEL DE VOZ, y de eso cuelga todo lo demás. Este
 * componente vivía DENTRO de `VideoCreator.tsx` y la Biblioteca de Reels no lo
 * tenía: su sección «Audio» sólo ofrecía «Volver a montar» y «Regenerar banda
 * sonora», así que desde la ficha de un Reel no había forma de saber con qué
 * voz se había hecho ni de cambiarla. Copiarlo habría dado dos paneles que se
 * separan en silencio —el día que se agregue un idioma, una de las dos
 * pantallas se queda sin él— y lo que se separaría es qué voz sale publicada.
 * Es la lección de `SubmissionDetail` (v4.999) y del selector de outros
 * (v4.1040): un solo componente, montado por las dos entradas.
 *
 * ⚠️ REGENERAR LA VOZ NO REGENERA NINGUNA ESCENA. Aplicar una voz limpia el
 * `renderJobId` y rehace la MEZCLA con los clips que ya existen: cero llamadas
 * al motor de video, cero créditos de escena. Es lo que permite probar
 * idiomas, acentos y estilos sin volver a pagar lo generado.
 *
 * ⚠️ GENERAR NO ES APLICAR (v4.1236). La voz nueva nace como BORRADOR: se
 * escucha, se descarga o se regenera, y sólo «Aplicar al Reel» la vuelve la
 * versión vigente y rehace la mezcla. Hasta v4.1235 generar remontaba al
 * instante, sin oírla. El historial guarda cada versión y cualquiera se puede
 * volver a aplicar sin sintetizar de nuevo.
 *
 * ⚠️ UN FALLO SE NOMBRA (v4.1236). El servidor devuelve un `code` por cada
 * tipo de fallo —credencial, cuota, voz, modelo, conexión, almacenamiento,
 * mezcla— y, si tiene sentido, la OFERTA de intentarlo con el otro motor. La
 * oferta no se ejecuta sola: cada síntesis se cobra. El guion y la
 * configuración no se pierden: viven en el estado del panel.
 *
 * ⚠️ Y EL CATÁLOGO DE VOCES SE CONSULTA ACÁ DENTRO. La Biblioteca no carga
 * `ReelOptions`, así que sin esto habría que cablearlo en cada pantalla que
 * monte el panel — y la tercera se olvidaría. Quien ya lo tiene (el Creador)
 * lo pasa por prop y no paga un viaje de red de más. Misma decisión que
 * `useSavedOutros` dentro de `SavedOutroPicker`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Mic, Clock, History, Loader2, RefreshCw, AlertTriangle, Sparkles, FileText,
    CheckCircle2, Download, Volume2, PlugZap, ArrowRightLeft
} from 'lucide-react';
import { toast } from 'sonner';
import type {
    Reel, ReelOptions, ReelNarration, TtsProviderStatus, TtsFailure
} from '../../../lib/reelSpec';
import { leerJson, describirNoJson } from '../../../lib/leerJson';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`,
    'Content-Type': 'application/json'
});

// Preferencias del administrador en ESTE navegador: con qué motor, voz y
// región arranca el panel cuando el Reel todavía no tiene voz. Es una
// comodidad; la voz APLICADA queda guardada en el Reel por el servidor.
const PREFS_KEY = 'rotary.reelVoicePrefs.v1';
type VoicePrefs = Partial<{
    provider: string; language: string; style: string; gender: string;
    speed: number; voiceId: string; allowFallback: boolean;
}>;
const readPrefs = (): VoicePrefs => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as VoicePrefs; } catch { return {}; }
};
const writePrefs = (prefs: VoicePrefs) => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* almacenamiento bloqueado */ }
};

// Cómo se ve cada estado de un motor de voz.
const STATE_META: Record<string, { label: string; cls: string }> = {
    ok: { label: 'Conectado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    not_configured: { label: 'Requiere configuración', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
    not_implemented: { label: 'Próximamente', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
    auth: { label: 'Credencial inválida', cls: 'bg-red-50 text-red-700 border-red-200' },
    quota: { label: 'Sin cuota', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    rate_limit: { label: 'Limitado', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    model_unsupported: { label: 'Modelo incompatible', cls: 'bg-red-50 text-red-700 border-red-200' },
    voice_not_found: { label: 'Voz no disponible', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    provider_down: { label: 'Proveedor caído', cls: 'bg-red-50 text-red-700 border-red-200' },
    timeout: { label: 'Sin respuesta', cls: 'bg-red-50 text-red-700 border-red-200' },
    network: { label: 'Sin conexión', cls: 'bg-red-50 text-red-700 border-red-200' },
    bad_request: { label: 'Rechazado', cls: 'bg-red-50 text-red-700 border-red-200' },
    unknown: { label: 'Sin verificar', cls: 'bg-gray-100 text-gray-500 border-gray-200' }
};
const stateMeta = (state: string) => STATE_META[state] || STATE_META.unknown;

const Select: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { id: string; label: string }[];
    disabled?: boolean;
    hint?: string;
}> = ({ label, value, onChange, options, disabled, hint }) => (
    <div className="space-y-2">
        <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">{label}</label>
        <select
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all font-sans disabled:opacity-50"
            value={value}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
        >
            {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {hint && <p className="text-[11px] text-gray-400 font-medium leading-relaxed">{hint}</p>}
    </div>
);

// Tarjeta de un motor de voz: nombre, estado real, modelo, idiomas, voces y
// consumo. No se puede elegir un motor sin credencial: la tarjeta dice qué falta.
const ProviderCard: React.FC<{
    p: TtsProviderStatus;
    selected: boolean;
    disabled: boolean;
    onSelect: () => void;
}> = ({ p, selected, disabled, onSelect }) => {
    const meta = stateMeta(p.state);
    const selectable = p.configured && !disabled;
    return (
        <button
            type="button"
            onClick={onSelect}
            disabled={!selectable}
            aria-pressed={selected}
            className={`text-left rounded-2xl border p-3.5 transition-all w-full min-w-0 flex flex-col justify-start ${
                selected
                    ? 'border-indigo-600 ring-2 ring-indigo-600/15 bg-indigo-50/40'
                    : 'border-gray-200 bg-white hover:border-gray-300'
            } ${!selectable ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
            <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                    {selected && <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />}
                    {p.label}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${meta.cls}`}>
                    {meta.label}
                </span>
            </div>
            <dl className="mt-2 space-y-0.5 text-[11px] text-gray-500 font-medium">
                {p.model && <div><dt className="inline font-bold text-gray-600">Modelo: </dt><dd className="inline">{p.model}</dd></div>}
                {p.languages && <div><dt className="inline font-bold text-gray-600">Idiomas: </dt><dd className="inline">{p.languages}</dd></div>}
                {p.configured && p.voices.length > 0 && (
                    <div><dt className="inline font-bold text-gray-600">Voces: </dt><dd className="inline">{p.voices.length} disponibles{p.accentNote ? ` · ${p.accentNote}` : ''}</dd></div>
                )}
                {p.quota && p.quota.limit > 0 && (
                    <div>
                        <dt className="inline font-bold text-gray-600">Cuota: </dt>
                        <dd className="inline">
                            {p.quota.remaining.toLocaleString('es-CO')} de {p.quota.limit.toLocaleString('es-CO')} {p.quota.unit}
                            {p.quota.resetsAt ? ` · se renueva el ${new Date(p.quota.resetsAt).toLocaleDateString('es-CO')}` : ''}
                        </dd>
                    </div>
                )}
                {p.billing && <div className="text-gray-400">{p.billing}</div>}
            </dl>
            {p.message && p.state !== 'ok' && (
                <p className="mt-2 text-[11px] font-bold text-amber-800 leading-snug">{p.message}</p>
            )}
            {p.warnings.map(w => (
                <p key={w} className="mt-1 text-[11px] font-bold text-amber-700 leading-snug">{w}</p>
            ))}
        </button>
    );
};

// Un fallo con su motivo, y lo que se puede hacer: reintentar, o —si el
// servidor lo ofrece— probar con el otro motor.
const FailureCard: React.FC<{
    failure: TtsFailure;
    busy: boolean;
    onRetry: () => void;
    onFallback: (provider: string) => void;
}> = ({ failure, busy, onRetry, onFallback }) => (
    <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50/70 p-4">
        <p className="text-xs font-black text-red-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {failure.providerLabel
                ? `No fue posible generar la narración con ${failure.providerLabel}`
                : 'No fue posible generar la narración'}
            {failure.codeLabel ? ` · ${failure.codeLabel}` : ''}
        </p>
        <p className="mt-1.5 text-[12px] font-medium text-red-900 leading-relaxed break-words">{failure.error}</p>
        <p className="mt-1 text-[11px] font-bold text-red-700/80">El guion y la configuración se conservan.</p>
        <div className="mt-3 flex flex-wrap gap-2">
            {failure.fallback && (
                <button
                    type="button"
                    onClick={() => onFallback(failure.fallback!.provider)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    ¿Intentarlo con {failure.fallback.label}?
                </button>
            )}
            {(failure.retryable ?? true) && (
                <button
                    type="button"
                    onClick={onRetry}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-white text-red-800 border border-red-200 hover:bg-red-100 transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Reintentar
                </button>
            )}
        </div>
    </div>
);

// Una versión de la voz: se escucha, se descarga y, si no es la vigente, se
// aplica. El resumen de la sincronía es el número medido, no una promesa.
const VersionCard: React.FC<{
    n: ReelNarration;
    title: string;
    tone: 'draft' | 'current' | 'history';
    busy: boolean;
    onApply?: () => void;
    onDownload: () => void;
}> = ({ n, title, tone, busy, onApply, onDownload }) => (
    <div className={`rounded-2xl border p-4 ${
        tone === 'draft' ? 'border-indigo-200 bg-indigo-50/40'
            : tone === 'current' ? 'border-emerald-200 bg-emerald-50/30'
                : 'border-gray-200 bg-white'
    }`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] font-black text-gray-800 uppercase tracking-wider">
                {title} <span className="text-gray-400 normal-case font-bold">· v{n.version}</span>
            </p>
            <span className="text-[10px] font-bold text-gray-500">
                {n.ttsProviderLabel || n.ttsProvider}{n.ttsModel ? ` · ${n.ttsModel}` : ''} · {n.genderLabel || n.gender} · {n.languageLabel} · {n.styleLabel}
            </span>
        </div>
        <p className={`mt-1.5 text-[11px] font-bold flex items-start gap-1.5 ${n.withinTolerance ? 'text-emerald-700' : 'text-amber-700'}`}>
            <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
            {n.summary}
        </p>
        {n.fallbackFrom && (
            <p className="mt-1 text-[11px] font-bold text-amber-700">
                Salió con {n.ttsProviderLabel} como respaldo: {n.fallbackFromLabel} falló{n.fallbackReason ? ` (${n.fallbackReason})` : ''}.
            </p>
        )}
        {n.accentControlled === false && (
            <p className="mt-1 text-[10px] font-bold text-gray-400">
                {n.ttsProviderLabel} no permite elegir el acento: el español sale neutro.
            </p>
        )}
        {n.audioUrl && <audio src={n.audioUrl} controls preload="none" className="w-full h-10 mt-2 rounded-lg" />}
        <div className="mt-2.5 flex flex-wrap gap-2">
            {onApply && (
                <button
                    type="button"
                    onClick={onApply}
                    disabled={busy || !n.audioUrl}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-emerald-600 text-white hover:bg-emerald-700 transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {tone === 'draft' ? 'Aplicar al Reel' : 'Volver a aplicar esta versión'}
                </button>
            )}
            {n.audioUrl && (
                <button
                    type="button"
                    onClick={onDownload}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-white text-gray-700 border border-gray-200 hover:bg-gray-100 transition-all flex items-center gap-1.5"
                >
                    <Download className="w-3.5 h-3.5" /> Descargar audio
                </button>
            )}
        </div>
    </div>
);

type NarrationCatalog = NonNullable<ReelOptions['narration']>;

const ReelNarrationPanel: React.FC<{
    reel: Reel;
    /** Quien ya tiene el catálogo lo pasa; quien no, se consulta acá dentro. */
    options?: ReelOptions | null;
    onChanged: (r: Reel) => void;
}> = ({ reel, options, onChanged }) => {
    const n: ReelNarration | null = reel.narration || null;
    const cfgNarration = ((reel.config as Record<string, unknown> | undefined)?.narration || null) as
        Partial<{ provider: string; voiceId: string; script: string; language: string; style: string; gender: string; speed: number }> | null;
    const premontado = (reel.config as Record<string, unknown> | undefined)?.preset === 'video_listo'
        || reel.publicationType === 'video_ready';

    const [generating, setGenerating] = useState(false);
    const [applying, setApplying] = useState<string | null>(null);
    const [generatingScript, setGeneratingScript] = useState(false);
    const [scriptText, setScriptText] = useState(n?.script || cfgNarration?.script || '');
    const [catalogo, setCatalogo] = useState<NarrationCatalog | null>(options?.narration || null);
    const [cargando, setCargando] = useState(false);
    const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
    const [providers, setProviders] = useState<TtsProviderStatus[] | null>(null);
    const [checking, setChecking] = useState(false);
    const [failure, setFailure] = useState<TtsFailure | null>(null);
    const [draft, setDraft] = useState<ReelNarration | null>(null);
    const [history, setHistory] = useState<ReelNarration[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const previewRef = useRef<HTMLAudioElement | null>(null);

    // ⚠️ NO SE INVENTA LA CONFIGURACIÓN DE UN REEL VIEJO (punto 11). Si la fila
    // no guardó idioma, estilo o género, el formulario arranca en las
    // preferencias del administrador o en los valores por DEFECTO, y la
    // pantalla dice que la configuración anterior no quedó registrada.
    const [form, setForm] = useState(() => {
        const prefs = readPrefs();
        return {
            provider: n?.ttsProvider || cfgNarration?.provider || prefs.provider || catalogo?.provider || 'elevenlabs',
            language: n?.language || prefs.language || catalogo?.defaultLanguage || 'es-CO',
            style: n?.style || prefs.style || catalogo?.defaultStyle || 'institucional',
            gender: n?.gender || prefs.gender || 'female',
            speed: n?.speed ?? prefs.speed ?? 1,
            voiceId: (n ? (n.ttsProvider === cfgNarration?.provider ? cfgNarration?.voiceId : '') : prefs.voiceId) || '',
            allowFallback: prefs.allowFallback ?? false
        };
    });

    // Mantener sincronizado el texto si llega una nueva versión desde el servidor
    useEffect(() => {
        if (n?.script) setScriptText(n.script);
    }, [n?.id, n?.script]);

    useEffect(() => {
        if (n) setForm(f => ({
            ...f,
            provider: n.ttsProvider || f.provider,
            language: n.language,
            style: n.style,
            gender: n.gender,
            speed: n.speed
        }));
    }, [n?.id, n?.ttsProvider]);

    // Lo elegido se recuerda en este navegador para el próximo Reel.
    useEffect(() => {
        writePrefs(form);
    }, [form]);

    // El catálogo del Reel estándar. Sólo se pide si no llegó por prop.
    useEffect(() => {
        if (options?.narration) { setCatalogo(options.narration); return; }
        if (catalogo) return;
        let vivo = true;
        (async () => {
            setCargando(true);
            try {
                const r = await fetch(`${API}/content-studio/reels/options`, { headers: authHeaders() });
                const { data } = await leerJson<ReelOptions>(r);
                if (!vivo) return;
                if (!r.ok || !data) { setErrorCatalogo(`No se pudo leer el catálogo de voces (HTTP ${r.status}).`); return; }
                setCatalogo(data.narration || null);
            } catch {
                if (vivo) setErrorCatalogo('No se pudo consultar el catálogo de voces.');
            } finally { if (vivo) setCargando(false); }
        })();
        return () => { vivo = false; };
    }, [options?.narration, catalogo]);

    // El estado REAL de cada motor: credencial, conexión, cuota y voces.
    const loadProviders = useCallback(async (force = false) => {
        setChecking(true);
        try {
            const r = await fetch(`${API}/content-studio/reels/narration/providers${force ? '?refresh=1' : ''}`, { headers: authHeaders() });
            const { data, crudo } = await leerJson<{ providers?: TtsProviderStatus[]; error?: string }>(r);
            if (!r.ok || !data?.providers) {
                if (force) toast.error(data?.error || describirNoJson(r, crudo));
                return;
            }
            setProviders(data.providers);
            if (force) toast.success('Conexión de los motores de voz verificada.');
        } catch {
            if (force) toast.error('No se pudo verificar la conexión de los motores de voz.');
        } finally {
            setChecking(false);
        }
    }, []);

    useEffect(() => { if (!premontado) loadProviders(false); }, [loadProviders, premontado]);

    // El historial trae también el BORRADOR que quedó sin aplicar (por
    // ejemplo, si se cerró la ficha después de generar).
    const loadHistory = useCallback(async () => {
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/narration?history=true`, { headers: authHeaders() });
            const { data } = await leerJson<{ narration?: ReelNarration[] }>(r);
            if (!r.ok || !Array.isArray(data?.narration)) return;
            const list = [...data.narration].sort((a, b) => b.version - a.version);
            setHistory(list);
            const vigente = list.find(v => v.isCurrent);
            const pendiente = list.find(v => !v.isCurrent && v.audioUrl && v.version > (vigente?.version || 0));
            setDraft(pendiente || null);
        } catch { /* el historial es complementario */ }
    }, [reel.id]);

    useEffect(() => { if (!premontado) loadHistory(); }, [loadHistory, premontado, n?.id]);

    // La muestra anterior se libera al pedir otra o al cerrar el panel.
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const selectedProvider = useMemo(
        () => providers?.find(p => p.id === form.provider) || null,
        [providers, form.provider]
    );

    // Sin estado de los proveedores todavía, las tarjetas salen del catálogo.
    const providerCards: TtsProviderStatus[] = useMemo(() => {
        if (providers) return providers.filter(p => p.implemented);
        return (catalogo?.providers || []).filter(p => p.id === 'elevenlabs' || p.id === 'openai').map(p => ({
            id: p.id, label: p.label, model: null, implemented: true, configured: p.available,
            accentControl: p.accentControl, voiceChoice: false, languages: null, billing: null,
            note: p.note || null, isDefault: p.isDefault, state: p.available ? 'unknown' : 'not_configured',
            message: null, quota: null, voices: [], warnings: [], accentNote: null,
            checkedAt: '', latencyMs: null
        }));
    }, [providers, catalogo?.providers]);

    const voiceOptions = useMemo(() => {
        const voices = selectedProvider?.voices || [];
        const byGender = voices.filter(v => v.gender === form.gender || v.gender === 'neutral');
        const list = (byGender.length ? byGender : voices).map(v => ({
            id: v.id,
            label: `${v.label}${v.accent ? ` · ${v.accent}` : ''}${v.language ? ` · ${v.language}` : ''}`
        }));
        // La voz guardada sigue en la lista aunque cambie el filtro de género.
        if (form.voiceId && !list.some(v => v.id === form.voiceId)) {
            const v = voices.find(x => x.id === form.voiceId);
            list.unshift({ id: form.voiceId, label: v ? v.label : `Voz ${form.voiceId}` });
        }
        return [{ id: '', label: 'Automática según el género' }, ...list];
    }, [selectedProvider, form.gender, form.voiceId]);

    const fallbackTarget = providerCards.find(p => p.id !== form.provider && p.configured) || null;

    // Acción: Generar / Regenerar únicamente el texto del guion con IA (sin tocar video ni escenas)
    const generateScriptWithAi = useCallback(async () => {
        setGeneratingScript(true);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/narration/script`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ language: form.language, style: form.style, speed: form.speed })
            });
            const { data, crudo } = await leerJson<{ ok?: boolean; script?: string; error?: string }>(r);
            if (!r.ok || !data?.script) {
                toast.error(data?.error || (data ? `No se pudo generar el texto de la locución (HTTP ${r.status}).` : describirNoJson(r, crudo)));
                return;
            }
            setScriptText(data.script);
            toast.success('Texto de la voz en off generado con IA.');
        } catch {
            toast.error('Error de conexión al generar el texto.');
        } finally {
            setGeneratingScript(false);
        }
    }, [form.language, form.style, form.speed, reel.id]);

    // Genera la voz como BORRADOR. `overrideProvider` es el «intentarlo con
    // el otro motor» de la tarjeta de fallo: se pasa explícito para no
    // depender de un estado que todavía no se actualizó.
    const generate = useCallback(async (overrideProvider?: string) => {
        const trimmed = scriptText.trim();
        if (!trimmed) {
            setFailure({ error: 'El texto de la voz en off está vacío. Escribí un guion o generalo con IA antes de generar el audio.', code: 'empty_script', codeLabel: 'Guion vacío', retryable: false });
            return;
        }
        const provider = overrideProvider || form.provider;
        const card = providerCards.find(p => p.id === provider);
        if (card && !card.configured) {
            setFailure({ error: card.message || `${card.label} no está configurado en el despliegue.`, code: 'not_configured', codeLabel: 'Proveedor no configurado', provider, providerLabel: card.label, retryable: false, fallback: fallbackTarget ? { provider: fallbackTarget.id, label: fallbackTarget.label } : null });
            return;
        }
        setGenerating(true);
        setFailure(null);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/narration`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    apply: false,
                    ttsProvider: provider,
                    language: form.language,
                    style: form.style,
                    gender: form.gender,
                    speed: form.speed,
                    // La voz elegida es del motor elegido: al cambiar de motor
                    // por el respaldo, va la voz por defecto del otro.
                    voiceId: overrideProvider && overrideProvider !== form.provider ? null : (form.voiceId || null),
                    allowFallback: form.allowFallback,
                    script: trimmed
                })
            });
            const { data, crudo } = await leerJson<{ draft?: ReelNarration } & TtsFailure>(r);
            if (!r.ok || !data?.draft) {
                setFailure(data?.error ? data : { error: describirNoJson(r, crudo), code: 'unknown', retryable: true });
                // Un fallo del proveedor puede cambiar su estado (cuota, credencial).
                if (data?.code && ['auth', 'quota', 'model_unsupported', 'voice_not_found', 'not_configured'].includes(data.code)) loadProviders(true);
                return;
            }
            if (overrideProvider) setForm(f => ({ ...f, provider: overrideProvider, voiceId: '' }));
            setDraft(data.draft);
            setHistory(h => [data.draft!, ...h.filter(v => v.id !== data.draft!.id)]);
            toast.success(data.draft.fallbackFrom
                ? `Narración generada con ${data.draft.ttsProviderLabel} (respaldo). Escuchala y aplicala al Reel.`
                : 'Narración generada. Escuchala y, si te gusta, aplicala al Reel.');
        } catch {
            setFailure({ error: 'Error de conexión con el servidor: la solicitud no llegó o no volvió. Reintentá.', code: 'network', codeLabel: 'Error de conexión', retryable: true });
        } finally {
            setGenerating(false);
        }
    }, [scriptText, form, providerCards, fallbackTarget, reel.id, loadProviders]);

    // Aplica una versión: la vuelve vigente y rehace la MEZCLA, sin escenas nuevas.
    const apply = useCallback(async (version: ReelNarration) => {
        setApplying(version.id);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/narration/${version.id}/apply`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({})
            });
            const { data, crudo } = await leerJson<Reel & TtsFailure>(r);
            if (!r.ok || !data || !(data as Reel).id) {
                toast.error(data?.error || describirNoJson(r, crudo));
                return;
            }
            onChanged(data as Reel);
            setDraft(null);
            toast.success('Voz aplicada. Se está rehaciendo la mezcla, sin regenerar ninguna escena.');
        } catch {
            toast.error('Error de conexión al aplicar la voz.');
        } finally {
            setApplying(null);
        }
    }, [reel.id, onChanged]);

    const preview = useCallback(async () => {
        setPreviewing(true);
        try {
            const r = await fetch(`${API}/content-studio/reels/narration/preview`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    ttsProvider: form.provider, language: form.language, style: form.style,
                    gender: form.gender, speed: form.speed, voiceId: form.voiceId || null
                })
            });
            if (!r.ok || !(r.headers.get('content-type') || '').includes('audio')) {
                const { data, crudo } = await leerJson<TtsFailure>(r);
                toast.error(data?.error || describirNoJson(r, crudo));
                return;
            }
            const blob = await r.blob();
            setPreviewUrl(URL.createObjectURL(blob));
            setTimeout(() => { previewRef.current?.play().catch(() => { /* el navegador pide un gesto */ }); }, 50);
        } catch {
            toast.error('Error de conexión al pedir la muestra de voz.');
        } finally {
            setPreviewing(false);
        }
    }, [form]);

    const download = useCallback(async (version: ReelNarration) => {
        if (!version.audioUrl) return;
        const name = `${(reel.title || 'reel').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '').trim().replace(/\s+/g, '-') || 'reel'}-voz-v${version.version}.mp3`;
        try {
            const r = await fetch(version.audioUrl);
            if (!r.ok) throw new Error(String(r.status));
            const url = URL.createObjectURL(await r.blob());
            const a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch {
            // Sin CORS en el almacenamiento, se abre el archivo: el navegador lo guarda.
            window.open(version.audioUrl, '_blank', 'noopener');
        }
    }, [reel.title]);

    // ── Desde acá, sólo render: ningún hook por debajo de este punto ──

    if (premontado) {
        return (
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-1">
                    <Mic className="w-5 h-5 text-gray-300" />
                    <h3 className="font-black text-gray-900">Voz en off</h3>
                </div>
                <p className="text-[11px] font-bold text-gray-500 mt-2">
                    Este video se importó ya montado («Video listo para publicar»), con su música y su outro adentro. Sumarle voz acá los duplicaría: la voz en off se elige en ese flujo.
                </p>
            </div>
        );
    }

    if (cargando && !catalogo) {
        return (
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex items-center gap-2 text-xs font-bold text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Consultando el catálogo de voces…
            </div>
        );
    }

    // ⚠️ SIN MOTOR DE VOZ NO SE OFRECE EL PANEL, y el motivo se dice. Un
    // control que se puede pulsar y no puede funcionar es peor que ninguno.
    if ((errorCatalogo || !catalogo?.available) && !n) {
        return (
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-1">
                    <Mic className="w-5 h-5 text-gray-300" />
                    <h3 className="font-black text-gray-900">Voz en off</h3>
                </div>
                <p className="text-[11px] font-bold text-amber-700 flex items-start gap-1.5 mt-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                    {errorCatalogo || catalogo?.unavailableReason || 'No hay ningún motor de voz configurado (ElevenLabs u OpenAI).'}
                </p>
            </div>
        );
    }

    const idiomas = (catalogo?.languages || []).map(l => ({ id: l.id, label: l.label }));
    const estilos = (catalogo?.styles || []).map(s => ({ id: s.id, label: s.label }));
    const generos = (catalogo?.genders || []).map(g => ({ id: g.id, label: g.label }));

    const rotuloGenero = n?.genderLabel
        || generos.find(g => g.id === (n?.gender || form.gender))?.label
        || null;
    const ocupado = generating || generatingScript || Boolean(applying);
    const providerReady = Boolean(providerCards.find(p => p.id === form.provider)?.configured);

    // Métricas de presupuesto de palabras según duración real del Reel
    const wordsCount = scriptText.trim() ? scriptText.trim().split(/\s+/).filter(Boolean).length : 0;
    const reelDurationSec = Number(reel.durationSec || (reel.config as Record<string, any> | undefined)?.timing?.finalDurationSec || 15);
    const targetWords = Math.max(4, Math.round(reelDurationSec * 2.2));
    const maxWords = Math.max(5, Math.round(reelDurationSec * 2.6));
    const estSec = (wordsCount / 2.3).toFixed(1);
    const wordsExceeded = wordsCount > maxWords;

    const anteriores = history.filter(v => v.id !== n?.id && v.id !== draft?.id && v.audioUrl);

    return (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <Mic className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-gray-900">Voz en off</h3>
                    {/* ⚠️ CON QUÉ VOZ SE HIZO, A LA VISTA. Es el punto 7 del pedido:
                        género, región y duración medida, sin abrir nada. */}
                    {n && (
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            {rotuloGenero ? `${rotuloGenero} · ` : ''}{n.languageLabel} · {n.styleLabel}
                            {n.actualSec != null ? ` · ${n.actualSec.toFixed(1)} s` : ''}
                        </span>
                    )}
                    {n && n.version > 1 && (
                        <span className="text-[10px] font-bold text-gray-400 flex items-center gap-0.5">
                            <History className="w-3 h-3" /> v{n.version}
                        </span>
                    )}
                </div>
            </div>

            {!n && (
                <p className="text-xs font-bold text-gray-400 mt-2">
                    {/* Punto 11: no se inventa lo que no se registró. */}
                    Configuración de voz no registrada: este Reel se montó sin locución. Editá o generá el guion, elegí el motor y la voz, generala, escuchala y aplicala — no vuelve a renderizar ninguna escena ni consume créditos de video.
                </p>
            )}

            {/* ══ 1. Texto de la voz en off ══ */}
            <div className="mt-4 bg-gray-50/80 border border-gray-200/80 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label htmlFor={`guion-${reel.id}`} className="text-[10px] font-extrabold text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        Texto de la voz en off
                    </label>
                    <button
                        type="button"
                        onClick={generateScriptWithAi}
                        disabled={ocupado}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 border border-fuchsia-200 transition-all flex items-center gap-1.5 disabled:opacity-40 shadow-xs"
                    >
                        {generatingScript ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-fuchsia-600" />}
                        {scriptText.trim() ? 'Regenerar texto con IA' : 'Generar texto con IA'}
                    </button>
                </div>

                <textarea
                    id={`guion-${reel.id}`}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 resize-y min-h-[96px] font-sans leading-relaxed transition-all"
                    value={scriptText}
                    placeholder="Escribí acá el guion que dirá la locución, o pulsá «Generar texto con IA» para redactarlo automáticamente según la historia de la publicación..."
                    disabled={generatingScript || generating}
                    onChange={e => setScriptText(e.target.value)}
                />

                <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] font-bold text-gray-500">
                    <span>
                        {wordsCount} palabras · Duración del Reel: {reelDurationSec.toFixed(1)} s (~{targetWords} palabras sugeridas, máx. {maxWords}) · ≈{estSec} s estimadas
                    </span>
                    {wordsExceeded && (
                        <span className="text-amber-700 flex items-center gap-1 font-extrabold">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            Excede la duración del Reel: la voz se pasaría del video. Acortalo antes de generar.
                        </span>
                    )}
                </div>
            </div>

            {/* ══ 2. Motor de voz ══ */}
            <div className="mt-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest">Motor de voz (TTS)</span>
                    <button
                        type="button"
                        onClick={() => loadProviders(true)}
                        disabled={checking}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 transition-all flex items-center gap-1.5 disabled:opacity-40"
                    >
                        {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlugZap className="w-3 h-3" />}
                        Verificar conexión
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {providerCards.map(p => (
                        <ProviderCard
                            key={p.id}
                            p={p}
                            selected={form.provider === p.id}
                            disabled={ocupado}
                            onSelect={() => setForm(f => (f.provider === p.id ? f : { ...f, provider: p.id, voiceId: '' }))}
                        />
                    ))}
                </div>
                {fallbackTarget && (
                    <label className="mt-3 flex items-start gap-2 text-[11px] font-bold text-gray-600 cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-0.5 accent-indigo-600"
                            checked={form.allowFallback}
                            disabled={ocupado}
                            onChange={e => setForm(f => ({ ...f, allowFallback: e.target.checked }))}
                        />
                        <span>
                            Si el motor elegido falla, intentar automáticamente una vez con {fallbackTarget.label}.
                            <span className="block text-gray-400 font-medium">Apagado, el fallo se muestra y vos decidís si probar con el otro motor (cada síntesis se cobra).</span>
                        </span>
                    </label>
                )}
            </div>

            {/* ══ 3. Configuración de la narración ══ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <Select
                    label="País o región"
                    value={form.language}
                    disabled={ocupado}
                    onChange={v => setForm(f => ({ ...f, language: v }))}
                    options={idiomas}
                />
                <Select
                    label="Estilo"
                    value={form.style}
                    disabled={ocupado}
                    onChange={v => setForm(f => ({ ...f, style: v }))}
                    options={estilos}
                />
                <Select
                    label="Género"
                    value={form.gender}
                    disabled={ocupado}
                    onChange={v => setForm(f => ({ ...f, gender: v, voiceId: '' }))}
                    options={generos}
                />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {selectedProvider?.voiceChoice && selectedProvider.voices.length > 0 ? (
                    <Select
                        label="Voz"
                        value={form.voiceId}
                        disabled={ocupado}
                        onChange={v => setForm(f => ({ ...f, voiceId: v }))}
                        options={voiceOptions}
                        hint={selectedProvider.accentControl
                            ? 'En ElevenLabs el acento lo pone la voz: para acento colombiano elegí una voz latina de la cuenta.'
                            : 'Las voces de OpenAI no eligen acento: el español sale neutro.'}
                    />
                ) : (
                    <div className="text-[11px] text-gray-400 font-medium self-end pb-1">
                        La voz se elige automáticamente según el género.
                    </div>
                )}
                <div className="space-y-2">
                    <label htmlFor={`velocidad-${reel.id}`} className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">
                        Velocidad · {form.speed.toFixed(2)}×
                    </label>
                    <input
                        id={`velocidad-${reel.id}`}
                        type="range" min={0.85} max={1.15} step={0.05}
                        value={form.speed}
                        disabled={ocupado}
                        onChange={e => setForm(f => ({ ...f, speed: Number(e.target.value) }))}
                        className="w-full accent-indigo-600"
                    />
                    <p className="text-[11px] text-gray-400 font-medium">Rango imperceptible (±15 %): el ajuste fino lo hace el guion, no la voz acelerada.</p>
                </div>
            </div>

            {/* ══ 4. Acciones ══ */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => generate()}
                    disabled={ocupado || !scriptText.trim() || !providerReady}
                    className="px-4 py-2.5 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-40"
                >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {generating ? 'Generando narración…' : (draft || n) ? 'Regenerar narración' : 'Generar voz en off'}
                </button>
                <button
                    type="button"
                    onClick={preview}
                    disabled={ocupado || previewing || !providerReady}
                    className="px-3 py-2.5 rounded-xl text-xs font-black bg-white text-gray-700 border border-gray-200 hover:bg-gray-100 transition-all flex items-center gap-2 disabled:opacity-40"
                >
                    {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                    Escuchar muestra de la voz
                </button>
                {!providerReady && (
                    <span className="text-[11px] font-bold text-amber-700">El motor elegido requiere configuración.</span>
                )}
            </div>
            {previewUrl && (
                <audio ref={previewRef} src={previewUrl} controls className="w-full h-10 mt-2 rounded-lg" />
            )}

            {failure && (
                <FailureCard
                    failure={failure}
                    busy={ocupado}
                    onRetry={() => generate()}
                    onFallback={provider => generate(provider)}
                />
            )}

            {/* ══ 5. Borrador, vigente e historial ══ */}
            <div className="mt-4 space-y-3">
                {draft && (
                    <VersionCard
                        n={draft}
                        title="Narración generada · sin aplicar"
                        tone="draft"
                        busy={applying === draft.id}
                        onApply={() => apply(draft)}
                        onDownload={() => download(draft)}
                    />
                )}
                {n && (
                    <VersionCard
                        n={n}
                        title="Voz aplicada al Reel"
                        tone="current"
                        busy={false}
                        onDownload={() => download(n)}
                    />
                )}
                {anteriores.length > 0 && (
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowHistory(v => !v)}
                            className="text-[11px] font-black text-gray-500 hover:text-gray-800 flex items-center gap-1.5"
                        >
                            <History className="w-3.5 h-3.5" />
                            {showHistory ? 'Ocultar' : 'Ver'} versiones anteriores ({anteriores.length})
                        </button>
                        {showHistory && (
                            <div className="mt-2 space-y-2">
                                {anteriores.map(v => (
                                    <VersionCard
                                        key={v.id}
                                        n={v}
                                        title={new Date(v.createdAt).toLocaleString('es-CO')}
                                        tone="history"
                                        busy={applying === v.id}
                                        onApply={() => apply(v)}
                                        onDownload={() => download(v)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <p className="text-[10px] font-bold text-gray-400 mt-3">
                Generar no toca el video. Aplicar la voz <b>no regenera ninguna escena</b>: se vuelve a mezclar con los clips que ya existen y el outro se conserva.
            </p>
        </div>
    );
};

export default ReelNarrationPanel;
