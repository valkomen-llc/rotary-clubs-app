// ════════════════════════════════════════════════════════════════════
// Pestaña "Registro" de un evento — v4.606.0
//
// Dos partes: la configuración de las entradas (se guarda dentro de
// `metadata.registration` del evento, con el botón "Guardar cambios" del
// editor) y la lista de inscripciones recibidas, con totales y exportación.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Plus, RefreshCw, Trash2, Users } from 'lucide-react';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

export interface EventTicket {
    key: string;
    label: string;
    description?: string;
    amount: number;
    capacity?: number | null;
}

export interface EventRegistrationConfig {
    enabled?: boolean;
    currency?: string;
    closesAt?: string;
    requireClub?: boolean;
    sendReceipt?: boolean;
    adminEmails?: string[];
    successMessage?: string;
    maxPerRegistration?: number;
    tickets?: EventTicket[];
}

interface Registration {
    id: string; publicRef: string; status: string;
    firstName: string; lastName: string; email: string; phone: string;
    country: string; clubName: string;
    ticketLabel: string; quantity: number; totalAmount: string | number;
    currency: string; paidAt: string | null; createdAt: string;
}

interface Totals {
    count: number; confirmed: number; attendees: number;
    pending: number; revenue: number; currency: string;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
    paid: { label: 'Pagado', cls: 'bg-emerald-100 text-emerald-700' },
    confirmed: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700' },
    pending_payment: { label: 'Pago pendiente', cls: 'bg-amber-100 text-amber-700' },
    payment_failed: { label: 'Pago fallido', cls: 'bg-red-100 text-red-700' },
    expired: { label: 'Expirado', cls: 'bg-gray-100 text-gray-600' },
    refunded: { label: 'Reembolsado', cls: 'bg-indigo-100 text-indigo-700' },
};

const inputCls = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none';

const money = (amount: number, currency: string) =>
    `${Number(amount || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })} ${currency}`;

/** Clave estable a partir del nombre de la entrada, para no perder el historial. */
const ticketKey = (label: string, index: number) =>
    String(label || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 60) || `entrada-${index + 1}`;

interface Props {
    eventId: string;
    /** Dirección amigable del evento, si tiene: se usa para el enlace público. */
    eventSlug?: string | null;
    config: EventRegistrationConfig;
    onChange: (next: EventRegistrationConfig) => void;
}

