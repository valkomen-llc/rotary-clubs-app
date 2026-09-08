import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Loader2, Film, Sparkles, RefreshCw, Check, AlertTriangle, Image as ImageIcon,
    Clapperboard, Coins, X, Play, ExternalLink, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { reelStateChip, reelStateHelp, reelIsWorking, REEL_NETWORKS, fmtSeconds } from '../../../lib/submissionReelSpec';

// ════════════════════════════════════════════════════════════════════════════
// El REEL PARA REDES de una solicitud — v4.1006
//
// La SEGUNDA salida de una Solicitud de Contenido, al lado del artículo. Va
// dentro de la misma ficha porque la trazabilidad que el pedido describe es una
// sola: solicitud → material → artículo → Reel, todo en un mismo sitio.
//
// Lo que se ve acá lo DECIDE el servidor: las etapas con su desenlace, la
// selección de fotografías con su motivo, los créditos estimados y los estados
// a los que se puede pasar. Este componente pinta y pide.
//
// ⚠️ EL REEL SE EDITA EN EL ESTUDIO DE CONTENIDO. «Abrir en el Estudio» lleva a
// la Biblioteca de Reels, que es donde ya se cambian escenas, música, voz y
// copies. Un segundo editor de Reels sería el módulo duplicado que este pedido
// prohíbe expresamente.
// ════════════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

interface Material { fileId: string; kind: 'image' | 'video'; filename?: string | null; inLibrary: boolean; url?: string | null; sortOrder: number }
interface Stage { id: string; label: string; optional: boolean; status: string; error?: string | null; note?: string | null }
interface SelItem { fileId: string; slot: string; slotLabel: string; score?: number; reason?: string }
interface Scene { id: string; position: number; status: string; statusDetail?: string | null; durationSec?: number | null; videoUrl?: string | null; posterUrl?: string | null }
interface Vista {
    submission: { id: string; status: string; title?: string; club?: string };
    material: Material[];
    folder?: { id: string; name: string } | null;
    limits: { min: number; max: number };
    contentModes: { id: string; label: string; available: boolean; help: string }[];
    article: null | { id: string; status: string; postId?: string | null; title?: string | null };
    autoEnabled: boolean;
    reel: null | {
        id: string; status: string; statusLabel: string; statusDetail?: string | null; working: boolean;
        stages: Stage[]; lastError?: string | null; contentMode: string; contentModeLabel: string;
        classification: { images?: number; videos?: number; invalid?: number; privateFiles?: number; analyzed?: number };
        selection: { source?: string; items?: SelItem[]; discarded?: { fileId: string; reason: string }[]; degraded?: boolean };
        storyboard: { hook?: string; closing?: string; cta?: string; summary?: string; scenes?: { line: string }[]; factIssues?: string[]; durationSec?: number };
        versionNumber: number; creditsEstimated: number; reelProjectId?: string | null;
        nextStates: { id: string; label: string }[];
    };
    project?: null | {
        id: string; status: string; statusDetail?: string | null; videoUrl?: string | null; posterUrl?: string | null;
        durationSec?: number | null; format?: string; notes: string[]; scenes: Scene[];
        scenesReady: number; scenesTotal: number; editUrl: string;
    };
    versions: { id: string; versionNumber: number; isCurrent: boolean; status: string }[];
    estimate: null | { scenes: number; durationSec: number; total: number };
    note?: string | null;
}

interface Props { campaignId: string; submissionId: string; onChanged?: () => void }

const leer = async (r: Response) => {
    const texto = await r.text();
    let data: any;
    try { data = JSON.parse(texto); } catch { throw new Error(`El servidor respondió ${r.status} con ${r.headers.get('content-type') || 'contenido desconocido'} en vez de JSON.`); }
    if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);
    return data;
};

