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
import {
    ArrowLeft, ArrowRight, Building2, Calendar, CheckCircle2, ClipboardList,
    CreditCard, ExternalLink, Loader2, Mail, MapPin, Phone, RefreshCw,
    ShieldCheck, Target, User, Wallet, AlertCircle, Clock, FileText,
} from 'lucide-react';
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
    presentation: { maxMinutes: number };
    registration: { amountCop: number; currency: string; concept: string; maxProjectsPerClub: number };
    districts: Option[];
    focusAreas: FocusArea[];
    redirect: { url: string; label: string; delaySeconds: number; name: string };
    content: {
        title: string; subtitle: string; intro: string;
        requirements: string[]; note: string; priorityNote: string;
    };
}

interface Trm {
    rate: number; date: string; source: string; fetchedAt: string;
    amountCop?: number; amountUsd?: number | null; stale?: boolean;
}

interface Submission {
    id: string; publicRef: string; status: string;
    firstName: string; lastName: string; email: string; phone: string;
    clubName: string; district: string;
    projectName: string; projectDescription: string;
    focusArea: string; focusAreaLabel: string | null; budgetUsd: number | null;
    amountCop: number | null; amountUsd: number | null;
    trmRate: number | null; trmDate: string | null; trmSource: string | null; trmFetchedAt: string | null;
    paidAt: string | null;
}

type FormState = {
    firstName: string; lastName: string; email: string; phone: string;
    clubName: string; district: string;
    projectName: string; projectDescription: string; focusArea: string; budgetUsd: string;
};

const EMPTY_FORM: FormState = {
    firstName: '', lastName: '', email: '', phone: '',
    clubName: '', district: '',
    projectName: '', projectDescription: '', focusArea: '', budgetUsd: '',
};

const STEP_FIELDS: Record<number, (keyof FormState)[]> = {
    1: ['firstName', 'lastName', 'email', 'phone', 'clubName', 'district'],
    2: ['projectName', 'projectDescription', 'focusArea', 'budgetUsd'],
    3: [],
};

