// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — la pantalla pública
// v4.895.0
//
// Club, años, fotografía, botón. Nada más.
//
// ⚠️ LO QUE NO SE OFRECE ACÁ ES TAN DELIBERADO COMO LO QUE SE OFRECE. No hay
// tipografías, ni colores, ni posiciones, ni máscaras, ni capas, ni tamaños,
// ni elementos, ni lienzo, ni prompts. Todo eso lo decide la configuración que
// el operador publicó, y exponerlo convertiría esta pantalla en el editor que
// el módulo existe para no ser.
//
// ── LA VISTA PREVIA ES EL ARCHIVO ───────────────────────────────────
//
// Se monta el canvas que devuelve `renderAnniversary` y se descarga ESE mismo
// canvas. No hay una vista previa en DOM y un exportador aparte: no hay dos
// cosas que puedan diferir.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, UploadCloud, Download, RotateCcw, ImagePlus, AlertTriangle, Loader2, CheckCircle2, FolderOpen, X, Copy, Mail, Share2, MessageCircle, Send } from 'lucide-react';
import { openLoginModal } from '../lib/loginModal';
import { useSEO } from '../hooks/useSEO';
import {
    ACCEPTED_PHOTO_TYPES, ACCEPTED_PHOTO_LABEL, MAX_PHOTO_BYTES, YEARS_LIMITS, STAGES,
} from '../lib/anniversarySpec';
import {
    renderAnniversary, downloadCanvas, safeFileName, BACKDROP_FAILED_WARNING,
    type AnniversaryDocument,
} from '../lib/anniversaryRender';

const API = import.meta.env.VITE_API_URL || '/api';
const json = { 'Content-Type': 'application/json' };