const SubmissionReelPanel: React.FC<Props> = ({ campaignId, submissionId, onChanged }) => {
    const base = `${API}/contribution-campaigns/${campaignId}/submissions/${submissionId}/reel`;
    const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });
    const [vista, setVista] = useState<Vista | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [eligiendo, setEligiendo] = useState(false);
    const [seleccion, setSeleccion] = useState<string[]>([]);
    const avanzando = useRef(false);

    const cargar = useCallback(async () => {
        try {
            const r = await fetch(base, { headers: { Authorization: `Bearer ${token()}` } });
            setVista(await leer(r));
            setError(null);
        } catch (e: any) { setError(e?.message || 'No se pudo cargar el Reel.'); }
    }, [base]);

    useEffect(() => { setVista(null); cargar(); }, [cargar]);

    // ── El sondeo ──
    //
    // SÓLO existe mientras hay trabajo: con el Reel terminado el efecto se
    // desmonta y no se consulta más (la regla del Creador de Reels, v4.670).
    // Las otras dos vías —el cron cada minuto y el botón— llaman al MISMO
    // `advance`, y el reclamo de la fila impide que dos hagan la misma etapa.
    const trabajando = Boolean(vista?.reel && reelIsWorking(vista.reel.status));
    useEffect(() => {
        if (!trabajando) return;
        let vivo = true;
        const tic = async () => {
            if (avanzando.current || !vivo) return;
            avanzando.current = true;
            try {
                const r = await fetch(`${base}/advance`, { method: 'POST', headers: headers() });
                if (vivo && r.ok) setVista(await r.json());
            } catch { /* el cron sigue avanzando por su cuenta */ }
            finally { avanzando.current = false; }
        };
        const id = setInterval(tic, 4000);
        tic();
        return () => { vivo = false; clearInterval(id); };
    }, [trabajando, base]);

    const pedir = async (ruta: string, init: RequestInit, exito: string) => {
        setOcupado(true);
        try {
            const r = await fetch(`${base}${ruta}`, { ...init, headers: headers() });
            const data = await leer(r);
            setVista(data);
            if (data?.note) toast.info(data.note, { duration: 8000 });
            else toast.success(exito);
            onChanged?.();
            return data;
        } catch (e: any) { toast.error(e?.message || 'No se pudo completar la acción.'); return null; }
        finally { setOcupado(false); }
    };

    const generar = () => pedir('/generate', { method: 'POST' }, 'El Reel se está preparando.');
    const reintentar = (stage?: string) => pedir('/retry', { method: 'POST', body: JSON.stringify({ stage: stage || '' }) }, 'Reintentando.');
    const cambiarEstado = (to: string, reason = '') => pedir('/status', { method: 'POST', body: JSON.stringify({ to, reason }) }, 'Estado actualizado.');
    const guardarSeleccion = async () => {
        const r = await pedir('/selection', { method: 'PUT', body: JSON.stringify({ fileIds: seleccion }) }, 'Selección guardada.');
        if (r) setEligiendo(false);
    };
    const nuevaVersion = () => {
        if (!confirm('Se va a generar un Reel NUEVO con las escenas de video que eso implica. El Reel actual se conserva como versión anterior. ¿Seguir?')) return;
        return pedir('/version', { method: 'POST' }, 'Nueva versión en marcha.');
    };

    if (error) {
        return (
            <div className="rounded-2xl border-2 border-red-100 bg-red-50/50 p-4">
                <p className="text-[11px] font-black text-red-700 uppercase tracking-wider mb-1">Reel para redes</p>
                <p className="text-xs text-red-700">{error}</p>
                <button onClick={cargar} className="mt-2 text-[11px] font-bold text-red-700 underline">Reintentar</button>
            </div>
        );
    }
    if (!vista) {
        return (
            <div className="rounded-2xl border-2 border-gray-100 p-4 flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Cargando el Reel…</span>
            </div>
        );
    }

    const { reel, project, material, limits } = vista;
    const fotos = material.filter(m => m.kind === 'image');
    const fotosListas = fotos.filter(m => m.inLibrary);
    const porId = new Map(material.map(m => [m.fileId, m]));
    const elegidas = reel?.selection?.items || [];

    const abrirSelector = () => {
        setSeleccion(elegidas.length ? elegidas.map(i => i.fileId) : fotosListas.slice(0, limits.max).map(m => m.fileId));
        setEligiendo(true);
    };
    const alternar = (fileId: string) => {
        setSeleccion(s => s.includes(fileId) ? s.filter(x => x !== fileId) : (s.length >= limits.max ? s : [...s, fileId]));
    };

    return (
        <div className="rounded-2xl border-2 border-gray-100 overflow-hidden">
            {/* ── Cabecera ── */}
            <div className="px-4 py-3 bg-gradient-to-r from-fuchsia-50 to-white border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-fuchsia-600" />
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.15em]">Reel para redes</p>
                    {reel && (
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${reelStateChip(reel.status)}`}>
                            {reel.statusLabel}
                        </span>
                    )}
                    {reel && reel.versionNumber > 1 && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-gray-100 text-gray-600">v{reel.versionNumber}</span>
                    )}
                </div>
                {reel?.working && <Loader2 className="w-4 h-4 animate-spin text-fuchsia-500" />}
            </div>

            <div className="p-4 space-y-4">
                {/* ── Sin Reel todavía ── */}
                {!reel && (
                    <>
                        <p className="text-xs text-gray-600">{reelStateHelp(null)}</p>

                        {/* El material que hay, y lo que falta para poder animarlo. Un
                            botón bloqueado sin motivo se lee como que el módulo está roto. */}
                        <div className="flex flex-wrap gap-3 text-[11px]">
                            <span className="px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                                <b className="text-gray-800">{fotos.length}</b> <span className="text-gray-500">fotografía(s)</span>
                            </span>
                            <span className="px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                                <b className="text-gray-800">{material.length - fotos.length}</b> <span className="text-gray-500">video(s)</span>
                            </span>
                            <span className={`px-2.5 py-1.5 rounded-lg border ${fotosListas.length >= limits.min ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                <b>{fotosListas.length}</b> en la Biblioteca
                            </span>
                        </div>

                        {fotosListas.length < limits.min && (
                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900">
                                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                                Hacen falta al menos <b>{limits.min}</b> fotografías en la Biblioteca Multimedia para armar el Reel, y hay {fotosListas.length}.
                                {fotos.length > fotosListas.length && (
                                    <> Las fotografías de una solicitud viven en un prefijo privado hasta que el material se aprueba: se envían a la Biblioteca desde el bloque «Artículo de noticia» o aprobando la solicitud.</>
                                )}
                            </div>
                        )}

                        {/* ── El costo se DICE antes de gastarlo (punto 25) ── */}
                        {vista.estimate && (
                            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-700 flex flex-wrap gap-4">
                                <span><b className="text-gray-900">{vista.estimate.scenes}</b> escenas</span>
                                <span>≈ <b className="text-gray-900">{fmtSeconds(vista.estimate.durationSec)}</b></span>
                                <span className="flex items-center gap-1">
                                    <Coins className="w-3.5 h-3.5 text-amber-500" />
                                    <b className="text-gray-900">{vista.estimate.total}</b> créditos estimados
                                </span>
                                <span className="text-gray-400">Medidor propio de la plataforma, no el saldo del proveedor.</span>
                            </div>
                        )}

                        <button
                            onClick={generar}
                            disabled={ocupado || fotosListas.length < limits.min}
                            className="px-4 py-2.5 rounded-xl bg-fuchsia-600 text-white text-xs font-black uppercase tracking-wide hover:bg-fuchsia-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Generar Reel
                        </button>
                        <p className="text-[10px] text-gray-400">
                            Se arma con hasta {limits.max} fotografías, queda como <b>borrador</b> y no se publica en ninguna red.
                        </p>
                    </>
                )}

                {/* ── Con Reel ── */}
                {reel && (
                    <>
                        {reel.statusDetail && <p className="text-xs text-gray-600">{reel.statusDetail}</p>}

                        {/* Las etapas, con su desenlace real */}
                        <div className="flex flex-wrap gap-1.5">
                            {reel.stages.map(s => (
                                <span key={s.id}
                                    title={s.error || s.note || s.label}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                                        s.status === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : s.status === 'error' ? 'bg-red-50 text-red-700 border-red-200'
                                                : s.status === 'retry' ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                    : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                    {s.status === 'ok' ? '✓ ' : s.status === 'error' ? '✗ ' : ''}{s.label.replace('…', '')}
                                </span>
                            ))}
                        </div>

                        {reel.lastError && (
                            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-[11px] text-red-800">
                                <b>No se pudo continuar:</b> {reel.lastError}
                                <button onClick={() => reintentar()} disabled={ocupado}
                                    className="ml-2 underline font-bold">Reintentar esa etapa</button>
                            </div>
                        )}

                        {/* ── La selección de fotografías ── */}
                        {elegidas.length > 0 && !eligiendo && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                                        Fotografías del Reel ({elegidas.length})
                                        {reel.selection?.source === 'manual' && <span className="ml-2 text-gray-500 normal-case font-bold">· elegidas a mano</span>}
                                    </p>
                                    <button onClick={abrirSelector} disabled={ocupado}
                                        className="text-[11px] font-bold text-rotary-blue hover:underline">Cambiar</button>
                                </div>
                                <div className="grid grid-cols-5 gap-2">
                                    {elegidas.map((it, i) => {
                                        const m = porId.get(it.fileId);
                                        return (
                                            <div key={it.fileId} className="relative">
                                                {m?.url
                                                    ? <img src={m.url} alt="" className="w-full aspect-[9/16] object-cover rounded-lg border border-gray-200" />
                                                    : <div className="w-full aspect-[9/16] rounded-lg bg-gray-100 flex items-center justify-center"><ImageIcon className="w-4 h-4 text-gray-300" /></div>}
                                                <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-black">{i + 1}</span>
                                                <p className="mt-1 text-[9px] text-gray-500 truncate" title={it.reason}>{it.slotLabel}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                                {reel.selection?.degraded && (
                                    <p className="mt-2 text-[10px] text-amber-700">
                                        Se eligieron por el orden en que las mandó el club: todavía no hay análisis del artículo para comparar nitidez ni descartar repetidas.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ── El selector manual ── */}
                        {eligiendo && (
                            <div className="rounded-xl border-2 border-rotary-blue/30 p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[11px] font-black text-gray-700">
                                        Elegí entre {limits.min} y {limits.max} fotografías · {seleccion.length} marcada(s)
                                    </p>
                                    <button onClick={() => setEligiendo(false)} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
                                </div>
                                <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto">
                                    {fotosListas.map(m => {
                                        const i = seleccion.indexOf(m.fileId);
                                        return (
                                            <button key={m.fileId} type="button" onClick={() => alternar(m.fileId)}
                                                aria-label={`Elegir ${m.filename || 'fotografía'}`}
                                                className={`relative rounded-lg overflow-hidden border-2 ${i >= 0 ? 'border-rotary-blue' : 'border-transparent hover:border-gray-300'}`}>
                                                {m.url
                                                    ? <img src={m.url} alt="" className="w-full aspect-square object-cover" />
                                                    : <div className="w-full aspect-square bg-gray-100" />}
                                                {i >= 0 && <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-rotary-blue text-white text-[10px] font-black flex items-center justify-center">{i + 1}</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <button onClick={guardarSeleccion} disabled={ocupado || seleccion.length < limits.min}
                                        className="px-3 py-2 rounded-lg bg-rotary-blue text-white text-[11px] font-black disabled:opacity-40">
                                        Guardar selección
                                    </button>
                                    {reel.reelProjectId && (
                                        <p className="text-[10px] text-amber-700">
                                            El Reel ya generado no se rehace solo: para verlo con estas fotografías hay que crear una versión nueva.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── El storyboard ── */}
                        {reel.storyboard?.scenes?.length ? (
                            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1">
                                    <Clapperboard className="w-3.5 h-3.5" /> Storyboard
                                </p>
                                {reel.storyboard.hook && <p className="text-[11px] text-gray-800 font-bold mb-1">{reel.storyboard.hook}</p>}
                                <ol className="space-y-0.5">
                                    {reel.storyboard.scenes.map((s, i) => (
                                        <li key={i} className="text-[11px] text-gray-600"><b className="text-gray-400">{i + 1}.</b> {s.line}</li>
                                    ))}
                                </ol>
                                {reel.storyboard.cta && <p className="mt-1.5 text-[11px] text-gray-700"><b>Llamado:</b> {reel.storyboard.cta}</p>}
                                {!!reel.storyboard.factIssues?.length && (
                                    <p className="mt-2 text-[10px] text-amber-700">
                                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                                        {reel.storyboard.factIssues.length} aviso(s) de datos: {reel.storyboard.factIssues[0]}
                                    </p>
                                )}
                            </div>
                        ) : null}

                        {/* ── El proyecto: escenas, vista previa y su desglose ── */}
                        {project && (
                            <div className="rounded-xl border border-gray-100 p-3">
                                <div className="flex items-start gap-3">
                                    {project.posterUrl
                                        ? <img src={project.posterUrl} alt="" className="w-16 aspect-[9/16] object-cover rounded-lg border border-gray-200" />
                                        : <div className="w-16 aspect-[9/16] rounded-lg bg-gray-100 flex items-center justify-center"><Film className="w-5 h-5 text-gray-300" /></div>}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] text-gray-700">
                                            <b>{project.scenesReady}/{project.scenesTotal}</b> escenas listas
                                            {project.durationSec ? <> · {fmtSeconds(project.durationSec)}</> : null}
                                            {project.format ? <> · {project.format}</> : null}
                                        </p>
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {REEL_NETWORKS.map(n => (
                                                <span key={n.id} className="px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-[9px] font-bold text-gray-500">{n.label}</span>
                                            ))}
                                        </div>
                                        {/* Una escena que falló NO cancela el proyecto (punto 26). */}
                                        {project.scenes.some(s => s.status === 'error') && (
                                            <p className="mt-1.5 text-[10px] text-amber-700">
                                                {project.scenes.filter(s => s.status === 'error').length} escena(s) fallaron. Se regeneran una por una desde el Estudio de Contenido, sin volver a pagar las demás.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    {project.videoUrl && (
                                        <a href={project.videoUrl} target="_blank" rel="noopener noreferrer"
                                            className="px-3 py-2 rounded-lg bg-gray-900 text-white text-[11px] font-black flex items-center gap-1.5">
                                            <Play className="w-3.5 h-3.5" /> Vista previa
                                        </a>
                                    )}
                                    <a href={project.editUrl}
                                        className="px-3 py-2 rounded-lg border-2 border-gray-200 text-[11px] font-black text-gray-700 hover:border-rotary-blue/40 flex items-center gap-1.5">
                                        <ExternalLink className="w-3.5 h-3.5" /> Editar en el Estudio
                                    </a>
                                </div>
                            </div>
                        )}

                        {/* ── Las acciones editoriales. NINGUNA publica. ── */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            {reel.nextStates.map(s => (
                                <button key={s.id} onClick={() => cambiarEstado(s.id, s.id === 'descartado' ? (prompt('Motivo del descarte (queda escrito):') || '') : '')}
                                    disabled={ocupado}
                                    className={`px-3 py-2 rounded-lg text-[11px] font-black border-2 ${
                                        s.id === 'aprobado' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : s.id === 'descartado' ? 'border-gray-200 text-gray-500'
                                                : 'border-gray-200 text-gray-700'}`}>
                                    {s.id === 'aprobado' && <Check className="w-3.5 h-3.5 inline mr-1" />}
                                    {s.label}
                                </button>
                            ))}
                            <button onClick={nuevaVersion} disabled={ocupado}
                                className="px-3 py-2 rounded-lg text-[11px] font-black border-2 border-gray-200 text-gray-600 flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5" /> Crear nueva versión
                            </button>
                            <button onClick={() => reintentar()} disabled={ocupado}
                                className="px-2.5 py-2 rounded-lg text-gray-400 hover:text-gray-700" title="Reintentar la etapa pendiente">
                                <RefreshCw className={`w-3.5 h-3.5 ${ocupado ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        {reel.status === 'aprobado' && (
                            <p className="text-[10px] text-gray-500">
                                Aprobado no es publicado: el Reel sale a las redes desde <b>Estudio de Contenido → Distribución</b>, con las cuentas conectadas de este sitio.
                            </p>
                        )}

                        <p className="text-[10px] text-gray-400">
                            {reel.creditsEstimated > 0 && <>Consumo estimado: <b>{reel.creditsEstimated}</b> créditos · </>}
                            Origen: solicitud de contenido{vista.article?.title ? ` · artículo «${vista.article.title}»` : ''}.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default SubmissionReelPanel;
