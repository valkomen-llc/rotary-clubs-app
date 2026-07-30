// ════════════════════════════════════════════════════════════════════
// Inscripción a un evento — asistente público — v4.648.0
//
// Ruta: /eventos/:eventRef/registro (acepta el id o el slug del evento).
//
// El asistente va por pasos: categoría → datos personales → información
// rotaria → (información adicional) → necesidades → acompañantes → resumen →
// pago → confirmación. Los pasos intermedios NO están escritos aquí: llegan
// del servidor dentro de `category.form`, así que agregar una categoría o un
// campo desde el panel no obliga a tocar esta pantalla.
//
// Decisiones:
//
// - **Autoguardado.** Desde que hay categoría y correo válido, el avance se
//   guarda como borrador cada pocos segundos. El id y su token quedan en
//   `localStorage`, así que cerrar la pestaña no pierde lo escrito.
// - **Se puede volver atrás.** Los pasos ya visitados son clicables.
// - **El precio lo dice el servidor.** Aquí sólo se muestra; el importe real lo
//   calcula y congela el backend al enviar el formulario.
// - **La confirmación la da el webhook de Stripe.** Al volver del pago se
//   consulta el estado real; si todavía no llegó, se dice que puede tardar unos
//   segundos en vez de dar por bueno el retorno del navegador.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock,
    CreditCard, Loader2, Lock, MapPin, Plus, ShieldCheck, Trash2, Users,
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useLang } from '../contexts/LanguageContext';
import {
    money, validateStep, isFieldVisible, COUNTRY_SUGGESTIONS, COLOMBIA_DEPARTMENTS,
    type FormField, type FormStep, type PublicCategory, type Companion,
} from '../lib/eventRegistrationSpec';
import { localeOf } from '../components/EventRegistrationCta';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const BLUE = '#17458F';
const GOLD = '#F7A81B';

interface RegistrationConfig {
    event: { id: string; slug: string | null; title: string; startDate: string; endDate: string | null; location: string | null };
    edition: { editionNumber: number | null; editionLabel: string; venue: string; city: string; country: string; opensAt: string | null; closesAt: string | null };
    enabled: boolean;
    closed: boolean;
    successMessage: string;
    categories: PublicCategory[];
    /** Clave de la categoría con la que se entró desde la ficha del evento. */
    lockedCategory: string | null;
}

interface Registration {
    id: string;
    publicRef: string;
    registrationCode: string | null;
    status: string;
    categoryLabel: string;
    firstName: string;
    lastName: string;
    email: string;
    baseCurrency: string;
    baseAmount: number;
    chargeCurrency: string;
    chargeAmount: number;
    fxRate: number | null;
    companionsCount: number;
    accessToken?: string;
    pricing?: Record<string, any>;
}

type Answers = Record<string, any>;

const emptyCompanion = (): Companion => ({
    firstName: '', lastName: '', documentNumber: '',
    relationship: '', email: '', phone: '', dietary: '', notes: '',
});

const storageKey = (eventRef: string, categoryKey: string) =>
    `rotary_event_reg_${eventRef}_${categoryKey}`;

// ── Campo dinámico ───────────────────────────────────────────────────

const inputCls = (invalid: boolean) =>
    `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${invalid
        ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-100'
        : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'}`;

