// ════════════════════════════════════════════════════════════════════
// Mi Proyecto — Gestión de Proyectos del club
// v4.642.0
//
// Espacio privado del club que ya se inscribió y pagó. Ruta pública:
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
    ShieldCheck, Trophy, Wallet,
} from 'lucide-react';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
import { PROJECT_FAIR_PORTAL_PATH, PROJECT_FAIR_PORTAL_TOKEN_KEY } from '../lib/ctaLinks';
import { openLoginModal } from '../lib/loginModal';
import { forgetSession, rememberProfile, emitSessionChange, useSiteSessions } from '../lib/siteSession';
import { FORM_STATE_META, fmtDateTime, type FormCard, type FormState } from '../lib/projectForms';
import { inputCls, BLUE } from '../components/project-forms/FormFields';
import ProjectFormView from '../components/project-forms/ProjectFormView';
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
    };
    // El veredicto del pago llega RESUELTO del servidor: qué estado tiene, qué
    // frase se muestra, si se puede pagar y con qué rótulo. Esta pantalla lo
    // PINTA y no vuelve a decidir nada — el navegador no es la fuente de
    // verdad del estado de un cobro (v4.978).
    payment?: PaymentState;
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

interface PaymentAttempt { n: number; status: string; label: string; reason: string | null; at: string | null }
interface PaymentState {
    state: 'paid' | 'failed' | 'pending' | 'refunded';
    paid: boolean;
    canPay: boolean;
    label: string;
    detail: string | null;
    actionLabel: string | null;
    amountCop: number | null;
    amountUsd: number | null;
    /** En qué moneda se publicó el precio. */
    priceMode?: 'COP' | 'USD';
    /** El recargo que se le SUMA al valor al pagar, ya resuelto por el
     *  servidor (v4.980). Ausente —bundle o servidor anterior— la banda se ve
     *  como antes: sólo el precio. */
    surcharge?: {
        enabled: boolean;
        currency: string;
        base: number;
        lines: { key: string; label: string; percent: number; fixed: number; amount: number }[];
        surcharge: number;
        total: number;
    } | null;
    paidAt: string | null;
    receiptUrl: string | null;
    attempts: PaymentAttempt[];
}

const fmtCop = (n?: number | null) => `$${Number(n || 0).toLocaleString(activeLocale(), { maximumFractionDigits: 0 })}`;
/** El importe con los decimales de SU moneda. El peso se escribe sin decimales
 *  y el dólar con dos: uno solo para las dos monedas escribiría «250000,00». */
const fmtMoneda = (n: number, currency: string) =>
    `${Number(n || 0).toLocaleString(activeLocale(), {
        maximumFractionDigits: String(currency).toUpperCase() === 'COP' ? 0 : 2,
    })} ${String(currency).toUpperCase()}`;
