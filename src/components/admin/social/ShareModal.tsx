/**
 * Publicar contenido de la plataforma en las redes conectadas (v4.1013;
 * Reels en Página de Facebook e Instagram, v4.1042).
 *
 * ⚠️ ES UN COMPONENTE COMPARTIDO, no una copia por pantalla. Lo montan el
 * listado de Noticias («Compartir»), la pestaña Redes Sociales del editor
 * («Publicar ahora») y la ficha de un Reel en la Biblioteca del Estudio
 * («Publicar en redes sociales»). Con el modal escrito dos veces, el día que
 * se agregue una red una de las pantallas se queda sin ella —el defecto que
 * ya se pagó con la casilla de distritos (v4.748) y con `SubmissionDetail`
 * (v4.999)—.
 *
 * ⚠️ LA PANTALLA NO DECIDE NADA. Qué cuentas hay, cuáles sirven, qué FORMA
 * tiene el contenido (un enlace o un video), si se puede publicar y con qué
 * texto sale lo resuelve el servidor y viaja resuelto en
 * `/social/share/targets`. Acá sólo se pinta y se pide.
 *
 * ⚠️ ACÁ NO HAY GRUPOS DE FACEBOOK, y no es un olvido. Meta retiró la Groups
 * API el 22 de abril de 2024: un grupo no tiene endpoint al que llamar, así
 * que vive en la Distribución con otro tipo de destino (`group_manual`) y con
 * su aviso de que publica una persona. Este modal es el camino de la PÁGINA y
 * de Instagram, que sí publican solos — mezclarlos haría creer que un grupo
 * se resuelve igual que una Página.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Facebook, Instagram, Linkedin, Twitter, Share2, ExternalLink, AlertCircle,
    CheckCircle2, Loader2, Globe, History, RefreshCw, Info, Send, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ShareTargetsResponse, ShareOutcome, ShareHistoryEntry, ShareKind } from '../../../lib/socialShare';
import { hostOf, newOperationKey, duracionLegible } from '../../../lib/socialShare';

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

const NOMBRE_RED: Record<string, string> = {
    facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X',
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
    /** La puerta SECUNDARIA: los grupos de Facebook y los demás destinos, que
     *  viven en la Distribución. Sin esta prop no se ofrece — un botón que no
     *  lleva a ninguna parte es peor que ninguno (v4.650). */
    onGroups?: () => void;
}

