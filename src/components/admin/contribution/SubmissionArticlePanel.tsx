import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Loader2, Newspaper, Sparkles, ExternalLink, BarChart3, RefreshCw, Check, AlertTriangle,
    Image as ImageIcon, History, Copy, Wand2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { articleStateLabel, articleStateChip, articleIsWorking, IMPACT_PERIODS, fmtInt, fmtDuration } from '../../../lib/submissionArticleSpec';
import ArticleMediaPicker from './ArticleMediaPicker';

// ════════════════════════════════════════════════════════════════════════════
// El ARTÍCULO DE NOTICIA de una solicitud — v4.1000
//
// Va DENTRO de la ficha de la solicitud (`SubmissionDetail`), que es donde el
// pedido lo describe: SOLICITUD RECIBIDA → IA ANALIZÓ → BORRADOR LISTO →
// [REVISAR] → [APROBAR Y PUBLICAR] → PUBLICADO → ESTADÍSTICAS, toda la
// trazabilidad en un mismo sitio.
//
// Lo que se ve acá lo DECIDE el servidor: los estados a los que se puede ir
// (`nextStates`), las etapas con su desenlace (`stages`), el puntaje de cada
// foto. Este componente sólo pinta y pide.
//
// ⚠️ EL TEXTO SE EDITA EN NOTICIAS. «Revisar artículo» abre el editor de
// siempre (`/admin/noticias?post=…`): un segundo editor de artículos sería el
// módulo duplicado que el pedido prohíbe. Lo que sí vive acá es lo que
// Noticias no sabe hacer: portada y galería sobre material todavía sin
// aprobar, regeneración parcial, versiones y el impacto.
// ════════════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

interface Media {
    fileId: string; kind: 'image' | 'video'; role: string; roleLabel: string; isCover: boolean; sortOrder: number;
    excluded: boolean; excludedReason?: string | null; alt?: string | null; caption?: string | null; score?: number | null;
    reasons?: string[]; url?: string | null; filename?: string | null; inLibrary: boolean;
}
interface Stage { id: string; label: string; optional: boolean; status: string; error?: string | null; note?: string | null }
interface Version { id: string; kind: string; section?: string | null; changedFields: string[]; actorName?: string | null; note?: string | null; createdAt: string }
interface Vista {
    submission: { id: string; status: string };
    article: null | {
        id: string; status: string; statusLabel: string; statusDetail?: string | null; working: boolean; stages: Stage[]; lastError?: string | null;
        generated: { title?: string; excerpt?: string; category?: string; categoryIsNew?: boolean; suggestedCategory?: string; tags?: string[]; notProvided?: string[]; missingInfo?: { key: string; label: string }[]; copyIssues?: string[]; depth?: string | null; depthReason?: string | null; meta?: { model?: string; attempts?: number; warnings?: string[]; wordCount?: number } | null };
        mediaPlan: { cover?: string | null; coverReason?: string; coverWeak?: boolean; visionNote?: string | null; syncedImages?: number; syncedAt?: string };
        postId?: string | null; siteName?: string | null; generatedAt?: string | null; publishedAt?: string | null; publicUrl?: string | null;
        originNote: string; nextStates: { id: string; label: string }[];
    };
    post: null | { id: string; title: string; slug?: string | null; published: boolean; category?: string; tags?: string[]; seoTitle?: string; seoDescription?: string; image?: string | null; images: string[]; wordCount: number; editUrl: string };
    media: Media[];
    pendingLibrary?: number;
    // La carpeta de la Biblioteca donde vive el material y qué archivo falta,
    // con su motivo (v4.1004). Los pinta `ArticleMediaPicker`.
    folder?: { id: string; name: string; path: string } | null;
    pendingFiles?: { id: string; filename: string; error?: string | null }[];
    versions: Version[];
    sections: { id: string; label: string }[];
    autoEnabled: boolean;
}

interface Props { campaignId: string; submissionId: string; onChanged?: () => void }

const leer = async (r: Response) => {
    const texto = await r.text();
    let data: any;
    try { data = JSON.parse(texto); } catch { throw new Error(`El servidor respondió ${r.status} con ${r.headers.get('content-type') || 'contenido desconocido'} en vez de JSON.`); }
    if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);
    return data;
};

