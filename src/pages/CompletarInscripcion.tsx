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
// Se compone con las MISMAS piezas de los formularios públicos del sitio
// (`Field`, `PhoneField`, `StepProgress`): nada de diseño paralelo. El
// comprobante sube DIRECTO a S3 con URL prefirmada — el cuerpo de una función
// se corta en ~4,5 MB y el archivo admite 10.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, ArrowRight, Building2, CalendarDays, Check, CheckCircle2,
    Clock, CreditCard, FileText, HeartPulse, IdCard, Loader2, Mail, MapPin,
    Paperclip, Trash2, User, Users, Utensils,
} from 'lucide-react';
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
}

interface SubmitResult {
    id: string;
    registrationCode: string | null;
    status: string;
    email: string;
    firstName: string;
    successMessage?: string;
}

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
    const [answers, setAnswers] = useState<Record<string, any>>({ membershipType: 'socio_activo' });
    const [stepIndex, setStepIndex] = useState(0);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [clubNotListed, setClubNotListed] = useState(false);
    const [receipt, setReceipt] = useState<ReceiptState>({ status: 'idle' });
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<SubmitResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

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
                    r = await fetch(`${API}/event-registrations/public/completed/${encodeURIComponent(slug)}`);
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

    const steps = config?.form.steps || [];
    const currentStep = steps[stepIndex];
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
    const uploadReceipt = async (file: File) => {
        const problema = checkReceiptFile(file);
        if (problema) {
            setReceipt({ status: 'error', message: problema });
            return;
        }
        setReceipt({ status: 'uploading', name: file.name });
        try {
            const contentType = file.type || 'application/octet-stream';
            const res = await fetch(`${API}/event-registrations/public/completed/${encodeURIComponent(slug)}/receipt-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, contentType, size: file.size }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No se pudo preparar la subida.');

            const put = await fetch(data.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': data.contentType },
                body: file,
            });
            if (!put.ok) throw new Error('La subida del archivo falló. Intenta de nuevo.');

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

    const goNext = () => {
        if (!validateCurrentStep()) return;
        setFieldErrors({});
        setStepIndex(i => Math.min(i + 1, steps.length - 1));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const goBack = () => {
        setFieldErrors({});
        setStepIndex(i => Math.max(i - 1, 0));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const submit = async () => {
        if (!validateCurrentStep() || receipt.status !== 'ready') return;
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch(`${API}/event-registrations/public/completed/${encodeURIComponent(slug)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    answers,
                    receipt: { key: receipt.key, name: receipt.name, contentType: receipt.contentType },
                }),
            });
            const data = await res.json();
            if (!res.ok) {
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
                                    className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition hover:opacity-90"
                                    style={{ background: BLUE }}>
                                    Siguiente <ArrowRight size={15} />
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

export default CompletarInscripcion;
