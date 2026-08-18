/**
 * Distribución multi-destino — el asistente y el historial.
 *
 * v4.864. Seis pasos: Contenido → Destinos → Copy → Programación → Vista
 * previa → Confirmar. La cola avanza sola por el cron; esta pantalla la sondea
 * mientras hay trabajo y deja pausar, reanudar, cancelar y reintentar un
 * destino suelto.
 *
 * ⚠️ TODOS LOS HOOKS VAN ARRIBA, antes de cualquier `return`. React identifica
 * cada hook por su ORDEN de llamada: un hook debajo de un return temprano no se
 * ejecuta en el primer render y sí en el segundo, y el árbol entero se cae —
 * pantalla en blanco, que el typecheck no ve. Lo comprueba npm run check:hooks.
 *
 * ⚠️ Y ninguna dependencia de un `useCallback` que arme una petición puede
 * faltar: el código compila igual y el ajuste simplemente NO LLEGA al servidor.
 * Ya pasó con `conQr` (v4.836) y con `profileId` (v4.838).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Send, Users, CalendarDays, AlertTriangle, XCircle,
    Pause, Play, RotateCcw, Plus, Trash2, Search, Info, Hand, Loader2, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    statusUI, campaignUI, TONE_CLASS, CONTENT_KIND_UI, TARGET_TYPE_UI,
    INTERVAL_PRESETS, MIN_INTERVAL_MINUTES, MANUAL_NOTICE,
    parseGroupLines, MIS_GRUPOS_URL,
    type ContentKind,
} from '../../../lib/distributionSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

type Target = {
    key: string; targetType: string; targetId: string; targetName: string;
    socialAccountId?: string | null; targetUrl?: string | null;
    avatar?: string | null; needsReconnect?: boolean; tag?: string | null;
};
type Job = {
    id: string; targetType: string; targetId: string; targetName: string | null;
    targetUrl: string | null; status: string; scheduledAt: string; attempts: number;
    externalUrl: string | null; publishedAt: string | null; publishedBy: string | null;
    error: string | null;
};
type Campaign = {
    id: string; name: string; status: string; createdAt: string; intervalMinutes: number;
    timezone: string; jobs?: Job[]; counts?: Record<string, number>;
    total?: number; publicados?: number; fallidos?: number; manuales?: number;
    pausedReason?: string | null; notes?: { warnings?: string[] } | null;
};

// ── Piezas sin estado. Se declaran FUERA del componente: dentro se
// redefinirían en cada render y React remontaría el subárbol entero.
const Chip: React.FC<{ tone: keyof typeof TONE_CLASS; children: React.ReactNode }> = ({ tone, children }) => (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${TONE_CLASS[tone]}`}>
        {children}
    </span>
);

const Paso: React.FC<{ n: number; titulo: string; hint?: string; children: React.ReactNode }> = ({ n, titulo, hint, children }) => (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-baseline gap-3 mb-1">
            <span className="text-xs font-mono font-bold text-indigo-500">{String(n).padStart(2, '0')}</span>
            <h3 className="font-black text-gray-900">{titulo}</h3>
        </div>
        {hint && <p className="text-sm text-gray-500 mb-4 ml-8">{hint}</p>}
        <div className="ml-0 sm:ml-8">{children}</div>
    </section>
);

const localTimezone = () => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

const fmtHora = (iso: string, tz: string) => {
    try {
        return new Intl.DateTimeFormat('es-CO', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    } catch { return iso; }
};
const fmtDia = (dateKey: string) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    try {
        return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
    } catch { return dateKey; }
};

const DistributionPanel: React.FC = () => {
    // ── Estado del asistente ────────────────────────────────────────────────
    const [vista, setVista] = useState<'nuevo' | 'historial'>('nuevo');
    const [kind, setKind] = useState<ContentKind>('image');
    const [message, setMessage] = useState('');
    const [link, setLink] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [sourceType, setSourceType] = useState<'manual' | 'share'>('manual');

    // Carril «compartir»: una publicación existente de una Página.
    const [shareAccountId, setShareAccountId] = useState('');
    const [pagePosts, setPagePosts] = useState<Array<{ id: string; message: string; permalink: string | null; createdTime: string | null; picture: string | null }>>([]);
    const [cargandoPosts, setCargandoPosts] = useState(false);
    const [postElegido, setPostElegido] = useState<string | null>(null);

    // Destinos
    const [accounts, setAccounts] = useState<Target[]>([]);
    const [groups, setGroups] = useState<Target[]>([]);
    const [elegidos, setElegidos] = useState<string[]>([]);
    const [busqueda, setBusqueda] = useState('');
    const [pegado, setPegado] = useState('');

    // Programación
    const [arranque, setArranque] = useState<'ahora' | 'fecha'>('ahora');
    const [startAt, setStartAt] = useState('');
    const [intervalo, setIntervalo] = useState(15);
    const [conVentana, setConVentana] = useState(false);
    const [ventanaDesde, setVentanaDesde] = useState('08:00');
    const [ventanaHasta, setVentanaHasta] = useState('18:00');
    const [porDia, setPorDia] = useState<string>('');

    // Vista previa y envío
    const [preview, setPreview] = useState<{ days: Array<{ dateKey: string; items: Array<{ at: string; targetName: string | null; viaApi: boolean }> }>; warnings: string[]; errors: string[]; total: number; ok: boolean } | null>(null);
    const [calculando, setCalculando] = useState(false);
    const [enviando, setEnviando] = useState(false);

    // Historial
    const [campanas, setCampanas] = useState<Campaign[]>([]);
    const [abierta, setAbierta] = useState<Campaign | null>(null);
    const [cargando, setCargando] = useState(false);

    const tz = useMemo(() => localTimezone(), []);

    const contenido = useMemo(
        () => ({ kind, message, link: kind === 'link' ? link : '', mediaUrl: (kind === 'image' || kind === 'video') ? mediaUrl : '' }),
        [kind, message, link, mediaUrl]
    );

    const postSeleccionado = useMemo(() => pagePosts.find(p => p.id === postElegido) || null, [pagePosts, postElegido]);
    const todos = useMemo(() => [...accounts, ...groups], [accounts, groups]);
    const seleccionados = useMemo(() => todos.filter(t => elegidos.includes(t.key)), [todos, elegidos]);
    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return todos;
        return todos.filter(t => t.targetName.toLowerCase().includes(q) || (t.tag || '').toLowerCase().includes(q));
    }, [todos, busqueda]);
    const manuales = useMemo(() => seleccionados.filter(t => !TARGET_TYPE_UI[t.targetType as keyof typeof TARGET_TYPE_UI]?.viaApi).length, [seleccionados]);

    // ── Carga ───────────────────────────────────────────────────────────────
    const cargarDestinos = useCallback(async () => {
        try {
            const r = await fetch(`${API}/distribution/targets`, { headers: authHeaders() });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudieron cargar los destinos');
            const d = await r.json();
            setAccounts(d.accounts || []);
            setGroups(d.groups || []);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al cargar destinos');
        }
    }, []);

    const cargarCampanas = useCallback(async () => {
        setCargando(true);
        try {
            const r = await fetch(`${API}/distribution/campaigns`, { headers: authHeaders() });
            if (r.ok) setCampanas((await r.json()).campaigns || []);
        } catch { /* la pantalla ya muestra la lista vacía */ }
        finally { setCargando(false); }
    }, []);

    const abrirCampana = useCallback(async (id: string) => {
        try {
            const r = await fetch(`${API}/distribution/campaigns/${id}`, { headers: authHeaders() });
            if (!r.ok) throw new Error('No se pudo abrir la campaña');
            setAbierta(await r.json());
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        }
    }, []);

    useEffect(() => { cargarDestinos(); cargarCampanas(); }, [cargarDestinos, cargarCampanas]);

    // El sondeo SÓLO existe mientras hay trabajo: con la campaña terminada el
    // efecto se desmonta y no se consulta más. Es una de las tres vías que
    // llaman a `advance` —la más rápida cuando alguien está mirando— y ninguna
    // sustituye al cron.
    useEffect(() => {
        const viva = abierta && ['scheduled', 'running'].includes(abierta.status);
        if (!viva) return;
        const id = window.setInterval(async () => {
            try {
                const r = await fetch(`${API}/distribution/campaigns/${abierta!.id}/advance`, { method: 'POST', headers: jsonHeaders() });
                if (r.ok) {
                    const d = await r.json();
                    if (d.campaign) setAbierta(d.campaign);
                }
            } catch { /* la vuelta siguiente reintenta */ }
        }, 6000);
        return () => window.clearInterval(id);
    }, [abierta]);

    // ── Acciones ────────────────────────────────────────────────────────────
    const cargarPosts = useCallback(async (accountId: string) => {
        if (!accountId) return;
        setCargandoPosts(true);
        try {
            const r = await fetch(`${API}/distribution/page-posts?accountId=${encodeURIComponent(accountId)}`, { headers: authHeaders() });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'No se pudieron cargar las publicaciones');
            setPagePosts(d.posts || []);
            if (!(d.posts || []).length) toast('Esta Página no tiene publicaciones recientes.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
            setPagePosts([]);
        } finally { setCargandoPosts(false); }
    }, []);

    const guardarGrupos = useCallback(async (lista: Target[]) => {
        try {
            const r = await fetch(`${API}/distribution/groups`, {
                method: 'PUT', headers: jsonHeaders(),
                body: JSON.stringify({ groups: lista.map(g => ({ id: g.targetId, name: g.targetName, url: g.targetUrl, tag: g.tag })) }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
            setGroups(d.groups || []);
            if (d.descartados) toast(`${d.descartados} sin nombre o sin enlace: no se guardaron.`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al guardar los grupos');
        }
    }, []);

    /**
     * Pegar todos los grupos de una vez.
     *
     * Meta no dice en qué grupos está una Página —la Groups API se retiró
     * entera, también la parte de lectura—, así que la lista no se puede
     * descubrir. Lo que sí se puede es que declararla cueste UN gesto en vez
     * de veinticinco.
     */
    const agregarPegados = useCallback(() => {
        const { groups: nuevos, skipped } = parseGroupLines(pegado);
        if (!nuevos.length) {
            toast.error(skipped.length ? 'Ninguna línea se pudo interpretar.' : 'Pegá al menos un grupo.');
            return;
        }
        const yaEstan = new Set(groups.map(g => g.targetId));
        const entran = nuevos
            .filter(n => !yaEstan.has(n.url || n.name))
            .map<Target>(n => ({
                key: `group:${n.url || n.name}`, targetType: 'group_manual',
                targetId: n.url || n.name, targetName: n.name,
                targetUrl: n.url, tag: null,
            }));
        const repetidos = nuevos.length - entran.length;
        if (!entran.length) { toast('Esos grupos ya estaban en la lista.'); setPegado(''); return; }
        guardarGrupos([...groups, ...entran]);
        setPegado('');
        // Lo descartado se DICE: con veinte líneas pegadas, un descarte
        // silencioso deja sin saber cuáles entraron.
        const notas = [
            `${entran.length} ${entran.length === 1 ? 'grupo agregado' : 'grupos agregados'}`,
            repetidos ? `${repetidos} ya estaban` : null,
            skipped.length ? `${skipped.length} sin interpretar` : null,
        ].filter(Boolean).join(' · ');
        toast.success(notas);
    }, [pegado, groups, guardarGrupos]);

    /**
     * El cuerpo de la petición, en UN solo sitio.
     *
     * Que lo armen dos manejadores distintos —uno para la vista previa y otro
     * para confirmar— es exactamente cómo se llega a que el calendario que se
     * mostró no sea el que se guardó.
     */
    const cuerpo = useCallback(() => ({
        name: (message.trim().slice(0, 60) || 'Distribución') + '…',
        sourceType,
        content: contenido,
        targets: seleccionados.map(t => ({
            targetType: t.targetType, targetId: t.targetId, targetName: t.targetName,
            socialAccountId: t.socialAccountId || null, targetUrl: t.targetUrl || null,
        })),
        intervalMinutes: intervalo,
        startAt: arranque === 'fecha' && startAt ? new Date(startAt).toISOString() : null,
        timezone: tz,
        scheduleWindow: conVentana ? { from: ventanaDesde, to: ventanaHasta } : null,
        perDay: porDia ? Number(porDia) : null,
    }), [message, sourceType, contenido, seleccionados, intervalo, arranque, startAt, tz, conVentana, ventanaDesde, ventanaHasta, porDia]);

    const calcular = useCallback(async () => {
        if (!seleccionados.length) { toast.error('Elegí al menos un destino.'); return; }
        setCalculando(true);
        try {
            const r = await fetch(`${API}/distribution/preview`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(cuerpo()) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'No se pudo calcular el calendario');
            setPreview(d);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        } finally { setCalculando(false); }
    }, [cuerpo, seleccionados.length]);

    const programar = useCallback(async () => {
        setEnviando(true);
        try {
            const r = await fetch(`${API}/distribution/campaigns`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(cuerpo()) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || (d.errors || []).join(' ') || 'No se pudo programar');
            toast.success(`${d.created} destinos programados cada ${d.interval} min.`);
            setPreview(null);
            setElegidos([]);
            await cargarCampanas();
            setVista('historial');
            await abrirCampana(d.campaignId);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        } finally { setEnviando(false); }
    }, [cuerpo, cargarCampanas, abrirCampana]);

    const accionCampana = useCallback(async (id: string, accion: 'pause' | 'resume' | 'cancel') => {
        if (accion === 'cancel' && !window.confirm(
            'Cancelar detiene lo que falta: no se publica en los destinos pendientes.\n\nLo que YA se publicó no se puede retirar desde acá — eso se hace en Facebook.\n\n¿Continuar?'
        )) return;
        try {
            const r = await fetch(`${API}/distribution/campaigns/${id}/${accion}`, { method: 'POST', headers: jsonHeaders() });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo');
            await abrirCampana(id);
            await cargarCampanas();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        }
    }, [abrirCampana, cargarCampanas]);

    const accionJob = useCallback(async (jobId: string, accion: 'retry' | 'manual', postUrl?: string) => {
        try {
            const r = await fetch(`${API}/distribution/jobs/${jobId}/${accion}`, {
                method: 'POST', headers: jsonHeaders(),
                body: JSON.stringify(accion === 'manual' ? { postUrl: postUrl || null } : {}),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'No se pudo');
            toast.success(accion === 'retry' ? 'Se reintenta ese destino.' : 'Registrado.');
            if (abierta) await abrirCampana(abierta.id);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        }
    }, [abierta, abrirCampana]);

    const alternar = (key: string) =>
        setElegidos(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

    // ── Pintado ─────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* El hallazgo va ARRIBA, donde se mira primero. Un módulo que se
                llama «grupos» y no publica en grupos automáticamente tiene que
                decirlo antes de que alguien lo intente. */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-4">
                <Info className="w-5 h-5 text-amber-600 flex-none mt-0.5" />
                <div className="text-sm text-amber-900">
                    <p className="font-bold mb-1">Las Páginas e Instagram se publican solos. Los grupos, no.</p>
                    <p>{MANUAL_NOTICE}</p>
                </div>
            </div>

            <div className="flex gap-2">
                <button onClick={() => setVista('nuevo')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${vista === 'nuevo' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    Nueva distribución
                </button>
                <button onClick={() => { setVista('historial'); cargarCampanas(); }} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${vista === 'historial' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    Historial de distribuciones
                </button>
            </div>

            {vista === 'nuevo' && (
                <div className="space-y-5">
                    <Paso n={1} titulo="Contenido" hint="Qué se va a distribuir. Podés escribirlo acá o compartir una publicación que ya está en una de tus Páginas.">
                        <div className="flex gap-2 mb-4">
                            <button onClick={() => setSourceType('manual')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sourceType === 'manual' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>Contenido nuevo</button>
                            <button onClick={() => { setSourceType('share'); setKind('link'); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sourceType === 'share' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>Compartir una publicación</button>
                        </div>

                        {sourceType === 'share' && (
                            <div className="mb-5 p-4 bg-gray-50 rounded-xl space-y-3">
                                <p className="text-xs text-gray-600">
                                    Meta no expone un «compartir» de API: se crea una publicación nueva con el enlace a la original. Así la publicación original sigue siendo la que acumula reacciones.
                                </p>
                                <select
                                    value={shareAccountId}
                                    onChange={e => { setShareAccountId(e.target.value); cargarPosts(e.target.value); }}
                                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                                >
                                    <option value="">Elegí la Página de origen…</option>
                                    {accounts.filter(a => a.targetType === 'page').map(a => (
                                        <option key={a.key} value={a.socialAccountId || ''}>{a.targetName}</option>
                                    ))}
                                </select>
                                {cargandoPosts && <p className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Cargando publicaciones…</p>}
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {pagePosts.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => { setPostElegido(p.id); setLink(p.permalink || ''); setKind('link'); }}
                                            className={`w-full text-left p-3 rounded-lg border text-xs transition-colors flex gap-3 items-start ${postElegido === p.id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                        >
                                            {p.picture
                                                ? <img src={p.picture} alt="" loading="lazy"
                                                       onError={e => { e.currentTarget.style.display = 'none'; }}
                                                       className="w-12 h-12 rounded object-cover flex-none bg-gray-100" />
                                                : <span className="w-12 h-12 rounded bg-gray-100 flex-none" aria-hidden="true" />}
                                            <span className="min-w-0">
                                                <span className="line-clamp-2 text-gray-700 block">{p.message || '(sin texto)'}</span>
                                                {p.createdTime && <span className="block mt-1 text-[10px] text-gray-400">{new Date(p.createdTime).toLocaleString('es-CO')}</span>}
                                            </span>
                                        </button>
                                    ))}
                                </div>

                                {/* La vista previa de lo que se eligió. Sin esto hay que
                                    decidir sobre dos líneas recortadas — y lo que se
                                    distribuye a veinte destinos conviene verlo entero. */}
                                {postSeleccionado && (
                                    <div className="rounded-xl border border-indigo-200 bg-white overflow-hidden">
                                        <p className="px-4 pt-3 text-[10px] font-mono uppercase tracking-wider text-indigo-500">Vista previa de la publicación</p>
                                        {postSeleccionado.picture && (
                                            // La URL de `full_picture` va FIRMADA y caduca. Si no
                                            // carga se esconde el nodo: una franja vacía de 288 px
                                            // se lee como que la publicación no tiene nada.
                                            <img src={postSeleccionado.picture} alt="" loading="lazy"
                                                 onError={e => { e.currentTarget.style.display = 'none'; }}
                                                 className="w-full max-h-72 object-contain bg-gray-50 mt-2" />
                                        )}
                                        <div className="p-4 space-y-2">
                                            <p className="text-sm text-gray-800 whitespace-pre-line">{postSeleccionado.message || '(esta publicación no tiene texto)'}</p>
                                            <div className="flex items-center gap-3 text-[11px] text-gray-500">
                                                {postSeleccionado.createdTime && <span>{new Date(postSeleccionado.createdTime).toLocaleString('es-CO')}</span>}
                                                {postSeleccionado.permalink && (
                                                    <a href={postSeleccionado.permalink} target="_blank" rel="noopener noreferrer"
                                                       className="text-indigo-600 font-bold flex items-center gap-1">
                                                        Ver en Facebook <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-gray-500 pt-2 border-t border-gray-100">
                                                A cada destino le va a llegar el texto que escribas abajo más el enlace a esta publicación. Esta de acá sigue siendo la que acumula reacciones.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                            {(Object.keys(CONTENT_KIND_UI) as ContentKind[]).map(k => (
                                <button key={k} onClick={() => setKind(k)} title={CONTENT_KIND_UI[k].hint}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${kind === k ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                                    {CONTENT_KIND_UI[k].label}
                                </button>
                            ))}
                        </div>

                        <textarea
                            value={message} onChange={e => setMessage(e.target.value)} rows={4}
                            placeholder="El texto que acompaña la publicación…"
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-3"
                        />
                        {kind === 'link' && (
                            <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://…"
                                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-3" />
                        )}
                        {(kind === 'image' || kind === 'video') && (
                            <input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="URL pública del archivo (Biblioteca Multimedia)"
                                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-1" />
                        )}
                        {(kind === 'image' || kind === 'video') && (
                            <p className="text-[11px] text-gray-400">Meta descarga el archivo desde esa dirección, así que tiene que ser pública. Las de la Biblioteca lo son.</p>
                        )}
                    </Paso>

                    <Paso n={2} titulo="Destinos" hint="Sólo aparecen las cuentas conectadas en Cuentas Sociales. Los grupos se declaran a mano porque Meta ya no permite consultarlos.">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar destino…"
                                    className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2" />
                            </div>
                            <button onClick={() => setElegidos(visibles.map(t => t.key))} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 whitespace-nowrap px-2">Todos</button>
                            <button onClick={() => setElegidos([])} className="text-xs font-bold text-gray-500 hover:text-gray-700 whitespace-nowrap px-2">Ninguno</button>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2 mb-4 max-h-80 overflow-y-auto">
                            {visibles.map(t => {
                                const ui = TARGET_TYPE_UI[t.targetType as keyof typeof TARGET_TYPE_UI];
                                const on = elegidos.includes(t.key);
                                return (
                                    <button key={t.key} onClick={() => alternar(t.key)}
                                        className={`text-left p-3 rounded-xl border transition-colors ${on ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-bold text-sm text-gray-800 truncate">{t.targetName}</span>
                                            {!ui?.viaApi && <Chip tone="warn">A mano</Chip>}
                                        </div>
                                        <span className="text-[11px] text-gray-500">{ui?.label || t.targetType}</span>
                                        {t.needsReconnect && <span className="block text-[11px] text-red-600 font-bold mt-1">Requiere reconexión</span>}
                                    </button>
                                );
                            })}
                            {!visibles.length && <p className="text-sm text-gray-400 col-span-2 py-6 text-center">No hay destinos que coincidan.</p>}
                        </div>

                        <details className="bg-gray-50 rounded-xl p-4" open={!groups.length}>
                            <summary className="cursor-pointer text-sm font-bold text-gray-700">Declarar los grupos de Facebook</summary>
                            {/* Se explica el porqué, no sólo el cómo: sin el motivo, que
                                la lista se escriba a mano se lee como una función a medias. */}
                            <p className="text-xs text-gray-500 mt-2">
                                <strong>Meta no dice en qué grupos está una Página.</strong> Retiró la API de Grupos el 22 de abril de 2024 —también la parte de lectura—, así que no hay forma de consultarlos y la lista se declara una vez.
                            </p>
                            <p className="text-xs text-gray-500 mt-1 mb-3">
                                Pegalos todos de una vez, uno por línea. Vale el enlace solo, o <code className="bg-white px-1 rounded">Nombre | enlace</code>.{' '}
                                <a href={MIS_GRUPOS_URL} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold">Ver mis grupos en Facebook</a> para copiarlos.
                            </p>
                            <textarea
                                value={pegado} onChange={e => setPegado(e.target.value)} rows={4}
                                placeholder={'Rotary Colombia | https://facebook.com/groups/123456\nhttps://facebook.com/groups/rotary-4281\nClubes Rotarios | https://facebook.com/groups/987654'}
                                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono text-xs"
                            />
                            <button onClick={agregarPegados} className="mt-2 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-bold flex items-center gap-1.5">
                                <Plus className="w-4 h-4" /> Agregar los grupos pegados
                            </button>
                            {groups.length > 0 && (
                                <ul className="mt-3 space-y-1">
                                    {groups.map(g => (
                                        <li key={g.key} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
                                            <span className="font-semibold text-gray-700">{g.targetName}</span>
                                            <button onClick={() => guardarGrupos(groups.filter(x => x.key !== g.key))} className="text-gray-400 hover:text-red-600" aria-label={`Quitar ${g.targetName}`}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </details>

                        <p className="text-xs text-gray-500 mt-3">
                            <Users className="w-3.5 h-3.5 inline mr-1" />
                            {seleccionados.length} destinos elegidos{manuales > 0 && `, ${manuales} de ellos a mano`}.
                        </p>
                    </Paso>

                    <Paso n={3} titulo="Programación e intervalo" hint="Cada destino sale por separado, con la cadencia que elijas. El intervalo existe para sostener un ritmo responsable, no para eludir los controles de Meta.">
                        <div className="flex gap-2 mb-4">
                            <button onClick={() => setArranque('ahora')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${arranque === 'ahora' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>Empezar ahora</button>
                            <button onClick={() => setArranque('fecha')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${arranque === 'fecha' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>Programar inicio</button>
                        </div>
                        {arranque === 'fecha' && (
                            <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)}
                                className="text-sm border border-gray-200 rounded-lg px-3 py-2 mb-4" />
                        )}

                        <label className="block text-xs font-bold text-gray-600 mb-2">Intervalo entre publicaciones</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {INTERVAL_PRESETS.map(m => (
                                <button key={m} onClick={() => setIntervalo(m)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${intervalo === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                    {m < 60 ? `${m} min` : '1 hora'}
                                </button>
                            ))}
                            <input type="number" min={MIN_INTERVAL_MINUTES} value={intervalo}
                                onChange={e => setIntervalo(Math.max(MIN_INTERVAL_MINUTES, Number(e.target.value) || MIN_INTERVAL_MINUTES))}
                                className="w-24 text-xs border border-gray-200 rounded-lg px-2 py-1.5" aria-label="Intervalo personalizado en minutos" />
                        </div>
                        <p className="text-[11px] text-gray-400 mb-4">El mínimo son {MIN_INTERVAL_MINUTES} minutos: la cola se revisa una vez por minuto y por debajo de eso la cadencia no se puede sostener.</p>

                        <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                            <input type="checkbox" checked={conVentana} onChange={e => setConVentana(e.target.checked)} />
                            Publicar sólo dentro de una franja horaria
                        </label>
                        {conVentana && (
                            <div className="flex items-center gap-2 mb-4 ml-6">
                                <input type="time" value={ventanaDesde} onChange={e => setVentanaDesde(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" aria-label="Desde" />
                                <span className="text-gray-400 text-sm">a</span>
                                <input type="time" value={ventanaHasta} onChange={e => setVentanaHasta(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" aria-label="Hasta" />
                                <span className="text-[11px] text-gray-400">hora de {tz}</span>
                            </div>
                        )}

                        <label className="block text-xs font-bold text-gray-600 mb-1">Máximo de destinos por día</label>
                        <input type="number" min={1} value={porDia} onChange={e => setPorDia(e.target.value)} placeholder="sin tope"
                            className="w-32 text-sm border border-gray-200 rounded-lg px-3 py-2" />
                    </Paso>

                    <Paso n={4} titulo="Vista previa" hint="El calendario lo calcula el servidor: es exactamente el que se va a guardar.">
                        <button onClick={calcular} disabled={calculando || !seleccionados.length}
                            className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center gap-2">
                            {calculando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
                            Calcular el calendario
                        </button>

                        {preview && (
                            <div className="mt-5 space-y-4">
                                {preview.errors?.map((e, i) => (
                                    <p key={i} className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex gap-2"><XCircle className="w-4 h-4 flex-none mt-0.5" />{e}</p>
                                ))}
                                {preview.warnings?.map((w, i) => (
                                    <p key={i} className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 flex-none mt-0.5" />{w}</p>
                                ))}
                                {preview.days?.map(d => (
                                    <div key={d.dateKey}>
                                        <p className="text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-2">{fmtDia(d.dateKey)}</p>
                                        <ul className="border-l-2 border-gray-100 pl-4 space-y-1.5">
                                            {d.items.map((it, i) => (
                                                <li key={i} className="flex items-baseline gap-3 text-sm">
                                                    <time className="font-mono text-xs text-indigo-600 tabular-nums">{fmtHora(it.at, tz)}</time>
                                                    <span className="text-gray-700">{it.targetName}</span>
                                                    {!it.viaApi && <Chip tone="warn">A mano</Chip>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}

                                <div className="pt-3 border-t border-gray-100">
                                    {manuales > 0 && (
                                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                                            {manuales} de los {preview.total} destinos son grupos: la plataforma los deja listos y avisados, pero <strong>no los publica</strong>.
                                        </p>
                                    )}
                                    <button onClick={programar} disabled={enviando || !preview.ok}
                                        className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black disabled:opacity-40 flex items-center gap-2">
                                        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                        Programar la distribución
                                    </button>
                                </div>
                            </div>
                        )}
                    </Paso>
                </div>
            )}

            {vista === 'historial' && !abierta && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                    {cargando && <p className="p-6 text-sm text-gray-400">Cargando…</p>}
                    {!cargando && !campanas.length && <p className="p-6 text-sm text-gray-400">Todavía no hay distribuciones.</p>}
                    {campanas.map(c => {
                        const ui = campaignUI(c.status);
                        return (
                            <button key={c.id} onClick={() => abrirCampana(c.id)} className="w-full text-left p-5 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-gray-900 truncate">{c.name}</span>
                                        <Chip tone={ui.tone}>{ui.label}</Chip>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {c.total} destinos · {c.publicados} publicados · {c.fallidos} fallidos
                                        {(c.manuales ?? 0) > 0 && ` · ${c.manuales} a mano`}
                                        {' · cada '}{c.intervalMinutes} min
                                    </p>
                                </div>
                                <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString('es-CO')}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {vista === 'historial' && abierta && (
                <div className="space-y-4">
                    <button onClick={() => setAbierta(null)} className="text-sm text-gray-500 hover:text-gray-700 font-bold">← Volver al historial</button>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-black text-gray-900">{abierta.name}</h3>
                                    <Chip tone={campaignUI(abierta.status).tone}>{campaignUI(abierta.status).label}</Chip>
                                </div>
                                <p className="text-xs text-gray-500">
                                    {abierta.counts?.total} destinos · {abierta.counts?.ok} publicados · {abierta.counts?.fallo} fallidos · {abierta.counts?.abierto} pendientes
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {['scheduled', 'running'].includes(abierta.status) && (
                                    <button onClick={() => accionCampana(abierta.id, 'pause')} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-bold flex items-center gap-1.5"><Pause className="w-3.5 h-3.5" /> Pausar</button>
                                )}
                                {abierta.status === 'paused' && (
                                    <button onClick={() => accionCampana(abierta.id, 'resume')} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1.5"><Play className="w-3.5 h-3.5" /> Reanudar</button>
                                )}
                                {!['cancelled', 'done'].includes(abierta.status) && (
                                    <button onClick={() => accionCampana(abierta.id, 'cancel')} className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-bold">Cancelar</button>
                                )}
                            </div>
                        </div>

                        {abierta.pausedReason && (
                            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 flex gap-2">
                                <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />{abierta.pausedReason}
                            </p>
                        )}

                        <ul className="divide-y divide-gray-50">
                            {(abierta.jobs || []).map(j => {
                                const ui = statusUI(j.status);
                                const manual = !TARGET_TYPE_UI[j.targetType as keyof typeof TARGET_TYPE_UI]?.viaApi;
                                return (
                                    <li key={j.id} className="py-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-sm font-semibold text-gray-800 truncate">{j.targetName || j.targetId}</span>
                                                <Chip tone={ui.tone}>{ui.label}</Chip>
                                                {j.attempts > 1 && <span className="text-[10px] text-gray-400">{j.attempts} intentos</span>}
                                            </div>
                                            <p className="text-[11px] text-gray-500">
                                                {j.publishedAt
                                                    ? `Publicado ${new Date(j.publishedAt).toLocaleString('es-CO')}${j.publishedBy ? ` por ${j.publishedBy}` : ''}`
                                                    : `Programado ${new Date(j.scheduledAt).toLocaleString('es-CO')}`}
                                            </p>
                                            {j.error && <p className="text-[11px] text-red-600 mt-0.5">{j.error}</p>}
                                        </div>
                                        <div className="flex items-center gap-2 flex-none">
                                            {j.externalUrl && (
                                                <a href={j.externalUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-indigo-600" aria-label="Ver la publicación">
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            )}
                                            {manual && j.status === 'awaiting_manual' && (
                                                <>
                                                    {j.targetUrl && (
                                                        <a href={j.targetUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 bg-gray-100 rounded-lg text-[11px] font-bold text-gray-700">Abrir grupo</a>
                                                    )}
                                                    <button onClick={() => accionJob(j.id, 'manual')} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-bold flex items-center gap-1">
                                                        <Hand className="w-3 h-3" /> Ya lo publiqué
                                                    </button>
                                                </>
                                            )}
                                            {['failed', 'no_permission', 'rate_limited', 'needs_reconnect'].includes(j.status) && (
                                                <button onClick={() => accionJob(j.id, 'retry')} className="px-2.5 py-1 bg-gray-100 rounded-lg text-[11px] font-bold text-gray-700 flex items-center gap-1">
                                                    <RotateCcw className="w-3 h-3" /> Reintentar
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DistributionPanel;
