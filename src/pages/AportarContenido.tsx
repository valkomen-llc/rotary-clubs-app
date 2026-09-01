import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Upload, X, Image as ImageIcon, Film, Loader2, CheckCircle2,
    AlertTriangle, HeartHandshake, MapPin, Info, Users, Share2, Plus, Search,
} from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
import {
    ACCEPT_ATTR, MAX_FILES, checkFileMeta,
    POST_PLATFORMS, POST_PLATFORM_OTHER, MAX_POSTS, MAX_PARTICIPATING_CLUBS,
    normalizePostUrl,
} from '../lib/contentSubmissionSpec';
// El MISMO valor reservado que el registro a un evento y las inscripciones
// completadas: con dos distintos, una salida manual se guardaría como si fuera
// el nombre de un club.
import { CLUB_NOT_LISTED } from '../lib/eventRegistrationSpec';
// ⚠️ EL CATÁLOGO DE PAÍSES ES EL DEL SITIO, NO UNA COPIA. Vive en
// `countryPhones.ts` y ya lo carga el selector telefónico de los otros
// formularios: una segunda lista se separaría en silencio y este teléfono
// terminaría con un indicativo que ningún otro formulario reconoce. Lo que NO
// se reutiliza es el `PhoneField` de `FairField.tsx` —su piel es la de aquel
// formulario, con otros bordes y otros colores—: acá se comparte el DATO y el
// análisis del número, que es la parte que no puede tener dos verdades.
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, flagEmoji } from '../lib/countryPhones';

// ════════════════════════════════════════════════════════════════════
// Aportar contenido a una campaña — el formulario PÚBLICO (v4.972)
//
// Se abre desde un enlace compartido, sin sesión, y está pensado para hacerse
// desde el teléfono en la calle: por eso los archivos suben DIRECTO a S3 con
// una URL prefirmada —el cuerpo de una función se corta en ~4,5 MB y un video
// de móvil pesa decenas— y por eso se exige muy poco.
//
// ⚠️ NADA DE LO QUE LLEGA ACÁ SE PUBLICA SOLO. Los archivos van a un prefijo
// sin lectura pública y la solicitud entra en «Recibido»; sólo una aprobación
// del equipo los mueve a la Biblioteca. Es estructural, no una promesa de
// pantalla, y el formulario lo DICE — quien manda la foto de su club tiene
// derecho a saber qué va a pasar con ella.
//
// ── EL ORDEN DE LOS BLOQUES ES EL RECORRIDO, NO UNA LISTA (v4.972) ──
//
// Material → qué ocurrió → datos de la actividad → participación rotaria →
// difusión previa → quién lo envía → información adicional → consentimiento.
// Va de lo que la persona TIENE EN LA MANO a lo que tiene que recordar, y
// termina en lo suyo. Los archivos siguen primero por el mismo motivo de
// v4.968: pedirle los datos antes de dejarlo soltar las fotos es la forma más
// segura de perderlo.
//
// ── LO QUE SE MUESTRA POCO Y SE REVELA ──────────────────────────────
//
// Los clubes participantes no aparecen hasta que hay un distrito —sin él la
// lista sería de mil nombres— y las publicaciones no aparecen hasta que
// alguien contesta que sí las hubo. El formulario no es más largo: es más
// corto hasta que hace falta.
// ════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';

interface Adjunto {
    id: string;
    file: File;
    kind: 'image' | 'video';
    preview: string | null;
    estado: 'pendiente' | 'subiendo' | 'listo' | 'error';
    progreso: number;
    key?: string;
    error?: string;
}

/** Un club participante ya elegido. `source` dice de dónde salió el nombre:
 *  es lo que después distingue un club nuevo de un error de tipeo. */
interface ClubElegido { name: string; source: 'catalogo' | 'manual' }

/** Una publicación que el club ya hizo. Vive con su `id` de pantalla para que
 *  quitar una fila del medio no rehaga las demás. */
interface PostFila { id: string; platform: string; platformOther: string; url: string }

interface FormConfig {
    campaign: { id: string; slug: string; name: string; title: string; badge: string; location: string; image: string; theme?: any };
    open: boolean;
    closedReason: string | null;
    headline: string;
    intro: string;
    thanksMessage: string;
    consentText: string;
    consentIsProvisional: boolean;
    // El catálogo Distrito → Clubes lo manda el SERVIDOR (v4.708): es una
    // lista curada que vive en un solo sitio, y copiarla al bundle daría dos
    // que se separan en silencio. Opcional: un navegador con el bundle nuevo
    // contra un servidor anterior degrada a los campos de texto de siempre.
    catalogs?: { districts?: Array<{ value: string; label: string; clubs?: string[] }> };
    // El distrito de la campaña, cuando se sabe sin ambigüedad. Es un DEFAULT
    // del desplegable; quien llena el formulario puede cambiarlo.
    defaultDistrict?: string;
    // Las plataformas de una publicación ya hecha. Vienen del servidor por el
    // mismo motivo que los distritos; el espejo local es el respaldo.
    platforms?: Array<{ id: string; label: string }>;
    limits: { maxFiles: number; imageMaxMb: number; videoMaxMb: number; maxClubs?: number; maxPosts?: number };
}

const nuevoId = () => Math.random().toString(36).slice(2);

/** Lee la respuesta como TEXTO y sólo después la parsea. Una respuesta HTML
 *  —el error de la plataforma, el documento de la SPA— rompe `.json()` con un
 *  mensaje que no nombra ninguna capa (lección de v4.946). */
const leerJson = async (r: Response) => {
    const texto = await r.text();
    try { return JSON.parse(texto); } catch {
        throw new Error(`El servidor respondió ${r.status} con ${r.headers.get('content-type') || 'contenido desconocido'} en vez de JSON.`);
    }
};

// ── Las clases compartidas ────────────────────────────────────────
//
// Viven en el ámbito del módulo y no dentro del componente: son constantes,
// y recalcularlas en cada render no cambia nada salvo el trabajo.
const CAMPO = 'w-full p-3.5 rounded-xl border-2 border-gray-100 text-sm bg-gray-50/60 outline-none focus:border-rotary-blue transition-colors';
const ROTULO = 'block text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2';
const TARJETA = 'bg-white rounded-3xl p-6 shadow-sm border border-gray-100';

