// ════════════════════════════════════════════════════════════════════
// Completar inscripción a un evento — formulario público — v4.943.0
//
// Cuatro pasos para quienes YA se inscribieron y pagaron POR FUERA de la
// página (transferencia bancaria u otro canal) y les falta entregar su
// información: datos del participante, cargo en el club, información para el
// evento y método de pago con su comprobante. NO cobra nada: el registro nace
// «Pendiente de validación» y el Equipo de Registro confirma después.
//
// La página se monta en la URL pública configurada por evento —la XIII
// Conferencia vive en /inscripcion-conferencia-distrital-villavicencio-2027—
// y deriva el slug de su propia ruta: agregar el formulario de otro evento es
// configurar su slug en la pestaña «Inscripciones completadas» y declarar su
// <Route> en App.tsx con este MISMO componente.
//
// v4.1267 — «Crea tu acceso al evento». Al final del paso 1 el participante
// crea su contraseña (o entra con la cuenta que ya tiene) y después consulta
// su inscripción en «Mis eventos» (`/mi-inscripcion`). La cuenta es la del
// Asistente al Evento de siempre: el ingreso, la recuperación y el panel son
// los del sitio, no unos nuevos. Crear la cuenta NO confirma la inscripción.
// El progreso se guarda en este navegador (sin la contraseña) para que entrar
// o recuperar la clave no obligue a empezar de cero.
//
// v4.1268 — Guía de pago del paso 4. Al elegir «Pasarela de pagos de
// COLROTARIOS» se despliega una tarjeta con los pasos para aportar en AvalPay
// (en una pestaña NUEVA) y volver a adjuntar el comprobante. Es una guía: no
// registra ni confirma ningún pago. Proveedor, enlace y concepto los configura
// el panel por evento. Volver de pagar —aunque el móvil haya recargado la
// pestaña— retoma el mismo paso, con el método y el comprobante.
//
// Se compone con las MISMAS piezas de los formularios públicos del sitio
// (`Field`, `PhoneField`, `StepProgress`): nada de diseño paralelo. El
// comprobante sube DIRECTO a S3 con URL prefirmada — el cuerpo de una función
// se corta en ~4,5 MB y el archivo admite 10.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, ArrowRight, Building2, CalendarDays, Check, CheckCircle2,
    Circle, ClipboardList, Clock, CreditCard, ExternalLink, FileText, Globe, HeartPulse, IdCard, Info, KeyRound,
    LayoutDashboard, Loader2, LogIn, Mail, MapPin,
    Paperclip, ShieldCheck, Trash2, User, UserCheck, Users, Utensils,
} from 'lucide-react';
import { openLoginModal, onLoginSuccess, emitLoginSuccess } from '../lib/loginModal';
import { emitSessionChange, TOKEN_KEY } from '../lib/siteSession';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useLang } from '../contexts/LanguageContext';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
import { Field, PhoneField, StepProgress } from '../components/forms/FairField';
import { CLUB_NOT_LISTED } from '../lib/eventRegistrationSpec';
import {
    type CompletedField, type CompletedStep, type CompletedCatalogs,
    completedOptionsFor, isCompletedFieldVisible, isCompletedFieldRequired,
    validateCompletedStep, checkReceiptFile, RECEIPT_ACCEPT,
    validateAccessPassword, accessPasswordChecks, type AccountMode,
} from '../lib/completedRegistrationSpec';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const BLUE = '#17458F';

interface PublicConfig {
    enabled: boolean;
    event: { id: string; slug: string | null; title: string; startDate: string | null; endDate: string | null; location: string | null };
    form: { title: string; intro: string; headerImageUrl: string; rolePeriod: string; steps: CompletedStep[] };
    receipt: { maxBytes: number; extensions: string[] };
    catalogs: CompletedCatalogs;
    successMessage: string;
    /** v4.1267 — La cuenta del participante. Un servidor anterior no la manda. */
    access?: { mode: AccountMode };
    identity?: { realm: string; email: string; name: string | null; roleLabel: string | null } | null;
    prefill?: Record<string, string>;
    /** v4.1268 — La guía de pago externo del paso 4; `null` si no aplica. */
    paymentGuide?: PaymentGuide | null;
}

interface PaymentGuide {
    /** La opción de «método de pago» que la despliega. */
    method: string;
    providerName: string;
    url: string;
    concept: string;
    title: string;
    intro: string;
    buttonLabel: string;
    warning: string;
    receiptHint: string;
    steps: { key: string; icon: string; title: string; text: string }[];
}

interface SubmitResult {
    id: string;
    registrationCode: string | null;
    status: string;
    email: string;
    firstName: string;
    successMessage?: string;
    repeated?: boolean;
    hasAccount?: boolean;
    session?: { token?: string } | null;
}

/**
 * La sesión que se le presenta al servidor, en este orden: la del propio
 * asistente, la del panel del club y la de la plataforma. El servidor la
 * verifica (firma + audiencia); aquí sólo se elige cuál mandar.
 */
const IDENTITY_KEYS = [TOKEN_KEY.attendee, TOKEN_KEY.portal, TOKEN_KEY.platform];
const currentIdentityToken = (): string => {
    for (const key of IDENTITY_KEYS) {
        try {
            const value = localStorage.getItem(key);
            if (value) return value;
        } catch { /* almacenamiento bloqueado: sin sesión */ }
    }
    return '';
};

