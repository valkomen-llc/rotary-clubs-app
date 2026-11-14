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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowLeft, ArrowUpDown, BarChart3, Building2, Globe, MapPin, CheckCircle2, ClipboardList, Clock,
    CreditCard, Download, ExternalLink, Eye, FileSpreadsheet, FileText, Filter,
    Loader2, Mail, MessageSquarePlus, RefreshCw, Search,
    TrendingUp, Wallet, X, ShieldCheck, Paperclip, Settings, FileSignature, Lock, Unlock, FileDown,
    Archive, ArchiveRestore, CheckSquare, Square, Trash2, TagIcon, Banknote, ArrowRight, History, Users, Clapperboard,
    Layers, PlusCircle, Info, ArrowRightLeft, Pencil, PenLine, Maximize2, Minimize2, FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
    LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { matrixRowsToShow } from '../../lib/projectForms';
// v4.1324 — Expediente integral del proyecto (lectura completa, edición
// auditada, traducción al inglés, fichas PDF y libretas).
import { dossierRequest, TRANSLATION_META, type DossierPayload, type TranslationState, type TranslationStatus } from '../../lib/projectDossier';
import ExpedienteAccionesMenu, { type ExpedientePane, type OpenRequest } from '../../components/admin/feria/expediente/ExpedienteAccionesMenu';
import ExpedientesLote from '../../components/admin/feria/expediente/ExpedientesLote';
import ExpedienteFormulario from '../../components/admin/feria/expediente/ExpedienteFormulario';
import ExpedienteDocumentos from '../../components/admin/feria/expediente/ExpedienteDocumentos';
import ExpedienteTraduccion from '../../components/admin/feria/expediente/ExpedienteTraduccion';
import ExpedienteFichas from '../../components/admin/feria/expediente/ExpedienteFichas';
import ExpedienteLibreta from '../../components/admin/feria/expediente/ExpedienteLibreta';
import ExpedienteHistorial from '../../components/admin/feria/expediente/ExpedienteHistorial';
import PreparacionDocumental from '../../components/admin/feria/expediente/PreparacionDocumental';
// v4.1308 — Confirmación manual: comprobante adjunto e inscripción completa.
import {
    subirComprobanteManual, propuestaConfirmacion, montoEsperado, fechaLocalParaInput, fechaInputAIso,
    type ComprobanteSubido,
} from '../../lib/comprobantePagoManual';
import {
    BULK_MAX, OUTCOME_LABELS, REASON_LABELS, ARCHIVE_VIEWS, ARCHIVE_VIEW_LABELS,
    planBulk, describeBulkPlan, bulkWarnings, isArchived,
    type BulkAction, type BulkPlan,
} from '../../lib/projectFairBulk';
import AdminLayout from '../../components/admin/AdminLayout';
import ConvocatoriaConfig from '../../components/admin/feria/ConvocatoriaConfig';
// v4.1264 — La plantilla oficial de presentación: subir, publicar, versiones y analítica.
import RecursosPlantillas from '../../components/admin/feria/RecursosPlantillas';
// v4.1293 — Video Pitch Profesional: bandeja de solicitudes, guiones con IA, producción y entrega.
// v4.1298 — Videos de proyectos: videos propios (sin costo) + Video Pitch Profesional, en un solo módulo.
import ProjectVideosHub from '../../components/admin/feria/ProjectVideosAdmin';
import EdicionesList from '../../components/admin/feria/EdicionesList';
import ProjectFormApproval from '../../components/admin/feria/ProjectFormApproval';
// v4.1311 — Sustituir una postulación por otra del mismo club, con su pago.
import SustituirPostulacion from '../../components/admin/feria/SustituirPostulacion';
// v4.1313 — Editar el valor de la inscripción de un proyecto (250.000 → 100.000 u otro).
import EditarValorProyecto, { type AmountOverride, type FairPricing } from '../../components/admin/feria/EditarValorProyecto';
// ⚠️ v4.1026 — LA MISMA BARRA DE LA BÓVEDA, no una copia. Registrar un traslado
// desde acá va contra el MISMO endpoint (`/financial/wallet/disbursements/bulk`)
// con su lote, su comprobante compartido y su notificación consolidada. Con un
// segundo formulario, el día que se agregue un campo al desembolso una de las
// dos pantallas se queda sin él y el fallo es mudo: las dos siguen registrando.
import BulkDisbursementBar, { type Elegible } from '../../components/admin/wallet/BulkDisbursementBar';

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
// v4.1259 — Embebida en el Centro de Gestión del dashboard, la edición no
// viaja en la URL de ESTA página (el dashboard tiene la suya): la fija quien
// la monta. Sigue siendo de módulo por el mismo motivo de siempre — hay
// peticiones en subcomponentes —, y se limpia al desmontar.
let embeddedEventId: string | null = null;
export const currentEventId = () => embeddedEventId || new URLSearchParams(window.location.search).get('evento') || '';

/**
 * El marco de la pantalla: la página completa con su `AdminLayout`, o nada
 * cuando va embebida dentro de otra pantalla que ya lo trae (v4.1259). En el
 * ámbito del MÓDULO: declarado dentro del componente sería un tipo nuevo en
 * cada render y React remontaría la pantalla entera.
 */
const Frame = ({ embedded, children }: { embedded: boolean; children: React.ReactNode }) =>
    embedded ? <>{children}</> : <AdminLayout>{children}</AdminLayout>;

interface PostulacionesPagosProps {
    /** v4.1259 — Montada dentro del Centro de Gestión del dashboard. */
    embedded?: boolean;
    /** La edición que se abre cuando va embebida. */
    eventId?: string;
}
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
    // v4.1024 — Archivar y eliminar. Es una capacidad propia, no se deduce de
    // `edit`: sólo la tiene el rol admin.
    remove?: boolean;
    // v4.1324 — Expediente: traducir/preparar libretas y aprobar traducciones.
    translate?: boolean;
    approveTranslation?: boolean;
}
interface StateDef { key: string; label: string; color: string; group?: string; legacy?: boolean }
/** v4.1253 — Los estados heredados del pago se LEEN pero no se ofrecen al elegir. */
const elegibles = (list?: StateDef[]) => (list || []).filter(st => !st.legacy);
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
    // v4.1253 — Estado del proyecto y del pago, por separado.
    projectStateLabel?: string; applied?: boolean; appliedAt?: string | null;
    paymentView?: string; paymentViewLabel?: string; owesRegistration?: boolean;
    internalCategory: string | null; assigneeName: string | null;
    reviewedAt: string | null; reviewedBy: string | null;
    priceMode?: 'COP' | 'USD' | null; chargeCurrency?: string | null;
    amountCop: number | null; amountUsd: number | null; amountReceived: number | null;
    refundedAmount: number | null; refundedAt: string | null;
    trmRate: number | null; trmDate: string | null; trmSource: string | null; paidAt: string | null;
    tags: Tag[];
    archivedAt?: string | null; archivedBy?: string | null; archivedReason?: string | null;
    stripeSessionId?: string; stripePaymentIntentId?: string; stripeChargeId?: string;
    stripeCustomerId?: string; paymentMethod?: string; receiptUrl?: string; lastPaymentError?: string;
    paymentConfirmationOrigin?: 'stripe' | 'manual_admin' | 'direct_transfer' | string | null;
    // v4.1299 — La inscripción a la que pertenece y su posición en ella.
    registrationId?: string | null; projectIndex?: number; projectIndexLabel?: string; registrationProjects?: number | null;
    coveredBy?: { id: string; publicRef: string | null } | null;
    addedVia?: string | null; isExtension?: boolean;
    coveredProjects?: { id: string; publicRef: string | null; projectName: string; projectIndex: number }[];
    withdrawnByClub?: boolean;
    // v4.1330 — Edición después del cierre: marcas que deja el servidor al
    // guardar los formularios del club (`metadata`).
    lastClubEditAt?: string | null;
    postCloseEdit?: PostCloseEdit | null;
    editRequests?: Record<string, { at: string; note?: string | null; by?: string | null }> | null;
    // v4.1311 — Sustitución: el retirado sabe por cuál se cambió; el
    // conservado, qué pago lo respalda, quién lo hizo y qué pasó con el suyo.
    substitution?: {
        role: 'retired' | 'kept'; at: string | null; by: string | null; reason: string | null;
        fromId: string | null; fromRef: string | null; toId: string | null; toRef: string | null;
        payer?: { name: string | null; email: string | null; gatewayName: string | null } | null;
        official?: { amountReceived: number | null; currency: string | null; amountCop: number | null; amountUsd: number | null; paidAt: string | null; origin: string | null; paymentMethod: string | null; stripePaymentIntentId?: string | null; stripeSessionId?: string | null; receiptUrl?: string | null; manualPaymentRef?: string | null };
        previousPayment?: { status: string | null; amountReceived: number | null; currency: string | null; paidAt: string | null; origin: string | null; classification: { kind: string; label: string; realMoney: boolean | null } | null; stripePaymentIntentId?: string | null; stripeSessionId?: string | null; livemode?: boolean | null };
    } | null;
    paidByName?: string | null;
    // v4.1313 — El valor de la inscripción ajustado a mano por el comité.
    amountOverride?: AmountOverride | null;
    // v4.1304 — Lo que el club escribió en su Solicitud de Aportes del FDD
    // (answers.fdd.requestedUsd / answers.fdd.fapGoalUsd), leído por el
    // servidor. null = no lo escribió. El texto original viaja sólo cuando no
    // es el canónico (miles con punto, «US$»…) o no es un importe.
    fddRequestedUsd?: number | null; fapGoalUsd?: number | null;
    fddRequestedReading?: AmountReading; fapGoalReading?: AmountReading;
    fddRequestedRaw?: string; fapGoalRaw?: string;
    lastSyncAt?: string | null;
    manualPaymentRef?: string | null;
    manualPaymentEvidence?: string | null;
    manualPaymentReason?: string | null;
    manualPaymentBy?: string | null;
    manualPaymentAt?: string | null;
    manualPaymentReceipt?: { name: string; mime: string | null; bytes: number | null } | null;
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

// ── Importes del listado: Presupuesto, FDD y FAP (v4.1304) ──────────
// «USD 30.066», «USD 1.234,50», «USD 0»; «—» cuando no hay valor. Los miles se
// separan a mano: `toLocaleString('es-CO')` no agrupa los de cuatro cifras en
// todos los navegadores («USD 5000» al lado de «USD 30.066»).
const fmtUsdAmount = (n?: number | null) => {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
    const v = Number(n);
    const [ent, dec] = Math.abs(v).toFixed(2).split('.');
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `USD ${v < 0 ? '-' : ''}${miles}${dec === '00' ? '' : `,${dec}`}`;
};
type AmountReading = 'empty' | 'ok' | 'normalized' | 'unreadable';
const FDD_HELP = {
    fddRequestedUsd: 'Cantidad solicitada al Distrito del Fondo Distrital Designado para el periodo 2026-2027.',
    fapGoalUsd: 'Meta de aportes al Fondo Anual de Programas para el periodo 2026-2027.',
} as const;

/**
 * Celda de un importe que escribió el club. Si lo escribió en otro formato
 * (miles con punto, «US$ 5,000»…) se muestra cómo se interpretó y, al
 * pasar el cursor o enfocar, lo que escribió. Si no es un importe, no se
 * inventa: se muestra su texto, marcado. Vive en el ámbito del módulo (regla
 * del proyecto: un componente nunca se declara dentro de otro).
 */
const AmountCell = ({ value, reading, raw, label }: { value?: number | null; reading?: AmountReading; raw?: string; label: string }) => {
    if (reading === 'unreadable') {
        return (
            <td className="whitespace-nowrap px-3 py-3 text-right">
                <span tabIndex={0} title={`El club escribió «${raw}» en ${label}: no es un importe en USD.`}
                    className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                    <AlertTriangle size={11} aria-hidden="true" /> {raw}
                    <span className="sr-only"> (no es un importe en USD)</span>
                </span>
            </td>
        );
    }
    return (
        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-800">
            {fmtUsdAmount(value)}
            {reading === 'normalized' && (
                <span tabIndex={0} title={`El club escribió «${raw}»; se lee como ${fmtUsdAmount(value)}.`}
                    className="ml-1 inline-flex align-middle text-amber-600">
                    <Info size={11} aria-hidden="true" />
                    <span className="sr-only">El club escribió «{raw}»; se lee como {fmtUsdAmount(value)}.</span>
                </span>
            )}
        </td>
    );
};

/**
 * Encabezado ordenable. Con `help`, la abreviatura lleva su significado en
 * una ayuda que aparece al pasar el cursor o al enfocar con el teclado
 * (`aria-describedby`, la leen los lectores de pantalla).
 */
