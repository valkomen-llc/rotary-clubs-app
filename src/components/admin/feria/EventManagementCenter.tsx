// ════════════════════════════════════════════════════════════════════
// Centro de Gestión del Evento — v4.1259.0
//
// La sección operativa del dashboard del comité organizador (Feria de
// Proyectos): dos accesos de igual jerarquía —Proyectos postulados e
// Inscripciones y asistentes— y, al abrirlos, el MISMO módulo de siempre
// montado dentro del dashboard.
//
// ⚠️ NO HAY UNA SEGUNDA FUENTE DE DATOS NI UNA SEGUNDA PANTALLA.
//   - Los indicadores de cada tarjeta salen del endpoint que alimenta el
//     tablero de SU módulo (`/project-fair/admin/inteligencia` y
//     `/event-registrations/admin/dashboard`), así que las cifras coinciden
//     con las del módulo por construcción: es la misma consulta.
//   - Las vistas son los componentes del módulo: `PostulacionesPagos` en modo
//     embebido (el listado con sus filtros, ficha, acciones, recordatorios y
//     exportaciones) y `EventRegistrationTab view="inscripciones"` (la tabla,
//     filtros, ficha, pagos, acompañantes, acreditación y exportaciones).
//     Toda acción pasa por los mismos endpoints y los mismos permisos.
//
// ⚠️ LOS DOS PROCESOS NO SE MEZCLAN. Postular un proyecto y inscribirse al
// evento son dos modelos distintos: cada tarjeta cuenta lo suyo, no se suman
// entre sí y ningún estado de uno se deduce del otro.
//
// PERMISOS: la pestaña de un módulo sólo aparece si su endpoint responde. Un
// 403/404 la oculta (no hay acceso) y cualquier otro fallo se dice con
// «Reintentar» — una lista vacía por un error de red se leería como «no hay
// nadie». El backend sigue autorizando cada petición: abrir el módulo desde el
// dashboard no amplía nada.
// ════════════════════════════════════════════════════════════════════
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, ArrowRight, FolderKanban, LayoutDashboard, Loader2, RefreshCw, Users,
} from 'lucide-react';
import { formatNumber } from '../../../lib/locale';
import EventRegistrationTab from '../events/EventRegistrationTab';

// El módulo de postulaciones es grande: sólo se descarga al abrir su pestaña.
const PostulacionesPagos = lazy(() => import('../../../pages/admin/PostulacionesPagos'));

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

export type ManagementPanel = 'resumen' | 'proyectos' | 'inscripciones';
export const MANAGEMENT_PANELS: ManagementPanel[] = ['resumen', 'proyectos', 'inscripciones'];

type LoadState<T> =
    | { status: 'loading' }
    | { status: 'ok'; data: T }
    | { status: 'denied' }
    | { status: 'error'; message: string };

interface ProjectsKpis { total: number; applied: number; inReview: number; needsChanges: number; approved: number; owing: number }
interface RegistrationKpis { total: number; people: number; settled: number; pending: number; accredited: number; slug: string | null; title: string }

/** Pide un endpoint y clasifica la respuesta: datos, sin acceso o fallo. */
const load = async <T,>(url: string, pick: (body: any) => T): Promise<LoadState<T>> => {
    try {
        const res = await fetch(url, { headers: authHeaders() });
        if (res.status === 401 || res.status === 403 || res.status === 404) return { status: 'denied' };
        const body = await res.json().catch(() => null);
        if (!res.ok || !body || body.error) {
            return { status: 'error', message: body?.error || `No se pudo consultar (${res.status}).` };
        }
        return { status: 'ok', data: pick(body) };
    } catch {
        return { status: 'error', message: 'No hay conexión con el servidor.' };
    }
};

/**
 * Los indicadores de las dos tarjetas. Se vuelven a pedir cada vez que se
 * vuelve al Resumen (`refreshKey`), así lo que se hizo en un módulo se ve al
 * regresar sin recargar la página.
 */
