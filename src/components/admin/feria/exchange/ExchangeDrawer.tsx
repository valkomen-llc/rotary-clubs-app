// ════════════════════════════════════════════════════════════════════
// EXCHANGE — el visor de UN proyecto (v4.1335)
//
// Información del proyecto, del pago (proceso A), de cada traslado (proceso B,
// el giro de la Bóveda) y de su conciliación (proceso C); los comprobantes con
// el MISMO visor de los inscritos a eventos (`ReceiptViewer`); las
// asignaciones de una transferencia compartida; y el historial.
//
// Acciones según el perfil (el servidor decide; aquí sólo se pinta):
//   · registrar el traslado → la barra de la Bóveda (`onRegister`);
//   · datos de la transferencia y soportes → `manage`;
//   · conciliar, marcar diferencia, reabrir → `reconcile`;
//   · descargar → `download`. El administrador del evento sólo consulta.
//
// ⚠️ Componentes de NIVEL SUPERIOR (regla del proyecto): uno declarado dentro
// de otro pierde el foco tras cada letra.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import {
    X, Loader2, Paperclip, Eye, CheckCircle2, AlertTriangle, RotateCcw, History, Banknote, Upload, Pencil, Layers, ExternalLink, Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    exchangeRequest, exchangeUrl, fmtMoney, fmtDate, fmtDateTime, fmtBytes, EXCHANGE_TONE_CLS, RECON_TONE,
    type ExchangeDetail, type ExchangeOperation, type ExchangeAccount,
} from '../../../../lib/exchange';
import { ExchangePill } from './ExchangeCells';
import { ReceiptViewer } from '../../events/ComprobanteDeLaInscripcion';
import { subirComprobanteManual, fechaInputAIso } from '../../../../lib/comprobantePagoManual';
import { RECEIPT_ACCEPT } from '../../../../lib/completedRegistrationSpec';

interface Props {
    id: string;
    eventId: string | null;
    onClose: () => void;
    onChanged: () => void;
    onRegister: (submissionId: string) => void;
}

type Viewer = { url: string; mime: string; name: string; download: (() => void) | null } | null;

const accountLine = (a: ExchangeAccount | null) => (a
    ? [a.label, a.institution, a.accountType, a.accountNumber, a.currency].filter(Boolean).join(' · ')
    : 'Sin configurar');

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-1 text-sm">
        <dt className="text-slate-500">{label}</dt>
        <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
);

// ── Datos de la transferencia (manage) ───────────────────────────────

const EMPTY = {
    sentAmount: '', sentCurrency: 'USD', receivedAmount: '', receivedCurrency: 'COP', exchangeRate: '', rateSource: '',
    feeAmount: '', feeCurrency: 'USD', bankReference: '', transferDate: '', notes: '',
};

