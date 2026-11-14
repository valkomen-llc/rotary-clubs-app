// ════════════════════════════════════════════════════════════════════
// Postulación de Proyectos — Feria de Proyectos Rotary Colombia
// v4.592.0 — Wizard público de inscripción (3 pasos + pago + confirmación).
// v4.1253 — POSTULAR NO EXIGE PAGAR. El paso final es «Confirmar y postular
// proyecto»: deja el proyecto Postulado con el pago Pendiente y muestra la
// confirmación. Pagar es una acción opcional («Realizar pago ahora») o
// posterior, desde el perfil. También se puede guardar un borrador.
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
// v4.980 — El desglose del recargo. Espejo del criterio del servidor: PINTA;
// lo que se cobra lo calcula el servidor al abrir el pago.
import { computeSurcharge, percentLabel } from '../lib/checkoutSurcharge';
import {
    ArrowLeft, ArrowRight, Building2, CheckCircle2, ClipboardList,
    CreditCard, ExternalLink, Loader2, Mail, MapPin,
    ShieldCheck, Target, User, Wallet, AlertCircle, Clock, FileText, KeyRound, LayoutDashboard, CalendarDays, Save,
    Globe, IdCard, Award,
} from 'lucide-react';
// La lista de países es la MISMA del selector de indicativo telefónico: una
// sola fuente, para que no se desincronicen dos catálogos de lo mismo.
import { COUNTRIES } from '../lib/countryPhones';
import { DEPARTMENT_LABEL, DEPARTMENT_OPTIONS, departmentPlaceholder, hasDepartmentList } from '../lib/colombiaGeo';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
// v4.1253 — Quien acaba de crear su cuenta al postular entra a su perfil sin
// volver a escribir la contraseña: el servidor devuelve el token del perfil.
import { PROJECT_FAIR_PORTAL_TOKEN_KEY } from '../lib/ctaLinks';
import { emitSessionChange } from '../lib/siteSession';
// Los campos son los del módulo compartido: el formulario de inscripción a
// un evento usa estos mismos componentes, no una copia parecida.
import { Field, PhoneField, SummaryRow, PASSWORD_MIN } from '../components/forms/FairField';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
// v4.1299 — El borrador local guarda la modalidad y una ficha por proyecto.
// El de la versión anterior (`_v1`) se migra al leerlo: su proyecto pasa a
// ser el primero.
const DRAFT_KEY = 'feria_proyectos_draft_v2';
const LEGACY_DRAFT_KEY = 'feria_proyectos_draft_v1';

const BLUE = '#17458F';
const GOLD = '#F7A81B';

interface Option { value: string; label: string }

/**
 * Un distrito con su catálogo de clubes. `clubs` puede venir vacío: entonces el
 * club se escribe a mano, que es como funcionó el formulario hasta v4.706.
 */
interface DistrictOption extends Option { clubs?: string[] }

/**
 * Valor reservado del desplegable de clubes: «mi club no está en la lista».
 *
 * POR QUÉ EXISTE. Un catálogo de clubes se queda viejo solo —se fundan clubes,
 * se fusionan, cambian de nombre— y esta es una inscripción que se paga: dejar
 * fuera a quien no figure en la lista es perder una postulación y ganar un
 * correo de soporte. Va de ÚLTIMO y con un clic extra, así que quien sí está en
 * la lista la usa; no es un atajo cómodo.
 */
const CLUB_OTRO = '__otro__';
interface FocusArea { key: string; label: string }

interface FairConfig {
    enabled: boolean;
    /** v4.1330 — ¿Recibe postulaciones NUEVAS? Lo calcula el servidor (apagada o fecha límite vencida). */
    applications?: { open: boolean; code: string | null; reason: string | null };
    edition: { number: number; ordinal: string; name: string; city: string; country: string; year: number; dates?: string; key: string };
    deadline: string | null;
    presentation: { minMinutes?: number; maxMinutes: number };
    registration: {
        priceMode?: 'COP' | 'USD'; amountCop: number; amountUsd?: number; currency: string; concept: string; maxProjectsPerClub: number; paymentDeadline?: string | null;
        /** v4.1299 — La tarifa especial del segundo proyecto, resuelta por el servidor. Ausente: un proyecto por club. */
        secondProject?: { enabled: boolean; amountCop: number; amountUsd: number; deadline: string | null } | null;
    };
    /** Las TASAS del recargo que se suma al valor al pagar (v4.980). Aditivo:
     *  ausente, el paso de pago se ve como antes. */
    surcharge?: { enabled: boolean; currency: string; lines: { key: string; label: string; percent: number; fixed: number }[] } | null;
    districts: DistrictOption[];
    idTypes: FocusArea[];
    clubRoles: FocusArea[];
    focusAreas: FocusArea[];
    redirect: { url: string; label: string; delaySeconds: number; name: string };
    content: {
        title: string; subtitle: string; intro: string;
        requirements: string[]; note: string; priorityNote: string;
        scheduleTitle?: string;
        schedule?: { date: string; label: string; prefix?: string }[];
        /** v4.1299 — Referencia visible a la tarifa especial. Vacía: se arma con los valores. */
        secondProjectNote?: string;
    };
    portal?: { path?: string; redirectAfterPayment?: boolean };
}

/** v4.1299 — La inscripción (uno o dos proyectos) tal como la resuelve el servidor. */
interface RegistrationView {
    id: string | null;
    modality: 'single' | 'double';
    count: number;
    currency: 'COP' | 'USD';
    lines: { submissionId: string; projectIndex: number; projectName: string; label: string; amount: number; paid: boolean; owes: boolean }[];
    total: number;
    paidTotal?: number;
    pendingTotal?: number;
    projects?: ({ id: string; publicRef: string; projectName: string; projectIndex: number } & Partial<ApplicationView>)[];
}

/** El estado de la postulación como lo resuelve el servidor (v4.1253). */
interface ApplicationView {
    projectState: string; projectStateLabel: string; applied: boolean; appliedAt: string | null;
    paymentStatus: string; paymentStatusLabel: string; owes: boolean;
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
    amountCop: number | null; amountUsd: number | null; amountReceived?: number | null;
    trmRate: number | null; trmDate: string | null; trmSource: string | null; trmFetchedAt: string | null;
    paidAt: string | null;
    createdAt?: string | null;
    registrationId?: string | null;
    projectIndex?: number;
}

/** La ficha de UN proyecto (v4.1299): hay una por proyecto postulado. */
type ProjectFields = { projectName: string; projectDescription: string; focusArea: string; budgetUsd: string };
const PROJECT_KEYS: (keyof ProjectFields)[] = ['projectName', 'projectDescription', 'focusArea', 'budgetUsd'];
const EMPTY_PROJECT: ProjectFields = { projectName: '', projectDescription: '', focusArea: '', budgetUsd: '' };
type Modality = 1 | 2;

type FormState = {
    firstName: string; lastName: string; email: string; phone: string;
    clubName: string; district: string;
    // Sólo de la pantalla: quien marcó que su club no aparece en el catálogo de
    // su distrito y lo va a escribir. NO se envía al servidor — lo que se
    // guarda es el nombre del club, venga de la lista o escrito a mano.
    clubNotListed: boolean;
    // v4.677 — Datos que hacían falta para facturar la inscripción y para
    // acreditar a quien llega a la feria.
    country: string; department: string; city: string; idType: string; idNumber: string;
    // Rol dentro del club. `clubRoleOther` sólo se usa —y sólo se exige—
    // cuando el rol elegido es "Otro".
    clubRole: string; clubRoleOther: string;
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
    clubName: '', district: '', clubNotListed: false,
    country: '', department: '', city: '', idType: '', idNumber: '',
    clubRole: '', clubRoleOther: '',
    password: '', passwordConfirm: '',
};

