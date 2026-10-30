// ════════════════════════════════════════════════════════════════════
// Mi Inscripción — panel del Asistente al Evento
// v4.655.0
//
// Espacio privado de quien se inscribió a un evento. Ruta pública:
// /mi-inscripcion.
//
// Es de SÓLO LECTURA sobre lo suyo: el evento al que se registró, la categoría,
// el estado del formulario, el estado del pago, el valor y la moneda, la fecha,
// el código de inscripción con su QR, los acompañantes, el comprobante, las
// observaciones, los correos recibidos y el rastro de actualizaciones. No hay
// nada de otros asistentes, ni de proyectos, ni funciones administrativas: el
// servidor filtra siempre por la cuenta del token (`accountId`), así que un id
// ajeno no devuelve datos aunque se escriba a mano.
//
// La sesión es propia del módulo (token con audiencia `event-attendee-portal`):
// no da acceso al panel administrativo de la plataforma ni al panel del club.
//
// Una cuenta puede tener varias inscripciones —una por edición—, y por eso el
// panel es una lista: el historial queda separado por evento.
//
// El ingreso NO se dibuja aquí: como en todo el sitio, se llama al formulario
// único del encabezado con `openLoginModal()`.
//
// v4.1267 — «Mis eventos». Además de las inscripciones en línea, el panel
// muestra los registros del formulario «Completar inscripción» (COLROTARIOS)
// atados a la cuenta: evento, inscripción, estado de validación por etapas,
// comprobante (enlace firmado de 2 minutos) e historial con hechos reales. Un
// registro enviado ANTES de tener cuenta se vincula sólo demostrando el correo
// (enlace `?vincular=`), nunca por coincidencia.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../contexts/LanguageContext';
import { activeLocale } from '../lib/locale';
import {
    AlertCircle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock, CreditCard,
    Circle, ExternalLink, FileText, History, KeyRound, LayoutDashboard, Link2, Loader2, LogOut, Mail, MapPin,
    Paperclip, QrCode, ShieldCheck, Ticket, Users, Wallet,
} from 'lucide-react';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
import { openLoginModal } from '../lib/loginModal';
import { forgetSession, rememberProfile, emitSessionChange, useSiteSessions } from '../lib/siteSession';
import { qrToSvg } from '../lib/qrcode';
import { money, statusMeta } from '../lib/eventRegistrationSpec';
import { Field } from '../components/forms/FairField';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
/** Llave propia: no comparte almacenamiento con la plataforma ni con el club. */
export const ATTENDEE_TOKEN_KEY = 'evento_asistente_token';
export const ATTENDEE_PATH = '/mi-inscripcion';
const BLUE = '#17458F';

interface Companion {
    id: string; firstName: string; lastName: string;
    documentNumber?: string | null; relationship?: string | null;
    email?: string | null; phone?: string | null; notes?: string | null;
}

interface HistoryEntry {
    id: string; type: string; fromStatus: string | null; toStatus: string | null;
    comment: string | null; createdAt: string;
}

interface MessageEntry {
    id: string; channel: string; subject: string | null; status: string; createdAt: string;
}

interface PaymentEntry {
    id: string; status: string; amount: number | null; currency: string;
    baseAmount: number | null; baseCurrency: string | null; fxRate: number | null;
    paymentMethod: string | null; receiptUrl: string | null;
    refundedAmount: number | null; occurredAt: string;
}

interface RegistrationView {
    id: string;
    eventId: string;
    event: { id: string; title: string; slug: string | null; startDate: string | null; location: string | null } | null;
    publicRef: string;
    registrationCode: string | null;
    status: string;
    statusLabel: string;
    statusDescription: string | null;
    settled: boolean;
    categoryKey: string;
    categoryLabel: string;
    firstName: string; lastName: string; email: string; phone: string | null;
    answers: Record<string, any>;
    baseCurrency: string; baseAmount: number | null;
    chargeCurrency: string; chargeAmount: number | null;
    fxRate: number | null;
    companionsCount: number; companionsAmount: number | null;
    companions: Companion[];
    receiptUrl: string | null;
    paymentMethod: string | null;
    refundedAt: string | null; refundedAmount: number | null;
    notes: string | null;
    checkedInAt: string | null;
    registeredAt: string | null;
    paidAt: string | null;
    payments?: PaymentEntry[];
    messages?: MessageEntry[];
    history?: HistoryEntry[];
}

interface PortalData {
    role: string;
    roleLabel: string;
    permissions: string[];
    profile: {
        id: string; email: string;
        firstName: string | null; lastName: string | null; phone: string | null;
        emailVerified: boolean; emailVerificationRequired: boolean;
        lastLoginAt: string | null; createdAt: string;
    };
    registrations: RegistrationView[];
    /** v4.1267 — Registros de «Completar inscripción». Un servidor anterior no los manda. */
    completed?: CompletedView[];
}

