// ════════════════════════════════════════════════════════════════════
// Mi Proyecto — Gestión de Proyectos del club
// v4.642.0
//
// Espacio privado del club que postuló su proyecto (pagado o no: desde
// v4.1253 la postulación no depende del pago). Ruta pública:
// /mi-proyecto.
//
// v4.642 — El panel dejó de ser "el formulario": ahora es la GESTIÓN del
// proyecto, con una tarjeta por cada formulario que el club debe diligenciar
// (Formulación del Proyecto, Solicitud de Aportes del FDD 2026-2027, y los que
// se registren después). Cada tarjeta muestra el estado, el avance y lo que se
// puede hacer; al abrirla se entra al formulario, que es la misma pantalla
// para todos (`ProjectFormView`).
//
// La lista de formularios la manda el servidor (`/portal/me` → `forms`), así
// que agregar uno nuevo NO se toca aquí.
//
// El formulario NO está codificado: se renderiza desde la plantilla que
// entrega el servidor, de modo que cuando el administrador cambia las
// secciones o los campos, esta pantalla los refleja sin tocar código.
//
// v4.1253 — El perfil separa la POSTULACIÓN del PAGO. La sección
// «Inscripción a la Feria de Proyectos» muestra el estado de cada uno, el
// valor con sus cargos y el total (el MISMO que se cobra), y ofrece «Pagar
// inscripción» cuando el club decida; un borrador se termina y se envía acá.
//
// La sesión es propia del módulo (token con audiencia project-fair-portal):
// nunca da acceso al panel administrativo de la plataforma.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../contexts/LanguageContext';
import { activeLocale } from '../lib/locale';
import {
    AlertCircle, ArrowRight, CalendarDays, CheckCircle2, ChevronRight, Clock, ExternalLink,
    FileText, KeyRound, LayoutDashboard, Loader2, LogOut, Lock, MapPin, PenLine,
    ShieldCheck, Trophy, Wallet, Download, Receipt, Send, Save, PlusCircle, Layers, RotateCcw, Trash2,
} from 'lucide-react';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
import { PROJECT_FAIR_PORTAL_PATH, PROJECT_FAIR_PORTAL_TOKEN_KEY } from '../lib/ctaLinks';
import { openLoginModal } from '../lib/loginModal';
import { forgetSession, rememberProfile, emitSessionChange, useSiteSessions } from '../lib/siteSession';
import { FORM_STATE_META, fmtDateTime, type FormCard, type FormState } from '../lib/projectForms';
import { inputCls, BLUE } from '../components/project-forms/FormFields';
import ProjectFormView from '../components/project-forms/ProjectFormView';
import { PresentationTemplateCard, NextStepCard } from '../components/project-forms/ProjectResourceCards';
import { VideoPitchCard } from '../components/project-forms/VideoPitchCard';
import VideoPitchRequestView from '../components/project-forms/VideoPitchRequestView';
import { ProjectVideoCard } from '../components/project-forms/ProjectVideoCard';
import ProjectVideoView from '../components/project-forms/ProjectVideoView';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const TOKEN_KEY = PROJECT_FAIR_PORTAL_TOKEN_KEY;

interface PortalData {
    // Rol del postulante: 'applicant' hasta que el pago queda confirmado,
    // 'project_manager' después, 'project_manager_suspended' tras un reembolso.
    role?: string;
    roleLabel?: string;
    submission: {
        id: string; publicRef: string; projectName: string; clubName: string;
        district: string; email: string; paymentStatus: string; paidAt: string | null;
        amountCop: number | null; amountUsd: number | null; receiptUrl?: string;
        projectIndex?: number; registrationId?: string | null;
    };
    // v4.1299 — La INSCRIPCIÓN del club: sus proyectos (uno o dos), con un
    // token para gestionar cada uno, el desglose, los pagos realizados y qué
    // puede hacer con el segundo proyecto. Resuelto por el servidor.
    registration?: RegistrationState | null;
    activeProjectId?: string;
    // El veredicto del pago llega RESUELTO del servidor: qué estado tiene, qué
    // frase se muestra, si se puede pagar y con qué rótulo. Esta pantalla lo
    // PINTA y no vuelve a decidir nada — el navegador no es la fuente de
    // verdad del estado de un cobro (v4.978).
    payment?: PaymentState;
    // v4.1253 — La postulación, con su estado propio (separado del pago).
    application?: ApplicationState;
    focusAreas?: { key: string; label: string }[];
    forms: FormCard[];
    edition: { name: string; city: string; country: string };
    // El evento real de la plataforma al que postula. Null si la edición
    // todavía no está vinculada a un evento: entonces se usa `edition`, que es
    // el bloque de respaldo escrito a mano.
    event: { id: string; title: string; url: string; startDate: string | null; endDate: string | null; location: string } | null;
    deadline: string | null;
    nextStep: { url: string; name: string; label: string };
    canEdit: boolean;
    reason: string | null;
}

interface ApplicationState {
    projectState: string; projectStateLabel: string; applied: boolean; appliedAt: string | null;
    paymentStatus: string; paymentStatusLabel: string; owes: boolean;
    publicRef: string; responsible: string; createdAt: string | null;
    fields: { projectName: string; projectDescription: string; focusArea: string; focusAreaLabel: string | null; budgetUsd: number | null };
    acceptingApplications: boolean;
}

interface RegistrationProject {
    id: string; projectIndex: number; indexLabel: string; publicRef: string; projectName: string; focusAreaLabel?: string | null;
    projectState: string; projectStateLabel: string; applied: boolean; appliedAt: string | null;
    paymentStatus: string; paymentStatusLabel: string; owes: boolean;
    withdrawnByClub: boolean; active: boolean; removable: boolean; current: boolean; token: string | null;
}
interface PaidOrder {
    anchorId: string; publicRef: string; paidAt: string | null; amount: number | null; currency: string; origin: string; receiptUrl: string | null;
    projects: { id: string; publicRef: string | null; projectName: string; projectIndex: number; indexLabel: string }[];
}
interface RegistrationState {
    id: string | null; modality: 'single' | 'double'; count: number; maxProjects: number; currency: 'COP' | 'USD';
    lines: { submissionId: string; projectIndex: number; projectName: string; label: string; amount: number; paid: boolean; owes: boolean; applied: boolean }[];
    total: number; paidTotal: number; pendingTotal: number;
    projects: RegistrationProject[];
    paidOrders: PaidOrder[];
    secondProject: {
        enabled: boolean; amount: number; firstAmount: number; bundleTotal: number; deadline: string | null;
        canAdd: boolean; canRestore: boolean; restoreId: string | null; code: string | null; reason: string | null;
    };
}

interface PaymentAttempt { n: number; status: string; label: string; reason: string | null; at: string | null }
interface ChargeLine { key: string; label: string; percent: number | null; amount: number }
interface ChargeProject { submissionId: string; projectIndex: number; projectName: string; publicRef: string | null; label: string; amount: number }
interface PaymentState {
    state: 'paid' | 'failed' | 'pending' | 'refunded' | 'draft';
    /** v4.1253 — Estado del pago para leer: pending, processing, confirmed, failed, refunded, partially_refunded. */
    status?: string;
    statusLabel?: string;
    applied?: boolean;
    /** El desglose del cobro, calculado por el servidor con la MISMA función que arma la sesión de Stripe. */
    charge?: { currency: string; base: number; lines: ChargeLine[]; projects?: ChargeProject[]; total: number | null; approxUsd?: number | null; final: boolean; anchorRef?: string | null } | null;
    /** v4.1299 — Pagado dentro del cobro de otro proyecto de la inscripción. */
    coveredBy?: { id: string; publicRef: string | null; projectName: string | null } | null;
    deadline?: string | null;
    transaction?: { reference: string | null; method: string | null; amount: number | null; currency: string; refundedAmount: number | null } | null;
    paid: boolean;
    canPay: boolean;
    label: string;
    detail: string | null;
    actionLabel: string | null;
    amountCop: number | null;
    amountUsd: number | null;
    /** En qué moneda se publicó el precio. */
    priceMode?: 'COP' | 'USD';
    paidAt: string | null;
    receiptUrl: string | null;
    attempts: PaymentAttempt[];
}

