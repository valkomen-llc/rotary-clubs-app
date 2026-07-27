// ════════════════════════════════════════════════════════════════════
// Registro de asistentes a un evento — v4.606.0
//
// Ruta pública: /eventos/:eventRef/registro (acepta el id o el slug).
//
// Formulario en una sola pantalla: elegir entrada, escribir los datos y
// pagar con Stripe. Las entradas sin costo se confirman de una vez, sin
// pasar por el cobro.
//
// Todo el contenido —tipos de entrada, precios, cupos, moneda y fecha de
// cierre— llega de /api/event-registrations/config/:clubId/:eventRef, que el
// administrador edita en la pestaña "Registro" del evento.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, Clock, CreditCard,
    Loader2, MapPin, ShieldCheck, Ticket,
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

const BLUE = '#17458F';

interface TicketOption {
    key: string;
    label: string;
    description: string;
    amount: number;
    capacity: number | null;
    remaining: number | null;
    soldOut: boolean;
}

interface RegistrationConfig {
    event: { id: string; slug: string | null; title: string; startDate: string; location: string | null };
    enabled: boolean;
    closed: boolean;
    currency: string;
    closesAt: string;
    requireClub: boolean;
    maxPerRegistration: number;
    successMessage: string;
    tickets: TicketOption[];
}

interface Registration {
    id: string; publicRef: string; status: string;
    firstName: string; lastName: string; email: string;
    ticketLabel: string; quantity: number;
    unitAmount: number; totalAmount: number; currency: string;
    paidAt: string | null;
}

const emptyForm = {
    firstName: '', lastName: '', email: '', phone: '',
    country: '', clubName: '', notes: '', quantity: 1,
};

const money = (amount: number, currency: string) =>
    `${Number(amount || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })} ${currency}`;

