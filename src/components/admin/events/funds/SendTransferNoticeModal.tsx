// «Enviar comprobante por correo» — v4.1250. Destinatarios propuestos desde los
// responsables autorizados del evento (Concorrotarios, tesorería…), editables;
// asunto y mensaje de la plantilla institucional, editables; el PDF adjunto; y
// confirmación explícita. No se envía al participante por defecto: el
// comprobante de traslado es un documento para el beneficiario.
import { useEffect, useState } from 'react';
import { X, Loader2, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fundsApi } from './eventFundsApi';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'mb-1 block text-xs font-semibold text-gray-600';
const lista = (v: string) => v.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
const nuevaClave = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const SendTransferNoticeModal = ({ eventId, transferId, onClose, onSent }: {
    eventId: string;
    transferId: string;
    onClose: () => void;
    onSent: () => void;
}) => {
    // La clave de la OPERACIÓN se fija al abrir: un doble clic cae en el mismo
    // envío. Sólo cambia tras un rechazo del proveedor, para que el reintento salga.
    const [operationKey, setOperationKey] = useState(nuevaClave);
    const [loading, setLoading] = useState(true);
    const [to, setTo] = useState('');
    const [cc, setCc] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [documents, setDocuments] = useState<{ id: string; fileName: string; version: number; isCurrent: boolean }[]>([]);
    const [documentId, setDocumentId] = useState('');
    const [confirmado, setConfirmado] = useState(false);
    const [trasladoConfirmado, setTrasladoConfirmado] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let vivo = true;
        fundsApi.previewNotice(eventId, transferId)
            .then(p => {
                if (!vivo) return;
                setTo(p.recipients.map(r => r.email).join(', '));
                setSubject(p.subject);
                setMessage(p.text);
                setDocuments(p.documents);
                setDocumentId(p.documents.find(d => d.isCurrent)?.id || '');
                setTrasladoConfirmado(p.confirmado);
            })
            .catch(e => vivo && setError(e?.message || 'No se pudo preparar el correo.'))
            .finally(() => vivo && setLoading(false));
        return () => { vivo = false; };
    }, [eventId, transferId]);

    const enviar = async () => {
        setSending(true); setError(''); setResult(null);
        try {
            const r = await fundsApi.sendNotice(eventId, transferId, {
                to: lista(to), cc: lista(cc), subject, message, documentId, confirm: true, operationKey,
            });
            setResult(r.ok
                ? { ok: true, text: r.repetida ? 'Este envío ya se había hecho (no se repitió).' : 'El proveedor de correo aceptó el envío. Queda en el historial.' }
                : { ok: false, text: `El proveedor rechazó el envío: ${r.error || 'sin detalle'}. Queda registrado; puedes reintentar.` });
            if (!r.ok) setOperationKey(nuevaClave());
            onSent();
        } catch (e: any) {
            setError(e?.message || 'No se pudo enviar.');
        } finally { setSending(false); }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Enviar comprobante por correo">
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
                    <h3 className="flex items-center gap-2 font-bold text-gray-900"><Send className="h-4 w-4 text-violet-700" /> Enviar comprobante por correo</h3>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4 text-sm">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                    ) : (
                        <>
                            {!trasladoConfirmado && (
                                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                    El traslado todavía no está confirmado: el mensaje dice «registro del traslado» y su estado, no que el traslado se realizó.
                                </p>
                            )}
                            {documents.length === 0 && (
                                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">Adjunta primero el comprobante PDF del traslado.</p>
                            )}
                            <div>
                                <label className={labelCls}>Para (responsables autorizados; separa con comas)</label>
                                <input type="text" className={inputCls} value={to} onChange={e => setTo(e.target.value)} placeholder="tesoreria@concorrotarios.org" />
                            </div>
                            <div>
                                <label className={labelCls}>Copia</label>
                                <input type="text" className={inputCls} value={cc} onChange={e => setCc(e.target.value)} />
                            </div>
                            <div>
                                <label className={labelCls}>Comprobante adjunto</label>
                                <select className={`${inputCls} bg-white`} value={documentId} onChange={e => setDocumentId(e.target.value)}>
                                    {documents.map(d => <option key={d.id} value={d.id}>{d.fileName} · versión {d.version}{d.isCurrent ? ' (vigente)' : ''}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Asunto</label>
                                <input type="text" className={inputCls} value={subject} onChange={e => setSubject(e.target.value)} />
                            </div>
                            <div>
                                <label className={labelCls}>Mensaje (vista previa editable)</label>
                                <textarea rows={12} className={`${inputCls} font-mono text-xs`} value={message} onChange={e => setMessage(e.target.value)} />
                            </div>
                            <label className="flex items-start gap-2 text-xs text-gray-700">
                                <input type="checkbox" className="mt-0.5" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />
                                Revisé los destinatarios, el mensaje y el PDF. Confirmo el envío de este documento financiero.
                            </label>
                        </>
                    )}
                    {error && <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
                    {result && (
                        <p className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800'}`}>
                            {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />} {result.text}
                        </p>
                    )}
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
                    <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">{result ? 'Cerrar' : 'Cancelar'}</button>
                    {!result?.ok && (
                        <button type="button" onClick={enviar}
                            disabled={sending || loading || !confirmado || !documentId || lista(to).length === 0}
                            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar comprobante
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SendTransferNoticeModal;
