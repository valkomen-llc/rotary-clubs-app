// ════════════════════════════════════════════════════════════════════
// Registro — Feria de Proyectos Rotary Colombia
// v4.602.0 — Página pública del botón de registro de la cabecera.
//
// Publica una copia del panel de inscripción de la Conferencia LATIR
// (`RegistrationPanel`): logo, cuenta regresiva, botón, precios y fecha de
// cierre, con los datos de la Feria en vez de los de LATIR.
//
// Ruta pública: /registro-feria. Todo el contenido llega de
// /api/project-fair/config → `registrationPanel`, que el administrador edita
// en Postulaciones y Pagos → Convocatoria. Los campos que deje vacíos se
// completan solos con los datos de la edición (nombre, ciudad, fecha límite,
// valor de inscripción), así que la página funciona sin configurar nada.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Clock, Loader2, MapPin } from 'lucide-react';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import RegistrationPanel from '../components/RegistrationPanel';
import { PROJECT_FAIR_FORM_PATH } from '../lib/ctaLinks';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

const BLUE = '#17458F';

// Paleta de la Feria para el panel (la de LATIR es naranja/azul oscuro).
const FAIR_THEME = {
    title: 'text-[#17458F]',
    subtitle: 'text-slate-600',
    counter: 'bg-[#F7A81B] text-[#17458F]',
    button: 'bg-[#17458F] hover:bg-[#12356e] text-white',
    tickets: 'text-[#17458F]',
};

interface RegistrationPanelConfig {
    enabled?: boolean;
    headerLogo?: string;
    title?: string;
    subtitle?: string;
    startDate?: string;
    buttonLabel?: string;
    buttonLink?: string;
    ticketGeneralLabel?: string;
    ticketGeneral?: string;
    ticketNote?: string;
    ticketRotexLabel?: string;
    ticketRotex?: string;
    closeLabel?: string;
    closeDateText?: string;
    footerImage?: string;
    intro?: string;
}

interface FairConfig {
    enabled: boolean;
    formPath?: string;
    edition: { number: number; ordinal: string; name: string; city: string; country: string; year: number; dates?: string; key: string };
    deadline: string | null;
    registration: { amountCop: number; currency: string; concept: string; maxProjectsPerClub: number };
    content: { title: string; subtitle: string; intro: string; requirements: string[]; note: string; priorityNote: string };
    registrationPanel?: RegistrationPanelConfig;
}

/**
 * Interpreta una fecha "YYYY-MM-DD" en la zona del visitante y la lleva al
 * final del día. Evita el corrimiento de un día que produce `new Date(...)`
 * al leerla como UTC en husos negativos, que es el caso de Colombia.
 */
const parseDeadline = (value?: string | null): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
    if (!match) {
        const loose = new Date(String(value || ''));
        return Number.isFinite(loose.getTime()) ? loose : null;
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
};

const formatDay = (date: Date) =>
    date.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

const formatCop = (amount: number) => `$${Number(amount || 0).toLocaleString('es-CO')} COP`;

