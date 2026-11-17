// ════════════════════════════════════════════════════════════════════
// «Mi Proyecto» — Entrega de la presentación del proyecto (v4.1332)
//
// El club sube su presentación (PDF o PPTX). Igual que el video propio:
//   Subiendo… (avance real) → Confirmando con el servidor → Cargada.
// «Cargada» aparece SÓLO cuando el servidor miró el archivo real (peso de S3
// y bytes) y lo registró. Cargada NO es validada: lo valida el comité.
// Reemplazar agrega una versión; la anterior se conserva.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2, Presentation, RefreshCw } from 'lucide-react';
import { BLUE } from './FormFields';
import { leerJson } from '../../lib/leerJson';
import { vpPutWithProgress } from '../../lib/videoPitch';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

interface Payload {
    requirement: { applies: boolean; mode: string; status: { key: string; label: string; tone?: string }; deadline: string | null; correction: string | null };
    current: { id: string; fileName: string | null; versionNumber?: number; uploadedAt: string | null; sizeBytes?: number } | null;
    versions: { id: string; versionNumber: number; fileName: string; sizeLabel: string; createdAt: string }[];
    canUpload: boolean; reason: string | null; maxMb: number; accept: string[]; formats: string[];
}
type Phase = { kind: 'idle' } | { kind: 'uploading'; pct: number } | { kind: 'confirming' } | { kind: 'done' } | { kind: 'error'; text: string };