// ── El marco del SITIO ────────────────────────────────────────────
//
// ⚠️ ESTA PÁGINA ES DEL SITIO, NO UNA HERRAMIENTA SUELTA. Se estrenó sin
// encabezado ni pie y con un azul propio, así que se abría desde un WhatsApp
// y no se parecía a nada del Distrito: quien la recibe tiene que reconocer
// de quién es antes de subir una fotografía de su club. Va con el MISMO
// `<Navbar />`, el MISMO `<Footer />` y la MISMA cabecera compartida
// (`PAGE_HEADER_BACKGROUND`, v4.613) que la postulación de proyectos, los
// eventos y Contacto — un azul propio se separa del sitio en silencio.
//
// Los cuatro estados de la pantalla —cargando, error, gracias y el
// formulario— pasan por acá: puesto en uno solo, los otros tres se quedan
// sin encabezado y el fallo es mudo.
//
// ⚠️⚠️ VA EN EL ÁMBITO DEL MÓDULO, JAMÁS DENTRO DEL COMPONENTE. En v4.969 se
// declaró adentro y el formulario dejó de poder escribirse: React identifica
// un componente por su TIPO, y una función declarada dentro de otra es un
// tipo NUEVO en cada render. Así que a cada pulsación React no actualizaba el
// árbol — lo DESMONTABA entero y lo montaba de nuevo: la casilla perdía el
// foco tras una sola letra y la página saltaba al principio. No da ningún
// error, no lo ve el typecheck ni `check:hooks`, y se reporta como «no me
// deja escribir». Al extraer un envoltorio de una pantalla, sacarlo del
// componente. Vale para TODOS los de este archivo, no sólo para éste.
const Marco: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-rotary-concrete flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
    </div>
);

/** Una sección con su icono, su título y su ayuda. SIN marco propio. */
//
// ⚠️ VA EN EL ÁMBITO DEL MÓDULO, como todo componente de este archivo (v4.971).
//
// Es la pieza que permite que varias secciones compartan UNA tarjeta sin
// perder su título ni su ayuda: lo que se fusiona es el CONTENEDOR, no el
// contenido. La separación entre secciones es un filete, no un espacio con
// sombra — cuatro tarjetas seguidas se leían como cuatro formularios
// distintos.
const Seccion: React.FC<{ icono: React.ReactNode; titulo: string; ayuda?: string; primera?: boolean; children: React.ReactNode }> = ({ icono, titulo, ayuda, primera, children }) => (
    <section className={`space-y-4${primera ? '' : ' pt-6 mt-6 border-t border-gray-100'}`}>
        <div>
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">{icono} {titulo}</h2>
            {ayuda && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{ayuda}</p>}
        </div>
        {children}
    </section>
);

/** Una sección SOLA dentro de su tarjeta. */
//
// Se compone sobre `Seccion` a propósito: con el encabezado escrito dos veces,
// una tarjeta suelta y una sección de la tarjeta compartida se separan en
// silencio y el mismo título se ve distinto según en cuál caiga.
const Bloque: React.FC<{ icono: React.ReactNode; titulo: string; ayuda?: string; children: React.ReactNode }> = ({ icono, titulo, ayuda, children }) => (
    <div className={TARJETA}>
        <Seccion icono={icono} titulo={titulo} ayuda={ayuda} primera>{children}</Seccion>
    </div>
);

