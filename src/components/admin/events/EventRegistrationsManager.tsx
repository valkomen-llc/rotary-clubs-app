// ════════════════════════════════════════════════════════════════════
// Gestión de Inscripciones del Evento — v4.1130.0
//
// Tablero, tabla con filtros y ficha detallada de cada inscripción.
//
// Todo está acotado al evento que se está viendo: los filtros, los totales, la
// exportación y la ficha viajan siempre con su `eventRef`, así que la XII feria
// no muestra jamás datos de otra edición.
//
// La exportación a CSV y Excel la arma el servidor con los MISMOS filtros que
// están puestos en pantalla —lo que se ve es lo que se descarga—. El botón PDF
// genera el Informe Ejecutivo con el motor compartido `executiveReportPdf.ts`
// (el mismo sistema visual de Postulación de Proyectos): el período Desde/Hasta
// es la única fuente de verdad para KPIs, tabla y rótulo "Período analizado"
// (sin fechas = período completo del evento), validado contra el eco del
// servidor antes de renderizar.
//
// v4.1263 — Selección de uno o varios inscritos desde el listado, con tres
// acciones: editar (los datos completos de UNO, o un campo compartido de
// VARIOS), cambiar estado y eliminar. Mismo diseño que las inscripciones
// COLROTARIOS (v4.952 / v4.1092): la selección guarda filas mínimas y
// sobrevive a filtros y páginas, «seleccionar los N del filtro» lo resuelve el
// servidor con los mismos filtros del listado, y las acciones van por tandas y
// con el desenlace desglosado.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
    AlertCircle, BadgeCheck, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Coins,
    Download, FileSpreadsheet, FileText, Filter, Globe2, ListChecks, Loader2, Mail, Pencil,
    RefreshCw, Search, Send, Trash2, Users, X,
} from 'lucide-react';
import {
    money, statusMeta, tagMeta, SYSTEM_TAG_KEYS, normalizeTag, isFieldVisible, SETTLED_STATUSES,
    REGISTRATION_BULK_FIELDS, DELETE_BLOCK_LABELS,
} from '../../../lib/eventRegistrationSpec';
import type { FormField } from '../../../lib/eventRegistrationSpec';
import { chunkIds, BULK_MAX } from '../../../lib/completedRegistrationSpec';
import { PAID_REGISTRATION_STATUSES, REGISTRATION_TRANSFER_LABELS } from '../../../../server/lib/eventFundsSpec.js';
import type { RegistrationTransferState } from '../../../../server/lib/eventFundsSpec.js';
import RegistrationFundsPanel from './RegistrationFundsPanel';
import { fundsApi } from './funds/eventFundsApi';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

const PAGE_SIZE = 50;

/**
 * Campos que el formulario ya no pide y que las inscripciones anteriores sí
 * respondieron. Se rotulan para que la ficha siga siendo legible: el dato está
 * guardado y borrarlo del historial no es una opción.
 */
const RETIRED_LABELS: Record<string, string> = {
    rotaryRole: 'Cargo dentro de Rotary',      // hasta v4.707
    residenceCountry: 'País de residencia',    // hasta v4.707
    language: 'Idioma',                        // hasta v4.654
};

interface Registration {
    id: string;
    publicRef: string;
    registrationCode: string | null;
    status: string;
    categoryKey: string;
    categoryLabel: string;
    audience: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    country: string;
    city: string;
    district: string;
    documentNumber: string;
    clubName: string;
    rotaryRole: string;
    language: string;
    dietary: string;
    answers: Record<string, any>;
    tags: string[];
    pricing: Record<string, any>;
    baseCurrency: string;
    baseAmount: number;
    chargeCurrency: string;
    chargeAmount: number;
    fxRate: number | null;
    companionsCount: number;
    companionsAmount: number;
    stripeSessionId: string | null;
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
    stripeCustomerId: string | null;
    paymentMethod: string | null;
    receiptUrl: string | null;
    refundedAmount: number | null;
    notes: string | null;
    internalNotes: string | null;
    checkedInAt: string | null;
    paidAt: string | null;
    createdAt: string;
}

/** v4.1263 — Lo que la selección guarda de cada inscripción marcada. */
type PickedRow = Pick<Registration, 'id' | 'registrationCode' | 'publicRef' | 'firstName' | 'lastName' | 'email' | 'status' | 'checkedInAt'>;
const pickOf = (r: PickedRow): PickedRow => ({
    id: r.id, registrationCode: r.registrationCode, publicRef: r.publicRef,
    firstName: r.firstName, lastName: r.lastName, email: r.email, status: r.status, checkedInAt: r.checkedInAt,
});
const pickedName = (r: PickedRow) => `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.email || r.publicRef;

interface Filters {
    q: string; status: string; category: string; country: string; district: string;
    club: string; currency: string; payment: string; companions: string;
    tags: string; from: string; to: string; includeDrafts: string;
    /** v4.1259 — 'yes' acreditados, 'no' pendientes de acreditación. */
    accredited: string;
}

/**
 * v4.1259 — Filtros rápidos de un clic. Cada uno fija UNA de las tres
 * dimensiones (pago, acompañantes, acreditación) y limpia las otras dos: son
 * vistas, no una combinación. Los combinados siguen en «Filtros».
 */
const QUICK_FILTERS: { key: string; label: string; set: Partial<Filters> }[] = [
    { key: 'all', label: 'Todos', set: {} },
    { key: 'settled', label: 'Pago confirmado', set: { payment: 'settled' } },
    { key: 'pending', label: 'Pago pendiente', set: { payment: 'pending' } },
    { key: 'with', label: 'Con acompañantes', set: { companions: 'with' } },
    { key: 'without', label: 'Sin acompañantes', set: { companions: 'without' } },
    { key: 'accredited', label: 'Acreditados', set: { accredited: 'yes' } },
    { key: 'not_accredited', label: 'Pendientes de acreditación', set: { accredited: 'no' } },
];
const quickKeyOf = (f: Filters) =>
    QUICK_FILTERS.find(q => q.key !== 'all'
        && (q.set.payment || '') === f.payment && (q.set.companions || '') === f.companions
        && (q.set.accredited || '') === f.accredited)?.key
    || (!f.payment && !f.companions && !f.accredited ? 'all' : null);

const emptyFilters: Filters = {
    q: '', status: '', category: '', country: '', district: '',
    club: '', currency: '', payment: '', companions: '', tags: '',
    from: '', to: '', includeDrafts: 'false', accredited: '',
};

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500';

const fmtDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (value: string | null) =>
    value ? new Date(value).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Piezas pequeñas ──────────────────────────────────────────────────

const StatusPill = ({ status }: { status: string }) => {
    const meta = statusMeta(status);
    return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>;
};

const TagPill = ({ tag }: { tag: string }) => {
    const meta = tagMeta(tag);
    return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>;
};

const StatCard = ({ label, value, hint, icon: Icon }: {
    label: string; value: string | number; hint?: string; icon?: any;
}) => (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {Icon && <Icon className="h-3.5 w-3.5" />} {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
);

/** Barras horizontales simples: no vale la pena una librería para esto. */
const BarList = ({ title, rows, icon: Icon }: {
    title: string;
    rows: { label: string; total: number; extra?: string }[];
    icon?: any;
}) => {
    const max = Math.max(1, ...rows.map(r => r.total));
    return (
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                {Icon && <Icon className="h-3.5 w-3.5" />} {title}
            </p>
            {rows.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">Sin datos todavía.</p>
            ) : (
                <div className="space-y-2">
                    {rows.slice(0, 8).map(r => (
                        <div key={r.label}>
                            <div className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="truncate text-gray-700">{r.label}</span>
                                <span className="shrink-0 font-bold text-gray-900">
                                    {r.total}{r.extra ? <span className="ml-1 font-normal text-gray-400">{r.extra}</span> : null}
                                </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                <div className="h-full rounded-full bg-blue-500" style={{ width: `${(r.total / max) * 100}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Ficha detallada ──────────────────────────────────────────────────