const fmtCop = (n?: number | null) => `$${Number(n || 0).toLocaleString(activeLocale(), { maximumFractionDigits: 0 })}`;
/** Importe en su moneda: pesos sin decimales, dólares con dos. */
const fmtMoney = (n: number | null | undefined, currency?: string | null) => {
    if (n === null || n === undefined) return '—';
    return String(currency || 'COP').toUpperCase() === 'USD'
        ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
        : `${fmtCop(n)} COP`;
};
const fmtPercent = (p: number | null) => (p === null || p === undefined ? '' : `${Math.round(p * 1000) / 10} %`.replace('.', ','));
const fmtDate = (v?: string | null) => {
    if (!v) return '';
    const d = new Date(`${v}T12:00:00`);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Fechas del evento en una sola frase. Un evento de varios días dentro del
 * mismo mes se escribe «12 – 14 de marzo de 2027», sin repetir el mes: es como
 * se leen las fechas de un evento y ocupa la mitad.
 */
const fmtEventDates = (start?: string | null, end?: string | null): string => {
    if (!start) return '';
    const a = new Date(start);
    if (isNaN(a.getTime())) return '';
    const loc = activeLocale();
    const largo: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    const b = end ? new Date(end) : null;
    if (!b || isNaN(b.getTime()) || a.toDateString() === b.toDateString()) {
        return a.toLocaleDateString(loc, largo);
    }
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
        return `${a.toLocaleDateString(loc, { day: 'numeric' })} – ${b.toLocaleDateString(loc, largo)}`;
    }
    return `${a.toLocaleDateString(loc, { day: 'numeric', month: 'long' })} – ${b.toLocaleDateString(loc, largo)}`;
};

/**
 * Cuánto falta para el plazo. Una fecha sola obliga a hacer la cuenta mental, y
 * una fecha ya vencida se lee igual que una vigente: es justo cuando hay que
 * decirlo con todas las letras.
 */
const deadlineNotice = (v?: string | null): { text: string; urgent: boolean; over: boolean } | null => {
    if (!v) return null;
    const fin = new Date(`${v}T23:59:59`);
    if (isNaN(fin.getTime())) return null;
    const dias = Math.ceil((fin.getTime() - Date.now()) / 86_400_000);
    if (dias < 0) return { text: 'El plazo ya venció', urgent: false, over: true };
    if (dias === 0) return { text: 'Último día', urgent: true, over: false };
    if (dias === 1) return { text: 'Falta 1 día', urgent: true, over: false };
    return { text: `Faltan ${dias} días`, urgent: dias <= 7, over: false };
};

