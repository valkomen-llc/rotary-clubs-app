// ════════════════════════════════════════════════════════════════════
// Tarjeta «Video del proyecto» (video PROPIO del club) — v4.1298.0
//
// Va en la cuadrícula de «Mi proyecto» al lado de la del Video Pitch
// Profesional: dos caminos claramente distintos. Ésta es «Video propio · Sin
// costo de producción». Lo que muestra llega RESUELTO del servidor
// (`/portal/project-video`): estado, duración, fecha y los botones que tocan.
// No reutiliza la barra de pago del Video Pitch. Ámbito del MÓDULO (v4.971).
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, Clock, Loader2, MessageSquare, PenLine, RefreshCw, Upload, UploadCloud } from 'lucide-react';
import { BLUE } from './FormFields';
import { vpFetch, vpFmtDateTime, vpTone } from '../../lib/videoPitch';
import type { PvPortalView } from '../../lib/projectVideo';

const CARD = 'flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm';
const ICONS = { open: ChevronRight, edit: PenLine, replace: Upload } as const;
export type PvCardAction = 'open' | 'edit' | 'replace';

export const ProjectVideoCard = ({ token, onSessionExpired, onOpen, refreshKey = 0 }: { token: string; onSessionExpired: () => void; onOpen: (action: PvCardAction) => void; refreshKey?: number }) => {
    const [state, setState] = useState<PvPortalView | null>(null);
    const [loadError, setLoadError] = useState(false);

    const load = useCallback(async () => {
        setLoadError(false);
        try {
            const { res, data } = await vpFetch<PvPortalView>('/project-fair/portal/project-video', token);
            if (res.status === 401) { onSessionExpired(); return; }
            if (!res.ok || !data) throw new Error('load');
            setState(data);
        } catch { setLoadError(true); }
    }, [token, onSessionExpired]);
    useEffect(() => { load(); }, [load, refreshKey]);

    const main = state?.main || null;
    const tone = vpTone(state?.statusTone);
    const needsAttention = main && ['changes_requested', 'rejected'].includes(main.status);

    return (
        <div className={CARD} data-testid="project-video-card">
            <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${BLUE}12`, color: BLUE }}><UploadCloud size={19} /></span>
                <span className="flex flex-wrap justify-end gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">Video propio · Sin costo</span>
                    {state && state.status !== 'none' && (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} /> {state.statusLabel}</span>
                    )}
                </span>
            </div>

            <h3 className="mt-3 break-words text-[17px] font-bold leading-snug text-slate-900">{main?.title ? main.title : 'Video del proyecto'}</h3>
            {main?.title && <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Video del proyecto</p>}
            <p className="mt-1.5 break-words text-[13px] leading-relaxed text-slate-500">
                {state && state.status !== 'none'
                    ? `${state.identity.projectName}${main?.currentVersion?.durationLabel ? ` · Duración ${main.currentVersion.durationLabel}` : ''}${main?.currentVersion ? ` · ${main.currentVersion.formatLabel} · ${main.currentVersion.sizeLabel}` : ''}`
                    : '¿Tu club ya cuenta con un video de presentación? Súbelo aquí para compartirlo con el comité organizador de la Feria de Proyectos. Sin costo de producción.'}
            </p>

            {!state && !loadError && <p className="mt-3 flex items-center gap-1.5 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> Consultando tu video…</p>}
            {loadError && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-red-700"><AlertCircle size={13} /> No pudimos consultar tu video.
                    <button type="button" onClick={load} className="inline-flex items-center gap-1 font-bold underline"><RefreshCw size={12} /> Reintentar</button></p>
            )}
            {state && !state.available && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{state.reason}</p>}
            {state?.available && state.status === 'none' && !state.canCreate && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{state.config.deadlinePassed ? `La fecha límite de recepción (${state.config.deadline}) ya pasó.` : !state.config.enabled ? 'La recepción de videos no está habilitada por ahora.' : 'Ya tienes el máximo de videos activos.'}</p>
            )}
            {state?.card.headline && state.status !== 'none' && (
                <p className={`mt-3 rounded-lg px-3 py-2 text-[12px] ${needsAttention ? 'bg-orange-50 text-orange-900' : main?.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700'}`}>
                    {state.card.headline}
                    {needsAttention && main?.reviewNote && <span className="mt-1 block text-[11px] opacity-90"><MessageSquare size={11} className="mr-1 inline" />{main.reviewNote}</span>}
                </p>
            )}
            {main?.updatedAt && <p className="mt-2 flex items-center gap-1 text-[12px] text-slate-400"><Clock size={11} /> Actualizado el {vpFmtDateTime(main.updatedAt)}</p>}

            <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-4">
                {state && state.card.actions.length > 0 ? state.card.actions.map((a, i) => {
                    const Icon = ICONS[a.key] || ChevronRight;
                    return (
                        <button key={a.key} type="button" onClick={() => onOpen(a.key)} className={`inline-flex items-center gap-1.5 text-sm font-bold hover:underline ${i === 0 ? '' : 'text-slate-600'}`} style={i === 0 ? { color: BLUE } : undefined}>
                            <Icon size={15} /> {a.label}
                        </button>
                    );
                }) : (
                    <span className="inline-flex cursor-not-allowed items-center gap-1.5 text-sm font-bold text-slate-400"><UploadCloud size={15} /> Subir video del proyecto</span>
                )}
            </div>
        </div>
    );
};

export default ProjectVideoCard;