/** El borrador de este navegador. NUNCA lleva la contraseña. */
interface Draft {
    answers: Record<string, any>;
    clubNotListed: boolean;
    receipt: ReceiptState;
    submissionKey: string;
    /** v4.1268 — El paso en el que iba: volver de pagar retoma ese paso. */
    stepIndex: number;
    /** Escribió una contraseña en el paso 1. La contraseña NO se guarda. */
    wantsAccount: boolean;
}
const draftKey = (slug: string) => `completar-inscripcion:${slug}`;
const newSubmissionKey = () => {
    try { return crypto.randomUUID(); }
    catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
};
const readDraft = (slug: string): Draft | null => {
    try {
        const raw = localStorage.getItem(draftKey(slug));
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || typeof d !== 'object' || typeof d.answers !== 'object') return null;
        return {
            answers: d.answers || {},
            clubNotListed: d.clubNotListed === true,
            // Sólo un comprobante YA subido sobrevive; uno a medio subir no.
            receipt: d.receipt?.status === 'ready' ? d.receipt : { status: 'idle' },
            submissionKey: typeof d.submissionKey === 'string' && d.submissionKey ? d.submissionKey : newSubmissionKey(),
            stepIndex: Math.max(0, Math.floor(Number(d.stepIndex) || 0)),
            wantsAccount: d.wantsAccount === true,
        };
    } catch { return null; }
};

type ReceiptState =
    | { status: 'idle' }
    | { status: 'uploading'; name: string }
    | { status: 'ready'; key: string; name: string; contentType: string; bytes: number }
    | { status: 'error'; message: string };

const FIELD_ICONS: Record<string, any> = {
    firstName: User, lastName: User, documentNumber: IdCard, email: Mail,
    district: MapPin, clubName: Building2, membershipType: Users,
    clubRoleOther: FileText, eps: HeartPulse, foodAllergy: Utensils,
    emergencyName: User, comments: FileText,
};

/** Un campo ocupa el ancho completo cuando su control no cabe en media fila. */
const isWide = (field: CompletedField) =>
    field.type === 'textarea' || field.type === 'radio' || field.type === 'file';

