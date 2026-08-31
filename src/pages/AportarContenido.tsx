import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Upload, X, Image as ImageIcon, Film, Loader2, CheckCircle2,
    AlertTriangle, HeartHandshake, MapPin, Info,
} from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
import { ACCEPT_ATTR, MAX_FILES, checkFileMeta } from '../lib/contentSubmissionSpec';
// El MISMO valor reservado que el registro a un evento y las inscripciones
// completadas: con dos distintos, una salida manual se guardaría como si fuera
// el nombre de un club.
import { CLUB_NOT_LISTED } from '../lib/eventRegistrationSpec';

// ════════════════════════════════════════════════════════════════════
// Aportar contenido a una campaña — el formulario PÚBLICO (v4.968)
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
    limits: { maxFiles: number; imageMaxMb: number; videoMaxMb: number };
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
        senderName: '', senderEmail: '', senderPhone: '', district: '', club: '', role: '',
        title: '', description: '', location: '', city: '', activityDate: '',
        participatingClubs: '', story: '', extra: '', consent: false,
    });
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
                body: JSON.stringify({ ...f, files: subidos }),
            });
            const data = await leerJson(r);
            if (!r.ok) throw new Error(data?.error || 'No se pudo enviar.');
            setEnviado({ warnings: data.warnings || [] });
        } catch (err: any) {
            setErrores([err?.message || 'No se pudo enviar el material.']);
        } finally { setEnviando(false); }
    };

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
const Marco: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-rotary-concrete flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
    </div>
);

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
                    <button
                        onClick={() => { setEnviado(null); setAdjuntos([]); setF({ ...f, title: '', description: '', story: '', location: '', city: '', activityDate: '', extra: '' }); }}
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

    const campo = 'w-full p-3.5 rounded-xl border-2 border-gray-100 text-sm bg-gray-50/60 outline-none focus:border-rotary-blue transition-colors';
    const rotulo = 'block text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2';

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
                            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{config.intro}</p>
                            </div>
                        )}

                        {/* ── Los archivos van PRIMERO ────────────────────
                            Es el motivo del formulario y lo que alguien tiene
                            en la mano al abrir el enlace desde el teléfono.
                            Pedirle los datos antes de dejarlo soltar las fotos
                            es la forma más segura de perderlo. */}
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
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

                        {/* ── La historia ──────────────────────────────── */}
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
                            <div>
                                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                                    <HeartHandshake className="w-5 h-5 text-rotary-blue" /> ¿Qué ocurrió?
                                </h2>
                                <p className="text-xs text-gray-400 mt-1">
                                    Esto es lo más importante del envío: sin contexto, el material se puede archivar pero no se puede comunicar bien.
                                </p>
                            </div>
                            <textarea
                                value={f.story} rows={4}
                                onChange={(e) => setF({ ...f, story: e.target.value })}
                                placeholder="¿Qué ocurrió y qué te gustaría que Rotary comunique sobre esta iniciativa?"
                                className={`${campo} resize-y leading-relaxed`}
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={rotulo}>Título corto</label>
                                    <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={campo} placeholder="Entrega de mercados" />
                                </div>
                                <div>
                                    <label className={rotulo}>Fecha de la actividad</label>
                                    <input value={f.activityDate} onChange={(e) => setF({ ...f, activityDate: e.target.value })} className={campo} placeholder="14 de agosto de 2026" />
                                </div>
                                <div>
                                    <label className={rotulo}>Ciudad o región</label>
                                    <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className={campo} />
                                </div>
                                <div>
                                    <label className={rotulo}>Lugar</label>
                                    <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className={campo} placeholder="Barrio, vereda, sede…" />
                                </div>
                            </div>
                            <div>
                                <label className={rotulo}>Clubes participantes</label>
                                <input value={f.participatingClubs} onChange={(e) => setF({ ...f, participatingClubs: e.target.value })} className={campo} placeholder="Si participó más de uno" />
                            </div>
                            <div>
                                <label className={rotulo}>Información adicional</label>
                                <textarea value={f.extra} rows={2} onChange={(e) => setF({ ...f, extra: e.target.value })} className={`${campo} resize-y`} />
                            </div>
                        </div>

                        {/* ── Quién envía ──────────────────────────────── */}
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
                            <h2 className="text-base font-bold text-gray-800">¿Quién lo envía?</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={rotulo}>Nombre <span className="text-red-500">*</span></label>
                                    <input required value={f.senderName} onChange={(e) => setF({ ...f, senderName: e.target.value })} className={campo} autoComplete="name" />
                                </div>
                                <div>
                                    <label className={rotulo}>Correo electrónico <span className="text-red-500">*</span></label>
                                    <input required type="email" value={f.senderEmail} onChange={(e) => setF({ ...f, senderEmail: e.target.value })} className={campo} autoComplete="email" />
                                </div>
                                <div>
                                    <label className={rotulo}>Teléfono / WhatsApp</label>
                                    <input type="tel" value={f.senderPhone} onChange={(e) => setF({ ...f, senderPhone: e.target.value })} className={campo} autoComplete="tel" />
                                </div>
                                {/* Distrito → Clubes, con el MISMO comportamiento
                                    que la postulación y el registro a un evento:
                                    el distrito va ANTES porque es lo que decide
                                    qué clubes se ofrecen, y cambiarlo descarta el
                                    club — el anterior ya no describe nada. */}
                                <div>
                                    <label className={rotulo}>Distrito</label>
                                    {distritos.length > 0 ? (
                                        <select
                                            value={f.district} className={campo}
                                            onChange={(e) => {
                                                setClubALaMano(false);
                                                setF({ ...f, district: e.target.value, club: '' });
                                            }}
                                        >
                                            <option value="">Selecciona tu distrito</option>
                                            {distritos.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                        </select>
                                    ) : (
                                        <input value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} className={campo} placeholder="4281" />
                                    )}
                                </div>
                                <div>
                                    <label className={rotulo}>Club o entidad</label>
                                    {clubesDelDistrito.length > 0 && !clubALaMano ? (
                                        <select
                                            value={f.club} className={campo}
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
                                            {clubesDelDistrito.map(c => <option key={c} value={c}>{c}</option>)}
                                            {/* La salida va de ÚLTIMA y cuesta un clic
                                                extra, así que quien SÍ está en la lista
                                                la usa (v4.706). */}
                                            <option value={CLUB_NOT_LISTED}>Mi club no está en la lista</option>
                                        </select>
                                    ) : (
                                        <>
                                            <input value={f.club} onChange={(e) => setF({ ...f, club: e.target.value })} className={campo}
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
                                    <label className={rotulo}>Tu rol en la actividad</label>
                                    <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={campo} placeholder="Presidente, voluntario…" />
                                </div>
                            </div>
                        </div>

                        {/* ── El consentimiento ────────────────────────── */}
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
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