export const OperationDataForm: React.FC<{ op: ExchangeOperation; eventId: string | null; onSaved: () => void; onCancel: () => void }> = ({ op, eventId, onSaved, onCancel }) => {
    const d = op.data;
    const [f, setF] = useState(() => ({
        ...EMPTY,
        ...(d ? Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === null || v === undefined ? (EMPTY as any)[k] ?? '' : String(v)])) : {}),
        receivedCurrency: d?.receivedCurrency || op.currency || 'COP',
        bankReference: d?.bankReference || op.reference || '',
        transferDate: (d?.transferDate || op.transferDate || '').slice(0, 10),
    }) as Record<string, string>);
    const [busy, setBusy] = useState(false);
    const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF(p => ({ ...p, [k]: e.target.value }));
    const guardar = async () => {
        setBusy(true);
        try {
            const body: Record<string, any> = { ...f, version: d?.version };
            for (const k of ['sentAmount', 'receivedAmount', 'exchangeRate', 'feeAmount']) body[k] = f[k] === '' ? null : Number(f[k]);
            body.transferDate = f.transferDate ? fechaInputAIso(`${f.transferDate}T12:00`) : null;
            await exchangeRequest(`/operaciones/${encodeURIComponent(op.key)}/datos`, eventId, { method: 'PUT', body: JSON.stringify(body) });
            toast.success('Datos de la transferencia guardados.');
            onSaved();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudieron guardar los datos.');
        } finally {
            setBusy(false);
        }
    };
    const input = 'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm';
    return (
        <div className="mt-3 space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
            <p className="text-xs text-slate-600">La tasa es la de la operación (extracto o comprobante del banco), nunca una tasa de hoy. Lo recibido se compara con lo asignado sólo en la misma moneda.</p>
            <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">Importe enviado (origen)
                    <input type="number" step="0.01" min="0" value={f.sentAmount} onChange={set('sentAmount')} className={input} /></label>
                <label className="block text-xs font-semibold text-slate-600">Moneda enviada
                    <input value={f.sentCurrency} onChange={set('sentCurrency')} maxLength={3} className={`${input} uppercase`} /></label>
                <label className="block text-xs font-semibold text-slate-600">Importe recibido (destino)
                    <input type="number" step="0.01" min="0" value={f.receivedAmount} onChange={set('receivedAmount')} className={input} /></label>
                <label className="block text-xs font-semibold text-slate-600">Moneda recibida
                    <input value={f.receivedCurrency} onChange={set('receivedCurrency')} maxLength={3} className={`${input} uppercase`} /></label>
                <label className="block text-xs font-semibold text-slate-600">Tasa de cambio aplicada
                    <input type="number" step="0.0001" min="0" value={f.exchangeRate} onChange={set('exchangeRate')} className={input} /></label>
                <label className="block text-xs font-semibold text-slate-600">Fuente de la tasa
                    <input value={f.rateSource} onChange={set('rateSource')} placeholder="Extracto Mercury, comprobante del banco…" className={input} /></label>
                <label className="block text-xs font-semibold text-slate-600">Comisiones bancarias
                    <input type="number" step="0.01" min="0" value={f.feeAmount} onChange={set('feeAmount')} className={input} /></label>
                <label className="block text-xs font-semibold text-slate-600">Moneda de la comisión
                    <input value={f.feeCurrency} onChange={set('feeCurrency')} maxLength={3} className={`${input} uppercase`} /></label>
                <label className="block text-xs font-semibold text-slate-600">Referencia de la transacción bancaria
                    <input value={f.bankReference} onChange={set('bankReference')} className={input} /></label>
                <label className="block text-xs font-semibold text-slate-600">Fecha de la transferencia
                    <input type="date" value={f.transferDate} onChange={set('transferDate')} className={input} /></label>
            </div>
            <label className="block text-xs font-semibold text-slate-600">Observaciones administrativas
                <textarea value={f.notes} onChange={set('notes')} rows={2} className={input} /></label>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Cancelar</button>
                <button type="button" onClick={guardar} disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {busy && <Loader2 size={13} className="animate-spin" />} Guardar datos
                </button>
            </div>
        </div>
    );
};

// ── Adjuntar un soporte (manage) ─────────────────────────────────────

