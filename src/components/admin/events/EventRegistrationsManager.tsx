// ════════════════════════════════════════════════════════════════════
// Gestión de Inscripciones del Evento — v4.648.0
//
// Tablero, tabla con filtros y ficha detallada de cada inscripción.
//
// Todo está acotado al evento que se está viendo: los filtros, los totales, la
// exportación y la ficha viajan siempre con su `eventRef`, así que la XII feria
// no muestra jamás datos de otra edición.
//
// La exportación a CSV y Excel la arma el servidor con los MISMOS filtros que
// están puestos en pantalla —lo que se ve es lo que se descarga—. El PDF se
// arma aquí con jsPDF, que ya usa el resto del panel.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Coins,
    Download, FileSpreadsheet, FileText, Filter, Globe2, Loader2, Mail, RefreshCw,
    Search, Send, Users, X,
} from 'lucide-react';
import { money, statusMeta, tagMeta, SYSTEM_TAG_KEYS, normalizeTag } from '../../../lib/eventRegistrationSpec';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

const PAGE_SIZE = 50;

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

interface Filters {
    q: string; status: string; category: string; country: string; district: string;
    club: string; currency: string; payment: string; companions: string;
    tags: string; from: string; to: string; includeDrafts: string;
}

const emptyFilters: Filters = {
    q: '', status: '', category: '', country: '', district: '',
    club: '', currency: '', payment: '', companions: '', tags: '',
    from: '', to: '', includeDrafts: 'false',
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

const DetailSheet = ({ registrationId, statuses, onClose, onChanged }: {
    registrationId: string;
    statuses: { key: string; label: string }[];
    onClose: () => void;
    onChanged: () => void;
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
    }, [registrationId]);

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
        return `${key}::`;
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

// ── Módulo ───────────────────────────────────────────────────────────

interface Props {
    eventId: string;
    eventTitle?: string;
    categories: { key: string; name: string }[];
    statuses: { key: string; label: string }[];
}

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

    /** Los filtros activos, en el formato que espera el servidor. */
    const query = useMemo(() => {
        const params = new URLSearchParams({ eventRef: eventId });
        for (const [key, value] of Object.entries(filters)) {
            if (value && value !== 'false') params.set(key, value);
        }
        return params;
    }, [eventId, filters]);

    const loadDashboard = useCallback(() => {
        fetch(`${API}/event-registrations/admin/dashboard?eventRef=${encodeURIComponent(eventId)}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { if (!d?.error) setDashboard(d); })
            .catch(() => { /* la tabla sigue sirviendo sin el tablero */ });
    }, [eventId]);

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

    useEffect(() => { loadDashboard(); }, [loadDashboard]);
    useEffect(() => { loadRows(); }, [loadRows]);
    // Cambiar un filtro devuelve a la primera página: si no, se podría quedar
    // en una página que ya no existe con el filtro nuevo.
    useEffect(() => { setOffset(0); }, [filters]);

    const refresh = () => { loadRows(); loadDashboard(); };

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

    /** Informe ejecutivo en PDF, armado con lo que ya está en pantalla. */
    const downloadPdf = async () => {
        setExporting('pdf');
        try {
            const { default: JsPDF } = await import('jspdf');
            const doc = new JsPDF({ unit: 'pt', format: 'a4' });
            const width = doc.internal.pageSize.getWidth();
            let y = 56;

            doc.setFontSize(16).setFont('helvetica', 'bold');
            doc.text('Informe de inscripciones', 40, y);
            y += 20;
            doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(110);
            doc.text(eventTitle || '', 40, y);
            y += 14;
            doc.text(`Generado el ${new Date().toLocaleString('es-CO')}`, 40, y);
            y += 26;
            doc.setTextColor(0);

            const t = dashboard?.totals || {};
            const summary: [string, string][] = [
                ['Inscripciones', String(t.registrations ?? 0)],
                ['Personas (con acompañantes)', String(t.people ?? 0)],
                ['Pago confirmado', String(t.settled ?? 0)],
                ['Pendientes de pago', String(t.pending ?? 0)],
                ['Pagos fallidos', String(t.failed ?? 0)],
                ['Reembolsadas', String(t.refunded ?? 0)],
                ['Acreditadas', String(t.accredited ?? 0)],
                ['Países representados', String(t.countries ?? 0)],
                ['Distritos participantes', String(t.districts ?? 0)],
                ['Clubes inscritos', String(t.clubs ?? 0)],
            ];
            doc.setFontSize(11).setFont('helvetica', 'bold');
            doc.text('Resumen', 40, y); y += 16;
            doc.setFont('helvetica', 'normal').setFontSize(10);
            for (const [label, value] of summary) {
                doc.text(label, 48, y);
                doc.text(value, width - 60, y, { align: 'right' });
                y += 15;
            }

            const section = (title: string, items: [string, string][]) => {
                if (!items.length) return;
                if (y > 700) { doc.addPage(); y = 56; }
                y += 12;
                doc.setFont('helvetica', 'bold').setFontSize(11);
                doc.text(title, 40, y); y += 16;
                doc.setFont('helvetica', 'normal').setFontSize(10);
                for (const [label, value] of items) {
                    if (y > 780) { doc.addPage(); y = 56; }
                    doc.text(String(label).slice(0, 60), 48, y);
                    doc.text(value, width - 60, y, { align: 'right' });
                    y += 15;
                }
            };

            section('Por categoría', (dashboard?.byCategory || []).map((c: any) =>
                [c.categoryLabel || c.categoryKey, `${c.total} · ${money(c.revenue, c.currency)}`] as [string, string]));
            section('Recaudo por moneda', (dashboard?.byCurrency || []).map((c: any) =>
                [c.currency, money(c.base, c.currency)] as [string, string]));
            section('Por país', (dashboard?.byCountry || []).slice(0, 15).map((c: any) =>
                [c.country, String(c.total)] as [string, string]));
            section('Por distrito', (dashboard?.byDistrict || []).slice(0, 15).map((c: any) =>
                [c.district, String(c.total)] as [string, string]));
            section('Por club', (dashboard?.byClub || []).slice(0, 15).map((c: any) =>
                [c.clubName, String(c.total)] as [string, string]));

            doc.save(`informe-inscripciones-${eventId}.pdf`);
        } catch {
            setError('No pudimos generar el informe en PDF.');
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
                    {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF
                </button>
            </div>

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
                            <tr><td colSpan={8} className="py-12 text-center">
                                <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
                            </td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                                No hay inscripciones que coincidan con estos filtros.
                            </td></tr>
                        ) : rows.map(r => (
                            <tr key={r.id} onClick={() => setSelected(r.id)}
                                className="cursor-pointer transition hover:bg-blue-50/40">
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
                                <td className="px-4 py-3"><StatusPill status={r.status} /></td>
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
                    onClose={() => setSelected(null)} onChanged={refresh} />
            )}
        </div>
    );
};

export default EventRegistrationsManager;
