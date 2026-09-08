import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Loader2, X, Sparkles, Wand2, GripVertical, Maximize2, Trash2, Replace,
    Coins, Clock, Music, Mic, Type as TypeIcon, AlertTriangle, Check, Info, Film,
} from 'lucide-react';
import { toast } from 'sonner';
import { fmtSeconds, SLOT_TONE } from '../../../lib/submissionReelSpec';

// ════════════════════════════════════════════════════════════════════════════
// PREPARAR REEL — el asistente que se abre ANTES de gastar (v4.1012)
//
// ⚠️ NADA DE LO QUE SE HACE ACÁ CONSUME CRÉDITOS DE VIDEO. Elegir fotografías,
// reordenarlas, cambiar la duración, escribir el guion y elegir la música son
// escrituras de un documento; lo único que llama al motor es «Confirmar y
// generar Reel», que es el último botón y pide su confirmación.
//
// ⚠️ Y EL ASISTENTE NO DECIDE NADA. Qué duración se puede pedir con este
// material, cuánto va a durar de verdad la pieza, si el plan es válido y
// cuántos créditos va a costar lo resuelve el SERVIDOR y llega en `planner`.
// Con dos cálculos, el resumen diría una cosa y el motor haría otra — y lo que
// se separaría es cuánto se le cobra a alguien (la lección del calendario de la
// Distribución, v4.864, y del período de la Bóveda, v4.849).
// ════════════════════════════════════════════════════════════════════════════

export interface PrepMaterial { fileId: string; kind: 'image' | 'video'; filename?: string | null; inLibrary: boolean; url?: string | null; sortOrder: number }
export interface PrepSelItem { fileId: string; slot: string; slotLabel: string; score?: number; reason?: string }
export interface PrepPlanner {
    plan: { durationSec: number; perScene: number[] | null; narrationMode: string; narrationScript: string; music: string; onScreenText: boolean; confirmed: boolean; confirmedBy?: string | null };
    durationOptions: { sec: number; label: string; available: boolean; finalSec: number; perSceneSec: number | null; note: string | null; recommended: boolean }[];
    timing: { perScene: number[]; clips: number[]; finalSec: number; targetSec: number; notes: string[]; range: { min: number; max: number; ceiling: number; overlap: number } };
    canGenerate: boolean;
    errors: string[];
    warnings: string[];
    summary: {
        images: number; durationSec: number; format: string; scenes: number; engineLabel?: string | null;
        narration: { enabled: boolean; mode: string; label: string; hasScript: boolean };
        music: { enabled: boolean; id: string; label: string };
        onScreenText: { enabled: boolean; available: boolean; reason: string };
        credits: { total: number; scenes: number; perScene: number };
        creditsNote: string;
    };
}
export interface PrepCatalogs {
    durations: number[];
    defaultDuration: number;
    narrationModes: { id: string; label: string; help: string }[];
    narrationScriptMax: number;
    music: { id: string; label: string; mood?: string | null }[];
    onScreenText: { available: boolean; reason: string; alternative: string };
    engineLabel?: string | null;
}

interface Props {
    open: boolean;
    onClose: () => void;
    material: PrepMaterial[];
    selection: PrepSelItem[];
    planner: PrepPlanner;
    catalogs: PrepCatalogs;
    limits: { min: number; max: number };
    storyboard?: { hook?: string; scenes?: { line: string }[]; cta?: string } | null;
    busy: boolean;
    alreadyGenerated: boolean;
    /** Cada una es una petición al servidor. NINGUNA gasta, salvo `confirmar`. */
    onSavePlan: (patch: Record<string, unknown>) => Promise<unknown>;
    onSaveSelection: (fileIds: string[]) => Promise<unknown>;
    onReorder: (fileIds: string[] | null, auto: boolean) => Promise<unknown>;
    onSuggest: () => Promise<unknown>;
    onConfirm: () => Promise<unknown>;
}