export const AttachDocumentForm: React.FC<{ op: ExchangeOperation; eventId: string | null; kinds: { key: string; label: string }[]; maxMb: number; onSaved: () => void; onCancel: () => void }> = ({ op, eventId, kinds, maxMb, onSaved, onCancel }) => {
    const [file, setFile] = useState<File | null>(null);
    const [kind, setKind] = useState(kinds[0]?.key || 'otro');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const subir = async () => {
        if (!file) return;
        if (file.size > maxMb * 1024 * 1024) { toast.error(`El soporte supera el máximo de ${maxMb} MB.`); return; }
        setBusy(true);
        try {
            const subido = await subirComprobanteManual({
                file,
                prepararUrl: exchangeUrl(`/operaciones/${encodeURIComponent(op.key)}/documentos/url`, eventId),
                headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
            });
            await exchangeRequest(`/operaciones/${encodeURIComponent(op.key)}/documentos`, eventId, {
                method: 'POST', body: JSON.stringify({ key: subido.key, name: subido.name, kind, note }),
            });
            toast.success('Soporte adjuntado.');
            onSaved();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo adjuntar el soporte.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-600">PDF o imagen (JPG, PNG, WebP), hasta {maxMb} MB. Se guarda en almacenamiento privado y se valida por su contenido.</p>
            <input type="file" accept={RECEIPT_ACCEPT} onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-sm" aria-label="Archivo del soporte" />
            <div className="grid gap-2 sm:grid-cols-2">
                <select value={kind} onChange={e => setKind(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" aria-label="Tipo de soporte">
                    {kinds.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nota (opcional)" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Cancelar</button>
                <button type="button" onClick={subir} disabled={!file || busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Adjuntar
                </button>
            </div>
        </div>
    );
};

// ── Cambiar el estado de conciliación (reconcile) ────────────────────

const ACCIONES: Record<string, { to: string; label: string; help: string; cls: string }[]> = {
    en_conciliacion: [
        { to: 'conciliado', label: 'Marcar como conciliado', help: 'Confirmas que el pago recibido, el traslado y el proyecto corresponden. Hace falta comprobante y referencia.', cls: 'bg-emerald-700 text-white' },
        { to: 'con_diferencia', label: 'Registrar diferencia', help: 'Describe la inconsistencia (valor, referencia, cuenta).', cls: 'border border-red-300 text-red-700 bg-white' },
    ],
    con_diferencia: [
        { to: 'conciliado', label: 'Conciliar con la diferencia explicada', help: 'Explica por qué se acepta (comisión, redondeo, tasa).', cls: 'bg-emerald-700 text-white' },
        { to: 'en_conciliacion', label: 'Volver a «En conciliación»', help: 'La diferencia se resolvió o se registró por error.', cls: 'border border-slate-300 text-slate-700 bg-white' },
    ],
    conciliado: [
        { to: 'en_conciliacion', label: 'Reabrir la conciliación', help: 'La conciliación anterior queda completa en el historial. Indica el motivo.', cls: 'border border-amber-300 text-amber-800 bg-white' },
    ],
};

export const ReconcileActions: React.FC<{ op: ExchangeOperation; eventId: string | null; onDone: () => void }> = ({ op, eventId, onDone }) => {
    const [pick, setPick] = useState<{ to: string; label: string; help: string } | null>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const acciones = ACCIONES[op.status] || [];
    if (op.reversed || !acciones.length) return null;
    const enviar = async () => {
        if (!pick) return;
        setBusy(true);
        try {
            await exchangeRequest(`/operaciones/${encodeURIComponent(op.key)}/estado`, eventId, { method: 'POST', body: JSON.stringify({ to: pick.to, note }) });
            toast.success('Estado de conciliación actualizado.');
            setPick(null); setNote('');
            onDone();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo cambiar el estado.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="mt-3">
            <div className="flex flex-wrap gap-2">
                {acciones.map(a => (
                    <button key={a.to} type="button" onClick={() => { setPick(a); setNote(''); }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${a.cls}`}>{a.label}</button>
                ))}
            </div>
            {pick && (
                <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-600">{pick.help}</p>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Motivo u observación (queda en el historial)"
                        aria-label="Motivo u observación" className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setPick(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Cancelar</button>
                        <button type="button" onClick={enviar} disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                            {busy && <Loader2 size={13} className="animate-spin" />} Confirmar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Una operación ────────────────────────────────────────────────────

export const OperationCard: React.FC<{
    op: ExchangeOperation; detail: ExchangeDetail; eventId: string | null;
    onView: (op: ExchangeOperation, source: 'boveda' | 'exchange', ref: string | number, name: string, mime: string) => void;
    onReload: () => void;
}> = ({ op, detail, eventId, onView, onReload }) => {
    const caps = detail.capabilities;
    const [mode, setMode] = useState<'datos' | 'soporte' | null>(null);
    const [retiring, setRetiring] = useState<string | null>(null);
    const [reason, setReason] = useState('');
    const tone = RECON_TONE[op.status] || 'slate';
    const retirar = async (docId: string) => {
        try {
            await exchangeRequest(`/documentos/${encodeURIComponent(docId)}/retirar`, eventId, { method: 'POST', body: JSON.stringify({ reason }) });
            toast.success('Soporte retirado (queda en el historial).');
            setRetiring(null); setReason('');
            onReload();
        } catch (e: any) { toast.error(e?.message || 'No se pudo retirar el soporte.'); }
    };
    const d = op.data;
    return (
        <article className="rounded-xl border border-slate-200 bg-white p-4" aria-label={`Transferencia ${op.reference || op.key}`}>
            <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                        {op.kind === 'agrupada' ? <Layers size={14} /> : <Banknote size={14} />}
                        Transferencia {op.kind === 'agrupada' ? `agrupada (${op.projectsCount} proyectos)` : 'individual'}
                    </p>
                    <p className="text-xs text-slate-500">Registrada el {fmtDateTime(op.registeredAt)}{op.registeredByName ? ` por ${op.registeredByName}` : ''}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${EXCHANGE_TONE_CLS[tone] || EXCHANGE_TONE_CLS.slate}`}>{op.statusLabel}</span>
            </header>

            <dl className="mt-3 divide-y divide-slate-100">
                <Row label="Fecha del traslado">{fmtDate(d?.transferDate || op.transferDate)}</Row>
                <Row label="Valor asignado (operación)"><span data-no-translate>{fmtMoney(op.allocated, op.currency)}</span></Row>
                <Row label="Referencia bancaria"><span data-no-translate>{op.reference || '—'}</span></Row>
                <Row label="Cuenta de origen">{accountLine(op.accounts.origin)}</Row>
                <Row label="Cuenta de destino">{accountLine(op.accounts.destination)}{op.beneficiary ? <span className="block text-xs font-normal text-slate-500">Beneficiario en la Bóveda: {op.beneficiary}</span> : null}</Row>
                {d?.sentAmount !== null && d?.sentAmount !== undefined && <Row label="Importe enviado"><span data-no-translate>{fmtMoney(d.sentAmount, d.sentCurrency)}</span></Row>}
                {op.received !== null && <Row label="Importe recibido"><span data-no-translate>{fmtMoney(op.received, op.receivedCurrency)}</span></Row>}
                {d?.exchangeRate ? <Row label="Tasa de cambio registrada"><span data-no-translate>{d.exchangeRate}</span>{d.rateSource ? <span className="block text-xs font-normal text-slate-500">Fuente: {d.rateSource}</span> : null}</Row> : null}
                {d?.feeAmount ? <Row label="Comisiones bancarias"><span data-no-translate>{fmtMoney(d.feeAmount, d.feeCurrency)}</span></Row> : null}
                {op.difference !== null && (
                    <Row label="Diferencia (recibido − asignado)">
                        <span className={Math.abs(op.difference) > 0.005 ? 'text-red-700' : 'text-emerald-700'} data-no-translate>{fmtMoney(op.difference, op.currency)}</span>
                    </Row>
                )}
                {op.reconciledAt && <Row label="Conciliado">{fmtDateTime(op.reconciledAt)}{op.reconciledByName ? ` · ${op.reconciledByName}` : ''}</Row>}
                {op.statusNote && <Row label="Observación de conciliación">{op.statusNote}</Row>}
                {d?.notes && <Row label="Observaciones">{d.notes}</Row>}
            </dl>

            {/* Comprobantes: el del giro (Bóveda) y los soportes de Exchange. */}
            <div className="mt-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Comprobantes</p>
                {!op.bovedaFiles.length && !op.documents.filter(x => !x.retiredAt).length && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Esta transferencia no tiene comprobante adjunto.</p>
                )}
                <ul className="space-y-1.5">
                    {op.bovedaFiles.map(f => (
                        <li key={`b${f.index}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2"><Paperclip size={14} className="shrink-0 text-slate-400" />
                                <span className="truncate" data-no-translate>{f.name || 'Comprobante'}</span>
                                <span className="shrink-0 text-xs text-slate-400">{fmtBytes(f.bytes)} · traslado</span></span>
                            <button type="button" onClick={() => onView(op, 'boveda', f.index, f.name, f.mime)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"><Eye size={13} /> Ver</button>
                        </li>
                    ))}
                    {op.documents.map(doc => (
                        <li key={doc.id} className={`rounded-lg border px-3 py-2 text-sm ${doc.retiredAt ? 'border-slate-100 bg-slate-50 text-slate-400' : 'border-slate-200'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-2"><Paperclip size={14} className="shrink-0 text-slate-400" />
                                    <span className={`truncate ${doc.retiredAt ? 'line-through' : ''}`} data-no-translate>{doc.fileName}</span>
                                    <span className="shrink-0 text-xs text-slate-400">{doc.kindLabel}</span></span>
                                {!doc.retiredAt && (
                                    <span className="flex shrink-0 items-center gap-2">
                                        <button type="button" onClick={() => onView(op, 'exchange', doc.id, doc.fileName, doc.mime)} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"><Eye size={13} /> Ver</button>
                                        {caps.manage && op.status !== 'conciliado' && (
                                            <button type="button" onClick={() => { setRetiring(doc.id); setReason(''); }} aria-label={`Retirar ${doc.fileName}`} className="text-slate-400 hover:text-red-600"><Ban size={13} /></button>
                                        )}
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-400">{fmtDateTime(doc.uploadedAt)}{doc.uploadedByName ? ` · ${doc.uploadedByName}` : ''}{doc.note ? ` · ${doc.note}` : ''}{doc.retiredAt ? ` · retirado: ${doc.retiredReason || ''}` : ''}</p>
                            {retiring === doc.id && (
                                <div className="mt-2 flex gap-2">
                                    <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo del retiro" aria-label="Motivo del retiro" className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                    <button type="button" onClick={() => retirar(doc.id)} className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">Retirar</button>
                                    <button type="button" onClick={() => setRetiring(null)} className="text-xs text-slate-500">Cancelar</button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Las asignaciones: una transferencia puede cubrir varios proyectos. */}
            <div className="mt-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Asignaciones a proyectos</p>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                    {op.allocations.map(a => (
                        <li key={a.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 ${a.isThis ? 'bg-sky-50/60' : ''}`}>
                            <span className="min-w-0">
                                <span className="font-mono text-xs font-bold text-slate-500" data-no-translate>{a.project?.publicRef || '—'}</span>{' '}
                                <span className="text-slate-700">{a.project?.projectName || 'Cobro sin proyecto identificado'}</span>
                                {a.project?.clubName && <span className="block text-xs text-slate-500">{a.project.clubName}</span>}
                            </span>
                            <span className={`text-right font-semibold ${a.status === 'reversado' ? 'text-slate-400 line-through' : 'text-slate-800'}`} data-no-translate>{fmtMoney(a.amount, a.currency)}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Acciones según el perfil. */}
            {!op.reversed && (caps.manage || caps.reconcile) && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                    {caps.manage && (
                        <div className="flex flex-wrap gap-2">
                            {op.status !== 'conciliado' && (
                                <button type="button" onClick={() => setMode(m => (m === 'datos' ? null : 'datos'))}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                    <Pencil size={13} /> {d ? 'Corregir datos de la transferencia' : 'Registrar datos de la transferencia'}
                                </button>
                            )}
                            <button type="button" onClick={() => setMode(m => (m === 'soporte' ? null : 'soporte'))}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                <Upload size={13} /> Adjuntar soporte
                            </button>
                        </div>
                    )}
                    {mode === 'datos' && <OperationDataForm op={op} eventId={eventId} onCancel={() => setMode(null)} onSaved={() => { setMode(null); onReload(); }} />}
                    {mode === 'soporte' && <AttachDocumentForm op={op} eventId={eventId} kinds={detail.docKinds} maxMb={detail.accounts.maxReceiptMb} onCancel={() => setMode(null)} onSaved={() => { setMode(null); onReload(); }} />}
                    {caps.reconcile && <ReconcileActions op={op} eventId={eventId} onDone={onReload} />}
                </div>
            )}
            {op.reversed && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Este traslado se revirtió en la Bóveda de Fondos: no suma ni se concilia. Su registro original se conserva.</p>}
        </article>
    );
};

// ── El cajón ─────────────────────────────────────────────────────────

const ExchangeDrawer: React.FC<Props> = ({ id, eventId, onClose, onChanged, onRegister }) => {
    const [data, setData] = useState<ExchangeDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewer, setViewer] = useState<Viewer>(null);
    const [showHistory, setShowHistory] = useState(false);

    const load = useCallback(() => {
        setError(null);
        exchangeRequest<ExchangeDetail>(`/postulaciones/${encodeURIComponent(id)}`, eventId)
            .then(setData)
            .catch(e => setError(e?.message || 'No se pudo cargar Exchange.'));
    }, [id, eventId]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !viewer) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, viewer]);

    const reload = () => { load(); onChanged(); };

    const abrir = async (op: ExchangeOperation, source: 'boveda' | 'exchange', ref: string | number, name: string, mime: string) => {
        const q = source === 'exchange' ? `fuente=exchange&doc=${encodeURIComponent(String(ref))}` : `fuente=boveda&indice=${ref}`;
        try {
            const r = await exchangeRequest<{ url: string; mime: string; name: string }>(`/operaciones/${encodeURIComponent(op.key)}/archivo?${q}`, eventId);
            const descargar = data?.capabilities.download
                ? async () => {
                    try {
                        const dl = await exchangeRequest<{ url: string }>(`/operaciones/${encodeURIComponent(op.key)}/archivo?${q}&descargar=1`, eventId);
                        window.open(dl.url, '_blank', 'noopener');
                    } catch (e: any) { toast.error(e?.message || 'No se pudo descargar.'); }
                }
                : null;
            setViewer({ url: r.url, mime: r.mime || mime, name: r.name || name, download: descargar });
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo abrir el comprobante.');
        }
    };

    const x = data?.exchange;
    return (
        <div className="fixed inset-0 z-[60] flex justify-end bg-slate-900/40" onClick={onClose}>
            <aside className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-slate-50 shadow-2xl" onClick={e => e.stopPropagation()}
                role="dialog" aria-modal="true" aria-label="Exchange: traslado y conciliación del proyecto">
                <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Exchange · traslado y conciliación</p>
                        <h2 className="truncate text-lg font-bold text-slate-900">{data?.project.projectName || 'Cargando…'}</h2>
                        {data && <p className="text-xs text-slate-500"><span className="font-mono" data-no-translate>{data.project.publicRef}</span> · {data.project.clubName}</p>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                    {error && <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle size={15} /> {error}</p>}
                    {!data && !error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Cargando…</p>}
                    {data && (
                        <>
                            {/* Tres procesos, tres estados independientes. */}
                            <section className="grid gap-2 sm:grid-cols-3" aria-label="Estados independientes">
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pago de inscripción</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800">{data.project.paymentView}</p>
                                    <p className="text-xs text-slate-500">{data.project.paidAt ? fmtDate(data.project.paidAt) : '—'}{data.project.paymentOrigin === 'manual_admin' ? ' · confirmación manual' : ''}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Exchange</p>
                                    <div className="mt-1">{x && x.state !== 'no_aplica' ? <ExchangePill x={x} /> : <span className="text-sm text-slate-500">No aplica</span>}</div>
                                    {x?.currency && x.state !== 'pago_directo' && <p className="mt-1 text-xs text-slate-500" data-no-translate>{fmtMoney(x.allocated, x.currency)} de {fmtMoney(x.expected, x.currency)}</p>}
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Conciliación</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800">
                                        {!data.operations.length ? 'Sin traslado'
                                            : data.operations.every(o => o.status === 'conciliado' || o.reversed) ? 'Conciliada' : 'Pendiente'}
                                    </p>
                                    {x?.confirmedAmount ? <p className="text-xs text-slate-500" data-no-translate>{fmtMoney(x.confirmedAmount, x.currency)} conciliados</p> : null}
                                </div>
                            </section>
                            {x && <p className="text-xs text-slate-500">{x.help}</p>}
                            {data.project.coveredBy && (
                                <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">El pago de este proyecto se hizo junto con <span className="font-mono" data-no-translate>{data.project.coveredBy.publicRef}</span>: el dinero y su traslado viven en ese pago y se cuentan una sola vez.</p>
                            )}
                            {x?.needsMovement && (
                                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    El cobro está confirmado y todavía no tiene su movimiento en la Bóveda. Ábrela y usa «Buscar cobros sin registrar» (primero muestra un ensayo, sin escribir nada).
                                    <a href="/admin/boveda" className="ml-1 inline-flex items-center gap-0.5 font-semibold underline">Abrir la Bóveda <ExternalLink size={11} /></a>
                                </p>
                            )}

                            {data.capabilities.register && x?.anchor && !x?.needsMovement && ['sin_traslado', 'parcial'].includes(x?.state || '') && (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                                    <p className="text-xs text-slate-700">El traslado se registra con la barra de la Bóveda de Fondos (un solo motor): con su comprobante, su referencia y la notificación.</p>
                                    <button type="button" onClick={() => onRegister(data.project.coveredBy?.id || data.project.id)}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">
                                        <Banknote size={13} /> {x?.state === 'parcial' ? 'Registrar traslado adicional' : 'Registrar traslado'}
                                    </button>
                                </div>
                            )}

                            {data.operations.map(op => (
                                <OperationCard key={op.key} op={op} detail={data} eventId={eventId} onView={abrir} onReload={reload} />
                            ))}
                            {data.capabilities.register && data.operations.some(o => !o.reversed) && (
                                <p className="text-xs text-slate-500">¿Un traslado mal registrado (valor o proyecto)? Se revierte en la Bóveda de Fondos con su motivo y se registra de nuevo: el original se conserva. <a href="/admin/boveda" className="font-semibold text-sky-700 underline">Abrir la Bóveda</a></p>
                            )}

                            <section className="rounded-xl border border-slate-200 bg-white">
                                <button type="button" onClick={() => setShowHistory(s => !s)} aria-expanded={showHistory}
                                    className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-slate-800">
                                    <span className="flex items-center gap-2"><History size={15} /> Historial Exchange ({data.history.length})</span>
                                    <span className="text-xs text-slate-500">{showHistory ? 'Ocultar' : 'Ver'}</span>
                                </button>
                                {showHistory && (
                                    <ol className="space-y-2 border-t border-slate-100 px-4 py-3">
                                        {data.history.length === 0 && <li className="text-sm text-slate-400">Sin movimientos todavía.</li>}
                                        {data.history.map((h, i) => (
                                            <li key={i} className="text-sm">
                                                <p className="font-semibold text-slate-800">{h.label}
                                                    {h.fromState || h.toState ? <span className="ml-1 text-xs font-normal text-slate-500">{h.fromState || '—'} → {h.toState || '—'}</span> : null}</p>
                                                <p className="text-xs text-slate-500">{fmtDateTime(h.at)}{h.actorName ? ` · ${h.actorName}` : ''}{h.reference ? ` · ${h.reference}` : ''}</p>
                                                {(h.note || h.payload?.note || h.payload?.reason) && <p className="text-xs text-slate-600">{h.note || h.payload?.note || h.payload?.reason}</p>}
                                                {Array.isArray(h.payload?.cambios) && h.payload.cambios.length > 0 && (
                                                    <ul className="mt-0.5 text-xs text-slate-500">
                                                        {h.payload.cambios.map((c: any) => <li key={c.field} data-no-translate>{c.field}: {String(c.before ?? '—')} → {String(c.after ?? '—')}</li>)}
                                                    </ul>
                                                )}
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </section>
                            {!data.capabilities.manage && !data.capabilities.reconcile && (
                                <p className="flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 size={13} /> Acceso de consulta: puedes ver{data.capabilities.download ? ' y descargar' : ''} los comprobantes; no modificarlos.</p>
                            )}
                            {data.capabilities.reconcile && <p className="flex items-center gap-1.5 text-xs text-slate-500"><RotateCcw size={13} /> Una operación conciliada no se edita: se reabre con su motivo y la conciliación anterior queda en el historial.</p>}
                        </>
                    )}
                </div>
            </aside>
            {viewer && (
                // El clic del visor no debe llegar al fondo del cajón (lo cerraría).
                <div onClick={e => e.stopPropagation()}>
                    <ReceiptViewer url={viewer.url} mime={viewer.mime} name={viewer.name} onClose={() => setViewer(null)}
                        onDownload={viewer.download || undefined} />
                </div>
            )}
        </div>
    );
};

export default ExchangeDrawer;
