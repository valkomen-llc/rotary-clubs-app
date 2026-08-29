// ════════════════════════════════════════════════════════════════════════════
// Canal de Capacitaciones — la página de UN video (v4.954)
//
// /capacitaciones/:slug — dirección estable por capacitación. El permiso de
// reproducción lo decide el SERVIDOR (/watch): esta pantalla obedece el
// veredicto, corta la vista previa en el tope de posición, muestra el candado
// y reanuda tras el ingreso SIN recargar (onLoginSuccess → re-veredicto →
// seek → play). «Crear cuenta» reutiliza la identidad del Asistente al Evento:
// no hay un segundo sistema de usuarios.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, Eye, CheckCircle2, MessageCircle, Send, GraduationCap, Play, ThumbsUp, Share2, Link2 } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useSEO } from '../hooks/useSEO';
import { fetchTraining, postTraining, fmtDuration, type TrainingCard } from '../lib/trainingChannel';
import { openLoginModal, onLoginSuccess } from '../lib/loginModal';
import { TOKEN_KEY, emitSessionChange } from '../lib/siteSession';
import { CTA_SOLID, CTA_SOFT, ctaSkin } from '../lib/ctaStyles';

interface VideoData {
    channel: { slug: string; name: string; bannerUrl?: string | null; videosCount?: number };
    video: TrainingCard & { description: string; commentsEnabled: boolean; likes?: number; likedByViewer?: boolean };
    access: { allowed: 'full' | 'preview' | 'none'; reason: string | null; allowedSec: number | null };
    viewer: { authenticated: boolean; roles: string[] };
    others: TrainingCard[];
}

interface CommentRow {
    id: string;
    parentId: string | null;
    authorName: string;
    body: string;
    status: string;
    pinned: boolean;
    createdAt: string;
    replies?: CommentRow[];
}

const fecha = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

// El sitio monta su cromo POR PÁGINA (el Navbar vive dentro de cada página,
// no por encima — ver loginModal.ts): sin este envoltorio, la página del
// video salía «plana», sin barra superior, sin menú y sin pie. Envuelve
// TODOS los returns, incluidos los de carga y error.
// El fondo es `bg-rotary-concrete`, la MISMA textura de las páginas de
// eventos y de la postulación — no un gris propio que se separe del sitio.
const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-rotary-concrete flex flex-col">
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
    </div>
);