const SortHeader = ({ sortKey, label, help, active, dir, align = 'left', onSort }: {
    sortKey: string; label: string; help?: string; active: boolean; dir: string;
    align?: 'left' | 'right'; onSort: (key: string) => void;
}) => {
    const helpId = `pp-col-help-${sortKey || label}`;
    return (
        <th className={`group relative whitespace-nowrap px-3 py-3 ${align === 'right' ? 'text-right' : ''}`}
            aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
            {sortKey ? (
                <button onClick={() => onSort(sortKey)} aria-describedby={help ? helpId : undefined}
                    className="inline-flex items-center gap-1 rounded hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                    {label}
                    {help && <Info size={11} aria-hidden="true" className="text-slate-400" />}
                    <ArrowUpDown size={11} aria-hidden="true" className={active ? 'text-slate-800' : ''} />
                </button>
            ) : label}
            {help && (
                <span id={helpId} role="tooltip"
                    className="pointer-events-none invisible absolute right-0 top-full z-20 mt-1 w-64 whitespace-normal rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    <strong className="font-semibold">{label}:</strong> {help}
                </span>
            )}
        </th>
    );
};
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
    manual_payment_confirmed: { label: 'Pago confirmado manualmente', color: 'emerald' },
    payment_reconciliation: { label: 'Conciliación financiera', color: 'violet' },
    submission_consolidated: { label: 'Postulación consolidada', color: 'indigo' },
    sync_error: { label: 'Error de sincronización', color: 'red' },
    reviewed: { label: 'Revisada', color: 'emerald' },
    redirect: { label: 'Redirección a Grants', color: 'violet' },
    // v4.1264 — Entrega de la plantilla oficial de presentación al club.
    template_downloaded: { label: 'Plantilla descargada', color: 'sky' },
    // v4.1311 — Sustitución de una postulación y su pago.
    substitution: { label: 'Sustitución de proyecto', color: 'indigo' },
    payment_reclassified: { label: 'Pago anterior identificado', color: 'amber' },
    archived: { label: 'Archivada', color: 'slate' },
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
const PostulacionesPagos: React.FC<PostulacionesPagosProps> = ({ embedded = false, eventId: embedEventId }) => {
    type Tab = 'dashboard' | 'submissions' | 'forms' | 'alerts' | 'config' | 'resources' | 'videopitch';
    // ?tab=config permite enlazar directo a la configuración (y mantiene vivos
    // los enlaces a la antigua entrada de menú "Postulación de Proyectos").
    const [tab, setTab] = useState<Tab>(() => {
        // Embebida, lo que se trabaja es el listado: el resto del módulo
        // sigue en su página.
        if (embedded) return 'submissions';
        const requested = new URLSearchParams(window.location.search).get('tab');
        return (['dashboard', 'submissions', 'forms', 'alerts', 'config', 'resources', 'videopitch'] as const).includes(requested as Tab)
            ? (requested as Tab) : 'dashboard';
    });
    // Edición abierta. Vive en la URL para que el enlace se pueda compartir y
    // el botón "atrás" del navegador devuelva al listado de versiones.
    const [eventId] = useState<string>(() => {
        if (embedded && embedEventId) embeddedEventId = embedEventId;
        return currentEventId();
    });
    // Embebida, la edición se fija aquí y se suelta al desmontar. Se vuelve a
    // fijar en el efecto (no sólo al iniciar el estado): en desarrollo React
    // monta, desmonta y vuelve a montar, y sin esto la segunda vuelta pediría
    // los datos sin edición. Va antes de los efectos que cargan datos, que
    // corren en el orden en que se declaran.
    useEffect(() => {
        if (!embedded || !embedEventId) return undefined;
        embeddedEventId = embedEventId;
        return () => { embeddedEventId = null; };
    }, [embedded, embedEventId]);
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
    // v4.1324 — Con qué pestaña se abre el expediente (desde el menú «⋯») y
    // el estado de traducción de las filas visibles (una sola llamada).
    const [detailOpen, setDetailOpen] = useState<OpenRequest | null>(null);
    const [docStates, setDocStates] = useState<Record<string, { state: TranslationState; label: string }>>({});
    const [showLote, setShowLote] = useState(false);
    const [docTick, setDocTick] = useState(0);

    const [filters, setFilters] = useState({
        search: '', paymentStatus: 'all', workflowStatus: 'all', district: 'all',
        focusArea: 'all', priority: 'all', tagId: '', from: '', to: '', budgetMin: '', budgetMax: '',
        // v4.1304 — Rangos de FDD solicitado y meta FAP (USD). Los filtra el
        // servidor con la misma lectura de la columna.
        fddMin: '', fddMax: '', fapMin: '', fapMax: '',
        // v4.1253 — Vista de participación / recaudo (catálogo del servidor).
        vista: 'all',
        // v4.1299 — Cantidad de proyectos del club (1 | 2) y posición (1 | 2).
        proyectos: 'all', indice: 'all', origen: 'all',
        // v4.1330 — Actualizaciones posteriores al cierre (catálogo del servidor).
        actualizaciones: 'all',
        // v4.1024 — Lo archivado no se ve por defecto: es lo que significa
        // archivar. El valor viaja al servidor, que es quien filtra.
        archivadas: 'activas',
    });
    const [sort, setSort] = useState({ sortBy: 'createdAt', sortDir: 'desc' });
    const [showFilters, setShowFilters] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ── Selección múltiple y acciones en bloque (v4.1024) ────────────
    //
    // ⚠️ LA SELECCIÓN GUARDA LAS FILAS ENTERAS, NO SUS IDS (regla de v4.886).
    // El listado se filtra y se pagina: una postulación marcada antes de
    // cambiar de página tiene que sobrevivir a que la vista cambie, y con sólo
    // el id no habría con qué prever qué le va a pasar ni cómo nombrarla en la
    // confirmación. Actuar sobre lo que ya no se ve es exactamente cómo
    // alguien elimina lo que no quería eliminar, así que el contador avisa
    // cuando la selección incluye filas fuera de la vista.
    //
    // TODO HOOK VA AQUÍ, antes de los returns tempranos de más abajo: uno
    // escrito después no se ejecuta en el primer render y deja la pantalla en
    // blanco (v4.689).
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState<Submission[]>([]);
    const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
    const [bulkReason, setBulkReason] = useState('');
    const [bulkStatusTo, setBulkStatusTo] = useState('');
    const [bulkTagId, setBulkTagId] = useState('');
    const [bulkTagRemove, setBulkTagRemove] = useState(false);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkResult, setBulkResult] = useState<any>(null);
    // v4.1253 — Recordatorios de pago.
    const [reminderBusy, setReminderBusy] = useState(false);
    const [reminderMsg, setReminderMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    // v4.1026 — El traslado de lo cobrado. `plan` lo resuelve el SERVIDOR: qué
    // inscripciones tienen movimiento en la Bóveda, cuáles se pueden girar hoy
    // y cuáles no, con su motivo y su salida. Acá no se deduce nada — con dos
    // criterios, la barra ofrecería trasladar lo que el registro va a rechazar.
    const [transferPlan, setTransferPlan] = useState<any>(null);
    const [transferBusy, setTransferBusy] = useState(false);
    // v4.1125 — Estado del botón PDF del informe ejecutivo. Va aquí, con el
    // resto de los hooks y antes de los returns tempranos (regla v4.689).
    const [pdfBusy, setPdfBusy] = useState(false);

    const selectedIds = useMemo(() => new Set(selected.map(r => r.id)), [selected]);

    // v4.1324 — Estado de traducción de las filas visibles: UNA llamada por
    // página (el servidor lo deriva de las plantillas y las traducciones). Si
    // falla, la tabla sigue igual: es información de apoyo.
    useEffect(() => {
        const ids = rows.map(r => r.id);
        if (!ids.length) { setDocStates({}); return undefined; }
        let vivo = true;
        dossierRequest<{ states: Record<string, { en: { state: TranslationState; label: string } }> }>(`/expedientes/estado?ids=${ids.join(',')}`, currentEventId())
            .then(d => { if (vivo) setDocStates(Object.fromEntries(Object.entries(d.states || {}).map(([k, v]) => [k, { state: v.en.state, label: v.en.label }]))); })
            .catch(() => { if (vivo) setDocStates({}); });
        return () => { vivo = false; };
    }, [rows, docTick]);
    // Qué acciones en bloque tiene sentido ofrecer. Es sólo para PINTAR: cada
    // ruta comprueba su propio permiso en el servidor, porque esconder un
    // control no protege un endpoint de quien lo conoce (v4.868).
    const puedeBloque = !!(access?.remove || access?.changeStatus || access?.manageTags);
    // La previsión: qué haría la acción con lo que hay marcado. Es una
    // COMODIDAD —el veredicto que vale lo recalcula el servidor sobre la fila
    // fresca—, y por eso sale del mismo criterio, comparado por salidas en la
    // prueba: con dos, la pantalla prometería eliminar lo que el servidor
    // archiva.
    const bulkPlan = useMemo<BulkPlan | null>(
        () => (bulkAction ? planBulk(selected, bulkAction) : null),
        [bulkAction, selected]);
    // Cuántas de las marcadas no están en la página que se está mirando.
    const fueraDeVista = useMemo(() => {
        const visibles = new Set(rows.map(r => r.id));
        return selected.filter(r => !visibles.has(r.id)).length;
    }, [rows, selected]);

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
    // v4.1304 — ⚠️ Lo que cambia un filtro, el orden o el tamaño de página y
    // recarga en el MISMO clic tiene que llamar al `loadRows` del render
    // SIGUIENTE. Programar `loadRows` con setTimeout cerraba sobre el del
    // render anterior y pedía con el estado viejo: ordenar por una columna
    // pedía el orden del clic anterior, y «Limpiar» volvía a pedir con los
    // filtros puestos.
    const loadRowsRef = useRef(loadRows);
    loadRowsRef.current = loadRows;
    const reloadNext = () => setTimeout(() => loadRowsRef.current(1), 0);

    /**
     * Recordatorios de pago (v4.1253). Primero se pide el PLAN —a quién le
     * llega y a quién no, con su motivo— y la confirmación dice el hecho; sólo
     * entonces se envía. Con selección, alcanza a las marcadas; sin ella, a
     * todas las que deben la inscripción en esta edición. El tope (intervalo y
     * máximo por postulación) lo aplica el servidor.
     */
    const sendReminders = useCallback(async () => {
        if (reminderBusy) return;
        setReminderBusy(true);
        setReminderMsg(null);
        const ids = selectMode ? selected.map(r => r.id) : [];
        const call = async (confirm: boolean) => {
            const r = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/payment-reminders`), {
                method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ ids, confirm }),
            });
            const body = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(body?.error || 'No se pudieron preparar los recordatorios.');
            return body;
        };
        try {
            const plan = await call(false);
            if (!plan.willSend) {
                const motivos = (plan.plan || []).filter((x: any) => !x.send).slice(0, 8)
                    .map((x: any) => `· ${x.publicRef} ${x.clubName || ''}: ${x.reason}`).join('\n');
                setReminderMsg({ kind: 'error', text: `No hay a quién enviar un recordatorio ahora.${motivos ? `\n${motivos}` : ''}` });
                return;
            }
            const omitidas = (plan.plan || []).filter((x: any) => !x.send);
            const ok = window.confirm(
                `Se enviará el recordatorio de pago a ${plan.willSend} postulación${plan.willSend === 1 ? '' : 'es'}.`
                + (omitidas.length ? `\n${omitidas.length} no lo recibirán (borrador, ya pagada, recordatorio reciente o tope alcanzado).` : '')
                + '\n\n¿Enviar ahora?');
            if (!ok) return;
            const res = await call(true);
            setReminderMsg({
                kind: res.failed ? 'error' : 'ok',
                text: `Recordatorios enviados: ${res.sent}.` + (res.failed ? ` No se pudieron enviar: ${res.failed}.` : '') + (res.skipped?.length ? ` Omitidas: ${res.skipped.length}.` : ''),
            });
            loadRows(pagination.page);
        } catch (e: any) {
            setReminderMsg({ kind: 'error', text: e?.message || 'No se pudieron enviar los recordatorios.' });
        } finally {
            setReminderBusy(false);
        }
    }, [reminderBusy, selectMode, selected, loadRows, pagination.page]);

    // ── Acciones en bloque ───────────────────────────────────────────
    //
    // Un solo camino para las cinco: el cuerpo cambia, el manejo del 428, del
    // error y del desglose no. Con uno por acción, la quinta se queda sin el
    // desglose y nadie se entera.
    //
    // ⚠️ TODAS LAS DEPENDENCIAS VAN EN EL ARRAY. Una que falte no la ve el
    // typecheck: el código es válido y el ajuste simplemente no llega nunca a
    // la petición (la lección de `conQr`, v4.836).
    const runBulk = useCallback(async (action: BulkAction) => {
        const ids = selected.map(r => r.id);
        if (!ids.length) return;
        const body: Record<string, any> = { ids, confirm: true };
        if (bulkReason.trim()) body.reason = bulkReason.trim();
        if (action === 'status') body.workflowStatus = bulkStatusTo;
        if (action === 'tag') { body.tagId = bulkTagId; body.remove = bulkTagRemove; }

        setBulkBusy(true);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/bulk-${action}`), {
                method: 'POST', headers: jsonHeaders(), body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                // El 428 no debería llegar acá —mandamos `confirm: true`— pero
                // si llega se dice lo que el servidor previó, no un genérico.
                throw new Error(data?.error || data?.summary || `El servidor respondió ${res.status}.`);
            }
            setBulkResult(data);
            setSelected([]);
            setBulkAction(null);
            setBulkReason('');
            toast.success(data?.summary || 'Listo.');
            loadRows(pagination.page);
            if (tab === 'dashboard') loadOverview();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo completar la acción en bloque.');
        } finally {
            setBulkBusy(false);
        }
    }, [selected, bulkReason, bulkStatusTo, bulkTagId, bulkTagRemove, loadRows, loadOverview, pagination.page, tab]);

    /**
     * Resolver el traslado de lo seleccionado. **No registra nada**: pide al
     * servidor los movimientos que respaldan esas inscripciones y su estado.
     *
     * Se pide al PULSAR y no en cada cambio de selección: marcar catorce filas
     * serían catorce consultas para pintar un botón que quizá nadie use.
     */
    const resolverTraslado = useCallback(async () => {
        const ids = selected.map(r => r.id);
        if (!ids.length) return;
        setTransferBusy(true);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/transfers/resolve`), {
                method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ ids }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || `El servidor respondió ${res.status}.`);
            setTransferPlan(data);
            if (!data?.elegibles?.length) {
                // Un panel que sale sin nada que trasladar se lee como una
                // avería: el motivo va a la vista, no a un toast que se va.
                toast.message('Ninguna de las elegidas se puede trasladar todavía. El motivo está abajo.');
            }
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo resolver el traslado.');
        } finally {
            setTransferBusy(false);
        }
    }, [selected]);

    /** Marcar o desmarcar una fila. Guarda la fila entera (ver arriba). */
    const toggleRow = useCallback((row: Submission) => {
        setSelected(prev => (prev.some(r => r.id === row.id)
            ? prev.filter(r => r.id !== row.id)
            : [...prev, row]));
    }, []);

    /** «Todos los visibles»: sólo alcanza a la página que se está mirando, y
     *  por eso se dice así en la etiqueta — marcar en silencio filas que no
     *  se ven es cómo alguien elimina lo que no quería. */
    const toggleVisibles = useCallback(() => {
        const visiblesMarcados = rows.filter(r => selectedIds.has(r.id)).length;
        if (visiblesMarcados === rows.length) {
            const ids = new Set(rows.map(r => r.id));
            setSelected(prev => prev.filter(r => !ids.has(r.id)));
        } else {
            setSelected(prev => {
                const ya = new Set(prev.map(r => r.id));
                return [...prev, ...rows.filter(r => !ya.has(r.id))];
            });
        }
    }, [rows, selectedIds]);

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
                'FDD (USD)': s.fddRequestedUsd ?? null,
                'FAP (USD)': s.fapGoalUsd ?? null,
                'Comentarios del postulante': s.notes,
                'Estado de la postulación': stateLabel(s.workflowStatus, catalog?.workflowStates).label,
                'Estado del pago': stateLabel(s.paymentStatus, catalog?.paymentStates).label,
                'Valor anunciado COP': s.amountCop,
                'Valor cobrado USD': s.amountUsd,
                // v4.1313 — El valor ajustado a mano por el comité, y por qué.
                'Valor ajustado por el comité': s.amountOverride ? `Sí — ${s.amountOverride.reason || ''}`.trim() : '',
                'TRM aplicada': s.trmRate,
                Prioridad: s.priority,
                Etiquetas: s.tags.map(t => t.label).join(' | '),
                'Fecha de confirmación': fmtDateTime(s.paidAt),
                'Pago respaldado por': s.coveredBy?.publicRef || '',
                'Pagado por': s.paidByName || '',
                ...(access?.viewPayments ? { 'Referencia Stripe': s.stripePaymentIntentId, 'Checkout Session': s.stripeSessionId } : {}),
            }));
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(sheet);
            // v4.1304 — FDD y FAP son números (sirven para sumar y filtrar),
            // con formato de miles; una celda vacía es que el club no lo escribió.
            const cols = Object.keys(sheet[0] || {});
            const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
            for (const name of ['Presupuesto USD', 'FDD (USD)', 'FAP (USD)']) {
                const c = cols.indexOf(name);
                if (c < 0) continue;
                for (let r = 1; r <= range.e.r; r++) {
                    const cell = ws[XLSX.utils.encode_cell({ r, c })];
                    if (cell && cell.t === 'n') cell.z = '#,##0.##';
                }
            }
            XLSX.utils.book_append_sheet(wb, ws, 'Postulaciones');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
                { Columna: 'FDD (USD)', 'Descripción': 'Cantidad solicitada al Distrito del Fondo Distrital Designado para el periodo 2026-2027 (USD).', Fuente: 'Solicitud de Aportes del FDD 2026-2027 → Solicitud del FDD → «Cantidad solicitada al Distrito del FDD 2026-2027 (US$)».' },
                { Columna: 'FAP (USD)', 'Descripción': 'Meta de aportes al Fondo Anual de Programas para el periodo 2026-2027 (USD).', Fuente: 'Solicitud de Aportes del FDD 2026-2027 → Solicitud del FDD → «Meta de aportes al FAP 2026-2027 (US$)».' },
                { Columna: 'Celda vacía', 'Descripción': 'El club todavía no escribió ese valor en su formulario. Un 0 es un cero que el club escribió.', Fuente: '' },
            ]), 'Columnas');
            if (overview?.kpis) {
                const resumen = Object.entries(overview.kpis).map(([k, v]) => ({ Indicador: k, Valor: v as any }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
            }
            XLSX.writeFile(wb, 'postulaciones-feria-proyectos.xlsx');
        } catch {
            toast.error('No se pudo generar el Excel');
        }
    };

    // Informe ejecutivo de postulación (v4.1125): documento vectorial A4,
    // determinista, con la MISMA fuente del Centro de Inteligencia. No es una
    // captura de pantalla: se regenera con datos frescos del servidor para que
    // dashboard y PDF no discrepen por filtros o paginación de la vista.
    const exportPdf = async () => {
        if (pdfBusy) return;
        setPdfBusy(true);
        const done = toast.loading('Generando informe ejecutivo…');
        try {
            // 1) Inteligencia fresca con los filtros vigentes (misma query que el dashboard).
            // `logoData=1`: el servidor embebe el logo ya normalizado
            // (data URL) para que el PDF no dependa de CORS en el navegador.
            const qs = queryString();
            const intel = await getJson(withEvento(`${API}/project-fair/admin/inteligencia?${qs}${qs ? '&' : ''}logoData=1`));
            // 2) Alertas reales del módulo.
            let alertsData: any = null;
            try { alertsData = await getJson(withEvento(`${API}/project-fair/admin/alerts`)); } catch { alertsData = null; }
            // 3) Listado COMPLETO para la tabla detallada (el `rows` de la vista
            // está paginado y limitado a 30 en el PDF viejo).
            const all: any[] = [];
            let page = 1;
            for (;;) {
                const d = await getJson(withEvento(`${API}/project-fair/admin/postulaciones?${queryString({ page, pageSize: 200 })}`));
                all.push(...(d.submissions || []));
                const total = d?.pagination?.total || 0;
                if (all.length >= total || !(d.submissions || []).length || page >= 10) break;
                page += 1;
            }
            const today = new Date().toISOString().slice(0, 10);
            const { generateProjectFairReportPdf } = await import('../../lib/projectFairReportPdf');
            await generateProjectFairReportPdf({
                intelligence: intel,
                alerts: alertsData,
                submissions: all,
                catalog: { workflowStates: catalog?.workflowStates, paymentStates: catalog?.paymentStates },
                generatedAt: intel?.generatedAt || new Date().toISOString(),
            }, { fileName: `feria-proyectos-postulaciones-${today}.pdf` });
            toast.success(`Informe generado con ${all.length} postulación(es).`);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo generar el PDF');
        } finally {
            toast.dismiss(done);
            setPdfBusy(false);
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
            const { loadJsPdf } = await import('../../lib/executiveReportPdf');
            const JsPDF = await loadJsPdf();
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
            <Frame embedded={embedded}>
                <EdicionesList
                    // v4.1294 — La pestaña pedida en la URL (p. ej. la entrada
                    // «Video Pitch» del menú, `?tab=videopitch`) se CONSERVA al
                    // abrir la edición: borrarla mandaba siempre al Centro de
                    // Inteligencia y el enlace del menú parecía roto. Y si la
                    // URL ya pide una pestaña, la edición se abre sola cuando
                    // hay una única (o una única abierta).
                    autoOpen={Boolean(new URLSearchParams(window.location.search).get('tab'))}
                    onOpen={id => {
                        const url = new URL(window.location.href);
                        url.searchParams.set('evento', id);
                        window.location.assign(url.toString());
                    }} />
            </Frame>
        );
    }

    if (loading) {
        return <Frame embedded={embedded}><div className="flex h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" size={20} /> Cargando módulo…</div></Frame>;
    }
    if (!access?.view) {
        return <Frame embedded={embedded}><div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">Tu perfil no tiene acceso a este módulo.</div></Frame>;
    }

    const k = overview?.kpis || {};

    return (
        <Frame embedded={embedded}>
            {/* Mismo ancho que el listado de ediciones y que el módulo de
                Eventos: el panel ya pone su propio margen. Limitarlo aquí hacía
                que entrar a una edición se viera como un salto de ancho. */}
            <div className="space-y-5 pb-16">
                <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        {!embedded && (
                            <button
                                onClick={() => {
                                    const url = new URL(window.location.href);
                                    url.searchParams.delete('evento'); url.searchParams.delete('tab');
                                    window.location.assign(url.toString());
                                }}
                                className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition hover:text-slate-800"
                            ><ArrowLeft size={14} /> Todas las ediciones</button>
                        )}
                        {!embedded && <h1 className="text-2xl font-bold text-slate-900">Postulación de Proyectos</h1>}
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
                            <button onClick={exportPdf} disabled={pdfBusy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: BLUE }}>{pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {pdfBusy ? 'Generando informe…' : 'PDF'}</button>
                        </div>
                    )}
                </header>

                {loadError && (
                    <div className="flex flex-wrap items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        <span><strong>No se pudo cargar esta pestaña.</strong> {loadError}</span>
                    </div>
                )}

                {!embedded && <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
                    {/* «Reportes» desapareció en v4.689: mostraba los mismos
                        indicadores y gráficas que el Dashboard con otros
                        nombres. Todo vive ahora en el Centro de Inteligencia. */}
                    {([['dashboard', 'Centro de Inteligencia', BarChart3], ['submissions', 'Postulaciones', ClipboardList],
                       ['forms', 'Formulación', FileSignature],
                       ['alerts', 'Alertas', AlertTriangle],
                       ['config', 'Convocatoria', Settings],
                       ['resources', 'Recursos y plantillas', FileDown],
                       ['videopitch', 'Videos de proyectos', Clapperboard]] as const).map(([key, label, Icon]) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                                tab === key ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                            <Icon size={15} /> {label}
                            {key === 'alerts' && alerts?.total > 0 && (
                                <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-bold text-red-700">{alerts.total}</span>
                            )}
                        </button>
                    ))}
                </div>}

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

                        {/* ── v4.1253 — Participación vs. recaudo ──────
                            Dos preguntas distintas: cuántos clubes quieren
                            estar (aunque no hayan pagado) y cuánto se ha
                            cobrado y queda por cobrar. Lo pendiente cuenta
                            SÓLO postulaciones enviadas, no retiradas ni
                            rechazadas: un borrador no es deuda. */}
                        {overview?.participation && (
                            <section>
                                <BlockTitle icon={Users}>Participación y recaudo</BlockTitle>
                                <p className="-mt-1 mb-3 text-xs text-slate-500">La participación no depende del pago: un club puede postular hoy y pagar después.</p>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <Kpi label="Clubes inscritos" value={fmtNum(overview.participation.registrations ?? overview.participation.clubs)} sub={`${fmtNum(overview.participation.clubs)} clubes distintos`} icon={Building2} tone="blue" />
                                    <Kpi label="Proyectos inscritos" value={fmtNum(overview.participation.activeProjects ?? overview.participation.applied)} sub="Un club puede aportar dos" icon={Layers} tone="indigo" />
                                    <Kpi label="Usuarios registrados" value={fmtNum(overview.participation.registeredUsers)} icon={Users} tone="indigo" />
                                    <Kpi label="Proyectos en borrador" value={fmtNum(overview.participation.drafts)} icon={FileText} tone="slate" />
                                    <Kpi label="Proyectos postulados" value={fmtNum(overview.participation.applied)} sub={`${fmtNum(overview.participation.approved)} aprobados`} icon={ClipboardList} tone="blue" />
                                    <Kpi label="Inscripciones confirmadas" value={fmtNum(overview.participation.paid)} sub="Proyectos con el pago validado" icon={CheckCircle2} tone="emerald" />
                                    <Kpi label="Pendientes de pago" value={fmtNum(overview.participation.owing)} sub="Información completa, sin pago confirmado" icon={Clock} tone="amber" />
                                    <Kpi label="Valor recaudado" value={overview.participation.priceMode === 'USD' ? fmtUsd(overview.participation.collectedAmount) : fmtCop(overview.participation.collectedAmount)} sub="Valor de inscripción, sin cargos" icon={Wallet} tone="emerald" />
                                    <Kpi label="Valor pendiente de recaudo" value={overview.participation.priceMode === 'USD' ? fmtUsd(overview.participation.pendingAmount) : fmtCop(overview.participation.pendingAmount)} sub="Sólo obligaciones válidas" icon={AlertTriangle} tone="orange" />
                                </div>
                                {/* v4.1299 — SEGUNDOS PROYECTOS. Mide si la tarifa especial
                                    está trayendo proyectos adicionales: cuántos clubes
                                    inscribieron dos, cuántos segundos proyectos hay y
                                    cuánto recaudo viene de cada posición. */}
                                {overview.participation.registrations != null && (
                                    <>
                                        <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Modalidad de dos proyectos</p>
                                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                            <Kpi label="Clubes con un proyecto" value={fmtNum(overview.participation.withOneProject)} icon={Building2} tone="slate" />
                                            <Kpi label="Clubes con dos proyectos" value={fmtNum(overview.participation.withTwoProjects)} sub={`${fmtNum(overview.participation.withTwoProjectsPaid)} con los dos pagados`} icon={Layers} tone="blue" />
                                            <Kpi label="Segundos proyectos inscritos" value={fmtNum(overview.participation.secondProjects)} sub={`${fmtNum(overview.participation.secondProjectsPaid)} pagados · ${fmtNum(overview.participation.secondProjectsOwing)} pendientes`} icon={PlusCircle} tone="emerald" />
                                            <Kpi label="Recaudo por segundos proyectos" value={overview.participation.priceMode === 'USD' ? fmtUsd(overview.participation.collectedSecond) : fmtCop(overview.participation.collectedSecond)} sub={`Primeras postulaciones: ${overview.participation.priceMode === 'USD' ? fmtUsd(overview.participation.collectedFirst) : fmtCop(overview.participation.collectedFirst)}`} icon={Wallet} tone="emerald" />
                                        </div>
                                        {/* v4.1301 — AMPLIACIONES POSTERIORES: segundos proyectos agregados
                                            desde «Mi proyecto» por clubes que ya tenían uno. Mide si la
                                            tarifa complementaria está activando a los clubes existentes. */}
                                        {overview.participation.extensions != null && (
                                            <>
                                                <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Ampliaciones desde «Mi proyecto» (clubes que ya tenían un proyecto)</p>
                                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                    <Kpi label="Segundos proyectos iniciados" value={fmtNum(overview.participation.extensions)} sub={`${fmtNum(overview.participation.extensionsDraft)} todavía en borrador`} icon={PlusCircle} tone="slate" />
                                                    <Kpi label="Ampliaciones pendientes de pago" value={fmtNum(overview.participation.extensionsOwing)} sub="Postuladas sin el pago complementario" icon={Clock} tone="amber" />
                                                    <Kpi label="Ampliaciones confirmadas" value={fmtNum(overview.participation.extensionsPaid)} sub="Pago complementario validado" icon={CheckCircle2} tone="emerald" />
                                                    <Kpi label="Recaudo por ampliaciones" value={overview.participation.priceMode === 'USD' ? fmtUsd(overview.participation.collectedExtensions) : fmtCop(overview.participation.collectedExtensions)} sub="Sólo pagos complementarios" icon={Wallet} tone="emerald" />
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </section>
                        )}

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
                            {/* Lo archivado no se ve por defecto; desde acá se
                                mira y se restaura. Sin esta salida, archivar
                                sería un borrado con otro nombre. */}
                            <select
                                value={filters.archivadas}
                                onChange={e => { setFilters(f => ({ ...f, archivadas: e.target.value })); setSelected([]); setTransferPlan(null); reloadNext(); }}
                                aria-label="Ver postulaciones archivadas"
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
                                {ARCHIVE_VIEWS.map(v => <option key={v} value={v}>{ARCHIVE_VIEW_LABELS[v]}</option>)}
                            </select>
                            {puedeBloque && (
                                <button
                                    onClick={() => { setSelectMode(v => !v); setSelected([]); setBulkResult(null); setTransferPlan(null); }}
                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold ${selectMode ? 'border-transparent text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                                    style={selectMode ? { background: BLUE } : undefined}>
                                    {selectMode ? <CheckSquare size={14} /> : <Square size={14} />}
                                    {selectMode ? 'Salir de selección' : 'Seleccionar'}
                                </button>
                            )}
                        </div>

                        {/* ── v4.1253 — Participación y recaudo ──────────────
                            Vistas de un clic para separar a quien quiere
                            participar de quien ya pagó: postulados, borradores,
                            pago pendiente… y desde la de pago pendiente, los
                            recordatorios. */}
                        {(catalog?.views || []).length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                {[{ key: 'all', label: 'Todas' }, ...(catalog?.views || [])].map((v: { key: string; label: string }) => (
                                    <button key={v.key}
                                        onClick={() => { setFilters(f => ({ ...f, vista: v.key })); setSelected([]); setTransferPlan(null); }}
                                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${filters.vista === v.key ? 'text-white ring-transparent' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'}`}
                                        style={filters.vista === v.key ? { background: BLUE } : undefined}>
                                        {v.label}
                                    </button>
                                ))}
                                {access.managePayments && (
                                    <button onClick={sendReminders} disabled={reminderBusy}
                                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                                        title="Correo «Tu proyecto ya está postulado — Completa el pago de inscripción cuando estés listo». Con tope: no se repite antes de 7 días ni más de 3 veces.">
                                        {reminderBusy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                                        {selectMode && selected.length ? `Recordar pago a ${selected.length} seleccionada${selected.length === 1 ? '' : 's'}` : 'Recordatorios de pago'}
                                    </button>
                                )}
                            </div>
                        )}
                        {reminderMsg && (
                            <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${reminderMsg.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                                <span className="whitespace-pre-line">{reminderMsg.text}</span>
                                <button onClick={() => setReminderMsg(null)} className="ml-auto text-xs font-bold opacity-60 hover:opacity-100">Cerrar</button>
                            </div>
                        )}

                        {showFilters && (
                            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
                                {[
                                    ['workflowStatus', 'Estado del proyecto', elegibles(catalog?.workflowStates).map((s: StateDef) => ({ value: s.key, label: s.label }))],
                                    ['paymentStatus', 'Estado del pago', catalog?.paymentStates?.map((s: StateDef) => ({ value: s.key, label: s.label }))],
                                    ['district', 'Distrito', (catalog?.districts || []).map((d: string) => ({ value: d, label: d }))],
                                    ['focusArea', 'Área de enfoque', (catalog?.focusAreas || []).map((a: any) => ({ value: a.key, label: a.label }))],
                                    ['priority', 'Prioridad', catalog?.priorities?.map((p: StateDef) => ({ value: p.key, label: p.label }))],
                                    // v4.1299 — Un club puede aportar dos proyectos.
                                    ['proyectos', 'Proyectos del club', [{ value: '1', label: 'Clubes con un proyecto' }, { value: '2', label: 'Clubes con dos proyectos' }]],
                                    ['indice', 'Posición en la inscripción', [{ value: '1', label: 'Primer proyecto' }, { value: '2', label: 'Segundo proyecto (tarifa especial)' }]],
                                    ['origen', 'Origen del segundo proyecto', [{ value: 'inicial', label: 'Inscripción inicial de dos proyectos' }, { value: 'ampliacion', label: 'Ampliación posterior desde «Mi proyecto»' }]],
                                    // v4.1330 — Qué proyectos se editaron después del cierre.
                                    ['actualizaciones', 'Actualizaciones posteriores al cierre', (catalog?.postCloseViews || []).map((o: { key: string; label: string }) => ({ value: o.key, label: o.label }))],
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
                                {([['fddMin', 'FDD mín. (USD)'], ['fddMax', 'FDD máx. (USD)'], ['fapMin', 'Meta FAP mín. (USD)'], ['fapMax', 'Meta FAP máx. (USD)']] as const).map(([key, label]) => (
                                    <label key={key} className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
                                        <input type="number" min="0" value={filters[key]} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                                ))}
                                <div className="flex items-end gap-2">
                                    <button onClick={() => loadRows(1)} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>Aplicar</button>
                                    <button onClick={() => { setFilters({ search: '', paymentStatus: 'all', workflowStatus: 'all', district: 'all', focusArea: 'all', priority: 'all', tagId: '', from: '', to: '', budgetMin: '', budgetMax: '', fddMin: '', fddMax: '', fapMin: '', fapMax: '', vista: 'all', proyectos: 'all', indice: 'all', origen: 'all', actualizaciones: 'all', archivadas: 'activas' }); reloadNext(); }}
                                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Limpiar</button>
                                </div>
                            </div>
                        )}

                        {/* ── Barra de acciones sobre la selección ──────────────
                            Aparece sólo con algo marcado: una barra vacía
                            ocupa sitio y no informa de nada. */}
                        {selectMode && selected.length > 0 && (
                            <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 shadow-sm">
                                <span className="text-sm font-semibold text-slate-800">
                                    {selected.length} seleccionada{selected.length === 1 ? '' : 's'}
                                </span>
                                {fueraDeVista > 0 && (
                                    <span className="text-xs text-amber-700">
                                        · {fueraDeVista} fuera de esta página
                                    </span>
                                )}
                                <span className="mx-1 h-4 w-px bg-sky-200" />
                                {access?.remove && (
                                    <>
                                        <button onClick={() => { setBulkResult(null); setBulkAction('archive'); }}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                            <Archive size={13} /> Archivar
                                        </button>
                                        <button onClick={() => { setBulkResult(null); setBulkAction('restore'); }}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                            <ArchiveRestore size={13} /> Restaurar
                                        </button>
                                        <button onClick={() => { setBulkResult(null); setBulkAction('delete'); }}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">
                                            <Trash2 size={13} /> Eliminar
                                        </button>
                                    </>
                                )}
                                {access?.changeStatus && (
                                    <button onClick={() => { setBulkResult(null); setBulkStatusTo(''); setBulkAction('status'); }}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                        <ClipboardList size={13} /> Cambiar estado
                                    </button>
                                )}
                                {access?.manageTags && tags.length > 0 && (
                                    <button onClick={() => { setBulkResult(null); setBulkTagId(tags[0]?.id || ''); setBulkTagRemove(false); setBulkAction('tag'); }}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                        <TagIcon size={13} /> Etiquetar
                                    </button>
                                )}
                                {/* v4.1026 — Registrar el traslado de lo cobrado.
                                    Se ofrece a quien maneja pagos (`admin` y
                                    `finance`): un `reviewer` mueve estados y no
                                    dinero. El gate real está en el servidor —
                                    esconder un control no protege un endpoint
                                    de quien lo conoce (v4.868). */}
                                {access?.managePayments && (
                                    <button onClick={() => { setBulkResult(null); setTransferPlan(null); resolverTraslado(); }}
                                        disabled={transferBusy}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                                        {transferBusy ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />}
                                        Registrar traslado
                                    </button>
                                )}
                                {/* v4.1324 — Fichas PDF en lote y traducción secuencial. */}
                                {(access?.export || access?.translate) && (
                                    <button onClick={() => setShowLote(true)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50">
                                        <FolderOpen size={13} /> Fichas y traducción
                                    </button>
                                )}
                                <button onClick={() => { setSelected([]); setTransferPlan(null); }} className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-800">
                                    Limpiar selección
                                </button>
                            </div>
                        )}

                        {/* ── El traslado de lo cobrado ────────────────────────
                            v4.1026 — Lo que el SERVIDOR resolvió: qué entra,
                            qué no y por qué. La barra de abajo es la MISMA de
                            la Bóveda y registra contra el MISMO endpoint. */}
                        {transferPlan && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                                <div className="mb-3 flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">Traslado de lo cobrado</p>
                                        <p className="mt-0.5 text-xs text-slate-600">
                                            {transferPlan.elegibles?.length
                                                ? <>Se van a registrar <strong data-no-translate>{transferPlan.elegibles.length}</strong> inscripción(es) por{' '}
                                                    {Object.entries(transferPlan.porMoneda || {}).map(([c, v]: any) => (
                                                        <strong key={c} data-no-translate>{Number(v).toLocaleString('es-CO', { maximumFractionDigits: c === 'COP' ? 0 : 2 })} {c} </strong>
                                                    ))}
                                                    — un giro agrupado, con su comprobante y una notificación consolidada.</>
                                                : 'Ninguna de las elegidas se puede trasladar todavía.'}
                                        </p>
                                    </div>
                                    <button onClick={() => setTransferPlan(null)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                                </div>

                                {/* Los avisos NO bloquean y se DICEN: un cobro
                                    reconstruido nace sin fecha de liberación del
                                    proveedor, así que su estado es una suposición
                                    prudente y quien gira tiene que saberlo. */}
                                {(transferPlan.avisos || []).map((a: string, i: number) => (
                                    <p key={i} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{a}</p>
                                ))}

                                {/* Lo que queda fuera, agrupado por motivo y CON
                                    SU SALIDA: un bloqueo cuya única respuesta es
                                    «no se puede» se lee como una avería. */}
                                {(transferPlan.motivos || []).length > 0 && (
                                    <ul className="mb-3 space-y-2">
                                        {transferPlan.motivos.map((m: any) => (
                                            <li key={m.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                                                <p className="font-semibold text-slate-700">
                                                    <span data-no-translate>{m.cuantos}</span> fuera — {m.motivo}
                                                </p>
                                                {m.salida && <p className="mt-0.5 text-slate-500">{m.salida}</p>}
                                                {m.donde === 'boveda' && (
                                                    <a href="/admin/boveda" className="mt-1 inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">
                                                        Abrir la Bóveda de Fondos <ArrowRight size={11} />
                                                    </a>
                                                )}
                                                {m.ejemplos?.length > 0 && (
                                                    <p className="mt-1 text-slate-400" data-no-translate>{m.ejemplos.join(' · ')}{m.cuantos > m.ejemplos.length ? ' …' : ''}</p>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <BulkDisbursementBar
                                    elegidos={(transferPlan.elegibles || []) as Elegible[]}
                                    clubId={transferPlan.clubId || undefined}
                                    onLimpiar={() => setTransferPlan(null)}
                                    onHecho={() => { setTransferPlan(null); setSelected([]); loadRows(pagination.page); }}
                                    onRecargar={() => loadRows(pagination.page)}
                                />
                            </div>
                        )}

                        {/* ── El desglose de lo que ocurrió ─────────────────────
                            El bloque no es atómico: cada fila trae su
                            desenlace y su motivo, y se enseñan todos. «Se
                            eliminaron 5» habiendo tocado 3 es el defecto que
                            este desglose existe para no tener. */}
                        {bulkResult && (
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="mb-2 flex items-start justify-between gap-3">
                                    <p className="text-sm font-semibold text-slate-800">{bulkResult.summary}</p>
                                    <button onClick={() => setBulkResult(null)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                                </div>
                                <ul className="max-h-52 space-y-1 overflow-y-auto text-xs">
                                    {(bulkResult.outcomes || []).map((o: any, i: number) => (
                                        <li key={`${o.id || i}`} className="flex flex-wrap items-baseline gap-2 border-b border-slate-50 py-1 last:border-0">
                                            <span className="font-mono text-slate-500">{o.label || o.id}</span>
                                            <span className={`font-semibold ${o.outcome === 'error' ? 'text-red-600' : o.outcome === 'eliminada' ? 'text-slate-800' : 'text-slate-600'}`}>
                                                {OUTCOME_LABELS[o.outcome] || o.outcome}
                                            </span>
                                            {o.reason && <span className="text-slate-500">— {REASON_LABELS[o.reason] || o.reason}</span>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* ── Confirmación ─────────────────────────────────────
                            DICE lo que va a pasar —cuántas se eliminan,
                            cuántas se archivan y por qué— en vez de preguntar
                            «¿estás seguro?»: lo que hay que poder revisar es
                            el hecho (criterio de los desembolsos, v4.885). */}
                        {bulkAction && bulkPlan && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
                                <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                                    <h3 className="text-lg font-bold text-slate-900">
                                        {bulkAction === 'delete' ? 'Eliminar postulaciones'
                                            : bulkAction === 'archive' ? 'Archivar postulaciones'
                                            : bulkAction === 'restore' ? 'Restaurar postulaciones'
                                            : bulkAction === 'status' ? 'Cambiar el estado' : 'Etiquetar'}
                                    </h3>
                                    <p className="mt-1 text-sm text-slate-600">{describeBulkPlan(bulkPlan)}</p>

                                    {bulkWarnings(bulkPlan).map((aviso, i) => (
                                        <p key={i} className={`mt-2 rounded-lg px-3 py-2 text-xs ${i === 0 && bulkPlan.totals.eliminada ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
                                            {aviso}
                                        </p>
                                    ))}

                                    {bulkAction === 'status' && (
                                        <label className="mt-3 block">
                                            <span className="mb-1 block text-xs font-semibold text-slate-600">Estado nuevo</span>
                                            <select value={bulkStatusTo} onChange={e => setBulkStatusTo(e.target.value)}
                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                                <option value="">Elegí un estado…</option>
                                                {elegibles(catalog?.workflowStates).map((st: StateDef) => (
                                                    <option key={st.key} value={st.key}>{st.label}</option>
                                                ))}
                                            </select>
                                        </label>
                                    )}

                                    {bulkAction === 'tag' && (
                                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                            <label className="block">
                                                <span className="mb-1 block text-xs font-semibold text-slate-600">Etiqueta</span>
                                                <select value={bulkTagId} onChange={e => setBulkTagId(e.target.value)}
                                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                                    {tags.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                </select>
                                            </label>
                                            <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                                                <input type="checkbox" checked={bulkTagRemove} onChange={e => setBulkTagRemove(e.target.checked)}
                                                    className="h-4 w-4 rounded border-slate-300" />
                                                Quitarla en vez de ponerla
                                            </label>
                                        </div>
                                    )}

                                    <label className="mt-3 block">
                                        <span className="mb-1 block text-xs font-semibold text-slate-600">
                                            Motivo {bulkAction === 'status' ? '(obligatorio — queda en el historial de cada una)' : '(opcional, queda en el historial)'}
                                        </span>
                                        <textarea value={bulkReason} onChange={e => setBulkReason(e.target.value)} rows={2}
                                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                            placeholder="Ej.: registros de prueba de la puesta en marcha" />
                                    </label>

                                    <details className="mt-3">
                                        <summary className="cursor-pointer text-xs font-semibold text-slate-500">Ver las {bulkPlan.count} seleccionadas</summary>
                                        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                                            {bulkPlan.items.map(it => (
                                                <li key={it.id} className="flex flex-wrap items-baseline gap-2">
                                                    <span className="font-mono">{it.label}</span>
                                                    <span className="text-slate-400">→ {OUTCOME_LABELS[it.outcome]}</span>
                                                    {it.reason && <span className="text-slate-400">({REASON_LABELS[it.reason] || it.reason})</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>

                                    <div className="mt-4 flex justify-end gap-2">
                                        <button onClick={() => { setBulkAction(null); setBulkReason(''); }}
                                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancelar</button>
                                        <button
                                            disabled={bulkBusy
                                                || (bulkAction === 'status' && (!bulkStatusTo || !bulkReason.trim()))
                                                || (bulkAction === 'tag' && !bulkTagId)
                                                || bulkPlan.count > BULK_MAX}
                                            onClick={() => runBulk(bulkAction)}
                                            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                            style={{ background: bulkPlan.totals.eliminada ? '#B91C1C' : BLUE }}>
                                            {bulkBusy && <Loader2 size={14} className="animate-spin" />}
                                            {bulkPlan.totals.eliminada
                                                ? `Eliminar ${bulkPlan.totals.eliminada}${bulkPlan.totals.archivada ? ` y archivar ${bulkPlan.totals.archivada}` : ''}`
                                                : 'Confirmar'}
                                        </button>
                                    </div>
                                    {bulkPlan.count > BULK_MAX && (
                                        <p className="mt-2 text-xs text-red-700">Máximo {BULK_MAX} por acción: quitá algunas de la selección.</p>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full min-w-[1380px] text-sm">
                                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                                    <tr>
                                        {selectMode && (
                                            <th className="w-10 px-3 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={rows.length > 0 && rows.every(r => selectedIds.has(r.id))}
                                                    onChange={toggleVisibles}
                                                    aria-label="Seleccionar las postulaciones de esta página"
                                                    className="h-4 w-4 cursor-pointer rounded border-slate-300" />
                                            </th>
                                        )}
                                        {/* v4.1304 — FDD y FAP entre Presupuesto y Estado, con su
                                            significado en una ayuda accesible (los títulos quedan cortos). */}
                                        {([['publicRef', 'Registro'], ['createdAt', 'Inscripción'], ['projectName', 'Proyecto'],
                                           ['clubName', 'Club / Distrito'], ['', 'Responsable'], ['', 'Área de enfoque'],
                                           ['budgetUsd', 'Presupuesto'], ['fddRequestedUsd', 'FDD'], ['fapGoalUsd', 'FAP'],
                                           ['workflowStatus', 'Estado'], ['paymentStatus', 'Pago'],
                                           ['amountCop', 'Valor'], ['', '']] as const).map(([sortKey, label], i) => (
                                            <SortHeader key={i} sortKey={sortKey} label={label}
                                                help={sortKey === 'fddRequestedUsd' || sortKey === 'fapGoalUsd' ? FDD_HELP[sortKey] : undefined}
                                                align={sortKey === 'budgetUsd' || sortKey === 'fddRequestedUsd' || sortKey === 'fapGoalUsd' ? 'right' : 'left'}
                                                active={!!sortKey && sort.sortBy === sortKey} dir={sort.sortDir}
                                                onSort={(key) => { setSort(s => ({ sortBy: key, sortDir: s.sortBy === key && s.sortDir === 'desc' ? 'asc' : 'desc' })); reloadNext(); }} />
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rows.map(s => {
                                        const wf = stateLabel(s.workflowStatus, catalog?.workflowStates);
                                        const pay = stateLabel(s.paymentStatus, catalog?.paymentStates);
                                        return (
                                            <tr key={s.id} className={`hover:bg-slate-50 ${selectedIds.has(s.id) ? 'bg-sky-50/60' : ''}`}>
                                                {selectMode && (
                                                    <td className="px-3 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.has(s.id)}
                                                            onChange={() => toggleRow(s)}
                                                            /* El NOMBRE va en la etiqueta: con la tabla llena,
                                                               «Seleccionar» a secas se repite en cada fila y no
                                                               se distinguen (regla v4.740). */
                                                            aria-label={`Seleccionar ${s.publicRef} · ${s.projectName}`}
                                                            className="h-4 w-4 cursor-pointer rounded border-slate-300" />
                                                    </td>
                                                )}
                                                <td className="px-3 py-3 font-mono text-xs font-bold text-slate-700">
                                                    {s.publicRef}
                                                    {isArchived(s) && (
                                                        <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                            <Archive size={10} /> Archivada
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{fmtDate(s.createdAt)}</td>
                                                <td className="px-3 py-3">
                                                    <p className="font-semibold text-slate-900">{s.projectName}</p>
                                                    {/* v4.1299 — Posición dentro de la inscripción del club. */}
                                                    {(s.registrationProjects || 1) > 1 || (s.projectIndex || 1) > 1 ? (
                                                        <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${(s.projectIndex || 1) > 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>
                                                            <Layers size={10} /> Proyecto {s.projectIndex || 1} de {Math.max(s.registrationProjects || 1, s.projectIndex || 1)}{(s.projectIndex || 1) > 1 ? (s.isExtension ? ' · ampliación' : ' · tarifa especial') : ''}
                                                        </span>
                                                    ) : null}
                                                    <PostCloseBadges s={s} />
                                                    {s.tags.length > 0 && (
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {s.tags.map(t => <Badge key={t.id} color={t.color}>{t.label}</Badge>)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3"><p className="text-slate-800">{s.clubName}</p><p className="text-xs text-slate-500">{s.district}</p></td>
                                                <td className="px-3 py-3"><p className="text-slate-800">{s.responsable}</p><p className="text-xs text-slate-500">{s.email}</p><p className="text-xs text-slate-500">{s.phone}</p></td>
                                                <td className="px-3 py-3 text-xs text-slate-600">{s.focusAreaLabel || s.focusArea}</td>
                                                <AmountCell value={s.budgetUsd} label="Presupuesto" />
                                                <AmountCell value={s.fddRequestedUsd} reading={s.fddRequestedReading} raw={s.fddRequestedRaw} label="FDD" />
                                                <AmountCell value={s.fapGoalUsd} reading={s.fapGoalReading} raw={s.fapGoalRaw} label="FAP" />
                                                <td className="px-3 py-3"><Badge color={wf.color}>{wf.label}</Badge></td>
                                                <td className="px-3 py-3">
                                                    <Badge color={pay.color}>{pay.label}</Badge>
                                                    {/* v4.1311 — El pago vive en otra ficha (sustitución o inscripción conjunta) y quién lo hizo. */}
                                                    {s.coveredBy && <p className="mt-1 text-[11px] text-slate-500">Respaldado por {s.coveredBy.publicRef || 'otro proyecto'}</p>}
                                                    {s.paidByName && <p className="text-[11px] text-slate-500">Pagó: {s.paidByName}</p>}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-3 text-right">
                                                    <p className="font-semibold text-slate-800">{amountLabel(s)}</p>
                                                    {s.amountOverride && <p className="text-[11px] font-semibold text-violet-700" title={s.amountOverride.reason || undefined}>Valor ajustado</p>}
                                                    {s.paidAt && <p className="text-[11px] text-slate-400">{fmtDate(s.paidAt)}</p>}
                                                </td>
                                                <td className="px-3 py-3">
                                                    {/* v4.1324 — «Ver» abre el EXPEDIENTE integral; «⋯» da accesos directos. */}
                                                    <div className="flex items-center gap-1.5">
                                                        <button onClick={() => { setDetailOpen(null); setDetailId(s.id); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                                                            <Eye size={13} /> Ver
                                                        </button>
                                                        <ExpedienteAccionesMenu submissionId={s.id} label={s.projectName || s.publicRef} eventId={currentEventId()} access={access || {}}
                                                            onOpen={req => { setDetailOpen(req); setDetailId(s.id); }} />
                                                    </div>
                                                    {docStates[s.id] && docStates[s.id].state !== 'not_started' && (
                                                        <span title="Estado de la traducción al inglés" className={`mt-1 inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${TRANSLATION_META[docStates[s.id].state]?.cls || ''}`}>
                                                            EN · {TRANSLATION_META[docStates[s.id].state]?.label || docStates[s.id].label}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!rows.length && !tableLoading && (
                                        <tr><td colSpan={selectMode ? 14 : 13} className="px-4 py-12 text-center text-slate-400">No hay postulaciones que coincidan con los filtros.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                            <span>{fmtNum(pagination.total)} postulaciones · página {pagination.page} de {pagination.pages}</span>
                            <div className="flex items-center gap-2">
                                <select value={pagination.pageSize}
                                    onChange={e => { const size = Number(e.target.value); setPagination(p => ({ ...p, pageSize: size })); reloadNext(); }}
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
                                                {f.reopenedAt && !f.lockedAt && <span className="ml-1"><Badge color="sky">Edición autorizada</Badge></span>}
                                                {/* v4.1330 — El club pidió autorización para editar después del cierre. */}
                                                {f.editRequest && (
                                                    <span className="mt-1 block text-[11px] font-semibold text-violet-700" title={f.editRequest.note || undefined}>
                                                        Pide autorización para editar · {fmtDate(f.editRequest.at)}
                                                    </span>
                                                )}
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

                {/* ── Recursos y plantillas (v4.1264) ──────────────────── */}
                {tab === 'resources' && <RecursosPlantillas eventId={eventId} />}

                {/* ── Video Pitch Profesional (v4.1293) ─────────────────── */}
                {tab === 'videopitch' && <ProjectVideosHub eventId={eventId} />}

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

            {showLote && selected.length > 0 && (
                <ExpedientesLote rows={selected.map(r => ({ id: r.id, publicRef: r.publicRef, projectName: r.projectName }))} eventId={currentEventId()}
                    access={access || {}} onClose={() => setShowLote(false)}
                    onChanged={() => setDocTick(t => t + 1)} />
            )}

            {detailId && (
                <SubmissionDetail
                    key={`${detailId}-${detailOpen?.pane || 'datos'}`}
                    id={detailId}
                    openRequest={detailOpen}
                    access={access}
                    catalog={catalog}
                    tags={tags}
                    onClose={() => { setDetailId(null); setDetailOpen(null); setDocTick(t => t + 1); }}
                    onChanged={() => {
                        loadRows(pagination.page); loadOverview();
                        // v4.1308 — «N en el sistema · M pagadas» también: una
                        // confirmación de pago tiene que verse en el conteo sin recargar.
                        fetch(withEvento(`${API}/project-fair/admin/catalog`), { headers: authHeaders() })
                            .then(r => r.json()).then(cat => { if (cat && !cat.error) setCatalog(cat); }).catch(() => {});
                    }}
                />
            )}
        </Frame>
    );
};

// ════════════════════════════════════════════════════════════════════
// v4.1330 — Edición de proyectos después del cierre
// ════════════════════════════════════════════════════════════════════
interface PostCloseEdit {
    firstAt?: string; lastAt?: string; pendingReview?: boolean; sensitive?: boolean;
    forms?: string[]; changes?: number; reviewedAt?: string | null; reviewedBy?: string | null;
}
const POST_CLOSE_FORM_LABEL: Record<string, string> = { master: 'Formulación', fdd_2026_2027: 'Solicitud FDD' };

/** Distintivos de la fila: actualizado después del cierre, pendiente, solicitud. */
const PostCloseBadges = ({ s }: { s: Submission }) => {
    const pc = s.postCloseEdit;
    const pedidos = s.editRequests ? Object.keys(s.editRequests).length : 0;
    if (!pc && !pedidos) return null;
    return (
        <div className="mt-1 flex flex-wrap gap-1">
            {pc && (pc.pendingReview
                ? <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${pc.sensitive ? 'bg-amber-100 text-amber-800' : 'bg-sky-50 text-sky-800'}`} title={pc.lastAt ? `Último cambio: ${fmtDateTime(pc.lastAt)}` : undefined}>
                    <PenLine size={10} /> Cambios pendientes de revisión{pc.sensitive ? ' · sensibles' : ''}
                </span>
                : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600" title={pc.reviewedAt ? `Revisado el ${fmtDateTime(pc.reviewedAt)}` : undefined}>
                    <PenLine size={10} /> Actualizado después de la postulación
                </span>)}
            {pedidos > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                    <Unlock size={10} /> Pide autorización para editar
                </span>
            )}
        </div>
    );
};

/** Aviso de la ficha: qué cambió el club después del cierre y qué pidió. */
const PostCloseNotice = ({ s, canReview, onGo, onReviewed }: { s: Submission; canReview: boolean; onGo: () => void; onReviewed: () => void }) => {
    const [busy, setBusy] = useState(false);
    const pc = s.postCloseEdit;
    const pedidos = s.editRequests ? Object.entries(s.editRequests) : [];
    if (!pc && !pedidos.length) return null;
    const markReviewed = async () => {
        setBusy(true);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${s.id}/post-close/reviewed`), { method: 'POST', headers: jsonHeaders(), body: '{}' });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d?.error || 'No se pudo marcar como revisado.');
            toast.success('Cambios marcados como revisados');
            onReviewed();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo marcar como revisado.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-2">
            {pc && (
                <div className={`rounded-xl border px-4 py-3 text-sm ${pc.pendingReview ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                    <p className="flex items-center gap-2 font-semibold"><PenLine size={15} /> Este proyecto fue modificado después del cierre de postulaciones.</p>
                    <p className="mt-1 text-xs">
                        {pc.firstAt ? `Primer cambio: ${fmtDateTime(pc.firstAt)}` : ''}{pc.lastAt ? ` · Último: ${fmtDateTime(pc.lastAt)}` : ''}
                        {pc.forms?.length ? ` · ${pc.forms.map(f => POST_CLOSE_FORM_LABEL[f] || f).join(', ')}` : ''}
                        {pc.sensitive && pc.pendingReview ? ' · incluye datos sensibles (presupuesto, montos, club o contactos)' : ''}
                    </p>
                    <p className="mt-1 text-xs">
                        {pc.pendingReview ? 'Cambios pendientes de revisión.' : `Revisado${pc.reviewedBy ? ` por ${pc.reviewedBy}` : ''}${pc.reviewedAt ? ` el ${fmtDateTime(pc.reviewedAt)}` : ''}.`}
                        {' '}La fecha de postulación, el estado y el pago no cambian por estas ediciones.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button onClick={onGo} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            <History size={13} /> Ver cambios en el historial
                        </button>
                        {canReview && pc.pendingReview && (
                            <button onClick={markReviewed} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Marcar cambios como revisados
                            </button>
                        )}
                    </div>
                </div>
            )}
            {pedidos.length > 0 && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
                    <p className="flex items-center gap-2 font-semibold"><Unlock size={15} /> El club pidió autorización para editar después del cierre.</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                        {pedidos.map(([k, r]) => (
                            <li key={k}><strong>{POST_CLOSE_FORM_LABEL[k] || k}</strong> · {fmtDateTime(r.at)}{r.note ? ` — «${r.note}»` : ''}</li>
                        ))}
                    </ul>
                    <p className="mt-1 text-xs text-violet-900/80">Para autorizarla, usa «Reabrir edición» en la pestaña Formularios (o «Cerrar edición» para denegarla).</p>
                </div>
            )}
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════
// Ficha detallada
// ════════════════════════════════════════════════════════════════════
const SubmissionDetail = ({ id, access, catalog, tags, onClose: closeRaw, onChanged, openRequest }: any) => {
    const [data, setData] = useState<{ submission: Submission; events: TimelineEvent[]; files: FairFile[]; stripeEvents: any[]; registrationSummary?: {
        id: string | null; modality: string; count: number; origin: string; originLabel: string; secondProjectCreatedAt: string | null; currency: string;
        lines: { submissionId: string; projectIndex: number; projectName: string; label: string; amount: number; paid: boolean; owes: boolean }[];
        total: number; paidTotal: number; pendingTotal: number;
        payments: { anchorId: string; publicRef: string; projectIndex: number; paidAt: string | null; amountReceived: number | null; currency: string | null; origin: string; kind: 'original' | 'complementary'; covers: string[]; paymentIntentId?: string | null; receiptUrl?: string | null }[];
    } | null; siblings?: { id: string; publicRef: string; projectName: string; projectIndex: number; projectIndexLabel: string; paymentStatus: string; projectStateLabel: string; archived: boolean; withdrawnByClub: boolean; amountCop: number | null; amountUsd: number | null }[]; pricing?: FairPricing } | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [comment, setComment] = useState('');
    const [reason, setReason] = useState('');
    // v4.1324 — La ficha ES el expediente integral: además de Datos, Pago e
    // Historial, el formulario completo, documentos, traducción, fichas PDF y
    // libreta. Abre en la pestaña que pidió el menú «⋯» de la tabla.
    const [pane, setPaneRaw] = useState<ExpedientePane>((openRequest?.pane as ExpedientePane) || 'datos');
    const [showManualModal, setShowManualModal] = useState(false);
    // v4.1311 — La sustitución por otro proyecto del club.
    const [showSustituir, setShowSustituir] = useState(false);
    // v4.1313 — «Editar valor» de la inscripción de este proyecto.
    const [showEditarValor, setShowEditarValor] = useState(false);
    const [manualStep, setManualStep] = useState<'edit' | 'confirm'>('edit');
    const [manualForm, setManualForm] = useState<{
        reference: string; paidAt: string; amount: string; currency: string; paymentMethod: string;
        evidence: string; reason: string; receipt: ComprobanteSubido | null; coverProjectIds: string[];
    }>({
        reference: '',
        paidAt: fechaLocalParaInput(),
        amount: '',
        currency: 'COP',
        paymentMethod: 'Transferencia bancaria',
        evidence: '',
        reason: '',
        receipt: null,
        coverProjectIds: [],
    });
    // v4.1308 — La subida del comprobante adjunto.
    const [subiendoComprobante, setSubiendoComprobante] = useState(false);
    const [errorComprobante, setErrorComprobante] = useState<string | null>(null);
    const inputComprobanteRef = useRef<HTMLInputElement | null>(null);
    const [paymentHistory, setPaymentHistory] = useState<any | null>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [showHistorySection, setShowHistorySection] = useState(false);

    const loadPaymentHistory = async () => {
        setLoadingHistory(true);
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${id}/payment-history`), {
                headers: authHeaders(),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'No se pudo cargar el historial');
            setPaymentHistory(d);
            setShowHistorySection(true);
        } catch (err: any) {
            toast.error(err.message || 'Error al consultar historial');
        } finally {
            setLoadingHistory(false);
        }
    };

    const load = useCallback(() => {
        setLoading(true);
        fetch(withEvento(`${API}/project-fair/admin/postulaciones/${id}`), { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { if (d?.error) throw new Error(d.error); setData(d); })
            .catch(e => toast.error(e?.message || 'No se pudo abrir la ficha'))
            .finally(() => setLoading(false));
    }, [id]);
    useEffect(() => { load(); }, [load]);

    // ── v4.1324 — Expediente integral ──────────────────────────────────────
    const [dossier, setDossier] = useState<DossierPayload | null>(null);
    const [dossierError, setDossierError] = useState<string | null>(null);
    const [formDirty, setFormDirty] = useState(false);
    const [trDirty, setTrDirty] = useState(false);
    const [histKey, setHistKey] = useState(0);
    const [wide, setWide] = useState<boolean>(() => {
        try { return localStorage.getItem('fair-expediente-wide') === '1'; } catch { return false; }
    });
    const loadDossier = useCallback(() => {
        setDossierError(null);
        dossierRequest<DossierPayload>(`/postulaciones/${id}/expediente`, currentEventId())
            .then(setDossier)
            .catch(e => setDossierError(e?.message || 'No se pudo abrir el expediente'));
    }, [id]);
    useEffect(() => { loadDossier(); }, [loadDossier]);
    const onTranslationStatus = useCallback((st: TranslationStatus) => {
        setDossier(d => (d ? { ...d, translation: { en: st } } : d));
    }, []);
    const toggleWide = () => setWide(w => {
        try { localStorage.setItem('fair-expediente-wide', w ? '0' : '1'); } catch { /* sin almacenamiento: sólo esta vez */ }
        return !w;
    });
    // Cambios sin guardar: se avisa antes de cambiar de pestaña o cerrar.
    const leaveOk = () => !(formDirty || trDirty) || window.confirm('Hay cambios sin guardar en el expediente. ¿Salir sin guardarlos?');
    const setPane = (p: ExpedientePane) => {
        if (p === pane) return;
        if (!leaveOk()) return;
        setFormDirty(false); setTrDirty(false);
        setPaneRaw(p);
    };
    const onClose = () => { if (leaveOk()) closeRaw(); };

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
            return true;
        } catch (e: any) { toast.error(e?.message); return false; } finally { setSaving(false); }
    };

    // v4.1308 — Abrir «Confirmar pago manualmente» con la inscripción a la
    // vista: los demás proyectos que deben quedan propuestos y el valor es la
    // suma de sus líneas. Antes el valor se prellenaba con 250.000 fijos y la
    // fecha en hora UTC.
    const abrirConfirmacionManual = () => {
        if (!data?.submission) return;
        const sub = data.submission;
        const summary = data.registrationSummary;
        const lineaPropia = summary?.currency === 'USD' ? sub.amountUsd : sub.amountCop;
        const prop = propuestaConfirmacion(sub.id, summary?.lines, lineaPropia);
        setManualForm({
            reference: '',
            paidAt: fechaLocalParaInput(),
            amount: prop.monto ? String(prop.monto) : '',
            currency: summary?.currency || sub.chargeCurrency || (sub.amountCop ? 'COP' : 'USD'),
            paymentMethod: 'Transferencia bancaria',
            evidence: '',
            reason: '',
            receipt: null,
            coverProjectIds: prop.coverProjectIds,
        });
        setErrorComprobante(null);
        setManualStep('edit');
        setShowManualModal(true);
    };

    const adjuntarComprobante = async (file: File | null | undefined) => {
        if (!file) return;
        setErrorComprobante(null);
        setSubiendoComprobante(true);
        try {
            const subido = await subirComprobanteManual({
                file,
                prepararUrl: withEvento(`${API}/project-fair/admin/postulaciones/${id}/manual-payment/receipt-url`),
                headers: authHeaders() as Record<string, string>,
            });
            setManualForm(f => ({ ...f, receipt: subido }));
        } catch (e: any) {
            setErrorComprobante(e?.message || 'No se pudo subir el comprobante.');
        } finally {
            setSubiendoComprobante(false);
            if (inputComprobanteRef.current) inputComprobanteRef.current.value = '';
        }
    };

    const verComprobanteManual = async () => {
        // La ventana se abre ANTES de esperar la respuesta: un navegador
        // bloquea la que se abre después de un `await`.
        const ventana = window.open('', '_blank');
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${id}/manual-payment/receipt`), { headers: authHeaders() });
            const d = await res.json().catch(() => null);
            if (!res.ok || !d?.url) throw new Error(d?.error || 'No se pudo abrir el comprobante.');
            if (ventana) ventana.location.href = d.url; else window.location.href = d.url;
        } catch (e: any) {
            ventana?.close();
            toast.error(e?.message || 'No se pudo abrir el comprobante.');
        }
    };

    const exportFicha = async () => {
        try {
            const res = await fetch(withEvento(`${API}/project-fair/admin/postulaciones/${id}/snapshot`), { headers: authHeaders() });
            const snap = await res.json();
            const { loadJsPdf } = await import('../../lib/executiveReportPdf');
            const JsPDF = await loadJsPdf();
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
            // v4.1311 — Pago respaldado por otra ficha tras una sustitución.
            if (s.substitution?.role === 'kept') {
                line('Pago oficial en', s.substitution.fromRef);
                line('Pagado por', s.substitution.payer?.name || s.substitution.payer?.email);
                if (s.substitution.official?.amountReceived != null) line('Recibido', `${s.substitution.official.amountReceived} ${s.substitution.official.currency || ''}`);
                if (s.substitution.previousPayment?.classification) line('Pago anterior', s.substitution.previousPayment.classification.label);
            }
            if (s.substitution?.role === 'retired') line('Sustituido por', s.substitution.toRef);

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
            <div className={`h-full w-full ${wide ? 'max-w-none' : 'max-w-3xl'} overflow-y-auto bg-slate-50 shadow-2xl transition-[max-width]`} onClick={e => e.stopPropagation()}>
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
                                        {s.paymentStatus === 'paid' && (
                                            <Badge color={s.paymentConfirmationOrigin === 'manual_admin' ? 'violet' : 'emerald'}>
                                                {s.paymentConfirmationOrigin === 'manual_admin' ? 'Manual (Admin)' : 'Stripe'}
                                            </Badge>
                                        )}
                                    </div>
                                    <h2 className="mt-1 text-xl font-bold text-slate-900">{s.projectName}</h2>
                                    <p className="text-sm text-slate-500">{s.clubName} · {s.district}</p>
                                    {s.substitution?.role === 'retired' && (
                                        <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
                                            <strong>Archivada — sustituida por {s.substitution.toRef}</strong> el {fmtDateTime(s.substitution.at)} por {s.substitution.by || 'un administrador'}. Su pago se conserva en esta ficha y respalda la inscripción de {s.substitution.toRef}.
                                        </p>
                                    )}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button onClick={toggleWide} aria-label={wide ? 'Volver al panel lateral' : 'Ver a pantalla completa'} title={wide ? 'Volver al panel lateral' : 'Pantalla completa'}
                                        className="hidden rounded-lg p-2 text-slate-400 hover:bg-slate-100 sm:inline-flex">{wide ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
                                    <button onClick={onClose} aria-label="Cerrar el expediente" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                <button onClick={exportFicha} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FileText size={13} /> Ficha en PDF</button>
                                <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/postular-proyecto?submission=${s.id}`); toast.success('Enlace copiado'); }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink size={13} /> Copiar enlace</button>
                                {access.managePayments && (
                                    <>
                                        <button onClick={() => action('sync-stripe', {}, 'Sincronizado con Stripe')} disabled={saving}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={13} className={saving ? 'animate-spin' : ''} /> Sincronizar con Stripe</button>
                                        {s.paymentStatus !== 'paid' && (
                                            <button
                                                onClick={abrirConfirmacionManual}
                                                disabled={saving}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                                            >
                                                <ShieldCheck size={13} /> Confirmar pago manualmente
                                            </button>
                                        )}
                                        {s.paymentStatus === 'paid' && (
                                            <button onClick={() => action('resend-receipt', {}, 'Comprobante reenviado')} disabled={saving}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Mail size={13} /> Reenviar comprobante</button>
                                        )}
                                        {/* v4.1311 — Sólo un pago PROPIO, de un proyecto activo, se puede trasladar a otro del club. */}
                                        {access.remove && s.paymentStatus === 'paid' && !s.archivedAt && !s.coveredBy && !(s.coveredProjects || []).length && (
                                            <button onClick={() => setShowSustituir(true)} disabled={saving}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ArrowRightLeft size={13} /> Sustituir por otro proyecto</button>
                                        )}
                                        {/* v4.1313 — Cambiar el valor de la inscripción de este proyecto. */}
                                        {s.paymentStatus !== 'refunded' && (
                                            <button onClick={() => setShowEditarValor(true)} disabled={saving}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil size={13} /> Editar valor</button>
                                        )}
                                    </>
                                )}
                                {access.changeStatus && !s.reviewedAt && (
                                    <button onClick={() => patch({ markReviewed: true }, 'Marcada como revisada')} disabled={saving}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><CheckCircle2 size={13} /> Marcar revisada</button>
                                )}
                            </div>

                            <div className="-mx-6 mt-3 flex gap-1 overflow-x-auto border-b border-slate-100 px-6" role="tablist" aria-label="Secciones del expediente">
                                {([['datos', 'Resumen'], ['formulario', 'Formulario completo'], ['documentos', 'Documentos'], ['traduccion', 'Traducción'], ['fichas', 'Fichas PDF'], ['libreta', 'Libreta'], ['pago', 'Pago'], ['historial', 'Historial']] as const).map(([key, label]) => (
                                    <button key={key} role="tab" aria-selected={pane === key} onClick={() => setPane(key)}
                                        className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold ${pane === key ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500'}`}>
                                        {label}
                                        {key === 'traduccion' && dossier && dossier.translation.en.state !== 'not_started' && (
                                            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ring-1 ${TRANSLATION_META[dossier.translation.en.state].cls}`}>{TRANSLATION_META[dossier.translation.en.state].label}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </header>

                        <div className="space-y-4 p-6">
                            {pane === 'datos' && (
                                <>
                                    <PostCloseNotice s={s} canReview={!!access.changeStatus} onGo={() => setPane('historial')} onReviewed={() => { load(); onChanged?.(); }} />
                                    {dossier && (
                                        <Section title="Resumen del proyecto">
                                            <Row label="Referencia" value={s.publicRef} mono />
                                            <Row label="Proyecto" value={s.projectName} />
                                            <Row label="Club / Distrito" value={`${s.clubName} · ${s.district}`} />
                                            <Row label="Responsable" value={`${s.firstName} ${s.lastName}`} />
                                            <Row label="Área de enfoque" value={s.focusAreaLabel || s.focusArea} />
                                            <Row label="Presupuesto" value={s.budgetUsd != null ? `${fmtUsd(s.budgetUsd)} USD` : undefined} />
                                            <Row label="Estado de la postulación" value={wf?.label} />
                                            <Row label="Fecha de postulación" value={fmtDateTime(dossier.submission.appliedAt || dossier.submission.createdAt)} />
                                            <Row label="Última actualización del proyecto" value={s.lastClubEditAt ? fmtDateTime(s.lastClubEditAt) : undefined} />
                                            <Row label="Edición" value={dossier.edition.name} />
                                        </Section>
                                    )}
                                    {dossier && <PreparacionDocumental data={dossier} onGo={p => setPane(p)} />}
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
                                        {/* v4.1299 — La inscripción: posición y los demás proyectos del club. */}
                                        <Row label="Posición en la inscripción" value={`${s.projectIndexLabel || 'Primer proyecto'} · ${Math.max(s.registrationProjects || 1, s.projectIndex || 1)} proyecto(s) en la inscripción`} />
                                        {(s.projectIndex || 1) > 1 && <Row label="Origen del segundo proyecto" value={s.isExtension ? 'Ampliación posterior desde «Mi proyecto»' : 'Elegido en el registro inicial'} />}
                                        {(data?.siblings || []).length > 0 && (
                                            <div className="pt-3">
                                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Otros proyectos de la misma inscripción</p>
                                                <ul className="space-y-1 text-sm">
                                                    {(data?.siblings || []).map(sib => (
                                                        <li key={sib.id} className="flex flex-wrap items-center gap-2">
                                                            <span className="font-mono text-xs font-bold text-slate-500">{sib.publicRef}</span>
                                                            <span className="font-semibold text-slate-800">{sib.projectName}</span>
                                                            <span className="text-xs text-slate-500">· {sib.projectIndexLabel} · {sib.projectStateLabel}{sib.withdrawnByClub ? ' (retirado por el club)' : ''}{sib.archived ? ' (archivada)' : ''}</span>
                                                            <Badge color={sib.paymentStatus === 'paid' ? 'emerald' : 'amber'}>{sib.paymentStatus === 'paid' ? 'Pagado' : 'Pago pendiente'}</Badge>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        <Row label="Área de enfoque" value={s.focusAreaLabel || s.focusArea} />
                                        <Row label="Presupuesto" value={`${fmtUsd(s.budgetUsd)} USD`} />
                                        {/* v4.1313 — El valor de la inscripción del proyecto, editable desde aquí. */}
                                        <Row label="Valor de la inscripción" value={
                                            <span className="inline-flex flex-wrap items-center justify-end gap-2">
                                                <span>{amountLabel(s)}</span>
                                                {s.amountOverride && <Badge color="violet">Ajustado</Badge>}
                                                {access.managePayments && s.paymentStatus !== 'refunded' && (
                                                    <button onClick={() => setShowEditarValor(true)}
                                                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Pencil size={11} /> Editar</button>
                                                )}
                                            </span>
                                        } />
                                        <Row label="Fecha de inscripción" value={fmtDateTime(s.createdAt)} />
                                        {/* v4.1253 — Cuándo se ENVIÓ: un borrador no la tiene. */}
                                        <Row label="Fecha de postulación" value={s.appliedAt ? fmtDateTime(s.appliedAt) : 'Todavía en borrador'} />
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
                                                <span className="mb-1 block text-xs font-semibold text-slate-600">Estado del proyecto <span className="font-normal text-slate-400">(independiente del pago)</span></span>
                                                <select disabled={!access.changeStatus} defaultValue={s.workflowStatus}
                                                    onChange={e => patch({ workflowStatus: e.target.value, reason }, 'Estado actualizado')}
                                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50">
                                                    {elegibles(catalog?.workflowStates).map((st: StateDef) => <option key={st.key} value={st.key}>{st.label}</option>)}
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

                            {/* v4.1324 — Pestañas del expediente. Esperan a que cargue y dicen el error si no. */}
                            {['formulario', 'documentos', 'traduccion', 'fichas', 'libreta'].includes(pane) && !dossier && (
                                dossierError
                                    ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{dossierError} <button onClick={loadDossier} className="ml-2 font-semibold underline">Reintentar</button></div>
                                    : <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 animate-spin" size={18} /> Cargando expediente…</div>
                            )}
                            {pane === 'formulario' && dossier && (
                                <ExpedienteFormulario data={dossier} eventId={currentEventId()} wide={wide} startInEdit={!!openRequest?.edit}
                                    onDirtyChange={setFormDirty} onReload={loadDossier}
                                    onSaved={next => { setDossier(d => (d ? { ...d, ...next } : d)); setFormDirty(false); setHistKey(k => k + 1); load(); onChanged(); loadDossier(); }} />
                            )}
                            {pane === 'documentos' && dossier && (
                                <ExpedienteDocumentos data={dossier} eventId={currentEventId()} onOpenPayment={() => setPane('pago')} />
                            )}
                            {pane === 'traduccion' && dossier && (
                                <ExpedienteTraduccion submissionId={id} eventId={currentEventId()} access={dossier.access} wide={wide}
                                    autoStart={!!openRequest?.autoTranslate} onStatusChange={onTranslationStatus} onDirtyChange={setTrDirty} />
                            )}
                            {pane === 'fichas' && dossier && (
                                <ExpedienteFichas submissionId={id} eventId={currentEventId()} canExport={dossier.access.export} translation={dossier.translation.en} />
                            )}
                            {pane === 'libreta' && dossier && (
                                <ExpedienteLibreta submissionId={id} eventId={currentEventId()} access={dossier.access}
                                    fieldLabels={Object.fromEntries(dossier.dossier.groups.flatMap(g => g.sections.flatMap(sec => sec.fields.map(f => [f.path, `${g.source === 'submission' ? 'Registro inicial' : g.title} · ${f.label}`]))))}
                                    project={{ publicRef: dossier.submission.publicRef, projectName: dossier.submission.projectName, clubName: dossier.submission.clubName, district: dossier.submission.district, edition: dossier.edition.name }} />
                            )}

                            {pane === 'pago' && (
                                <div className="space-y-4">
                                    {/* v4.1301 — LA INSCRIPCIÓN: modalidad, origen del segundo
                                        proyecto, pago original y complementario, total y saldo. */}
                                    {data?.registrationSummary && (data.registrationSummary.count > 1 || data.registrationSummary.payments.length > 1) && (
                                        <Section title="Inscripción del club">
                                            <Row label="Modalidad" value={data.registrationSummary.count > 1 ? 'Dos proyectos' : 'Un proyecto'} />
                                            <Row label="Origen" value={data.registrationSummary.originLabel} />
                                            {data.registrationSummary.secondProjectCreatedAt && <Row label="Segundo proyecto creado" value={fmtDateTime(data.registrationSummary.secondProjectCreatedAt)} />}
                                            {data.registrationSummary.lines.map(l => (
                                                <Row key={l.submissionId} label={`${l.label} · ${l.projectName}`} value={`${data.registrationSummary!.currency === 'USD' ? fmtUsd(l.amount) : fmtCop(l.amount)} · ${l.paid ? 'pagado' : l.owes ? 'pendiente' : 'sin cobro'}`} />
                                            ))}
                                            <Row label="Total de la inscripción" value={data.registrationSummary.currency === 'USD' ? fmtUsd(data.registrationSummary.total) : fmtCop(data.registrationSummary.total)} />
                                            <Row label="Total pagado" value={data.registrationSummary.currency === 'USD' ? fmtUsd(data.registrationSummary.paidTotal) : fmtCop(data.registrationSummary.paidTotal)} />
                                            <Row label="Saldo pendiente" value={data.registrationSummary.currency === 'USD' ? fmtUsd(data.registrationSummary.pendingTotal) : fmtCop(data.registrationSummary.pendingTotal)} />
                                            {data.registrationSummary.payments.length > 0 && (
                                                <div className="pt-3">
                                                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pagos de la inscripción</p>
                                                    <ul className="space-y-1 text-sm">
                                                        {data.registrationSummary.payments.map(p => (
                                                            <li key={p.anchorId} className="flex flex-wrap items-center gap-2">
                                                                <Badge color={p.kind === 'complementary' ? 'sky' : 'emerald'}>{p.kind === 'complementary' ? 'Pago complementario' : 'Pago original'}</Badge>
                                                                <span className="font-semibold text-slate-800">{p.amountReceived != null ? `${fmtCop(p.amountReceived)} ${p.currency || ''}` : 'Confirmado'}</span>
                                                                <span className="text-xs text-slate-500">· cubre {p.covers.join(', ')}{p.paidAt ? ` · ${fmtDateTime(p.paidAt)}` : ''}{p.origin === 'manual_admin' ? ' · confirmación administrativa' : ''}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </Section>
                                    )}
                                    {!access.viewPayments ? (
                                        <Section title="Trazabilidad del pago">
                                            <p className="text-sm text-slate-500">Tu perfil no tiene acceso al detalle financiero.</p>
                                        </Section>
                                    ) : (
                                        <>
                                            {/* Tarjeta de Resumen Financiero */}
                                            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <CreditCard size={18} className="text-blue-700" />
                                                        <div>
                                                            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Resumen Financiero</h3>
                                                            <p className="text-xs text-slate-500">Estado consolidado y conciliación de inscripción</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge color={pay?.color || 'slate'}>{pay?.label || s.paymentStatus}</Badge>
                                                        {s.paymentStatus === 'paid' ? (
                                                            <Badge color={s.paymentConfirmationOrigin === 'manual_admin' ? 'violet' : 'emerald'}>
                                                                {s.paymentConfirmationOrigin === 'manual_admin' ? 'Confirmado administrativamente' : 'Confirmado por Stripe'}
                                                            </Badge>
                                                        ) : (
                                                            <Badge color="amber">Pendiente</Badge>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* v4.1299 — Un proyecto cubierto por el cobro de otro, o un cobro que cubrió a otros. */}
                                                {s.coveredBy && s.substitution?.role !== 'kept' && (
                                                    <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                                        Pagado dentro de la inscripción conjunta <strong>{s.coveredBy.publicRef || s.coveredBy.id}</strong>: la transacción, el monto recibido y el comprobante están en esa ficha.
                                                    </p>
                                                )}
                                                {/* v4.1311 — El pago oficial reasignado: de dónde viene, quién pagó y qué pasó con el pago anterior. */}
                                                {s.substitution?.role === 'kept' && (
                                                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-xs text-emerald-950">
                                                        <p className="font-bold text-emerald-900">Pago oficial reasignado desde {s.substitution.fromRef}</p>
                                                        <div className="mt-1.5 space-y-1">
                                                            <div className="flex justify-between gap-3"><span className="font-semibold">Pagado por</span><span className="text-right">{s.substitution.payer?.name || '—'}{s.substitution.payer?.email ? ` · ${s.substitution.payer.email}` : ''}</span></div>
                                                            <div className="flex justify-between gap-3"><span className="font-semibold">Responsable del proyecto</span><span className="text-right">{s.responsable}</span></div>
                                                            <div className="flex justify-between gap-3"><span className="font-semibold">Valor de la inscripción</span><span>{amountLabel(s)}</span></div>
                                                            <div className="flex justify-between gap-3"><span className="font-semibold">Recibido por la pasarela</span><span>{s.substitution.official?.amountReceived != null ? `${s.substitution.official.currency === 'USD' ? fmtUsd(s.substitution.official.amountReceived) : fmtCop(s.substitution.official.amountReceived)} ${s.substitution.official.currency || ''}` : '—'}</span></div>
                                                            <div className="flex justify-between gap-3"><span className="font-semibold">Fecha del pago</span><span>{fmtDateTime(s.substitution.official?.paidAt)}</span></div>
                                                            {s.substitution.official?.stripePaymentIntentId && <div className="flex justify-between gap-3"><span className="font-semibold">Referencia</span><span className="break-all font-mono">{s.substitution.official.stripePaymentIntentId}</span></div>}
                                                            <div className="flex justify-between gap-3"><span className="font-semibold">Reasignado</span><span className="text-right">{fmtDateTime(s.substitution.at)} · {s.substitution.by || 'Administrador'}</span></div>
                                                            {s.substitution.reason && <p className="pt-1 text-emerald-900/80">Motivo: {s.substitution.reason}</p>}
                                                        </div>
                                                        {s.substitution.previousPayment?.classification && s.substitution.previousPayment.classification.kind !== 'none' && (
                                                            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-amber-900">
                                                                <strong>Pago anterior, no cuenta para la inscripción:</strong> {s.substitution.previousPayment.classification.label}
                                                                {s.substitution.previousPayment.amountReceived != null ? ` · ${s.substitution.previousPayment.amountReceived} ${s.substitution.previousPayment.currency || ''}` : ''}
                                                                {s.substitution.previousPayment.stripePaymentIntentId ? ` · ${s.substitution.previousPayment.stripePaymentIntentId}` : ''}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                                {(s.coveredProjects || []).length > 0 && (
                                                    <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
                                                        Este cobro cubrió también: {(s.coveredProjects || []).map(p => `${p.publicRef || ''} ${p.projectName}`.trim()).join(' · ')}.
                                                    </p>
                                                )}
                                                {/* Grid de Métricas Financieras */}
                                                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                                    <div className="rounded-lg bg-slate-50 p-3">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Valor Inscripción</span>
                                                        <p className="mt-1 text-base font-bold text-slate-900">{amountLabel(s)}</p>
                                                        <span className="text-[11px] text-slate-400">{s.amountOverride ? 'Valor ajustado por el comité' : 'Tarifa de postulación'}</span>
                                                        {access.managePayments && s.paymentStatus !== 'refunded' && (
                                                            <button onClick={() => setShowEditarValor(true)} className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"><Pencil size={10} /> Editar valor</button>
                                                        )}
                                                    </div>
                                                    <div className="rounded-lg bg-slate-50 p-3">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Valor Pagado</span>
                                                        <p className="mt-1 text-base font-bold text-slate-900">
                                                            {s.amountReceived ? `${fmtCop(s.amountReceived)} COP` : (s.paymentStatus === 'paid' ? amountLabel(s) : '—')}
                                                        </p>
                                                        <span className="text-[11px] text-slate-400">Monto verificado</span>
                                                    </div>
                                                    <div className="rounded-lg bg-slate-50 p-3">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Moneda</span>
                                                        <p className="mt-1 text-base font-bold text-slate-900">{s.chargeCurrency || (s.amountCop ? 'COP' : 'USD')}</p>
                                                        <span className="text-[11px] text-slate-400">Moneda de pago</span>
                                                    </div>
                                                    <div className="rounded-lg bg-slate-50 p-3">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Confirmación</span>
                                                        <p className="mt-1 text-xs font-semibold text-slate-800">{s.paidAt ? fmtDateTime(s.paidAt) : 'Sin confirmación'}</p>
                                                        <span className="text-[11px] text-slate-400">Fecha y hora</span>
                                                    </div>
                                                    <div className="rounded-lg bg-slate-50 p-3">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Método de Pago</span>
                                                        <p className="mt-1 text-xs font-semibold text-slate-800">
                                                            {s.paymentMethod || (s.stripeSessionId ? 'Tarjeta (Stripe)' : (s.paymentConfirmationOrigin === 'manual_admin' ? 'Manual' : '—'))}
                                                        </p>
                                                    </div>
                                                    <div className="rounded-lg bg-slate-50 p-3">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Última Sincronización</span>
                                                        <p className="mt-1 text-xs font-semibold text-slate-800">
                                                            {s.lastSyncAt ? fmtDateTime(s.lastSyncAt) : (s.paidAt ? fmtDateTime(s.paidAt) : 'Sin sincronizar')}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Barra de Acciones Financieras */}
                                                {access.managePayments && (
                                                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                                                        <button
                                                            onClick={() => action('sync-stripe', {}, 'Sincronizado con Stripe')}
                                                            disabled={saving}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                                        >
                                                            <RefreshCw size={13} className={saving ? 'animate-spin' : ''} /> Sincronizar con Stripe
                                                        </button>

                                                        {s.paymentStatus !== 'paid' && (
                                                            <button
                                                                onClick={abrirConfirmacionManual}
                                                                disabled={saving}
                                                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                                                            >
                                                                <ShieldCheck size={14} /> Confirmar pago manualmente
                                                            </button>
                                                        )}

                                                        {s.paymentStatus === 'paid' && s.receiptUrl && (
                                                            <>
                                                                <a
                                                                    href={s.receiptUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-slate-50"
                                                                >
                                                                    <Download size={13} /> Comprobante Stripe
                                                                </a>
                                                                <button
                                                                    onClick={() => action('resend-receipt', {}, 'Comprobante reenviado')}
                                                                    disabled={saving}
                                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                                                >
                                                                    <Mail size={13} /> Reenviar comprobante
                                                                </button>
                                                            </>
                                                        )}

                                                        <button
                                                            onClick={loadPaymentHistory}
                                                            disabled={loadingHistory}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                                        >
                                                            <History size={13} className={loadingHistory ? 'animate-spin' : ''} />
                                                            {showHistorySection ? 'Actualizar historial' : 'Consultar historial de pago'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Bloque de Confirmación Administrativa Manual si aplica */}
                                            {s.paymentConfirmationOrigin === 'manual_admin' && (
                                                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-5">
                                                    <div className="flex items-center gap-2 text-violet-900">
                                                        <ShieldCheck size={18} className="text-violet-700" />
                                                        <h3 className="text-sm font-bold uppercase tracking-wide">Confirmación Administrativa Manual</h3>
                                                    </div>
                                                    <div className="mt-3 space-y-2 text-xs text-violet-950">
                                                        <div className="flex justify-between border-b border-violet-100 py-1">
                                                            <span className="font-semibold">Responsable autorizado:</span>
                                                            <span>{s.manualPaymentBy || 'Administrador'}</span>
                                                        </div>
                                                        <div className="flex justify-between border-b border-violet-100 py-1">
                                                            <span className="font-semibold">Fecha de confirmación:</span>
                                                            <span>{fmtDateTime(s.manualPaymentAt)}</span>
                                                        </div>
                                                        <div className="flex justify-between border-b border-violet-100 py-1">
                                                            <span className="font-semibold">Referencia o soporte:</span>
                                                            <span className="font-mono font-bold">{s.manualPaymentRef || '—'}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-3 border-b border-violet-100 py-1">
                                                            <span className="font-semibold">Comprobante adjunto:</span>
                                                            {s.manualPaymentReceipt ? (
                                                                <button type="button" onClick={verComprobanteManual}
                                                                    className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-white px-2 py-1 font-semibold text-violet-800 hover:bg-violet-100">
                                                                    <Paperclip size={12} /> {s.manualPaymentReceipt.name} <ExternalLink size={11} />
                                                                </button>
                                                            ) : <span>Sin archivo</span>}
                                                        </div>
                                                        <div className="flex justify-between gap-3 border-b border-violet-100 py-1">
                                                            <span className="font-semibold">Referencia del soporte:</span>
                                                            <span className="break-all text-right">{s.manualPaymentEvidence || '—'}</span>
                                                        </div>
                                                        {s.coveredBy && (
                                                            <div className="flex justify-between gap-3 border-b border-violet-100 py-1">
                                                                <span className="font-semibold">Cubierto por el pago de:</span>
                                                                <span className="font-mono">{s.coveredBy.publicRef || s.coveredBy.id}</span>
                                                            </div>
                                                        )}
                                                        {s.coveredProjects && s.coveredProjects.length > 0 && (
                                                            <div className="flex justify-between gap-3 border-b border-violet-100 py-1">
                                                                <span className="font-semibold">Este pago cubre también:</span>
                                                                <span className="text-right">{s.coveredProjects.map((p: any) => p.publicRef || p.projectName).join(', ')}</span>
                                                            </div>
                                                        )}
                                                        <div className="py-1">
                                                            <span className="font-semibold block mb-0.5">Motivo / Justificación:</span>
                                                            <p className="rounded bg-white/70 p-2 text-slate-700 border border-violet-100">{s.manualPaymentReason || '—'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Alerta de error si existe */}
                                            {s.lastPaymentError && (
                                                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
                                                    <div className="flex items-center gap-2 font-bold text-red-800">
                                                        <AlertTriangle size={15} /> Último error de pago / pasarela
                                                    </div>
                                                    <p className="mt-1 font-mono">{s.lastPaymentError}</p>
                                                </div>
                                            )}

                                            {/* Trazabilidad Técnica y Proveedor */}
                                            <Section title="Detalle Técnico de Pasarela">
                                                <Row label="Checkout Session" value={s.stripeSessionId} mono />
                                                <Row label="Payment Intent" value={s.stripePaymentIntentId} mono />
                                                <Row label="Charge ID" value={s.stripeChargeId} mono />
                                                <Row label="Customer ID" value={s.stripeCustomerId} mono />
                                                <Row label="TRM aplicada" value={s.trmRate ? `${fmtNum(s.trmRate)} COP/USD · ${s.trmDate || ''}` : '—'} />
                                                <Row label="Fuente de la TRM" value={s.trmSource} />
                                                {s.refundedAmount ? <Row label="Reembolsado" value={`${fmtCop(s.refundedAmount)} COP · ${fmtDateTime(s.refundedAt)}`} /> : null}
                                            </Section>

                                            {/* Historial Extendido de Pagos si fue consultado */}
                                            {showHistorySection && paymentHistory && (
                                                <Section title="Historial y Auditoría Financiera">
                                                    <div className="space-y-4">
                                                        {paymentHistory.paymentAttempts?.length > 0 && (
                                                            <div>
                                                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Intentos de cobro ({paymentHistory.paymentAttempts.length})</p>
                                                                <ul className="space-y-2 text-xs">
                                                                    {paymentHistory.paymentAttempts.map((att: any, idx: number) => (
                                                                        <li key={att.id || idx} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="font-semibold text-slate-800">Intento #{idx + 1} · {att.status}</span>
                                                                                <span className="text-slate-400">{fmtDateTime(att.startedAt)}</span>
                                                                            </div>
                                                                            <div className="mt-1 text-slate-600">
                                                                                {att.amountCop ? `${fmtCop(att.amountCop)} COP` : ''} {att.amountUsd ? `(${fmtUsd(att.amountUsd)} USD)` : ''}
                                                                            </div>
                                                                            {att.failureMessage && (
                                                                                <p className="mt-1 text-red-600 font-mono text-[11px]">{att.failureMessage}</p>
                                                                            )}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}

                                                        {paymentHistory.timeline?.length > 0 && (
                                                            <div>
                                                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Bitácora Financiera ({paymentHistory.timeline.length} eventos)</p>
                                                                <ul className="space-y-2 text-xs">
                                                                    {paymentHistory.timeline.map((ev: any) => (
                                                                        <li key={ev.id} className="rounded-lg border border-slate-100 bg-white p-2.5">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="font-bold text-slate-800">{ev.title}</span>
                                                                                <span className="text-slate-400">{fmtDateTime(ev.createdAt)}</span>
                                                                            </div>
                                                                            {ev.detail && <p className="mt-1 text-slate-600">{ev.detail}</p>}
                                                                            {ev.actorName && <p className="mt-0.5 text-[11px] text-slate-400">Por: {ev.actorName}</p>}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                </Section>
                                            )}

                                            {/* Eventos Recibidos de Stripe */}
                                            {data.stripeEvents.length > 0 && (
                                                <Section title={`Eventos recibidos de Stripe (${data.stripeEvents.length})`}>
                                                    <ul className="space-y-1 text-xs text-slate-600">
                                                        {data.stripeEvents.map(e => (
                                                            <li key={e.id} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
                                                                <span className="font-mono">{e.type}</span>
                                                                <span className="text-slate-400">{fmtDateTime(e.receivedAt)}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </Section>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {pane === 'historial' && (
                                <>
                                    <ExpedienteHistorial submissionId={id} eventId={currentEventId()} refreshKey={histKey} />
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

            {/* v4.1311 — Sustituir por otro proyecto del club, con su pago. */}
            {showSustituir && s && (
                <SustituirPostulacion
                    submission={s}
                    endpoint={(path: string) => withEvento(`${API}/project-fair/admin/postulaciones/${path}`)}
                    headers={jsonHeaders}
                    onClose={() => setShowSustituir(false)}
                    onApplied={() => { load(); onChanged(); }}
                />
            )}

            {/* v4.1313 — Editar el valor de la inscripción de este proyecto. */}
            {showEditarValor && s && (
                <EditarValorProyecto
                    submission={s}
                    pricing={data?.pricing ?? null}
                    endpoint={withEvento(`${API}/project-fair/admin/postulaciones/${id}/amount`)}
                    headers={jsonHeaders as () => Record<string, string>}
                    onClose={() => setShowEditarValor(false)}
                    onSaved={() => { setShowEditarValor(false); toast.success('Valor de la inscripción actualizado'); load(); onChanged(); }}
                />
            )}

            {/* Modal de Confirmación Manual de Pago */}
            {showManualModal && s && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" onClick={e => e.stopPropagation()}>
                    <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={20} className="text-emerald-600" />
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Confirmar Pago Manualmente</h3>
                                    <p className="text-xs text-slate-500">Módulo administrativo de conciliación</p>
                                </div>
                            </div>
                            <button onClick={() => setShowManualModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                                <X size={18} />
                            </button>
                        </div>

                        {manualStep === 'edit' ? (
                            <div className="mt-4 space-y-3.5">
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    Registra la confirmación manual de este pago cuando exista evidencia verificable. Esta acción habilitará de inmediato los formularios del proyecto y sumará la inscripción a los indicadores de pagos confirmados.
                                </p>

                                {/* v4.1308 — La inscripción completa: un pago por fuera suele cubrir los dos proyectos del club. */}
                                {(() => {
                                    const summary = data?.registrationSummary;
                                    const lineaPropia = summary?.currency === 'USD' ? s.amountUsd : s.amountCop;
                                    const { cubribles } = propuestaConfirmacion(s.id, summary?.lines, lineaPropia);
                                    if (!cubribles.length) return null;
                                    const propia = summary?.lines?.find(l => l.submissionId === s.id);
                                    const esperado = montoEsperado(s.id, summary?.lines, lineaPropia, manualForm.coverProjectIds);
                                    const fmt = (v: number) => summary?.currency === 'USD' ? fmtUsd(v) : fmtCop(v);
                                    return (
                                        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-950">
                                            <p className="flex items-center gap-1.5 font-bold text-blue-900"><Layers size={14} /> Este club inscribió {summary?.count} proyectos</p>
                                            <p className="mt-1 leading-relaxed text-blue-900/80">Marca los proyectos que cubre este mismo pago. Quedarán pagados con esta confirmación y la inscripción contará como pagada de manera completa.</p>
                                            <div className="mt-2 space-y-1.5">
                                                <div className="flex items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2">
                                                    <span className="flex items-center gap-2 font-semibold"><CheckSquare size={14} className="text-emerald-600" /> {propia?.label || s.projectIndexLabel} — {s.projectName} <span className="font-normal text-slate-500">(esta ficha)</span></span>
                                                    <span className="font-mono">{fmt(Number(propia?.amount) || Number(lineaPropia) || 0)}</span>
                                                </div>
                                                {cubribles.map(l => {
                                                    const marcado = manualForm.coverProjectIds.includes(l.submissionId);
                                                    return (
                                                        <label key={l.submissionId} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2 hover:bg-white">
                                                            <span className="flex items-center gap-2 font-semibold">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={marcado}
                                                                    onChange={e => setManualForm(f => {
                                                                        const ids = e.target.checked
                                                                            ? [...f.coverProjectIds, l.submissionId]
                                                                            : f.coverProjectIds.filter(x => x !== l.submissionId);
                                                                        return { ...f, coverProjectIds: ids, amount: String(montoEsperado(s.id, summary?.lines, lineaPropia, ids) || f.amount) };
                                                                    })}
                                                                    className="h-3.5 w-3.5 accent-emerald-600"
                                                                />
                                                                {l.label} — {l.projectName}
                                                            </span>
                                                            <span className="font-mono">{fmt(Number(l.amount) || 0)}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            <p className="mt-2 flex justify-between border-t border-blue-200 pt-2 font-bold">
                                                <span>Valor esperado de la inscripción</span><span className="font-mono">{fmt(esperado)}</span>
                                            </p>
                                        </div>
                                    );
                                })()}

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700">Referencia o ID de transacción *</label>
                                    <input
                                        type="text"
                                        value={manualForm.reference}
                                        onChange={e => setManualForm(f => ({ ...f, reference: e.target.value }))}
                                        placeholder="Ej. Bancolombia #9482710 o pi_3UA..."
                                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700">Fecha y hora del pago *</label>
                                        <input
                                            type="datetime-local"
                                            value={manualForm.paidAt}
                                            onChange={e => setManualForm(f => ({ ...f, paidAt: e.target.value }))}
                                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700">Medio de pago *</label>
                                        <select
                                            value={manualForm.paymentMethod}
                                            onChange={e => setManualForm(f => ({ ...f, paymentMethod: e.target.value }))}
                                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        >
                                            <option value="Transferencia bancaria">Transferencia bancaria</option>
                                            <option value="Consignación bancaria">Consignación bancaria</option>
                                            <option value="Tarjeta de crédito/débito">Tarjeta de crédito/débito</option>
                                            <option value="Efectivo / Ventanilla">Efectivo / Ventanilla</option>
                                            <option value="Otro">Otro medio verificado</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700">Valor pagado *</label>
                                        <input
                                            type="number"
                                            value={manualForm.amount}
                                            onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))}
                                            placeholder="250000"
                                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700">Moneda *</label>
                                        <select
                                            value={manualForm.currency}
                                            onChange={e => setManualForm(f => ({ ...f, currency: e.target.value }))}
                                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        >
                                            <option value="COP">COP (Pesos Colombianos)</option>
                                            <option value="USD">USD (Dólares)</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700">Comprobante de pago *</label>
                                    <p className="text-[11px] text-slate-500">PDF, JPG, PNG o WebP de hasta 10 MB. Se guarda en un almacenamiento privado.</p>
                                    <input
                                        ref={inputComprobanteRef}
                                        type="file"
                                        accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                                        className="hidden"
                                        onChange={e => adjuntarComprobante(e.target.files?.[0])}
                                    />
                                    {manualForm.receipt ? (
                                        <div className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                                            <span className="flex min-w-0 items-center gap-2 text-emerald-900">
                                                <CheckCircle2 size={15} className="flex-shrink-0 text-emerald-600" />
                                                <span className="truncate font-semibold">{manualForm.receipt.name}</span>
                                                <span className="flex-shrink-0 text-emerald-700">{(manualForm.receipt.size / 1024 / 1024).toFixed(2)} MB</span>
                                            </span>
                                            <span className="flex flex-shrink-0 gap-1.5">
                                                <button type="button" onClick={() => inputComprobanteRef.current?.click()} disabled={subiendoComprobante}
                                                    className="rounded-md border border-emerald-300 bg-white px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-100">Reemplazar</button>
                                                <button type="button" onClick={() => setManualForm(f => ({ ...f, receipt: null }))} disabled={subiendoComprobante}
                                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100">Quitar</button>
                                            </span>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => inputComprobanteRef.current?.click()}
                                            onDragOver={e => e.preventDefault()}
                                            onDrop={e => { e.preventDefault(); adjuntarComprobante(e.dataTransfer.files?.[0]); }}
                                            disabled={subiendoComprobante}
                                            className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-4 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:bg-blue-50/50 disabled:opacity-60"
                                        >
                                            {subiendoComprobante
                                                ? <><Loader2 size={15} className="animate-spin" /> Subiendo comprobante…</>
                                                : <><Paperclip size={15} /> Adjuntar comprobante (o arrástralo aquí)</>}
                                        </button>
                                    )}
                                    {errorComprobante && <p className="mt-1 text-[11px] font-semibold text-red-600">{errorComprobante}</p>}
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700">Referencia del soporte {manualForm.receipt ? '(opcional)' : '*'}</label>
                                    <input
                                        type="text"
                                        value={manualForm.evidence}
                                        onChange={e => setManualForm(f => ({ ...f, evidence: e.target.value }))}
                                        placeholder="Ej. # extracto bancario, recibo físico o enlace al soporte"
                                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    />
                                    {!manualForm.receipt && <p className="mt-0.5 text-[11px] text-slate-500">Si no tienes el archivo, describe aquí un soporte verificable.</p>}
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700">Motivo de la confirmación manual *</label>
                                    <textarea
                                        value={manualForm.reason}
                                        onChange={e => setManualForm(f => ({ ...f, reason: e.target.value }))}
                                        rows={2}
                                        placeholder="Explica el motivo (ej. consignación directa, fallo en webhook del proveedor, conciliación)..."
                                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    />
                                </div>

                                <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowManualModal(false)}
                                        className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (subiendoComprobante) {
                                                toast.error('Espera a que termine de subir el comprobante.');
                                                return;
                                            }
                                            if (!manualForm.reference.trim() || !manualForm.paidAt || !manualForm.amount || !manualForm.reason.trim()) {
                                                toast.error('Por favor completa todos los campos requeridos.');
                                                return;
                                            }
                                            if (!manualForm.receipt && !manualForm.evidence.trim()) {
                                                toast.error('Adjunta el comprobante o escribe la referencia del soporte.');
                                                return;
                                            }
                                            if (manualForm.reason.trim().length < 5) {
                                                toast.error('El motivo debe tener al menos 5 caracteres.');
                                                return;
                                            }
                                            const fecha = new Date(manualForm.paidAt);
                                            if (Number.isNaN(fecha.getTime()) || fecha.getTime() > Date.now() + 10 * 60 * 1000) {
                                                toast.error('La fecha del pago no es válida o está en el futuro.');
                                                return;
                                            }
                                            setManualStep('confirm');
                                        }}
                                        className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                                    >
                                        Continuar a revisión
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 space-y-4">
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                                        <AlertTriangle size={15} /> Confirmación explícita requerida
                                    </div>
                                    <p className="mt-1 leading-relaxed">
                                        Esta acción marcará {manualForm.coverProjectIds.length ? <>los <strong>{manualForm.coverProjectIds.length + 1} proyectos</strong> de la inscripción</> : 'la postulación'} como <strong>Pago completado</strong>, desbloqueará los formularios «Formulación del proyecto» y «Solicitud de Aportes del FDD 2026–2027», sumará el pago a los indicadores de la Feria y quedará registrada inmutablemente en el registro de auditoría a tu nombre.
                                    </p>
                                </div>

                                {(() => {
                                    const summary = data?.registrationSummary;
                                    const lineaPropia = summary?.currency === 'USD' ? s.amountUsd : s.amountCop;
                                    const esperado = montoEsperado(s.id, summary?.lines, lineaPropia, manualForm.coverProjectIds);
                                    const declarado = Number(manualForm.amount) || 0;
                                    if (!esperado || manualForm.currency !== (summary?.currency || manualForm.currency) || Math.abs(declarado - esperado) < 0.01) return null;
                                    return (
                                        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
                                            El valor declarado ({manualForm.currency === 'USD' ? fmtUsd(declarado) : fmtCop(declarado)}) es distinto del valor esperado de {manualForm.coverProjectIds.length ? 'la inscripción' : 'este proyecto'} ({manualForm.currency === 'USD' ? fmtUsd(esperado) : fmtCop(esperado)}). Revisa el soporte antes de confirmar: los indicadores de recaudo suman la tarifa de cada proyecto, y lo recibido queda registrado tal como lo escribas.
                                        </div>
                                    );
                                })()}

                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-800 space-y-1.5">
                                    <div className="flex justify-between py-1 border-b border-slate-200">
                                        <span className="font-semibold text-slate-500">Postulación:</span>
                                        <span className="font-mono font-bold">{s.publicRef} · {s.projectName}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-slate-200">
                                        <span className="font-semibold text-slate-500">Referencia:</span>
                                        <span className="font-mono font-bold">{manualForm.reference}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-slate-200">
                                        <span className="font-semibold text-slate-500">Fecha del pago:</span>
                                        <span>{fmtDateTime(manualForm.paidAt)}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-slate-200">
                                        <span className="font-semibold text-slate-500">Valor y moneda:</span>
                                        <span className="font-bold text-emerald-700">{manualForm.currency === 'COP' ? fmtCop(Number(manualForm.amount)) : fmtUsd(Number(manualForm.amount))} {manualForm.currency}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-slate-200">
                                        <span className="font-semibold text-slate-500">Medio de pago:</span>
                                        <span>{manualForm.paymentMethod}</span>
                                    </div>
                                    {manualForm.coverProjectIds.length > 0 && (
                                        <div className="flex justify-between gap-3 py-1 border-b border-slate-200">
                                            <span className="font-semibold text-slate-500">Cubre también:</span>
                                            <span className="text-right">{(data?.registrationSummary?.lines || []).filter(l => manualForm.coverProjectIds.includes(l.submissionId)).map(l => `${l.label} — ${l.projectName}`).join(' · ')}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between gap-3 py-1 border-b border-slate-200">
                                        <span className="font-semibold text-slate-500">Comprobante adjunto:</span>
                                        <span className="break-all text-right">{manualForm.receipt ? manualForm.receipt.name : 'Sin archivo'}</span>
                                    </div>
                                    {manualForm.evidence.trim() && (
                                        <div className="flex justify-between gap-3 py-1 border-b border-slate-200">
                                            <span className="font-semibold text-slate-500">Referencia del soporte:</span>
                                            <span className="break-all text-right">{manualForm.evidence}</span>
                                        </div>
                                    )}
                                    <div className="py-1">
                                        <span className="font-semibold text-slate-500 block mb-0.5">Motivo:</span>
                                        <span className="italic">{manualForm.reason}</span>
                                    </div>
                                </div>

                                <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
                                    <button
                                        type="button"
                                        onClick={() => setManualStep('edit')}
                                        disabled={saving}
                                        className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        Modificar datos
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const ok = await action('confirm-manual-payment', {
                                                reference: manualForm.reference,
                                                paidAt: fechaInputAIso(manualForm.paidAt),
                                                amount: manualForm.amount,
                                                currency: manualForm.currency,
                                                paymentMethod: manualForm.paymentMethod,
                                                evidence: manualForm.evidence,
                                                reason: manualForm.reason,
                                                receipt: manualForm.receipt ? { key: manualForm.receipt.key, name: manualForm.receipt.name, contentType: manualForm.receipt.contentType } : null,
                                                coverProjectIds: manualForm.coverProjectIds,
                                            }, manualForm.coverProjectIds.length
                                                ? 'Pago confirmado: la inscripción completa quedó pagada y los formularios habilitados'
                                                : 'Pago confirmado y formularios habilitados exitosamente');
                                            // Sólo se cierra si se confirmó: con un error, lo escrito sigue ahí.
                                            if (ok) setShowManualModal(false);
                                        }}
                                        disabled={saving}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={14} />}
                                        Confirmar y desbloquear formularios
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
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