interface CompletedStage {
    key: string; label: string; done: boolean; current: boolean; tone: string; description?: string;
}

interface CompletedView {
    id: string;
    kind: 'completed';
    eventId: string;
    event: { id: string; title: string | null; slug: string | null; startDate: string | null; endDate: string | null; location: string | null } | null;
    registrationCode: string | null;
    status: string;
    statusLabel: string;
    statusDescription: string | null;
    stages: CompletedStage[];
    firstName: string | null; lastName: string | null; email: string; phone: string | null;
    district: string | null; clubName: string | null;
    membershipLabel: string | null; paymentMethodLabel: string | null;
    hasReceipt: boolean; receiptName: string | null;
    checkedInAt: string | null;
    registeredAt: string | null;
    history: { id: string; type: string; label: string; toStatus: string | null; comment: string | null; createdAt: string }[];
    messages: { id: string; channel: string; subject: string | null; createdAt: string }[];
}

/** Color de la píldora del estado de un registro COLROTARIOS. */
const COMPLETED_TONE: Record<string, string> = {
    submitted: 'bg-amber-100 text-amber-800',
    validated: 'bg-emerald-100 text-emerald-800',
    payment_confirmed: 'bg-emerald-100 text-emerald-800',
    needs_correction: 'bg-red-100 text-red-700',
    rejected: 'bg-slate-200 text-slate-700',
};

const fmtDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString(activeLocale(), { dateStyle: 'long', timeStyle: 'short' });
};
const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Píldora del estado. El color y el rótulo salen del espejo del módulo. */
const StatusChip = ({ status, label }: { status: string; label?: string }) => {
    const meta = statusMeta(status);
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ${meta.cls}`}>
            {label || meta.label}
        </span>
    );
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <span className="text-[13px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-[15px] font-semibold text-slate-900 sm:max-w-[62%] sm:text-right">{value ?? '—'}</span>
    </div>
);

// ════════════════════════════════════════════════════════════════════
const MiInscripcion = () => {
    // Suscripción al idioma: los formateadores de arriba leen el locale
    // activo, y sin esto la página no se repintaría al cambiarlo.
    useLang();
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(ATTENDEE_TOKEN_KEY));
    const [data, setData] = useState<PortalData | null>(null);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    const [openId, setOpenId] = useState<string | null>(
        () => new URLSearchParams(window.location.search).get('inscripcion'));
    const [detail, setDetail] = useState<RegistrationView | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    // v4.1267 — La ficha abierta de un registro COLROTARIOS (`?completada=`).
    const [completedId, setCompletedId] = useState<string | null>(
        () => new URLSearchParams(window.location.search).get('completada'));
    const [completedDetail, setCompletedDetail] = useState<CompletedView | null>(null);
    const [claimBusy, setClaimBusy] = useState(false);

    // El otro panel de esta misma persona, si tiene esa sesión abierta.
    const sessions = useSiteSessions();
    const otherPanel = sessions.find(x => x.realm === 'portal') || null;

    const resetToken = useMemo(() => new URLSearchParams(window.location.search).get('reset'), []);
    const verifyToken = useMemo(() => new URLSearchParams(window.location.search).get('verificar'), []);
    const claimToken = useMemo(() => new URLSearchParams(window.location.search).get('vincular'), []);

    // Salir cierra la identidad en el sitio entero, no sólo en esta pantalla:
    // el encabezado escucha ese aviso y baja el avatar en el acto (v4.693).
    const logout = useCallback(() => {
        forgetSession('attendee');
        setToken(null); setData(null); setDetail(null); setOpenId(null);
        setCompletedDetail(null); setCompletedId(null);
    }, []);

    const loadPortal = useCallback((t: string) => {
        setLoading(true);
        fetch(`${API}/event-registrations/portal/me`, { headers: { Authorization: `Bearer ${t}` } })
            .then(async r => {
                const body = await r.json();
                if (r.status === 401) { logout(); return null; }
                if (!r.ok) throw new Error(body?.error || 'No pudimos cargar tu inscripción.');
                return body as PortalData;
            })
            .then(body => {
                if (!body) return;
                setData(body);
                // Nombre para el menú del avatar: el token lleva el correo, no
                // cómo se llama quien entró.
                const nombre = [body.profile?.firstName, body.profile?.lastName]
                    .filter(Boolean).join(' ').trim();
                rememberProfile('attendee', {
                    name: nombre || null,
                    org: body.registrations?.[0]?.event?.title || body.completed?.[0]?.event?.title || null,
                    email: body.profile?.email || null,
                });
            })
            .catch(e => setNotice({ kind: 'error', text: e?.message || 'No pudimos cargar tu inscripción.' }))
            .finally(() => setLoading(false));
    }, [logout]);

    useEffect(() => { if (token) loadPortal(token); else setLoading(false); }, [token, loadPortal]);

    // Confirmación del correo, cuando el sitio la tiene habilitada.
    useEffect(() => {
        if (!verifyToken) return;
        fetch(`${API}/event-registrations/portal/verify`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: verifyToken }),
        })
            .then(r => r.json())
            .then(body => {
                if (body?.token) {
                    localStorage.setItem(ATTENDEE_TOKEN_KEY, body.token);
                    emitSessionChange();
                    setToken(body.token);
                    setNotice({ kind: 'ok', text: 'Tu correo quedó confirmado.' });
                } else {
                    setNotice({ kind: 'error', text: body?.error || 'No pudimos confirmar tu correo.' });
                }
                window.history.replaceState(null, '', window.location.pathname);
            })
            .catch(() => setNotice({ kind: 'error', text: 'No pudimos confirmar tu correo.' }));
        // Sólo al montar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // v4.1267 — El enlace «Vincular mis inscripciones» del correo. El token
    // prueba la cuenta y el correo a la vez, así que funciona sin sesión.
    useEffect(() => {
        if (!claimToken) return;
        fetch(`${API}/event-registrations/portal/completed/claim/confirm`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: claimToken }),
        })
            .then(async r => {
                const texto = await r.text();
                let body: any = null;
                try { body = JSON.parse(texto); } catch { /* respuesta sin JSON */ }
                if (body?.token) {
                    localStorage.setItem(ATTENDEE_TOKEN_KEY, body.token);
                    emitSessionChange();
                    setToken(body.token);
                    setNotice({
                        kind: 'ok',
                        text: body.linked > 0
                            ? `Vinculamos ${body.linked} inscripción(es) a tu cuenta.`
                            : 'Tu correo quedó confirmado. No encontramos inscripciones pendientes de vincular.',
                    });
                    if (body.linked > 0) loadPortal(body.token);
                } else {
                    setNotice({ kind: 'error', text: body?.error || `No pudimos vincular tus inscripciones (HTTP ${r.status}).` });
                }
                window.history.replaceState(null, '', window.location.pathname);
            })
            .catch(() => setNotice({ kind: 'error', text: 'No pudimos vincular tus inscripciones.' }));
        // Sólo al montar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** «Me inscribí antes sin cuenta»: vincula o manda el enlace al correo. */
    const requestClaim = async () => {
        if (!token) return;
        setClaimBusy(true);
        try {
            const r = await fetch(`${API}/event-registrations/portal/completed/claim`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` },
            });
            const texto = await r.text();
            let body: any = null;
            try { body = JSON.parse(texto); } catch { /* respuesta sin JSON */ }
            if (!r.ok) throw new Error(body?.error || `No pudimos procesar la solicitud (HTTP ${r.status}).`);
            if (body.linked > 0) {
                setNotice({ kind: 'ok', text: `Vinculamos ${body.linked} inscripción(es) a tu cuenta.` });
                loadPortal(token);
            } else if (body.sent) {
                setNotice({ kind: 'ok', text: `Si hay inscripciones enviadas con ${data?.profile.email}, te enviamos un enlace a ese correo para vincularlas. Vence en 2 horas.` });
            } else {
                setNotice({ kind: 'ok', text: 'No encontramos inscripciones pendientes de vincular con tu correo.' });
            }
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos procesar la solicitud.' });
        } finally {
            setClaimBusy(false);
        }
    };

    const openCompleted = (id: string | null) => {
        setCompletedId(id);
        const url = new URL(window.location.href);
        if (id) url.searchParams.set('completada', id); else url.searchParams.delete('completada');
        window.history.pushState(null, '', url.toString());
    };

    useEffect(() => {
        if (!token || !completedId) { setCompletedDetail(null); return; }
        setDetailLoading(true);
        fetch(`${API}/event-registrations/portal/completed/${encodeURIComponent(completedId)}`,
            { headers: { Authorization: `Bearer ${token}` } })
            .then(async r => {
                const texto = await r.text();
                let body: any = null;
                try { body = JSON.parse(texto); } catch { /* respuesta sin JSON */ }
                if (!r.ok || !body) throw new Error(body?.error || 'No encontramos esa inscripción en tu cuenta.');
                return body as CompletedView;
            })
            .then(setCompletedDetail)
            .catch(e => { setCompletedDetail(null); setNotice({ kind: 'error', text: e?.message }); })
            .finally(() => setDetailLoading(false));
    }, [token, completedId]);

    // La ficha abierta vive en la URL: entrar y salir de una es navegar.
    const openRegistration = (id: string | null) => {
        setOpenId(id);
        const url = new URL(window.location.href);
        if (id) url.searchParams.set('inscripcion', id); else url.searchParams.delete('inscripcion');
        window.history.pushState(null, '', url.toString());
    };
    useEffect(() => {
        const onPop = () => {
            const params = new URLSearchParams(window.location.search);
            setOpenId(params.get('inscripcion'));
            setCompletedId(params.get('completada'));
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    useEffect(() => {
        if (!token || !openId) { setDetail(null); return; }
        setDetailLoading(true);
        fetch(`${API}/event-registrations/portal/registrations/${encodeURIComponent(openId)}`,
            { headers: { Authorization: `Bearer ${token}` } })
            .then(async r => {
                const body = await r.json();
                if (!r.ok) throw new Error(body?.error || 'No encontramos esa inscripción en tu cuenta.');
                return body as RegistrationView;
            })
            .then(setDetail)
            .catch(e => { setDetail(null); setNotice({ kind: 'error', text: e?.message }); })
            .finally(() => setDetailLoading(false));
    }, [token, openId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-rotary-concrete">
                <Navbar />
                <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
                    <Loader2 className="mr-2 animate-spin" size={22} style={{ color: BLUE }} /> Cargando tu inscripción…
                </div>
                <Footer />
            </div>
        );
    }

    if (!token || !data) {
        const accept = (t: string) => { localStorage.setItem(ATTENDEE_TOKEN_KEY, t); emitSessionChange(); setToken(t); };
        return resetToken
            ? <AttendeeReset token={resetToken} onToken={accept} />
            : <AttendeeSignIn notice={notice} hadSession={Boolean(token)} />;
    }

    const registrations = data.registrations || [];
    const completedList = data.completed || [];
    const current = detail || registrations.find(r => r.id === openId) || null;
    const currentCompleted = completedDetail || completedList.find(c => c.id === completedId) || null;
    const total = registrations.length + completedList.length;

    return (
        <div className="min-h-screen bg-rotary-concrete">
            <Navbar />

            <header style={PAGE_HEADER_BACKGROUND} className="px-4 py-7 text-white sm:px-6">
                <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Mis eventos</p>
                        <h1 className="mt-1 text-2xl font-bold leading-tight">
                            {[data.profile.firstName, data.profile.lastName].filter(Boolean).join(' ') || data.profile.email}
                        </h1>
                        <p className="mt-1 text-sm text-white/85">{data.profile.email}</p>
                        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
                            <ShieldCheck size={12} /> {data.roleLabel}
                        </span>
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
            </header>

            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
                {notice && (
                    <div className={`mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                        notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                        {notice.kind === 'ok' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
                        <span>{notice.text}</span>
                    </div>
                )}

                {data.profile.emailVerificationRequired && !data.profile.emailVerified && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <Mail size={17} className="mt-0.5 shrink-0" />
                        <span>Te enviamos un correo para confirmar tu dirección. Ábrelo para terminar de activar tu cuenta.</span>
                    </div>
                )}

                {currentCompleted ? (
                    <CompletedDetail
                        registration={currentCompleted}
                        token={token}
                        loading={detailLoading}
                        onBack={() => openCompleted(null)}
                    />
                ) : current ? (
                    <RegistrationDetail
                        registration={current}
                        loading={detailLoading}
                        onBack={() => openRegistration(null)}
                    />
                ) : total === 0 ? (
                    <div className="space-y-4">
                        <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
                            <Ticket className="mx-auto mb-4" size={40} style={{ color: BLUE }} />
                            <h2 className="mb-2 text-2xl font-bold text-slate-900">Todavía no tienes inscripciones</h2>
                            <p className="text-slate-600">
                                Cuando te inscribas a un evento aparecerá aquí, con su estado y su comprobante.
                            </p>
                        </section>
                        <ClaimBox busy={claimBusy} onClaim={requestClaim} />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500">
                            {total === 1
                                ? 'Tu inscripción:'
                                : `Tus ${total} inscripciones:`}
                        </p>
                        {completedList.map(c => (
                            <button key={c.id} type="button" onClick={() => openCompleted(c.id)}
                                className="block w-full rounded-2xl bg-white p-6 text-left shadow-sm transition hover:shadow-md sm:p-7">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900">{c.event?.title || 'Evento'}</h2>
                                        <p className="mt-1 text-sm text-slate-500">Inscripción completada{c.paymentMethodLabel ? ` · ${c.paymentMethodLabel}` : ''}</p>
                                    </div>
                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-bold ${COMPLETED_TONE[c.status] || 'bg-slate-100 text-slate-700'}`}>
                                        {c.statusLabel}
                                    </span>
                                </div>
                                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-slate-500">
                                    {c.event?.startDate && (
                                        <span className="flex items-center gap-1.5"><CalendarDays size={14} /> {fmtDate(c.event.startDate)}</span>
                                    )}
                                    {c.event?.location && (
                                        <span className="flex items-center gap-1.5"><MapPin size={14} /> {c.event.location}</span>
                                    )}
                                    {c.registrationCode && (
                                        <span className="flex items-center gap-1.5" data-no-translate><Ticket size={14} /> {c.registrationCode}</span>
                                    )}
                                </div>
                                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: BLUE }}>
                                    Ver el detalle <ArrowRight size={15} />
                                </span>
                            </button>
                        ))}
                        {registrations.map(r => (
                            <button key={r.id} type="button" onClick={() => openRegistration(r.id)}
                                className="block w-full rounded-2xl bg-white p-6 text-left shadow-sm transition hover:shadow-md sm:p-7">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900">{r.event?.title || 'Evento'}</h2>
                                        <p className="mt-1 text-sm text-slate-500">{r.categoryLabel}</p>
                                    </div>
                                    <StatusChip status={r.status} label={r.statusLabel} />
                                </div>
                                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-slate-500">
                                    {r.event?.startDate && (
                                        <span className="flex items-center gap-1.5"><CalendarDays size={14} /> {fmtDate(r.event.startDate)}</span>
                                    )}
                                    {r.event?.location && (
                                        <span className="flex items-center gap-1.5"><MapPin size={14} /> {r.event.location}</span>
                                    )}
                                    <span className="flex items-center gap-1.5">
                                        <Ticket size={14} /> {r.registrationCode || r.publicRef}
                                    </span>
                                    {Number(r.chargeAmount) > 0 && (
                                        <span className="flex items-center gap-1.5">
                                            <Wallet size={14} /> {money(r.chargeAmount, r.chargeCurrency)}
                                        </span>
                                    )}
                                    {r.companionsCount > 0 && (
                                        <span className="flex items-center gap-1.5"><Users size={14} /> {r.companionsCount} acompañante(s)</span>
                                    )}
                                </div>
                                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: BLUE }}>
                                    Ver el detalle <ArrowRight size={15} />
                                </span>
                            </button>
                        ))}
                        <ClaimBox busy={claimBusy} onClaim={requestClaim} />
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
};