const fmtCop = (n: number | null | undefined) =>
    `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
const fmtUsd = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRate = (n: number | null | undefined) =>
    n ? Number(n).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
};
const fmtDate = (value: string | null | undefined) => {
    if (!value) return '';
    const d = new Date(`${value}T12:00:00`);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
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
        case 'projectName': return v ? null : 'Escribe el nombre del proyecto.';
        case 'projectDescription':
            if (!v) return 'Describe el proyecto.';
            return v.length >= 40 ? null : `Amplía la descripción (mínimo 40 caracteres, llevas ${v.length}).`;
        case 'focusArea':
            if (!v) return 'Selecciona el área de enfoque del proyecto.';
            return (config?.focusAreas || []).some(a => a.key === v) ? null : 'Selecciona un área válida.';
        case 'budgetUsd': {
            if (!v) return 'Indica el presupuesto total en USD.';
            const n = Number(v.replace(/[^\d.]/g, ''));
            return n > 0 ? null : 'El presupuesto debe ser mayor a 0.';
        }
        default: return null;
    }
};

// ── Piezas de UI ─────────────────────────────────────────────────────
const Field = ({
    label, name, value, onChange, onBlur, error, touched, required = true,
    type = 'text', placeholder, icon: Icon, hint, as = 'input', options, rows = 6, maxLength,
}: any) => {
    const invalid = touched && error;
    const base = `w-full rounded-xl border px-4 py-3 text-[15px] text-slate-900 bg-white transition
        placeholder:text-slate-400 focus:outline-none focus:ring-2
        ${invalid ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-[#17458F] focus:ring-[#17458F]/20'}`;
    return (
        <div>
            <label htmlFor={name} className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                {Icon && <Icon size={15} className="text-slate-400" />}
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            {as === 'textarea' ? (
                <textarea
                    id={name} name={name} value={value} onChange={onChange} onBlur={onBlur}
                    rows={rows} maxLength={maxLength} placeholder={placeholder}
                    className={`${base} resize-y leading-relaxed`}
                />
            ) : as === 'select' ? (
                <select id={name} name={name} value={value} onChange={onChange} onBlur={onBlur} className={`${base} cursor-pointer`}>
                    <option value="">- Seleccione -</option>
                    {(options || []).map((o: Option) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            ) : (
                <input
                    id={name} name={name} type={type} value={value} onChange={onChange} onBlur={onBlur}
                    placeholder={placeholder} inputMode={type === 'number' ? 'decimal' : undefined}
                    className={base} autoComplete="off"
                />
            )}
            {invalid ? (
                <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-red-600">
                    <AlertCircle size={13} /> {error}
                </p>
            ) : hint ? (
                <p className="mt-1.5 text-[13px] text-slate-500">{hint}</p>
            ) : null}
        </div>
    );
};

const SummaryRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <span className="text-[13px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-[15px] font-semibold text-slate-900 sm:max-w-[62%] sm:text-right">{value || '—'}</span>
    </div>
);

// ── Página ───────────────────────────────────────────────────────────
const FeriaProyectos = () => {
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
    const topRef = useRef<HTMLDivElement>(null);

    const errors = useMemo(() => {
        const out: Partial<Record<keyof FormState, string | null>> = {};
        (Object.keys(form) as (keyof FormState)[]).forEach(k => { out[k] = validateField(k, form[k], config); });
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
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, step, savedAt: Date.now() })); } catch { /* cuota llena */ }
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

    // Redirección automática a Rotary Grants tras confirmar el pago.
    useEffect(() => {
        if (stage !== 'confirmed' || !config) return;
        const delay = Math.max(3, Number(config.redirect?.delaySeconds) || 8);
        setCountdown(delay);
        const tick = setInterval(() => {
            setCountdown(prev => {
                if (prev === null) return null;
                if (prev <= 1) {
                    clearInterval(tick);
                    window.location.href = config.redirect?.url || 'https://grants25a.org/';
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(tick);
    }, [stage, config]);

    const scrollTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
        scrollTop();
    };
    const goBack = () => { setStep(s => Math.max(1, s - 1)); scrollTop(); };

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
                throw new Error(data?.error || 'No pudimos registrar la inscripción.');
            }
            setSubmission(data.submission);
            if (data.trm) setTrm(data.trm);
            else loadTrm();
            setStage('payment');
            scrollTop();
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

    const amountCop = config?.registration?.amountCop ?? 0;
    const amountUsd = trm?.rate ? Math.round((amountCop / trm.rate) * 100) / 100 : null;
    const focusLabel = config?.focusAreas.find(a => a.key === form.focusArea)?.label || '';
    const progress = stage === 'form' ? Math.round((step / 3) * 100) : 100;

    if (loadingConfig) {
        return (
            <div className="min-h-screen bg-slate-50">
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
            <div className="min-h-screen bg-slate-50">
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
        <div className="min-h-screen bg-slate-100" ref={topRef}>
            <Navbar />

            {/* Cabecera de la convocatoria */}
            <header style={{ background: BLUE }} className="px-4 py-8 text-white sm:px-6 sm:py-10">
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
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" /> <span>{globalError}</span>
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
                            <SummaryRow label="Valor pagado" value={`${fmtCop(submission.amountCop)} COP`} />
                            {submission.trmRate ? (
                                <SummaryRow
                                    label="TRM aplicada"
                                    value={`${fmtRate(submission.trmRate)} COP/USD${submission.amountUsd ? ` · ${fmtUsd(submission.amountUsd)} USD` : ''}`}
                                />
                            ) : null}
                            <SummaryRow label="Fecha del pago" value={fmtDateTime(submission.paidAt)} />
                        </div>

                        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                            <p className="text-[15px] leading-relaxed text-slate-700">
                                Serás dirigido al portal oficial de <strong>{config?.redirect?.name || 'Rotary Grants 25A'}</strong> para
                                continuar con el proceso de registro internacional
                                {countdown !== null && countdown > 0 ? <> en <strong>{countdown}</strong> segundo{countdown === 1 ? '' : 's'}</> : null}.
                            </p>
                            <a
                                href={config?.redirect?.url || 'https://grants25a.org/'}
                                className="mt-5 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:opacity-90"
                                style={{ background: BLUE }}
                            >
                                {config?.redirect?.label || 'Continuar hacia Rotary Grants 25A'} <ExternalLink size={17} />
                            </a>
                            <p className="mt-3 text-[13px] text-slate-500">
                                Si la redirección no ocurre automáticamente, usa el botón.
                            </p>
                        </div>
                    </section>
                ) : stage === 'payment' && submission ? (
                    /* ── Pantalla de pago ───────────────────────────────── */
                    <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
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
                                    {fmtCop(amountCop)} <span className="text-lg font-bold">COP</span>
                                </span>
                            </div>

                            <div className="mt-5 space-y-3 text-[15px]">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-slate-600">TRM vigente</span>
                                    <span className="font-semibold text-slate-900">
                                        {trmLoading ? <Loader2 size={15} className="animate-spin" /> : `${fmtRate(trm?.rate)} COP/USD`}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-slate-600">Valor equivalente (informativo)</span>
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
                                El cobro se realiza en <strong>pesos colombianos (COP)</strong>. El valor en dólares es
                                únicamente informativo para usuarios internacionales y se calcula con la TRM vigente del día.
                            </p>
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
                            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                                {config?.content?.subtitle || config?.edition?.name}
                            </h2>
                            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{config?.content?.intro}</p>

                            <p className="mt-4 text-[15px] leading-relaxed text-slate-600">{config?.content?.note}</p>

                            <ul className="mt-5 space-y-2.5">
                                {(config?.content?.requirements || []).map((r, i) => (
                                    <li key={i} className="flex items-start gap-2.5 text-[15px] text-slate-700">
                                        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                                        <span>{r}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                {config?.deadline && (
                                    <div className="flex items-center gap-3 rounded-xl px-4 py-3.5" style={{ background: `${BLUE}0f` }}>
                                        <Calendar size={19} style={{ color: BLUE }} />
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Plazo límite de inscripción</p>
                                            <p className="text-[15px] font-bold" style={{ color: BLUE }}>{fmtDate(config.deadline)}</p>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center gap-3 rounded-xl px-4 py-3.5" style={{ background: `${GOLD}1f` }}>
                                    <Clock size={19} className="text-amber-700" />
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tiempo de presentación</p>
                                        <p className="text-[15px] font-bold text-amber-800">
                                            Máximo {config?.presentation?.maxMinutes || 5} minutos por proyecto
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {config?.content?.priorityNote && (
                                <p className="mt-5 rounded-xl border-l-4 bg-slate-50 px-4 py-3 text-[14px] leading-relaxed text-slate-600" style={{ borderColor: GOLD }}>
                                    {config.content.priorityNote}
                                </p>
                            )}
                        </section>

                        <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                            {/* Barra de progreso */}
                            <div className="mb-7">
                                <div className="mb-2 flex items-center justify-between text-sm">
                                    <span className="font-semibold text-slate-700">
                                        Paso {step} de 3 — {step === 1 ? 'Datos del representante' : step === 2 ? 'Datos del proyecto' : 'Revisión y confirmación'}
                                    </span>
                                    <span className="font-bold" style={{ color: BLUE }}>{progress}%</span>
                                </div>
                                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: BLUE }} />
                                </div>
                            </div>

                            {step === 1 && (
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field label="Nombre" name="firstName" icon={User} value={form.firstName} onChange={handleChange} onBlur={handleBlur} error={errors.firstName} touched={touched.firstName} placeholder="Introduce tu primer nombre" />
                                    <Field label="Apellido" name="lastName" icon={User} value={form.lastName} onChange={handleChange} onBlur={handleBlur} error={errors.lastName} touched={touched.lastName} placeholder="Escribe tu primer apellido" />
                                    <Field label="Correo electrónico" name="email" type="email" icon={Mail} value={form.email} onChange={handleChange} onBlur={handleBlur} error={errors.email} touched={touched.email} placeholder="nombre@correo.com" />
                                    <Field label="Número de contacto o WhatsApp" name="phone" icon={Phone} value={form.phone} onChange={handleChange} onBlur={handleBlur} error={errors.phone} touched={touched.phone} placeholder="+57 300 000 0000" />
                                    <Field label="Club Rotario con el que postula el proyecto" name="clubName" icon={Building2} value={form.clubName} onChange={handleChange} onBlur={handleBlur} error={errors.clubName} touched={touched.clubName} placeholder="Escribe el nombre del club al que perteneces" />
                                    <Field as="select" label="Distrito al que pertenece el Club Rotario" name="district" icon={MapPin} value={form.district} onChange={handleChange} onBlur={handleBlur} error={errors.district} touched={touched.district} options={config?.districts || []} />
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
                                        <div className="py-3">
                                            <p className="mb-1.5 text-[13px] font-medium uppercase tracking-wide text-slate-500">Descripción</p>
                                            <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{form.projectDescription}</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex items-center justify-between gap-4 rounded-xl px-5 py-4" style={{ background: `${BLUE}0f` }}>
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Valor de la inscripción</p>
                                            <p className="text-xl font-extrabold" style={{ color: BLUE }}>{fmtCop(amountCop)} COP</p>
                                        </div>
                                        <p className="text-right text-[13px] text-slate-500">
                                            {amountUsd ? <>≈ {fmtUsd(amountUsd)} USD<br /><span className="text-slate-400">TRM {fmtRate(trm?.rate)}</span></> : 'Consultando TRM…'}
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
