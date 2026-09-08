/**
 * Compartir una publicación en las redes conectadas (v4.1013).
 *
 * ⚠️ ES UN COMPONENTE COMPARTIDO, no una copia por pantalla. Lo montan el
 * listado de Noticias («Compartir») y la pestaña Redes Sociales del editor
 * («Publicar ahora»): son las DOS entradas del requisito, y con el modal
 * escrito dos veces el día que se agregue una red una de las dos se queda sin
 * ella —el defecto que ya se pagó con la casilla de distritos (v4.748) y con
 * `SubmissionDetail` (v4.999)—.
 *
 * ⚠️ LA PANTALLA NO DECIDE NADA. Qué páginas hay, cuáles sirven, si el
 * artículo se puede compartir y con qué texto sale lo resuelve el servidor y
 * viaja resuelto en `/social/share/targets`. Acá sólo se pinta y se pide.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Facebook, Instagram, Linkedin, Twitter, Share2, ExternalLink, AlertCircle,
    CheckCircle2, Loader2, Globe, History, RefreshCw, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ShareTargetsResponse, ShareOutcome, ShareHistoryEntry } from '../../../lib/socialShare';
import { hostOf, newOperationKey } from '../../../lib/socialShare';

const api = () => (import.meta.env.VITE_API_URL || '/api');
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

/** Ninguna respuesta se lee con `.json()` a ciegas: una página de error HTML
 *  rompe el parseo y el error resultante no nombra ninguna capa (v4.946). */
const leerJson = async (r: Response): Promise<any> => {
    const texto = await r.text();
    try { return texto ? JSON.parse(texto) : {}; }
    catch {
        return { __noJson: true, error: `El servidor respondió ${r.status} con algo que no es JSON (${(r.headers.get('content-type') || 'sin tipo')}).` };
    }
};

const ICONO: Record<string, React.ElementType> = {
    facebook: Facebook, instagram: Instagram, linkedin: Linkedin, x: Twitter,
};

// ── Piezas del modal, en el ÁMBITO DEL MÓDULO ────────────────────────────────
//
// ⚠️ Declaradas DENTRO del componente serían un tipo nuevo en cada render y
// React desmontaría el árbol a cada pulsación: el textarea perdería el foco
// tras una letra. Es exactamente el defecto de v4.971.

const IconoRed: React.FC<{ network: string; className?: string }> = ({ network, className }) => {
    const C = ICONO[network] || Share2;
    return <C className={className} />;
};