export const useManagementCenter = (eventId: string, refreshKey: number) => {
    const [projects, setProjects] = useState<LoadState<ProjectsKpis>>({ status: 'loading' });
    const [registrations, setRegistrations] = useState<LoadState<RegistrationKpis>>({ status: 'loading' });

    const reload = useCallback(() => {
        if (!eventId) return;
        const ev = encodeURIComponent(eventId);
        load(`${API}/project-fair/admin/inteligencia?evento=${ev}`, (b) => ({
            total: b.kpis?.total || 0,
            applied: b.participation?.applied ?? b.kpis?.total ?? 0,
            inReview: b.kpis?.inReview || 0,
            needsChanges: b.kpis?.needsChanges || 0,
            approved: b.kpis?.approved || 0,
            owing: b.participation?.owing || 0,
        })).then(setProjects);
        load(`${API}/event-registrations/admin/dashboard?eventRef=${ev}`, (b) => ({
            total: b.totals?.registrations || 0,
            people: b.totals?.people || 0,
            settled: b.totals?.settled || 0,
            pending: b.totals?.pending || 0,
            // Personas acreditadas: titulares y acompañantes con check-in.
            accredited: (b.totals?.accredited || 0) + (b.totals?.companionsAccredited || 0),
            slug: b.event?.slug || null,
            title: b.event?.title || '',
        })).then(setRegistrations);
    }, [eventId]);

    useEffect(() => { reload(); }, [reload, refreshKey]);
    return { projects, registrations, reload };
};

// ── Piezas (en el ámbito del módulo: v4.971) ─────────────────────────

const Stat = ({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'blue' | 'amber' | 'emerald' | 'indigo' }) => {
    const color = { slate: 'text-slate-900', blue: 'text-[#17458F]', amber: 'text-amber-700', emerald: 'text-emerald-700', indigo: 'text-indigo-700' }[tone];
    return (
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className={`text-xl font-extrabold ${color}`}>{formatNumber(value)}</p>
            <p className="text-[11px] font-semibold leading-tight text-slate-500">{label}</p>
        </div>
    );
};

const CardShell = ({ icon: Icon, title, description, children, action, onAction, disabled }: {
    icon: any; title: string; description: string; children: React.ReactNode;
    action: string; onAction: () => void; disabled?: boolean;
}) => (
    <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#17458F]/10">
                <Icon className="h-5 w-5 text-[#17458F]" />
            </div>
            <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{description}</p>
            </div>
        </div>
        <div className="mt-4 flex-1">{children}</div>
        <button type="button" onClick={onAction} disabled={disabled}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#17458F] px-5 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">
            {action} <ArrowRight className="h-4 w-4" />
        </button>
    </div>
);

const StateBody = ({ state, empty, onRetry, children }: {
    state: LoadState<any>; empty: string | null; onRetry: () => void; children: React.ReactNode;
}) => {
    if (state.status === 'loading') {
        return <div className="flex h-24 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Consultando…</div>;
    }
    if (state.status === 'error') {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {state.message}</p>
                <button type="button" onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:underline">
                    <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                </button>
            </div>
        );
    }
    return (
        <>
            {empty && <p className="mb-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{empty}</p>}
            {children}
        </>
    );
};

