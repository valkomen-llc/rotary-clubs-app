// ════════════════════════════════════════════════════════════════════
// Gestión de Postulaciones y Pagos — Feria de Proyectos Rotary Colombia
// v4.598.0
//
// Módulo operativo sobre las postulaciones que llegan por el formulario
// público. Cuatro vistas: Dashboard (indicadores), Postulaciones (tabla +
// ficha), Alertas y Reportes. Todo el dato nace del formulario o de Stripe:
// aquí no se captura nada a mano.
//
// Los permisos llegan del backend en `access` y la interfaz se adapta: quien
// no puede ver pagos no recibe ni siquiera las referencias de Stripe.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, ArrowLeft, ArrowUpDown, BarChart3, Building2, Globe, MapPin, CheckCircle2, ClipboardList, Clock,
    CreditCard, Download, ExternalLink, Eye, FileSpreadsheet, FileText, Filter,
    Loader2, Mail, MessageSquarePlus, RefreshCw, Search,
    TrendingUp, Wallet, X, ShieldCheck, Paperclip, Settings, FileSignature, Lock, Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
    LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { matrixRowsToShow } from '../../lib/projectForms';
import AdminLayout from '../../components/admin/AdminLayout';
import ConvocatoriaConfig from '../../components/admin/feria/ConvocatoriaConfig';
import EdicionesList from '../../components/admin/feria/EdicionesList';
import ProjectFormApproval from '../../components/admin/feria/ProjectFormApproval';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

/**
 * AISLAMIENTO POR EDICIÓN (v4.683).
 *
 * La edición abierta viaja en la URL (`?evento=`), que es la fuente de verdad:
 * el enlace se puede compartir y el botón "atrás" hace lo que se espera. Toda
 * consulta al panel la lleva, y el servidor filtra por ella — de modo que no
 * hay forma de que una edición vea las postulaciones de otra ni por descuido
 * ni a propósito.
 *
 * Se lee de la URL y no del estado del componente porque hay peticiones dentro
 * de subcomponentes; pasarla por props obligaría a hilarla por media pantalla.
 */
export const currentEventId = () => new URLSearchParams(window.location.search).get('evento') || '';
const withEvento = (url: string) => {
    const id = currentEventId();
    if (!id) return url;
    return `${url}${url.includes('?') ? '&' : '?'}evento=${encodeURIComponent(id)}`;
};
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

const BLUE = '#17458F';
const GOLD = '#F7A81B';
const CHART_COLORS = ['#17458F', '#F7A81B', '#0EA5E9', '#10B981', '#8B5CF6', '#EF4444', '#64748B'];

// ── Tipos ────────────────────────────────────────────────────────────
interface Access {
    role: string; view: boolean; managePayments: boolean; viewPayments: boolean;
    comment: boolean; edit: boolean; changeStatus: boolean; manageTags: boolean;
    export: boolean; config: boolean;
}
interface StateDef { key: string; label: string; color: string; group?: string }
interface Tag { id: string; label: string; color: string; usage?: number; isSystem?: boolean }

interface Submission {
    id: string; publicRef: string; createdAt: string; updatedAt: string;
    firstName: string; lastName: string; responsable: string; email: string; phone: string;
    clubName: string; district: string; projectName: string; projectDescription: string;
    country?: string | null; department?: string | null; city?: string | null;
    clubRole?: string | null; clubRoleLabel?: string | null; clubRoleOther?: string | null;
    idType?: string | null; idTypeLabel?: string | null; idNumber?: string | null;
    notes?: string | null;
    focusArea: string; focusAreaLabel: string | null; budgetUsd: number | null;
    paymentStatus: string; workflowStatus: string; priority: string;
    internalCategory: string | null; assigneeName: string | null;
    reviewedAt: string | null; reviewedBy: string | null;
    priceMode?: 'COP' | 'USD' | null; chargeCurrency?: string | null;
    amountCop: number | null; amountUsd: number | null; amountReceived: number | null;
    refundedAmount: number | null; refundedAt: string | null;
    trmRate: number | null; trmDate: string | null; trmSource: string | null; paidAt: string | null;
    tags: Tag[];
    stripeSessionId?: string; stripePaymentIntentId?: string; stripeChargeId?: string;
    stripeCustomerId?: string; paymentMethod?: string; receiptUrl?: string; lastPaymentError?: string;
}
interface TimelineEvent {
    id: string; type: string; title: string; detail: string | null;
    actorName: string | null; createdAt: string; metadata?: Record<string, unknown>;
}
interface FairFile { id: string; fileName: string; fileUrl: string; createdAt: string; uploadedBy?: string }

// ── Formato ──────────────────────────────────────────────────────────
const fmtCop = (n?: number | null) => `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
const fmtUsd = (n?: number | null) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtNum = (n?: number | null) => Number(n || 0).toLocaleString('es-CO');
// Valor de una inscripción en la moneda en la que se anunció su precio: pesos
// si se fijó en pesos (con el cobro en dólares al lado), dólares si no.
const amountLabel = (s: { amountCop?: number | null; amountUsd?: number | null }) =>
    (s.amountCop ? `${fmtCop(s.amountCop)} COP` : `${fmtUsd(s.amountUsd)} USD`);
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

const BADGE: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700', sky: 'bg-sky-100 text-sky-700',
    amber: 'bg-amber-100 text-amber-800', emerald: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700', orange: 'bg-orange-100 text-orange-700',
    indigo: 'bg-indigo-100 text-indigo-700', violet: 'bg-violet-100 text-violet-700',
};
const Badge = ({ color = 'slate', children }: { color?: string; children: React.ReactNode }) => (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${BADGE[color] || BADGE.slate}`}>{children}</span>
);

const Kpi = ({ label, value, sub, icon: Icon, tone = 'slate' }: any) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Icon size={14} className={`text-${tone}-600`} style={{ color: tone === 'blue' ? BLUE : undefined }} /> {label}
        </div>
        <p className="mt-1.5 text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
);

// Etiquetas legibles de los eventos de la línea de tiempo.
const EVENT_META: Record<string, { label: string; color: string }> = {
    form_submitted: { label: 'Formulario enviado', color: 'sky' },
    checkout_created: { label: 'Sesión de pago creada', color: 'indigo' },
    payment_succeeded: { label: 'Pago aprobado', color: 'emerald' },
    payment_failed: { label: 'Pago rechazado', color: 'red' },
    checkout_expired: { label: 'Sesión caducada', color: 'amber' },
    refund: { label: 'Reembolso', color: 'orange' },
    status_change: { label: 'Cambio de estado', color: 'violet' },
    data_updated: { label: 'Datos actualizados', color: 'slate' },
    comment: { label: 'Observación interna', color: 'sky' },
    tag_added: { label: 'Etiqueta', color: 'violet' },
    tag_removed: { label: 'Etiqueta', color: 'slate' },
    file_added: { label: 'Adjunto', color: 'indigo' },
    file_removed: { label: 'Adjunto', color: 'slate' },
    email_sent: { label: 'Correo enviado', color: 'emerald' },
    stripe_sync: { label: 'Sincronización Stripe', color: 'indigo' },
    reviewed: { label: 'Revisada', color: 'emerald' },
    redirect: { label: 'Redirección a Grants', color: 'violet' },
};

/** Encabezado de un bloque temático del Centro de Inteligencia. */
const BlockTitle = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
    <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <Icon size={15} className="text-slate-400" /> {children}
    </h2>
);

/** Tarjeta con título: la caja que envuelve cada gráfica o tabla. */
const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">{title}</h3>
        {children}
    </div>
);

/**
 * Un eje geográfico sólo se pinta si dice algo. Con todas las postulaciones en
 * el mismo país, un gráfico de «por país» con una sola barra ocupa sitio y no
 * informa; y si el dato nunca se llenó, la única fila es "Sin país".
 */
const hasGeo = (rows?: any[]): boolean =>
    Array.isArray(rows) && rows.length > 0 && !(rows.length === 1 && String(rows[0]?.key || '').startsWith('Sin '));

