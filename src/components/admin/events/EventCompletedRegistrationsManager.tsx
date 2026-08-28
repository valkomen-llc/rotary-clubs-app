// ════════════════════════════════════════════════════════════════════
// Pestaña «Inscripciones completadas» de un evento — v4.943.0
//
// El tablero administrativo de los registros que llegaron por el formulario
// público de completar inscripción (pago hecho POR FUERA de la página):
// configurar el formulario y su URL, KPIs, buscador, filtros, tabla, ficha
// con el comprobante, acciones del Equipo de Registro (validar, confirmar
// pago, pedir corrección, rechazar, editar, reenviar) y exportación.
//
// Convive con «Inscripciones» sin tocarla: son fuentes distintas del MISMO
// evento, y la ficha lo dice (`registrationSource`).
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    AlertCircle, AlertTriangle, BadgeCheck, ChevronDown, ChevronUp, Copy, Download,
    ExternalLink, FileSpreadsheet, FileText, Filter, Link2, Loader2, Mail, Paperclip,
    Pencil, RefreshCw, Save, Search, Send, Settings2, Users, X, XCircle,
} from 'lucide-react';
import MediaPicker from '../content-studio/MediaPicker';
import { uploadMediaFiles } from '../../../lib/mediaUpload';
import { completedStatusMeta, SOURCE_LABELS } from '../../../lib/completedRegistrationSpec';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

const PAGE_SIZE = 50;
const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500';

const fmtDateTime = (value: string | null) =>
    value ? new Date(value).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

interface CompletedConfig {
    enabled: boolean;
    slug: string;
    codePrefix: string;
    title: string;
    intro: string;
    headerImageUrl: string;
    rolePeriod: string;
    successMessage: string;
}

interface CatalogOption { value: string; label: string }
interface Catalog {
    statuses: { key: string; label: string }[];
    paymentMethods: CatalogOption[];
    membership: CatalogOption[];
    clubRoles: CatalogOption[];
    sources: Record<string, string>;
}

interface CompletedRow {
    id: string;
    registrationCode: string | null;
    status: string;
    registrationSource: string;
    firstName: string | null;
    lastName: string | null;
    documentNumber: string | null;
    email: string;
    phone: string | null;
    district: string | null;
    clubName: string | null;
    membershipType: string | null;
    clubRole: string | null;
    clubRoleOther: string | null;
    eps: string | null;
    foodAllergy: string | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
    paymentMethod: string | null;
    hasReceipt: boolean;
    receiptName: string | null;
    receiptBytes: number | null;
    comments: string | null;
    flags: { hasDuplicates?: boolean; duplicates?: DuplicateRef[] };
    linkedRegistrationId: string | null;
    internalNotes: string | null;
    checkedInAt: string | null;
    checkedInBy: string | null;
    submittedAt: string | null;
    createdAt: string;
}

interface DuplicateRef {
    id: string; source: string; code: string | null; name: string; status: string; match: string;
}

const StatusPill = ({ status }: { status: string }) => {
    const meta = completedStatusMeta(status);
    return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>;
};

const StatCard = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
);

const optionLabel = (options: CatalogOption[] | undefined, value: string | null) =>
    options?.find(o => o.value === value)?.label || value || '—';

const roleLabel = (catalog: Catalog | null, r: CompletedRow) =>
    r.clubRole === 'otro_cargo'
        ? (r.clubRoleOther || 'Otro cargo asignado')
        : optionLabel(catalog?.clubRoles, r.clubRole);

// ── Ficha de un registro ─────────────────────────────────────────────

