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
 * ⚠️ REGENERAR LA VOZ NO REGENERA NINGUNA ESCENA. `POST /reels/:id/narration`
 * limpia el `renderJobId` y rehace la MEZCLA con los clips que ya existen: cero
 * llamadas al motor de video, cero créditos de escena. Es lo que permite probar
 * idiomas, acentos y estilos sin volver a pagar lo generado.
 *
 * ⚠️ Y EL CATÁLOGO DE VOCES SE CONSULTA ACÁ DENTRO. La Biblioteca no carga
 * `ReelOptions`, así que sin esto habría que cablearlo en cada pantalla que
 * monte el panel — y la tercera se olvidaría. Quien ya lo tiene (el Creador)
 * lo pasa por prop y no paga un viaje de red de más. Misma decisión que
 * `useSavedOutros` dentro de `SavedOutroPicker`.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Mic, Clock, History, Loader2, RefreshCw, AlertTriangle, Sparkles, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { Reel, ReelOptions } from '../../../lib/reelSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`,
    'Content-Type': 'application/json'
});

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

type Narration = NonNullable<Reel['narration']>;
type NarrationCatalog = NonNullable<ReelOptions['narration']>;

const ReelNarrationPanel: React.FC<{
    reel: Reel;
    /** Quien ya tiene el catálogo lo pasa; quien no, se consulta acá dentro. */
    options?: ReelOptions | null;
    onChanged: (r: Reel) => void;
}> = ({ reel, options, onChanged }) => {
    const n: Narration | null = reel.narration || null;
    const [busy, setBusy] = useState(false);
    const [generatingScript, setGeneratingScript] = useState(false);
    const [scriptText, setScriptText] = useState(n?.script || (reel.config as any)?.narration?.script || '');
    const [catalogo, setCatalogo] = useState<NarrationCatalog | null>(options?.narration || null);
    const [cargando, setCargando] = useState(false);
    const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);

    // Mantener sincronizado el texto si llega una nueva versión desde el servidor
    useEffect(() => {
        if (n?.script) {
            setScriptText(n.script);
        }
    }, [n?.id, n?.script]);

    // El catálogo del Reel estándar. Sólo se pide si no llegó por prop.
    useEffect(() => {
        if (options?.narration) { setCatalogo(options.narration); return; }
        if (catalogo) return;
        let vivo = true;
        (async () => {
            setCargando(true);
            try {
                const r = await fetch(`${API}/content-studio/reels/options`, { headers: authHeaders() });
                const texto = await r.text();
                let data: ReelOptions | null = null;
                try { data = texto ? JSON.parse(texto) as ReelOptions : null; } catch { data = null; }
                if (!vivo) return;
                if (!r.ok || !data) { setErrorCatalogo(`No se pudo leer el catálogo de voces (HTTP ${r.status}).`); return; }
                setCatalogo(data.narration || null);
            } catch {
                if (vivo) setErrorCatalogo('No se pudo consultar el catálogo de voces.');
            } finally { if (vivo) setCargando(false); }
        })();
        return () => { vivo = false; };
    }, [options?.narration, catalogo]);

    // ⚠️ NO SE INVENTA LA CONFIGURACIÓN DE UN REEL VIEJO (punto 11). Si la fila
    // no guardó idioma, estilo o género, el formulario arranca en los valores
    // por DEFECTO y la pantalla dice que la configuración anterior no quedó
    // registrada — rellenarla con lo que suponemos afirmaría un dato que nadie
    // escribió.
    const [form, setForm] = useState({
        provider: n?.ttsProvider || catalogo?.provider || 'elevenlabs',
        language: n?.language || catalogo?.defaultLanguage || 'es-CO',
        style: n?.style || catalogo?.defaultStyle || 'institucional',
        gender: n?.gender || 'female',
        speed: n?.speed ?? 1
    });

    useEffect(() => {
        if (n) setForm({
            provider: n.ttsProvider || catalogo?.provider || 'elevenlabs',
            language: n.language,
            style: n.style,
            gender: n.gender,
            speed: n.speed
        });
    }, [n?.id, n?.ttsProvider]);

    // Con el catálogo recién llegado y sin narración previa, el formulario toma
    // los valores por defecto del proveedor en vez de los escritos acá.
    useEffect(() => {
        if (n || !catalogo) return;
        setForm(f => ({
            ...f,
            provider: catalogo.provider || f.provider,
            language: catalogo.defaultLanguage || f.language,
            style: catalogo.defaultStyle || f.style
        }));
    }, [n, catalogo?.provider, catalogo?.defaultLanguage, catalogo?.defaultStyle]);

    // Acción: Generar / Regenerar únicamente el texto del guion con IA (sin tocar video ni escenas)
    const generateScriptWithAi = useCallback(async () => {
        setGeneratingScript(true);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/narration/script`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    language: form.language,
                    style: form.style,
                    speed: form.speed
                })
            });
            const texto = await r.text();
            let data: { ok?: boolean; script?: string; error?: string } | null = null;
            try { data = texto ? JSON.parse(texto) : null; } catch { data = null; }
            if (!r.ok || !data?.script) {
                toast.error(data?.error || `No se pudo generar el texto de la locución (HTTP ${r.status}).`);
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

    const regenerate = useCallback(async (overrides: Record<string, unknown> = {}) => {
        setBusy(true);
        try {
            const payload = {
                ...form,
                ttsProvider: form.provider,
                script: scriptText.trim() || undefined,
                ...overrides
            };
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/narration`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify(payload)
            });
            const texto = await r.text();
            let data: (Reel & { error?: string }) | null = null;
            try { data = texto ? JSON.parse(texto) as Reel & { error?: string } : null; } catch { data = null; }
            if (!r.ok || !data) { toast.error(data?.error || `No se pudo generar la voz en off (HTTP ${r.status}).`); return; }
            onChanged(data);
            // Lo que se dice es lo que pasa: se rehace la MEZCLA, no el video.
            toast.success('Voz en off lista. Se está rehaciendo la mezcla, sin regenerar ninguna escena.');
        } catch { toast.error('Error de conexión'); } finally { setBusy(false); }
    }, [form, scriptText, onChanged, reel.id]);

    const handleGenerateVoice = useCallback(() => {
        const trimmed = scriptText.trim();
        if (!trimmed) {
            toast.error('El texto de la voz en off está vacío. Escribe un guion o generálo con IA antes de generar el audio.');
            return;
        }
        regenerate({ script: trimmed });
    }, [scriptText, regenerate]);

    if (cargando && !catalogo) {
        return (
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex items-center gap-2 text-xs font-bold text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Consultando el catálogo de voces…
            </div>
        );
    }

    // ⚠️ SIN MOTOR DE VOZ NO SE OFRECE EL PANEL, y el motivo se dice. Un
    // control que se puede pulsar y no puede funcionar es peor que ninguno.
    if (errorCatalogo || !catalogo?.available) {
        if (!n) {
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
    }

    const idiomas = (catalogo?.languages || []).map(l => ({ id: l.id, label: l.label }));
    const estilos = (catalogo?.styles || []).map(s => ({ id: s.id, label: s.label }));
    const generos = (catalogo?.genders || []).map(g => ({ id: g.id, label: g.label }));

    const rotuloGenero = n?.genderLabel
        || generos.find(g => g.id === (n?.gender || form.gender))?.label
        || null;
    const puedeRegenerar = Boolean(catalogo?.available) && !busy && !generatingScript;

    // Métricas de presupuesto de palabras según duración real del Reel
    const wordsCount = scriptText.trim() ? scriptText.trim().split(/\s+/).filter(Boolean).length : 0;
    const reelDurationSec = Number(reel.durationSec || (reel.config as any)?.timing?.finalDurationSec || 15);
    const targetWords = Math.max(4, Math.round(reelDurationSec * 2.2));
    const maxWords = Math.max(5, Math.round(reelDurationSec * 2.6));
    const estSec = (wordsCount / 2.3).toFixed(1);
    const wordsExceeded = wordsCount > maxWords;

    return (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
                <div className="flex items-center gap-3">
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
                <button
                    type="button"
                    onClick={handleGenerateVoice}
                    disabled={!puedeRegenerar || !scriptText.trim()}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {n ? 'Regenerar voz en off' : 'Generar voz en off'}
                </button>
            </div>

            {!n ? (
                <p className="text-xs font-bold text-gray-400 mt-2">
                    {/* Punto 11: no se inventa lo que no se registró. */}
                    Configuración de voz no registrada: este Reel se montó sin locución. Editá o generá el guion abajo, elegí el género y la región y generala — no vuelve a renderizar ninguna escena ni consume créditos de video.
                </p>
            ) : (
                <div className="mt-2 space-y-1.5">
                    {/* La sincronía se MUESTRA con su número, no se promete: la
                        duración real sale de medir el MP3, no de estimarla. */}
                    <p className={`text-[11px] font-bold flex items-start gap-1.5 ${
                        n.withinTolerance ? 'text-emerald-600' : 'text-amber-700'
                    }`}>
                        <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                        {n.summary}
                    </p>
                    {n.accentControlled === false && (
                        <p className="text-[10px] font-bold text-gray-400 pl-5">
                            {n.ttsProviderLabel} no permite elegir el acento: el español sale neutro.
                        </p>
                    )}
                    {n.audioUrl && <audio src={n.audioUrl} controls className="w-full h-10 mt-2 rounded-lg" />}
                </div>
            )}

            {/* ══ Campo visible: Texto de la voz en off ══ */}
            <div className="mt-4 bg-gray-50/80 border border-gray-200/80 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-[10px] font-extrabold text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        Texto de la voz en off
                    </label>
                    <button
                        type="button"
                        onClick={generateScriptWithAi}
                        disabled={generatingScript || busy}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 border border-fuchsia-200 transition-all flex items-center gap-1.5 disabled:opacity-40 shadow-xs"
                    >
                        {generatingScript ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-fuchsia-600" />}
                        {scriptText.trim() ? 'Regenerar texto con IA' : 'Generar texto con IA'}
                    </button>
                </div>

                <textarea
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 resize-y min-h-[96px] font-sans leading-relaxed transition-all"
                    value={scriptText}
                    placeholder="Escribí acá el guion que dirá la locución, o pulsá «Generar texto con IA» para redactarlo automáticamente según la historia de la publicación..."
                    disabled={generatingScript || busy}
                    onChange={e => setScriptText(e.target.value)}
                />

                <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] font-bold text-gray-500">
                    <span>
                        {wordsCount} palabras · Duración del Reel: {reelDurationSec.toFixed(1)} s (~{targetWords} palabras sugeridas, máx. {maxWords}) · ≈{estSec} s estimadas
                    </span>
                    {wordsExceeded && (
                        <span className="text-amber-700 flex items-center gap-1 font-extrabold">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            Excede las palabras sugeridas para la duración. Se recomienda acortarlo para no acelerar la voz.
                        </span>
                    )}
                </div>
            </div>

            {/* ══ Selector de Motor de Voz (ElevenLabs vs OpenAI) ══ */}
            <div className="mt-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <label className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest block">
                        Motor de Voz (TTS)
                    </label>
                    {form.provider === 'openai' ? (
                        <span className="text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                            OpenAI TTS activo · Alta disponibilidad
                        </span>
                    ) : (
                        <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                            ElevenLabs activo · Con respaldo automático
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        disabled={!puedeRegenerar}
                        onClick={() => setForm(f => ({ ...f, provider: 'elevenlabs' }))}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-black border transition-all ${
                            form.provider === 'elevenlabs'
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                    >
                        ElevenLabs (Latinoamérica)
                    </button>
                    <button
                        type="button"
                        disabled={!puedeRegenerar}
                        onClick={() => setForm(f => ({ ...f, provider: 'openai' }))}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-black border transition-all ${
                            form.provider === 'openai'
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                    >
                        OpenAI TTS (Respaldo)
                    </button>
                </div>
                <p className="text-[11px] text-gray-400 font-medium mt-2 leading-relaxed">
                    {form.provider === 'elevenlabs'
                        ? 'ElevenLabs ofrece entonación institucional y acentos regionales. Si la cuota de ElevenLabs se agota, el servidor conmutará automáticamente a OpenAI TTS como respaldo para no bloquear la generación.'
                        : 'OpenAI TTS sintetiza la locución con excelente claridad y disponibilidad inmediata, sin consumir créditos de ElevenLabs.'}
                </p>
            </div>

            {/* Selectores de voz: País o región, Estilo y Género */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <Select
                    label="País o región"
                    value={form.language}
                    disabled={!puedeRegenerar}
                    onChange={v => setForm(f => ({ ...f, language: v }))}
                    options={idiomas}
                />
                <Select
                    label="Estilo"
                    value={form.style}
                    disabled={!puedeRegenerar}
                    onChange={v => setForm(f => ({ ...f, style: v }))}
                    options={estilos}
                />
                <Select
                    label="Género"
                    value={form.gender}
                    disabled={!puedeRegenerar}
                    onChange={v => setForm(f => ({ ...f, gender: v }))}
                    options={generos}
                />
            </div>

            {catalogo?.accentControlled === false && (
                <p className="text-[10px] font-bold text-amber-700 mt-2 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    El motor activo no permite elegir el acento: el español sale neutro. Para acento colombiano real hace falta configurar ElevenLabs.
                </p>
            )}

            <p className="text-[10px] font-bold text-gray-400 mt-2">
                Cambiar la voz <b>no regenera ninguna escena</b>: se vuelve a mezclar con los clips que ya existen y el outro se conserva.
            </p>
        </div>
    );
};

export default ReelNarrationPanel;
