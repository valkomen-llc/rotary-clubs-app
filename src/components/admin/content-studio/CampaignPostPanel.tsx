import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    Megaphone, Image as ImageIcon, Upload, Library, Sparkles, Download,
    RefreshCw, AlertTriangle, Info, Check, Copy as CopyIcon, Loader2, FileImage,
    Layers, Send, FileArchive,
} from 'lucide-react';
import DesignCanvas from '../design-studio/DesignCanvas';
import MediaPicker from './MediaPicker';
import { exportDocument, exportToFile, renderDocumentToCanvas, canvasToBlob } from '../../../lib/designRender';
import { qrToDataUri } from '../../../lib/qrcode';
import { uploadMediaFiles } from '../../../lib/mediaUpload';
import {
    capacityOf, validateBeforeGenerate,
    DEFAULT_OBJECTIVE, DEFAULT_AUDIENCE, DEFAULT_LANGUAGE, DEFAULT_FORMAT_ID,
} from '../../../lib/campaignPostSpec';

// ════════════════════════════════════════════════════════════════════
// Infografías de Campaña — el preset «Maneras de Contribuir»
// v4.833.0
//
// Convierte una campaña de contribución en una pieza para redes. Es el ÚNICO
// preset del Generador de Publicaciones que COMPONE en vez de regenerar una
// fotografía con IA, y por eso tiene pantalla propia: los controles de aquél
// —motor de imagen, área de enfoque— no significan nada acá.
//
// ── SE REUTILIZA EL MOTOR, NO SE ESCRIBE OTRO ───────────────────────
//
// La vista previa es `DesignCanvas` en sólo lectura y la exportación es
// `designRender.ts`: los MISMOS de Plantillas IA. Un segundo previsualizador o
// un segundo exportador reintroducirían la duplicación de maquetación que ese
// módulo existe para evitar, y cualquier diferencia se vería como «la vista
// previa no es lo que descargué».
//
// ── LAS CIFRAS NO LAS ESCRIBE EL MODELO ─────────────────────────────
//
// El servidor devuelve un DOCUMENTO con los valores ya puestos en sus nodos. El
// copy que sí escribe el modelo es el titular, el contexto y los textos de cada
// red — y pasa por la validación de veracidad antes de llegar acá.
// ════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

interface Catalogo { id: string; label: string; help?: string; summary?: string; needs?: string[] }
interface FormatoOpt { id: string; label: string; ratio: string; width: number; height: number }
interface StatOpt { id: string; label: string; value: string; source: string; updatedAt: string }
interface CampanaOpt {
    id: string; slug: string; name: string; campaignType: string; status: string;
    title: string; subtitle: string; badge: string; location: string; eventDate: string;
    theme: { primary?: string; accent?: string; cta?: string };
    stats: StatOpt[];
    statsSkipped: { id: string; label: string; reason: string }[];
    items: { title: string; description: string }[];
    partners: number;
    images: { url: string; alt?: string }[];
}
interface Opciones {
    objectives: Catalogo[]; audiences: Catalogo[]; languages: Catalogo[]; layouts: Catalogo[];
    formats: FormatoOpt[];
    defaults: { objective: string; audience: string; language: string; format: string };
    scope: 'platform' | 'site';
    siteUrl: string;
    campaigns: CampanaOpt[];
}

interface CopySocial { copy?: string; hashtags?: string }
interface CopyPieza {
    headline?: string; subheadline?: string; context?: string;
    badge?: string; cta?: string; closing?: string;
    social?: Record<string, CopySocial>;
}
interface Slide {
    objective: string;
    label: string;
    document: any;
    layout: { id: string; notes: string[] };
    templateId: string;
}
interface Carrusel {
    slides: Slide[];
    copy: CopyPieza;
    copyIssues: string[];
    format: string;
    skipped: { objective: string; label: string; reason: string }[];
    warnings: string[];
}
interface Compuesto {
    document: any;
    copy: CopyPieza;
    layout: { id: string; notes: string[] };
    templateId: string;
    format: string;
    url: string;
    warnings: string[];
    copyIssues: string[];
}

const REDES: { id: string; label: string; limit: number }[] = [
    { id: 'instagram', label: 'Instagram', limit: 2200 },
    { id: 'facebook', label: 'Facebook', limit: 600 },
    { id: 'linkedin', label: 'LinkedIn', limit: 1300 },
    { id: 'x', label: 'X', limit: 280 },
    { id: 'whatsapp', label: 'WhatsApp', limit: 700 },
];

const lbl = 'text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] mb-2 block';
const field = 'w-full px-3 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium focus:border-blue-300 focus:outline-none';
const card = 'bg-white p-6 rounded-2xl shadow-sm border border-gray-100';