// ── Ficha de una inscripción ─────────────────────────────────────────

const RegistrationDetail = ({ registration, loading, onBack }: {
    registration: RegistrationView; loading: boolean; onBack: () => void;
}) => {
    const r = registration;
    const code = r.registrationCode || r.publicRef;
    // El QR lleva el CÓDIGO, no una URL: en la sede puede no haber internet.
    const qr = useMemo(() => (code ? qrToSvg(code, 168) : ''), [code]);
    const converted = r.chargeCurrency !== r.baseCurrency;

    return (
        <div className="space-y-5">
            <button type="button" onClick={onBack}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                <ArrowLeft size={15} /> Volver a mis inscripciones
            </button>

            {loading && (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 size={15} className="animate-spin" /> Actualizando…
                </p>
            )}

            {/* Cabecera de la inscripción */}
            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{r.event?.title || 'Evento'}</h2>
                        <p className="mt-1 text-sm font-semibold" style={{ color: BLUE }}>{r.categoryLabel}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-slate-500">
                            {r.event?.startDate && (
                                <span className="flex items-center gap-1.5"><CalendarDays size={14} /> {fmtDate(r.event.startDate)}</span>
                            )}
                            {r.event?.location && (
                                <span className="flex items-center gap-1.5"><MapPin size={14} /> {r.event.location}</span>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <StatusChip status={r.status} label={r.statusLabel} />
                        {r.statusDescription && (
                            <p className="mt-2 max-w-[16rem] text-[12px] leading-relaxed text-slate-500">{r.statusDescription}</p>
                        )}
                    </div>
                </div>

                {/* Código con QR */}
                <div className="mt-7 flex flex-col items-center gap-5 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center">
                    {qr && (
                        <div className="shrink-0 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
                    )}
                    <div className="text-center sm:text-left">
                        <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:justify-start">
                            <QrCode size={13} /> Código de inscripción
                        </p>
                        <p className="mt-1 font-mono text-2xl font-extrabold tracking-wider" style={{ color: BLUE }}>{code}</p>
                        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                            {r.checkedInAt
                                ? `Acreditado el ${fmtDateTime(r.checkedInAt)}.`
                                : 'Presenta este código el día del evento para recoger tu escarapela.'}
                        </p>
                    </div>
                </div>
            </section>

            {/* Datos de la inscripción */}
            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                    <FileText size={15} /> Tu inscripción
                </h3>
                <Row label="Participante" value={`${r.firstName || ''} ${r.lastName || ''}`.trim()} />
                <Row label="Correo" value={r.email} />
                {r.phone && <Row label="Teléfono" value={r.phone} />}
                <Row label="Categoría" value={r.categoryLabel} />
                <Row label="Estado del formulario" value={r.registeredAt ? 'Enviado' : 'En borrador'} />
                <Row label="Fecha de registro" value={fmtDateTime(r.registeredAt)} />
                <Row label="Referencia" value={r.publicRef} />
                {r.notes && <Row label="Observaciones que registraste" value={r.notes} />}
            </section>

            {/* Pago */}
            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                    <CreditCard size={15} /> Pago
                </h3>
                <Row label="Estado del pago" value={<StatusChip status={r.status} label={r.statusLabel} />} />
                <Row label="Valor de la inscripción" value={
                    Number(r.baseAmount) > 0 ? money(r.baseAmount, r.baseCurrency) : 'Sin costo'} />
                {converted && Number(r.chargeAmount) > 0 && (
                    <>
                        <Row label="Valor cobrado" value={money(r.chargeAmount, r.chargeCurrency)} />
                        <Row label="Tasa aplicada" value={r.fxRate ? String(r.fxRate) : '—'} />
                    </>
                )}
                {Number(r.companionsAmount) > 0 && (
                    <Row label="Acompañantes" value={money(r.companionsAmount, r.baseCurrency)} />
                )}
                {r.paidAt && <Row label="Fecha del pago" value={fmtDateTime(r.paidAt)} />}
                {r.paymentMethod && <Row label="Medio de pago" value={r.paymentMethod} />}
                {r.refundedAt && (
                    <Row label="Reembolsado" value={`${fmtDateTime(r.refundedAt)}${
                        r.refundedAmount ? ` · ${money(r.refundedAmount, r.chargeCurrency)}` : ''}`} />
                )}
                {r.receiptUrl && (
                    <a href={r.receiptUrl} target="_blank" rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold hover:underline" style={{ color: BLUE }}>
                        Ver el comprobante <ExternalLink size={14} />
                    </a>
                )}
                {(r.payments || []).length > 0 && (
                    <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                        {(r.payments || []).map(p => (
                            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate-500">
                                <span>{fmtDateTime(p.occurredAt)} · {p.status}</span>
                                <span className="font-semibold text-slate-700">{money(p.amount, p.currency)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Acompañantes */}
            {(r.companions || []).length > 0 && (
                <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                        <Users size={15} /> Acompañantes ({r.companions.length})
                    </h3>
                    <div className="space-y-3">
                        {r.companions.map((c, i) => (
                            <div key={c.id || i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                <p className="text-[15px] font-bold text-slate-800">
                                    {[c.firstName, c.lastName].filter(Boolean).join(' ')}
                                </p>
                                <p className="mt-1 text-[13px] text-slate-500">
                                    {[c.relationship, c.documentNumber, c.email].filter(Boolean).join(' · ') || '—'}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Comunicaciones recibidas */}
            {(r.messages || []).length > 0 && (
                <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                        <Mail size={15} /> Comunicaciones que te enviamos
                    </h3>
                    <div className="space-y-3">
                        {(r.messages || []).map(m => (
                            <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0">
                                <div>
                                    <p className="text-[15px] font-semibold text-slate-800">{m.subject || 'Mensaje'}</p>
                                    <p className="text-[13px] text-slate-500">{m.channel} · {fmtDateTime(m.createdAt)}</p>
                                </div>
                                {m.status !== 'sent' && (
                                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">{m.status}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Actualizaciones */}
            {(r.history || []).length > 0 && (
                <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                        <Clock size={15} /> Actualizaciones
                    </h3>
                    <ol className="space-y-4">
                        {(r.history || []).map(h => (
                            <li key={h.id} className="flex gap-3">
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: BLUE }} />
                                <div>
                                    <p className="text-[15px] text-slate-800">{h.comment || h.type}</p>
                                    <p className="text-[13px] text-slate-500">{fmtDateTime(h.createdAt)}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </div>
    );
};

// ── Sin sesión ───────────────────────────────────────────────────────

// ── «Me inscribí antes sin cuenta» (v4.1267) ─────────────────────────

const ClaimBox = ({ busy, onClaim }: { busy: boolean; onClaim: () => void }) => (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Link2 size={15} style={{ color: BLUE }} /> ¿Enviaste tu inscripción antes de tener cuenta?
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
            Vinculamos a tu cuenta las inscripciones que enviaste con tu mismo correo. Para proteger tus datos, primero
            confirmamos que el correo es tuyo con un enlace que te llega a él.
        </p>
        <button type="button" onClick={onClaim} disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Buscar y vincular mis inscripciones
        </button>
    </section>
);

// ── Ficha de un registro «Completar inscripción» (v4.1267) ───────────

const STAGE_TONE: Record<string, string> = {
    emerald: 'bg-emerald-600 text-white',
    amber: 'bg-amber-500 text-white',
    red: 'bg-red-600 text-white',
    slate: 'bg-slate-500 text-white',
};

const CompletedDetail = ({ registration, token, loading, onBack }: {
    registration: CompletedView; token: string | null; loading: boolean; onBack: () => void;
}) => {
    const r = registration;
    const [receiptBusy, setReceiptBusy] = useState(false);
    const [receiptError, setReceiptError] = useState('');

    // El enlace firmado se pide al pulsar y vence en 2 minutos: no queda
    // ninguna URL permanente del comprobante en la página.
    const openReceipt = async () => {
        if (!token) return;
        setReceiptBusy(true);
        setReceiptError('');
        try {
            const res = await fetch(`${API}/event-registrations/portal/completed/${encodeURIComponent(r.id)}/receipt`,
                { headers: { Authorization: `Bearer ${token}` } });
            const texto = await res.text();
            let body: any = null;
            try { body = JSON.parse(texto); } catch { /* respuesta sin JSON */ }
            if (!res.ok || !body?.url) throw new Error(body?.error || `No pudimos abrir el comprobante (HTTP ${res.status}).`);
            window.open(body.url, '_blank', 'noopener,noreferrer');
        } catch (e: any) {
            setReceiptError(e?.message || 'No pudimos abrir el comprobante.');
        } finally {
            setReceiptBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <button type="button" onClick={onBack}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                <ArrowLeft size={15} /> Volver a mis eventos
            </button>

            {loading && (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 size={15} className="animate-spin" /> Actualizando…
                </p>
            )}

            {/* Información del evento */}
            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{r.event?.title || 'Evento'}</h2>
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-slate-500">
                            {r.event?.startDate && (
                                <span className="flex items-center gap-1.5">
                                    <CalendarDays size={14} /> {fmtDate(r.event.startDate)}
                                    {r.event.endDate && r.event.endDate !== r.event.startDate ? ` – ${fmtDate(r.event.endDate)}` : ''}
                                </span>
                            )}
                            {r.event?.location && (
                                <span className="flex items-center gap-1.5"><MapPin size={14} /> {r.event.location}</span>
                            )}
                        </div>
                        {(r.event?.slug || r.event?.id) && (
                            <Link to={`/eventos/${r.event.slug || r.event.id}`}
                                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: BLUE }}>
                                <ExternalLink size={14} /> Ver la página del evento
                            </Link>
                        )}
                    </div>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-bold ${COMPLETED_TONE[r.status] || 'bg-slate-100 text-slate-700'}`}>
                        {r.statusLabel}
                    </span>
                </div>
            </section>

            {/* Estado de validación: las etapas salen del estado REAL. */}
            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                <h3 className="mb-5 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                    <ShieldCheck size={15} /> Estado de validación
                </h3>
                <ol className="grid gap-3 sm:grid-cols-3">
                    {(r.stages || []).map((stage, i) => (
                        <li key={stage.key}
                            className={`rounded-xl border p-4 ${stage.current ? 'border-slate-300 bg-slate-50' : 'border-slate-100'}`}>
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${
                                stage.done ? STAGE_TONE[stage.tone] || STAGE_TONE.emerald : stage.current ? STAGE_TONE.amber : 'bg-slate-100 text-slate-400'}`}>
                                {stage.done ? <CheckCircle2 size={15} /> : stage.current ? <Clock size={14} /> : i + 1}
                            </span>
                            <p className={`mt-2 text-sm font-bold ${stage.done || stage.current ? 'text-slate-900' : 'text-slate-400'}`}>{stage.label}</p>
                            {stage.description && <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{stage.description}</p>}
                        </li>
                    ))}
                </ol>
                <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
                    {r.statusDescription}
                    {' '}La cuenta te permite consultar tu inscripción; la confirma el Equipo de Registro al validar el comprobante.
                </p>
            </section>

            {/* Mi inscripción */}
            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                    <FileText size={15} /> Mi inscripción
                </h3>
                <Row label="Código" value={<span className="font-mono" data-no-translate>{r.registrationCode || '—'}</span>} />
                <Row label="Participante" value={`${r.firstName || ''} ${r.lastName || ''}`.trim() || '—'} />
                <Row label="Correo" value={r.email} />
                {r.clubName && <Row label="Club" value={r.clubName} />}
                {r.district && <Row label="Distrito" value={r.district} />}
                {r.membershipLabel && <Row label="Vínculo" value={r.membershipLabel} />}
                {r.paymentMethodLabel && <Row label="Método de pago" value={r.paymentMethodLabel} />}
                <Row label="Fecha de registro" value={fmtDateTime(r.registeredAt)} />
                <Row label="Estado" value={r.statusLabel} />
                {r.checkedInAt && <Row label="Acreditación" value={`Acreditado el ${fmtDateTime(r.checkedInAt)}`} />}
            </section>

            {/* Mis comprobantes */}
            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                    <Paperclip size={15} /> Mis comprobantes
                </h3>
                {r.hasReceipt ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
                        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
                            <FileText size={16} className="shrink-0 text-slate-400" />
                            <span className="truncate" data-no-translate>{r.receiptName || 'Comprobante de pago'}</span>
                        </p>
                        <button type="button" onClick={openReceipt} disabled={receiptBusy}
                            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                            style={{ background: BLUE }}>
                            {receiptBusy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />} Ver comprobante
                        </button>
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">Esta inscripción no tiene comprobante cargado.</p>
                )}
                {receiptError && (
                    <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-red-600"><AlertCircle size={13} /> {receiptError}</p>
                )}
            </section>

            {/* Historial: sólo hechos registrados. */}
            <section className="rounded-2xl bg-white p-6 shadow-sm sm:p-9">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                    <History size={15} /> Historial
                </h3>
                {r.history?.length ? (
                    <ol className="space-y-4 border-l-2 border-slate-100 pl-5">
                        {r.history.map(h => (
                            <li key={h.id} className="relative">
                                <span className="absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
                                    <Circle size={12} style={{ color: BLUE }} fill="currentColor" />
                                </span>
                                <p className="text-sm font-semibold text-slate-800">{h.label}</p>
                                {h.comment && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{h.comment}</p>}
                                <p className="mt-0.5 text-[12px] text-slate-400">{fmtDateTime(h.createdAt)}</p>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="text-sm text-slate-500">{loading ? 'Cargando…' : 'Todavía no hay movimientos registrados.'}</p>
                )}
                {Boolean(r.messages?.length) && (
                    <div className="mt-6 border-t border-slate-100 pt-4">
                        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
                            <Mail size={13} /> Correos que te enviamos
                        </p>
                        <ul className="space-y-1.5">
                            {r.messages.map(m => (
                                <li key={m.id} className="flex flex-wrap justify-between gap-2 text-[13px] text-slate-600">
                                    <span>{m.subject || 'Correo'}</span>
                                    <span className="text-slate-400">{fmtDateTime(m.createdAt)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>
        </div>
    );
};

const AttendeeSignIn = ({ notice, hadSession }: { notice: any; hadSession?: boolean }) => {
    // Con sesión abierta y una carga fallida, el problema NO es el ingreso:
    // decirlo evita mandar a escribir otra vez unas credenciales correctas.
    const failed = Boolean(hadSession && notice?.kind === 'error');
    // Se abre solo al llegar: quien entra a /mi-inscripcion viene a entrar.
    useEffect(() => {
        if (failed) return;
        openLoginModal({
            next: ATTENDEE_PATH,
            reason: notice?.text || 'Ingresa con el correo y la contraseña que creaste al inscribirte.',
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
                    <h1 className="text-xl font-bold text-slate-900">Consulta tu inscripción</h1>
                    <p className="mt-1.5 text-sm text-slate-500">
                        {failed ? notice.text : 'Con el correo y la contraseña que creaste al inscribirte al evento.'}
                    </p>

                    {notice?.text && (
                        <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] ${
                            notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                            {notice.kind === 'ok' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
                            <span>{notice.text}</span>
                        </div>
                    )}

                    <button
                        onClick={() => openLoginModal({ next: ATTENDEE_PATH })}
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white transition hover:opacity-90"
                        style={{ background: BLUE }}>
                        Iniciar sesión <ArrowRight size={16} />
                    </button>

                    <button
                        onClick={() => openLoginModal({ mode: 'forgot', next: ATTENDEE_PATH })}
                        className="mt-3 text-[13px] font-semibold text-slate-500 hover:text-slate-800">
                        Olvidé mi contraseña
                    </button>
                </div>
            </div>
            <Footer />
        </div>
    );
};

/** Creación de contraseña desde el enlace del correo. */
const AttendeeReset = ({ token, onToken }: { token: string; onToken: (t: string) => void }) => {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        setError('');
        if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
        if (password !== confirm) return setError('Las contraseñas no coinciden.');
        setBusy(true);
        try {
            const res = await fetch(`${API}/event-registrations/portal/reset`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || 'No pudimos restablecer la contraseña.');
            window.history.replaceState(null, '', window.location.pathname);
            onToken(body.token);
        } catch (e: any) {
            setError(e?.message || 'No pudimos restablecer la contraseña.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-rotary-concrete">
            <Navbar />
            <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
                <div className="w-full rounded-2xl bg-white p-8 shadow-sm">
                    <div className="mb-5 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `${BLUE}14` }}>
                            <KeyRound size={22} style={{ color: BLUE }} />
                        </div>
                        <h1 className="text-xl font-bold text-slate-900">Crea tu contraseña</h1>
                        <p className="mt-1.5 text-sm text-slate-500">
                            Con ella consultarás el estado de tu inscripción.
                        </p>
                    </div>

                    {error && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
                            <AlertCircle size={15} className="mt-0.5 shrink-0" /> <span>{error}</span>
                        </div>
                    )}

                    <div className="grid gap-4">
                        <Field label="Contraseña" name="new-password" type="password" revealable
                            value={password} onChange={(e: any) => setPassword(e.target.value)}
                            placeholder="Mínimo 8 caracteres" />
                        <Field label="Repite la contraseña" name="new-password-confirm" type="password" revealable
                            value={confirm} onChange={(e: any) => setConfirm(e.target.value)}
                            placeholder="Escríbela de nuevo" />
                    </div>

                    <button onClick={submit} disabled={busy}
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                        style={{ background: BLUE }}>
                        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Guardar y entrar
                    </button>
                </div>
            </div>
            <Footer />
        </div>
    );
};

export default MiInscripcion;