// ════════════════════════════════════════════════════════════════════
const MiProyecto = () => {
    // Suscripción al idioma: los formateadores de arriba leen el locale
    // activo, y sin esto la página no se repintaría al cambiarlo.
    useLang();
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
    // v4.1299 — EL TOKEN ES EL SELECTOR DE PROYECTO. La sesión guardada abre el
    // proyecto principal; al elegir otro proyecto de la inscripción se usa el
    // token que el servidor emitió para ÉL (misma cuenta, mismo vencimiento) y
    // todas las tarjetas —formularios, videos, recursos— hablan de ese
    // proyecto sin saber que hay otro.
    const [projectToken, setProjectToken] = useState<string | null>(null);
    const activeToken = projectToken || token;
    const [data, setData] = useState<PortalData | null>(null);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    // Formulario abierto. Va en la URL (?form=…) para poder compartir el enlace
    // y para que el botón "atrás" del navegador haga lo que se espera.
    const [openForm, setOpenForm] = useState<string | null>(
        () => new URLSearchParams(window.location.search).get('form')
    );
    // v4.1293 — La solicitud de Video Pitch, abierta a pantalla completa como
    // un formulario más. También vive en la URL (?videoPitch=1): es el enlace
    // que mandan los correos del módulo.
    const [openVideoPitch, setOpenVideoPitch] = useState<boolean>(
        () => new URLSearchParams(window.location.search).get('videoPitch') === '1'
    );
    // Cada cambio en la vista de Video Pitch repinta su tarjeta al volver.
    const [vpRefresh, setVpRefresh] = useState(0);
    // v4.1298 — El video PROPIO del club (modalidad A, sin costo): otra vista a
    // pantalla completa, también en la URL (?projectVideo=1&pv_action=).
    const [openProjectVideo, setOpenProjectVideo] = useState<boolean>(() => new URLSearchParams(window.location.search).get('projectVideo') === '1');
    const [pvAction, setPvAction] = useState<'edit' | 'replace' | null>(() => {
        const a = new URLSearchParams(window.location.search).get('pv_action');
        return a === 'edit' || a === 'replace' ? a : null;
    });
    const [pvRefresh, setPvRefresh] = useState(0);
    const openProjectVideoView = (open: boolean, action: 'edit' | 'replace' | null = null) => {
        setOpenProjectVideo(open);
        setPvAction(open ? action : null);
        const url = new URL(window.location.href);
        if (open) url.searchParams.set('projectVideo', '1'); else url.searchParams.delete('projectVideo');
        if (open && action) url.searchParams.set('pv_action', action); else url.searchParams.delete('pv_action');
        window.history.pushState(null, '', url.toString());
        if (!open) setPvRefresh(n => n + 1);
    };
    // El otro panel de esta misma persona, si tiene esa sesión abierta.
    const sessions = useSiteSessions();
    const otherPanel = sessions.find(x => x.realm === 'attendee') || null;

    // Pago en curso: apaga el botón mientras se pide la sesión, así un doble
    // clic no dispara dos peticiones. La protección de verdad está en el
    // servidor —un solo intento abierto por inscripción—, pero un botón que
    // se puede pulsar tres veces seguidas se lee como que no hizo nada.
    const [paying, setPaying] = useState(false);

    const resetToken = useMemo(() => new URLSearchParams(window.location.search).get('reset'), []);

    // ── Sesión ───────────────────────────────────────────────────────
    // Salir cierra la identidad en el sitio entero, no sólo en esta pantalla:
    // el encabezado escucha ese aviso y baja el avatar en el acto (v4.693).
    const logout = useCallback(() => {
        forgetSession('portal');
        setToken(null); setProjectToken(null); setData(null); setOpenForm(null);
    }, []);

    const loadPortal = useCallback((t: string, silent = false) => {
        if (!silent) setLoading(true);
        fetch(`${API}/project-fair/portal/me`, { headers: { Authorization: `Bearer ${t}` } })
            .then(async r => {
                const body = await r.json();
                if (r.status === 401) { logout(); return null; }
                if (!r.ok) throw new Error(body?.error || 'No pudimos cargar tu panel.');
                return body as PortalData;
            })
            .then(body => {
                if (!body) return;
                setData(body);
                // El token lleva el correo, no el nombre: se guarda aquí lo que
                // el encabezado necesita para el menú del avatar, y así no hace
                // falta una consulta por visita sólo para dibujarlo.
                rememberProfile('portal', {
                    name: body.submission?.clubName || null,
                    org: body.submission?.projectName || null,
                    email: body.submission?.email || null,
                });
            })
            .catch(e => setNotice({ kind: 'error', text: e?.message || 'No pudimos cargar tu panel.' }))
            .finally(() => setLoading(false));
    }, [logout]);

    /**
     * Completar o reintentar el pago de la inscripción.
     *
     * El servidor sincroniza con la pasarela ANTES de crear nada, así que hay
     * un desenlace que no es un error y hay que atender: que la inscripción ya
     * estuviera pagada. Pasa cuando el webhook llegó mientras el club no
     * estaba —o cuando la redirección final falló— y es justamente el caso que
     * no puede terminar en un segundo cobro: se recarga el panel y los
     * formularios se desbloquean solos.
     */
    const handlePay = useCallback(async () => {
        if (!activeToken || paying) return;
        setPaying(true);
        setNotice(null);
        try {
            const res = await fetch(`${API}/project-fair/portal/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
                body: JSON.stringify({ returnUrl: window.location.origin }),
            });
            const body = await res.json().catch(() => ({}));
            if (res.status === 401) { logout(); return; }
            if (body?.alreadyPaid) {
                setNotice({ kind: 'ok', text: 'Tu pago ya estaba confirmado.' });
                loadPortal(activeToken, true);
                setPaying(false);
                return;
            }
            if (!res.ok || !body?.url) throw new Error(body?.error || 'No pudimos iniciar el pago.');
            window.location.href = body.url;
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos iniciar el pago. Inténtalo de nuevo en un momento.' });
            setPaying(false);
        }
    }, [activeToken, paying, logout, loadPortal]);

    /**
     * El comprobante del pago: la MISMA plantilla del correo, abierta en una
     * ventana para verla o imprimirla como PDF. Se pide con la sesión del
     * club; nadie más puede leer el comprobante de otro.
     */
    const openReceipt = useCallback(async () => {
        if (!activeToken) return;
        // La ventana se abre ANTES del viaje de red: abrirla después del
        // `await` la convierte en una ventana emergente que el navegador
        // bloquea.
        const win = window.open('', '_blank');
        try {
            const res = await fetch(`${API}/project-fair/portal/receipt`, { headers: { Authorization: `Bearer ${activeToken}` } });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.html) throw new Error(body?.error || 'No pudimos generar tu comprobante.');
            if (!win) throw new Error('Tu navegador bloqueó la ventana del comprobante. Permite las ventanas emergentes e inténtalo de nuevo.');
            win.document.open();
            win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comprobante ${body.publicRef || ''}</title></head><body style="margin:0;background:#f8fafc">${body.html}<p style="text-align:center;font-family:Arial,sans-serif;margin:16px"><button onclick="window.print()" style="background:#17458F;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-weight:bold;cursor:pointer">Imprimir o guardar como PDF</button></p></body></html>`);
            win.document.close();
        } catch (e: any) {
            win?.close();
            setNotice({ kind: 'error', text: e?.message || 'No pudimos generar tu comprobante.' });
        }
    }, [activeToken]);

    // Entrada automática al volver de Stripe: se canjea la sesión de pago por
    // una sesión del panel, sin pedir la contraseña otra vez.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const submissionId = params.get('submission');
        const sessionId = params.get('session_id');
        if (token) { loadPortal(token); return; }
        if (!submissionId || !sessionId) { setLoading(false); return; }

        fetch(`${API}/project-fair/portal/claim`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submissionId, sessionId }),
        })
            .then(r => r.json())
            .then(body => {
                if (body?.token) {
                    localStorage.setItem(TOKEN_KEY, body.token);
                    emitSessionChange();
                    setToken(body.token);
                    window.history.replaceState(null, '', window.location.pathname);
                } else {
                    setLoading(false);
                }
            })
            .catch(() => setLoading(false));
        // Sólo al montar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { if (activeToken) loadPortal(activeToken); }, [activeToken, loadPortal]);

    // v4.1299 — Cambiar de proyecto dentro de la inscripción: se cierra lo que
    // estuviera abierto (un formulario es DE un proyecto) y se recarga con el
    // token de ese proyecto.
    const switchProject = useCallback((p: RegistrationProject) => {
        if (!p.token || p.current) return;
        setOpenForm(null); setOpenVideoPitch(false); setOpenProjectVideo(false);
        const url = new URL(window.location.href);
        ['form', 'videoPitch', 'vp_action', 'projectVideo', 'pv_action'].forEach(k => url.searchParams.delete(k));
        window.history.replaceState(null, '', url.toString());
        setProjectToken(p.token);
    }, []);

    /** Acciones sobre la inscripción (agregar, quitar, restaurar el segundo proyecto). */
    const registrationAction = useCallback(async (path: string, body: any, okText: string) => {
        if (!activeToken) return false;
        setNotice(null);
        try {
            const res = await fetch(`${API}/project-fair/portal/projects${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
                body: JSON.stringify(body || {}),
            });
            const resp = await res.json().catch(() => ({}));
            if (res.status === 401) { logout(); return false; }
            if (!res.ok) throw Object.assign(new Error(resp?.error || 'No pudimos completar la acción.'), { fields: resp?.fields, code: resp?.code });
            setNotice({ kind: 'ok', text: okText });
            loadPortal(activeToken, true);
            return resp;
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos completar la acción.' });
            throw e;
        }
    }, [activeToken, logout, loadPortal]);

    // El formulario abierto vive en la URL: entrar y salir de uno es navegar.
    const openFormView = (key: string | null) => {
        setOpenForm(key);
        const url = new URL(window.location.href);
        if (key) url.searchParams.set('form', key); else url.searchParams.delete('form');
        window.history.pushState(null, '', url.toString());
    };
    // v4.1296 — La tarjeta puede abrir la vista pidiendo pagar o cambiar de
    // plan (`?vp_action=`); la vista lo lee una vez y lo ejecuta.
    const [vpAction, setVpAction] = useState<'pay' | 'plan' | null>(() => {
        const a = new URLSearchParams(window.location.search).get('vp_action');
        return a === 'pay' || a === 'plan' ? a : null;
    });
    const openVideoPitchView = (open: boolean, action: 'pay' | 'plan' | null = null) => {
        setOpenVideoPitch(open);
        setVpAction(open ? action : null);
        const url = new URL(window.location.href);
        if (open) url.searchParams.set('videoPitch', '1'); else url.searchParams.delete('videoPitch');
        if (open && action) url.searchParams.set('vp_action', action); else url.searchParams.delete('vp_action');
        window.history.pushState(null, '', url.toString());
        if (!open) setVpRefresh(n => n + 1);
    };
    useEffect(() => {
        const onPop = () => {
            const params = new URLSearchParams(window.location.search);
            setOpenForm(params.get('form'));
            setOpenVideoPitch(params.get('videoPitch') === '1');
            setOpenProjectVideo(params.get('projectVideo') === '1');
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    // Volver de la pasarela sin haber pagado no es un fallo del sistema y hay
    // que decirlo así: lo que el club escribió sigue guardado.
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('pago') !== 'cancelado') return;
        setNotice({ kind: 'ok', text: 'El pago no se completó. Tu inscripción y tu proyecto quedaron guardados: puedes intentarlo cuando quieras.' });
        const url = new URL(window.location.href);
        url.searchParams.delete('pago');
        window.history.replaceState(null, '', url.toString());
    }, []);

    // ⚠️ EL PAGO PUEDE CONFIRMARSE DESPUÉS DE QUE EL CLUB YA ESTÁ MIRANDO EL
    // PANEL. El servidor sincroniza al cargar, pero la confirmación de Stripe
    // puede tardar unos segundos más que el regreso del navegador: sin este
    // sondeo, el club vuelve de pagar, ve «Pendiente de pago» y concluye que
    // su dinero se perdió. Sólo corre al volver de la pasarela —hay
    // `session_id` en la URL— y con tope: girar sin fin es peor que no girar.
    const [aguardandoPago, setAguardandoPago] = useState(
        () => Boolean(new URLSearchParams(window.location.search).get('session_id'))
    );
    useEffect(() => {
        if (!aguardandoPago || !activeToken) return;
        if (data?.payment && !data.payment.canPay) { setAguardandoPago(false); return; }
        let vueltas = 0;
        const timer = setInterval(() => {
            if (++vueltas > 10) { setAguardandoPago(false); clearInterval(timer); return; }
            loadPortal(activeToken, true);
        }, 4000);
        return () => clearInterval(timer);
    }, [aguardandoPago, activeToken, data?.payment, loadPortal]);

    if (loading) {
        return (
            <div className="min-h-screen bg-rotary-concrete">
                <Navbar />
                <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
                    <Loader2 className="mr-2 animate-spin" size={22} style={{ color: BLUE }} /> Cargando tu panel…
                </div>
                <Footer />
            </div>
        );
    }

    // Sin sesión hay dos caminos, y ninguno es un formulario de ingreso propio:
    // el enlace de correo abre la creación de contraseña; todo lo demás manda
    // al formulario único del encabezado.
    if (!token || !data) {
        const accept = (t: string) => { localStorage.setItem(TOKEN_KEY, t); emitSessionChange(); setToken(t); };
        return resetToken
            ? <PortalReset token={resetToken} onToken={accept} />
            : <PortalSignIn notice={notice} hadSession={Boolean(token)} />;
    }

    const forms = data.forms || [];
    const current = forms.find(f => f.key === openForm) || null;
    const pago = data.payment || null;
    const reg = data.registration || null;
    const regProjects = (reg?.projects || []).filter(p => p.active);
    const currentProject = reg?.projects.find(p => p.current) || null;
    const tokenActivo = activeToken as string;

    return (
        <div className="min-h-screen bg-rotary-concrete">
            <Navbar />

            <header style={PAGE_HEADER_BACKGROUND} className="px-4 py-7 text-white sm:px-6">
                <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                            {regProjects.length > 1 ? `Gestión de proyectos · Proyecto ${currentProject?.projectIndex || data.submission.projectIndex || 1} de ${regProjects.length}` : 'Gestión de proyectos'}
                        </p>
                        <h1 className="mt-1 text-2xl font-bold leading-tight">{data.submission.projectName}</h1>
                        <p className="mt-1 text-sm text-white/85">
                            {data.submission.clubName} · {data.submission.district} · Ref. {data.submission.publicRef}
                        </p>
                        {data.roleLabel && (
                            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
                                <ShieldCheck size={12} /> {data.roleLabel}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Una sola persona puede llevar los dos roles. El
                            enlace aparece SÓLO si esa otra sesión existe: no se
                            ofrece un panel al que no se puede entrar. */}
                        {otherPanel && (
                            <Link to={otherPanel.path}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">
                                <LayoutDashboard size={14} /> {otherPanel.menu}
                            </Link>
                        )}
                        <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">
                            <LogOut size={14} /> Salir
                        </button>
                    </div>
                </div>

                {/* ── A qué feria postula ──────────────────────────────
                    Va DENTRO del encabezado y separado por una línea, no
                    mezclado con el nombre del proyecto: son dos identidades
                    distintas —cuál es mi proyecto y a qué evento va— y
                    juntarlas en un mismo renglón diluye las dos.

                    El nombre, la sede y las fechas salen del evento real de la
                    plataforma; `edition` es el respaldo para una edición que
                    todavía no se ha vinculado a su evento. */}
                <EventStrip event={data.event} edition={data.edition} />

                {/* ── v4.1299 — MIS PROYECTOS POSTULADOS ──────────────────
                    Con dos proyectos en la inscripción, se elige cuál se está
                    gestionando. Cada uno conserva sus propios formularios,
                    documentos, videos y estados: nada se mezcla. */}
                {regProjects.length > 1 && (
                    <ProjectSwitcher projects={regProjects} onSwitch={switchProject} />
                )}
            </header>

            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
                {openProjectVideo ? (
                    <ProjectVideoView
                        key={`${data.submission.id}-${pvAction || 'open'}`}
                        token={tokenActivo}
                        initialAction={pvAction}
                        onBack={() => openProjectVideoView(false)}
                        onChanged={() => setPvRefresh(n => n + 1)}
                        onSessionExpired={logout}
                    />
                ) : openVideoPitch ? (
                    <VideoPitchRequestView
                        key={`${data.submission.id}-${vpAction || 'open'}`}
                        token={tokenActivo}
                        initialAction={vpAction}
                        onBack={() => openVideoPitchView(false)}
                        onChanged={() => setVpRefresh(n => n + 1)}
                        onSessionExpired={logout}
                    />
                ) : current ? (
                    <ProjectFormView
                        key={`${data.submission.id}-${current.key}`}
                        token={tokenActivo}
                        formKey={current.key}
                        onBack={() => openFormView(null)}
                        onProgress={() => loadPortal(tokenActivo, true)}
                    />
                ) : (
                    <>
                        {notice && (
                            <div className={`mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                                notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                                {notice.kind === 'ok' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
                                <span>{notice.text}</span>
                                <button onClick={() => setNotice(null)} className="ml-auto text-xs font-bold opacity-60 hover:opacity-100">Cerrar</button>
                            </div>
                        )}

                        {/* v4.1253 — Un BORRADOR todavía no está postulado: lo
                            primero que el club ve es cómo terminarlo y enviarlo. */}
                        {data.application && !data.application.applied && (
                            <DraftEditor
                                key={data.submission.id}
                                token={tokenActivo}
                                application={data.application}
                                focusAreas={data.focusAreas || []}
                                onChange={() => loadPortal(tokenActivo, true)}
                                onNotice={setNotice}
                            />
                        )}

                        {/* Estado de la postulación */}
                        <section className="mb-6 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    <Send size={13} /> Postulación
                                </p>
                                {/* El estado del PROYECTO, que ya no depende del pago. */}
                                <p className="mt-1 text-lg font-bold" style={{ color: data.application?.applied === false ? '#b45309' : BLUE }}>
                                    {data.application?.projectStateLabel || 'Postulado'}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {data.application?.appliedAt ? `Postulado el ${fmtDateTime(data.application.appliedAt)}` : 'Todavía no se ha enviado'}
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    <FileText size={13} /> Formularios
                                </p>
                                <p className="mt-1 text-lg font-bold" style={{ color: BLUE }}>
                                    {forms.filter(f => ['submitted', 'in_review', 'approved'].includes(f.state)).length} de {forms.length} enviados
                                </p>
                                <p className="text-xs text-slate-500">Avance general {Math.round(forms.reduce((a, f) => a + f.completionPct, 0) / (forms.length || 1))}%</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    <Clock size={13} /> Plazo
                                </p>
                                <p className="mt-1 text-lg font-bold text-slate-800">{data.deadline ? fmtDate(data.deadline) : 'Sin fecha límite'}</p>
                                {/* La fecha sola obliga a hacer la cuenta mental, y una ya
                                    vencida se lee igual que una vigente. El nombre de la
                                    edición salió de aquí: ahora está en el encabezado, y
                                    repetirlo dejaba esta línea sin decir nada del plazo. */}
                                {(() => {
                                    const aviso = deadlineNotice(data.deadline);
                                    if (!aviso) return <p className="text-xs text-slate-500">Tu club puede enviar cuando esté listo.</p>;
                                    return (
                                        <p className={`text-xs font-semibold ${aviso.over ? 'text-red-600' : aviso.urgent ? 'text-amber-600' : 'text-slate-500'}`}>
                                            {aviso.text}
                                        </p>
                                    );
                                })()}
                            </div>
                        </section>

                        {/* ⚠️ v4.1253 — INSCRIPCIÓN A LA FERIA DE PROYECTOS. Es la sección
                            del pago, y es INDEPENDIENTE de la postulación: muestra los
                            dos estados por separado, el valor con sus cargos y el total
                            que se cobra (lo calcula el servidor con la misma función
                            que arma la sesión de Stripe), y «Pagar inscripción» cuando
                            el club decida. Con el pago confirmado, el botón desaparece
                            y quedan la transacción y el comprobante. */}
                        {pago ? (
                            <PaymentCallout
                                pago={pago}
                                application={data.application || null}
                                submission={data.submission}
                                registration={reg}
                                eventName={data.event?.title || data.edition?.name || ''}
                                bloqueo={pago.canPay && !data.canEdit ? data.reason : null}
                                onPay={handlePay}
                                onReceipt={openReceipt}
                                paying={paying}
                                esperando={aguardandoPago && !!pago?.canPay}
                            />
                        ) : null}

                        {/* ── v4.1299 — EL SEGUNDO PROYECTO ──────────────────
                            Agregarlo (antes o después de pagar el primero),
                            quitarlo antes de pagar o restaurarlo. El veredicto
                            llega resuelto del servidor. */}
                        {reg ? (
                            <SecondProjectCard
                                registration={reg}
                                focusAreas={data.focusAreas || []}
                                onAdd={(body) => registrationAction('', body, body.mode === 'draft'
                                    ? 'Guardamos el borrador de tu segundo proyecto. Puedes terminarlo y enviarlo desde su pestaña.'
                                    : '¡Tu segundo proyecto quedó postulado! Su inscripción se suma a tu pago pendiente con la tarifa especial.')}
                                onWithdraw={(id) => registrationAction(`/${id}/withdraw`, {}, 'Quitamos el segundo proyecto de tu inscripción. Su información se conserva por si decides restaurarlo.')}
                                onRestore={(id) => registrationAction(`/${id}/restore`, {}, 'Restauramos tu segundo proyecto: vuelve a hacer parte de tu inscripción.')}
                                onSwitch={switchProject}
                            />
                        ) : null}
                        {/* Un formulario cerrado por otro motivo (plazo, comité,
                            reembolso, borrador) se dice aparte, con su candado. */}
                        {!data.canEdit && data.reason && !(pago?.canPay) ? (
                            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                <Lock size={17} className="mt-0.5 shrink-0" /> <span>{data.reason}</span>
                            </div>
                        ) : null}

                        {/* Formularios y recursos del proyecto.
                            v4.1264 — Una sola cuadrícula de dos columnas: arriba
                            los formularios (Formulación | Solicitud del FDD), abajo
                            la plantilla de presentación (debajo de la Formulación)
                            y Rotary 31A (debajo del FDD), que dejó de ser una banda
                            de ancho completo. En el móvil, una columna en ese
                            mismo orden. */}
                        <section>
                            <h2 className="text-lg font-bold text-slate-900">Formularios y recursos del proyecto</h2>
                            <p className="mt-1 text-[15px] text-slate-600">
                                Diligéncialos en el orden que prefieras. El avance se guarda solo y puedes volver cuantas veces necesites.
                            </p>

                            {!forms.length && (
                                <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
                                    Todavía no hay formularios habilitados para tu proyecto.
                                </p>
                            )}

                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                {forms.map(form => <FormCardTile key={form.key} form={form} onOpen={() => openFormView(form.key)} />)}
                                {/* La descarga no depende del pago ni de los
                                    formularios: es un recurso de apoyo. */}
                                <PresentationTemplateCard key={`tpl-${data.submission.id}`} token={tokenActivo} onSessionExpired={logout} />
                                {data.nextStep?.url && <NextStepCard nextStep={data.nextStep} />}
                                {/* v4.1298 — El video de presentación del proyecto, DOS caminos
                                    lado a lado: subir el video propio (sin costo) o solicitar el
                                    Video Pitch Profesional (servicio de pago). Cada tarjeta trae
                                    su estado resuelto del servidor y sus procesos son
                                    independientes: ninguna acción borra información de la otra. */}
                                <ProjectVideoCard key={`pv-${data.submission.id}`} token={tokenActivo} onSessionExpired={logout} onOpen={action => openProjectVideoView(true, action === 'edit' ? 'edit' : action === 'replace' ? 'replace' : null)} refreshKey={pvRefresh} />
                                <VideoPitchCard key={`vp-${data.submission.id}`} token={tokenActivo} onSessionExpired={logout} onOpen={action => openVideoPitchView(true, action === 'pay' ? 'pay' : action === 'plan' ? 'plan' : null)} refreshKey={vpRefresh} />
                            </div>
                        </section>
                    </>
                )}
            </main>

            <Footer />
        </div>
    );
};