const Aviso: React.FC<{ tone: 'info' | 'warn' | 'bad'; children: React.ReactNode }> = ({ tone, children }) => {
    const piel = tone === 'bad'
        ? 'bg-red-50 border-red-200 text-red-800'
        : tone === 'warn'
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : 'bg-sky-50 border-sky-200 text-sky-800';
    return (
        <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs leading-relaxed ${piel}`}>
            {tone === 'info' ? <Info className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <div className="min-w-0">{children}</div>
        </div>
    );
};

const FilaHistorial: React.FC<{ e: ShareHistoryEntry }> = ({ e }) => (
    <li className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
        <div className={`p-1.5 rounded-lg flex-shrink-0 ${e.status === 'published' ? 'bg-emerald-50' : e.status === 'error' ? 'bg-red-50' : 'bg-gray-100'}`}>
            <IconoRed network={e.network} className={`w-3.5 h-3.5 ${e.status === 'published' ? 'text-emerald-600' : e.status === 'error' ? 'text-red-500' : 'text-gray-400'}`} />
        </div>
        <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-gray-800">
                {e.accountName || e.pageId || 'Página'}
                <span className={`ml-2 font-semibold ${e.status === 'published' ? 'text-emerald-600' : e.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
                    {e.status === 'published' ? 'Publicado' : e.status === 'error' ? 'Error de publicación' : 'Enviando…'}
                </span>
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
                {new Date(e.createdAt).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {e.userName ? ` · Por ${e.userName}` : ''}
            </p>
            {/* El motivo se lee ENTERO: recortado, lo que el servidor escribiera
                después de los primeros caracteres sería invisible (v4.1006). */}
            {e.status === 'error' && e.error && (
                <p className="text-[11px] text-red-600 mt-1 leading-relaxed">{e.error}</p>
            )}
            {e.status === 'published' && e.externalUrl && (
                <a href={e.externalUrl} target="_blank" rel="noopener noreferrer"
                   className="text-[11px] font-bold text-rotary-blue hover:underline inline-flex items-center gap-1 mt-1">
                    Ver publicación <ExternalLink className="w-3 h-3" />
                </a>
            )}
        </div>
    </li>
);

// ── El modal ─────────────────────────────────────────────────────────────────

interface Props {
    entityType?: string;
    entityId: string;
    /** Título de respaldo mientras carga: evita un modal en blanco. */
    fallbackTitle?: string;
    onClose: () => void;
    /** Se avisa al cerrar SI algo salió, para que el listado repinte su
     *  insignia sin recargar la pantalla entera. */
    onPublished?: () => void;
}

const ShareModal: React.FC<Props> = ({ entityType = 'post', entityId, fallbackTitle, onClose, onPublished }) => {
    const [datos, setDatos] = useState<ShareTargetsResponse | null>(null);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);
    const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
    const [mensaje, setMensaje] = useState('');
    const [publicando, setPublicando] = useState(false);
    const [resultados, setResultados] = useState<ShareOutcome[] | null>(null);
    const [verHistorial, setVerHistorial] = useState(false);

    // La clave de la operación se fija al ABRIR y sólo cambia si se pide
    // publicar de nuevo a propósito. Es lo que absorbe el doble clic.
    const opKey = useRef(newOperationKey());
    const publicoAlgo = useRef(false);

    const cargar = useCallback(async () => {
        setCargando(true); setErrorCarga(null);
        try {
            const r = await fetch(
                `${api()}/social/share/targets?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
                { headers: authHeaders() }
            );
            const d = await leerJson(r);
            if (!r.ok) throw new Error(d.error || `No se pudieron cargar las páginas (HTTP ${r.status}).`);
            setDatos(d);
            setMensaje(d.defaultMessage || '');
            // Se preselecciona SÓLO si hay una única página utilizable: con
            // varias, elegir por el usuario sería publicar donde no pidió.
            const listas = (d.targets || []).filter((t: any) => t.ready);
            setSeleccion(new Set(listas.length === 1 ? [listas[0].id] : []));
        } catch (e: any) {
            setErrorCarga(e.message || 'No se pudieron cargar las páginas conectadas.');
        } finally {
            setCargando(false);
        }
    }, [entityType, entityId]);

    useEffect(() => { cargar(); }, [cargar]);

    // Escape cierra. Un modal que sólo se cierra con su propia cruz atrapa.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !publicando) cerrar(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const cerrar = () => {
        if (publicoAlgo.current) onPublished?.();
        onClose();
    };

    const alternar = (id: string) => setSeleccion(prev => {
        const s = new Set(prev);
        s.has(id) ? s.delete(id) : s.add(id);
        return s;
    });

    const listas = useMemo(() => (datos?.targets || []).filter(t => t.ready), [datos]);
    const noListas = useMemo(() => (datos?.targets || []).filter(t => !t.ready), [datos]);
    const puedePublicar = !!datos?.shareable && seleccion.size > 0 && mensaje.trim().length > 0 && !publicando;

    const publicar = async () => {
        if (!puedePublicar) return;
        setPublicando(true);
        try {
            const r = await fetch(`${api()}/social/share`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    entityType, entityId,
                    accountIds: [...seleccion],
                    message: mensaje,
                    operationKey: opKey.current,
                }),
            });
            const d = await leerJson(r);
            if (d.__noJson) throw new Error(d.error);
            if (!r.ok && !Array.isArray(d.outcomes)) {
                // Un fallo previo a publicar: el servidor dice qué falta y dónde.
                throw new Error([d.error, d.fix].filter(Boolean).join(' '));
            }
            setResultados(d.outcomes || []);
            const ok = (d.outcomes || []).filter((o: ShareOutcome) => o.ok).length;
            if (ok > 0) {
                publicoAlgo.current = true;
                toast.success(ok === 1 ? 'Publicado en Facebook' : `Publicado en ${ok} páginas`);
            } else {
                toast.error('No se pudo publicar. Mirá el detalle por página.');
            }
            // El historial se recarga: el registro es lo que hace comprobable
            // que la publicación existe de verdad.
            const h = await fetch(
                `${api()}/social/share/history?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
                { headers: authHeaders() }
            );
            if (h.ok) {
                const hd = await leerJson(h);
                setDatos(prev => prev ? { ...prev, history: hd.entries || [], summary: hd.summary || null } : prev);
            }
        } catch (e: any) {
            toast.error(e.message || 'No se pudo publicar.');
        } finally {
            setPublicando(false);
        }
    };

    /** Publicar de nuevo es una decisión EXPLÍCITA y una operación nueva: con
     *  la misma clave, el candado la tomaría por el mismo envío y no saldría
     *  nada — que se leería como que el botón está roto. */
    const publicarDeNuevo = () => {
        opKey.current = newOperationKey();
        setResultados(null);
    };

    const dominio = hostOf(datos?.publicUrl);
    const yaSalio = datos?.summary?.published;

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
             onMouseDown={(e) => { if (e.target === e.currentTarget && !publicando) cerrar(); }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden">

                <div className="px-7 py-5 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Share2 className="w-4 h-4 text-rotary-blue" /> Compartir publicación
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {datos?.entity.title || fallbackTitle || 'Cargando…'}
                        </p>
                    </div>
                    <button onClick={cerrar} disabled={publicando}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-40">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-7 space-y-5">
                    {cargando && (
                        <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm font-medium">Consultando las páginas conectadas…</span>
                        </div>
                    )}

                    {!cargando && errorCarga && (
                        <div className="space-y-3">
                            <Aviso tone="bad">{errorCarga}</Aviso>
                            <button onClick={cargar} className="text-xs font-bold text-rotary-blue hover:underline inline-flex items-center gap-1">
                                <RefreshCw className="w-3 h-3" /> Reintentar
                            </button>
                        </div>
                    )}

                    {!cargando && !errorCarga && datos && (
                        <>
                            {/* ⚠️ El bloqueo se dice con su MOTIVO y su SALIDA.
                                Un botón apagado sin explicación se lee como que
                                el módulo está roto. */}
                            {!datos.shareable && (
                                <Aviso tone="warn">
                                    <p className="font-bold">{datos.shareReason}</p>
                                    {datos.shareFix && <p className="mt-1">{datos.shareFix}</p>}
                                </Aviso>
                            )}

                            {yaSalio && !resultados && (
                                <Aviso tone="info">
                                    <p className="font-bold">
                                        Este artículo ya se publicó {datos.summary!.count === 1 ? 'una vez' : `${datos.summary!.count} veces`} en redes.
                                    </p>
                                    <p className="mt-1">
                                        Volver a publicar crea una publicación NUEVA en Facebook; no reemplaza la anterior.
                                    </p>
                                </Aviso>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Columna izquierda: dónde y qué */}
                                <div className="space-y-5">
                                    <div>
                                        <h3 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3">
                                            Páginas disponibles
                                        </h3>
                                        {listas.length === 0 && noListas.length === 0 && (
                                            <Aviso tone="warn">
                                                <p className="font-bold">Este sitio no tiene ninguna página conectada.</p>
                                                <p className="mt-1">Conectá una desde Configuración → Redes Sociales (Hub Social).</p>
                                            </Aviso>
                                        )}
                                        <div className="space-y-2">
                                            {listas.map(t => (
                                                <label key={t.id}
                                                       className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                                           seleccion.has(t.id) ? 'bg-sky-50 border-sky-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                                                    <input type="checkbox" checked={seleccion.has(t.id)}
                                                           onChange={() => alternar(t.id)} disabled={publicando}
                                                           aria-label={`Publicar en ${t.name}`}
                                                           className="w-4 h-4 accent-rotary-blue cursor-pointer" />
                                                    {t.avatar
                                                        ? <img src={t.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                                                        : <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                                              <IconoRed network={t.network} className="w-4 h-4 text-gray-500" />
                                                          </div>}
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold text-gray-800 truncate">{t.name}</p>
                                                        <p className="text-[11px] text-gray-500">{t.networkLabel}</p>
                                                    </div>
                                                </label>
                                            ))}
                                            {/* Una página que NO sirve se muestra igual, con su motivo:
                                                esconderla dejaría preguntándose dónde quedó. */}
                                            {noListas.map(t => (
                                                <div key={t.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50/70">
                                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                                        <IconoRed network={t.network} className="w-4 h-4 text-gray-400" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-gray-500 truncate">{t.name}</p>
                                                        <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5">{t.reason}</p>
                                                        {t.fix && <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{t.fix}</p>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Las redes sin adaptador se DECLARAN. Ofrecerlas
                                            daría una casilla que no publica nada. */}
                                        {datos.networks.filter(n => !n.available).length > 0 && (
                                            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                                                {datos.networks.filter(n => !n.available).map(n => n.label).join(' y ')} todavía no tienen
                                                conexión en la plataforma: el único proveedor conectado es Meta.
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                                                Texto de la publicación
                                            </h3>
                                            <span className="text-[10px] text-gray-400 font-mono">{mensaje.length}</span>
                                        </div>
                                        <textarea
                                            value={mensaje}
                                            onChange={(e) => setMensaje(e.target.value)}
                                            disabled={publicando}
                                            rows={6}
                                            placeholder="Escribí lo que va a leer la gente en Facebook…"
                                            className="w-full p-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue resize-none disabled:bg-gray-50"
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                                            Sale del Copy Estratégico del artículo. Editarlo acá no modifica el artículo.
                                        </p>
                                    </div>
                                </div>

                                {/* Columna derecha: cómo se va a ver */}
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                                        Vista previa
                                    </h3>
                                    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                                        <div className="p-3 flex items-center gap-2 border-b border-gray-100">
                                            <div className="w-8 h-8 rounded-full bg-rotary-blue/10 flex items-center justify-center">
                                                <Facebook className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-800 truncate">
                                                    {[...seleccion].map(id => datos.targets.find(t => t.id === id)?.name).filter(Boolean)[0]
                                                        || 'Elegí una página'}
                                                </p>
                                                <p className="text-[10px] text-gray-400">Ahora mismo · Público</p>
                                            </div>
                                        </div>
                                        <p className="px-3 py-2.5 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                                            {mensaje || <span className="italic text-gray-300">El texto aparecerá acá…</span>}
                                        </p>
                                        {datos.entity.image && (
                                            <img src={datos.entity.image} alt="" className="w-full aspect-[1.91/1] object-cover" />
                                        )}
                                        <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-100">
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{dominio || 'sin dominio'}</p>
                                            <p className="text-xs font-bold text-gray-800 line-clamp-2 mt-0.5">{datos.entity.title}</p>
                                        </div>
                                    </div>

                                    {/* ⚠️ La dirección se enseña ENTERA: es lo que hay que
                                        poder comprobar antes de mandarla, y recortarla
                                        deja sin saber a dónde va a llevar. */}
                                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                                        <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                            <Globe className="w-3 h-3" /> Enlace que se publica
                                        </p>
                                        {datos.publicUrl ? (
                                            <a href={datos.publicUrl} target="_blank" rel="noopener noreferrer"
                                               className="text-[11px] text-rotary-blue hover:underline break-all">
                                                {datos.publicUrl}
                                            </a>
                                        ) : (
                                            <p className="text-[11px] text-amber-700">{datos.publicUrlReason || 'Sin dirección pública.'}</p>
                                        )}
                                        <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                                            La imagen y el titular los toma Facebook del Open Graph de esa página.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Desenlace POR PÁGINA. Un resumen único diría «no se pudo
                                publicar» cuando dos de tres sí salieron. */}
                            {resultados && (
                                <div className="space-y-2 pt-1">
                                    <h3 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Resultado</h3>
                                    {resultados.map(o => (
                                        <div key={o.accountId}
                                             className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${
                                                 o.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                            {o.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                                  : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-800">{o.accountName || o.pageId}</p>
                                                {o.ok ? (
                                                    <p className="text-emerald-700">
                                                        Publicado{o.duplicate ? ' (ya se había enviado en esta operación)' : ''}.
                                                        {o.externalUrl && (
                                                            <a href={o.externalUrl} target="_blank" rel="noopener noreferrer"
                                                               className="ml-1 font-bold text-rotary-blue hover:underline inline-flex items-center gap-1">
                                                                Ver publicación <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                    </p>
                                                ) : (
                                                    <>
                                                        <p className="text-red-700 leading-relaxed">{o.error}</p>
                                                        {o.fix && <p className="text-gray-600 leading-relaxed mt-0.5">{o.fix}</p>}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Historial de difusión — la trazabilidad multicanal. */}
                            {(datos.history?.length ?? 0) > 0 && (
                                <div className="pt-1">
                                    <button onClick={() => setVerHistorial(v => !v)}
                                            className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest hover:text-gray-600 inline-flex items-center gap-1.5">
                                        <History className="w-3 h-3" />
                                        Historial de publicación ({datos.history.length})
                                        <span className="text-gray-300">{verHistorial ? '▾' : '▸'}</span>
                                    </button>
                                    {verHistorial && (
                                        <ul className="mt-2 rounded-xl border border-gray-100 px-3 bg-gray-50/50">
                                            {datos.history.map(e => <FilaHistorial key={e.id} e={e} />)}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-7 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-4">
                    <button onClick={cerrar} disabled={publicando}
                            className="text-sm font-bold text-gray-500 hover:text-gray-800 disabled:opacity-40">
                        {resultados ? 'Cerrar' : 'Cancelar'}
                    </button>
                    <div className="flex items-center gap-3">
                        {resultados ? (
                            <button onClick={publicarDeNuevo}
                                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-rotary-blue border border-rotary-blue/30 hover:bg-sky-50 inline-flex items-center gap-2">
                                <RefreshCw className="w-4 h-4" /> Publicar nuevamente
                            </button>
                        ) : (
                            <button onClick={publicar} disabled={!puedePublicar}
                                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-rotary-blue hover:bg-rotary-navy disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2">
                                {publicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Facebook className="w-4 h-4" />}
                                {publicando ? 'Publicando…' : `Publicar en Facebook${seleccion.size > 1 ? ` (${seleccion.size})` : ''}`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ShareModal;