// ── El selector de clubes participantes ───────────────────────────
//
// ⚠️ ESTO NO ES «TU CLUB». Una actividad la pueden haber hecho tres clubes y
// la manda una sola persona, que quizá no pertenece a los otros dos: por eso
// vive en su propio bloque, se guarda aparte y no toca los datos del
// remitente.
//
// LA LISTA AYUDA A ELEGIR; NO CIERRA LOS VALORES (v4.706). El catálogo se
// queda viejo solo —clubes nuevos, fusiones, cambios de nombre— y lo que está
// en juego acá es que alguien no pueda mandar las fotos de su club. Por eso
// hay una salida para escribir un nombre que la lista no tiene, y va de
// última: quien sí está en la lista la usa.
const ClubPicker: React.FC<{
    disponibles: string[];
    elegidos: ClubElegido[];
    onChange: (clubes: ClubElegido[]) => void;
    tope: number;
    hayDistrito: boolean;
}> = ({ disponibles, elegidos, onChange, tope, hayDistrito }) => {
    const [busqueda, setBusqueda] = useState('');
    const [aMano, setAMano] = useState(false);
    const [nuevo, setNuevo] = useState('');

    const yaEsta = (nombre: string) =>
        elegidos.some(c => c.name.toLowerCase() === nombre.toLowerCase());

    const filtrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        const sinElegir = disponibles.filter(c => !yaEsta(c));
        if (!q) return sinElegir.slice(0, 60);
        return sinElegir.filter(c => c.toLowerCase().includes(q)).slice(0, 60);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [busqueda, disponibles, elegidos]);

    const agregar = (name: string, source: 'catalogo' | 'manual') => {
        const limpio = name.trim();
        if (!limpio || yaEsta(limpio) || elegidos.length >= tope) return;
        onChange([...elegidos, { name: limpio, source }]);
        setBusqueda('');
    };

    if (!hayDistrito) {
        return (
            <p className="text-xs text-gray-400 bg-gray-50/70 border border-gray-100 rounded-xl p-3.5 leading-relaxed">
                Elegí primero el distrito y acá aparecen sus clubes.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {/* Los elegidos, como fichas. Quitar uno es un gesto, no un menú. */}
            {elegidos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {elegidos.map(c => (
                        <span key={c.name} data-no-translate
                            className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-xl bg-rotary-blue/10 text-rotary-blue text-xs font-bold">
                            {c.name}
                            <button type="button" onClick={() => onChange(elegidos.filter(x => x.name !== c.name))}
                                aria-label={`Quitar ${c.name}`}
                                className="w-5 h-5 rounded-lg hover:bg-rotary-blue/20 flex items-center justify-center">
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {elegidos.length >= tope ? (
                <p className="text-[11px] text-amber-700">Se pueden indicar hasta {tope} clubes.</p>
            ) : aMano ? (
                <div className="flex gap-2">
                    {/* `min-w-0` porque esto vive en media columna: un `input`
                        trae un ancho mínimo propio (v4.974) y sin eso empuja
                        «Agregar» y «Volver» fuera de la tarjeta. */}
                    <input
                        value={nuevo} onChange={e => setNuevo(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(nuevo, 'manual'); setNuevo(''); } }}
                        placeholder="Escribí el nombre del club" autoFocus
                        className={`${CAMPO} min-w-0`}
                    />
                    <button type="button" onClick={() => { agregar(nuevo, 'manual'); setNuevo(''); }}
                        className="px-4 rounded-xl bg-rotary-blue text-white text-xs font-black flex-shrink-0">
                        Agregar
                    </button>
                    <button type="button" onClick={() => { setAMano(false); setNuevo(''); }}
                        className="px-3 rounded-xl border-2 border-gray-100 text-xs font-bold text-gray-500 flex-shrink-0">
                        Volver
                    </button>
                </div>
            ) : (
                <>
                    <div className="relative">
                        <Search className="w-4 h-4 text-gray-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            value={busqueda} onChange={e => setBusqueda(e.target.value)}
                            placeholder="Buscá un club por su nombre"
                            aria-label="Buscar un club participante"
                            className={`${CAMPO} pl-10`}
                        />
                    </div>
                    <div className="max-h-52 overflow-y-auto rounded-xl border-2 border-gray-100 divide-y divide-gray-50">
                        {filtrados.length === 0 ? (
                            <p className="text-xs text-gray-400 p-4 text-center">
                                {busqueda ? 'Ningún club de este distrito coincide.' : 'Ya elegiste todos los clubes de la lista.'}
                            </p>
                        ) : filtrados.map(c => (
                            <button key={c} type="button" onClick={() => agregar(c, 'catalogo')} data-no-translate
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50/60 flex items-center justify-between gap-2">
                                {c}
                                <Plus className="w-4 h-4 text-gray-300 flex-shrink-0" />
                            </button>
                        ))}
                    </div>
                    {/* La salida va de ÚLTIMA y cuesta un gesto extra (v4.706). */}
                    <button type="button" onClick={() => setAMano(true)}
                        className="text-[11px] font-bold text-rotary-blue underline">
                        Un club participante no está en la lista
                    </button>
                </>
            )}
        </div>
    );
};

// ── Las publicaciones que el club ya hizo ─────────────────────────
//
// Una fila = una publicación. Se pueden registrar varias de la MISMA
// plataforma —dos posts de Instagram y uno de Facebook es el caso normal—,
// así que la plataforma no es una llave: es un dato de la fila.
const PostRow: React.FC<{
    fila: PostFila;
    plataformas: Array<{ id: string; label: string }>;
    onChange: (fila: PostFila) => void;
    onQuitar: () => void;
    ultima: boolean;
}> = ({ fila, plataformas, onChange, onQuitar, ultima }) => {
    // El aviso se calcula al vuelo con el MISMO criterio del servidor, y sólo
    // cuando hay algo escrito: señalar un campo vacío que nadie llenó todavía
    // es ruido.
    const juicio = fila.url.trim() ? normalizePostUrl(fila.url) : null;
    return (
        <div className="rounded-2xl border-2 border-gray-100 p-3 space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
                {/* ⚠️ EL ANCHO VA EN UN ENVOLTORIO, NO ENCIMA DE `CAMPO`.
                    `CAMPO` declara `w-full`, y en el CSS compilado `.w-full`
                    va DESPUÉS de `.w-40`: escribirlas juntas en el mismo
                    elemento no da error —gana la última del archivo, no la
                    última del atributo— y el selector se llevaba la fila
                    entera, empujando el enlace fuera de la tarjeta. */}
                <div className="sm:w-40 sm:flex-shrink-0">
                    <select
                        value={fila.platform} aria-label="Plataforma de la publicación"
                        onChange={e => onChange({ ...fila, platform: e.target.value })}
                        className={CAMPO}
                    >
                        <option value="">Plataforma…</option>
                        {plataformas.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                </div>
                {/* El enlace y su botón de quitar viajan juntos: en un móvil
                    quedan en su propia línea, debajo de la plataforma, en vez
                    de repartirse un ancho en el que no cabe ninguno de los
                    dos. `min-w-0` es lo que deja que el campo se encoja — un
                    `input` trae un ancho mínimo propio y sin eso desborda. */}
                <div className="flex gap-2 min-w-0 flex-1">
                    <input
                        value={fila.url} inputMode="url"
                        onChange={e => onChange({ ...fila, url: e.target.value })}
                        placeholder="https://…"
                        aria-label="Enlace de la publicación"
                        className={`${CAMPO} min-w-0`}
                    />
                    {/* Quitar una fila se ofrece siempre que haya más de una:
                        con una sola, el botón dejaría el bloque vacío sin
                        decir cómo volver. */}
                    {!ultima && (
                        <button type="button" onClick={onQuitar} aria-label="Quitar esta publicación"
                            className="w-11 flex-shrink-0 rounded-xl border-2 border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-100 flex items-center justify-center">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            {/* «Otra» pide el nombre del canal: sin él, la fila diría «Otra» y
                no habría forma de saber dónde se publicó. */}
            {fila.platform === POST_PLATFORM_OTHER && (
                <input
                    value={fila.platformOther}
                    onChange={e => onChange({ ...fila, platformOther: e.target.value })}
                    placeholder="¿En qué plataforma o canal? (boletín, radio comunitaria…)"
                    aria-label="Nombre de la plataforma o canal"
                    className={CAMPO}
                />
            )}
            {juicio && !juicio.ok && (
                <p className="text-[11px] text-amber-700 font-semibold">{juicio.error}</p>
            )}
        </div>
    );
};

// ── El teléfono internacional ─────────────────────────────────────
//
// ⚠️ SE GUARDAN LAS PARTES, NO EL NÚMERO PEGADO. Este contacto va a terminar
// en WhatsApp y en el CRM, y allá hace falta el número en E.164
// (`+573001234567`) SIN tener que deducir el país a partir de los dígitos —
// que es el error que `phone.js` documenta como caro: adivinar mal manda el
// mensaje a un tercero real que lo recibe y lo abre.
//
// El E.164 lo COMPONE el servidor a partir del indicativo y del número: acá
// sólo se eligen las dos piezas. Así el número guardado no puede contradecir
// a sus partes.
const PhoneParts: React.FC<{
    iso: string; national: string;
    onChange: (iso: string, national: string) => void;
}> = ({ iso, national, onChange }) => (
    <div className="flex rounded-xl border-2 border-gray-100 bg-gray-50/60 overflow-hidden focus-within:border-rotary-blue transition-colors">
        <div className="relative flex-shrink-0 border-r-2 border-gray-100">
            <div aria-hidden className="flex items-center gap-1.5 px-3 py-3.5 text-sm font-bold text-gray-600">
                <span className="text-base leading-none">{flagEmoji(iso)}</span>
                <span data-no-translate>{findCountry(iso).dial}</span>
            </div>
            {/* El `select` va invisible ENCIMA de lo dibujado: así el control
                es el nativo del sistema —que en un móvil es una rueda— y lo
                que se ve es la bandera con su indicativo. */}
            <select
                aria-label="País del teléfono" value={iso}
                onChange={e => onChange(e.target.value, national)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
                {COUNTRIES.map(c => (
                    <option key={c.iso} value={c.iso}>{flagEmoji(c.iso)} {c.name} ({c.dial})</option>
                ))}
            </select>
        </div>
        <input
            type="tel" inputMode="tel" autoComplete="tel"
            value={national} onChange={e => onChange(iso, e.target.value)}
            placeholder="300 123 4567"
            aria-label="Número de teléfono"
            className="w-full bg-transparent px-3.5 py-3.5 text-sm outline-none"
        />
    </div>
);

const AportarContenido: React.FC = () => {
    const { ref } = useParams<{ ref: string }>();
    const [config, setConfig] = useState<FormConfig | null>(null);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [enviado, setEnviado] = useState<{ warnings: string[] } | null>(null);
    const [errores, setErrores] = useState<string[]>([]);
    const [arrastrando, setArrastrando] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    // «Mi club no está en la lista» es estado DE LA PANTALLA: dice de dónde
    // salió el nombre, no cuál es. No se envía ni se guarda (regla de v4.706).
    const [clubALaMano, setClubALaMano] = useState(false);

    const [f, setF] = useState({
        senderName: '', senderEmail: '',
        // El teléfono vive en PARTES: el E.164 lo compone el servidor.
        senderPhoneCountry: DEFAULT_COUNTRY, senderPhoneNational: '',
        district: '', club: '', role: '',
        title: '', description: '', location: '', city: '', activityDate: '',
        story: '', extra: '', consent: false,
    });
    // Los clubes participantes y la difusión previa viven APARTE del resto del
    // formulario: son listas, y meterlas en el mismo objeto obligaría a
    // rehacerlo entero en cada pulsación de una fila.
    const [clubes, setClubes] = useState<ClubElegido[]>([]);
    const [difusion, setDifusion] = useState<'' | 'si' | 'no'>('');
    const [posts, setPosts] = useState<PostFila[]>([]);
    const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);

    useSEO({
        title: config ? `Aportar contenido — ${config.campaign.name}` : 'Aportar contenido',
        description: 'Comparte fotografías, videos y la historia de la actividad de tu club.',
    });

    const cargar = useCallback(async () => {
        setCargando(true); setErrorCarga(null);
        try {
            const r = await fetch(`${API}/contribution-campaigns/submissions/form/${encodeURIComponent(ref || '')}`);
            const data = await leerJson(r);
            if (!r.ok) throw new Error(data?.error || `El servidor respondió ${r.status}.`);
            setConfig(data);
            // El distrito de la campaña entra como DEFAULT del desplegable, no
            // como un valor guardado: se puede cambiar, y cambiarlo descarta
            // los clubes elegidos porque ya no describen nada.
            if (data?.defaultDistrict) setF(prev => (prev.district ? prev : { ...prev, district: data.defaultDistrict }));
        } catch (e: any) {
            setErrorCarga(e?.message || 'No se pudo cargar el formulario.');
        } finally { setCargando(false); }
    }, [ref]);

    useEffect(() => { cargar(); }, [cargar]);

    // Las previsualizaciones son object URLs y hay que soltarlas: con un video
    // de 200 MB, no hacerlo deja el archivo entero retenido en memoria.
    useEffect(() => () => { adjuntos.forEach(a => a.preview && URL.revokeObjectURL(a.preview)); }, [adjuntos]);

    const agregarArchivos = (lista: FileList | File[]) => {
        const nuevos: Adjunto[] = [];
        const problemas: string[] = [];
        for (const file of Array.from(lista)) {
            if (adjuntos.length + nuevos.length >= MAX_FILES) {
                problemas.push(`Se pueden enviar hasta ${MAX_FILES} archivos por envío.`);
                break;
            }
            // Se comprueba ANTES de subir: avisar después de esperar 200 MB de
            // subida en una red móvil sería el peor momento posible.
            const juicio = checkFileMeta({ contentType: file.type, filename: file.name, size: file.size });
            if (!juicio.ok) { problemas.push(`${file.name}: ${juicio.errores[0]}`); continue; }
            const kind = juicio.kind as 'image' | 'video';
            nuevos.push({
                id: nuevoId(), file, kind,
                preview: kind === 'image' ? URL.createObjectURL(file) : null,
                estado: 'pendiente', progreso: 0,
            });
        }
        setErrores(problemas);
        if (nuevos.length) setAdjuntos(prev => [...prev, ...nuevos]);
    };

    const quitar = (id: string) => setAdjuntos(prev => {
        const salir = prev.find(a => a.id === id);
        if (salir?.preview) URL.revokeObjectURL(salir.preview);
        return prev.filter(a => a.id !== id);
    });

    /** Sube UN archivo directo a S3 con la URL prefirmada. El progreso viene de
     *  XHR: `fetch` no lo reporta, y sin progreso una subida de un video desde
     *  el móvil se ve como una pantalla colgada. */
    const subirUno = (a: Adjunto): Promise<string> => new Promise(async (resolve, reject) => {
        try {
            const r = await fetch(`${API}/contribution-campaigns/submissions/form/${encodeURIComponent(ref || '')}/presign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contentType: a.file.type, filename: a.file.name, size: a.file.size }),
            });
            const data = await leerJson(r);
            if (!r.ok) throw new Error(data?.error || 'No se pudo preparar la subida.');

            const xhr = new XMLHttpRequest();
            xhr.open('PUT', data.uploadUrl, true);
            xhr.setRequestHeader('Content-Type', data.contentType);
            xhr.upload.onprogress = (ev) => {
                if (!ev.lengthComputable) return;
                const pct = Math.round((ev.loaded / ev.total) * 100);
                setAdjuntos(prev => prev.map(x => x.id === a.id ? { ...x, progreso: pct } : x));
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve(data.key);
                // Es OTRO salto: el almacenamiento, no nuestra API. Decir su
                // estado es lo que evita diagnosticar la capa equivocada.
                else reject(new Error(`El almacenamiento rechazó el archivo (HTTP ${xhr.status}).`));
            };
            xhr.onerror = () => reject(new Error('Se cortó la conexión al subir el archivo.'));
            xhr.send(a.file);
        } catch (e) { reject(e); }
    });

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrores([]);
        const previos: string[] = [];
        if (!f.senderName.trim()) previos.push('Escribí tu nombre.');
        if (!f.senderEmail.trim()) previos.push('Escribí tu correo electrónico.');
        if (!f.consent) previos.push('Hay que aceptar las condiciones para poder enviar el material.');
        if (!adjuntos.length) previos.push('Adjuntá al menos una fotografía o un video.');
        // Decir que SÍ sin ninguna publicación válida es un error, no un aviso
        // (requisito 3): quien marcó «Sí» está afirmando que existe una
        // difusión. El servidor lo comprueba otra vez — esto sólo evita el
        // viaje.
        const validas = posts.filter(p => p.platform && normalizePostUrl(p.url).ok);
        if (difusion === 'si' && !validas.length) {
            previos.push('Indicaste que la actividad ya se publicó: agregá al menos una plataforma con su enlace.');
        }
        if (previos.length) { setErrores(previos); return; }

        setEnviando(true);
        try {
            const subidos: { key: string; filename: string; contentType: string }[] = [];
            for (const a of adjuntos) {
                if (a.key) { subidos.push({ key: a.key, filename: a.file.name, contentType: a.file.type }); continue; }
                setAdjuntos(prev => prev.map(x => x.id === a.id ? { ...x, estado: 'subiendo', progreso: 0 } : x));
                try {
                    const key = await subirUno(a);
                    setAdjuntos(prev => prev.map(x => x.id === a.id ? { ...x, estado: 'listo', progreso: 100, key } : x));
                    subidos.push({ key, filename: a.file.name, contentType: a.file.type });
                } catch (err: any) {
                    setAdjuntos(prev => prev.map(x => x.id === a.id ? { ...x, estado: 'error', error: err?.message } : x));
                    throw new Error(`${a.file.name}: ${err?.message || 'no se pudo subir'}`);
                }
            }

            const r = await fetch(`${API}/contribution-campaigns/submissions/form/${encodeURIComponent(ref || '')}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...f,
                    // El indicativo se manda resuelto desde el catálogo único;
                    // el E.164 lo compone el SERVIDOR y no se manda armado.
                    senderPhoneDial: f.senderPhoneNational.trim() ? findCountry(f.senderPhoneCountry).dial : '',
                    clubs: clubes,
                    hasPosts: difusion === 'si',
                    posts: difusion === 'si' ? posts.map(p => ({ platform: p.platform, platformOther: p.platformOther, url: p.url })) : [],
                    files: subidos,
                }),
            });
            const data = await leerJson(r);
            if (!r.ok) throw new Error(data?.error || 'No se pudo enviar.');
            setEnviado({ warnings: data.warnings || [] });
        } catch (err: any) {
            setErrores([err?.message || 'No se pudo enviar el material.']);
        } finally { setEnviando(false); }
    };

    // ── Estados de la pantalla ────────────────────────────────────────

    if (cargando) {
        return (
            <Marco>
                <div className="flex items-center justify-center py-32">
                    <Loader2 className="w-8 h-8 animate-spin text-rotary-blue" />
                </div>
            </Marco>
        );
    }

    if (errorCarga || !config) {
        return (
            <Marco>
                <div className="flex items-center justify-center px-4 py-20">
                <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-sm border border-gray-100">
                    <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
                    <h1 className="text-lg font-bold text-gray-800 mt-4">No se pudo abrir el formulario</h1>
                    <p className="text-sm text-gray-500 mt-2">{errorCarga}</p>
                    <button onClick={cargar} className="mt-5 px-5 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold">
                        Reintentar
                    </button>
                </div>
                </div>
            </Marco>
        );
    }

    if (enviado) {
        return (
            <Marco>
                <div className="flex items-center justify-center px-4 py-16">
                <div className="bg-white rounded-3xl p-8 md:p-10 max-w-lg w-full text-center shadow-sm border border-gray-100">
                    <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
                    <h1 className="text-2xl font-light text-gray-800 mt-5">¡Gracias!</h1>
                    <p className="text-sm text-gray-600 mt-3 leading-relaxed">
                        {config.thanksMessage || 'Recibimos tu material. El equipo va a revisarlo antes de usarlo en cualquier comunicación.'}
                    </p>
                    {/* Lo que faltó se DICE, no se calla: quien envió puede
                        completarlo escribiendo, y el equipo lo va a ver. */}
                    {enviado.warnings.length > 0 && (
                        <div className="mt-6 text-left bg-amber-50/60 border border-amber-100 rounded-2xl p-4">
                            <p className="text-xs font-bold text-amber-900">Nos faltó algo de información</p>
                            <ul className="mt-2 space-y-1">
                                {enviado.warnings.map((w, i) => (
                                    <li key={i} className="text-[12px] text-amber-800 leading-relaxed">· {w}</li>
                                ))}
                            </ul>
                            <p className="text-[11px] text-amber-700 mt-3">
                                No hace falta volver a enviar todo: si querés completarlo, respondé al equipo cuando te escriban.
                            </p>
                        </div>
                    )}
                    {/* Se conservan el remitente, el distrito y los clubes: quien
                        manda una segunda actividad es la misma persona del mismo
                        club, y volver a pedírselo es la friccion que hace que no
                        mande la segunda. */}
                    <button
                        onClick={() => {
                            setEnviado(null); setAdjuntos([]);
                            setF(prev => ({ ...prev, title: '', description: '', story: '', location: '', city: '', activityDate: '', extra: '' }));
                            setDifusion(''); setPosts([]);
                        }}
                        className="mt-7 px-5 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold"
                    >
                        Enviar otra actividad
                    </button>
                </div>
                </div>
            </Marco>
        );
    }

    // El catálogo, ya resuelto. `clubesDelDistrito` se deriva del distrito
    // elegido en vez de guardarse aparte: una segunda copia se contradiría en
    // cuanto alguien cambie de distrito.
    const distritos = config.catalogs?.districts || [];
    const clubesDelDistrito = distritos.find(d => d.value === f.district)?.clubs || [];
    // Las plataformas las manda el servidor; el espejo local es el respaldo
    // para un navegador nuevo contra un servidor anterior.
    const plataformas = config.platforms?.length ? config.platforms : Object.values(POST_PLATFORMS);
    const topeClubes = config.limits.maxClubs || MAX_PARTICIPATING_CLUBS;
    const topePosts = config.limits.maxPosts || MAX_POSTS;
    // El club del remitente se ofrece de lo que YA se eligió arriba —es el caso
    // normal: quien manda pertenece a uno de los clubes que participaron— y,
    // si no se eligió ninguno, de los del distrito. No es el mismo dato: es
    // suyo, y por eso se guarda aparte.
    // ⚠️ EL VALOR ELEGIDO SIEMPRE ES UNA OPCIÓN. Sin esto, quitar de arriba el
    // club que el remitente ya había elegido deja el desplegable en blanco
    // mientras `f.club` sigue teniendo su nombre: la pantalla mostraría una
    // cosa y se mandaría otra. Es el patrón del «(rol actual)» de v4.939.
    const clubesParaElRemitente = (() => {
        const base = clubes.length ? clubes.map(c => c.name) : clubesDelDistrito;
        return f.club && !base.includes(f.club) ? [f.club, ...base] : base;
    })();

    const cambiarPost = (fila: PostFila) => setPosts(prev => prev.map(p => (p.id === fila.id ? fila : p)));
    const filaVacia = (): PostFila => ({ id: nuevoId(), platform: '', platformOther: '', url: '' });

    return (
        <Marco>
            <div className="pb-20">
            {/* Cabecera con la identidad de la campaña, sobre el fondo
                COMPARTIDO del sitio (`PAGE_HEADER_BACKGROUND`): el mismo de la
                postulación de proyectos, los eventos y Contacto. */}
            <header style={PAGE_HEADER_BACKGROUND} className="text-white">
                <div className="max-w-2xl mx-auto px-4 py-10 md:py-14">
                    {config.campaign.badge && (
                        <span className="inline-block text-[10px] font-black tracking-[0.2em] px-3 py-1.5 rounded-lg bg-white/15">
                            {config.campaign.badge}
                        </span>
                    )}
                    <h1 className="text-2xl md:text-3xl font-light mt-4 leading-tight">
                        {config.headline || `Comparte lo que tu club está haciendo por ${config.campaign.name}`}
                    </h1>
                    {config.campaign.location && (
                        <p className="text-sm text-white/70 mt-3 flex items-center gap-2">
                            <MapPin className="w-4 h-4" />{config.campaign.location}
                        </p>
                    )}
                </div>
            </header>

            <div className="max-w-2xl mx-auto px-4 -mt-6">
                {!config.open ? (
                    <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center">
                        <Info className="w-10 h-10 text-gray-300 mx-auto" />
                        <p className="text-sm font-bold text-gray-700 mt-4">Este formulario no está recibiendo contenido</p>
                        <p className="text-xs text-gray-500 mt-2">{config.closedReason}</p>
                    </div>
                ) : (
                    <form onSubmit={enviar} className="space-y-5">
                        {config.intro && (
                            <div className={TARJETA}>
                                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{config.intro}</p>
                            </div>
                        )}

                        {/* ── 1. Los archivos van PRIMERO ─────────────────
                            Es el motivo del formulario y lo que alguien tiene
                            en la mano al abrir el enlace desde el teléfono.
                            Pedirle los datos antes de dejarlo soltar las fotos
                            es la forma más segura de perderlo. */}
                        <div className={TARJETA}>
                            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-rotary-blue" /> Fotografías y videos
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">
                                Hasta {config.limits.maxFiles} archivos. Fotos hasta {config.limits.imageMaxMb} MB, videos hasta {config.limits.videoMaxMb} MB.
                            </p>

                            <div
                                onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
                                onDragLeave={() => setArrastrando(false)}
                                onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregarArchivos(e.dataTransfer.files); }}
                                onClick={() => inputRef.current?.click()}
                                className={`mt-4 rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                                    arrastrando ? 'border-rotary-blue bg-blue-50/50' : 'border-gray-200 hover:border-rotary-blue hover:bg-blue-50/30'
                                }`}
                            >
                                <Upload className="w-9 h-9 text-gray-300 mx-auto" />
                                <p className="text-sm font-bold text-gray-600 mt-3">Tocá acá para elegir, o arrastrá los archivos</p>
                                <p className="text-[11px] text-gray-400 mt-1">Desde el teléfono se abre la cámara o el carrete.</p>
                            </div>
                            <input
                                ref={inputRef} type="file" multiple accept={ACCEPT_ATTR}
                                className="hidden"
                                onChange={(e) => {
                                    if (e.target.files) agregarArchivos(e.target.files);
                                    // Se limpia para que volver a elegir el MISMO
                                    // archivo dispare `change` (regla de v4.700).
                                    e.target.value = '';
                                }}
                            />

                            {adjuntos.length > 0 && (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-5">
                                    {adjuntos.map(a => (
                                        <div key={a.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                                            {a.preview
                                                ? <img src={a.preview} alt="" className="w-full h-full object-cover" />
                                                : <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1">
                                                    <Film className="w-7 h-7" />
                                                    <span className="text-[9px] font-bold px-1 text-center truncate w-full">{a.file.name}</span>
                                                  </div>}
                                            {a.estado === 'subiendo' && (
                                                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-white">
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    <span className="text-[11px] font-black mt-1">{a.progreso}%</span>
                                                </div>
                                            )}
                                            {a.estado === 'error' && (
                                                <div className="absolute inset-0 bg-red-600/80 flex items-center justify-center p-2">
                                                    <span className="text-[9px] font-bold text-white text-center leading-tight">{a.error}</span>
                                                </div>
                                            )}
                                            {a.estado !== 'subiendo' && (
                                                <button type="button" onClick={(e) => { e.stopPropagation(); quitar(a.id); }}
                                                    aria-label={`Quitar ${a.file.name}`}
                                                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── 2. Lo que se cuenta, en UNA sola tarjeta ─────
                            Qué ocurrió, los datos de la actividad, los clubes
                            que la hicieron y dónde se difundió son cuatro
                            preguntas sobre LO MISMO, así que van juntas: en
                            cuatro tarjetas seguidas se leían como cuatro
                            formularios distintos y el recorrido se hacía largo
                            sin ser más claro.

                            Lo que se fusiona es el CONTENEDOR. Cada sección
                            conserva su título, su icono y su ayuda —son lo que
                            explica qué se está pidiendo— y el orden no cambia:
                            el distrito sigue yendo antes que los clubes porque
                            es lo que decide cuáles se ofrecen, y la difusión
                            sigue revelándose sólo si se contesta que sí. */}
                        <div className={TARJETA}>
                            <Seccion
                                icono={<HeartHandshake className="w-5 h-5 text-rotary-blue" />}
                                titulo="¿Qué ocurrió?" primera
                                ayuda="Esto es lo más importante del envío: sin contexto, el material se puede archivar pero no se puede comunicar bien."
                            >
                                <textarea
                                    value={f.story} rows={4}
                                    onChange={(e) => setF({ ...f, story: e.target.value })}
                                    placeholder="¿Qué ocurrió y qué te gustaría que Rotary comunique sobre esta iniciativa?"
                                    className={`${CAMPO} resize-y leading-relaxed`}
                                />
                            </Seccion>

                            {/* ── Datos de la actividad ───────────────────── */}
                            <Seccion
                                icono={<MapPin className="w-5 h-5 text-rotary-blue" />}
                                titulo="Datos de la actividad"
                                ayuda="Cuándo y dónde fue. Nada de esto es obligatorio, pero es lo que permite ubicarla y contarla bien."
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className={ROTULO} htmlFor="titulo">Título corto</label>
                                        <input id="titulo" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={CAMPO} placeholder="Entrega de mercados" />
                                    </div>
                                    <div>
                                        <label className={ROTULO} htmlFor="fecha">Fecha de la actividad</label>
                                        <input id="fecha" value={f.activityDate} onChange={(e) => setF({ ...f, activityDate: e.target.value })} className={CAMPO} placeholder="14 de agosto de 2026" />
                                    </div>
                                    <div>
                                        <label className={ROTULO} htmlFor="ciudad">Ciudad o región</label>
                                        <input id="ciudad" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className={CAMPO} />
                                    </div>
                                    <div>
                                        <label className={ROTULO} htmlFor="lugar">Lugar</label>
                                        <input id="lugar" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className={CAMPO} placeholder="Barrio, vereda, sede…" />
                                    </div>
                                </div>
                            </Seccion>

                            {/* ── Participación rotaria ──────────────────────
                                Las dos preguntas van EN LA MISMA LÍNEA porque son
                                una sola: el distrito es lo que decide qué clubes se
                                ofrecen. A lo ancho, la dependencia se lee de un
                                vistazo —elijo a la izquierda, aparecen a la
                                derecha—; apiladas, el distrito quedaba como un
                                campo suelto ocupando un renglón entero.
                                El orden NO cambia: el distrito sigue primero, a la
                                izquierda en el escritorio y arriba en un teléfono
                                —donde `grid-cols-1` las vuelve a apilar, porque a
                                media pantalla no cabe una lista de clubes—.
                                Cambiar de distrito sigue descartando los clubes
                                elegidos: los del anterior ya no describen nada. */}
                            <Seccion
                                icono={<Users className="w-5 h-5 text-rotary-blue" />}
                                titulo="Participación rotaria"
                                ayuda="Qué clubes desarrollaron la actividad. No tiene que ser el tuyo: si participaron varios, indicalos todos."
                            >
                                {/* ⚠️ EL ANCHO LO PONE LA REJILLA, NO UNA CLASE
                                    ENCIMA DE `CAMPO` (v4.974): en el mismo
                                    elemento gana la última clase del CSS
                                    compilado, no la última del atributo, y
                                    `CAMPO` ya declara `w-full`. Cada columna es
                                    una pista de la rejilla y el campo la llena. */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                                    <div>
                                        <label className={ROTULO} htmlFor="distrito">Distrito Rotario</label>
                                        {distritos.length > 0 ? (
                                            <select
                                                id="distrito" value={f.district} className={CAMPO}
                                                onChange={(e) => {
                                                    setClubes([]);
                                                    setClubALaMano(false);
                                                    setF({ ...f, district: e.target.value, club: '' });
                                                }}
                                            >
                                                <option value="">Selecciona el distrito</option>
                                                {distritos.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                            </select>
                                        ) : (
                                            <input id="distrito" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} className={CAMPO} placeholder="4281" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <label className={ROTULO}>Clubes participantes</label>
                                        <ClubPicker
                                            disponibles={clubesDelDistrito}
                                            elegidos={clubes}
                                            onChange={setClubes}
                                            tope={topeClubes}
                                            hayDistrito={Boolean(f.district)}
                                        />
                                    </div>
                                </div>
                            </Seccion>

                            {/* ── Difusión realizada ────────────────────────
                                La pregunta se contesta primero y los campos aparecen
                                DESPUÉS: quien no publicó nada no ve ni una casilla
                                más. Es lo que hace que el formulario sea más
                                inteligente sin ser más largo. */}
                            <Seccion
                                icono={<Share2 className="w-5 h-5 text-rotary-blue" />}
                                titulo="Difusión realizada"
                                ayuda="Si tu club ya publicó esta actividad, contanos dónde. Nos sirve para no repetir lo que ya se difundió y para sumar el alcance que ya tuvo."
                            >
                                <fieldset>
                                    <legend className={ROTULO}>¿Esta actividad ya fue publicada en algún canal digital?</legend>
                                    <div className="flex gap-3">
                                        {[{ v: 'si', t: 'Sí' }, { v: 'no', t: 'No' }].map(o => (
                                            <label key={o.v}
                                                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 cursor-pointer text-sm font-bold transition-colors ${
                                                    difusion === o.v ? 'border-rotary-blue bg-blue-50/60 text-rotary-blue' : 'border-gray-100 bg-gray-50/60 text-gray-500'
                                                }`}>
                                                <input
                                                    type="radio" name="difusion" value={o.v}
                                                    checked={difusion === o.v}
                                                    onChange={() => {
                                                        setDifusion(o.v as 'si' | 'no');
                                                        // La primera fila se siembra al contestar que
                                                        // sí: una fila sintética no se podría escribir,
                                                        // porque cambiarla no tocaría el estado.
                                                        if (o.v === 'si' && posts.length === 0) setPosts([filaVacia()]);
                                                    }}
                                                    className="accent-rotary-blue"
                                                />
                                                {o.t}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                {difusion === 'si' && (
                                    <div className="space-y-3">
                                        <p className={ROTULO}>Publicaciones realizadas</p>
                                        {posts.map((p, i) => (
                                            <PostRow
                                                key={p.id} fila={p} plataformas={plataformas}
                                                onChange={cambiarPost}
                                                onQuitar={() => setPosts(prev => prev.filter(x => x.id !== p.id))}
                                                ultima={posts.length === 1 && i === 0}
                                            />
                                        ))}
                                        {posts.length < topePosts && (
                                            <button type="button" onClick={() => setPosts(prev => [...prev, filaVacia()])}
                                                className="flex items-center gap-2 text-xs font-bold text-rotary-blue">
                                                <Plus className="w-4 h-4" /> Agregar otra publicación
                                            </button>
                                        )}
                                        <p className="text-[11px] text-gray-400 leading-relaxed">
                                            Podés registrar varias publicaciones de la misma plataforma.
                                        </p>
                                    </div>
                                )}
                            </Seccion>
                        </div>

                        {/* ── 3. Quién lo envía ───────────────────────── */}
                        <Bloque icono={<Info className="w-5 h-5 text-rotary-blue" />} titulo="¿Quién lo envía?">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={ROTULO} htmlFor="nombre">Nombre <span className="text-red-500">*</span></label>
                                    <input id="nombre" required value={f.senderName} onChange={(e) => setF({ ...f, senderName: e.target.value })} className={CAMPO} autoComplete="name" />
                                </div>
                                <div>
                                    <label className={ROTULO} htmlFor="correo">Correo electrónico <span className="text-red-500">*</span></label>
                                    <input id="correo" required type="email" value={f.senderEmail} onChange={(e) => setF({ ...f, senderEmail: e.target.value })} className={CAMPO} autoComplete="email" />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className={ROTULO}>Teléfono / WhatsApp</label>
                                    <PhoneParts
                                        iso={f.senderPhoneCountry} national={f.senderPhoneNational}
                                        onChange={(iso, national) => setF({ ...f, senderPhoneCountry: iso, senderPhoneNational: national })}
                                    />
                                </div>
                                {/* Tu club es TUYO y se guarda aparte de los
                                    participantes: quien envía no pertenece
                                    necesariamente a todos los clubes que hicieron
                                    la actividad. Se ofrece de lo ya elegido
                                    porque es el caso normal, no porque sea lo
                                    mismo. */}
                                <div>
                                    <label className={ROTULO} htmlFor="tuclub">Tu club</label>
                                    {clubesParaElRemitente.length > 0 && !clubALaMano ? (
                                        <select
                                            id="tuclub" value={f.club} className={CAMPO}
                                            onChange={(e) => {
                                                if (e.target.value === CLUB_NOT_LISTED) {
                                                    setClubALaMano(true);
                                                    setF({ ...f, club: '' });
                                                    return;
                                                }
                                                setF({ ...f, club: e.target.value });
                                            }}
                                        >
                                            <option value="">Selecciona tu club</option>
                                            {clubesParaElRemitente.map(c => <option key={c} value={c}>{c}</option>)}
                                            {/* La salida va de ÚLTIMA y cuesta un clic
                                                extra, así que quien SÍ está en la lista
                                                la usa (v4.706). */}
                                            <option value={CLUB_NOT_LISTED}>Mi club no está en la lista</option>
                                        </select>
                                    ) : (
                                        <>
                                            <input id="tuclub" value={f.club} onChange={(e) => setF({ ...f, club: e.target.value })} className={CAMPO}
                                                placeholder={clubALaMano ? 'Escribí el nombre de tu club' : ''} autoFocus={clubALaMano} />
                                            {/* Volver a la lista es un botón EXPLÍCITO:
                                                re-elegir el mismo distrito no dispara
                                                nada, así que sin él quien se equivocó al
                                                marcar la salida se queda escribiendo. */}
                                            {clubALaMano && (
                                                <button type="button" onClick={() => { setClubALaMano(false); setF({ ...f, club: '' }); }}
                                                    className="mt-2 text-[11px] font-bold text-rotary-blue underline">
                                                    Volver a la lista de clubes
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                                <div>
                                    <label className={ROTULO} htmlFor="rol">Tu rol en la actividad</label>
                                    <input id="rol" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={CAMPO} placeholder="Presidente, voluntario…" />
                                </div>
                            </div>
                        </Bloque>

                        {/* ── 4. Información adicional ────────────────────
                            Va al FINAL y FUERA del bloque de difusión: son datos
                            distintos, y colgarla de «¿ya publicaste?» le quitaría
                            la oportunidad de contar algo relevante a quien
                            contesta que no. No es obligatoria a propósito: la
                            descripción de arriba ya lleva lo indispensable, y
                            exigir ésta produce «N/A» y repeticiones. */}
                        <Bloque icono={<Info className="w-5 h-5 text-rotary-blue" />} titulo="Información adicional">
                            <div>
                                <label className={ROTULO} htmlFor="extra">
                                    ¿Hay algo más que debamos saber sobre esta actividad o sobre el material enviado?
                                    <span className="ml-2 font-bold text-gray-300 normal-case tracking-normal">Opcional, pero recomendado</span>
                                </label>
                                <textarea
                                    id="extra" value={f.extra} rows={3}
                                    onChange={(e) => setF({ ...f, extra: e.target.value })}
                                    placeholder="Incluye cualquier dato importante que no hayas mencionado anteriormente y que pueda ayudarnos a comprender, verificar o difundir esta iniciativa."
                                    className={`${CAMPO} resize-y leading-relaxed`}
                                />
                            </div>
                        </Bloque>

                        {/* ── 5. El consentimiento ────────────────────── */}
                        <div className={TARJETA}>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox" checked={f.consent}
                                    onChange={(e) => setF({ ...f, consent: e.target.checked })}
                                    className="mt-1 w-5 h-5 flex-shrink-0 accent-rotary-blue"
                                />
                                <span className="text-xs text-gray-600 leading-relaxed">{config.consentText}</span>
                            </label>
                            {/* Se DICE que el texto todavía es provisional: quien
                                acepta algo tiene derecho a saber que la
                                organización aún no publicó su política. */}
                            {config.consentIsProvisional && (
                                <p className="text-[11px] text-amber-700 bg-amber-50/60 border border-amber-100 rounded-xl p-3 mt-4 leading-relaxed">
                                    La organización todavía no publicó su política definitiva de uso de imagen. El texto de arriba es provisional.
                                </p>
                            )}
                            <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
                                Nada de lo que envíes se publica automáticamente: el equipo revisa el material antes de usarlo en cualquier comunicación.
                            </p>
                        </div>

                        {errores.length > 0 && (
                            <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-4">
                                {errores.map((e, i) => <p key={i} className="text-xs text-red-700 font-semibold">{e}</p>)}
                            </div>
                        )}

                        <button
                            type="submit" disabled={enviando}
                            className="w-full py-5 rounded-2xl bg-rotary-blue text-white font-black text-base disabled:bg-gray-300 flex items-center justify-center gap-3"
                        >
                            {enviando ? <><Loader2 className="w-5 h-5 animate-spin" /> ENVIANDO…</> : 'ENVIAR MI APORTE'}
                        </button>
                    </form>
                )}
            </div>
            </div>
        </Marco>
    );
};

export default AportarContenido;