interface ClubOption { name: string; display: string; district: string }
interface LibraryImage { id: string; name: string; url: string; thumbUrl: string | null }
interface Mensaje { social: string; email: string; subject: string; source: string; note?: string }
interface Destinatario { email: string; name?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_DESTINATARIOS = 10;
// El token del ADMINISTRADOR de la plataforma (la identidad de `siteSession`):
// el envío institucional exige sesión — y quien decide es el SERVIDOR.
const tokenAdmin = () => { try { return localStorage.getItem('rotary_token') || ''; } catch { return ''; } };
interface LibraryView { scope: string; label: string; images: LibraryImage[] }

const AniversarioIA: React.FC = () => {
    useSEO({
        title: 'Generador de Aniversarios con IA',
        description: 'Creá la pieza del aniversario de tu club Rotary en un minuto: elegí el club, los años y una fotografía.',
    });

    // ⚠️ TODOS los hooks arriba de cualquier `return`: un hook debajo de un
    // return temprano deja la pantalla EN BLANCO al segundo render (v4.689).
    const [disponible, setDisponible] = useState<boolean | null>(null);
    const [motivo, setMotivo] = useState<string>('');
    const [titulo, setTitulo] = useState('Aniversarios IA');

    const [club, setClub] = useState('');
    const [opciones, setOpciones] = useState<ClubOption[]>([]);
    const [abierto, setAbierto] = useState(false);
    const [anios, setAnios] = useState('');
    const [foto, setFoto] = useState<string | null>(null);
    const [arrastrando, setArrastrando] = useState(false);

    // ── La Biblioteca Multimedia (v4.928) ───────────────────────────
    // Qué biblioteca toca la RESUELVE el servidor con el nombre del club (el
    // mismo texto libre que ya viaja a la generación): con sitio propio, la de
    // ese club; sin club o sin sitio, la del Distrito 4281. Acá sólo se pinta.
    const [bibAbierta, setBibAbierta] = useState(false);
    const [bibCargando, setBibCargando] = useState(false);
    const [biblioteca, setBiblioteca] = useState<LibraryView | null>(null);
    const [bibTrayendo, setBibTrayendo] = useState<string | null>(null);
    // Cambiar de club descarta lo traído: la biblioteca del club anterior ya
    // no describe nada, y abrirla vuelve a preguntar con el club vigente.
    useEffect(() => { setBiblioteca(null); }, [club]);

    // ── El mensaje para compartir y el correo (v4.929) ──────────────
    const [piezaId, setPiezaId] = useState<string | null>(null);
    const [mensaje, setMensaje] = useState<Mensaje | null>(null);
    // El CANAL elegido decide qué versión se ve — como las pestañas de la
    // Biblioteca de Publicaciones. Por defecto, la corta (redes/WhatsApp).
    const [canal, setCanal] = useState<'social' | 'email'>('social');
    const [msgCargando, setMsgCargando] = useState(false);
    const [msgFallo, setMsgFallo] = useState<string | null>(null);
    const [msgIntento, setMsgIntento] = useState(0);
    const [copiado, setCopiado] = useState(false);
    const [correoAbierto, setCorreoAbierto] = useState(false);
    const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
    const [buscaDest, setBuscaDest] = useState('');
    const [sugerencias, setSugerencias] = useState<Destinatario[]>([]);
    const [asunto, setAsunto] = useState('');
    const [cuerpo, setCuerpo] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [envio, setEnvio] = useState<{ ok: boolean; sent: number; failed: { to: string; error?: string }[] } | null>(null);
    const [envioFallo, setEnvioFallo] = useState<string | null>(null);

    const [etapa, setEtapa] = useState<string | null>(null);
    const [generando, setGenerando] = useState(false);
    const [fallo, setFallo] = useState<string | null>(null);
    const [doc, setDoc] = useState<AnniversaryDocument | null>(null);
    const [avisos, setAvisos] = useState<string[]>([]);
    // Los avisos que produjo el ÚLTIMO render, para reemplazarlos en el
    // siguiente (v4.923): un «no se pudo cargar» de un intento anterior que
    // ya cargó bien se quedaba en la lista para siempre — dos avisos falsos
    // debajo de una pieza perfecta (reporte con captura).
    const avisosDeRender = useRef<string[]>([]);
    const [sustituida, setSustituida] = useState<string | null>(null);
    // El diseño generado EXISTE pero su carga falló (v4.915): se ofrece volver
    // a componer SIN gastar una generación. El contador re-dispara el efecto.
    const [disenoCaido, setDisenoCaido] = useState(false);
    const [renderIntento, setRenderIntento] = useState(0);
    // Segundos transcurridos de la generación (v4.919): la espera se VE viva —
    // una barra indeterminada más el tiempo real, nunca un porcentaje
    // inventado (v4.756).
    const [segundos, setSegundos] = useState(0);
    useEffect(() => {
        if (!generando) { setSegundos(0); return; }
        const reloj = setInterval(() => setSegundos(x => x + 1), 1000);
        return () => clearInterval(reloj);
    }, [generando]);

    const previewRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    // ── ¿Está disponible en este sitio? ─────────────────────────────
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(`${API}/anniversaries/public/config`, { headers: json });
                const j = await r.json();
                if (!vivo) return;
                setDisponible(!!j.available);
                setMotivo(j.reason || '');
                if (j.label) setTitulo(j.label);
            } catch {
                if (vivo) { setDisponible(false); setMotivo('El generador de aniversarios no está disponible en este momento.'); }
            }
        })();
        return () => { vivo = false; };
    }, []);

    // ── Buscador de clubes ──────────────────────────────────────────
    useEffect(() => {
        if (!disponible) return;
        const t = setTimeout(async () => {
            try {
                const r = await fetch(`${API}/anniversaries/public/clubs?q=${encodeURIComponent(club)}`);
                if (r.ok) setOpciones((await r.json()).clubs || []);
            } catch { /* el buscador es una comodidad: el campo sigue siendo libre */ }
        }, 250);
        return () => clearTimeout(t);
    }, [club, disponible]);

    // ── La fotografía ───────────────────────────────────────────────
    const tomarArchivo = useCallback((file: File | null) => {
        setFallo(null);
        if (!file) return;
        if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) { setFallo(`La fotografía tiene que ser ${ACCEPTED_PHOTO_LABEL}.`); return; }
        if (file.size > MAX_PHOTO_BYTES) { setFallo('La fotografía pesa demasiado. Probá con una de menos de 18 MB.'); return; }
        const fr = new FileReader();
        fr.onload = () => setFoto(String(fr.result || ''));
        fr.onerror = () => setFallo('No se pudo leer el archivo. Probá con otra fotografía.');
        fr.readAsDataURL(file);
        // Se limpia el input o volver a elegir EL MISMO archivo no dispara
        // `change` y el botón parece roto justo cuando alguien reintenta.
        if (fileRef.current) fileRef.current.value = '';
    }, []);

    const abrirBiblioteca = useCallback(async () => {
        setBibAbierta(true); setBibCargando(true); setBiblioteca(null);
        try {
            const r = await fetch(`${API}/anniversaries/public/library?club=${encodeURIComponent(club.trim())}`,
                { signal: AbortSignal.timeout(20_000) });
            const j = r.ok ? await r.json() : null;
            setBiblioteca(j && Array.isArray(j.images) ? j : { scope: 'none', label: '', images: [] });
        } catch {
            setBiblioteca({ scope: 'none', label: '', images: [] });
        } finally { setBibCargando(false); }
    }, [club]);

    // La imagen elegida entra por el MISMO camino que un archivo local: se
    // trae por el proxy (`/public/banner-image` — pedirla directo a S3 la
    // bloquea CORS) y se convierte a data URL, que es exactamente lo que la
    // etapa 1 espera. Con tope de tiempo: ninguna espera de este camino va
    // sin acotar (v4.911).
    const elegirDeBiblioteca = useCallback(async (img: LibraryImage) => {
        setBibTrayendo(img.id); setFallo(null);
        try {
            const r = await fetch(`${API}/public/banner-image?url=${encodeURIComponent(img.url)}`,
                { signal: AbortSignal.timeout(25_000) });
            if (!r.ok) throw new Error();
            const blob = await r.blob();
            if (blob.size > MAX_PHOTO_BYTES) { setFallo('Esa fotografía pesa demasiado. Elegí otra de la biblioteca o subí una de menos de 18 MB.'); return; }
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(String(fr.result || ''));
                fr.onerror = () => reject(new Error('lectura'));
                fr.readAsDataURL(blob);
            });
            if (!dataUrl.startsWith('data:image/')) throw new Error();
            setFoto(dataUrl);
            setBibAbierta(false);
        } catch {
            setFallo('No se pudo traer esa fotografía de la biblioteca. Probá con otra o subila desde tu dispositivo.');
        } finally { setBibTrayendo(null); }
    }, []);

    // ── El mensaje institucional (v4.929) ───────────────────────────
    //
    // Se pide DESPUÉS de que la pieza está lista y es INDEPENDIENTE: si el
    // redactor falla, la imagen no se pierde — se ofrece reintentar. La firma
    // (Gobernador, distrito, período) la pone el servidor por construcción.
    useEffect(() => {
        if (!doc || !piezaId || disenoCaido) return;
        let vivo = true;
        setMsgCargando(true); setMsgFallo(null);
        (async () => {
            try {
                const r = await fetch(`${API}/anniversaries/public/greeting`, {
                    method: 'POST', headers: json, body: JSON.stringify({ pieceId: piezaId }),
                    signal: AbortSignal.timeout(45_000),
                });
                const j = await r.json().catch(() => ({}));
                if (!vivo) return;
                const social = j.greetings?.social || j.greeting;
                const email = j.greetings?.email || j.greeting;
                if (!r.ok || !email) throw new Error(j.error || 'sin mensaje');
                setMensaje({ social: social || email, email, subject: j.subject || '', source: j.source || 'ai', note: j.note });
                setCanal('social');
            } catch {
                if (vivo) setMsgFallo('No se pudo redactar el mensaje. La pieza no se pierde — podés reintentarlo.');
            } finally { if (vivo) setMsgCargando(false); }
        })();
        return () => { vivo = false; };
    }, [doc, piezaId, disenoCaido, msgIntento]);

    const copiarMensaje = useCallback(async () => {
        if (!mensaje) return;
        try {
            await navigator.clipboard.writeText(canal === 'social' ? mensaje.social : mensaje.email);
            setCopiado(true); setTimeout(() => setCopiado(false), 2000);
        } catch { setMsgFallo('No se pudo copiar automáticamente. Seleccioná el texto y copialo a mano.'); }
    }, [mensaje, canal]);

    // WhatsApp por web sólo acepta TEXTO en el enlace — no se simula adjuntar
    // la imagen: para eso están «Compartir» (cuando el navegador lo permite)
    // o descargarla. Botones honestos, nunca decorativos.
    const compartirWhatsApp = useCallback(() => {
        if (!mensaje) return;
        // A WhatsApp va SIEMPRE la versión corta: para redes, el copy es corto.
        window.open(`https://wa.me/?text=${encodeURIComponent(mensaje.social)}`, '_blank', 'noopener');
    }, [mensaje]);

    const compartirSistema = useCallback(async () => {
        if (!mensaje) return;
        try {
            const blob = await new Promise<Blob | null>(res => {
                if (canvasRef.current) canvasRef.current.toBlob(b => res(b), 'image/png');
                else res(null);
            });
            const file = blob ? new File([blob], 'aniversario.png', { type: 'image/png' }) : null;
            // Compartir apunta a redes: viaja la versión CORTA.
            if (file && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ text: mensaje.social, files: [file] });
            } else {
                await navigator.share({ text: mensaje.social });
            }
        } catch { /* compartir cancelado por la persona: no es un error */ }
    }, [mensaje]);

    // ── El correo (v4.929) ──────────────────────────────────────────
    const abrirCorreo = useCallback(() => {
        if (!mensaje) return;
        setAsunto(mensaje.subject || '');
        // El correo lleva SIEMPRE la versión completa, sea cual sea la pestaña.
        setCuerpo(mensaje.email);
        setDestinatarios([]); setBuscaDest(''); setSugerencias([]);
        setEnvio(null); setEnvioFallo(null);
        setCorreoAbierto(true);
    }, [mensaje]);

    // El autocompletado consulta los CONTACTOS que la plataforma ya tiene
    // (el CRM, `/crm/contacts`) — con la sesión del administrador y acotado
    // por el servidor. Sin sesión no se consulta nada.
    useEffect(() => {
        if (!correoAbierto) return;
        const term = buscaDest.trim();
        const tk = tokenAdmin();
        if (!tk || term.length < 2) { setSugerencias([]); return; }
        const t = setTimeout(async () => {
            try {
                const r = await fetch(`${API}/crm/contacts?search=${encodeURIComponent(term)}&limit=8`, {
                    headers: { Authorization: `Bearer ${tk}` }, signal: AbortSignal.timeout(10_000),
                });
                if (!r.ok) { setSugerencias([]); return; }
                const j = await r.json();
                const lista: Destinatario[] = (Array.isArray(j.contacts) ? j.contacts : [])
                    .filter((c: { email?: string | null }) => !!c.email)
                    .map((c: { email?: string | null; name?: string; lastName?: string | null }) => ({
                        email: String(c.email).toLowerCase(),
                        name: [c.name, c.lastName].filter(Boolean).join(' '),
                    }));
                setSugerencias(lista);
            } catch { setSugerencias([]); }
        }, 300);
        return () => clearTimeout(t);
    }, [correoAbierto, buscaDest]);

    const agregarDest = useCallback((email: string, name?: string) => {
        const e = email.trim().toLowerCase();
        if (!e) return;
        if (!EMAIL_RE.test(e)) { setEnvioFallo(`«${email.trim()}» no es una dirección de correo válida.`); return; }
        setEnvioFallo(null);
        setDestinatarios(d => {
            if (d.some(x => x.email === e)) return d;
            if (d.length >= MAX_DESTINATARIOS) { setEnvioFallo(`Máximo ${MAX_DESTINATARIOS} destinatarios por envío.`); return d; }
            return [...d, { email: e, name }];
        });
        setBuscaDest(''); setSugerencias([]);
    }, []);

    const enviarCorreo = useCallback(async () => {
        if (enviando || !piezaId || !destinatarios.length) return;
        const canvas = canvasRef.current;
        if (!canvas) { setEnvioFallo('La pieza no está montada: reintentá la carga del diseño primero.'); return; }
        setEnviando(true); setEnvio(null); setEnvioFallo(null);
        try {
            // La pieza FINAL es este mismo canvas (la vista previa ES el
            // archivo); viaja en JPEG para el correo — mismos píxeles.
            const image = canvas.toDataURL('image/jpeg', 0.92);
            const r = await fetch(`${API}/anniversaries/email`, {
                method: 'POST',
                headers: { ...json, Authorization: `Bearer ${tokenAdmin()}` },
                body: JSON.stringify({ pieceId: piezaId, to: destinatarios.map(d => d.email), subject: asunto, message: cuerpo, image }),
                signal: AbortSignal.timeout(90_000),
            });
            const j = await r.json().catch(() => ({}));
            if (r.status === 401) { setEnvioFallo('Tu sesión no está activa. Iniciá sesión y probá de nuevo — el mensaje sigue acá.'); return; }
            if (!r.ok) { setEnvioFallo(j.error || 'No se pudo enviar. El mensaje y la pieza siguen acá: probá de nuevo.'); return; }
            // «Enviado» SÓLO cuando el servidor lo confirmó — nunca antes.
            setEnvio({ ok: !!j.ok, sent: Number(j.sent) || 0, failed: Array.isArray(j.failed) ? j.failed : [] });
        } catch {
            setEnvioFallo('No se pudo enviar. El mensaje y la pieza siguen acá: probá de nuevo.');
        } finally { setEnviando(false); }
    }, [enviando, piezaId, destinatarios, asunto, cuerpo]);

    // ── Generar ─────────────────────────────────────────────────────
    //
    // Cinco llamadas y cinco etapas. Cada una se muestra cuando OCURRIÓ, no
    // cuando la pantalla cree que va por ahí: un progreso inventado hace
    // esperar por nada.
    const generar = useCallback(async () => {
        if (!club.trim()) { setFallo('Elegí tu club.'); return; }
        const n = Number(anios);
        if (!Number.isInteger(n) || n < YEARS_LIMITS.min || n > YEARS_LIMITS.max) {
            setFallo(`¿Cuántos años cumple el club? Tiene que ser un número entre ${YEARS_LIMITS.min} y ${YEARS_LIMITS.max}.`);
            return;
        }
        if (!foto) { setFallo('Subí una fotografía del club.'); return; }

        setGenerando(true); setFallo(null); setDoc(null); setAvisos([]); setSustituida(null);
        setPiezaId(null); setMensaje(null); setMsgFallo(null); setEnvio(null); setCorreoAbierto(false); setCanal('social');
        const paso = async (url: string, body?: unknown) => {
            const r = await fetch(url, { method: 'POST', headers: json, body: JSON.stringify(body ?? {}) });
            if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                throw new Error(j.error || 'No se pudo continuar. Probá de nuevo en un momento.');
            }
            return r.json();
        };
        try {
            setEtapa('prepare');
            const { pieceId, warnings } = await paso(`${API}/anniversaries/public/photo`, { clubName: club.trim(), years: n, photo: foto });
            setPiezaId(pieceId);
            if (Array.isArray(warnings) && warnings.length) setAvisos(a => [...a, ...warnings]);

            setEtapa('compose');
            await paso(`${API}/anniversaries/public/compose`, { pieceId });

            const limite = Date.now() + 180_000;
            for (;;) {
                await new Promise(res => setTimeout(res, 3000));
                if (Date.now() > limite) throw new Error('La generación está tardando más de lo normal. Probá de nuevo.');
                const r = await fetch(`${API}/anniversaries/public/piece/${pieceId}`);
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(j.error || 'No se pudo consultar el estado de la pieza.');
                }
                const j = await r.json();
                if (j.retrying) { setEtapa('compose'); continue; }
                if (j.status === 'failed') throw new Error(j.statusDetail || 'No se pudo generar la pieza. Probá con otra fotografía.');
                if (j.ready) {
                    setEtapa('done');
                    setDoc(j.document);
                    if (j.document?.renderMode === 'plain') {
                        setSustituida(j.statusDetail || 'La composición generada no cumplió el control de calidad.');
                    } else if (j.statusDetail) {
                        // v4.910: la pieza se entrega igual, pero un fondo fuera del
                        // patrón no se presenta como si nada — se dice (directiva del
                        // cliente: nunca mostrar lo no conforme como conforme).
                        setAvisos(a => [...a, j.statusDetail]);
                    }
                    if (Array.isArray(j.copyRepaired)) setAvisos(a => [...a, ...j.copyRepaired]);
                    break;
                }
                setEtapa('compose');
            }
        } catch (e) {
            setFallo(e instanceof Error ? e.message : 'No se pudo generar el aniversario.');
            setEtapa(null);
        } finally { setGenerando(false); }
    }, [club, anios, foto]);

    // ── La vista previa ES el archivo ───────────────────────────────
    useEffect(() => {
        let vivo = true;
        if (!doc || !previewRef.current) return;
        // Mientras se compone se DICE (v4.911): sin esto, una carga lenta se ve
        // como una franja vacía indistinguible de un módulo roto.
        previewRef.current.innerHTML =
            '<div style="padding:3.5rem 1rem;text-align:center;color:#9ca3af;font-size:0.875rem">Componiendo la pieza…'
            + '<div style="margin:0.9rem auto 0;max-width:16rem;height:5px;border-radius:9999px;background:#e5e7eb;overflow:hidden">'
            + '<div class="animate-progress-slide" style="height:100%;width:33%;border-radius:9999px;background:#17458F"></div>'
            + '</div></div>';
        (async () => {
            try {
                const { canvas, warnings, backdropFailed } = await renderAnniversary(doc);
                if (!vivo || !previewRef.current) return;
                canvas.style.width = '100%';
                canvas.style.height = 'auto';
                canvas.style.display = 'block';
                previewRef.current.innerHTML = '';
                previewRef.current.appendChild(canvas);
                canvasRef.current = canvas;
                setDisenoCaido(!!backdropFailed);
                // Los avisos del render se REEMPLAZAN, no se acumulan: los del
                // intento anterior describen un render que ya no existe.
                const viejos = avisosDeRender.current;
                avisosDeRender.current = warnings;
                setAvisos(a => Array.from(new Set([...a.filter(x => !viejos.includes(x)), ...warnings])));
            } catch (e) {
                setFallo(e instanceof Error ? e.message : 'No se pudo componer la pieza.');
            }
        })();
        return () => { vivo = false; };
    }, [doc, renderIntento]);

    // Reintenta la CARGA del diseño ya generado — no gasta una generación:
    // la pieza está pagada y en el almacenamiento; lo único que falló fue el
    // viaje de la imagen al navegador (v4.915).
    const reintentarDiseno = useCallback(() => {
        setAvisos(a => a.filter(x => x !== BACKDROP_FAILED_WARNING));
        setDisenoCaido(false);
        setRenderIntento(n => n + 1);
    }, []);

    const descargar = useCallback(async () => {
        if (!canvasRef.current || !doc) return;
        await downloadCanvas(canvasRef.current, safeFileName(doc.clubName, doc.years));
    }, [doc]);

    const cambiarFoto = useCallback(() => {
        setDoc(null); setFoto(null); setAvisos([]); setSustituida(null); setEtapa(null);
        setPiezaId(null); setMensaje(null); setMsgFallo(null); setEnvio(null); setCorreoAbierto(false);
        fileRef.current?.click();
    }, []);

    const indice = STAGES.findIndex(s => s.id === etapa);

    // ── Render ──────────────────────────────────────────────────────
    if (disponible === null) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );
    }
    if (!disponible) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center px-6">
                <div className="max-w-md text-center">
                    <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <h1 className="text-xl font-semibold text-gray-800">Aniversarios IA</h1>
                    <p className="text-gray-500 mt-2">{motivo}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-5xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-3xl font-light text-gray-900 flex items-center justify-center gap-3">
                        <Sparkles className="w-7 h-7 text-rotary-blue" /> {titulo}
                    </h1>
                    <p className="text-gray-500 mt-2 max-w-xl mx-auto">
                        Elegí tu club, decinos cuántos años cumple y subí una fotografía. Del diseño nos encargamos nosotros.
                    </p>
                </header>

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* ── El formulario ── */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
                        <div className="relative">
                            <label className="block text-sm font-medium text-gray-800 mb-1">Selecciona tu club</label>
                            <input
                                value={club}
                                onChange={e => { setClub(e.target.value); setAbierto(true); }}
                                onFocus={() => setAbierto(true)}
                                onBlur={() => setTimeout(() => setAbierto(false), 150)}
                                placeholder="Escribí el nombre de tu club…"
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue"
                            />
                            {/* Lista de sugerencias propia, NUNCA un `<datalist>`: sugiere sin
                                restringir y el navegador lo despliega encima del formulario,
                                haciéndolo parecer obligatorio (regla del sitio, v4.656). */}
                            {abierto && opciones.length > 0 && (
                                <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                                    {opciones.map(o => (
                                        <li key={`${o.district}-${o.name}`}>
                                            <button type="button"
                                                onMouseDown={() => { setClub(o.name); setAbierto(false); }}
                                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                                                {o.display}
                                                <span className="text-gray-400 ml-2">Distrito {o.district}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                                Si tu club no está en la lista, escribí su nombre igual.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">¿Cuántos años cumple el club?</label>
                            <input
                                type="number" inputMode="numeric" value={anios}
                                min={YEARS_LIMITS.min} max={YEARS_LIMITS.max}
                                onChange={e => setAnios(e.target.value)}
                                placeholder="40"
                                className="w-36 rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Fotografía del club</label>
                            <div
                                onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
                                onDragLeave={() => setArrastrando(false)}
                                onDrop={e => { e.preventDefault(); setArrastrando(false); tomarArchivo(e.dataTransfer.files?.[0] || null); }}
                                onClick={() => fileRef.current?.click()}
                                className={`rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition
                                    ${arrastrando ? 'border-rotary-blue bg-sky-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}`}
                            >
                                {foto ? (
                                    <img src={foto} alt="Tu fotografía" className="mx-auto max-h-44 rounded-lg" />
                                ) : (
                                    <>
                                        <UploadCloud className="w-7 h-7 mx-auto text-gray-400" />
                                        <p className="text-sm text-gray-600 mt-2">Arrastrá una fotografía o pulsá para elegirla</p>
                                        <p className="text-xs text-gray-400 mt-1">{ACCEPTED_PHOTO_LABEL}</p>
                                    </>
                                )}
                            </div>
                            <input ref={fileRef} type="file" className="hidden"
                                accept={ACCEPTED_PHOTO_TYPES.join(',')}
                                onChange={e => tomarArchivo(e.target.files?.[0] || null)} />
                            {/* Las DOS vías, siempre (regla de v4.700): la biblioteca del
                                ecosistema y el archivo local. La zona de arrastre sigue
                                abriendo el selector de archivos, como siempre. */}
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <button type="button" onClick={abrirBiblioteca}
                                    className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:border-gray-400 hover:bg-gray-50">
                                    <FolderOpen className="w-4 h-4" /> Biblioteca multimedia
                                </button>
                                <button type="button" onClick={() => fileRef.current?.click()}
                                    className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:border-gray-400 hover:bg-gray-50">
                                    <UploadCloud className="w-4 h-4" /> Subir desde mi dispositivo
                                </button>
                            </div>
                        </div>

                        {/* ── La Biblioteca Multimedia (v4.928) ── */}
                        {bibAbierta && (
                            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
                                onClick={() => { if (!bibTrayendo) setBibAbierta(false); }}>
                                {/* Acotado a la ventana con desplazamiento propio: un panel
                                    más alto que la pantalla se recorta por arriba y se lleva
                                    la forma de cerrarlo (v4.872). */}
                                <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col"
                                    onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                                        <h3 className="font-medium text-gray-900">
                                            Biblioteca multimedia{biblioteca?.label ? <span className="text-gray-500 font-normal"> — <span data-no-translate>{biblioteca.label}</span></span> : ''}
                                        </h3>
                                        <button type="button" onClick={() => setBibAbierta(false)} aria-label="Cerrar la biblioteca"
                                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="p-5 overflow-y-auto">
                                        {bibCargando ? (
                                            <p className="flex items-center gap-2 text-sm text-gray-600">
                                                <Loader2 className="w-4 h-4 animate-spin" /> Buscando las fotografías del sitio…
                                            </p>
                                        ) : !biblioteca || biblioteca.images.length === 0 ? (
                                            <p className="text-sm text-gray-600">
                                                {biblioteca?.scope === 'club'
                                                    ? 'Este sitio todavía no tiene imágenes en su biblioteca. Subí la fotografía desde tu dispositivo.'
                                                    : 'No hay una biblioteca disponible en este momento. Subí la fotografía desde tu dispositivo.'}
                                            </p>
                                        ) : (
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                                {biblioteca.images.map(img => (
                                                    <button key={img.id} type="button"
                                                        onClick={() => elegirDeBiblioteca(img)}
                                                        disabled={!!bibTrayendo}
                                                        aria-label={`Usar esta fotografía: ${img.name || 'imagen de la biblioteca'}`}
                                                        className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-rotary-blue/40 disabled:opacity-70">
                                                        <img src={img.thumbUrl || img.url} alt={img.name || ''} loading="lazy"
                                                            className="w-full h-full object-cover" />
                                                        {bibTrayendo === img.id && (
                                                            <span className="absolute inset-0 bg-white/60 flex items-center justify-center">
                                                                <Loader2 className="w-5 h-5 animate-spin text-rotary-blue" />
                                                            </span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Enviar por correo (v4.929) ── */}
                        {correoAbierto && (
                            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
                                onClick={() => { if (!enviando) setCorreoAbierto(false); }}>
                                <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[calc(100vh-2rem)] flex flex-col"
                                    onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                                        <h3 className="font-medium text-gray-900">Enviar por correo</h3>
                                        <button type="button" onClick={() => { if (!enviando) setCorreoAbierto(false); }} aria-label="Cerrar el correo"
                                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="p-5 overflow-y-auto space-y-4">
                                        {!tokenAdmin() ? (
                                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                                                <p>
                                                    El envío institucional sale firmado por el Distrito: necesita una sesión de
                                                    administrador. El mensaje y la pieza no se pierden.
                                                </p>
                                                <button onClick={() => openLoginModal()}
                                                    className="mt-3 py-2 px-4 rounded-lg bg-rotary-blue text-white text-xs font-medium hover:bg-rotary-navy">
                                                    Iniciar sesión
                                                </button>
                                            </div>
                                        ) : envio && envio.ok ? (
                                            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-5 text-sm text-green-900 text-center">
                                                <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-green-600" />
                                                <p>Enviado correctamente a {envio.sent} destinatario{envio.sent === 1 ? '' : 's'}.</p>
                                                <button onClick={() => setCorreoAbierto(false)}
                                                    className="mt-3 py-2 px-4 rounded-lg border border-green-300 bg-white text-xs font-medium hover:bg-green-100">
                                                    Cerrar
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Asunto</label>
                                                    <input value={asunto} onChange={e => setAsunto(e.target.value)} maxLength={150}
                                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue" />
                                                </div>
                                                <div className="relative">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Destinatarios</label>
                                                    {destinatarios.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                                                            {destinatarios.map(d => (
                                                                <span key={d.email} data-no-translate
                                                                    className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-1 text-xs text-gray-800">
                                                                    {d.name ? `${d.name} · ` : ''}{d.email}
                                                                    <button type="button" onClick={() => setDestinatarios(x => x.filter(y => y.email !== d.email))}
                                                                        aria-label={`Quitar ${d.email}`} className="text-gray-400 hover:text-gray-700">
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <input value={buscaDest}
                                                        onChange={e => setBuscaDest(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); agregarDest(buscaDest); }
                                                        }}
                                                        onBlur={() => { if (buscaDest.trim()) agregarDest(buscaDest); }}
                                                        placeholder="Buscá un contacto o escribí un correo y presioná Enter…"
                                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue" />
                                                    {sugerencias.length > 0 && (
                                                        <ul className="absolute z-10 mt-1 w-full max-h-44 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                                                            {sugerencias.map(sug => (
                                                                <li key={sug.email}>
                                                                    <button type="button" onMouseDown={() => agregarDest(sug.email, sug.name)}
                                                                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" data-no-translate>
                                                                        {sug.name ? `${sug.name} — ` : ''}{sug.email}
                                                                    </button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                    <p className="text-[11px] text-gray-400 mt-1">
                                                        Podés elegir contactos de la plataforma o escribir cualquier correo. Máximo {MAX_DESTINATARIOS}.
                                                    </p>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Mensaje</label>
                                                    <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={8}
                                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue" />
                                                    <p className="text-[11px] text-gray-400 mt-1">
                                                        La pieza generada viaja dentro del correo y como archivo adjunto — es exactamente la que ves en pantalla.
                                                    </p>
                                                </div>
                                                {envio && !envio.ok && (
                                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                                        {envio.sent > 0 && <p>Enviado a {envio.sent} destinatario{envio.sent === 1 ? '' : 's'}.</p>}
                                                        {envio.failed.map(f => (
                                                            <p key={f.to} data-no-translate>No se pudo enviar a {f.to}{f.error ? `: ${f.error}` : ''}</p>
                                                        ))}
                                                    </div>
                                                )}
                                                {envioFallo && (
                                                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{envioFallo}</div>
                                                )}
                                                <button onClick={enviarCorreo} disabled={enviando || !destinatarios.length}
                                                    className="w-full py-2.5 rounded-xl bg-rotary-blue text-white text-sm font-medium hover:bg-rotary-navy disabled:opacity-60 flex items-center justify-center gap-2">
                                                    {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                    {enviando ? 'Enviando…' : `Enviar a ${destinatarios.length || 0} destinatario${destinatarios.length === 1 ? '' : 's'}`}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {fallo && (
                            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{fallo}</span>
                            </div>
                        )}

                        <button
                            onClick={generar} disabled={generando}
                            className="w-full py-3.5 rounded-xl bg-rotary-blue text-white font-medium hover:bg-rotary-navy disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {generando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                            {generando ? 'Generando…' : '✨ Generar aniversario con IA'}
                        </button>

                        {generando && (
                            <ol className="space-y-1.5 text-sm">
                                {STAGES.map((s, i) => (
                                    <li key={s.id} className={`flex items-center gap-2 ${i <= indice ? 'text-gray-900' : 'text-gray-400'}`}>
                                        <span className="w-5 text-center">{i < indice ? '✓' : s.icon}</span>
                                        {s.label}
                                        {i === indice && <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" />}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>

                    {/* ── El resultado ── */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                        {doc ? (
                            <>
                                {/* ⚠️ SIN PIEZA SUSTITUTA (v4.924): si el diseño generado no
                                    cargó, NO se muestra ninguna composición alternativa — se
                                    muestra el ERROR con su salida. El lienzo queda oculto (el
                                    compositor lo dejó vacío a propósito) y «Descargar» no se
                                    ofrece: no hay nada correcto que descargar. */}
                                <div ref={previewRef}
                                    className={`rounded-xl overflow-hidden border border-gray-200 bg-gray-50 ${disenoCaido ? 'hidden' : ''}`} />
                                {disenoCaido && (
                                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-8 text-center">
                                        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-500" />
                                        <p className="text-sm text-amber-900">
                                            El diseño <strong>sí se generó</strong> y está guardado, pero no se pudo
                                            cargar al navegador. No se muestra ninguna pieza alternativa: reintentá
                                            la carga — trae la <strong>misma</strong> generación, sin gastar una nueva.
                                        </p>
                                        <button onClick={reintentarDiseno}
                                            className="mt-4 w-full py-2.5 rounded-xl border border-amber-300 bg-white text-sm font-medium text-amber-900 hover:bg-amber-100 flex items-center justify-center gap-2">
                                            <RotateCcw className="w-4 h-4" /> Reintentar la carga (gratis)
                                        </button>
                                    </div>
                                )}
                                {!disenoCaido && (
                                    <p className="text-xs text-gray-400 mt-2 text-center">
                                        Lo que ves es exactamente lo que se descarga.
                                    </p>
                                )}

                                <div className={`grid grid-cols-1 gap-2 mt-4 ${disenoCaido ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                                    {!disenoCaido && (
                                        <button onClick={descargar}
                                            className="py-2.5 rounded-xl bg-rotary-blue text-white text-sm font-medium hover:bg-rotary-navy flex items-center justify-center gap-2">
                                            <Download className="w-4 h-4" /> Descargar PNG
                                        </button>
                                    )}
                                    <button onClick={generar} disabled={generando}
                                        className="py-2.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2">
                                        <RotateCcw className="w-4 h-4" /> Regenerar
                                    </button>
                                    <button onClick={cambiarFoto}
                                        className="py-2.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50 flex items-center justify-center gap-2">
                                        <ImagePlus className="w-4 h-4" /> Cambiar fotografía
                                    </button>
                                </div>

                                {sustituida && (
                                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                        <span>
                                            El diseño generado no pasó el control de calidad ({sustituida}). Para no entregarte una
                                            pieza con la fotografía alterada, se armó con tu foto <strong>intacta</strong> sobre
                                            fondo blanco. Podés pulsar «Regenerar» para intentarlo otra vez.
                                        </span>
                                    </div>
                                )}
                                {avisos.filter(a => a !== BACKDROP_FAILED_WARNING).map((a, i) => (
                                    <p key={i} className="mt-2 text-xs text-gray-500 flex items-start gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />{a}
                                    </p>
                                ))}

                                {/* ── Mensaje para compartir (v4.929) ── */}
                                {!disenoCaido && (
                                    <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                                        <h3 className="text-sm font-semibold text-gray-800 mb-2">Mensaje para compartir</h3>
                                        {msgCargando ? (
                                            <p className="flex items-center gap-2 text-sm text-gray-600">
                                                <Loader2 className="w-4 h-4 animate-spin" /> Redactando el mensaje institucional…
                                            </p>
                                        ) : mensaje ? (
                                            <>
                                                {/* Las pestañas del canal (v4.930): elegir cambia la
                                                    versión, como en la Biblioteca de Publicaciones. */}
                                                <div className="flex gap-1.5 mb-3">
                                                    <button type="button" onClick={() => setCanal('social')}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border ${canal === 'social' ? 'bg-rotary-blue text-white border-rotary-blue' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}>
                                                        WhatsApp / Redes
                                                    </button>
                                                    <button type="button" onClick={() => setCanal('email')}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border ${canal === 'email' ? 'bg-rotary-blue text-white border-rotary-blue' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}>
                                                        Correo electrónico
                                                    </button>
                                                </div>
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap" data-no-translate>{canal === 'social' ? mensaje.social : mensaje.email}</p>
                                                {mensaje.note && <p className="text-xs text-gray-500 mt-2">{mensaje.note}</p>}
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                                                    <button onClick={copiarMensaje}
                                                        className="py-2 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-1.5">
                                                        {copiado ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                        {copiado ? '¡Copiado!' : 'Copiar mensaje'}
                                                    </button>
                                                    <button onClick={compartirWhatsApp}
                                                        className="py-2 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-1.5">
                                                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                                    </button>
                                                    {typeof navigator !== 'undefined' && 'share' in navigator && (
                                                        <button onClick={compartirSistema}
                                                            className="py-2 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-1.5">
                                                            <Share2 className="w-3.5 h-3.5" /> Compartir
                                                        </button>
                                                    )}
                                                    <button onClick={abrirCorreo}
                                                        className="py-2 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-1.5">
                                                        <Mail className="w-3.5 h-3.5" /> Enviar por correo
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-gray-400 mt-2">
                                                    «Copiar» copia la versión de la pestaña elegida. WhatsApp y «Compartir» usan la
                                                    versión corta; «Enviar por correo» lleva la completa. La imagen viaja con
                                                    «Compartir» (si tu navegador lo permite), con el correo o descargándola.
                                                </p>
                                            </>
                                        ) : (
                                            <div className="text-sm text-gray-600">
                                                <p>{msgFallo || 'El mensaje todavía no se redactó.'}</p>
                                                <button onClick={() => setMsgIntento(x => x + 1)}
                                                    className="mt-2 py-1.5 px-3 rounded-lg border border-gray-300 bg-white text-xs font-medium hover:bg-gray-100 flex items-center gap-1.5">
                                                    <RotateCcw className="w-3.5 h-3.5" /> Reintentar el mensaje
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : generando ? (
                            /* La espera se VE viva (v4.919): barra indeterminada —
                               nunca un porcentaje inventado— más la etapa real y
                               los segundos de verdad. */
                            <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center px-8">
                                <Sparkles className="w-10 h-10 mb-4 text-rotary-blue animate-pulse" />
                                <p className="text-sm font-medium text-gray-800">
                                    {STAGES[indice >= 0 ? indice : 0]?.label || 'Generando…'}
                                </p>
                                <div className="w-full max-w-xs h-1.5 mt-4 rounded-full bg-gray-200 overflow-hidden">
                                    <div className="h-full w-1/3 rounded-full bg-rotary-blue animate-progress-slide" />
                                </div>
                                <p className="text-xs text-gray-400 mt-3">
                                    {segundos} s · suele tardar entre treinta segundos y un minuto y medio
                                </p>
                            </div>
                        ) : (
                            <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center text-gray-400 px-6">
                                <Sparkles className="w-10 h-10 mb-3" />
                                <p className="text-sm">Tu pieza va a aparecer acá.</p>
                                <p className="text-xs mt-1">Tarda entre treinta segundos y un minuto y medio.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AniversarioIA;
