// ════════════════════════════════════════════════════════════════════
// Postulación de Proyectos — Feria de Proyectos Rotary Colombia
// v4.592.0 — Wizard público de inscripción (3 pasos + pago + confirmación).
//
// Ruta pública: /postular-proyecto (los slugs anteriores redirigen aquí).
//
// Todo el contenido variable (edición, ciudad, valor, fecha límite,
// distritos habilitados, áreas de enfoque, URL de redirección) llega desde
// /api/project-fair/config, que el administrador edita en
// /admin/feria-proyectos. Esta página no tiene valores de negocio quemados.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../contexts/LanguageContext';
import { activeLocale } from '../lib/locale';
import {
    ArrowLeft, ArrowRight, Building2, CheckCircle2, ClipboardList,
    CreditCard, ExternalLink, Loader2, Mail, MapPin, RefreshCw,
    ShieldCheck, Target, User, Wallet, AlertCircle, Clock, FileText, KeyRound, LayoutDashboard, CalendarDays,
    Globe, IdCard, MessageSquare, Award,
} from 'lucide-react';
// La lista de países es la MISMA del selector de indicativo telefónico: una
// sola fuente, para que no se desincronicen dos catálogos de lo mismo.
import { COUNTRIES } from '../lib/countryPhones';
import { DEPARTMENT_OPTIONS, departmentLabel, hasDepartmentList } from '../lib/colombiaGeo';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
// Los campos son los del módulo compartido: el formulario de inscripción a
// un evento usa estos mismos componentes, no una copia parecida.
import { Field, PhoneField, SummaryRow, PASSWORD_MIN } from '../components/forms/FairField';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const DRAFT_KEY = 'feria_proyectos_draft_v1';

const BLUE = '#17458F';
const GOLD = '#F7A81B';

interface Option { value: string; label: string }
interface FocusArea { key: string; label: string }

interface FairConfig {
    enabled: boolean;
    edition: { number: number; ordinal: string; name: string; city: string; country: string; year: number; dates?: string; key: string };
    deadline: string | null;
    presentation: { minMinutes?: number; maxMinutes: number };
    registration: { priceMode?: 'COP' | 'USD'; amountCop: number; amountUsd?: number; currency: string; concept: string; maxProjectsPerClub: number };
    districts: Option[];
    idTypes: FocusArea[];
    clubRoles: FocusArea[];
    focusAreas: FocusArea[];
    redirect: { url: string; label: string; delaySeconds: number; name: string };
    content: {
        title: string; subtitle: string; intro: string;
        requirements: string[]; note: string; priorityNote: string;
        scheduleTitle?: string;
        schedule?: { date: string; label: string; prefix?: string }[];
    };
    portal?: { path?: string; redirectAfterPayment?: boolean };
}

interface Trm {
    rate: number | null; date: string | null; source: string | null; fetchedAt: string | null;
    priceMode?: 'COP' | 'USD';
    amountCop?: number | null; amountUsd?: number | null; stale?: boolean;
}

interface Submission {
    id: string; publicRef: string; status: string;
    firstName: string; lastName: string; email: string; phone: string;
    clubName: string; district: string;
    country: string | null; department: string | null; city: string | null;
    clubRole: string | null; clubRoleLabel: string | null; clubRoleOther: string | null;
    idType: string | null; idTypeLabel: string | null; idNumber: string | null;
    notes: string | null;
    projectName: string; projectDescription: string;
    focusArea: string; focusAreaLabel: string | null; budgetUsd: number | null;
    priceMode?: 'COP' | 'USD' | null; chargeCurrency?: string | null;
    amountCop: number | null; amountUsd: number | null;
    trmRate: number | null; trmDate: string | null; trmSource: string | null; trmFetchedAt: string | null;
    paidAt: string | null;
}

type FormState = {
    firstName: string; lastName: string; email: string; phone: string;
    clubName: string; district: string;
    // v4.677 — Datos que hacían falta para facturar la inscripción y para
    // acreditar a quien llega a la feria.
    country: string; department: string; city: string; idType: string; idNumber: string;
    // Rol dentro del club. `clubRoleOther` sólo se usa —y sólo se exige—
    // cuando el rol elegido es "Otro".
    clubRole: string; clubRoleOther: string;
    projectName: string; projectDescription: string; focusArea: string; budgetUsd: string;
    // Opcional: cualquier cosa que el club quiera decirle al comité.
    notes: string;
    // v4.608 — La cuenta del club se crea con la postulación: la contraseña se
    // pide aquí, mientras el club escribe su correo, y no después del pago.
    password: string; passwordConfirm: string;
};

/**
 * Encabezado de un bloque de campos dentro del paso 1. Ocupa el ancho completo
 * de la rejilla: con quince campos seguidos, agruparlos es lo que hace que el
 * formulario se lea de un vistazo en vez de parecer una lista interminable.
 */
const GroupTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="-mb-1 mt-1 border-b border-slate-100 pb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 first:mt-0">
        {children}
    </p>
);

// Se construye una vez: el desplegable de países no cambia entre renders.
const COUNTRY_OPTIONS = COUNTRIES.map(c => ({ value: c.name, label: c.name }));

const EMPTY_FORM: FormState = {
    firstName: '', lastName: '', email: '', phone: '',
    clubName: '', district: '',
    country: '', department: '', city: '', idType: '', idNumber: '',
    clubRole: '', clubRoleOther: '',
    projectName: '', projectDescription: '', focusArea: '', budgetUsd: '',
    notes: '',
    password: '', passwordConfirm: '',
};