const DetailSheet = ({ id, catalog, onClose, onChanged }: {
    id: string;
    catalog: Catalog | null;
    onClose: () => void;
    onChanged: () => void;
}) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');
    const [comment, setComment] = useState('');
    const [askComment, setAskComment] = useState<'' | 'needs_correction' | 'rejected'>('');
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${API}/event-registrations/admin/completed/${id}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                if (d?.error) throw new Error(d.error);
                setData(d);
                setNotes(d.registration?.internalNotes || '');
            })
            .catch(err => setError(err?.message || 'No se pudo cargar el registro.'))
            .finally(() => setLoading(false));
    }, [id]);
    useEffect(() => { load(); }, [load]);

    const r: CompletedRow | null = data?.registration || null;

    const call = async (label: string, path: string, init: RequestInit, okNotice: string) => {
        setBusy(label);
        setError('');
        try {
            const res = await fetch(`${API}/event-registrations/admin/completed/${id}${path}`, {
                headers: authHeaders(), ...init,
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d?.error || 'La acción no se pudo completar.');
            setNotice(okNotice);
            setTimeout(() => setNotice(''), 3000);
            load();
            onChanged();
            return true;
        } catch (err: any) {
            setError(err?.message || 'La acción no se pudo completar.');
            return false;
        } finally {
            setBusy('');
        }
    };

    const changeStatus = async (status: string) => {
        // Pedir corrección o rechazar exige el MOTIVO: es lo que le llega al
        // participante y lo que queda en la auditoría.
        if (['needs_correction', 'rejected'].includes(status) && !comment.trim()) {
            setAskComment(status as any);
            return;
        }
        const ok = await call(status, '/status', {
            method: 'PATCH', body: JSON.stringify({ status, comment: comment.trim() }),
        }, 'Estado actualizado.');
        if (ok) { setComment(''); setAskComment(''); }
    };

    const openReceipt = async () => {
        setBusy('receipt');
        setError('');
        try {
            const res = await fetch(`${API}/event-registrations/admin/completed/${id}/receipt`, { headers: authHeaders() });
            const d = await res.json();
            if (!res.ok) throw new Error(d?.error || 'No se pudo abrir el comprobante.');
            window.open(d.url, '_blank', 'noopener');
        } catch (err: any) {
            setError(err?.message || 'No se pudo abrir el comprobante.');
        } finally {
            setBusy('');
        }
    };

    const startEdit = () => {
        if (!r) return;
        setDraft({
            firstName: r.firstName || '', lastName: r.lastName || '',
            documentNumber: r.documentNumber || '', email: r.email || '', phone: r.phone || '',
            district: r.district || '', clubName: r.clubName || '',
            eps: r.eps || '', foodAllergy: r.foodAllergy || '',
            emergencyName: r.emergencyName || '', emergencyPhone: r.emergencyPhone || '',
            clubRoleOther: r.clubRoleOther || '', comments: r.comments || '',
        });
        setEditing(true);
    };

    const saveEdit = async () => {
        const ok = await call('edit', '', { method: 'PATCH', body: JSON.stringify(draft) }, 'Información guardada.');
        if (ok) setEditing(false);
    };

    const saveNotes = () =>
        call('notes', '', { method: 'PATCH', body: JSON.stringify({ internalNotes: notes }) }, 'Notas guardadas.');

    const dupes: DuplicateRef[] = data?.duplicates?.duplicates || [];

    const infoRows: [string, ReactNode][] = r ? [
        ['Nombre', `${r.firstName || ''} ${r.lastName || ''}`.trim() || '—'],
        ['Documento', r.documentNumber || '—'],
        ['Correo', r.email],
        ['Teléfono / WhatsApp', r.phone || '—'],
        ['Distrito', r.district || '—'],
        ['Club', r.clubName || '—'],
        ['Vínculo con el club', optionLabel(catalog?.membership, r.membershipType)],
        ['Cargo en el club', roleLabel(catalog, r)],
        ['EPS', r.eps || '—'],
        ['Alergia alimentaria', r.foodAllergy || '—'],
        ['Contacto de emergencia', r.emergencyName || '—'],
        ['Teléfono de emergencia', r.emergencyPhone || '—'],
        ['Método de pago', optionLabel(catalog?.paymentMethods, r.paymentMethod)],
        ['Comentarios', r.comments || '—'],
        ['Fuente del registro', SOURCE_LABELS[r.registrationSource] || r.registrationSource],
        ['Enviado el', fmtDateTime(r.submittedAt)],
        ['Acreditado', r.checkedInAt ? `${fmtDateTime(r.checkedInAt)} · ${r.checkedInBy || ''}` : 'Todavía no'],
    ] : [];

    const EDIT_FIELDS: [string, string][] = [
        ['firstName', 'Nombre'], ['lastName', 'Apellido'], ['documentNumber', 'Documento'],
        ['email', 'Correo'], ['phone', 'Teléfono / WhatsApp'], ['district', 'Distrito'],
        ['clubName', 'Club'], ['clubRoleOther', 'Cargo (si es «otro»)'], ['eps', 'EPS'],
        ['foodAllergy', 'Alergia alimentaria'], ['emergencyName', 'Contacto de emergencia'],
        ['emergencyPhone', 'Teléfono de emergencia'], ['comments', 'Comentarios'],
    ];

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
            <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-100 bg-white px-6 py-4">
                    <div className="min-w-0">
                        <p className="font-mono text-lg font-bold text-gray-900" data-no-translate>
                            {r?.registrationCode || 'Registro'}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                            {r ? `${r.firstName || ''} ${r.lastName || ''}` : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {r && <StatusPill status={r.status} />}
                        <button type="button" onClick={onClose} aria-label="Cerrar la ficha"
                            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                ) : (
                    <div className="space-y-5 px-6 py-5">
                        {error && (
                            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                            </div>
                        )}
                        {notice && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                                {notice}
                            </div>
                        )}

                        {/* ── Duplicados: alerta administrativa, nunca borrado ── */}
                        {dupes.length > 0 && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                                <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
                                    <AlertTriangle className="h-4 w-4" /> Posible participante duplicado en este evento
                                </p>
                                <ul className="mt-2 space-y-1 text-[13px] text-amber-900">
                                    {dupes.map(d => (
                                        <li key={`${d.source}-${d.id}`} className="flex flex-wrap items-center gap-1.5">
                                            <span className="font-mono font-bold" data-no-translate>{d.code || d.id.slice(0, 8)}</span>
                                            · {d.name || 'Sin nombre'} · coincide por {d.match}
                                            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold">
                                                {SOURCE_LABELS[d.source] || d.source}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="mt-2 text-[12px] text-amber-800/80">
                                    Ningún registro se borra ni se fusiona automáticamente: revisa los dos y decide.
                                </p>
                            </div>
                        )}
                        {data?.linked && (
                            <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900">
                                <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    Relacionado con la inscripción en línea{' '}
                                    <span className="font-mono font-bold" data-no-translate>{data.linked.code}</span>
                                    {' '}({data.linked.name}{data.linked.categoryLabel ? ` · ${data.linked.categoryLabel}` : ''}),
                                    visible en la pestaña «Inscripciones».
                                </span>
                            </div>
                        )}

                        {/* ── Acciones ─────────────────────────────── */}
                        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Acciones del Equipo de Registro</p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={Boolean(busy) || r?.status === 'validated'}
                                    onClick={() => changeStatus('validated')}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                                    <BadgeCheck className="h-3.5 w-3.5" /> Validar inscripción
                                </button>
                                <button type="button" disabled={Boolean(busy) || r?.status === 'payment_confirmed'}
                                    onClick={() => changeStatus('payment_confirmed')}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-40">
                                    <BadgeCheck className="h-3.5 w-3.5" /> Marcar pago confirmado
                                </button>
                                <button type="button" disabled={Boolean(busy)}
                                    onClick={() => changeStatus('needs_correction')}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50 disabled:opacity-40">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Solicitar corrección
                                </button>
                                <button type="button" disabled={Boolean(busy)}
                                    onClick={() => changeStatus('rejected')}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3.5 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-40">
                                    <XCircle className="h-3.5 w-3.5" /> Rechazar
                                </button>
                                <button type="button" disabled={Boolean(busy)} onClick={startEdit}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40">
                                    <Pencil className="h-3.5 w-3.5" /> Editar información
                                </button>
                                <button type="button" disabled={Boolean(busy)}
                                    onClick={() => call('resend', '/resend', { method: 'POST', body: '{}' }, 'Confirmación reenviada.')}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40">
                                    {busy === 'resend' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                    Reenviar confirmación
                                </button>
                            </div>
                            {(askComment || comment) && (
                                <div className="mt-3">
                                    <label className={labelCls}>
                                        {askComment === 'rejected' ? 'Motivo del rechazo (obligatorio)'
                                            : askComment === 'needs_correction' ? 'Qué debe corregirse (obligatorio)'
                                                : 'Comentario para el historial (opcional)'}
                                    </label>
                                    <textarea className={inputCls} rows={2} value={comment}
                                        onChange={e => setComment(e.target.value)} />
                                    {askComment && (
                                        <button type="button" disabled={!comment.trim() || Boolean(busy)}
                                            onClick={() => changeStatus(askComment)}
                                            className="mt-2 rounded-lg bg-gray-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                                            Confirmar «{completedStatusMeta(askComment).label}»
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Comprobante ──────────────────────────── */}
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
                            <p className="flex min-w-0 items-center gap-2 text-sm text-gray-700">
                                <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                                {r?.hasReceipt ? (
                                    <>
                                        <span className="truncate font-semibold" data-no-translate>{r.receiptName || 'Comprobante de pago'}</span>
                                        {r.receiptBytes ? (
                                            <span className="shrink-0 text-xs text-gray-400">{(r.receiptBytes / 1024 / 1024).toFixed(1)} MB</span>
                                        ) : null}
                                    </>
                                ) : 'Este registro no tiene comprobante adjunto.'}
                            </p>
                            {r?.hasReceipt && (
                                <button type="button" onClick={openReceipt} disabled={busy === 'receipt'}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                                    {busy === 'receipt' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                    Ver / descargar comprobante
                                </button>
                            )}
                        </div>

                        {/* ── Datos de los cuatro pasos ────────────── */}
                        {editing ? (
                            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-blue-700">Editar información</p>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {EDIT_FIELDS.map(([key, label]) => (
                                        <div key={key} className={key === 'comments' ? 'sm:col-span-2' : undefined}>
                                            <label className={labelCls}>{label}</label>
                                            <input type="text" className={inputCls} value={draft[key] ?? ''}
                                                onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))} />
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 flex gap-2">
                                    <button type="button" onClick={saveEdit} disabled={Boolean(busy)}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                                        {busy === 'edit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                        Guardar cambios
                                    </button>
                                    <button type="button" onClick={() => setEditing(false)}
                                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50">
                                        Cancelar
                                    </button>
                                </div>
                                <p className="mt-2 text-[11px] text-blue-800/70">
                                    Cada edición queda en el historial con los valores anterior y nuevo.
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Información del registro</p>
                                <dl>
                                    {infoRows.map(([label, value]) => (
                                        <div key={label} className="flex flex-col gap-0.5 border-b border-gray-50 py-2 last:border-0 sm:flex-row sm:justify-between sm:gap-6">
                                            <dt className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                                            <dd className="text-sm font-medium text-gray-800 sm:max-w-[62%] sm:text-right">{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                        )}

                        {/* ── Notas internas ───────────────────────── */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <label className={labelCls}>Notas internas del equipo</label>
                            <textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
                            <button type="button" onClick={saveNotes} disabled={Boolean(busy)}
                                className="mt-2 rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                Guardar notas
                            </button>
                        </div>

                        {/* ── Historial y comunicaciones ───────────── */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Historial</p>
                            {(data?.history || []).length === 0 ? (
                                <p className="py-2 text-center text-xs text-gray-400">Sin movimientos todavía.</p>
                            ) : (
                                <ul className="space-y-2.5">
                                    {(data?.history || []).map((h: any) => (
                                        <li key={h.id} className="text-[13px] text-gray-700">
                                            <span className="font-semibold">{h.actorName || 'Sistema'}</span>
                                            {' — '}{h.comment || h.type}
                                            {h.fromStatus && h.toStatus && (
                                                <span className="text-gray-400"> ({completedStatusMeta(h.fromStatus).label} → {completedStatusMeta(h.toStatus).label})</span>
                                            )}
                                            <span className="ml-1.5 text-[11px] text-gray-400">{fmtDateTime(h.createdAt)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {(data?.messages || []).length > 0 && (
                                <>
                                    <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-gray-500">Correos enviados</p>
                                    <ul className="space-y-1.5">
                                        {(data?.messages || []).map((m: any) => (
                                            <li key={m.id} className="flex items-center gap-1.5 text-[13px] text-gray-600">
                                                <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                                <span className="truncate">{m.subject || m.template}</span>
                                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                    m.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    {m.status === 'sent' ? 'Enviado' : 'Falló'}
                                                </span>
                                                <span className="shrink-0 text-[11px] text-gray-400">{fmtDateTime(m.createdAt)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Pantalla principal ───────────────────────────────────────────────

interface Props { eventId: string; eventTitle?: string }

interface Filters {
    q: string; status: string; method: string; district: string; club: string;
    clubRole: string; from: string; to: string; duplicates: string;
}
const emptyFilters: Filters = { q: '', status: '', method: '', district: '', club: '', clubRole: '', from: '', to: '', duplicates: '' };

const EventCompletedRegistrationsManager = ({ eventId, eventTitle }: Props) => {
    const [config, setConfig] = useState<CompletedConfig | null>(null);
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [codePrefix, setCodePrefix] = useState('');
    const [configOpen, setConfigOpen] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [configSaved, setConfigSaved] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [uploadingHeader, setUploadingHeader] = useState(false);
    const headerFileRef = useRef<HTMLInputElement | null>(null);

    const [summary, setSummary] = useState<any>(null);
    const [rows, setRows] = useState<CompletedRow[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState<Filters>(emptyFilters);
    const [showFilters, setShowFilters] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [exporting, setExporting] = useState('');
    const [copied, setCopied] = useState(false);

    const publicUrl = config?.slug ? `${window.location.origin}/${config.slug}` : '';

    const query = useMemo(() => {
        const params = new URLSearchParams({ eventRef: eventId });
        for (const [key, value] of Object.entries(filters)) {
            if (value) params.set(key, value);
        }
        return params;
    }, [eventId, filters]);

    const loadConfig = useCallback(() => {
        fetch(`${API}/event-registrations/admin/completed/config?eventRef=${encodeURIComponent(eventId)}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                if (d?.error) throw new Error(d.error);
                setConfig(d.config);
                setCatalog(d.catalog || null);
                setCodePrefix(d.codePrefix || '');
                // Sin slug configurado, lo primero es configurar: se abre solo.
                if (!d.config?.slug) setConfigOpen(true);
            })
            .catch(err => setError(err?.message || 'No se pudo cargar la configuración.'));
    }, [eventId]);

    const loadSummary = useCallback(() => {
        fetch(`${API}/event-registrations/admin/completed/summary?eventRef=${encodeURIComponent(eventId)}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { if (!d?.error) setSummary(d); })
            .catch(() => { /* la tabla sigue sirviendo sin el tablero */ });
    }, [eventId]);

    const loadRows = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams(query);
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(offset));
        fetch(`${API}/event-registrations/admin/completed/list?${params}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                if (d?.error) throw new Error(d.error);
                setRows(d.registrations || []);
                setTotal(d.total || 0);
            })
            .catch(err => setError(err?.message || 'No se pudieron cargar los registros.'))
            .finally(() => setLoading(false));
    }, [query, offset]);

    useEffect(() => { loadConfig(); }, [loadConfig]);
    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => { loadRows(); }, [loadRows]);
    useEffect(() => { setOffset(0); }, [filters]);

    const refresh = () => { loadRows(); loadSummary(); };

    const patchConfig = (partial: Partial<CompletedConfig>) =>
        setConfig(prev => (prev ? { ...prev, ...partial } : prev));

    const saveConfig = async () => {
        if (!config) return;
        setSavingConfig(true);
        setError('');
        setConfigSaved(false);
        try {
            const res = await fetch(`${API}/event-registrations/admin/completed/config`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ eventRef: eventId, config }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d?.error || 'No se pudo guardar.');
            setConfig(d.config);
            setCodePrefix(d.codePrefix || '');
            setConfigSaved(true);
            setTimeout(() => setConfigSaved(false), 2500);
        } catch (err: any) {
            setError(err?.message || 'No se pudo guardar la configuración.');
        } finally {
            setSavingConfig(false);
        }
    };

    // La casilla de imagen ofrece las DOS vías (regla de v4.700): subir un
    // archivo nuevo o elegir uno ya cargado en la Biblioteca Multimedia.
    const uploadHeaderImage = async (file: File) => {
        setUploadingHeader(true);
        setError('');
        try {
            const result = await uploadMediaFiles([file]);
            const first = result.uploaded[0];
            if (!first) throw new Error(result.failed[0]?.reason || 'No se pudo subir la imagen.');
            patchConfig({ headerImageUrl: first.url });
        } catch (err: any) {
            setError(err?.message || 'No se pudo subir la imagen.');
        } finally {
            setUploadingHeader(false);
        }
    };

    const download = async (format: 'csv' | 'xlsx') => {
        setExporting(format);
        try {
            const res = await fetch(`${API}/event-registrations/admin/completed/export.${format}?${query}`, { headers: authHeaders() });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inscripciones-completadas-${eventId}.${format}`;
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            setError('No pudimos exportar los registros.');
        } finally {
            setExporting('');
        }
    };

    /** Informe ejecutivo en PDF, con lo que ya está en pantalla. */
    const downloadPdf = async () => {
        setExporting('pdf');
        try {
            const { default: JsPDF } = await import('jspdf');
            const doc = new JsPDF({ unit: 'pt', format: 'a4' });
            const width = doc.internal.pageSize.getWidth();
            let y = 56;

            doc.setFontSize(16).setFont('helvetica', 'bold');
            doc.text('Informe de inscripciones completadas', 40, y);
            y += 20;
            doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(110);
            doc.text(eventTitle || '', 40, y); y += 14;
            doc.text(`Generado el ${new Date().toLocaleString('es-CO')}`, 40, y); y += 26;
            doc.setTextColor(0);

            const t = summary?.totals || {};
            const items: [string, string][] = [
                ['Registros recibidos', String(t.total ?? 0)],
                ['Pendientes de validación', String(t.submitted ?? 0)],
                ['Validados', String(t.validated ?? 0)],
                ['Pago confirmado', String(t.payment_confirmed ?? 0)],
                ['Requieren corrección', String(t.needs_correction ?? 0)],
                ['Rechazados', String(t.rejected ?? 0)],
                ['Pagos por transferencia', String(t.transfers ?? 0)],
                ['Pagos por COLROTARIOS', String(t.colrotarios ?? 0)],
                ['Otros métodos', String(t.other_methods ?? 0)],
                ['Posibles duplicados', String(t.duplicates ?? 0)],
                ['Acreditados', String(t.accredited ?? 0)],
                ['Distritos', String(t.districts ?? 0)],
                ['Clubes', String(t.clubs ?? 0)],
            ];
            doc.setFontSize(11).setFont('helvetica', 'bold');
            doc.text('Resumen', 40, y); y += 16;
            doc.setFont('helvetica', 'normal').setFontSize(10);
            for (const [label, value] of items) {
                doc.text(label, 48, y);
                doc.text(value, width - 60, y, { align: 'right' });
                y += 15;
            }

            const section = (title: string, list: [string, string][]) => {
                if (!list.length) return;
                if (y > 700) { doc.addPage(); y = 56; }
                y += 12;
                doc.setFont('helvetica', 'bold').setFontSize(11);
                doc.text(title, 40, y); y += 16;
                doc.setFont('helvetica', 'normal').setFontSize(10);
                for (const [label, value] of list) {
                    if (y > 780) { doc.addPage(); y = 56; }
                    doc.text(String(label).slice(0, 60), 48, y);
                    doc.text(value, width - 60, y, { align: 'right' });
                    y += 15;
                }
            };
            section('Por distrito', (summary?.byDistrict || []).map((d: any) => [d.district, String(d.total)] as [string, string]));
            section('Por club', (summary?.byClub || []).map((c: any) => [c.clubName, String(c.total)] as [string, string]));

            doc.save(`informe-inscripciones-completadas-${eventId}.pdf`);
        } catch {
            setError('No pudimos generar el informe en PDF.');
        } finally {
            setExporting('');
        }
    };

    const copyUrl = async () => {
        try {
            await navigator.clipboard.writeText(publicUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* sin permiso de portapapeles: el enlace queda a la vista */ }
    };

    const t = summary?.totals || {};
    const activeFilters = Object.values(filters).filter(Boolean).length;

    return (
        <div className="space-y-5">
            <p className="text-sm text-gray-500">
                Registros de personas que ya realizaron su inscripción y pago <strong>por fuera de la página</strong>
                {' '}(transferencia bancaria u otro canal) y completaron su información en el formulario público.
                Conviven con la pestaña «Inscripciones» sin mezclarse: cada registro dice su fuente.
            </p>

            {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {/* ── Configuración del formulario público ────────────── */}
            <div className="rounded-xl border border-gray-200 bg-white">
                <button type="button" onClick={() => setConfigOpen(o => !o)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
                    <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                        <Settings2 className="h-4 w-4 text-blue-600" /> Formulario público
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            config?.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {config?.enabled ? 'Activo' : 'Apagado'}
                        </span>
                    </span>
                    <span className="flex items-center gap-3">
                        {publicUrl && <span className="hidden truncate font-mono text-xs text-gray-400 sm:inline" data-no-translate>{publicUrl}</span>}
                        {configOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </span>
                </button>

                {configOpen && config && (
                    <div className="space-y-4 border-t border-gray-100 px-4 py-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="md:col-span-2">
                                <label className={labelCls}>Dirección pública (slug)</label>
                                <input type="text" className={`${inputCls} font-mono`} value={config.slug}
                                    onChange={e => patchConfig({ slug: e.target.value })}
                                    placeholder="inscripcion-conferencia-distrital-villavicencio-2027" />
                                {publicUrl && (
                                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                        <span className="font-mono" data-no-translate>{publicUrl}</span>
                                        <button type="button" onClick={copyUrl} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
                                            <Copy className="h-3 w-3" /> {copied ? 'Copiado' : 'Copiar'}
                                        </button>
                                        <a href={publicUrl} target="_blank" rel="noreferrer"
                                            className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
                                            <ExternalLink className="h-3 w-3" /> Abrir formulario
                                        </a>
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className={labelCls}>Prefijo del código de registro</label>
                                <input type="text" className={`${inputCls} font-mono`} value={config.codePrefix}
                                    onChange={e => patchConfig({ codePrefix: e.target.value.toUpperCase() })}
                                    placeholder="CR4281-2027" maxLength={20} />
                                <p className="mt-1 text-xs text-gray-400">
                                    Los códigos quedan como <span className="font-mono" data-no-translate>{codePrefix || 'CR4281-2027'}-4K9ZQ</span>.
                                </p>
                            </div>
                            <div>
                                <label className={labelCls}>Período rotario del cargo</label>
                                <input type="text" className={inputCls} value={config.rolePeriod}
                                    onChange={e => patchConfig({ rolePeriod: e.target.value })} placeholder="2026-2027" />
                            </div>
                            <div className="md:col-span-2">
                                <label className={labelCls}>Título del formulario</label>
                                <input type="text" className={inputCls} value={config.title}
                                    onChange={e => patchConfig({ title: e.target.value })}
                                    placeholder="Inscripción - Preventa $750.000 - Este formulario aplica solo para…" />
                            </div>
                            <div className="md:col-span-2">
                                <label className={labelCls}>Texto introductorio</label>
                                <textarea className={inputCls} rows={3} value={config.intro}
                                    onChange={e => patchConfig({ intro: e.target.value })}
                                    placeholder="Si no realizó la preinscripción, por favor espere la apertura de una nueva etapa…" />
                            </div>
                            <div className="md:col-span-2">
                                <label className={labelCls}>Imagen de cabecera (identidad del evento)</label>
                                <div className="flex flex-wrap items-center gap-3">
                                    {config.headerImageUrl && (
                                        <img src={config.headerImageUrl} alt="Cabecera del formulario"
                                            className="h-16 w-auto rounded-lg border border-gray-200 object-contain" />
                                    )}
                                    <input ref={headerFileRef} type="file" accept="image/*" className="hidden"
                                        onChange={e => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            if (file) uploadHeaderImage(file);
                                        }} />
                                    <button type="button" onClick={() => headerFileRef.current?.click()} disabled={uploadingHeader}
                                        className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                        {uploadingHeader ? 'Subiendo…' : 'Subir archivo'}
                                    </button>
                                    <button type="button" onClick={() => setShowPicker(true)}
                                        className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
                                        Elegir de la Biblioteca
                                    </button>
                                    {config.headerImageUrl && (
                                        <button type="button" onClick={() => patchConfig({ headerImageUrl: '' })}
                                            className="text-xs font-semibold text-red-600 hover:underline">
                                            Quitar
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className={labelCls}>Mensaje adicional de confirmación (opcional)</label>
                                <input type="text" className={inputCls} value={config.successMessage}
                                    onChange={e => patchConfig({ successMessage: e.target.value })} />
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                            <input type="checkbox" className="h-4 w-4" checked={config.enabled}
                                onChange={e => patchConfig({ enabled: e.target.checked })} />
                            Formulario público activo
                        </label>

                        <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
                            <button type="button" onClick={saveConfig} disabled={savingConfig}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                                {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Guardar formulario
                            </button>
                            {configSaved && <span className="text-sm font-semibold text-emerald-600">Guardado.</span>}
                        </div>
                    </div>
                )}
            </div>

            {/* ── KPIs ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Registros recibidos" value={t.total ?? 0}
                    hint={`${t.accredited ?? 0} acreditados`} />
                <StatCard label="Pendientes de validación" value={t.submitted ?? 0} />
                <StatCard label="Validados" value={(t.validated ?? 0) + (t.payment_confirmed ?? 0)}
                    hint={`${t.payment_confirmed ?? 0} con pago confirmado`} />
                <StatCard label="Rechazados / corrección" value={(t.rejected ?? 0) + (t.needs_correction ?? 0)}
                    hint={`${t.needs_correction ?? 0} requieren corrección`} />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Transferencia bancaria" value={t.transfers ?? 0} />
                <StatCard label="Pasarela COLROTARIOS" value={t.colrotarios ?? 0}
                    hint={`${t.other_methods ?? 0} otros métodos`} />
                <StatCard label="Distritos" value={t.districts ?? 0} hint={`${t.clubs ?? 0} clubes`} />
                <StatCard label="Posibles duplicados" value={t.duplicates ?? 0} />
            </div>

            {/* ── Buscador, filtros y exportación ─────────────────── */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input type="search" className={`${inputCls} pl-9`}
                        placeholder="Buscar por nombre, correo, código, documento, teléfono, distrito o club…"
                        value={filters.q}
                        onChange={e => setFilters(prev => ({ ...prev, q: e.target.value }))} />
                </div>
                <button type="button" onClick={() => setShowFilters(v => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
                        showFilters || activeFilters > 1 ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                    <Filter className="h-4 w-4" /> Filtros{activeFilters > 0 ? ` (${activeFilters})` : ''}
                </button>
                <button type="button" onClick={refresh}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    <RefreshCw className="h-4 w-4" /> Actualizar
                </button>
                <button type="button" onClick={() => download('csv')} disabled={Boolean(exporting)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    <Download className="h-4 w-4" /> CSV
                </button>
                <button type="button" onClick={() => download('xlsx')} disabled={Boolean(exporting)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    <FileSpreadsheet className="h-4 w-4" /> Excel
                </button>
                <button type="button" onClick={downloadPdf} disabled={Boolean(exporting)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    <FileText className="h-4 w-4" /> PDF
                </button>
            </div>

            {showFilters && (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <label className={labelCls}>Estado</label>
                        <select className={inputCls} value={filters.status}
                            onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}>
                            <option value="">Todos</option>
                            {(catalog?.statuses || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Método de pago</label>
                        <select className={inputCls} value={filters.method}
                            onChange={e => setFilters(prev => ({ ...prev, method: e.target.value }))}>
                            <option value="">Todos</option>
                            {(catalog?.paymentMethods || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Cargo rotario</label>
                        <select className={inputCls} value={filters.clubRole}
                            onChange={e => setFilters(prev => ({ ...prev, clubRole: e.target.value }))}>
                            <option value="">Todos</option>
                            {(catalog?.clubRoles || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Distrito</label>
                        <input type="text" className={inputCls} value={filters.district}
                            onChange={e => setFilters(prev => ({ ...prev, district: e.target.value }))} placeholder="4281" />
                    </div>
                    <div>
                        <label className={labelCls}>Club</label>
                        <input type="text" className={inputCls} value={filters.club}
                            onChange={e => setFilters(prev => ({ ...prev, club: e.target.value }))} />
                    </div>
                    <div>
                        <label className={labelCls}>Desde</label>
                        <input type="date" className={inputCls} value={filters.from}
                            onChange={e => setFilters(prev => ({ ...prev, from: e.target.value }))} />
                    </div>
                    <div>
                        <label className={labelCls}>Hasta</label>
                        <input type="date" className={inputCls} value={filters.to}
                            onChange={e => setFilters(prev => ({ ...prev, to: e.target.value }))} />
                    </div>
                    <div className="flex items-end pb-1.5">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" className="h-4 w-4" checked={filters.duplicates === 'only'}
                                onChange={e => setFilters(prev => ({ ...prev, duplicates: e.target.checked ? 'only' : '' }))} />
                            Sólo posibles duplicados
                        </label>
                    </div>
                    <div className="flex items-end pb-1.5 lg:col-span-4">
                        <button type="button" onClick={() => setFilters(emptyFilters)}
                            className="text-sm font-semibold text-gray-500 hover:text-gray-800">
                            Limpiar filtros
                        </button>
                    </div>
                </div>
            )}

            {/* ── Tabla ───────────────────────────────────────────── */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                            <th className="px-4 py-3">Código</th>
                            <th className="px-4 py-3">Participante</th>
                            <th className="px-4 py-3">Documento</th>
                            <th className="px-4 py-3">Distrito / Club</th>
                            <th className="px-4 py-3">Cargo</th>
                            <th className="px-4 py-3">Método</th>
                            <th className="px-4 py-3">Comprobante</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3">Fecha</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} className="px-4 py-12 text-center">
                                <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
                            </td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                                {activeFilters > 0
                                    ? 'Ningún registro cumple los filtros actuales.'
                                    : 'Todavía no llega ningún registro por el formulario público.'}
                            </td></tr>
                        ) : rows.map(r => (
                            <tr key={r.id} onClick={() => setSelected(r.id)}
                                className="cursor-pointer border-b border-gray-50 transition last:border-0 hover:bg-blue-50/40">
                                <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900" data-no-translate>
                                    {r.registrationCode || '—'}
                                    {r.flags?.hasDuplicates && (
                                        <span title="Posible duplicado">
                                            <AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-amber-500" />
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <p className="font-semibold text-gray-900">{`${r.firstName || ''} ${r.lastName || ''}`.trim() || '—'}</p>
                                    <p className="text-xs text-gray-400" data-no-translate>{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                                </td>
                                <td className="px-4 py-3 text-gray-600" data-no-translate>{r.documentNumber || '—'}</td>
                                <td className="px-4 py-3 text-gray-600">
                                    <span data-no-translate>{[r.district, r.clubName].filter(Boolean).join(' · ') || '—'}</span>
                                </td>
                                <td className="px-4 py-3 text-gray-600">{roleLabel(catalog, r)}</td>
                                <td className="px-4 py-3 text-gray-600">{optionLabel(catalog?.paymentMethods, r.paymentMethod)}</td>
                                <td className="px-4 py-3">
                                    {r.hasReceipt
                                        ? <Paperclip className="h-4 w-4 text-emerald-600" />
                                        : <span className="text-xs text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                                <td className="px-4 py-3 text-xs text-gray-500">{fmtDateTime(r.submittedAt || r.createdAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {total > PAGE_SIZE && (
                <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total}</span>
                    <div className="flex gap-2">
                        <button type="button" disabled={offset === 0}
                            onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
                            className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 font-semibold disabled:opacity-40">
                            Anterior
                        </button>
                        <button type="button" disabled={offset + PAGE_SIZE >= total}
                            onClick={() => setOffset(o => o + PAGE_SIZE)}
                            className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 font-semibold disabled:opacity-40">
                            Siguiente
                        </button>
                    </div>
                </div>
            )}

            <p className="flex items-center gap-1.5 text-xs text-gray-400">
                <Users className="h-3.5 w-3.5" />
                Los registros validados quedan disponibles en la pestaña «Acreditación» para el día del evento.
            </p>

            {selected && (
                <DetailSheet id={selected} catalog={catalog}
                    onClose={() => setSelected(null)} onChanged={refresh} />
            )}

            <MediaPicker
                isOpen={showPicker}
                onClose={() => setShowPicker(false)}
                maxSelection={1}
                onSelect={items => {
                    if (items[0]?.url) patchConfig({ headerImageUrl: items[0].url });
                    setShowPicker(false);
                }}
            />
        </div>
    );
};

export default EventCompletedRegistrationsManager;
