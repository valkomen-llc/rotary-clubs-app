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
    CheckCircle2, Loader2, Globe, History, RefreshCw, Info, Send, Users, Sparkles, Eraser,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ShareTargetsResponse, ShareOutcome, ShareHistoryEntry, ShareKind, ShareCopyNotes } from '../../../lib/socialShare';
import { hostOf, newOperationKey, duracionLegible } from '../../../lib/socialShare';
// ⚠️ EL CRITERIO DEL COPY SE ESPEJA A PROPÓSITO, al revés que el resto de
// `socialShare.ts`: el contador tiene que moverse con cada tecla y un viaje de
// red por pulsación no es una opción. Lo que lo hace seguro es que el servidor
// vuelve a aplicar EL MISMO criterio antes de mandar nada a Meta —una prueba
// compara las salidas de los dos espejos—, así que la pantalla nunca es la
// última palabra: es la que avisa antes de gastar el gesto.
import { describeShareCopy } from '../../../lib/reelShareCopy';
import type { CopyPolicy } from '../../../lib/reelShareCopy';
import { canonicalPostUrl } from '../../../lib/postSlug';
import { useClub } from '../../../contexts/ClubContext';
import GroupDistributionSection from './GroupDistributionSection';

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

/** Qué hubo que hacerle al copy propuesto, dicho como lo diría una persona.
 *  Un texto acortado que se entrega en silencio se publica creyendo que es el
 *  que alguien escribió. */
const notasDelCopy = (n?: ShareCopyNotes | null): string[] => {
    if (!n) return [];
    const out: string[] = [];
    if (n.sanitized) out.push('Se quitaron los hashtags del copy que el Reel ya tenía escrito.');
    if (n.cut === 'oracion') out.push('Era más largo del límite: se conservaron las frases completas que entraban.');
    if (n.cut === 'palabra') out.push('Era más largo del límite y hubo que acortarlo. Revisalo antes de publicar.');
    return out;
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
    clubId?: string | null;
    onClose: () => void;
    /** Se avisa al cerrar SI algo salió, para que el listado repinte su
     *  insignia sin recargar la pantalla entera. */
    onPublished?: () => void;
    /** La puerta SECUNDARIA: los grupos de Facebook y los demás destinos, que
     *  viven en la Distribución. Sin esta prop no se ofrece — un botón que no
     *  lleva a ninguna parte es peor que ninguno (v4.650). */
    onGroups?: () => void;
}

