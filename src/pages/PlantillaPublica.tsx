// ════════════════════════════════════════════════════════════════════
// Plantillas IA — el portal público
// v4.757.0
//
// Cualquiera con el enlace genera su pieza. Sin sesión, sin cuenta, sin saber
// nada del sistema. Mismo lugar que el Generador de Pendones en la aplicación:
// una ruta pública, fuera del panel.
//
// ── LO QUE ESTA PANTALLA NO TIENE, Y ES A PROPÓSITO ─────────────────
//
// No hay capas, ni propiedades, ni elementos, ni tiradores, ni zoom, ni nada
// técnico. El formulario y la vista previa, y ya. `DesignCanvas` se reutiliza
// en modo NO interactivo: es el mismo dibujo que el editor y que la
// exportación, sin las herramientas.
//
// ── EL FORMULARIO NO ESTÁ ESCRITO ACÁ ───────────────────────────────
//
// Los campos llegan del servidor, derivados de las variables que la plantilla
// publicada realmente usa (`buildPublicFields`). Por eso una plantilla nueva
// —bienvenida, reconocimiento, cambio de junta— no necesita tocar este archivo:
// su formulario aparece solo. Es el requisito de escalabilidad del pedido, y la
// razón de que esta pantalla dibuje campos genéricos en vez de un formulario a
// medida del aniversario.
//
// ── LA VISTA PREVIA ES LOCAL ────────────────────────────────────────
//
// El documento llega con lo institucional ya resuelto y sólo los marcadores del
// formulario pendientes; el navegador los sustituye con `applyVariables`, el
// MISMO que usa el editor. Una petición por pulsación para repintar sería lenta
// y frágil, y no compraría nada: lo que protege la pieza es que el diseño viene
// del servidor y no se puede pedir de otra forma.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Download, Loader2, Sparkles, Upload, Image as ImageIcon, X,
    Share2, AlertTriangle, Check,
} from 'lucide-react';
import DesignCanvas, { type SlotHint } from '../components/admin/design-studio/DesignCanvas';
import { applyPublicValues, formatOf, isImage, type DesignDocument } from '../lib/designSpec';
import { withBackdrop, fusedPhotoId } from '../lib/designCompose';
import { exportDocument, canvasToBlob, renderDocumentToCanvas } from '../lib/designRender';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

interface PublicField {
    key: string; type: 'text' | 'textarea' | 'number' | 'image';
    label: string; placeholder: string; help: string;
    maxChars: number | null; required: boolean; ai: boolean;
    /** Qué CLASE de dato es. Un logotipo y una fotografía comparten
     *  `type: 'image'` y no se tratan igual: el servidor lo usa para elegir la
     *  receta de adaptación y acá decide qué archivos ofrece el selector.
     *  Puede faltar en una plantilla publicada antes de v4.723. */
    kind?: string; accept?: string | null; defaultValue?: string;
    /** La imagen con la que se diseñó la plantilla, SÓLO como ilustración. No
     *  es un valor: se dibuja atenuada dentro de la guía y jamás en el archivo.
     *  Puede faltar en una plantilla publicada antes de v4.726. */
    sample?: string | null;
}
interface PublicTemplate {
    slug: string; name: string; intro: string; category: string; format: string;
    document: DesignDocument; fields: PublicField[];
    /** Si esta plantilla integra la fotografía dentro del lienzo institucional
     *  con IA, y cuántas variantes le toca gastar a una visita anónima. */
    composition?: { enabled: boolean; variants: number };
}
interface PhotoNote { level: string; reason: string; consequence: string }
/** Un club del catálogo curado de la Feria. `display` es el nombre para
 *  imprimir («Club Rotario Cali Pance»); `logo` viene sólo si la plataforma ya
 *  tiene el escudo de ese club cargado. */
interface ClubHit { name: string; display: string; district: string; logo: string | null }

const TONOS = [
    { id: 'emotivo', label: 'Más emotivo' },
    { id: 'institucional', label: 'Más institucional' },
    { id: 'corto', label: 'Más corto' },
    { id: 'elegante', label: 'Más elegante' },
    { id: 'inspirador', label: 'Más inspirador' },
];

const box = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600';