const CapacitacionDetalle = () => {
    const { slug = '' } = useParams();
    const { club } = useClub();
    const [data, setData] = useState<VideoData | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [failed, setFailed] = useState(false);

    // La reproducción autorizada por el servidor.
    const [playback, setPlayback] = useState<{ url: string; allowed: string; allowedSec: number | null; startAt: number } | null>(null);
    const [locked, setLocked] = useState(false);
    const [showSignup, setShowSignup] = useState(false);
    const [completed, setCompleted] = useState(false);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const lockTracked = useRef(false);
    const viewTracked = useRef(false);
    const lockedAtRef = useRef(0);
    const lastBeat = useRef<{ t: number; playing: boolean }>({ t: Date.now(), playing: false });

    // Comentarios
    const [comments, setComments] = useState<CommentRow[]>([]);
    const [commentBody, setCommentBody] = useState('');
    const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
    const [sending, setSending] = useState(false);
    const [commentError, setCommentError] = useState<string | null>(null);

    // Crear cuenta desde el candado
    const [signup, setSignup] = useState({ firstName: '', lastName: '', email: '', password: '' });
    const [signupBusy, setSignupBusy] = useState(false);
    const [signupError, setSignupError] = useState<string | null>(null);

    // Reacciones (v4.956): el estado local arranca de lo que dice el servidor
    // y el toggle es optimista — la respuesta trae el contador REAL.
    const [likes, setLikes] = useState(0);
    const [liked, setLiked] = useState(false);
    const [likeBusy, setLikeBusy] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const shareTracked = useRef(false);

    const loadVideo = useCallback(async () => {
        if (!club?.id || !slug) return null;
        try {
            const res: VideoData = await fetchTraining('public/video', { clubId: club.id, slug });
            setData(res);
            setLikes(res.video?.likes ?? 0);
            setLiked(Boolean(res.video?.likedByViewer));
            setNotFound(false);
            setFailed(false);
            return res;
        } catch (e: any) {
            if (String(e?.message || '').includes('no encontrada') || String(e?.message || '').includes('canal')) setNotFound(true);
            else setFailed(true);
            return null;
        }
    }, [club?.id, slug]);

    const loadWatch = useCallback(async () => {
        if (!club?.id || !slug) return null;
        try {
            const res = await postTraining('public/watch', { clubId: club.id, slug });
            if (res.allowed === 'none') {
                setPlayback(null);
                setLocked(true);
                return res;
            }
            setPlayback({ url: res.url, allowed: res.allowed, allowedSec: res.allowedSec ?? null, startAt: res.startAt || 0 });
            setLocked(false);
            return res;
        } catch {
            return null;
        }
    }, [club?.id, slug]);

    const loadComments = useCallback(async () => {
        if (!club?.id || !slug) return;
        try {
            const res = await fetchTraining('public/comments', { clubId: club.id, slug });
            setComments(res.comments || []);
        } catch { /* la sección degrada a vacía */ }
    }, [club?.id, slug]);

    useEffect(() => {
        setData(null); setPlayback(null); setLocked(false); setCompleted(false);
        lockTracked.current = false; viewTracked.current = false;
        loadVideo().then(res => { if (res) { loadWatch(); loadComments(); } });
    }, [loadVideo, loadWatch, loadComments]);

    // Una vista por CARGA (regla v4.807).
    useEffect(() => {
        if (!club?.id || !data?.video || viewTracked.current) return;
        viewTracked.current = true;
        postTraining('public/track', { clubId: club.id, slug, type: 'video_view' }).catch(() => {});
    }, [club?.id, data?.video, slug]);

    // Tras el ingreso, la MISMA página en el MISMO segundo: se repite el
    // veredicto y, con el candado abierto, se reanuda donde quedó — sin
    // recargar, que es lo que pide el flujo.
    useEffect(() => onLoginSuccess(() => {
        setShowSignup(false);
        loadVideo();
        loadComments();
        loadWatch().then(res => {
            if (res && res.allowed === 'full') {
                setLocked(false);
                const v = videoRef.current;
                const resumeAt = lockedAtRef.current || res.startAt || 0;
                if (v) {
                    // El src puede no cambiar: se busca y se reproduce directo.
                    window.setTimeout(() => {
                        try { v.currentTime = resumeAt; v.play().catch(() => {}); } catch { /* el usuario le da play */ }
                    }, 150);
                }
            }
        });
    }), [loadVideo, loadWatch, loadComments]);

    useSEO({
        title: data?.video?.title || 'Capacitación',
        description: data?.video?.description?.slice(0, 200) || undefined,
        path: `/capacitaciones/${slug}`,
        image: data?.video?.thumbUrl || undefined,
    });

    // ── El tope de la vista previa ───────────────────────────────────────────
    const onTimeUpdate = () => {
        const v = videoRef.current;
        if (!v || !playback) return;
        if (playback.allowed === 'preview' && playback.allowedSec && v.currentTime >= playback.allowedSec) {
            v.pause();
            lockedAtRef.current = Math.floor(v.currentTime);
            setLocked(true);
            if (!lockTracked.current && club?.id) {
                lockTracked.current = true;
                postTraining('public/track', { clubId: club.id, slug, type: 'preview_lock', atSec: Math.floor(v.currentTime) }).catch(() => {});
            }
        }
    };

    // ── El latido del progreso ───────────────────────────────────────────────
    const sendBeat = useCallback((deltaSec: number) => {
        const v = videoRef.current;
        if (!v || !club?.id || !slug) return;
        postTraining('public/progress', {
            clubId: club.id, slug,
            positionSec: Math.floor(v.currentTime || 0),
            deltaSec: Math.round(deltaSec),
        }).then(res => { if (res?.completed) setCompleted(true); }).catch(() => {});
    }, [club?.id, slug]);

    useEffect(() => {
        if (!playback) return;
        const timer = window.setInterval(() => {
            const v = videoRef.current;
            const now = Date.now();
            const wasPlaying = lastBeat.current.playing;
            const elapsed = (now - lastBeat.current.t) / 1000;
            lastBeat.current = { t: now, playing: Boolean(v && !v.paused && !v.ended) };
            if (v && wasPlaying && elapsed > 1) sendBeat(Math.min(elapsed, 15));
        }, 10_000);
        return () => window.clearInterval(timer);
    }, [playback, sendBeat]);

    const onPlay = () => { lastBeat.current = { t: Date.now(), playing: true }; };
    const onPauseOrEnd = () => {
        const now = Date.now();
        const elapsed = (now - lastBeat.current.t) / 1000;
        if (lastBeat.current.playing && elapsed > 1) sendBeat(Math.min(elapsed, 15));
        lastBeat.current = { t: now, playing: false };
    };

    const onLoadedMetadata = () => {
        const v = videoRef.current;
        if (v && playback && playback.startAt > 0) {
            try { v.currentTime = playback.startAt; } catch { /* algunos móviles lo rechazan antes de canplay */ }
        }
    };

    // ── Crear cuenta desde el candado ────────────────────────────────────────
    const doSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!club?.id || signupBusy) return;
        setSignupBusy(true);
        setSignupError(null);
        try {
            const res = await postTraining('public/signup', { ...signup, clubId: club.id, slug });
            // La sesión del asistente queda abierta en este navegador, con la
            // misma llave que usa todo el sitio (siteSession.ts).
            try { localStorage.setItem(TOKEN_KEY.attendee, res.token); } catch { /* modo privado */ }
            emitSessionChange();
            setShowSignup(false);
            const watch = await loadWatch();
            loadVideo(); loadComments();
            if (watch && watch.allowed === 'full') {
                const v = videoRef.current;
                const resumeAt = lockedAtRef.current || watch.startAt || 0;
                if (v) window.setTimeout(() => { try { v.currentTime = resumeAt; v.play().catch(() => {}); } catch { /* play manual */ } }, 150);
            }
        } catch (err: any) {
            setSignupError(err?.message || 'No pudimos crear la cuenta.');
        } finally {
            setSignupBusy(false);
        }
    };

    // ── Reacciones (v4.956) ──────────────────────────────────────────────────
    const darMeGusta = async () => {
        if (!club?.id || likeBusy) return;
        setLikeBusy(true);
        const quiere = !liked;
        setLiked(quiere);
        setLikes(n => Math.max(0, n + (quiere ? 1 : -1)));
        try {
            const res = await postTraining('public/like', { clubId: club.id, slug, liked: quiere });
            if (res?.ok) { setLiked(res.liked); setLikes(res.likes); }
        } catch {
            // Se revierte el optimismo: el servidor es quien cuenta.
            setLiked(!quiere);
            setLikes(n => Math.max(0, n + (quiere ? -1 : 1)));
        } finally {
            setLikeBusy(false);
        }
    };

    const trackShare = () => {
        if (shareTracked.current || !club?.id) return;
        shareTracked.current = true;
        postTraining('public/track', { clubId: club.id, slug, type: 'share' }).catch(() => {});
    };

    const compartir = async () => {
        const url = window.location.href;
        const title = data?.video?.title || 'Capacitación';
        if (navigator.share) {
            try { await navigator.share({ title, url }); trackShare(); } catch { /* canceló */ }
            return;
        }
        setShareOpen(o => !o);
    };

    const shareLinks = () => {
        const url = encodeURIComponent(window.location.href);
        const text = encodeURIComponent(data?.video?.title || 'Capacitación');
        return [
            ['WhatsApp', `https://wa.me/?text=${text}%20${url}`],
            ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${url}`],
            ['X', `https://twitter.com/intent/tweet?text=${text}&url=${url}`],
            ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${url}`],
        ] as const;
    };

    const abrirLogin = () => {
        if (club?.id) postTraining('public/track', { clubId: club.id, slug, type: 'login_from_lock' }).catch(() => {});
        openLoginModal({ reason: 'Inicia sesión para continuar viendo esta capacitación.' });
    };

    // ── Comentarios ──────────────────────────────────────────────────────────
    const enviarComentario = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!club?.id || sending || !commentBody.trim()) return;
        setSending(true);
        setCommentError(null);
        try {
            await postTraining('public/comments', { clubId: club.id, slug, body: commentBody, parentId: replyTo?.id || null });
            setCommentBody('');
            setReplyTo(null);
            loadComments();
        } catch (err: any) {
            if (err?.status === 401) openLoginModal({ reason: 'Inicia sesión para comentar.' });
            else setCommentError(err?.message || 'No se pudo publicar el comentario.');
        } finally {
            setSending(false);
        }
    };

    const totalComments = useMemo(
        () => comments.reduce((a, c) => a + (c.status === 'visible' ? 1 : 0) + (c.replies?.length || 0), 0),
        [comments]
    );

    // ── Render ───────────────────────────────────────────────────────────────
    if (!club) {
        return <Shell><div className="min-h-[50vh] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rotary-blue" /></div></Shell>;
    }
    if (notFound) {
        return (
            <Shell>
                <div className="max-w-2xl mx-auto px-4 py-24 text-center">
                    <GraduationCap className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <h1 className="text-2xl font-light text-gray-800 mb-2">Capacitación no encontrada</h1>
                    <p className="text-gray-500 mb-6">Puede que se haya retirado o que el enlace esté incompleto.</p>
                    <Link to="/capacitaciones" className={`${ctaSkin(CTA_SOLID)} inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm`}>
                        <ArrowLeft className="w-4 h-4" /> Ver todas las capacitaciones
                    </Link>
                </div>
            </Shell>
        );
    }
    if (failed) {
        return <Shell><div className="max-w-2xl mx-auto px-4 py-24 text-center text-gray-600">No se pudo cargar la capacitación. Recarga la página para intentarlo de nuevo.</div></Shell>;
    }
    if (!data) {
        return <Shell><div className="min-h-[50vh] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rotary-blue" /></div></Shell>;
    }

    const { video, access } = data;
    const sinRol = access.allowed === 'none' && access.reason === 'sin_rol';

    return (
        <Shell>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <Link to="/capacitaciones" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-rotary-blue mb-4">
                    <ArrowLeft className="w-4 h-4" /> {data.channel.name}
                </Link>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        {/* El reproductor */}
                        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
                            {playback ? (
                                <video
                                    ref={videoRef}
                                    src={playback.url}
                                    controls={!locked}
                                    playsInline
                                    poster={video.thumbUrl || undefined}
                                    className={`w-full h-full ${locked ? 'blur-sm scale-105' : ''}`}
                                    onTimeUpdate={onTimeUpdate}
                                    onLoadedMetadata={onLoadedMetadata}
                                    onPlay={onPlay}
                                    onPause={onPauseOrEnd}
                                    onEnded={onPauseOrEnd}
                                />
                            ) : (
                                <div className="w-full h-full">
                                    {video.thumbUrl && <img src={video.thumbUrl} alt={video.title} className="w-full h-full object-cover blur-sm scale-105 opacity-60" />}
                                </div>
                            )}

                            {/* El candado */}
                            {locked && (
                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4">
                                    <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl">
                                        <span className="w-12 h-12 rounded-full bg-sky-50 text-rotary-blue flex items-center justify-center mx-auto mb-4">
                                            <Lock className="w-5 h-5" />
                                        </span>
                                        {sinRol ? (
                                            <>
                                                <h3 className="text-lg font-bold text-gray-900 mb-2">Capacitación restringida</h3>
                                                <p className="text-sm text-gray-500 mb-5">Esta capacitación está disponible sólo para algunos perfiles. Si crees que te corresponde, escríbele al equipo organizador.</p>
                                            </>
                                        ) : showSignup ? (
                                            <>
                                                <h3 className="text-lg font-bold text-gray-900 mb-1">Crea tu cuenta</h3>
                                                <p className="text-sm text-gray-500 mb-4">Es gratis y te deja continuar exactamente donde ibas.</p>
                                                <form onSubmit={doSignup} className="space-y-3 text-left">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <input required value={signup.firstName} onChange={e => setSignup(s => ({ ...s, firstName: e.target.value }))} placeholder="Nombre" autoComplete="given-name" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                                        <input value={signup.lastName} onChange={e => setSignup(s => ({ ...s, lastName: e.target.value }))} placeholder="Apellido" autoComplete="family-name" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                                    </div>
                                                    <input required type="email" value={signup.email} onChange={e => setSignup(s => ({ ...s, email: e.target.value }))} placeholder="Correo electrónico" autoComplete="email" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                                    <input required type="password" minLength={8} value={signup.password} onChange={e => setSignup(s => ({ ...s, password: e.target.value }))} placeholder="Contraseña (mínimo 8 caracteres)" autoComplete="new-password" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                                    {signupError && <p className="text-sm text-red-600">{signupError}</p>}
                                                    <button type="submit" disabled={signupBusy} className={`${ctaSkin(CTA_SOLID)} w-full py-2.5 rounded-xl text-sm disabled:opacity-60`}>
                                                        {signupBusy ? 'Creando cuenta…' : 'Crear cuenta y continuar'}
                                                    </button>
                                                </form>
                                                <button onClick={() => setShowSignup(false)} className="mt-3 text-sm font-bold text-gray-400 hover:text-gray-600">Volver</button>
                                            </>
                                        ) : (
                                            <>
                                                <h3 className="text-lg font-bold text-gray-900 mb-2">Continúa aprendiendo</h3>
                                                <p className="text-sm text-gray-500 mb-5">
                                                    {access.allowed === 'preview' || playback?.allowed === 'preview'
                                                        ? 'Llegaste al final de la vista previa. Crea tu cuenta o inicia sesión para ver la capacitación completa.'
                                                        : 'Esta capacitación es para usuarios con cuenta. Crea la tuya o inicia sesión para verla completa.'}
                                                </p>
                                                <div className="space-y-2.5">
                                                    <button onClick={abrirLogin} className={`${ctaSkin(CTA_SOLID)} w-full py-2.5 rounded-xl text-sm`}>Iniciar sesión</button>
                                                    <button onClick={() => setShowSignup(true)} className={`${ctaSkin(CTA_SOFT)} w-full py-2.5 rounded-xl text-sm`}>Crear cuenta</button>
                                                </div>
                                            </>
                                        )}
                                        <Link to="/capacitaciones" className="mt-4 inline-block text-sm font-bold text-gray-400 hover:text-gray-600">
                                            Volver a capacitaciones
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* La vista previa se dice ANTES de que corte */}
                        {playback?.allowed === 'preview' && !locked && (
                            <p className="mt-3 text-sm text-gray-500">
                                Estás viendo una vista previa de <span data-no-translate>{fmtDuration(playback.allowedSec)}</span>. Inicia sesión o crea tu cuenta para verla completa.
                            </p>
                        )}

                        {/* La ficha, con la fila de canal y reacciones al estilo YouTube (v4.956) */}
                        <div className="mt-5">
                            <div className="flex items-start justify-between gap-3">
                                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug">{video.title}</h1>
                                {completed && (
                                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full shrink-0">
                                        <CheckCircle2 className="w-4 h-4" /> Completada
                                    </span>
                                )}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-200">
                                {/* El canal que publica */}
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="w-10 h-10 rounded-full bg-rotary-topbar text-white flex items-center justify-center overflow-hidden shrink-0">
                                        {data.channel.bannerUrl
                                            ? <img src={data.channel.bannerUrl} alt="" className="w-full h-full object-cover" />
                                            : <GraduationCap className="w-5 h-5" />}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="font-bold text-gray-900 truncate">{data.channel.name}</p>
                                        <p className="text-[12px] text-gray-500"><span data-no-translate>{data.channel.videosCount ?? 1}</span> capacitaciones</p>
                                    </div>
                                </div>

                                {/* Reacciones */}
                                <div className="relative flex items-center gap-2">
                                    <button
                                        onClick={darMeGusta}
                                        disabled={likeBusy}
                                        aria-pressed={liked}
                                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors ${liked ? 'bg-rotary-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                        title={liked ? 'Quitar el me gusta' : 'Me gusta'}
                                    >
                                        <ThumbsUp className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                                        <span data-no-translate>{likes}</span>
                                    </button>
                                    <button
                                        onClick={compartir}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                                    >
                                        <Share2 className="w-4 h-4" /> Compartir
                                    </button>
                                    {shareOpen && (
                                        <div className="absolute right-0 top-11 z-10 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 w-44">
                                            {shareLinks().map(([nombre, href]) => (
                                                <a
                                                    key={nombre}
                                                    href={href}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={() => { trackShare(); setShareOpen(false); }}
                                                    className="block px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                                                    data-no-translate
                                                >
                                                    {nombre}
                                                </a>
                                            ))}
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(window.location.href); trackShare(); setShareOpen(false); }}
                                                className="w-full text-left px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
                                            >
                                                <Link2 className="w-4 h-4" /> Copiar enlace
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                                {video.views !== null && video.views !== undefined && (
                                    <span className="inline-flex items-center gap-1 font-bold text-gray-700"><Eye className="w-4 h-4" /><span data-no-translate>{video.views}</span> vistas</span>
                                )}
                                {video.publishedAt && <span data-no-translate>{fecha(video.publishedAt)}</span>}
                                {video.instructor && <span data-no-translate>{video.instructor}</span>}
                                {video.durationSec ? <span data-no-translate>{fmtDuration(video.durationSec)}</span> : null}
                                {video.category && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[12px] font-bold">{video.category}</span>}
                            </div>
                            {video.description && (
                                <p className="mt-4 text-gray-600 whitespace-pre-line leading-relaxed">{video.description}</p>
                            )}
                        </div>

                        {/* Comentarios */}
                        {video.commentsEnabled && (
                            <section className="mt-10">
                                <h2 className="text-xl font-light text-gray-800 mb-4 flex items-center gap-2">
                                    <MessageCircle className="w-5 h-5 text-rotary-blue" /> Comentarios
                                    {totalComments > 0 && <span className="text-sm text-gray-400" data-no-translate>({totalComments})</span>}
                                </h2>

                                {data.viewer.authenticated ? (
                                    <form onSubmit={enviarComentario} className="mb-6">
                                        {replyTo && (
                                            <p className="text-sm text-gray-500 mb-1.5">
                                                Respondiendo a <strong data-no-translate>{replyTo.authorName}</strong>
                                                <button type="button" onClick={() => setReplyTo(null)} className="ml-2 text-rotary-blue font-bold">Cancelar</button>
                                            </p>
                                        )}
                                        <div className="flex gap-2">
                                            <textarea
                                                value={commentBody}
                                                onChange={e => setCommentBody(e.target.value)}
                                                rows={2}
                                                maxLength={2000}
                                                placeholder="Escribe un comentario…"
                                                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-y"
                                            />
                                            <button type="submit" disabled={sending || !commentBody.trim()} className={`${ctaSkin(CTA_SOLID)} px-4 rounded-xl disabled:opacity-50 self-stretch`} aria-label="Publicar comentario">
                                                <Send className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {commentError && <p className="mt-1.5 text-sm text-red-600">{commentError}</p>}
                                    </form>
                                ) : (
                                    <button onClick={() => openLoginModal({ reason: 'Inicia sesión para comentar.' })} className="mb-6 text-sm font-bold text-rotary-blue hover:underline">
                                        Inicia sesión para comentar
                                    </button>
                                )}

                                {comments.length === 0 ? (
                                    <p className="text-sm text-gray-400">Todavía no hay comentarios. Sé quien abra la conversación.</p>
                                ) : (
                                    <div className="space-y-5">
                                        {comments.map(c => (
                                            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                                                {c.status === 'borrado' ? (
                                                    <p className="text-sm text-gray-400 italic">Comentario eliminado.</p>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center gap-2 text-sm">
                                                            <strong className="text-gray-800" data-no-translate>{c.authorName}</strong>
                                                            {c.pinned && <span className="text-[11px] font-bold text-rotary-blue bg-sky-50 px-1.5 py-0.5 rounded">Fijado</span>}
                                                            <span className="text-gray-400" data-no-translate>{fecha(c.createdAt)}</span>
                                                        </div>
                                                        <p className="mt-1.5 text-sm text-gray-600 whitespace-pre-line">{c.body}</p>
                                                        {data.viewer.authenticated && (
                                                            <button onClick={() => setReplyTo(c)} className="mt-1.5 text-[12px] font-bold text-gray-400 hover:text-rotary-blue">Responder</button>
                                                        )}
                                                    </>
                                                )}
                                                {(c.replies || []).map(r => (
                                                    <div key={r.id} className="mt-3 ml-5 pl-4 border-l-2 border-gray-100">
                                                        <div className="flex items-center gap-2 text-sm">
                                                            <strong className="text-gray-800" data-no-translate>{r.authorName}</strong>
                                                            <span className="text-gray-400" data-no-translate>{fecha(r.createdAt)}</span>
                                                        </div>
                                                        <p className="mt-1 text-sm text-gray-600 whitespace-pre-line">{r.body}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </div>

                    {/* Más capacitaciones */}
                    <aside>
                        <h2 className="text-lg font-light text-gray-800 mb-4">Más capacitaciones</h2>
                        <div className="space-y-3">
                            {data.others.length === 0 && <p className="text-sm text-gray-400">No hay más capacitaciones publicadas.</p>}
                            {data.others.map(o => (
                                <Link key={o.slug} to={`/capacitaciones/${o.slug}`} className="group flex gap-3 bg-white rounded-xl border border-gray-100 p-2.5 hover:shadow-md transition-shadow">
                                    <div className="relative w-28 shrink-0 aspect-video rounded-lg overflow-hidden bg-gray-900">
                                        {o.thumbUrl
                                            ? <img src={o.thumbUrl} alt={o.title} loading="lazy" className="w-full h-full object-cover" />
                                            : <div className="w-full h-full flex items-center justify-center text-gray-500"><Play className="w-4 h-4" /></div>}
                                        {o.durationSec ? <span className="absolute bottom-1 right-1 text-[10px] font-bold text-white bg-black/70 px-1 rounded" data-no-translate>{fmtDuration(o.durationSec)}</span> : null}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-2 group-hover:text-rotary-blue">{o.title}</p>
                                        {o.instructor && <p className="text-[12px] text-gray-400 truncate mt-0.5" data-no-translate>{o.instructor}</p>}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </aside>
                </div>
            </div>
        </Shell>
    );
};

export default CapacitacionDetalle;