const ShareModal: React.FC<Props> = ({ entityType = 'post', entityId, fallbackTitle, clubId, onClose, onPublished, onGroups }) => {
    const { club } = useClub();
    const effectiveClubId = clubId || club?.id || null;

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
    const [vistaGrupos, setVistaGrupos] = useState(false);
    /** La varita. Regenera SÓLO el texto: no toca el video, no relanza
     *  escenas y no gasta un crédito de image-to-video. */
    const [regenerando, setRegenerando] = useState(false);
    /** Qué hubo que hacerle al copy para que cumpliera, sea al proponerlo o al
     *  regenerarlo. Se dice; no se calla. */
    const [notasCopy, setNotasCopy] = useState<string[]>([]);

    // La clave de la operación se fija al ABRIR y sólo cambia si se pide
    // publicar de nuevo a propósito. Es lo que absorbe el doble clic.
    const opKey = useRef(newOperationKey());
    const publicoAlgo = useRef(false);

    const cargar = useCallback(async () => {
        setCargando(true); setErrorCarga(null);
        try {
            const r = await fetch(
                `${api()}/social/share/targets?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}${effectiveClubId ? `&clubId=${encodeURIComponent(effectiveClubId)}` : ''}`,
                { headers: authHeaders() }
            );
            const d = await leerJson(r);
            if (!r.ok) throw new Error(d.error || `No se pudieron cargar las páginas (HTTP ${r.status}).`);
            setDatos(d);
            setMensaje(d.defaultMessage || '');
            setMensajesPorRed(d.defaultMessages || {});
            setNotasCopy(notasDelCopy(d.copyNotes));
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
    }, [entityType, entityId, effectiveClubId]);

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

    /**
     * La REGLA del copy, tal como la declaró el servidor. `null` para lo que
     * no tiene una propia —un artículo con su Copy Estratégico—, y entonces
     * esta pantalla se comporta exactamente como antes de v4.1052.
     */
    const politicaUnica = datos?.copyPolicy || null;

    /**
     * La regla de UNA red. ⚠️ UN REEL TIENE UNA SOLA POLÍTICA Y UN ARTÍCULO
     * UNA POR RED: los 280 caracteres de X y los 3.000 de LinkedIn no admiten
     * el mismo texto, así que con una sola el contador de una pestaña diría un
     * número y el servidor rechazaría con otro. La declara el SERVIDOR y viaja
     * resuelta; acá sólo se elige cuál toca.
     */
    const politicaDe = useCallback(
        (red: string): CopyPolicy | null =>
            (datos?.copyPolicies?.[red] as CopyPolicy | undefined) || politicaUnica,
        [datos, politicaUnica]
    );

    /** ¿El copy se edita por red? Sólo cuando el servidor propuso uno por red
     *  Y la regla no exige uno solo. ⚠️ UN REEL LLEVA UN ÚNICO TEXTO
     *  (`singleCopy`): Facebook e Instagram reciben el mismo, así que dos
     *  pestañas dejarían dos textos que se pueden separar —y entonces la
     *  vista previa dejaría de ser lo que se publica—. Un ARTÍCULO sí lleva
     *  uno por red (v4.1061): es un enlace, y cada red lo cuenta distinto. */
    const porRed = !!datos?.defaultMessages && !politicaUnica?.singleCopy;

    /** Las redes que de verdad pueden recibir esto y tienen cuenta lista. */
    const redesListas = useMemo(
        () => [...new Set(listas.map(t => t.network))],
        [listas]
    );

    /**
     * ⚠️ LAS PESTAÑAS DE COPY SON LAS REDES QUE TIENEN REGLA, NO LAS QUE
     * TIENEN CUENTA CONECTADA. Salían de `redesListas` —los destinos listos—
     * así que con sólo Meta conectado el modal pintaba DOS y las políticas de
     * X (280) y LinkedIn (3.000) no se podían ni mirar: el copy de esas redes
     * se componía, viajaba y nadie podía revisarlo. Redactar y publicar son
     * dos cosas distintas, y el pedido pide las cuatro pestañas.
     *
     * El orden lo da el catálogo del servidor, no el de las cuentas: así no
     * cambia según en qué orden se conectaron.
     */
    const redesDeCopy = useMemo(() => {
        const conRegla = Object.keys(datos?.copyPolicies || {});
        if (!conRegla.length) return redesListas;
        const orden = (datos?.networks || []).map(n => n.id);
        return [...conRegla].sort((a, b) => {
            const ia = orden.indexOf(a), ib = orden.indexOf(b);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
    }, [datos, redesListas]);
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

    /** ⚠️ EL TEXTO QUE SE EDITA, EL QUE SE PINTA EN LA VISTA PREVIA Y EL QUE
     *  VIAJA A META SON EL MISMO. Una sola fuente de verdad: con el copy
     *  compuesto en dos sitios, la vista previa dejaría de prometer lo que se
     *  publica y nadie lo notaría hasta ver el post. */
    const textoActual = textoDe(porRed ? redActiva : 'facebook');

    /** La regla de la pestaña que se está mirando. */
    const politica = politicaDe(porRed ? redActiva : 'facebook');

    /** El veredicto del copy, con la MISMA función que aplica el servidor
     *  antes de mandar nada. `null` cuando la entidad no tiene regla propia. */
    const estadoCopy = useMemo(
        () => (politica ? describeShareCopy(textoActual, politica) : null),
        [politica, textoActual]
    );

    /**
     * ⚠️ SE COMPRUEBAN TODAS LAS REDES ELEGIDAS, NO SÓLO LA PESTAÑA ABIERTA.
     * Con una sola, alguien corrige el copy de Facebook, cambia de pestaña,
     * publica, y el de X —que se pasa de 280— lo rechaza el servidor después
     * de que Facebook ya salió: un fallo parcial que se podía haber dicho
     * antes de gastar el gesto.
     */
    const redesConProblema = useMemo(
        () => redesElegidas
            .map(red => {
                const pol = politicaDe(red);
                if (!pol) return null;
                const v = describeShareCopy(textoDe(red), pol);
                return v.ok ? null : { red, label: pol.label, reason: v.reason, fix: v.fix };
            })
            .filter(Boolean) as { red: string; label: string; reason: string | null; fix: string | null }[],
        [redesElegidas, politicaDe, textoDe]
    );

    /**
     * ⚠️ QUÉ CUENTAS ELEGIDAS YA RECIBIERON ESTA PIEZA, con su fecha.
     *
     * No bloquea —volver a publicar puede ser exactamente lo que se quiere—
     * pero avisarlo es la diferencia entre repetir a propósito y repetir sin
     * darse cuenta, que es lo que nadie puede deshacer desde acá: una vez en
     * Facebook, la publicación duplicada hay que ir a borrarla a mano. Se casa
     * por `accountId` y, para las filas viejas que no lo traen, por la pareja
     * red + página.
     */
    const yaPublicadas = useMemo(() => {
        const previas = (datos?.history || []).filter(e => e.status === 'published');
        if (!previas.length) return [];
        return listas
            .filter(t => seleccion.has(t.id))
            .map(t => {
                const e = previas.find(x => (x.accountId ? x.accountId === t.id
                    : x.network === t.network && !!x.pageId && x.pageId === t.pageId));
                return e ? { id: t.id, nombre: t.name, red: t.network, fecha: e.createdAt } : null;
            })
            .filter(Boolean) as { id: string; nombre: string; red: string; fecha: string }[];
    }, [datos, listas, seleccion]);

    const faltaTexto = redesElegidas.filter(red => !textoDe(red).trim());
    const puedePublicar = !!datos?.shareable && seleccion.size > 0
        && faltaTexto.length === 0
        // ⚠️ Y LA REGLA DEL COPY BLOQUEA ACÁ TAMBIÉN, no sólo en el servidor.
        // Es comodidad —decirlo antes de gastar el gesto—; la puerta que no se
        // puede saltar sigue siendo la del servidor, que revalida cada texto
        // por cuenta antes de llamar a Meta.
        && redesConProblema.length === 0
        && !publicando && !regenerando;

    /**
     * «✨ Regenerar copy»: le pide al servidor un pie nuevo para este Reel.
     *
     * ⚠️ NO TOCA EL REEL. No regenera escenas, ni audio, ni el montaje, ni
     * gasta un crédito de image-to-video: lo único que vuelve es TEXTO. El
     * archivo que se va a publicar sigue siendo el master que ya está en la
     * Biblioteca —el mismo que reproduce la vista previa de al lado—.
     *
     * ⚠️ Y UN FALLO NO BORRA LO QUE HAY. El texto sólo se reemplaza cuando el
     * servidor devolvió uno: si el redactor no contesta, se dice y se sigue
     * pudiendo publicar lo que estaba escrito.
     */
    const regenerarCopy = async (instruction = '') => {
        if (!politica || regenerando || publicando) return;
        setRegenerando(true);
        try {
            const r = await fetch(`${api()}/social/share/copy${effectiveClubId ? `?clubId=${encodeURIComponent(effectiveClubId)}` : ''}`, {
                method: 'POST',
                headers: authHeaders(),
                // ⚠️ LA RED VIAJA EN LA PETICIÓN Y LA DIRECCIÓN NO. La primera
                // es lo único que dice contra qué tope escribir; la segunda la
                // resuelve el servidor —es la misma que va a viajar a Meta—, y
                // aceptarla de acá dejaría que el copy anunciara una dirección
                // y el enlace publicado llevara a otra.
                body: JSON.stringify({
                    entityType, entityId,
                    ...(porRed ? { network: redActiva } : {}),
                    ...(instruction ? { instruction } : {}),
                    ...(effectiveClubId ? { clubId: effectiveClubId } : {}),
                }),
            });
            const d = await leerJson(r);
            if (d.__noJson) throw new Error(d.error);
            if (!r.ok) throw new Error([d.error, d.fix].filter(Boolean).join(' ') || `HTTP ${r.status}`);
            if (!d.copy) throw new Error('El redactor no devolvió ningún texto.');
            escribir(d.copy);
            // De dónde salió se DICE: presentar la plantilla del sistema como
            // si la hubiera escrito la IA sería afirmar algo que no pasó.
            const extra = d.source === 'plantilla'
                ? []
                : d.source === 'ia_reparado'
                    ? ['El redactor no cumplió la regla al primer intento y el texto se ajustó por código.']
                    : [];
            setNotasCopy([...(d.notes || []), ...extra]);
            toast.success(d.source === 'plantilla'
                ? 'Copy compuesto sin la IA'
                : (instruction ? 'Copy acortado' : 'Copy regenerado'));
        } catch (e: any) {
            toast.error(e.message || 'No se pudo regenerar el copy.');
        } finally {
            setRegenerando(false);
        }
    };

    /** «Limpiar automáticamente»: quita los hashtags y las direcciones y
     *  normaliza los espacios, con la MISMA función del servidor. Lo que deja
     *  se ve antes de publicar, así que es un gesto reversible. */
    const limpiarCopy = () => {
        if (!politica || !estadoCopy?.canClean) return;
        escribir(estadoCopy.cleaned);
        setNotasCopy(['Se quitaron los hashtags y se normalizaron los espacios.']);
    };

    /**
     * «Acortar con IA»: la misma varita con un ajuste, no un endpoint nuevo.
     *
     * ⚠️ SE LE PIDE UNA REESCRITURA, NO UN RECORTE. Cortar es lo que ya hace
     * el código cuando el modelo no cumple —y deja la frase a medias—; lo que
     * el cliente pidió es que el mensaje CONSERVE su intención y entre en el
     * límite, y eso sólo lo puede hacer quien lo vuelve a escribir.
     */
    const acortarCopy = () => regenerarCopy(
        `El texto actual tiene ${estadoCopy?.length ?? 0} caracteres y el máximo son ${politica?.maxChars}. `
        + 'Reescribilo más conciso conservando la intención, el gancho y el llamado a la acción. '
        + 'No lo cortes ni lo termines en puntos suspensivos.'
    );

    const publicUrlCanonica = !esVideo && datos ? canonicalPostUrl({ publicUrl: datos.publicUrl, slug: datos.entity?.slug, id: datos.entity?.id }, club) : null;
    const urlMostrada = esVideo ? datos?.entity.mediaUrl : (publicUrlCanonica || datos?.publicUrl);
    const dominio = hostOf(urlMostrada);
    const yaSalio = datos?.summary?.published;
    const facebookExitoso = useMemo(() => {
        // 1. Si se acaba de publicar en esta sesión con éxito:
        const actual = resultados?.find(o => o.network === 'facebook' && o.ok && o.externalUrl);
        if (actual) return actual;

        // 2. Si ya se publicó en Facebook previamente (historial registrado en BD):
        const previo = (datos?.history || []).find(e =>
            e.network === 'facebook' && e.status === 'published' && (e.externalUrl || e.link)
        );
        if (previo) {
            return {
                accountId: previo.accountId,
                network: 'facebook',
                accountName: previo.accountName,
                ok: true,
                externalId: previo.externalId,
                externalUrl: previo.externalUrl || previo.link || '',
                permalink: previo.externalUrl || previo.link || '',
            };
        }

        return null;
    }, [resultados, datos?.history]);

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
            const r = await fetch(`${api()}/social/share${effectiveClubId ? `?clubId=${encodeURIComponent(effectiveClubId)}` : ''}`, {
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
                    ...(effectiveClubId ? { clubId: effectiveClubId } : {}),
                    ...(urlMostrada ? { publicUrl: urlMostrada } : {}),
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
                `${api()}/social/share/history?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}${effectiveClubId ? `&clubId=${encodeURIComponent(effectiveClubId)}` : ''}`,
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

                    {!cargando && !errorCarga && datos && vistaGrupos && facebookExitoso ? (
                        <GroupDistributionSection
                            entityType={entityType}
                            entityId={entityId}
                            postTitle={datos.entity?.title || fallbackTitle}
                            fanpagePostId={facebookExitoso.externalId}
                            fanpagePostUrl={facebookExitoso.externalUrl || ''}
                            fanpageAccountName={facebookExitoso.accountName}
                            featuredImage={datos.entity?.image || datos.entity?.posterUrl || null}
                            articleExcerpt={datos.entity?.excerpt || null}
                            articleContent={datos.entity?.content || null}
                            canonicalDomain={dominio || hostOf(urlMostrada) || 'rotary4281.org'}
                            authorName={club?.name || facebookExitoso.accountName || 'Rotary en Acción'}
                            fanpageAvatar={facebookExitoso.avatar || null}
                            clubId={effectiveClubId}
                            onBack={() => setVistaGrupos(false)}
                            onDone={() => {
                                setVistaGrupos(false);
                                if (publicoAlgo.current) onPublished?.();
                            }}
                        />
                    ) : !cargando && !errorCarga && datos && (
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

                            {/* ⚠️ EL AVISO DE REPETIDO ES POR CUENTA CUANDO SE
                                SABE CUÁL. «Ya se publicó 3 veces» no le dice a
                                nadie que la Página que acaba de marcar es una
                                de ellas, y una publicación duplicada en la
                                cuenta de una institución no se deshace desde
                                acá: hay que ir a borrarla a mano en Meta. El
                                genérico queda para cuando ninguna de las
                                elegidas la recibió. */}
                            {yaPublicadas.length > 0 && !resultados && (
                                <Aviso tone="warn">
                                    <p className="font-bold">
                                        {esVideo ? 'Este Reel' : 'Esta noticia'} ya se publicó en {yaPublicadas.length === 1 ? 'la cuenta que elegiste' : 'cuentas que elegiste'}:
                                    </p>
                                    <ul className="mt-1 space-y-0.5">
                                        {yaPublicadas.map(d => (
                                            <li key={d.id}>
                                                <strong>{NOMBRE_RED[d.red] || d.red} — {d.nombre}</strong>{' '}
                                                el {new Date(d.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}.
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="mt-1">
                                        Volver a publicar crea una publicación NUEVA; no reemplaza la anterior.
                                        Si no era eso lo que querías, desmarcá {yaPublicadas.length === 1 ? 'esa cuenta' : 'esas cuentas'} o cerrá esta ventana.
                                    </p>
                                </Aviso>
                            )}

                            {yaSalio && yaPublicadas.length === 0 && !resultados && (
                                <Aviso tone="info">
                                    <p className="font-bold">
                                        {esVideo ? 'Este Reel' : 'Este artículo'} ya se publicó {datos.summary!.count === 1 ? 'una vez' : `${datos.summary!.count} veces`} en redes.
                                    </p>
                                    <p className="mt-1">
                                        Volver a publicar crea una publicación NUEVA; no reemplaza la anterior.
                                    </p>
                                </Aviso>
                            )}

                            {facebookExitoso && !vistaGrupos && (
                                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-sky-50/90 to-indigo-50/70 border border-sky-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5 min-w-0">
                                        <p className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                            <Users className="w-4 h-4 text-rotary-blue" />
                                            Publicación oficial en Fanpage activa
                                        </p>
                                        <p className="text-[11px] text-gray-600 leading-relaxed">
                                            La Fanpage ya cuenta con la publicación original. Podés distribuirla directamente en los grupos de Facebook autorizados sin duplicar la publicación.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setVistaGrupos(true)}
                                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-navy shrink-0 shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
                                    >
                                        <Users className="w-3.5 h-3.5" />
                                        Compartir en grupos
                                    </button>
                                </div>
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
                                        <div className="flex justify-between items-center mb-2 gap-2 flex-wrap">
                                            <h3 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                                                Texto de la publicación
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                {/* ⚠️ LA VARITA REGENERA SÓLO EL TEXTO. Va junto
                                                    al campo que cambia, no escondida en un menú:
                                                    un control que hay que descubrir es, para
                                                    quien lo necesita, un control que no está
                                                    (v4.1041). */}
                                                {politica && (
                                                    <button
                                                        type="button"
                                                        onClick={() => regenerarCopy()}
                                                        disabled={regenerando || publicando}
                                                        title={porRed
                                                            ? `Escribe un copy nuevo para ${NOMBRE_RED[redActiva] || redActiva}. No toca el contenido original.`
                                                            : 'Escribe un copy nuevo. No toca el video ni gasta créditos de video.'}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-rotary-blue/20 text-rotary-blue hover:bg-rotary-blue/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        {regenerando
                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            : <Sparkles className="w-3.5 h-3.5" />}
                                                        {regenerando ? 'Escribiendo…' : 'Regenerar copy'}
                                                    </button>
                                                )}
                                                {/* ⚠️ «Acortar con IA» SÓLO CUANDO SOBRA TEXTO.
                                                    Un botón que no hace nada es peor que ninguno
                                                    (v4.650), y acá además prometería un recorte
                                                    sobre un copy que ya entra. */}
                                                {politica && estadoCopy && estadoCopy.over > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={acortarCopy}
                                                        disabled={regenerando || publicando}
                                                        title="Lo vuelve a escribir más conciso conservando la intención. No lo corta a mitad de frase."
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        {regenerando
                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            : <Sparkles className="w-3.5 h-3.5" />}
                                                        Acortar con IA
                                                    </button>
                                                )}
                                                {/* El contador dice el límite, no sólo cuánto
                                                    lleva: «118» a secas no explica por qué el
                                                    botón de publicar está apagado. */}
                                                <span className={`text-[10px] font-mono tabular-nums ${
                                                    estadoCopy
                                                        ? (estadoCopy.over > 0 ? 'text-red-600 font-bold' : estadoCopy.remaining <= 10 ? 'text-amber-600' : 'text-gray-400')
                                                        : 'text-gray-400'}`}>
                                                    {estadoCopy ? `${estadoCopy.length} / ${estadoCopy.max}` : textoActual.length}
                                                </span>
                                            </div>
                                        </div>
                                        {/* ⚠️ UN COPY POR RED cuando el servidor propuso uno por
                                            red: el Reel ya lo trae escrito para Facebook y para
                                            Instagram, y fundirlos en un solo campo tiraría uno de
                                            los dos. Con una sola red, no hay pestañas que elegir. */}
                                        {porRed && redesDeCopy.length > 1 && (
                                            <div className="flex gap-1 mb-2 p-1 bg-gray-100 rounded-xl w-fit flex-wrap">
                                                {redesDeCopy.map(red => {
                                                    const Icono = ICONO[red] || Share2;
                                                    const vacio = redesElegidas.includes(red) && !textoDe(red).trim();
                                                    // Sin cuenta conectada la pestaña sirve para
                                                    // REDACTAR y no para publicar. Se dice, en vez
                                                    // de dejar creer que va a salir por ahí.
                                                    const soloRedaccion = !redesListas.includes(red);
                                                    return (
                                                        <button key={red} type="button" onClick={() => setRedActiva(red)}
                                                                title={soloRedaccion
                                                                    ? `${NOMBRE_RED[red] || red}: se redacta acá y todavía no se publica desde la plataforma.`
                                                                    : undefined}
                                                                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors ${
                                                                    redActiva === red ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                                                            <Icono className={`w-3.5 h-3.5 ${soloRedaccion ? 'opacity-50' : ''}`} />
                                                            <span className={soloRedaccion ? 'opacity-60' : ''}>{NOMBRE_RED[red] || red}</span>
                                                            {vacio && <span className="text-red-500" title="Sin texto">•</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {/* Una pestaña sin destino lo DICE donde se está
                                            escribiendo: sin esto, alguien redacta el copy de X,
                                            pulsa publicar y no entiende por qué no salió. */}
                                        {porRed && !redesListas.includes(redActiva) && (
                                            <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
                                                Se redacta y se guarda con la noticia. {NOMBRE_RED[redActiva] || redActiva} todavía
                                                no se publica desde la plataforma: el copy queda escrito para cuando se conecte.
                                            </p>
                                        )}
                                        <textarea
                                            value={textoActual}
                                            onChange={(e) => escribir(e.target.value)}
                                            disabled={publicando || regenerando}
                                            rows={politica?.requireEmoji ? 4 : 6}
                                            placeholder={esVideo
                                                ? `Un resumen breve de lo que muestra el Reel, terminado en un emoji (máx. ${politica?.maxChars || 100}).`
                                                : `Gancho, contexto y llamado a la acción para ${politica?.label || 'Facebook'} (máx. ${politica?.maxChars || 2000}). Termina en un emoji. El enlace se adjunta automáticamente.`}
                                            className={`w-full p-3 text-sm border rounded-xl resize-none disabled:bg-gray-50 focus:ring-2 ${
                                                estadoCopy && !estadoCopy.ok && textoActual
                                                    ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                    : 'border-gray-200 focus:ring-rotary-blue/20 focus:border-rotary-blue'}`}
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                                            {esVideo
                                                ? `Máximo ${politica?.maxChars || 100} caracteres, sin hashtags y terminado en un emoji. Facebook e Instagram reciben el MISMO texto. Editarlo acá no modifica el Reel.`
                                                : politica
                                                    ? `Máximo ${politica.maxChars} caracteres en ${politica.label}, sin hashtags y terminado en un emoji. El enlace se adjunta automáticamente a la publicación.`
                                                    : 'Sale del Copy Estratégico del artículo. Editarlo acá no modifica el artículo.'}
                                        </p>
                                        {/* ⚠️ EL BLOQUEO DICE SU MOTIVO Y SU SALIDA. Un botón
                                            apagado sin explicación se lee como que el módulo
                                            está roto (v4.1008). */}
                                        {estadoCopy && !estadoCopy.ok && (
                                            <div className="mt-2 p-2.5 rounded-xl bg-red-50 border border-red-100">
                                                <p className="text-[11px] text-red-700 font-bold leading-relaxed">{estadoCopy.reason}</p>
                                                {estadoCopy.fix && (
                                                    <p className="text-[11px] text-red-600/80 mt-0.5 leading-relaxed">{estadoCopy.fix}</p>
                                                )}
                                            </div>
                                        )}
                                        {/* Lo que se publica igual y conviene saber antes de
                                            pulsar. NO bloquea: convertir toda observación en
                                            bloqueo es cómo se llega a que nadie las lea. */}
                                        {estadoCopy?.warnings?.map(w => (
                                            <p key={w.code} className="text-[11px] text-amber-700 mt-1.5 leading-relaxed">
                                                {w.text} {w.fix && <span className="text-amber-600/80">{w.fix}</span>}
                                            </p>
                                        ))}
                                        {/* ⚠️ EL PROBLEMA DE OTRA PESTAÑA SE DICE ACÁ. Con el
                                            aviso sólo en la pestaña abierta, el botón de
                                            publicar quedaría apagado y el motivo estaría
                                            escondido detrás de una pestaña que nadie está
                                            mirando — un bloqueo sin motivo visible se lee como
                                            una avería (v4.1008). */}
                                        {redesConProblema.filter(x => x.red !== (porRed ? redActiva : 'facebook')).map(x => (
                                            <button
                                                key={x.red}
                                                type="button"
                                                onClick={() => setRedActiva(x.red)}
                                                className="mt-2 w-full text-left p-2.5 rounded-xl bg-red-50 border border-red-100 hover:bg-red-100/70 transition-colors"
                                            >
                                                <p className="text-[11px] text-red-700 font-bold leading-relaxed">{x.label}: {x.reason}</p>
                                                <p className="text-[11px] text-red-600/80 mt-0.5 leading-relaxed">Pulsá para corregirlo.</p>
                                            </button>
                                        ))}
                                        {estadoCopy?.canClean && (
                                            <button
                                                type="button"
                                                onClick={limpiarCopy}
                                                disabled={publicando || regenerando}
                                                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                                            >
                                                <Eraser className="w-3.5 h-3.5" />
                                                Limpiar automáticamente
                                            </button>
                                        )}
                                        {/* Qué hubo que hacerle al texto propuesto. Un copy
                                            acortado que se entrega en silencio se publica
                                            creyendo que es el que alguien escribió. */}
                                        {notasCopy.length > 0 && (
                                            <ul className="mt-2 space-y-0.5">
                                                {notasCopy.map((n, i) => (
                                                    <li key={i} className="text-[11px] text-gray-500 leading-relaxed flex gap-1.5">
                                                        <Info className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
                                                        <span>{n}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
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
                                            {textoActual
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
                                        {urlMostrada ? (
                                            <a href={urlMostrada as string}
                                               target="_blank" rel="noopener noreferrer"
                                               className="text-[11px] text-rotary-blue hover:underline break-all">
                                                {urlMostrada}
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

                            {/* Opción destacada: Compartir en grupos de Facebook */}
                            {facebookExitoso && !vistaGrupos && (
                                <div className="mt-3 p-4 rounded-2xl bg-gradient-to-r from-sky-50/80 to-indigo-50/60 border border-sky-200/70 shadow-xs space-y-2.5">
                                    <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                                <Users className="w-4 h-4 text-rotary-blue" />
                                                Compartir en grupos de Facebook
                                            </p>
                                            <p className="text-[11px] text-gray-600 leading-relaxed">
                                                La Fanpage es la fuente oficial. Distribuí esta misma publicación en los grupos de Facebook autorizados para concentrar las métricas e interacciones.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setVistaGrupos(true)}
                                            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-navy shrink-0 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <Users className="w-3.5 h-3.5" />
                                            Compartir en grupos
                                        </button>
                                    </div>
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

                {!vistaGrupos && (
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
                            {facebookExitoso && !vistaGrupos && (
                                <button
                                    type="button"
                                    onClick={() => setVistaGrupos(true)}
                                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 inline-flex items-center gap-2 shadow-xs cursor-pointer transition-all"
                                >
                                    <Users className="w-4 h-4" />
                                    Compartir en grupos
                                </button>
                            )}
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
                                        // ⚠️ EL BOTÓN DICE LO QUE VA A PASAR. Con una
                                        // cuenta que ya recibió esta pieza, «Publicar
                                        // ahora» oculta que se está repitiendo: el
                                        // rótulo lo nombra y el aviso de arriba dice
                                        // cuándo salió (requisito 15).
                                        : yaPublicadas.length > 0
                                            ? `Publicar nuevamente${redesElegidas.length ? ` en ${redesElegidas.map(r => NOMBRE_RED[r] || r).join(' y ')}` : ''}`
                                            : esVideo
                                                ? `Publicar ahora${redesElegidas.length ? ` en ${redesElegidas.map(r => NOMBRE_RED[r] || r).join(' y ')}` : ''}`
                                                // ⚠️ EL RÓTULO NOMBRA LAS REDES ELEGIDAS, no una
                                                // escrita a mano. Decía «Publicar en Facebook»
                                                // con Instagram también marcado: nombraba una red
                                                // que no era la única y el «(2)» de al lado lo
                                                // desmentía.
                                                : `Publicar en ${redesElegidas.length
                                                    ? redesElegidas.map(r => NOMBRE_RED[r] || r).join(' y ')
                                                    : 'redes'}${seleccion.size > 1 ? ` (${seleccion.size})` : ''}`}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default ShareModal;
