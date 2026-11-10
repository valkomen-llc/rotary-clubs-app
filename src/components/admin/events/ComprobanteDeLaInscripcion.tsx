// ════════════════════════════════════════════════════════════════════
// El comprobante de una inscripción, en la ficha del panel — v4.1312
//
// Antes (v4.1291) era una línea con «Ver / descargar» y «Subir comprobante».
// Ahora, además, «Importar comprobante desde URL»: para los registros
// migrados de otra plataforma (y para cualquier otro) el Equipo de Registro
// pega el enlace y el SERVIDOR descarga una copia propia, la valida por sus
// bytes y la asocia a ESTA inscripción (por su id: nunca por nombre, correo
// o documento, que se repiten entre duplicados).
//
// Con comprobante, la tarjeta dice qué es, de dónde vino y cuándo, con una
// miniatura si es una imagen, un visor (PDF o imagen ampliable) y la descarga
// con su nombre.
//
// ⚠️ Nada de esto cambia el estado ni el pago: el comprobante es evidencia y
// se valida con los botones de siempre.
//
// ⚠️ Componentes de NIVEL SUPERIOR (regla del proyecto): declarar uno dentro
// de otro lo vuelve un tipo nuevo en cada render y los campos pierden el foco.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertCircle, AlertTriangle, CheckCircle2, Download, Eye, ExternalLink, FileText, Link2, Loader2,
    Paperclip, ShieldCheck, Upload, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { RECEIPT_ACCEPT } from '../../../lib/completedRegistrationSpec';
import { subirComprobante } from '../../../lib/subirComprobante';
import { leerJson, describirNoJson } from '../../../lib/leerJson';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

const fmtDateTime = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtBytes = (bytes: number | null | undefined) => {
    if (!bytes) return '';
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
const TYPE_LABELS: Record<string, string> = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' };
const typeLabel = (mime: string | null | undefined, name?: string | null) =>
    (mime && TYPE_LABELS[mime]) || (name?.split('.').pop() || '').toUpperCase() || 'Archivo';
const isImage = (mime: string | null | undefined) => /^image\//.test(String(mime || ''));
const isPdf = (mime: string | null | undefined, name?: string | null) =>
    mime === 'application/pdf' || /\.pdf$/i.test(String(name || ''));

/** POST/GET con lectura segura: el error que llega es el del servidor o uno que nombra la capa. */
const pedir = async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } });
    const { data, crudo, esJson } = await leerJson<any>(res);
    if (!esJson) throw Object.assign(new Error(describirNoJson(res, crudo)), { code: 'no_json' });
    if (!res.ok) throw Object.assign(new Error(data?.error || 'La acción no se pudo completar.'), { code: data?.code });
    return data as T;
};

export interface ReceiptRegistration {
    id: string;
    hasReceipt: boolean;
    receiptName: string | null;
    receiptMime?: string | null;
    receiptBytes: number | null;
    submittedAt: string | null;
    registrationSource?: string;
    importMeta?: { receiptUrl?: string | null } | null;
}

interface HistoryEntry { id: string; type: string; createdAt: string; actorName?: string | null; payload?: any }

/**
 * De dónde vino el comprobante VIGENTE y cuándo: el último reemplazo del
 * historial manda; si no hay ninguno, llegó con el formulario de inscripción.
 */
export const origenDelComprobante = (r: ReceiptRegistration, history: HistoryEntry[]) => {
    const last = history.find(h => h.type === 'receipt_replaced');
    if (!last) return { label: 'Adjuntado en el formulario de inscripción', date: r.submittedAt, external: false };
    const via = last.payload?.via;
    if (via === 'url_import') {
        const host = last.payload?.import?.sourceHost;
        return { label: `Origen: URL externa${host ? ` (${host})` : ''}`, date: last.createdAt, external: true, by: last.actorName || null };
    }
    if (via === 'participant') return { label: 'Subido por el participante desde «Mis eventos»', date: last.createdAt, external: false };
    return { label: 'Subido por el Equipo de Registro', date: last.createdAt, external: false, by: last.actorName || null };
};

