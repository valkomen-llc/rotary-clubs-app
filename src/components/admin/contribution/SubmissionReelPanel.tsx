import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Loader2, Film, Sparkles, RefreshCw, Check, AlertTriangle, Image as ImageIcon,
    Clapperboard, Coins, Play, ExternalLink, Layers, Wand2, Camera, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { reelStateChip, reelStateHelp, reelIsWorking, REEL_NETWORKS, fmtSeconds } from '../../../lib/submissionReelSpec';
import PrepareReelModal from './PrepareReelModal';
import type { PrepPlanner, PrepCatalogs } from './PrepareReelModal';

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
// El ciclo de vida de una escena viene RESUELTO del servidor (v4.1028): qué
// estrategia se usó, cuántas generaciones pagó, por qué falló y qué se haría al
// continuar. La pantalla pinta; no decide. Todo lo nuevo es OPCIONAL: un
// servidor anterior no lo manda y el bloque se ve como antes.
interface SceneRecovery { action: 'skip' | 'wait' | 'retry_paid' | 'fallback'; strategy?: string | null; reason?: string | null; waitUntil?: string | null }
interface Scene {
    id: string; position: number; status: string; statusLabel?: string; statusDetail?: string | null;
    durationSec?: number | null; videoUrl?: string | null; posterUrl?: string | null; sourceImageUrl?: string | null;
    usable?: boolean; fallback?: boolean; strategy?: string | null; strategyLabel?: string | null;
    promptVersion?: number; paidGenerations?: number; strategiesTried?: string[];
    errorCode?: string | null; errorLabel?: string | null; errorKind?: string | null;
    nextAttemptAt?: string | null; mediaId?: string | null; creditsEstimated?: number; fidelityScore?: number | null;
    recovery?: SceneRecovery | null;
}
interface CostSummary { paidGenerations: number; fallbackScenes: number; creditsEstimated: number; note: string }
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
        statusLabel?: string; scenesUsable?: number; scenesPending?: number; scenesFallback?: number;
        resumable?: boolean; working?: boolean; costSummary?: CostSummary | null;
    };
    versions: { id: string; versionNumber: number; isCurrent: boolean; status: string }[];
    estimate: null | { scenes: number; durationSec: number; total: number };
    // El asistente «Preparar Reel», ya resuelto por el servidor (v4.1012).
    catalogs?: PrepCatalogs;
    planner?: PrepPlanner | null;
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
    const [preparando, setPreparando] = useState(false);
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

    // ⚠️ ESTE BOTÓN YA NO GENERA NADA (v4.1012): prepara y abre el asistente.
    // Lo único que gasta créditos es `confirmar`, abajo.
    const generar = async () => {
        const r = await pedir('/generate', { method: 'POST' }, 'Reel preparado: revisá antes de generar.');
        if (r) setPreparando(true);
        return r;
    };
    const guardarPlan = (patch: Record<string, unknown>) =>
        pedir('/plan', { method: 'PUT', body: JSON.stringify(patch) }, 'Configuración guardada.');
    const guardarFotos = (fileIds: string[]) =>
        pedir('/plan', { method: 'PUT', body: JSON.stringify({ fileIds }) }, 'Fotografías actualizadas.');
    const sugerir = () => pedir('/plan/suggest', { method: 'POST' }, 'Selección sugerida con el análisis que ya existía.');
    const reordenar = (fileIds: string[] | null, auto: boolean) =>
        pedir('/plan/order', { method: 'POST', body: JSON.stringify({ fileIds, auto }) }, auto ? 'Orden narrativo aplicado.' : 'Orden actualizado.');
    const confirmar = async () => {
        const r = await pedir('/confirm', { method: 'POST', body: JSON.stringify({ confirm: true }) }, 'Confirmado: las escenas se están generando.');
        if (r) setPreparando(false);
        return r;
    };
    const reintentar = (stage?: string) => pedir('/retry', { method: 'POST', body: JSON.stringify({ stage: stage || '' }) }, 'Reintentando.');
    // ── La recuperación por escena (v4.1028). Ninguna toca una escena con clip. ──
    // «Continuar» retoma SÓLO las escenas pendientes: el servidor salta las que
    // ya tienen clip y no llama al proveedor por ellas. Con `sceneIds` se acota
    // a una; con `strategy` se fuerza el escalón de la escalera.
    const continuar = (sceneIds?: string[], strategy?: string) =>
        pedir('/resume', { method: 'POST', body: JSON.stringify({ sceneIds: sceneIds || null, strategy: strategy || null }) },
            sceneIds?.length === 1 ? 'Se retoma esa escena. Las demás no se tocan.' : 'Se continúan las escenas pendientes. Las listas no vuelven a consumir créditos.');
    // La foto en movimiento cinematográfico, sin IA y sin gastar créditos.
    const respaldoFoto = (sceneId: string) =>
        pedir(`/scenes/${sceneId}/fallback`, { method: 'POST' }, 'Esa escena se resuelve con la fotografía en movimiento, sin IA.');
    const cambiarEstado = (to: string, reason = '') => pedir('/status', { method: 'POST', body: JSON.stringify({ to, reason }) }, 'Estado actualizado.');
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
                        {/* ⚠️ EL AVISO VA JUNTO AL BOTÓN QUE LO DISPARA, no sólo en el
                            resumen de arriba: quien va a gastar el gesto es quien tiene
                            que leerlo (la regla del modo Fotográfico, v4.798). Y lo que
                            dice es lo que de verdad pasa: este botón abre el asistente. */}
                        <p className="text-[10px] text-gray-400">
                            Abre <b>Preparar Reel</b>: elegís las fotografías, el orden, la duración, la voz y la música, y ves el
                            consumo estimado. <b>No se gasta ni un crédito</b> hasta que confirmes. Queda como borrador y no se
                            publica en ninguna red.
                        </p>
                    </>
                )}

                {/* ── Con Reel ── */}
                {reel && (
                    <>
                        {reel.statusDetail && <p className="text-xs text-gray-600">{reel.statusDetail}</p>}

                        {/* ── Esperando confirmación: el Reel está preparado y NO se gastó nada ── */}
                        {reel.status === 'configurando' && (
                            <div className="rounded-xl border-2 border-violet-200 bg-violet-50/60 p-3">
                                <p className="text-[11px] text-violet-900">
                                    <b>Preparado y sin gastar nada.</b> {vista.planner?.summary
                                        ? <>Va a durar {fmtSeconds(vista.planner.summary.durationSec)} con {vista.planner.summary.scenes} escenas
                                            y un consumo estimado de <b>{vista.planner.summary.credits.total}</b> créditos.</>
                                        : null}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <button onClick={() => setPreparando(true)} disabled={ocupado}
                                        className="px-3 py-2 rounded-lg bg-fuchsia-600 text-white text-[11px] font-black uppercase tracking-wide hover:bg-fuchsia-700 disabled:opacity-40 flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5" /> Revisar y confirmar
                                    </button>
                                </div>
                            </div>
                        )}

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

                        {/* Un fallo de ETAPA (antes del proyecto) se reintenta como etapa.
                            Un Reel INCOMPLETO no es un fallo de etapa: su salida es el
                            bloque de escenas de abajo, con «Continuar», así que acá no se
                            repite el motivo ni se ofrece un botón que no lo resuelve. */}
                        {reel.lastError && !(project && project.resumable) && (
                            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-[11px] text-red-800">
                                <b>No se pudo continuar:</b> {reel.lastError}
                                <button onClick={() => reintentar()} disabled={ocupado}
                                    className="ml-2 underline font-bold">Reintentar esa etapa</button>
                            </div>
                        )}

                        {/* ── La selección de fotografías ── */}
                        {elegidas.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                                        Fotografías del Reel ({elegidas.length})
                                        {reel.selection?.source === 'manual' && <span className="ml-2 text-gray-500 normal-case font-bold">· elegidas a mano</span>}
                                    </p>
                                    <button onClick={() => setPreparando(true)} disabled={ocupado}
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
                        {project && (() => {
                            const usables = project.scenesUsable ?? project.scenesReady;
                            const pendientes = project.scenes.filter(s => !(s.usable ?? Boolean(s.videoUrl && s.status !== 'error')));
                            const enCurso = project.working ?? reelIsWorking(reel.status);
                            const puedeContinuar = Boolean(project.resumable) && pendientes.length > 0 && !enCurso;
                            const rotuloEscena = (s: Scene) => {
                                if (s.fallback) return { texto: 'Foto en movimiento', tono: 'bg-sky-50 text-sky-700 border-sky-200', icono: <Camera className="w-3 h-3" /> };
                                if (s.usable ?? Boolean(s.videoUrl && s.status !== 'error')) return { texto: s.status === 'needs_review' ? '✓ Lista · revisar' : '✓ Lista', tono: 'bg-emerald-50 text-emerald-700 border-emerald-200', icono: null };
                                if (s.status === 'error') return { texto: '⚠ Requiere ajuste', tono: 'bg-amber-50 text-amber-800 border-amber-200', icono: null };
                                if (s.nextAttemptAt && new Date(s.nextAttemptAt).getTime() > Date.now()) return { texto: 'Esperando al proveedor', tono: 'bg-gray-50 text-gray-600 border-gray-200', icono: <Clock className="w-3 h-3" /> };
                                return { texto: s.statusLabel || 'En proceso', tono: 'bg-sky-50 text-sky-700 border-sky-200', icono: <Loader2 className="w-3 h-3 animate-spin" /> };
                            };
                            return (
                            <div className="rounded-xl border border-gray-100 p-3">
                                <div className="flex items-start gap-3">
                                    {project.posterUrl
                                        ? <img src={project.posterUrl} alt="" className="w-16 aspect-[9/16] object-cover rounded-lg border border-gray-200" />
                                        : <div className="w-16 aspect-[9/16] rounded-lg bg-gray-100 flex items-center justify-center"><Film className="w-5 h-5 text-gray-300" /></div>}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">
                                            {enCurso ? 'Reel en proceso' : project.resumable ? 'Reel incompleto' : project.statusLabel || 'Reel'}
                                        </p>
                                        <p className="text-[11px] text-gray-700">
                                            <b>{usables}/{project.scenesTotal}</b> escenas listas
                                            {project.scenesFallback ? <> · {project.scenesFallback} con foto en movimiento</> : null}
                                            {project.durationSec ? <> · {fmtSeconds(project.durationSec)}</> : null}
                                            {project.format ? <> · {project.format}</> : null}
                                        </p>
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {REEL_NETWORKS.map(n => (
                                                <span key={n.id} className="px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-[9px] font-bold text-gray-500">{n.label}</span>
                                            ))}
                                        </div>
                                        {/* ⚠️ Lo que ya está generado NO vuelve a consumir créditos, y se
                                            dice donde se mira. Es el punto de todo el módulo (v4.1028). */}
                                        {usables > 0 && pendientes.length > 0 && (
                                            <p className="mt-1.5 text-[10px] text-emerald-700">
                                                <Check className="w-3 h-3 inline mr-1" />
                                                {usables === 1 ? 'La escena ya generada está guardada y no volverá a consumir créditos.' : `Las ${usables} escenas ya generadas están guardadas y no volverán a consumir créditos.`}
                                            </p>
                                        )}
                                        {project.costSummary && (
                                            <p className="mt-1 text-[10px] text-gray-400" title={project.costSummary.note}>
                                                <Coins className="w-3 h-3 inline mr-1" />
                                                {project.costSummary.paidGenerations} generación(es) de video lanzadas · {project.costSummary.creditsEstimated} créditos estimados (medidor propio)
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* ── Una fila por escena, con su estado y sus salidas ── */}
                                <ul className="mt-3 space-y-1.5">
                                    {project.scenes.map(s => {
                                        const r = rotuloEscena(s);
                                        const esUsable = s.usable ?? Boolean(s.videoUrl && s.status !== 'error');
                                        const puedeActuar = !esUsable && !enCurso && Boolean(project.resumable);
                                        return (
                                            <li key={s.id} className={`rounded-lg border p-2 ${esUsable ? 'border-gray-100' : s.status === 'error' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-100'}`}>
                                                <div className="flex items-center gap-2">
                                                    {s.posterUrl || s.sourceImageUrl
                                                        ? <img src={s.posterUrl || s.sourceImageUrl || ''} alt="" className="w-7 h-10 object-cover rounded border border-gray-200 flex-shrink-0" />
                                                        : <div className="w-7 h-10 rounded bg-gray-100 flex-shrink-0" />}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-bold text-gray-800">
                                                            Escena {s.position + 1}
                                                            {s.strategyLabel && <span className="ml-1.5 text-[9px] font-bold text-gray-400 normal-case">· {s.strategyLabel}</span>}
                                                            {typeof s.paidGenerations === 'number' && s.paidGenerations > 0 && (
                                                                <span className="ml-1.5 text-[9px] font-bold text-gray-400">· {s.paidGenerations} gen.</span>
                                                            )}
                                                        </p>
                                                        {!esUsable && s.statusDetail && (
                                                            <p className="text-[10px] text-gray-600 leading-snug">{s.statusDetail}</p>
                                                        )}
                                                        {s.fallback && s.statusDetail && (
                                                            <p className="text-[10px] text-gray-500 leading-snug">{s.statusDetail}</p>
                                                        )}
                                                    </div>
                                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold border whitespace-nowrap flex items-center gap-1 ${r.tono}`}>
                                                        {r.icono}{r.texto}
                                                    </span>
                                                </div>
                                                {puedeActuar && (
                                                    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-9">
                                                        {s.recovery?.action !== 'fallback' && (
                                                            <button onClick={() => continuar([s.id])} disabled={ocupado}
                                                                title="Vuelve a generar sólo esta escena con la estrategia siguiente de la escalera. Gasta una generación."
                                                                className="px-2 py-1 rounded-md border border-gray-200 text-[10px] font-bold text-gray-700 hover:border-rotary-blue/40 flex items-center gap-1">
                                                                <RefreshCw className="w-3 h-3" /> Reintentar automáticamente
                                                            </button>
                                                        )}
                                                        {(s.strategy !== 'conservador' || s.recovery?.strategy === 'conservador') && s.recovery?.action !== 'fallback' && (
                                                            <button onClick={() => continuar([s.id], 'conservador')} disabled={ocupado}
                                                                title="La pose se sostiene, vive el ambiente: un prompt más seguro. Gasta una generación."
                                                                className="px-2 py-1 rounded-md border border-gray-200 text-[10px] font-bold text-gray-700 hover:border-rotary-blue/40 flex items-center gap-1">
                                                                <Wand2 className="w-3 h-3" /> Simplificar movimiento
                                                            </button>
                                                        )}
                                                        <button onClick={() => respaldoFoto(s.id)} disabled={ocupado}
                                                            title="La fotografía con movimiento cinematográfico, sin IA. No gasta créditos."
                                                            className="px-2 py-1 rounded-md border border-sky-200 bg-sky-50 text-[10px] font-bold text-sky-800 flex items-center gap-1">
                                                            <Camera className="w-3 h-3" /> Usar imagen con movimiento cinematográfico
                                                        </button>
                                                        <a href={project.editUrl}
                                                            className="px-2 py-1 rounded-md border border-gray-200 text-[10px] font-bold text-gray-600 flex items-center gap-1">
                                                            <ExternalLink className="w-3 h-3" /> Cambiar fotografía / Editar en el Estudio
                                                        </a>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    {puedeContinuar && (
                                        <button onClick={() => continuar()} disabled={ocupado}
                                            className="px-3 py-2 rounded-lg bg-rotary-blue text-white text-[11px] font-black flex items-center gap-1.5">
                                            {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                            Continuar {pendientes.length} escena{pendientes.length === 1 ? '' : 's'} pendiente{pendientes.length === 1 ? '' : 's'}
                                        </button>
                                    )}
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
                            );
                        })()}

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

            {/* ── El asistente. Se monta con `planner` resuelto: sin él no hay nada
                   que preparar, y abrirlo con valores inventados en el navegador
                   sería prometer una duración o un costo que el motor no sostiene. ── */}
            {vista.planner && vista.catalogs && (
                <PrepareReelModal
                    open={preparando}
                    onClose={() => setPreparando(false)}
                    material={material}
                    selection={elegidas}
                    planner={vista.planner}
                    catalogs={vista.catalogs}
                    limits={limits}
                    storyboard={reel?.storyboard || null}
                    busy={ocupado}
                    alreadyGenerated={Boolean(reel?.reelProjectId)}
                    onSavePlan={guardarPlan}
                    onSaveSelection={guardarFotos}
                    onReorder={reordenar}
                    onSuggest={sugerir}
                    onConfirm={confirmar}
                />
            )}
        </div>
    );
};

export default SubmissionReelPanel;
