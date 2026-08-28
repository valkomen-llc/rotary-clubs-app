// ════════════════════════════════════════════════════════════════════
// Acreditación del día del evento — v4.648.0
//
// Pensada para usarse en el mostrador: se busca por nombre, código, correo o
// documento, se ve de un golpe si la persona está a paz y salvo, se marca el
// check-in del titular y de cada acompañante, y se imprime la escarapela.
//
// El QR lleva el **código de inscripción**, no una URL: en la sede puede no
// haber internet, y el código es lo que el equipo va a cotejar contra la lista.
// El generador es propio (`src/lib/qrcode.ts`), sin dependencias externas.
//
// Sólo aparecen inscripciones con el pago resuelto o pendiente: un borrador no
// se acredita. Si alguien llega con el pago pendiente, la pantalla lo dice en
// vez de dejar acreditar por descuido — el servidor también lo impide.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BadgeCheck, ClipboardCheck, Loader2, Printer, Search, Users } from 'lucide-react';
import { money, statusMeta, SETTLED_STATUSES } from '../../../lib/eventRegistrationSpec';
import { completedStatusMeta } from '../../../lib/completedRegistrationSpec';
import { qrToSvg } from '../../../lib/qrcode';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

interface Companion {
    id: string; firstName: string; lastName: string; documentNumber: string;
    relationship: string; badgeCode: string | null; checkedInAt: string | null;
}

interface Result {
    id: string;
    registrationCode: string | null;
    publicRef: string;
    status: string;
    firstName: string; lastName: string; email: string;
    categoryLabel: string; clubName: string; district: string; country: string;
    baseAmount: number; baseCurrency: string;
    companionsCount: number;
    checkedInAt: string | null;
    companions: Companion[];
}

/**
 * Registro validado de «Inscripciones completadas» (v4.943). Llega en la clave
 * ADITIVA `completed` de la misma búsqueda: se acredita sin volver a digitar
 * nada, y la tarjeta dice su fuente para no confundirlo con una inscripción
 * del formulario en línea.
 */
interface CompletedResult {
    id: string;
    registrationCode: string | null;
    status: string;
    firstName: string | null; lastName: string | null; email: string;
    district: string | null; clubName: string | null;
    checkedInAt: string | null;
}

interface Props {
    eventId: string;
    eventTitle?: string;
    /** Sede, para imprimirla en la escarapela. */
    venue?: string;
}