const ShareModal: React.FC<Props> = ({ entityType = 'post', entityId, fallbackTitle, onClose, onPublished, onGroups }) => {
    const [datos, setDatos] = useState<ShareTargetsResponse | null>(null);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);
    const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
    const [mensaje, setMensaje] = useState('');
    // El copy POR RED. Un Reel ya lo trae escrito para Facebook y para
    // Instagram (`ReelCopy`), y mandarle a una el de la otra sería tirar
    // trabajo que ya se pagó. Un artículo no tiene uno por red y entonces
    // manda `mensaje`, que es el comportamiento de siempre.
    const [mensajesPorRed, setMensajesPorRed] = useState<Record<string, string>>({});
    const [redActiva, setRedActiva] = useState<string>('facebook');
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
            setMensajesPorRed(d.defaultMessages || {});
            const listas = (d.targets || []).filter((t: any) => t.ready);
            // ⚠️ CON UN VIDEO SE PRESELECCIONAN TODAS LAS CUENTAS LISTAS —una
            // Página y su Instagram—, que es el destino natural de un Reel y
            // lo que el pedido describe. Con un ENLACE se conserva la regla de
            // v4.1013: sólo si hay una sola página utilizable, porque ahí
            // «todas» podía significar varias Páginas de organizaciones
            // distintas. En los dos casos se ve marcado antes de pulsar.
            //
            // ⚠️ Y LO PRINCIPAL DEL SITIO MANDA CUANDO ESTÁ DECLARADO
            // (v4.1043). Un sitio puede tener varias Páginas conectadas y aun
            // así una es LA suya: si la declaró, el modal abre con ésa —y con
            // su Instagram— en vez de con todo marcado. Los predeterminados
            // llegan ya RESUELTOS contra esta misma lista, así que no pueden
            // marcar una cuenta que el servidor va a rechazar.
            const esVideo = (d.kind || 'link') === 'video';
            const principales = [d.defaults?.facebook, d.defaults?.instagram]
                .filter((id: any): id is string => typeof id === 'string' && !!id);
            setSeleccion(new Set(
                principales.length ? principales
                    : esVideo ? listas.map((t: any) => t.id)
                              : (listas.length === 1 ? [listas[0].id] : [])
            ));
            const primera = listas.find((t: any) => t.network === 'facebook') || listas[0];
            if (primera) setRedActiva(primera.network);
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

    const kind: ShareKind = (datos?.kind || 'link') as ShareKind;
    const esVideo = kind === 'video';
    /** ¿El copy se edita por red? Sólo cuando el servidor propuso uno por red. */
    const porRed = esVideo && !!datos?.defaultMessages;

    /** Las redes que de verdad pueden recibir esto y tienen cuenta lista. Es lo
     *  que decide cuántas pestañas de copy se pintan. */
    const redesListas = useMemo(
        () => [...new Set(listas.map(t => t.network))],
        [listas]
    );
    /** Las redes de las cuentas ELEGIDAS: es contra éstas que se comprueba que
     *  haya texto. Exigir texto de una red que nadie eligió bloquearía el
     *  botón sin motivo visible. */
    const redesElegidas = useMemo(
        () => [...new Set(listas.filter(t => seleccion.has(t.id)).map(t => t.network))],
        [listas, seleccion]
    );

    const textoDe = useCallback(
        (red: string) => (porRed ? (mensajesPorRed[red] ?? '') : mensaje),
        [porRed, mensajesPorRed, mensaje]
    );
    const escribir = (valor: string) => {
        if (porRed) setMensajesPorRed(prev => ({ ...prev, [redActiva]: valor }));
        else setMensaje(valor);
    };

    const faltaTexto = redesElegidas.filter(red => !textoDe(red).trim());
    const puedePublicar = !!datos?.shareable && seleccion.size > 0 && faltaTexto.length === 0 && !publicando;

    /**
     * Publica en las cuentas indicadas —todas las elegidas, o sólo las que
     * fallaron cuando se reintenta—.
     *
     * ⚠️ NO SE VUELVE A MONTAR NADA: lo que viaja es el identificador de la
     * pieza y el texto. El archivo es el master que ya está en la Biblioteca y
     * lo descarga Meta desde su dirección.
     */
    const publicar = async (soloIds?: string[]) => {
        const ids = soloIds && soloIds.length ? soloIds : [...seleccion];
        if (!soloIds && !puedePublicar) return;
        if (!ids.length) return;
        setPublicando(true);
        try {
            const r = await fetch(`${api()}/social/share`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    entityType, entityId,
                    accountIds: ids,
                    // `message` viaja siempre —es el respaldo por red y lo que
                    // entiende un servidor anterior a v4.1042—; `messages`
                    // sólo cuando de verdad hay uno por red.
                    message: porRed ? (textoDe(redActiva) || mensaje) : mensaje,
                    ...(porRed ? { messages: mensajesPorRed } : {}),
                    operationKey: opKey.current,
                }),
            });
            const d = await leerJson(r);
            if (d.__noJson) throw new Error(d.error);
            if (!r.ok && !Array.isArray(d.outcomes)) {
                // Un fallo previo a publicar: el servidor dice qué falta y dónde.
                throw new Error([d.error, d.fix].filter(Boolean).join(' '));
            }
            // Al REINTENTAR una sola cuenta, lo que ya salió no se borra de la
            // pantalla: se reemplaza sólo el desenlace de esa cuenta. Si no,
            // «Facebook ✓» desaparecería al reintentar Instagram y se leería
            // como que se perdió.
            const nuevos: ShareOutcome[] = d.outcomes || [];
            setResultados(prev => {
                if (!soloIds || !prev) return nuevos;
                const porCuenta = new Map(prev.map(o => [o.accountId, o]));
                for (const o of nuevos) porCuenta.set(o.accountId, o);
                return [...porCuenta.values()];
            });
            const ok = nuevos.filter((o: ShareOutcome) => o.ok).length;
            if (ok > 0) {
                publicoAlgo.current = true;
                const redes = [...new Set(nuevos.filter(o => o.ok).map(o => NOMBRE_RED[o.network] || o.network))];
                toast.success(`Publicado en ${redes.join(' y ')}`);
            } else {
                toast.error('No se pudo publicar. Mirá el detalle por cuenta.');
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

    /** Reintentar SÓLO lo que falló. Una plataforma que no salió no obliga a
     *  volver a publicar en la que sí: eso dejaría dos publicaciones en
     *  Facebook para arreglar una de Instagram. */
    const fallidos = (resultados || []).filter(o => !o.ok);
    const reintentarFallidos = () => {
        if (!fallidos.length) return;
        opKey.current = newOperationKey();
        publicar(fallidos.map(o => o.accountId));
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
                            <Share2 className="w-4 h-4 text-rotary-blue" />
                            {esVideo ? 'Publicar en redes sociales' : 'Compartir publicación'}
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {datos?.entity.title || fallbackTitle || 'Cargando…'}
                        </p>
                        {/* Qué se va a publicar, medido. Un Reel sale como
                            archivo y conviene ver su duración y su formato
                            ANTES de mandarlo: son las dos cosas por las que
                            Instagram rechaza un contenedor. */}
                        {esVideo && datos && (
                            <p className="text-[11px] text-gray-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-bold text-gray-500">Video</span>
                                <span>·</span>
                                <span>{duracionLegible(datos.entity.durationSec)}</span>
                                {datos.entity.width && datos.entity.height && (
                                    <>
                                        <span>·</span>
                                        <span>{datos.entity.width}×{datos.entity.height}</span>
                                    </>
                                )}
                                <span>·</span>
                                <span>Se publica el archivo ya montado; no se vuelve a generar nada.</span>
                            </p>
                        )}
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
                                        {esVideo ? 'Este Reel' : 'Este artículo'} ya se publicó {datos.summary!.count === 1 ? 'una vez' : `${datos.summary!.count} veces`} en redes.
                                    </p>
                                    <p className="mt-1">
                                        Volver a publicar crea una publicación NUEVA; no reemplaza la anterior.
                                    </p>
                                </Aviso>
                            )}

                            {/* ⚠️ EL ESTADO DE LA CONEXIÓN DE META, DICHO. Sin
                                esto, «no me aparece Instagram» no se distingue
                                de «no está conectado» ni de «la cuenta no es
                                profesional», y las tres se corrigen en sitios
                                distintos. */}
                            {datos.integration && (
                                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 space-y-2">
                                    <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                                        Conexión con Meta
                                    </p>
                                    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                                        {(['facebook', 'instagram'] as const).map(red => {
                                            const info = datos.integration![red];
                                            const Icono = ICONO[red];
                                            return (
                                                <div key={red} className="flex items-start gap-2 text-xs">
                                                    <Icono className={`w-4 h-4 mt-0.5 flex-shrink-0 ${info.ready ? 'text-emerald-600' : info.connected ? 'text-amber-500' : 'text-gray-300'}`} />
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-gray-700">
                                                            {NOMBRE_RED[red]}{' '}
                                                            <span className={info.ready ? 'text-emerald-600' : info.connected ? 'text-amber-600' : 'text-gray-400'}>
                                                                {info.ready ? 'conectado correctamente'
                                                                    : info.connected ? 'conectado, con avisos'
                                                                    : 'no conectado'}
                                                            </span>
                                                        </p>
                                                        {info.accounts.map(a => (
                                                            <p key={a.id} className="text-[11px] text-gray-500">
                                                                {a.name}
                                                                {'username' in a && a.username ? ` (@${a.username})` : ''}
                                                                {'linkedPageName' in a && a.linkedPageName
                                                                    ? ` · vinculada a ${a.linkedPageName}` : ''}
                                                            </p>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {datos.integration.notes.map((n, i) => (
                                        <p key={i} className={`text-[11px] leading-relaxed ${n.tone === 'bad' ? 'text-red-700' : 'text-amber-700'}`}>
                                            <span className="font-bold">{n.text}</span>
                                            {n.fix ? <span className="text-gray-600"> {n.fix}</span> : null}
                                        </p>
                                    ))}
                                </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Columna izquierda: dónde y qué */}
                                <div className="space-y-5">
                                    <div>
                                        <h3 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3">
                                            {esVideo ? 'Publicar en' : 'Páginas disponibles'}
                                        </h3>
                                        {listas.length === 0 && noListas.length === 0 && (
                                            <Aviso tone="warn">
                                                <p className="font-bold">Este sitio no tiene ninguna cuenta conectada.</p>
                                                <p className="mt-1">Conectá la Página de Facebook desde Configuración → Redes Sociales (Hub Social). La cuenta de Instagram vinculada a esa Página entra sola.</p>
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
                                                        <p className="text-[11px] text-gray-500">
                                                            {t.networkLabel}
                                                            {t.username ? ` · @${t.username}` : ''}
                                                            {t.network === 'instagram' && t.linkedPageName
                                                                ? ` · vinculada a ${t.linkedPageName}` : ''}
                                                        </p>
                                                        {/* Un aviso NO bloquea: se publica igual y conviene
                                                            saberlo antes de pulsar (un apaisado en Instagram
                                                            sale recortado). */}
                                                        {(t.warnings || []).map((w, i) => (
                                                            <p key={i} className="text-[11px] text-amber-700 leading-relaxed mt-0.5">{w}</p>
                                                        ))}
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
                                            <span className="text-[10px] text-gray-400 font-mono">{textoDe(porRed ? redActiva : 'facebook').length}</span>
                                        </div>
                                        {/* ⚠️ UN COPY POR RED cuando el servidor propuso uno por
                                            red: el Reel ya lo trae escrito para Facebook y para
                                            Instagram, y fundirlos en un solo campo tiraría uno de
                                            los dos. Con una sola red, no hay pestañas que elegir. */}
                                        {porRed && redesListas.length > 1 && (
                                            <div className="flex gap-1 mb-2 p-1 bg-gray-100 rounded-xl w-fit">
                                                {redesListas.map(red => {
                                                    const Icono = ICONO[red] || Share2;
                                                    const vacio = redesElegidas.includes(red) && !textoDe(red).trim();
                                                    return (
                                                        <button key={red} type="button" onClick={() => setRedActiva(red)}
                                                                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors ${
                                                                    redActiva === red ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                                                            <Icono className="w-3.5 h-3.5" />
                                                            {NOMBRE_RED[red] || red}
                                                            {vacio && <span className="text-red-500" title="Sin texto">•</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        <textarea
                                            value={textoDe(porRed ? redActiva : 'facebook')}
                                            onChange={(e) => escribir(e.target.value)}
                                            disabled={publicando}
                                            rows={6}
                                            placeholder={`Escribí lo que va a leer la gente en ${porRed ? (NOMBRE_RED[redActiva] || redActiva) : 'Facebook'}…`}
                                            className="w-full p-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue resize-none disabled:bg-gray-50"
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                                            {esVideo
                                                ? 'Sale del copy que el Reel ya tiene escrito para esa red, con sus hashtags. Editarlo acá no modifica el Reel.'
                                                : 'Sale del Copy Estratégico del artículo. Editarlo acá no modifica el artículo.'}
                                        </p>
                                        {/* El botón apagado DICE qué falta. Uno apagado sin
                                            explicación se lee como que el módulo está roto. */}
                                        {faltaTexto.length > 0 && (
                                            <p className="text-[11px] text-amber-700 mt-1.5 font-bold">
                                                Falta el texto de {faltaTexto.map(r => NOMBRE_RED[r] || r).join(' y ')}.
                                            </p>
                                        )}
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
                                                {React.createElement(ICONO[porRed ? redActiva : 'facebook'] || Facebook,
                                                    { className: 'w-4 h-4 text-blue-600' })}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-800 truncate">
                                                    {listas.filter(t => seleccion.has(t.id) && (!porRed || t.network === redActiva))[0]?.name
                                                        || [...seleccion].map(id => datos.targets.find(t => t.id === id)?.name).filter(Boolean)[0]
                                                        || 'Elegí una cuenta'}
                                                </p>
                                                <p className="text-[10px] text-gray-400">Ahora mismo · Público</p>
                                            </div>
                                        </div>
                                        <p className="px-3 py-2.5 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                                            {textoDe(porRed ? redActiva : 'facebook')
                                                || <span className="italic text-gray-300">El texto aparecerá acá…</span>}
                                        </p>
                                        {/* ⚠️ LA VISTA PREVIA ES EL ARCHIVO QUE SE VA A
                                            PUBLICAR, no una recreación: se reproduce el mismo
                                            MP4 que Meta va a descargar. Es lo que permite
                                            comprobar antes de mandarlo que es la pieza
                                            correcta. */}
                                        {esVideo ? (
                                            datos.entity.mediaUrl ? (
                                                <video
                                                    src={datos.entity.mediaUrl}
                                                    poster={datos.entity.posterUrl || undefined}
                                                    controls preload="metadata"
                                                    className="w-full bg-black aspect-[9/16] max-h-[320px] object-contain"
                                                />
                                            ) : (
                                                <div className="w-full aspect-[9/16] max-h-[220px] bg-gray-50 flex items-center justify-center text-[11px] text-gray-400">
                                                    Sin archivo montado
                                                </div>
                                            )
                                        ) : datos.entity.image ? (
                                            <img src={datos.entity.image} alt="" className="w-full aspect-[1.91/1] object-cover" />
                                        ) : null}
                                        {!esVideo && (
                                            <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-100">
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{dominio || 'sin dominio'}</p>
                                                <p className="text-xs font-bold text-gray-800 line-clamp-2 mt-0.5">{datos.entity.title}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* ⚠️ La dirección se enseña ENTERA: es lo que hay que
                                        poder comprobar antes de mandarla, y recortarla
                                        deja sin saber a dónde va a llevar. */}
                                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                                        <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                            <Globe className="w-3 h-3" /> {esVideo ? 'Archivo que se publica' : 'Enlace que se publica'}
                                        </p>
                                        {(esVideo ? datos.entity.mediaUrl : datos.publicUrl) ? (
                                            <a href={(esVideo ? datos.entity.mediaUrl : datos.publicUrl) as string}
                                               target="_blank" rel="noopener noreferrer"
                                               className="text-[11px] text-rotary-blue hover:underline break-all">
                                                {esVideo ? datos.entity.mediaUrl : datos.publicUrl}
                                            </a>
                                        ) : (
                                            <p className="text-[11px] text-amber-700">
                                                {esVideo ? 'Este contenido todavía no tiene archivo montado.' : (datos.publicUrlReason || 'Sin dirección pública.')}
                                            </p>
                                        )}
                                        <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                                            {esVideo
                                                ? 'Meta descarga el archivo desde esa dirección, así que tiene que ser pública. Las de la Biblioteca lo son.'
                                                : 'La imagen y el titular los toma Facebook del Open Graph de esa página.'}
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
                                                <p className="font-bold text-gray-800 flex items-center gap-1.5">
                                                    <IconoRed network={o.network} className="w-3.5 h-3.5 text-gray-500" />
                                                    {NOMBRE_RED[o.network] || o.network}
                                                    <span className="font-normal text-gray-500">· {o.accountName || o.pageId}</span>
                                                </p>
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

                <div className="px-7 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                        <button onClick={cerrar} disabled={publicando}
                                className="text-sm font-bold text-gray-500 hover:text-gray-800 disabled:opacity-40">
                            {resultados ? 'Cerrar' : 'Cancelar'}
                        </button>
                        {/* ⚠️ LOS GRUPOS SON LA PUERTA SECUNDARIA, y siguen
                            existiendo. No comparten botón con lo de arriba
                            porque no comparten mecanismo: una Página publica
                            sola y un grupo lo publica una persona. */}
                        {onGroups && (
                            <button onClick={() => { if (publicoAlgo.current) onPublished?.(); onGroups(); }}
                                    disabled={publicando}
                                    className="text-xs font-bold text-gray-500 hover:text-rotary-blue disabled:opacity-40 inline-flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" /> Distribuir también en grupos
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {resultados ? (
                            <>
                                {/* Reintentar SÓLO lo que falló. Volver a publicar
                                    todo dejaría dos publicaciones en la red que sí
                                    salió para arreglar la que no. */}
                                {fallidos.length > 0 && (
                                    <button onClick={reintentarFallidos} disabled={publicando}
                                            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 inline-flex items-center gap-2">
                                        {publicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                        Reintentar {fallidos.map(o => NOMBRE_RED[o.network] || o.network).join(' y ')}
                                    </button>
                                )}
                                <button onClick={publicarDeNuevo} disabled={publicando}
                                        className="px-5 py-2.5 rounded-xl text-sm font-bold text-rotary-blue border border-rotary-blue/30 hover:bg-sky-50 disabled:opacity-40 inline-flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4" /> Publicar nuevamente
                                </button>
                            </>
                        ) : (
                            <button onClick={() => publicar()} disabled={!puedePublicar}
                                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-rotary-blue hover:bg-rotary-navy disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2">
                                {publicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {publicando
                                    ? 'Publicando…'
                                    : esVideo
                                        ? `Publicar ahora${redesElegidas.length ? ` en ${redesElegidas.map(r => NOMBRE_RED[r] || r).join(' y ')}` : ''}`
                                        : `Publicar en Facebook${seleccion.size > 1 ? ` (${seleccion.size})` : ''}`}
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