const STEP_FIELDS: Record<number, (keyof FormState)[]> = {
    // El orden es el mismo de la pantalla: primero la persona, después dónde
    // está, después su club, y al final el acceso.
    1: ['firstName', 'lastName', 'idType', 'idNumber', 'email', 'phone',
        'country', 'department', 'city',
        // El distrito va ANTES que el club: es lo que decide qué clubes se
        // ofrecen, y preguntar por el club primero obligaría a volver atrás.
        'district', 'clubName', 'clubRole', 'clubRoleOther',
        'password', 'passwordConfirm'],
    // v4.1299 — El paso 2 son las fichas de los proyectos (una o dos), con su
    // propia validación por ficha (`projectErrorsOf`).
    2: [],
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
const validateField = (name: keyof FormState | keyof ProjectFields, value: string, config: FairConfig | null): string | null => {
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
        case 'department': return v ? null : 'Indica tu departamento o estado.';
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

/** Los errores de UNA ficha de proyecto (v4.1299). */
const projectErrorsOf = (p: ProjectFields, config: FairConfig | null): Partial<Record<keyof ProjectFields, string | null>> =>
    Object.fromEntries(PROJECT_KEYS.map(k => [k, validateField(k, p[k], config)]));
/** Avance de una ficha: campos obligatorios sin error sobre el total. */
const projectProgress = (p: ProjectFields, config: FairConfig | null) => {
    const errs = projectErrorsOf(p, config);
    const ok = PROJECT_KEYS.filter(k => !errs[k]).length;
    return Math.round((ok / PROJECT_KEYS.length) * 100);
};

// ── Página ───────────────────────────────────────────────────────────
const FeriaProyectos = () => {
    // Suscripción al idioma: los formateadores de arriba leen el locale
    // activo, y sin esto la página no se repintaría al cambiarlo.
    useLang();
    const [config, setConfig] = useState<FairConfig | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    // v4.1253 — 'applied' (postulado, pago pendiente) y 'draft_saved' son las
    // dos salidas del wizard; 'payment' es opcional y 'confirmed' es el pago
    // ya confirmado.
    const [stage, setStage] = useState<'form' | 'applied' | 'draft_saved' | 'payment' | 'confirmed'>('form');
    const [application, setApplication] = useState<ApplicationView | null>(null);
    const [savingDraft, setSavingDraft] = useState(false);
    const [step, setStep] = useState(1);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    // v4.1299 — MODALIDAD y FICHAS. `projects` siempre tiene dos fichas: la
    // segunda se conserva aunque la modalidad vuelva a «un proyecto»
    // (quitarla por accidente no borra lo escrito); al enviar sólo viajan las
    // de la modalidad elegida.
    const [modality, setModality] = useState<Modality>(1);
    const [projects, setProjects] = useState<ProjectFields[]>([{ ...EMPTY_PROJECT }, { ...EMPTY_PROJECT }]);
    const [activeProject, setActiveProject] = useState(0);
    const [projectTouched, setProjectTouched] = useState<Record<number, Record<string, boolean>>>({});
    const [registration, setRegistration] = useState<RegistrationView | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [payLoading, setPayLoading] = useState(false);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [trm, setTrm] = useState<Trm | null>(null);
    // ⚠️ v4.982 — La TRM ya no tiene indicador de carga y no es un olvido: dejó
    // de gobernar el importe, así que nadie espera por ella para pagar. Se
    // consulta para mostrar un equivalente aproximado y, si no llega,
    // simplemente no se muestra.
    const [countdown, setCountdown] = useState<number | null>(null);
    const [portalPath, setPortalPath] = useState<string | null>(null);
    const topRef = useRef<HTMLDivElement>(null);
    // Al cambiar de paso se vuelve al inicio de la tarjeta del formulario, no
    // al tope de la página: si se subiera hasta arriba habría que pasar otra
    // vez por todo el texto informativo para retomar el diligenciamiento.
    const cardRef = useRef<HTMLElement>(null);

    const errors = useMemo(() => {
        const out: Partial<Record<keyof FormState, string | null>> = {};
        // `clubNotListed` es una bandera de la pantalla, no un dato que se
        // valide: dice de dónde viene el nombre del club, no cuál es.
        (Object.keys(form) as (keyof FormState)[]).forEach(k => {
            if (typeof form[k] !== 'string') return;
            out[k] = validateField(k, form[k] as string, config);
        });
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

    const secondEnabled = !!config?.registration?.secondProject?.enabled;
    const visibleProjects = useMemo(() => projects.slice(0, secondEnabled ? modality : 1), [projects, modality, secondEnabled]);
    const projectErrors = useMemo(() => visibleProjects.map(p => projectErrorsOf(p, config)), [visibleProjects, config]);
    const projectValid = useCallback((i: number) => PROJECT_KEYS.every(k => !projectErrors[i]?.[k]), [projectErrors]);

    const stepValid = useCallback(
        (n: number) => (n === 2
            ? visibleProjects.every((_, i) => projectValid(i))
            : STEP_FIELDS[n].every(f => !errors[f])),
        [errors, visibleProjects, projectValid]
    );

    // ── Carga de configuración ───────────────────────────────────────
    useEffect(() => {
        fetch(`${API}/project-fair/config`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((cfg: FairConfig) => setConfig(cfg))
            .catch(() => setGlobalError('No pudimos cargar la información de la convocatoria. Recarga la página.'))
            .finally(() => setLoadingConfig(false));
    }, []);

    const loadTrm = useCallback((force = false) => (
        fetch(`${API}/project-fair/trm${force ? '?force=true' : ''}`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((data: Trm) => { setTrm(data); return data; })
            .catch(() => { setTrm(null); return null; })
    ), []);

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
                    if (Array.isArray(draft?.projects)) {
                        setProjects([{ ...EMPTY_PROJECT, ...(draft.projects[0] || {}) }, { ...EMPTY_PROJECT, ...(draft.projects[1] || {}) }]);
                    }
                    if (draft?.modality === 2) setModality(2);
                    if (draft?.step && draft.step >= 1 && draft.step <= 3) setStep(draft.step);
                } else {
                    // El borrador de la versión anterior: su proyecto pasa a
                    // ser el primero. Nada escrito se pierde al desplegar.
                    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
                    if (legacy) {
                        const draft = JSON.parse(legacy);
                        const f = draft?.form || {};
                        const { projectName, projectDescription, focusArea, budgetUsd, ...identity } = f;
                        setForm({ ...EMPTY_FORM, ...identity });
                        setProjects([{ ...EMPTY_PROJECT, projectName: projectName || '', projectDescription: projectDescription || '', focusArea: focusArea || '', budgetUsd: budgetUsd || '' }, { ...EMPTY_PROJECT }]);
                        if (draft?.step && draft.step >= 1 && draft.step <= 3) setStep(draft.step);
                        localStorage.removeItem(LEGACY_DRAFT_KEY);
                    }
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
                if (data.registration) setRegistration(data.registration);
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
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: safe, projects, modality, step, savedAt: Date.now() }));
        } catch { /* cuota llena */ }
    }, [form, projects, modality, step, stage]);

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
                        if (data.registration) setRegistration(data.registration);
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
            : (config.redirect?.url || 'https://grants31a.org/');

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

    // Se espera al siguiente frame porque la tarjeta destino puede ser una
    // recién montada (la pantalla de pago reemplaza a la del wizard). El
    // `scroll-mt-*` de la tarjeta deja el margen necesario para que el menú
    // superior (sticky) no le tape el encabezado.
    const scrollToCard = () => requestAnimationFrame(() => {
        (cardRef.current || topRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setForm(prev => {
            // Cambiar de distrito descarta el club elegido: el que estaba
            // seleccionado pertenece al distrito anterior, y dejarlo puesto
            // enviaría una pareja distrito-club que se contradice —justo lo
            // que el servidor rechaza—. También se descarta el «no está en la
            // lista»: si el distrito nuevo sí tiene a ese club, corresponde
            // elegirlo del catálogo.
            if (name === 'district' && value !== prev.district) {
                return { ...prev, district: value, clubName: '', clubNotListed: false };
            }
            return { ...prev, [name]: value };
        });
        if (name === 'district') setTouched(prev => ({ ...prev, clubName: false }));
    };

    /**
     * El club se elige de una lista cuando su distrito tiene catálogo; si no,
     * se escribe. Es el ÚNICO sitio donde se decide, para que el campo, su
     * validación y el resumen no puedan discrepar.
     */
    const clubOptions = useMemo(
        () => (config?.districts || []).find(d => d.value === form.district)?.clubs || [],
        [config?.districts, form.district],
    );
    const clubAsList = clubOptions.length > 0 && !form.clubNotListed;
    const handleBlur = (e: React.FocusEvent<any>) => setTouched(prev => ({ ...prev, [e.target.name]: true }));

    // v4.1299 — La ficha activa del paso 2.
    const handleProjectChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setProjects(prev => prev.map((p, idx) => (idx === i ? { ...p, [name]: value } : p)));
    };
    const handleProjectBlur = (i: number) => (e: React.FocusEvent<any>) =>
        setProjectTouched(prev => ({ ...prev, [i]: { ...(prev[i] || {}), [e.target.name]: true } }));
    const touchProject = (i: number) => setProjectTouched(prev => ({ ...prev, [i]: Object.fromEntries(PROJECT_KEYS.map(k => [k, true])) }));

    /**
     * Cambiar de modalidad. De dos a uno se CONFIRMA si la segunda ficha tiene
     * algo escrito, y lo escrito se conserva: volver a «dos proyectos» lo
     * recupera. El total se actualiza en el acto.
     */
    const chooseModality = (m: Modality) => {
        if (m === modality) return;
        if (m === 1 && PROJECT_KEYS.some(k => String(projects[1]?.[k] || '').trim())) {
            const ok = window.confirm('Vas a postular un solo proyecto. La información del Proyecto 2 se conserva por si vuelves a elegir dos proyectos antes de enviar. ¿Continuar?');
            if (!ok) return;
        }
        setModality(m);
        setActiveProject(0);
    };

    const goNext = () => {
        const fields = STEP_FIELDS[step];
        if (!stepValid(step)) {
            setTouched(prev => ({ ...prev, ...Object.fromEntries(fields.map(f => [f, true])) }));
            if (step === 2) {
                // Se marca cada ficha y se salta a la primera incompleta.
                visibleProjects.forEach((_, i) => touchProject(i));
                const faltante = visibleProjects.findIndex((_, i) => !projectValid(i));
                if (faltante >= 0) setActiveProject(faltante);
            }
            return;
        }
        setStep(s => Math.min(3, s + 1));
        scrollToCard();
    };
    const goBack = () => { setStep(s => Math.max(1, s - 1)); scrollToCard(); };

    /**
     * Envía el wizard al servidor. Dos modos (v4.1253):
     *   - 'apply' → «Confirmar y postular proyecto». Exige todo y deja el
     *     proyecto Postulado con el pago Pendiente. NO abre la pasarela.
     *   - 'draft' → «Guardar borrador». Exige la identidad (para poder volver
     *     a su perfil) y el nombre del proyecto; lo demás puede faltar.
     */
    const sendWizard = async (mode: 'apply' | 'draft') => {
        if (mode === 'apply' && (!stepValid(1) || !stepValid(2))) {
            setStep(!stepValid(1) ? 1 : 2);
            setTouched(Object.fromEntries(Object.keys(form).map(k => [k, true])));
            visibleProjects.forEach((_, i) => touchProject(i));
            const faltante = visibleProjects.findIndex((_, i) => !projectValid(i));
            if (stepValid(1) && faltante >= 0) setActiveProject(faltante);
            return;
        }
        if (mode === 'draft' && (!stepValid(1) || visibleProjects.some(p => !p.projectName.trim()))) {
            setTouched(prev => ({ ...prev, ...Object.fromEntries(STEP_FIELDS[1].map(f => [f, true])) }));
            visibleProjects.forEach((_, i) => setProjectTouched(prev => ({ ...prev, [i]: { ...(prev[i] || {}), projectName: true } })));
            if (!stepValid(1)) setStep(1);
            setGlobalError(visibleProjects.length > 1
                ? 'Para guardar un borrador completa tus datos (paso 1) y escribe al menos el nombre de cada proyecto.'
                : 'Para guardar un borrador completa tus datos (paso 1) y escribe al menos el nombre del proyecto.');
            scrollToCard();
            return;
        }
        if (mode === 'apply') setSubmitting(true); else setSavingDraft(true);
        setGlobalError(null);
        try {
            const res = await fetch(`${API}/project-fair/submissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // `clubNotListed` es de la pantalla: dice de dónde salió el
                // nombre del club, no cuál es. Lo que se guarda es el nombre.
                body: JSON.stringify({
                    ...form, clubNotListed: undefined,
                    // v4.1299 — La identidad una vez y una ficha por proyecto.
                    modality: visibleProjects.length,
                    projects: visibleProjects.map(p => ({ ...p, budgetUsd: p.budgetUsd.replace(/[^\d.]/g, '') })),
                    mode,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const identityErrors = data?.fields && Object.keys(data.fields).filter(f => f !== 'modality').length > 0;
                const projectErrs: Record<string, string>[] = Array.isArray(data?.projects) ? data.projects : [];
                const firstBad = projectErrs.findIndex(e => e && Object.keys(e).length);
                if (identityErrors) {
                    setTouched(Object.fromEntries(Object.keys(form).map(k => [k, true])));
                    setStep(1);
                } else if (firstBad >= 0) {
                    visibleProjects.forEach((_, i) => touchProject(i));
                    setActiveProject(firstBad);
                    setStep(2);
                }
                // Correo ya registrado: se ofrece entrar al panel en vez de
                // dejar al club atascado en el formulario.
                if (res.status === 409) setPortalPath(data?.portalPath || '/mi-proyecto');
                throw new Error(data?.error || 'No pudimos registrar la postulación.');
            }
            setSubmission(data.submission);
            setApplication(data.application || null);
            setRegistration(data.registration || null);
            setPortalPath(null);
            if (data.trm) setTrm(data.trm);
            if (data.portalToken) {
                try { localStorage.setItem(PROJECT_FAIR_PORTAL_TOKEN_KEY, data.portalToken); emitSessionChange(); } catch { /* sin almacenamiento: entrará con su contraseña */ }
            }
            // Lo escrito ya está en el servidor: el borrador local sobra.
            try { localStorage.removeItem(DRAFT_KEY); } catch { /* nada que limpiar */ }
            setStage(mode === 'apply' ? 'applied' : 'draft_saved');
            scrollToCard();
        } catch (err: any) {
            setGlobalError(err?.message || 'No pudimos registrar la postulación.');
        } finally {
            setSubmitting(false);
            setSavingDraft(false);
        }
    };
    const handleSubmit = () => sendWizard('apply');
    const handleSaveDraft = () => sendWizard('draft');

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

    // ⚠️ v4.982 — EL PRECIO SE ANUNCIA Y SE COBRA EN LA MISMA MONEDA. En pesos,
    // el equivalente en dólares es INFORMATIVO: no es lo que se cobra, así que
    // la TRM ya no decide el importe ni puede impedir el pago.
    const priceMode = config?.registration?.priceMode === 'USD' ? 'USD' : 'COP';
    const amountCop = priceMode === 'COP' ? (config?.registration?.amountCop ?? 0) : null;

    // v4.1299 — EL DESGLOSE DE LA INSCRIPCIÓN: una línea por proyecto. Antes
    // de enviar sale de la configuración (para pintarlo mientras se arma); con
    // la inscripción ya creada, de lo que resolvió el servidor. El importe que
    // se cobra lo calcula SIEMPRE el servidor al abrir el pago.
    const secondAmount = priceMode === 'COP'
        ? (config?.registration?.secondProject?.amountCop ?? 0)
        : (config?.registration?.secondProject?.amountUsd ?? 0);
    const firstAmount = priceMode === 'COP' ? (amountCop ?? 0) : (config?.registration?.amountUsd ?? 0);
    const fmtPrice = (n: number | null | undefined) => (priceMode === 'COP' ? `${fmtCop(n)} COP` : `${fmtUsd(n)} USD`);
    const plannedLines = visibleProjects.map((p, i) => ({
        projectIndex: i + 1,
        label: i === 0 ? 'Primer proyecto' : 'Segundo proyecto',
        projectName: p.projectName,
        amount: i === 0 ? firstAmount : secondAmount,
    }));
    const orderLines = registration?.lines?.length
        ? registration.lines.filter(l => !l.paid || registration.lines.every(x => x.paid)).map(l => ({ projectIndex: l.projectIndex, label: l.label, projectName: l.projectName, amount: l.amount }))
        : plannedLines;
    const orderTotal = Math.round(orderLines.reduce((a, l) => a + (Number(l.amount) || 0), 0) * 100) / 100;
    const recargoOrden = computeSurcharge(orderTotal, config?.surcharge, priceMode, 'project_fair');
    const bundleTotal = Math.round((firstAmount + secondAmount) * 100) / 100;
    const secondNote = config?.content?.secondProjectNote?.trim()
        || `¡Postula dos proyectos de tu club por ${fmtPrice(bundleTotal)}!`;
    // Lo que se le cobra: el TOTAL, en la moneda del precio.
    const chargeLabel = priceMode === 'COP'
        ? `${fmtCop(recargoOrden.total)} COP`
        : `${fmtUsd(recargoOrden.total)} USD`;
    // Equivalente informativo del total, sólo para quien quiera ver a cuánto
    // sale hoy en dólares. No es el importe del cobro.
    const chargeUsdRef = priceMode === 'COP' && trm?.rate
        ? Math.round((recargoOrden.total / trm.rate) * 100) / 100
        : null;
    const focusLabelOf = (key: string) => config?.focusAreas.find(a => a.key === key)?.label || '';
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

    // v4.1330 — La fecha límite de postulación también cierra el formulario
    // (antes sólo `enabled`). Quien ACABA de postular (`submission`) sigue
    // viendo su confirmación aunque el reloj haya cruzado la fecha.
    const cerradaPorFecha = !!config && config.enabled !== false && config.applications?.open === false && !submission;
    if (config && (config.enabled === false || cerradaPorFecha)) {
        const portal = (config as any)?.portal?.path || '/mi-proyecto';
        return (
            <div className="min-h-screen bg-rotary-concrete">
                <Navbar />
                <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
                    <div className="max-w-lg rounded-2xl bg-white p-10 text-center shadow-sm">
                        <Clock className="mx-auto mb-4" size={40} style={{ color: BLUE }} />
                        <h1 className="mb-2 text-2xl font-bold text-slate-900">Convocatoria cerrada</h1>
                        {cerradaPorFecha ? (
                            <>
                                <p className="text-slate-600">
                                    {config.applications?.reason || 'La convocatoria para nuevas postulaciones ha finalizado.'}
                                </p>
                                <p className="mt-3 text-slate-600">
                                    Si tu club ya tiene un proyecto registrado, puedes seguir completándolo y actualizándolo desde tu panel.
                                </p>
                                <a href={portal} className="mt-5 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white shadow-sm hover:opacity-90" style={{ background: BLUE }}>
                                    Ir a Mi Proyecto
                                </a>
                            </>
                        ) : (
                            <p className="text-slate-600">
                                En este momento no estamos recibiendo postulaciones para la {config.edition?.name}.
                                Escríbenos si necesitas más información.
                            </p>
                        )}
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

                {/* ── v4.1253 — Postulado, con el pago pendiente ─────────── */}
                {stage === 'applied' && submission ? (
                    <AppliedScreen
                        submission={submission}
                        application={application}
                        registration={registration}
                        fmtPrice={fmtPrice}
                        editionName={config?.edition?.name || ''}
                        portalHref={config?.portal?.path || '/mi-proyecto'}
                        paymentDeadline={config?.registration?.paymentDeadline || null}
                        onPayNow={() => { setStage('payment'); scrollToCard(); }}
                        cardRef={cardRef}
                    />
                ) : stage === 'draft_saved' && submission ? (
                    <DraftSavedScreen submission={submission} portalHref={config?.portal?.path || '/mi-proyecto'} cardRef={cardRef} />
                ) : stage === 'confirmed' && submission ? (
                    <section className="rounded-2xl bg-white p-7 shadow-sm sm:p-10">
                        <div className="text-center">
                            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                                <CheckCircle2 size={38} className="text-emerald-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">¡Pago de inscripción confirmado!</h2>
                            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600">
                                Tu proyecto <strong>{submission.projectName}</strong> está postulado y confirmamos el
                                pago de la inscripción. Enviamos el comprobante a <strong>{submission.email}</strong>.
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
                            <SummaryRow label="Distrito Rotario" value={submission.district} />
                            <SummaryRow label="Club Rotario" value={submission.clubName} />
                            {registration && registration.count > 1 ? (
                                registration.lines.map(l => (
                                    <SummaryRow key={l.submissionId} label={l.label} value={`${l.projectName} · ${fmtPrice(l.amount)}`} />
                                ))
                            ) : (
                                <SummaryRow label="Área de enfoque" value={submission.focusAreaLabel || submission.focusArea} />
                            )}
                            {registration && registration.count > 1 ? (
                                <SummaryRow label="Valor de la inscripción" value={fmtPrice(registration.total)} />
                            ) : submission.amountCop ? (
                                <SummaryRow label="Valor de la inscripción" value={`${fmtCop(submission.amountCop)} COP`} />
                            ) : null}
                            {/* ⚠️ EL «VALOR PAGADO» SALE DE LO QUE SE COBRÓ, no del
                                precio: `amountUsd` es el equivalente del precio y
                                presentarlo acá afirmaría un importe en dólares sobre
                                un cobro que desde v4.982 sale en pesos. Las
                                inscripciones anteriores conservan su lectura de
                                siempre. */}
                            <SummaryRow
                                label="Valor pagado"
                                value={submission.amountReceived != null && submission.chargeCurrency
                                    ? `${submission.chargeCurrency === 'COP' ? fmtCop(submission.amountReceived) : fmtUsd(submission.amountReceived)} ${submission.chargeCurrency}`
                                    : `${fmtUsd(submission.amountUsd)} USD`}
                            />
                            {submission.trmRate && submission.chargeCurrency !== 'COP' ? (
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
                                <a href={config?.redirect?.url || 'https://grants31a.org/'} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: BLUE }}>
                                    {config?.redirect?.name || 'Rotary Grants 31A'} <ExternalLink size={11} className="inline" />
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
                                    {orderLines.length > 1
                                        ? <>Inscripción de <strong>{orderLines.length} proyectos</strong> · {submission.clubName}</>
                                        : <>Inscripción <strong>{submission.publicRef}</strong> · {submission.projectName}</>}
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
                                        ? <>{fmtCop(orderTotal)} <span className="text-lg font-bold">COP</span></>
                                        : <>{fmtUsd(orderTotal)} <span className="text-lg font-bold">USD</span></>}
                                </span>
                            </div>

                            {/* v4.1299 — Una línea por proyecto: se paga UNA sola vez por
                                los dos, y se ve por qué suma lo que suma. */}
                            {orderLines.length > 1 && (
                                <div className="mt-5 space-y-2 border-b border-slate-100 pb-5 text-[15px]">
                                    {orderLines.map(l => (
                                        <div key={l.projectIndex} className="flex items-start justify-between gap-4">
                                            <span className="text-slate-600">
                                                <span className="font-semibold text-slate-800">{l.label}</span>
                                                {l.projectName ? <span className="block text-[13px] text-slate-500">{l.projectName}</span> : null}
                                            </span>
                                            <span className="whitespace-nowrap font-semibold text-slate-900">{fmtPrice(l.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ⚠️ EL RECARGO SE MUESTRA ANTES DE ABRIR LA PASARELA, línea
                                por línea y con su porcentaje. El valor oficial de arriba
                                no cambia —es lo que se anuncia—; lo que se cobra es el
                                total de acá, y lo calcula el servidor. */}
                            {recargoOrden.lines.length > 0 && (
                                <div className="mt-5 space-y-2 border-b border-slate-100 pb-5 text-[15px]">
                                    {recargoOrden.lines.map(l => (
                                        <div key={l.key} className="flex items-center justify-between gap-4">
                                            <span className="text-slate-600">
                                                {l.label} <span className="text-slate-400">({percentLabel(l.percent)})</span>
                                            </span>
                                            <span className="font-semibold text-slate-900">
                                                {priceMode === 'COP' ? `${fmtCop(l.amount)} COP` : `${fmtUsd(l.amount)} USD`}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-2">
                                        <span className="font-bold text-slate-700">Total a pagar</span>
                                        <span className="text-lg font-extrabold" style={{ color: BLUE }}>
                                            {priceMode === 'COP' ? `${fmtCop(recargoOrden.total)} COP` : `${fmtUsd(recargoOrden.total)} USD`}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* ⚠️ v4.982 — ACÁ NO SE ANUNCIA NINGÚN COBRO EN DÓLARES.
                                El precio está fijado en pesos y se cobra en pesos; la
                                TRM quedó como referencia y no interviene en el importe.
                                Decir «se cobrará US$ X» era falso además de al revés:
                                la pasarela reconvertía ese dólar a pesos con su propia
                                tasa y el club terminaba viendo un valor distinto del
                                anunciado. */}
                            {priceMode === 'COP' ? (
                                <>
                                    <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
                                        El valor de la inscripción está fijado en <strong>pesos colombianos</strong> y así se
                                        cobra: <strong>{chargeLabel}</strong>. Si pagas con una tarjeta en otra moneda, la
                                        conversión la hace la pasarela con su tasa del momento.
                                    </p>
                                    {chargeUsdRef ? (
                                        <div className="mt-3 flex items-start justify-between gap-4 text-[13px]">
                                            <span className="text-slate-500">
                                                Equivalente aproximado
                                                <span className="block text-slate-400">
                                                    Referencia a TRM {fmtRate(trm?.rate)} del {fmtDateTime(trm?.fetchedAt)}
                                                    {trm?.source ? <><br />Fuente: {trm.source}</> : null}
                                                </span>
                                            </span>
                                            <span className="whitespace-nowrap font-semibold text-slate-500">
                                                ≈ {fmtUsd(chargeUsdRef)} USD
                                            </span>
                                        </div>
                                    ) : null}
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

                        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[13px] text-slate-500">
                            <ShieldCheck size={14} className="shrink-0" /> Pago seguro procesado por Stripe. El pago se confirma
                            únicamente cuando Stripe reporta la transacción exitosa.
                        </p>
                        {/* v4.1253 — PAGAR ES OPCIONAL. La postulación ya quedó
                            registrada; el club puede irse y pagar después desde
                            su perfil sin perder nada. */}
                        <div className="mt-6 rounded-xl bg-slate-50 px-4 py-4 text-center text-[14px] text-slate-600">
                            {orderLines.length > 1 ? <>Tus proyectos <strong>ya están postulados</strong>.</> : <>Tu proyecto <strong>ya está postulado</strong>.</>} Si prefieres, puedes pagar la inscripción más
                            tarde desde tu perfil: tu postulación permanece registrada.
                            <div className="mt-3">
                                <a href={config?.portal?.path || '/mi-proyecto'}
                                    className="inline-flex items-center gap-1.5 font-bold" style={{ color: BLUE }}>
                                    Pagar más tarde desde mi perfil <ArrowRight size={14} />
                                </a>
                            </div>
                        </div>
                    </section>
                ) : (
                    /* ── Introducción + wizard ──────────────────────────── */
                    <>
                        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                            {/* El nombre de la edición ya aparece en la cabecera: aquí
                                se muestra sólo el contenido, sin repetirlo. */}
                            <p className="text-[15px] leading-relaxed text-slate-600">{config?.content?.intro}</p>

                            {/* v4.1299 — La tarifa especial del segundo proyecto, con los
                                valores configurados. Sobrio: es una condición de la
                                convocatoria, no una promoción. */}
                            {secondEnabled && (
                                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3" style={{ borderColor: `${BLUE}33`, background: `${BLUE}08` }}>
                                    <p className="text-[15px] font-bold" style={{ color: BLUE }}>{secondNote}</p>
                                    <p className="text-[13px] text-slate-600">
                                        Primer proyecto {fmtPrice(firstAmount)} · segundo proyecto {fmtPrice(secondAmount)} adicionales.
                                    </p>
                                </div>
                            )}

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
                                        Paso {step} de 3 — {step === 1 ? 'Datos del representante del club y modalidad de postulación' : step === 2 ? (visibleProjects.length > 1 ? 'Datos de los proyectos' : 'Datos del proyecto') : 'Revisión y confirmación'}
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
                                                as="select" label={DEPARTMENT_LABEL} name="department" icon={MapPin}
                                                value={form.department} onChange={handleChange} onBlur={handleBlur}
                                                error={errors.department} touched={touched.department}
                                                options={DEPARTMENT_OPTIONS}
                                            />
                                        ) : (
                                            <Field
                                                label={DEPARTMENT_LABEL} name="department" icon={MapPin}
                                                value={form.department} onChange={handleChange} onBlur={handleBlur}
                                                error={errors.department} touched={touched.department}
                                                placeholder={departmentPlaceholder(form.country)}
                                            />
                                        )}
                                        <Field label="Ciudad" name="city" icon={MapPin} value={form.city} onChange={handleChange} onBlur={handleBlur} error={errors.city} touched={touched.city} placeholder="Escribe el nombre de tu ciudad" />
                                    </div>

                                    <GroupTitle>Tu club en Rotary</GroupTitle>
                                    <div className="grid gap-5 sm:grid-cols-3">
                                        {/* El distrito va PRIMERO: es lo que decide qué clubes se
                                            ofrecen a continuación. */}
                                        <Field
                                            as="select" label="Distrito Rotario" name="district" icon={MapPin}
                                            value={form.district} onChange={handleChange} onBlur={handleBlur}
                                            error={errors.district} touched={touched.district}
                                            options={(config?.districts || []).map(d => ({ value: d.value, label: d.label }))}
                                            hint="Distrito al que pertenece tu club."
                                        />
                                        {/* Desplegable cuando su distrito tiene catálogo cargado;
                                            texto libre cuando no lo tiene o cuando la persona marcó
                                            que su club no aparece. Es la misma casilla en los tres
                                            casos, para que el campo no se mueva de sitio. */}
                                        {clubAsList ? (
                                            <Field
                                                as="select" label="Club Rotario" name="clubName" icon={Building2}
                                                value={form.clubName}
                                                onChange={e => {
                                                    if (e.target.value === CLUB_OTRO) {
                                                        setForm(prev => ({ ...prev, clubNotListed: true, clubName: '' }));
                                                        setTouched(prev => ({ ...prev, clubName: false }));
                                                        return;
                                                    }
                                                    handleChange(e);
                                                }}
                                                onBlur={handleBlur}
                                                error={errors.clubName} touched={touched.clubName}
                                                options={[
                                                    ...clubOptions.map(c => ({ value: c, label: c })),
                                                    { value: CLUB_OTRO, label: 'Mi club no está en la lista' },
                                                ]}
                                                hint="El club con el que postulas el proyecto."
                                            />
                                        ) : (
                                            <div>
                                                <Field
                                                    label="Club Rotario" name="clubName" icon={Building2}
                                                    value={form.clubName} onChange={handleChange} onBlur={handleBlur}
                                                    error={errors.clubName} touched={touched.clubName}
                                                    placeholder="Escribe el nombre de tu club"
                                                    hint={form.clubNotListed
                                                        ? 'Escribe el nombre completo del club.'
                                                        : 'El club con el que postulas el proyecto.'}
                                                />
                                                {/* La vuelta atrás tiene que ser explícita: volver a
                                                    elegir el MISMO distrito no cambia nada, así que
                                                    sin este botón quien se equivocara al marcar «no
                                                    está en la lista» se quedaría escribiendo a mano. */}
                                                {form.clubNotListed && clubOptions.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setForm(prev => ({ ...prev, clubNotListed: false, clubName: '' }))}
                                                        className="mt-1.5 text-[13px] font-semibold text-blue-700 hover:underline"
                                                    >Elegir de la lista</button>
                                                )}
                                            </div>
                                        )}
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

                                    {/* ── v4.1299 — MODALIDAD DE POSTULACIÓN DEL CLUB ──────
                                        Después de identificar el club y antes de las fichas: es
                                        lo que decide cuántas fichas vienen en el paso 2 y cuánto
                                        vale la inscripción. El total se actualiza al elegir. */}
                                    {secondEnabled && (
                                        <>
                                            <GroupTitle>Modalidad de postulación del club</GroupTitle>
                                            <div>
                                                <p className="mb-3 text-[14px] leading-relaxed text-slate-600">
                                                    Para la {config?.edition?.name || 'Feria de Proyectos'}, cada club rotario podrá postular hasta dos
                                                    proyectos. El primer proyecto tiene un valor de <strong>{fmtPrice(firstAmount)}</strong> y el segundo
                                                    proyecto cuenta con una tarifa especial de <strong>{fmtPrice(secondAmount)}</strong> adicionales.
                                                </p>
                                                {/* v4.1300 — LAS TARJETAS DICEN CUÁNTOS PROYECTOS, NO CUÁNTO
                                                    CUESTAN. Las tarifas quedan en el texto de arriba (se
                                                    conocen) y vuelven a aparecer en la etapa de pago (se
                                                    confirman). Pedido del comité: que el precio no sea el
                                                    elemento dominante y que postular no se lea como una
                                                    obligación de pagar hoy. */}
                                                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Modalidad de postulación">
                                                    {([
                                                        { m: 1 as Modality, title: 'Postular un proyecto', detail: 'Registra y presenta una iniciativa de impacto de tu club rotario.' },
                                                        { m: 2 as Modality, title: 'Postular dos proyectos', detail: 'Registra dos iniciativas independientes de tu club rotario en una misma inscripción.' },
                                                    ]).map(opt => {
                                                        const active = modality === opt.m;
                                                        return (
                                                            <button
                                                                key={opt.m} type="button" role="radio" aria-checked={active}
                                                                onClick={() => chooseModality(opt.m)}
                                                                className={`rounded-xl border-2 p-4 text-left transition ${active ? 'bg-blue-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                                                style={active ? { borderColor: BLUE } : undefined}
                                                            >
                                                                <span className="flex items-center gap-2 text-[15px] font-bold text-slate-900">
                                                                    <span className="flex h-4 w-4 items-center justify-center rounded-full border-2" style={{ borderColor: active ? BLUE : '#cbd5e1' }}>
                                                                        {active && <span className="h-2 w-2 rounded-full" style={{ background: BLUE }} />}
                                                                    </span>
                                                                    {opt.title}
                                                                </span>
                                                                <span className="mt-1.5 block text-[14px] leading-relaxed text-slate-600">{opt.detail}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                {/* Postular no exige pagar (v4.1253): se dice acá, donde se
                                                    elige, para quitar la barrera de «necesito el dinero
                                                    antes de empezar». Sin precios. */}
                                                <p className="mt-3 flex items-start gap-2 text-[14px] leading-relaxed text-slate-600">
                                                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
                                                    <span><strong className="text-slate-800">Puedes comenzar ahora y pagar después.</strong> Tu información se guardará automáticamente para que completes tu inscripción cuando estés listo.</span>
                                                </p>
                                            </div>
                                        </>
                                    )}

                                    <div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                                <KeyRound size={15} className="text-slate-400" /> Crea tu clave de acceso
                                            </p>
                                            <p className="mb-4 text-[13px] leading-relaxed text-slate-500">
                                                Con este correo y tu contraseña entrarás a tu perfil para consultar tu postulación,
                                                formular el proyecto y pagar la inscripción cuando estés listo. Podrás guardarlo y
                                                editarlo cuantas veces necesites.
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
                                    {/* v4.1299 — Con dos proyectos, una pestaña por ficha con su
                                        avance: se navega entre las dos sin perder nada y se ve qué
                                        falta en cada una. Con uno, la ficha de siempre. */}
                                    {visibleProjects.length > 1 && (
                                        <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Proyectos">
                                            {visibleProjects.map((p, i) => {
                                                const pct = projectProgress(p, config);
                                                const active = activeProject === i;
                                                const incompleto = !projectValid(i) && projectTouched[i] && Object.keys(projectTouched[i]).length > 0;
                                                return (
                                                    <button
                                                        key={i} type="button" role="tab" aria-selected={active}
                                                        onClick={() => { setActiveProject(i); scrollToCard(); }}
                                                        className={`rounded-xl border-2 p-3 text-left transition ${active ? 'bg-blue-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                                        style={active ? { borderColor: BLUE } : undefined}
                                                    >
                                                        <span className="flex items-center justify-between gap-2">
                                                            <span className="text-[14px] font-bold text-slate-900">
                                                                Proyecto {i + 1} <span className="font-semibold text-slate-500">— {i === 0 ? 'Inscripción principal' : 'Inscripción adicional'}</span>
                                                            </span>
                                                            <span className={`text-[12px] font-bold ${pct === 100 ? 'text-emerald-600' : incompleto ? 'text-red-600' : 'text-slate-500'}`}>{pct}% completado</span>
                                                        </span>
                                                        <span className="mt-1 block truncate text-[13px] text-slate-500">{p.projectName || 'Sin nombre todavía'}</span>
                                                        <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                                                            <span className="block h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#10B981' : BLUE }} />
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {visibleProjects.map((p, i) => (i !== activeProject ? null : (
                                        <div key={i} className="grid gap-5" role="tabpanel">
                                            {visibleProjects.length > 1 && (
                                                <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                                                    Proyecto {i + 1} de {visibleProjects.length} — {i === 0 ? 'Inscripción principal' : 'Inscripción adicional'} · {fmtPrice(i === 0 ? firstAmount : secondAmount)}
                                                </p>
                                            )}
                                            <Field label="Nombre del proyecto" name="projectName" icon={ClipboardList} value={p.projectName} onChange={handleProjectChange(i)} onBlur={handleProjectBlur(i)} error={projectErrors[i]?.projectName} touched={projectTouched[i]?.projectName} placeholder="Escribe el nombre del proyecto que vas a inscribir" />
                                            <Field
                                                as="textarea" label="Descripción del proyecto" name="projectDescription" icon={FileText}
                                                value={p.projectDescription} onChange={handleProjectChange(i)} onBlur={handleProjectBlur(i)}
                                                error={projectErrors[i]?.projectDescription} touched={projectTouched[i]?.projectDescription} maxLength={8000}
                                                placeholder="Describe el problema que atiende, la comunidad beneficiada, las actividades principales, los resultados esperados y cómo se medirá el impacto."
                                                hint={`Estructura la propuesta de forma clara, medible y orientada al impacto comunitario. ${p.projectDescription.length}/8000 caracteres.`}
                                            />
                                            <div className="grid gap-5 sm:grid-cols-2">
                                                <Field
                                                    as="select" label="Área de interés en Rotary" name="focusArea" icon={Target}
                                                    value={p.focusArea} onChange={handleProjectChange(i)} onBlur={handleProjectBlur(i)}
                                                    error={projectErrors[i]?.focusArea} touched={projectTouched[i]?.focusArea}
                                                    options={(config?.focusAreas || []).map(a => ({ value: a.key, label: a.label }))}
                                                    hint="Las siete Áreas de Enfoque de Rotary International."
                                                />
                                                <Field
                                                    label="Presupuesto total (USD)" name="budgetUsd" icon={Wallet}
                                                    value={p.budgetUsd} onChange={handleProjectChange(i)} onBlur={handleProjectBlur(i)}
                                                    error={projectErrors[i]?.budgetUsd} touched={projectTouched[i]?.budgetUsd}
                                                    placeholder="Ej: 25000" hint="Escribe en dólares estadounidenses el total del presupuesto."
                                                />
                                            </div>
                                            {visibleProjects.length > 1 && (
                                                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[13px]">
                                                    <span className="text-slate-500">
                                                        {projectValid(i) ? <span className="font-semibold text-emerald-600">Esta ficha está completa.</span> : 'Completa los campos de esta ficha antes de continuar.'}
                                                    </span>
                                                    {i < visibleProjects.length - 1 ? (
                                                        <button type="button" onClick={() => { setActiveProject(i + 1); scrollToCard(); }} className="inline-flex items-center gap-1 font-bold" style={{ color: BLUE }}>
                                                            Ir al Proyecto {i + 2} <ArrowRight size={14} />
                                                        </button>
                                                    ) : (
                                                        <button type="button" onClick={() => { setActiveProject(0); scrollToCard(); }} className="inline-flex items-center gap-1 font-bold" style={{ color: BLUE }}>
                                                            <ArrowLeft size={14} /> Volver al Proyecto 1
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )))}
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
                                        <SummaryRow label="Distrito Rotario" value={form.district} />
                                        <SummaryRow label="Club Rotario" value={form.clubName} />
                                        <SummaryRow label="Rol en el club" value={clubRoleLabel} />
                                        <SummaryRow label="Ubicación" value={[form.city, form.department, form.country].filter(Boolean).join(', ')} />
                                        <SummaryRow label="Documento" value={`${idTypeLabel}${idTypeLabel ? ' ' : ''}${form.idNumber}`.trim()} />
                                    </div>

                                    {visibleProjects.map((p, i) => (
                                        <div key={i} className="mt-4 rounded-xl border border-slate-200 p-5">
                                            <div className="mb-1 flex items-center justify-between">
                                                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                                                    <ClipboardList size={15} /> {visibleProjects.length > 1 ? `Proyecto ${i + 1} — ${i === 0 ? 'Inscripción principal' : 'Inscripción adicional'}` : 'Proyecto'}
                                                </h3>
                                                <button type="button" onClick={() => { setActiveProject(i); setStep(2); }} className="text-[13px] font-semibold text-slate-500 hover:text-slate-800">Editar</button>
                                            </div>
                                            <SummaryRow label="Nombre del proyecto" value={p.projectName} />
                                            <SummaryRow label="Área de interés" value={focusLabelOf(p.focusArea)} />
                                            <SummaryRow label="Presupuesto" value={`${fmtUsd(Number(p.budgetUsd.replace(/[^\d.]/g, '')) || 0)} USD`} />
                                            <div className="py-3">
                                                <p className="mb-1.5 text-[13px] font-medium uppercase tracking-wide text-slate-500">Descripción</p>
                                                <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{p.projectDescription}</p>
                                            </div>
                                        </div>
                                    ))}

                                    {/* v4.1299 — RESUMEN DE INSCRIPCIÓN: club, distrito, cuántos
                                        proyectos y cuáles. v4.1300 — El valor va como una sola línea
                                        de referencia, discreta: postular no exige pagar, y el
                                        desglose completo se muestra en la etapa de pago. */}
                                    <div className="mt-4 rounded-xl px-5 py-4" style={{ background: `${BLUE}0f` }}>
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resumen de inscripción</p>
                                        <div className="mt-2 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2">
                                            <p className="text-slate-600">Club Rotario · <span className="font-semibold text-slate-800">{form.clubName}</span></p>
                                            <p className="text-slate-600">Distrito · <span className="font-semibold text-slate-800">{form.district}</span></p>
                                            <p className="text-slate-600">Cantidad de proyectos · <span className="font-semibold text-slate-800">{visibleProjects.length}</span></p>
                                        </div>
                                        {visibleProjects.length > 1 && (
                                            <div className="mt-2 space-y-0.5 text-[14px] text-slate-600">
                                                {plannedLines.map(l => (
                                                    <p key={l.projectIndex}>{l.label} · <span className="font-semibold text-slate-800">{l.projectName}</span></p>
                                                ))}
                                            </div>
                                        )}
                                        <p className="mt-3 border-t border-slate-200/70 pt-3 text-[13px] leading-relaxed text-slate-500">
                                            Valor de inscripción de referencia: <span className="font-semibold text-slate-700">{fmtPrice(orderTotal)}</span>
                                            {visibleProjects.length > 1 ? ` (${plannedLines.map(l => `${l.label.toLowerCase()} ${fmtPrice(l.amount)}`).join(' + ')})` : ''}.
                                            {' '}Postular no requiere pagar ahora: el pago se realiza después, desde tu perfil, y ahí verás el desglose completo.
                                        </p>
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

                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    {/* v4.1253 — Guardar un borrador: el club puede dejar
                                        el proyecto a medias y terminarlo desde su perfil.
                                        Se ofrece desde el paso 2, cuando ya hay con qué
                                        crear su cuenta. */}
                                    {step >= 2 && (
                                        <button
                                            type="button" onClick={handleSaveDraft} disabled={savingDraft || submitting}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-5 py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                                        >
                                            {savingDraft ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : <><Save size={16} /> Guardar borrador</>}
                                        </button>
                                    )}
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
                                            type="button" onClick={handleSubmit} disabled={submitting || savingDraft}
                                            className="inline-flex items-center gap-2 rounded-xl px-7 py-3 text-[15px] font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
                                            style={{ background: BLUE }}
                                        >
                                            {submitting ? <><Loader2 size={17} className="animate-spin" /> Postulando…</> : <>{visibleProjects.length > 1 ? 'Confirmar y postular los proyectos' : 'Confirmar y postular proyecto'} <ArrowRight size={16} /></>}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {step === 3 && (
                                <p className="mt-3 text-right text-[13px] text-slate-500">
                                    Postular no requiere pagar ahora: podrás pagar la inscripción después, desde tu perfil.
                                </p>
                            )}
                        </section>
                    </>
                )}
            </main>

            <Footer />
        </div>
    );
};

// ── Pantallas de salida del wizard (v4.1253) ─────────────────────────
// Van en el ámbito del MÓDULO: declaradas dentro de la página serían un tipo
// nuevo en cada render (la lección de v4.971).

/**
 * «¡Tu proyecto ha sido postulado exitosamente!». Dice los DOS estados por
 * separado —el del proyecto y el de la inscripción— y ofrece pagar como una
 * acción opcional. Cerrar la página aquí no pierde nada.
 */
const AppliedScreen = ({ submission, application, registration, fmtPrice, editionName, portalHref, paymentDeadline, onPayNow, cardRef }: {
    submission: Submission; application: ApplicationView | null; registration: RegistrationView | null; fmtPrice: (n: number | null | undefined) => string;
    editionName: string; portalHref: string;
    paymentDeadline: string | null; onPayNow: () => void; cardRef: React.RefObject<HTMLElement | null>;
}) => (
    <section ref={cardRef} className="scroll-mt-32 rounded-2xl bg-white p-6 shadow-sm sm:p-10">
        <div className="text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 size={38} className="text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                {registration && registration.count > 1 ? '¡Tus proyectos han sido postulados exitosamente!' : '¡Tu proyecto ha sido postulado exitosamente!'}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600">
                Hemos recibido la postulación de {registration && registration.count > 1 ? 'tus proyectos' : 'tu proyecto'} para la <strong>{editionName || 'Feria de Proyectos'}</strong>.
                {registration && registration.count > 1 ? ' Quedaron registrados en nuestra plataforma, cada uno con su propio código, y podrás gestionarlos por separado desde tu perfil.' : ' Tu proyecto ha quedado registrado en nuestra plataforma y podrás consultar su estado desde tu perfil.'}
            </p>
            {registration && registration.count > 1 ? (
                <div className="mx-auto mt-6 grid max-w-xl gap-3 sm:grid-cols-2">
                    {(registration.projects || []).map(p => (
                        <div key={p.id} className="rounded-xl px-5 py-4 text-left" style={{ background: `${GOLD}1f` }}>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Proyecto {p.projectIndex} · código</p>
                            <p className="mt-1 text-2xl font-extrabold tracking-wider" style={{ color: BLUE }}>{p.publicRef}</p>
                            <p className="mt-1 text-[13px] font-semibold text-slate-700">{p.projectName}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="mx-auto mt-6 max-w-sm rounded-xl px-6 py-4" style={{ background: `${GOLD}1f` }}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Código de postulación</p>
                    <p className="mt-1 text-3xl font-extrabold tracking-wider" style={{ color: BLUE }}>{submission.publicRef}</p>
                </div>
            )}
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 p-5">
            {registration && registration.count > 1
                ? registration.lines.map(l => <SummaryRow key={l.submissionId} label={l.label} value={`${l.projectName} · ${fmtPrice(l.amount)}`} />)
                : <SummaryRow label="Nombre del proyecto" value={submission.projectName} />}
            {registration && registration.count > 1 ? <SummaryRow label="Total de inscripción" value={<span style={{ color: BLUE }}>{fmtPrice(registration.total)}</span>} /> : null}
            <SummaryRow label="Club Rotario" value={submission.clubName} />
            <SummaryRow label="Responsable" value={`${submission.firstName} ${submission.lastName}`} />
            <SummaryRow label="Fecha de postulación" value={fmtDateTime(application?.appliedAt || submission.createdAt || null)} />
            <SummaryRow label="Estado del proyecto" value={<span style={{ color: BLUE }}>{application?.projectStateLabel || 'Postulado'}</span>} />
            <SummaryRow label="Estado de inscripción" value={<span className="text-amber-700">Pago pendiente</span>} />
            {paymentDeadline ? <SummaryRow label="Fecha límite de pago" value={fmtDate(paymentDeadline)} /> : null}
        </div>

        <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-[14px] leading-relaxed text-slate-600">
            Enviamos la confirmación a <strong>{submission.email}</strong>. El pago de la inscripción es independiente de
            la postulación: puedes realizarlo ahora o más tarde desde tu perfil. Tu postulación permanece registrada
            aunque todavía no hayas pagado.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <a href={portalHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:opacity-90"
                style={{ background: BLUE }}>
                <LayoutDashboard size={17} /> Ir a mi perfil
            </a>
            <a href={portalHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 px-5 py-3 text-[15px] font-bold transition hover:bg-slate-50"
                style={{ borderColor: BLUE, color: BLUE }}>
                <FileText size={17} /> {registration && registration.count > 1 ? 'Ver mis proyectos' : 'Ver mi proyecto'}
            </a>
            <button type="button" onClick={onPayNow}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50">
                <CreditCard size={17} /> Realizar pago ahora
            </button>
        </div>
        <p className="mt-3 text-center text-[13px] text-slate-500">
            Realizar el pago ahora es opcional. Puedes cerrar esta página: tu postulación queda guardada.
        </p>
    </section>
);

/** El borrador quedó guardado: se termina y se envía desde el perfil. */
const DraftSavedScreen = ({ submission, portalHref, cardRef }: {
    submission: Submission; portalHref: string; cardRef: React.RefObject<HTMLElement | null>;
}) => (
    <section ref={cardRef} className="scroll-mt-32 rounded-2xl bg-white p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: `${BLUE}14` }}>
            <Save size={30} style={{ color: BLUE }} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Borrador guardado</h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600">
            Guardamos el borrador del proyecto <strong>{submission.projectName}</strong>. Todavía <strong>no está
            postulado</strong>: entra a tu perfil cuando quieras para completarlo y enviarlo.
        </p>
        <p className="mt-4 text-[13px] text-slate-500">
            Código: <strong>{submission.publicRef}</strong> · Ingresas con <strong>{submission.email}</strong> y la contraseña que creaste.
        </p>
        <a href={portalHref}
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:opacity-90"
            style={{ background: BLUE }}>
            Ir a mi perfil y continuar <ArrowRight size={17} />
        </a>
    </section>
);

export default FeriaProyectos;