const DetailSheet = ({ registrationId, statuses, onClose, onChanged, onEdit, reloadKey, fundsPanel }: {
    registrationId: string;
    statuses: { key: string; label: string }[];
    onClose: () => void;
    onChanged: () => void;
    /** v4.1263 — Abre la edición de los datos de esta inscripción. */
    onEdit: () => void;
    /** v4.1263 — Cambia al guardar la edición: la ficha se vuelve a leer. */
    reloadKey: number;
    /** v4.1249 — El bloque de traslado y comprobante (lo arma el listado, que
     *  ya tiene el estado financiero del evento). */
    fundsPanel?: ReactNode;
}) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [notes, setNotes] = useState('');
    const [tagInput, setTagInput] = useState('');
    const [statusComment, setStatusComment] = useState('');
    const [mail, setMail] = useState({ subject: '', body: '' });
    const [showMail, setShowMail] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${API}/event-registrations/admin/registrations/${registrationId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                if (d?.error) throw new Error(d.error);
                setData(d);
                setNotes(d.registration?.internalNotes || '');
            })
            .catch(err => setError(err?.message || 'No se pudo cargar la inscripción.'))
            .finally(() => setLoading(false));
    }, [registrationId, reloadKey]);

    useEffect(() => { load(); }, [load]);

    const call = async (path: string, method: string, body: any, label: string) => {
        setBusy(label);
        setError('');
        try {
            const res = await fetch(`${API}/event-registrations/admin/registrations/${registrationId}${path}`, {
                method, headers: authHeaders(), body: JSON.stringify(body),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result?.error || 'No se pudo completar la acción.');
            load();
            onChanged();
            return result;
        } catch (err: any) {
            setError(err?.message || 'No se pudo completar la acción.');
            return null;
        } finally {
            setBusy('');
        }
    };

    const registration: Registration | null = data?.registration || null;
    const manualTags: string[] = (registration?.tags || []).filter(t => !SYSTEM_TAG_KEYS.includes(t));

    /** Etiqueta legible de una respuesta, usando el formulario de su categoría. */
    const questionOf = (key: string): string => {
        for (const step of (data?.form?.steps || [])) {
            const field = step.fields.find((f: any) => f.key === key);
            if (field) {
                const option = field.options?.find((o: any) => o.value === registration?.answers?.[key]);
                return `${field.label}::${option?.label ?? ''}`;
            }
        }
        // Un campo RETIRADO ya no está en el formulario, pero sigue guardado en
        // las inscripciones que lo respondieron. Sin esto la ficha mostraba la
        // clave cruda («rotaryRole») como si fuera la pregunta.
        return `${RETIRED_LABELS[key] || key}::`;
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
            <div className="flex h-full w-full max-w-2xl flex-col bg-gray-50 shadow-2xl"
                onClick={e => e.stopPropagation()}>
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4">
                    <div className="min-w-0">
                        {loading ? (
                            <p className="text-sm text-gray-400">Cargando…</p>
                        ) : registration ? (
                            <>
                                <p className="font-mono text-xs font-bold text-gray-400">
                                    {registration.registrationCode || registration.publicRef}
                                </p>
                                <h3 className="truncate text-lg font-bold text-gray-900">
                                    {registration.firstName} {registration.lastName}
                                </h3>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    <StatusPill status={registration.status} />
                                    <span className="text-xs text-gray-500">{registration.categoryLabel}</span>
                                </div>
                            </>
                        ) : null}
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-6">
                    {error && (
                        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                        </div>
                    )}

                    {loading || !registration ? (
                        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                    ) : (
                        <>
                            {/* ── Estado y acciones ───────────────── */}
                            <section className="rounded-xl border border-gray-100 bg-white p-5">
                                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Estado</p>
                                <div className="flex flex-wrap items-end gap-2">
                                    <div className="min-w-[180px] flex-1">
                                        <label className={labelCls}>Cambiar a</label>
                                        <select className={inputCls} defaultValue=""
                                            onChange={e => {
                                                const next = e.target.value;
                                                e.target.value = '';
                                                if (next) call('/status', 'PATCH', { status: next, comment: statusComment }, 'status');
                                            }}>
                                            <option value="">Selecciona un estado…</option>
                                            {statuses.filter(s => s.key !== registration.status)
                                                .map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="min-w-[180px] flex-1">
                                        <label className={labelCls}>Comentario del cambio</label>
                                        <input type="text" className={inputCls} value={statusComment}
                                            onChange={e => setStatusComment(e.target.value)}
                                            placeholder="Queda en el historial" />
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button type="button" disabled={busy === 'checkin'}
                                        onClick={() => call('/checkin', 'POST', { undo: Boolean(registration.checkedInAt) }, 'checkin')}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">
                                        <BadgeCheck className="h-3.5 w-3.5" />
                                        {registration.checkedInAt ? 'Anular acreditación' : 'Acreditar'}
                                    </button>
                                    <button type="button" onClick={() => setShowMail(v => !v)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50">
                                        <Mail className="h-3.5 w-3.5" /> Enviar correo
                                    </button>
                                    <button type="button" onClick={onEdit}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50">
                                        <Pencil className="h-3.5 w-3.5" /> Editar datos
                                    </button>
                                </div>
                                {registration.checkedInAt && (
                                    <p className="mt-2 text-xs text-gray-500">
                                        Acreditado el {fmtDateTime(registration.checkedInAt)}
                                    </p>
                                )}

                                {showMail && (
                                    <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4">
                                        <input type="text" className={inputCls} placeholder="Asunto"
                                            value={mail.subject} onChange={e => setMail({ ...mail, subject: e.target.value })} />
                                        <textarea rows={4} className={inputCls} placeholder="Mensaje"
                                            value={mail.body} onChange={e => setMail({ ...mail, body: e.target.value })} />
                                        <button type="button" disabled={busy === 'mail' || !mail.subject || !mail.body}
                                            onClick={async () => {
                                                const ok = await call('/message', 'POST', { channel: 'email', ...mail }, 'mail');
                                                if (ok) { setMail({ subject: '', body: '' }); setShowMail(false); }
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50">
                                            {busy === 'mail' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                            Enviar a {registration.email}
                                        </button>
                                    </div>
                                )}
                            </section>

                            {fundsPanel}

                            {/* ── Etiquetas ───────────────────────── */}
                            <section className="rounded-xl border border-gray-100 bg-white p-5">
                                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Etiquetas</p>
                                <div className="mb-3 flex flex-wrap gap-1.5">
                                    {(registration.tags || []).map(t => (
                                        <span key={t} className="inline-flex items-center gap-1">
                                            <TagPill tag={t} />
                                            {!SYSTEM_TAG_KEYS.includes(t) && (
                                                <button type="button"
                                                    onClick={() => call('/tags', 'PATCH', { tags: manualTags.filter(x => x !== t) }, 'tags')}
                                                    className="text-gray-300 transition hover:text-red-500">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            )}
                                        </span>
                                    ))}
                                    {registration.tags.length === 0 && <span className="text-xs text-gray-400">Sin etiquetas.</span>}
                                </div>
                                <div className="flex gap-2">
                                    <input type="text" className={inputCls} value={tagInput}
                                        onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key !== 'Enter') return;
                                            e.preventDefault();
                                            const tag = normalizeTag(tagInput);
                                            if (!tag) return;
                                            call('/tags', 'PATCH', { tags: [...manualTags, tag] }, 'tags');
                                            setTagInput('');
                                        }}
                                        placeholder="Escribe una etiqueta y pulsa Enter (ej: requiere_visa)" />
                                </div>
                                <p className="mt-1.5 text-[11px] text-gray-400">
                                    Las etiquetas de sistema (categoría, pago, acompañantes) las pone el módulo y no se editan.
                                </p>
                            </section>

                            {/* ── Dinero ──────────────────────────── */}
                            <section className="rounded-xl border border-gray-100 bg-white p-5">
                                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Cobro</p>
                                <dl className="space-y-2 text-sm">
                                    <div className="flex justify-between"><dt className="text-gray-500">Valor publicado</dt>
                                        <dd className="font-bold text-gray-900">{money(registration.baseAmount, registration.baseCurrency)}</dd></div>
                                    {registration.chargeCurrency !== registration.baseCurrency && (
                                        <>
                                            <div className="flex justify-between"><dt className="text-gray-500">Cobrado por la pasarela</dt>
                                                <dd className="font-bold text-gray-900">{money(registration.chargeAmount, registration.chargeCurrency)}</dd></div>
                                            <div className="flex justify-between"><dt className="text-gray-500">Tasa aplicada</dt>
                                                <dd className="font-mono text-xs text-gray-700">
                                                    {registration.fxRate?.toLocaleString('es-CO', { maximumFractionDigits: 8 })}
                                                </dd></div>
                                        </>
                                    )}
                                    {registration.companionsCount > 0 && (
                                        <div className="flex justify-between"><dt className="text-gray-500">{registration.companionsCount} acompañante(s)</dt>
                                            <dd className="text-gray-700">{money(registration.companionsAmount, registration.baseCurrency)}</dd></div>
                                    )}
                                    {registration.refundedAmount ? (
                                        <div className="flex justify-between"><dt className="text-gray-500">Reembolsado</dt>
                                            <dd className="font-bold text-indigo-600">{money(registration.refundedAmount, registration.chargeCurrency)}</dd></div>
                                    ) : null}
                                    <div className="flex justify-between"><dt className="text-gray-500">Método</dt>
                                        <dd className="text-gray-700">{registration.paymentMethod || '—'}</dd></div>
                                    <div className="flex justify-between"><dt className="text-gray-500">Pagado el</dt>
                                        <dd className="text-gray-700">{fmtDateTime(registration.paidAt)}</dd></div>
                                </dl>
                                <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 font-mono text-[11px] text-gray-500">
                                    {([
                                        ['Checkout Session', registration.stripeSessionId],
                                        ['Payment Intent', registration.stripePaymentIntentId],
                                        ['Charge', registration.stripeChargeId],
                                        ['Customer', registration.stripeCustomerId],
                                    ] as [string, string | null][]).filter(([, v]) => v).map(([label, value]) => (
                                        <p key={label} className="truncate"><span className="text-gray-400">{label}:</span> {value}</p>
                                    ))}
                                </div>
                            </section>

                            {/* ── Respuestas del formulario ───────── */}
                            <section className="rounded-xl border border-gray-100 bg-white p-5">
                                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Formulario</p>
                                <dl className="divide-y divide-gray-50">
                                    {Object.entries(registration.answers || {})
                                        .filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false)
                                        .map(([key, value]) => {
                                            const [question, optionLabel] = questionOf(key).split('::');
                                            const shown = optionLabel || (Array.isArray(value) ? value.join(', ') : String(value));
                                            return (
                                                <div key={key} className="flex justify-between gap-4 py-2 text-sm">
                                                    <dt className="text-gray-500">{question}</dt>
                                                    <dd className="max-w-[55%] break-words text-right font-medium text-gray-900">{shown}</dd>
                                                </div>
                                            );
                                        })}
                                </dl>
                            </section>

                            {/* ── Acompañantes ────────────────────── */}
                            {(data.companions || []).length > 0 && (
                                <section className="rounded-xl border border-gray-100 bg-white p-5">
                                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
                                        Acompañantes ({data.companions.length})
                                    </p>
                                    <div className="space-y-2">
                                        {data.companions.map((c: any) => (
                                            <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-4 py-2.5">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-gray-900">{c.firstName} {c.lastName}</p>
                                                    <p className="truncate text-xs text-gray-500">
                                                        {[c.documentNumber, c.relationship, c.badgeCode].filter(Boolean).join(' · ')}
                                                    </p>
                                                </div>
                                                <button type="button" disabled={busy === 'companion'}
                                                    onClick={() => call('/checkin', 'POST', { companionId: c.id, undo: Boolean(c.checkedInAt) }, 'companion')}
                                                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${c.checkedInAt
                                                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                        : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
                                                    {c.checkedInAt ? 'Acreditado' : 'Acreditar'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* ── Notas internas ──────────────────── */}
                            <section className="rounded-xl border border-gray-100 bg-white p-5">
                                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Notas internas</p>
                                <textarea rows={4} className={inputCls} value={notes} onChange={e => setNotes(e.target.value)}
                                    placeholder="Sólo las ve el equipo." />
                                <button type="button" disabled={busy === 'notes'}
                                    onClick={() => call('/notes', 'PATCH', { internalNotes: notes }, 'notes')}
                                    className="mt-2 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50">
                                    {busy === 'notes' ? 'Guardando…' : 'Guardar notas'}
                                </button>
                            </section>

                            {/* ── Comunicaciones ──────────────────── */}
                            {(data.messages || []).length > 0 && (
                                <section className="rounded-xl border border-gray-100 bg-white p-5">
                                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Comunicaciones</p>
                                    <ul className="space-y-2">
                                        {data.messages.map((m: any) => (
                                            <li key={m.id} className="flex items-start justify-between gap-3 text-xs">
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold text-gray-800">{m.subject || m.template}</p>
                                                    <p className="text-gray-400">{m.channel} · {m.recipient}</p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className={m.status === 'failed' ? 'font-bold text-red-600' : 'text-emerald-600'}>
                                                        {m.status === 'failed' ? 'Falló' : 'Enviado'}
                                                    </p>
                                                    <p className="text-gray-400">{fmtDate(m.createdAt)}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            {/* ── Historial ───────────────────────── */}
                            <section className="rounded-xl border border-gray-100 bg-white p-5">
                                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Historial</p>
                                <ol className="space-y-3">
                                    {(data.history || []).map((h: any) => (
                                        <li key={h.id} className="border-l-2 border-gray-200 pl-3">
                                            <p className="text-xs font-semibold text-gray-800">
                                                {h.comment || h.type}
                                                {h.fromStatus && h.toStatus && (
                                                    <span className="ml-1 font-normal text-gray-400">
                                                        ({statusMeta(h.fromStatus).label} → {statusMeta(h.toStatus).label})
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[11px] text-gray-400">{h.actorName} · {fmtDateTime(h.createdAt)}</p>
                                        </li>
                                    ))}
                                    {(data.history || []).length === 0 && <li className="text-xs text-gray-400">Sin movimientos.</li>}
                                </ol>
                            </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Editar los datos de UNA inscripción (v4.1263) ────────────────────

/**
 * Los campos del formulario de SU categoría, con lo que respondió. El
 * formulario lo arma el servidor (llega en la ficha como `form`), así que una
 * categoría nueva o un campo nuevo se editan sin desplegar el navegador. Se
 * envía SÓLO lo que cambió; el servidor valida igual y actualiza la respuesta
 * y su columna juntas.
 */
const EditRegistrationModal = ({ registrationId, onClose, onSaved }: {
    registrationId: string;
    onClose: () => void;
    onSaved: () => void;
}) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [steps, setSteps] = useState<{ key: string; label: string; fields: FormField[] }[]>([]);
    const [original, setOriginal] = useState<Record<string, any>>({});
    const [draft, setDraft] = useState<Record<string, any>>({});
    const [title, setTitle] = useState('');

    useEffect(() => {
        setLoading(true);
        fetch(`${API}/event-registrations/admin/registrations/${registrationId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                if (d?.error) throw new Error(d.error);
                const answers = d.registration?.answers || {};
                setOriginal(answers);
                setDraft(answers);
                setTitle(`${d.registration?.firstName || ''} ${d.registration?.lastName || ''}`.trim());
                setSteps((d.form?.steps || []).map((st: any) => ({
                    key: st.key, label: st.label,
                    fields: (st.fields || []).filter((f: FormField) => f.key !== 'acceptTerms'),
                })));
            })
            .catch(err => setError(err?.message || 'No se pudo cargar la inscripción.'))
            .finally(() => setLoading(false));
    }, [registrationId]);

    const changedKeys = Object.keys(draft).filter(k => JSON.stringify(draft[k] ?? '') !== JSON.stringify(original[k] ?? ''));

    const save = async () => {
        setSaving(true);
        setError('');
        setFieldErrors({});
        try {
            const res = await fetch(`${API}/event-registrations/admin/registrations/${registrationId}`, {
                method: 'PATCH', headers: authHeaders(),
                body: JSON.stringify({ answers: Object.fromEntries(changedKeys.map(k => [k, draft[k]])) }),
            });
            const d = await res.json().catch(() => null);
            if (!res.ok) {
                setFieldErrors(d?.errors || {});
                throw new Error(d?.error || 'No se pudieron guardar los cambios.');
            }
            onSaved();
        } catch (err: any) {
            setError(err?.message || 'No se pudieron guardar los cambios.');
        } finally {
            setSaving(false);
        }
    };

    const set = (key: string, value: any) => setDraft(prev => ({ ...prev, [key]: value }));

    const control = (f: FormField) => {
        const value = draft[f.key];
        if (f.type === 'textarea') {
            return <textarea rows={3} className={inputCls} value={value ?? ''} onChange={e => set(f.key, e.target.value)} />;
        }
        if (f.type === 'select') {
            const known = (f.options || []).some(o => o.value === value);
            return (
                <select className={inputCls} value={value ?? ''} onChange={e => set(f.key, e.target.value)}>
                    <option value="">—</option>
                    {/* Un valor guardado que ya no figura en las opciones se
                        muestra tal cual: perderlo al abrir la edición sería
                        borrar un dato que nadie pidió cambiar. */}
                    {value && !known && <option value={value}>{String(value)} (valor anterior)</option>}
                    {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            );
        }
        if (f.type === 'multiselect') {
            const list: string[] = Array.isArray(value) ? value : [];
            return (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {(f.options || []).map(o => (
                        <label key={o.value} className="flex items-center gap-1.5 text-sm text-gray-700">
                            <input type="checkbox" className="h-4 w-4" checked={list.includes(o.value)}
                                onChange={e => set(f.key, e.target.checked ? [...list, o.value] : list.filter(v => v !== o.value))} />
                            {o.label}
                        </label>
                    ))}
                </div>
            );
        }
        if (f.type === 'checkbox') {
            return <input type="checkbox" className="h-4 w-4" checked={value === true} onChange={e => set(f.key, e.target.checked)} />;
        }
        const type = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text';
        return <input type={type} className={inputCls} value={value ?? ''} maxLength={f.max || undefined}
            onChange={e => set(f.key, e.target.value)} />;
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose()}>
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-900">Editar inscripción</h3>
                        {title && <p className="truncate text-sm text-gray-500" data-no-translate>{title}</p>}
                    </div>
                    <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar"
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    {error && (
                        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                        </div>
                    )}
                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                    ) : steps.map(step => (
                        <section key={step.key}>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">{step.label}</p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {step.fields.filter(f => isFieldVisible(f, draft)).map(f => (
                                    <div key={f.key} className={f.type === 'textarea' || f.type === 'multiselect' ? 'sm:col-span-2' : ''}>
                                        <label className={labelCls}>{f.label}</label>
                                        {control(f)}
                                        {fieldErrors[f.key] && <p className="mt-1 text-xs text-red-600">{fieldErrors[f.key]}</p>}
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                    {!loading && (
                        <p className="text-xs text-gray-500">
                            La categoría, el valor y el pago no se editan aquí: el precio quedó fijo al enviar el
                            formulario y el estado se cambia desde la ficha. Cada cambio queda en el historial.
                        </p>
                    )}
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
                    <button type="button" disabled={saving} onClick={onClose}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        Cancelar
                    </button>
                    <button type="button" disabled={saving || loading || !changedKeys.length} onClick={save}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {changedKeys.length ? `Guardar ${changedKeys.length} cambio${changedKeys.length === 1 ? '' : 's'}` : 'Sin cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Módulo ───────────────────────────────────────────────────────────

interface Props {
    eventId: string;
    eventTitle?: string;
    categories: { key: string; name: string }[];
    statuses: { key: string; label: string }[];
    clubId?: string;
}

/**
 * v4.1250 — El estado del TRASLADO de una inscripción, en UNA etiqueta (módulo
 * de Eventos, sin la Bóveda). El detalle vive en su ficha y en «Conciliación de
 * inscripciones».
 */
const TRANSFER_BADGE_CLS: Record<string, string> = {
    confirmado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    parcial: 'bg-amber-50 text-amber-800 border-amber-200',
    pendiente_verificacion: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    registrado: 'bg-sky-50 text-sky-700 border-sky-200',
    pendiente: 'bg-gray-50 text-gray-600 border-gray-200',
    sin_traslado: 'bg-amber-50 text-amber-800 border-amber-200',
};
const TransferBadge = ({ state }: { state: RegistrationTransferState }) => (
    <span title="Traslado al beneficiario del evento — detalle en la ficha"
        className={`mt-1 inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TRANSFER_BADGE_CLS[state] || TRANSFER_BADGE_CLS.pendiente}`}>
        {REGISTRATION_TRANSFER_LABELS[state]}
    </span>
);

const EventRegistrationsManager = ({ eventId, eventTitle, categories, statuses }: Props) => {
    const [dashboard, setDashboard] = useState<any>(null);
    const [rows, setRows] = useState<Registration[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState<Filters>(emptyFilters);
    const [showFilters, setShowFilters] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [exporting, setExporting] = useState('');
    // v4.1248 — inscripción → estados financieros. `null` = sin acceso a la
    // Bóveda (o todavía cargando): la columna simplemente no se pinta.
    // v4.1250 — inscripción → estado de su traslado (módulo de Eventos). `null`
    // = sin acceso a la información financiera: la etiqueta no se pinta.
    const [funds, setFunds] = useState<Record<string, RegistrationTransferState> | null>(null);
    const [fundsTick, setFundsTick] = useState(0);
    // v4.1263 — Selección y acciones sobre ella. Las filas se guardan (mínimas)
    // para que la selección sobreviva a cambiar de filtro o de página y la
    // confirmación pueda nombrarlas aunque ya no estén a la vista.
    const [picked, setPicked] = useState<Map<string, PickedRow>>(new Map());
    const [selectAllBusy, setSelectAllBusy] = useState(false);
    const [bulkAction, setBulkAction] = useState<'' | 'status' | 'edit' | 'delete'>('');
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkProgreso, setBulkProgreso] = useState<{ hechos: number; total: number } | null>(null);
    const [bulkNote, setBulkNote] = useState<{ ok: boolean; text: string } | null>(null);
    const [bulkStatusValue, setBulkStatusValue] = useState('');
    const [bulkComment, setBulkComment] = useState('');
    const [bulkField, setBulkField] = useState(REGISTRATION_BULK_FIELDS[0].key);
    const [bulkValue, setBulkValue] = useState('');
    const [editing, setEditing] = useState<string | null>(null);
    const [detailTick, setDetailTick] = useState(0);

    /** Los filtros activos, en el formato que espera el servidor. */
    const query = useMemo(() => {
        const params = new URLSearchParams({ eventRef: eventId });
        for (const [key, value] of Object.entries(filters)) {
            if (value && value !== 'false') params.set(key, value);
        }
        return params;
    }, [eventId, filters]);

    const loadDashboard = useCallback(() => {
        fetch(`${API}/event-registrations/admin/dashboard?${query}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { if (!d?.error) setDashboard(d); })
            .catch(() => { /* la tabla sigue sirviendo sin el tablero */ });
    }, [query]);

    const loadRows = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams(query);
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(offset));
        fetch(`${API}/event-registrations/admin/list?${params}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                if (d?.error) throw new Error(d.error);
                setRows(d.registrations || []);
                setTotal(d.total || 0);
            })
            .catch(err => setError(err?.message || 'No se pudieron cargar las inscripciones.'))
            .finally(() => setLoading(false));
    }, [query, offset]);

    useEffect(() => {
        fundsApi.overview(eventId)
            .then(d => setFunds(Object.fromEntries(d.registrations.map(r => [r.id, r.transferState]))))
            .catch(() => setFunds(null));
    }, [eventId, fundsTick]);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);
    useEffect(() => { loadRows(); }, [loadRows]);
    // Cambiar un filtro devuelve a la primera página: si no, se podría quedar
    // en una página que ya no existe con el filtro nuevo.
    useEffect(() => { setOffset(0); }, [filters]);

    const refresh = () => { loadRows(); loadDashboard(); };

    // ── Selección (v4.1263) ─────────────────────────────────────────
    const togglePick = (r: Registration) => setPicked(prev => {
        const next = new Map(prev);
        if (next.has(r.id)) next.delete(r.id); else next.set(r.id, pickOf(r));
        return next;
    });
    const allVisiblePicked = rows.length > 0 && rows.every(r => picked.has(r.id));
    // La casilla de la cabecera marca SÓLO lo visible, que es lo que promete;
    // «los N del filtro» es otro gesto y dice su número (regla v4.1092).
    const toggleVisible = () => setPicked(prev => {
        const next = new Map(prev);
        if (allVisiblePicked) rows.forEach(r => next.delete(r.id));
        else rows.forEach(r => next.set(r.id, pickOf(r)));
        return next;
    });
    const pickedRows = [...picked.values()];
    const acreditadosEnSeleccion = pickedRows.filter(r => r.checkedInAt || ['accredited', 'attended'].includes(r.status)).length;
    const pagadosEnSeleccion = pickedRows.filter(r => SETTLED_STATUSES.includes(r.status)).length;

    /** Todo lo que coincide con el filtro, resuelto por el servidor con los MISMOS filtros. */
    const selectAllMatching = async () => {
        setSelectAllBusy(true);
        setBulkNote(null);
        try {
            const res = await fetch(`${API}/event-registrations/admin/registrations/select-all?${query}`, { headers: authHeaders() });
            const d = await res.json().catch(() => null);
            if (!res.ok) throw new Error(d?.error || 'No se pudo resolver la selección completa.');
            const filas: PickedRow[] = d.registrations || [];
            setPicked(new Map(filas.map(r => [r.id, r])));
            const partes = [`Seleccionadas ${filas.length} inscripción(es) con el filtro actual.`];
            if (d.truncated) {
                partes.push(`Es el máximo por selección (${d.max}): quedaron ${Math.max(0, total - filas.length)} fuera — acota el filtro y repite la acción con el resto.`);
            }
            setBulkNote({ ok: !d.truncated, text: partes.join(' ') });
        } catch (err: any) {
            setBulkNote({ ok: false, text: err?.message || 'No se pudo resolver la selección completa.' });
        } finally {
            setSelectAllBusy(false);
        }
    };

    /** «Editar»: con UNA marcada abre sus datos completos; con varias, un campo compartido. */
    const startEdit = () => {
        if (picked.size === 1) { setEditing(pickedRows[0].id); return; }
        setBulkValue('');
        setBulkAction('edit');
    };

    /**
     * Manda la acción en TANDAS de `BULK_MAX` y ACUMULA los desenlaces: el
     * resumen se escribe contra el total seleccionado, no contra la última
     * tanda. Ninguna tanda es atómica y se dice.
     */
    const runBulk = async () => {
        const ids = [...picked.keys()];
        if (!ids.length || !bulkAction) return;
        setBulkBusy(true);
        setBulkNote(null);
        const tandas = chunkIds(ids, BULK_MAX);
        if (tandas.length > 1) setBulkProgreso({ hechos: 0, total: ids.length });
        try {
            const path = bulkAction === 'status' ? 'bulk-status' : bulkAction === 'edit' ? 'bulk-edit' : 'bulk-delete';
            const t: Record<string, number> = {};
            const conservadas: { id: string; code: string | null; name: string; motivo: string }[] = [];
            const borradas: string[] = [];
            for (const tanda of tandas) {
                const body: Record<string, unknown> = { eventRef: eventId, ids: tanda, confirm: true };
                if (bulkAction === 'status') { body.status = bulkStatusValue; body.comment = bulkComment.trim(); }
                if (bulkAction === 'edit') { body.field = bulkField; body.value = bulkValue.trim(); }
                const res = await fetch(`${API}/event-registrations/admin/registrations/${path}`, {
                    method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
                });
                const d = await res.json().catch(() => null);
                if (!res.ok) throw new Error(d?.error || 'No se pudo completar la acción en bloque.');
                for (const [k, v] of Object.entries(d?.totals || {})) t[k] = (t[k] || 0) + Number(v || 0);
                for (const o of (d?.outcomes || [])) {
                    if (o.outcome === 'conservada') {
                        const fila = picked.get(o.id);
                        conservadas.push({
                            id: o.id, motivo: o.motivo,
                            code: fila?.registrationCode || fila?.publicRef || null,
                            name: fila ? pickedName(fila) : (o.name || o.id),
                        });
                    }
                    if (o.outcome === 'borrada') borradas.push(o.id);
                }
                setBulkProgreso(prev => (prev ? { hechos: prev.hechos + tanda.length, total: ids.length } : prev));
            }
            const partes: string[] = [];
            if (bulkAction === 'status') partes.push(`Se cambió el estado de ${t.cambiadas ?? 0} de ${ids.length}.`);
            if (bulkAction === 'edit') partes.push(`Se editaron ${t.editadas ?? 0} de ${ids.length}.`);
            if (bulkAction === 'delete') partes.push(`Se eliminaron ${t.borradas ?? 0} de ${ids.length}.`);
            if (t.sinCambio) partes.push(`${t.sinCambio} ya estaban así.`);
            if (t.noEncontradas) partes.push(`${t.noEncontradas} ya no existen.`);
            if (t.errores) partes.push(`${t.errores} fallaron.`);
            if (conservadas.length) {
                const nombres = conservadas.slice(0, 8)
                    .map(c => `${c.code || c.name} (${DELETE_BLOCK_LABELS[c.motivo] || c.motivo})`).join(', ');
                partes.push(`Se conservaron ${conservadas.length}: ${nombres}${conservadas.length > 8 ? ` y ${conservadas.length - 8} más` : ''}.`);
            }
            setBulkNote({ ok: !(t.errores ?? 0) && !conservadas.length, text: partes.join(' ') });
            setBulkAction('');
            // Tras eliminar, lo conservado sigue marcado: es lo que queda por
            // resolver. Tras editar o cambiar estado, la selección se suelta.
            setPicked(prev => {
                if (bulkAction !== 'delete') return new Map();
                const next = new Map(prev);
                borradas.forEach(id => next.delete(id));
                return next;
            });
            if (bulkAction === 'delete') setFundsTick(x => x + 1);
            refresh();
        } catch (err: any) {
            setBulkNote({ ok: false, text: err?.message || 'No se pudo completar la acción en bloque.' });
            refresh();
        } finally {
            setBulkBusy(false);
            setBulkProgreso(null);
        }
    };

    const download = async (format: 'csv' | 'xlsx') => {
        setExporting(format);
        try {
            const res = await fetch(`${API}/event-registrations/admin/export.${format}?${query}`, { headers: authHeaders() });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inscripciones-${eventId}.${format}`;
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            setError('No pudimos exportar las inscripciones.');
        } finally {
            setExporting('');
        }
    };

    /** Informe ejecutivo en PDF (motor compartido con Postulación). */
    const downloadPdf = async () => {
        setExporting('pdf');
        setError('');
        try {
            // 1) Tablero fresco con los MISMOS filtros aplicados (KPIs + branding con logo).
            const dashParams = new URLSearchParams(query);
            dashParams.set('logoData', '1');
            const dashRes = await fetch(
                `${API}/event-registrations/admin/dashboard?${dashParams}`, { headers: authHeaders() });
            const dash = await dashRes.json().catch(() => null);
            if (!dashRes.ok || dash?.error || !dash) {
                throw new Error(dash?.error || 'No se pudo cargar el tablero para el informe.');
            }

            // 2) Listado COMPLETO con los MISMOS filtros para la tabla detallada.
            const all: any[] = [];
            let poffset = 0;
            for (;;) {
                const lp = new URLSearchParams(query);
                lp.set('limit', '200');
                lp.set('offset', String(poffset));
                const res = await fetch(`${API}/event-registrations/admin/list?${lp}`, { headers: authHeaders() });
                const d = await res.json().catch(() => null);
                if (!res.ok || d?.error) throw new Error(d?.error || 'No se pudieron cargar las inscripciones.');
                all.push(...(d.registrations || []));
                const total = d?.total || 0;
                poffset += (d.registrations || []).length;
                if (all.length >= total || !(d.registrations || []).length || poffset >= 5000) break;
            }

            const today = new Date().toISOString().slice(0, 10);
            const fileName = `feria-proyectos-eventos-${today}.pdf`;

            const { generateEventReportPdf } = await import('../../../lib/eventReportPdf');
            await generateEventReportPdf({
                event: {
                    title: dash?.event?.title || eventTitle,
                    location: dash?.event?.location || null,
                    startDate: dash?.event?.startDate || null,
                    endDate: dash?.event?.endDate || null,
                },
                period: dash?.period || null,
                dashboard: dash,
                registrations: all,
                branding: dash?.branding || null,
                generatedAt: new Date().toISOString(),
            }, { fileName });

        } catch (err: any) {
            console.error('[EventRegistrationsManager] downloadPdf error:', err);
            setError(`No pudimos generar el informe en PDF: ${err?.message || 'Error inesperado'}`);
        } finally {
            setExporting('');
        }
    };

    const t = dashboard?.totals || {};
    const activeFilters = Object.entries(filters).filter(([k, v]) => v && v !== 'false' && k !== 'includeDrafts').length;

    return (
        <div className="space-y-5">
            {/* ── Tablero ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Inscripciones" value={t.registrations ?? 0} icon={Users}
                    hint={`${t.people ?? 0} personas con acompañantes`} />
                <StatCard label="Pago confirmado" value={t.settled ?? 0} icon={BadgeCheck}
                    hint={`${t.pending ?? 0} pendientes · ${t.failed ?? 0} fallidos`} />
                <StatCard label="Acompañantes" value={t.companions ?? 0} icon={Users}
                    hint={`${t.companionsAccredited ?? 0} acreditados`} />
                <StatCard label="Acreditados" value={t.accredited ?? 0} icon={CalendarDays}
                    hint={`${t.waitlist ?? 0} en lista de espera`} />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Países" value={t.countries ?? 0} icon={Globe2} />
                <StatCard label="Distritos" value={t.districts ?? 0} />
                <StatCard label="Clubes" value={t.clubs ?? 0} />
                <StatCard label="Reembolsos" value={t.refunded ?? 0} />
            </div>

            {/* Recaudo por moneda: el publicado y, si hubo conversión, el cobrado */}
            {(dashboard?.byCurrency || []).length > 0 && (
                <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                        <Coins className="h-3.5 w-3.5" /> Recaudo por moneda
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {dashboard.byCurrency.map((c: any) => (
                            <div key={c.currency} className="rounded-lg bg-gray-50 px-4 py-3">
                                <p className="text-xs text-gray-500">{c.total} inscripción(es)</p>
                                <p className="text-xl font-bold text-gray-900">{money(c.base, c.currency)}</p>
                                {c.chargeCurrency && c.chargeCurrency !== c.currency && (
                                    <p className="mt-0.5 text-xs text-gray-400">
                                        cobrado {money(c.charged, c.chargeCurrency)}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid gap-3 lg:grid-cols-3">
                <BarList title="Por categoría" icon={Users}
                    rows={(dashboard?.byCategory || []).map((c: any) => ({
                        label: c.categoryLabel || c.categoryKey, total: c.total,
                        extra: c.revenue ? money(c.revenue, c.currency) : undefined,
                    }))} />
                <BarList title="Por país" icon={Globe2}
                    rows={(dashboard?.byCountry || []).map((c: any) => ({ label: c.country, total: c.total }))} />
                <BarList title="Por club" rows={(dashboard?.byClub || []).map((c: any) => ({ label: c.clubName, total: c.total }))} />
            </div>

            {/* Evolución diaria */}
            {(dashboard?.timeline || []).length > 1 && (
                <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Evolución de registros</p>
                    <div className="flex h-24 items-end gap-1 overflow-x-auto">
                        {dashboard.timeline.map((d: any) => {
                            const max = Math.max(...dashboard.timeline.map((x: any) => x.total));
                            return (
                                <div key={d.day} className="group relative flex min-w-[8px] flex-1 flex-col justify-end"
                                    title={`${d.day}: ${d.total} registro(s), ${d.settled} confirmado(s)`}>
                                    <div className="w-full rounded-t bg-blue-200" style={{ height: `${(d.total / max) * 90}px` }} />
                                    <div className="w-full rounded-b bg-blue-600" style={{ height: `${(d.settled / max) * 90}px` }} />
                                </div>
                            );
                        })}
                    </div>
                    <p className="mt-2 text-[11px] text-gray-400">
                        Azul oscuro: con pago confirmado. Claro: total de registros del día.
                    </p>
                </div>
            )}

            {/* ── Barra de acciones ───────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })}
                        placeholder="Buscar por nombre, correo, código, documento o club…"
                        className={`${inputCls} pl-9`} />
                </div>
                <button type="button" onClick={() => setShowFilters(v => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${activeFilters
                        ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                    <Filter className="h-4 w-4" /> Filtros{activeFilters ? ` (${activeFilters})` : ''}
                </button>
                <button type="button" onClick={refresh}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                </button>
                <button type="button" onClick={() => download('csv')} disabled={Boolean(exporting)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">
                    {exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} CSV
                </button>
                <button type="button" onClick={() => download('xlsx')} disabled={Boolean(exporting)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">
                    {exporting === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
                </button>
                <button type="button" onClick={downloadPdf} disabled={Boolean(exporting)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">
                    {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    {exporting === 'pdf' ? 'Generando informe…' : 'PDF'}
                </button>
            </div>

            {/* v4.1259 — Filtros rápidos */}
            <div className="flex flex-wrap gap-2">
                {QUICK_FILTERS.map(q => {
                    const activo = quickKeyOf(filters) === q.key;
                    return (
                        <button key={q.key} type="button"
                            onClick={() => setFilters({ ...filters, payment: '', companions: '', accredited: '', ...q.set })}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${activo
                                ? 'bg-blue-700 text-white ring-transparent' : 'bg-white text-gray-600 ring-gray-300 hover:bg-gray-50'}`}>
                            {q.label}
                        </button>
                    );
                })}
            </div>

            {/* v4.1263 — Acciones sobre la selección. Aparece al marcar la
                primera casilla; la selección sobrevive a filtros y páginas y el
                contador lo dice. */}
            {(picked.size > 0 || total > 0) && (
                <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 ${picked.size
                    ? 'border-blue-200 bg-blue-50/70' : 'border-gray-100 bg-white'}`}>
                    <span className={`text-sm font-semibold ${picked.size ? 'text-blue-900' : 'text-gray-500'}`}>
                        {picked.size
                            ? `${picked.size} seleccionada${picked.size === 1 ? '' : 's'}`
                            : 'Marca una o varias inscripciones para editarlas o eliminarlas'}
                        {picked.size > rows.filter(r => picked.has(r.id)).length ? ' (incluye inscripciones fuera de esta vista)' : ''}
                    </span>
                    {picked.size > 0 && (<>
                        <button type="button" disabled={bulkBusy} onClick={startEdit}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">
                            <Pencil className="h-4 w-4" /> {picked.size === 1 ? 'Editar' : `Editar campo (${picked.size})`}
                        </button>
                        <button type="button" disabled={bulkBusy}
                            onClick={() => { setBulkStatusValue(''); setBulkComment(''); setBulkAction('status'); }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">
                            <ListChecks className="h-4 w-4" /> Cambiar estado ({picked.size})
                        </button>
                        <button type="button" disabled={bulkBusy} onClick={() => setBulkAction('delete')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">
                            <Trash2 className="h-4 w-4" /> Eliminar ({picked.size})
                        </button>
                    </>)}
                    {total > picked.size && total > rows.length && (
                        <button type="button" disabled={selectAllBusy || bulkBusy} onClick={selectAllMatching}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">
                            {selectAllBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                            Seleccionar las {total} que coinciden con el filtro
                        </button>
                    )}
                    {picked.size > 0 && (
                        <button type="button" disabled={bulkBusy} onClick={() => setPicked(new Map())}
                            className="text-sm font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-40">
                            Limpiar selección
                        </button>
                    )}
                </div>
            )}
            {bulkNote && (
                <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                    bulkNote.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
                    <span>{bulkNote.text}</span>
                    <button type="button" onClick={() => setBulkNote(null)} aria-label="Cerrar el aviso"
                        className="shrink-0 text-current opacity-60 hover:opacity-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {showFilters && (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <label className={labelCls}>Categoría</label>
                        <select className={inputCls} value={filters.category}
                            onChange={e => setFilters({ ...filters, category: e.target.value })}>
                            <option value="">Todas</option>
                            {categories.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Estado</label>
                        <select className={inputCls} value={filters.status}
                            onChange={e => setFilters({ ...filters, status: e.target.value })}>
                            <option value="">Todos (sin borradores)</option>
                            {statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Estado del pago</label>
                        <select className={inputCls} value={filters.payment}
                            onChange={e => setFilters({ ...filters, payment: e.target.value })}>
                            <option value="">Cualquiera</option>
                            <option value="settled">Confirmado</option>
                            <option value="pending">Pendiente</option>
                            <option value="failed">Fallido o expirado</option>
                            <option value="refunded">Reembolsado</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Acompañantes</label>
                        <select className={inputCls} value={filters.companions}
                            onChange={e => setFilters({ ...filters, companions: e.target.value })}>
                            <option value="">Cualquiera</option>
                            <option value="with">Con acompañantes</option>
                            <option value="without">Sin acompañantes</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>País</label>
                        <input type="text" className={inputCls} value={filters.country}
                            onChange={e => setFilters({ ...filters, country: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelCls}>Distrito</label>
                        <input type="text" className={inputCls} value={filters.district}
                            onChange={e => setFilters({ ...filters, district: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelCls}>Club</label>
                        <input type="text" className={inputCls} value={filters.club}
                            onChange={e => setFilters({ ...filters, club: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelCls}>Moneda</label>
                        <input type="text" className={inputCls} value={filters.currency} maxLength={3}
                            onChange={e => setFilters({ ...filters, currency: e.target.value.toUpperCase() })}
                            placeholder="USD / COP" />
                    </div>
                    <div>
                        <label className={labelCls}>Etiquetas (separadas por coma)</label>
                        <input type="text" className={inputCls} value={filters.tags}
                            onChange={e => setFilters({ ...filters, tags: e.target.value })}
                            placeholder="requiere_visa, prioridad_logistica" />
                    </div>
                    <div>
                        <label className={labelCls}>Desde</label>
                        <input type="date" className={inputCls} value={filters.from}
                            onChange={e => setFilters({ ...filters, from: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelCls}>Hasta</label>
                        <input type="date" className={inputCls} value={filters.to}
                            onChange={e => setFilters({ ...filters, to: e.target.value })} />
                    </div>
                    <div className="flex items-end gap-3">
                        <button type="button"
                            onClick={() => setFilters({ ...filters, from: '', to: '' })}
                            title="El informe PDF cubre todas las inscripciones del evento"
                            className="mb-1 whitespace-nowrap text-sm font-semibold text-blue-600 hover:underline">
                            Período completo del evento
                        </button>
                    </div>
                    <div className="flex items-end gap-3">
                        <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
                            <input type="checkbox" className="h-4 w-4" checked={filters.includeDrafts === 'true'}
                                onChange={e => setFilters({ ...filters, includeDrafts: e.target.checked ? 'true' : 'false' })} />
                            Ver borradores
                        </label>
                        <button type="button" onClick={() => setFilters(emptyFilters)}
                            className="mb-1 text-sm font-semibold text-blue-600 hover:underline">Limpiar</button>
                    </div>
                </div>
            )}

            {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {/* ── Tabla ───────────────────────────────────────────── */}
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
                <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        <tr>
                            <th className="w-10 px-4 py-3">
                                <input type="checkbox" className="h-4 w-4 cursor-pointer"
                                    aria-label="Seleccionar todas las inscripciones visibles"
                                    checked={allVisiblePicked} disabled={!rows.length}
                                    onChange={toggleVisible} />
                            </th>
                            <th className="px-4 py-3">Código</th>
                            <th className="px-4 py-3">Titular</th>
                            <th className="px-4 py-3">Categoría</th>
                            <th className="px-4 py-3">País / Club</th>
                            <th className="px-4 py-3 text-center">Acomp.</th>
                            <th className="px-4 py-3 text-right">Valor</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3">Fecha</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading && rows.length === 0 ? (
                            <tr><td colSpan={9} className="py-12 text-center">
                                <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
                            </td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={9} className="py-12 text-center text-sm text-gray-400">
                                No hay inscripciones que coincidan con estos filtros.
                            </td></tr>
                        ) : rows.map(r => (
                            <tr key={r.id} onClick={() => setSelected(r.id)}
                                className={`cursor-pointer transition hover:bg-blue-50/40 ${picked.has(r.id) ? 'bg-blue-50/60' : ''}`}>
                                {/* La casilla no abre la ficha: marcar y abrir son dos gestos. */}
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" className="h-4 w-4 cursor-pointer"
                                        aria-label={`Seleccionar: ${r.firstName} ${r.lastName}`.trim()}
                                        checked={picked.has(r.id)} onChange={() => togglePick(r)} />
                                </td>
                                <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">
                                    {r.registrationCode || r.publicRef}
                                </td>
                                <td className="px-4 py-3">
                                    <p className="font-semibold text-gray-900">{r.firstName} {r.lastName}</p>
                                    <p className="text-xs text-gray-500">{r.email}</p>
                                    {r.tags.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {r.tags.slice(0, 3).map(tag => <TagPill key={tag} tag={tag} />)}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-gray-700">{r.categoryLabel}</td>
                                <td className="px-4 py-3">
                                    <p className="text-gray-700">{r.country || '—'}</p>
                                    <p className="text-xs text-gray-500">
                                        {[r.clubName, r.district && `D. ${r.district}`].filter(Boolean).join(' · ') || '—'}
                                    </p>
                                </td>
                                <td className="px-4 py-3 text-center text-gray-700">{r.companionsCount || '—'}</td>
                                <td className="px-4 py-3 text-right">
                                    <p className="font-semibold text-gray-900">{money(r.baseAmount, r.baseCurrency)}</p>
                                    {r.chargeCurrency !== r.baseCurrency && (
                                        <p className="text-[11px] text-gray-400">
                                            cobrado {money(r.chargeAmount, r.chargeCurrency)}
                                        </p>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <StatusPill status={r.status} />
                                    {funds?.[r.id] && PAID_REGISTRATION_STATUSES.includes(r.status) && (
                                        <div><TransferBadge state={funds[r.id]} /></div>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(r.createdAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Paginación */}
            {total > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3 text-sm">
                    <p className="text-gray-500">
                        {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total}
                    </p>
                    <div className="flex gap-2">
                        <button type="button" disabled={offset === 0}
                            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 disabled:opacity-40">
                            <ChevronLeft className="h-4 w-4" /> Anterior
                        </button>
                        <button type="button" disabled={offset + PAGE_SIZE >= total}
                            onClick={() => setOffset(offset + PAGE_SIZE)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 disabled:opacity-40">
                            Siguiente <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {selected && (
                <DetailSheet registrationId={selected} statuses={statuses}
                    onClose={() => setSelected(null)} onChanged={refresh}
                    onEdit={() => setEditing(selected)} reloadKey={detailTick}
                    fundsPanel={funds ? (
                        <RegistrationFundsPanel
                            eventId={eventId}
                            registrationId={selected}
                            onChanged={() => setFundsTick(t => t + 1)}
                        />
                    ) : null} />
            )}

            {editing && (
                <EditRegistrationModal registrationId={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        setDetailTick(x => x + 1);
                        setBulkNote({ ok: true, text: 'Se guardaron los cambios de la inscripción.' });
                        // La fila marcada se renueva al recargar: su nombre
                        // pudo cambiar y la confirmación lo va a nombrar.
                        setPicked(new Map());
                        refresh();
                    }} />
            )}

            {bulkAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    onClick={() => !bulkBusy && setBulkAction('')}>
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="mb-1 text-lg font-bold text-gray-900">
                            {bulkAction === 'status' && `Cambiar el estado de ${picked.size} ${picked.size === 1 ? 'inscripción' : 'inscripciones'}`}
                            {bulkAction === 'edit' && `Editar un campo en ${picked.size} inscripciones`}
                            {bulkAction === 'delete' && `Eliminar ${picked.size} ${picked.size === 1 ? 'inscripción' : 'inscripciones'}`}
                        </h3>
                        {/* Dice A QUIÉNES, no «¿estás seguro?». */}
                        <p className="mb-4 text-sm text-gray-500" data-no-translate>
                            {pickedRows.slice(0, 8).map(pickedName).join(' · ')}
                            {picked.size > 8 ? ` · y ${picked.size - 8} más` : ''}
                        </p>

                        {bulkAction === 'status' && (
                            <div className="space-y-3">
                                <div>
                                    <label className={labelCls}>Nuevo estado</label>
                                    <select className={inputCls} value={bulkStatusValue}
                                        onChange={e => setBulkStatusValue(e.target.value)}>
                                        <option value="">Elige un estado…</option>
                                        {statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Comentario del cambio</label>
                                    <input type="text" className={inputCls} value={bulkComment}
                                        onChange={e => setBulkComment(e.target.value)}
                                        placeholder="Queda en el historial de cada inscripción" />
                                </div>
                                <p className="text-xs text-gray-500">
                                    Cambiar el estado no mueve dinero: marcar «Reembolsado» no devuelve el pago.
                                    Hacia o desde un estado con pago confirmado se necesita el permiso de pagos.
                                </p>
                            </div>
                        )}

                        {bulkAction === 'edit' && (
                            <div className="space-y-3">
                                <div>
                                    <label className={labelCls}>Campo</label>
                                    <select className={inputCls} value={bulkField}
                                        onChange={e => { setBulkField(e.target.value); setBulkValue(''); }}>
                                        {REGISTRATION_BULK_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Valor que recibirán todas las seleccionadas</label>
                                    <input type="text" className={inputCls} value={bulkValue}
                                        onChange={e => setBulkValue(e.target.value)} />
                                </div>
                                <p className="text-xs text-gray-500">
                                    Los datos de identidad (nombre, documento, correo, teléfono) no se editan en
                                    bloque a propósito: el mismo valor en varias personas destruiría información.
                                    Para corregirlos, marca una sola inscripción y pulsa «Editar».
                                </p>
                            </div>
                        )}

                        {bulkAction === 'delete' && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                                Esta acción no se puede deshacer: se eliminan la inscripción y sus acompañantes.
                                Se <strong>conservan</strong> y se nombran en el resultado las inscripciones ya
                                acreditadas y las incluidas en un traslado de la conciliación.
                                {/* El número se DICE antes de confirmar, no después. */}
                                {acreditadosEnSeleccion > 0 && (
                                    <span className="mt-2 block font-semibold">
                                        {acreditadosEnSeleccion} de las {picked.size} seleccionadas
                                        {acreditadosEnSeleccion === 1 ? ' está acreditada y se conservará.' : ' están acreditadas y se conservarán.'}
                                    </span>
                                )}
                                {pagadosEnSeleccion > 0 && (
                                    <span className="mt-2 block font-semibold">
                                        {pagadosEnSeleccion} {pagadosEnSeleccion === 1 ? 'tiene' : 'tienen'} el pago confirmado.
                                        Eliminar no reembolsa: el pago queda registrado y, si corresponde, se
                                        devuelve en la pasarela.
                                    </span>
                                )}
                            </div>
                        )}

                        {bulkProgreso && (
                            <p className="mt-3 text-xs font-semibold text-blue-700">
                                Procesando… {bulkProgreso.hechos} de {bulkProgreso.total}
                            </p>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <button type="button" disabled={bulkBusy} onClick={() => setBulkAction('')}
                                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                Cancelar
                            </button>
                            <button type="button" onClick={runBulk}
                                disabled={bulkBusy || (bulkAction === 'status' && !bulkStatusValue)}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                                    bulkAction === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                {bulkBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                                {bulkAction === 'status' && 'Cambiar estado'}
                                {bulkAction === 'edit' && 'Aplicar a todas'}
                                {bulkAction === 'delete' && `Eliminar ${picked.size}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EventRegistrationsManager;