/**
 * «Inscripción a la Feria de Proyectos» (v4.1253; antes, la banda de
 * «Completar pago» de v4.978).
 *
 * QUÉ CAMBIÓ Y POR QUÉ. Hasta v4.1252 esta banda sólo aparecía con el pago
 * pendiente y decía «completa el pago para habilitar los formularios»: el pago
 * era la puerta. Ahora la postulación no depende del pago, así que la sección
 * está SIEMPRE y dice las dos cosas por separado: en qué va la postulación y
 * en qué va el pago. Muestra el valor, los cargos y el total —el pedido exige
 * que coincida con lo que se envía a Stripe, y por eso lo calcula el servidor
 * con la misma función que arma la sesión—, la fecha límite sólo si existe,
 * el historial de intentos y, pagada, la transacción y el comprobante.
 *
 * El VEREDICTO (`pago.canPay`, rótulos, frase) llega resuelto del servidor:
 * esta pantalla no decide si se puede pagar.
 *
 * Va en el ámbito del MÓDULO, como todo componente de este archivo: declarada
 * dentro de la página sería un tipo nuevo en cada render (v4.971).
 */
const PaymentCallout = ({ pago, application, submission, registration, eventName, bloqueo, onPay, onReceipt, paying, esperando }: {
    pago: PaymentState; application: ApplicationState | null; submission: PortalData['submission']; registration: RegistrationState | null; eventName: string;
    bloqueo: string | null; onPay: () => void; onReceipt: () => void; paying: boolean; esperando: boolean;
}) => {
    // Sólo los intentos ya resueltos: uno «en curso» no es historia todavía.
    const intentos = (pago.attempts || []).filter(a => a.status !== 'open');
    const charge = pago.charge || null;
    const moneda = charge?.currency || pago.priceMode || 'COP';
    // v4.1299 — Una línea por proyecto cubierto por este cobro; con uno solo,
    // la fila de siempre («Valor de inscripción»).
    const proyectos = charge?.projects && charge.projects.length > 1 ? charge.projects : null;
    const pagosHechos = registration?.paidOrders || [];
    const variosProyectos = (registration?.count || 1) > 1;
    const confirmado = pago.paid;
    const tono = confirmado ? 'emerald' : pago.state === 'failed' ? 'red' : pago.state === 'refunded' ? 'slate' : 'amber';
    const tonoCls: Record<string, string> = {
        emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        red: 'bg-red-50 text-red-700 ring-red-200',
        slate: 'bg-slate-100 text-slate-700 ring-slate-200',
        amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    };
    const fila = (k: React.ReactNode, v: React.ReactNode) => (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
            <span className="text-slate-500">{k}</span>
            <span className="text-right font-semibold text-slate-800">{v}</span>
        </div>
    );

    return (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                        <Wallet size={18} style={{ color: BLUE }} /> Inscripción a la Feria de Proyectos
                    </h2>
                    {eventName && <p className="mt-0.5 text-sm text-slate-500">{eventName}</p>}
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${tonoCls[tono]}`}>
                    {confirmado ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                    {confirmado ? 'Pago confirmado' : (pago.statusLabel ? `Pago ${pago.statusLabel.toLowerCase()}` : pago.label)}
                </span>
            </div>

            {/* El mensaje: sin alarma. El proyecto está postulado aunque el
                pago siga pendiente, y se dice con todas las letras. */}
            {!confirmado && pago.detail && (
                <p className={`mt-4 rounded-xl px-4 py-3 text-sm leading-relaxed ${pago.state === 'failed' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
                    {pago.detail}
                    {bloqueo && <span className="mt-1 block">{bloqueo}</span>}
                </p>
            )}

            <div className="mt-4 grid gap-6 lg:grid-cols-2">
                {/* La postulación */}
                <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{variosProyectos ? 'Inscripción del club' : 'Postulación'}</p>
                    {variosProyectos && registration ? (
                        <>
                            {fila('Club Rotario', submission.clubName)}
                            {fila('Cantidad de proyectos', `${registration.count} proyectos`)}
                            {registration.lines.map(l => fila(
                                <>{l.label}<span className="block text-xs font-normal text-slate-400">{l.projectName}</span></>,
                                <>{fmtMoney(l.amount, registration.currency)}<span className={`block text-xs ${l.paid ? 'text-emerald-600' : l.owes ? 'text-amber-700' : 'text-slate-400'}`}>{l.paid ? 'Pagado' : l.owes ? 'Pendiente de pago' : l.applied ? 'Sin cobro' : 'Borrador'}</span></>,
                            ))}
                            {fila('Total de inscripción', <span style={{ color: BLUE }}>{fmtMoney(registration.total, registration.currency)}</span>)}
                        </>
                    ) : (
                        <>
                            {fila('Proyecto asociado', submission.projectName)}
                            {fila('Código de postulación', application?.publicRef || submission.publicRef)}
                            {fila('Club Rotario', submission.clubName)}
                            {application?.responsible ? fila('Responsable', application.responsible) : null}
                            {fila('Estado de postulación', application?.projectStateLabel || 'Postulado')}
                            {application?.appliedAt ? fila('Fecha de postulación', fmtDateTime(application.appliedAt)) : null}
                        </>
                    )}
                </div>

                {/* El pago */}
                <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Pago</p>
                    {pago.coveredBy && confirmado ? (
                        <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                            Este proyecto quedó pagado con la inscripción conjunta <strong>{pago.coveredBy.publicRef || ''}</strong>.
                        </p>
                    ) : null}
                    {charge ? (
                        <>
                            {proyectos
                                ? proyectos.map(p => fila(<>{p.label}<span className="block text-xs font-normal text-slate-400">{p.projectName}</span></>, fmtMoney(p.amount, moneda)))
                                : fila(confirmado ? 'Valor de inscripción' : (variosProyectos ? `Valor de inscripción · ${charge.projects?.[0]?.label || 'proyecto'}` : 'Valor de inscripción'), fmtMoney(charge.base, moneda))}
                            {proyectos ? fila('Subtotal de inscripción', fmtMoney(charge.base, moneda)) : null}
                            {charge.lines.map(l => (
                                <div key={l.key}>
                                    {fila(<>{l.label}{l.percent !== null ? <span className="font-normal text-slate-400"> ({fmtPercent(l.percent)})</span> : null}</>, fmtMoney(l.amount, moneda))}
                                </div>
                            ))}
                            {fila(confirmado ? 'Total pagado' : 'Total a pagar', <span style={{ color: BLUE }}>{fmtMoney(charge.total, moneda)}</span>)}
                            {!confirmado && charge.approxUsd ? fila('Equivalente aproximado', `≈ $${charge.approxUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`) : null}
                        </>
                    ) : (
                        fila('Valor de inscripción', fmtMoney(pago.priceMode === 'USD' ? pago.amountUsd : pago.amountCop, pago.priceMode))
                    )}
                    {fila('Estado del pago', pago.statusLabel || pago.label)}
                    {pago.deadline && !confirmado ? fila('Fecha límite de pago', fmtDate(pago.deadline)) : null}
                    {confirmado && pago.paidAt ? fila('Fecha de pago', fmtDateTime(pago.paidAt)) : null}
                    {confirmado && pago.transaction?.reference ? fila('Transacción', <span className="font-mono text-xs">…{pago.transaction.reference}</span>) : null}
                    {confirmado && pago.transaction?.method ? fila('Medio de pago', pago.transaction.method) : null}
                    {pago.transaction?.refundedAmount ? fila('Reembolsado', fmtMoney(pago.transaction.refundedAmount, pago.transaction.currency)) : null}
                    {!confirmado && charge && charge.lines.length > 0 && (
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                            Los cargos cubren la comisión de la pasarela de pagos y el traslado interbancario a la
                            organización. El total es exactamente lo que verás en la pasarela de Stripe.
                        </p>
                    )}
                </div>
            </div>

            {/* v4.1299 — PAGOS REALIZADOS: qué transacción cubrió qué proyectos.
                Aparece cuando la inscripción tiene más de un proyecto o más de
                un cobro (p. ej. el primero pagado y el segundo complementario). */}
            {pagosHechos.length > 0 && (variosProyectos || pagosHechos.length > 1) && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Pagos realizados</p>
                    <ul className="space-y-2 text-sm">
                        {pagosHechos.map(o => (
                            <li key={o.anchorId} className="flex flex-wrap items-start justify-between gap-2">
                                <span className="text-slate-700">
                                    <span className="font-semibold">{o.projects.map(p => `${p.indexLabel}: ${p.projectName}`).join(' · ')}</span>
                                    <span className="block text-xs text-slate-500">
                                        {o.paidAt ? fmtDateTime(o.paidAt) : ''}{o.origin === 'manual_admin' ? ' · confirmado por el comité' : ''}
                                    </span>
                                </span>
                                <span className="font-semibold text-emerald-700">{o.amount != null ? fmtMoney(o.amount, o.currency) : 'Pagado'}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* El historial de intentos, sin el mensaje del proveedor. */}
            {intentos.length > 0 && (
                <details className="mt-4 text-sm text-slate-700">
                    <summary className="cursor-pointer font-semibold">Historial de pagos ({intentos.length})</summary>
                    <ul className="mt-2 space-y-1">
                        {intentos.map(a => (
                            <li key={a.n} className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-semibold">Intento {a.n}</span>
                                <span>· {a.label}</span>
                                {a.reason && <span className="text-slate-500">· {a.reason}</span>}
                                {a.at && <span className="text-xs text-slate-400">{fmtDateTime(a.at)}</span>}
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
                {/* ⚠️ El botón de pago existe SÓLO si el servidor dice que se
                    puede pagar. Con el pago confirmado no hay botón activo. */}
                {pago?.canPay ? (
                    <button
                        onClick={onPay}
                        disabled={paying}
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white transition disabled:opacity-60"
                        style={{ backgroundColor: BLUE }}
                    >
                        {paying ? <><Loader2 size={16} className="animate-spin" /> Abriendo el pago…</> : <>{pago.actionLabel || 'Pagar inscripción'} <ArrowRight size={16} /></>}
                    </button>
                ) : confirmado ? (
                    <>
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700">
                            <CheckCircle2 size={16} /> Pago confirmado
                        </span>
                        <button onClick={onReceipt}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                            <Download size={15} /> Descargar comprobante
                        </button>
                        {pago.receiptUrl && (
                            <a href={pago.receiptUrl} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                <Receipt size={15} /> Consultar la transacción en Stripe <ExternalLink size={13} />
                            </a>
                        )}
                    </>
                ) : null}
            </div>

            {/* Se dice que se está comprobando en vez de dejar la pantalla
                quieta: quien acaba de pagar y ve «Pendiente» concluye que su
                dinero se perdió. */}
            {esperando && (
                <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-800">
                    <Loader2 size={13} className="animate-spin" /> Comprobando con la pasarela si tu pago ya se confirmó…
                </p>
            )}
        </section>
    );
};

/**
 * «Mis proyectos postulados» (v4.1299): el selector de proyecto dentro del
 * encabezado. Cada pestaña dice su posición, su nombre y sus dos estados.
 */
const ProjectSwitcher = ({ projects, onSwitch }: { projects: RegistrationProject[]; onSwitch: (p: RegistrationProject) => void }) => (
    <div className="mx-auto mt-5 max-w-5xl">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70"><Layers size={12} /> Mis proyectos postulados</p>
        <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Proyectos de la inscripción">
            {projects.map(p => (
                <button
                    key={p.id} type="button" role="tab" aria-selected={p.current}
                    onClick={() => onSwitch(p)}
                    className={`rounded-xl border p-3 text-left transition ${p.current ? 'border-white bg-white text-slate-900 shadow-sm' : 'border-white/30 bg-white/10 text-white hover:bg-white/20'}`}
                >
                    <span className={`block text-[11px] font-bold uppercase tracking-wide ${p.current ? 'text-slate-500' : 'text-white/70'}`}>
                        Proyecto {p.projectIndex} — {p.projectIndex === 1 ? 'Inscripción principal' : 'Inscripción adicional'} · {p.publicRef}
                    </span>
                    <span className="mt-0.5 block truncate text-[15px] font-bold">{p.projectName || 'Sin nombre'}</span>
                    <span className={`mt-1 block text-xs ${p.current ? 'text-slate-500' : 'text-white/80'}`}>
                        {p.projectStateLabel} · Pago {String(p.paymentStatusLabel || '').toLowerCase()}
                    </span>
                </button>
            ))}
        </div>
    </div>
);

/**
 * El segundo proyecto de la inscripción (v4.1299): agregarlo, quitarlo antes
 * de pagar o restaurarlo. Con uno solo y la convocatoria abierta, ofrece
 * agregarlo con la tarifa especial y el total resultante; con dos, permite
 * quitar el adicional mientras no esté pagado.
 */
const SecondProjectCard = ({ registration, focusAreas, onAdd, onWithdraw, onRestore, onSwitch }: {
    registration: RegistrationState; focusAreas: { key: string; label: string }[];
    onAdd: (body: any) => Promise<any>; onWithdraw: (id: string) => Promise<any>; onRestore: (id: string) => Promise<any>;
    onSwitch: (p: RegistrationProject) => void;
}) => {
    const [open, setOpen] = useState(false);
    const [fields, setFields] = useState({ projectName: '', projectDescription: '', focusArea: '', budgetUsd: '' });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<'apply' | 'draft' | 'withdraw' | 'restore' | null>(null);
    const sp = registration.secondProject;
    const activos = registration.projects.filter(p => p.active);
    const adicional = activos.find(p => p.projectIndex >= 2) || null;
    const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setFields(prev => ({ ...prev, [k]: e.target.value }));
    const err = (k: string) => errors[k] ? <p className="mt-1 text-xs font-semibold text-red-600">{errors[k]}</p> : null;

    const add = async (mode: 'apply' | 'draft') => {
        if (busy) return;
        setBusy(mode); setErrors({});
        try {
            const resp = await onAdd({ ...fields, budgetUsd: fields.budgetUsd.replace(/[^\d.]/g, ''), mode });
            if (resp) { setOpen(false); setFields({ projectName: '', projectDescription: '', focusArea: '', budgetUsd: '' }); }
        } catch (e: any) {
            if (e?.fields) setErrors(e.fields);
        } finally { setBusy(null); }
    };
    const quitar = async () => {
        if (!adicional || busy) return;
        const ok = window.confirm(`Vas a quitar «${adicional.projectName}» de tu inscripción. Su información se conserva y podrás restaurarlo mientras la convocatoria lo permita. El total de tu inscripción vuelve a ${fmtMoney(sp.firstAmount, registration.currency)}. ¿Continuar?`);
        if (!ok) return;
        setBusy('withdraw');
        try { await onWithdraw(adicional.id); } catch { /* el aviso ya se mostró */ } finally { setBusy(null); }
    };
    const restaurar = async () => {
        if (!sp.restoreId || busy) return;
        setBusy('restore');
        try { await onRestore(sp.restoreId); } catch { /* el aviso ya se mostró */ } finally { setBusy(null); }
    };

    // Con dos proyectos activos: la opción de quitar el adicional, si procede.
    if (adicional) {
        if (!adicional.removable) return null;
        return (
            <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-sm text-slate-600">
                    Tu inscripción incluye <strong>dos proyectos</strong>. Mientras el segundo no esté pagado puedes quitarlo: su información se conserva.
                </p>
                <div className="flex flex-wrap gap-2">
                    {!adicional.current && (
                        <button type="button" onClick={() => onSwitch(adicional)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                            Ir al Proyecto {adicional.projectIndex} <ArrowRight size={14} />
                        </button>
                    )}
                    <button type="button" onClick={quitar} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
                        {busy === 'withdraw' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Quitar el segundo proyecto
                    </button>
                </div>
            </section>
        );
    }

    if (sp.canRestore && sp.restoreId) {
        return (
            <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4">
                <p className="text-sm text-amber-900">
                    Quitaste tu segundo proyecto de la inscripción. Su información sigue guardada: puedes restaurarlo por <strong>{fmtMoney(sp.amount, registration.currency)}</strong> adicionales.
                </p>
                <button type="button" onClick={restaurar} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>
                    {busy === 'restore' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Restaurar el segundo proyecto
                </button>
            </section>
        );
    }

    if (!sp.enabled) return null;
    if (!sp.canAdd) {
        return sp.reason && sp.code !== 'max_reached' ? (
            <p className="mb-6 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{sp.reason}</p>
        ) : null;
    }

    const primerPagado = activos.some(p => p.projectIndex === 1 && p.paymentStatus === 'paid');
    return (
        <section className="mb-6 rounded-2xl border-2 bg-white p-5 sm:p-6" style={{ borderColor: `${BLUE}33` }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                        <PlusCircle size={18} style={{ color: BLUE }} /> Postula un segundo proyecto con tarifa especial
                    </h2>
                    <p className="mt-1 text-[15px] text-slate-600">
                        Tu club puede inscribir un segundo proyecto por <strong>{fmtMoney(sp.amount, registration.currency)}</strong> adicionales
                        {primerPagado
                            ? '. Como la inscripción del primero ya está pagada, se abre un pago complementario sólo por ese valor; tu transacción anterior no se modifica.'
                            : <> (total de la inscripción: <strong>{fmtMoney(sp.bundleTotal, registration.currency)}</strong>, en un solo pago).</>}
                        {sp.deadline ? <> Plazo para agregarlo: {fmtDate(sp.deadline)}.</> : null}
                    </p>
                </div>
                {!open && (
                    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: BLUE }}>
                        Agregar segundo proyecto <ArrowRight size={14} />
                    </button>
                )}
            </div>
            {open && (
                <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4">
                    <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Proyecto 2 — Inscripción adicional · {fmtMoney(sp.amount, registration.currency)}</p>
                    <label className="block text-sm font-semibold text-slate-700">Nombre del proyecto
                        <input className={`${inputCls(false, !!errors.projectName)} mt-1 w-full`} value={fields.projectName} onChange={set('projectName')} maxLength={250} />
                        {err('projectName')}
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">Descripción del proyecto
                        <textarea className={`${inputCls(false, !!errors.projectDescription)} mt-1 min-h-[120px] w-full`} value={fields.projectDescription} onChange={set('projectDescription')} maxLength={8000} />
                        <span className="mt-1 block text-xs font-normal text-slate-400">Mínimo 40 caracteres para postularlo ({fields.projectDescription.trim().length}).</span>
                        {err('projectDescription')}
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-semibold text-slate-700">Área de enfoque
                            <select className={`${inputCls(false, !!errors.focusArea)} mt-1 w-full`} value={fields.focusArea} onChange={set('focusArea')}>
                                <option value="">Selecciona…</option>
                                {focusAreas.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                            </select>
                            {err('focusArea')}
                        </label>
                        <label className="block text-sm font-semibold text-slate-700">Presupuesto total (USD)
                            <input className={`${inputCls(false, !!errors.budgetUsd)} mt-1 w-full`} inputMode="decimal" value={fields.budgetUsd} onChange={set('budgetUsd')} />
                            {err('budgetUsd')}
                        </label>
                    </div>
                    <p className="text-xs text-slate-500">
                        El club, el distrito y el responsable son los de tu inscripción; la información técnica y los documentos de este proyecto serán independientes del primero.
                    </p>
                    <div className="flex flex-wrap justify-end gap-3">
                        <button type="button" onClick={() => setOpen(false)} disabled={!!busy} className="rounded-xl px-4 py-3 text-[15px] font-semibold text-slate-500 hover:text-slate-800">Cancelar</button>
                        <button type="button" onClick={() => add('draft')} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-5 py-3 text-[15px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                            {busy === 'draft' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar como borrador
                        </button>
                        <button type="button" onClick={() => add('apply')} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-xl px-6 py-3 text-[15px] font-bold text-white disabled:opacity-60" style={{ backgroundColor: BLUE }}>
                            {busy === 'apply' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Postular segundo proyecto
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
};

/**
 * El borrador de la postulación (v4.1253): los datos del PROYECTO se
 * terminan acá y se envían con «Enviar postulación». La identidad del club ya
 * quedó registrada al crear la cuenta. Enviar no exige pagar.
 */
const DraftEditor = ({ token, application, focusAreas, onChange, onNotice }: {
    token: string; application: ApplicationState; focusAreas: { key: string; label: string }[];
    onChange: () => void; onNotice: (n: { kind: 'ok' | 'error'; text: string } | null) => void;
}) => {
    const [fields, setFields] = useState(() => ({
        projectName: application.fields.projectName || '',
        projectDescription: application.fields.projectDescription || '',
        focusArea: application.fields.focusArea || '',
        budgetUsd: application.fields.budgetUsd ? String(application.fields.budgetUsd) : '',
    }));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
    const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setFields(prev => ({ ...prev, [k]: e.target.value }));

    const send = async (action: 'save' | 'submit') => {
        if (busy) return;
        setBusy(action);
        setErrors({});
        onNotice(null);
        try {
            const res = await fetch(`${API}/project-fair/portal/application${action === 'submit' ? '/submit' : ''}`, {
                method: action === 'submit' ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...fields, budgetUsd: fields.budgetUsd.replace(/[^\d.]/g, '') }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (body?.fields) setErrors(body.fields);
                throw new Error(body?.error || 'No pudimos guardar tu postulación.');
            }
            onNotice({
                kind: 'ok',
                text: action === 'submit'
                    ? '¡Tu proyecto ha sido postulado exitosamente! Te enviamos la confirmación por correo. El pago de la inscripción queda pendiente y puedes hacerlo cuando estés listo.'
                    : 'Guardamos tu borrador. Puedes volver cuando quieras para terminarlo.',
            });
            onChange();
        } catch (e: any) {
            onNotice({ kind: 'error', text: e?.message || 'No pudimos guardar tu postulación.' });
        } finally {
            setBusy(null);
        }
    };

    const err = (k: string) => errors[k] ? <p className="mt-1 text-xs font-semibold text-red-600">{errors[k]}</p> : null;
    return (
        <section className="mb-6 rounded-2xl border-2 border-amber-200 bg-white p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <PenLine size={18} className="text-amber-600" /> Tu postulación está en borrador
            </h2>
            <p className="mt-1 text-[15px] text-slate-600">
                Completa los datos del proyecto y pulsa <strong>«Enviar postulación»</strong>. Enviarla no requiere pagar:
                el pago de la inscripción se hace después, desde esta misma página.
            </p>
            <div className="mt-4 grid gap-4">
                <label className="block text-sm font-semibold text-slate-700">Nombre del proyecto
                    <input className={`${inputCls(false, !!errors.projectName)} mt-1 w-full`} value={fields.projectName} onChange={set('projectName')} maxLength={250} />
                    {err('projectName')}
                </label>
                <label className="block text-sm font-semibold text-slate-700">Descripción del proyecto
                    <textarea className={`${inputCls(false, !!errors.projectDescription)} mt-1 min-h-[120px] w-full`} value={fields.projectDescription} onChange={set('projectDescription')} maxLength={8000} />
                    <span className="mt-1 block text-xs font-normal text-slate-400">Mínimo 40 caracteres para enviarla ({fields.projectDescription.trim().length}).</span>
                    {err('projectDescription')}
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-slate-700">Área de enfoque
                        <select className={`${inputCls(false, !!errors.focusArea)} mt-1 w-full`} value={fields.focusArea} onChange={set('focusArea')}>
                            <option value="">Selecciona…</option>
                            {focusAreas.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                        </select>
                        {err('focusArea')}
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">Presupuesto total (USD)
                        <input className={`${inputCls(false, !!errors.budgetUsd)} mt-1 w-full`} inputMode="decimal" value={fields.budgetUsd} onChange={set('budgetUsd')} />
                        {err('budgetUsd')}
                    </label>
                </div>
            </div>
            {!application.acceptingApplications && (
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    La convocatoria no está recibiendo postulaciones en este momento. Tu borrador sigue guardado.
                </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button onClick={() => send('save')} disabled={!!busy}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-5 py-3 text-[15px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                    {busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar borrador
                </button>
                <button onClick={() => send('submit')} disabled={!!busy || !application.acceptingApplications}
                    className="inline-flex items-center gap-1.5 rounded-xl px-6 py-3 text-[15px] font-bold text-white disabled:opacity-60"
                    style={{ backgroundColor: BLUE }}>
                    {busy === 'submit' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar postulación
                </button>
            </div>
        </section>
    );
};

// ── Tarjeta de un formulario ─────────────────────────────────────────
// Todas las tarjetas se ven y se comportan igual: la Formulación no es un
// caso especial. Lo único que cambia entre una y otra es lo que el servidor
// manda en la tarjeta.
const ACTION_LABEL: Record<FormState, string> = {
    not_started: 'Diligenciar',
    in_progress: 'Continuar',
    completed: 'Revisar y enviar',
    submitted: 'Ver o editar',
    in_review: 'Ver formulario',
    approved: 'Ver formulario',
    rejected: 'Corregir y reenviar',
};

/**
 * La feria a la que postula el proyecto, dentro del encabezado.
 *
 * QUÉ LLEVA Y POR QUÉ. El nombre de la edición ancla todo lo demás; la sede y
 * las fechas son lo que el gestor necesita para organizarse y hasta ahora no
 * aparecían en ninguna parte del panel; y el enlace a la ficha lleva al
 * programa, la sede y la agenda, que ya están publicados y no hay que repetir
 * aquí. Deliberadamente NO lleva el monto pagado ni el estado del pago: los dos
 * ya tienen su tarjeta abajo, y repetirlos en el encabezado los convertiría en
 * el titular de una pantalla que trata de otra cosa.
 */
const EventStrip = ({ event, edition }: { event: PortalData['event']; edition: PortalData['edition'] }) => {
    const titulo = event?.title || edition?.name || '';
    const lugar = event?.location || [edition?.city, edition?.country].filter(Boolean).join(', ');
    const fechas = fmtEventDates(event?.startDate, event?.endDate);
    if (!titulo && !lugar && !fechas) return null;

    return (
        <div className="mx-auto mt-5 max-w-5xl border-t border-white/15 pt-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
                {titulo && (
                    <span className="flex items-center gap-1.5 font-semibold text-white">
                        <Trophy size={14} className="shrink-0 opacity-80" /> {titulo}
                    </span>
                )}
                {lugar && <span className="flex items-center gap-1.5"><MapPin size={14} className="shrink-0 opacity-70" /> {lugar}</span>}
                {fechas && <span className="flex items-center gap-1.5"><CalendarDays size={14} className="shrink-0 opacity-70" /> {fechas}</span>}
                {event?.url && (
                    <a href={event.url} className="flex items-center gap-1.5 font-semibold underline decoration-white/40 underline-offset-4 hover:decoration-white">
                        Ver el evento <ExternalLink size={13} className="shrink-0" />
                    </a>
                )}
            </div>
        </div>
    );
};

const FormCardTile = ({ form, onOpen }: { form: FormCard; onOpen: () => void }) => {
    const meta = FORM_STATE_META[form.state] || FORM_STATE_META.not_started;
    const done = ['submitted', 'in_review', 'approved'].includes(form.state);
    // ADITIVO: ausente —un servidor anterior a v4.979— se comporta como antes.
    // Con `false`, la tarjeta deja de ser un enlace: el formulario no se puede
    // abrir todavía y un botón que no lleva a ninguna parte es peor que
    // ninguno (v4.650). El motivo sigue abajo, con su candado.
    const abrible = form.available !== false;

    // Sin acción no es un `button`: un control desactivado que igual se puede
    // enfocar con el tabulador anuncia algo que no va a pasar.
    const Marco: any = abrible ? 'button' : 'div';

    return (
        <Marco
            {...(abrible ? { onClick: onOpen } : { 'aria-disabled': true })}
            className={`group flex h-full flex-col rounded-2xl border p-5 text-left shadow-sm transition ${
                abrible
                    ? 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'
                    : 'border-slate-200 bg-slate-50/70'
            }`}>
            <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${BLUE}12`, color: BLUE }}>
                    {form.icon === 'wallet' ? <Wallet size={19} /> : <FileText size={19} />}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                </span>
            </div>

            <h3 className="mt-3 text-[17px] font-bold leading-snug text-slate-900">{form.title}</h3>
            {form.subtitle && <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">{form.subtitle}</p>}
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-slate-500">{form.intro}</p>

            <div className="mt-4 flex items-center gap-2.5">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full transition-all"
                        style={{ width: `${form.completionPct}%`, background: done ? '#10B981' : BLUE }} />
                </div>
                <span className="text-xs font-bold text-slate-600">{form.completionPct}%</span>
            </div>

            <p className="mt-2 text-[12px] text-slate-400">
                {form.submittedAt ? `Enviado el ${fmtDateTime(form.submittedAt)}`
                    : form.lastEditedAt ? `Editado el ${fmtDateTime(form.lastEditedAt)}`
                    : `${form.sections} secciones por diligenciar`}
            </p>

            {form.reviewNote && (
                <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-[12px] text-indigo-900">{form.reviewNote}</p>
            )}
            {!form.canEdit && form.reason && (
                <p className="mt-2 flex items-start gap-1.5 text-[12px] text-amber-700">
                    <Lock size={12} className="mt-0.5 shrink-0" /> {form.reason}
                </p>
            )}

            {abrible ? (
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold group-hover:gap-2.5" style={{ color: BLUE }}>
                    {form.canEdit ? <PenLine size={14} /> : <FileText size={14} />}
                    {form.canEdit ? ACTION_LABEL[form.state] : 'Ver formulario'}
                    <ChevronRight size={15} className="transition-all" />
                </span>
            ) : (
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-400">
                    <Lock size={14} /> Se habilita con el pago
                </span>
            )}
        </Marco>
    );
};

// ── Sin sesión: se manda al formulario único del encabezado ──────────
//
// Esta pantalla NO dibuja su propio formulario de ingreso. Hasta v4.626 tenía
// uno (`PortalAccess`), de modo que el sitio pedía credenciales en dos lugares
// distintos con reglas distintas. Ahora hay un solo acceso —el del ícono del
// encabezado—, que resuelve por sí mismo si esas credenciales son de un
// administrador del sitio o de un Gestor de Proyectos.
const PortalSignIn = ({ notice, hadSession }: { notice: any; hadSession?: boolean }) => {
    // Con sesión abierta y una carga fallida, el problema NO es el ingreso:
    // decirlo evita mandar a escribir otra vez unas credenciales correctas.
    const failed = Boolean(hadSession && notice?.kind === 'error');
    // Se abre solo al llegar: quien entra a /mi-proyecto viene a entrar.
    useEffect(() => {
        if (failed) return;
        openLoginModal({
            next: PROJECT_FAIR_PORTAL_PATH,
            reason: notice?.text || 'Ingresa con el correo y la contraseña que registraste al inscribir tu proyecto.',
        });
        // Sólo al montar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="min-h-screen bg-rotary-concrete">
            <Navbar />
            <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
                <div className="w-full rounded-2xl bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `${BLUE}14` }}>
                        <LayoutDashboard size={22} style={{ color: BLUE }} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-900">Ingresa a tu panel</h1>
                    <p className="mt-1.5 text-sm text-slate-500">
                        {failed ? notice.text : 'Con el correo y la contraseña que registraste al inscribir tu proyecto.'}
                    </p>

                    {notice?.text && (
                        <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] ${
                            notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                            {notice.kind === 'ok' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
                            <span>{notice.text}</span>
                        </div>
                    )}

                    <button
                        onClick={() => openLoginModal({ next: PROJECT_FAIR_PORTAL_PATH })}
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white transition hover:opacity-90"
                        style={{ background: BLUE }}>
                        Iniciar sesión <ArrowRight size={16} />
                    </button>

                    <button
                        onClick={() => openLoginModal({ mode: 'forgot', next: PROJECT_FAIR_PORTAL_PATH })}
                        className="mt-3 text-[13px] font-semibold text-slate-500 hover:text-slate-800">
                        Olvidé mi contraseña
                    </button>

                    <p className="mt-6 border-t border-slate-100 pt-4 text-[13px] text-slate-500">
                        ¿Todavía no inscribes tu proyecto?{' '}
                        <a href="/postular-proyecto" className="font-semibold" style={{ color: BLUE }}>Postúlalo aquí</a>
                    </p>
                </div>
            </div>
            <Footer />
        </div>
    );
};

// ── Crear una contraseña nueva (enlace del correo) ───────────────────
// Esto sí vive aquí: el enlace de recuperación aterriza en /mi-proyecto?reset=…
// y crear una contraseña no es un segundo formulario de ingreso.
const PortalReset = ({ token, onToken }: { token: string; onToken: (t: string) => void }) => {
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    const submit = async () => {
        setBusy(true); setMsg(null);
        try {
            const res = await fetch(`${API}/project-fair/portal/reset`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No pudimos guardar la contraseña.');
            // El servidor devuelve ya la sesión: se entra sin volver a escribirla.
            if (data.token) {
                window.history.replaceState(null, '', window.location.pathname);
                onToken(data.token);
            }
        } catch (e: any) {
            setMsg({ kind: 'error', text: e?.message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-rotary-concrete">
            <Navbar />
            <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
                <div className="w-full rounded-2xl bg-white p-8 shadow-sm">
                    <div className="mb-6 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `${BLUE}14` }}>
                            <KeyRound size={22} style={{ color: BLUE }} />
                        </div>
                        <h1 className="text-xl font-bold text-slate-900">Crea una contraseña nueva</h1>
                        <p className="mt-1.5 text-sm text-slate-500">Escribe la contraseña con la que entrarás de ahora en adelante.</p>
                    </div>

                    {msg && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
                            <AlertCircle size={15} className="mt-0.5 shrink-0" />
                            <span>{msg.text}</span>
                        </div>
                    )}

                    <label className="block">
                        <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><KeyRound size={14} className="text-slate-400" /> Contraseña</span>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls(false)}
                            onKeyDown={e => e.key === 'Enter' && submit()} />
                    </label>

                    <button
                        disabled={busy}
                        onClick={submit}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                        style={{ background: BLUE }}>
                        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                        Guardar contraseña
                    </button>
                </div>
            </div>
            <Footer />
        </div>
    );
};

export default MiProyecto;