const EventAccreditation = ({ eventId, eventTitle, venue }: Props) => {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState<Result[]>([]);
    const [completed, setCompleted] = useState<CompletedResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [searched, setSearched] = useState(false);

    const search = useCallback(async (query: string) => {
        if (query.trim().length < 2) { setResults([]); setCompleted([]); setSearched(false); return; }
        setLoading(true);
        setError('');
        try {
            const res = await fetch(
                `${API}/event-registrations/admin/checkin/lookup?eventRef=${encodeURIComponent(eventId)}&q=${encodeURIComponent(query)}`,
                { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No se pudo buscar.');
            setResults(data.results || []);
            setCompleted(data.completed || []);
            setSearched(true);
        } catch (err: any) {
            setError(err?.message || 'No se pudo buscar.');
        } finally {
            setLoading(false);
        }
    }, [eventId]);

    // Búsqueda con retardo: en el mostrador se escribe rápido y no tiene
    // sentido consultar en cada tecla.
    useEffect(() => {
        const timer = setTimeout(() => search(term), 350);
        return () => clearTimeout(timer);
    }, [term, search]);

    const checkIn = async (registrationId: string, options: { companionId?: string; undo?: boolean }) => {
        setBusy(options.companionId || registrationId);
        setError('');
        try {
            const res = await fetch(`${API}/event-registrations/admin/registrations/${registrationId}/checkin`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(options),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No se pudo acreditar.');
            // Se actualiza sólo la fila tocada: reconsultar movería la lista
            // debajo del dedo de quien está atendiendo.
            setResults(list => list.map(r => r.id !== registrationId ? r : {
                ...r,
                ...(data.registration ? {
                    status: data.registration.status,
                    checkedInAt: data.registration.checkedInAt,
                } : {}),
                companions: data.companions || r.companions,
            }));
        } catch (err: any) {
            setError(err?.message || 'No se pudo acreditar.');
        } finally {
            setBusy('');
        }
    };

    /** Escarapela en una ventana nueva, lista para imprimir. */
    const printBadge = (r: Result) => {
        const code = r.registrationCode || r.publicRef;
        const badges = [
            { name: `${r.firstName} ${r.lastName}`, code, role: r.categoryLabel, org: r.clubName },
            ...r.companions.map(c => ({
                name: `${c.firstName} ${c.lastName}`,
                code: `${code}-${c.badgeCode || ''}`,
                role: 'Acompañante',
                org: r.clubName,
            })),
        ];

        const cards = badges.map(b => `
            <div class="badge">
                <div class="head">
                    <p class="event">${escapeHtml(eventTitle || '')}</p>
                    ${venue ? `<p class="venue">${escapeHtml(venue)}</p>` : ''}
                </div>
                <p class="name">${escapeHtml(b.name)}</p>
                <p class="role">${escapeHtml(b.role)}</p>
                ${b.org ? `<p class="org">${escapeHtml(b.org)}</p>` : ''}
                <div class="qr">${qrToSvg(b.code, 150)}</div>
                <p class="code">${escapeHtml(b.code)}</p>
            </div>`).join('');

        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) { setError('El navegador bloqueó la ventana de impresión.'); return; }
        win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
            <title>Escarapelas — ${escapeHtml(code)}</title>
            <style>
                *{box-sizing:border-box}
                body{margin:0;padding:16px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f5f9;display:flex;flex-wrap:wrap;gap:12px}
                .badge{width:9cm;height:12.5cm;background:#fff;border:1px solid #cbd5e1;border-radius:10px;
                       padding:18px;display:flex;flex-direction:column;align-items:center;text-align:center;page-break-inside:avoid}
                .head{border-bottom:2px solid #17458F;padding-bottom:8px;margin-bottom:14px;width:100%}
                .event{margin:0;font-size:11px;font-weight:700;color:#17458F;text-transform:uppercase;letter-spacing:.06em}
                .venue{margin:2px 0 0;font-size:9px;color:#64748b}
                .name{margin:6px 0 4px;font-size:20px;font-weight:800;color:#0f172a;line-height:1.2}
                .role{margin:0;font-size:12px;font-weight:700;color:#F7A81B;text-transform:uppercase;letter-spacing:.05em}
                .org{margin:4px 0 0;font-size:11px;color:#64748b}
                .qr{margin-top:auto}
                .qr svg{display:block}
                .code{margin:8px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:700;color:#334155;letter-spacing:.08em}
                @media print{body{background:#fff;padding:0;gap:0}.badge{border:none;border-radius:0}}
            </style></head><body>${cards}
            <script>window.onload=function(){window.print()}<\/script>
            </body></html>`);
        win.document.close();
    };

    /** Check-in de un registro de «Inscripciones completadas» (v4.943). */
    const checkInCompleted = async (row: CompletedResult) => {
        setBusy(row.id);
        setError('');
        try {
            const res = await fetch(`${API}/event-registrations/admin/completed/${row.id}/checkin`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ undo: Boolean(row.checkedInAt) }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No se pudo acreditar.');
            setCompleted(list => list.map(c => c.id !== row.id ? c : {
                ...c, checkedInAt: data.registration?.checkedInAt ?? null,
            }));
        } catch (err: any) {
            setError(err?.message || 'No se pudo acreditar.');
        } finally {
            setBusy('');
        }
    };

    const stats = useMemo(() => ({
        found: results.length + completed.length,
        pending: results.filter(r => !SETTLED_STATUSES.includes(r.status)).length,
    }), [results, completed]);

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-bold text-gray-900">Acreditación</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                    Busca al participante, marca su llegada y la de sus acompañantes, e imprime las escarapelas
                    con su código QR.
                </p>
            </div>

            <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                {loading && <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" />}
                <input type="text" value={term} onChange={e => setTerm(e.target.value)} autoFocus
                    placeholder="Nombre, código de inscripción, correo o documento…"
                    className="w-full rounded-xl border-2 border-gray-200 py-4 pl-12 pr-12 text-base outline-none transition focus:border-blue-500" />
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {searched && results.length === 0 && completed.length === 0 && !loading && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
                    <p className="text-sm text-gray-500">
                        No encontramos ninguna inscripción con «{term}».
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                        Sólo aparecen las inscripciones con el pago confirmado o pendiente.
                    </p>
                </div>
            )}

            {stats.found > 0 && (
                <p className="text-xs text-gray-500">
                    {stats.found} resultado(s){stats.pending ? ` · ${stats.pending} con el pago sin confirmar` : ''}
                </p>
            )}

            <div className="space-y-3">
                {results.map(r => {
                    const settled = SETTLED_STATUSES.includes(r.status);
                    const code = r.registrationCode || r.publicRef;
                    return (
                        <div key={r.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                            <div className="flex flex-wrap items-start gap-4 p-5">
                                {/* QR de referencia, para cotejarlo al vuelo */}
                                <div className="shrink-0 rounded-lg border border-gray-100 p-1"
                                    dangerouslySetInnerHTML={{ __html: qrToSvg(code, 84) }} />

                                <div className="min-w-[200px] flex-1">
                                    <p className="font-mono text-xs font-bold text-gray-400">{code}</p>
                                    <p className="text-lg font-bold text-gray-900">{r.firstName} {r.lastName}</p>
                                    <p className="text-sm text-gray-500">{r.categoryLabel}</p>
                                    <p className="mt-0.5 text-xs text-gray-400">
                                        {[r.clubName, r.district && `Distrito ${r.district}`, r.country].filter(Boolean).join(' · ')}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusMeta(r.status).cls}`}>
                                            {statusMeta(r.status).label}
                                        </span>
                                        {!settled && (
                                            <span className="text-[11px] font-bold text-red-600">
                                                Pago sin confirmar — no se puede acreditar
                                            </span>
                                        )}
                                        {r.baseAmount > 0 && (
                                            <span className="text-[11px] text-gray-400">{money(r.baseAmount, r.baseCurrency)}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex shrink-0 flex-col gap-2">
                                    <button type="button" disabled={busy === r.id || !settled}
                                        onClick={() => checkIn(r.id, { undo: Boolean(r.checkedInAt) })}
                                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:opacity-40 ${r.checkedInAt
                                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                        {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                                        {r.checkedInAt ? 'Acreditado' : 'Acreditar'}
                                    </button>
                                    <button type="button" onClick={() => printBadge(r)}
                                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                                        <Printer className="h-4 w-4" /> Escarapela
                                    </button>
                                </div>
                            </div>

                            {r.companions.length > 0 && (
                                <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
                                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                        <Users className="h-3.5 w-3.5" /> Acompañantes
                                    </p>
                                    <div className="space-y-2">
                                        {r.companions.map(c => (
                                            <div key={c.id} className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-gray-800">
                                                        {c.firstName} {c.lastName}
                                                    </p>
                                                    <p className="truncate text-xs text-gray-400">
                                                        {[c.documentNumber, c.relationship].filter(Boolean).join(' · ')}
                                                    </p>
                                                </div>
                                                <button type="button" disabled={busy === c.id || !settled}
                                                    onClick={() => checkIn(r.id, { companionId: c.id, undo: Boolean(c.checkedInAt) })}
                                                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${c.checkedInAt
                                                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                        : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-100'}`}>
                                                    {busy === c.id ? '…' : c.checkedInAt ? 'Acreditado' : 'Acreditar'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* ── Inscripciones completadas validadas (v4.943) ──
                    La MISMA búsqueda también trae los registros del formulario
                    de completar inscripción que el equipo ya validó: se
                    acreditan acá sin volver a digitar nada, y la tarjeta dice
                    su fuente para no confundirlos con el formulario en línea. */}
                {completed.map(c => {
                    const code = c.registrationCode || c.id.slice(0, 8).toUpperCase();
                    return (
                        <div key={`completed-${c.id}`} className="overflow-hidden rounded-xl border border-violet-200 bg-white">
                            <div className="flex flex-wrap items-start gap-4 p-5">
                                <div className="shrink-0 rounded-lg border border-gray-100 p-1"
                                    dangerouslySetInnerHTML={{ __html: qrToSvg(code, 84) }} />
                                <div className="min-w-[200px] flex-1">
                                    <p className="font-mono text-xs font-bold text-gray-400" data-no-translate>{code}</p>
                                    <p className="text-lg font-bold text-gray-900">{c.firstName} {c.lastName}</p>
                                    <p className="mt-0.5 text-xs text-gray-400">
                                        <span data-no-translate>{[c.clubName, c.district && `Distrito ${c.district}`].filter(Boolean).join(' · ')}</span>
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                                            <ClipboardCheck className="h-3 w-3" /> Inscripción completada (manual)
                                        </span>
                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${completedStatusMeta(c.status).cls}`}>
                                            {completedStatusMeta(c.status).label}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-col gap-2">
                                    <button type="button" disabled={busy === c.id}
                                        onClick={() => checkInCompleted(c)}
                                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:opacity-40 ${c.checkedInAt
                                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                        {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                                        {c.checkedInAt ? 'Acreditado' : 'Acreditar'}
                                    </button>
                                    <button type="button"
                                        onClick={() => printBadge({
                                            id: c.id, registrationCode: code, publicRef: code, status: c.status,
                                            firstName: c.firstName || '', lastName: c.lastName || '', email: c.email,
                                            categoryLabel: 'Participante', clubName: c.clubName || '',
                                            district: c.district || '', country: '', baseAmount: 0, baseCurrency: 'COP',
                                            companionsCount: 0, checkedInAt: c.checkedInAt, companions: [],
                                        })}
                                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                                        <Printer className="h-4 w-4" /> Escarapela
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const escapeHtml = (value: string) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export default EventAccreditation;