const STEP_FIELDS: Record<number, (keyof FormState)[]> = {
    // El orden es el mismo de la pantalla: primero la persona, después dónde
    // está, después su club, y al final el acceso.
    1: ['firstName', 'lastName', 'idType', 'idNumber', 'email', 'phone',
        'country', 'department', 'city',
        'clubName', 'district', 'clubRole', 'clubRoleOther',
        'password', 'passwordConfirm'],
    2: ['projectName', 'projectDescription', 'focusArea', 'budgetUsd'],
    3: [],
};


const fmtCop = (n: number | null | undefined) =>
    `$${Number(n || 0).toLocaleString(activeLocale(), { maximumFractionDigits: 0 })}`;
const fmtUsd = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRate = (n: number | null | undefined) =>
    n ? Number(n).toLocaleString(activeLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(activeLocale(), { dateStyle: 'long', timeStyle: 'short' });
};
const fmtDate = (value: string | null | undefined) => {
    if (!value) return '';
    const d = new Date(`${value}T12:00:00`);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
};

// Tiempo de exposición de cada proyecto: rango ("De 5 a 6 minutos") cuando el
// admin configuró mínimo y máximo, o tope único si sólo hay máximo.
const presentationText = (p: FairConfig['presentation'] | undefined) => {
    const max = Number(p?.maxMinutes) || 6;
    const min = Number(p?.minMinutes) || 0;
    return min > 0 && min < max ? `De ${min} a ${max} minutos` : `Máximo ${max} minutos`;
};

// Validación en tiempo real (espejo de la del servidor).
const validateField = (name: keyof FormState, value: string, config: FairConfig | null): string | null => {
    const v = String(value || '').trim();
    switch (name) {
        case 'firstName': return v ? null : 'Ingresa tu nombre.';
        case 'lastName': return v ? null : 'Ingresa tu apellido.';
        case 'email':
            if (!v) return 'Ingresa tu correo electrónico.';
            return /^\S+@\S+\.\S+$/.test(v) ? null : 'El correo no parece válido.';
        case 'phone':
            if (!v) return 'Ingresa tu número de contacto o WhatsApp.';
            return v.replace(/\D/g, '').length >= 7 ? null : 'El número no parece válido.';
        case 'clubName': return v ? null : 'Indica el Club Rotario que postula el proyecto.';
        case 'district': return v ? null : 'Selecciona el distrito al que pertenece el club.';
        case 'country': return v ? null : 'Selecciona tu país.';
        case 'department': return v ? null : 'Indica tu departamento, estado o provincia.';
        case 'clubRole':
            if (!v) return 'Selecciona tu rol dentro del club.';
            return (config?.clubRoles || []).some(r => r.key === v) ? null : 'Selecciona un rol válido.';
        case 'city': return v ? null : 'Escribe tu ciudad.';
        case 'idType':
            if (!v) return 'Selecciona el tipo de documento.';
            return (config?.idTypes || []).some(t => t.key === v) ? null : 'Selecciona un tipo válido.';
        case 'idNumber':
            if (!v) return 'Escribe tu número de documento.';
            return v.replace(/[^\w]/g, '').length >= 5 ? null : 'El número parece incompleto.';
        case 'projectName': return v ? null : 'Escribe el nombre del proyecto.';
        case 'projectDescription':
            if (!v) return 'Describe el proyecto.';
            return v.length >= 40 ? null : `Amplía la descripción (mínimo 40 caracteres, llevas ${v.length}).`;
        case 'focusArea':
            if (!v) return 'Selecciona el área de enfoque del proyecto.';
            return (config?.focusAreas || []).some(a => a.key === v) ? null : 'Selecciona un área válida.';
        case 'password':
            if (!v) return 'Crea una contraseña para acceder a tu panel.';
            return v.length >= PASSWORD_MIN ? null : `Usa al menos ${PASSWORD_MIN} caracteres.`;
        case 'budgetUsd': {
            if (!v) return 'Indica el presupuesto total en USD.';
            const n = Number(v.replace(/[^\d.]/g, ''));
            return n > 0 ? null : 'El presupuesto debe ser mayor a 0.';
        }
        default: return null;
    }
};

