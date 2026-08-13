// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — pantalla
// v4.667.0
//
// Tres pantallas en una, según dónde esté el Reel:
//
//   1. PREPARACIÓN — elegir tres fotos, ordenarlas, y opcionalmente el estilo.
//      Todo lo demás lo decide la IA. Es el pedido: "el usuario únicamente
//      deberá seleccionar las tres imágenes".
//   2. PROCESO — barra de progreso por etapa (análisis, escenas, música,
//      montaje, validación), con el estado de cada escena.
//   3. PREVISUALIZACIÓN — el Reel completo antes de descargarlo, y desde ahí
//      cambiar la música, la duración de una escena, regenerar un solo clip o
//      sustituir su foto, sin rehacer todo.
//
// Los CATÁLOGOS vienen del servidor (`/reels/options`): no se duplican acá para
// que no puedan quedar desfasados. Lo único que la pantalla calcula sola es la
// duración de la línea de tiempo mientras se arrastra.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Plus, Trash2, GripVertical, Settings2, Music, Sparkles, Loader2,
    Clapperboard, X, CheckCircle2, Volume2, AlertTriangle, RefreshCw,
    Download, Image as ImageIcon, Wand2, ShieldCheck, Film, Clock, VolumeX,
    Info, ChevronRight, Save, Copy, Check, Pencil, FileDown, History, FileText,
    Mic, Target, Upload
} from 'lucide-react';
import { Reorder } from 'framer-motion';
import MediaPicker from './MediaPicker';
import ScenePeopleCheck from './ScenePeopleCheck';
import SceneBrandCheck from './SceneBrandCheck';
import { toast } from 'sonner';
import type { Outro } from '../../../lib/outroSpec';
import {
    MIN_SCENE_SEC, MAX_SCENE_SEC,
    isTerminal, timelineDuration, formatSeconds, formatBytes, formatEta,
    type Reel, type ReelScene, type ReelOptions, type ReelCopy
} from '../../../lib/reelSpec';
import {
    DEFAULT_PRESET, narrativeRolesFor, targetTotalSecFor
} from '../../../lib/reelPresets';
import EmergencyForm, { type EmergencyContextInput } from './EmergencyForm';
import { uploadMediaFiles, IMAGE_ACCEPT } from '../../../lib/mediaUpload';

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    type: 'image' | 'video' | 'document';
}