const DynamicField = ({ field, value, error, onChange }: {
    field: FormField;
    value: any;
    error?: string;
    onChange: (value: any) => void;
}) => {
    const invalid = Boolean(error);
    const listId = field.type === 'country' ? `list-${field.key}` : undefined;

    const control = () => {
        switch (field.type) {
            case 'textarea':
                return (
                    <textarea rows={3} value={value ?? ''} maxLength={field.max}
                        onChange={e => onChange(e.target.value)} className={inputCls(invalid)} />
                );
            case 'select':
                return (
                    <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={inputCls(invalid)}>
                        <option value="">Selecciona…</option>
                        {(field.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                );
            case 'multiselect':
                return (
                    <div className="flex flex-wrap gap-2">
                        {(field.options || []).map(o => {
                            const selected = Array.isArray(value) && value.includes(o.value);
                            return (
                                <button key={o.value} type="button"
                                    onClick={() => {
                                        const current: string[] = Array.isArray(value) ? value : [];
                                        onChange(selected ? current.filter(v => v !== o.value) : [...current, o.value]);
                                    }}
                                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${selected
                                        ? 'border-transparent text-white'
                                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
                                    style={selected ? { background: BLUE } : undefined}>
                                    {selected && <Check size={12} className="mr-1 inline" />}{o.label}
                                </button>
                            );
                        })}
                    </div>
                );
            case 'checkbox':
                return (
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
                        <input type="checkbox" checked={value === true}
                            onChange={e => onChange(e.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{field.label}{field.required && <span className="text-red-500"> *</span>}</span>
                    </label>
                );
            case 'country':
                return (
                    <>
                        <input type="text" value={value ?? ''} list={listId} maxLength={field.max}
                            onChange={e => onChange(e.target.value)} className={inputCls(invalid)}
                            placeholder="Escribe o elige tu país" />
                        <datalist id={listId}>
                            {COUNTRY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
                        </datalist>
                    </>
                );
            case 'number':
                return (
                    <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value)}
                        className={inputCls(invalid)} />
                );
            default:
                return (
                    <input
                        type={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : field.type === 'date' ? 'date' : 'text'}
                        value={value ?? ''} maxLength={field.max}
                        list={field.key === 'department' ? 'list-departments' : undefined}
                        onChange={e => onChange(e.target.value)} className={inputCls(invalid)} />
                );
        }
    };

    return (
        <div className={field.type === 'textarea' || field.type === 'multiselect' || field.type === 'checkbox' ? 'sm:col-span-2' : ''}>
            {field.type !== 'checkbox' && (
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                    {field.label}{field.required && <span className="text-red-500"> *</span>}
                </label>
            )}
            {control()}
            {field.key === 'department' && (
                <datalist id="list-departments">
                    {COLOMBIA_DEPARTMENTS.map(d => <option key={d} value={d} />)}
                </datalist>
            )}
            {field.help && !error && <p className="mt-1 text-xs text-slate-400">{field.help}</p>}
            {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
        </div>
    );
};

// ── Pantalla ─────────────────────────────────────────────────────────

const RegistroEvento = () => {
    const { eventRef } = useParams<{ eventRef: string }>();
    const { club } = useClub();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { lang } = useLang();

    const [config, setConfig] = useState<RegistrationConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);

    const [categoryKey, setCategoryKey] = useState('');
    const [answers, setAnswers] = useState<Answers>({});
    const [companions, setCompanions] = useState<Companion[]>([]);
    const [stepIndex, setStepIndex] = useState(0);
    const [maxVisited, setMaxVisited] = useState(0);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const [registration, setRegistration] = useState<Registration | null>(null);
    const draftRef = useRef<{ id: string; accessToken: string } | null>(null);

    const clubId = (club as any)?.id as string | undefined;
    const returningId = params.get('registro');
    const returningToken = params.get('t') || '';
    const paymentCancelled = params.get('pago') === 'cancelado';
    /**
     * Categoría fijada desde la ficha del evento. Cuando viene, este formulario
     * es el de ESA categoría y nada más: el servidor devuelve únicamente sus
     * datos, no se muestra el selector y no se puede cambiar desde aquí. Para
     * elegir otra hay que volver al evento, que es donde están los botones.
     */
    const lockedCategory = params.get('categoria') || '';
    const eventUrl = `/eventos/${eventRef}`;

    useEffect(() => { window.scrollTo(0, 0); }, []);

    // ── Configuración ────────────────────────────────────────────────
    useEffect(() => {
        if (!clubId || !eventRef) return;
        setLoading(true);
        const query = new URLSearchParams();
        if (lockedCategory) query.set('categoria', lockedCategory);
        // El idioma activo del sitio, el mismo que decide los botones de la
        // ficha. Aquí importa cuando se entra al asistente sin categoría fijada.
        query.set('locale', localeOf(lang));

        fetch(`${API}/event-registrations/config/${clubId}/${encodeURIComponent(eventRef)}?${query}`)
            .then(r => r.json())
            .then(data => {
                if (data?.error) throw new Error(data.error);
                setConfig(data);
                // Con categoría fijada se entra directo al primer paso del
                // formulario, sin pasar por la pantalla de selección.
                if (data.lockedCategory) setCategoryKey(data.lockedCategory);
            })
            .catch(err => setError(err?.message || 'No pudimos cargar el registro de este evento.'))
            .finally(() => setLoading(false));
    }, [clubId, eventRef, lockedCategory, lang]);

    // ── Regreso desde Stripe ─────────────────────────────────────────
    useEffect(() => {
        if (!returningId) return;
        if (paymentCancelled) {
            setNotice('El pago quedó pendiente. Tu inscripción está guardada: puedes reintentarlo cuando quieras.');
        }
        fetch(`${API}/event-registrations/${returningId}?t=${encodeURIComponent(returningToken)}`)
            .then(r => r.json())
            .then(data => { if (!data?.error) setRegistration({ ...data, accessToken: returningToken }); })
            .catch(() => { /* la pantalla sigue usable */ });
    }, [returningId, returningToken, paymentCancelled]);

    const category = useMemo(
        () => config?.categories.find(c => c.key === categoryKey) || null,
        [config, categoryKey]);

    // ── Retomar un borrador guardado ─────────────────────────────────
    useEffect(() => {
        if (!category || !eventRef || returningId) return;
        try {
            const stored = localStorage.getItem(storageKey(eventRef, category.key));
            if (!stored) return;
            const parsed = JSON.parse(stored);
            if (!parsed?.id || !parsed?.accessToken) return;
            draftRef.current = { id: parsed.id, accessToken: parsed.accessToken };
            if (parsed.answers && Object.keys(parsed.answers).length) {
                setAnswers(a => (Object.keys(a).length ? a : parsed.answers));
                setCompanions(parsed.companions || []);
                setNotice('Retomamos el registro que habías empezado. Revisa los datos antes de continuar.');
            }
        } catch { /* un borrador ilegible no debe impedir empezar de nuevo */ }
    }, [category, eventRef, returningId]);

    // ── Pasos ────────────────────────────────────────────────────────
    const steps: FormStep[] = useMemo(() => {
        if (!category) return [];
        const base = [...category.form.steps];
        if (category.companions.allowed) {
            base.push({ key: 'companions', label: 'Acompañantes', fields: [] });
        }
        base.push({ key: 'summary', label: 'Resumen y pago', fields: [] });
        return base;
    }, [category]);

    const currentStep = steps[stepIndex] || null;

    // ── Autoguardado ─────────────────────────────────────────────────
    const persistDraft = useCallback(async () => {
        if (!category || !eventRef || !clubId) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(answers.email || ''))) return;
        setSavingDraft(true);
        try {
            const res = await fetch(`${API}/event-registrations/draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId, eventRef, categoryKey: category.key, answers, companions,
                    registrationId: draftRef.current?.id,
                    accessToken: draftRef.current?.accessToken,
                }),
            });
            const data = await res.json();
            if (res.ok && data?.id) {
                draftRef.current = { id: data.id, accessToken: data.accessToken };
                localStorage.setItem(storageKey(eventRef, category.key), JSON.stringify({
                    id: data.id, accessToken: data.accessToken, answers, companions,
                }));
            }
        } catch { /* el autoguardado nunca interrumpe al usuario */ } finally {
            setSavingDraft(false);
        }
    }, [category, eventRef, clubId, answers, companions]);

    useEffect(() => {
        if (!category || registration) return;
        const timer = setTimeout(persistDraft, 2500);
        return () => clearTimeout(timer);
    }, [answers, companions, category, registration, persistDraft]);

    // ── Navegación ───────────────────────────────────────────────────
    const setAnswer = (key: string, value: any) => {
        setAnswers(prev => ({ ...prev, [key]: value }));
        setFieldErrors(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const goTo = (index: number) => {
        setStepIndex(index);
        setMaxVisited(m => Math.max(m, index));
        setError('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const nextStep = () => {
        if (!currentStep) return;
        if (currentStep.fields.length) {
            const errors = validateStep(currentStep.fields, answers);
            if (Object.keys(errors).length) {
                setFieldErrors(errors);
                setError('Revisa los campos marcados en rojo.');
                return;
            }
        }
        if (currentStep.key === 'companions' && category) {
            for (let i = 0; i < companions.length; i++) {
                const c = companions[i];
                const missing = !c.firstName?.trim() || !c.lastName?.trim()
                    || (category.companions.requireDocument && !c.documentNumber?.trim());
                if (missing) {
                    setError(`Faltan datos del acompañante ${i + 1}.`);
                    return;
                }
            }
        }
        setFieldErrors({});
        goTo(Math.min(stepIndex + 1, steps.length - 1));
    };

    // ── Envío y pago ─────────────────────────────────────────────────
    const startPayment = useCallback(async (id: string, accessToken: string) => {
        const res = await fetch(`${API}/event-registrations/${id}/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnUrl: window.location.origin, accessToken }),
        });
        const data = await res.json();
        if (!res.ok || !data?.url) throw new Error(data?.error || 'No pudimos iniciar el pago.');
        window.location.href = data.url;
    }, []);

    const handleSubmit = async () => {
        if (!category || !eventRef) return;
        setError('');
        setSubmitting(true);
        try {
            const res = await fetch(`${API}/event-registrations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId, eventRef, categoryKey: category.key, answers, companions,
                    registrationId: draftRef.current?.id,
                    accessToken: draftRef.current?.accessToken,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data?.fieldErrors) {
                    setFieldErrors(data.fieldErrors);
                    // Llevar a la persona al primer paso que tenga un error.
                    const firstBad = steps.findIndex(s => s.fields.some(f => data.fieldErrors[f.key]));
                    if (firstBad >= 0) goTo(firstBad);
                }
                throw new Error(data?.error || 'No pudimos registrar tu inscripción.');
            }

            localStorage.removeItem(storageKey(eventRef, category.key));
            setRegistration(data);
            if (Number(data.chargeAmount) > 0) await startPayment(data.id, data.accessToken);
        } catch (err: any) {
            setError(err?.message || 'No pudimos registrar tu inscripción.');
        } finally {
            setSubmitting(false);
        }
    };

    const retryPayment = async () => {
        if (!registration) return;
        setError('');
        setSubmitting(true);
        try {
            await startPayment(registration.id, registration.accessToken || returningToken);
        } catch (err: any) {
            setError(err?.message || 'No pudimos iniciar el pago.');
            setSubmitting(false);
        }
    };

    // ── Piezas de la pantalla ────────────────────────────────────────
    const backToEvent = (
        <Link to={`/eventos/${eventRef}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800">
            <ArrowLeft size={16} /> Volver al evento
        </Link>
    );

    const totals = useMemo(() => {
        if (!category) return null;
        const holder = category.price;
        const companionUnit = category.companions.allowed ? category.companions.price : 0;
        const companionsTotal = companionUnit * companions.length;
        return { holder, companionUnit, companionsTotal, total: holder + companionsTotal };
    }, [category, companions.length]);

    if (loading) {
        return (
            <div className="min-h-screen bg-rotary-concrete">
                <Navbar />
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="text-center text-slate-500">
                        <Loader2 className="mx-auto mb-3 animate-spin" size={32} style={{ color: BLUE }} />
                        <p className="text-sm">Cargando el registro…</p>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    const confirmed = registration && ['paid', 'confirmed', 'accredited', 'attended'].includes(registration.status);
    const awaitingPayment = registration && !confirmed;

    return (
        <div className="min-h-screen bg-rotary-concrete">
            <Navbar />

            <header style={PAGE_HEADER_BACKGROUND} className="px-4 py-8 text-white sm:px-6 sm:py-10">
                <div className="mx-auto max-w-4xl text-center sm:text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                        Inscripción{config?.edition?.editionNumber ? ` · Edición ${config.edition.editionNumber}` : ''}
                    </p>
                    <h1 className="mt-1.5 text-2xl font-bold leading-tight sm:text-3xl">{config?.event?.title}</h1>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-white/85 sm:justify-start">
                        {config?.event?.startDate && (
                            <span className="flex items-center gap-1.5">
                                <CalendarDays size={14} />
                                {new Date(config.event.startDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                        )}
                        {(config?.edition?.venue || config?.event?.location) && (
                            <span className="flex items-center gap-1.5">
                                <MapPin size={14} /> {config?.edition?.venue || config?.event?.location}
                            </span>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
                {error && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" /> <span>{error}</span>
                    </div>
                )}
                {notice && !confirmed && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" /> <span>{notice}</span>
                    </div>
                )}

                {/* ── Confirmada ───────────────────────────────────── */}
                {confirmed ? (
                    <section className="rounded-2xl bg-white p-7 text-center shadow-sm sm:p-10">
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                            <CheckCircle2 size={38} className="text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">¡Inscripción confirmada!</h2>
                        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-slate-600">
                            Enviamos el comprobante a <strong>{registration!.email}</strong>.
                            {config?.successMessage ? ` ${config.successMessage}` : ''}
                        </p>
                        <div className="mx-auto mt-6 max-w-sm rounded-xl bg-slate-50 px-5 py-4 text-left">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Código de inscripción
                            </p>
                            <p className="font-mono text-2xl font-bold" style={{ color: BLUE }}>
                                {registration!.registrationCode || registration!.publicRef}
                            </p>
                            <p className="mt-2 text-sm text-slate-600">{registration!.categoryLabel}</p>
                            {registration!.baseAmount > 0 && (
                                <p className="text-sm text-slate-600">
                                    {money(registration!.baseAmount, registration!.baseCurrency)}
                                    {registration!.chargeCurrency !== registration!.baseCurrency && (
                                        <span className="text-slate-400">
                                            {' '}· cobrado {money(registration!.chargeAmount, registration!.chargeCurrency)}
                                        </span>
                                    )}
                                </p>
                            )}
                            {registration!.companionsCount > 0 && (
                                <p className="text-sm text-slate-600">{registration!.companionsCount} acompañante(s)</p>
                            )}
                        </div>
                        <p className="mt-5 text-xs text-slate-400">
                            Presenta este código el día del evento para recoger tu escarapela.
                        </p>
                        <div className="mt-7">{backToEvent}</div>
                    </section>
                ) : awaitingPayment ? (
                    /* ── Pago pendiente ───────────────────────────── */
                    <section className="rounded-2xl bg-white p-7 shadow-sm sm:p-9">
                        <h2 className="text-xl font-bold text-slate-900">Pago pendiente</h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            Tu inscripción <strong>{registration!.publicRef}</strong> está guardada. Si ya pagaste,
                            la confirmación la da nuestro sistema de pagos y puede tardar unos segundos: recarga
                            esta página en un momento.
                        </p>
                        <div className="mt-5 rounded-xl bg-slate-50 px-5 py-4">
                            <p className="text-sm text-slate-600">{registration!.categoryLabel}</p>
                            <p className="text-2xl font-bold" style={{ color: BLUE }}>
                                {money(registration!.chargeAmount, registration!.chargeCurrency)}
                            </p>
                            {registration!.chargeCurrency !== registration!.baseCurrency && (
                                <p className="mt-1 text-xs text-slate-500">
                                    Valor publicado: {money(registration!.baseAmount, registration!.baseCurrency)}
                                    {registration!.fxRate ? ` · tasa ${registration!.fxRate.toLocaleString('es-CO', { maximumFractionDigits: 6 })}` : ''}
                                </p>
                            )}
                        </div>
                        <button onClick={retryPayment} disabled={submitting}
                            className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                            style={{ background: BLUE }}>
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} Pagar ahora
                        </button>
                        <div className="mt-6">{backToEvent}</div>
                    </section>
                ) : !config?.enabled || config?.closed ? (
                    /* ── Cerrado ──────────────────────────────────── */
                    <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
                        <Clock className="mx-auto mb-4" size={40} style={{ color: BLUE }} />
                        <h2 className="mb-2 text-2xl font-bold text-slate-900">
                            {config?.closed ? 'Inscripciones cerradas' : 'Inscripciones no disponibles'}
                        </h2>
                        <p className="text-slate-600">
                            {config?.closed
                                ? 'El plazo de inscripción para este evento ya terminó. Escríbenos si necesitas más información.'
                                : 'En este momento no estamos recibiendo inscripciones para este evento.'}
                        </p>
                        <div className="mt-7">{backToEvent}</div>
                    </section>
                ) : !category ? (
                    /* ── Paso 1: categoría ────────────────────────── */
                    <section className="space-y-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">¿Cómo participas en la feria?</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Elige tu categoría. De ella dependen el formulario, el valor y los beneficios incluidos.
                            </p>
                        </div>
                        {config.categories.map(c => (
                            <button key={c.key} type="button" disabled={!c.open}
                                onClick={() => { setCategoryKey(c.key); goTo(0); }}
                                className={`w-full rounded-2xl border-2 bg-white p-6 text-left transition ${c.open
                                    ? 'border-slate-200 hover:border-blue-400 hover:shadow-md'
                                    : 'cursor-not-allowed border-slate-200 opacity-60'}`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-slate-900">{c.name}</h3>
                                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{c.description}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-bold" style={{ color: BLUE }}>
                                            {c.price > 0 ? money(c.price, c.currency) : 'Sin costo'}
                                        </p>
                                        {c.charge.converted && (
                                            <p className="text-xs text-slate-400">
                                                se cobra {money(c.charge.amount, c.charge.currency)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {c.benefits.length > 0 && (
                                    <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                                        {c.benefits.map(b => (
                                            <li key={b} className="flex items-start gap-1.5 text-xs text-slate-600">
                                                <Check size={13} className="mt-0.5 shrink-0" style={{ color: GOLD }} /> {b}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                                    {c.companions.allowed && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">
                                            <Users size={11} /> Hasta {c.companions.max} acompañante(s)
                                        </span>
                                    )}
                                    {c.remaining !== null && c.remaining <= 20 && c.remaining > 0 && (
                                        <span className="font-semibold text-amber-700">Quedan {c.remaining} cupos</span>
                                    )}
                                    {c.soldOut && <span className="font-bold uppercase tracking-wide text-red-600">Agotada</span>}
                                    {!c.open && !c.soldOut && (
                                        <span className="font-semibold text-slate-500">
                                            {c.closedReason === 'not_yet' ? `Abre el ${c.opensAt}` : 'Cerrada'}
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                        <div className="pt-2">{backToEvent}</div>
                    </section>
                ) : (
                    /* ── Pasos del formulario ─────────────────────── */
                    <div className="space-y-5">
                        {/* Barra de pasos */}
                        <nav className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl bg-white p-4 shadow-sm">
                            {lockedCategory ? (
                                // Categoría fijada desde la ficha: se muestra, no se cambia.
                                // Para elegir otra hay que volver al evento.
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                                    <Lock size={11} /> {category.name}
                                </span>
                            ) : (
                                <button type="button" onClick={() => { setCategoryKey(''); setStepIndex(0); setMaxVisited(0); }}
                                    className="text-xs font-semibold text-slate-400 hover:text-slate-700">
                                    {category.name} ✕
                                </button>
                            )}
                            <span className="text-slate-300">|</span>
                            {steps.map((s, i) => (
                                <button key={s.key} type="button" disabled={i > maxVisited}
                                    onClick={() => i <= maxVisited && goTo(i)}
                                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${i === stepIndex
                                        ? 'text-white'
                                        : i < stepIndex || i <= maxVisited
                                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            : 'text-slate-300'}`}
                                    style={i === stepIndex ? { background: BLUE } : undefined}>
                                    {i + 1}. {s.label}
                                </button>
                            ))}
                            {savingDraft && (
                                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <Loader2 size={11} className="animate-spin" /> Guardando…
                                </span>
                            )}
                        </nav>

                        {/* Campos del paso */}
                        {currentStep && currentStep.fields.length > 0 && (
                            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-7">
                                <h2 className="mb-5 text-lg font-bold text-slate-900">{currentStep.label}</h2>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {currentStep.fields
                                        .filter(f => isFieldVisible(f, answers))
                                        .map(f => (
                                            <DynamicField key={f.key} field={f}
                                                value={answers[f.key]} error={fieldErrors[f.key]}
                                                onChange={v => setAnswer(f.key, v)} />
                                        ))}
                                </div>
                            </section>
                        )}

                        {/* Acompañantes */}
                        {currentStep?.key === 'companions' && (
                            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-7">
                                <h2 className="text-lg font-bold text-slate-900">Acompañantes</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Puedes registrar hasta {category.companions.max}.
                                    {category.companions.price > 0 && (
                                        <> Cada uno agrega {money(category.companions.price, category.companions.currency)} al total.</>
                                    )}
                                </p>

                                <div className="mt-5 space-y-4">
                                    {companions.map((c, i) => (
                                        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                            <div className="mb-3 flex items-center justify-between">
                                                <p className="text-sm font-bold text-slate-700">Acompañante {i + 1}</p>
                                                <button type="button"
                                                    onClick={() => setCompanions(list => list.filter((_, ix) => ix !== i))}
                                                    className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                {([
                                                    ['firstName', 'Nombres', true],
                                                    ['lastName', 'Apellidos', true],
                                                    ['documentNumber', 'Documento o pasaporte', category.companions.requireDocument],
                                                    ['relationship', 'Parentesco o relación', false],
                                                    ['email', 'Correo electrónico', false],
                                                    ['phone', 'Teléfono', false],
                                                ] as [keyof Companion, string, boolean][]).map(([key, label, required]) => (
                                                    <div key={key}>
                                                        <label className="mb-1 block text-xs font-semibold text-slate-600">
                                                            {label}{required && <span className="text-red-500"> *</span>}
                                                        </label>
                                                        <input type={key === 'email' ? 'email' : 'text'}
                                                            value={(c[key] as string) || ''}
                                                            onChange={e => setCompanions(list =>
                                                                list.map((item, ix) => ix === i ? { ...item, [key]: e.target.value } : item))}
                                                            className={inputCls(false)} />
                                                    </div>
                                                ))}
                                                <div className="sm:col-span-2">
                                                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                                                        Necesidades alimentarias u observaciones
                                                    </label>
                                                    <input type="text" value={c.notes || ''}
                                                        onChange={e => setCompanions(list =>
                                                            list.map((item, ix) => ix === i ? { ...item, notes: e.target.value } : item))}
                                                        className={inputCls(false)} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {companions.length < category.companions.max && (
                                    <button type="button" onClick={() => setCompanions(list => [...list, emptyCompanion()])}
                                        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
                                        <Plus size={15} /> Agregar acompañante
                                    </button>
                                )}
                                {companions.length === 0 && (
                                    <p className="mt-4 text-sm text-slate-400">
                                        Si asistes sin acompañantes, continúa al siguiente paso.
                                    </p>
                                )}
                            </section>
                        )}

                        {/* Resumen */}
                        {currentStep?.key === 'summary' && totals && (
                            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-7">
                                <h2 className="text-lg font-bold text-slate-900">Resumen de tu inscripción</h2>

                                <dl className="mt-5 divide-y divide-slate-100">
                                    {[
                                        ['Categoría', category.name],
                                        ['Participante', `${answers.firstName || ''} ${answers.lastName || ''}`.trim()],
                                        ['Correo', answers.email],
                                        ['Club', answers.clubName],
                                        ['Distrito', answers.district],
                                        ['País', answers.country],
                                        companions.length ? ['Acompañantes', String(companions.length)] : null,
                                    ].filter(Boolean).map(pair => {
                                        const [label, value] = pair as [string, string];
                                        return value ? (
                                            <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
                                                <dt className="text-slate-500">{label}</dt>
                                                <dd className="text-right font-semibold text-slate-900">{value}</dd>
                                            </div>
                                        ) : null;
                                    })}
                                </dl>

                                <div className="mt-5 rounded-xl bg-slate-50 p-5">
                                    <div className="flex justify-between text-sm text-slate-600">
                                        <span>Inscripción ({category.name})</span>
                                        <span className="font-semibold">{money(totals.holder, category.currency)}</span>
                                    </div>
                                    {companions.length > 0 && totals.companionUnit > 0 && (
                                        <div className="mt-1.5 flex justify-between text-sm text-slate-600">
                                            <span>{companions.length} acompañante(s) × {money(totals.companionUnit, category.companions.currency)}</span>
                                            <span className="font-semibold">{money(totals.companionsTotal, category.currency)}</span>
                                        </div>
                                    )}
                                    <div className="mt-3 flex items-end justify-between border-t border-slate-200 pt-3">
                                        <span className="text-sm font-bold text-slate-700">Total</span>
                                        <span className="text-2xl font-bold" style={{ color: BLUE }}>
                                            {totals.total > 0 ? money(totals.total, category.currency) : 'Sin costo'}
                                        </span>
                                    </div>
                                    {category.charge.converted && totals.total > 0 && (
                                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                            El cobro se procesa en {category.charge.currency} a la tasa vigente del evento.
                                            En tu extracto verás el valor convertido; en el comprobante quedan registrados
                                            el valor en {category.currency}, el convertido y la tasa aplicada.
                                        </p>
                                    )}
                                </div>

                                <button type="button" onClick={handleSubmit} disabled={submitting}
                                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
                                    style={{ background: BLUE }}>
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                                    {totals.total > 0 ? 'Continuar al pago' : 'Confirmar inscripción'}
                                </button>

                                {totals.total > 0 && (
                                    <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
                                        <ShieldCheck size={14} /> Pago seguro procesado por Stripe. La inscripción se
                                        confirma cuando el pago se aprueba.
                                    </p>
                                )}
                            </section>
                        )}

                        {/* Navegación entre pasos */}
                        <div className="flex items-center justify-between gap-3">
                            <button type="button"
                                onClick={() => {
                                    if (stepIndex > 0) return goTo(stepIndex - 1);
                                    // En el primer paso, "Atrás" sale del formulario: al
                                    // selector si se entró por él, o a la ficha del evento
                                    // si se entró por uno de sus botones.
                                    if (lockedCategory) navigate(eventUrl);
                                    else setCategoryKey('');
                                }}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                                <ArrowLeft size={15} /> {stepIndex === 0 && lockedCategory ? 'Cambiar categoría' : 'Atrás'}
                            </button>
                            {currentStep?.key !== 'summary' && (
                                <button type="button" onClick={nextStep}
                                    className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                                    style={{ background: BLUE }}>
                                    Continuar <ArrowRight size={15} />
                                </button>
                            )}
                        </div>

                        <div>{backToEvent}</div>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default RegistroEvento;