const RegistroFeria = () => {
    const [config, setConfig] = useState<FairConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => { window.scrollTo(0, 0); }, []);

    useEffect(() => {
        fetch(`${API}/project-fair/config`)
            .then(r => r.json())
            .then(data => {
                if (data?.error) throw new Error(data.error);
                setConfig(data);
            })
            .catch(() => setError('No pudimos cargar la información del registro. Intenta de nuevo en un momento.'))
            .finally(() => setLoading(false));
    }, []);

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

    const panel = config?.registrationPanel || {};
    const edition = config?.edition;
    const deadline = parseDeadline(config?.deadline);

    // Cada campo vacío cae en el dato equivalente de la edición: así el panel
    // sigue diciendo la verdad aunque el admin no lo haya tocado.
    const title = panel.title || edition?.name || 'Feria de Proyectos Rotary Colombia';
    const subtitle = panel.subtitle
        || [edition?.city, edition?.country].filter(Boolean).join(', ')
        || '';
    const startDate = panel.startDate || (deadline ? deadline.toISOString() : '');
    const buttonLink = panel.buttonLink || config?.formPath || PROJECT_FAIR_FORM_PATH;
    const ticketGeneral = panel.ticketGeneral
        || (config?.registration?.amountCop ? formatCop(config.registration.amountCop) : '');
    const closeDateText = panel.closeDateText || (deadline ? formatDay(deadline) : '');
    const intro = panel.intro || config?.content?.intro || '';

    return (
        <div className="min-h-screen bg-rotary-concrete">
            <Navbar />

            <header style={PAGE_HEADER_BACKGROUND} className="px-4 py-8 text-white sm:px-6 sm:py-10">
                <div className="mx-auto max-w-5xl text-center sm:text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Registro</p>
                    <h1 className="mt-1.5 text-2xl font-bold leading-tight sm:text-3xl">{edition?.name}</h1>
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-white/85 sm:justify-start">
                        <MapPin size={14} /> {edition?.city}{edition?.country ? `, ${edition.country}` : ''}
                        {edition?.dates ? ` · ${edition.dates}` : ''}
                    </p>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
                {error && (
                    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <AlertCircle size={17} className="mt-0.5 shrink-0" /> <span>{error}</span>
                    </div>
                )}

                {panel.enabled === false ? (
                    <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
                        <Clock className="mx-auto mb-4" size={40} style={{ color: BLUE }} />
                        <h2 className="mb-2 text-2xl font-bold text-slate-900">Registro cerrado</h2>
                        <p className="text-slate-600">
                            En este momento no estamos recibiendo registros para la {edition?.name}.
                            Escríbenos si necesitas más información.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
                        {/* Texto de la convocatoria */}
                        <section className="rounded-2xl bg-white p-7 shadow-sm sm:p-9">
                            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                                {config?.content?.title || 'Participa en la Feria'}
                            </h2>
                            {config?.content?.subtitle && (
                                <p className="mt-1 text-sm font-semibold" style={{ color: BLUE }}>{config.content.subtitle}</p>
                            )}
                            {intro && (
                                <p className="mt-4 text-[15px] leading-relaxed text-slate-600">{intro}</p>
                            )}

                            {!!config?.content?.requirements?.length && (
                                <ul className="mt-6 space-y-2.5">
                                    {config.content.requirements.map((item, i) => (
                                        <li key={i} className="flex items-start gap-2.5 text-[15px] text-slate-700">
                                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: BLUE }} />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {config?.content?.note && (
                                <p className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                                    {config.content.note}
                                </p>
                            )}

                            <Link
                                to={config?.formPath || PROJECT_FAIR_FORM_PATH}
                                className="mt-7 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:opacity-90"
                                style={{ background: BLUE }}
                            >
                                Ir al formulario de postulación <ArrowRight size={16} />
                            </Link>
                        </section>

                        {/* Panel de inscripción (copia del de la Conferencia LATIR) */}
                        <aside>
                            <RegistrationPanel
                                headerLogo={panel.headerLogo}
                                title={title}
                                subtitle={subtitle}
                                startDate={startDate}
                                buttonLabel={panel.buttonLabel || 'Inscripciones'}
                                buttonLink={buttonLink}
                                ticketGeneralLabel={panel.ticketGeneralLabel || 'Inscripción de proyecto:'}
                                ticketGeneral={ticketGeneral}
                                ticketNote={panel.ticketNote}
                                ticketRotexLabel={panel.ticketRotexLabel}
                                ticketRotex={panel.ticketRotex}
                                closeLabel={panel.closeLabel || 'Cierre de inscripciones:'}
                                closeDateText={closeDateText}
                                footerImage={panel.footerImage}
                                theme={FAIR_THEME}
                            />
                        </aside>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default RegistroFeria;