const fmtDay = (d?: string | null) => (d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00-05:00` : d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const TONE: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-800 ring-amber-200', blue: 'bg-blue-50 text-blue-800 ring-blue-200', indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200', orange: 'bg-orange-50 text-orange-800 ring-orange-200', slate: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const PresentationDeliveryCard = ({ token, onSessionExpired, onChanged }: { token: string; onSessionExpired: () => void; onChanged?: () => void }) => {
    const [data, setData] = useState<Payload | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
    const inputRef = useRef<HTMLInputElement>(null);

    const call = useCallback(async (path: string, init: RequestInit = {}) => {
        const res = await fetch(`${API}/project-fair/portal${path}`, {
            ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        });
        if (res.status === 401) { onSessionExpired(); throw new Error('Tu sesión expiró.'); }
        const { data: body } = await leerJson<any>(res);
        if (!res.ok) throw new Error(body?.error || `El servidor respondió ${res.status}.`);
        return body;
    }, [token, onSessionExpired]);

    const load = useCallback(() => {
        setLoadError(false);
        call('/presentation').then(setData).catch(() => setLoadError(true));
    }, [call]);
    useEffect(() => { load(); }, [load]);

    const onFile = async (file: File | undefined) => {
        if (!file || !data) return;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!['pdf', 'pptx'].includes(ext || '')) { setPhase({ kind: 'error', text: 'Sube la presentación en PDF o PowerPoint (PPTX).' }); return; }
        if (file.size > data.maxMb * 1024 * 1024) { setPhase({ kind: 'error', text: `El archivo supera el máximo de ${data.maxMb} MB.` }); return; }
        try {
            setPhase({ kind: 'uploading', pct: 0 });
            const up = await call('/presentation/presign', { method: 'POST', body: JSON.stringify({ fileName: file.name, size: file.size }) });
            await vpPutWithProgress(up.uploadUrl, file, up.contentType, pct => setPhase({ kind: 'uploading', pct }));
            setPhase({ kind: 'confirming' });
            const fresh = await call('/presentation', { method: 'POST', body: JSON.stringify({ storageKey: up.storageKey, fileName: file.name }) });
            setData(fresh);
            setPhase({ kind: 'done' });
            onChanged?.();
        } catch (e: any) {
            setPhase({ kind: 'error', text: e?.message || 'No pudimos cargar la presentación. Inténtalo nuevamente.' });
        } finally {
            if (inputRef.current) inputRef.current.value = '';
        }
    };
    const download = async (id: string) => {
        try { const r = await call(`/presentation/${id}/url`); window.open(r.url, '_blank', 'noopener'); }
        catch (e: any) { setPhase({ kind: 'error', text: e?.message || 'No pudimos preparar la descarga.' }); }
    };

    if (loadError) {
        return (
            <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2">
                <p className="flex items-center gap-2 text-sm text-slate-600"><AlertCircle size={16} className="text-amber-600" /> No pudimos cargar la entrega de la presentación.
                    <button onClick={load} className="inline-flex items-center gap-1 font-semibold" style={{ color: BLUE }}><RefreshCw size={13} /> Reintentar</button></p>
            </div>
        );
    }
    if (!data || !data.requirement.applies) return null;
    const busy = phase.kind === 'uploading' || phase.kind === 'confirming';
    const st = data.requirement.status;
    return (
        <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm sm:col-span-2">
            <div className="flex flex-wrap items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${BLUE}12`, color: BLUE }}><Presentation size={19} /></span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-[17px] font-bold leading-snug text-slate-900">Entrega de la presentación del proyecto</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                        Sube la presentación de tu proyecto en PDF o PowerPoint (máximo {data.maxMb} MB), preparada con la plantilla oficial.
                        {data.requirement.deadline && <> Fecha límite: <strong className="text-slate-700">{fmtDay(data.requirement.deadline)}</strong>.</>}
                        {data.requirement.mode === 'optional' && ' Es opcional para tu proyecto.'}
                    </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${TONE[st.tone || 'slate'] || TONE.slate}`}>{st.label}</span>
            </div>

            {data.requirement.correction && (
                <p className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[13px] text-orange-900"><strong>Corrección solicitada por el comité:</strong> {data.requirement.correction}</p>
            )}

            {data.current && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
                    <CheckCircle2 size={15} className="text-emerald-600" aria-hidden />
                    <span className="font-semibold">{data.current.fileName}</span>
                    {data.current.versionNumber && <span className="text-slate-500">· versión {data.current.versionNumber}</span>}
                    {data.current.uploadedAt && <span className="text-slate-500">· cargada el {fmtDay(data.current.uploadedAt)}</span>}
                    <button onClick={() => download(data.current!.id)} className="ml-auto inline-flex items-center gap-1 font-semibold" style={{ color: BLUE }}><Download size={13} /> Descargar</button>
                </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
                {data.canUpload ? (
                    <>
                        <input ref={inputRef} type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" id="presentation-file"
                            disabled={busy} onChange={e => onFile(e.target.files?.[0])} />
                        <label htmlFor="presentation-file" className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white ${busy ? 'pointer-events-none opacity-60' : ''}`} style={{ background: BLUE }}>
                            {busy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} {data.current ? 'Reemplazar presentación' : 'Cargar presentación'}
                        </label>
                    </>
                ) : data.reason ? <p className="text-[13px] text-slate-500">{data.reason}</p> : null}
                {phase.kind === 'uploading' && (
                    <span className="flex min-w-[180px] flex-1 items-center gap-2 text-[13px] text-slate-600" aria-live="polite">
                        Subiendo… {phase.pct} %
                        <span role="progressbar" aria-label="Subida de la presentación" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.pct} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <span className="block h-full rounded-full" style={{ width: `${phase.pct}%`, background: BLUE }} />
                        </span>
                    </span>
                )}
                {phase.kind === 'confirming' && <span className="text-[13px] text-slate-600" aria-live="polite">Confirmando con el servidor…</span>}
                {phase.kind === 'done' && <span className="text-[13px] font-semibold text-emerald-700" aria-live="polite">Presentación recibida. El comité la revisará.</span>}
                {phase.kind === 'error' && <span className="text-[13px] font-semibold text-red-700" role="alert">{phase.text}</span>}
            </div>

            {data.versions.length > 1 && (
                <details className="mt-3 text-[12px] text-slate-500">
                    <summary className="cursor-pointer font-semibold">Versiones anteriores ({data.versions.length - 1})</summary>
                    <ul className="mt-1 space-y-0.5 pl-3">
                        {data.versions.slice(1).map(v => <li key={v.id}>v{v.versionNumber} · {v.fileName} · {v.sizeLabel} · {fmtDay(v.createdAt)}</li>)}
                    </ul>
                </details>
            )}
        </div>
    );
};

export default PresentationDeliveryCard;