const PlantillaPublica: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();

    // TODOS los hooks arriba, antes de cualquier return: React identifica cada
    // hook por su orden de llamada y un return temprano en medio tumba el árbol
    // (regla del sitio, v4.689).
    const [tpl, setTpl] = useState<PublicTemplate | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    // Los avisos son POR CAMPO. Con una sola lista, subir el logotipo borraba
    // los avisos de la fotografía y —peor— los del logotipo se pintaban también
    // debajo de la foto: dos campos de imagen distintos compartiendo un mismo
    // renglón de advertencias no dicen nada de ninguno.
    const [photoNotes, setPhotoNotes] = useState<Record<string, PhotoNote[]>>({});
    // Cuál campo está subiendo. Con un solo indicador, subir una imagen dejaba
    // girando el de todas.
    const [uploadingKey, setUploadingKey] = useState<string | null>(null);
    const [busy, setBusy] = useState<'ia' | 'descarga' | 'compartir' | null>(null);
    const [aiNote, setAiNote] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<string | null>(null);
    const [zoom, setZoom] = useState(0.42);
    const [done, setDone] = useState(false);
    // ── La composición con IA, en el portal ────────────────────────
    //
    // Es lo que hace que la fotografía quede DENTRO del lienzo institucional
    // —luz, color y bordes armonizados— en vez de encajada en un recuadro. El
    // motor existía desde v4.722 y el endpoint también; lo que faltaba era que
    // esta pantalla lo llamara. Se dispara al subir la fotografía, que es el
    // único momento en que hay algo que componer.
    //
    // `backdrop` es la imagen que devolvió el modelo. Vive aparte del documento
    // y se aplica al final, porque `applyPublicValues` se recalcula con cada
    // tecla y volvería a poner visible el nodo de la foto.
    const [backdrop, setBackdrop] = useState<string | null>(null);
    const [composing, setComposing] = useState(false);
    const [composeNote, setComposeNote] = useState<string | null>(null);
    // ── EL PIPELINE, EN TRES FASES ─────────────────────────────────
    //
    // Antes esto era un formulario con vista previa en vivo y un botón de
    // descargar: quien lo abría no sabía en qué momento «se generaba» nada.
    // Ahora hay un gesto explícito —Generar— y el trabajo de verdad ocurre ahí,
    // diciendo en qué está.
    //
    // Los pasos que se muestran son los que OCURREN. No se inventa un
    // «preparando la publicación» decorativo: si no hay mensaje que escribir ni
    // composición que hacer, generar es instantáneo y se dice así.
    const [fase, setFase] = useState<'form' | 'generando' | 'listo'>('form');
    const [pasos, setPasos] = useState<{ label: string; done: boolean }[]>([]);
    // El buscador de clubes del catálogo de la Feria.
    const [clubHits, setClubHits] = useState<ClubHit[] | null>(null);
    const [buscandoClub, setBuscandoClub] = useState(false);
    const stageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Sin slug —alguien entró a `/plantillas` a secas— no hay nada que
        // pedir. Se dice, en vez de dejar la pantalla girando: la aplicación no
        // tiene ruta comodín, así que una dirección incompleta se ve como una
        // página en blanco y nadie entiende por qué.
        if (!slug) { setLoadError('SIN_SLUG'); return; }
        fetch(`${API}/public/design/${encodeURIComponent(slug)}`, { cache: 'no-store' })
            .then(async r => {
                const d = await r.json().catch(() => null);
                if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
                return d as PublicTemplate;
            })
            .then(t => {
                setTpl(t);
                // El valor por defecto que declaró quien publicó: el formulario
                // arranca con él en vez de vacío. Es lo que permite publicar una
                // plantilla que ya se ve completa y que sólo haya que cambiar lo
                // que cambia de un club a otro.
                const iniciales: Record<string, string> = {};
                for (const f of t.fields || []) if (f.defaultValue) iniciales[f.key] = f.defaultValue;
                if (Object.keys(iniciales).length) setValues(iniciales);
            })
            .catch(e => setLoadError(e instanceof Error ? e.message : 'No se pudo cargar la plantilla.'));
    }, [slug]);

    // El lienzo se ajusta al ancho disponible. Sin esto, en un móvil la pieza
    // de 1080 px se sale de la pantalla y no se ve nada.
    useEffect(() => {
        const fit = () => {
            const el = stageRef.current;
            if (!el || !tpl) return;
            const fmt = formatOf(tpl.format);
            setZoom(Math.min((el.clientWidth - 8) / fmt.width, 620 / fmt.height));
        };
        fit();
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [tpl]);

    // Sustitución local: instantánea, sin ida y vuelta al servidor.
    //
    // `applyPublicValues`, no `applyVariables`: acá un nodo sin valor se QUITA.
    // En el editor un hueco vacío es donde el administrador va a poner algo; en
    // el portal es un defecto impreso —la placa blanca del logotipo flotando
    // sobre la foto— en una pieza que nadie puede corregir después.
    const doc = useMemo<DesignDocument | null>(() => {
        if (!tpl) return null;
        // Las claves del formulario viajan aparte: son las únicas que esta
        // pantalla puede llenar. Un marcador que no se ofrece —ni se congeló al
        // publicar— deja el nodo tal como se publicó, en vez de resolverse
        // contra un diccionario vacío y quedar en blanco. Sin esto, una
        // plantilla publicada con un dato al que nadie llega salía con el pie
        // institucional y hueco todo lo demás.
        const llenables = (tpl.fields || []).map(f => f.key);
        const resuelto = { ...tpl.document, nodes: applyPublicValues(tpl.document.nodes, values, llenables) };
        // El fondo compuesto entra AL FINAL, encima del lienzo institucional y
        // apagando el nodo de la fotografía: la foto ya está dentro de esa
        // imagen. Va acá y no dentro de `values` porque este cálculo se rehace
        // con cada tecla, y el nodo volvería a encenderse.
        return backdrop ? withBackdrop(resuelto, backdrop) : resuelto;
    }, [tpl, values, backdrop]);

    // Con la Composición encendida la fotografía NO va a caer en un recuadro:
    // la integra el modelo dentro de la imagen de base. Ni su hueco ni su guía
    // se dibujan — enseñarlos prometería un sitio que no es el suyo, y hasta
    // v4.760 el visitante veía media pieza vacía esperando una foto que iba a
    // terminar en otra parte.
    const fusedId = useMemo(
        () => (doc ? fusedPhotoId(doc, tpl?.composition) : null),
        [doc, tpl?.composition]
    );

    // ── Dónde va a caer cada dato que todavía falta ────────────────
    //
    // Un hueco de imagen vacío no deja NADA en la pieza: el nodo declara
    // `dropIfEmpty`, así que desaparece. En el editor eso está bien —el
    // administrador lo selecciona y lo llena—, pero acá deja una pieza en
    // blanco y quien la abre no tiene forma de saber dónde va a quedar su
    // logotipo ni de qué tamaño.
    //
    // Se marcan con un recuadro punteado. Sale del documento PUBLICADO, que
    // conserva el hueco con su posición y su tamaño exactos, y **no es un
    // nodo**: no entra en el archivo que se descarga. Es la misma clase de
    // dibujo que los márgenes y el área segura del editor.
    const hints = useMemo<SlotHint[]>(() => {
        if (!tpl) return [];
        const porClave = new Map((tpl.fields || []).filter(f => f.type === 'image').map(f => [f.key, f]));
        const out: SlotHint[] = [];
        for (const n of tpl.document?.nodes || []) {
            if (!isImage(n) || !n.srcVar) continue;
            // La fotografía que se FUNDE con la imagen de base no lleva guía: no
            // va a caer en ese recuadro, la integra el modelo dentro del lienzo.
            // Marcarlo prometería un sitio que no es el suyo.
            if (n.id === fusedId) continue;
            const campo = porClave.get(n.srcVar);
            if (!campo || values[n.srcVar]?.trim()) continue;
            out.push({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, label: campo.label, sample: campo.sample || null });
        }
        return out;
    }, [tpl, values, fusedId]);

    const set = useCallback((key: string, v: string) => {
        setValues(prev => (prev[key] === v ? prev : { ...prev, [key]: v }));
    }, []);

    // La CLAVE del campo viaja con el archivo, y es lo que hace que un logotipo
    // se trate como un logotipo: con ella el servidor resuelve el recuadro de
    // ESE nodo y la receta de ESA clase de campo —sin recorte y conservando la
    // transparencia para un escudo, recorte al encuadre para una fotografía—.
    // Sin ella, toda imagen entraba por el camino de la fotografía.
    // Cuál de los campos de imagen es LA FOTOGRAFÍA. Se resuelve por la clase
    // declarada del campo (`kind`), no por su clave: una plantilla puede llamar
    // `portada` a su fotografía, y comparar contra `'imagen'` la dejaría fuera.
    const esCampoDeFoto = useCallback((key: string) => {
        const f = (tpl?.fields || []).find(x => x.key === key);
        return f?.type === 'image' && (f.kind === 'foto' || key === 'imagen');
    }, [tpl]);

    // ── Componer: la IA mete la fotografía DENTRO del lienzo ───────
    //
    // Es asíncrono a propósito, como en el resto de la plataforma: el modelo
    // tarda entre 20 y 60 segundos y una función serverless corta a los 120.
    // `POST /backdrop` crea la tarea y devuelve su id; `GET /backdrop/:taskId`
    // la sondea hasta que hay archivo.
    //
    // Un fallo NO rompe la pieza: se avisa y se sigue con la composición
    // declarada —la fotografía en su recuadro—, que es una pieza correcta. Es
    // la misma degradación que `fallbackDirection` en el Creador de Reels.
    const componer = useCallback(async (photoDataUrl: string) => {
        if (!slug || !tpl?.composition?.enabled) return;
        setComposing(true);
        setComposeNote(null);
        setBackdrop(null);
        try {
            const r = await fetch(`${API}/public/design/${encodeURIComponent(slug)}/backdrop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: photoDataUrl }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || 'No se pudo componer la pieza.');
            const taskId = (d?.variants || []).find((v: { taskId?: string }) => v.taskId)?.taskId;
            if (!taskId) throw new Error(d?.variants?.[0]?.error || 'El modelo no aceptó la tarea.');

            // Se sonda con tope: sin él, un trabajo que nunca termina deja la
            // pantalla girando para siempre y quien la abrió no sabe si esperar.
            const HASTA = Date.now() + 150_000;
            for (;;) {
                await new Promise(res => setTimeout(res, 4000));
                const s = await fetch(`${API}/public/design/${encodeURIComponent(slug)}/backdrop/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
                const sd = await s.json().catch(() => null);
                // El contrato es `{ status: 'pending' | 'ready' | 'failed' }`.
                if (sd?.status === 'ready' && sd.url) {
                    // ── LA PRESERVACIÓN SE MIDE ────────────────────
                    //
                    // El prompt le pide al modelo que conserve a las personas.
                    // Pedirlo no alcanza: puede desobedecer y la pieza sale
                    // igual, con alguien de más o con una cara que no es la de
                    // nadie. Si la comprobación no da, la composición se
                    // DESCARTA y la pieza sale con la fotografía en su
                    // recuadro, intacta — no se retoca la imagen.
                    const v = await fetch(`${API}/public/design/${encodeURIComponent(slug)}/verify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ photo: photoDataUrl, composed: sd.url }),
                    }).then(r => r.json()).catch(() => null);

                    if (v && v.use === false) {
                        setBackdrop(null);
                        setComposeNote(`${v.reason} ${v.consequence}`);
                    } else {
                        setBackdrop(sd.url);
                        // `unavailable` NO es un tipo de «bien»: se dice.
                        if (v?.state === 'unavailable') setComposeNote(`${v.reason} ${v.consequence}`);
                        // Y la composición que SÍ se usa pero recortó a alguien
                        // de los bordes también se dice. Encuadrar es lo que
                        // hace el diseño, así que no descalifica; pero quien va
                        // a publicar la pieza tiene que saber que puede no salir
                        // todo el mundo, y volver a la foto en su recuadro es un
                        // botón que ya está ahí.
                        else if (v?.notice) setComposeNote(v.notice);
                    }
                    break;
                }
                if (sd?.status === 'failed' || (!s.ok && sd?.error)) throw new Error(sd?.error || 'El modelo no pudo componer la pieza.');
                if (Date.now() > HASTA) throw new Error('La composición está tardando más de lo normal.');
            }
        } catch (e) {
            setComposeNote(e instanceof Error ? e.message : 'No se pudo componer la pieza.');
        } finally { setComposing(false); }
    }, [slug, tpl]);

    const subirImagen = useCallback(async (file: File | undefined, key: string) => {
        if (!file || !slug) return;
        const aviso = (reason: string, consequence: string) =>
            setPhotoNotes(prev => ({ ...prev, [key]: [{ level: 'warn', reason, consequence }] }));

        if (!file.type.startsWith('image/')) { aviso('Ese archivo no es una imagen.', 'Probá con un JPG o un PNG.'); return; }
        setUploadingKey(key);
        setPhotoNotes(prev => ({ ...prev, [key]: [] }));
        try {
            const form = new FormData();
            form.append('file', file);
            form.append('key', key);
            const r = await fetch(`${API}/public/design/${encodeURIComponent(slug)}/photo`, { method: 'POST', body: form });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || 'No se pudo procesar la imagen.');
            set(key, d.dataUrl);
            // Los avisos del recorte se MUESTRAN: si se va a perder a las
            // personas de los bordes, quien subió la foto es el único que puede
            // decidir subir otra.
            setPhotoNotes(prev => ({ ...prev, [key]: d.notes || [] }));
            // Componer NO se dispara acá desde v4.756: lo hace «Generar».
            //
            // Con el gesto explícito, hacerlo también al subir gastaría los
            // créditos DOS veces por visita —una al soltar el archivo y otra al
            // pulsar el botón—, y en un portal anónimo eso lo paga el operador.
            // Cambiar la fotografía invalida lo compuesto, que es lo que sí
            // corresponde hacer acá.
            if (esCampoDeFoto(key)) { setBackdrop(null); setComposeNote(null); }
        } catch (e) {
            aviso(e instanceof Error ? e.message : 'No se pudo procesar la imagen.', 'Probá con otro archivo.');
        } finally { setUploadingKey(null); }
    }, [slug, set, esCampoDeFoto]);

    const escribirIA = useCallback(async (tone: string | null) => {
        if (!slug) return;
        setBusy('ia'); setAiNote(null);
        try {
            const r = await fetch(`${API}/public/design/${encodeURIComponent(slug)}/message`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ values, tone, text: tone ? values.mensaje || '' : '' }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || 'No se pudo escribir el mensaje.');
            set('mensaje', d.mensaje || '');
            if (d.degraded) setAiNote(d.note || 'El texto se escribió sin modelo de lenguaje.');
        } catch (e) {
            setAiNote(e instanceof Error ? e.message : 'No se pudo escribir el mensaje. Podés escribirlo a mano.');
        } finally { setBusy(null); }
    }, [slug, values, set]);

    // ── El buscador de clubes ──────────────────────────────────────
    //
    // Sale del catálogo curado de la Feria —el mismo que ya vio quien postuló su
    // proyecto o se inscribió al evento—, no del directorio de sitios. La lista
    // AYUDA a escribir y no cierra el valor: el campo sigue siendo texto libre,
    // porque un catálogo se queda viejo solo y acá además hay Rotaract, Interact
    // y clubes de otros distritos. Misma regla que la postulación (v4.706).
    const buscarClub = useCallback(async (term: string) => {
        if (!term.trim()) { setClubHits(null); return; }
        setBuscandoClub(true);
        try {
            const r = await fetch(`${API}/public/design/clubs?q=${encodeURIComponent(term)}`);
            const d = await r.json().catch(() => null);
            setClubHits(Array.isArray(d) ? d : []);
        } catch { setClubHits([]); }
        finally { setBuscandoClub(false); }
    }, []);

    // Elegir un club escribe su nombre completo y, si la plataforma ya tiene su
    // escudo cargado, lo pone. Es el «recuperar automáticamente los datos
    // disponibles» del pedido — y sólo rellena lo que está VACÍO: quien ya subió
    // su logotipo no lo pierde por cambiar el club.
    const elegirClub = useCallback((c: ClubHit) => {
        setValues(prev => {
            const next: Record<string, string> = { ...prev, club: c.display };
            if (c.logo && !prev.logo) next.logo = c.logo;
            return next;
        });
        setClubHits(null);
    }, []);

    const marcarUso = useCallback(() => {
        if (!slug) return;
        fetch(`${API}/public/design/${encodeURIComponent(slug)}/used`, { method: 'POST' }).catch(() => { /* no puede romper una descarga */ });
    }, [slug]);

    const descargar = useCallback(async () => {
        if (!doc || !tpl) return;
        setBusy('descarga');
        try {
            await exportDocument(doc, { format: 'png', title: `${tpl.name}-${values.club || ''}` });
            marcarUso();
            setDone(true);
            window.setTimeout(() => setDone(false), 2500);
        } catch (e) {
            setAiNote(e instanceof Error ? e.message : 'No se pudo generar la imagen.');
        } finally { setBusy(null); }
    }, [doc, tpl, values.club, marcarUso]);

    // Compartir usa la API del sistema cuando existe —en un móvil abre WhatsApp
    // directamente, que es donde esto se va a usar—. En un escritorio sin esa
    // API no se finge: se descarga, que es lo que se puede hacer de verdad.
    const compartir = useCallback(async () => {
        if (!doc || !tpl) return;
        setBusy('compartir');
        try {
            const canvas = await renderDocumentToCanvas(doc, { scale: 2, opaque: true });
            const blob = await canvasToBlob(canvas, 'image/png');
            const file = new File([blob], 'felicitacion.png', { type: 'image/png' });
            const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
            if (nav.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: tpl.name });
                marcarUso();
            } else {
                await descargar();
            }
        } catch (e) {
            // Cancelar el diálogo de compartir lanza AbortError: no es un fallo.
            if (!(e instanceof DOMException && e.name === 'AbortError')) {
                setAiNote(e instanceof Error ? e.message : 'No se pudo compartir.');
            }
        } finally { setBusy(null); }
    }, [doc, tpl, marcarUso, descargar]);

    // Los campos de imagen que se están viendo CON EJEMPLO y todavía sin
    // llenar. Es lo único que puede sorprender a alguien: mira la pieza, ve un
    // logotipo, descarga, y el archivo sale sin él. El aviso va junto al botón
    // —no encima de la imagen— porque es ahí donde se toma esa decisión.
    const conEjemploSinLlenar = useMemo(
        () => (tpl?.fields || []).filter(f => f.type === 'image' && f.sample && !values[f.key]?.trim()),
        [tpl, values]
    );

    // ── GENERAR ────────────────────────────────────────────────────
    //
    // El gesto explícito que faltaba. Corre los pasos que de verdad hay que
    // correr y va diciendo en cuál está; los que no aplican no se muestran, en
    // vez de fingir un progreso.
    //
    // Un fallo NUNCA deja la pantalla girando: se vuelve al formulario con el
    // motivo escrito. Es la regla del sitio —nunca un estado de carga
    // indefinido— y acá importa más porque quien la abrió no tiene a quién
    // preguntarle.
    const generar = useCallback(async () => {
        if (!tpl || !slug) return;
        const campoFoto = (tpl.fields || []).find(f => f.type === 'image' && (f.kind === 'foto' || f.key === 'imagen'));
        const campoMensaje = (tpl.fields || []).find(f => f.ai);
        const hayFoto = !!(campoFoto && values[campoFoto.key]);
        const faltaMensaje = !!(campoMensaje && !values[campoMensaje.key]?.trim());
        const componeIA = !!(tpl.composition?.enabled && hayFoto);

        const plan = [
            faltaMensaje ? 'Escribiendo el mensaje' : null,
            componeIA ? 'Componiendo el diseño con la IA' : null,
            'Integrando la identidad del club',
        ].filter(Boolean) as string[];

        setFase('generando');
        setPasos(plan.map(label => ({ label, done: false })));
        const avanzar = () => setPasos(ps => {
            const i = ps.findIndex(p => !p.done);
            return i < 0 ? ps : ps.map((p, k) => (k === i ? { ...p, done: true } : p));
        });

        try {
            if (faltaMensaje) { await escribirIA(null); avanzar(); }
            if (componeIA) { await componer(values[campoFoto!.key]); avanzar(); }
            // El último paso es local e instantáneo: `applyPublicValues` ya
            // resolvió la pieza mientras se escribía. Se muestra igual porque es
            // lo que responde «¿y el nombre de mi club, dónde entró?».
            avanzar();
            setFase('listo');
        } catch (e) {
            setAiNote(e instanceof Error ? e.message : 'No se pudo generar la pieza.');
            setFase('form');
        }
    }, [tpl, slug, values, escribirIA, componer]);

    const faltantes = useMemo(
        () => (tpl?.fields || []).filter(f => f.required && !values[f.key]?.trim()).map(f => f.label),
        [tpl, values]
    );

    if (loadError) {
        const sinSlug = loadError === 'SIN_SLUG';
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
                <div className="max-w-sm text-center">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-200 flex items-center justify-center mb-4">
                        <AlertTriangle className="w-6 h-6 text-gray-500" />
                    </div>
                    <h1 className="text-lg font-black text-gray-800 mb-1">
                        {sinSlug ? 'Falta el nombre de la plantilla' : 'Esta plantilla no está disponible'}
                    </h1>
                    <p className="text-sm text-gray-500">
                        {sinSlug
                            ? 'Esta dirección necesita el enlace completo, del tipo /plantillas/aniversario. Pedíselo a quien te lo compartió.'
                            : loadError}
                    </p>
                </div>
            </div>
        );
    }

    if (!tpl || !doc) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <Loader2 className="w-6 h-6 animate-spin text-blue-700" />
            </div>
        );
    }

    const fmt = formatOf(tpl.format);

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            <header className="bg-white border-b border-gray-200 px-5 py-4">
                <h1 className="text-lg font-black text-gray-900">{tpl.name}</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                    {tpl.intro || `Completá los datos y descargá tu pieza lista para publicar · ${fmt.width}×${fmt.height} px`}
                </p>
            </header>

            <div className="flex-1 flex flex-col lg:flex-row max-w-6xl w-full mx-auto">
                {/* ── Formulario ───────────────────────────────────── */}
                <div className="w-full lg:w-[400px] shrink-0 p-5 space-y-5">
                    {/* Sin campos no hay nada que completar, y una columna con
                        sólo dos botones no explica por qué. Se dice: para quien
                        usa el enlace es una pieza fija, y para quien lo publicó
                        es la pista de que le faltó marcar los campos. */}
                    {tpl.fields.length === 0 && (
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-sm font-bold text-gray-800 mb-1">Esta pieza no tiene datos para completar</p>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Descargala tal como está. Si esperabas poder escribir el nombre de tu club o subir una
                                foto, avisale a quien te compartió el enlace: los campos se marcan al publicar la
                                plantilla.
                            </p>
                        </div>
                    )}

                    {tpl.fields.map(field => {
                        if (field.type === 'image') {
                            const v = values[field.key];
                            const subiendo = uploadingKey === field.key;
                            const notas = photoNotes[field.key] || [];
                            // Un logotipo se PREVISUALIZA entero y sobre un fondo
                            // a cuadros: con `object-cover` —lo correcto para una
                            // fotografía— el escudo se ve recortado en la casilla
                            // aunque en la pieza entre completo, y eso hace creer
                            // que el sistema lo recortó.
                            const entera = field.kind ? field.kind !== 'foto' : field.key === 'logo';
                            return (
                                <div key={field.key}>
                                    <label className="block text-xs font-black text-gray-700 mb-1.5">
                                        {field.label}{field.required && <span className="text-red-500"> *</span>}
                                    </label>
                                    {v ? (
                                        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                                            <img src={v} alt="" className={`w-full h-40 ${entera ? 'object-contain p-3' : 'object-cover'}`} />
                                            <button onClick={() => { set(field.key, ''); setPhotoNotes(prev => ({ ...prev, [field.key]: [] })); }}
                                                className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full p-1.5 shadow" title="Quitar">
                                                <X className="w-4 h-4 text-gray-700" />
                                            </button>
                                        </div>
                                    ) : (
                                        // Arrastrar y soltar, además del clic. En un escritorio es
                                        // el gesto natural y el pedido lo nombra explícitamente.
                                        <label
                                            onDragOver={e => { e.preventDefault(); setDragOver(field.key); }}
                                            onDragLeave={() => setDragOver(null)}
                                            onDrop={e => { e.preventDefault(); setDragOver(null); subirImagen(e.dataTransfer.files?.[0], field.key); }}
                                            className={`flex flex-col items-center justify-center gap-2 h-40 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${dragOver === field.key ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40'}`}>
                                            {subiendo
                                                ? <Loader2 className="w-6 h-6 animate-spin text-blue-700" />
                                                : <Upload className="w-6 h-6 text-gray-400" />}
                                            <span className="text-xs font-semibold text-gray-600">
                                                {subiendo ? 'Adaptando la imagen…' : 'Arrastrá el archivo o hacé clic'}
                                            </span>
                                            <input type="file" accept={field.accept || 'image/*'} className="hidden" disabled={subiendo}
                                                onChange={e => { subirImagen(e.target.files?.[0], field.key); e.target.value = ''; }} />
                                        </label>
                                    )}
                                    {field.help && <p className="mt-1 text-[11px] text-gray-400">{field.help}</p>}
                                    {notas.map((n, i) => (
                                        <p key={i} className="mt-2 flex gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            <span><strong>{n.reason}</strong> {n.consequence}</span>
                                        </p>
                                    ))}
                                </div>
                            );
                        }

                        if (field.type === 'textarea') {
                            const v = values[field.key] || '';
                            return (
                                <div key={field.key}>
                                    <label className="block text-xs font-black text-gray-700 mb-1.5">{field.label}</label>
                                    {field.ai && (
                                        <button onClick={() => escribirIA(null)} disabled={busy === 'ia'}
                                            className="w-full mb-2 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg px-4 py-2.5 transition-colors">
                                            {busy === 'ia' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                            {busy === 'ia' ? 'Escribiendo…' : 'Generar mensaje con IA'}
                                        </button>
                                    )}
                                    <textarea className={`${box} min-h-[130px] resize-y leading-relaxed`} value={v}
                                        maxLength={field.maxChars || undefined} placeholder={field.placeholder}
                                        onChange={e => set(field.key, e.target.value)} />
                                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                        <span>{v.length}{field.maxChars ? ` / ${field.maxChars}` : ''} caracteres</span>
                                        {aiNote && <span className="text-amber-600">{aiNote}</span>}
                                    </div>
                                    {field.ai && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {TONOS.map(t => (
                                                <button key={t.id} onClick={() => escribirIA(t.id)} disabled={busy === 'ia' || !v.trim()}
                                                    className="text-[11px] font-semibold rounded-full border border-gray-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-40 px-2.5 py-1 text-gray-600 transition-colors">
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        // El nombre del club se BUSCA en el catálogo curado de
                        // la Feria, pero el campo sigue siendo texto libre: la
                        // lista ahorra escribir, no cierra el valor (regla del
                        // sitio desde v4.706). Y nunca un `<datalist>` — el
                        // navegador lo despliega encima y hace creer que la
                        // lista es obligatoria (v4.656).
                        const esClub = field.key === 'club';
                        return (
                            <div key={field.key} className="relative">
                                <label className="block text-xs font-black text-gray-700 mb-1.5">
                                    {field.label}{field.required && <span className="text-red-500"> *</span>}
                                </label>
                                <input
                                    className={box}
                                    inputMode={field.type === 'number' ? 'numeric' : undefined}
                                    maxLength={field.maxChars || undefined}
                                    placeholder={field.placeholder}
                                    autoComplete={esClub ? 'off' : undefined}
                                    value={values[field.key] || ''}
                                    onChange={e => {
                                        const v = field.type === 'number' ? e.target.value.replace(/\D/g, '') : e.target.value;
                                        set(field.key, v);
                                        if (esClub) buscarClub(v);
                                    }}
                                    onBlur={esClub ? () => window.setTimeout(() => setClubHits(null), 150) : undefined}
                                />
                                {esClub && clubHits && clubHits.length > 0 && (
                                    <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                                        {clubHits.map(c => (
                                            <li key={`${c.district}-${c.name}`}>
                                                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => elegirClub(c)}
                                                    className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                                                    {c.logo
                                                        ? <img src={c.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
                                                        : <span className="w-6 h-6 shrink-0" />}
                                                    <span className="text-sm text-gray-800 flex-1 truncate">{c.display}</span>
                                                    <span className="text-[10px] text-gray-400 shrink-0">D{c.district}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {esClub && buscandoClub && !clubHits?.length && (
                                    <p className="mt-1 text-[11px] text-gray-400">Buscando…</p>
                                )}
                                {field.help && <p className="mt-1 text-[11px] text-gray-400">{field.help}</p>}
                                {esClub && !field.help && (
                                    <p className="mt-1 text-[11px] text-gray-400">
                                        Escribí y elegí de la lista, o escribilo a mano si tu club no aparece.
                                    </p>
                                )}
                            </div>
                        );
                    })}

                    <div className="pt-2 space-y-2">
                        {/* ── EL GESTO EXPLÍCITO ────────────────────────
                            Antes acá había «Descargar» a secas y la pieza se
                            resolvía sola mientras se escribía: nadie sabía en
                            qué momento se generaba nada. Ahora Generar es el
                            paso, y descargar viene después, con la pieza a la
                            vista. */}
                        {fase === 'form' && (
                            <button onClick={generar} disabled={!!busy || !!uploadingKey || faltantes.length > 0}
                                className="w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-50 text-white font-bold rounded-lg px-4 py-3 transition-colors">
                                <Sparkles className="w-4 h-4" />
                                Generar mi pieza
                            </button>
                        )}

                        {/* Los pasos son los que OCURREN. Un progreso inventado
                            es peor que ninguno: hace esperar por nada. */}
                        {fase === 'generando' && (
                            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                                {pasos.map((p, i) => (
                                    <p key={i} className="flex items-center gap-2 text-xs">
                                        {p.done
                                            ? <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                                            : <Loader2 className="w-3.5 h-3.5 text-blue-700 animate-spin shrink-0" />}
                                        <span className={p.done ? 'text-gray-400 line-through' : 'font-semibold text-gray-700'}>{p.label}</span>
                                    </p>
                                ))}
                                <p className="pt-1 text-[11px] text-gray-400 leading-relaxed">
                                    Podés dejar esta pestaña abierta. Si algo falla, volvés al formulario con lo que ya cargaste.
                                </p>
                            </div>
                        )}

                        {fase === 'listo' && (
                            <>
                                <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                                    <p className="flex items-center gap-2 text-sm font-black text-green-900">
                                        <Check className="w-4 h-4" /> Tu pieza está lista
                                    </p>
                                    <p className="mt-1 text-[11px] text-green-800 leading-relaxed">
                                        Descargala o compartila. Si querés cambiar algo, volvé al formulario: no se pierde nada.
                                    </p>
                                </div>
                                <button onClick={descargar} disabled={!!busy || !!uploadingKey || faltantes.length > 0}
                                    className="w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-50 text-white font-bold rounded-lg px-4 py-3 transition-colors">
                                    {busy === 'descarga' ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : done ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                                    {busy === 'descarga' ? 'Generando…' : done ? '¡Listo!' : 'Descargar PNG'}
                                </button>
                                <button onClick={compartir} disabled={!!busy || !!uploadingKey || faltantes.length > 0}
                                    className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-50 border border-gray-300 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors">
                                    {busy === 'compartir' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                                    Compartir
                                </button>
                                {/* Volver a EDITAR, no a empezar. Obligar a
                                    recomenzar todo para cambiar una palabra es
                                    justo lo que el pedido señala. */}
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <button onClick={() => setFase('form')}
                                        className="text-xs font-bold border border-gray-300 hover:border-blue-400 rounded-lg px-2 py-2 text-gray-700 transition-colors">
                                        Editar los datos
                                    </button>
                                    <button onClick={generar} disabled={!!busy}
                                        className="flex items-center justify-center gap-1.5 text-xs font-bold border border-gray-300 hover:border-blue-400 disabled:opacity-50 rounded-lg px-2 py-2 text-gray-700 transition-colors">
                                        <Sparkles className="w-3.5 h-3.5" /> Regenerar
                                    </button>
                                </div>
                            </>
                        )}
                        {faltantes.length > 0 && (
                            <p className="text-[11px] text-gray-500 text-center">Falta completar: {faltantes.join(', ')}.</p>
                        )}
                        {conEjemploSinLlenar.length > 0 && (
                            <p className="flex gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>
                                    {conEjemploSinLlenar.length === 1
                                        ? <>Lo que se ve en «{conEjemploSinLlenar[0].label}» es un ejemplo. Si descargás ahora, la pieza sale <strong>sin esa imagen</strong>.</>
                                        : <>Las imágenes que se ven son un ejemplo. Si descargás ahora, la pieza sale <strong>sin ellas</strong>.</>}
                                </span>
                            </p>
                        )}
                        {/* La composición con IA. Se DICE lo que está pasando: son
                            entre 20 y 60 segundos y, sin aviso, parece que la
                            fotografía no se subió. */}
                        {composing && (
                            <p className="flex gap-1.5 text-[11px] text-purple-700 bg-purple-50 border border-purple-200 rounded-lg p-2 leading-relaxed">
                                <Loader2 className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-spin" />
                                <span>Integrando tu fotografía en el diseño. Tarda entre 20 y 60 segundos; mientras tanto podés seguir completando el resto.</span>
                            </p>
                        )}
                        {composeNote && !composing && (
                            // Un fallo NO rompe la pieza: queda la composición
                            // declarada, con la fotografía en su recuadro. Es una
                            // pieza correcta, así que se informa y se sigue.
                            <p className="flex gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>{composeNote} Tu pieza igual se puede descargar: la fotografía queda en su recuadro.</span>
                            </p>
                        )}
                        {backdrop && !composing && (
                            <p className="flex gap-1.5 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2 leading-relaxed">
                                <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-600" />
                                <span>
                                    Tu fotografía quedó integrada en el diseño.{' '}
                                    <button onClick={() => setBackdrop(null)} className="font-bold text-blue-700 hover:underline">
                                        Prefiero verla en su recuadro
                                    </button>.
                                </span>
                            </p>
                        )}
                        <p className="text-[11px] text-gray-400 text-center pt-1">
                            La imagen se genera en tu navegador, a {fmt.width * 2}×{fmt.height * 2} px.
                        </p>
                    </div>
                </div>

                {/* ── Vista previa ─────────────────────────────────── */}
                <div className="flex-1 min-w-0 p-5 lg:pl-0">
                    <div className="lg:sticky lg:top-5">
                        <div ref={stageRef} className="flex justify-center">
                            {/* El MISMO componente del editor, sin herramientas.
                                Es lo que garantiza que esta vista previa sea la
                                pieza que se descarga. */}
                            <DesignCanvas doc={doc} zoom={zoom} interactive={false} showGuides={false} hints={hints} fusedId={fusedId} />
                        </div>
                        {/* La promesa del módulo es que la vista previa ES el
                            archivo. Con los recuadros a la vista deja de ser
                            literal, así que se dice — callarlo sería peor que no
                            mostrarlos. */}
                        <p className="mt-3 text-center text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5" />
                            {hints.length === 0
                                ? 'Se actualiza mientras escribís. Es exactamente lo que vas a descargar.'
                                : hints.some(h => h.sample)
                                    // Con una imagen de ejemplo a la vista hay
                                    // que decir DOS cosas, no una: que no es la
                                    // suya y que no se descarga. Cualquiera de
                                    // las dos sola deja a alguien creyendo que
                                    // su pieza ya tiene ese logotipo.
                                    ? 'Lo que está dentro de un recuadro punteado es un ejemplo de cómo va a quedar: no es tuyo y no se descarga.'
                                    : 'Los recuadros punteados marcan dónde va cada imagen. No se descargan.'}
                        </p>
                    </div>
                </div>
            </div>

            <footer className="text-center py-6 text-[10px] text-gray-400">
                Generado con <span className="font-semibold">Club Platform for Rotary</span>
            </footer>
        </div>
    );
};

export default PlantillaPublica;