// ── Visor ────────────────────────────────────────────────────────────

export const ReceiptViewer = ({ url, mime, name, onClose, onDownload }: {
    url: string; mime: string | null | undefined; name: string; onClose: () => void; onDownload?: () => void;
}) => {
    const [zoom, setZoom] = useState(false);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
            <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}
                role="dialog" aria-modal="true" aria-label={`Comprobante ${name}`}>
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                    <p className="min-w-0 truncate text-sm font-bold text-gray-800" data-no-translate>{name}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {isImage(mime) && (
                            <button type="button" onClick={() => setZoom(z => !z)} aria-label={zoom ? 'Ajustar a la ventana' : 'Ver en tamaño real'}
                                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                                {zoom ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
                            </button>
                        )}
                        <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir en otra pestaña"
                            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><ExternalLink className="h-4 w-4" /></a>
                        {onDownload && (
                            <button type="button" onClick={onDownload} aria-label="Descargar"
                                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><Download className="h-4 w-4" /></button>
                        )}
                        <button type="button" onClick={onClose} aria-label="Cerrar el visor"
                            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-gray-100">
                    {isImage(mime) ? (
                        <img src={url} alt={`Comprobante ${name}`} onClick={() => setZoom(z => !z)}
                            className={zoom ? 'max-w-none cursor-zoom-out' : 'mx-auto max-h-[78vh] w-auto max-w-full cursor-zoom-in object-contain'} />
                    ) : isPdf(mime, name) ? (
                        <iframe src={url} title={`Comprobante ${name}`} className="h-[78vh] w-full border-0 bg-white" />
                    ) : (
                        <p className="p-8 text-center text-sm text-gray-500">Este tipo de archivo no tiene vista previa. Usa «Descargar».</p>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Importar desde URL ───────────────────────────────────────────────

interface VerifyResult {
    stagedKey: string;
    previewUrl: string | null;
    file: { name: string; mime: string; bytes: number; typeLabel: string; sourceHost: string | null; finalHost: string | null; redirects: number };
    warnings: string[];
    replaces: string | null;
}

export const ImportReceiptUrlModal = ({ registrationId, currentReceiptName, suggestedUrl, onClose, onImported }: {
    registrationId: string;
    currentReceiptName: string | null;
    /** La URL del comprobante que registró la importación histórica, si la hay. */
    suggestedUrl?: string | null;
    onClose: () => void;
    onImported: (registration: any) => void;
}) => {
    const [url, setUrl] = useState('');
    const [name, setName] = useState('');
    const [busy, setBusy] = useState<'' | 'verify' | 'import'>('');
    const [error, setError] = useState('');
    const [verified, setVerified] = useState<{ url: string; result: VerifyResult } | null>(null);
    const base = `${API}/event-registrations/admin/completed/${registrationId}/receipt-import`;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && busy !== 'import') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, busy]);

    const trimmed = url.trim();
    const pareceValida = /^https:\/\/\S+$/i.test(trimmed);
    const current = verified && verified.url === trimmed ? verified.result : null;

    const verify = async () => {
        if (!pareceValida) { setError('El enlace introducido no es válido. Debe empezar por https://'); return; }
        setBusy('verify');
        setError('');
        setVerified(null);
        try {
            const d = await pedir<VerifyResult>(`${base}/verify`, { method: 'POST', body: JSON.stringify({ url: trimmed, name: name.trim() }) });
            setVerified({ url: trimmed, result: d });
        } catch (err: any) {
            setError(err?.message || 'No se pudo verificar el enlace.');
        } finally {
            setBusy('');
        }
    };

    const doImport = async () => {
        if (!pareceValida) { setError('El enlace introducido no es válido. Debe empezar por https://'); return; }
        setBusy('import');
        setError('');
        const send = (stagedKey: string | null) => pedir<{ registration: any }>(base, {
            method: 'POST', body: JSON.stringify({ url: trimmed, name: name.trim(), stagedKey }),
        });
        try {
            let d;
            try {
                d = await send(current?.stagedKey || null);
            } catch (err: any) {
                // La copia verificada ya no sirve (otro enlace, se limpió):
                // se importa de nuevo desde el enlace, una sola vez.
                if (err?.code !== 'staged') throw err;
                d = await send(null);
            }
            // El servidor sólo responde 200 después de guardar Y vincular.
            onImported(d.registration);
        } catch (err: any) {
            setError(err?.message || 'No se pudo importar el comprobante.');
        } finally {
            setBusy('');
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => busy !== 'import' && onClose()}>
            <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}
                role="dialog" aria-modal="true" aria-labelledby="import-receipt-title">
                <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                    <div>
                        <h3 id="import-receipt-title" className="flex items-center gap-2 text-base font-bold text-gray-900">
                            <Link2 className="h-4 w-4 text-blue-600" /> Importar comprobante desde URL
                        </h3>
                        <p className="mt-1 text-[13px] text-gray-500">
                            Pega el enlace del comprobante almacenado en otra plataforma. Club Platform descargará una copia y la asociará a esta inscripción.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={busy === 'import'} aria-label="Cerrar"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-4 px-5 py-4">
                    {suggestedUrl && suggestedUrl !== trimmed && (
                        <div className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-[13px] text-violet-900">
                            <p className="font-semibold">La importación histórica registró un enlace de comprobante para esta inscripción.</p>
                            <p className="mt-0.5 break-all font-mono text-[11px] text-violet-700" data-no-translate>{suggestedUrl}</p>
                            <button type="button" onClick={() => { setUrl(suggestedUrl); setVerified(null); setError(''); }}
                                className="mt-1.5 text-[12px] font-bold text-violet-700 hover:underline">Usar este enlace</button>
                        </div>
                    )}
                    <div>
                        <label htmlFor="import-receipt-url" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            URL del comprobante <span className="text-red-500">*</span>
                        </label>
                        <input id="import-receipt-url" type="url" inputMode="url" autoComplete="off" spellCheck={false}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            placeholder="https://…" value={url}
                            onChange={e => { setUrl(e.target.value); setError(''); }} />
                    </div>
                    <div>
                        <label htmlFor="import-receipt-name" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Nombre o descripción del archivo (opcional)
                        </label>
                        <input id="import-receipt-name" type="text" maxLength={150}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            placeholder="Ej. Transferencia Bancolombia — cuota de inscripción" value={name}
                            onChange={e => setName(e.target.value)} />
                        <p className="mt-1 text-[11px] text-gray-400">Si lo dejas vacío se usa el nombre del archivo original. La extensión se ajusta al tipo real.</p>
                    </div>

                    {currentReceiptName && (
                        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>Esta inscripción ya tiene «<span data-no-translate>{currentReceiptName}</span>». Al importar se reemplaza; el anterior no se borra y queda en el historial.</span>
                        </p>
                    )}

                    {error && (
                        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
                        </div>
                    )}

                    {current && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                            <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-800">
                                <ShieldCheck className="h-4 w-4" /> Enlace verificado: el archivo es un {current.file.typeLabel} válido
                            </p>
                            <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-[12px] text-gray-700">
                                <dt className="text-gray-400">Archivo</dt><dd className="truncate font-semibold" data-no-translate>{current.file.name}</dd>
                                <dt className="text-gray-400">Tipo</dt><dd>{current.file.typeLabel} · {fmtBytes(current.file.bytes)}</dd>
                                <dt className="text-gray-400">Origen</dt>
                                <dd className="truncate" data-no-translate>
                                    {current.file.sourceHost}{current.file.finalHost && current.file.finalHost !== current.file.sourceHost ? ` → ${current.file.finalHost}` : ''}
                                </dd>
                            </dl>
                            {current.warnings.map(w => (
                                <p key={w} className="mt-2 flex items-start gap-1.5 text-[12px] text-amber-800">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                                </p>
                            ))}
                            {current.previewUrl && (
                                <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
                                    {isImage(current.file.mime) ? (
                                        <img src={current.previewUrl} alt="Vista previa del comprobante" className="mx-auto max-h-72 w-auto object-contain" />
                                    ) : (
                                        <iframe src={current.previewUrl} title="Vista previa del comprobante" className="h-72 w-full border-0" />
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <p className="text-[11px] text-gray-400">
                        Sólo enlaces HTTPS a un PDF, JPG, PNG o WebP de hasta 10 MB. Importar no valida la inscripción ni confirma el pago.
                    </p>
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
                    <button type="button" onClick={onClose} disabled={busy === 'import'}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                        Cancelar
                    </button>
                    <button type="button" onClick={verify} disabled={Boolean(busy) || !trimmed}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-40">
                        {busy === 'verify' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        {busy === 'verify' ? 'Verificando…' : 'Verificar enlace'}
                    </button>
                    <button type="button" onClick={doImport} disabled={Boolean(busy) || !trimmed}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">
                        {busy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {busy === 'import' ? 'Importando…' : 'Importar comprobante'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── La tarjeta del comprobante en la ficha ───────────────────────────

export const ComprobanteDeLaInscripcion = ({ registration: r, history, onChanged, onNotice, onError }: {
    registration: ReceiptRegistration;
    history: HistoryEntry[];
    /** Recargar la ficha y el listado. */
    onChanged: () => void;
    onNotice: (text: string) => void;
    onError: (text: string) => void;
}) => {
    const [busy, setBusy] = useState('');
    const [thumb, setThumb] = useState<string | null>(null);
    const [viewer, setViewer] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const base = `${API}/event-registrations/admin/completed/${r.id}`;
    const mime = r.receiptMime || null;
    const origen = origenDelComprobante(r, history);

    const signed = useCallback(async (download = false) => {
        const d = await pedir<{ url: string }>(`${base}/receipt${download ? '?download=1' : ''}`);
        return d.url;
    }, [base]);

    // Miniatura de una imagen: un enlace firmado de lectura (5 minutos).
    const thumbKey = `${r.receiptName}|${r.receiptBytes}|${r.hasReceipt}`;
    useEffect(() => {
        let vivo = true;
        setThumb(null);
        if (r.hasReceipt && isImage(mime)) {
            signed().then(u => { if (vivo) setThumb(u); }).catch(() => { /* sin miniatura: el ícono basta */ });
        }
        return () => { vivo = false; };
    }, [thumbKey, mime, signed]); // eslint-disable-line react-hooks/exhaustive-deps

    const view = async () => {
        setBusy('view');
        try { setViewer(await signed()); } catch (err: any) { onError(err?.message || 'No se pudo abrir el comprobante.'); } finally { setBusy(''); }
    };
    const download = async () => {
        setBusy('download');
        try {
            const url = await signed(true);
            const a = document.createElement('a');
            a.href = url;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err: any) {
            onError(err?.message || 'No se pudo descargar el comprobante.');
        } finally { setBusy(''); }
    };

    // v4.1291 — Subir o reemplazar desde el equipo. El anterior NO se borra.
    const upload = async (file: File | undefined) => {
        if (fileInput.current) fileInput.current.value = '';
        if (!file) return;
        if (r.hasReceipt && !window.confirm(
            `¿Reemplazar «${r.receiptName || 'el comprobante actual'}» por «${file.name}»?\n\nEl anterior no se borra: queda en el historial de la inscripción.`)) return;
        setBusy('upload');
        try {
            const { Authorization } = authHeaders();
            const d = await subirComprobante<any>({ file, prepararUrl: `${base}/receipt-url`, confirmarUrl: `${base}/receipt`, headers: { Authorization } });
            onNotice(d?.unchanged ? 'Ese archivo ya era el comprobante vigente.' : (r.hasReceipt ? 'Comprobante reemplazado.' : 'Comprobante subido.'));
            onChanged();
        } catch (err: any) {
            onError(err?.message || 'No se pudo subir el comprobante.');
        } finally { setBusy(''); }
    };

    const suggestedUrl = r.importMeta?.receiptUrl && /^https:\/\//i.test(r.importMeta.receiptUrl) ? r.importMeta.receiptUrl : null;
    const secondaryBtn = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50';

    return (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5" data-testid="receipt-card">
            {r.hasReceipt ? (
                <>
                    <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Comprobante adjunto
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <button type="button" onClick={view} aria-label="Ver comprobante"
                            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                            {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" />
                                : isPdf(mime, r.receiptName) ? <FileText className="h-8 w-8 text-red-500" />
                                    : <Paperclip className="h-7 w-7 text-gray-400" />}
                        </button>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900" data-no-translate>{r.receiptName || 'Comprobante de pago'}</p>
                            <p className="mt-0.5 text-[12px] text-gray-500">
                                {typeLabel(mime, r.receiptName)}{r.receiptBytes ? ` · ${fmtBytes(r.receiptBytes)}` : ''}
                            </p>
                            <p className="mt-0.5 text-[12px] text-gray-500">
                                {origen.external ? 'Importado' : 'Adjuntado'} el {fmtDateTime(origen.date)}
                                {origen.by ? ` · ${origen.by}` : ''}
                            </p>
                            <p className={`mt-0.5 text-[12px] ${origen.external ? 'font-semibold text-violet-700' : 'text-gray-500'}`} data-no-translate={origen.external || undefined}>
                                {origen.label}
                            </p>
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={view} disabled={Boolean(busy)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                            {busy === 'view' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Ver comprobante
                        </button>
                        <button type="button" onClick={download} disabled={Boolean(busy)} className={secondaryBtn}>
                            {busy === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Descargar
                        </button>
                        <button type="button" onClick={() => fileInput.current?.click()} disabled={Boolean(busy)} className={secondaryBtn}>
                            {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {busy === 'upload' ? 'Subiendo…' : 'Reemplazar comprobante'}
                        </button>
                        <button type="button" onClick={() => setImporting(true)} disabled={Boolean(busy)} className={secondaryBtn}>
                            <Link2 className="h-3.5 w-3.5" /> Reemplazar desde URL
                        </button>
                    </div>
                </>
            ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 pt-2 text-sm text-gray-700">
                        <Paperclip className="h-4 w-4 shrink-0 text-gray-400" /> Este registro no tiene comprobante adjunto.
                    </p>
                    {/* «Importar…» va JUSTO DEBAJO de «Subir comprobante», como secundario. */}
                    <div className="flex w-full flex-col gap-2 sm:w-auto">
                        <button type="button" onClick={() => fileInput.current?.click()} disabled={Boolean(busy)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-blue-600 bg-white px-3.5 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50">
                            {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {busy === 'upload' ? 'Subiendo…' : 'Subir comprobante'}
                        </button>
                        <button type="button" onClick={() => setImporting(true)} disabled={Boolean(busy)} className={secondaryBtn}>
                            <Link2 className="h-3.5 w-3.5" /> Importar comprobante desde URL
                        </button>
                    </div>
                </div>
            )}
            <input ref={fileInput} type="file" accept={RECEIPT_ACCEPT} className="hidden" onChange={e => upload(e.target.files?.[0])} />
            <p className="mt-2.5 text-[11px] text-gray-400">
                PDF, JPG, PNG o WebP · máximo 10 MB. Al reemplazarlo, el anterior queda en el historial.
            </p>

            {viewer && (
                <ReceiptViewer url={viewer} mime={mime} name={r.receiptName || 'Comprobante de pago'}
                    onClose={() => setViewer(null)} onDownload={download} />
            )}
            {importing && (
                <ImportReceiptUrlModal
                    registrationId={r.id}
                    currentReceiptName={r.hasReceipt ? (r.receiptName || 'el comprobante actual') : null}
                    suggestedUrl={suggestedUrl}
                    onClose={() => setImporting(false)}
                    onImported={() => {
                        setImporting(false);
                        onNotice('Comprobante importado y asociado a esta inscripción. El estado del pago no cambió.');
                        onChanged();
                    }}
                />
            )}
        </div>
    );
};

export default ComprobanteDeLaInscripcion;