const SubmissionArticlePanel: React.FC<Props> = ({ campaignId, submissionId, onChanged }) => {
    const base = `${API}/contribution-campaigns/${campaignId}/submissions/${submissionId}/article`;
    const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });
    const [vista, setVista] = useState<Vista | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [mostrarGaleria, setMostrarGaleria] = useState(false);
    const [mostrarVersiones, setMostrarVersiones] = useState(false);
    const [propuesta, setPropuesta] = useState<{ section: string; proposal: Record<string, any>; warnings: string[] } | null>(null);
    const [stats, setStats] = useState<any>(null);
    const [periodo, setPeriodo] = useState('todo');
    const [mostrarStats, setMostrarStats] = useState(false);
    const avanzando = useRef(false);

    const cargar = useCallback(async () => {
        try {
            const r = await fetch(base, { headers: { Authorization: `Bearer ${token()}` } });
            const data = await leer(r);
            setVista(data);
            setError(null);
        } catch (e: any) { setError(e?.message || 'No se pudo cargar el artículo.'); }
    }, [base]);

    useEffect(() => { setVista(null); cargar(); }, [cargar]);

    // Mientras trabaja, cada sondeo AVANZA una etapa: es lo que hace que
    // «Analizando…» → «Seleccionando portada…» se pinte cuando OCURRE. El
    // intervalo sólo existe mientras hay trabajo.
    const trabajando = Boolean(vista?.article && articleIsWorking(vista.article.status));
    useEffect(() => {
        if (!trabajando) return;
        let vivo = true;
        const tick = async () => {
            if (avanzando.current || !vivo) return;
            avanzando.current = true;
            try {
                const r = await fetch(`${base}/advance`, { method: 'POST', headers: headers(), body: '{}' });
                const data = await leer(r);
                if (vivo) { setVista(data); if (!articleIsWorking(data.article?.status)) onChanged?.(); }
            } catch (e: any) { if (vivo) setError(e?.message); }
            finally { avanzando.current = false; }
        };
        tick();
        const id = setInterval(tick, 3500);
        return () => { vivo = false; clearInterval(id); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trabajando, base]);

    const accion = async (path: string, body: any = {}, method = 'POST', exito?: string) => {
        setOcupado(true);
        try {
            const r = await fetch(`${base}${path}`, { method, headers: headers(), body: JSON.stringify(body) });
            const data = await leer(r);
            if (data?.article !== undefined) setVista(data);
            if (exito) toast.success(exito);
            onChanged?.();
            return data;
        } catch (e: any) { toast.error(e?.message); return null; }
        finally { setOcupado(false); }
    };

    const cargarStats = async (p = periodo, resumen = false) => {
        try {
            const r = await fetch(`${base}/stats?period=${p}${resumen ? '&summary=1' : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
            setStats(await leer(r));
        } catch (e: any) { toast.error(e?.message); }
    };

    if (error && !vista) {
        return <div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-xs text-red-700">Artículo de noticia: {error}</div>;
    }
    if (!vista) return <div className="rounded-2xl bg-gray-50 p-4 flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Artículo de noticia…</div>;

    const a = vista.article;
    const media = vista.media;

    // ── Sin artículo todavía ────────────────────────────────────────────
    if (!a) {
        return (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 p-5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-2"><Newspaper className="w-4 h-4" /> Artículo de noticia</p>
                <p className="text-xs text-gray-500 mb-3">
                    {vista.autoEnabled
                        ? 'Esta solicitud llegó antes de que existiera la generación automática, o se apagó para esta campaña. Se puede generar ahora: el borrador queda en Noticias sin publicar.'
                        : 'La generación automática está apagada en esta instalación. Se puede generar a mano: el borrador queda en Noticias sin publicar.'}
                </p>
                <button onClick={() => accion('/generate', {}, 'POST', 'Artículo en cola')} disabled={ocupado}
                    className="px-4 py-3 rounded-xl bg-rotary-blue text-white text-[11px] font-black flex items-center gap-2 disabled:bg-gray-300">
                    <Sparkles className="w-4 h-4" /> GENERAR ARTÍCULO
                </button>
            </div>
        );
    }

    const etapaActiva = a.stages.find(s => s.status !== 'ok');
    const g = a.generated || {};

    return (
        <div className="rounded-2xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] flex items-center gap-2"><Newspaper className="w-4 h-4" /> Artículo de noticia</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${articleStateChip(a.status)}`}>{articleStateLabel(a.status).toUpperCase()}</span>
                        {a.statusDetail && <span className="text-[11px] text-gray-500">{a.statusDetail}</span>}
                    </div>
                </div>
                <p className="text-[10px] text-gray-400" data-no-translate>{a.originNote}</p>
            </div>

            {/* Las etapas, cuando ocurren. */}
            {(a.working || a.status === 'error') && (
                <div className="rounded-xl bg-sky-50/60 border border-sky-100 p-3 space-y-1">
                    {a.stages.map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-[11px]">
                            {s.status === 'ok' ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                                : s.status === 'error' ? <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                : s.id === etapaActiva?.id && a.working ? <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                                : <span className="w-3.5 h-3.5 rounded-full border border-gray-300 inline-block" />}
                            <span className={s.status === 'ok' ? 'text-gray-500' : s.status === 'error' ? 'text-red-700 font-bold' : 'text-gray-700'}>{s.label.replace(/…$/, '')}</span>
                            {s.optional && <span className="text-[9px] text-gray-400 uppercase">opcional</span>}
                            {s.error && <span className="text-red-600 truncate max-w-md" title={s.error}>— {s.error}</span>}
                            {s.status === 'error' && !a.working && (
                                <button onClick={() => accion('/retry', { stage: s.id }, 'POST', `Reintentando «${s.label.replace(/…$/, '')}»`)} disabled={ocupado}
                                    className="ml-auto text-[10px] font-black text-rotary-blue inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" /> REINTENTAR</button>
                            )}
                        </div>
                    ))}
                    {a.status === 'error' && !etapaActiva?.error && a.lastError && <p className="text-[11px] text-red-700">{a.lastError}</p>}
                    {a.status === 'error' && (
                        <button onClick={() => accion('/status', { to: 'recibida' }, 'POST', 'De vuelta a la cola')} disabled={ocupado}
                            className="mt-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-[10px] font-black text-gray-700 inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" /> REINTENTAR DESDE LA ETAPA FALLIDA</button>
                    )}
                </div>
            )}

            {/* El borrador */}
            {vista.post && (
                <div className="space-y-3">
                    <div className="flex gap-4">
                        <div className="w-24 h-24 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                            {(vista.post.image || media.find(m => m.isCover)?.url)
                                ? <img src={vista.post.image || media.find(m => m.isCover)?.url || ''} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon className="w-6 h-6" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-bold text-gray-800 leading-snug">{vista.post.title}</p>
                            {g.excerpt && <p className="text-xs text-gray-500 mt-1 line-clamp-3">{g.excerpt}</p>}
                            <p className="text-[11px] text-gray-400 mt-2">
                                {vista.post.category && <span>{vista.post.category} · </span>}
                                {vista.post.wordCount} palabras
                                {g.meta?.model && <span data-no-translate> · {g.meta.model}</span>}
                                {a.siteName && <span> · nace en {a.siteName}</span>}
                            </p>
                            {(vista.post.tags?.length ?? 0) > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">{vista.post.tags!.map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600" data-no-translate>{t}</span>)}</div>
                            )}
                        </div>
                    </div>

                    {/* Lo que la IA NO supo, dicho: es lo que evita que alguien
                        publique creyendo que el texto es completo. */}
                    {(g.notProvided?.length || g.missingInfo?.length || g.copyIssues?.length || g.categoryIsNew) ? (
                        <div className="rounded-xl bg-amber-50/60 border border-amber-100 p-3 text-[11px] text-amber-900 space-y-1">
                            {(g.missingInfo?.length ?? 0) > 0 && <p><b>Información no suministrada</b> (el artículo se escribió sin esto): {g.missingInfo!.map(m => m.label).join(' · ')}.</p>}
                            {(g.notProvided?.length ?? 0) > 0 && <p>El modelo declaró que faltó: {g.notProvided!.join(' · ')}.</p>}
                            {(g.copyIssues?.length ?? 0) > 0 && <p><b>Veracidad:</b> {g.copyIssues!.slice(0, 3).join(' ')}{g.copyIssues!.length > 3 ? ` (+${g.copyIssues!.length - 3})` : ''}</p>}
                            {g.categoryIsNew && g.suggestedCategory && <p><b>Categoría sugerida:</b> «{g.suggestedCategory}» — no existe todavía; el borrador quedó en «{g.category}». Se crea desde Noticias si corresponde.</p>}
                        </div>
                    ) : null}
                    {(g.meta?.warnings?.length ?? 0) > 0 && (
                        <p className="text-[11px] text-gray-500">{g.meta!.warnings!.slice(0, 2).join(' ')}</p>
                    )}

                    {/* Acciones */}
                    <div className="flex flex-wrap gap-2">
                        <Link to={vista.post.editUrl} className="px-4 py-3 rounded-xl bg-rotary-blue text-white text-[11px] font-black flex items-center gap-2">
                            <Newspaper className="w-4 h-4" /> {vista.post.published ? 'EDITAR EN NOTICIAS' : 'REVISAR ARTÍCULO'}
                        </Link>
                        {a.publicUrl && vista.post.published && (
                            <a href={a.publicUrl} target="_blank" rel="noreferrer" className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-[11px] font-black flex items-center gap-2">
                                <ExternalLink className="w-4 h-4" /> VER PUBLICACIÓN
                            </a>
                        )}
                        {vista.post.published && (
                            <button onClick={() => { setMostrarStats(v => !v); if (!stats) cargarStats(periodo, true); }}
                                className="px-4 py-3 rounded-xl bg-white border-2 border-gray-200 text-gray-700 text-[11px] font-black flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" /> ESTADÍSTICAS
                            </button>
                        )}
                        {!vista.post.published && ['borrador_listo', 'en_revision', 'aprobado', 'requiere_info'].includes(a.status) && (
                            <>
                                {a.status !== 'aprobado' && (
                                    <button onClick={() => accion('/publish', { publish: false }, 'POST', 'Artículo aprobado. Sigue sin publicar.')} disabled={ocupado}
                                        className="px-4 py-3 rounded-xl bg-white border-2 border-emerald-200 text-emerald-700 text-[11px] font-black flex items-center gap-2 disabled:opacity-50"><Check className="w-4 h-4" /> APROBAR</button>
                                )}
                                <button onClick={async () => {
                                    const sinBiblioteca = media.filter(m => !m.excluded && !m.inLibrary).length;
                                    if (!window.confirm(`Se publica «${vista.post!.title}» en el sitio.${sinBiblioteca ? ` Antes, ${sinBiblioteca} archivo(s) de la solicitud pasan a la Biblioteca Multimedia (es lo que hace públicas las fotos).` : ''} ¿Continuar?`)) return;
                                    const d = await accion('/publish', { publish: true }, 'POST');
                                    if (d?.published) toast.success(`Publicado: ${d.publicUrl || 'en línea'}`);
                                }} disabled={ocupado}
                                    className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-[11px] font-black flex items-center gap-2 disabled:bg-gray-300"><Check className="w-4 h-4" /> APROBAR Y PUBLICAR</button>
                            </>
                        )}
                        {a.nextStates.filter(n => !['aprobado', 'publicado', 'recibida'].includes(n.id)).map(n => (
                            <button key={n.id} disabled={ocupado} onClick={() => {
                                let reason = '';
                                if (n.id === 'requiere_info' || n.id === 'descartado') {
                                    reason = window.prompt(n.id === 'descartado' ? '¿Por qué se descarta el artículo?' : '¿Qué información falta?') || '';
                                    if (!reason.trim()) return;
                                }
                                accion('/status', { to: n.id, reason }, 'POST', `Ahora está en «${n.label}»`);
                            }} className="px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-black">{n.label.toUpperCase()}</button>
                        ))}
                    </div>

                    {/* Regeneración parcial: PROPONE, no pisa. */}
                    {!a.working && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]"><Wand2 className="w-3 h-3 inline mr-1" />Regenerar</span>
                            {vista.sections.map(s => (
                                <button key={s.id} disabled={ocupado} onClick={async () => {
                                    const d = await accion('/regenerate', { section: s.id, apply: false }, 'POST');
                                    if (d?.proposal) setPropuesta({ section: s.id, proposal: d.proposal, warnings: d.warnings || [] });
                                }} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-rotary-blue/40">{s.label}</button>
                            ))}
                            <button onClick={() => setMostrarGaleria(v => !v)} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-rotary-blue/40 inline-flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Portada y galería ({media.filter(m => !m.excluded).length})</button>
                            <button onClick={() => setMostrarVersiones(v => !v)} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-rotary-blue/40 inline-flex items-center gap-1"><History className="w-3 h-3" /> Versiones ({vista.versions.length})</button>
                            <button disabled={ocupado} onClick={async () => {
                                if (!window.confirm('Se crea OTRO borrador copiado de éste, aparte, en Noticias. La solicitud sigue apuntando al principal. ¿Continuar?')) return;
                                const d = await accion('/duplicate', {}, 'POST', 'Duplicado en Noticias');
                                if (d?.editUrl) window.open(d.editUrl, '_blank');
                            }} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-rotary-blue/40 inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Duplicar</button>
                        </div>
                    )}

                    {/* La propuesta regenerada: se aplica a propósito. */}
                    {propuesta && (
                        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black text-violet-800 uppercase tracking-wider">Propuesta — {vista.sections.find(s => s.id === propuesta.section)?.label}</p>
                                <button onClick={() => setPropuesta(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
                            </div>
                            {Object.entries(propuesta.proposal).filter(([k]) => !['intro', 'wordsBefore', 'wordsAfter', 'excerpt'].includes(k)).map(([k, v]) => (
                                <div key={k} className="text-xs">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">{k}</span>
                                    {k === 'content'
                                        ? <div className="mt-1 max-h-48 overflow-y-auto rounded-lg bg-white border border-gray-100 p-3 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: String(v) }} />
                                        : <p className="text-gray-800 mt-0.5">{String(v)}</p>}
                                </div>
                            ))}
                            {propuesta.proposal.wordsBefore != null && <p className="text-[11px] text-gray-500">{propuesta.proposal.wordsBefore} → {propuesta.proposal.wordsAfter} palabras</p>}
                            {propuesta.warnings.length > 0 && <p className="text-[11px] text-amber-800"><AlertTriangle className="w-3 h-3 inline mr-1" />{propuesta.warnings.slice(0, 3).join(' ')}</p>}
                            <div className="flex gap-2">
                                <button disabled={ocupado} onClick={async () => {
                                    const d = await accion('/regenerate', { section: propuesta.section, apply: true }, 'POST', 'Aplicado. Queda en el historial de versiones.');
                                    if (d) setPropuesta(null);
                                }} className="px-3 py-2 rounded-lg bg-violet-600 text-white text-[10px] font-black">APLICAR AL BORRADOR</button>
                                <button onClick={() => setPropuesta(null)} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-[10px] font-black text-gray-600">DESCARTAR</button>
                            </div>
                            <p className="text-[10px] text-gray-400">Aplicar vuelve a generar esta sección con el modelo y la escribe en el borrador; la versión anterior queda guardada y se puede restaurar.</p>
                        </div>
                    )}

                    {/* ⚠️ COMPARTIDO con el editor de Noticias (v4.1003). Vivía acá
                        en línea, así que quien revisaba el artículo en Noticias no tenía
                        ninguna forma de elegir la portada con el material del club. */}
                    {mostrarGaleria && (
                        <ArticleMediaPicker
                            campaignId={campaignId} submissionId={submissionId}
                            media={media} mediaPlan={a.mediaPlan}
                            folder={vista.folder} pendingFiles={vista.pendingFiles}
                            onView={(v) => { setVista(v); onChanged?.(); }}
                        />
                    )}

                    {/* Versiones */}
                    {mostrarVersiones && (
                        <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Historial de versiones</p>
                            {vista.versions.length === 0 && <p className="text-[11px] text-gray-400">Todavía no hay versiones.</p>}
                            {vista.versions.map((v, i) => (
                                <div key={v.id} className="flex items-start gap-3 text-[11px]">
                                    <span className="text-gray-400 w-32 flex-shrink-0" data-no-translate>{new Date(v.createdAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    <span className="flex-1 text-gray-700">
                                        <b>{v.kind === 'ai' ? 'Versión IA inicial' : v.kind === 'human' ? 'Edición humana' : v.kind === 'regenerada' ? 'Regenerada' : 'Restaurada'}</b>
                                        {v.section ? ` (${v.section})` : ''}
                                        {v.note ? ` — ${v.note}` : ''}
                                        {v.actorName && <span className="text-gray-400" data-no-translate> · {v.actorName}</span>}
                                        {(v.changedFields?.length ?? 0) > 0 && v.kind !== 'ai' && <span className="text-gray-400"> · {v.changedFields.join(', ')}</span>}
                                    </span>
                                    {i > 0 && (
                                        <button disabled={ocupado} onClick={() => { if (window.confirm('Se restaura esta versión en el borrador. La actual queda guardada en el historial.')) accion(`/versions/${v.id}/restore`, {}, 'POST', 'Versión restaurada'); }}
                                            className="text-[10px] font-black text-rotary-blue">RESTAURAR</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Impacto */}
                    {mostrarStats && vista.post.published && (
                        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Impacto del artículo</p>
                                <div className="flex gap-1">
                                    {IMPACT_PERIODS.map(p => (
                                        <button key={p.id} onClick={() => { setPeriodo(p.id); cargarStats(p.id, false); }}
                                            className={`px-2 py-1 rounded-md text-[10px] font-black ${periodo === p.id ? 'bg-rotary-blue text-white' : 'bg-gray-100 text-gray-500'}`}>{p.label}</button>
                                    ))}
                                </div>
                            </div>
                            {!stats ? <div className="text-xs text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Midiendo…</div> : (
                                <>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[
                                            ['Visualizaciones', fmtInt(stats.article.totals.views)],
                                            ['Visitantes únicos', fmtInt(stats.article.totals.uniques)],
                                            ['Tiempo promedio', stats.article.totals.samples ? fmtDuration(stats.article.totals.avgSeconds) : '—'],
                                            ['Clics', fmtInt(stats.article.totals.clicks)],
                                        ].map(([k, v]) => (
                                            <div key={k} className="rounded-lg bg-gray-50 p-3"><p className="text-[9px] font-black text-gray-400 uppercase">{k}</p><p className="text-lg font-bold text-gray-800" data-no-translate>{v}</p></div>
                                        ))}
                                    </div>
                                    {stats.article.series?.length > 1 && (
                                        <div className="flex items-end gap-[2px] h-16" title="Visitas por día">
                                            {stats.article.series.slice(-60).map((d: any) => {
                                                const max = Math.max(1, ...stats.article.series.map((x: any) => x.views));
                                                return <div key={d.day} title={`${d.day}: ${d.views}`} className="flex-1 bg-rotary-blue/70 rounded-t-sm min-w-[3px]" style={{ height: `${Math.max(2, (d.views / max) * 100)}%` }} />;
                                            })}
                                        </div>
                                    )}
                                    <div className="grid sm:grid-cols-2 gap-3 text-[11px]">
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Fuentes</p>
                                            {stats.article.sources.length === 0 ? <p className="text-gray-400">Sin visitas en el período.</p> : stats.article.sources.map((s: any) => (
                                                <div key={s.label} className="flex justify-between"><span data-no-translate>{s.label}</span><span className="text-gray-500">{s.pct} %</span></div>
                                            ))}
                                        </div>
                                        <div className="space-y-1 text-gray-600">
                                            <p>Publicado el: <b data-no-translate>{stats.publishedAt ? new Date(stats.publishedAt).toLocaleString('es-CO') : '—'}</b></p>
                                            <p>Última visita: <b data-no-translate>{stats.article.lastViewAt ? new Date(stats.article.lastViewAt).toLocaleString('es-CO') : '—'}</b></p>
                                            <p>Pico de tráfico: <b data-no-translate>{stats.article.peakDay ? `${stats.article.peakDay} (${fmtInt(stats.article.peakViews)})` : '—'}</b></p>
                                            <p>Total acumulado: <b data-no-translate>{fmtInt(stats.article.allTime.views)}</b> visualizaciones</p>
                                            {(stats.article.devices?.length ?? 0) > 0 && <p>Dispositivos: {stats.article.devices.map((d: any) => `${d.label} ${d.views}`).join(' · ')}</p>}
                                            {(stats.article.countries?.length ?? 0) > 0 && <p>Países: {stats.article.countries.map((d: any) => `${d.label} ${d.views}`).join(' · ')}</p>}
                                        </div>
                                    </div>
                                    {stats.summary?.text && (
                                        <div className="rounded-lg bg-sky-50/60 border border-sky-100 p-3 text-[11px] text-sky-900">
                                            {stats.summary.text}
                                            <span className="text-[10px] text-sky-600 block mt-1">{stats.summary.source === 'modelo' ? 'Redactado por el modelo sobre los datos medidos.' : 'Conclusión calculada sobre los datos medidos.'}</span>
                                        </div>
                                    )}
                                    <p className="text-[10px] text-gray-400">
                                        Se mide sólo el artículo. Facebook e Instagram entran en la fase siguiente. No se mide: {stats.article.notMeasured?.join('; ')}.
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SubmissionArticlePanel;