// Clip de cierre que se engancha al final. Viaja en `config.outro` y NO se
// manda al motor de imágenes: el outro ya está renderizado y se adjunta tal
// cual, conservando su duración, su resolución y su voz.
interface AttachedOutro {
    id: string;
    title: string;
    url: string;
    durationSec: number | null;
    format: string;
    hasAudio: boolean | null;
    posterUrl: string;
}

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`,
    'Content-Type': 'application/json'
});

const AUTO = 'auto';

const VideoCreator: React.FC = () => {
    const [options, setOptions] = useState<ReelOptions | null>(null);
    const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([]);
    const [showPicker, setShowPicker] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    // El Reel en curso o terminado. Mientras es null, se ve la preparación.
    const [reel, setReel] = useState<Reel | null>(null);
    const [busyScene, setBusyScene] = useState<string | null>(null);
    const [savingLibrary, setSavingLibrary] = useState(false);

    const [preflight, setPreflight] = useState<{ warnings: string[]; creditEstimate: number } | null>(null);
    const [checking, setChecking] = useState(false);

    // Subida desde el dispositivo (v4.784). El `<input type="file">` va oculto y
    // lo dispara el botón: el control nativo no se puede estilar y se vería como
    // un cuerpo extraño al lado de «Elegir fotos».
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const [config, setConfig] = useState({
        format: '9:16',
        qualityTier: 'fullhd',
        motionStyle: AUTO,
        motionIntensity: 'natural',
        // Preservación estricta de personas: encendida por defecto (v4.705).
        strictPeople: true,
        transition: AUTO,
        musicStyle: AUTO,
        engine: '',
        withMusic: true,
        // Contexto estratégico, el mismo del Generador de Publicaciones.
        publicationType: 'standard',
        interestArea: 'general'
    });

    // ── Preset y cantidad de fotos (v4.783) ──
    //
    // Van FUERA de `config` a propósito: `config` se derrama entero en el
    // cuerpo del POST con `...config`, y el preset necesita resolverse antes
    // —decide cuántas fotos se piden y qué formulario se muestra—. Mezclarlos
    // haría que un cambio de preset se leyera como un cambio de configuración.
    const [preset, setPreset] = useState<string>(DEFAULT_PRESET);
    const [sceneCount, setSceneCount] = useState<number>(3);

    // El contexto de la emergencia. Vive acá y no en `config` por lo mismo, y
    // porque sólo viaja cuando el preset lo declara.
    const [emergency, setEmergency] = useState<EmergencyContextInput>({
        disasterType: 'terremoto',
        customDisaster: '',
        country: '',
        region: '',
        eventDate: '',
        magnitude: '',
        description: '',
        communities: '',
        needs: [],
        customNeed: '',
        ctas: ['donar'],
        contactUrl: ''
    });

    // El preset elegido, resuelto contra el catálogo del servidor. Mientras no
    // llegue la respuesta se cae al espejo local, que es justamente para lo que
    // existe: la pantalla tiene que poder pintarse antes del primer fetch.
    const activePreset = useMemo(
        () => options?.presets?.find(p => p.id === preset) || null,
        [options, preset]
    );
    const allowedCounts = activePreset?.sceneCounts
        || (preset === 'emergencia' ? [3, 4, 5] : [3]);
    const isEmergency = activePreset?.contextSchema === 'emergency' || preset === 'emergencia';

    // Los roles narrativos de cada posición. Se calculan en el navegador —no se
    // piden al servidor— porque se repintan en cada movimiento del arrastre y
    // un viaje a la API por movimiento sería inaceptable. El servidor los vuelve
    // a calcular al crear y su resultado es el que manda.
    const roles = useMemo(
        () => narrativeRolesFor(preset, sceneCount),
        [preset, sceneCount]
    );

    // ── Cambiar de preset puede dejar la selección imposible ──
    //
    // De «Campaña de Emergencia» con cinco fotos a «Reel estándar», que sólo
    // admite tres: sin esto quedaban cinco fotos elegidas, el botón de generar
    // deshabilitado y ninguna explicación de por qué. Se recorta la selección y
    // se dice, en vez de dejar al usuario buscando qué está mal.
    //
    // Va en un efecto y no en el manejador del selector porque el preset también
    // cambia al duplicar un Reel, y hacerlo en cada sitio deja al tercero sin
    // hacerlo — el fallo es mudo.
    useEffect(() => {
        if (allowedCounts.includes(sceneCount)) return;
        const next = allowedCounts.includes(3) ? 3 : allowedCounts[0];
        setSceneCount(next);
        setSelectedMedia(current => {
            if (current.length <= next) return current;
            toast.info(`«${activePreset?.label || 'Este preset'}» usa ${allowedCounts.join(' o ')} fotos: se quitaron las últimas ${current.length - next}.`);
            return current.slice(0, next);
        });
    }, [preset, allowedCounts, sceneCount, activePreset?.label]);

    // Narración IA. Apagada por defecto: es la opción que gasta créditos de voz
    // y no todo Reel la quiere.
    const [narration, setNarration] = useState({
        enabled: false,
        language: 'es-CO',
        style: 'institucional',
        gender: 'female',
        speed: 1
    });

    // Outro adjunto (v4.645). Se conserva: es una pieza aparte que ya funciona.
    const [outro, setOutro] = useState<AttachedOutro | null>(null);
    const [availableOutros, setAvailableOutros] = useState<Outro[]>([]);
    const [showOutroPicker, setShowOutroPicker] = useState(false);
    const [loadingOutros, setLoadingOutros] = useState(false);

    // Sustitución de la foto de una escena desde la previsualización.
    const [swappingScene, setSwappingScene] = useState<ReelScene | null>(null);

    // ── Catálogos ──
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${API}/content-studio/reels/options`, { headers: authHeaders() });
                if (!r.ok) return;
                const data: ReelOptions = await r.json();
                setOptions(data);
                setConfig(c => ({
                    ...c,
                    format: data.defaultFormat,
                    qualityTier: data.defaultQualityTier,
                    engine: data.defaultEngine,
                    publicationType: data.context?.defaultType || c.publicationType,
                    interestArea: data.context?.defaultArea || c.interestArea
                }));
                // El default del preset lo dice el servidor. Sólo se aplica si
                // el usuario no eligió todavía: la respuesta puede llegar
                // después de que haya tocado el selector, y pisarle la elección
                // con un valor por omisión sería el peor momento para hacerlo.
                if (data.defaultPreset) {
                    setPreset(p => (p === DEFAULT_PRESET ? data.defaultPreset! : p));
                }
                if (data.emergency) {
                    setEmergency(e => ({
                        ...e,
                        disasterType: data.emergency!.defaultDisaster || e.disasterType,
                        ctas: e.ctas.length ? e.ctas : [data.emergency!.defaultCta]
                    }));
                }
                if (data.narration) {
                    setNarration(n => ({
                        ...n,
                        language: data.narration!.defaultLanguage,
                        style: data.narration!.defaultStyle
                    }));
                }
            } catch { /* la pantalla funciona con los defaults locales */ }
        })();
    }, []);

    const overlaps = useMemo(() => {
        const map: Record<string, number> = {};
        options?.transitions.forEach(t => { map[t.id] = t.overlap; });
        return map;
    }, [options]);

    const fetchOutros = useCallback(async () => {
        setLoadingOutros(true);
        try {
            const r = await fetch(`${API}/content-studio/outros?readyOnly=true`, { headers: authHeaders() });
            if (r.ok) setAvailableOutros((await r.json()).outros || []);
        } catch { /* el selector queda vacío y se puede reintentar */ } finally {
            setLoadingOutros(false);
        }
    }, []);
    useEffect(() => { fetchOutros(); }, [fetchOutros]);

    // ── Comprobación previa ──
    // Mira las tres fotos ANTES de gastar créditos. Devuelve avisos, no
    // bloqueos: quien sube una foto un poco blanda puede querer generar igual.
    useEffect(() => {
        if (selectedMedia.length !== sceneCount) { setPreflight(null); return; }
        let cancelled = false;
        setChecking(true);
        (async () => {
            try {
                const r = await fetch(`${API}/content-studio/reels/preflight`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        images: selectedMedia.map(m => ({ id: m.id, url: m.url })),
                        format: config.format,
                        qualityTier: config.qualityTier,
                        engine: config.engine || undefined,
                        // Sin el preset, el servidor valida contra `estandar` y
                        // rechaza cuatro o cinco fotos: la comprobación previa
                        // fallaba justo en el caso que se acaba de agregar.
                        preset
                    })
                });
                if (!r.ok || cancelled) return;
                const data = await r.json();
                if (!cancelled) setPreflight({ warnings: data.warnings || [], creditEstimate: data.creditEstimate || 0 });
            } catch { /* sin comprobación previa se puede generar igual */ } finally {
                if (!cancelled) setChecking(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedMedia, sceneCount, preset, config.format, config.qualityTier, config.engine]);

    // ── Sondeo ──
    // El flujo es asíncrono a propósito: cada clip tarda 1-3 minutos y la
    // función de la API corta a los 120 s. El webhook es la segunda vía; esto
    // es la primera y la que mueve la barra.
    //
    // El intervalo bajó de 6 s a 3 s en v4.669. No acelera la generación, pero
    // sí lo que se TARDA EN VER que terminó: el Reel pasa por cuatro cambios de
    // etapa y con 6 s cada uno se descubría, de media, tres segundos tarde —
    // hasta 24 s de espera que no la causaba ningún proveedor.
    const POLL_MS = 3000;
    const pollRef = useRef<number | null>(null);
    useEffect(() => {
        if (!reel || isTerminal(reel.status)) {
            if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
            return;
        }
        const id = window.setInterval(async () => {
            try {
                const r = await fetch(`${API}/content-studio/reels/${reel.id}/sync`, { headers: authHeaders() });
                if (r.ok) setReel(await r.json());
            } catch { /* un fallo de red no pierde el Reel: se reintenta solo */ }
        }, POLL_MS);
        pollRef.current = id;
        return () => window.clearInterval(id);
    }, [reel?.id, reel?.status]);

    // ── Acciones ──

    /**
     * Sube las fotos elegidas del dispositivo y las AÑADE a la selección.
     *
     * Quedan guardadas en la Biblioteca Multimedia —van por el mismo camino que
     * «Subir Nuevo» de esa pantalla—, así que se pueden volver a elegir después
     * para otro Reel. Ése es el punto: subir acá no es un atajo que deje el
     * archivo suelto, es la misma subida hecha desde donde hace falta.
     */
    const handleFilesChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const chosen = Array.from(e.target.files || []);
        // El input se limpia SIEMPRE y en seguida: sin esto, volver a elegir el
        // mismo archivo no dispara `change` —el valor no cambió— y el botón
        // parece roto justo cuando alguien reintenta tras un fallo.
        e.target.value = '';
        if (!chosen.length) return;

        // Nunca se suben más de las que caben. Subir siete fotos para un Reel de
        // tres deja cuatro archivos en la Biblioteca que nadie pidió, y cuesta
        // tiempo de subida por nada.
        const room = sceneCount - selectedMedia.length;
        if (room <= 0) {
            toast.error(`Ya elegiste las ${sceneCount} fotos. Quitá alguna para subir otra.`);
            return;
        }
        const files = chosen.slice(0, room);
        if (chosen.length > room) {
            toast.info(`Sólo caben ${room} foto(s) más: se suben las primeras ${room}.`);
        }

        setIsUploading(true);
        const toastId = toast.loading(`Subiendo 1 de ${files.length}…`);
        try {
            const { uploaded, failed } = await uploadMediaFiles(files, {
                // El sitio NO se manda: `/media/presigned-url` y `/media/save`
                // lo resuelven desde el token, y para un administrador de sitio
                // ignoran lo que llegue del navegador. Mandarlo daría dos
                // fuentes para el mismo dato y sólo una manda.
                onProgress: (done, total, name) => {
                    if (done < total) {
                        toast.loading(`Subiendo ${done + 1} de ${total}${name ? ` — ${name}` : ''}…`, { id: toastId });
                    }
                }
            });

            if (uploaded.length) {
                // Se AÑADEN al final, no reemplazan: quien ya eligió dos de la
                // Biblioteca y sube la tercera espera terminar con tres.
                setSelectedMedia(prev => [...prev, ...uploaded.map(m => ({
                    id: m.id, filename: m.filename, url: m.url, type: m.type
                }))].slice(0, sceneCount));
            }

            if (failed.length) {
                // Con su NOMBRE y su motivo: «falló una de tres» sin decir cuál
                // obliga a adivinar qué reintentar.
                toast.error(
                    `No se pudo subir ${failed[0].name}: ${failed[0].reason}` +
                    (failed.length > 1 ? ` (y ${failed.length - 1} más).` : ''),
                    { id: toastId, duration: 8000 }
                );
            } else {
                toast.success(
                    `${uploaded.length} foto(s) subidas y guardadas en la Biblioteca.`,
                    { id: toastId }
                );
            }
        } catch (err) {
            toast.error(`No se pudieron subir las fotos: ${err instanceof Error ? err.message : 'error desconocido'}`, { id: toastId });
        } finally {
            setIsUploading(false);
        }
    };

    const handleGenerate = async () => {
        if (selectedMedia.length !== sceneCount) {
            toast.error(`Elegí exactamente ${sceneCount} imágenes`);
            return;
        }
        // El contexto de la emergencia es lo que autoriza a decir algo concreto:
        // sin descripcion el guion no tiene de donde salir y saldria generico.
        // Se avisa y no se bloquea — un club que solo tiene fotos puede querer
        // publicar igual, y el guion en general sigue siendo cierto.
        if (isEmergency && !emergency.description.trim()) {
            toast.warning('Sin describir qué ocurrió, el guion habla en términos muy generales.');
        }
        setIsCreating(true);
        const toastId = toast.loading('Analizando las fotos y armando la narrativa...');
        try {
            const r = await fetch(`${API}/content-studio/reels`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    images: selectedMedia.map(m => ({ id: m.id, url: m.url })),
                    ...config,
                    engine: config.engine || undefined,
                    narration,
                    // El preset va DESPUÉS de `...config` para que no se lo pise
                    // una clave homónima: `config` se derrama entero y el orden
                    // decide quién gana.
                    preset,
                    // El contexto sólo viaja si el preset lo usa. Mandarlo
                    // siempre metería un objeto de emergencia en la `config` de
                    // un Reel corriente, donde no significa nada.
                    emergency: isEmergency ? emergency : undefined,
                    // El outro viaja aparte, no entra en `images`: no debe
                    // volver a pasar por la IA.
                    outro
                })
            });
            const data = await r.json();
            if (!r.ok) {
                toast.error(data.error || 'No se pudo iniciar el Reel', { id: toastId });
                return;
            }
            setReel(data);
            toast.success('Reel en producción. Podés seguir el avance acá.', { id: toastId });
        } catch {
            toast.error('Error de conexión', { id: toastId });
        } finally {
            setIsCreating(false);
        }
    };

    const patchScene = async (scene: ReelScene, body: Record<string, unknown>) => {
        if (!reel) return;
        setBusyScene(scene.id);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/scenes/${scene.id}`, {
                method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) { toast.error(data.error || 'No se pudo actualizar la escena'); return; }
            setReel(data);
            toast.success('Montaje actualizado');
        } catch { toast.error('Error de conexión'); } finally { setBusyScene(null); }
    };

    const regenerateScene = async (scene: ReelScene, body: Record<string, unknown> = {}) => {
        if (!reel) return;
        setBusyScene(scene.id);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/scenes/${scene.id}/regenerate`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) { toast.error(data.error || 'No se pudo regenerar la escena'); return; }
            setReel(data);
            toast.success('Escena en regeneración. Las otras dos se conservan.');
        } catch { toast.error('Error de conexión'); } finally { setBusyScene(null); }
    };

    const changeMusic = async (body: Record<string, unknown>) => {
        if (!reel) return;
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/music`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) { toast.error(data.error || 'No se pudo cambiar la música'); return; }
            setReel(data);
            toast.success('Música actualizada. Se está rehaciendo el montaje.');
        } catch { toast.error('Error de conexión'); }
    };

    const reRender = async () => {
        if (!reel) return;
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/render`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ qualityTier: config.qualityTier })
            });
            const data = await r.json();
            if (!r.ok) { toast.error(data.error || 'No se pudo relanzar el montaje'); return; }
            setReel(data);
            toast.success('Montaje relanzado');
        } catch { toast.error('Error de conexión'); }
    };

    const saveToLibrary = async () => {
        if (!reel) return;
        setSavingLibrary(true);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/library`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ force: reel.status !== 'ready' })
            });
            const data = await r.json();
            if (!r.ok) { toast.error(data.error || 'No se pudo guardar en la Biblioteca'); return; }
            setReel(data.reel);
            toast.success(data.alreadySaved ? 'Ya estaba en la Biblioteca' : 'Guardado en la Biblioteca');
        } catch { toast.error('Error de conexión'); } finally { setSavingLibrary(false); }
    };

    const startOver = () => { setReel(null); setSelectedMedia([]); setPreflight(null); };

    // ── Render ──

    const estimatedDuration = useMemo(() => {
        if (!reel) return null;
        return timelineDuration(
            reel.scenes.map(s => ({ durationSec: s.durationSec, transitionOut: s.transitionOut })),
            overlaps
        );
    }, [reel, overlaps]);

    if (reel) {
        return (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                <ReelHeader reel={reel} onStartOver={startOver} />

                {!isTerminal(reel.status)
                    ? <ProgressPanel reel={reel} />
                    : <PreviewPanel
                        reel={reel}
                        options={options}
                        busyScene={busyScene}
                        savingLibrary={savingLibrary}
                        estimatedDuration={estimatedDuration}
                        onPatchScene={patchScene}
                        onRegenerateScene={regenerateScene}
                        onSwapImage={setSwappingScene}
                        onChangeMusic={changeMusic}
                        onReRender={reRender}
                        onSaveLibrary={saveToLibrary}
                        onCopiesChanged={setReel}
                    />}

                {/* Sustituir la foto de una escena: se abre la Biblioteca con
                    una sola selección y al elegir se regenera SÓLO esa escena. */}
                <MediaPicker
                    isOpen={Boolean(swappingScene)}
                    maxSelection={1}
                    initialSelection={swappingScene?.sourceMediaId ? [swappingScene.sourceMediaId] : []}
                    onClose={() => setSwappingScene(null)}
                    onSelect={(items) => {
                        const pick = items[0];
                        const scene = swappingScene;
                        setSwappingScene(null);
                        if (pick && scene) {
                            regenerateScene(scene, { sourceImageUrl: pick.url, sourceMediaId: pick.id });
                        }
                    }}
                />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-8 flex flex-col gap-6">

                {/* Aviso de recuperación. Un Reel en curso no depende de que
                    esta pantalla esté abierta, así que al volver hay que
                    ENCONTRARLO — no volver a lanzarlo. */}
                <ActiveReelsBanner />

                {/* ── Qué clase de pieza (v4.783) ──
                    Va PRIMERO porque decide todo lo de abajo: cuántas fotos se
                    piden, qué formulario aparece y qué cuenta cada escena. Con
                    un solo preset disponible la tarjeta no se pinta: un
                    selector de una sola opción es ruido. */}
                {(options?.presets?.length ?? 0) > 1 && (
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <h3 className="text-lg font-black text-gray-900 mb-1">Tipo de pieza</h3>
                        <p className="text-sm text-gray-500 font-medium mb-5">
                            Define la estructura del Reel y cuántas fotos hacen falta.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {options!.presets!.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setPreset(p.id)}
                                    aria-pressed={preset === p.id}
                                    className={`text-left p-4 rounded-2xl border-2 transition-all ${
                                        preset === p.id
                                            ? 'border-indigo-500 bg-indigo-50/40'
                                            : 'border-gray-100 hover:border-indigo-200'
                                    }`}
                                >
                                    <span className="block text-sm font-black text-gray-900">{p.label}</span>
                                    <span className="block text-[11px] text-gray-500 mt-1 leading-snug">
                                        {p.description}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* La cantidad de fotos sólo se ofrece si el preset da a
                            elegir. Con una sola opción, un selector de un
                            elemento haría creer que hay una decisión que tomar. */}
                        {allowedCounts.length > 1 && (
                            <div className="mt-6">
                                <span className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">
                                    Cuántas fotografías
                                </span>
                                <div className="flex gap-2">
                                    {allowedCounts.map(n => (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setSceneCount(n)}
                                            aria-pressed={sceneCount === n}
                                            className={`flex-1 py-3 rounded-xl border-2 font-black text-sm transition-all ${
                                                sceneCount === n
                                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                    : 'border-gray-100 text-gray-500 hover:border-indigo-200'
                                            }`}
                                        >
                                            {n} fotos
                                            <span className="block text-[10px] font-bold text-gray-400 mt-0.5">
                                                ~{Math.round(targetTotalSecFor(preset, n))} s
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* La vía sin motor generativo se DICE, con su motivo.
                            Una foto que se mueve distinto de lo que el usuario
                            espera, sin explicación, se lee como un fallo. */}
                        {activePreset?.motionStyle === 'fotografico' && (
                            <div className="mt-5 flex gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-emerald-900 leading-relaxed">
                                    <strong>Las fotografías no se regeneran.</strong> Se anima el encuadre sobre la
                                    imagen original, así que rostros, daños y contexto quedan exactamente como
                                    fueron fotografiados. Cuesta cero créditos de video. Podés elegir animación con
                                    IA en las opciones avanzadas, aunque en una emergencia real reinterpreta la
                                    escena.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── El contexto de la emergencia ──
                    Antes de las fotos: lo que se escribe acá decide qué función
                    narrativa cumple cada una, así que pedirlo después obligaría
                    a repensar el orden ya elegido. */}
                {isEmergency && (
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <h3 className="text-lg font-black text-gray-900 mb-1">Qué pasó</h3>
                        <p className="text-sm text-gray-500 font-medium mb-5">
                            Con esto se escribe el guion, la voz en off y los textos del video.
                        </p>
                        <EmergencyForm
                            value={emergency}
                            onChange={setEmergency}
                            disasters={options?.emergency?.disasters}
                            needs={options?.emergency?.needs}
                            ctas={options?.emergency?.ctas}
                            disabled={isCreating}
                        />
                    </div>
                )}

                {/* Selección de imágenes */}
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-lg font-black text-gray-900">
                                {sceneCount === 3 ? 'Las tres fotos del Reel'
                                    : sceneCount === 4 ? 'Las cuatro fotos del Reel'
                                    : `Las ${sceneCount} fotos del Reel`}
                            </h3>
                            <p className="text-sm text-gray-500 font-medium">
                                Elegilas de la Biblioteca y ordenalas arrastrando. La IA hace el resto.
                            </p>
                        </div>
                        {/* ── Las DOS vías (v4.784) ──
                            Regla de v4.700: toda casilla de imagen ofrece subir
                            un archivo nuevo Y elegir uno ya cargado. Sin la
                            primera, usar una foto que no estuviera en la
                            Biblioteca obligaba a salir del módulo, subirla en
                            Multimedia y volver — el retroceso exacto que la
                            regla existe para evitar.

                            Van juntas y no en un menú: son dos gestos igual de
                            frecuentes, y esconder uno detrás de un desplegable
                            lo vuelve invisible. */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={IMAGE_ACCEPT}
                                multiple
                                className="hidden"
                                onChange={handleFilesChosen}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading || selectedMedia.length >= sceneCount}
                                title={selectedMedia.length >= sceneCount
                                    ? `Ya elegiste las ${sceneCount} fotos`
                                    : 'Subir fotos desde este dispositivo'}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-black text-xs hover:bg-emerald-100 transition-all border border-emerald-100/50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isUploading
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Upload className="w-4 h-4" />}
                                {isUploading ? 'Subiendo…' : 'Subir fotos'}
                            </button>
                            <button
                                onClick={() => setShowPicker(true)}
                                disabled={isUploading}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all border border-indigo-100/50 disabled:opacity-40"
                            >
                                <Plus className="w-4 h-4" />
                                {selectedMedia.length ? 'Cambiar fotos' : 'Elegir fotos'}
                            </button>
                        </div>
                    </div>

                    {selectedMedia.length === 0 ? (
                        <div
                            onClick={() => setShowPicker(true)}
                            className="aspect-[16/5] border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/10 transition-all"
                        >
                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                                <ImageIcon className="w-6 h-6 text-gray-300" />
                            </div>
                            <p className="text-sm text-gray-400 font-bold">Todavía no elegiste ninguna foto</p>
                            <p className="text-[10px] text-gray-300 font-black uppercase tracking-widest">
                                Hacen falta {sceneCount}
                            </p>
                        </div>
                    ) : (
                        <>
                            <Reorder.Group axis="y" values={selectedMedia} onReorder={setSelectedMedia} className="space-y-3">
                                {selectedMedia.map((item, i) => (
                                    <Reorder.Item
                                        key={item.id}
                                        value={item}
                                        className="flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100 group"
                                    >
                                        <div className="cursor-grab active:cursor-grabbing text-gray-300">
                                            <GripVertical className="w-5 h-5" />
                                        </div>
                                        <div className="w-16 h-16 rounded-xl overflow-hidden shadow-sm flex-shrink-0">
                                            <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-800 truncate">{item.filename}</p>
                                            {/* Con estructura narrativa, cada posición dice QUÉ
                                                cuenta. Es lo que convierte «ordená las fotos» en
                                                una decisión con criterio: sin el rótulo, quien
                                                arrastra no sabe que la tercera es el llamado a la
                                                acción. Sin estructura (`libre`) se conserva el
                                                texto de siempre. */}
                                            {roles[i] && roles[i].id !== 'libre' ? (
                                                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-0.5">
                                                    Escena {i + 1} · {roles[i].label}
                                                </p>
                                            ) : (
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                                                    Escena {i + 1} · la IA decide su duración
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => setSelectedMedia(prev => prev.filter(m => m.id !== item.id))}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </Reorder.Item>
                                ))}
                            </Reorder.Group>

                            {selectedMedia.length !== sceneCount && (
                                <p className="mt-4 text-xs font-bold text-amber-600 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                    {selectedMedia.length < sceneCount
                                        ? `Faltan ${sceneCount - selectedMedia.length} foto(s).`
                                        : `Sobran ${selectedMedia.length - sceneCount} foto(s).`}
                                </p>
                            )}

                            {/* El orden de arrastre es una propuesta: si el
                                estilo queda en automático, el director puede
                                reordenar. Decirlo evita la sorpresa. */}
                            {selectedMedia.length === sceneCount && (
                                <p className="mt-4 text-[11px] font-bold text-gray-400 flex items-start gap-2">
                                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                                    La IA analiza las tres fotos y puede reordenarlas para que la pieza abra, desarrolle y cierre. Podrás ver el orden final antes de descargar.
                                </p>
                            )}
                        </>
                    )}

                    {/* Avisos de la comprobación previa */}
                    {checking && (
                        <p className="mt-4 text-xs font-bold text-gray-400 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Revisando la calidad de las fotos...
                        </p>
                    )}
                    {options?.expansion?.available && selectedMedia.length === sceneCount && (
                        <p className="mt-4 text-[11px] font-bold text-indigo-500 flex items-start gap-2">
                            <Wand2 className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                            Las fotos que no estén en {config.format} se adaptan con IA generando el lienzo que falta, sin recortar.
                        </p>
                    )}
                    {preflight && preflight.warnings.length > 0 && (
                        <div className="mt-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-1.5">
                            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> Antes de gastar créditos
                            </p>
                            {preflight.warnings.map((w, i) => (
                                <p key={i} className="text-xs font-medium text-amber-800 leading-relaxed">{w}</p>
                            ))}
                        </div>
                    )}
                </div>

                {/* Clip de cierre (Outro) */}
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-lg font-black text-gray-900">Clip de cierre</h3>
                            <p className="text-sm text-gray-500 font-medium">
                                Se adjunta al final como clip independiente, sin volver a procesarse por IA.
                            </p>
                        </div>
                        <button
                            onClick={() => { setShowOutroPicker(true); fetchOutros(); }}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all border border-indigo-100/50 flex-shrink-0"
                        >
                            <Clapperboard className="w-4 h-4" />
                            {outro ? 'Cambiar outro' : 'Añadir outro'}
                        </button>
                    </div>

                    {!outro ? (
                        <div
                            onClick={() => { setShowOutroPicker(true); fetchOutros(); }}
                            className="border-2 border-dashed border-gray-100 rounded-2xl py-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/10 transition-all"
                        >
                            <Clapperboard className="w-8 h-8 text-gray-200" />
                            <p className="text-sm text-gray-400 font-bold">Sin clip de cierre</p>
                            <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">
                                Se generan en la pestaña Generador de Outros IA
                            </p>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                            <div className="w-16 h-16 rounded-xl overflow-hidden shadow-sm bg-black flex-shrink-0">
                                <img src={outro.posterUrl} alt="" className="w-full h-full object-cover opacity-70" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">{outro.title}</p>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5 flex items-center gap-2">
                                    Clip de {outro.durationSec ?? 5}s · {outro.format}
                                    {outro.hasAudio && <span className="inline-flex items-center gap-1 text-indigo-500"><Volume2 className="w-3 h-3" />Con voz</span>}
                                </p>
                            </div>
                            <button
                                onClick={() => setOutro(null)}
                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Quitar el clip de cierre"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Contexto estratégico — el mismo del Generador de
                    Publicaciones. Alimenta la narrativa del montaje, el copy y
                    el guion de la voz, no sólo el texto. */}
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <Target className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-black text-gray-900">Contexto de la publicación</h3>
                    </div>
                    <p className="text-[11px] text-gray-400 font-bold mb-6">
                        Lo mismo que en el Generador de Publicaciones. Cambia la narrativa del Reel, no sólo el texto.
                    </p>

                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-2">
                        Tipo de publicación (preajuste de IA)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
                        {(options?.context?.types || []).map(t => (
                            <button
                                key={t.id}
                                onClick={() => setConfig({ ...config, publicationType: t.id })}
                                title={`${t.tone} · ${t.focus}`}
                                className={`py-3 px-3 rounded-2xl text-[11px] font-black uppercase tracking-wide transition-all border ${
                                    config.publicationType === t.id
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20'
                                        : 'bg-white text-gray-400 border-gray-100 hover:border-indigo-200 hover:text-indigo-600'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <Select
                        label="Enfoque Rotary"
                        value={config.interestArea}
                        onChange={v => setConfig({ ...config, interestArea: v })}
                        options={(options?.context?.areas || []).map(a => ({ id: a.id, label: a.label }))}
                        hint={options?.context?.areas.find(a => a.id === config.interestArea)?.description}
                    />
                </div>

                {/* Narración IA */}
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <Mic className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-black text-gray-900">Narración IA</h3>
                        </div>
                        <button
                            onClick={() => setNarration({ ...narration, enabled: !narration.enabled })}
                            disabled={!options?.narration?.available}
                            className={`px-4 py-2 rounded-xl font-black text-xs transition-all border disabled:opacity-40 ${
                                narration.enabled
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'
                            }`}
                        >
                            {narration.enabled ? 'Activada' : 'Desactivada'}
                        </button>
                    </div>
                    <p className="text-[11px] text-gray-400 font-bold mb-6">
                        Un guion escrito para ser hablado, sincronizado con la duración exacta del Reel.
                    </p>

                    {!options?.narration?.available ? (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                            <p className="text-xs font-medium text-amber-800 leading-relaxed">
                                {options?.narration?.unavailableReason || 'Sin proveedor de voz configurado.'}
                            </p>
                        </div>
                    ) : narration.enabled && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Select
                                    label="Idioma y acento"
                                    value={narration.language}
                                    onChange={v => setNarration({ ...narration, language: v })}
                                    options={(options.narration.languages || []).map(l => ({ id: l.id, label: l.label }))}
                                />
                                <Select
                                    label="Estilo de narración"
                                    value={narration.style}
                                    onChange={v => setNarration({ ...narration, style: v })}
                                    options={(options.narration.styles || []).map(st => ({ id: st.id, label: st.label }))}
                                />
                                <Select
                                    label="Voz"
                                    value={narration.gender}
                                    onChange={v => setNarration({ ...narration, gender: v })}
                                    options={(options.narration.genders || []).map(g => ({ id: g.id, label: g.label }))}
                                />
                                <div className="space-y-2">
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">
                                        Velocidad · {narration.speed.toFixed(2)}×
                                    </label>
                                    <input
                                        type="range" min={0.85} max={1.15} step={0.05}
                                        value={narration.speed}
                                        onChange={e => setNarration({ ...narration, speed: Number(e.target.value) })}
                                        className="w-full accent-indigo-600"
                                    />
                                </div>
                            </div>

                            {/* Si el motor activo no elige acento, se dice. Prometer
                                «acento colombiano» con un motor que no lo controla
                                sería falso. */}
                            {options.narration.accentControlled === false && (
                                <p className="mt-4 text-[11px] font-bold text-amber-600 flex items-start gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                                    El motor activo ({options.narration.providers.find(p => p.isDefault)?.label}) no permite elegir el acento: el español sale neutro. Para acento colombiano real hace falta configurar ElevenLabs.
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* Ajustes opcionales */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <Settings2 className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-black text-gray-900">Movimiento</h3>
                        </div>
                        <p className="text-[11px] text-gray-400 font-bold mb-6">Opcional. En automático lo elige la IA por escena.</p>
                        <div className="space-y-6">
                            {/* Intensidad: cuántas acciones se le piden al motor.
                                Es lo que gobierna la CADENCIA — pedirle muchas
                                para cinco segundos las comprime y el clip se ve
                                acelerado. Por eso el control es de intensidad y
                                no de velocidad: la velocidad no se pide, se
                                obtiene no pidiendo de más. */}
                            <div>
                                <Select
                                    label="Movimiento natural de la escena"
                                    value={config.motionIntensity}
                                    onChange={v => setConfig({ ...config, motionIntensity: v })}
                                    options={options?.motionIntensities?.map(i => ({ id: i.id, label: i.label }))
                                        || [{ id: 'natural', label: 'Natural' }]}
                                    hint={options?.motionIntensities?.find(i => i.id === config.motionIntensity)?.description}
                                />
                                <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                                    La IA anima a las personas y los elementos de la fotografía. La cámara no se
                                    mueve: todo el movimiento sale de la escena.
                                </p>
                            </div>

                            {/* Preservación estricta de personas (v4.705).
                                Encendida por defecto en cuanto el análisis ve
                                personas. Fija el censo de la escena en el prompt,
                                baja sola la intensidad en grupos apretados y hace
                                que una persona inventada descalifique la escena.

                                Se puede apagar porque hay fotografías —un
                                paisaje, un plato, una fachada— donde no aplica y
                                donde limitar el movimiento sólo resta; en esas
                                el modo ya no actúa igualmente, pero quien quiera
                                animar a fondo un retrato debe poder decidirlo. */}
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.strictPeople !== false}
                                    onChange={e => setConfig({ ...config, strictPeople: e.target.checked })}
                                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span>
                                    <span className="block text-xs font-black text-gray-900">
                                        Preservación estricta de personas
                                    </span>
                                    <span className="block text-[11px] text-gray-500 leading-relaxed mt-0.5">
                                        En las fotografías con personas fija cuántas hay y quiénes son, mantiene
                                        tapado lo que la foto tapa y reduce el movimiento en los grupos apretados.
                                        Una escena que muestre a alguien que no está en la fotografía se regenera.
                                    </span>
                                </span>
                            </label>
                            <Select
                                label="Estilo de animación"
                                value={config.motionStyle}
                                onChange={v => setConfig({ ...config, motionStyle: v })}
                                options={[
                                    { id: AUTO, label: 'Automático (recomendado)' },
                                    ...(options?.motionStyles.map(s => ({ id: s.id, label: s.label })) || [])
                                ]}
                                hint={options?.motionStyles.find(s => s.id === config.motionStyle)?.description}
                            />
                            <Select
                                label="Transición entre escenas"
                                value={config.transition}
                                onChange={v => setConfig({ ...config, transition: v })}
                                options={[
                                    { id: AUTO, label: 'Automática (recomendado)' },
                                    ...(options?.transitions.map(t => ({ id: t.id, label: t.label })) || [])
                                ]}
                                hint={options?.transitions.find(t => t.id === config.transition)?.description}
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <Music className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-black text-gray-900">Música y salida</h3>
                        </div>
                        <p className="text-[11px] text-gray-400 font-bold mb-6">La banda sonora se genera según lo que detecte en las fotos.</p>
                        <div className="space-y-6">
                            <Select
                                label="Estilo musical"
                                value={config.withMusic ? config.musicStyle : 'mute'}
                                onChange={v => v === 'mute'
                                    ? setConfig({ ...config, withMusic: false })
                                    : setConfig({ ...config, withMusic: true, musicStyle: v })}
                                options={[
                                    { id: AUTO, label: 'Automático (recomendado)' },
                                    ...(options?.musicStyles.map(m => ({ id: m.id, label: m.label })) || []),
                                    { id: 'mute', label: 'Sin música' }
                                ]}
                            />
                            <Select
                                label="Calidad de exportación"
                                value={config.qualityTier}
                                onChange={v => setConfig({ ...config, qualityTier: v })}
                                options={(options?.formats.find(f => f.id === config.format)?.tiers || [])
                                    .map(t => ({ id: t.id, label: t.label }))}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Columna de exportación */}
            <div className="lg:col-span-4 lg:sticky lg:top-10 flex flex-col gap-6">
                <div className="bg-gray-900 rounded-[32px] p-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/40 via-transparent to-purple-950/20" />

                    <div className="relative aspect-[9/16] bg-black rounded-[24px] border border-gray-800 overflow-hidden flex flex-col items-center justify-center">
                        {selectedMedia.length > 0 ? (
                            <div className="relative w-full h-full grid grid-rows-3">
                                {selectedMedia.slice(0, sceneCount).map((m, i) => (
                                    <div key={m.id} className="relative overflow-hidden">
                                        <img src={m.url} alt="" className="w-full h-full object-cover opacity-60" />
                                        <span className="absolute top-2 left-2 text-[9px] font-black text-white/70 bg-black/50 px-2 py-0.5 rounded-full">
                                            ESCENA {i + 1}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <Film className="w-10 h-10 text-gray-700" />
                                <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest">Vista previa</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 space-y-4 relative z-10">
                        <div className="flex justify-between items-center text-white/60">
                            <span className="text-[10px] font-black uppercase tracking-widest">
                                {options?.formats.find(f => f.id === config.format)?.tiers.find(t => t.id === config.qualityTier)?.label || 'Full HD'}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest">~15 s · {config.format}</span>
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={selectedMedia.length !== sceneCount || isCreating}
                            className="w-full bg-white text-gray-900 py-4 rounded-2xl font-black text-lg hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-xl disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center gap-3"
                        >
                            {isCreating
                                ? <><Loader2 className="w-5 h-5 animate-spin" />Analizando...</>
                                : <><Sparkles className="w-5 h-5 text-indigo-600" />Renderizar Video</>}
                        </button>

                        {preflight && (
                            <p className="text-[9px] text-white/40 text-center font-bold tracking-tight px-2">
                                Consumo estimado: {preflight.creditEstimate} créditos
                                {options?.usage.limit ? ` · quedan ${options.usage.remaining} este mes` : ''}
                            </p>
                        )}

                        {/* El montaje es lo único que puede faltar del todo. Se
                            dice de frente acá, no al final del proceso. */}
                        {options && !options.render.available && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3">
                                <p className="text-[10px] font-bold text-amber-300 leading-relaxed">
                                    {options.render.unavailableReason}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <MediaPicker
                isOpen={showPicker}
                maxSelection={sceneCount}
                initialSelection={selectedMedia.map(m => m.id)}
                onClose={() => setShowPicker(false)}
                onSelect={setSelectedMedia}
            />

            {showOutroPicker && (
                <OutroPicker
                    outros={availableOutros}
                    loading={loadingOutros}
                    selectedId={outro?.id || null}
                    onClose={() => setShowOutroPicker(false)}
                    onPick={(o) => {
                        setOutro({
                            id: o.id, title: o.title, url: o.videoUrl!,
                            durationSec: o.durationSec, format: o.format,
                            hasAudio: o.hasAudio, posterUrl: o.sourceImageUrl
                        });
                        setShowOutroPicker(false);
                    }}
                />
            )}
        </div>
    );
};

// ─── Recuperación de Reels en curso ────────────────────────────────────────
//
// El render no depende de esta pantalla: corre en el servidor y lo empuja el
// cron aunque el usuario cierre el navegador. Por eso, al volver al creador, lo
// que corresponde no es relanzar nada sino AVISAR de lo que ya está en marcha.
// Sin este aviso, la reacción natural de quien no ve su Reel es volver a
// pedirlo — y pagar los créditos dos veces.
const ActiveReelsBanner: React.FC = () => {
    const [active, setActive] = useState<Reel[]>([]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const r = await fetch(`${API}/content-studio/reels/active`, { headers: authHeaders() });
                if (!r.ok) return;
                const data = await r.json();
                if (!cancelled) setActive(data.reels || []);
            } catch { /* el aviso es informativo: si falla, no molesta */ }
        };
        load();
        const id = window.setInterval(load, 10000);
        return () => { cancelled = true; window.clearInterval(id); };
    }, []);

    if (!active.length) return null;

    return (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
                <Loader2 className="w-5 h-5 text-sky-600 animate-spin flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-sky-900">
                        {active.length === 1
                            ? 'Hay un Reel generándose'
                            : `Hay ${active.length} Reels generándose`}
                    </p>
                    <p className="text-xs text-sky-800/80 mt-0.5">
                        Podés seguir trabajando, cambiar de módulo o cerrar el navegador: el proceso
                        continúa en el servidor. Lo encontrás en la pestaña <strong>Biblioteca</strong>.
                    </p>
                    <div className="mt-2.5 space-y-2">
                        {active.map(r => (
                            <div key={r.id} className="bg-white/70 rounded-xl px-3 py-2">
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="font-bold text-sky-900 truncate">{r.title}</span>
                                    <span className="text-sky-700 shrink-0 tabular-nums">
                                        {Math.round((r.progress || 0) * 100)}%
                                        {formatEta(r.etaSec) && ` · aprox. ${formatEta(r.etaSec)}`}
                                    </span>
                                </div>
                                <div className="mt-1 h-1.5 w-full rounded-full bg-sky-100 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-sky-500 transition-[width] duration-700 ease-out"
                                        style={{ width: `${Math.max(3, Math.round((r.progress || 0) * 100))}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-sky-700/80 mt-1">{r.statusLabel}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Piezas ────────────────────────────────────────────────────────────────

const Select: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { id: string; label: string }[];
    hint?: string;
}> = ({ label, value, onChange, options, hint }) => (
    <div className="space-y-2">
        <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">{label}</label>
        <select
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all font-sans"
            value={value}
            onChange={e => onChange(e.target.value)}
        >
            {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {hint && <p className="text-[11px] text-gray-400 font-medium leading-relaxed">{hint}</p>}
    </div>
);

const ReelHeader: React.FC<{ reel: Reel; onStartOver: () => void }> = ({ reel, onStartOver }) => (
    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
            <h3 className="text-lg font-black text-gray-900 truncate">{reel.title}</h3>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                {reel.engineLabel} · {reel.qualityLabel}
                {reel.renderProviderLabel ? ` · montaje en ${reel.renderProviderLabel}` : ''}
            </p>
        </div>
        <button
            onClick={onStartOver}
            className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-600 rounded-xl font-black text-xs hover:bg-gray-100 transition-all border border-gray-100 flex-shrink-0"
        >
            <Plus className="w-4 h-4" /> Nuevo Reel
        </button>
    </div>
);

// Barra de progreso por etapa. Las etapas son las del servidor, así que el
// número y el texto son los mismos en los dos lados.
const STAGES: { id: string; label: string }[] = [
    { id: 'analyzing', label: 'Analizando fotos' },
    { id: 'directing', label: 'Narrativa' },
    { id: 'expanding', label: 'Adaptando al formato' },
    { id: 'generating', label: 'Generando escenas y textos' },
    { id: 'scoring', label: 'Mezclando música' },
    { id: 'assembling', label: 'Montando Reel' },
    { id: 'validating', label: 'Exportando' }
];

const ProgressPanel: React.FC<{ reel: Reel }> = ({ reel }) => {
    const currentIndex = STAGES.findIndex(s => s.id === reel.status);
    return (
        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                <div>
                    <h3 className="font-black text-gray-900">{reel.statusLabel}</h3>
                    <p className="text-[11px] font-bold text-gray-400">
                        Podés cerrar esta pestaña: el Reel sigue generándose y lo encontrás en la lista.
                    </p>
                </div>
            </div>

            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-2">
                <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-700"
                    style={{ width: `${Math.round(reel.progress * 100)}%` }}
                />
            </div>
            <p className="text-right text-[10px] font-black text-gray-400 uppercase tracking-widest mb-8">
                {Math.round(reel.progress * 100)}%
            </p>

            <div className="flex flex-wrap gap-2 mb-8">
                {STAGES.map((s, i) => {
                    const done = currentIndex > i;
                    const active = currentIndex === i;
                    return (
                        <div
                            key={s.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${
                                done ? 'bg-emerald-50 text-emerald-600'
                                    : active ? 'bg-indigo-600 text-white'
                                        : 'bg-gray-50 text-gray-300'
                            }`}
                        >
                            {done ? <CheckCircle2 className="w-3 h-3" /> : active ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            {s.label}
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {reel.scenes.map(scene => (
                    <div key={scene.id} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="aspect-video bg-black relative">
                            <img src={scene.sourceImageUrl} alt="" className="w-full h-full object-cover opacity-50" />
                            <span className="absolute top-2 left-2 text-[9px] font-black text-white/80 bg-black/60 px-2 py-0.5 rounded-full">
                                ESCENA {scene.position + 1}
                            </span>
                        </div>
                        <div className="p-3">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                {scene.status === 'ready'
                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    : scene.status === 'error' || scene.status === 'needs_review'
                                        ? <AlertTriangle className="w-3 h-3 text-amber-500" />
                                        : <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
                                {scene.statusLabel}
                            </p>
                            <p className="text-[10px] font-bold text-gray-400 mt-1">
                                {scene.durationSec}s · {scene.styleLabel}
                            </p>
                            {scene.status === 'expanding' && (
                                <p className="text-[10px] font-bold text-indigo-500 mt-1 flex items-center gap-1">
                                    <Wand2 className="w-3 h-3" /> Adaptando imagen al formato Reel...
                                </p>
                            )}
                            {scene.expandedImageUrl && scene.status !== 'expanding' && (
                                <p className="text-[10px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Imagen adaptada mediante IA
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {reel.notes.length > 0 && <NoteList notes={reel.notes} />}
        </div>
    );
};

const NoteList: React.FC<{ notes: string[] }> = ({ notes }) => (
    <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-1.5">
        <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Ajustes aplicados
        </p>
        {notes.map((n, i) => (
            <p key={i} className="text-xs font-medium text-blue-800 leading-relaxed">{n}</p>
        ))}
    </div>
);

const PreviewPanel: React.FC<{
    reel: Reel;
    options: ReelOptions | null;
    busyScene: string | null;
    savingLibrary: boolean;
    estimatedDuration: number | null;
    onPatchScene: (s: ReelScene, body: Record<string, unknown>) => void;
    onRegenerateScene: (s: ReelScene, body?: Record<string, unknown>) => void;
    onSwapImage: (s: ReelScene) => void;
    onChangeMusic: (body: Record<string, unknown>) => void;
    onReRender: () => void;
    onSaveLibrary: () => void;
    onCopiesChanged: (r: Reel) => void;
}> = ({
    reel, options, busyScene, savingLibrary, estimatedDuration,
    onPatchScene, onRegenerateScene, onSwapImage, onChangeMusic, onReRender, onSaveLibrary,
    onCopiesChanged
}) => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Reproductor */}
        <div className="lg:col-span-5">
            <div className="bg-gray-900 rounded-[32px] p-6 shadow-2xl">
                <div className="aspect-[9/16] bg-black rounded-[24px] overflow-hidden border border-gray-800">
                    {reel.videoUrl ? (
                        <video src={reel.videoUrl} poster={reel.posterUrl || undefined} controls playsInline className="w-full h-full object-contain" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                            <AlertTriangle className="w-10 h-10 text-amber-500" />
                            <p className="text-white/70 text-xs font-bold leading-relaxed">
                                {reel.statusDetail || 'El montaje no se completó.'}
                            </p>
                        </div>
                    )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 text-white/50">
                    <Metric label="Duración" value={formatSeconds(reel.durationSec)} />
                    <Metric label="Resolución" value={reel.width ? `${reel.width}×${reel.height}` : '—'} />
                    <Metric label="Tasa de bits" value={reel.bitrateKbps ? `${(reel.bitrateKbps / 1000).toFixed(1)} Mbps` : '—'} />
                    <Metric label="Peso" value={formatBytes(reel.sizeBytes)} />
                </div>

                <div className="mt-5 space-y-2">
                    {reel.videoUrl && (
                        <a
                            href={reel.videoUrl}
                            download
                            className="w-full bg-white text-gray-900 py-3.5 rounded-2xl font-black text-sm hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4" /> Descargar Reel
                        </a>
                    )}
                    <button
                        onClick={onSaveLibrary}
                        disabled={!reel.videoUrl || savingLibrary || Boolean(reel.mediaId)}
                        className="w-full bg-white/10 text-white py-3 rounded-2xl font-black text-xs hover:bg-white/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                        {savingLibrary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {reel.mediaId ? 'Ya está en la Biblioteca' : 'Guardar en la Biblioteca'}
                    </button>
                    <button
                        onClick={onReRender}
                        className="w-full bg-white/5 text-white/70 py-3 rounded-2xl font-black text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" /> Rehacer el montaje
                    </button>
                </div>
            </div>
        </div>

        {/* Línea de tiempo y controles */}
        <div className="lg:col-span-7 space-y-6">
            {/* Informe de calidad y fidelidad */}
            <div className={`rounded-3xl border p-6 ${
                reel.status === 'ready' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-amber-50/50 border-amber-100'
            }`}>
                <div className="flex items-center gap-3 mb-3">
                    <ShieldCheck className={`w-5 h-5 ${reel.status === 'ready' ? 'text-emerald-600' : 'text-amber-600'}`} />
                    <h3 className="font-black text-gray-900">{reel.statusLabel}</h3>
                    {reel.fidelitySummary.framesChecked ? (
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            {reel.fidelitySummary.framesChecked} fotogramas comprobados
                        </span>
                    ) : null}
                </div>
                {/* Se dice exactamente qué se comprobó y qué no. Dar por buena
                    una escena que nadie pudo mirar sería peor que decirlo. */}
                <p className="text-xs font-medium text-gray-600 leading-relaxed">{reel.fidelitySummary.label}</p>
                {reel.quality?.failures?.map((f, i) => (
                    <p key={i} className="text-xs font-medium text-amber-800 mt-1.5 leading-relaxed">· {f}</p>
                ))}
                {reel.quality?.warnings?.map((w, i) => (
                    <p key={i} className="text-xs font-medium text-gray-500 mt-1.5 leading-relaxed">· {w}</p>
                ))}
                {reel.direction?.rationale && (
                    <p className="text-[11px] font-medium text-gray-400 mt-3 leading-relaxed italic">{reel.direction.rationale}</p>
                )}
            </div>

            {/* Música */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <Music className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-gray-900">Banda sonora</h3>
                    {reel.musicStyleLabel && (
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            {reel.musicStyleLabel}
                        </span>
                    )}
                </div>
                {reel.musicUrl
                    ? <audio src={reel.musicUrl} controls className="w-full h-10 mb-4" />
                    : <p className="text-xs font-bold text-gray-400 mb-4">El Reel se montó sin música.</p>}

                <div className="flex flex-wrap gap-2">
                    {options?.musicStyles.map(m => (
                        <button
                            key={m.id}
                            onClick={() => onChangeMusic({ style: m.id })}
                            className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-50 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 border border-gray-100 transition-all"
                        >
                            {m.label}
                        </button>
                    ))}
                    <button
                        onClick={() => onChangeMusic({ mute: true })}
                        className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 border border-gray-100 transition-all flex items-center gap-1"
                    >
                        <VolumeX className="w-3 h-3" /> Sin música
                    </button>
                </div>
            </div>

            {/* Escenas */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                        <Film className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-black text-gray-900">Línea de tiempo</h3>
                    </div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {estimatedDuration ?? reel.durationSec}s
                    </span>
                </div>
                <p className="text-[11px] font-bold text-gray-400 mb-5">
                    Cambiar la duración rehace sólo el montaje. Regenerar vuelve a pasar esa foto por la IA.
                </p>

                <div className="space-y-3">
                    {reel.scenes.map(scene => (
                        <SceneRow
                            key={scene.id}
                            scene={scene}
                            options={options}
                            busy={busyScene === scene.id}
                            onPatch={onPatchScene}
                            onRegenerate={onRegenerateScene}
                            onSwapImage={onSwapImage}
                        />
                    ))}
                </div>
            </div>

            <NarrationPanel reel={reel} options={options} onChanged={onCopiesChanged} />

            <CopyPanel reel={reel} onChanged={onCopiesChanged} />

            {reel.notes.length > 0 && <NoteList notes={reel.notes} />}
        </div>
    </div>
);

// ─── Narración ─────────────────────────────────────────────────────────────
//
// Regenerar la voz NO vuelve a renderizar el video: sólo rehace la mezcla. Es
// lo que permite probar idiomas, acentos y estilos sin gastar créditos de
// video.
const NarrationPanel: React.FC<{ reel: Reel; options: ReelOptions | null; onChanged: (r: Reel) => void }> = ({ reel, options, onChanged }) => {
    const n = reel.narration;
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [form, setForm] = useState({
        language: n?.language || options?.narration?.defaultLanguage || 'es-CO',
        style: n?.style || options?.narration?.defaultStyle || 'institucional',
        gender: n?.gender || 'female',
        speed: n?.speed ?? 1
    });

    useEffect(() => {
        if (n) setForm({ language: n.language, style: n.style, gender: n.gender, speed: n.speed });
    }, [n?.id]);

    const regenerate = async (overrides: Record<string, unknown> = {}) => {
        setBusy(true);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/narration`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ ...form, ...overrides })
            });
            const data = await r.json();
            if (!r.ok) { toast.error(data.error || 'No se pudo generar la narración'); return; }
            onChanged(data);
            setEditing(false);
            toast.success('Narración lista. Se está rehaciendo la mezcla, sin regenerar el video.');
        } catch { toast.error('Error de conexión'); } finally { setBusy(false); }
    };

    if (!options?.narration?.available) return null;

    return (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <Mic className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-gray-900">Narración</h3>
                    {n && <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{n.languageLabel} · {n.styleLabel}</span>}
                    {n && n.version > 1 && (
                        <span className="text-[10px] font-bold text-gray-400 flex items-center gap-0.5">
                            <History className="w-3 h-3" /> v{n.version}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => regenerate()}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 transition-all flex items-center gap-1 disabled:opacity-40"
                >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {n ? 'Regenerar voz' : 'Generar narración'}
                </button>
            </div>

            {!n ? (
                <p className="text-xs font-bold text-gray-400 mt-2">
                    Este Reel se montó sin voz. Generarla no vuelve a renderizar el video.
                </p>
            ) : (
                <>
                    {/* La sincronía se MUESTRA con su número, no se promete. */}
                    <p className={`text-[11px] font-bold mt-2 flex items-start gap-1.5 ${
                        n.withinTolerance ? 'text-emerald-600' : 'text-amber-700'
                    }`}>
                        <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                        {n.summary}
                    </p>
                    {n.accentControlled === false && (
                        <p className="text-[10px] font-bold text-gray-400 mt-1 pl-5">
                            {n.ttsProviderLabel} no permite elegir el acento: el español sale neutro.
                        </p>
                    )}

                    {n.audioUrl && <audio src={n.audioUrl} controls className="w-full h-10 mt-3" />}

                    <div className="mt-3">
                        {editing ? (
                            <div className="space-y-2">
                                <textarea
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 resize-none h-28 font-sans"
                                    value={draft}
                                    onChange={e => setDraft(e.target.value)}
                                />
                                <p className="text-[10px] font-bold text-gray-400">
                                    {draft.trim().split(/\s+/).filter(Boolean).length} palabras · el guion escrito a mano se sintetiza tal cual, sin reescribirlo para que encaje.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => regenerate({ script: draft })}
                                        disabled={busy || !draft.trim()}
                                        className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs hover:bg-indigo-700 transition-all disabled:opacity-40"
                                    >
                                        Sintetizar este guion
                                    </button>
                                    <button onClick={() => setEditing(false)} className="px-4 py-2 bg-white text-gray-500 rounded-xl font-black text-xs border border-gray-200">
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-3">
                                <p className="text-sm font-medium text-gray-700 leading-relaxed">{n.script}</p>
                                <button
                                    onClick={() => { setDraft(n.script); setEditing(true); }}
                                    className="mt-2 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-indigo-600 flex items-center gap-1"
                                >
                                    <Pencil className="w-3 h-3" /> Editar el guion
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Cambiar cualquiera de estos regenera SÓLO la voz. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <Select
                    label="Idioma"
                    value={form.language}
                    onChange={v => { setForm({ ...form, language: v }); regenerate({ language: v }); }}
                    options={(options.narration.languages || []).map(l => ({ id: l.id, label: l.label }))}
                />
                <Select
                    label="Estilo"
                    value={form.style}
                    onChange={v => { setForm({ ...form, style: v }); regenerate({ style: v }); }}
                    options={(options.narration.styles || []).map(st => ({ id: st.id, label: st.label }))}
                />
                <Select
                    label="Voz"
                    value={form.gender}
                    onChange={v => { setForm({ ...form, gender: v }); regenerate({ gender: v }); }}
                    options={(options.narration.genders || []).map(g => ({ id: g.id, label: g.label }))}
                />
            </div>
        </div>
    );
};

// ─── Copies de publicación ─────────────────────────────────────────────────
//
// Se generan solos mientras el video se renderiza, así que cuando esta pantalla
// aparece ya están escritos. Cada uno se puede copiar, editar y regenerar por
// separado: insistir sobre el texto de TikTok no debe perder el de Instagram.
const CopyPanel: React.FC<{ reel: Reel; onChanged: (r: Reel) => void }> = ({ reel, onChanged }) => {
    const [busy, setBusy] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState<{ description: string; cta: string; hashtags: string }>({ description: '', cta: '', hashtags: '' });

    const copies = reel.copies || [];

    const refresh = async () => {
        const r = await fetch(`${API}/content-studio/reels/${reel.id}`, { headers: authHeaders() });
        if (r.ok) onChanged(await r.json());
    };

    // `navigator.clipboard` falla sin contexto seguro o sin permiso; el textarea
    // oculto es el respaldo que funciona en todos los navegadores.
    const toClipboard = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
        }
        setCopied(key);
        toast.success('Copiado al portapapeles');
        window.setTimeout(() => setCopied(c => (c === key ? null : c)), 2000);
    };

    const regenerate = async (platform?: string) => {
        setBusy(platform || 'all');
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/copies/regenerate`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ platform, locale: 'es' })
            });
            const data = await r.json();
            if (!r.ok) { toast.error(data.error || 'No se pudo regenerar el texto'); return; }
            await refresh();
            toast.success(platform ? 'Texto regenerado' : 'Textos regenerados');
        } catch { toast.error('Error de conexión'); } finally { setBusy(null); }
    };

    const saveEdit = async (platform: string) => {
        setBusy(platform);
        try {
            const r = await fetch(`${API}/content-studio/reels/${reel.id}/copies`, {
                method: 'PATCH', headers: authHeaders(),
                body: JSON.stringify({
                    platform, locale: 'es',
                    description: draft.description,
                    cta: draft.cta,
                    hashtags: draft.hashtags.split(/[\s,]+/).filter(Boolean)
                })
            });
            const data = await r.json();
            if (!r.ok) { toast.error(data.error || 'No se pudo guardar'); return; }
            setEditing(null);
            await refresh();
            toast.success('Guardado como versión nueva');
        } catch { toast.error('Error de conexión'); } finally { setBusy(null); }
    };

    const exportAs = (format: string) => {
        const token = localStorage.getItem('rotary_token');
        // La descarga va por el propio navegador, así que el token viaja en la
        // query: un `fetch` con cabecera no dispara el diálogo de guardar.
        window.open(`${API}/content-studio/reels/${reel.id}/export?format=${format}&locale=es&token=${token}`, '_blank');
    };

    if (!copies.length) {
        return (
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-indigo-600" />
                        <div>
                            <h3 className="font-black text-gray-900">Textos de publicación</h3>
                            <p className="text-[11px] font-bold text-gray-400">Todavía no se generaron.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => regenerate()}
                        disabled={busy === 'all'}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all border border-indigo-100/50 disabled:opacity-40"
                    >
                        {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Generar textos
                    </button>
                </div>
            </div>
        );
    }

    const meta = copies[0];

    return (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-gray-900">Textos de publicación</h3>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {['txt', 'csv', 'json', 'zip'].map(f => (
                        <button
                            key={f}
                            onClick={() => exportAs(f)}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-gray-50 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 border border-gray-100 transition-all flex items-center gap-1"
                        >
                            <FileDown className="w-3 h-3" /> {f}
                        </button>
                    ))}
                    <button
                        onClick={() => regenerate()}
                        disabled={busy === 'all'}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 transition-all flex items-center gap-1 disabled:opacity-40"
                    >
                        {busy === 'all' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Todos
                    </button>
                </div>
            </div>

            {/* Metadatos comunes a la pieza. Se muestran una vez, no por
                plataforma: son del Reel, no del texto. */}
            <div className="flex flex-wrap gap-1.5 mb-5 mt-2">
                {meta.category && <Chip>{meta.category}</Chip>}
                {meta.marketingGoal && <Chip>{meta.marketingGoal}</Chip>}
                {meta.audience && <Chip>{meta.audience}</Chip>}
                {meta.keywords?.slice(0, 5).map(k => <Chip key={k} muted>{k}</Chip>)}
            </div>

            <div className="space-y-3">
                {copies.map(c => (
                    <CopyCard
                        key={c.id}
                        copy={c}
                        busy={busy === c.platform}
                        copied={copied === c.id}
                        editing={editing === c.platform}
                        draft={draft}
                        setDraft={setDraft}
                        onCopy={() => toClipboard(c.fullText || '', c.id)}
                        onRegenerate={() => regenerate(c.platform)}
                        onStartEdit={() => {
                            setEditing(c.platform);
                            setDraft({
                                description: c.description || '',
                                cta: c.cta || '',
                                hashtags: (c.hashtags || []).join(' ')
                            });
                        }}
                        onCancelEdit={() => setEditing(null)}
                        onSaveEdit={() => saveEdit(c.platform)}
                    />
                ))}
            </div>
        </div>
    );
};

const Chip: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted }) => (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
        muted ? 'bg-gray-50 text-gray-400' : 'bg-indigo-50 text-indigo-600'
    }`}>{children}</span>
);

const CopyCard: React.FC<{
    copy: ReelCopy;
    busy: boolean;
    copied: boolean;
    editing: boolean;
    draft: { description: string; cta: string; hashtags: string };
    setDraft: (d: { description: string; cta: string; hashtags: string }) => void;
    onCopy: () => void;
    onRegenerate: () => void;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onSaveEdit: () => void;
}> = ({ copy, busy, copied, editing, draft, setDraft, onCopy, onRegenerate, onStartEdit, onCancelEdit, onSaveEdit }) => {
    // El contador se compara contra el límite real de la plataforma: pasarse es
    // un texto que la red va a cortar sola.
    const over = copy.maxChars != null && (copy.charCount || 0) > copy.maxChars;

    return (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-gray-800">{copy.platformLabel}</p>
                    <span className={`text-[10px] font-bold ${over ? 'text-red-500' : 'text-gray-400'}`}>
                        {copy.charCount}/{copy.maxChars}
                    </span>
                    {copy.version > 1 && (
                        <span className="text-[10px] font-bold text-gray-400 flex items-center gap-0.5">
                            <History className="w-3 h-3" /> v{copy.version}
                        </span>
                    )}
                    {copy.source === 'manual' && <Chip muted>editado</Chip>}
                </div>
                <div className="flex items-center gap-1">
                    <IconBtn onClick={onCopy} title="Copiar todo el texto">
                        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </IconBtn>
                    <IconBtn onClick={editing ? onCancelEdit : onStartEdit} title="Editar">
                        {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    </IconBtn>
                    <IconBtn onClick={onRegenerate} disabled={busy} title="Regenerar sólo este texto">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </IconBtn>
                </div>
            </div>

            {editing ? (
                <div className="space-y-2">
                    <textarea
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 resize-none h-28 font-sans"
                        value={draft.description}
                        onChange={e => setDraft({ ...draft, description: e.target.value })}
                        placeholder="Descripción"
                    />
                    <input
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 font-sans"
                        value={draft.cta}
                        onChange={e => setDraft({ ...draft, cta: e.target.value })}
                        placeholder="Llamado a la acción"
                    />
                    <input
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 font-sans"
                        value={draft.hashtags}
                        onChange={e => setDraft({ ...draft, hashtags: e.target.value })}
                        placeholder="#hashtags separados por espacio"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={onSaveEdit}
                            disabled={busy}
                            className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs hover:bg-indigo-700 transition-all disabled:opacity-40"
                        >
                            Guardar como versión nueva
                        </button>
                        <button onClick={onCancelEdit} className="px-4 py-2 bg-white text-gray-500 rounded-xl font-black text-xs border border-gray-200">
                            Cancelar
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <p className="text-sm font-medium text-gray-700 whitespace-pre-line leading-relaxed">{copy.description}</p>
                    {copy.cta && <p className="text-sm font-bold text-gray-800 mt-2">{copy.cta}</p>}
                    {Boolean(copy.hashtags?.length) && (
                        <p className="text-xs font-bold text-indigo-500 mt-2 break-words">{copy.hashtags.join(' ')}</p>
                    )}
                </>
            )}
        </div>
    );
};

const IconBtn: React.FC<{ onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode }> = ({ onClick, disabled, title, children }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all disabled:opacity-40"
    >
        {children}
    </button>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div>
        <p className="text-[9px] font-black uppercase tracking-widest opacity-60">{label}</p>
        <p className="text-sm font-black text-white/90">{value}</p>
    </div>
);

const SceneRow: React.FC<{
    scene: ReelScene;
    options: ReelOptions | null;
    busy: boolean;
    onPatch: (s: ReelScene, body: Record<string, unknown>) => void;
    onRegenerate: (s: ReelScene, body?: Record<string, unknown>) => void;
    onSwapImage: (s: ReelScene) => void;
}> = ({ scene, options, busy, onPatch, onRegenerate, onSwapImage }) => {
    const [duration, setDuration] = useState(scene.durationSec ?? 5);
    useEffect(() => { setDuration(scene.durationSec ?? 5); }, [scene.durationSec]);

    // No se puede usar más metraje del que el clip tiene: alargar más allá de
    // lo generado exige regenerar, y eso es otro botón.
    const maxUsable = Math.min(MAX_SCENE_SEC, scene.generatedDurationSec ?? MAX_SCENE_SEC);
    const fidelityFailed = scene.fidelity?.state === 'failed';

    return (
        <div className={`rounded-2xl border p-3 ${fidelityFailed ? 'bg-amber-50/40 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-start gap-3">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-black flex-shrink-0 relative">
                    {scene.videoUrl
                        ? <video src={scene.videoUrl} muted loop playsInline
                            onMouseEnter={e => e.currentTarget.play()}
                            onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                            poster={scene.posterUrl || scene.sourceImageUrl}
                            className="w-full h-full object-cover" />
                        : <img src={scene.animationSourceUrl || scene.sourceImageUrl} alt="" className="w-full h-full object-cover opacity-60" />}
                    <span className="absolute top-1 left-1 text-[8px] font-black text-white/80 bg-black/60 px-1.5 py-0.5 rounded-full">
                        {scene.position + 1}
                    </span>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-black text-gray-800">{scene.styleLabel}</p>
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{scene.transitionLabel}</p>
                    </div>
                    {scene.analysis?.summary && (
                        <p className="text-[11px] font-medium text-gray-500 mt-0.5 truncate">{scene.analysis.summary}</p>
                    )}

                    {/* Adaptación del lienzo. Sólo se dice algo cuando pasó
                        algo: una foto que ya venía vertical no genera ruido. */}
                    {scene.expandedImageUrl && (
                        <p className="text-[10px] font-bold text-indigo-600 mt-1 flex items-start gap-1">
                            <Wand2 className="w-3 h-3 flex-shrink-0 mt-px" />
                            Imagen adaptada mediante IA
                            {scene.expansionReport?.verification?.preservation != null &&
                                ` · ${Math.round(scene.expansionReport.verification.preservation * 100)} % del original conservado`}
                            {scene.expansionReport?.generatedFraction != null &&
                                ` · ${Math.round(scene.expansionReport.generatedFraction * 100)} % de lienzo nuevo`}
                        </p>
                    )}
                    {/* Una adaptación RECHAZADA se dice con su consecuencia, no
                        sólo con su motivo. «La imagen es demasiado apaisada» no
                        le explica a nadie que va a perder a las personas de los
                        bordes; hasta v4.713 ni siquiera se llegaba a pintar,
                        porque el rechazo no traía la marca `failed` y este
                        bloque no lo veía: el aviso se escribía en la base y no
                        lo leía nadie. */}
                    {scene.expansionReport?.failed && (scene.expansionReport.reason || scene.expansionReport.consequence) && (
                        <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50/70 p-2">
                            <p className="text-[10px] font-black text-amber-800 uppercase tracking-wide flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                La fotografía no se pudo llevar al formato vertical
                            </p>
                            {scene.expansionReport.consequence && (
                                <p className="text-[10px] font-bold text-amber-900 mt-1">{scene.expansionReport.consequence}</p>
                            )}
                            {scene.expansionReport.reason && (
                                <p className="text-[10px] text-amber-800 mt-1 leading-relaxed">{scene.expansionReport.reason}</p>
                            )}
                        </div>
                    )}

                    {/* Fidelidad. Tres estados y se nombra CÓMO se comprobó: la
                        señal estructural sola no ve un logotipo redibujado en su
                        mismo sitio, y eso el usuario tiene que poder saberlo. */}
                    {scene.fidelity && (
                        <div className="mt-1.5">
                            <p className={`text-[10px] font-bold flex items-start gap-1 ${
                                scene.fidelity.state === 'ok' ? 'text-emerald-600'
                                    : scene.fidelity.state === 'failed' ? 'text-amber-700' : 'text-gray-400'
                            }`}>
                                <ShieldCheck className="w-3 h-3 flex-shrink-0 mt-px" />
                                {scene.fidelity.state === 'ok'
                                    ? `Fidelidad verificada · ${scene.fidelity.score}/10 · ${scene.fidelity.framesChecked ?? 0} fotogramas`
                                    : scene.fidelity.state === 'failed'
                                        ? (scene.fidelity.issues[0] || scene.fidelity.reason)
                                        : (scene.fidelity.reason || 'Fidelidad no comprobada')}
                            </p>
                            {/* Una escena resuelta sin IA se dice con todas las
                                letras: hasta v4.675 se veía como cualquier otra
                                y no había forma de saber por qué esa se movía
                                «de un lado a otro» y las demás no. */}
                            {scene.engine === 'still_motion' && (
                                <p className="text-[10px] font-bold text-indigo-600 mt-1 flex items-start gap-1">
                                    <Wand2 className="w-3 h-3 flex-shrink-0 mt-px" />
                                    Sin IA: es la fotografía con un desplazamiento de encuadre. Identidad intacta,
                                    pero la escena no se anima.
                                </p>
                            )}
                            {/* Nivel de vida: responde a una pregunta DISTINTA de
                                la fidelidad. Una escena puede conservar la foto
                                perfectamente y estar congelada — es el defecto
                                que motivó la medida, así que se muestra aparte
                                y no mezclado con la nota de fidelidad. */}
                            {scene.fidelity.lifeScore != null && (
                                <p className={`text-[10px] font-bold mt-0.5 pl-4 ${
                                    scene.fidelity.lifeScore >= 60 ? 'text-emerald-600'
                                        : scene.fidelity.lifeScore >= 25 ? 'text-amber-600' : 'text-red-600'
                                }`}>
                                    Nivel de vida: {scene.fidelity.lifeScore} %
                                    {scene.fidelity.lifeScore < 25 && ' — la escena quedó prácticamente estática'}
                                </p>
                            )}
                            {scene.fidelity.state === 'ok' && scene.fidelity.lifeScore == null && (
                                <p className="text-[9px] font-bold text-gray-400 mt-0.5 pl-4">
                                    Nivel de vida sin medir: hace falta el modelo de visión para distinguir
                                    el movimiento de las personas del movimiento de encuadre.
                                </p>
                            )}
                            {scene.fidelity.method === 'sólo estructural' && (
                                <p className="text-[9px] font-bold text-gray-400 mt-0.5 pl-4">
                                    Comparación estructural únicamente: no se pudo consultar el modelo de visión.
                                </p>
                            )}
                            {/* Fidelidad humana (v4.705). Va aparte de la nota
                                porque responde a otra pregunta: si en el clip
                                hay alguien que no está en la fotografía. Una
                                persona inventada puede estar perfectamente
                                dibujada, así que la nota general no la ve. */}
                            <ScenePeopleCheck people={scene.fidelity.people} />
                            {/* Los logotipos, mirados de cerca. El control general
                                reduce la escena tres veces y a esa escala un estampado
                                de camiseta es ilegible — por eso su veredicto sobre la
                                marca no servía. */}
                            <SceneBrandCheck brand={scene.fidelity.brand} />
                            {/* Por qué esta escena se anima menos que las otras.
                                Sin decirlo, una escena más quieta se lee como
                                un fallo del motor. */}
                            {scene.analysis?.intensityReason && (
                                <p className="text-[9px] font-bold text-indigo-600 mt-1 pl-4">
                                    {scene.analysis.intensityReason}
                                </p>
                            )}
                            {/* Los fotogramas comparados, para poder revisar el
                                veredicto en vez de tener que creerlo. */}
                            {Boolean(scene.fidelity.frames?.length) && (
                                <div className="flex gap-1 mt-1.5 pl-4">
                                    {scene.fidelity.frames!.map((f, i) => (
                                        <a
                                            key={i}
                                            href={f.comparisonUrl || f.frameUrl || undefined}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={`${f.position} · ${f.at}s${f.score != null ? ` · ${f.score}/10` : ''}`}
                                            className="w-8 h-8 rounded overflow-hidden border border-gray-200 hover:border-indigo-400 transition-all flex-shrink-0"
                                        >
                                            {f.frameUrl
                                                ? <img src={f.frameUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                                : <span className="block w-full h-full bg-gray-100" />}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {scene.statusDetail && scene.status !== 'ready' && (
                        <p className="text-[10px] font-bold text-amber-700 mt-1">{scene.statusDetail}</p>
                    )}

                    {/* Duración: decisión de montaje, no regenera el clip. */}
                    <div className="flex items-center gap-2 mt-2">
                        <input
                            type="range"
                            min={MIN_SCENE_SEC}
                            max={maxUsable}
                            step={0.5}
                            value={duration}
                            onChange={e => setDuration(Number(e.target.value))}
                            onMouseUp={() => duration !== scene.durationSec && onPatch(scene, { durationSec: duration })}
                            onTouchEnd={() => duration !== scene.durationSec && onPatch(scene, { durationSec: duration })}
                            className="flex-1 accent-indigo-600"
                            disabled={busy || !scene.videoUrl}
                        />
                        <span className="text-[10px] font-black text-gray-500 w-10 text-right">{duration}s</span>
                    </div>
                </div>

                <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                        onClick={() => onRegenerate(scene)}
                        disabled={busy}
                        title="Regenerar sólo esta escena"
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-40"
                    >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => onSwapImage(scene)}
                        disabled={busy}
                        title="Sustituir la fotografía de esta escena"
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-40"
                    >
                        <ImageIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Cambiar el estilo regenera: el movimiento está dentro del clip. */}
            {options && (
                <div className="flex flex-wrap gap-1.5 mt-3 sm:pl-[92px]">
                    {options.motionStyles.map(s => (
                        <button
                            key={s.id}
                            onClick={() => onRegenerate(scene, { style: s.id })}
                            disabled={busy}
                            title={s.description}
                            className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-40 ${
                                scene.style === s.id
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white text-gray-400 hover:text-indigo-600 border border-gray-100'
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const OutroPicker: React.FC<{
    outros: Outro[];
    loading: boolean;
    selectedId: string | null;
    onClose: () => void;
    onPick: (o: Outro) => void;
}> = ({ outros, loading, selectedId, onClose, onPick }) => (
    <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
    >
        <div
            className="bg-white w-full max-w-3xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
        >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                    <h3 className="text-xl font-black text-gray-900">Elegí el clip de cierre</h3>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                        Sólo aparecen los outros que pasaron la validación de calidad
                    </p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                    <X className="w-5 h-5 text-gray-400" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                        <p className="text-gray-400 font-bold text-sm">Cargando outros...</p>
                    </div>
                ) : outros.length === 0 ? (
                    <div className="text-center py-16">
                        <Clapperboard className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                        <p className="text-gray-400 font-bold">Todavía no hay outros listos</p>
                        <p className="text-[11px] text-gray-300 mt-1 font-bold">
                            Creá uno en la pestaña "Generador de Outros IA"
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {outros.map(o => (
                            <button
                                key={o.id}
                                onClick={() => onPick(o)}
                                className={`group relative rounded-2xl overflow-hidden border-2 text-left transition-all ${
                                    selectedId === o.id ? 'border-indigo-600 ring-4 ring-indigo-600/10' : 'border-gray-100 hover:border-indigo-200'
                                }`}
                            >
                                <div className="aspect-[9/16] max-h-48 bg-black">
                                    <img src={o.sourceImageUrl} alt="" className="w-full h-full object-cover opacity-60" loading="lazy" />
                                </div>
                                {selectedId === o.id && (
                                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                    </div>
                                )}
                                <div className="p-3 bg-white">
                                    <p className="text-xs font-black text-gray-800 line-clamp-2 leading-tight">{o.title}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">
                                        {o.durationSec ?? 5}s · {o.format} · {o.hasAudio ? 'con voz' : 'sin voz'}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    </div>
);

export default VideoCreator;