const Chip: React.FC<{ children: React.ReactNode; tone?: string }> = ({ children, tone = 'bg-gray-100 text-gray-600' }) => (
    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide ${tone}`}>{children}</span>
);

const PrepareReelModal: React.FC<Props> = ({
    open, onClose, material, selection, planner, catalogs, limits, storyboard,
    busy, alreadyGenerated, onSavePlan, onSaveSelection, onReorder, onSuggest, onConfirm,
}) => {
    const fotos = useMemo(() => material.filter(m => m.kind === 'image' && m.inLibrary), [material]);
    const porId = useMemo(() => new Map(material.map(m => [m.fileId, m])), [material]);

    const [ampliada, setAmpliada] = useState<string | null>(null);
    const [reemplazando, setReemplazando] = useState<string | null>(null);
    const [guion, setGuion] = useState(planner.plan.narrationScript || '');
    const [confirmando, setConfirmando] = useState(false);
    const arrastrando = useRef<number | null>(null);
    const [sobre, setSobre] = useState<number | null>(null);

    // El guion se edita en local y se guarda al salir del campo: guardar por
    // pulsación sería una petición por letra.
    useEffect(() => { setGuion(planner.plan.narrationScript || ''); }, [planner.plan.narrationScript]);

    // Escape cierra. Un modal del que sólo se sale con su propia cruz deja
    // atrapado a quien lo abrió por error (la regla del desplegable de v4.941).
    useEffect(() => {
        if (!open) return;
        const h = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (ampliada) { setAmpliada(null); return; }
            onClose();
        };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [open, onClose, ampliada]);

    const ids = useMemo(() => selection.map(s => s.fileId), [selection]);

    const quitar = useCallback((fileId: string) => {
        // ⚠️ QUITAR DEL REEL NO BORRA NADA. El archivo sigue en la solicitud y en
        // la Biblioteca: lo único que cambia es que esta pieza no lo usa.
        const nuevos = ids.filter(x => x !== fileId);
        if (nuevos.length < limits.min) {
            toast.error(`El Reel necesita al menos ${limits.min} fotografías: quitá otra o agregá una antes.`);
            return;
        }
        onSaveSelection(nuevos);
    }, [ids, limits.min, onSaveSelection]);

    const agregar = useCallback((fileId: string) => {
        if (ids.includes(fileId)) return;
        if (reemplazando) {
            onSaveSelection(ids.map(x => (x === reemplazando ? fileId : x)));
            setReemplazando(null);
            return;
        }
        if (ids.length >= limits.max) {
            toast.error(`El Reel admite ${limits.max} fotografías como máximo. Quitá una para poder agregar otra.`);
            return;
        }
        onSaveSelection([...ids, fileId]);
    }, [ids, limits.max, onSaveSelection, reemplazando]);

    const soltar = useCallback((destino: number) => {
        const origen = arrastrando.current;
        arrastrando.current = null;
        setSobre(null);
        if (origen === null || origen === destino) return;
        const orden = [...ids];
        const [movida] = orden.splice(origen, 1);
        orden.splice(destino, 0, movida);
        onReorder(orden, false);
    }, [ids, onReorder]);

    if (!open) return null;

    const { plan, durationOptions, timing, summary } = planner;
    const faltan = Math.max(0, limits.min - selection.length);

    return (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Preparar Reel">
            <div className="w-full max-w-5xl my-6 bg-white rounded-2xl shadow-2xl overflow-hidden">
                {/* ── Cabecera ── */}
                <div className="px-5 py-4 bg-gradient-to-r from-fuchsia-50 to-white border-b border-gray-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <Film className="w-5 h-5 text-fuchsia-600 shrink-0" />
                        <div className="min-w-0">
                            <h2 className="text-sm font-black text-gray-900">Preparar Reel</h2>
                            <p className="text-[11px] text-gray-500 truncate">
                                Revisá qué se va a generar. Nada de esto gasta créditos: se gastan al confirmar.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0" aria-label="Cerrar">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
                    {/* ══ 1. Las fotografías ══ */}
                    <section>
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">1 · Fotografías del Reel</p>
                                <Chip tone={selection.length >= limits.min ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}>
                                    {selection.length} de {limits.max} seleccionadas
                                </Chip>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => onSuggest()} disabled={busy}
                                    className="px-2.5 py-1.5 rounded-lg border-2 border-fuchsia-200 text-[11px] font-black text-fuchsia-700 hover:bg-fuchsia-50 disabled:opacity-40 flex items-center gap-1.5">
                                    <Wand2 className="w-3.5 h-3.5" /> Sugerir mejores imágenes con IA
                                </button>
                                <button onClick={() => onReorder(null, true)} disabled={busy || selection.length < 2}
                                    className="px-2.5 py-1.5 rounded-lg border-2 border-gray-200 text-[11px] font-black text-gray-700 hover:border-gray-300 disabled:opacity-40 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5" /> Orden automático con IA
                                </button>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mb-3">
                            La propuesta sale del análisis que ya se hizo para el artículo —nitidez, rostros, repetidas—, así que no
                            cuesta ninguna llamada nueva. Es <b>editable</b>: arrastrá para reordenar, quitá o reemplazá lo que quieras.
                        </p>

                        {faltan > 0 && (
                            <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900">
                                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                                Faltan <b>{faltan}</b> fotografía(s) para poder generar: el Reel se arma con entre {limits.min} y {limits.max}.
                            </div>
                        )}

                        {/* La línea de tiempo: escena 1 → escena 2 → … */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {selection.map((it, i) => {
                                const m = porId.get(it.fileId);
                                const seg = timing.perScene?.[i];
                                return (
                                    <div key={it.fileId}
                                        draggable={!busy}
                                        onDragStart={() => { arrastrando.current = i; }}
                                        onDragOver={(e) => { e.preventDefault(); setSobre(i); }}
                                        onDragLeave={() => setSobre(s => (s === i ? null : s))}
                                        onDrop={(e) => { e.preventDefault(); soltar(i); }}
                                        onDragEnd={() => { arrastrando.current = null; setSobre(null); }}
                                        className={`relative rounded-xl border-2 overflow-hidden bg-white ${sobre === i ? 'border-fuchsia-500' : 'border-gray-200'}`}>
                                        <div className="relative">
                                            {m?.url
                                                ? <img src={m.url} alt={m.filename || ''} className="w-full aspect-[9/16] object-cover" />
                                                : <div className="w-full aspect-[9/16] bg-gray-100" />}
                                            <span className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/75 text-white text-[11px] font-black flex items-center justify-center">{i + 1}</span>
                                            <span className="absolute top-1.5 right-1.5 p-1 rounded bg-black/50 text-white cursor-grab" title="Arrastrar para reordenar">
                                                <GripVertical className="w-3.5 h-3.5" />
                                            </span>
                                            {Number.isFinite(seg) && (
                                                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">{fmtSeconds(seg)}</span>
                                            )}
                                        </div>
                                        <div className="p-1.5">
                                            <Chip tone={SLOT_TONE[it.slot] || SLOT_TONE.libre}>{it.slotLabel}</Chip>
                                            <div className="mt-1.5 flex items-center gap-1">
                                                <button onClick={() => setAmpliada(m?.url || null)} disabled={!m?.url}
                                                    className="p-1 rounded text-gray-400 hover:text-gray-800 disabled:opacity-30" title="Ampliar" aria-label={`Ampliar ${m?.filename || 'fotografía'}`}>
                                                    <Maximize2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => setReemplazando(r => (r === it.fileId ? null : it.fileId))} disabled={busy}
                                                    className={`p-1 rounded ${reemplazando === it.fileId ? 'text-fuchsia-600 bg-fuchsia-50' : 'text-gray-400 hover:text-gray-800'}`}
                                                    title="Reemplazar por otra" aria-label={`Reemplazar ${m?.filename || 'fotografía'}`}>
                                                    <Replace className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => quitar(it.fileId)} disabled={busy}
                                                    className="p-1 rounded text-gray-400 hover:text-red-600" title="Quitar del Reel (no se borra de la solicitud)"
                                                    aria-label={`Quitar del Reel ${m?.filename || 'fotografía'}`}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* El resto del material de la solicitud */}
                        {fotos.length > selection.length && (
                            <div className="mt-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2">
                                    {reemplazando ? 'Elegí con cuál reemplazarla' : `Otras fotografías de la solicitud (${fotos.length - selection.length})`}
                                </p>
                                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 max-h-56 overflow-y-auto pr-1">
                                    {fotos.filter(m => !ids.includes(m.fileId)).map(m => (
                                        <button key={m.fileId} type="button" onClick={() => agregar(m.fileId)} disabled={busy}
                                            aria-label={`Agregar al Reel ${m.filename || 'fotografía'}`}
                                            className="relative rounded-lg overflow-hidden border-2 border-transparent hover:border-fuchsia-400 disabled:opacity-40">
                                            {m.url
                                                ? <img src={m.url} alt="" className="w-full aspect-square object-cover" />
                                                : <div className="w-full aspect-square bg-gray-100" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* ══ 2. Duración ══ */}
                    <section>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> 2 · Duración
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {durationOptions.map(o => (
                                <button key={o.sec} type="button"
                                    onClick={() => o.available && onSavePlan({ durationSec: o.sec, perScene: null })}
                                    disabled={busy || !o.available}
                                    title={o.note || undefined}
                                    className={`px-3 py-2 rounded-xl border-2 text-left ${
                                        plan.durationSec === o.sec && o.available ? 'border-fuchsia-500 bg-fuchsia-50'
                                            : o.available ? 'border-gray-200 hover:border-gray-300'
                                                : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'}`}>
                                    <span className="block text-xs font-black text-gray-900">{o.label}</span>
                                    <span className="block text-[10px] text-gray-500">
                                        {o.available ? `da ${fmtSeconds(o.finalSec)}` : 'no alcanzable'}
                                        {o.recommended && o.available ? ' · recomendada' : ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {/* ⚠️ LA DURACIÓN REAL SE DICE. «Aproximada» no es licencia para
                            callar el número: el motor entrega clips de una longitud fija
                            y los fundidos solapan. */}
                        {timing.notes.map((n, i) => (
                            <p key={i} className="mt-2 text-[10px] text-amber-700 flex items-start gap-1">
                                <Info className="w-3 h-3 mt-0.5 shrink-0" /> {n}
                            </p>
                        ))}

                        {selection.length > 0 && (
                            <div className="mt-3 rounded-xl border border-gray-100 p-3">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2">Duración de cada escena</p>
                                <div className="flex flex-wrap gap-2">
                                    {selection.map((it, i) => (
                                        <label key={it.fileId} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                                            <span className="text-gray-400 font-bold">{i + 1}</span>
                                            <input
                                                type="number" step="0.5" min={timing.range?.min ? undefined : undefined}
                                                defaultValue={timing.perScene?.[i] ?? ''}
                                                disabled={busy}
                                                onBlur={(e) => {
                                                    const v = Number(e.target.value);
                                                    if (!Number.isFinite(v) || v <= 0) return;
                                                    const nuevas = (timing.perScene || []).slice();
                                                    nuevas[i] = v;
                                                    onSavePlan({ perScene: nuevas });
                                                }}
                                                className="w-16 px-2 py-1 rounded-lg border border-gray-200 text-[11px]" />
                                            <span className="text-gray-400">s</span>
                                        </label>
                                    ))}
                                    {plan.perScene && (
                                        <button onClick={() => onSavePlan({ perScene: null })} disabled={busy}
                                            className="text-[11px] font-bold text-rotary-blue hover:underline">Repartir parejo</button>
                                    )}
                                </div>
                                <p className="mt-1.5 text-[10px] text-gray-400">
                                    Cada escena se acota a lo que el motor puede entregar ({timing.range?.ceiling} s como máximo por escena
                                    {catalogs.engineLabel ? ` con ${catalogs.engineLabel}` : ''}). La pieza montada dura <b>{fmtSeconds(timing.finalSec)}</b>.
                                </p>
                            </div>
                        )}
                    </section>

                    {/* ══ 3. Voz en off ══ */}
                    <section>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1">
                            <Mic className="w-3.5 h-3.5" /> 3 · Voz en off
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {catalogs.narrationModes.map(m => (
                                <button key={m.id} type="button" onClick={() => onSavePlan({ narrationMode: m.id })} disabled={busy}
                                    title={m.help}
                                    className={`px-3 py-2 rounded-xl border-2 text-xs font-bold ${
                                        plan.narrationMode === m.id ? 'border-fuchsia-500 bg-fuchsia-50 text-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                        <p className="mt-1.5 text-[10px] text-gray-500">
                            {catalogs.narrationModes.find(m => m.id === plan.narrationMode)?.help}
                        </p>
                        {plan.narrationMode === 'manual' && (
                            <div className="mt-2">
                                <textarea
                                    value={guion}
                                    maxLength={catalogs.narrationScriptMax}
                                    onChange={(e) => setGuion(e.target.value)}
                                    onBlur={() => { if (guion !== plan.narrationScript) onSavePlan({ narrationScript: guion }); }}
                                    rows={4}
                                    placeholder="Escribí acá lo que se va a escuchar. Se lee en voz alta: sin hashtags, sin emojis y sin «link en la bio»."
                                    className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-xs focus:border-fuchsia-400 outline-none" />
                                <p className="text-[10px] text-gray-400">{guion.length} / {catalogs.narrationScriptMax} caracteres · se guarda al salir del campo</p>
                            </div>
                        )}
                        {plan.narrationMode === 'auto' && storyboard?.scenes?.length ? (
                            <div className="mt-2 rounded-xl bg-gray-50 border border-gray-100 p-3">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Lo que va a contar</p>
                                {storyboard.hook && <p className="text-[11px] font-bold text-gray-800">{storyboard.hook}</p>}
                                <ol className="mt-1 space-y-0.5">
                                    {storyboard.scenes.map((s, i) => (
                                        <li key={i} className="text-[11px] text-gray-600"><b className="text-gray-400">{i + 1}.</b> {s.line}</li>
                                    ))}
                                </ol>
                                <p className="mt-1.5 text-[10px] text-gray-400">
                                    El guion hablado se escribe con este arco y se AJUSTA a la duración real de la pieza midiendo el audio.
                                    Para escribirlo palabra por palabra, elegí «Editar guion».
                                </p>
                            </div>
                        ) : null}
                    </section>

                    {/* ══ 4. Música ══ */}
                    <section>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1">
                            <Music className="w-3.5 h-3.5" /> 4 · Música de fondo
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {catalogs.music.map(m => (
                                <button key={m.id} type="button" onClick={() => onSavePlan({ music: m.id })} disabled={busy}
                                    className={`px-3 py-1.5 rounded-lg border-2 text-[11px] font-bold ${
                                        plan.music === m.id ? 'border-fuchsia-500 bg-fuchsia-50 text-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                        <p className="mt-1.5 text-[10px] text-gray-400">
                            La pista se adapta a la duración de la pieza y cierra con un fundido de salida: nunca se corta en seco.
                        </p>
                    </section>

                    {/* ══ 5. Texto en pantalla — DECLARADO Y NO DISPONIBLE ══ */}
                    <section>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1">
                            <TypeIcon className="w-3.5 h-3.5" /> 5 · Texto en pantalla
                        </p>
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-lg bg-gray-200 text-gray-600 text-[10px] font-black uppercase">No disponible</span>
                                <span className="text-[11px] font-bold text-gray-700">Rótulos sobre el video</span>
                            </div>
                            {/* ⚠️ SE DICE EL MOTIVO Y LA ALTERNATIVA, no se esconde el
                                control. Un interruptor que se puede encender y devuelve
                                cuadritos es peor que uno apagado con su explicación. */}
                            <p className="mt-1.5 text-[11px] text-gray-600">{catalogs.onScreenText.reason}</p>
                            <p className="mt-1 text-[10px] text-gray-500">{catalogs.onScreenText.alternative}</p>
                        </div>
                    </section>

                    {/* ══ 6. Resumen ══ */}
                    <section className="rounded-2xl border-2 border-fuchsia-100 bg-fuchsia-50/40 p-4">
                        <p className="text-[10px] font-black text-fuchsia-700 uppercase tracking-[0.15em] mb-2">Resumen del Reel</p>
                        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
                            <div><dt className="text-gray-500">Imágenes</dt><dd className="font-black text-gray-900">{summary.images}</dd></div>
                            <div><dt className="text-gray-500">Duración real</dt><dd className="font-black text-gray-900">{fmtSeconds(summary.durationSec)}</dd></div>
                            <div><dt className="text-gray-500">Formato</dt><dd className="font-black text-gray-900">{summary.format} · 1080×1920</dd></div>
                            <div><dt className="text-gray-500">Escenas animadas</dt><dd className="font-black text-gray-900">{summary.scenes}</dd></div>
                            <div><dt className="text-gray-500">Voz en off</dt><dd className="font-black text-gray-900">{summary.narration.enabled ? summary.narration.label : 'Sin voz'}</dd></div>
                            <div><dt className="text-gray-500">Música</dt><dd className="font-black text-gray-900">{summary.music.label}</dd></div>
                            <div><dt className="text-gray-500">Texto en pantalla</dt><dd className="font-black text-gray-900">No</dd></div>
                            <div className="col-span-2">
                                <dt className="text-gray-500">Consumo estimado</dt>
                                <dd className="font-black text-gray-900 flex items-center gap-1">
                                    <Coins className="w-3.5 h-3.5 text-amber-500" /> {summary.credits.total} créditos
                                </dd>
                            </div>
                        </dl>
                        <p className="mt-2 text-[10px] text-gray-500">{summary.creditsNote}</p>
                        <p className="mt-1 text-[10px] text-gray-500">
                            Las fotografías apaisadas se adaptan al formato vertical <b>completando el lienzo con IA</b>, no recortándolas:
                            rostros, logotipos y textos se conservan. La conservación se <b>mide</b> y una adaptación que no llegue al umbral se rehace sola.
                        </p>
                        {planner.warnings.map((w, i) => (
                            <p key={i} className="mt-1.5 text-[10px] text-amber-700 flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w}
                            </p>
                        ))}
                        {planner.errors.map((e, i) => (
                            <p key={i} className="mt-1.5 text-[10px] text-red-700 flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {e}
                            </p>
                        ))}
                    </section>
                </div>

                {/* ── El pie: el único botón que gasta ── */}
                <div className="px-5 py-4 border-t border-gray-100 bg-white flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[10px] text-gray-400 max-w-md">
                        {alreadyGenerated
                            ? 'Este Reel ya se generó: los cambios quedan guardados y se aplican creando una versión nueva.'
                            : 'Hasta acá no se gastó ni un crédito de video. El siguiente botón sí los gasta.'}
                    </p>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="px-3 py-2.5 rounded-xl border-2 border-gray-200 text-xs font-black text-gray-600 hover:border-gray-300">
                            Cerrar
                        </button>
                        {!alreadyGenerated && (
                            <button
                                onClick={async () => {
                                    if (!confirmando) { setConfirmando(true); return; }
                                    setConfirmando(false);
                                    await onConfirm();
                                }}
                                disabled={busy || !planner.canGenerate}
                                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide text-white flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                                    confirmando ? 'bg-red-600 hover:bg-red-700' : 'bg-fuchsia-600 hover:bg-fuchsia-700'}`}>
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmando ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                                {/* La confirmación DICE qué va a pasar, en vez de preguntar
                                    si estás seguro: lo que hay que poder revisar es el hecho. */}
                                {confirmando
                                    ? `Sí: generar ${summary.scenes} escenas · ${summary.credits.total} créditos`
                                    : 'Confirmar y generar Reel'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Ampliar una fotografía ── */}
            {ampliada && (
                <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-6" onClick={() => setAmpliada(null)}>
                    <img src={ampliada} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
                    <button className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white" aria-label="Cerrar la vista ampliada">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default PrepareReelModal;