/** Ranking compacto: nombre, proyectos y recaudo. */
const RankPanel = ({ title, rows, priceMode }: { title: string; rows: any[]; priceMode?: string }) => (
    <Panel title={title}>
        <ul className="divide-y divide-slate-100">
            {rows.slice(0, 8).map(r => (
                <li key={r.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-slate-700">{r.key}</span>
                    <span className="flex shrink-0 items-center gap-3">
                        <span className="text-slate-500">{r.count}</span>
                        <span className="font-semibold text-slate-800">
                            {priceMode === 'USD' ? fmtUsd(r.totalAmount) : fmtCop(r.totalAmount)}
                        </span>
                    </span>
                </li>
            ))}
        </ul>
    </Panel>
);

// ════════════════════════════════════════════════════════════════════
const PostulacionesPagos: React.FC = () => {
    type Tab = 'dashboard' | 'submissions' | 'forms' | 'alerts' | 'config';
    // ?tab=config permite enlazar directo a la configuración (y mantiene vivos
    // los enlaces a la antigua entrada de menú "Postulación de Proyectos").
    const [tab, setTab] = useState<Tab>(() => {
        const requested = new URLSearchParams(window.location.search).get('tab');
        return (['dashboard', 'submissions', 'forms', 'alerts', 'config'] as const).includes(requested as Tab)
            ? (requested as Tab) : 'dashboard';
    });
    // Edición abierta. Vive en la URL para que el enlace se pueda compartir y
    // el botón "atrás" del navegador devuelva al listado de versiones.
    const [eventId] = useState<string>(() => currentEventId());
    const [access, setAccess] = useState<Access | null>(null);
    const [catalog, setCatalog] = useState<any>(null);
    const [tags, setTags] = useState<Tag[]>([]);

    const [overview, setOverview] = useState<any>(null);

    // El recaudo acumulado sale de la misma serie diaria que ya trajo el
    // Centro de Inteligencia: pedirlo aparte sería otra consulta para un dato
    // que ya tenemos.
    //
    // VA AQUÍ, CON EL RESTO DE LOS HOOKS, Y NO JUNTO AL BLOQUE QUE LO PINTA.
    // Más abajo hay dos returns tempranos —«Cargando módulo…» y «Tu perfil no
    // tiene acceso»—. Un `useMemo` escrito después de ellos no se ejecuta en el
    // primer render y sí en el segundo, así que React encuentra un hook de más
    // y aborta el árbol entero: la pantalla se queda EN BLANCO justo al
    // terminar de cargar. Es lo que pasó al estrenar el Centro de Inteligencia
    // (v4.689). Todo hook nuevo de esta pantalla va antes de esos returns.
    const cumulative = useMemo(() => {
        let suma = 0;
        return (overview?.timeline || []).map((d: any) => {
            suma += Number(d.totalAmount) || 0;
            return { ...d, acumulado: Math.round(suma * 100) / 100 };
        });
    }, [overview?.timeline]);

    const [alerts, setAlerts] = useState<any>(null);
    const [forms, setForms] = useState<any>(null);
    const [formFilter, setFormFilter] = useState('all');
    // v4.642 — Un proyecto tiene varios formularios. Este es el que se está
    // mirando en la pestaña; la lista de cuáles hay la manda el servidor.
    const [formKey, setFormKey] = useState('master');
    const [approving, setApproving] = useState<{ id: string; formKey: string } | null>(null);

    const [rows, setRows] = useState<Submission[]>([]);
    const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, pages: 1 });
    const [loading, setLoading] = useState(true);
    const [tableLoading, setTableLoading] = useState(false);
    const [detailId, setDetailId] = useState<string | null>(null);

    const [filters, setFilters] = useState({
        search: '', paymentStatus: 'all', workflowStatus: 'all', district: 'all',
        focusArea: 'all', priority: 'all', tagId: '', from: '', to: '', budgetMin: '', budgetMax: '',
    });
    const [sort, setSort] = useState({ sortBy: 'createdAt', sortDir: 'desc' });
    const [showFilters, setShowFilters] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const queryString = useCallback((extra: Record<string, any> = {}) => {
        const params = new URLSearchParams();
        Object.entries({ ...filters, ...sort, ...extra }).forEach(([k, v]) => {
            if (v !== '' && v !== 'all' && v !== undefined && v !== null) params.set(k, String(v));
        });
        return params.toString();
    }, [filters, sort]);

    // ── Carga inicial ────────────────────────────────────────────────
    useEffect(() => {
        Promise.all([
            fetch(withEvento(`${API}/project-fair/admin/catalog`), { headers: authHeaders() }).then(r => r.json()),
            fetch(withEvento(`${API}/project-fair/admin/tags`), { headers: authHeaders() }).then(r => r.json()),
        ]).then(([cat, tagList]) => {
            if (cat?.error) throw new Error(cat.error);
            setCatalog(cat);
            setAccess(cat.access);
            setTags(Array.isArray(tagList) ? tagList : []);
        }).catch(e => toast.error(e?.message || 'No se pudo cargar el módulo'))
          .finally(() => setLoading(false));
    }, []);

    // Un error del servidor no puede quedarse en silencio: antes se pintaba la
    // respuesta de error como si fuera el resultado, y el panel mostraba ceros
    // y una tabla vacía sin decir que algo había fallado.
    const getJson = async (url: string) => {
        const res = await fetch(url, { headers: authHeaders() });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `El servidor respondió ${res.status}.`);
        return data;
    };

    const loadOverview = useCallback(() => {
        getJson(`${API}/project-fair/admin/overview?${queryString()}`)
            .then(d => { setOverview(d); setLoadError(null); })
            .catch(e => { setOverview(null); setLoadError(e?.message || 'No se pudo cargar el panel'); });
    }, [queryString]);

    const loadRows = useCallback((page = 1) => {
        setTableLoading(true);
        getJson(`${API}/project-fair/admin/postulaciones?${queryString({ page, pageSize: pagination.pageSize })}`)
            .then(d => {
                setRows(d.submissions || []);
                if (d.pagination) setPagination(d.pagination);
                setLoadError(null);
            })
            .catch(e => { setRows([]); setLoadError(e?.message || 'No se pudieron cargar las postulaciones'); })
            .finally(() => setTableLoading(false));
    }, [queryString, pagination.pageSize]);

    useEffect(() => {
        if (loading) return;
        if (tab === 'dashboard') loadOverview();
        if (tab === 'submissions') loadRows(1);
        if (tab === 'alerts') {
            getJson(`${API}/project-fair/admin/alerts`)
                .then(d => { setAlerts(d); setLoadError(null); })
                .catch(e => setLoadError(e?.message || 'No se pudieron cargar las alertas'));
        }
        if (tab === 'forms') {
            getJson(`${API}/project-fair/admin/forms?formKey=${formKey}&formStatus=${formFilter}`)
                .then(d => { setForms(d); setLoadError(null); })
                .catch(e => setLoadError(e?.message || 'No se pudo cargar la formulación'));
        }
    }, [tab, loading, loadOverview, loadRows, queryString, formKey, formFilter]);

    // Refresco de la pestaña de formularios tras una acción (cerrar edición,
    // reabrir, guardar la aprobación institucional).
    const reloadForms = () => {
        getJson(`${API}/project-fair/admin/forms?formKey=${formKey}&formStatus=${formFilter}`)
            .then(setForms).catch(() => {});
    };

    const stateLabel = (key: string, list: StateDef[] = []) => list.find(s => s.key === key) || { key, label: key, color: 'slate' };

    // ── Exportaciones ────────────────────────────────────────────────
    const exportCsv = async () => {
        const res = await fetch(withEvento(`${API}/project-fair/admin/export.csv?${queryString()}`), { headers: authHeaders() });
        if (!res.ok) return toast.error('No se pudo exportar');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'postulaciones-feria-proyectos.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const exportExcel = async () => {
        try {
            const XLSX = await import('xlsx');
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones?${queryString({ page: 1, pageSize: 200 })}`), { headers: authHeaders() });
            const data = await res.json();
            const sheet = (data.submissions || []).map((s: Submission) => ({
                Registro: s.publicRef,
                'Fecha de inscripción': fmtDateTime(s.createdAt),
                Proyecto: s.projectName,
                'Club Rotario': s.clubName,
                Distrito: s.district,
                Responsable: s.responsable,
                Correo: s.email,
                WhatsApp: s.phone,
                'Rol en el club': s.clubRoleLabel,
                'País': s.country,
                Departamento: s.department,
                Ciudad: s.city,
                'Tipo de documento': s.idTypeLabel || s.idType,
                'Número de documento': s.idNumber,
                'Área de enfoque': s.focusAreaLabel || s.focusArea,
                'Presupuesto USD': s.budgetUsd,
                'Comentarios del postulante': s.notes,
                'Estado de la postulación': stateLabel(s.workflowStatus, catalog?.workflowStates).label,
                'Estado del pago': stateLabel(s.paymentStatus, catalog?.paymentStates).label,
                'Valor anunciado COP': s.amountCop,
                'Valor cobrado USD': s.amountUsd,
                'TRM aplicada': s.trmRate,
                Prioridad: s.priority,
                Etiquetas: s.tags.map(t => t.label).join(' | '),
                'Fecha de confirmación': fmtDateTime(s.paidAt),
                ...(access?.viewPayments ? { 'Referencia Stripe': s.stripePaymentIntentId, 'Checkout Session': s.stripeSessionId } : {}),
            }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), 'Postulaciones');
            if (overview?.kpis) {
                const resumen = Object.entries(overview.kpis).map(([k, v]) => ({ Indicador: k, Valor: v as any }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
            }
            XLSX.writeFile(wb, 'postulaciones-feria-proyectos.xlsx');
        } catch {
            toast.error('No se pudo generar el Excel');
        }
    };

    // PDF del resumen ejecutivo (identidad del evento + indicadores + tabla).
    const exportPdf = async () => {
        try {
            const { default: JsPDF } = await import('jspdf');
            const doc = new JsPDF({ unit: 'pt', format: 'a4' });
            const edition = catalog?.edition?.name || 'Feria de Proyectos Rotary Colombia';
            const k = overview?.kpis || {};

            doc.setFillColor(23, 69, 143);
            doc.rect(0, 0, 595, 90, 'F');
            doc.setTextColor(255).setFontSize(16).text(edition, 40, 42);
            doc.setFontSize(10).text('Gestión de Postulaciones y Pagos', 40, 62);
            doc.setFontSize(8).text(`Generado el ${new Date().toLocaleString('es-CO')}`, 40, 78);

            doc.setTextColor(30).setFontSize(12).text('Indicadores', 40, 125);
            const kpiRows: [string, string][] = [
                ['Total de postulaciones', fmtNum(k.total)],
                ['Pagadas', fmtNum(k.paid)],
                ['Pendientes de pago', fmtNum(k.pending)],
                ['Pagos fallidos', fmtNum(k.failed)],
                ['Reembolsadas', fmtNum(k.refunded)],
                ['Pendientes de revisión', fmtNum(k.pendingReview)],
                ...(k.priceMode === 'USD'
                    ? [['Recaudo total', `${fmtUsd(k.totalUsd)} USD`]]
                    : [['Recaudo total', `${fmtCop(k.totalCop)} COP`], ['Cobrado en dólares', `${fmtUsd(k.totalUsd)} USD`]]),
                ['Tasa de conversión', `${k.conversionRate || 0}%`],
            ];
            let y = 145;
            doc.setFontSize(9);
            kpiRows.forEach(([label, value]) => {
                doc.setTextColor(100).text(label, 45, y);
                doc.setTextColor(20).text(String(value), 300, y);
                y += 16;
            });

            y += 14;
            doc.setFontSize(12).setTextColor(30).text('Postulaciones', 40, y);
            y += 18;
            doc.setFontSize(7.5);
            doc.setTextColor(120).text('REF', 40, y).text('PROYECTO', 90, y).text('CLUB', 270, y)
                .text('ESTADO', 400, y).text('PAGO', 480, y).text('COP', 535, y);
            y += 4;
            doc.setDrawColor(220).line(40, y, 555, y);
            y += 12;
            doc.setTextColor(40);
            rows.slice(0, 30).forEach(s => {
                if (y > 790) { doc.addPage(); y = 50; }
                doc.text(String(s.publicRef || ''), 40, y);
                doc.text(String(s.projectName || '').slice(0, 34), 90, y);
                doc.text(String(s.clubName || '').slice(0, 26), 270, y);
                doc.text(stateLabel(s.workflowStatus, catalog?.workflowStates).label.slice(0, 16), 400, y);
                doc.text(stateLabel(s.paymentStatus, catalog?.paymentStates).label.slice(0, 12), 480, y);
                doc.text(amountLabel(s), 535, y, { align: 'right' } as any);
                y += 14;
            });
            if (rows.length > 30) {
                doc.setTextColor(140).text(`… y ${rows.length - 30} postulaciones más (ver Excel o CSV).`, 40, y + 6);
            }
            doc.save('reporte-feria-proyectos.pdf');
        } catch {
            toast.error('No se pudo generar el PDF');
        }
    };

    // ── Descargas y control de la formulación ────────────────────────
    const downloadDocx = async (row: any) => {
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${row.id}/form.docx`), { headers: authHeaders() });
            if (!res.ok) throw new Error((await res.json())?.error || 'No se pudo descargar');
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${row.publicRef}-${String(row.projectName || 'proyecto').slice(0, 40)}.docx`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e: any) { toast.error(e?.message || 'No se pudo descargar el Word'); }
    };

    // El PDF se arma en el navegador recorriendo la misma plantilla, así el
    // documento refleja cualquier campo que el administrador haya agregado.
    const downloadFormPdf = async (row: any) => {
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${row.id}/forms/${formKey}`), { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No se pudo cargar el formulario');
            const { default: JsPDF } = await import('jspdf');
            const doc = new JsPDF({ unit: 'pt', format: 'a4' });
            // `computed` trae las respuestas con los campos derivados ya
            // resueltos por el servidor, y `approval` la sección del Distrito:
            // el PDF debe salir completo, con firmas incluidas.
            const answers = { ...(data.computed || data.answers || {}), ...(data.approval || {}) };
            const s = data.submission;

            doc.setFillColor(23, 69, 143); doc.rect(0, 0, 595, 84, 'F');
            doc.setTextColor(255).setFontSize(14).text(catalog?.edition?.name || 'Feria de Proyectos', 40, 36);
            doc.setFontSize(11).text(String(s.projectName || '').slice(0, 70), 40, 58);
            doc.setFontSize(8).text(`${s.clubName || ''} · ${s.district || ''} · Ref. ${s.publicRef}`, 40, 74);

            let y = 115;
            const write = (text: string, size = 9, color = 40, indent = 40, bold = false) => {
                doc.setFontSize(size).setTextColor(color);
                doc.setFont('helvetica', bold ? 'bold' : 'normal');
                doc.splitTextToSize(String(text ?? '—'), 515 - (indent - 40)).forEach((ln: string) => {
                    if (y > 790) { doc.addPage(); y = 50; }
                    doc.text(ln, indent, y); y += size + 4;
                });
            };
            (data.template?.sections || []).forEach((section: any) => {
                if (y > 740) { doc.addPage(); y = 50; }
                y += 10;
                doc.setTextColor(23, 69, 143); write(section.title, 12, undefined as any, 40, true);
                doc.setTextColor(40);
                (section.fields || []).forEach((field: any) => {
                    const value = answers?.[section.key]?.[field.key];
                    write(field.label, 8, 120, 40, true);
                    if (field.type === 'repeater') {
                        const rows = Array.isArray(value) ? value.filter((r: any) => r && Object.values(r).some(v => String(v ?? '').trim() !== '')) : [];
                        if (!rows.length) write('—', 9, 150, 52);
                        rows.forEach((r: any, i: number) => write(
                            `${i + 1}. ` + (field.columns || []).map((c: any) => `${c.label}: ${r[c.key] ?? '—'}`).join(' · '), 9, 40, 52));
                    } else if (field.type === 'matrix') {
                        // Filas fijas de la plantilla: se imprimen todas, con guion
                        // en las celdas sin diligenciar.
                        const defs = matrixRowsToShow(field, value);
                        if (!defs.length) write('—', 9, 150, 52);
                        defs.forEach((row: any) => write(
                            `${row.label}: ` + (field.columns || [])
                                .map((c: any) => `${c.label} ${value?.[row.key]?.[c.key] ?? '—'}`).join(' · '), 9, 40, 52));
                    } else {
                        write(Array.isArray(value) ? value.join(', ') : (value ?? '—'), 9, 40, 52);
                    }
                    y += 3;
                });
            });
            doc.save(`${row.publicRef}-${formKey}.pdf`);
        } catch (e: any) { toast.error(e?.message || 'No se pudo generar el PDF'); }
    };

    // v4.642 — Vale para cualquier formulario del proyecto, no sólo la
    // Formulación: la ruta lleva la `formKey` que se esté mirando.
    const toggleFormLock = async (row: any, action: 'lock' | 'reopen') => {
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${row.id}/forms/${formKey}/${action}`), {
                method: 'POST', headers: jsonHeaders(), body: JSON.stringify({}),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No se pudo completar la acción');
            toast.success(action === 'lock' ? 'Edición cerrada' : 'Edición reabierta para el club');
            reloadForms();
        } catch (e: any) { toast.error(e?.message); }
    };

    // Sin edición abierta, la primera pantalla del módulo es el LISTADO DE
    // VERSIONES, igual que en Eventos. Abrir una pone `?evento=` en la URL y a
    // partir de ahí todo lo que se ve pertenece sólo a esa edición.
    if (!eventId) {
        return (
            <AdminLayout>
                <EdicionesList onOpen={id => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('evento', id);
                    url.searchParams.delete('tab');
                    window.location.assign(url.toString());
                }} />
            </AdminLayout>
        );
    }

    if (loading) {
        return <AdminLayout><div className="flex h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" size={20} /> Cargando módulo…</div></AdminLayout>;
    }
    if (!access?.view) {
        return <AdminLayout><div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">Tu perfil no tiene acceso a este módulo.</div></AdminLayout>;
    }

    const k = overview?.kpis || {};

    return (
        <AdminLayout>
            {/* Mismo ancho que el listado de ediciones y que el módulo de
                Eventos: el panel ya pone su propio margen. Limitarlo aquí hacía
                que entrar a una edición se viera como un salto de ancho. */}
            <div className="space-y-5 pb-16">
                <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <button
                            onClick={() => {
                                const url = new URL(window.location.href);
                                url.searchParams.delete('evento'); url.searchParams.delete('tab');
                                window.location.assign(url.toString());
                            }}
                            className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition hover:text-slate-800"
                        ><ArrowLeft size={14} /> Todas las ediciones</button>
                        <h1 className="text-2xl font-bold text-slate-900">Postulación de Proyectos</h1>
                        <p className="text-sm text-slate-500">
                            {catalog?.edition?.name} · {catalog?.edition?.city}
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                <ShieldCheck size={11} /> Perfil: {access.role}
                            </span>
                            {catalog?.health && (
                                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                                    title="Registros que hay en la base, sin ningún filtro aplicado.">
                                    {fmtNum(catalog.health.submissions)} en el sistema · {fmtNum(catalog.health.paid)} pagadas
                                </span>
                            )}
                        </p>
                    </div>
                    {access.export && (
                        <div className="flex flex-wrap gap-2">
                            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download size={14} /> CSV</button>
                            <button onClick={exportExcel} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={14} /> Excel</button>
                            <button onClick={exportPdf} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: BLUE }}><FileText size={14} /> PDF</button>
                        </div>
                    )}
                </header>

                {loadError && (
                    <div className="flex flex-wrap items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        <span><strong>No se pudo cargar esta pestaña.</strong> {loadError}</span>
                    </div>
                )}

                <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
                    {/* «Reportes» desapareció en v4.689: mostraba los mismos
                        indicadores y gráficas que el Dashboard con otros
                        nombres. Todo vive ahora en el Centro de Inteligencia. */}
                    {([['dashboard', 'Centro de Inteligencia', BarChart3], ['submissions', 'Postulaciones', ClipboardList],
                       ['forms', 'Formulación', FileSignature],
                       ['alerts', 'Alertas', AlertTriangle],
                       ['config', 'Convocatoria', Settings]] as const).map(([key, label, Icon]) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                                tab === key ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                            <Icon size={15} /> {label}
                            {key === 'alerts' && alerts?.total > 0 && (
                                <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-bold text-red-700">{alerts.total}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ── Dashboard ─────────────────────────────────────── */}
                {/* ══ CENTRO DE INTELIGENCIA DE LA EDICIÓN (v4.689) ══════
                    Antes eran dos pestañas, «Dashboard» y «Reportes», que
                    mostraban lo mismo con nombres distintos: proyectos por
                    distrito, por área de enfoque y la evolución salían
                    duplicadas, y había que cambiar de pestaña para ver la
                    otra mitad de una misma pregunta. Ahora es una sola
                    pantalla organizada por bloques, servida por una sola
                    consulta y acotada a la edición abierta.

                    Los bloques que no tienen datos NO se pintan: con una
                    edición recién abierta, una rejilla de gráficas vacías
                    dice menos que no mostrarlas. */}
                {tab === 'dashboard' && (
                    <div className="space-y-6">
                        {/* ── 1. Resumen ejecutivo ─────────────────────
                            Responde «¿cómo va el evento?» de un vistazo. */}
                        <section>
                            <BlockTitle icon={BarChart3}>Resumen ejecutivo</BlockTitle>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Kpi label="Postulaciones" value={fmtNum(k.total)} sub={`${k.pendingReview || 0} pendientes de revisión`} icon={ClipboardList} tone="blue" />
                                <Kpi label="Pagadas" value={fmtNum(k.paid)} sub={`Conversión ${k.conversionRate || 0}%`} icon={CheckCircle2} tone="emerald" />
                                <Kpi label="Pendientes de pago" value={fmtNum(k.pending)} icon={Clock} tone="amber" />
                                <Kpi label="Pagos fallidos" value={fmtNum(k.failed)} sub={`${k.refunded || 0} reembolsados`} icon={AlertTriangle} tone="red" />

                                {k.priceMode === 'USD' ? (
                                    <Kpi label="Recaudo total" value={fmtUsd(k.totalUsd)} sub="Dólares" icon={Wallet} tone="blue" />
                                ) : (
                                    <>
                                        <Kpi label="Recaudo total" value={fmtCop(k.totalCop)} sub="Pesos colombianos" icon={Wallet} tone="blue" />
                                        <Kpi label="Cobrado en dólares" value={fmtUsd(k.totalUsd)} sub="Convertido con la TRM de cada pago" icon={CreditCard} tone="emerald" />
                                    </>
                                )}
                                <Kpi label="Presupuesto de los proyectos" value={fmtUsd(k.totalBudget)} sub={`Promedio ${fmtUsd(k.avgBudget)}`} icon={TrendingUp} tone="indigo" />
                                <Kpi label="Reembolsado" value={fmtCop(k.totalRefunded)} icon={RefreshCw} tone="orange" />

                                {/* Alcance de la convocatoria: cuántos participan, no cuánto se recaudó. */}
                                <Kpi label="Distritos participantes" value={fmtNum(k.districts)} icon={MapPin} tone="indigo" />
                                <Kpi label="Clubes participantes" value={fmtNum(k.clubs)} icon={Building2} tone="blue" />
                                {k.countries > 0 && <Kpi label="Países representados" value={fmtNum(k.countries)} icon={Globe} tone="emerald" />}
                                {/* La TRM sólo dice algo si el precio se fija en pesos. */}
                                {k.priceMode !== 'USD' && k.avgTrm > 0 && (
                                    <Kpi label="TRM promedio aplicada" value={fmtNum(Math.round(k.avgTrm))} sub="COP por dólar" icon={CreditCard} tone="amber" />
                                )}
                            </div>
                        </section>

                        {/* ── 2. Embudo del proceso ────────────────────
                            Dónde se pierden las postulaciones. Sólo etapas
                            que el módulo registra de verdad. */}
                        {k.total > 0 && (
                            <section>
                                <BlockTitle icon={TrendingUp}>Conversión del proceso</BlockTitle>
                                <div className="rounded-xl border border-slate-200 bg-white p-5">
                                    <div className="space-y-2.5">
                                        {(overview?.funnel || []).map((f: any) => (
                                            <div key={f.key} className="flex items-center gap-3">
                                                <span className="w-52 shrink-0 text-[13px] font-semibold text-slate-700">{f.label}</span>
                                                <div className="h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
                                                    <div className="flex h-full items-center justify-end rounded-lg px-2 text-[11px] font-bold text-white transition-all"
                                                        style={{ width: `${Math.max(f.rate, f.count > 0 ? 6 : 0)}%`, background: BLUE }}>
                                                        {f.count > 0 && fmtNum(f.count)}
                                                    </div>
                                                </div>
                                                <span className="w-14 shrink-0 text-right text-[13px] font-bold text-slate-500">{f.rate}%</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="mt-3 border-t border-slate-100 pt-3 text-[12px] text-slate-500">
                                        Cada etapa se mide sobre el total de formularios enviados. Sólo aparecen las
                                        etapas que el módulo registra: no se inventan pasos que nadie marca.
                                    </p>
                                </div>
                            </section>
                        )}

                        {/* ── 3. Analítica de postulaciones ────────────── */}
                        <section>
                            <BlockTitle icon={ClipboardList}>Analítica de postulaciones</BlockTitle>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <Panel title="Proyectos por distrito">
                                    <ResponsiveContainer width="100%" height={240}>
                                        <BarChart data={overview?.byDistrict || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="key" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                            <Tooltip />
                                            <Bar dataKey="count" name="Proyectos" fill={BLUE} radius={[6, 6, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Panel>
                                <Panel title="Proyectos por área de enfoque">
                                    <ResponsiveContainer width="100%" height={240}>
                                        <PieChart>
                                            <Pie data={overview?.byFocusArea || []} dataKey="count" nameKey="key" outerRadius={85} label={false}>
                                                {(overview?.byFocusArea || []).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip />
                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </Panel>
                            </div>
                            <div className="mt-4">
                                <Panel title="Evolución de las postulaciones">
                                    <ResponsiveContainer width="100%" height={240}>
                                        <LineChart data={overview?.timeline || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                            <Tooltip />
                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                            <Line type="monotone" dataKey="total" name="Postulaciones" stroke={BLUE} strokeWidth={2} />
                                            <Line type="monotone" dataKey="paid" name="Pagadas" stroke={GOLD} strokeWidth={2} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </Panel>
                            </div>
                        </section>

                        {/* ── 4. Analítica financiera ──────────────────── */}
                        <section>
                            <BlockTitle icon={Wallet}>Analítica financiera</BlockTitle>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <Panel title="Recaudo por distrito">
                                    <ResponsiveContainer width="100%" height={240}>
                                        <BarChart data={overview?.byDistrict || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="key" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip formatter={(v: any) => (k.priceMode === 'USD' ? fmtUsd(Number(v)) : fmtCop(Number(v)))} />
                                            <Bar dataKey="totalAmount" name="Recaudo" fill={GOLD} radius={[6, 6, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Panel>
                                <Panel title="Presupuesto por área de enfoque">
                                    <ResponsiveContainer width="100%" height={240}>
                                        <BarChart data={overview?.byFocusArea || []} layout="vertical" margin={{ left: 90 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis type="number" tick={{ fontSize: 11 }} />
                                            <YAxis type="category" dataKey="key" tick={{ fontSize: 10 }} width={95} />
                                            <Tooltip formatter={(v: any) => fmtUsd(Number(v))} />
                                            <Bar dataKey="totalBudget" name="Presupuesto USD" fill={BLUE} radius={[0, 6, 6, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Panel>
                            </div>
                            <div className="mt-4">
                                <Panel title="Recaudo acumulado">
                                    <ResponsiveContainer width="100%" height={220}>
                                        <LineChart data={cumulative}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip formatter={(v: any) => (k.priceMode === 'USD' ? fmtUsd(Number(v)) : fmtCop(Number(v)))} />
                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                            <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke={BLUE} strokeWidth={2} />
                                            <Line type="monotone" dataKey="totalAmount" name="Del día" stroke={GOLD} strokeWidth={2} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </Panel>
                            </div>
                        </section>

                        {/* ── 5. Distribución geográfica ───────────────
                            Sólo los ejes que tienen algo que decir: con una
                            edición nacional, «países» sobra. */}
                        {(hasGeo(overview?.byCountry) || hasGeo(overview?.byDepartment) || hasGeo(overview?.byCity)) && (
                            <section>
                                <BlockTitle icon={Globe}>Distribución geográfica</BlockTitle>
                                <div className="grid gap-4 lg:grid-cols-3">
                                    {hasGeo(overview?.byCountry) && <RankPanel title="Por país" rows={overview.byCountry} priceMode={k.priceMode} />}
                                    {hasGeo(overview?.byDepartment) && <RankPanel title="Por departamento" rows={overview.byDepartment} priceMode={k.priceMode} />}
                                    {hasGeo(overview?.byCity) && <RankPanel title="Por ciudad" rows={overview.byCity} priceMode={k.priceMode} />}
                                </div>
                            </section>
                        )}

                        {/* ── 6. Tablas ────────────────────────────────── */}
                        <section>
                            <BlockTitle icon={Building2}>Clubes y proyectos</BlockTitle>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <Panel title="Clubes participantes">
                                    <div className="max-h-[320px] overflow-auto">
                                        <table className="w-full text-sm">
                                            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Club</th>
                                                    <th className="px-3 py-2 text-right">Proyectos</th>
                                                    <th className="px-3 py-2 text-right">Pagados</th>
                                                    <th className="px-3 py-2 text-right">Recaudo</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {(overview?.byClub || []).map((c: any) => (
                                                    <tr key={c.key}>
                                                        <td className="px-3 py-2.5 text-slate-800">{c.key}</td>
                                                        <td className="px-3 py-2.5 text-right">{c.count}</td>
                                                        <td className="px-3 py-2.5 text-right text-emerald-700">{c.paid}</td>
                                                        <td className="px-3 py-2.5 text-right font-semibold">{k.priceMode === 'USD' ? fmtUsd(c.totalAmount) : fmtCop(c.totalAmount)}</td>
                                                    </tr>
                                                ))}
                                                {!(overview?.byClub || []).length && (
                                                    <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Todavía no hay postulaciones.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </Panel>
                                <Panel title="Proyectos con mayor presupuesto">
                                    <div className="max-h-[320px] overflow-auto">
                                        <table className="w-full text-sm">
                                            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Proyecto</th>
                                                    <th className="px-3 py-2 text-left">Club</th>
                                                    <th className="px-3 py-2 text-right">Presupuesto</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {(overview?.topBudget || []).map((r: any) => (
                                                    <tr key={r.id}>
                                                        <td className="px-3 py-2.5 text-slate-800">{r.projectName}</td>
                                                        <td className="px-3 py-2.5 text-slate-500">{r.clubName}</td>
                                                        <td className="px-3 py-2.5 text-right font-semibold">{fmtUsd(r.budgetUsd)}</td>
                                                    </tr>
                                                ))}
                                                {!(overview?.topBudget || []).length && (
                                                    <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">Todavía no hay proyectos.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </Panel>
                            </div>
                        </section>

                        {/* ── 7. Actividad reciente ────────────────────── */}
                        {(overview?.activity || []).length > 0 && (
                            <section>
                                <BlockTitle icon={Clock}>Actividad reciente</BlockTitle>
                                <div className="rounded-xl border border-slate-200 bg-white p-5">
                                    <ol className="space-y-3">
                                        {overview.activity.map((a: any, i: number) => (
                                            <li key={i} className="flex gap-3 text-sm">
                                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: BLUE }} />
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-slate-800">{a.title}</p>
                                                    <p className="text-[13px] text-slate-500">
                                                        {a.projectName} · {a.clubName} · Ref. {a.publicRef} · {fmtDateTime(a.createdAt)}
                                                    </p>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            </section>
                        )}

                        <p className="text-center text-[12px] text-slate-400">
                            Todos los datos corresponden a esta edición. Exporta desde los botones de arriba.
                        </p>
                    </div>
                )}

                {/* ── Postulaciones ─────────────────────────────────── */}
                {tab === 'submissions' && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-[240px]">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={filters.search}
                                    onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && loadRows(1)}
                                    placeholder="Buscar por proyecto, club, correo o referencia…"
                                    className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <button onClick={() => loadRows(1)} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>Buscar</button>
                            <button onClick={() => setShowFilters(v => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                <Filter size={14} /> Filtros
                            </button>
                        </div>

                        {showFilters && (
                            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
                                {[
                                    ['workflowStatus', 'Estado de la postulación', catalog?.workflowStates?.map((s: StateDef) => ({ value: s.key, label: s.label }))],
                                    ['paymentStatus', 'Estado del pago', catalog?.paymentStates?.map((s: StateDef) => ({ value: s.key, label: s.label }))],
                                    ['district', 'Distrito', (catalog?.districts || []).map((d: string) => ({ value: d, label: d }))],
                                    ['focusArea', 'Área de enfoque', (catalog?.focusAreas || []).map((a: any) => ({ value: a.key, label: a.label }))],
                                    ['priority', 'Prioridad', catalog?.priorities?.map((p: StateDef) => ({ value: p.key, label: p.label }))],
                                ].map(([key, label, options]: any) => (
                                    <label key={key} className="block">
                                        <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
                                        <select value={(filters as any)[key]} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}
                                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                            <option value="all">Todas</option>
                                            {(options || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                    </label>
                                ))}
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600">Etiqueta</span>
                                    <select value={filters.tagId} onChange={e => setFilters(f => ({ ...f, tagId: e.target.value }))}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                        <option value="">Todas</option>
                                        {tags.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                </label>
                                <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Desde</span>
                                    <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                                <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Hasta</span>
                                    <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                                <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Presupuesto mín. (USD)</span>
                                    <input type="number" value={filters.budgetMin} onChange={e => setFilters(f => ({ ...f, budgetMin: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                                <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Presupuesto máx. (USD)</span>
                                    <input type="number" value={filters.budgetMax} onChange={e => setFilters(f => ({ ...f, budgetMax: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                                <div className="flex items-end gap-2">
                                    <button onClick={() => loadRows(1)} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>Aplicar</button>
                                    <button onClick={() => { setFilters({ search: '', paymentStatus: 'all', workflowStatus: 'all', district: 'all', focusArea: 'all', priority: 'all', tagId: '', from: '', to: '', budgetMin: '', budgetMax: '' }); setTimeout(() => loadRows(1), 0); }}
                                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Limpiar</button>
                                </div>
                            </div>
                        )}

                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full min-w-[1200px] text-sm">
                                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                                    <tr>
                                        {([['publicRef', 'Registro'], ['createdAt', 'Inscripción'], ['projectName', 'Proyecto'],
                                           ['clubName', 'Club / Distrito'], ['', 'Responsable'], ['', 'Área de enfoque'],
                                           ['budgetUsd', 'Presupuesto'], ['workflowStatus', 'Estado'], ['paymentStatus', 'Pago'],
                                           ['amountCop', 'Valor'], ['', '']] as const).map(([sortKey, label], i) => (
                                            <th key={i} className="whitespace-nowrap px-3 py-3">
                                                {sortKey ? (
                                                    <button onClick={() => { setSort(s => ({ sortBy: sortKey, sortDir: s.sortBy === sortKey && s.sortDir === 'desc' ? 'asc' : 'desc' })); setTimeout(() => loadRows(1), 0); }}
                                                        className="inline-flex items-center gap-1 hover:text-slate-800">
                                                        {label} <ArrowUpDown size={11} />
                                                    </button>
                                                ) : label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rows.map(s => {
                                        const wf = stateLabel(s.workflowStatus, catalog?.workflowStates);
                                        const pay = stateLabel(s.paymentStatus, catalog?.paymentStates);
                                        return (
                                            <tr key={s.id} className="hover:bg-slate-50">
                                                <td className="px-3 py-3 font-mono text-xs font-bold text-slate-700">{s.publicRef}</td>
                                                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{fmtDate(s.createdAt)}</td>
                                                <td className="px-3 py-3">
                                                    <p className="font-semibold text-slate-900">{s.projectName}</p>
                                                    {s.tags.length > 0 && (
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {s.tags.map(t => <Badge key={t.id} color={t.color}>{t.label}</Badge>)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3"><p className="text-slate-800">{s.clubName}</p><p className="text-xs text-slate-500">{s.district}</p></td>
                                                <td className="px-3 py-3"><p className="text-slate-800">{s.responsable}</p><p className="text-xs text-slate-500">{s.email}</p><p className="text-xs text-slate-500">{s.phone}</p></td>
                                                <td className="px-3 py-3 text-xs text-slate-600">{s.focusAreaLabel || s.focusArea}</td>
                                                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-slate-800">{fmtUsd(s.budgetUsd)}</td>
                                                <td className="px-3 py-3"><Badge color={wf.color}>{wf.label}</Badge></td>
                                                <td className="px-3 py-3"><Badge color={pay.color}>{pay.label}</Badge></td>
                                                <td className="whitespace-nowrap px-3 py-3 text-right">
                                                    <p className="font-semibold text-slate-800">{amountLabel(s)}</p>
                                                    {s.paidAt && <p className="text-[11px] text-slate-400">{fmtDate(s.paidAt)}</p>}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <button onClick={() => setDetailId(s.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                                                        <Eye size={13} /> Ver
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!rows.length && !tableLoading && (
                                        <tr><td colSpan={11} className="px-4 py-12 text-center text-slate-400">No hay postulaciones que coincidan con los filtros.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                            <span>{fmtNum(pagination.total)} postulaciones · página {pagination.page} de {pagination.pages}</span>
                            <div className="flex items-center gap-2">
                                <select value={pagination.pageSize}
                                    onChange={e => { const size = Number(e.target.value); setPagination(p => ({ ...p, pageSize: size })); setTimeout(() => loadRows(1), 0); }}
                                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                                    {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} por página</option>)}
                                </select>
                                <button disabled={pagination.page <= 1} onClick={() => loadRows(pagination.page - 1)}
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40">Anterior</button>
                                <button disabled={pagination.page >= pagination.pages} onClick={() => loadRows(pagination.page + 1)}
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40">Siguiente</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Alertas ───────────────────────────────────────── */}
                {tab === 'alerts' && (
                    <div className="space-y-4">
                        {!alerts && <div className="text-slate-500">Cargando alertas…</div>}
                        {alerts?.alerts?.map((a: any) => (
                            <div key={a.key} className="rounded-xl border border-slate-200 bg-white">
                                <div className={`flex items-center justify-between gap-3 rounded-t-xl px-5 py-3 ${
                                    a.severity === 'danger' ? 'bg-red-50' : a.severity === 'warning' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                        <AlertTriangle size={15} className={a.severity === 'danger' ? 'text-red-600' : a.severity === 'warning' ? 'text-amber-600' : 'text-slate-500'} />
                                        {a.label}
                                    </h3>
                                    <Badge color={a.count ? (a.severity === 'danger' ? 'red' : 'amber') : 'emerald'}>{a.count}</Badge>
                                </div>
                                {a.count > 0 ? (
                                    <ul className="divide-y divide-slate-100">
                                        {a.items.slice(0, 12).map((item: any, i: number) => (
                                            <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                                                <span className="text-slate-700">
                                                    <span className="font-mono text-xs font-bold text-slate-500">{item.publicRef || item.email}</span>{' '}
                                                    {item.projectName || (item.refs ? `${item.count} registros: ${(item.refs || []).join(', ')}` : '')}
                                                    {item.clubName ? ` · ${item.clubName}` : ''}
                                                    {item.lastPaymentError ? <span className="text-red-600"> — {item.lastPaymentError}</span> : ''}
                                                    {item.budgetUsd !== undefined && item.budgetUsd !== null ? <span className="text-slate-500"> — {fmtUsd(item.budgetUsd)}</span> : ''}
                                                </span>
                                                {item.id && (
                                                    <button onClick={() => { setDetailId(item.id); setTab('submissions'); }} className="text-xs font-semibold text-blue-700 hover:underline">Abrir ficha</button>
                                                )}
                                            </li>
                                        ))}
                                        {a.count > 12 && <li className="px-5 py-2 text-xs text-slate-400">… y {a.count - 12} más</li>}
                                    </ul>
                                ) : (
                                    <p className="px-5 py-4 text-sm text-slate-400">Sin novedades.</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Reportes ──────────────────────────────────────── */}
                {/* ── Formulación de proyectos ──────────────────────── */}
                {tab === 'forms' && (() => {
                    const selectedForm = (forms?.available || []).find((f: any) => f.key === formKey);
                    return (
                    <div className="space-y-4">
                        {/* Selector de formulario (v4.642). Aparece solo si hay
                            más de uno; las opciones las manda el servidor, así
                            que registrar uno nuevo lo agrega aquí sin tocar
                            esta pantalla. */}
                        {(forms?.available?.length || 0) > 1 && (
                            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
                                {forms.available.map((f: any) => (
                                    <button key={f.key} onClick={() => setFormKey(f.key)}
                                        className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                            formKey === f.key ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                                        style={formKey === f.key ? { background: BLUE } : undefined}>
                                        {f.shortTitle || f.title}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-4">
                            {[
                                ['submitted', 'Enviados al comité', 'emerald'],
                                ['draft', 'En elaboración', 'amber'],
                                ['not_started', 'Sin iniciar', 'slate'],
                            ].map(([key, label, tone]) => (
                                <div key={key} className="rounded-xl border border-slate-200 bg-white p-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                                    <p className={`mt-1 text-2xl font-bold text-${tone}-600`} style={{ color: tone === 'slate' ? '#475569' : undefined }}>
                                        {forms?.stats?.[key as string] || 0}
                                    </p>
                                </div>
                            ))}
                            <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-4">
                                <select value={formFilter}
                                    onChange={e => setFormFilter(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                    <option value="all">Todas las postulaciones</option>
                                    <option value="submitted">Solo enviadas</option>
                                    <option value="draft">En elaboración</option>
                                    <option value="not_started">Sin iniciar</option>
                                    <option value="paid_pending">Pagadas sin enviar</option>
                                </select>
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full min-w-[900px] text-sm">
                                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Ref.</th>
                                        <th className="px-4 py-3">Proyecto / Club</th>
                                        <th className="px-4 py-3">Cuenta</th>
                                        <th className="px-4 py-3">Avance</th>
                                        <th className="px-4 py-3">Estado</th>
                                        <th className="px-4 py-3">Última edición</th>
                                        <th className="px-4 py-3 text-right">Descargas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(forms?.forms || []).map((f: any) => (
                                        <tr key={f.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{f.publicRef}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-slate-900">{f.projectName}</p>
                                                <p className="text-xs text-slate-500">{f.clubName} · {f.district}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                {f.hasAccount
                                                    ? <Badge color={f.lastLoginAt ? 'emerald' : 'sky'}>{f.lastLoginAt ? 'Ha ingresado' : 'Creada'}</Badge>
                                                    : <Badge color="slate">Sin cuenta</Badge>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                                                        <div className="h-full rounded-full" style={{ width: `${f.completionPct || 0}%`, background: BLUE }} />
                                                    </div>
                                                    <span className="text-xs font-semibold text-slate-600">{f.completionPct || 0}%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {!f.formStatus ? <Badge color="slate">Sin iniciar</Badge>
                                                    : f.formStatus === 'submitted' ? <Badge color="emerald">Enviado</Badge>
                                                    : <Badge color="amber">En elaboración</Badge>}
                                                {f.lockedAt && <span className="ml-1"><Badge color="red">Cerrado</Badge></span>}
                                                {f.reviewStatus === 'approved' && <span className="ml-1"><Badge color="emerald">Aprobado</Badge></span>}
                                                {f.reviewStatus === 'rejected' && <span className="ml-1"><Badge color="red">Rechazado</Badge></span>}
                                                {f.reviewStatus === 'in_review' && <span className="ml-1"><Badge color="indigo">En revisión</Badge></span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-500">
                                                {f.lastEditedAt ? fmtDateTime(f.lastEditedAt) : '—'}
                                                {f.submittedAt && <><br /><span className="text-emerald-600">Enviado {fmtDate(f.submittedAt)}</span></>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-1.5">
                                                    {/* La aprobación institucional (firmas del GD y del
                                                        presidente del Comité de LFRI) sólo se escribe
                                                        desde aquí; el club la ve en solo lectura. */}
                                                    {selectedForm?.hasApproval && f.formStatus && (
                                                        <button onClick={() => setApproving({ id: f.id, formKey })}
                                                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-100 ${
                                                                f.approvalFilled ? 'border-emerald-300 text-emerald-700' : 'border-slate-300 text-slate-700'}`}
                                                            title="Aprobación institucional (GD y Comité LFRI)">
                                                            <ShieldCheck size={13} /> {f.approvalFilled ? 'Aprobación' : 'Aprobar'}
                                                        </button>
                                                    )}
                                                    <button onClick={() => downloadDocx(f)} disabled={!f.formStatus || !selectedForm?.docx}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                                                        title={selectedForm?.docx ? 'Descargar en Word' : 'Este formulario no tiene plantilla en Word'}>
                                                        <FileText size={13} /> Word
                                                    </button>
                                                    <button onClick={() => downloadFormPdf(f)} disabled={!f.formStatus}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                                                        title="Descargar en PDF">
                                                        <FileText size={13} /> PDF
                                                    </button>
                                                    {access.changeStatus && f.formStatus && (
                                                        f.lockedAt
                                                            ? <button onClick={() => toggleFormLock(f, 'reopen')} className="rounded-lg border border-slate-300 p-1.5 text-emerald-600 hover:bg-emerald-50" title="Reabrir edición"><Unlock size={13} /></button>
                                                            : <button onClick={() => toggleFormLock(f, 'lock')} className="rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100" title="Cerrar edición"><Lock size={13} /></button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {!forms?.forms?.length && (
                                        <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Todavía no hay formularios de proyecto.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {approving && (
                            <ProjectFormApproval
                                submissionId={approving.id}
                                formKey={approving.formKey}
                                canEdit={!!access.changeStatus}
                                onClose={() => setApproving(null)}
                                onSaved={reloadForms}
                            />
                        )}
                    </div>
                    );
                })()}

                {/* ── Configuración de la convocatoria ──────────────────── */}
                {tab === 'config' && (
                    <ConvocatoriaConfig canEdit={!!access.config} onSaved={() => {
                        // Refrescar catálogo: la edición, los distritos y las áreas
                        // alimentan los filtros y las cabeceras del módulo.
                        fetch(withEvento(`${API}/project-fair/admin/catalog`), { headers: authHeaders() })
                            .then(r => r.json()).then(cat => { setCatalog(cat); setAccess(cat.access); }).catch(() => {});
                    }} />
                )}
            </div>

            {detailId && (
                <SubmissionDetail
                    id={detailId}
                    access={access}
                    catalog={catalog}
                    tags={tags}
                    onClose={() => setDetailId(null)}
                    onChanged={() => { loadRows(pagination.page); loadOverview(); }}
                />
            )}
        </AdminLayout>
    );
};

// ════════════════════════════════════════════════════════════════════
// Ficha detallada
// ════════════════════════════════════════════════════════════════════
const SubmissionDetail = ({ id, access, catalog, tags, onClose, onChanged }: any) => {
    const [data, setData] = useState<{ submission: Submission; events: TimelineEvent[]; files: FairFile[]; stripeEvents: any[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [comment, setComment] = useState('');
    const [reason, setReason] = useState('');
    const [pane, setPane] = useState<'datos' | 'pago' | 'historial'>('datos');

    const load = useCallback(() => {
        setLoading(true);
        fetch(withEvento(`${API}/project-fair/admin/postulaciones/${id}`), { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { if (d?.error) throw new Error(d.error); setData(d); })
            .catch(e => toast.error(e?.message || 'No se pudo abrir la ficha'))
            .finally(() => setLoading(false));
    }, [id]);
    useEffect(() => { load(); }, [load]);

    const patch = async (body: Record<string, unknown>, successMsg = 'Cambios guardados') => {
        setSaving(true);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${id}`), {
                method: 'PATCH', headers: jsonHeaders(), body: JSON.stringify(body),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d?.error || 'No se pudo guardar');
            toast.success(successMsg);
            setReason('');
            load(); onChanged();
        } catch (e: any) { toast.error(e?.message); } finally { setSaving(false); }
    };

    const action = async (path: string, body: Record<string, unknown> = {}, successMsg = 'Listo') => {
        setSaving(true);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${id}/${path}`), {
                method: 'POST', headers: jsonHeaders(), body: JSON.stringify(body),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d?.error || 'No se pudo completar la acción');
            toast.success(successMsg);
            load(); onChanged();
        } catch (e: any) { toast.error(e?.message); } finally { setSaving(false); }
    };

    const exportFicha = async () => {
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${id}/snapshot`), { headers: authHeaders() });
            const snap = await res.json();
            const { default: JsPDF } = await import('jspdf');
            const doc = new JsPDF({ unit: 'pt', format: 'a4' });
            const s = snap.submission;

            doc.setFillColor(23, 69, 143); doc.rect(0, 0, 595, 84, 'F');
            doc.setTextColor(255).setFontSize(14).text(snap.edition?.name || 'Feria de Proyectos', 40, 38);
            doc.setFontSize(10).text(`Ficha de postulación ${s.publicRef}`, 40, 58);

            let y = 115;
            const line = (label: string, value: any) => {
                if (y > 780) { doc.addPage(); y = 50; }
                doc.setFontSize(8).setTextColor(120).text(label, 40, y);
                doc.setFontSize(9.5).setTextColor(25).text(String(value ?? '—').slice(0, 90), 190, y);
                y += 17;
            };
            doc.setFontSize(12).setTextColor(30).text('Responsable y club', 40, y); y += 20;
            line('Responsable', `${s.firstName} ${s.lastName}`);
            line('Correo', s.email); line('WhatsApp', s.phone);
            line('Club Rotario', s.clubName); line('Distrito', s.district);
            line('Rol en el club', s.clubRoleLabel);
            line('Ubicación', [s.city, s.department, s.country].filter(Boolean).join(', '));
            line('Documento', [s.idTypeLabel || s.idType, s.idNumber].filter(Boolean).join(' '));
            y += 8; doc.setFontSize(12).text('Proyecto', 40, y); y += 20;
            line('Nombre', s.projectName);
            line('Área de enfoque', s.focusAreaLabel || s.focusArea);
            line('Presupuesto', `${fmtUsd(s.budgetUsd)} USD`);
            line('Estado', s.workflowStatus); line('Prioridad', s.priority);
            line('Responsable asignado', s.assigneeName);
            y += 6;
            doc.setFontSize(8).setTextColor(120).text('Descripción', 40, y); y += 14;
            doc.setFontSize(9).setTextColor(30);
            doc.splitTextToSize(String(s.projectDescription || '—'), 500).forEach((ln: string) => {
                if (y > 780) { doc.addPage(); y = 50; }
                doc.text(ln, 40, y); y += 13;
            });
            y += 10; doc.setFontSize(12).text('Pago', 40, y); y += 20;
            line('Estado del pago', s.status);
            if (s.amountCop) line('Valor', `${fmtCop(s.amountCop)} COP`);
            line(s.amountCop ? 'Cobrado' : 'Valor', `${fmtUsd(s.amountUsd)} USD`);
            line('TRM aplicada', s.trmRate ? `${fmtNum(s.trmRate)} (${s.trmDate || ''})` : '—');
            line('Confirmado el', fmtDateTime(s.paidAt));
            if (s.stripePaymentIntentId) line('Referencia Stripe', s.stripePaymentIntentId);

            y += 10; doc.setFontSize(12).text('Historial', 40, y); y += 18;
            doc.setFontSize(8.5);
            (snap.events || []).forEach((e: TimelineEvent) => {
                if (y > 780) { doc.addPage(); y = 50; }
                doc.setTextColor(120).text(fmtDateTime(e.createdAt), 40, y);
                doc.setTextColor(25).text(String(e.title || e.type).slice(0, 60), 175, y);
                if (e.actorName) doc.setTextColor(150).text(String(e.actorName).slice(0, 28), 430, y);
                y += 13;
            });
            doc.save(`ficha-${s.publicRef}.pdf`);
        } catch {
            toast.error('No se pudo generar la ficha en PDF');
        }
    };

    const s = data?.submission;
    const wf = catalog?.workflowStates?.find((x: StateDef) => x.key === s?.workflowStatus);
    const pay = catalog?.paymentStates?.find((x: StateDef) => x.key === s?.paymentStatus);

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
            <div className="h-full w-full max-w-3xl overflow-y-auto bg-slate-50 shadow-2xl" onClick={e => e.stopPropagation()}>
                {loading || !s ? (
                    <div className="flex h-full items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" size={20} /> Cargando ficha…</div>
                ) : (
                    <>
                        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-sm font-bold text-slate-500">{s.publicRef}</span>
                                        {wf && <Badge color={wf.color}>{wf.label}</Badge>}
                                        {pay && <Badge color={pay.color}>{pay.label}</Badge>}
                                    </div>
                                    <h2 className="mt-1 text-xl font-bold text-slate-900">{s.projectName}</h2>
                                    <p className="text-sm text-slate-500">{s.clubName} · {s.district}</p>
                                </div>
                                <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                <button onClick={exportFicha} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FileText size={13} /> Ficha en PDF</button>
                                <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/postular-proyecto?submission=${s.id}`); toast.success('Enlace copiado'); }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink size={13} /> Copiar enlace</button>
                                {access.managePayments && (
                                    <>
                                        <button onClick={() => action('sync-stripe', {}, 'Sincronizado con Stripe')} disabled={saving}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={13} /> Sincronizar con Stripe</button>
                                        {s.paymentStatus === 'paid' && (
                                            <button onClick={() => action('resend-receipt', {}, 'Comprobante reenviado')} disabled={saving}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Mail size={13} /> Reenviar comprobante</button>
                                        )}
                                    </>
                                )}
                                {access.changeStatus && !s.reviewedAt && (
                                    <button onClick={() => patch({ markReviewed: true }, 'Marcada como revisada')} disabled={saving}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><CheckCircle2 size={13} /> Marcar revisada</button>
                                )}
                            </div>

                            <div className="mt-3 flex gap-1 border-b border-slate-100">
                                {([['datos', 'Datos'], ['pago', 'Pago'], ['historial', 'Historial']] as const).map(([key, label]) => (
                                    <button key={key} onClick={() => setPane(key)}
                                        className={`border-b-2 px-3 py-2 text-xs font-semibold ${pane === key ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500'}`}>{label}</button>
                                ))}
                            </div>
                        </header>

                        <div className="space-y-4 p-6">
                            {pane === 'datos' && (
                                <>
                                    <Section title="Responsable">
                                        <Row label="Nombre" value={`${s.firstName} ${s.lastName}`} />
                                        <Row label="Correo" value={s.email} />
                                        <Row label="WhatsApp" value={s.phone} />
                                        <Row label="Rol en el club" value={s.clubRoleLabel} />
                                        <Row label="País" value={s.country} />
                                        <Row label="Departamento" value={s.department} />
                                        <Row label="Ciudad" value={s.city} />
                                        <Row label="Documento" value={[s.idTypeLabel || s.idType, s.idNumber].filter(Boolean).join(' ')} />
                                    </Section>
                                    <Section title="Club y proyecto">
                                        <Row label="Club Rotario" value={s.clubName} />
                                        <Row label="Distrito" value={s.district} />
                                        <Row label="Área de enfoque" value={s.focusAreaLabel || s.focusArea} />
                                        <Row label="Presupuesto" value={`${fmtUsd(s.budgetUsd)} USD`} />
                                        <Row label="Fecha de inscripción" value={fmtDateTime(s.createdAt)} />
                                        {s.notes && (
                                            <div className="pt-3">
                                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Comentarios o solicitudes del postulante</p>
                                                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{s.notes}</p>
                                            </div>
                                        )}
                                        <div className="pt-3">
                                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Descripción del proyecto</p>
                                            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{s.projectDescription}</p>
                                        </div>
                                    </Section>

                                    <Section title="Gestión interna">
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <label className="block">
                                                <span className="mb-1 block text-xs font-semibold text-slate-600">Estado de la postulación</span>
                                                <select disabled={!access.changeStatus} defaultValue={s.workflowStatus}
                                                    onChange={e => patch({ workflowStatus: e.target.value, reason }, 'Estado actualizado')}
                                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50">
                                                    {(catalog?.workflowStates || []).map((st: StateDef) => <option key={st.key} value={st.key}>{st.label}</option>)}
                                                </select>
                                            </label>
                                            <label className="block">
                                                <span className="mb-1 block text-xs font-semibold text-slate-600">Prioridad</span>
                                                <select disabled={!access.changeStatus} defaultValue={s.priority}
                                                    onChange={e => patch({ priority: e.target.value }, 'Prioridad actualizada')}
                                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50">
                                                    {(catalog?.priorities || []).map((p: StateDef) => <option key={p.key} value={p.key}>{p.label}</option>)}
                                                </select>
                                            </label>
                                            <label className="block">
                                                <span className="mb-1 block text-xs font-semibold text-slate-600">Responsable asignado</span>
                                                <input disabled={!access.changeStatus} defaultValue={s.assigneeName || ''}
                                                    onBlur={e => e.target.value !== (s.assigneeName || '') && patch({ assigneeName: e.target.value }, 'Responsable asignado')}
                                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
                                            </label>
                                            <label className="block">
                                                <span className="mb-1 block text-xs font-semibold text-slate-600">Categoría interna</span>
                                                <input disabled={!access.changeStatus} defaultValue={s.internalCategory || ''}
                                                    onBlur={e => e.target.value !== (s.internalCategory || '') && patch({ internalCategory: e.target.value }, 'Categoría actualizada')}
                                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
                                            </label>
                                            {access.changeStatus && (
                                                <label className="block sm:col-span-2">
                                                    <span className="mb-1 block text-xs font-semibold text-slate-600">Motivo del próximo cambio de estado (queda en el historial)</span>
                                                    <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: pasa a revisión técnica del comité CADRE"
                                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                                </label>
                                            )}
                                        </div>
                                        {s.reviewedAt && <p className="mt-3 text-xs text-emerald-700">Revisada el {fmtDateTime(s.reviewedAt)} por {s.reviewedBy}</p>}
                                    </Section>

                                    <Section title="Etiquetas">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {s.tags.map(t => (
                                                <span key={t.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${BADGE[t.color] || BADGE.slate}`}>
                                                    {t.label}
                                                    {access.manageTags && (
                                                        <button onClick={async () => {
                                                            await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${id}/tags/${t.id}`), { method: 'DELETE', headers: authHeaders() });
                                                            load(); onChanged();
                                                        }} className="opacity-60 hover:opacity-100"><X size={11} /></button>
                                                    )}
                                                </span>
                                            ))}
                                            {access.manageTags && (
                                                <select value="" onChange={async e => {
                                                    if (!e.target.value) return;
                                                    await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${id}/tags`), { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ tagId: e.target.value }) });
                                                    load(); onChanged();
                                                }} className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-500">
                                                    <option value="">+ Agregar etiqueta</option>
                                                    {tags.filter((t: Tag) => !s.tags.some(x => x.id === t.id)).map((t: Tag) => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                </select>
                                            )}
                                        </div>
                                    </Section>

                                    {data.files.length > 0 && (
                                        <Section title="Documentos adjuntos">
                                            <ul className="space-y-2">
                                                {data.files.map(f => (
                                                    <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                                                        <a href={f.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-blue-700 hover:underline">
                                                            <Paperclip size={13} /> {f.fileName}
                                                        </a>
                                                        <span className="text-xs text-slate-400">{fmtDate(f.createdAt)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </Section>
                                    )}
                                </>
                            )}

                            {pane === 'pago' && (
                                <Section title="Trazabilidad del pago">
                                    {!access.viewPayments ? (
                                        <p className="text-sm text-slate-500">Tu perfil no tiene acceso al detalle financiero.</p>
                                    ) : (
                                        <>
                                            <Row label="Estado" value={pay?.label || s.paymentStatus} />
                                            {s.amountCop ? <Row label="Valor de inscripción" value={`${fmtCop(s.amountCop)} COP`} /> : null}
                                            <Row label="Valor recibido" value={s.amountReceived ? `${fmtCop(s.amountReceived)} COP` : '—'} />
                                            <Row label={s.amountCop ? 'Valor cobrado' : 'Valor de inscripción'} value={`${fmtUsd(s.amountUsd)} USD`} />
                                            <Row label="TRM aplicada" value={s.trmRate ? `${fmtNum(s.trmRate)} COP/USD · ${s.trmDate || ''}` : '—'} />
                                            <Row label="Fuente de la TRM" value={s.trmSource} />
                                            <Row label="Método de pago" value={s.paymentMethod} />
                                            <Row label="Fecha de confirmación" value={fmtDateTime(s.paidAt)} />
                                            <Row label="Checkout Session" value={s.stripeSessionId} mono />
                                            <Row label="Payment Intent" value={s.stripePaymentIntentId} mono />
                                            <Row label="Charge" value={s.stripeChargeId} mono />
                                            <Row label="Customer" value={s.stripeCustomerId} mono />
                                            {s.refundedAmount ? <Row label="Reembolsado" value={`${fmtCop(s.refundedAmount)} COP · ${fmtDateTime(s.refundedAt)}`} /> : null}
                                            {s.lastPaymentError ? <Row label="Último error" value={s.lastPaymentError} /> : null}
                                            {s.receiptUrl && (
                                                <a href={s.receiptUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">
                                                    <Download size={14} /> Ver comprobante de Stripe
                                                </a>
                                            )}
                                            {data.stripeEvents.length > 0 && (
                                                <div className="mt-5">
                                                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Eventos recibidos de Stripe</p>
                                                    <ul className="space-y-1 text-xs text-slate-600">
                                                        {data.stripeEvents.map(e => (
                                                            <li key={e.id} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                                                                <span className="font-mono">{e.type}</span>
                                                                <span className="text-slate-400">{fmtDateTime(e.receivedAt)}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </Section>
                            )}

                            {pane === 'historial' && (
                                <>
                                    {access.comment && (
                                        <Section title="Nueva observación interna">
                                            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
                                                placeholder="Escribe una nota para el equipo…"
                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                            <button
                                                onClick={async () => { if (!comment.trim()) return; await action('comments', { body: comment }, 'Observación agregada'); setComment(''); }}
                                                disabled={saving || !comment.trim()}
                                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: BLUE }}>
                                                <MessageSquarePlus size={14} /> Agregar
                                            </button>
                                        </Section>
                                    )}
                                    <Section title={`Historial (${data.events.length} eventos)`}>
                                        <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                                            {data.events.map(e => {
                                                const meta = EVENT_META[e.type] || { label: e.type, color: 'slate' };
                                                return (
                                                    <li key={e.id} className="relative">
                                                        <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white" style={{ background: BADGE[meta.color]?.includes('emerald') ? '#10B981' : meta.color === 'red' ? '#EF4444' : BLUE }} />
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Badge color={meta.color}>{meta.label}</Badge>
                                                            <span className="text-xs text-slate-400">{fmtDateTime(e.createdAt)}</span>
                                                            {e.actorName && <span className="text-xs text-slate-500">· {e.actorName}</span>}
                                                        </div>
                                                        <p className="mt-1 text-sm font-medium text-slate-800">{e.title}</p>
                                                        {e.detail && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{e.detail}</p>}
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                    </Section>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h3>
        {children}
    </section>
);

const Row = ({ label, value, mono = false }: { label: string; value?: React.ReactNode; mono?: boolean }) => (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`text-sm text-slate-900 sm:max-w-[62%] sm:text-right ${mono ? 'break-all font-mono text-xs' : 'font-medium'}`}>{value || '—'}</span>
    </div>
);

export default PostulacionesPagos;