const EventRegistrationTab = ({ eventId, eventSlug, config, onChange }: Props) => {
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [totals, setTotals] = useState<Totals | null>(null);
    const [loading, setLoading] = useState(false);

    const tickets = config.tickets || [];
    const publicUrl = `${window.location.origin}/eventos/${eventSlug || eventId}/registro`;

    const patch = (partial: Partial<EventRegistrationConfig>) => onChange({ ...config, ...partial });
    const patchTicket = (index: number, partial: Partial<EventTicket>) =>
        patch({ tickets: tickets.map((t, i) => (i === index ? { ...t, ...partial } : t)) });

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${API}/event-registrations/admin/list?eventRef=${encodeURIComponent(eventId)}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => {
                if (data?.error) return;
                setRegistrations(data.registrations || []);
                setTotals(data.totals || null);
            })
            .catch(() => { /* la configuración sigue siendo editable */ })
            .finally(() => setLoading(false));
    }, [eventId]);

    useEffect(() => { load(); }, [load]);

    const exportCsv = async () => {
        try {
            const res = await fetch(`${API}/event-registrations/admin/export.csv?eventRef=${encodeURIComponent(eventId)}`, { headers: authHeaders() });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `inscripciones-${eventSlug || eventId}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert('No pudimos exportar las inscripciones.');
        }
    };

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-500">
                Permite que el público se inscriba y pague su entrada con Stripe desde{' '}
                <a href={publicUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline">{publicUrl}</a>.
                Los cambios de esta pestaña se guardan con el botón <b>Guardar cambios</b> del evento.
            </p>

            {/* ── Ajustes generales ─────────────────────────────────── */}
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" className="h-4 w-4"
                    checked={config.enabled === true}
                    onChange={e => patch({ enabled: e.target.checked })} />
                Registro abierto para este evento
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
                    <input type="text" className={inputCls} value={config.currency || ''}
                        onChange={e => patch({ currency: e.target.value.toUpperCase().slice(0, 10) })}
                        placeholder="USD" />
                    <p className="mt-1 text-xs text-gray-400">Código de tres letras: USD, COP, EUR…</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cierre de inscripciones</label>
                    <input type="date" className={inputCls} value={(config.closesAt || '').slice(0, 10)}
                        onChange={e => patch({ closesAt: e.target.value })} />
                    <p className="mt-1 text-xs text-gray-400">Vacío deja el registro abierto.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Máximo de entradas por inscripción</label>
                    <input type="number" min={1} className={inputCls} value={config.maxPerRegistration ?? 10}
                        onChange={e => patch({ maxPerRegistration: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
            </div>

            {/* ── Entradas ──────────────────────────────────────────── */}
            <div>
                <h4 className="text-sm font-bold text-gray-800 mb-3">Tipos de entrada</h4>
                <div className="space-y-3">
                    {tickets.map((t, i) => (
                        <div key={i} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre</label>
                                    <input type="text" className={inputCls} value={t.label || ''}
                                        onChange={e => patchTicket(i, { label: e.target.value, key: t.key || ticketKey(e.target.value, i) })}
                                        onBlur={() => !t.key && patchTicket(i, { key: ticketKey(t.label, i) })}
                                        placeholder="Ej: Ticket general" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Precio ({config.currency || 'USD'})</label>
                                    <input type="number" min={0} step="0.01" className={inputCls} value={t.amount ?? 0}
                                        onChange={e => patchTicket(i, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                                    <p className="mt-1 text-xs text-gray-400">0 = entrada sin costo, se confirma sin pasar por el pago.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Cupo (opcional)</label>
                                    <input type="number" min={0} className={inputCls} value={t.capacity ?? ''}
                                        onChange={e => patchTicket(i, { capacity: e.target.value ? Math.max(0, Number(e.target.value)) : null })}
                                        placeholder="Sin límite" />
                                </div>
                            </div>
                            <div className="flex items-end gap-3">
                                <div className="flex-1">
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Descripción (opcional)</label>
                                    <input type="text" className={inputCls} value={t.description || ''}
                                        onChange={e => patchTicket(i, { description: e.target.value })}
                                        placeholder="Qué incluye esta entrada" />
                                </div>
                                <button type="button"
                                    onClick={() => patch({ tickets: tickets.filter((_, ix) => ix !== i) })}
                                    className="rounded-lg p-2.5 text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                    ))}
                </div>
                <button type="button"
                    onClick={() => patch({ tickets: [...tickets, { key: '', label: '', amount: 0, capacity: null }] })}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
                    <Plus className="w-4 h-4" /> Agregar tipo de entrada
                </button>
            </div>

            {/* ── Datos y avisos ────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Correos que reciben aviso de cada inscripción</label>
                    <input type="text" className={inputCls} value={(config.adminEmails || []).join(', ')}
                        onChange={e => patch({ adminEmails: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })}
                        placeholder="Separados por coma" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje de confirmación</label>
                    <input type="text" className={inputCls} value={config.successMessage || ''}
                        onChange={e => patch({ successMessage: e.target.value })}
                        placeholder="Se muestra y se envía al confirmar el registro" />
                </div>
            </div>
            <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" className="h-4 w-4" checked={config.requireClub !== false}
                        onChange={e => patch({ requireClub: e.target.checked })} />
                    Exigir el club u organización
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" className="h-4 w-4" checked={config.sendReceipt !== false}
                        onChange={e => patch({ sendReceipt: e.target.checked })} />
                    Enviar comprobante por correo al asistente
                </label>
            </div>

            {/* ── Inscripciones recibidas ───────────────────────────── */}
            <div className="border-t border-gray-100 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-gray-800">
                        <Users className="w-4 h-4 text-blue-600" /> Inscripciones recibidas
                    </h4>
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={load}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                        </button>
                        {registrations.length > 0 && (
                            <button type="button" onClick={exportCsv}
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
                                <Download className="w-4 h-4" /> Exportar CSV
                            </button>
                        )}
                    </div>
                </div>

                {totals && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {[
                            { label: 'Inscripciones', value: totals.count },
                            { label: 'Confirmadas', value: totals.confirmed },
                            { label: 'Asistentes', value: totals.attendees },
                            { label: 'Recaudado', value: money(totals.revenue, totals.currency) },
                        ].map(card => (
                            <div key={card.label} className="rounded-xl border border-gray-100 bg-white px-4 py-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{card.label}</p>
                                <p className="text-lg font-bold text-gray-900">{card.value}</p>
                            </div>
                        ))}
                    </div>
                )}

                {loading && !registrations.length ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
                ) : registrations.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">Todavía no hay inscripciones para este evento.</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                                <tr>
                                    <th className="px-4 py-3">Referencia</th>
                                    <th className="px-4 py-3">Asistente</th>
                                    <th className="px-4 py-3">Entrada</th>
                                    <th className="px-4 py-3">Total</th>
                                    <th className="px-4 py-3">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {registrations.map(r => {
                                    const badge = STATUS_LABELS[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-600' };
                                    return (
                                        <tr key={r.id} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">{r.publicRef}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-gray-900">{r.firstName} {r.lastName}</p>
                                                <p className="text-xs text-gray-500">{r.email}{r.clubName ? ` · ${r.clubName}` : ''}</p>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">{r.ticketLabel} × {r.quantity}</td>
                                            <td className="px-4 py-3 font-semibold text-gray-900">{money(Number(r.totalAmount), r.currency)}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.cls}`}>{badge.label}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EventRegistrationTab;
