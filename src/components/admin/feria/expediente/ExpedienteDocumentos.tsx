// v4.1324 — Expediente → «Documentos»: adjuntos de la postulación, enlaces a
// documentos escritos en los formularios, el video del proyecto y el Video
// Pitch. Cada archivo se abre con el control de acceso que ya tiene: el video
// por la URL firmada del módulo de videos, el comprobante de pago sólo desde
// la pestaña «Pago» y sólo con permiso financiero.
import { useState } from 'react';
import { ExternalLink, FileText, Film, Link2, Loader2, Paperclip, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import type { DossierPayload } from '../../../../lib/projectDossier';
import { dossierRequest } from '../../../../lib/projectDossier';

const fmtSize = (n?: number | null) => (n ? (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : '');
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const VIDEO_STATUS: Record<string, string> = { draft: 'Borrador', submitted: 'Enviado', in_review: 'En revisión', approved: 'Aprobado', changes_requested: 'Requiere ajustes', rejected: 'Rechazado', withdrawn: 'Retirado' };

const ExpedienteDocumentos = ({ data, eventId, onOpenPayment }: { data: DossierPayload; eventId: string; onOpenPayment: () => void }) => {
    const [opening, setOpening] = useState<string | null>(null);
    const d = data.documents;

    const openVideo = async (videoId: string, versionId: string) => {
        // La ventana se abre ANTES de esperar: un navegador bloquea la que se abre tras un await.
        const win = window.open('', '_blank');
        setOpening(videoId);
        try {
            const r = await dossierRequest<{ url: string }>(`/project-videos/${videoId}/versions/${versionId}/url`, eventId);
            if (win) win.location.href = r.url; else window.location.href = r.url;
        } catch (e: any) { win?.close(); toast.error(e?.message || 'No se pudo abrir el video'); } finally { setOpening(null); }
    };

    const empty = !d.files.length && !d.links.length && !d.videos.length && !d.videoPitch && !d.paymentReceipt;
    return (
        <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><Paperclip size={15} /> Archivos adjuntos a la postulación ({d.files.length})</h4>
                {d.files.length ? (
                    <ul className="divide-y divide-slate-100">
                        {d.files.map(f => (
                            <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                                <FileText size={14} className="text-slate-400" />
                                <a href={f.fileUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-all font-medium text-blue-700 hover:underline">{f.fileName}</a>
                                <span className="text-xs text-slate-400">{[fmtSize(f.fileSize), fmtDate(f.createdAt), f.uploadedBy].filter(Boolean).join(' · ')}</span>
                            </li>
                        ))}
                    </ul>
                ) : <p className="text-sm text-slate-500">Sin archivos adjuntos.</p>}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><Link2 size={15} /> Enlaces a documentos escritos en los formularios ({d.links.length})</h4>
                {d.links.length ? (
                    <ul className="space-y-1.5">
                        {d.links.map(l => (
                            <li key={l.path} className="text-sm"><span className="text-slate-500">{l.form} · {l.label}: </span>
                                <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-blue-700 hover:underline">{l.url} <ExternalLink size={11} /></a></li>
                        ))}
                    </ul>
                ) : <p className="text-sm text-slate-500">Los formularios no tienen enlaces a documentos.</p>}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><Film size={15} /> Videos</h4>
                {d.videos.length ? d.videos.map(v => (
                    <div key={v.id} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                        <span className="font-medium text-slate-800">{v.title || 'Video del proyecto'}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{VIDEO_STATUS[v.status] || v.status}</span>
                        {v.fileName && <span className="text-xs text-slate-400">{v.fileName} · {fmtSize(v.sizeBytes)}</span>}
                        {v.currentVersionId && (
                            <button onClick={() => openVideo(v.id, v.currentVersionId!)} disabled={opening === v.id} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
                                {opening === v.id ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />} Ver video
                            </button>
                        )}
                    </div>
                )) : <p className="text-sm text-slate-500">El club no ha subido el video del proyecto.</p>}
                {d.videoPitch && <p className="mt-1 text-sm text-slate-600">Video Pitch Profesional: solicitud en estado «{d.videoPitch.status}» (se gestiona en «Videos de proyectos»).</p>}
            </section>

            {d.paymentReceipt && (
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><Receipt size={15} /> Comprobante de pago</h4>
                    <p className="text-sm text-slate-600">{d.paymentReceipt.name} — se abre desde la pestaña Pago, con su control de acceso financiero.</p>
                    <button onClick={onOpenPayment} className="mt-2 text-xs font-semibold text-blue-700 hover:underline">Ir a Pago</button>
                </section>
            )}
            {empty && <p className="text-center text-xs text-slate-400">Este proyecto no tiene documentos asociados todavía.</p>}
        </div>
    );
};

export default ExpedienteDocumentos;