/** El tanto por uno como porcentaje: 0.029 → «2,9 %». */
const pct = (n: number) =>
    `${(Math.round((Number(n) || 0) * 10000) / 100).toLocaleString(activeLocale(), { maximumFractionDigits: 2 })} %`;
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
    const [data, setData] = useState<PortalData | null>(null);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    // Formulario abierto. Va en la URL (?form=…) para poder compartir el enlace
    // y para que el botón "atrás" del navegador haga lo que se espera.
    const [openForm, setOpenForm] = useState<string | null>(
        () => new URLSearchParams(window.location.search).get('form')
    );
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
        setToken(null); setData(null); setOpenForm(null);
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
        if (!token || paying) return;
        setPaying(true);
        setNotice(null);
        try {
            const res = await fetch(`${API}/project-fair/portal/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ returnUrl: window.location.origin }),
            });
            const body = await res.json().catch(() => ({}));
            if (res.status === 401) { logout(); return; }
            if (body?.alreadyPaid) {
                setNotice({ kind: 'ok', text: 'Tu pago ya estaba confirmado. Los formularios quedaron habilitados.' });
                loadPortal(token, true);
                setPaying(false);
                return;
            }
            if (!res.ok || !body?.url) throw new Error(body?.error || 'No pudimos iniciar el pago.');
            window.location.href = body.url;
        } catch (e: any) {
            setNotice({ kind: 'error', text: e?.message || 'No pudimos iniciar el pago. Inténtalo de nuevo en un momento.' });
            setPaying(false);
        }
    }, [token, paying, logout, loadPortal]);

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

    useEffect(() => { if (token) loadPortal(token); }, [token, loadPortal]);

    // El formulario abierto vive en la URL: entrar y salir de uno es navegar.
    const openFormView = (key: string | null) => {
        setOpenForm(key);
        const url = new URL(window.location.href);
        if (key) url.searchParams.set('form', key); else url.searchParams.delete('form');
        window.history.pushState(null, '', url.toString());
    };
    useEffect(() => {
        const onPop = () => setOpenForm(new URLSearchParams(window.location.search).get('form'));
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
        if (!aguardandoPago || !token) return;
        if (data?.payment && !data.payment.canPay) { setAguardandoPago(false); return; }
        let vueltas = 0;
        const timer = setInterval(() => {
            if (++vueltas > 10) { setAguardandoPago(false); clearInterval(timer); return; }
            loadPortal(token, true);
        }, 4000);
        return () => clearInterval(timer);
    }, [aguardandoPago, token, data?.payment, loadPortal]);

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

    return (
        <div className="min-h-screen bg-rotary-concrete">
            <Navbar />

            <header style={PAGE_HEADER_BACKGROUND} className="px-4 py-7 text-white sm:px-6">
                <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Gestión de proyectos</p>
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
            </header>

            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
                {current ? (
                    <ProjectFormView
                        token={token}
                        formKey={current.key}
                        onBack={() => openFormView(null)}
                        onProgress={() => loadPortal(token, true)}
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

                        {/* Estado de la inscripción */}
                        <section className="mb-6 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    <Wallet size={13} /> Inscripción
                                </p>
                                {/* El rótulo lo decide el SERVIDOR (`payment.label`), que es
                                    quien acaba de preguntarle a la pasarela. Sin `payment`
                                    —una respuesta anterior a v4.978— se degrada al estado
                                    guardado y sin acción: mejor un rótulo de más que ofrecer
                                    pagar sin saber si ya está pagado. */}
                                <p className={`mt-1 text-lg font-bold ${pago ? (pago.paid ? 'text-emerald-600' : 'text-amber-600') : (data.submission.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600')}`}>
                                    {pago ? pago.label : (data.submission.paymentStatus === 'paid' ? 'Pago confirmado' : 'Pendiente de pago')}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {fmtCop(data.submission.amountCop)} COP
                                    {data.submission.paidAt ? ` · ${fmtDateTime(data.submission.paidAt)}` : ''}
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

                        {/* ⚠️ LA ACCIÓN VA JUNTO AL AVISO QUE LA RECLAMA. Hasta v4.977
                            acá sólo se leía «Tu formulario se habilita cuando se
                            confirme el pago» y no había NADA que pulsar: quien
                            recibía un rechazo del banco quedaba con los
                            formularios bloqueados y sin salida. La regla del
                            bloqueo no cambió —sin pago confirmado no hay
                            formularios—; lo que cambia es que ahora se puede
                            resolver desde aquí mismo. */}
                        {pago?.canPay ? (
                            <PaymentCallout
                                pago={pago}
                                bloqueo={!data.canEdit ? data.reason : null}
                                onPay={handlePay}
                                paying={paying}
                                esperando={aguardandoPago}
                            />
                        ) : !data.canEdit && data.reason ? (
                            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                <Lock size={17} className="mt-0.5 shrink-0" /> <span>{data.reason}</span>
                            </div>
                        ) : null}

                        {/* Formularios del proyecto */}
                        <section>
                            <h2 className="text-lg font-bold text-slate-900">Formularios del proyecto</h2>
                            <p className="mt-1 text-[15px] text-slate-600">
                                Diligéncialos en el orden que prefieras. El avance se guarda solo y puedes volver cuantas veces necesites.
                            </p>

                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                {forms.map(form => <FormCardTile key={form.key} form={form} onOpen={() => openFormView(form.key)} />)}
                            </div>

                            {!forms.length && (
                                <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
                                    Todavía no hay formularios habilitados para tu proyecto.
                                </p>
                            )}
                        </section>

                        {/* Paso siguiente */}
                        {data.nextStep?.url && (
                            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center">
                                <p className="text-[15px] text-slate-700">
                                    Cuando tengas tu proyecto formulado, continúa el proceso internacional en{' '}
                                    <strong>{data.nextStep.name || 'Rotary Grants 25A'}</strong>.
                                </p>
                                <a href={data.nextStep.url} target="_blank" rel="noreferrer"
                                    className="mt-4 inline-flex items-center gap-2 rounded-xl border-2 px-6 py-3 text-[15px] font-bold transition hover:bg-slate-50"
                                    style={{ borderColor: BLUE, color: BLUE }}>
                                    {data.nextStep.label || 'Continuar hacia Rotary Grants 25A'} <ExternalLink size={16} />
                                </a>
                            </section>
                        )}
                    </>
                )}
            </main>

            <Footer />
        </div>
    );
};

