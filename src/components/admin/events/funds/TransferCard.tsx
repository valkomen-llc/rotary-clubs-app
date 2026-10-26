// Un traslado del evento — v4.1250: su operación, las inscripciones que cubre,
// sus comprobantes PDF (versionados), su estado y los envíos por correo.
// Lo mismo se ve desde la ficha de cada inscripción y desde el tablero.
import { useState } from 'react';
import { Landmark, FileText, Upload, Send, Loader2, AlertCircle, CheckCircle2, Undo2, XCircle, Pencil } from 'lucide-react';
import { fundsApi, money, fecha, fechaHora, STATUS_CLS, type FundsTransfer } from './eventFundsApi';
import SendTransferNoticeModal from './SendTransferNoticeModal';

const btn = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50';

const TransferCard = ({ eventId, transfer: t, canApprove, statusLabels, methods, onChanged, highlightRegistrationId }: {
    eventId: string;
    transfer: FundsTransfer;
    canApprove: boolean;
    statusLabels: Record<string, string>;
    methods: { id: string; label: string }[];
    onChanged: () => void;
    /** En la ficha de una inscripción: la fila suya se resalta. */
    highlightRegistrationId?: string;
}) => {
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);
    const [editing, setEditing] = useState(false);
    const [ref, setRef] = useState(t.reference || '');
    const [date, setDate] = useState(t.transferDate ? String(t.transferDate).slice(0, 10) : '');
    const cerrado = t.status === 'confirmado' || t.status === 'rechazado' || t.status === 'revertido';

    const accion = async (nombre: string, fn: () => Promise<unknown>) => {
        setBusy(nombre); setError('');
        try { await fn(); onChanged(); } catch (e: any) { setError(e?.message || 'No se pudo completar.'); } finally { setBusy(''); }
    };
    const estado = (status: string, pedirMotivo = false) => accion(status, async () => {
        let reason = '';
        if (pedirMotivo) {
            reason = window.prompt('Motivo (queda en el historial):') || '';
            if (!reason.trim()) throw new Error('Se necesita el motivo.');
        }
        await fundsApi.updateTransfer(eventId, t.id, { status, reason });
    });
    const abrir = (docId: string) => accion(`doc-${docId}`, async () => {
        const { url } = await fundsApi.documentUrl(eventId, t.id, docId);
        window.open(url, '_blank', 'noopener');
    });
    const subir = (file: File | null) => file && accion('upload', async () => {
        const form = new FormData();
        form.append('document', file);
        await fundsApi.uploadDocument(eventId, t.id, form);
    });
    const metodo = methods.find(m => m.id === t.method)?.label || t.method || '—';
    const vigente = t.documents.find(d => d.isCurrent);

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="flex items-center gap-1.5 font-bold text-gray-900">
                        <Landmark className="h-3.5 w-3.5 text-sky-700" />
                        {t.kind === 'consolidado' ? 'Traslado consolidado' : 'Traslado individual'} · {money(t.amount, t.currency)}
                    </p>
                    <p className="mt-0.5 text-gray-500">
                        A <strong className="text-gray-700">{t.beneficiaryName || '—'}</strong> · {fecha(t.transferDate)} · {metodo}
                        {t.reference && <> · ref. <span className="font-mono">{t.reference}</span></>}
                    </p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_CLS[t.status] || STATUS_CLS.pendiente}`}>{statusLabels[t.status] || t.status}</span>
            </div>

            <div className="mt-2 rounded-lg bg-gray-50 p-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Inscripciones que cubre ({t.allocations.length})</p>
                {t.allocations.map(a => (
                    <div key={a.registrationId} className={`flex justify-between gap-2 px-1 py-0.5 ${a.registrationId === highlightRegistrationId ? 'rounded bg-sky-100/70 font-semibold' : ''}`}>
                        <span className="truncate">{a.code || '—'} · {a.name || 'Participante'}</span>
                        <span className="font-mono">{money(a.amount, a.currency)}</span>
                    </div>
                ))}
                {Math.abs(t.difference) > 0.005 && (
                    <p className="mt-1 text-amber-700">Diferencia por conciliar entre el traslado y lo asignado: {money(t.difference, t.currency)}</p>
                )}
            </div>

            {t.statusReason && <p className="mt-2 text-gray-600">Motivo: {t.statusReason}</p>}
            {t.status === 'confirmado' && <p className="mt-2 text-emerald-700">Confirmado por {t.confirmedByName || '—'} · {fechaHora(t.confirmedAt)}</p>}

            {/* Comprobantes */}
            <div className="mt-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Comprobante PDF</p>
                {t.documents.length === 0 ? (
                    <p className="text-gray-500">Sin comprobante todavía.</p>
                ) : (
                    <ul className="space-y-1">
                        {t.documents.map(d => (
                            <li key={d.id} className={`flex flex-wrap items-center gap-2 ${d.isCurrent ? '' : 'text-gray-400'}`}>
                                <FileText className="h-3.5 w-3.5" />
                                <span className="truncate">{d.fileName} · v{d.version}{d.isCurrent ? ' (vigente)' : ' (reemplazado)'}</span>
                                <span className="text-gray-400">{d.uploadedByName || '—'} · {fechaHora(d.uploadedAt)}</span>
                                <button type="button" onClick={() => abrir(d.id)} disabled={!!busy} className="font-semibold text-sky-700 hover:underline">Ver / descargar</button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Envíos */}
            {t.notices.length > 0 && (
                <div className="mt-3">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Envíos por correo</p>
                    <ul className="space-y-1">
                        {t.notices.map(n => (
                            <li key={n.id} className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${n.state === 'enviado' ? STATUS_CLS.enviado : STATUS_CLS.fallido}`}>
                                    {n.state === 'enviado' ? 'Aceptado por el proveedor' : n.state === 'fallido' ? 'Error de envío' : n.state}
                                </span>
                                <span>{[...(n.recipients || []), ...(n.cc || [])].join(', ')}</span>
                                <span className="text-gray-400">{n.sentByName || '—'} · {fechaHora(n.sentAt)}</span>
                                {n.error && <span className="w-full text-red-600">{n.error}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {editing && !cerrado && (
                <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-gray-200 p-2 sm:grid-cols-3">
                    <input type="text" value={ref} onChange={e => setRef(e.target.value)} placeholder="Referencia" className="rounded border border-gray-300 px-2 py-1" />
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded border border-gray-300 px-2 py-1" />
                    <button type="button" disabled={!!busy} onClick={() => accion('edit', async () => { await fundsApi.updateTransfer(eventId, t.id, { reference: ref, transferDate: date }); setEditing(false); })}
                        className={`${btn} border-sky-300 bg-sky-50 text-sky-800`}>Guardar</button>
                </div>
            )}

            {/* Acciones */}
            <div className="mt-3 flex flex-wrap gap-2">
                {t.active && (
                    <label className={`${btn} cursor-pointer border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>
                        {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {vigente ? 'Reemplazar PDF' : 'Adjuntar PDF'}
                        <input type="file" accept="application/pdf" className="hidden" onChange={e => { subir(e.target.files?.[0] || null); e.target.value = ''; }} />
                    </label>
                )}
                {t.active && (
                    <button type="button" onClick={() => setSending(true)} disabled={!vigente}
                        title={vigente ? undefined : 'Adjunta primero el comprobante PDF'}
                        className={`${btn} border-violet-300 bg-violet-50 text-violet-800`}>
                        <Send className="h-3.5 w-3.5" /> Enviar comprobante por correo
                    </button>
                )}
                {!cerrado && (
                    <button type="button" onClick={() => setEditing(v => !v)} className={`${btn} border-gray-300 bg-white text-gray-700`}>
                        <Pencil className="h-3.5 w-3.5" /> Referencia y fecha
                    </button>
                )}
                {t.status === 'pendiente' && (
                    <button type="button" disabled={!!busy} onClick={() => estado('registrado')} className={`${btn} border-sky-300 bg-white text-sky-800`}>Marcar como realizado</button>
                )}
                {(t.status === 'registrado' || t.status === 'pendiente') && (
                    <button type="button" disabled={!!busy} onClick={() => estado('pendiente_verificacion')} className={`${btn} border-indigo-300 bg-white text-indigo-800`}>Enviar a verificación</button>
                )}
                {canApprove && (t.status === 'registrado' || t.status === 'pendiente_verificacion') && (
                    <button type="button" disabled={!!busy || !vigente || !t.reference}
                        title={!vigente ? 'Adjunta el comprobante PDF' : !t.reference ? 'Registra la referencia de la operación' : undefined}
                        onClick={() => estado('confirmado')} className={`${btn} border-emerald-300 bg-emerald-50 text-emerald-800`}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar traslado
                    </button>
                )}
                {canApprove && !cerrado && (
                    <button type="button" disabled={!!busy} onClick={() => estado('rechazado', true)} className={`${btn} border-red-200 bg-white text-red-700`}>
                        <XCircle className="h-3.5 w-3.5" /> Rechazar
                    </button>
                )}
                {canApprove && (t.status === 'confirmado' || t.status === 'registrado' || t.status === 'pendiente_verificacion') && (
                    <button type="button" disabled={!!busy} onClick={() => estado('revertido', true)} className={`${btn} border-red-200 bg-white text-red-700`}>
                        <Undo2 className="h-3.5 w-3.5" /> Revertir
                    </button>
                )}
            </div>
            {canApprove && (t.status === 'registrado' || t.status === 'pendiente_verificacion') && (!vigente || !t.reference) && (
                <p className="mt-1 text-[11px] text-gray-500">Para confirmar el traslado hacen falta el comprobante PDF y la referencia de la operación.</p>
            )}
            {error && <p className="mt-2 flex items-start gap-1.5 text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}</p>}

            {sending && (
                <SendTransferNoticeModal eventId={eventId} transferId={t.id} onClose={() => setSending(false)} onSent={onChanged} />
            )}
        </div>
    );
};

export default TransferCard;