// ── Página ───────────────────────────────────────────────────────────
const FeriaProyectos = () => {
    // Suscripción al idioma: los formateadores de arriba leen el locale
    // activo, y sin esto la página no se repintaría al cambiarlo.
    useLang();
    const [config, setConfig] = useState<FairConfig | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [stage, setStage] = useState<'form' | 'payment' | 'confirmed'>('form');
    const [step, setStep] = useState(1);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [submitting, setSubmitting] = useState(false);
    const [payLoading, setPayLoading] = useState(false);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [trm, setTrm] = useState<Trm | null>(null);
    const [trmLoading, setTrmLoading] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [portalPath, setPortalPath] = useState<string | null>(null);
    const topRef = useRef<HTMLDivElement>(null);
    // Al cambiar de paso se vuelve al inicio de la tarjeta del formulario, no
    // al tope de la página: si se subiera hasta arriba habría que pasar otra
    // vez por todo el texto informativo para retomar el diligenciamiento.
    const cardRef = useRef<HTMLElement>(null);

    const errors = useMemo(() => {
        const out: Partial<Record<keyof FormState, string | null>> = {};
        (Object.keys(form) as (keyof FormState)[]).forEach(k => { out[k] = validateField(k, form[k], config); });
        // Sólo se exige el cargo escrito a mano si el rol elegido es "Otro".
        out.clubRoleOther = form.clubRole === 'otro' && !form.clubRoleOther.trim()
            ? 'Escribe cuál es tu cargo.'
            : null;
        // La confirmación se valida contra la contraseña, no por sí sola.
        out.passwordConfirm = !form.passwordConfirm
            ? 'Repite la contraseña.'
            : (form.passwordConfirm === form.password ? null : 'Las contraseñas no coinciden.');
        return out;
    }, [form, config]);

    const stepValid = useCallback(
        (n: number) => STEP_FIELDS[n].every(f => !errors[f]),
        [errors]
    );

    // ── Carga de configuración ───────────────────────────────────────
    useEffect(() => {
        fetch(`${API}/project-fair/config`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((cfg: FairConfig) => setConfig(cfg))
            .catch(() => setGlobalError('No pudimos cargar la información de la convocatoria. Recarga la página.'))
            .finally(() => setLoadingConfig(false));
    }, []);

    const loadTrm = useCallback((force = false) => {
        setTrmLoading(true);
        return fetch(`${API}/project-fair/trm${force ? '?force=true' : ''}`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((data: Trm) => { setTrm(data); return data; })
            .catch(() => { setTrm(null); return null; })
            .finally(() => setTrmLoading(false));
    }, []);

    useEffect(() => { loadTrm(); }, [loadTrm]);

    // ── Retorno desde Stripe / inscripción en curso ───────────────────
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const submissionId = params.get('submission');
        const sessionId = params.get('session_id');
        if (params.get('pago') === 'cancelado') {
            setNotice('El pago fue cancelado. Tu inscripción quedó guardada: puedes reintentarlo cuando quieras.');
        }
        if (!submissionId) {
            // Autoguardado: recuperamos el borrador si el usuario volvió luego.
            try {
                const raw = localStorage.getItem(DRAFT_KEY);
                if (raw) {
                    const draft = JSON.parse(raw);
                    if (draft?.form) setForm({ ...EMPTY_FORM, ...draft.form });
                    if (draft?.step && draft.step >= 1 && draft.step <= 3) setStep(draft.step);
                }
            } catch { /* borrador ilegible: se ignora */ }
            return;
        }

        const url = `${API}/project-fair/submissions/${submissionId}${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`;
        fetch(url)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(data => {
                const s: Submission = data.submission;
                setSubmission(s);
                if (s.status === 'paid') {
                    setStage('confirmed');
                    localStorage.removeItem(DRAFT_KEY);
                } else {
                    setStage('payment');
                }
            })
            .catch(() => setGlobalError('No pudimos recuperar tu inscripción. Escríbenos si el problema persiste.'));
    }, []);

    // Autoguardado del progreso (evita perder información).
    useEffect(() => {
        if (stage !== 'form') return;
        try {
            // Nunca se guarda la contraseña en el navegador.
            const { password, passwordConfirm, ...safe } = form;
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: safe, step, savedAt: Date.now() }));
        } catch { /* cuota llena */ }
    }, [form, step, stage]);

    // Reintento de confirmación: si Stripe ya cobró pero el webhook aún no
    // llega, reconsultamos hasta que el estado quede en "paid".
    useEffect(() => {
        if (stage !== 'payment' || !submission) return;
        const params = new URLSearchParams(window.location.search);
        if (!params.get('session_id')) return;
        const timer = setInterval(() => {
            fetch(`${API}/project-fair/submissions/${submission.id}?session_id=${encodeURIComponent(params.get('session_id') || '')}`)
                .then(r => r.json())
                .then(data => {
                    if (data?.submission?.status === 'paid') {
                        setSubmission(data.submission);
                        setStage('confirmed');
                        localStorage.removeItem(DRAFT_KEY);
                    }
                })
                .catch(() => { /* reintenta en el próximo tick */ });
        }, 4000);
        return () => clearInterval(timer);
    }, [stage, submission]);

    // v4.608 — Tras confirmar el pago el club va a SU PANEL a formular el
    // proyecto. El enlace a Rotary Grants queda dentro del panel, como paso
    // siguiente una vez tenga la formulación lista.
    useEffect(() => {
        if (stage !== 'confirmed' || !config || !submission) return;
        const portalPath = (config as any)?.portal?.path || '/mi-proyecto';
        const goesToPortal = (config as any)?.portal?.redirectAfterPayment !== false;
        const target = goesToPortal
            ? `${portalPath}?submission=${submission.id}&session_id=${encodeURIComponent(new URLSearchParams(window.location.search).get('session_id') || '')}`
            : (config.redirect?.url || 'https://grants25a.org/');

        const delay = Math.max(3, Number(config.redirect?.delaySeconds) || 8);
        setCountdown(delay);
        const tick = setInterval(() => {
            setCountdown(prev => {
                if (prev === null) return null;
                if (prev <= 1) {
                    clearInterval(tick);
                    window.location.href = target;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(tick);
    }, [stage, config, submission]);

    const scrollTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Se espera al siguiente frame porque la tarjeta destino puede ser una
    // recién montada (la pantalla de pago reemplaza a la del wizard). El
    // `scroll-mt-*` de la tarjeta deja el margen necesario para que el menú
    // superior (sticky) no le tape el encabezado.
    const scrollToCard = () => requestAnimationFrame(() => {
        (cardRef.current || topRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };
    const handleBlur = (e: React.FocusEvent<any>) => setTouched(prev => ({ ...prev, [e.target.name]: true }));

    const goNext = () => {
        const fields = STEP_FIELDS[step];
        if (!stepValid(step)) {
            setTouched(prev => ({ ...prev, ...Object.fromEntries(fields.map(f => [f, true])) }));
            return;
        }
        setStep(s => Math.min(3, s + 1));
        scrollToCard();
    };
    const goBack = () => { setStep(s => Math.max(1, s - 1)); scrollToCard(); };

    // Paso final del wizard: registra la inscripción y abre la pantalla de pago.
    const handleSubmit = async () => {
        if (!stepValid(1) || !stepValid(2)) {
            setStep(!stepValid(1) ? 1 : 2);
            setTouched(Object.fromEntries(Object.keys(form).map(k => [k, true])));
            return;
        }
        setSubmitting(true);
        setGlobalError(null);
        try {
            const res = await fetch(`${API}/project-fair/submissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, budgetUsd: form.budgetUsd.replace(/[^\d.]/g, '') }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data?.fields) {
                    setTouched(Object.fromEntries(Object.keys(form).map(k => [k, true])));
                    setStep(Object.keys(data.fields).some(f => STEP_FIELDS[1].includes(f as keyof FormState)) ? 1 : 2);
                }
                // Correo ya registrado: se ofrece entrar al panel en vez de
                // dejar al club atascado en el formulario.
                if (res.status === 409) setPortalPath(data?.portalPath || '/mi-proyecto');
                throw new Error(data?.error || 'No pudimos registrar la inscripción.');
            }
            setSubmission(data.submission);
            if (data.trm) setTrm(data.trm);
            else loadTrm();
            setStage('payment');
            scrollToCard();
        } catch (err: any) {
            setGlobalError(err?.message || 'No pudimos registrar la inscripción.');
        } finally {
            setSubmitting(false);
        }
    };

    // Pago: usa la pasarela Stripe ya integrada en la plataforma.
    const handlePay = async () => {
        if (!submission) return;
        setPayLoading(true);
        setGlobalError(null);
        try {
            const res = await fetch(`${API}/project-fair/submissions/${submission.id}/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnUrl: window.location.origin }),
            });
            const data = await res.json();
            if (!res.ok || !data.url) throw new Error(data?.error || 'No pudimos iniciar el pago.');
            window.location.href = data.url;
        } catch (err: any) {
            setGlobalError(err?.message || 'No pudimos iniciar el pago.');
            setPayLoading(false);
        }
    };

    // El precio se anuncia en la moneda que eligió el admin. En pesos, el
    // valor en dólares —que es lo que Stripe cobra— sale de la TRM del día.
    const priceMode = config?.registration?.priceMode === 'USD' ? 'USD' : 'COP';
    const amountCop = priceMode === 'COP' ? (config?.registration?.amountCop ?? 0) : null;
    const amountUsd = priceMode === 'USD'
        ? (config?.registration?.amountUsd ?? 0)
        : (trm?.rate ? Math.round(((amountCop || 0) / trm.rate) * 100) / 100 : null);
    const focusLabel = config?.focusAreas.find(a => a.key === form.focusArea)?.label || '';
    const idTypeLabel = config?.idTypes?.find(t => t.key === form.idType)?.label || '';
    // Con "Otro" se muestra el cargo que escribió, no la palabra "Otro".
    const clubRoleLabel = form.clubRole === 'otro'
        ? form.clubRoleOther
        : (config?.clubRoles?.find(r => r.key === form.clubRole)?.label || '');
    const progress = stage === 'form' ? Math.round((step / 3) * 100) : 100;

    if (loadingConfig) {
        return (
            <div className="min-h-screen bg-rotary-concrete">
                <Navbar />
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="text-center text-slate-500">
                        <Loader2 className="mx-auto mb-3 animate-spin" size={32} style={{ color: BLUE }} />
                        <p className="text-sm">Cargando la convocatoria…</p>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    if (config && config.enabled === false) {
        return (
            <div className="min-h-screen bg-rotary-concrete">
                <Navbar />
                <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
                    <div className="max-w-lg rounded-2xl bg-white p-10 text-center shadow-sm">
                        <Clock className="mx-auto mb-4" size={40} style={{ color: BLUE }} />
                        <h1 className="mb-2 text-2xl font-bold text-slate-900">Convocatoria cerrada</h1>
                        <p className="text-slate-600">
                            En este momento no estamos recibiendo postulaciones para la {config.edition?.name}.
                            Escríbenos si necesitas más información.
                        </p>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-rotary-concrete" ref={topRef}>
            <Navbar />

            {/* Cabecera de la convocatoria */}
            <header style={PAGE_HEADER_BACKGROUND} className="px-4 py-8 text-white sm:px-6 sm:py-10">
                <div className="mx-auto max-w-4xl text-center sm:text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                        {config?.content?.title || 'Postulación de Proyectos'}
                    </p>
                    <h1 className="mt-1.5 text-2xl font-bold leading-tight sm:text-3xl">
                        {config?.edition?.name}
                    </h1>
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-white/85 sm:justify-start">
                        <MapPin size={14} /> {config?.edition?.city}{config?.edition?.country ? `, ${config.edition.country}` : ''}
                        {config?.edition?.dates ? ` · ${config.edition.dates}` : ''}
                    </p>
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
                {globalError && (
                    <div className="mb-5 flex flex-wrap items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" /> <span>{globalError}</span>
                        {portalPath && (
                            <a href={portalPath} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[13px] font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-100">
                                Ir a mi panel <ArrowRight size={13} />
                            </a>
                        )}
                    </div>
                )}
                {notice && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" /> <span>{notice}</span>
                    </div>
                )}

                {/* ── Confirmación + redirección ───────────────────────── */}
                {stage === 'confirmed' && submission ? (
                    <section className="rounded-2xl bg-white p-7 shadow-sm sm:p-10">
                        <div className="text-center">
                            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                                <CheckCircle2 size={38} className="text-emerald-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">¡Inscripción realizada con éxito!</h2>
                            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600">
                                Registramos la postulación del proyecto <strong>{submission.projectName}</strong> y
                                confirmamos el pago de la inscripción. Enviamos el comprobante a{' '}
                                <strong>{submission.email}</strong>.
                            </p>

                            <div className="mx-auto mt-6 max-w-sm rounded-xl px-6 py-4" style={{ background: `${GOLD}1f` }}>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Referencia de inscripción</p>
                                <p className="mt-1 text-3xl font-extrabold tracking-wider" style={{ color: BLUE }}>{submission.publicRef}</p>
                            </div>
                        </div>

                        <div className="mt-8 rounded-xl border border-slate-200 p-5">
                            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                                <FileText size={15} /> Comprobante
                            </h3>
                            <SummaryRow label="Estado" value={<span className="text-emerald-600">Pago confirmado</span>} />
                            <SummaryRow label="Club Rotario" value={submission.clubName} />
                            <SummaryRow label="Distrito" value={submission.district} />
                            <SummaryRow label="Área de enfoque" value={submission.focusAreaLabel || submission.focusArea} />
                            {submission.amountCop ? (
                                <SummaryRow label="Valor de la inscripción" value={`${fmtCop(submission.amountCop)} COP`} />
                            ) : null}
                            <SummaryRow label="Valor pagado" value={`${fmtUsd(submission.amountUsd)} USD`} />
                            {submission.trmRate ? (
                                <SummaryRow label="TRM aplicada" value={`${fmtRate(submission.trmRate)} COP/USD`} />
                            ) : null}
                            <SummaryRow label="Fecha del pago" value={fmtDateTime(submission.paidAt)} />
                        </div>

                        <div className="mt-8 rounded-xl border-2 p-6 text-center" style={{ borderColor: `${BLUE}22` }}>
                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `${BLUE}14` }}>
                                <LayoutDashboard size={22} style={{ color: BLUE }} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">Ahora formula tu proyecto</h3>
                            <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-slate-600">
                                Te llevamos a tu panel para que completes el formulario del proyecto
                                {countdown !== null && countdown > 0 ? <> en <strong>{countdown}</strong> segundo{countdown === 1 ? '' : 's'}</> : null}.
                                Puedes guardarlo y volver cuantas veces necesites hasta la fecha límite.
                            </p>
                            <a
                                href={`${(config as any)?.portal?.path || '/mi-proyecto'}?submission=${submission.id}&session_id=${encodeURIComponent(new URLSearchParams(window.location.search).get('session_id') || '')}`}
                                className="mt-5 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:opacity-90"
                                style={{ background: BLUE }}
                            >
                                Ir a mi panel y formular el proyecto <ArrowRight size={17} />
                            </a>
                            <p className="mt-4 text-[13px] text-slate-500">
                                Ingresas con <strong>{submission.email}</strong> y la contraseña que creaste al inscribirte.
                            </p>
                            <p className="mt-3 border-t border-slate-100 pt-3 text-[13px] text-slate-500">
                                ¿Prefieres continuar primero en{' '}
                                <a href={config?.redirect?.url || 'https://grants25a.org/'} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: BLUE }}>
                                    {config?.redirect?.name || 'Rotary Grants 25A'} <ExternalLink size={11} className="inline" />
                                </a>? También lo encontrarás dentro de tu panel.
                            </p>
                        </div>
                    </section>
                ) : stage === 'payment' && submission ? (
                    /* ── Pantalla de pago ───────────────────────────────── */
                    <section ref={cardRef} className="scroll-mt-32 rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                        <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-5">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `${BLUE}14` }}>
                                <Wallet size={20} style={{ color: BLUE }} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Pago de la inscripción</h2>
                                <p className="text-sm text-slate-500">
                                    Inscripción <strong>{submission.publicRef}</strong> · {submission.projectName}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border-2 p-6" style={{ borderColor: `${BLUE}22` }}>
                            <div className="flex flex-col gap-1 border-b border-slate-100 pb-5 text-center">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    Valor oficial de inscripción
                                </span>
                                <span className="text-4xl font-extrabold" style={{ color: BLUE }}>
                                    {priceMode === 'COP'
                                        ? <>{fmtCop(amountCop)} <span className="text-lg font-bold">COP</span></>
                                        : <>{fmtUsd(amountUsd)} <span className="text-lg font-bold">USD</span></>}
                                </span>
                            </div>

                            {priceMode === 'COP' ? (
                                <>
                                    <div className="mt-5 space-y-3 text-[15px]">
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-slate-600">TRM vigente</span>
                                            <span className="font-semibold text-slate-900">
                                                {trmLoading ? <Loader2 size={15} className="animate-spin" /> : `${fmtRate(trm?.rate)} COP/USD`}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-slate-600">Valor que se cobrará</span>
                                            <span className="font-semibold text-slate-900">{fmtUsd(amountUsd)} USD</span>
                                        </div>
                                        <div className="flex items-start justify-between gap-4">
                                            <span className="text-slate-600">Última actualización de la TRM</span>
                                            <span className="text-right text-[13px] font-medium text-slate-500">
                                                {fmtDateTime(trm?.fetchedAt)}
                                                {trm?.source ? <><br /><span className="text-slate-400">Fuente: {trm.source}</span></> : null}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => loadTrm(true)}
                                        disabled={trmLoading}
                                        className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition hover:text-slate-700 disabled:opacity-50"
                                    >
                                        <RefreshCw size={13} className={trmLoading ? 'animate-spin' : ''} /> Actualizar TRM
                                    </button>

                                    <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
                                        El valor de la inscripción está fijado en <strong>pesos colombianos</strong>. El cobro se
                                        procesa en <strong>dólares</strong>, convertido con la TRM oficial vigente al momento del pago.
                                    </p>
                                </>
                            ) : (
                                <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
                                    El valor de la inscripción está fijado en <strong>dólares</strong> y así se cobra, sin conversión.
                                </p>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={handlePay}
                            disabled={payLoading}
                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-8 py-4 text-base font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
                            style={{ background: BLUE }}
                        >
                            {payLoading ? <><Loader2 size={18} className="animate-spin" /> Redirigiendo a Stripe…</> : <><CreditCard size={18} /> Pagar con Stripe</>}
                        </button>

                        <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-slate-500">
                            <ShieldCheck size={14} /> Pago seguro procesado por Stripe. La inscripción se confirma
                            únicamente cuando Stripe reporta la transacción exitosa.
                        </p>
                    </section>
                ) : (
                    /* ── Introducción + wizard ──────────────────────────── */
                    <>
                        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                            {/* El nombre de la edición ya aparece en la cabecera: aquí
                                se muestra sólo el contenido, sin repetirlo. */}
                            <p className="text-[15px] leading-relaxed text-slate-600">{config?.content?.intro}</p>

                            <p className="mt-4 text-[15px] leading-relaxed text-slate-600">{config?.content?.note}</p>

                            <ul className="mt-5 space-y-2.5">
                                {(config?.content?.requirements || []).map((r, i) => (
                                    <li key={i} className="flex items-start gap-2.5 text-[15px] text-slate-700">
                                        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                                        <span>{r}</span>
                                    </li>
                                ))}
                            </ul>

                            {/* El plazo límite ya no se muestra aquí (v4.610): las fechas del
                                proceso van en la línea de tiempo de abajo. `config.deadline`
                                se sigue usando internamente para la ventana de edición del
                                formulario maestro. */}
                            <div className="mt-6">
                                <div className="flex items-center gap-3 rounded-xl px-4 py-3.5" style={{ background: `${GOLD}1f` }}>
                                    <Clock size={19} className="text-amber-700" />
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tiempo de presentación</p>
                                        <p className="text-[15px] font-bold text-amber-800">
                                            {presentationText(config?.presentation)} por proyecto
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {(config?.content?.schedule || []).length > 0 && (
                                <div className="mt-6 rounded-xl border border-slate-200 p-5">
                                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                                        <CalendarDays size={16} /> {config?.content?.scheduleTitle || 'Fechas importantes del proceso'}
                                    </h3>
                                    <ol className="relative space-y-4 border-l-2 border-slate-100 pl-5">
                                        {(config?.content?.schedule || []).map((item, i) => (
                                            <li key={i} className="relative">
                                                <span className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white"
                                                    style={{ background: GOLD }} />
                                                <p className="text-[15px] font-bold" style={{ color: BLUE }}>
                                                    {item.prefix ? `${item.prefix} ` : ''}{fmtDate(item.date)}
                                                </p>
                                                <p className="text-[15px] leading-relaxed text-slate-600">{item.label}</p>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            )}

                            {config?.content?.priorityNote && (
                                <p className="mt-5 rounded-xl border-l-4 bg-slate-50 px-4 py-3 text-[14px] leading-relaxed text-slate-600" style={{ borderColor: GOLD }}>
                                    {config.content.priorityNote}
                                </p>
                            )}
                        </section>

                        <section ref={cardRef} className="scroll-mt-32 rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                            {/* Barra de progreso */}
                            <div className="mb-7">
                                <div className="mb-2 flex items-center justify-between text-sm">
                                    <span className="font-semibold text-slate-700">
                                        Paso {step} de 3 — {step === 1 ? 'Datos del representante del club que postula el proyecto' : step === 2 ? 'Datos del proyecto' : 'Revisión y confirmación'}
                                    </span>
                                    <span className="font-bold" style={{ color: BLUE }}>{progress}%</span>
                                </div>
                                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: BLUE }} />
                                </div>
                            </div>

                            {step === 1 && (
                                <div className="grid gap-5">
                                    {/* El paso está ordenado de lo más particular a lo más
                                        institucional: primero quién eres, después dónde estás,
                                        después tu club, y al final el acceso a tu panel.
                                        Cada bloque es su propia rejilla y decide sus columnas,
                                        para que un grupo de tres campos quepa en una fila en
                                        vez de dejar el tercero colgando bajo el primero. */}
                                    <GroupTitle>Datos personales</GroupTitle>
                                    <div className="grid gap-5 sm:grid-cols-2">
                                        <Field label="Nombre" name="firstName" icon={User} value={form.firstName} onChange={handleChange} onBlur={handleBlur} error={errors.firstName} touched={touched.firstName} placeholder="Introduce tu primer nombre" />
                                        <Field label="Apellido" name="lastName" icon={User} value={form.lastName} onChange={handleChange} onBlur={handleBlur} error={errors.lastName} touched={touched.lastName} placeholder="Escribe tu primer apellido" />
                                        <Field
                                            as="select" label="Tipo de documento" name="idType" icon={IdCard}
                                            value={form.idType} onChange={handleChange} onBlur={handleBlur}
                                            error={errors.idType} touched={touched.idType}
                                            options={(config?.idTypes || []).map(t => ({ value: t.key, label: t.label }))}
                                        />
                                        <Field
                                            label="Número de documento" name="idNumber" icon={IdCard}
                                            value={form.idNumber} onChange={handleChange} onBlur={handleBlur}
                                            error={errors.idNumber} touched={touched.idNumber}
                                            placeholder="Escribe tu número de documento"
                                            hint="Lo usamos para la factura de la inscripción y para tu acreditación en la feria."
                                        />
                                        <Field label="Correo electrónico" name="email" type="email" icon={Mail} value={form.email} onChange={handleChange} onBlur={handleBlur} error={errors.email} touched={touched.email} placeholder="nombre@correo.com" />
                                        <PhoneField
                                            value={form.phone}
                                            onChange={v => setForm(prev => ({ ...prev, phone: v }))}
                                            onBlur={() => setTouched(prev => ({ ...prev, phone: true }))}
                                            error={errors.phone}
                                            touched={touched.phone}
                                        />
                                    </div>

                                    <GroupTitle>Ubicación</GroupTitle>
                                    <div className="grid gap-5 sm:grid-cols-3">
                                        <Field
                                            as="select" label="País" name="country" icon={Globe}
                                            value={form.country} onChange={handleChange} onBlur={handleBlur}
                                            error={errors.country} touched={touched.country}
                                            options={COUNTRY_OPTIONS}
                                        />
                                        {/* Con Colombia el departamento se elige de una lista, para que
                                            la base quede segmentable; fuera de Colombia se escribe,
                                            porque no tenemos el catálogo de cada país. */}
                                        {hasDepartmentList(form.country) ? (
                                            <Field
                                                as="select" label={departmentLabel(form.country)} name="department" icon={MapPin}
                                                value={form.department} onChange={handleChange} onBlur={handleBlur}
                                                error={errors.department} touched={touched.department}
                                                options={DEPARTMENT_OPTIONS}
                                            />
                                        ) : (
                                            <Field
                                                label={departmentLabel(form.country)} name="department" icon={MapPin}
                                                value={form.department} onChange={handleChange} onBlur={handleBlur}
                                                error={errors.department} touched={touched.department}
                                                placeholder="Escribe tu departamento, estado o provincia"
                                            />
                                        )}
                                        <Field label="Ciudad" name="city" icon={MapPin} value={form.city} onChange={handleChange} onBlur={handleBlur} error={errors.city} touched={touched.city} placeholder="Escribe el nombre de tu ciudad" />
                                    </div>

                                    <GroupTitle>Tu club en Rotary</GroupTitle>
                                    <div className="grid gap-5 sm:grid-cols-3">
                                        <Field
                                            label="Club Rotario" name="clubName" icon={Building2}
                                            value={form.clubName} onChange={handleChange} onBlur={handleBlur}
                                            error={errors.clubName} touched={touched.clubName}
                                            placeholder="Escribe el nombre de tu club"
                                            hint="El club con el que postulas el proyecto."
                                        />
                                        <Field
                                            as="select" label="Distrito" name="district" icon={MapPin}
                                            value={form.district} onChange={handleChange} onBlur={handleBlur}
                                            error={errors.district} touched={touched.district}
                                            options={config?.districts || []}
                                            hint="Distrito al que pertenece tu club."
                                        />
                                        <Field
                                            as="select" label="Rol dentro del club" name="clubRole" icon={Award}
                                            value={form.clubRole} onChange={handleChange} onBlur={handleBlur}
                                            error={errors.clubRole} touched={touched.clubRole}
                                            options={(config?.clubRoles || []).map(r => ({ value: r.key, label: r.label }))}
                                            hint="Tu cargo en la junta o tu condición de socia o socio."
                                        />
                                        {/* Sólo aparece con "Otro": pedir el cargo antes de saber que
                                            hace falta sería un campo vacío para casi todo el mundo. */}
                                        {form.clubRole === 'otro' && (
                                            <Field
                                                label="¿Cuál es tu cargo?" name="clubRoleOther" icon={Award}
                                                value={form.clubRoleOther} onChange={handleChange} onBlur={handleBlur}
                                                error={errors.clubRoleOther} touched={touched.clubRoleOther}
                                                placeholder="Escribe el cargo que ocupas en el club"
                                            />
                                        )}
                                    </div>

                                    <div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                                <KeyRound size={15} className="text-slate-400" /> Crea tu clave de acceso
                                            </p>
                                            <p className="mb-4 text-[13px] leading-relaxed text-slate-500">
                                                Con este correo y tu contraseña entrarás a tu panel para formular el proyecto
                                                después del pago. Podrás guardarlo y editarlo cuantas veces necesites.
                                            </p>
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Field label="Contraseña" name="password" type="password" value={form.password} onChange={handleChange} onBlur={handleBlur} error={errors.password} touched={touched.password} placeholder="Mínimo 8 caracteres" />
                                                <Field label="Repite la contraseña" name="passwordConfirm" type="password" value={form.passwordConfirm} onChange={handleChange} onBlur={handleBlur} error={errors.passwordConfirm} touched={touched.passwordConfirm} placeholder="Escríbela de nuevo" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="grid gap-5">
                                    <Field label="Nombre del proyecto" name="projectName" icon={ClipboardList} value={form.projectName} onChange={handleChange} onBlur={handleBlur} error={errors.projectName} touched={touched.projectName} placeholder="Escribe el nombre del proyecto que vas a inscribir" />
                                    <Field
                                        as="textarea" label="Descripción del proyecto" name="projectDescription" icon={FileText}
                                        value={form.projectDescription} onChange={handleChange} onBlur={handleBlur}
                                        error={errors.projectDescription} touched={touched.projectDescription} maxLength={8000}
                                        placeholder="Describe el problema que atiende, la comunidad beneficiada, las actividades principales, los resultados esperados y cómo se medirá el impacto."
                                        hint={`Estructura la propuesta de forma clara, medible y orientada al impacto comunitario. ${form.projectDescription.length}/8000 caracteres.`}
                                    />
                                    <div className="grid gap-5 sm:grid-cols-2">
                                        <Field
                                            as="select" label="Área de interés en Rotary" name="focusArea" icon={Target}
                                            value={form.focusArea} onChange={handleChange} onBlur={handleBlur}
                                            error={errors.focusArea} touched={touched.focusArea}
                                            options={(config?.focusAreas || []).map(a => ({ value: a.key, label: a.label }))}
                                            hint="Las siete Áreas de Enfoque de Rotary International."
                                        />
                                        <Field
                                            label="Presupuesto total (USD)" name="budgetUsd" icon={Wallet}
                                            value={form.budgetUsd} onChange={handleChange} onBlur={handleBlur}
                                            error={errors.budgetUsd} touched={touched.budgetUsd}
                                            placeholder="Ej: 25000" hint="Escribe en dólares estadounidenses el total del presupuesto."
                                        />
                                    </div>
                                    <Field
                                        as="textarea" label="Comentarios o solicitudes especiales (opcional)" name="notes" icon={MessageSquare}
                                        value={form.notes} onChange={handleChange} onBlur={handleBlur}
                                        rows={4} maxLength={2000}
                                        placeholder="Escríbenos aquí cualquier cosa que el comité deba saber sobre tu proyecto o tu participación."
                                        hint="Opcional. Queda guardado junto a tu postulación."
                                    />
                                </div>
                            )}

                            {step === 3 && (
                                <div>
                                    <p className="mb-5 text-[15px] text-slate-600">
                                        Revisa la información antes de finalizar. Puedes volver a los pasos anteriores para modificar
                                        cualquier dato; una vez confirmes, pasarás a la pantalla de pago.
                                    </p>

                                    <div className="rounded-xl border border-slate-200 p-5">
                                        <div className="mb-1 flex items-center justify-between">
                                            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                                                <User size={15} /> Representante del club
                                            </h3>
                                            <button type="button" onClick={() => setStep(1)} className="text-[13px] font-semibold text-slate-500 hover:text-slate-800">Editar</button>
                                        </div>
                                        <SummaryRow label="Nombre" value={`${form.firstName} ${form.lastName}`.trim()} />
                                        <SummaryRow label="Correo electrónico" value={form.email} />
                                        <SummaryRow label="Contacto / WhatsApp" value={form.phone} />
                                        <SummaryRow label="Club Rotario" value={form.clubName} />
                                        <SummaryRow label="Distrito" value={form.district} />
                                        <SummaryRow label="Rol en el club" value={clubRoleLabel} />
                                        <SummaryRow label="Ubicación" value={[form.city, form.department, form.country].filter(Boolean).join(', ')} />
                                        <SummaryRow label="Documento" value={`${idTypeLabel}${idTypeLabel ? ' ' : ''}${form.idNumber}`.trim()} />
                                    </div>

                                    <div className="mt-4 rounded-xl border border-slate-200 p-5">
                                        <div className="mb-1 flex items-center justify-between">
                                            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                                                <ClipboardList size={15} /> Proyecto
                                            </h3>
                                            <button type="button" onClick={() => setStep(2)} className="text-[13px] font-semibold text-slate-500 hover:text-slate-800">Editar</button>
                                        </div>
                                        <SummaryRow label="Nombre del proyecto" value={form.projectName} />
                                        <SummaryRow label="Área de interés" value={focusLabel} />
                                        <SummaryRow label="Presupuesto" value={`${fmtUsd(Number(form.budgetUsd.replace(/[^\d.]/g, '')) || 0)} USD`} />
                                        {form.notes.trim() && <SummaryRow label="Comentarios" value={form.notes.trim()} />}
                                        <div className="py-3">
                                            <p className="mb-1.5 text-[13px] font-medium uppercase tracking-wide text-slate-500">Descripción</p>
                                            <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{form.projectDescription}</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex items-center justify-between gap-4 rounded-xl px-5 py-4" style={{ background: `${BLUE}0f` }}>
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Valor de la inscripción</p>
                                            <p className="text-xl font-extrabold" style={{ color: BLUE }}>
                                                {priceMode === 'COP' ? `${fmtCop(amountCop)} COP` : `${fmtUsd(amountUsd)} USD`}
                                            </p>
                                        </div>
                                        {priceMode === 'COP' ? (
                                            <p className="text-right text-[13px] text-slate-500">
                                                {amountUsd ? <>Se cobra {fmtUsd(amountUsd)} USD<br /><span className="text-slate-400">TRM {fmtRate(trm?.rate)}</span></> : 'Consultando TRM…'}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            )}

                            {/* Navegación */}
                            <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-6">
                                <button
                                    type="button" onClick={goBack} disabled={step === 1}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-5 py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <ArrowLeft size={16} /> Anterior
                                </button>

                                {step < 3 ? (
                                    <button
                                        type="button" onClick={goNext}
                                        className="inline-flex items-center gap-1.5 rounded-xl px-7 py-3 text-[15px] font-bold text-white shadow-sm transition hover:opacity-90"
                                        style={{ background: BLUE }}
                                    >
                                        Siguiente <ArrowRight size={16} />
                                    </button>
                                ) : (
                                    <button
                                        type="button" onClick={handleSubmit} disabled={submitting}
                                        className="inline-flex items-center gap-2 rounded-xl px-7 py-3 text-[15px] font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
                                        style={{ background: BLUE }}
                                    >
                                        {submitting ? <><Loader2 size={17} className="animate-spin" /> Registrando…</> : <>Confirmar y continuar al pago <ArrowRight size={16} /></>}
                                    </button>
                                )}
                            </div>
                        </section>
                    </>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default FeriaProyectos;