const CampaignPostPanel: React.FC = () => {
    // TODOS los hooks arriba, antes de cualquier `return`: es la regla de
    // `check:hooks` y el defecto que dejó una portada en blanco (v4.689).
    const [opciones, setOpciones] = useState<Opciones | null>(null);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);

    const [campaignId, setCampaignId] = useState('');
    const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);
    const [audience, setAudience] = useState(DEFAULT_AUDIENCE);
    const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
    const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID);
    const [layoutId, setLayoutId] = useState<string>('');
    const [statIds, setStatIds] = useState<string[]>([]);
    const [imageUrl, setImageUrl] = useState('');
    // El QR se dibuja desde la dirección REAL de la campaña, no es un adorno.
    // Va apagado por defecto: no toda pieza lo necesita y ocupa el sitio de la
    // dirección escrita, que es lo que se lee de un vistazo.
    const [conQr, setConQr] = useState(false);
    // El carrusel: varias piezas de una vez, cada una con su objetivo. Vive
    // aparte de `pieza` porque son dos resultados distintos y mezclarlos haría
    // que generar uno borrara el otro sin que nadie lo pidiera.
    const [carrusel, setCarrusel] = useState<Carrusel | null>(null);
    const [slideIdx, setSlideIdx] = useState(0);
    const [cuentas, setCuentas] = useState<{ id: string; platform: string; name?: string }[]>([]);
    const [cuentasSel, setCuentasSel] = useState<string[]>([]);
    const [publicando, setPublicando] = useState(false);

    const [generando, setGenerando] = useState(false);
    const [pieza, setPieza] = useState<Compuesto | null>(null);
    const [redActiva, setRedActiva] = useState('instagram');
    const [pickerAbierto, setPickerAbierto] = useState(false);
    const [subiendo, setSubiendo] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const cajaPreview = useRef<HTMLDivElement>(null);
    const [anchoPreview, setAnchoPreview] = useState(480);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(`${API}/content-studio/campaign-post/options`, { headers: auth() });
                const d = await r.json();
                if (!vivo) return;
                if (!r.ok) throw new Error(d?.error || 'No se pudieron cargar las campañas');
                setOpciones(d);
                if (d.campaigns?.length === 1) setCampaignId(d.campaigns[0].id);
                setObjective(d.defaults?.objective || DEFAULT_OBJECTIVE);
                setAudience(d.defaults?.audience || DEFAULT_AUDIENCE);
                setLanguage(d.defaults?.language || DEFAULT_LANGUAGE);
                setFormatId(d.defaults?.format || DEFAULT_FORMAT_ID);
            } catch (e) {
                if (vivo) setErrorCarga(e instanceof Error ? e.message : 'Error inesperado');
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, []);

    // El ancho real de la columna de la vista previa. El lienzo se pinta a
    // tamaño NOMINAL y el zoom es un `scale`, igual que en Plantillas IA: todo
    // el cálculo interno ocurre en píxeles del formato, que son los mismos que
    // usa el exportador.
    useEffect(() => {
        const medir = () => {
            const w = cajaPreview.current?.clientWidth;
            if (w) setAnchoPreview(w);
        };
        medir();
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, [pieza]);

    // Las cuentas conectadas, para poder publicar sin salir del módulo. Si no
    // hay ninguna, el botón no se pinta: nunca un control que no lleva a
    // ninguna parte.
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(`${API}/social/accounts`, { headers: auth() });
                const d = await r.json();
                if (vivo && Array.isArray(d)) setCuentas(d.filter((c: any) => c?.id));
            } catch { /* sin cuentas, sólo se descarga */ }
        })();
        return () => { vivo = false; };
    }, []);

    const campana = useMemo(
        () => opciones?.campaigns.find(c => c.id === campaignId) || null,
        [opciones, campaignId]
    );

    // Cambiar de campaña descarta la selección de cifras y la imagen: los ids
    // de la anterior no describen nada acá. Misma regla que cambiar de distrito
    // en la postulación.
    useEffect(() => {
        setStatIds([]);
        setImageUrl('');
        setPieza(null);
        setCarrusel(null);
        setSlideIdx(0);
    }, [campaignId]);

    // La dirección pública de la campaña, que es lo que va al QR y al pie.
    const urlCampana = useMemo(() => {
        const base = String(opciones?.siteUrl || '').replace(/\/+$/, '');
        if (!base || !campana?.slug) return '';
        return `${base}/maneras-de-contribuir?c=${encodeURIComponent(campana.slug)}`;
    }, [opciones, campana]);

    const objetivoActual = useMemo(
        () => opciones?.objectives.find(o => o.id === objective) || null,
        [opciones, objective]
    );

    // La composición efectiva —lo que el servidor va a elegir— para poder decir
    // cuántas cifras entran ANTES de generar.
    const layoutEfectivo = layoutId || (objective === 'panorama' ? 'impacto_estadistico'
        : objective === 'ayuda_humanitaria' ? 'elementos_requeridos' : 'emergencia_cta');
    const cupoCifras = capacityOf(layoutEfectivo, formatId, 'maxStats');
    const cupoElementos = capacityOf(layoutEfectivo, formatId, 'maxItems');

    // El MISMO criterio que el servidor, para avisar en vivo. Si esta pantalla
    // decidiera por su cuenta, enseñaría un aviso que la generación desmiente.
    const revision = useMemo(() => {
        if (!campana) return { ok: false, errors: [], warnings: [] };
        return validateBeforeGenerate({
            campaign: {
                id: campana.id,
                content: { hero: { title: campana.title }, requiredItems: campana.items.map(i => ({ ...i, active: true })) },
                stats: campana.stats,
            },
            objective, formatId, layoutId: layoutEfectivo, imageUrl,
            stats: statIds.length ? campana.stats.filter(s => statIds.includes(s.id)) : campana.stats,
        });
    }, [campana, objective, formatId, layoutEfectivo, imageUrl, statIds]);

    const toggleStat = (id: string) => {
        setStatIds(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            if (prev.length >= cupoCifras) {
                toast.info(`Esta composición muestra ${cupoCifras} indicador${cupoCifras === 1 ? '' : 'es'}.`);
                return prev;
            }
            return [...prev, id];
        });
    };

    const componer = useCallback(async (opts: { conservarCopy?: boolean } = {}) => {
        if (!campaignId) { toast.error('Elegí una campaña.'); return; }
        setGenerando(true);
        const toastId = toast.loading(opts.conservarCopy ? 'Rehaciendo la composición…' : 'Generando la pieza…');
        try {
            const r = await fetch(`${API}/content-studio/campaign-post/compose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...auth() },
                body: JSON.stringify({
                    campaignId, objective, audience, language, formatId,
                    layoutId: layoutId || null,
                    statIds: statIds.length ? statIds : null,
                    imageUrl,
                    // El QR se genera ACÁ: `qrcode.ts` produce el SVG en el
                    // acto y sin dependencias, y portarlo al servidor sería
                    // una segunda copia del mismo algoritmo. El servidor
                    // comprueba que lo que llega sea una imagen embebida.
                    // La dirección la da el SERVIDOR (`siteUrl` de las
                    // opciones): componerla acá daría una distinta según desde
                    // dónde se abrió el panel, y el QR llevaría a otra parte.
                    qrDataUri: conQr && urlCampana ? qrToDataUri(urlCampana, 320) : '',
                    // Rehacer SÓLO el diseño no vuelve a pedirle el texto al
                    // modelo: es lo que permite probar composiciones y formatos
                    // sin gastar una llamada por cada una.
                    copy: opts.conservarCopy ? pieza?.copy || null : null,
                }),
            });
            const d = await r.json();
            if (!r.ok) {
                const detalle = Array.isArray(d?.errors) && d.errors.length ? `: ${d.errors[0]}` : '';
                throw new Error(`${d?.error || 'No se pudo generar'}${detalle}`);
            }
            setPieza(d);
            setCarrusel(null);
            toast.success('Pieza lista.', { id: toastId });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo generar', { id: toastId, duration: 10000 });
        } finally {
            setGenerando(false);
        }
        // `conQr` y `urlCampana` VAN en las dependencias: sin ellas el
        // manejador se queda con el valor que tenían al crearse y el
        // interruptor del QR no llega nunca a la petición. Lo encontró el
        // smoke, no el typecheck — el código es válido y está bien tipado.
    }, [campaignId, objective, audience, language, formatId, layoutId, statIds, imageUrl, pieza, conQr, urlCampana]);

    const generarCarrusel = useCallback(async () => {
        if (!campaignId) { toast.error('Elegí una campaña.'); return; }
        setGenerando(true);
        const toastId = toast.loading('Generando el carrusel…');
        try {
            const r = await fetch(`${API}/content-studio/campaign-post/carousel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...auth() },
                body: JSON.stringify({
                    campaignId, audience, language, formatId, imageUrl,
                    qrDataUri: conQr && urlCampana ? qrToDataUri(urlCampana, 320) : '',
                }),
            });
            const d = await r.json();
            if (!r.ok) {
                const detalle = Array.isArray(d?.errors) && d.errors.length ? `: ${d.errors[0]}` : '';
                throw new Error(`${d?.error || 'No se pudo generar'}${detalle}`);
            }
            setCarrusel(d);
            setSlideIdx(0);
            setPieza(null);
            toast.success(`Carrusel de ${d.slides.length} piezas.`, { id: toastId });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo generar', { id: toastId, duration: 10000 });
        } finally { setGenerando(false); }
    }, [campaignId, audience, language, formatId, imageUrl, conQr, urlCampana]);

    /** Todas las piezas del carrusel en un ZIP. Descargarlas una por una hace
     *  que el navegador bloquee todas menos la primera. */
    const descargarZip = async () => {
        if (!carrusel) return;
        const toastId = toast.loading('Armando el archivo…');
        try {
            const { default: JSZip } = await import('jszip');
            const zip = new JSZip();
            for (const [i, s] of carrusel.slides.entries()) {
                const canvas = await renderDocumentToCanvas(s.document, { scale: 2, opaque: true });
                const blob = await canvasToBlob(canvas, 'image/png');
                zip.file(`${String(i + 1).padStart(2, '0')}-${s.objective}.png`, blob);
            }
            const out = await zip.generateAsync({ type: 'blob' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(out);
            a.download = `${campana?.slug || 'campana'}-carrusel.zip`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            toast.success('Listo.', { id: toastId });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo armar el ZIP', { id: toastId });
        }
    };

    /**
     * Publicar en las cuentas conectadas.
     *
     * La pieza se sube PRIMERO a la Biblioteca: `/social/publish` recibe una
     * dirección, no un archivo, y la fila de `Media` es además el registro de
     * lo que se publicó. Es el mismo camino que usa el Generador de
     * Publicaciones desde siempre — no se inventa un segundo.
     */
    const publicar = async () => {
        const doc = carrusel ? carrusel.slides[slideIdx]?.document : pieza?.document;
        const copia = carrusel ? carrusel.copy : pieza?.copy;
        if (!doc || !cuentasSel.length) return;
        setPublicando(true);
        const toastId = toast.loading('Publicando…');
        try {
            const file = await exportToFile(doc, `${campana?.slug || 'campana'}-${objective}`);
            const { uploaded, failed } = await uploadMediaFiles([file]);
            if (failed.length) throw new Error(failed[0].reason);
            const url = uploaded[0]?.url;
            if (!url) throw new Error('La pieza no se pudo guardar antes de publicar');

            const copies: Record<string, { copy: string; hashtags: string; cta: string }> = {};
            for (const r of REDES) {
                const c = copia?.social?.[r.id];
                if (c?.copy) copies[r.id] = { copy: c.copy, hashtags: c.hashtags || '', cta: '' };
            }
            const resp = await fetch(`${API}/social/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...auth() },
                body: JSON.stringify({
                    accountIds: cuentasSel, imageUrl: url, copies,
                    generatedBy: 'campaign-post',
                }),
            });
            const d = await resp.json();
            if (!resp.ok) throw new Error(d?.error || 'No se pudo publicar');
            const fallidas = (d.results || []).filter((x: any) => !x.ok);
            if (fallidas.length) toast.error(`Publicado con ${fallidas.length} error(es): ${fallidas[0].error || ''}`, { id: toastId, duration: 12000 });
            else toast.success('Publicado.', { id: toastId });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo publicar', { id: toastId, duration: 12000 });
        } finally { setPublicando(false); }
    };

    const subirFoto = async (files: FileList | null) => {
        if (!files?.length) return;
        setSubiendo(true);
        try {
            const { uploaded, failed } = await uploadMediaFiles([files[0]]);
            if (failed.length) toast.error(`No se pudo subir ${failed[0].name}: ${failed[0].reason}`);
            // Se usa lo que devuelve el servidor, no lo que se mandó: con un
            // HEIC la fila queda con OTRO nombre y OTRA dirección (v4.784).
            if (uploaded[0]?.url) { setImageUrl(uploaded[0].url); toast.success('Fotografía cargada y guardada en la Biblioteca.'); }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo subir la imagen');
        } finally {
            setSubiendo(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const descargar = async (formato: 'png' | 'jpg') => {
        const doc = carrusel ? carrusel.slides[slideIdx]?.document : pieza?.document;
        if (!doc) return;
        try {
            await exportDocument(doc, { format: formato, title: `${campana?.slug || 'campana'}-${objective}` });
        } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo exportar'); }
    };

    const guardarEnBiblioteca = async () => {
        const docGuardar = carrusel ? carrusel.slides[slideIdx]?.document : pieza?.document;
        if (!docGuardar) return;
        setGuardando(true);
        const toastId = toast.loading('Guardando en la Biblioteca…');
        try {
            const file = await exportToFile(docGuardar, `${campana?.slug || 'campana'}-${objective}`);
            const { uploaded, failed } = await uploadMediaFiles([file]);
            if (failed.length) throw new Error(failed[0].reason);
            if (!uploaded.length) throw new Error('No se guardó ningún archivo');
            toast.success('La pieza quedó en la Biblioteca Multimedia.', { id: toastId });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar', { id: toastId });
        } finally { setGuardando(false); }
    };

    const copiarTexto = async (texto: string) => {
        try { await navigator.clipboard.writeText(texto); toast.success('Copiado.'); }
        catch { toast.error('No se pudo copiar.'); }
    };

    if (cargando) {
        return (
            <div className="flex items-center gap-3 text-gray-400 py-16 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-bold">Cargando campañas…</span>
            </div>
        );
    }

    if (errorCarga) {
        return (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-sm text-red-700 font-medium">
                {errorCarga}
            </div>
        );
    }

    if (!opciones?.campaigns.length) {
        return (
            <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
                <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h3 className="font-black text-gray-800 mb-1">No hay ninguna campaña activa</h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                    {opciones?.scope === 'site'
                        ? 'Todavía no hay una campaña de Maneras de Contribuir que alcance a este sitio. Cuando el Distrito publique una, aparece acá.'
                        : 'Publicá o programá una campaña en Maneras de Contribuir y volvé a esta pestaña.'}
                </p>
            </div>
        );
    }

    const fmt = opciones.formats.find(f => f.id === formatId);
    const escala = fmt ? Math.min(1, anchoPreview / fmt.width) : 0.4;
    // Lo que se pinta: la pieza suelta o la diapositiva activa del carrusel.
    // Es UN solo punto de decisión — con dos, el botón de descargar podría
    // bajar una pieza distinta de la que se está viendo.
    const docActivo = carrusel ? carrusel.slides[Math.min(slideIdx, carrusel.slides.length - 1)]?.document : pieza?.document;
    const avisos = carrusel ? carrusel.warnings : (pieza?.warnings || []);
    const problemas = carrusel ? carrusel.copyIssues : (pieza?.copyIssues || []);

    return (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
            {/* ── Configuración ───────────────────────────────────── */}
            <div className="space-y-4">
                <div className={card}>
                    <label className={lbl}>Campaña</label>
                    <select className={field} value={campaignId} onChange={e => setCampaignId(e.target.value)}>
                        <option value="">Elegí una campaña…</option>
                        {opciones.campaigns.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.name}{c.status === 'scheduled' ? ' (programada)' : ''}
                            </option>
                        ))}
                    </select>
                    {campana && (
                        <div className="mt-3 text-xs text-gray-500 space-y-1">
                            <p className="font-bold text-gray-700">{campana.title || campana.name}</p>
                            {campana.location && <p data-no-translate>{campana.location}</p>}
                            <p>
                                {campana.stats.length} indicador{campana.stats.length === 1 ? '' : 'es'} publicable{campana.stats.length === 1 ? '' : 's'}
                                {' · '}{campana.items.length} elemento{campana.items.length === 1 ? '' : 's'}
                                {' · '}{campana.images.length} imagen{campana.images.length === 1 ? '' : 'es'}
                            </p>
                        </div>
                    )}
                </div>

                <div className={card}>
                    <label className={lbl}>Objetivo de la publicación</label>
                    <div className="grid grid-cols-2 gap-2">
                        {opciones.objectives.map(o => (
                            <button key={o.id} type="button" onClick={() => { setObjective(o.id); setLayoutId(''); }}
                                className={`px-3 py-3 rounded-xl text-[11px] font-black transition-all border-2 text-left ${
                                    objective === o.id ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                                        : 'bg-white border-gray-50 text-gray-500 hover:border-blue-100'}`}>
                                {o.label}
                            </button>
                        ))}
                    </div>
                    {objetivoActual?.help && <p className="text-xs text-gray-400 mt-3">{objetivoActual.help}</p>}
                </div>

                <div className={`${card} grid md:grid-cols-3 gap-4`}>
                    <div>
                        <label className={lbl}>Formato</label>
                        <select className={field} value={formatId} onChange={e => setFormatId(e.target.value)}>
                            {opciones.formats.map(f => (
                                <option key={f.id} value={f.id}>{f.width}×{f.height}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={lbl}>Audiencia</label>
                        <select className={field} value={audience} onChange={e => setAudience(e.target.value)}>
                            {opciones.audiences.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={lbl}>Idioma</label>
                        <select className={field} value={language} onChange={e => setLanguage(e.target.value)}>
                            {opciones.languages.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Indicadores. Sólo llegan acá los PUBLICABLES: uno sin fuente
                    no se puede marcar, porque no se puede publicar. */}
                {campana && cupoCifras > 0 && (
                    <div className={card}>
                        <div className="flex items-baseline justify-between mb-3">
                            <label className={`${lbl} mb-0`}>Indicadores</label>
                            <span className="text-[11px] font-bold text-gray-400">
                                {statIds.length || Math.min(campana.stats.length, cupoCifras)} de {cupoCifras} que entran
                            </span>
                        </div>
                        {campana.stats.length === 0 && (
                            <p className="text-xs text-gray-400">Esta campaña no tiene indicadores con fuente registrada.</p>
                        )}
                        <div className="space-y-2">
                            {campana.stats.map(s => {
                                const marcado = statIds.length ? statIds.includes(s.id) : campana.stats.indexOf(s) < cupoCifras;
                                return (
                                    <button key={s.id} type="button" onClick={() => toggleStat(s.id)}
                                        className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                                            marcado ? 'border-blue-200 bg-blue-50/50' : 'border-gray-50 hover:border-gray-100'}`}>
                                        <span className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center ${marcado ? 'bg-blue-600' : 'bg-gray-200'}`}>
                                            {marcado && <Check className="w-3 h-3 text-white" />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-black text-gray-800" data-no-translate>{s.value}</span>
                                            <span className="block text-xs font-bold text-gray-600">{s.label}</span>
                                            <span className="block text-[11px] text-gray-400" data-no-translate>{s.source}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {campana.statsSkipped.length > 0 && (
                            <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
                                {campana.statsSkipped.map(s => (
                                    <p key={s.id}>«{s.label}» no se puede publicar porque {s.reason}.</p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {campana && cupoElementos > 0 && (
                    <div className={card}>
                        <label className={lbl}>Elementos que se requieren</label>
                        <p className="text-xs text-gray-500">
                            Se muestran los primeros {cupoElementos} de {campana.items.length}, en el orden de la campaña.
                        </p>
                        <ul className="mt-2 space-y-1">
                            {campana.items.slice(0, cupoElementos).map((it, i) => (
                                <li key={i} className="text-xs text-gray-600 font-medium">· {it.title}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* La fotografía: las DOS vías de siempre (v4.700), más las de la
                    propia campaña, que es lo que evita salir del módulo para
                    buscar una imagen que ya está cargada. */}
                <div className={card}>
                    <div className="flex items-center justify-between mb-3">
                        <label className={`${lbl} mb-0`}>Fotografía</label>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setPickerAbierto(true)}
                                className="px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-[11px] font-black text-gray-600 hover:bg-gray-100 flex items-center gap-1.5">
                                <Library className="w-3.5 h-3.5" /> Biblioteca
                            </button>
                            <button type="button" onClick={() => fileRef.current?.click()} disabled={subiendo}
                                className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-[11px] font-black text-blue-700 hover:bg-blue-100 flex items-center gap-1.5 disabled:opacity-50">
                                {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Subir
                            </button>
                        </div>
                    </div>
                    {campana && campana.images.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 mb-3">
                            {campana.images.slice(0, 8).map(im => (
                                <button key={im.url} type="button" onClick={() => setImageUrl(im.url)}
                                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                                        imageUrl === im.url ? 'border-blue-500' : 'border-transparent hover:border-gray-200'}`}>
                                    <img src={im.url} alt={im.alt || ''} className="w-full h-full object-cover" loading="lazy" />
                                </button>
                            ))}
                        </div>
                    )}
                    {imageUrl ? (
                        <div className="flex items-center gap-3">
                            <img src={imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-100" />
                            <button type="button" onClick={() => setImageUrl('')} className="text-xs font-bold text-gray-400 hover:text-gray-700">Quitar</button>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5" /> Sin fotografía, la pieza usa el color de la campaña.
                        </p>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => subirFoto(e.target.files)} />
                </div>

                {/* El código QR. Va apagado por defecto: no toda pieza lo
                    necesita y ocupa el sitio de la dirección escrita, que es
                    lo que se lee de un vistazo. Se dibuja desde la dirección
                    REAL de la campaña — nunca es un adorno. */}
                <div className={card}>
                    <button type="button" onClick={() => urlCampana && setConQr(v => !v)}
                        className="w-full flex items-center justify-between gap-3 text-left">
                        <span>
                            <span className={`${lbl} mb-1`}>Código QR</span>
                            <span className="block text-xs text-gray-500">
                                {urlCampana
                                    ? <>Lleva a <span data-no-translate className="font-medium text-gray-600">{urlCampana.replace(/^https?:\/\//, '')}</span></>
                                    : 'Este sitio todavía no tiene dominio configurado: sin dirección no se puede dibujar un QR.'}
                            </span>
                        </span>
                        <span className={`w-11 h-6 rounded-full flex-shrink-0 transition-colors relative ${conQr && urlCampana ? 'bg-blue-600' : 'bg-gray-200'}`}>
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${conQr && urlCampana ? 'left-[22px]' : 'left-0.5'}`} />
                        </span>
                    </button>
                </div>

                {/* Lo que falta y lo que conviene saber, ANTES de generar. Un
                    error bloquea; un aviso no — tratarlos igual convierte
                    cualquier advertencia en un bloqueo y se dejan de leer. */}
                {campana && (revision.errors.length > 0 || revision.warnings.length > 0) && (
                    <div className="space-y-2">
                        {revision.errors.map((m, i) => (
                            <p key={`e${i}`} className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 rounded-xl p-3 flex gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />{m}
                            </p>
                        ))}
                        {revision.warnings.map((m, i) => (
                            <p key={`w${i}`} className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2">
                                <Info className="w-4 h-4 flex-shrink-0" />{m}
                            </p>
                        ))}
                    </div>
                )}

                <button type="button" onClick={() => componer()} disabled={generando || !campaignId || !revision.ok}
                    className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2">
                    {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {generando ? 'Generando…' : 'Generar publicación'}
                </button>

                {/* El carrusel. Una campaña de emergencia tiene más información
                    de la que entra en UNA pieza; acá se reparte en varias, cada
                    una con su objetivo y en el orden en que se leen. El texto
                    se genera UNA sola vez para todas: cinco llamadas darían
                    cinco voces distintas para la misma campaña. */}
                <button type="button" onClick={generarCarrusel} disabled={generando || !campaignId}
                    className="w-full py-3 rounded-2xl bg-white border-2 border-gray-100 text-gray-600 font-black text-xs hover:border-blue-100 disabled:opacity-40 flex items-center justify-center gap-2">
                    <Layers className="w-4 h-4" />
                    Generar carrusel completo
                </button>
            </div>

            {/* ── Vista previa y resultado ─────────────────────────── */}
            <div className="space-y-4 lg:sticky lg:top-6">
                <div className={card}>
                    <div className="flex items-center justify-between mb-4">
                        <label className={`${lbl} mb-0`}>Vista previa</label>
                        {pieza && (
                            <span className="text-[11px] font-bold text-gray-400" data-no-translate>
                                {fmt?.width}×{fmt?.height}
                            </span>
                        )}
                    </div>
                    <div ref={cajaPreview}>
                        {docActivo ? (
                            <div className="rounded-xl overflow-hidden border border-gray-100 mx-auto"
                                style={{ width: (fmt?.width || 1080) * escala, height: (fmt?.height || 1080) * escala }}>
                                {/* El MISMO lienzo de Plantillas IA, en sólo
                                    lectura. Lo que se ve acá es lo que se
                                    descarga: no hay un segundo dibujo. */}
                                <DesignCanvas doc={docActivo} zoom={escala} interactive={false} showGuides={false} />
                            </div>
                        ) : (
                            <div className="aspect-square rounded-xl border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-gray-300 gap-2">
                                <FileImage className="w-10 h-10" />
                                <span className="text-xs font-bold">La pieza aparece acá</span>
                            </div>
                        )}
                    </div>

                    {docActivo && (
                        <>
                            <div className="flex flex-wrap gap-2 mt-4">
                                {pieza && <button type="button" onClick={() => componer({ conservarCopy: true })} disabled={generando}
                                    className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 text-[11px] font-black text-gray-600 hover:bg-gray-100 flex items-center gap-1.5 disabled:opacity-50">
                                    <RefreshCw className="w-3.5 h-3.5" /> Rehacer diseño
                                </button>}
                                {pieza && <button type="button" onClick={() => componer()} disabled={generando}
                                    className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 text-[11px] font-black text-gray-600 hover:bg-gray-100 flex items-center gap-1.5 disabled:opacity-50">
                                    <Sparkles className="w-3.5 h-3.5" /> Rehacer texto
                                </button>}
                                <button type="button" onClick={() => descargar('png')}
                                    className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 text-[11px] font-black text-blue-700 hover:bg-blue-100 flex items-center gap-1.5">
                                    <Download className="w-3.5 h-3.5" /> PNG
                                </button>
                                <button type="button" onClick={() => descargar('jpg')}
                                    className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 text-[11px] font-black text-blue-700 hover:bg-blue-100 flex items-center gap-1.5">
                                    <Download className="w-3.5 h-3.5" /> JPG
                                </button>
                                <button type="button" onClick={guardarEnBiblioteca} disabled={guardando}
                                    className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-[11px] font-black text-emerald-700 hover:bg-emerald-100 flex items-center gap-1.5 disabled:opacity-50">
                                    {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Library className="w-3.5 h-3.5" />} Biblioteca
                                </button>
                            </div>

                            {avisos.length > 0 && (
                                <div className="mt-3 space-y-1">
                                    {avisos.map((w, i) => (
                                        <p key={i} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{w}</p>
                                    ))}
                                </div>
                            )}
                            {/* Un texto que no pasó la validación de veracidad se
                                ENTREGA con su aviso, no se descarta: es editable
                                antes de publicar, y quitarlo dejaría la pieza sin
                                ninguno. Misma decisión que el guion de la
                                Campaña de Emergencia (v4.783). */}
                            {problemas.length > 0 && (
                                <div className="mt-3 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
                                    <p className="font-black uppercase tracking-wider">Revisá el texto antes de publicar</p>
                                    {problemas.map((m, i) => <p key={i}>{m}</p>)}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* El carrusel: la tira de diapositivas y el ZIP. Se descarga
                    en un archivo porque bajarlas una por una hace que el
                    navegador bloquee todas menos la primera. */}
                {carrusel && (
                    <div className={card}>
                        <div className="flex items-center justify-between mb-3">
                            <label className={`${lbl} mb-0`}>Carrusel · {carrusel.slides.length} piezas</label>
                            <button type="button" onClick={descargarZip}
                                className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-[11px] font-black text-blue-700 hover:bg-blue-100 flex items-center gap-1.5">
                                <FileArchive className="w-3.5 h-3.5" /> Descargar todas
                            </button>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {carrusel.slides.map((s, i) => (
                                <button key={s.objective} type="button" onClick={() => setSlideIdx(i)}
                                    className={`flex-shrink-0 px-3 py-2 rounded-xl text-[11px] font-black border-2 transition-all ${
                                        slideIdx === i ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                                    {i + 1}. {s.label}
                                </button>
                            ))}
                        </div>
                        {/* Las que NO entraron, con su motivo. Un carrusel más
                            corto sin explicación hace pensar que falló. */}
                        {carrusel.skipped.length > 0 && (
                            <div className="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
                                {carrusel.skipped.map(s => (
                                    <p key={s.objective}>«{s.label}» no entró: {s.reason}</p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Publicar en las cuentas conectadas. Si no hay ninguna, esto
                    no se pinta: nunca un control que no lleva a ninguna parte. */}
                {(pieza || carrusel) && cuentas.length > 0 && (
                    <div className={card}>
                        <label className={lbl}>Publicar en redes</label>
                        <div className="space-y-2 mb-3">
                            {cuentas.map(c => {
                                const marcada = cuentasSel.includes(c.id);
                                return (
                                    <button key={c.id} type="button"
                                        onClick={() => setCuentasSel(prev => marcada ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl border-2 text-left transition-all ${
                                            marcada ? 'border-blue-200 bg-blue-50/50' : 'border-gray-50 hover:border-gray-100'}`}>
                                        <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center ${marcada ? 'bg-blue-600' : 'bg-gray-200'}`}>
                                            {marcada && <Check className="w-3 h-3 text-white" />}
                                        </span>
                                        <span className="text-xs font-bold text-gray-700">{c.name || c.platform}</span>
                                        <span className="text-[10px] font-black text-gray-400 uppercase ml-auto">{c.platform}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <button type="button" onClick={publicar} disabled={publicando || !cuentasSel.length}
                            className="w-full py-3 rounded-xl bg-gray-900 text-white font-black text-xs hover:bg-gray-800 disabled:opacity-40 flex items-center justify-center gap-2">
                            {publicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {carrusel ? `Publicar la pieza ${slideIdx + 1}` : 'Publicar esta pieza'}
                        </button>
                        <p className="text-[11px] text-gray-400 mt-2">
                            La pieza se guarda en la Biblioteca antes de publicarse: es lo que queda como registro de lo que salió.
                        </p>
                    </div>
                )}

                {(carrusel?.copy?.social || pieza?.copy?.social) && (
                    <div className={card}>
                        <label className={lbl}>Texto para cada red</label>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {REDES.map(r => (
                                <button key={r.id} type="button" onClick={() => setRedActiva(r.id)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                                        redActiva === r.id ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        {(() => {
                            const red = REDES.find(r => r.id === redActiva)!;
                            const s = (carrusel ? carrusel.copy : pieza!.copy).social?.[redActiva] || {};
                            const texto = [s.copy, s.hashtags].filter(Boolean).join('\n\n');
                            const excede = texto.length > red.limit;
                            return (
                                <>
                                    <textarea readOnly value={texto} rows={8}
                                        className={`${field} resize-none font-normal leading-relaxed`} />
                                    <div className="flex items-center justify-between mt-2">
                                        <span className={`text-[11px] font-bold ${excede ? 'text-red-600' : 'text-gray-400'}`} data-no-translate>
                                            {texto.length}/{red.limit}
                                        </span>
                                        <button type="button" onClick={() => copiarTexto(texto)}
                                            className="px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-[11px] font-black text-gray-600 hover:bg-gray-100 flex items-center gap-1.5">
                                            <CopyIcon className="w-3.5 h-3.5" /> Copiar
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>

            <MediaPicker
                isOpen={pickerAbierto}
                onClose={() => setPickerAbierto(false)}
                maxSelection={1}
                onSelect={items => { if (items[0]?.url) setImageUrl(items[0].url); setPickerAbierto(false); }}
            />
        </div>
    );
};

export default CampaignPostPanel;