/**
 * La banda de «Completar pago».
 *
 * ⚠️ ES LA SALIDA DEL CALLEJÓN, y por eso es una banda y no un botón dentro de
 * la tarjeta de tres columnas: lo que hay que resolver tiene que estar donde
 * se mira primero, no a un lado. Dice TRES cosas y las tres hacen falta: qué
 * pasó, qué se pierde mientras no se resuelva (los formularios) y qué hacer.
 *
 * Va en el ámbito del MÓDULO, como todo componente de este archivo: declarada
 * dentro de la página sería un tipo nuevo en cada render y React desmontaría
 * el árbol entero a cada pulsación (la lección de v4.971).
 */
const PaymentCallout = ({ pago, bloqueo, onPay, paying, esperando }: {
    pago: PaymentState; bloqueo: string | null; onPay: () => void; paying: boolean; esperando: boolean;
}) => {
    // Sólo los intentos ya resueltos: uno «en curso» no es historia todavía, y
    // enumerarlo haría que la lista cambiara de largo al recargar.
    const intentos = (pago.attempts || []).filter(a => a.status !== 'open');
    return (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-amber-900">{pago.label}</p>
                    {pago.detail && <p className="mt-0.5 text-sm text-amber-900">{pago.detail}</p>}
                    {bloqueo && <p className="mt-1 text-sm text-amber-800">{bloqueo}</p>}
                    {/* ⚠️ EL RECARGO SE DICE ANTES DE ABRIR LA PASARELA, línea por
                        línea. Enseñar sólo el precio y cobrar más se lee como un
                        cobro indebido; el importe que de verdad se cobra lo calcula
                        el servidor y es el que viene en `surcharge.total`. */}
                    {pago.surcharge?.enabled && pago.surcharge.lines.length > 0 ? (
                        <div className="mt-2 space-y-0.5 text-sm text-amber-900">
                            <div className="flex justify-between gap-4">
                                <span>Inscripción</span>
                                <span>{fmtMoneda(pago.surcharge.base, pago.surcharge.currency)}</span>
                            </div>
                            {pago.surcharge.lines.map(l => (
                                <div key={l.key} className="flex justify-between gap-4">
                                    <span>{l.label} <span className="text-amber-700">({pct(l.percent)})</span></span>
                                    <span>{fmtMoneda(l.amount, pago.surcharge!.currency)}</span>
                                </div>
                            ))}
                            <div className="flex justify-between gap-4 border-t border-amber-200 pt-1 font-bold">
                                <span>Total a pagar</span>
                                <span>{fmtMoneda(pago.surcharge.total, pago.surcharge.currency)}</span>
                            </div>
                        </div>
                    ) : pago.amountCop ? (
                        <p className="mt-1 text-sm font-semibold text-amber-900">{fmtCop(pago.amountCop)} COP</p>
                    ) : null}

                    {/* El detalle de cada intento se guarda para soporte y se
                        resume acá SIN el mensaje del proveedor: es texto de un
                        tercero, en inglés, y no le dice nada a quien paga. */}
                    {intentos.length > 0 && (
                        <details className="mt-2 text-sm text-amber-900">
                            <summary className="cursor-pointer font-semibold">
                                {intentos.length === 1 ? 'Ver el intento anterior' : `Ver los ${intentos.length} intentos anteriores`}
                            </summary>
                            <ul className="mt-2 space-y-1">
                                {intentos.map(a => (
                                    <li key={a.n} className="flex flex-wrap items-baseline gap-x-2">
                                        <span className="font-semibold">Intento {a.n}</span>
                                        <span>· {a.label}</span>
                                        {a.reason && <span className="text-amber-800">· {a.reason}</span>}
                                        {a.at && <span className="text-xs text-amber-700">{fmtDateTime(a.at)}</span>}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
                <button
                    onClick={onPay}
                    disabled={paying}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-bold text-white transition disabled:opacity-60"
                    style={{ backgroundColor: BLUE }}
                >
                    {paying ? <><Loader2 size={16} className="animate-spin" /> Abriendo el pago…</> : <>{pago.actionLabel || 'Completar pago'} <ArrowRight size={16} /></>}
                </button>
            </div>
            {/* Se dice que se está comprobando en vez de dejar la pantalla
                quieta: quien acaba de pagar y ve «Pendiente» concluye que su
                dinero se perdió. */}
            {esperando && (
                <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-800">
                    <Loader2 size={13} className="animate-spin" /> Comprobando con la pasarela si tu pago ya se confirmó…
                </p>
            )}
        </div>
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