const Field = ({ label, required, ...props }: { label: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-600">
            {label}{required && <span className="text-red-500"> *</span>}
        </span>
        <input {...props} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
    </label>
);

const RegistroEvento = () => {
    const { eventRef } = useParams<{ eventRef: string }>();
    const { club } = useClub();
    const [params] = useSearchParams();

    const [config, setConfig] = useState<RegistrationConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [form, setForm] = useState(emptyForm);
    const [ticketKey, setTicketKey] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [registration, setRegistration] = useState<Registration | null>(null);

    const clubId = (club as any)?.id as string | undefined;
    const returningId = params.get('registro');
    const paymentCancelled = params.get('pago') === 'cancelado';

    useEffect(() => { window.scrollTo(0, 0); }, []);

    // Configuración del registro
    useEffect(() => {
        if (!clubId || !eventRef) return;
        setLoading(true);
        fetch(`${API}/event-registrations/config/${clubId}/${encodeURIComponent(eventRef)}`)
            .then(r => r.json())
            .then(data => {
                if (data?.error) throw new Error(data.error);
                setConfig(data);
                const first = (data.tickets || []).find((t: TicketOption) => !t.soldOut);
                if (first) setTicketKey(first.key);
            })
            .catch(() => setError('No pudimos cargar el registro de este evento.'))
            .finally(() => setLoading(false));
    }, [clubId, eventRef]);

    // Regreso desde Stripe: se consulta el estado real de la inscripción.
    // La confirmación la hace el webhook, así que puede tardar unos segundos.
    useEffect(() => {
        if (!returningId) return;
        if (paymentCancelled) setNotice('El pago quedó pendiente. Tu inscripción está guardada: puedes reintentarlo cuando quieras.');
        fetch(`${API}/event-registrations/${returningId}`)
            .then(r => r.json())
            .then(data => { if (!data?.error) setRegistration(data); })
            .catch(() => { /* la pantalla sigue usable */ });
    }, [returningId, paymentCancelled]);

    const selected = config?.tickets.find(t => t.key === ticketKey) || null;
    const total = selected ? selected.amount * form.quantity : 0;

    const startPayment = useCallback(async (id: string) => {
        const res = await fetch(`${API}/event-registrations/${id}/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnUrl: window.location.origin }),
        });
        const data = await res.json();
        if (!res.ok || !data?.url) throw new Error(data?.error || 'No pudimos iniciar el pago.');
        window.location.href = data.url;
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const res = await fetch(`${API}/event-registrations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, clubId, eventRef, ticketKey }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No pudimos registrar tu inscripción.');

            setRegistration(data);
            // Con costo: se va directo a Stripe. Sin costo: queda confirmada.
            if (Number(data.totalAmount) > 0) await startPayment(data.id);
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
            await startPayment(registration.id);
        } catch (err: any) {
            setError(err?.message || 'No pudimos iniciar el pago.');
            setSubmitting(false);
        }
    };

    const backToEvent = (
        <Link to={`/eventos/${eventRef}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800">
            <ArrowLeft size={16} /> Volver al evento
        </Link>
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50">
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

    const confirmed = registration && (registration.status === 'paid' || registration.status === 'confirmed');
    const awaitingPayment = registration && !confirmed;

    return (
        <div className="min-h-screen bg-slate-100">
            <Navbar />

            <header style={{ background: BLUE }} className="px-4 py-8 text-white sm:px-6 sm:py-10">
                <div className="mx-auto max-w-3xl text-center sm:text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Registro</p>
                    <h1 className="mt-1.5 text-2xl font-bold leading-tight sm:text-3xl">{config?.event?.title}</h1>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-white/85 sm:justify-start">
                        {config?.event?.startDate && (
                            <span className="flex items-center gap-1.5">
                                <CalendarDays size={14} />
                                {new Date(config.event.startDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                        )}
                        {config?.event?.location && <span className="flex items-center gap-1.5"><MapPin size={14} /> {config.event.location}</span>}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
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

                {/* ── Inscripción confirmada ───────────────────────────── */}
                {confirmed ? (
                    <section className="rounded-2xl bg-white p-7 text-center shadow-sm sm:p-10">
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                            <CheckCircle2 size={38} className="text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">¡Registro confirmado!</h2>
                        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-slate-600">
                            Enviamos el comprobante a <strong>{registration!.email}</strong>.
                            {config?.successMessage ? ` ${config.successMessage}` : ''}
                        </p>
                        <div className="mx-auto mt-6 max-w-sm rounded-xl bg-slate-50 px-5 py-4 text-left">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Referencia</p>
                            <p className="text-lg font-bold text-slate-900">{registration!.publicRef}</p>
                            <p className="mt-2 text-sm text-slate-600">
                                {registration!.ticketLabel} × {registration!.quantity}
                                {registration!.totalAmount > 0 && ` · ${money(registration!.totalAmount, registration!.currency)}`}
                            </p>
                        </div>
                        <div className="mt-7">{backToEvent}</div>
                    </section>
                ) : awaitingPayment ? (
                    /* ── Pago pendiente: se puede reintentar ──────────── */
                    <section className="rounded-2xl bg-white p-7 shadow-sm sm:p-9">
                        <h2 className="text-xl font-bold text-slate-900">Pago pendiente</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            Tu inscripción <strong>{registration!.publicRef}</strong> está guardada. Si ya pagaste, la confirmación
                            puede tardar unos segundos: recarga esta página en un momento.
                        </p>
                        <div className="mt-5 rounded-xl bg-slate-50 px-5 py-4">
                            <p className="text-sm text-slate-600">{registration!.ticketLabel} × {registration!.quantity}</p>
                            <p className="text-2xl font-bold" style={{ color: BLUE }}>{money(registration!.totalAmount, registration!.currency)}</p>
                        </div>
                        <button onClick={retryPayment} disabled={submitting}
                            className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                            style={{ background: BLUE }}>
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} Pagar ahora
                        </button>
                        <div className="mt-6">{backToEvent}</div>
                    </section>
                ) : !config?.enabled || config?.closed ? (
                    /* ── Registro cerrado o no habilitado ─────────────── */
                    <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
                        <Clock className="mx-auto mb-4" size={40} style={{ color: BLUE }} />
                        <h2 className="mb-2 text-2xl font-bold text-slate-900">
                            {config?.closed ? 'Registro cerrado' : 'Registro no disponible'}
                        </h2>
                        <p className="text-slate-600">
                            {config?.closed
                                ? 'El plazo de inscripción para este evento ya terminó. Escríbenos si necesitas más información.'
                                : 'En este momento no estamos recibiendo inscripciones para este evento.'}
                        </p>
                        <div className="mt-7">{backToEvent}</div>
                    </section>
                ) : (
                    /* ── Formulario ───────────────────────────────────── */
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-7">
                            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
                                <Ticket size={16} style={{ color: BLUE }} /> Tipo de entrada
                            </h2>
                            <div className="space-y-3">
                                {config.tickets.map(t => (
                                    <label key={t.key}
                                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                                            t.soldOut ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                                                : ticketKey === t.key ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'
                                        }`}>
                                        <input type="radio" name="ticket" value={t.key} disabled={t.soldOut}
                                            checked={ticketKey === t.key}
                                            onChange={() => setTicketKey(t.key)}
                                            className="mt-1 h-4 w-4" />
                                        <span className="flex-1">
                                            <span className="flex flex-wrap items-baseline justify-between gap-2">
                                                <strong className="text-slate-900">{t.label}</strong>
                                                <span className="font-bold" style={{ color: BLUE }}>
                                                    {t.amount > 0 ? money(t.amount, config.currency) : 'Sin costo'}
                                                </span>
                                            </span>
                                            {t.description && <span className="mt-1 block text-sm text-slate-500">{t.description}</span>}
                                            {t.soldOut
                                                ? <span className="mt-1 block text-xs font-bold uppercase tracking-wide text-red-600">Agotada</span>
                                                : t.remaining !== null && t.remaining <= 10 && (
                                                    <span className="mt-1 block text-xs font-semibold text-amber-700">Quedan {t.remaining}</span>
                                                )}
                                        </span>
                                    </label>
                                ))}
                            </div>

                            <div className="mt-4 max-w-[200px]">
                                <Field label="Cantidad" type="number" min={1} max={config.maxPerRegistration}
                                    value={form.quantity}
                                    onChange={e => setForm({ ...form, quantity: Math.max(1, Math.min(config.maxPerRegistration, Number(e.target.value) || 1)) })} />
                            </div>
                        </section>

                        <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-7">
                            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-700">Tus datos</h2>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Nombre" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
                                <Field label="Apellidos" required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
                                <Field label="Correo electrónico" required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                                <Field label="Teléfono" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                <Field label="País" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
                                <Field label="Club u organización" required={config.requireClub}
                                    value={form.clubName} onChange={e => setForm({ ...form, clubName: e.target.value })} />
                            </div>
                            <label className="mt-4 block">
                                <span className="mb-1 block text-xs font-semibold text-slate-600">Comentarios (opcional)</span>
                                <textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    placeholder="Restricciones alimentarias, acompañantes, etc." />
                            </label>
                        </section>

                        <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-7">
                            <div className="flex flex-wrap items-end justify-between gap-4">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</p>
                                    <p className="text-3xl font-bold" style={{ color: BLUE }}>
                                        {total > 0 ? money(total, config.currency) : 'Sin costo'}
                                    </p>
                                    {selected && <p className="mt-1 text-sm text-slate-500">{selected.label} × {form.quantity}</p>}
                                </div>
                                <button type="submit" disabled={submitting || !selected || selected.soldOut}
                                    className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                                    style={{ background: BLUE }}>
                                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                                    {total > 0 ? 'Continuar al pago' : 'Confirmar registro'}
                                </button>
                            </div>
                            {total > 0 && (
                                <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
                                    <ShieldCheck size={14} /> Pago seguro procesado por Stripe. El registro se confirma cuando el pago se aprueba.
                                </p>
                            )}
                            {config.closesAt && (
                                <p className="mt-2 text-xs text-slate-400">Las inscripciones cierran el {config.closesAt}.</p>
                            )}
                        </section>

                        <div>{backToEvent}</div>
                    </form>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default RegistroEvento;