const CompletarInscripcion = () => {
    const location = useLocation();
    const { locale } = useLang();
    // El slug ES la ruta: /inscripcion-conferencia-distrital-villavicencio-2027.
    const slug = location.pathname.replace(/^\/+|\/+$/g, '');

    const [config, setConfig] = useState<PublicConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    // v4.1267 — Se arranca desde el borrador de este navegador, si lo hay:
    // volver después de entrar, de recuperar la clave o de cerrar la pestaña
    // no obliga a empezar de cero.
    const [draft] = useState<Draft | null>(() => readDraft(slug));
    const [answers, setAnswers] = useState<Record<string, any>>(() => draft?.answers || { membershipType: 'socio_activo' });
    // v4.1268 — Un borrador recuperado retoma el paso en el que iba: quien
    // salió a pagar en AvalPay y el móvil le recargó la pestaña vuelve al
    // paso 4 con el método y el comprobante. Si había pedido crear su acceso,
    // la contraseña (que nunca se guarda) se vuelve a pedir al enviar.
    const [stepIndex, setStepIndex] = useState(() => draft?.stepIndex || 0);
    const [wantsAccount, setWantsAccount] = useState(() => draft?.wantsAccount || false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [clubNotListed, setClubNotListed] = useState(() => draft?.clubNotListed || false);
    const [receipt, setReceipt] = useState<ReceiptState>(() => draft?.receipt || { status: 'idle' });
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<SubmitResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    /** Una por formulario: un segundo envío con ella devuelve el mismo registro. */
    const [submissionKey, setSubmissionKey] = useState(() => draft?.submissionKey || newSubmissionKey());

    // ── El acceso al evento (v4.1267) ────────────────────────────────
    // La contraseña vive APARTE de `answers`: no entra en el borrador ni en
    // ningún almacenamiento del navegador, y sólo viaja al servidor.
    const [credentials, setCredentials] = useState({ password: '', passwordConfirm: '' });
    const [credentialErrors, setCredentialErrors] = useState<Record<string, string>>({});
    const [accessState, setAccessState] = useState<
        { kind: 'idle' } | { kind: 'checking' } | { kind: 'exists'; message: string; recover: boolean } | { kind: 'error'; message: string }
    >({ kind: 'idle' });
    const [authTick, setAuthTick] = useState(0);
    useEffect(() => onLoginSuccess(() => setAuthTick(t => t + 1)), []);

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        // UN reintento tras una pausa corta (v4.944): la primera visita después
        // de un despliegue paga el arranque en frío de la función y de la base,
        // y un tropiezo ahí no es un formulario roto. Un solo reintento — un
        // bucle sería peor que el fallo (la lección de v4.791).
        const cargar = async (intento = 0): Promise<void> => {
            try {
                let r: Response;
                try {
                    const identityToken = currentIdentityToken();
                    r = await fetch(`${API}/event-registrations/public/completed/${encodeURIComponent(slug)}`,
                        identityToken ? { headers: { Authorization: `Bearer ${identityToken}` } } : undefined);
                } catch {
                    // La petición no llegó (red, función dormida): eso no es un
                    // rechazo del servidor y merece el mismo único reintento.
                    if (intento === 0) {
                        await new Promise(res => setTimeout(res, 1500));
                        return cargar(1);
                    }
                    throw new Error('No se pudo contactar al servidor. Revisa tu conexión e intenta de nuevo.');
                }
                let data: any = null;
                try { data = await r.json(); } catch { /* respuesta sin JSON: se dice abajo, en español */ }
                if (!r.ok || data?.error) {
                    if (r.status >= 500 && intento === 0) {
                        await new Promise(res => setTimeout(res, 1500));
                        return cargar(1);
                    }
                    // El motivo textual del servidor (`detail`) va a la vista: sin
                    // él, «no se pudo cargar» obliga a diagnosticar a ciegas.
                    const base = data?.error || `No se pudo cargar el formulario (HTTP ${r.status}).`;
                    throw new Error(data?.detail ? `${base} — ${data.detail}` : base);
                }
                if (vivo) setConfig(data);
            } catch (err: any) {
                if (vivo) setError(err?.message || 'No se pudo cargar el formulario.');
            } finally {
                if (vivo) setLoading(false);
            }
        };
        cargar();
        return () => { vivo = false; };
    }, [slug]);

    // v4.1267 — Al entrar con una cuenta (encabezado o el propio formulario),
    // se vuelve a preguntar QUIÉN es, sin recargar ni tocar lo ya escrito.
    useEffect(() => {
        if (!authTick) return;
        const identityToken = currentIdentityToken();
        fetch(`${API}/event-registrations/public/completed/${encodeURIComponent(slug)}`,
            identityToken ? { headers: { Authorization: `Bearer ${identityToken}` } } : undefined)
            .then(r => r.text())
            .then(texto => {
                let data: any = null;
                try { data = JSON.parse(texto); } catch { return; }
                if (!data || data.error) return;
                setConfig(prev => (prev ? { ...prev, identity: data.identity || null, prefill: data.prefill || {} } : prev));
                setAccessState({ kind: 'idle' });
            })
            .catch(() => { /* sin cambios: el envío lo vuelve a resolver el servidor */ });
    }, [authTick, slug]);

    // Precarga con los datos de la cuenta: SÓLO campos vacíos. Lo que la
    // persona ya escribió no se pisa nunca.
    useEffect(() => {
        const prefill = config?.prefill;
        if (!prefill || !Object.keys(prefill).length) return;
        setAnswers(prev => {
            const next = { ...prev };
            let changed = false;
            for (const [key, value] of Object.entries(prefill)) {
                if (value && (next[key] === undefined || next[key] === null || String(next[key]).trim() === '')) {
                    next[key] = value;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [config?.prefill]);

    // El borrador se guarda en cada cambio. Sin contraseña: no está en este
    // estado. Un almacenamiento bloqueado no rompe el formulario.
    useEffect(() => {
        if (result) return;
        try {
            const value: Draft = { answers, clubNotListed, receipt, submissionKey, stepIndex, wantsAccount };
            localStorage.setItem(draftKey(slug), JSON.stringify(value));
        } catch { /* sin borrador: el formulario sigue funcionando */ }
    }, [answers, clubNotListed, receipt, submissionKey, stepIndex, wantsAccount, slug, result]);

    const accountMode: AccountMode = config?.access?.mode || 'off';
    const guide = config?.paymentGuide || null;
    const identity = config?.identity || null;
    const formEmail = String(answers.email || '').trim().toLowerCase();
    /** Entró con su cuenta y el correo del formulario es el suyo. */
    const sessionMatches = Boolean(identity?.email) && identity!.email === formEmail;

    // ⚠️ v4.958 — LOS PASOS VISIBLES, no todos. El esquema declara dos ramas
    // excluyentes (cargo / invitado) y el vínculo con el club decide cuál se
    // recorre. Filtrar acá —y no dentro del render— es lo que mantiene
    // coherentes las CUATRO cosas que leen la lista: el paso actual, el
    // contador «Paso N de M», el botón de Siguiente y el salto al primer paso
    // con error que devuelve el servidor. Con una rama siempre visible, la
    // lista mide 4 desde el primer render y el índice no se corre.
    const steps = useMemo(
        () => (config?.form.steps || []).filter(step => isCompletedFieldVisible(step, answers)),
        [config, answers],
    );
    const currentStep = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))];
    const catalogs = config?.catalogs || {};

    const setAnswer = useCallback((key: string, value: any) => {
        setAnswers(prev => {
            const next = { ...prev, [key]: value };
            // Cambiar de distrito descarta el club elegido: el anterior ya no
            // describe nada. Misma regla que el registro normal (v4.708).
            if (key === 'district' && prev.district !== value) {
                next.clubName = '';
            }
            return next;
        });
        if (key === 'district') setClubNotListed(false);
        setFieldErrors(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    // ── Comprobante: subida directa a S3 ─────────────────────────────
    //
    // Ninguna respuesta se ASUME JSON (v4.946). Se reportó con captura:
    // «Unexpected token '<', "<!DOCTYPE"» — una capa por encima de la API (la
    // página de error de la plataforma en un tropiezo de la invocación, justo
    // tras un despliegue) contestó HTML y `res.json()` reventaba con un
    // mensaje que no le dice nada a nadie. Ahora la respuesta se LEE como
    // texto, se intenta interpretar, y si no es JSON se reintenta UNA vez y
    // después se dice QUÉ contestó el servidor — HTTP, tipo y un fragmento —
    // para que la próxima captura sea un diagnóstico (regla de v4.944).
    const leerJson = async (res: Response): Promise<{ data: any; crudo: string }> => {
        const crudo = await res.text();
        try { return { data: JSON.parse(crudo), crudo }; }
        catch { return { data: null, crudo }; }
    };

    const describirNoJson = (res: Response, crudo: string) => {
        const tipo = res.headers.get('content-type') || 'sin tipo';
        const muestra = crudo.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
        return `El servidor contestó HTTP ${res.status} (${tipo}) en vez de JSON${muestra ? ` — «${muestra}»` : ''}. Intenta de nuevo en unos segundos.`;
    };

    const uploadReceipt = async (file: File) => {
        const problema = checkReceiptFile(file);
        if (problema) {
            setReceipt({ status: 'error', message: problema });
            return;
        }
        setReceipt({ status: 'uploading', name: file.name });
        try {
            const contentType = file.type || 'application/octet-stream';
            const prefirmar = () => fetch(`${API}/event-registrations/public/completed/${encodeURIComponent(slug)}/receipt-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, contentType, size: file.size }),
            });

            let res = await prefirmar();
            let { data, crudo } = await leerJson(res);
            // Un tropiezo de la plataforma (5xx u HTML) merece UN reintento:
            // la primera petición tras un despliegue paga el arranque en frío.
            if (!data || res.status >= 500) {
                await new Promise(r => setTimeout(r, 1500));
                res = await prefirmar();
                ({ data, crudo } = await leerJson(res));
            }
            if (!data) throw new Error(describirNoJson(res, crudo));
            if (!res.ok) {
                const base = data?.error || 'No se pudo preparar la subida.';
                throw new Error(data?.detail ? `${base} — ${data.detail}` : base);
            }

            const put = await fetch(data.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': data.contentType },
                body: file,
            });
            if (!put.ok) throw new Error(`La subida del archivo falló (HTTP ${put.status} del almacenamiento). Intenta de nuevo.`);

            setReceipt({ status: 'ready', key: data.key, name: file.name, contentType, bytes: file.size });
            setFieldErrors(prev => {
                const next = { ...prev };
                delete next.receipt;
                return next;
            });
        } catch (err: any) {
            setReceipt({ status: 'error', message: err?.message || 'No se pudo subir el comprobante.' });
        }
    };

    // ── Navegación entre pasos ───────────────────────────────────────
    const validateCurrentStep = (): boolean => {
        if (!currentStep) return false;
        const errors = validateCompletedStep(currentStep.fields, answers);
        // El comprobante vive fuera de `answers`: se exige en su paso.
        if (currentStep.fields.some(f => f.type === 'file') && receipt.status !== 'ready') {
            errors.receipt = 'Sube el comprobante de pago del aporte.';
        }
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const advance = () => {
        setFieldErrors({});
        setStepIndex(i => Math.min(i + 1, steps.length - 1));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const setCredential = (key: 'password' | 'passwordConfirm', value: string) => {
        setCredentials(prev => ({ ...prev, [key]: value }));
        setCredentialErrors(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
        if (accessState.kind === 'exists' || accessState.kind === 'error') setAccessState({ kind: 'idle' });
    };

    /** Deja abierta la sesión que emitió el servidor (v4.710). */
    const openAttendeeSession = (token?: string | null) => {
        if (!token) return;
        try { localStorage.setItem(TOKEN_KEY.attendee, token); } catch { /* sin almacenamiento */ }
        emitSessionChange();
        emitLoginSuccess({ realm: 'attendee' });
    };

    /**
     * El acceso se resuelve en el PASO 1: así quien ya tiene cuenta se entera
     * antes de llenar los otros tres pasos, y no después de subir el
     * comprobante. El servidor no contesta nada sin contraseña.
     */
    const checkAccessAndAdvance = async () => {
        const errors = validateAccessPassword(credentials.password, credentials.passwordConfirm,
            { allowEmpty: accountMode === 'optional' });
        setCredentialErrors(errors);
        if (Object.keys(errors).length) return;
        if (!credentials.password) { setWantsAccount(false); advance(); return; }

        setAccessState({ kind: 'checking' });
        try {
            const res = await fetch(`${API}/event-registrations/public/completed/${encodeURIComponent(slug)}/access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: answers.email, password: credentials.password }),
            });
            const { data, crudo } = await leerJson(res);
            if (!data) throw new Error(describirNoJson(res, crudo));
            if (!res.ok) throw new Error(data?.error || 'No pudimos comprobar tu cuenta.');
            if (data.status === 'exists') {
                setAccessState({ kind: 'exists', message: data.message, recover: data.recover === true });
                return;
            }
            if (data.status === 'weak') {
                setCredentialErrors(validateAccessPassword(credentials.password, credentials.passwordConfirm));
                setAccessState({ kind: 'idle' });
                return;
            }
            if (data.status === 'signed_in') {
                // Escribió la clave de la cuenta que ya tenía: entró. La
                // identidad se fija ya —el envío no puede depender de que
                // termine la recarga—; la recarga sólo trae la precarga.
                openAttendeeSession(data.session?.token);
                setCredentials({ password: '', passwordConfirm: '' });
                setConfig(prev => (prev ? {
                    ...prev,
                    identity: { realm: 'attendee', email: formEmail, name: null, roleLabel: 'Asistente al Evento' },
                } : prev));
            }
            setWantsAccount(data.status === 'new');
            setAccessState({ kind: 'idle' });
            advance();
        } catch (err: any) {
            setAccessState({ kind: 'error', message: err?.message || 'No pudimos comprobar tu cuenta.' });
        }
    };

    const goNext = () => {
        if (!validateCurrentStep()) return;
        // El bloque de acceso vive al final del PRIMER paso.
        if (stepIndex === 0 && accountMode !== 'off' && !sessionMatches) {
            void checkAccessAndAdvance();
            return;
        }
        advance();
    };

    const loginWithEmail = (mode: 'login' | 'forgot' = 'login') => openLoginModal({
        email: String(answers.email || '').trim(),
        mode,
        next: `${window.location.pathname}${window.location.search}`,
        reason: mode === 'forgot'
            ? 'Te enviaremos un enlace para crear una contraseña nueva. Tu formulario queda guardado en este navegador.'
            : 'Ingresa con tu cuenta de Rotary Distrito 4281 y seguimos con tu inscripción, sin perder lo que ya escribiste.',
    });
    const goBack = () => {
        setFieldErrors({});
        setStepIndex(i => Math.max(i - 1, 0));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const submit = async () => {
        if (!validateCurrentStep() || receipt.status !== 'ready') return;
        // La contraseña no se guarda en el navegador: si la pestaña se recargó
        // (p. ej. al volver de pagar) y había pedido crear su acceso, se pide
        // otra vez en vez de enviar sin cuenta en silencio.
        if (wantsAccount && accountMode !== 'off' && !sessionMatches && !credentials.password) {
            setCredentialErrors({ password: 'Por seguridad no guardamos tu contraseña en este navegador: escríbela de nuevo para crear tu acceso.' });
            setStepIndex(0);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const identityToken = sessionMatches ? currentIdentityToken() : '';
            const res = await fetch(`${API}/event-registrations/public/completed/${encodeURIComponent(slug)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(identityToken ? { Authorization: `Bearer ${identityToken}` } : {}),
                },
                body: JSON.stringify({
                    answers,
                    receipt: { key: receipt.key, name: receipt.name, contentType: receipt.contentType },
                    submissionKey,
                    // Sólo si no entró con su cuenta. El servidor guarda el hash.
                    ...(accountMode !== 'off' && !sessionMatches
                        ? { password: credentials.password, passwordConfirm: credentials.passwordConfirm }
                        : {}),
                }),
            });
            const { data, crudo } = await leerJson(res);
            if (!data) throw new Error(describirNoJson(res, crudo));
            if (!res.ok) {
                // v4.1267 — El correo ya tiene cuenta (otra pestaña la creó, o
                // se saltó la comprobación): de vuelta al paso 1, con la salida.
                if (data?.accountExists) {
                    setAccessState({ kind: 'exists', message: data.error, recover: data.recover === true });
                    setStepIndex(0);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                }
                if (data?.fieldErrors?.password || data?.fieldErrors?.passwordConfirm) {
                    const { password, passwordConfirm } = data.fieldErrors;
                    setCredentialErrors({ ...(password ? { password } : {}), ...(passwordConfirm ? { passwordConfirm } : {}) });
                    setStepIndex(0);
                }
                if (data?.fieldErrors) {
                    setFieldErrors(data.fieldErrors);
                    // Se salta al PRIMER paso con error: corregir a ciegas en el
                    // paso 4 un campo del paso 1 no es corregir.
                    const bad = steps.findIndex(s => s.fields.some(f => data.fieldErrors[f.key]));
                    if (bad >= 0) setStepIndex(bad);
                }
                const base = data?.error || 'No se pudo enviar la información.';
                throw new Error(data?.detail ? `${base} — ${data.detail}` : base);
            }
            setResult(data);
            openAttendeeSession(data?.session?.token);
            setCredentials({ password: '', passwordConfirm: '' });
            // El formulario quedó enviado: el borrador ya no hace falta, y el
            // siguiente formulario de este navegador nace con otra clave.
            try { localStorage.removeItem(draftKey(slug)); } catch { /* nada */ }
            setSubmissionKey(newSubmissionKey());
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err: any) {
            setError(err?.message || 'No se pudo enviar la información.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Un campo del formulario ──────────────────────────────────────
    const renderField = (field: CompletedField) => {
        if (!isCompletedFieldVisible(field, answers)) return null;
        const value = answers[field.key];
        const err = fieldErrors[field.key];
        const invalid = Boolean(err);
        const required = isCompletedFieldRequired(field, answers);
        const common = {
            label: field.label,
            name: field.key,
            value,
            error: err,
            touched: invalid,
            required,
            icon: FIELD_ICONS[field.key],
            hint: field.help,
            placeholder: field.placeholder,
            maxLength: field.max,
        };

        if (field.type === 'tel') {
            return (
                <PhoneField key={field.key} label={field.label} name={field.key} required={required}
                    value={value ?? ''} onChange={v => setAnswer(field.key, v)}
                    error={err} touched={invalid} hint={field.help} />
            );
        }

        if (field.type === 'radio') {
            return (
                <div key={field.key} className="sm:col-span-2">
                    <p className="mb-2 text-sm font-semibold text-slate-700">
                        {field.label} {required && <span className="text-red-500">*</span>}
                    </p>
                    <div className={`space-y-2 rounded-xl border bg-white p-4 ${invalid ? 'border-red-400' : 'border-slate-300'}`}>
                        {(field.options || []).map(o => (
                            <label key={o.value} className="flex cursor-pointer items-start gap-2.5 text-[15px] text-slate-700">
                                <input type="radio" name={field.key} checked={value === o.value}
                                    onChange={() => setAnswer(field.key, o.value)}
                                    className="mt-1 h-4 w-4 shrink-0" />
                                <span>{o.label}</span>
                            </label>
                        ))}
                    </div>
                    {invalid && (
                        <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-red-600">
                            <AlertCircle size={13} /> {err}
                        </p>
                    )}
                    {/* v4.1268 — Debajo de las opciones y antes del comprobante. */}
                    {guide && field.key === 'paymentMethod' && value === guide.method && (
                        <PaymentGuideCard guide={guide} />
                    )}
                </div>
            );
        }

        if (field.type === 'file') {
            return (
                <div key={field.key} className="sm:col-span-2">
                    <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                        <Paperclip size={15} className="text-slate-400" />
                        {field.label} {required && <span className="text-red-500">*</span>}
                    </label>
                    {guide && answers.paymentMethod === guide.method && (
                        <p className="mb-2 flex items-start gap-1.5 text-[13px] font-medium" style={{ color: BLUE }}>
                            <Info size={14} className="mt-0.5 shrink-0" /> {guide.receiptHint}
                        </p>
                    )}
                    <input ref={fileInputRef} type="file" accept={RECEIPT_ACCEPT} className="hidden"
                        onChange={e => {
                            const file = e.target.files?.[0];
                            // Se limpia para que volver a elegir el MISMO
                            // archivo dispare `change` tras un fallo (v4.700).
                            e.target.value = '';
                            if (file) uploadReceipt(file);
                        }} />
                    {receipt.status === 'ready' ? (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
                            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-emerald-800">
                                <CheckCircle2 size={17} className="shrink-0" />
                                <span className="sr-only">Comprobante recibido:</span>
                                <span className="truncate">{receipt.name}</span>
                                <span className="shrink-0 font-normal text-emerald-700/70">
                                    {(receipt.bytes / 1024 / 1024).toFixed(1)} MB
                                </span>
                            </p>
                            <button type="button" onClick={() => setReceipt({ status: 'idle' })}
                                className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-slate-500 hover:text-red-600"
                                aria-label="Quitar el comprobante">
                                <Trash2 size={14} /> Quitar
                            </button>
                        </div>
                    ) : receipt.status === 'uploading' ? (
                        <div className="flex items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-600">
                            <Loader2 size={16} className="animate-spin" style={{ color: BLUE }} />
                            Subiendo {receipt.name}…
                        </div>
                    ) : (
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                            className={`w-full rounded-xl border-2 border-dashed bg-white px-4 py-7 text-center transition hover:border-slate-400 ${
                                invalid || receipt.status === 'error' ? 'border-red-300' : 'border-slate-300'}`}>
                            <Paperclip size={20} className="mx-auto mb-1.5 text-slate-400" />
                            <p className="text-sm font-semibold text-slate-700">Haz clic para cargar tu comprobante</p>
                            <p className="mt-0.5 text-[13px] text-slate-500">{field.help}</p>
                        </button>
                    )}
                    {receipt.status === 'error' && (
                        <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-red-600">
                            <AlertCircle size={13} /> {receipt.message}
                        </p>
                    )}
                    {invalid && receipt.status !== 'error' && (
                        <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-red-600">
                            <AlertCircle size={13} /> {err}
                        </p>
                    )}
                </div>
            );
        }

        // Catálogos distrito → club, con salida manual («Mi club no está en la
        // lista»), igual que el registro normal y la postulación (v4.706).
        const escapable = field.catalog === 'clubs';
        const manual = escapable && clubNotListed;
        const catalogOptions = manual ? null : completedOptionsFor(field, answers, catalogs);

        if (catalogOptions) {
            return (
                <div key={field.key} className={isWide(field) ? 'sm:col-span-2' : undefined}>
                    <Field {...common} as="select"
                        options={escapable
                            ? [...catalogOptions, { value: CLUB_NOT_LISTED, label: 'Mi club no está en la lista' }]
                            : catalogOptions}
                        onChange={(e: any) => {
                            if (escapable && e.target.value === CLUB_NOT_LISTED) {
                                setClubNotListed(true);
                                setAnswer(field.key, '');
                                return;
                            }
                            setAnswer(field.key, e.target.value);
                        }} />
                </div>
            );
        }

        return (
            <div key={field.key} className={isWide(field) ? 'sm:col-span-2' : undefined}>
                {field.type === 'textarea' ? (
                    <Field {...common} as="textarea" rows={4} onChange={(e: any) => setAnswer(field.key, e.target.value)} />
                ) : field.type === 'select' ? (
                    <Field {...common} as="select" options={field.options || []}
                        onChange={(e: any) => setAnswer(field.key, e.target.value)} />
                ) : (
                    <Field {...common} type={field.type === 'email' ? 'email' : 'text'}
                        onChange={(e: any) => setAnswer(field.key, e.target.value)} />
                )}
                {manual && field.key === 'clubName' && (
                    <button type="button" onClick={() => { setClubNotListed(false); setAnswer('clubName', ''); }}
                        className="mt-1.5 text-[13px] font-semibold text-blue-700 hover:underline">
                        Elegir de la lista
                    </button>
                )}
            </div>
        );
    };

    // ── Pantallas ────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-rotary-concrete">
                <Navbar />
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="text-center text-slate-500">
                        <Loader2 className="mx-auto mb-3 animate-spin" size={32} style={{ color: BLUE }} />
                        <p className="text-sm">Cargando el formulario…</p>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    const header = (
        <header style={PAGE_HEADER_BACKGROUND} className="px-4 py-8 text-white sm:px-6 sm:py-10">
            <div className="mx-auto max-w-4xl text-center sm:text-left">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                    Completar inscripción
                </p>
                <h1 className="mt-1.5 text-2xl font-bold leading-tight sm:text-3xl">{config?.event?.title || 'Evento'}</h1>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-white/85 sm:justify-start">
                    {config?.event?.startDate && (
                        <span className="flex items-center gap-1.5">
                            <CalendarDays size={14} />
                            {new Date(config.event.startDate).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                    )}
                    {config?.event?.location && (
                        <span className="flex items-center gap-1.5"><MapPin size={14} /> {config.event.location}</span>
                    )}
                </div>
            </div>
        </header>
    );

    if (!config || error && !config) {
        return (
            <div className="min-h-screen bg-rotary-concrete">
                <Navbar />
                {header}
                <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
                    <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
                        <AlertCircle className="mx-auto mb-4 text-slate-400" size={40} />
                        <h2 className="mb-2 text-2xl font-bold text-slate-900">Formulario no disponible</h2>
                        <p className="text-slate-600">{error || 'Este formulario no existe o ya no está disponible.'}</p>
                    </section>
                </main>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-rotary-concrete">
            <Navbar />
            {header}

            <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
                {error && !result && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" /> <span>{error}</span>
                    </div>
                )}

                {result ? (
                    /* ── Confirmación ─────────────────────────────── */
                    <section className="rounded-2xl bg-white p-7 text-center shadow-sm sm:p-10">
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                            <CheckCircle2 size={38} className="text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">¡Información recibida!</h2>
                        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-slate-600">
                            Gracias por completar los datos de tu inscripción a la{' '}
                            <strong>{config.event.title}</strong>.
                        </p>
                        <p className="mx-auto mt-2 max-w-lg text-[15px] leading-relaxed text-slate-600">
                            Nuestro equipo de Registro validará la información y el comprobante de pago.
                            Recibirás la confirmación oficial por correo electrónico o WhatsApp.
                        </p>
                        <div className="mx-auto mt-6 max-w-sm rounded-xl bg-slate-50 px-5 py-4 text-left">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Código de tu registro
                            </p>
                            <p className="font-mono text-2xl font-bold" data-no-translate style={{ color: BLUE }}>
                                {result.registrationCode}
                            </p>
                            <p className="mt-2 text-sm text-slate-600">
                                Enviamos una copia a <strong data-no-translate>{result.email}</strong>.
                            </p>
                        </div>
                        {result.successMessage && (
                            <p className="mx-auto mt-5 max-w-lg text-sm text-slate-600">{result.successMessage}</p>
                        )}
                        {/* v4.1267 — Dónde consultar la inscripción después. */}
                        {result.hasAccount ? (
                            <div className="mx-auto mt-6 max-w-lg rounded-xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-left">
                                <p className="flex items-center gap-2 text-sm font-bold" style={{ color: BLUE }}>
                                    <ShieldCheck size={16} /> Tu acceso al evento está activo
                                </p>
                                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                                    Consulta el estado de tu inscripción, tu comprobante y su historial en «Mis eventos».
                                    Tener cuenta no confirma la inscripción: la confirma el Equipo de Registro al validar
                                    tu comprobante.
                                </p>
                                <Link to="/mi-inscripcion"
                                    className="mt-3 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                                    style={{ background: BLUE }}>
                                    <LayoutDashboard size={15} /> Ir a Mis eventos
                                </Link>
                            </div>
                        ) : accountMode !== 'off' && (
                            <p className="mx-auto mt-5 max-w-lg text-[13px] leading-relaxed text-slate-500">
                                ¿Quieres consultar tu inscripción más adelante? En{' '}
                                <Link to="/mi-inscripcion" className="font-semibold underline" style={{ color: BLUE }}>Mis eventos</Link>{' '}
                                usa «Olvidé mi contraseña» con este mismo correo: te llegará un enlace para crear tu acceso.
                            </p>
                        )}
                        <p className="mt-5 text-xs text-slate-400">
                            Guarda este código: identifica tu registro ante el Equipo de Registro.
                        </p>
                    </section>
                ) : !config.enabled ? (
                    /* ── Cerrado ──────────────────────────────────── */
                    <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
                        <Clock className="mx-auto mb-4" size={40} style={{ color: BLUE }} />
                        <h2 className="mb-2 text-2xl font-bold text-slate-900">Formulario cerrado</h2>
                        <p className="text-slate-600">
                            En este momento no estamos recibiendo información por este formulario.
                            Escríbenos si necesitas ayuda con tu inscripción.
                        </p>
                    </section>
                ) : (
                    /* ── Los cuatro pasos ─────────────────────────── */
                    <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                        {(config.form.headerImageUrl || config.form.title) && (
                            <div className="mb-7">
                                {config.form.headerImageUrl && (
                                    <img src={config.form.headerImageUrl} alt={config.event.title}
                                        className="mx-auto mb-6 max-h-44 w-auto max-w-full object-contain" />
                                )}
                                <h2 className="text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
                                    {config.form.title}
                                </h2>
                                {config.form.intro && (
                                    <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{config.form.intro}</p>
                                )}
                            </div>
                        )}

                        {currentStep && (
                            <>
                                <StepProgress step={stepIndex + 1} total={steps.length} title={currentStep.label} />
                                <div className="grid gap-5 sm:grid-cols-2">
                                    {currentStep.fields.map(renderField)}
                                    {stepIndex === 0 && accountMode !== 'off' && (
                                        <AccessSection
                                            eventTitle={config.event.title}
                                            mode={accountMode}
                                            identity={identity}
                                            sessionMatches={sessionMatches}
                                            credentials={credentials}
                                            errors={credentialErrors}
                                            state={accessState}
                                            onCredential={setCredential}
                                            onLogin={() => loginWithEmail('login')}
                                            onForgot={() => loginWithEmail('forgot')}
                                            onUseSessionEmail={() => identity && setAnswer('email', identity.email)}
                                        />
                                    )}
                                </div>
                            </>
                        )}

                        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
                            {stepIndex > 0 && (
                                <button type="button" onClick={goBack}
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                                    <ArrowLeft size={15} /> Anterior
                                </button>
                            )}
                            {stepIndex < steps.length - 1 ? (
                                <button type="button" onClick={goNext}
                                    disabled={accessState.kind === 'checking'}
                                    className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                                    style={{ background: BLUE }}>
                                    {accessState.kind === 'checking'
                                        ? <><Loader2 size={15} className="animate-spin" /> Comprobando…</>
                                        : <>Siguiente <ArrowRight size={15} /></>}
                                </button>
                            ) : (
                                <button type="button" onClick={submit}
                                    disabled={submitting || receipt.status === 'uploading'}
                                    className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                                    style={{ background: BLUE }}>
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                    Completar Inscripción
                                </button>
                            )}
                            <p className="ml-auto flex items-center gap-1.5 text-[12px] text-slate-400">
                                <CreditCard size={13} />
                                Este formulario no cobra: registra un pago ya realizado.
                            </p>
                        </div>
                    </section>
                )}
            </main>
            <Footer />
        </div>
    );
};

// ── La guía de pago externo (v4.1268) ────────────────────────────────
//
// Componente de NIVEL SUPERIOR (regla del proyecto). Aparece con una
// transición corta —que se apaga con «reducir movimiento»— y vive mientras el
// método elegido sea el suyo: al cambiar de método se desmonta. El enlace abre
// una pestaña NUEVA (`noopener noreferrer`): el formulario sigue aquí, intacto.

const GUIDE_ICONS: Record<string, any> = { globe: Globe, list: ClipboardList, card: CreditCard, clip: Paperclip };

const PaymentGuideCard = ({ guide }: { guide: PaymentGuide }) => {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, []);

    return (
        <section aria-labelledby="guia-de-pago" aria-live="polite"
            className={`mt-4 rounded-xl border border-blue-200 bg-blue-50/70 p-4 transition-all duration-300 ease-out motion-reduce:transition-none sm:p-5 ${
                shown ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}>
            <p id="guia-de-pago" className="flex items-start gap-2 text-[15px] font-bold" style={{ color: BLUE }}>
                <CreditCard size={18} className="mt-0.5 shrink-0" /> {guide.title}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{guide.intro}</p>

            <ol className="mt-4 space-y-3">
                {guide.steps.map((step, i) => {
                    const Icon = GUIDE_ICONS[step.icon] || Circle;
                    return (
                        <li key={step.key} className="flex gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-bold ring-1 ring-blue-200"
                                style={{ color: BLUE }} aria-hidden="true">
                                {i + 1}
                            </span>
                            <div className="min-w-0">
                                <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                                    <Icon size={14} className="shrink-0 text-slate-400" aria-hidden="true" /> {step.title}
                                </p>
                                <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{step.text}</p>
                            </div>
                        </li>
                    );
                })}
            </ol>

            <a href={guide.url} target="_blank" rel="noopener noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 sm:w-auto sm:inline-flex"
                style={{ background: BLUE }}>
                <ExternalLink size={16} aria-hidden="true" /> {guide.buttonLabel}
                <span className="sr-only">(se abre en una pestaña nueva)</span>
            </a>

            <p className="mt-4 flex items-start gap-2 rounded-lg bg-white/80 px-3 py-2.5 text-[13px] leading-relaxed text-slate-700 ring-1 ring-blue-100">
                <Info size={15} className="mt-0.5 shrink-0" style={{ color: BLUE }} aria-hidden="true" /> {guide.warning}
            </p>
        </section>
    );
};

// ── «Crea tu acceso al evento» (v4.1267) ─────────────────────────────
//
// Componente de NIVEL SUPERIOR a propósito: declarado dentro del formulario
// sería un tipo nuevo en cada render y los campos perderían el foco tras cada
// letra (regla del proyecto). Tres casos, los del pedido del Distrito:
//   A. sin cuenta → crea su contraseña;
//   B. el correo ya tiene cuenta → entrar o recuperar, sin duplicarla;
//   C. ya entró con ese correo → no se le pide nada.

interface AccessSectionProps {
    eventTitle: string;
    mode: AccountMode;
    identity: PublicConfig['identity'];
    sessionMatches: boolean;
    credentials: { password: string; passwordConfirm: string };
    errors: Record<string, string>;
    state: { kind: 'idle' } | { kind: 'checking' } | { kind: 'exists'; message: string; recover: boolean } | { kind: 'error'; message: string };
    onCredential: (key: 'password' | 'passwordConfirm', value: string) => void;
    onLogin: () => void;
    onForgot: () => void;
    onUseSessionEmail: () => void;
}

const AccessSection = ({
    eventTitle, mode, identity, sessionMatches, credentials, errors, state,
    onCredential, onLogin, onForgot, onUseSessionEmail,
}: AccessSectionProps) => {
    // Caso C: ya entró, con el MISMO correo del formulario.
    if (sessionMatches && identity) {
        return (
            <div className="sm:col-span-2">
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <UserCheck size={18} className="mt-0.5 shrink-0 text-emerald-700" />
                    <div>
                        <p className="text-sm font-bold text-emerald-900">Estás ingresando con tu cuenta de Rotary Distrito 4281.</p>
                        <p className="mt-1 text-[13px] leading-relaxed text-emerald-800">
                            Esta inscripción quedará en tu cuenta (<span className="font-semibold" data-no-translate>{identity.email}</span>)
                            y podrás consultarla en «Mis eventos». No necesitas crear otra contraseña.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const checks = accessPasswordChecks(credentials.password, credentials.passwordConfirm);
    const touched = Boolean(credentials.password || credentials.passwordConfirm);

    return (
        <div className="sm:col-span-2">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-labelledby="crea-tu-acceso">
                <p id="crea-tu-acceso" className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
                    <KeyRound size={16} style={{ color: BLUE }} /> Crea tu acceso al evento
                    {mode === 'optional' && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                            Recomendado
                        </span>
                    )}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                    Con tu cuenta podrás consultar el estado de tu inscripción, verificar tus comprobantes y acceder a
                    la información de tu participación en la {eventTitle}.
                </p>

                {identity && !sessionMatches && (
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                        Tienes la sesión iniciada como <span className="font-semibold" data-no-translate>{identity.email}</span>,
                        pero el correo del formulario es otro: esta inscripción será de esa otra persona y necesita su propio
                        acceso.{' '}
                        <button type="button" onClick={onUseSessionEmail} className="font-semibold underline" style={{ color: BLUE }}>
                            Usar el correo de mi sesión
                        </button>
                    </p>
                )}

                <p className="mt-3 flex items-center gap-1.5 text-[13px] text-slate-600">
                    <Mail size={14} className="text-slate-400" />
                    Correo de acceso: el que escribiste arriba.
                </p>

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field
                        label="Crear contraseña" name="password" type="password" revealable
                        required={mode === 'required'}
                        value={credentials.password}
                        onChange={(e: any) => onCredential('password', e.target.value)}
                        error={errors.password}
                        touched={Boolean(errors.password)}
                        placeholder="Mínimo 8 caracteres"
                    />
                    <Field
                        label="Confirmar contraseña" name="passwordConfirm" type="password" revealable
                        required={mode === 'required'}
                        value={credentials.passwordConfirm}
                        onChange={(e: any) => onCredential('passwordConfirm', e.target.value)}
                        error={errors.passwordConfirm}
                        touched={Boolean(errors.passwordConfirm)}
                        placeholder="Escríbela de nuevo"
                    />
                </div>

                {/* El indicador discreto de requisitos: se ve en cuanto se escribe. */}
                {touched && (
                    <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px]" aria-live="polite">
                        {checks.map(c => (
                            <li key={c.key} className={`flex items-center gap-1.5 ${c.ok ? 'text-emerald-700' : 'text-slate-500'}`}>
                                {c.ok ? <CheckCircle2 size={13} /> : <Circle size={13} />} {c.label}
                            </li>
                        ))}
                    </ul>
                )}

                {mode === 'optional' && (
                    <p className="mt-2.5 text-[12px] leading-relaxed text-slate-500">
                        Si inscribes a otra persona, puedes dejarlo en blanco: ella podrá crear su acceso después con su correo.
                    </p>
                )}

                {/* Caso B: el correo ya tiene cuenta. Nunca se crea otra. */}
                {state.kind === 'exists' && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
                        <p className="text-sm font-bold text-amber-900">{state.message}</p>
                        <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
                            Lo que ya escribiste queda guardado en este navegador.
                            {mode === 'optional' && ' Si prefieres, deja la contraseña en blanco y continúa: podrás vincular la inscripción después.'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {!state.recover && (
                                <button type="button" onClick={onLogin}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
                                    style={{ background: BLUE }}>
                                    <LogIn size={15} /> Iniciar sesión
                                </button>
                            )}
                            <button type="button" onClick={onForgot}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100">
                                <KeyRound size={15} /> Recuperar contraseña
                            </button>
                        </div>
                    </div>
                )}

                {state.kind === 'error' && (
                    <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-red-600" role="alert">
                        <AlertCircle size={13} /> {state.message}
                    </p>
                )}

                {!identity && state.kind !== 'exists' && (
                    <p className="mt-3 text-[13px] text-slate-500">
                        ¿Ya tienes una cuenta en Rotary Distrito 4281?{' '}
                        <button type="button" onClick={onLogin} className="font-semibold underline" style={{ color: BLUE }}>
                            Inicia sesión
                        </button>
                    </p>
                )}
            </section>
        </div>
    );
};

export default CompletarInscripcion;