/** Las dos tarjetas del Resumen. Una tarjeta sin acceso no se pinta. */
export const ManagementCards = ({ projects, registrations, onOpen, onRetry }: {
    projects: LoadState<ProjectsKpis>; registrations: LoadState<RegistrationKpis>;
    onOpen: (panel: ManagementPanel) => void; onRetry: () => void;
}) => {
    const showProjects = projects.status !== 'denied';
    const showRegistrations = registrations.status !== 'denied';
    if (!showProjects && !showRegistrations) return null;
    const p = projects.status === 'ok' ? projects.data : null;
    const r = registrations.status === 'ok' ? registrations.data : null;
    return (
        <div className={`grid grid-cols-1 gap-4 ${showProjects && showRegistrations ? 'md:grid-cols-2' : ''}`}>
            {showProjects && (
                <CardShell icon={FolderKanban} title="Proyectos postulados"
                    description="Consulta las postulaciones recibidas, los clubes participantes y el estado de revisión de cada proyecto."
                    action="Gestionar proyectos" onAction={() => onOpen('proyectos')} disabled={projects.status === 'loading'}>
                    <StateBody state={projects} onRetry={onRetry}
                        empty={p && p.total === 0 ? 'Todavía no hay proyectos postulados para esta edición.' : null}>
                        {p && (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                <Stat label="Total de proyectos" value={p.total} />
                                <Stat label="Postulados" value={p.applied} tone="blue" />
                                <Stat label="En revisión" value={p.inReview + p.needsChanges} tone="indigo" />
                                <Stat label="Aprobados" value={p.approved} tone="emerald" />
                                <Stat label="Pago pendiente" value={p.owing} tone="amber" />
                            </div>
                        )}
                    </StateBody>
                </CardShell>
            )}
            {showRegistrations && (
                <CardShell icon={Users} title="Inscripciones y asistentes"
                    description="Consulta las personas inscritas, acompañantes, categorías, pagos y estados de acreditación."
                    action="Gestionar inscripciones" onAction={() => onOpen('inscripciones')} disabled={registrations.status === 'loading'}>
                    <StateBody state={registrations} onRetry={onRetry}
                        empty={r && r.total === 0 ? 'Todavía no hay participantes inscritos.' : null}>
                        {r && (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                <Stat label="Total de inscripciones" value={r.total} />
                                <Stat label="Participantes esperados" value={r.people} tone="blue" />
                                <Stat label="Pagos confirmados" value={r.settled} tone="emerald" />
                                <Stat label="Pagos pendientes" value={r.pending} tone="amber" />
                                <Stat label="Personas acreditadas" value={r.accredited} tone="indigo" />
                            </div>
                        )}
                    </StateBody>
                </CardShell>
            )}
        </div>
    );
};

/** Las pestañas del Centro de Gestión. Sólo las de los módulos con acceso. */
export const ManagementTabs = ({ panel, onPanel, projects, registrations }: {
    panel: ManagementPanel; onPanel: (p: ManagementPanel) => void;
    projects: LoadState<any>; registrations: LoadState<any>;
}) => {
    const tabs: { key: ManagementPanel; label: string; icon: any; show: boolean }[] = [
        { key: 'resumen', label: 'Resumen', icon: LayoutDashboard, show: true },
        { key: 'proyectos', label: 'Proyectos postulados', icon: FolderKanban, show: projects.status !== 'denied' },
        { key: 'inscripciones', label: 'Inscripciones y asistentes', icon: Users, show: registrations.status !== 'denied' },
    ];
    return (
        <div role="tablist" aria-label="Centro de Gestión del Evento"
            className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {tabs.filter(t => t.show).map(t => (
                <button key={t.key} type="button" role="tab" aria-selected={panel === t.key}
                    onClick={() => onPanel(t.key)}
                    className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition ${panel === t.key
                        ? 'bg-[#17458F] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <t.icon className="h-4 w-4" /> {t.label}
                </button>
            ))}
        </div>
    );
};

/** La vista de trabajo de cada pestaña: el módulo, montado aquí. */
export const ManagementPanelView = ({ panel, eventId, registrations }: {
    panel: ManagementPanel; eventId: string; registrations: LoadState<RegistrationKpis>;
}) => {
    if (panel === 'proyectos') {
        return (
            <section aria-label="Proyectos postulados">
                <Suspense fallback={<div className="flex h-40 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando proyectos…</div>}>
                    <PostulacionesPagos embedded eventId={eventId} />
                </Suspense>
            </section>
        );
    }
    if (panel === 'inscripciones') {
        const r = registrations.status === 'ok' ? registrations.data : null;
        return (
            <section aria-label="Inscripciones y asistentes">
                <EventRegistrationTab eventId={eventId} eventSlug={r?.slug || null} eventTitle={r?.title || ''} view="inscripciones" />
            </section>
        );
    }
    return null;
};
